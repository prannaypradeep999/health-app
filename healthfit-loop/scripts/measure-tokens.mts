/**
 * Task 5: output-token distribution at the six heaviest call sites, measured
 * BEFORE strict mode is enabled.
 *
 * Drives the real prompt builders with a fixture survey and calls the API with
 * the same model/temperature/max_tokens/response_format each route uses. It
 * deliberately does not go through the routes: those write meal plans to the
 * shared production database, and the token counts do not depend on the write.
 *
 * Sites are measured independently. An upstream call that truncates at its
 * production ceiling must not silently drop the downstream sites from the
 * sample, so downstream inputs come from a separate call with headroom.
 *
 * Run: npx tsx --env-file=.env scripts/measure-tokens.mts [runs]
 */
import {
  createHomeMealGenerationPrompt,
  createPlanningPrompt,
  createDetailPrompt,
  createGroceryPrompt,
  type MealGenerationContext,
} from '../src/lib/ai/prompts/meal-generation';
import {
  createWorkoutPlanningPrompt,
  createWorkoutDetailPrompt,
} from '../src/lib/ai/prompts/workout-generation';
import { MODELS } from '../src/lib/ai/models';

const RUNS = Number(process.argv[2] ?? 10);
const KEY = process.env.GPT_KEY;
if (!KEY) throw new Error('GPT_KEY not set');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SLOTS = ['breakfast', 'lunch', 'dinner'];
const homeMeals = DAYS.flatMap(day => SLOTS.map(mealType => ({ day, mealType })));

const surveyData: any = {
  firstName: 'Alex', lastName: 'Rivera', age: 31, sex: 'male',
  height: 178, weight: 79, activityLevel: 'moderately_active',
  goal: 'Build Muscle', primaryGoal: 'gain_muscle',
  goalChallenge: 'consistency on weeknights',
  additionalGoalsNotes: 'wants higher protein without more cooking time',
  healthFocus: 'strength', maintainFocus: null,
  fitnessLevel: 'intermediate', fitnessTimeline: '6_months',
  preferredActivities: ['weightlifting', 'cycling'],
  sportsInterests: ['climbing'],
  dietPrefs: ['high_protein'],
  foodAllergies: ['shellfish'],
  strictExclusions: { meats: ['pork'], other: ['cilantro'] },
  preferredCuisines: ['mexican', 'japanese', 'mediterranean'],
  preferredFoods: ['chicken', 'salmon', 'black beans', 'greek yogurt'],
  preferredNutrients: ['protein', 'fiber'],
  customFoodInput: 'loves a good burrito bowl',
  monthlyFoodBudget: 600, monthlyFitnessBudget: 80,
  eatingOutOccasions: 3, distancePreference: 5,
  biomarkers: null, biomarkerJson: null, weeklyMealSchedule: null,
  workoutPreferencesJson: null,
};

const nutritionTargets = {
  mealTargets: {
    breakfast: { calories: 550, protein: 40 },
    lunch: { calories: 750, protein: 55 },
    dinner: { calories: 850, protein: 60 },
  },
};

const mealContext: MealGenerationContext = {
  homeMeals, surveyData, nutritionTargets,
  scheduleText: DAYS.map(d => `${d}: breakfast home, lunch home, dinner home`).join('\n'),
};

const workoutPrefs = {
  fitnessExperience: 'intermediate',
  gymAccess: 'full_gym',
  workoutTypes: ['strength', 'hiit'],
  availableDays: ['monday', 'tuesday', 'thursday', 'friday', 'saturday'],
  preferredDuration: 60,
  injuryConsiderations: ['left shoulder impingement'],
  timePreferences: ['morning'],
};

interface Sample { out: number; finish: string; ms: number; items: number }

async function call(prompt: string, model: string, maxTokens: number, temperature: number) {
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages: [{ role: 'system', content: prompt }],
      temperature, max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return {
    out: data.usage?.completion_tokens ?? -1,
    finish: data.choices?.[0]?.finish_reason ?? 'unknown',
    ms: Date.now() - t0,
    content: data.choices?.[0]?.message?.content ?? null,
  };
}

const results: Record<string, { ceiling: number; expect: number; samples: Sample[] }> = {};

function record(site: string, ceiling: number, expect: number, r: any, items: number) {
  (results[site] ??= { ceiling, expect, samples: [] }).samples.push({ ...r, items });
  const p = Math.round((r.out / ceiling) * 100);
  const short = expect > 0 && items >= 0 && items < expect ? `  ⚠️ ${items}/${expect} items` : '';
  console.log(`  ${site.padEnd(24)} ${String(r.out).padStart(6)}/${ceiling} ${String(p).padStart(3)}%  ${r.finish.padEnd(6)} ${String(r.ms).padStart(6)}ms${short}`);
}

const count = (content: string | null, key: string) => {
  try { return JSON.parse(content ?? '{}')[key]?.length ?? -1; } catch { return -1; }
};

async function pass(i: number) {
  console.log(`\n--- run ${i + 1}/${RUNS} ---`);

  const plan = await call(createPlanningPrompt(mealContext), MODELS.PLANNING, 8000, 0.7);
  record('home-meals-planning', 8000, 21, plan, count(plan.content, 'mealPlan'));

  let planned: any[] = [];
  try { planned = JSON.parse(plan.content ?? '{}').mealPlan ?? []; } catch {}

  if (planned.length > 0) {
    const chunk = planned.slice(0, Math.ceil(planned.length / 3));
    const detail = await call(createDetailPrompt(chunk, mealContext), MODELS.DETAIL, 12000, 0.5);
    record('home-meals-detail', 12000, chunk.length, detail, count(detail.content, 'meals'));

    let meals: any[] = [];
    try { meals = JSON.parse(detail.content ?? '{}').meals ?? []; } catch {}
    const grocery = await call(createGroceryPrompt(meals, surveyData), MODELS.DETAIL, 4000, 0.3);
    record('home-meals-grocery', 4000, 0, grocery, -1);
  }

  // Legacy single-shot fallback: the whole week in one call.
  const legacy = await call(createHomeMealGenerationPrompt(mealContext), MODELS.DETAIL, 16384, 0.5);
  record('home-meals-legacy', 16384, 21, legacy, count(legacy.content, 'homeMeals'));

  const wPlan = await call(createWorkoutPlanningPrompt(surveyData, workoutPrefs), MODELS.PLANNING, 2000, 0.7);
  record('workout-planning', 2000, 7, wPlan, count(wPlan.content, 'weeklyPlan'));

  let outlines: any[] = [];
  try { outlines = JSON.parse(wPlan.content ?? '{}').weeklyPlan ?? []; } catch {}
  if (outlines.length > 0) {
    const chunk = outlines.slice(0, 4);
    const wDetail = await call(createWorkoutDetailPrompt(chunk, surveyData, workoutPrefs), MODELS.DETAIL, 9000, 0.5);
    record('workout-detail', 9000, chunk.length, wDetail, count(wDetail.content, 'days'));
  }
}

const pctl = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

for (let i = 0; i < RUNS; i++) {
  try { await pass(i); } catch (e) { console.error('  run failed:', (e as Error).message); }
}

console.log('\n════ SUMMARY ════');
console.log('site                      n  ceiling    max    p95   mean  max%  p95%  trunc  short');
const hot: string[] = [];
for (const [site, { ceiling, expect, samples }] of Object.entries(results)) {
  const outs = samples.map(s => s.out);
  const max = Math.max(...outs);
  const p95 = pctl(outs, 95);
  const mean = Math.round(outs.reduce((a, b) => a + b, 0) / outs.length);
  const trunc = samples.filter(s => s.finish === 'length').length;
  const short = expect > 0 ? samples.filter(s => s.items >= 0 && s.items < expect).length : 0;
  const p95p = Math.round((p95 / ceiling) * 100);
  if (p95p >= 70 || trunc > 0 || short > 0) hot.push(site);
  console.log(
    `${site.padEnd(24)} ${String(samples.length).padStart(2)} ${String(ceiling).padStart(7)} ` +
    `${String(max).padStart(6)} ${String(p95).padStart(6)} ${String(mean).padStart(6)} ` +
    `${String(Math.round((max / ceiling) * 100)).padStart(4)}% ${String(p95p).padStart(4)}% ` +
    `${String(trunc).padStart(6)} ${String(short).padStart(6)}`
  );
}
console.log(hot.length
  ? `\n⚠️  Needs attention before Task 6: ${hot.join(', ')}\n   (p95 >= 70% of ceiling, truncated, or returned fewer items than requested)`
  : '\n✅ Every site has headroom and returned complete output. Safe to proceed to Task 6.');
