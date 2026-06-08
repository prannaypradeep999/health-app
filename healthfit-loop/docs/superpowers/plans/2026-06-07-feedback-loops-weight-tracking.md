# Feedback Loops & Weight Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire collected workout and meal behavioral data (weights, ratings, consumption, feedback) back into week-2+ generation so each new plan improves on the last.

**Architecture:** Four independent wires, each touching one generation entry point. (1) Expand `getWorkoutFeedbackContext()` to include per-exercise weight history and rep completion, then surface it in `createWorkoutPlanningPrompt`. (2) Build `getMealFeedbackContext()` mirroring the workout pattern, wire it into `generateHomeMealsParallel`. (3) Verify/add weight input UI on the workout page so `weightUsedLbs` is actually populated by users. (4) Add exercise library query to workout Phase 1 planning so GPT picks from real exercises rather than hallucinating.

**Tech Stack:** Next.js 14 App Router, Prisma ORM, TypeScript, OpenAI gpt-4o, Tailwind CSS

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/app/api/ai/workouts/generate/route.ts` | Modify | Expand `getWorkoutFeedbackContext()` — add weight history + rep completion query; add exercise library query before Phase 1 |
| `src/lib/ai/prompts/workout-generation.ts` | Modify | Expand `WorkoutFeedbackContext` interface; add weight progression block to `createWorkoutPlanningPrompt` feedbackBlock |
| `src/app/api/ai/meals/generate-home/route.ts` | Modify | Add `getMealFeedbackContext()` function; pass result into `generateHomeMealsParallel` and `generateHomeMealsLegacy` |
| `src/lib/ai/prompts/meal-generation.ts` | Modify | Add meal feedback block to `createPlanningPrompt` (parallel path) and `createHomeMealGenerationPrompt` (legacy path) |
| `src/components/dashboard/WorkoutPlanPage.tsx` | Modify (if needed) | Ensure weight input per exercise is present and calls log-exercise route with `weightUsedLbs` |

---

## Task 1: Expand `WorkoutFeedbackContext` to include weight history

**Files:**
- Modify: `src/lib/ai/prompts/workout-generation.ts`

The current interface has 5 fields. We add `weightProgressionByExercise` (map of exercise name → last weight used) and `repCompletionByExercise` (map of exercise name → last reps array).

- [ ] **Step 1: Update the interface**

In `src/lib/ai/prompts/workout-generation.ts`, replace the `WorkoutFeedbackContext` interface (lines 69–75):

```typescript
export interface WorkoutFeedbackContext {
  poorlyRatedExercises: string[];
  wellRatedExercises: string[];
  completionRateByDay: Record<string, number>;
  savedCustomExercises: string[];
  favoriteExercises: string[];
  // NEW: per-exercise weight and rep history for progressive overload
  weightProgressionByExercise: Record<string, { lastWeightLbs: number; suggestedWeightLbs: number }>;
  repCompletionByExercise: Record<string, number[]>; // last reps array per exercise
}
```

- [ ] **Step 2: Expand the feedbackBlock in `createWorkoutPlanningPrompt`**

In `src/lib/ai/prompts/workout-generation.ts`, find `createWorkoutPlanningPrompt` (the new function added in the previous session). It currently doesn't reference feedbackContext. Add a `feedbackContext?: WorkoutFeedbackContext` parameter and append a progression block. Replace the function signature and return statement:

```typescript
export const createWorkoutPlanningPrompt = (
  surveyData: SurveyResponse,
  workoutPrefs: WorkoutPreferences,
  feedbackContext?: WorkoutFeedbackContext
): string => {
```

Then at the end of the return string, before the closing backtick, append:

```typescript
${feedbackContext ? `

PAST PERFORMANCE DATA (use this to improve the plan):
${feedbackContext.poorlyRatedExercises.length > 0 ? `- Avoid or substitute (rated too hard): ${feedbackContext.poorlyRatedExercises.slice(0, 8).join(', ')}` : ''}
${feedbackContext.wellRatedExercises.length > 0 ? `- Include variations of (rated great form): ${feedbackContext.wellRatedExercises.slice(0, 8).join(', ')}` : ''}
${Object.keys(feedbackContext.completionRateByDay).length > 0 ? `- Completion by day: ${Object.entries(feedbackContext.completionRateByDay).map(([d, r]) => `${d} ${r}%`).join(', ')} — reduce volume on low-completion days` : ''}
${Object.keys(feedbackContext.weightProgressionByExercise).length > 0 ? `- Weight progression targets this week:\n${Object.entries(feedbackContext.weightProgressionByExercise).slice(0, 10).map(([ex, w]) => `  * ${ex}: last used ${w.lastWeightLbs} lbs → suggest ${w.suggestedWeightLbs} lbs`).join('\n')}` : ''}
${feedbackContext.favoriteExercises.length > 0 ? `- Favourite exercises (include progressions): ${feedbackContext.favoriteExercises.slice(0, 8).join(', ')}` : ''}` : ''}
```

- [ ] **Step 3: Also expand the feedbackBlock in the legacy `createWorkoutPlanPrompt`**

The existing `createWorkoutPlanPrompt` function already has a `feedbackBlock` variable (around line 336). After line 347 (end of the feedbackBlock template literal), add weight progression to the existing template:

```typescript
  ) ? `\n\nPAST WORKOUT FEEDBACK (use this to improve the plan):
${feedbackContext.poorlyRatedExercises.length > 0 ? `- Exercises rated poorly — avoid or substitute: ${feedbackContext.poorlyRatedExercises.slice(0, 10).join(', ')}` : ''}
${feedbackContext.wellRatedExercises.length > 0 ? `- Exercises rated well — include variations: ${feedbackContext.wellRatedExercises.slice(0, 10).join(', ')}` : ''}
${Object.keys(feedbackContext.completionRateByDay).length > 0 ? `- Completion rate by day: ${Object.entries(feedbackContext.completionRateByDay).map(([d, r]) => `${d} ${r}%`).join(', ')} — reduce volume on low-completion days` : ''}
${feedbackContext.savedCustomExercises.length > 0 ? `- User's saved exercises (reference their style): ${feedbackContext.savedCustomExercises.slice(0, 10).join(', ')}` : ''}
${feedbackContext.favoriteExercises.length > 0 ? `- User's favourite exercises — include variations or progressions: ${feedbackContext.favoriteExercises.slice(0, 10).join(', ')}` : ''}
${Object.keys(feedbackContext.weightProgressionByExercise).length > 0 ? `- Progressive overload targets:\n${Object.entries(feedbackContext.weightProgressionByExercise).slice(0, 10).map(([ex, w]) => `  * ${ex}: last ${w.lastWeightLbs} lbs → suggest ${w.suggestedWeightLbs} lbs`).join('\n')}` : ''}` : '';
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
npx tsc --noEmit 2>&1 | grep "workout-generation\|workout.*generate"
```

Expected: no output (no errors in these files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompts/workout-generation.ts
git commit -m "feat: expand WorkoutFeedbackContext with weight progression and rep history"
```

---

## Task 2: Query weight history in `getWorkoutFeedbackContext()`

**Files:**
- Modify: `src/app/api/ai/workouts/generate/route.ts`

The current function queries `exerciseLogs` but only selects `exerciseName`, `difficultyRating`, `formRating` — it ignores `weightUsedLbs`, `weightUsed[]`, and `repsCompleted[]`.

- [ ] **Step 1: Expand the exerciseLogs select to include weight and rep fields**

In `getWorkoutFeedbackContext()`, change the `prisma.workoutExerciseLog.findMany` call:

```typescript
const [exerciseLogs, workoutLogs, customWorkouts, favoritesRaw] = await Promise.all([
  prisma.workoutExerciseLog.findMany({
    where: { workoutLog: { userId: userId || undefined } },
    select: {
      exerciseName: true,
      difficultyRating: true,
      formRating: true,
      weightUsedLbs: true,   // NEW
      weightUsed: true,      // NEW (array of per-set weights)
      repsCompleted: true,   // NEW
      setsCompleted: true,   // NEW
    },
    take: 200,               // increased from 100
    orderBy: { createdAt: 'desc' },
  }),
  // ... rest unchanged
```

- [ ] **Step 2: Build the weightProgressionByExercise map after the existing logic**

After the existing `const favoriteNames = ...` line, add:

```typescript
  // Build per-exercise weight progression
  // Group by exercise name, take most recent log per exercise
  const exerciseWeightMap = new Map<string, { lastWeightLbs: number; suggestedWeightLbs: number }>();
  const seenExercises = new Set<string>();

  for (const log of exerciseLogs) {
    if (!log.exerciseName || seenExercises.has(log.exerciseName)) continue;
    seenExercises.add(log.exerciseName);

    // Prefer the scalar weightUsedLbs field; fall back to last element of weightUsed array
    const lastWeight = log.weightUsedLbs
      ?? (log.weightUsed?.length ? log.weightUsed[log.weightUsed.length - 1] : null);

    if (lastWeight && lastWeight > 0) {
      // Progressive overload: suggest 2.5–5% increase, rounded to nearest 2.5 lbs
      const increase = lastWeight < 50 ? 2.5 : lastWeight < 100 ? 5 : 10;
      const suggested = Math.round((lastWeight + increase) / 2.5) * 2.5;
      exerciseWeightMap.set(log.exerciseName, {
        lastWeightLbs: lastWeight,
        suggestedWeightLbs: suggested,
      });
    }
  }

  // Build per-exercise rep completion (most recent session per exercise)
  const exerciseRepMap = new Map<string, number[]>();
  const seenForReps = new Set<string>();
  for (const log of exerciseLogs) {
    if (!log.exerciseName || seenForReps.has(log.exerciseName)) continue;
    seenForReps.add(log.exerciseName);
    if (log.repsCompleted?.length) {
      exerciseRepMap.set(log.exerciseName, log.repsCompleted);
    }
  }

  const weightProgressionByExercise = Object.fromEntries(exerciseWeightMap);
  const repCompletionByExercise = Object.fromEntries(exerciseRepMap);
```

- [ ] **Step 3: Add the new fields to the return object**

Find the return statement at the bottom of `getWorkoutFeedbackContext()` and add the two new fields:

```typescript
  return {
    poorlyRatedExercises: [...new Set(poor)].slice(0, 10),
    wellRatedExercises: [...new Set(good)].slice(0, 10),
    completionRateByDay,
    savedCustomExercises: [...new Set(savedNames)].slice(0, 10),
    favoriteExercises: [...new Set(favoriteNames)].slice(0, 10),
    weightProgressionByExercise,   // NEW
    repCompletionByExercise,       // NEW
  };
```

- [ ] **Step 4: Pass feedbackContext into `createWorkoutPlanningPrompt`**

In `planWorkout()` function in the same file, find the call to `createWorkoutPlanningPrompt(surveyData, workoutPrefs)` and update it to pass `feedbackContext`. Since `planWorkout` doesn't currently receive `feedbackContext`, thread it through:

```typescript
// Change planWorkout signature:
async function planWorkout(
  surveyData: any,
  workoutPrefs: WorkoutPreferences,
  feedbackContext?: WorkoutFeedbackContext
): Promise<any> {
  console.log('[GPT-WORKOUT] 📋 Phase 1: Planning workout structure...');
  const planningPrompt = createWorkoutPlanningPrompt(surveyData, workoutPrefs, feedbackContext);
  // ... rest unchanged
```

Then in `generateWorkoutPlan()`, update the call:

```typescript
  // Phase 1: Get high-level plan outline
  const planResult = await planWorkout(surveyData, workoutPrefs, feedbackContext);
```

And move `feedbackContext` retrieval before `planWorkout` is called (it already is — `getWorkoutFeedbackContext` is called at the top of `generateWorkoutPlan`). Verify the order in the function.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "workout.*generate\|generate.*workout"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/workouts/generate/route.ts
git commit -m "feat: query weight history and rep completion in getWorkoutFeedbackContext for progressive overload"
```

---

## Task 3: Build `getMealFeedbackContext()` and wire into meal generation

**Files:**
- Modify: `src/app/api/ai/meals/generate-home/route.ts`
- Modify: `src/lib/ai/prompts/meal-generation.ts`

- [ ] **Step 1: Add the `getMealFeedbackContext` function**

In `src/app/api/ai/meals/generate-home/route.ts`, add this function before `generateHomeMealsForSchedule`:

```typescript
interface MealFeedbackContext {
  lovedDishes: string[];           // dishName where feedbackType === 'loved'
  dislikedDishes: string[];        // dishName where feedbackType === 'disliked'
  lovedCuisines: string[];         // inferred from loved dish patterns
  skippedMealTypes: string[];      // mealType where wasEaten === false most often
  preferredOptionType: 'primary' | 'alternative' | 'mixed'; // which option user usually picks
  avgCalorieAdherence: number;     // 0-100, how close to targets they eat
}

async function getMealFeedbackContext(surveyData: any): Promise<MealFeedbackContext | null> {
  const userId = surveyData.userId || null;
  const sessionId = surveyData.sessionId || null;
  const surveyId = surveyData.id || null;

  if (!userId && !sessionId && !surveyId) return null;

  const orFilter = [
    ...(userId ? [{ userId }] : []),
    ...(sessionId ? [{ sessionId }] : []),
    ...(surveyId ? [{ surveyId }] : []),
  ];

  if (orFilter.length === 0) return null;

  const [feedbackLogs, consumptionLogs] = await Promise.all([
    prisma.mealFeedbackLog.findMany({
      where: { OR: orFilter },
      select: { feedbackType: true, dishName: true, mealType: true, rating: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.mealConsumptionLog.findMany({
      where: { OR: orFilter },
      select: { wasEaten: true, mealType: true, optionType: true, calories: true },
      orderBy: { loggedAt: 'desc' },
      take: 100,
    }),
  ]);

  if (feedbackLogs.length === 0 && consumptionLogs.length === 0) return null;

  const lovedDishes = [...new Set(
    feedbackLogs.filter(f => f.feedbackType === 'loved').map(f => f.dishName)
  )].slice(0, 10);

  const dislikedDishes = [...new Set(
    feedbackLogs.filter(f => f.feedbackType === 'disliked').map(f => f.dishName)
  )].slice(0, 10);

  // Count skipped meal types (wasEaten=false)
  const skipCounts: Record<string, number> = {};
  const totalCounts: Record<string, number> = {};
  consumptionLogs.forEach(l => {
    if (!l.mealType) return;
    totalCounts[l.mealType] = (totalCounts[l.mealType] || 0) + 1;
    if (!l.wasEaten) skipCounts[l.mealType] = (skipCounts[l.mealType] || 0) + 1;
  });
  const skippedMealTypes = Object.entries(skipCounts)
    .filter(([type, count]) => count / (totalCounts[type] || 1) > 0.3) // skipped >30% of the time
    .map(([type]) => type);

  // Preferred option type
  const primCount = consumptionLogs.filter(l => l.optionType === 'primary' && l.wasEaten).length;
  const altCount = consumptionLogs.filter(l => l.optionType === 'alternative' && l.wasEaten).length;
  const preferredOptionType =
    primCount === 0 && altCount === 0 ? 'mixed' :
    altCount / (primCount + altCount) > 0.6 ? 'alternative' :
    primCount / (primCount + altCount) > 0.6 ? 'primary' : 'mixed';

  // Calorie adherence: compare logged calories vs. a rough 600-cal-per-meal target
  const eatenLogs = consumptionLogs.filter(l => l.wasEaten && l.calories > 0);
  const avgCalorieAdherence = eatenLogs.length > 0
    ? Math.min(100, Math.round(
        eatenLogs.reduce((sum, l) => sum + Math.min(l.calories / 600, 1), 0) / eatenLogs.length * 100
      ))
    : 100;

  return {
    lovedDishes,
    dislikedDishes,
    lovedCuisines: [], // future: infer from dish names
    skippedMealTypes,
    preferredOptionType,
    avgCalorieAdherence,
  };
}
```

- [ ] **Step 2: Add the meal feedback block to `createPlanningPrompt` in meal-generation.ts**

In `src/lib/ai/prompts/meal-generation.ts`, add an optional `feedbackContext` param to `createPlanningPrompt`:

```typescript
export interface MealFeedbackContext {
  lovedDishes: string[];
  dislikedDishes: string[];
  lovedCuisines: string[];
  skippedMealTypes: string[];
  preferredOptionType: 'primary' | 'alternative' | 'mixed';
  avgCalorieAdherence: number;
}

export function createPlanningPrompt(
  context: MealGenerationContext,
  feedbackContext?: MealFeedbackContext
): string {
```

Then append a feedback block to the end of the return string (before the closing backtick):

```typescript
${feedbackContext ? `

PAST MEAL BEHAVIOR (use this to improve variety and adherence):
${feedbackContext.lovedDishes.length > 0 ? `- LOVED dishes — include similar meals or these proteins/flavors again: ${feedbackContext.lovedDishes.join(', ')}` : ''}
${feedbackContext.dislikedDishes.length > 0 ? `- DISLIKED dishes — do NOT repeat these or similar variations: ${feedbackContext.dislikedDishes.join(', ')}` : ''}
${feedbackContext.skippedMealTypes.length > 0 ? `- Often skipped: ${feedbackContext.skippedMealTypes.join(', ')} — keep these slots simpler, quicker, or smaller` : ''}
${feedbackContext.preferredOptionType !== 'mixed' ? `- User usually picks the ${feedbackContext.preferredOptionType} option — make that option stronger` : ''}
${feedbackContext.avgCalorieAdherence < 80 ? `- User eats below calorie targets — consider slightly smaller portions or simpler meals` : ''}` : ''}
```

- [ ] **Step 3: Also add feedback to `createHomeMealGenerationPrompt` (legacy path)**

At the bottom of `createHomeMealGenerationPrompt` in `meal-generation.ts`, before the final `GROCERY LIST RULES:` section, add:

```typescript
${feedbackContext ? `
PAST MEAL BEHAVIOR (incorporate into this week's plan):
${feedbackContext.lovedDishes.length > 0 ? `- Include similar meals to these loved dishes: ${feedbackContext.lovedDishes.join(', ')}` : ''}
${feedbackContext.dislikedDishes.length > 0 ? `- NEVER repeat or closely imitate these disliked dishes: ${feedbackContext.dislikedDishes.join(', ')}` : ''}
${feedbackContext.skippedMealTypes.length > 0 ? `- Keep ${feedbackContext.skippedMealTypes.join(' and ')} meals simple — user often skips them` : ''}

` : ''}
```

Update the function signature:
```typescript
export function createHomeMealGenerationPrompt(
  context: MealGenerationContext,
  feedbackContext?: MealFeedbackContext
): string {
```

- [ ] **Step 4: Wire `getMealFeedbackContext` into `generateHomeMealsParallel`**

In `generate-home/route.ts`, update `generateHomeMealsParallel` to accept and use feedbackContext:

```typescript
async function generateHomeMealsParallel(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any,
  feedbackContext?: any   // MealFeedbackContext | null
): Promise<any> {
```

Then in `planWeekMeals`, pass feedbackContext through to `createPlanningPrompt`:

```typescript
  const planningPrompt = createPlanningPrompt({
    homeMeals,
    surveyData,
    nutritionTargets,
    scheduleText,
    weeklyNutritionTargets
  }, feedbackContext ?? undefined);
```

- [ ] **Step 5: Fetch feedbackContext in `generateHomeMealsForSchedule` and pass it down**

In `generateHomeMealsForSchedule`:

```typescript
async function generateHomeMealsForSchedule(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any
): Promise<any> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS-7DAY] 🏠 Generating ${homeMeals.length} home meals...`);

  // Fetch behavioral feedback to improve generation
  const feedbackContext = await getMealFeedbackContext(surveyData);
  if (feedbackContext) {
    console.log(`[HOME-MEALS-7DAY] 📊 Meal feedback context: ${feedbackContext.lovedDishes.length} loved, ${feedbackContext.dislikedDishes.length} disliked, skipped: ${feedbackContext.skippedMealTypes.join(', ') || 'none'}`);
  }

  try {
    const result = await generateHomeMealsParallel(
      homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext
    );
    // ... rest unchanged
```

Also pass to legacy path:
```typescript
    return await generateHomeMealsLegacy(
      homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext
    );
```

Update `generateHomeMealsLegacy` signature similarly and pass feedbackContext into `createHomeMealGenerationPrompt`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "generate-home\|meal-generation"
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ai/meals/generate-home/route.ts src/lib/ai/prompts/meal-generation.ts
git commit -m "feat: add getMealFeedbackContext and wire loved/disliked/skipped signals into meal generation"
```

---

## Task 4: Verify weight input UI exists on workout page

**Files:**
- Read: `src/components/dashboard/WorkoutPlanPage.tsx`
- Modify (if needed): same file

The goal is to confirm users can actually enter the weight they used for each exercise, which populates `weightUsedLbs` in `WorkoutExerciseLog` — the data Task 2 now reads.

- [ ] **Step 1: Check if weight input exists**

```bash
grep -n "weightUsedLbs\|weight.*input\|Input.*weight\|logWeight\|log-exercise" \
  /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop/src/components/dashboard/WorkoutPlanPage.tsx | head -20
```

If `weightUsedLbs` appears in a POST body or form state — the input exists, skip to Step 5.

If it does NOT appear, continue to Step 2.

- [ ] **Step 2 (if needed): Find the exercise completion handler**

```bash
grep -n "handleCompleteExercise\|markExerciseDone\|logExercise\|log-exercise" \
  /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop/src/components/dashboard/WorkoutPlanPage.tsx | head -20
```

Note the function name and line number.

- [ ] **Step 3 (if needed): Add weight state per exercise**

Find where exercise completion state is tracked (likely a `Record<string, boolean>` or similar). Add a parallel weight state:

```typescript
const [exerciseWeights, setExerciseWeights] = useState<Record<string, string>>({});
```

- [ ] **Step 4 (if needed): Add weight input in exercise card UI**

Find the exercise card render. Add a weight input below the sets/reps display:

```tsx
<div className="flex items-center gap-2 mt-2">
  <input
    type="number"
    min="0"
    step="2.5"
    placeholder="Weight (lbs)"
    className="w-28 px-2 py-1 text-sm border rounded-md"
    value={exerciseWeights[exercise.name] || ''}
    onChange={(e) => setExerciseWeights(prev => ({
      ...prev,
      [exercise.name]: e.target.value
    }))}
  />
  <span className="text-xs text-gray-500">lbs</span>
</div>
```

Then in the exercise log POST call, include the weight:

```typescript
body: JSON.stringify({
  // ... existing fields
  weightUsedLbs: exerciseWeights[exercise.name]
    ? parseFloat(exerciseWeights[exercise.name])
    : undefined,
})
```

- [ ] **Step 5: Verify the log-exercise route accepts and saves weightUsedLbs**

```bash
grep -n "weightUsedLbs" \
  /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop/src/app/api/workouts/log-exercise/route.ts
```

Expected: should appear in both the request destructure and the `prisma.workoutExerciseLog` write. If not, add it.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/WorkoutPlanPage.tsx
git commit -m "feat: add weight input per exercise so weightUsedLbs is captured for progressive overload"
```

---

## Task 5: Add exercise library context to workout Phase 1 planning

**Files:**
- Modify: `src/app/api/ai/workouts/generate/route.ts`
- Modify: `src/lib/ai/prompts/workout-generation.ts`

Pass a filtered list of library exercises to the planning prompt so GPT picks real, curated exercises rather than hallucinating.

- [ ] **Step 1: Add library query before `planWorkout` in `generateWorkoutPlan`**

In `generateWorkoutPlan()`, before the `const planResult = await planWorkout(...)` call, add:

```typescript
  // Query exercise library filtered by user's equipment and fitness level
  const gymAccess = workoutPrefs.gymAccess || 'no_gym';
  const fitnessLevel = surveyData.fitnessLevel || workoutPrefs.fitnessExperience || 'intermediate';

  const equipmentFilter: Record<string, string[]> = {
    no_gym: ['bodyweight'],
    calisthenics: ['bodyweight'],
    free_weights: ['bodyweight', 'dumbbells', 'barbell', 'kettlebell'],
    full_gym: [], // no filter — all equipment
  };
  const allowedEquipment = equipmentFilter[gymAccess] || [];

  const libraryExercises = await prisma.exerciseLibrary.findMany({
    where: {
      ...(allowedEquipment.length > 0
        ? { equipmentType: { in: allowedEquipment } }
        : {}),
      difficulty: fitnessLevel === 'beginner' ? { in: ['beginner', 'intermediate'] } : undefined,
    },
    select: {
      name: true,
      muscleGroup: true,
      equipmentType: true,
      defaultSets: true,
      defaultReps: true,
      difficulty: true,
      weightGuidance: true,
    },
    take: 60,
    orderBy: { name: 'asc' },
  }).catch(() => []); // graceful fallback if library is empty

  console.log(`[GPT-WORKOUT] 📚 Exercise library: ${libraryExercises.length} exercises available for ${gymAccess}`);
```

- [ ] **Step 2: Pass library to `planWorkout`**

Update `planWorkout` signature:

```typescript
async function planWorkout(
  surveyData: any,
  workoutPrefs: WorkoutPreferences,
  feedbackContext?: WorkoutFeedbackContext,
  libraryExercises?: Array<{
    name: string;
    muscleGroup: string | null;
    equipmentType: string | null;
    defaultSets: number | null;
    defaultReps: string | null;
    difficulty: string | null;
    weightGuidance: string | null;
  }>
): Promise<any> {
  const planningPrompt = createWorkoutPlanningPrompt(
    surveyData, workoutPrefs, feedbackContext, libraryExercises
  );
```

And in `generateWorkoutPlan`, update the call:

```typescript
  const planResult = await planWorkout(
    surveyData, workoutPrefs, feedbackContext, libraryExercises
  );
```

- [ ] **Step 3: Add library context block to `createWorkoutPlanningPrompt`**

Update the function signature in `workout-generation.ts`:

```typescript
export const createWorkoutPlanningPrompt = (
  surveyData: SurveyResponse,
  workoutPrefs: WorkoutPreferences,
  feedbackContext?: WorkoutFeedbackContext,
  libraryExercises?: Array<{
    name: string;
    muscleGroup: string | null;
    equipmentType: string | null;
    defaultSets: number | null;
    defaultReps: string | null;
    difficulty: string | null;
    weightGuidance: string | null;
  }>
): string => {
```

In the return string, add a library block between the USER PROFILE section and the REQUIREMENTS section:

```typescript
${libraryExercises && libraryExercises.length > 0 ? `
AVAILABLE EXERCISE LIBRARY (prefer these exercises when planning — they are curated for this user's equipment):
${libraryExercises.map(e =>
  `- ${e.name} | muscles: ${e.muscleGroup || 'general'} | equipment: ${e.equipmentType || 'bodyweight'} | sets: ${e.defaultSets || 3} | reps: ${e.defaultReps || '8-12'} | difficulty: ${e.difficulty || 'intermediate'}`
).join('\n')}

When selecting exercises for each day, PREFER exercises from this library. You may add exercises not in the library if the library lacks coverage for a muscle group.
` : ''}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "workout.*generate\|workout-generation"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/workouts/generate/route.ts src/lib/ai/prompts/workout-generation.ts
git commit -m "feat: pass exercise library context to workout planning prompt for curated exercise selection"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Weight history queried and passed to generation (Task 2)
- ✅ Progressive overload suggestion calculated (Task 2, +2.5–10 lbs formula)
- ✅ Rep completion queried (Task 2)
- ✅ Weight input UI verified/added (Task 4)
- ✅ Meal feedback context built (Task 3)
- ✅ Loved/disliked/skipped signals wired into planning prompt (Task 3)
- ✅ Exercise library used during generation (Task 5)
- ✅ All signals passed to both parallel and legacy generation paths (Task 3)

**Placeholder scan:** No TBDs or "implement later" found. All code blocks are complete.

**Type consistency check:**
- `WorkoutFeedbackContext` extended in Task 1, queried in Task 2, consumed in prompt in Task 1 ✅
- `MealFeedbackContext` defined in Task 3 in both route file (as local interface) and prompt file (as exported interface) — these must match. The route file's local interface should be removed and it should import from `meal-generation.ts` instead. Fix: in `generate-home/route.ts`, remove the local `MealFeedbackContext` interface declaration and add to imports:

```typescript
import { createHomeMealGenerationPrompt, createPlanningPrompt, createDetailPrompt, createGroceryPrompt, type MealFeedbackContext } from '@/lib/ai/prompts';
```

- `planWeekMeals` is called from `generateHomeMealsParallel` but doesn't currently accept feedbackContext — Task 3 Step 4 threads it through `generateHomeMealsParallel` → `planWeekMeals` → `createPlanningPrompt`. Make sure `planWeekMeals` signature is also updated to accept `feedbackContext?: MealFeedbackContext | null`.
