/**
 * Benchmark harness for the LLM generation sites.
 *
 * There is no test framework in this repo, so this is the only way to tell
 * whether a change to a prompt, a schema or a model actually helped. It exists
 * because Phase 1 swaps models, and without a before-number a cost or quality
 * regression is indistinguishable from noise.
 *
 * It calls the real OpenAI API. Every run costs money — see the estimate that
 * prints before it starts.
 *
 *   npx tsx scripts/bench-generators.ts --dry            # build prompts, call nothing
 *   npx tsx scripts/bench-generators.ts --n=3
 *   npx tsx scripts/bench-generators.ts --site=meal-detail --fixture=restricted
 *
 * Results go to stdout as markdown and to bench-results/<ISO>.json.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';

import {
  createPlanningPrompt,
  createDetailPrompt,
  createGroceryPrompt,
  createHomeMealGenerationPrompt,
  createRestaurantSelectionPrompt,
  createRestaurantMealGenerationPrompt,
} from '../src/lib/ai/prompts/meal-generation';
import { createWorkoutPlanningPrompt, createWorkoutDetailPrompt } from '../src/lib/ai/prompts/workout-generation';
import { createRecipeGenerationPrompt } from '../src/lib/ai/prompts/recipe-creation';

import { GroceryListSchema } from '../src/lib/ai/schemas/meals';
import { WorkoutPlanSchema } from '../src/lib/ai/schemas/workout';
import { RecipeSchema } from '../src/lib/ai/schemas/recipe';
import { MenuExtractionSchema, RestaurantSelectionSchema } from '../src/lib/ai/schemas/restaurants';
import { GroceryPricesSchema } from '../src/lib/ai/schemas/grocery';
import { createGroceryPricePrompt } from '../src/lib/ai/prompts/grocery-prices';
import {
  toStrictJsonSchema,
  pinnedMealPlan,
  pinnedMealDetail,
  pinnedHomeMealsLegacy,
  pinnedWorkoutDetail,
  pinnedRestaurantMeals,
} from '../src/lib/ai/schemas/index';
import { MODELS } from '../src/lib/ai/models';
import { tally, type Finding, type CheckResult, type Family } from './eval/types';
import { checkAtwater, checkTarget, checkSum } from './eval/arithmetic';
import { checkCount, checkSlots, checkNonEmpty } from './eval/completeness';
import { rulesFor, checkText } from './eval/adherence';
import { checkOrderingLinks } from './eval/links';

import {
  fixtures, homeMealsFrom, scheduleTextFrom, menuProseFixture,
  restaurantSlotsFrom, nearbyRestaurantsFixture, restaurantMenuDataFixture,
  type Fixture,
} from './fixtures/surveys';

// ---------------------------------------------------------------- config

const KEY = process.env.GPT_KEY;

/**
 * USD per 1M tokens. Checked 2026-08-18 — update alongside any model change in
 * src/lib/ai/models.ts, and treat a missing entry as a loud zero rather than a
 * silent one.
 */
const RATES: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4.1': { in: 2.0, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  // GPT-5.6 family, for Phase 1 A/B runs. Reasoning tokens bill at the output
  // rate, so a model that reasons before answering can cost more than a
  // cheaper-looking sticker price implies. `reasoningTokens` below is the
  // number that decides it.
  'gpt-5.6-luna': { in: 0.2, out: 1.2 },
  'gpt-5.6-terra': { in: 1.25, out: 10 },
  'gpt-5.6-sol': { in: 5, out: 30 },
  // Perplexity Sonar. Search requests also carry a per-request fee that this
  // table does not model, so the $/1k figure for grocery-prices is a floor.
  'sonar': { in: 1, out: 1 },
  'sonar-pro': { in: 3, out: 15 },
};

/**
 * Models that reject `max_tokens` and `temperature`. Verified against the live
 * API 2026-08-18: the 5.6 family returns HTTP 400
 * "Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens'" and
 * "'temperature' does not support 0.5 ... Only the default (1) value is
 * supported". Both are code changes, not config changes — which is the whole
 * reason Phase 1 cannot be "just flip an environment variable".
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/.test(model);
}

/**
 * Role → model ID, with `--override ROLE=id` applied (repeatable). Phase 1
 * Task 3 A/Bs one role at a time; this lets a run do that without touching
 * .env or restarting the app.
 */
type Role = 'FAST' | 'PLANNING' | 'DETAIL';

function resolveModels(): Record<Role, string> {
  const out: Record<Role, string> = {
    FAST: MODELS.FAST, PLANNING: MODELS.PLANNING, DETAIL: MODELS.DETAIL,
  };
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    let spec: string | undefined;
    if (argv[i] === '--override') spec = argv[i + 1];
    else if (argv[i].startsWith('--override=')) spec = argv[i].slice('--override='.length);
    if (!spec) continue;
    for (const pair of spec.split(',')) {
      const idx = pair.indexOf('=');
      const role = pair.slice(0, idx).toUpperCase() as Role;
      const id = pair.slice(idx + 1);
      if (!(role in out) || !id) {
        console.error(`Bad --override "${pair}". Expected one of FAST/PLANNING/DETAIL=<model-id>.`);
        process.exit(1);
      }
      out[role] = id;
    }
  }
  return out;
}

/** Resolved once at load. Sites read this instead of MODELS directly. */
const M = resolveModels();

// ---------------------------------------------------------------- sites

interface Site {
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  /**
   * Build the request. May call the API itself for an upstream dependency —
   * the detail phase needs a real plan to detail. Return null to skip the site
   * for this fixture (e.g. the fixture has no restaurant slots).
   */
  build: (f: Fixture) => Promise<{ prompt: string; schema: z.ZodType } | null>;
  /**
   * Site-specific quality signal, beyond "did it parse".
   *
   * `summary` is the one-line console note this used to return as a bare string.
   * `findings` is the gate-able part: structured entries the runner tallies by
   * family and the exit code is derived from.
   *
   * Async because the LINKS family makes HTTP requests.
   */
  check?: (data: any, f: Fixture) => CheckResult | Promise<CheckResult>;
  /** Which API to call. Defaults to 'openai'. Perplexity is OpenAI-compatible on the wire. */
  provider?: 'openai' | 'perplexity';
}

/** Cache upstream plans so N iterations of the detail site don't re-plan N times. */
const planCache = new Map<string, any>();

async function planFor(f: Fixture): Promise<any> {
  const cached = planCache.get(f.name);
  if (cached) return cached;

  const homeMeals = homeMealsFrom(f.surveyData.weeklyMealSchedule);
  const prompt = createPlanningPrompt({
    homeMeals, surveyData: f.surveyData, nutritionTargets: f.nutritionTargets,
    scheduleText: scheduleTextFrom(homeMeals),
  });
  const schema = pinnedMealPlan(homeMeals.length);
  const res = await callOnce(M.PLANNING, prompt, schema, 'meal_plan', 8000, 0.7);
  if (!res.parsed) throw new Error(`Could not seed a plan for fixture ${f.name}: ${res.error}`);
  planCache.set(f.name, res.parsed);
  return res.parsed;
}

/**
 * Whether LINKS-family checks may make HTTP requests. Set from --no-links in
 * main(). Module-level rather than threaded through every check signature: the
 * flag is process-wide and read-only after startup.
 */
export let PROBE_LINKS = true;

/**
 * Check one MealSlot envelope: both options, every family except LINKS.
 *
 * `alternative` is checked as strictly as `primary`. Production's isUsableMeal
 * looks only at primary, which is one of the reasons a broken alternative
 * reaches the UI unnoticed.
 */
function checkMealSlot(slot: any, f: Fixture): Finding[] {
  const out: Finding[] = [];
  const rules = rulesFor(f.surveyData);
  const target = f.nutritionTargets.mealTargets[String(slot.mealType).toLowerCase()];

  for (const which of ['primary', 'alternative'] as const) {
    const meal = slot?.[which];
    if (!meal) {
      out.push({ family: 'COMPLETENESS', severity: 'error', code: 'missing-option',
        where: `${slot.day}.${slot.mealType}`, message: `no ${which} option` });
      continue;
    }
    const where = `${slot.day}.${slot.mealType}.${which}`;

    out.push(...checkAtwater(where, {
      calories: meal.estimatedCalories, protein: meal.protein,
      carbs: meal.carbs, fat: meal.fat,
    }));

    if (target) out.push(...checkTarget(where, meal.estimatedCalories, target.calories));

    // The grocery prompt reads ingredientsWithNutrition, so an empty one means
    // this meal contributes nothing downstream even though it renders fine.
    out.push(...checkNonEmpty(where, 'no-ingredients', meal.ingredientsWithNutrition, 2));
    out.push(...checkNonEmpty(where, 'no-instructions', meal.instructions, 2));

    const ing = (meal.ingredientsWithNutrition ?? []) as Array<{ item: string; calories: number }>;
    if (ing.length > 0) {
      out.push(...checkSum(where, 'ingredient-sum', ing.map(i => i.calories), meal.estimatedCalories));
    }

    const text = [meal.name, meal.description, ...(meal.ingredients ?? []), ...ing.map(i => i.item)].join(' ');
    out.push(...checkText(where, text, rules));
  }

  return out;
}

const SITES: Site[] = [
  {
    name: 'meal-planning',
    model: M.PLANNING, maxTokens: 8000, temperature: 0.7,
    build: async (f) => {
      const homeMeals = homeMealsFrom(f.surveyData.weeklyMealSchedule);
      return {
        prompt: createPlanningPrompt({
          homeMeals, surveyData: f.surveyData, nutritionTargets: f.nutritionTargets,
          scheduleText: scheduleTextFrom(homeMeals),
        }),
        schema: pinnedMealPlan(homeMeals.length),
      };
    },
    check: (d, f) => {
      const want = homeMealsFrom(f.surveyData.weeklyMealSchedule);
      const got = d.mealPlan as Array<{ day: string; mealType: string; name?: string; description?: string }>;
      const rules = rulesFor(f.surveyData);
      const findings: Finding[] = [
        ...checkCount('mealPlan', 'plan-count', got.length, want.length),
        ...checkSlots('mealPlan', got, want),
      ];
      // Planning is where a dish is named, and the detail phase is forbidden to
      // rename it — so an excluded ingredient chosen here can never be corrected.
      for (const m of got) {
        findings.push(...checkText(`${m.day}.${m.mealType}`,
          `${m.name ?? ''} ${m.description ?? ''}`, rules));
      }
      const slots = new Set(got.map(m => `${m.day}|${m.mealType}`));
      return {
        summary: `${got.length}/${want.length} entries, ${slots.size} distinct slots`,
        findings,
      };
    },
  },
  {
    name: 'meal-detail',
    model: M.DETAIL, maxTokens: 12000, temperature: 0.5,
    build: async (f) => {
      const plan = await planFor(f);
      // One chunk, the way the route splits it: two days at a time.
      const days = [...new Set(plan.mealPlan.map((m: any) => m.day))].slice(0, 2);
      const chunk = plan.mealPlan.filter((m: any) => days.includes(m.day));
      if (chunk.length === 0) return null;
      return {
        prompt: createDetailPrompt(chunk, {
          homeMeals: chunk.map((m: any) => ({ day: m.day, mealType: m.mealType })),
          surveyData: f.surveyData, nutritionTargets: f.nutritionTargets,
          scheduleText: 'Details for Chunk A',
        }),
        schema: pinnedMealDetail(chunk.length),
      };
    },
    check: async (d, f) => {
      const plan = await planFor(f);
      const days = [...new Set(plan.mealPlan.map((m: any) => m.day))].slice(0, 2);
      const want = plan.mealPlan
        .filter((m: any) => days.includes(m.day))
        .map((m: any) => ({ day: m.day, mealType: m.mealType }));
      const got = d.meals as any[];
      const findings: Finding[] = [
        ...checkCount('meals', 'detail-count', got.length, want.length),
        ...checkSlots('meals', got, want),
      ];
      for (const slot of got) findings.push(...checkMealSlot(slot, f));
      const slots = new Set(got.map((m: any) => `${m.day}|${m.mealType}`));
      return { summary: `${got.length} entries, ${slots.size} distinct slots`, findings };
    },
  },
  {
    name: 'grocery-list',
    model: M.DETAIL, maxTokens: 4000, temperature: 0.3,
    build: async (f) => {
      const plan = await planFor(f);
      return {
        prompt: createGroceryPrompt(plan.mealPlan, f.surveyData),
        schema: GroceryListSchema,
      };
    },
    check: async (d, f) => {
      const plan = await planFor(f);
      const list = d.groceryList as Record<string, Array<{ name: string; quantity: string; uses: string }>>;
      const all = Object.values(list).flat();
      const rules = rulesFor(f.surveyData);
      const findings: Finding[] = [
        ...checkNonEmpty('groceryList', 'empty-grocery-list', all, 8),
      ];
      // A plan with N meals that yields a handful of items has silently dropped
      // most of the shopping.
      if (all.length > 0 && all.length < plan.mealPlan.length) {
        findings.push({
          family: 'COMPLETENESS', severity: 'warn', code: 'thin-grocery-list',
          where: 'groceryList',
          message: `${all.length} items for ${plan.mealPlan.length} planned meals`,
        });
      }
      for (const item of all) {
        findings.push(...checkText(`groceryList.${item.name}`, item.name, rules));
        // 'varies' is what buildFallbackGroceryList emits; a real list never has it.
        if (!item.quantity || /^(varies|as needed|some)$/i.test(item.quantity.trim())) {
          findings.push({
            family: 'COMPLETENESS', severity: 'error', code: 'unpriceable-quantity',
            where: `groceryList.${item.name}`,
            message: `quantity "${item.quantity}" cannot be shopped or priced`,
          });
        }
      }
      return {
        summary: Object.entries(list).map(([k, v]) => `${k}=${v.length}`).join(' '),
        findings,
      };
    },
  },
  {
    name: 'meal-legacy',
    model: M.DETAIL, maxTokens: 16384, temperature: 0.5,
    build: async (f) => {
      // The route splits this at 12; benchmark the half, which is what now runs.
      const homeMeals = homeMealsFrom(f.surveyData.weeklyMealSchedule)
        .slice(0, Math.ceil(homeMealsFrom(f.surveyData.weeklyMealSchedule).length / 2));
      return {
        prompt: createHomeMealGenerationPrompt({
          homeMeals, surveyData: f.surveyData, nutritionTargets: f.nutritionTargets,
          scheduleText: scheduleTextFrom(homeMeals),
        }),
        schema: pinnedHomeMealsLegacy(homeMeals.length),
      };
    },
    check: (d, f) => {
      const all = homeMealsFrom(f.surveyData.weeklyMealSchedule);
      const want = all.slice(0, Math.ceil(all.length / 2));
      const got = d.homeMeals as any[];
      const findings: Finding[] = [
        ...checkCount('homeMeals', 'legacy-count', got.length, want.length),
        ...checkSlots('homeMeals', got, want),
      ];
      for (const slot of got) findings.push(...checkMealSlot(slot, f));
      return { summary: `${got.length} meals, grocery present`, findings };
    },
  },
  {
    name: 'workout-planning',
    model: M.PLANNING, maxTokens: 4000, temperature: 0.7,
    build: async (f) => ({
      prompt: createWorkoutPlanningPrompt(f.surveyData, f.workoutPrefs),
      schema: WorkoutPlanSchema,
    }),
    check: (d, f) => {
      const want = f.workoutPrefs.availableDays ?? [];
      const got = d.weeklyPlan as Array<{ day: string; restDay: boolean; estimatedTime: string; estimatedCalories: number }>;
      const findings: Finding[] = [];

      // weeklyPlan is not count-pinned, so a short week ships with a 200.
      const training = got.filter(x => !x.restDay).map(x => String(x.day).toLowerCase());
      const missing = want.map(d => d.toLowerCase()).filter(d => !training.includes(d));
      if (missing.length > 0) {
        findings.push({
          family: 'COMPLETENESS', severity: 'error', code: 'missing-training-day',
          where: 'weeklyPlan',
          message: `available day(s) with no training session: ${missing.join(', ')}`,
        });
      }

      for (const day of got) {
        // parseInt('about an hour') is NaN, which the UI renders as "NaNmin".
        if (!/\d/.test(String(day.estimatedTime))) {
          findings.push({
            family: 'ARITHMETIC', severity: 'error', code: 'unparseable-duration',
            where: `weeklyPlan.${day.day}`,
            message: `estimatedTime "${day.estimatedTime}" contains no digits`,
          });
        }
        if (!day.restDay && !(day.estimatedCalories > 0)) {
          findings.push({
            family: 'ARITHMETIC', severity: 'error', code: 'zero-calories',
            where: `weeklyPlan.${day.day}`,
            message: `training day with estimatedCalories ${day.estimatedCalories}`,
          });
        }
      }

      return {
        summary: `${got.length} days, ${got.filter(x => x.restDay).length} rest`,
        findings,
      };
    },
  },
  {
    name: 'workout-detail',
    model: M.DETAIL, maxTokens: 12000, temperature: 0.5,
    build: async (f) => {
      const outline = [
        { day: 'monday', restDay: false, focus: 'Upper push', estimatedTime: '45 min',
          estimatedCalories: 320, targetMuscles: ['chest', 'shoulders', 'triceps'],
          description: 'Pressing volume' },
        { day: 'tuesday', restDay: true, focus: 'Recovery', estimatedTime: '20 min',
          estimatedCalories: 90, targetMuscles: [], description: 'Light movement' },
      ];
      return {
        prompt: createWorkoutDetailPrompt(outline, f.surveyData, f.workoutPrefs),
        schema: pinnedWorkoutDetail(outline.length),
      };
    },
    // The branch invariant strict mode cannot express: training days need
    // exercises, rest days need activeRecovery. This is the failure the
    // superRefine catches locally, so the bench has to report it too.
    check: (d, f) => {
      const days = d.days as any[];
      const findings: Finding[] = [];
      for (const day of days) {
        const where = `days.${day.day}`;
        if (!day.restDay) {
          findings.push(...checkNonEmpty(where, 'no-exercises', day.exercises, 3));
          for (const ex of day.exercises ?? []) {
            if (!/\d/.test(String(ex.reps))) {
              findings.push({
                family: 'ARITHMETIC', severity: 'error', code: 'unparseable-reps',
                where: `${where}.${ex.name}`, message: `reps "${ex.reps}" contains no digits`,
              });
            }
            if (!/\d/.test(String(ex.restTime))) {
              findings.push({
                family: 'ARITHMETIC', severity: 'error', code: 'unparseable-rest',
                where: `${where}.${ex.name}`, message: `restTime "${ex.restTime}" contains no digits`,
              });
            }
            const rpe = ex.weightGuidance?.rpeTarget;
            if (typeof rpe === 'number' && (rpe < 1 || rpe > 10)) {
              findings.push({
                family: 'ARITHMETIC', severity: 'error', code: 'rpe-out-of-range',
                where: `${where}.${ex.name}`, message: `rpeTarget ${rpe} is outside 1-10`,
              });
            }
          }
          // The injury constraint the prompt carries — when it carries one.
          const injuries = f.workoutPrefs.injuryConsiderations ?? [];
          if (injuries.length > 0) {
            findings.push({
              family: 'ADHERENCE', severity: 'warn', code: 'injury-unreviewed',
              where, message: `fixture declares ${injuries.join(', ')}; verify the movements avoid it`,
            });
          }
        } else if (!day.activeRecovery) {
          findings.push({
            family: 'COMPLETENESS', severity: 'error', code: 'rest-without-recovery',
            where, message: 'rest day carries no activeRecovery object',
          });
        }
      }
      const bad = findings.filter(x => x.severity === 'error').length;
      return { summary: `${days.length} days, ${bad} error-level findings`, findings };
    },
  },
  {
    name: 'recipe',
    model: M.FAST, maxTokens: 4000, temperature: 0.7,
    build: async (f) => ({
      prompt: createRecipeGenerationPrompt({
        dishName: f.name === 'vegetarian-cut' ? 'Red Lentil Dal with Spinach'
          : f.name === 'restricted' ? 'Lamb and Chickpea Tagine'
          : 'Chicken Burrito Bowl',
        description: 'Benchmark fixture dish',
        mealType: 'dinner',
        nutritionTargets: {
          calories: f.nutritionTargets.mealTargets.dinner.calories,
          protein: f.nutritionTargets.mealTargets.dinner.protein,
          carbs: f.nutritionTargets.mealTargets.dinner.carbs,
          fat: f.nutritionTargets.mealTargets.dinner.fat,
        },
        dietaryRestrictions: f.surveyData.dietPrefs,
        existingGroceryItems: f.surveyData.preferredFoods,
      } as any),
      schema: RecipeSchema,
    }),
    check: (d, f) => {
      const want = f.nutritionTargets.mealTargets.dinner;
      const findings: Finding[] = [
        ...checkAtwater('recipe', {
          calories: d.nutrition.calories, protein: d.nutrition.protein,
          carbs: d.nutrition.carbs, fat: d.nutrition.fat,
        }),
        ...checkTarget('recipe', d.nutrition.calories, want.calories),
        ...checkNonEmpty('recipe.ingredients', 'no-ingredients', d.ingredientsWithNutrition, 3),
        ...checkText('recipe',
          [d.dishName ?? '', ...(d.ingredientsWithNutrition ?? []).map((i: any) => i.item)].join(' '),
          rulesFor(f.surveyData)),
      ];

      const ing = (d.ingredientsWithNutrition ?? []) as Array<{ calories: number }>;
      const sum = ing.reduce((a, i) => a + i.calories, 0);
      const servings = Number(d.servings) || 1;
      findings.push(...checkSum('recipe', 'ingredient-sum', ing.map(i => i.calories), d.nutrition.calories));

      // Per-serving vs whole-recipe: if dividing the ingredient sum by servings
      // lands on the stated nutrition, the two numbers are in different units.
      if (servings > 1 && sum > 0) {
        const asWhole = Math.abs(sum - d.nutrition.calories) / d.nutrition.calories;
        const asPerServing = Math.abs(sum / servings - d.nutrition.calories) / d.nutrition.calories;
        if (asWhole > 0.2 && asPerServing < 0.1) {
          findings.push({
            family: 'ARITHMETIC', severity: 'error', code: 'serving-unit-mismatch',
            where: 'recipe',
            message: `ingredients total ${Math.round(sum)} cal for ${servings} servings; ` +
                     `nutrition states ${d.nutrition.calories}, which is the per-serving figure`,
          });
        }
      }

      const off = Math.round(Math.abs(d.nutrition.calories - want.calories) / want.calories * 100);
      return {
        summary: `${ing.length} ingredients, ${d.nutrition.calories} cal (${off}% off target)`,
        findings,
      };
    },
  },
  {
    name: 'menu-extraction',
    model: M.DETAIL, maxTokens: 4000, temperature: 0.1,
    build: async (f) => ({
      prompt: `Extract structured menu data from the following restaurant research.

RESEARCH:
${menuProseFixture}

RESTAURANT: Sakura Ramen House
CITY: Berkeley

USER PREFERENCES:
- Diet Restrictions: ${(f.surveyData.dietPrefs || []).join(', ') || 'None'}

EXTRACTION RULES FOR MENU ITEMS:
1. Extract ONLY menu items that have clear prices mentioned
2. Categorize by meal type (breakfast, lunch, dinner, snack)
3. Estimate calories based on typical dish composition
4. Rate healthiness (excellent/good/fair/poor) based on ingredients
5. Apply the dietary restrictions above, excluding non-compliant dishes

IMPORTANT: orderingLinks must carry all four keys. Use null for any platform you
did not find a real URL for. Extract 6-12 menu items maximum.`,
      schema: MenuExtractionSchema,
    }),
    check: async (d, f) => {
      const items = d.menuItems as Array<{ name: string; price: number; description: string; estimatedCalories: number; category: string }>;
      const rules = rulesFor(f.surveyData);
      const findings: Finding[] = [
        ...checkNonEmpty('menuItems', 'no-menu-items', items, 6),
      ];

      for (const item of items) {
        const where = `menuItems.${item.name}`;
        if (!(item.price > 0)) {
          findings.push({ family: 'ARITHMETIC', severity: 'error', code: 'nonpositive-price',
            where, message: `price ${item.price}` });
        }
        if (!(item.estimatedCalories > 0)) {
          findings.push({ family: 'ARITHMETIC', severity: 'error', code: 'zero-calories',
            where, message: `estimatedCalories ${item.estimatedCalories}` });
        }
        findings.push(...checkText(where, `${item.name} ${item.description}`, rules));
      }

      // Ground truth from menuProseFixture: DoorDash and direct exist, Uber Eats
      // and Grubhub explicitly do not. Anything under those two keys is invented.
      const links = d.orderingLinks as Record<string, string | null>;
      for (const platform of ['ubereats', 'grubhub']) {
        const v = links?.[platform];
        if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
          findings.push({
            family: 'LINKS', severity: 'error', code: 'fabricated-link',
            where: `orderingLinks.${platform}`,
            message: `source prose says no ${platform} listing was found, but a URL was produced: ${v}`,
          });
        }
      }

      findings.push(...await checkOrderingLinks('orderingLinks', links ?? {}, { probeNetwork: PROBE_LINKS }));

      const usable = Object.values(links ?? {}).filter(
        u => typeof u === 'string' && u.startsWith('http')).length;
      return { summary: `${items.length} items, ${usable} usable links`, findings };
    },
  },
  {
    name: 'restaurant-selection',
    model: M.PLANNING, maxTokens: 4000, temperature: 0.3,
    build: async (f) => ({
      prompt: createRestaurantSelectionPrompt(nearbyRestaurantsFixture, f.surveyData),
      schema: RestaurantSelectionSchema,
    }),
    check: (d, f) => {
      const picked = d.selectedRestaurants as Array<{ name: string; placeId: string; cuisine: string; rating: number }>;
      const findings: Finding[] = [];

      // The prompt asks for 8-10 and the schema pins nothing, so both ends drift.
      if (picked.length < 8 || picked.length > 10) {
        findings.push({
          family: 'COMPLETENESS', severity: 'error', code: 'selection-count',
          where: 'selectedRestaurants',
          message: `${picked.length} selected, prompt asks for 8-10`,
        });
      }

      // A restaurant not in the supplied list was invented. This is the check
      // that catches a GPT-authored restaurant entering the pool.
      const known = new Map(nearbyRestaurantsFixture.map(r => [r.placeId, r]));
      const knownNames = new Set(nearbyRestaurantsFixture.map(r => r.name.toLowerCase()));
      for (const r of picked) {
        const where = `selectedRestaurants.${r.name}`;
        if (!known.has(r.placeId)) {
          findings.push({
            family: 'ADHERENCE', severity: 'error', code: 'invented-restaurant',
            where, message: `placeId "${r.placeId}" was not in the supplied list`,
          });
        }
        if (!knownNames.has(r.name.toLowerCase())) {
          findings.push({
            family: 'ADHERENCE', severity: 'error', code: 'invented-restaurant-name',
            where, message: `"${r.name}" was not in the supplied list`,
          });
        }
        const source = known.get(r.placeId);
        if (source && Math.abs(source.rating - r.rating) > 0.01) {
          findings.push({
            family: 'ARITHMETIC', severity: 'error', code: 'altered-rating',
            where, message: `rating ${r.rating} does not match the supplied ${source.rating}`,
          });
        }
      }

      const dupes = picked.length - new Set(picked.map(r => r.placeId)).size;
      if (dupes > 0) {
        findings.push({
          family: 'COMPLETENESS', severity: 'error', code: 'duplicate-restaurant',
          where: 'selectedRestaurants', message: `${dupes} duplicate placeId(s)`,
        });
      }

      return { summary: `${picked.length} selected, ${dupes} duplicates`, findings };
    },
  },
  {
    name: 'restaurant-meals',
    model: M.DETAIL, maxTokens: 12000, temperature: 0.5,
    build: async (f) => {
      const slots = restaurantSlotsFrom(f.surveyData.weeklyMealSchedule);
      // allHomeSchedule fixtures have no eating-out slots; skip rather than fake one.
      if (slots.length === 0) return null;
      return {
        prompt: createRestaurantMealGenerationPrompt({
          restaurantMealsSchedule: slots,
          restaurantMenuData: restaurantMenuDataFixture,
          surveyData: f.surveyData,
          nutritionTargets: f.nutritionTargets,
        }),
        schema: pinnedRestaurantMeals(slots.length),
      };
    },
    check: async (d, f) => {
      const want = restaurantSlotsFrom(f.surveyData.weeklyMealSchedule);
      const got = d.restaurantMeals as any[];
      const rules = rulesFor(f.surveyData);
      const findings: Finding[] = [
        ...checkCount('restaurantMeals', 'restaurant-count', got.length, want.length),
        ...checkSlots('restaurantMeals', got, want),
      ];

      // Ground truth: which links each restaurant actually has.
      const truth = new Map(restaurantMenuDataFixture.map(r => [r.name.toLowerCase(), r]));

      for (const slot of got) {
        for (const which of ['primary', 'alternative'] as const) {
          const meal = slot?.[which];
          if (!meal) continue;
          const where = `${slot.day}.${slot.mealType}.${which}`;
          const target = f.nutritionTargets.mealTargets[String(slot.mealType).toLowerCase()];

          findings.push(...checkAtwater(where, {
            calories: meal.estimatedCalories, protein: meal.protein,
            carbs: meal.carbs, fat: meal.fat,
          }));
          if (target) findings.push(...checkTarget(where, meal.estimatedCalories, target.calories));
          findings.push(...checkText(where, `${meal.dish} ${meal.description}`, rules));

          const source = truth.get(String(meal.restaurant).toLowerCase());
          if (!source) {
            findings.push({
              family: 'ADHERENCE', severity: 'error', code: 'invented-restaurant',
              where, message: `"${meal.restaurant}" is not in the supplied menu data`,
            });
            continue;
          }

          if (!source.menuItems.some(mi => mi.name.toLowerCase() === String(meal.dish).toLowerCase())) {
            findings.push({
              family: 'ADHERENCE', severity: 'error', code: 'invented-dish',
              where, message: `"${meal.dish}" is not on ${source.name}'s supplied menu`,
            });
          }

          // Every link must be one the fixture actually supplied. Anything else
          // was authored by the model.
          const supplied = source.orderingLinks as Record<string, string | null>;
          for (const [platform, url] of Object.entries(meal.orderingLinks ?? {})) {
            const usable = typeof url === 'string' && /^https?:\/\//i.test(url.trim());
            if (!usable) continue;
            if (supplied[platform] !== url) {
              findings.push({
                family: 'LINKS', severity: 'error', code: 'fabricated-link',
                where: `${where}.orderingLinks.${platform}`,
                message: supplied[platform]
                  ? `expected ${supplied[platform]}, got ${url}`
                  : `${platform} was marked "not available" for ${source.name}, but a URL was produced: ${url}`,
              });
            }
          }

          findings.push(...await checkOrderingLinks(
            `${where}.orderingLinks`, meal.orderingLinks ?? {}, { probeNetwork: PROBE_LINKS }));
        }
      }

      const fabricated = findings.filter(x => x.code === 'fabricated-link').length;
      return { summary: `${got.length}/${want.length} slots, ${fabricated} fabricated links`, findings };
    },
  },
  {
    name: 'grocery-prices',
    provider: 'perplexity',
    model: MODELS.SEARCH, maxTokens: 8000, temperature: 0.2,
    build: async (f) => {
      const plan = await planFor(f);
      // Mirror what generate-groceries sends: one chunk of the real list.
      const items = [...new Set(plan.mealPlan.flatMap((m: any) => m.keyIngredients ?? []))]
        .slice(0, 20)
        .map((name: any) => ({ name: String(name), quantity: '1 unit', uses: 'meal plan', category: 'proteins' }));
      if (items.length === 0) return null;
      return {
        prompt: createGroceryPricePrompt({
          items,
          storeNames: 'Whole Foods, Trader Joe\'s, Safeway',
          city: f.surveyData.city,
          userGoal: f.surveyData.primaryGoal,
        }),
        schema: GroceryPricesSchema,
      };
    },
    check: (d) => {
      const items = d.items as Array<{ item: string; storeOptions: Array<{ store: string; price: number; priceConfidence: string; isRecommended: boolean }> }>;
      const findings: Finding[] = [...checkNonEmpty('items', 'no-priced-items', items, 1)];

      // Every item must be priced at the same set of stores, or the cheapest-store
      // comparison downstream is comparing different baskets.
      const storeSets = items.map(i => [...new Set(i.storeOptions.map(o => o.store.trim().toLowerCase()))].sort().join('|'));
      const distinct = new Set(storeSets);
      if (distinct.size > 1) {
        findings.push({
          family: 'ARITHMETIC', severity: 'error', code: 'ragged-basket',
          where: 'items',
          message: `${distinct.size} different store sets across items — store totals would compare different baskets`,
        });
      }

      // Near-identical store names split one store into two half-baskets.
      const names = [...new Set(items.flatMap(i => i.storeOptions.map(o => o.store.trim())))];
      const normalized = new Map<string, string[]>();
      for (const n of names) {
        const k = n.toLowerCase().replace(/[^a-z]/g, '');
        normalized.set(k, [...(normalized.get(k) ?? []), n]);
      }
      for (const [, variants] of normalized) {
        if (variants.length > 1) {
          findings.push({
            family: 'ARITHMETIC', severity: 'error', code: 'store-name-variants',
            where: 'items', message: `same store under ${variants.length} spellings: ${variants.join(' / ')}`,
          });
        }
      }

      for (const item of items) {
        const where = `items.${item.item}`;
        const recommended = item.storeOptions.filter(o => o.isRecommended).length;
        if (recommended !== 1) {
          findings.push({
            family: 'ADHERENCE', severity: 'error', code: 'recommendation-count',
            where, message: `${recommended} options marked recommended, prompt requires exactly one`,
          });
        }
        for (const o of item.storeOptions) {
          if (!(o.price > 0) || o.price > 500) {
            findings.push({
              family: 'ARITHMETIC', severity: 'error', code: 'implausible-price',
              where: `${where}.${o.store}`, message: `price ${o.price}`,
            });
          }
        }
        const prices = item.storeOptions.map(o => o.price);
        if (prices.length > 1 && new Set(prices).size === 1) {
          findings.push({
            family: 'ARITHMETIC', severity: 'warn', code: 'identical-prices',
            where, message: `all ${prices.length} stores quote ${prices[0]} — the prompt names this as a sign of estimating`,
          });
        }
      }

      const exact = items.flatMap(i => i.storeOptions).filter(o => o.priceConfidence === 'exact').length;
      const total = items.flatMap(i => i.storeOptions).length;
      return { summary: `${items.length} items, ${exact}/${total} options marked exact`, findings };
    },
  },
];

// ---------------------------------------------------------------- runner

interface CallOutcome {
  parsed: any | null;
  error: string | null;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  /** Subset of completionTokens spent thinking. Zero on non-reasoning models. */
  reasoningTokens: number;
  latencyMs: number;
  model: string;
}

async function callOnce(
  model: string, prompt: string, schema: z.ZodType,
  schemaName: string, maxTokens: number, temperature: number,
  provider: 'openai' | 'perplexity' = 'openai'
): Promise<CallOutcome> {
  const t0 = Date.now();
  const blank: Omit<CallOutcome, 'parsed' | 'error'> = {
    finishReason: 'error', promptTokens: 0, completionTokens: 0, reasoningTokens: 0,
    latencyMs: 0, model,
  };

  const endpoint = provider === 'perplexity'
    ? 'https://api.perplexity.ai/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const apiKey = provider === 'perplexity' ? process.env.PERPLEXITY_API_KEY : KEY;
  if (!apiKey) {
    return { ...blank, parsed: null, error: `${provider} API key is not set`, latencyMs: 0 };
  }

  // The 5.6 family renamed max_tokens and accepts only the default temperature.
  // Sending the legacy pair is a hard 400, not a silently-ignored field, so the
  // dialect has to be chosen per model rather than set globally.
  const reasoning = isReasoningModel(model);
  const params: Record<string, unknown> = reasoning
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens, temperature };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages: [{ role: 'system', content: prompt }],
        ...params,
        response_format: toStrictJsonSchema(schemaName, schema),
      }),
    });
  } catch (e) {
    return { ...blank, parsed: null, error: `network: ${e}`, latencyMs: Date.now() - t0 };
  }

  const body = await res.text();
  const latencyMs = Date.now() - t0;
  if (!res.ok) return { ...blank, parsed: null, error: `HTTP ${res.status}: ${body.slice(0, 200)}`, latencyMs };

  const data = JSON.parse(body);
  const choice = data.choices?.[0];
  const common = {
    finishReason: choice?.finish_reason ?? 'unknown',
    promptTokens: data.usage?.prompt_tokens ?? 0,
    // Already includes reasoning tokens, which bill at the output rate.
    completionTokens: data.usage?.completion_tokens ?? 0,
    reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    latencyMs, model,
  };

  if (choice?.message?.refusal) return { ...common, parsed: null, error: `refusal: ${choice.message.refusal}` };
  if (choice?.finish_reason === 'length') return { ...common, parsed: null, error: 'truncated' };

  let obj: unknown;
  try { obj = JSON.parse(choice?.message?.content ?? ''); }
  catch (e) { return { ...common, parsed: null, error: `invalid_json: ${e}` }; }

  const check = schema.safeParse(obj);
  if (!check.success) {
    const first = check.error.issues[0];
    return { ...common, parsed: null, error: `schema: ${first?.path.join('.')} ${first?.message}` };
  }
  return { ...common, parsed: check.data, error: null };
}

interface BenchResult {
  site: string;
  fixture: string;
  model: string;
  n: number;
  schemaPassRate: number;
  finishReasons: Record<string, number>;
  latencyP50Ms: number;
  latencyP95Ms: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  /** Part of avgCompletionTokens spent thinking. Non-zero only on gpt-5+/o-series. */
  avgReasoningTokens: number;
  maxTokens: number;
  peakCeilingPct: number;
  estCostPer1000Runs: number;
  failures: string[];
  notes: string[];
  /** Every structured finding across all n runs, deduplicated by code+where+message. */
  findings: Finding[];
  /** findings rolled up per family, for the results table and the exit gate. */
  familyCounts: Record<Family, { error: number; warn: number }>;
}

const percentile = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/**
 * Collapse identical findings across the n runs of a site.
 *
 * Without this, `--n=5` reports the same wrong calorie count five times and the
 * error total says more about n than about the model.
 */
function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    seen.set(`${f.family}|${f.code}|${f.where}|${f.message}`, f);
  }
  return [...seen.values()];
}

async function runSite(site: Site, f: Fixture, n: number, probeLinks: boolean): Promise<BenchResult | null> {
  const built = await site.build(f);
  if (!built) return null;

  PROBE_LINKS = probeLinks;

  const outcomes: CallOutcome[] = [];
  const notes: string[] = [];
  const findings: Finding[] = [];

  for (let i = 0; i < n; i++) {
    const o = await callOnce(site.model, built.prompt, built.schema,
      site.name.replace(/-/g, '_'), site.maxTokens, site.temperature, site.provider ?? 'openai');
    outcomes.push(o);
    if (o.parsed && site.check) {
      try {
        const result = await site.check(o.parsed, f);
        notes.push(result.summary);
        findings.push(...result.findings);
      } catch (e) {
        // A checker that throws is a harness bug, not a model failure. Make it
        // loud rather than letting it read as a clean run.
        notes.push(`⚠️ check threw: ${e}`);
        findings.push({
          family: 'COMPLETENESS', severity: 'error', code: 'checker-crashed',
          where: site.name, message: String(e),
        });
      }
    }
    process.stdout.write(o.error ? '✗' : '·');
  }

  const passes = outcomes.filter(o => !o.error).length;
  const finishReasons: Record<string, number> = {};
  outcomes.forEach(o => { finishReasons[o.finishReason] = (finishReasons[o.finishReason] ?? 0) + 1; });

  const rate = RATES[site.model];
  if (!rate) notes.push(`⚠️ no rate table entry for ${site.model}; cost shown as 0`);
  const avgIn = mean(outcomes.map(o => o.promptTokens));
  const avgOut = mean(outcomes.map(o => o.completionTokens));
  const avgReasoning = mean(outcomes.map(o => o.reasoningTokens));
  const peakOut = Math.max(0, ...outcomes.map(o => o.completionTokens));
  if (avgReasoning > 0) {
    notes.push(`${Math.round((avgReasoning / avgOut) * 100)}% of output tokens were reasoning`);
  }

  return {
    site: site.name,
    fixture: f.name,
    model: site.model,
    n,
    schemaPassRate: passes / n,
    finishReasons,
    latencyP50Ms: percentile(outcomes.map(o => o.latencyMs), 50),
    latencyP95Ms: percentile(outcomes.map(o => o.latencyMs), 95),
    avgPromptTokens: avgIn,
    avgCompletionTokens: avgOut,
    avgReasoningTokens: avgReasoning,
    maxTokens: site.maxTokens,
    peakCeilingPct: Math.round((peakOut / site.maxTokens) * 100),
    estCostPer1000Runs: rate
      ? Math.round((avgIn * rate.in + avgOut * rate.out) / 1e6 * 1000 * 100) / 100
      : 0,
    failures: outcomes.filter(o => o.error).map(o => o.error!),
    notes: [...new Set(notes)],
    findings: dedupeFindings(findings),
    familyCounts: tally(dedupeFindings(findings)),
  };
}

// ---------------------------------------------------------------- main

function arg(name: string, fallback?: string) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const probeLinks = !process.argv.includes('--no-links');
  const n = Number(arg('n', '3'));
  const siteFilter = arg('site');
  const fixtureFilter = arg('fixture');

  const sites = SITES.filter(s => !siteFilter || s.name === siteFilter);
  const chosen = fixtures.filter(f => !fixtureFilter || f.name === fixtureFilter);

  if (sites.length === 0) { console.error(`No site matches "${siteFilter}". Known: ${SITES.map(s => s.name).join(', ')}`); process.exit(1); }
  if (chosen.length === 0) { console.error(`No fixture matches "${fixtureFilter}". Known: ${fixtures.map(f => f.name).join(', ')}`); process.exit(1); }

  if (dry) {
    // Prompts and schemas only. Catches a prompt builder that throws on a fixture
    // and a schema strict mode would reject, without spending anything.
    console.log('Dry run — building prompts and schemas, calling nothing.\n');
    let bad = 0;
    for (const f of chosen) {
      for (const s of sites) {
        // planFor would hit the API, so the sites that depend on it can't dry-run.
        if (s.name === 'meal-detail' || s.name === 'grocery-list' || s.name === 'grocery-prices') {
          console.log(`${s.name.padEnd(18)} ${f.name.padEnd(18)} — skipped, needs a live upstream plan`);
          continue;
        }
        try {
          const built = await s.build(f);
          if (!built) { console.log(`${s.name.padEnd(18)} ${f.name.padEnd(18)} — n/a for this fixture`); continue; }
          toStrictJsonSchema(s.name.replace(/-/g, '_'), built.schema);
          console.log(`${s.name.padEnd(18)} ${f.name.padEnd(18)} ✅ prompt ${built.prompt.length} chars, schema builds`);
        } catch (e) {
          bad++;
          console.log(`${s.name.padEnd(18)} ${f.name.padEnd(18)} ❌ ${e}`);
        }
      }
    }
    process.exit(bad === 0 ? 0 : 1);
  }

  if (!KEY) { console.error('GPT_KEY is not set. Source .env.local first.'); process.exit(1); }

  console.log(`Benchmarking ${sites.length} site(s) × ${chosen.length} fixture(s) × ${n} run(s) ` +
    `= up to ${sites.length * chosen.length * n} API calls. This costs real money.\n`);

  const results: BenchResult[] = [];
  for (const f of chosen) {
    for (const s of sites) {
      process.stdout.write(`${s.name.padEnd(18)} ${f.name.padEnd(18)} `);
      try {
        const r = await runSite(s, f, n, probeLinks);
        if (!r) { console.log('— n/a for this fixture'); continue; }
        results.push(r);
        console.log(`  ${Math.round(r.schemaPassRate * 100)}% pass, p50 ${r.latencyP50Ms}ms, ` +
          `out ${r.avgCompletionTokens}/${r.maxTokens} (peak ${r.peakCeilingPct}%), $${r.estCostPer1000Runs}/1k`);
        r.notes.forEach(note => console.log(`${' '.repeat(38)}↳ ${note}`));
        r.failures.forEach(fl => console.log(`${' '.repeat(38)}✗ ${fl}`));
      } catch (e) {
        console.log(`  ❌ site errored: ${e}`);
      }
    }
  }

  console.log('\n## Results\n');
  console.log('| Site | Fixture | Model | n | Pass | p50 ms | p95 ms | In | Out | Peak % | $/1k |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.site} | ${r.fixture} | ${r.model} | ${r.n} | ${Math.round(r.schemaPassRate * 100)}% | ` +
      `${r.latencyP50Ms} | ${r.latencyP95Ms} | ${r.avgPromptTokens} | ${r.avgCompletionTokens} | ` +
      `${r.peakCeilingPct}% | ${r.estCostPer1000Runs} |`);
  }

  const totalPer1k = Math.round(results.reduce((a, r) => a + r.estCostPer1000Runs, 0) * 100) / 100;
  const failing = results.filter(r => r.schemaPassRate < 1);
  const tight = results.filter(r => r.peakCeilingPct > 80);

  console.log(`\nTotal across all benchmarked sites: $${totalPer1k} per 1000 runs of each.`);
  if (failing.length) {
    console.log(`\n⚠️ ${failing.length} site/fixture pair(s) below 100% schema pass:`);
    failing.forEach(r => console.log(`   ${r.site}/${r.fixture}: ${Math.round(r.schemaPassRate * 100)}% — ${r.failures[0]}`));
  }
  if (tight.length) {
    console.log(`\n⚠️ ${tight.length} pair(s) peaked above 80% of their max_tokens ceiling. Under strict`);
    console.log(`   mode a truncated response is a hard failure, so these need headroom:`);
    tight.forEach(r => console.log(`   ${r.site}/${r.fixture}: peak ${r.peakCeilingPct}% of ${r.maxTokens}`));
  }

  mkdirSync('bench-results', { recursive: true });
  const out = `bench-results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(out, JSON.stringify({
    ranAt: new Date().toISOString(),
    models: MODELS,
    rates: RATES,
    n,
    results,
  }, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
