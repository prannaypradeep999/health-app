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
} from '../src/lib/ai/prompts/meal-generation';
import { createWorkoutPlanningPrompt, createWorkoutDetailPrompt } from '../src/lib/ai/prompts/workout-generation';
import { createRecipeGenerationPrompt } from '../src/lib/ai/prompts/recipe-creation';

import { GroceryListSchema } from '../src/lib/ai/schemas/meals';
import { WorkoutPlanSchema } from '../src/lib/ai/schemas/workout';
import { RecipeSchema } from '../src/lib/ai/schemas/recipe';
import { MenuExtractionSchema } from '../src/lib/ai/schemas/restaurants';
import {
  toStrictJsonSchema,
  pinnedMealPlan,
  pinnedMealDetail,
  pinnedHomeMealsLegacy,
  pinnedWorkoutDetail,
} from '../src/lib/ai/schemas/index';
import { MODELS } from '../src/lib/ai/models';
import { tally, type Finding, type CheckResult, type Family } from './eval/types';

import { fixtures, homeMealsFrom, scheduleTextFrom, menuProseFixture, type Fixture } from './fixtures/surveys';

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
      const want = homeMealsFrom(f.surveyData.weeklyMealSchedule).length;
      const slots = new Set(d.mealPlan.map((m: any) => `${m.day}|${m.mealType}`));
      return {
        summary: `${d.mealPlan.length}/${want} entries, ${slots.size} distinct slots`,
        findings: [],
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
    check: (d) => {
      const slots = new Set(d.meals.map((m: any) => `${m.day}|${m.mealType}`));
      return {
        summary: `${d.meals.length} entries, ${slots.size} distinct slots`,
        findings: [],
      };
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
    check: (d) => ({
      summary: Object.entries(d.groceryList as Record<string, any[]>)
        .map(([k, v]) => `${k}=${v.length}`).join(' '),
      findings: [],
    }),
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
    check: (d) => ({ summary: `${d.homeMeals.length} meals, grocery present`, findings: [] }),
  },
  {
    name: 'workout-planning',
    model: M.PLANNING, maxTokens: 4000, temperature: 0.7,
    build: async (f) => ({
      prompt: createWorkoutPlanningPrompt(f.surveyData, f.workoutPrefs),
      schema: WorkoutPlanSchema,
    }),
    check: (d) => ({
      summary: `${d.weeklyPlan.length} days, ${d.weeklyPlan.filter((x: any) => x.restDay).length} rest`,
      findings: [],
    }),
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
    check: (d) => {
      const bad = d.days.filter((x: any) =>
        (!x.restDay && (!x.exercises || x.exercises.length === 0)) ||
        (x.restDay && !x.activeRecovery));
      return {
        summary: `${d.days.length} days, ${bad.length} violating the rest/train branch`,
        findings: [],
      };
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
      const want = f.nutritionTargets.mealTargets.dinner.calories;
      const off = Math.round(Math.abs(d.nutrition.calories - want) / want * 100);
      return {
        summary: `${d.ingredientsWithNutrition.length} ingredients, ${d.nutrition.calories} cal (${off}% off target)`,
        findings: [],
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
    check: (d) => {
      const links = Object.values(d.orderingLinks).filter(
        (u: any) => typeof u === 'string' && u.startsWith('http')).length;
      return {
        summary: `${d.menuItems.length} items, ${links} usable links`,
        findings: [],
      };
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
  schemaName: string, maxTokens: number, temperature: number
): Promise<CallOutcome> {
  const t0 = Date.now();
  const blank: Omit<CallOutcome, 'parsed' | 'error'> = {
    finishReason: 'error', promptTokens: 0, completionTokens: 0, reasoningTokens: 0,
    latencyMs: 0, model,
  };

  // The 5.6 family renamed max_tokens and accepts only the default temperature.
  // Sending the legacy pair is a hard 400, not a silently-ignored field, so the
  // dialect has to be chosen per model rather than set globally.
  const reasoning = isReasoningModel(model);
  const params: Record<string, unknown> = reasoning
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens, temperature };

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
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
      site.name.replace(/-/g, '_'), site.maxTokens, site.temperature);
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
        if (s.name === 'meal-detail' || s.name === 'grocery-list') {
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
