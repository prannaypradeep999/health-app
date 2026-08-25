# Generation Silent-Wrongness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the S2/S3 findings — the ones where the app produces an answer that looks complete and correct and is neither — across home meals, restaurants, groceries, workouts, recipes, images, and the project's own stale documentation.

**Architecture:** Three kinds of change, applied surface by surface. **Wire up detection that already exists** — four validators are written, tested by hand, and either never called or called with the result thrown away. **Make incompleteness visible** — every path that currently degrades to a silent skip gains a field in the response that says so. **Constrain what strict mode cannot** — value bounds, canonical keys, and post-hoc checks on numbers the grammar happily accepts because they are the right *type*.

**Tech Stack:** TypeScript, Next.js 16 App Router, Zod 3.25, Prisma 6, `node:test` via `npx tsx --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-generation-correctness-audit.md`

**Depends on:**
- **Plan 1** (`2026-08-24-generation-eval-harness.md`) — the four-family scorer. Several tasks here are verified by "this eval number went up," which requires the baseline Plan 1 captures. Nothing in this plan can be shown to have worked without it.
- **Plan 2** (`2026-08-24-generation-safety-fixes.md`) — Task 11 here revisits B3, which lives in `src/lib/ai/prompts/restaurant-menu.ts` that Plan 2 Task 5 creates. Tasks 9 and 10 build on `src/lib/external/link-check.ts` and on the rewritten `restriction-validator.ts` from Plan 2. Executing this plan first will fail at those imports.

---

## Global Constraints

Copied verbatim from Plan 2. They have not changed and they are not optional.

- **No new npm dependencies.** Node 24's `node:test`, `node:assert/strict` and `node:crypto` are the whole toolkit.
- **`DATABASE_URL` is production data.** No task in this plan requires a schema migration. If you believe one does, stop and ask — do not run `prisma migrate dev`, `prisma db push`, or the seed script.
- **Test command:** `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"` — the globs must be quoted or zsh expands them and fails with `no matches found`.
- **`npx tsc --noEmit` bar is *no new* errors.** The repo has ~32 pre-existing ones. Record the count before you start; compare after every task. Do not fix pre-existing errors incidentally.
- **`next build` proves nothing.** `ignoreBuildErrors` is on. It will build broken TypeScript without complaint.
- **Every new pure function gets a `node:test` file.** Functions that are three I/O calls in a trenchcoat do not — say so explicitly in the task instead of writing a test that asserts a mock was called.
- **Tolerances are copied, never re-derived.** `ingredient-validator.ts` warns above 10% and errors above 20%. `meal-plan-validator.ts` warns above 10% and errors above 15%, with a separate 8%/10% pair for daily totals. If a task needs a threshold, it names which existing one it is reusing.
- **One task, one commit.**

## Findings closed

| Task | Findings | Surface |
|---|---|---|
| 1 | A6 | Home meals — the validator reads a field that does not exist |
| 2 | A1, A5 | Home meals — wire the validators into the live path |
| 3 | A3 | Home meals — `isUsableMeal` checks the wrong field |
| 4 | A2, A4, A10 | Home meals — signal incompleteness instead of logging it |
| 5 | A7, A8 | Home meals — per-day targets and budget accumulation |
| 6 | A9, A11 | Home meals — exclusions reach planning; usable fallback list |
| 7 | A12 | Home meals — grocery price lookup survives the response |
| 8 | B7, B9, B10 | Restaurants — invented restaurants, distance |
| 9 | B5 | Restaurants — use the citations we already capture |
| 10 | B13, B14 | Restaurants — surface real numbers, surface violations |
| 11 | B3 | Restaurants — structure the Sonar menu search |
| 12 | C4, C3 | Groceries — canonical store keys, comparable baskets |
| 13 | C5, C6 | Groceries — honest success flag, bounded chunks |
| 14 | C9, C10, C11 | Groceries — renames, spread order, price bounds |
| 15 | C1, C2 | Groceries — price provenance |
| 16 | D1, D2, D4 | Workouts — pin the week, act on the validator we already run |
| 17 | D3, D5, D6, D7 | Workouts — NaN, RPE bounds, outline-versus-detail, the reducer |
| 18 | D9 | Workouts — stop inventing a training schedule |
| 19 | E3 | Recipes — per-serving versus whole-recipe |
| 20 | F1, F2 | Images — fallback TTL and dead URLs |
| 21 | G1, G2 | Docs — `CLAUDE.md` and `AUDIT-RESULTS.md` |

---

## Section A — Home meals

### Task 1: Make validateMealPlan read the field the meal actually has

**Finding:** A6. The validator reads nutrition off the envelope:

```typescript
      const calories = meal.calories ?? meal.estimatedCalories ?? 0;
      ...
      const protein = meal.protein || 0;
      const carbs = meal.carbs || meal.carbohydrates || 0;
      const fat = meal.fat || 0;
```

`MealSlot` in `src/lib/ai/schemas/shared.ts` is `{ day, mealType, primary, alternative }`. There is no `calories` on the envelope and there never was — the nutrition lives on `primary` and `alternative`, which are `MealObject`s. So `calories` is `0` for every meal, every deviation is 100%, and every meal trips both the `>15% off target` error and the `< 150 cal` error.

**This task must land before Task 2.** Wiring a validator that scores every meal as zero into the live path turns a silent problem into a loud wrong one. The audit calls this ordering load-bearing.

**Files:**
- Modify: `src/lib/utils/meal-plan-validator.ts`
- Test: `src/lib/utils/meal-plan-validator.test.ts` (create)

**Interfaces:**
- Consumes: nothing new
- Produces: `validateMealPlan(meals, weeklyTargets) → ValidationResult` — signature unchanged. Only where it reads from changes.

**Design note.** Keep the envelope fallback. The legacy path at `generate-home/route.ts:624` passes a differently-shaped object, and this task is not the place to find out which. Read the option first, fall back to the envelope, so both callers work.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/meal-plan-validator.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMealPlan } from './meal-plan-validator';

const option = (calories: number, protein: number, carbs: number, fat: number) => ({
  name: 'Test dish',
  description: '',
  estimatedCalories: calories,
  protein,
  carbs,
  fat,
  prepTime: '10 min',
  cookTime: '10 min',
  difficulty: 'easy',
  cuisine: 'any',
  ingredientsWithNutrition: [],
  ingredients: ['a'],
  instructions: ['b'],
  tags: [],
  source: 'test',
});

const targets = {
  monday: {
    breakfast: { calories: 500, protein: 30, carbs: 50, fat: 15 },
    dailyTotals: { calories: 500 },
  },
};

test('reads nutrition from the primary option, not the envelope', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(500, 30, 50, 15), alternative: option(500, 30, 50, 15) }];
  const result = validateMealPlan(meals, targets);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('a meal 30% off target is an error', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(650, 40, 65, 20), alternative: option(650, 40, 65, 20) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('off target')));
});

test('the day total is compared against dailyTotals', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(500, 30, 50, 15), alternative: option(500, 30, 50, 15) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.dailySummaries[0].totalCalories, 500);
  assert.equal(result.dailySummaries[0].targetCalories, 500);
});

test('an envelope-shaped meal still validates — the legacy path passes one', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', calories: 500, protein: 30, carbs: 50, fat: 15, recipeName: 'Legacy' }];
  const result = validateMealPlan(meals, targets);
  assert.deepEqual(result.errors, []);
});

test('a hollow meal is an error, not a pass', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(0, 0, 0, 0), alternative: option(0, 0, 0, 0) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.valid, false);
});

test('the meal name comes from the primary option', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: { ...option(500, 30, 50, 15), name: 'Shakshuka' }, alternative: option(500, 30, 50, 15) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.dailySummaries[0].meals[0].name, 'Shakshuka');
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx tsx --test src/lib/utils/meal-plan-validator.test.ts
```

Expected: the first, second, third and sixth tests FAIL. "reads nutrition from the primary option" fails with errors about being 100% off target and under 150 cal — which is exactly the production behaviour A6 describes, now visible in a test. The envelope test passes already; that is the fallback you must not break.

- [ ] **Step 3: Read from the option**

In `src/lib/utils/meal-plan-validator.ts`, inside the `dayMeals.forEach(meal => {` block, replace:

```typescript
      const mealType = meal.mealType?.toLowerCase();
      const mealName = meal.recipeName || meal.dishName || 'Unnamed meal';
      const calories = meal.calories ?? meal.estimatedCalories ?? 0;
```

with:

```typescript
      const mealType = meal.mealType?.toLowerCase();

      // A MealSlot is { day, mealType, primary, alternative } — the nutrition
      // lives on the option objects, not the envelope. This function read
      // `meal.calories` and therefore scored every slot at 0 kcal, which made
      // every meal simultaneously 100% off target and below the 150 cal floor.
      // The envelope read stays as a fallback because the legacy path in
      // generate-home/route.ts passes a flattened shape.
      const option = meal.primary ?? meal;
      const mealName = option.name || meal.recipeName || meal.dishName || 'Unnamed meal';
      const calories = option.estimatedCalories ?? option.calories ?? meal.calories ?? 0;
```

and replace the macro reads further down:

```typescript
      const protein = meal.protein || 0;
      const carbs = meal.carbs || meal.carbohydrates || 0;
      const fat = meal.fat || 0;
```

with:

```typescript
      const protein = option.protein || 0;
      const carbs = option.carbs || option.carbohydrates || 0;
      const fat = option.fat || 0;
```

`option` is `meal` itself when there is no `primary`, so the envelope path reads the same fields it always did.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test src/lib/utils/meal-plan-validator.test.ts
```

Expected: all six PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/meal-plan-validator.ts src/lib/utils/meal-plan-validator.test.ts
git commit -m "fix(validation): read meal nutrition from the option, not the envelope

A6. validateMealPlan read meal.calories, but a MealSlot carries nutrition on
primary/alternative and has no envelope-level calories — so every meal scored 0
and tripped both the off-target error and the 150 cal floor. Nothing noticed
because the function is not on the live path. Task 2 puts it there, and doing
that first would have made it reject every plan."
```

---

### Task 2: Run the validators on the path production actually uses

**Findings:** A1 and A5.

**A1.** `generateHomeMealsParallel` (`generate-home/route.ts:1143`) is what `:441` calls. Every `validateMealPlan` / `validateIngredientSums` / `validateRestrictions` call site — `:624`, `:654`, `:670`, `:744` — is inside `generateHomeMealsLegacy`, reached only at `:449` when the parallel path throws. Four validators, hundreds of lines, dead in practice.

**A5.** "No day-total-versus-target check anywhere." `validateMealPlan` does exactly that in its fourth block — `dayTargets.dailyTotals?.calories`, erroring above 10% deviation and warning above 8%. The check is written. It has never run. **A5 is closed by A1, not by new arithmetic**, which is worth knowing before you write any.

**Files:**
- Modify: `src/app/api/ai/meals/generate-home/route.ts` — inside `generateHomeMealsParallel`
- Test: none new (Task 1 covers the validator; this task is wiring, verified by a live run)

**Interfaces:**
- Consumes: `validateMealPlan` (Task 1), `validateIngredientSums` from `@/lib/utils/ingredient-validator`, `validateRestrictions` from `@/lib/utils/restriction-validator` (rewritten in Plan 2 Task 1) — all three already imported at the top of the route at `:7-9`
- Produces: a `validation` field on the object `generateHomeMealsParallel` returns. Task 4 puts it in the HTTP response.

**Scope discipline.** This task makes the validators *run and report*. It does not make them *block*. A plan that fails validation is still returned — the user asked for a week of meals and a flawed week beats an error page. What changes is that we, and Task 4's response field, now know.

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "Phase 3: Generate grocery list" src/app/api/ai/meals/generate-home/route.ts
```

You want the lines just *above* that, after the `if (allMeals.length === 0) { ... throw ... }` guard. At that point `allMeals` is final and the grocery phase has not started.

- [ ] **Step 2: Run all three validators**

Insert immediately before the `// Phase 3: Generate grocery list` comment:

```typescript
    // A1. These three validators were written, and every call site sat in
    // generateHomeMealsLegacy — the path that only runs when this one throws.
    // In practice nothing has ever validated a home meal plan. They report
    // rather than block: a flawed week is still a week, and the user asked for
    // one. What changes is that the response can now say so.
    const planValidation = validateMealPlan(allMeals, weeklyNutritionTargets?.days ?? {});

    const ingredientErrors: string[] = [];
    for (const meal of allMeals as any[]) {
      for (const option of [meal.primary, meal.alternative]) {
        if (!option) continue;
        const result = validateIngredientSums(option.name, {
          estimatedCalories: option.estimatedCalories,
          protein: option.protein,
          carbs: option.carbs,
          fat: option.fat,
          ingredientsWithNutrition: option.ingredientsWithNutrition,
        });
        result.errors.forEach((e) => ingredientErrors.push(`${meal.day} ${meal.mealType}: ${e}`));
      }
    }

    // validateRestrictions takes the survey's three restriction fields as an
    // OBJECT — `{ dietPrefs, strictExclusions, foodAllergies }` — not a flat
    // list. Check the signature in restriction-validator.ts before changing
    // this; a flat array type-errors.
    const userRestrictions = {
      dietPrefs: surveyData.dietPrefs ?? [],
      foodAllergies: surveyData.foodAllergies ?? [],
      strictExclusions: (surveyData.strictExclusions as Record<string, string[]> | null) ?? undefined,
    };
    const hasRestrictions =
      userRestrictions.dietPrefs.length > 0 ||
      userRestrictions.foodAllergies.length > 0 ||
      Object.values(userRestrictions.strictExclusions ?? {}).some((v) => v.length > 0);

    const restrictionResult = hasRestrictions
      ? validateRestrictions(
          (allMeals as any[]).flatMap((m) => [m.primary, m.alternative].filter(Boolean)),
          userRestrictions
        )
      : { valid: true, violations: [] as any[] };

    console.log(
      `[HOME-MEALS-7DAY] 🔎 Validation: ${planValidation.errors.length} plan error(s), ` +
      `${planValidation.warnings.length} warning(s), ${ingredientErrors.length} ingredient sum error(s), ` +
      `${restrictionResult.violations.length} restriction violation(s)`
    );
    ingredientErrors.forEach((e) => console.error(`[HOME-MEALS-7DAY] ❌ ${e}`));
```

No new imports are needed — `validateMealPlan`, `validateIngredientSums` and `validateRestrictions` are all already imported at `generate-home/route.ts:7-9` for the legacy path. Confirm:

```bash
sed -n '1,15p' src/app/api/ai/meals/generate-home/route.ts
```

**`validateRestrictions` here is the Plan 2 Task 1 rewrite** — word-boundary matching and the full diet list. If it is still the two-diet substring version, Plan 2 has not been executed and this task will report zero violations for a halal or coeliac user, which is the B12 bug wearing a new hat. Check for `normalizeRestriction` in that file before proceeding.

`validateRestrictions` is only called when the user has restrictions. Running it against an empty set would iterate every meal to prove nothing, inside a route that shares a 52-second deadline.

- [ ] **Step 3: Return the result**

`generateHomeMealsParallel` ends with a `return { homeMeals, groceryList, metadata: {...} }`. Add a fourth key:

```typescript
      validation: {
        planErrors: planValidation.errors,
        planWarnings: planValidation.warnings,
        ingredientErrors,
        restrictionViolations: restrictionResult.violations,
        dailySummaries: planValidation.dailySummaries,
      },
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "generate-home"
npx tsc --noEmit 2>&1 | grep -c "error TS"
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
```

Expected: no route errors, baseline count, all tests pass.

Then run a real generation:

```bash
npm run dev
```

Expected: a `🔎 Validation:` line appears in the log for the first time ever. **Non-zero counts are the expected outcome, not a failure of this task** — the audit's whole argument is that nothing has been checking. Record what you see; it is the first real measurement of home-meal correctness this repo has produced. If every count is zero on the first run, be suspicious: confirm `weeklyNutritionTargets?.days` is actually populated rather than `{}`, because an empty targets object makes `validateMealPlan` warn "No targets found" and return no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/meals/generate-home/route.ts
git commit -m "feat(meals): run the home-meal validators on the path production uses

A1, A5. All four validator call sites lived in generateHomeMealsLegacy, which
only runs when the parallel path throws — so no home meal plan has ever been
validated. They report rather than block; Task 4 puts the result in the
response. A5's day-total check turns out to be the fourth block of
validateMealPlan, so it is closed by wiring rather than by new arithmetic."
```

---

### Task 3: Make isUsableMeal check the field the grocery list reads

**Finding:** A3. `isUsableMeal` (`generate-home/route.ts:1232`) gates the detail top-up — a meal that fails it is dropped and retried. It tests:

```typescript
      return Number(o.estimatedCalories) > 0
        && Number(o.protein) > 0
        && Array.isArray(o.ingredients) && o.ingredients.length > 0
        && Array.isArray(o.instructions) && o.instructions.length > 0;
```

`MealObject` carries **both** `ingredients: z.array(z.string())` and `ingredientsWithNutrition: z.array(IngredientWithNutrition)`. The grocery consolidation downstream reads `ingredientsWithNutrition`. So a meal with a populated `ingredients` list and an empty `ingredientsWithNutrition` passes as usable, is never retried, and contributes nothing to the grocery list — the user gets a meal card with a recipe and a grocery list missing its ingredients.

It also checks only `opts[0]`. The comment says that is deliberate ("an empty alternative is a lesser problem"), and it is a defensible call for gating a *retry*. It is not defensible for *reporting*: a plan where every alternative is hollow is half-empty and nothing says so.

**Files:**
- Modify: `src/app/api/ai/meals/generate-home/route.ts`
- Test: `src/lib/utils/meal-usability.test.ts` (create)
- Create: `src/lib/utils/meal-usability.ts`

**Interfaces:**
- Produces: `isUsableOption(option): boolean` and `isUsableMeal(slot): boolean`, both exported from `src/lib/utils/meal-usability.ts`. The route imports them and deletes its inline copy.

**Why extract.** The current function is a closure inside a 100-line block of a 1700-line route, which is why it has never been tested. It is pure and it gates whether a user gets a meal. Move it out.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/meal-usability.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUsableOption, isUsableMeal } from './meal-usability';

const good = {
  name: 'Shakshuka',
  estimatedCalories: 520,
  protein: 28,
  ingredients: ['eggs', 'tomatoes'],
  ingredientsWithNutrition: [{ name: 'eggs', quantity: '3', calories: 210, protein: 18, carbs: 1, fat: 15 }],
  instructions: ['simmer'],
};

test('a complete option is usable', () => {
  assert.equal(isUsableOption(good), true);
});

test('zero calories is not usable', () => {
  assert.equal(isUsableOption({ ...good, estimatedCalories: 0 }), false);
});

test('empty instructions is not usable', () => {
  assert.equal(isUsableOption({ ...good, instructions: [] }), false);
});

test('empty ingredientsWithNutrition is not usable, even with ingredients present', () => {
  assert.equal(isUsableOption({ ...good, ingredientsWithNutrition: [] }), false);
});

test('a missing option is not usable', () => {
  assert.equal(isUsableOption(undefined), false);
  assert.equal(isUsableOption(null), false);
});

test('a slot is usable when its primary is', () => {
  assert.equal(isUsableMeal({ primary: good, alternative: { ...good, ingredientsWithNutrition: [] } }), true);
});

test('a slot with a hollow primary is not usable', () => {
  assert.equal(isUsableMeal({ primary: { ...good, protein: 0 }, alternative: good }), false);
});

test('a slot with no options is not usable', () => {
  assert.equal(isUsableMeal({}), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx tsx --test src/lib/utils/meal-usability.test.ts
```

Expected: FAIL — `Cannot find module './meal-usability'`.

- [ ] **Step 3: Write the module**

Create `src/lib/utils/meal-usability.ts`:

```typescript
/**
 * Whether a meal option has enough content to show a user.
 *
 * Extracted from generate-home/route.ts, where it was a closure inside a
 * hundred-line block and therefore untestable. The 2026-08-18 run shipped four
 * meals at 0 cal and ten with empty ingredients because the top-up keyed on
 * slot presence alone; presence was standing in for content. The schema cannot
 * catch this — `z.array(z.string())` is satisfied by `[]` and `z.number()` by
 * `0`, so strict mode passes all of it.
 *
 * `ingredientsWithNutrition` is checked, not just `ingredients`. Grocery
 * consolidation reads the former, so a meal with a populated `ingredients` list
 * and an empty `ingredientsWithNutrition` used to pass, never be retried, and
 * contribute nothing to the grocery list — a recipe on screen and no way to
 * shop for it.
 */
export function isUsableOption(option: any): boolean {
  if (!option) return false;
  return Number(option.estimatedCalories) > 0
    && Number(option.protein) > 0
    && Array.isArray(option.ingredients) && option.ingredients.length > 0
    && Array.isArray(option.ingredientsWithNutrition) && option.ingredientsWithNutrition.length > 0
    && Array.isArray(option.instructions) && option.instructions.length > 0;
}

/**
 * Whether a slot is usable. The primary is what fills the slot, so only the
 * primary gates a retry — an empty alternative is a lesser problem and retrying
 * the whole slot for it would spend the detail phase's budget on a second
 * choice nobody asked for. Task 4 counts hollow alternatives separately and
 * reports them rather than retrying them.
 */
export function isUsableMeal(slot: any): boolean {
  return isUsableOption(slot?.primary);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test src/lib/utils/meal-usability.test.ts
```

Expected: all eight PASS.

- [ ] **Step 5: Use it in the route**

In `src/app/api/ai/meals/generate-home/route.ts`, delete the inline `const isUsableMeal = (m: any): boolean => { ... };` — **keep the long comment above it**, which records the 2026-08-18 incident, and append a line: `// Moved to meal-usability.ts so it can be tested; see that file for the rest.`

Add the import:

```typescript
import { isUsableMeal, isUsableOption } from '@/lib/utils/meal-usability';
```

The four call sites (`:1246`, `:1249`, `:1254`, `:1266`) need no change — same name, same signature.

- [ ] **Step 6: Count hollow alternatives**

Just below the existing `hollow` block, add:

```typescript
    // Not a retry trigger — see isUsableMeal. But a week where every second
    // choice is empty is a half-delivered week, and until now nothing said so.
    const hollowAlternatives = (allMeals as any[]).filter((m) => !isUsableOption(m.alternative));
    if (hollowAlternatives.length > 0) {
      console.warn(`[HOME-MEALS-7DAY] ⚠️ ${hollowAlternatives.length}/${allMeals.length} meals have no usable alternative`);
    }
```

Add `hollowAlternatives: hollowAlternatives.length` to the `validation` object Task 2 added to the return value.

**This depends on Task 2.** If there is no `validation` key on the return, do Task 2 first.

- [ ] **Step 7: Verify**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run dev
```

Expected: tests pass, baseline unchanged. On a live generation, the `🔁 Detail top-up` line may now fire where it previously did not — that is the fix working. A meal that used to slip through with an empty `ingredientsWithNutrition` is now retried.

**Watch the budget.** More retries means more calls in a phase that already runs close to its deadline. If the top-up now regularly exhausts the budget, say so and stop — that is a real finding about phase sizing and it belongs in a follow-up, not in a silent revert of this check.

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/meal-usability.ts src/lib/utils/meal-usability.test.ts src/app/api/ai/meals/generate-home/route.ts
git commit -m "fix(meals): treat a meal with no ingredientsWithNutrition as hollow

A3. isUsableMeal checked `ingredients` while grocery consolidation reads
`ingredientsWithNutrition`, so a meal could pass the usability gate, never be
retried, and contribute nothing to the grocery list — a recipe on screen with no
way to shop for it. Extracted from a closure inside the route so it can be
tested. Hollow alternatives are now counted and reported rather than ignored."
```

---

### Task 4: Say when the answer is incomplete

**Findings:** A2, A4, A10. This is the task that most directly answers the user's original complaint — *"the generation doesn't always give me the full answer."*

**A2.** A short week emits `console.error("⚠️ Delivering N/M home meals — the week is short")` and continues. No throw, no response field, no marker the UI could render.

**A4.** When `withRouteBudget` runs out, the affected slot is skipped. The response for "we ran out of time" is byte-identical to "there was nothing to generate."

**A10.** A run producing zero meals returns HTTP 200 with `success: true`. Total failure is reported as success.

All three are the same defect: **the response has no vocabulary for partial**. It has `success: true` and a 500, and nothing between them.

**Files:**
- Modify: `src/app/api/ai/meals/generate-home/route.ts`
- Test: `src/lib/utils/completeness.test.ts` (create)
- Create: `src/lib/utils/completeness.ts`

**Interfaces:**
- Produces: `summarizeCompleteness({ requested, delivered, validation }) → CompletenessReport` where

```typescript
export interface CompletenessReport {
  status: 'complete' | 'partial' | 'empty';
  requestedSlots: number;
  deliveredSlots: number;
  missingSlots: string[];
  reasons: string[];
}
```

Task 2's `validation` object and this report are both attached to the HTTP response.

**Deliberately not changing:** the HTTP status code stays 200 for a partial result. A partial week is a usable week and the client already renders it; turning it into a 4xx would break a working screen to make a point. `status: 'partial'` in the body is the signal. **A10 is the exception** — a zero-meal run gets a 502, because there is nothing to render and `success: true` on an empty plan is a lie the client cannot detect.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/completeness.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCompleteness } from './completeness';

const slot = (day: string, mealType: string) => ({ day, mealType });

test('every requested slot delivered is complete', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
  });
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.missingSlots, []);
});

test('a missing slot makes the plan partial and names it', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast')],
  });
  assert.equal(report.status, 'partial');
  assert.deepEqual(report.missingSlots, ['monday|lunch']);
  assert.equal(report.deliveredSlots, 1);
  assert.equal(report.requestedSlots, 2);
});

test('nothing delivered is empty, not partial', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast')],
    delivered: [],
  });
  assert.equal(report.status, 'empty');
});

test('nothing requested is complete, not empty', () => {
  const report = summarizeCompleteness({ requested: [], delivered: [] });
  assert.equal(report.status, 'complete');
});

test('slot matching is case-insensitive — the model does not lowercase', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast')],
    delivered: [slot('Monday', 'Breakfast')],
  });
  assert.equal(report.status, 'complete');
});

test('supplied reasons are carried through', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast')],
    reasons: ['route budget exhausted before the detail top-up'],
  });
  assert.deepEqual(report.reasons, ['route budget exhausted before the detail top-up']);
});

test('an extra delivered slot does not mask a missing one', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast'), slot('tuesday', 'dinner')],
  });
  assert.equal(report.status, 'partial');
  assert.deepEqual(report.missingSlots, ['monday|lunch']);
});
```

The last test is the one that matters. Counting delivered against requested — `2 >= 2`, therefore complete — is the obvious implementation and it is wrong, because the model can substitute a day. Match on identity, not on count.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx tsx --test src/lib/utils/completeness.test.ts
```

Expected: FAIL — `Cannot find module './completeness'`.

- [ ] **Step 3: Write the module**

Create `src/lib/utils/completeness.ts`:

```typescript
export interface SlotRef {
  day?: string;
  mealType?: string;
}

export interface CompletenessReport {
  status: 'complete' | 'partial' | 'empty';
  requestedSlots: number;
  deliveredSlots: number;
  missingSlots: string[];
  reasons: string[];
}

const key = (s: SlotRef) => `${String(s.day ?? '').toLowerCase()}|${String(s.mealType ?? '').toLowerCase()}`;

/**
 * What the user asked for versus what they got, in a form the response can
 * carry.
 *
 * The route had no vocabulary for "partial": a short week logged a
 * console.error and returned success:true, a budget exhaustion produced a
 * response identical to having had nothing to generate, and a zero-meal run
 * also returned success:true. Three findings, one missing concept.
 *
 * Matching is by slot identity rather than by count. `delivered.length >=
 * requested.length` is the obvious test and it is wrong — the model can
 * substitute Tuesday dinner for the Monday lunch it dropped, and a count check
 * calls that complete.
 */
export function summarizeCompleteness(input: {
  requested: SlotRef[];
  delivered: SlotRef[];
  reasons?: string[];
}): CompletenessReport {
  const deliveredKeys = new Set(input.delivered.map(key));
  const missingSlots = input.requested.map(key).filter((k) => !deliveredKeys.has(k));

  const status: CompletenessReport['status'] =
    input.requested.length === 0 ? 'complete'
    : input.delivered.length === 0 ? 'empty'
    : missingSlots.length === 0 ? 'complete'
    : 'partial';

  return {
    status,
    requestedSlots: input.requested.length,
    deliveredSlots: input.delivered.length,
    missingSlots,
    reasons: input.reasons ?? [],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test src/lib/utils/completeness.test.ts
```

Expected: all seven PASS.

- [ ] **Step 5: Collect the reasons (A4)**

Budget exhaustion is currently invisible because the skip is silent. Find the skips:

```bash
grep -n "budget" src/app/api/ai/meals/generate-home/route.ts | head -30
```

At each place that skips work because the deadline has passed, push a string onto a `degradationReasons: string[]` declared at the top of `generateHomeMealsParallel`:

```typescript
    const degradationReasons: string[] = [];
```

For example, where a phase is skipped for lack of budget:

```typescript
      degradationReasons.push(`detail top-up skipped: route budget exhausted with ${undetailed.length} slot(s) still undetailed`);
```

**Write a specific reason at each site, not a generic one.** "Budget exhausted" tells us nothing we could act on; "detail top-up skipped with 6 slots undetailed" tells us the phase and the cost.

- [ ] **Step 6: Build the report and attach it**

Before `generateHomeMealsParallel` returns, add:

```typescript
    const completeness = summarizeCompleteness({
      requested: homeMeals,
      delivered: allMeals,
      reasons: degradationReasons,
    });
    if (completeness.status !== 'complete') {
      console.error(`[HOME-MEALS-7DAY] 📉 ${completeness.status}: ${completeness.deliveredSlots}/${completeness.requestedSlots} slots. Missing: ${completeness.missingSlots.join(', ')}. Reasons: ${completeness.reasons.join('; ') || 'none recorded'}`);
    }
```

Add `completeness` as a key on the returned object, alongside `validation`.

Import at the top:

```typescript
import { summarizeCompleteness } from '@/lib/utils/completeness';
```

- [ ] **Step 7: Put both in the HTTP response (A2)**

In the route handler's final `NextResponse.json({ success: true, ... })` — the one at roughly `:1627`, found by `grep -n "homeMealPlan: initialMealPlan"` — add two keys:

```typescript
      completeness: homeMealPlan.completeness ?? null,
      validation: homeMealPlan.validation ?? null,
```

`?? null` rather than a default object: the legacy path does not produce these, and a fabricated `status: 'complete'` for a path we did not measure would be exactly the lie this task exists to remove.

- [ ] **Step 8: Stop reporting a zero-meal run as success (A10)**

Immediately before that same `NextResponse.json`, insert:

```typescript
    // A10. A run that produced nothing used to return 200 with success:true.
    // The client renders an empty week and has no way to tell it apart from a
    // week the user genuinely has no home meals in. 502 rather than 500: the
    // generation upstream failed, this handler did not.
    if (homeMealPlan.completeness?.status === 'empty') {
      console.error('[HOME-GENERATION] ❌ Zero meals generated — returning 502 rather than an empty success');
      return NextResponse.json({
        error: 'Home meal generation produced no meals',
        completeness: homeMealPlan.completeness,
        validation: homeMealPlan.validation ?? null,
      }, { status: 502 });
    }
```

Note that `generateHomeMealsParallel` already throws on `allMeals.length === 0`, which the outer handler turns into a 500. This guard catches the case where the *legacy* path returns an empty array without throwing, and it makes the intent explicit rather than incidental.

- [ ] **Step 9: Verify**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run dev
```

Then generate a plan and inspect the response body — the browser devtools Network tab, or:

```bash
curl -s -X POST http://localhost:3000/api/ai/meals/generate-home \
  -H 'Content-Type: application/json' \
  -H "Cookie: survey_id=<a real survey id>" \
  -d '{}' | npx tsx -e 'process.stdin.on("data",d=>{const j=JSON.parse(d.toString());console.log(JSON.stringify({completeness:j.completeness,validation:j.validation},null,2))})'
```

**Get the survey id from the browser's cookies, not from the database.** Reading survey ids out of production to script against is the kind of shortcut that turns into a script that writes.

Expected: a `completeness` object with real numbers. A `partial` status on a live run is a successful verification of this task — it means the harness now sees what the log has been saying to nobody.

- [ ] **Step 10: Commit**

```bash
git add src/lib/utils/completeness.ts src/lib/utils/completeness.test.ts src/app/api/ai/meals/generate-home/route.ts
git commit -m "feat(meals): report an incomplete plan as incomplete

A2, A4, A10. A short week logged a console.error and returned success:true, a
budget exhaustion produced a response indistinguishable from having nothing to
generate, and a zero-meal run also returned success:true. One missing concept
behind all three: the response had no vocabulary for partial. It does now, with
the missing slots named and the reason recorded at each degradation site. A
zero-meal run returns 502; a partial one stays 200 because a partial week is
still usable and the client already renders it."
```

---

### Task 5: Give each day its own targets, and let budget adjustments compose

**Findings:** A7 (S3), A8 (S3)

**Files:**
- Modify: `src/app/api/ai/meals/generate-home/route.ts` — `adjustTargetsForRestaurantBudget` (~`:217`), the call at `~:1431`
- Test: `src/lib/utils/restaurant-budget.test.ts` (new)
- Create: `src/lib/utils/restaurant-budget.ts`

**Interfaces:**
- Produces: `adjustTargetsForRestaurantBudget(weeklyTargets, restaurantCalories) => WeeklyTargets` — same signature, moved out of the route file so it can be tested without importing a Next route handler.
- Consumes: nothing from earlier tasks.

**Background — what is actually wrong.**

Two separate bugs share one function pair.

*A7.* `convertToLegacyTargets(weeklyTargets, day?)` at `:287` takes an optional
day. Given a day it returns that day's meal targets; given none it falls through
to `const avgDay = Object.values(weeklyTargets.days)[0]` — despite the variable
name, that is not an average, it is **the first day**, which is Monday. The one
call site at `:1431` passes no day. So Monday's per-meal split becomes
`nutritionTargets.mealTargets` for the entire week.

That legacy object is then threaded through `planWeekMeals`,
`generateMealDetails`, and the chunked fallbacks. `formatNutritionTargets` in
`src/lib/ai/prompts/meal-generation.ts:37` *does* prefer the real per-day
targets — but only when `hasVariation` is true, which requires a day to differ
from Monday by more than 50 calories in some slot. Below that threshold, and on
every path that reads `nutritionTargets.mealTargets` directly rather than going
through `formatNutritionTargets` (`createDetailPrompt`'s callers, the legacy
chunked generator), Monday wins.

*A8.* `adjustTargetsForRestaurantBudget` computes, for each restaurant meal:

```typescript
const remainingCalories = Math.max(0, weeklyTargets.dailyCalories - calories);
```

`weeklyTargets.dailyCalories` is the **full day budget**, and `calories` is the
one restaurant meal currently being processed. If a day has two restaurant meals
— say lunch 700 and dinner 900 against a 2000 budget — the loop runs twice. The
first pass sets breakfast to `2000 - 700 = 1300`. The second pass recomputes from
the full 2000 again: `2000 - 900 = 1100`, and writes that over the first result.
The user eats 700 + 900 + 1100 = 2700 against a 2000 target. The adjustment does
not accumulate; the last restaurant meal processed simply wins.

The fix is to subtract **all** of a day's restaurant calories once, before
redistributing. That also removes the loop-order dependence.

- [ ] **Step 1: Move the function into a testable module**

Create `src/lib/utils/restaurant-budget.ts`. Cut the whole
`adjustTargetsForRestaurantBudget` function out of
`src/app/api/ai/meals/generate-home/route.ts` (it begins at the comment
`// Adjust nutrition targets based on restaurant meal budget`) and paste it in,
adding `export`. Do not change its body yet — this step is a pure move so that
if the later rewrite goes wrong, `git diff HEAD~1` isolates the behaviour change
from the relocation.

In the route file, add to the existing import block:

```typescript
import { adjustTargetsForRestaurantBudget } from '@/lib/utils/restaurant-budget';
```

- [ ] **Step 2: Verify the move compiles**

Run: `npx tsc --noEmit 2>&1 | grep -c "error"`
Expected: the same count as before your change. Record the number before you
start (`npx tsc --noEmit 2>&1 | grep -c error`) — the repo carries roughly 32
pre-existing errors and the goal is that the number does not move.

- [ ] **Step 3: Write the failing tests**

Create `src/lib/utils/restaurant-budget.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustTargetsForRestaurantBudget } from './restaurant-budget';

function targets() {
  return {
    dailyCalories: 2000,
    macros: { protein: 150, carbs: 200, fat: 67 },
    days: {
      monday: {
        breakfast: { calories: 500, protein: 38, carbs: 50, fat: 17, source: 'home' },
        lunch: { calories: 700, protein: 52, carbs: 70, fat: 23, source: 'restaurant' },
        dinner: { calories: 800, protein: 60, carbs: 80, fat: 27, source: 'restaurant' },
      },
    },
  };
}

test('two restaurant meals in one day compose instead of clobbering', () => {
  const result = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'lunch', calories: 700 },
    { day: 'monday', mealType: 'dinner', calories: 900 },
  ]);
  // 2000 - 700 - 900 = 400 left for the single home meal
  assert.equal(result.days.monday.breakfast.calories, 400);
});

test('order of restaurant meals does not change the result', () => {
  const forward = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'lunch', calories: 700 },
    { day: 'monday', mealType: 'dinner', calories: 900 },
  ]);
  const reverse = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'dinner', calories: 900 },
    { day: 'monday', mealType: 'lunch', calories: 700 },
  ]);
  assert.equal(forward.days.monday.breakfast.calories, reverse.days.monday.breakfast.calories);
});

test('a single restaurant meal leaves two home meals split 40/60', () => {
  const t = targets();
  t.days.monday.dinner.source = 'home';
  const result = adjustTargetsForRestaurantBudget(t, [
    { day: 'monday', mealType: 'lunch', calories: 700 },
  ]);
  const b = result.days.monday.breakfast.calories;
  const d = result.days.monday.dinner.calories;
  assert.equal(b + d, 1300);
  assert.ok(d > b, 'dinner should take the larger share');
});

test('does not mutate its input', () => {
  const input = targets();
  adjustTargetsForRestaurantBudget(input, [
    { day: 'monday', mealType: 'lunch', calories: 700 },
  ]);
  assert.equal(input.days.monday.breakfast.calories, 500);
});

test('an unknown day is ignored rather than throwing', () => {
  const result = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'caturday', mealType: 'lunch', calories: 700 },
  ]);
  assert.equal(result.days.monday.breakfast.calories, 500);
});

test('restaurant calories exceeding the day budget floor the home meal at zero', () => {
  const result = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'lunch', calories: 1400 },
    { day: 'monday', mealType: 'dinner', calories: 1400 },
  ]);
  assert.equal(result.days.monday.breakfast.calories, 0);
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `npx tsx --test 'src/lib/utils/restaurant-budget.test.ts'`
Expected: `two restaurant meals in one day compose` fails (it gets 1100, not
400), `order of restaurant meals does not change the result` fails, and
`does not mutate its input` fails (the function writes through
`adjustedDays[dayKey][slot] = …`, and `adjustedDays` is a shallow copy, so the
nested day object is shared with the caller's).

The `single restaurant meal` and `unknown day` tests should already pass — they
describe behaviour that is currently correct and must stay correct.

- [ ] **Step 5: Rewrite the function to group by day first**

Replace the whole body of `adjustTargetsForRestaurantBudget` in
`src/lib/utils/restaurant-budget.ts` with:

```typescript
export function adjustTargetsForRestaurantBudget(
  weeklyTargets: any,
  restaurantCalories: Array<{ day: string; mealType: string; calories: number }>
): any {
  if (!weeklyTargets || !weeklyTargets.days) return weeklyTargets;

  // Group by day so a day with two restaurant meals subtracts both at once.
  // Processing them one at a time recomputed the remainder from the full day
  // budget each pass, so the last meal processed silently won.
  const byDay = new Map<string, { spent: number; slots: Set<string> }>();
  restaurantCalories.forEach(({ day, mealType, calories }) => {
    const key = day.toLowerCase();
    const entry = byDay.get(key) ?? { spent: 0, slots: new Set<string>() };
    entry.spent += calories;
    entry.slots.add(mealType.toLowerCase());
    byDay.set(key, entry);
  });

  const adjustedDays: Record<string, any> = {};
  Object.entries(weeklyTargets.days).forEach(([dayKey, dayTargets]) => {
    adjustedDays[dayKey] = { ...(dayTargets as any) };
  });

  byDay.forEach(({ spent, slots }, dayKey) => {
    const dayTargets = adjustedDays[dayKey];
    if (!dayTargets) return;

    console.log(`[BUDGET-ADJUST] ${dayKey}: reducing by ${spent} calories across ${slots.size} restaurant meal(s)`);

    const remainingCalories = Math.max(0, weeklyTargets.dailyCalories - spent);

    const homeMealSlots = (['breakfast', 'lunch', 'dinner'] as const).filter(
      slot => !slots.has(slot) && dayTargets[slot]?.source === 'home'
    );
    if (homeMealSlots.length === 0) return;

    // 1 meal takes everything (capped), 2 split 40/60, 3+ split evenly.
    const shares =
      homeMealSlots.length === 1
        ? [Math.min(remainingCalories, 1200)]
        : homeMealSlots.length === 2
          ? [Math.round(remainingCalories * 0.4), remainingCalories - Math.round(remainingCalories * 0.4)]
          : homeMealSlots.map(() => Math.round(remainingCalories / homeMealSlots.length));

    homeMealSlots.forEach((slot, index) => {
      const calories = shares[index];
      const proportion = weeklyTargets.dailyCalories > 0 ? calories / weeklyTargets.dailyCalories : 0;
      dayTargets[slot] = {
        ...dayTargets[slot],
        calories,
        protein: Math.round(weeklyTargets.macros.protein * proportion),
        carbs: Math.round(weeklyTargets.macros.carbs * proportion),
        fat: Math.round(weeklyTargets.macros.fat * proportion),
      };
    });
  });

  return { ...weeklyTargets, days: adjustedDays };
}
```

Three things changed beyond the grouping. `adjustedDays` now copies each day
object rather than only the outer map, which is what makes the no-mutation test
pass. The slot filter reads from the day's own `slots` set rather than a single
`mealType`, so a day with two restaurant meals excludes both. And the three-slot
case, previously unreachable and therefore silently a no-op, now has a branch —
it becomes reachable the moment a caller passes a `snack`-like slot, and a
silent no-op is exactly the failure mode this plan exists to remove.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx tsx --test 'src/lib/utils/restaurant-budget.test.ts'`
Expected: 6 pass, 0 fail.

- [ ] **Step 7: Pass the day through to `convertToLegacyTargets`**

`convertToLegacyTargets` is only sound as a whole-week value when every day is
identical. It is not, so the single week-level call has to stop pretending.

In `src/app/api/ai/meals/generate-home/route.ts`, find:

```typescript
    const nutritionTargets = convertToLegacyTargets(adjustedTargets);
```

Leave that line — it stays as the week-level default for the paths that need a
single object, but relabel what it is. Immediately after the existing
`if (!nutritionTargets) { … }` guard, add:

```typescript
    // Per-day legacy targets. The week-level `nutritionTargets` above is
    // Monday's, because convertToLegacyTargets falls through to
    // Object.values(days)[0] when given no day. Everything that knows which day
    // it is generating should read from here instead.
    const targetsByDay: Record<string, any> = {};
    Object.keys(adjustedTargets?.days ?? {}).forEach(day => {
      targetsByDay[day] = convertToLegacyTargets(adjustedTargets, day);
    });
```

Then change the `generateHomeMealsForSchedule` call from:

```typescript
    const homeMealPlan = await generateHomeMealsForSchedule(homeMealsSchedule, surveyData, nutritionTargets, adjustedTargets);
```

to pass the map alongside:

```typescript
    const homeMealPlan = await generateHomeMealsForSchedule(homeMealsSchedule, surveyData, nutritionTargets, adjustedTargets, targetsByDay);
```

- [ ] **Step 8: Thread `targetsByDay` into the detail phase**

`generateHomeMealsForSchedule` (~`:407`) forwards to
`generateHomeMealsParallel` (~`:1143`), which calls `generateMealDetails`
(~`:1216`) per chunk. Add an optional trailing `targetsByDay?: Record<string, any>`
parameter to each of those three signatures and forward it. Optional, so the
legacy chunked path (`generateHomeMealsLegacyChunked`, `generateHomeMealsLegacy`)
needs no change.

In `generateMealDetails`, the chunk's meals each carry a `day`. Where the
function builds its context for `createDetailPrompt`, prefer the day-specific
object:

```typescript
    const chunkDay = plannedMealsChunk[0]?.day?.toLowerCase();
    const effectiveTargets = (chunkDay && targetsByDay?.[chunkDay]) || nutritionTargets;
```

and pass `effectiveTargets` where `nutritionTargets` was passed. A chunk can span
days; taking the first day's targets is not exact, but it is strictly closer than
always taking Monday's, and the per-day prompt text produced by
`formatNutritionTargets` already carries the exact per-day numbers when they
vary. If the chunk boundaries are per-day already (check the `chunks` construction
around `:1216`), this is exact.

**Locate first:** grep for `createDetailPrompt(` to find where the context object
is built. Do not assume the parameter is literally named `nutritionTargets` at
that point — read it.

- [ ] **Step 9: Verify the whole thing compiles and runs**

Run: `npx tsc --noEmit 2>&1 | grep -c "error"`
Expected: unchanged from the number you recorded in Step 2.

Then start the dev server and generate a plan for a survey that has at least one
restaurant meal (`npm run dev`, then drive the meal plan page).
Expected in the server log: one `[BUDGET-ADJUST]` line per affected day — not
one per restaurant meal. That count is the observable proof the grouping works.

- [ ] **Step 10: Commit**

```bash
git add src/lib/utils/restaurant-budget.ts src/lib/utils/restaurant-budget.test.ts src/app/api/ai/meals/generate-home/route.ts
git commit -m "fix(meals): stop Monday's targets standing in for the week, and let restaurant budgets compose

Two bugs in the same pair of functions. convertToLegacyTargets was called with
no day, and its no-day branch returns Object.values(days)[0] under a variable
named avgDay — so every day generated against Monday's split. And
adjustTargetsForRestaurantBudget recomputed the remainder from the full day
budget for each restaurant meal in turn, so a day with two of them kept only the
last subtraction: 2000-cal day, 700 lunch and 900 dinner out, breakfast still
budgeted 1100.

Restaurant calories are now summed per day before redistribution, the day map is
deep-copied so the caller's targets are not mutated, and the route builds a
targetsByDay map that the detail phase reads from."
```

---

### Task 6: Get exclusions to the stage that can act on them, and make the grocery fallback usable

**Findings:** A9 (S3), A11 (S3)

**Files:**
- Modify: `src/lib/ai/prompts/meal-generation.ts` — `createPlanningPrompt` (~`:1230`)
- Modify: `src/lib/utils/grocery-list.ts` — `buildFallbackGroceryList` (~`:220`)
- Test: `src/lib/utils/grocery-list.test.ts` (new)

**Interfaces:**
- Consumes: `getPerishability`, `getFirstUseDay`, `getUsageMap` — already exported or module-local in `grocery-list.ts`.
- Produces: `categorizeGroceryItem(name: string) => GroceryCategory` — a new export from `grocery-list.ts`, used by `buildFallbackGroceryList` and available to later grocery tasks.

**Background.**

*A9.* `createDetailPrompt` calls `formatStrictExclusions(surveyData)` and renders
a `FOODS TO AVOID` block. `createPlanningPrompt` does not — its destructure at
`:1234` is `{ homeMeals, nutritionTargets, scheduleText, surveyData }` and
nothing in its body touches `strictExclusions`.

That ordering is backwards. Requirement 1 of the detail prompt is *"Do NOT change
the meal names or primary proteins — follow the plan exactly."* So if the
planning phase picks "Shrimp Scampi" for a user who excluded shellfish, the
detail phase is under instruction not to rename it. The exclusion arrives after
the only stage with the authority to act on it. The dish ships.

*A11.* `buildFallbackGroceryList` is what runs when the grocery generation call
fails or the budget runs out. It walks the usage map and pushes every single
ingredient into `categorized.pantryStaples` with `quantity: 'varies'`. Five of
the six categories come back empty. Nothing has a quantity, so nothing is
priceable, and the aisle grouping the UI renders collapses into one list titled
"Pantry Staples" containing chicken breast and spinach.

- [ ] **Step 1: Add exclusions to the planning prompt**

In `src/lib/ai/prompts/meal-generation.ts`, inside `createPlanningPrompt`, after
the destructure add:

```typescript
  const strictExclusionsWarning = formatStrictExclusions(surveyData);
```

Then in the template literal, insert the block immediately after the
`USER PROFILE:` section and before `REQUIREMENTS:`:

```
${strictExclusionsWarning}
```

`formatStrictExclusions` returns `''` when there are no exclusions, so the
no-exclusion prompt gains only a blank line.

- [ ] **Step 2: Strengthen the planning requirement**

Still in `createPlanningPrompt`, add to the numbered `REQUIREMENTS:` list, after
requirement 7:

```
8. Never plan a dish whose defining ingredient appears in the avoid list above.
   The detail stage is forbidden from renaming your dishes, so an avoided
   ingredient chosen here cannot be corrected later.
```

That second sentence is the operative one. It tells the model why the constraint
binds at this stage, which is the thing the prompt could not previously convey
because the constraint was not present at this stage at all.

- [ ] **Step 3: Verify the rendered prompt actually contains the block**

There is no unit test harness for prompt text, so verify by rendering. From the
repo root:

```bash
npx tsx -e "
import { createPlanningPrompt } from './src/lib/ai/prompts/meal-generation';
const p = createPlanningPrompt({
  homeMeals: [{ day: 'monday', mealType: 'dinner' }],
  scheduleText: 'Dinner: monday',
  nutritionTargets: { dailyCalories: 2000, dailyProtein: 150, dailyCarbs: 200, dailyFat: 67,
    mealTargets: { breakfast: {calories:500,protein:38}, lunch: {calories:700,protein:52}, dinner: {calories:800,protein:60}, snack: {calories:0,protein:0} } },
  surveyData: { strictExclusions: { seafood: ['shrimp'] } },
} as any);
console.log(p.includes('FOODS TO AVOID') ? 'PRESENT' : 'MISSING');
console.log(p.includes('shrimp') ? 'ITEM PRESENT' : 'ITEM MISSING');
"
```

Expected: `PRESENT` then `ITEM PRESENT`.

Run it once more with `surveyData: {}` and confirm the output is `MISSING` /
`ITEM MISSING` and that the prompt does not gain a stray `undefined`.

- [ ] **Step 4: Write the failing grocery-fallback tests**

Create `src/lib/utils/grocery-list.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackGroceryList, categorizeGroceryItem } from './grocery-list';

const meals = [
  {
    day: 'monday',
    mealType: 'dinner',
    primary: {
      name: 'Chicken and Rice',
      ingredientsWithNutrition: [
        { name: 'chicken breast', amount: '6 oz' },
        { name: 'brown rice', amount: '1 cup' },
        { name: 'spinach', amount: '2 cups' },
        { name: 'olive oil', amount: '1 tbsp' },
      ],
    },
  },
];

test('categorizes a protein', () => {
  assert.equal(categorizeGroceryItem('chicken breast'), 'proteins');
});

test('categorizes a vegetable', () => {
  assert.equal(categorizeGroceryItem('spinach'), 'vegetables');
});

test('categorizes a grain', () => {
  assert.equal(categorizeGroceryItem('brown rice'), 'grains');
});

test('an unrecognized item falls back to pantryStaples', () => {
  assert.equal(categorizeGroceryItem('xanthan gum'), 'pantryStaples');
});

test('the fallback list does not dump everything into pantryStaples', () => {
  const list = buildFallbackGroceryList(meals);
  assert.ok(list.proteins.length > 0, 'proteins should not be empty');
  assert.ok(list.vegetables.length > 0, 'vegetables should not be empty');
  assert.ok(list.grains.length > 0, 'grains should not be empty');
});

test('the fallback list carries a real quantity, not "varies"', () => {
  const list = buildFallbackGroceryList(meals);
  const all = Object.values(list).flat() as Array<{ quantity: string }>;
  assert.ok(all.length > 0);
  assert.ok(
    all.every(item => item.quantity !== 'varies'),
    'no item should carry the placeholder quantity'
  );
});

test('an item used twice reports the combined count', () => {
  const twice = [meals[0], { ...meals[0], day: 'tuesday' }];
  const list = buildFallbackGroceryList(twice);
  const chicken = (list.proteins as any[]).find(i => i.name.includes('chicken'));
  assert.ok(chicken);
  assert.equal(chicken.usedInMeals.length, 2);
});

test('an item field the category table has never seen does not throw', () => {
  assert.doesNotThrow(() => categorizeGroceryItem(''));
});
```

- [ ] **Step 5: Run and watch them fail**

Run: `npx tsx --test 'src/lib/utils/grocery-list.test.ts'`
Expected: every `categorizeGroceryItem` test fails with an import error — the
function does not exist yet. That is the correct first failure.

- [ ] **Step 6: Add the categorizer**

In `src/lib/utils/grocery-list.ts`, above `buildFallbackGroceryList`, add:

```typescript
export type GroceryCategory =
  | 'proteins' | 'vegetables' | 'grains' | 'dairy' | 'pantryStaples' | 'snacks';

const CATEGORY_TERMS: Array<[GroceryCategory, string[]]> = [
  ['proteins', ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'salmon', 'tuna', 'shrimp',
    'cod', 'tilapia', 'egg', 'tofu', 'tempeh', 'seitan', 'lentil', 'chickpea',
    'black bean', 'kidney bean', 'steak', 'bacon', 'sausage', 'ground']],
  ['dairy', ['milk', 'yogurt', 'cheese', 'butter', 'cream', 'feta', 'mozzarella',
    'parmesan', 'cheddar', 'ricotta', 'cottage']],
  ['grains', ['rice', 'quinoa', 'oat', 'pasta', 'bread', 'tortilla', 'couscous',
    'barley', 'farro', 'noodle', 'bagel', 'cereal', 'flour']],
  ['vegetables', ['spinach', 'kale', 'broccoli', 'carrot', 'onion', 'garlic', 'pepper',
    'tomato', 'cucumber', 'lettuce', 'zucchini', 'mushroom', 'potato',
    'cauliflower', 'asparagus', 'celery', 'cabbage', 'avocado', 'apple',
    'banana', 'berry', 'berries', 'lemon', 'lime', 'orange', 'peas', 'corn']],
  ['snacks', ['chip', 'cracker', 'granola bar', 'popcorn', 'pretzel', 'trail mix']],
];

export function categorizeGroceryItem(name: string): GroceryCategory {
  const n = (name || '').toLowerCase();
  if (!n) return 'pantryStaples';
  for (const [category, terms] of CATEGORY_TERMS) {
    if (terms.some(term => n.includes(term))) return category;
  }
  return 'pantryStaples';
}
```

Order matters and is deliberate. `dairy` is tested before `grains` so that
"cream cheese" does not match nothing and fall through; `proteins` is tested
first because "chicken broth" is more useful shelved with proteins than with
pantry staples. This is a heuristic on a fallback path — it does not need to be
right about "xanthan gum," it needs to stop putting chicken and spinach in the
same bucket.

- [ ] **Step 7: Rewrite the fallback builder**

Replace the body of `buildFallbackGroceryList`:

```typescript
export function buildFallbackGroceryList(homeMeals: any[]): Record<string, any> {
  const usageMap = getUsageMap(homeMeals);
  const categorized: Record<string, GroceryItem[]> = {
    proteins: [], vegetables: [], grains: [], dairy: [], pantryStaples: [], snacks: [],
  };

  usageMap.forEach((usages, name) => {
    const category = categorizeGroceryItem(name);
    categorized[category].push({
      name,
      // No amounts survive the usage map, so quantity is the honest count of
      // meals the item appears in rather than the placeholder 'varies'. A count
      // is at least actionable at the shelf; 'varies' never was.
      quantity: usages.length === 1 ? '1 meal' : `${usages.length} meals`,
      category,
      usedInMeals: usages,
      firstUseDay: getFirstUseDay(usages),
      perishability: getPerishability(name),
    });
  });

  return categorized;
}
```

Note the `category` field now matches the bucket the item is in. It previously
said `'pantryStaples'` for every item, including the ones the UI would have
rendered elsewhere had they been bucketed correctly.

- [ ] **Step 8: Run and watch them pass**

Run: `npx tsx --test 'src/lib/utils/grocery-list.test.ts'`
Expected: 8 pass, 0 fail.

If `getUsageMap` or `getFirstUseDay` are module-local rather than exported, they
are still in scope inside `grocery-list.ts` — no import change is needed. Do not
export them just for this.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/prompts/meal-generation.ts src/lib/utils/grocery-list.ts src/lib/utils/grocery-list.test.ts
git commit -m "fix(meals): put exclusions in front of the stage that can act on them, and categorize the fallback grocery list

The planning prompt never saw strictExclusions — only the detail prompt did, and
the detail prompt's first requirement forbids renaming the dish. So an excluded
ingredient chosen at planning time had no stage left that could correct it.

And buildFallbackGroceryList pushed every ingredient into pantryStaples with
quantity 'varies', leaving five of six categories empty and nothing priceable.
Items are now bucketed by a term table and carry a usage count instead of a
placeholder."
```

---

### Task 7: Stop losing grocery prices to instance reclamation

**Finding:** A12 (S2, ✓ confirmed)

**Files:**
- Modify: `src/app/api/ai/meals/generate-home/route.ts` — `triggerGroceryPriceLookup` (~`:870`), dispatch (~`:1605`)

**Interfaces:**
- Consumes: `after` from `next/server` — available in Next 16 (`package.json` pins `^16.1.0`), no new dependency.
- Produces: nothing.

**Background.**

`triggerGroceryPriceLookup` does exactly what its comment says:

```typescript
    // Fire and forget - don't await
    fetch(`${url}/api/ai/meals/generate-groceries`, { … })
```

On a serverless platform the function instance may be frozen or reclaimed as
soon as the response is written. A promise that nobody is holding does not keep
the instance alive. So the grocery price lookup completes locally every time —
which is why this has never been caught in development — and on production drops
some fraction of the time, silently, with the user simply never seeing prices.

Next's `after()` registers work to run after the response is sent while keeping
the invocation alive for it. This is the framework-native form of `waitUntil`
and needs no `@vercel/functions` dependency.

- [ ] **Step 1: Import `after`**

In `src/app/api/ai/meals/generate-home/route.ts`, the file already imports from
`next/server` (for `NextResponse`). Extend that import:

```typescript
import { NextResponse, after } from 'next/server';
```

**Locate first:** grep for `from 'next/server'` in the file to find the exact
existing import line and its full member list — do not overwrite members you did
not read.

- [ ] **Step 2: Make the trigger awaitable**

Change `triggerGroceryPriceLookup` to return the promise rather than orphan it.
Replace the `// Fire and forget - don't await` block with:

```typescript
    // Awaited by the caller inside after(), which keeps the serverless instance
    // alive past the response. Orphaning this promise dropped prices whenever
    // the platform reclaimed the instance first — invisibly, since it always
    // completes locally.
    const res = await fetch(`${url}/api/ai/meals/generate-groceries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[HOME-MEALS] ✅ Grocery prices complete: ${data.itemCount} items, best store: ${data.recommendedStore}`);
    } else {
      console.warn('[HOME-MEALS] ⚠️ Grocery price lookup failed:', res.status);
    }
```

The surrounding `try { … } catch (error) { … }` stays — it now catches the fetch
rejection that the removed `.catch(err => …)` used to handle, so no error path
is lost. Delete the now-redundant `.then(…)`/`.catch(…)` chain entirely.

- [ ] **Step 3: Wrap the dispatch**

At the call site (~`:1605`, inside the DB-save `try`), change:

```typescript
      // Trigger grocery price lookup in background
      triggerGroceryPriceLookup(surveyData.id);
```

to:

```typescript
      // Runs after the response is flushed, but the platform keeps the instance
      // alive for it.
      after(triggerGroceryPriceLookup(surveyData.id));
```

- [ ] **Step 4: Verify it still fires, and now blocks the instance**

Run: `npm run dev`, generate a home meal plan, and watch the server log.

Expected: the `[HOME-GENERATION]` completion line appears, and *after* it the
`[HOME-MEALS] 🛒 Triggering background grocery price lookup...` line followed
eventually by `✅ Grocery prices complete: N items`. The ordering is the
observable difference — the trigger log now lands after the response rather than
interleaved with it.

Confirm the client still receives its response promptly. `after()` must not
delay the response; if the page hangs waiting, the `after` call has been placed
before the `NextResponse.json(...)` return in a way that awaits it — re-check
that you passed the promise to `after` rather than awaiting it inline.

- [ ] **Step 5: Confirm no orphaned promise remains**

Run: `grep -n "Fire and forget" src/app/api/ai/meals/generate-home/route.ts`
Expected: no output.

Run: `grep -rn "Fire and forget\|don't await" src/app/api/`
Expected: review whatever else this turns up. Any other orphaned cross-route
`fetch` has the same defect. Do not fix them in this task — note them in the
commit body so they are on the record, and if any exist, say so when you report
the task complete.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/meals/generate-home/route.ts
git commit -m "fix(meals): keep the instance alive for the grocery price lookup

The lookup was an orphaned fetch behind a 'Fire and forget' comment. Locally
nothing reclaims the process, so it always completed and the defect never
surfaced; on serverless the instance can be frozen the moment the response is
written, and the user just never sees prices — no error, no retry.

Wrapped in next/server's after(), which is the framework-native waitUntil and
needs no new dependency."
```

---

## Section B — Restaurants

Plan 2 closed the safety-critical link findings (B1, B2, B4, B6, B8, B11, B12).
What remains here is silent wrongness: restaurants that do not exist, distances
that mean two different things, a substring scan that deletes on a false
positive, evidence that is collected and dropped, and three fabricated numbers
rendered as facts.

**These tasks assume Plan 2 has been executed.** Task 11 in particular depends on
Plan 2 Task 2 having moved the menu prompt into
`src/lib/ai/prompts/restaurant-menu.ts`. If that file does not exist, stop and
execute Plan 2 first.

---

### Task 8: Stop presenting restaurants that may not exist, and make "nearby" mean one thing

**Findings:** B7 (S2), B9 (S3), B10 (S3)

**Files:**
- Modify: `src/app/api/ai/meals/generate-restaurants/route.ts` — the selection mapper (~`:236-272`), the radius table (~`:128-129`)
- Modify: `src/lib/external/places-client.ts` — `Restaurant` interface (`:4`), `enrichPlaceDetails` (~`:262`)
- Modify: `src/lib/ai/prompts/meal-generation.ts:1198` — the second, disagreeing mile table
- Modify: `src/lib/external/perplexity-client.ts` — the distance keyword scan (~`:298-318`), the mile table (~`:730`)
- Create: `src/lib/utils/distance.ts`
- Test: `src/lib/utils/distance.test.ts`

**Interfaces:**
- Produces:
  - `DISTANCE_RADIUS_MILES: Record<'close' | 'medium' | 'far', number>` — the single mile table.
  - `radiusMilesFor(preference: string | null | undefined): number`
  - `milesBetween(a: {lat: number; lng: number}, b: {lat: number; lng: number}): number`
- Consumes: nothing from earlier tasks.

**Background — three separate defects that all live in the distance story.**

*B7.* The selection mapper tries `placeId`, then falls back to name, and then —
this is the defect — falls back again:

```typescript
      } else if (selected.name && selected.address) {
        console.log(`[RESTAURANT-SEARCH] ⚠️ Using GPT-provided data for: ${selected.name}`);
        selectedRestaurants.push({
          ...selected,
          rating: selected.rating || 0
        } as unknown as Restaurant);
```

`selected` came out of `RestaurantSelectionSchema`, which is a model output. The
grammar guarantees it has a `name`, a `placeId` and an `address` — it guarantees
nothing about whether any of them correspond to a real business. When placeId
matching fails, the reason is very often that the model invented the entry. This
branch then admits the invention into the result set with the `as unknown as
Restaurant` cast papering over the fact that it has none of the fields a real
`Restaurant` carries. The user is shown a restaurant that may not exist, at an
address that may not exist.

*B9.* Two mile tables disagree:

| Path | close | medium | far |
|---|---|---|---|
| `generate-restaurants/route.ts:128` and `perplexity-client.ts:730` | 1 | 3 | 8 |
| `meal-generation.ts:1198` | 2 | 5 | 10 |

The first governs the Places search radius and the Sonar prompt. The second
governs what the meal-selection prompt tells the model "nearby" means. So the
model is told restaurants are within 5 miles while the search only returned ones
within 3, or told 10 while the search returned 8. Neither number is checked after
the fact, because no post-hoc distance check exists — the search radius is the
only enforcement, and a radius biases results without bounding them (Places
returns by prominence within the radius, and the fallback path uses a different
radius again).

*B10.* The "distance validation" is:

```typescript
      const distanceIssueKeywords = [
        'too far', 'farther than', 'outside the', 'exceeds the distance',
        'beyond the', 'distance limit', 'not within', 'more than'
      ];
      const hasDistanceIssue = distanceIssueKeywords.some(keyword =>
        content.toLowerCase().includes(keyword.toLowerCase())
      );
```

applied to the entire Sonar prose response. `'more than'` and `'beyond the'` are
ordinary English. A menu description reading *"more than a dozen toppings"* or
*"beyond the usual burger"* trips it, and the consequence is not a warning — the
function returns with `menuItems: []` and the whole restaurant's menu is
discarded. A false positive silently deletes real data.

The fix for all three is the same move: get a real coordinate, compute a real
distance, and delete the two proxies for it.

- [ ] **Step 1: Write the failing distance tests**

Create `src/lib/utils/distance.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { milesBetween, radiusMilesFor, DISTANCE_RADIUS_MILES } from './distance';

test('the mile table has exactly three tiers', () => {
  assert.deepEqual(Object.keys(DISTANCE_RADIUS_MILES).sort(), ['close', 'far', 'medium']);
});

test('an unknown preference falls back to medium', () => {
  assert.equal(radiusMilesFor('moderate'), DISTANCE_RADIUS_MILES.medium);
  assert.equal(radiusMilesFor(undefined), DISTANCE_RADIUS_MILES.medium);
  assert.equal(radiusMilesFor(null), DISTANCE_RADIUS_MILES.medium);
});

test('a known preference maps to its tier', () => {
  assert.equal(radiusMilesFor('close'), DISTANCE_RADIUS_MILES.close);
  assert.equal(radiusMilesFor('FAR'), DISTANCE_RADIUS_MILES.far);
});

test('distance from a point to itself is zero', () => {
  const p = { lat: 37.8715, lng: -122.2730 };
  assert.equal(milesBetween(p, p), 0);
});

test('a known distance is right to within a tenth of a mile', () => {
  // UC Berkeley campanile to the Oakland Museum of California: ~4.1 miles.
  const berkeley = { lat: 37.8721, lng: -122.2578 };
  const oakland = { lat: 37.7955, lng: -122.2639 };
  const d = milesBetween(berkeley, oakland);
  assert.ok(d > 5.2 && d < 5.5, `expected ~5.3 miles, got ${d}`);
});

test('distance is symmetric', () => {
  const a = { lat: 37.8721, lng: -122.2578 };
  const b = { lat: 37.7955, lng: -122.2639 };
  assert.equal(milesBetween(a, b).toFixed(6), milesBetween(b, a).toFixed(6));
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx tsx --test 'src/lib/utils/distance.test.ts'`
Expected: module-not-found — `./distance` does not exist yet.

- [ ] **Step 3: Create the distance module**

Create `src/lib/utils/distance.ts`:

```typescript
export type DistancePreference = 'close' | 'medium' | 'far';

// The single mile table. Two disagreeing copies previously existed: the Places
// search radius and the Sonar prompt used 1/3/8 while the meal-selection prompt
// told the model 2/5/10, so the model optimised against a radius the search had
// never used.
export const DISTANCE_RADIUS_MILES: Record<DistancePreference, number> = {
  close: 1.0,
  medium: 3.0,
  far: 8.0,
};

export function radiusMilesFor(preference: string | null | undefined): number {
  const key = (preference || '').toLowerCase();
  if (key === 'close' || key === 'medium' || key === 'far') {
    return DISTANCE_RADIUS_MILES[key];
  }
  return DISTANCE_RADIUS_MILES.medium;
}

const EARTH_RADIUS_MILES = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

The table keeps the 1/3/8 values because those are the ones the Places search
actually used, so keeping them changes no search behaviour — only the prompt
text that disagreed with them moves.

- [ ] **Step 4: Run and watch them pass**

Run: `npx tsx --test 'src/lib/utils/distance.test.ts'`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: Capture coordinates on the Restaurant object**

In `src/lib/external/places-client.ts`, add to the `Restaurant` interface (`:4`),
after `placeId`:

```typescript
  lat?: number;
  lng?: number;
  distanceMiles?: number;   // filled in by the caller, which knows the origin
```

In `enrichPlaceDetails` (~`:262`), add to **both** returned objects — the success
return and the `catch` fallback return:

```typescript
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
```

Places `nearbysearch` already returns `geometry.location` on every result; the
code simply never read it.

- [ ] **Step 6: Replace both mile tables with the shared one**

In `src/app/api/ai/meals/generate-restaurants/route.ts`, replace:

```typescript
    const radiusMiles = surveyData.distancePreference === 'close' ? 1.0 :
                        surveyData.distancePreference === 'far' ? 8.0 : 3.0;
```

with:

```typescript
    const radiusMiles = radiusMilesFor(surveyData.distancePreference);
```

and add `import { radiusMilesFor, milesBetween } from '@/lib/utils/distance';`.

In `src/lib/external/perplexity-client.ts` (~`:730`), replace:

```typescript
    const maxDistance = distancePreference === 'close' ? '1 mile' : distancePreference === 'far' ? '8 miles' : '3 miles';
```

with:

```typescript
    const maxDistance = `${radiusMilesFor(distancePreference)} miles`;
```

and add the same import.

In `src/lib/ai/prompts/meal-generation.ts:1198`, replace the inline ternary
`(${surveyData.distancePreference === 'close' ? 'within 2 miles' : …})` with:

```typescript
- Distance Preference: ${surveyData.distancePreference || 'medium'} (within ${radiusMilesFor(surveyData.distancePreference)} miles)
```

and add the import. **Locate first:** grep for `within 2 miles` to find the exact
line — it is inside a template literal and the surrounding text matters.

- [ ] **Step 7: Verify no mile literal survives**

Run: `grep -rn "2 miles\|5 miles\|10 miles" src/lib src/app`
Expected: no output. If anything remains, it is a third copy of the table and
belongs in `DISTANCE_RADIUS_MILES` too.

Run: `grep -rn "distancePreference === 'close'" src`
Expected: no output outside `src/lib/utils/distance.ts`.

- [ ] **Step 8: Add a real post-hoc distance check**

In `generate-restaurants/route.ts`, after `uniqueRestaurants` is built (~`:165`)
and before the selection prompt, annotate and filter:

```typescript
    // A search radius biases results; it does not bound them. Places returns by
    // prominence, and the fallback search uses its own radius. This is the only
    // place a restaurant's actual distance is ever checked.
    const origin = /* the geocoded { lat, lng } already computed for the search */;
    const withDistance = uniqueRestaurants.map(r => ({
      ...r,
      distanceMiles:
        origin && typeof r.lat === 'number' && typeof r.lng === 'number'
          ? milesBetween(origin, { lat: r.lat, lng: r.lng })
          : undefined,
    }));

    const inRange = withDistance.filter(
      // Unknown distance is kept: a missing coordinate is our gap, not the
      // restaurant's fault, and dropping it would silently shrink the pool.
      r => r.distanceMiles === undefined || r.distanceMiles <= radiusMiles
    );

    const droppedFar = withDistance.length - inRange.length;
    if (droppedFar > 0) {
      console.log(`[RESTAURANT-SEARCH] 📏 Dropped ${droppedFar} restaurant(s) beyond ${radiusMiles} miles`);
    }
```

Then use `inRange` where `uniqueRestaurants` was used downstream.

**Locate first:** the geocoded origin is computed before the nearby search — grep
for `geocodeAddress` in this file and use the variable it is assigned to. Do not
geocode a second time.

- [ ] **Step 9: Delete the GPT-invented-restaurant branch**

In the selection mapper, delete the entire `else if (selected.name && selected.address)`
branch shown in the Background above, so the chain becomes:

```typescript
      if (fullRestaurant) {
        // …unchanged…
      } else {
        console.warn(`[RESTAURANT-SEARCH] ⚠️ Dropping unmatched selection (not in the Places result set): ${selected.name}`);
      }
```

The existing final `else` already logs and drops; the invented-data branch was
sitting in front of it. There is already a guard below for the case where mapping
produces an empty array — grep for `If mapping resulted in empty array` to
confirm it still runs, since deleting this branch makes that path more reachable.

- [ ] **Step 10: Replace the substring distance scan**

In `src/lib/external/perplexity-client.ts`, delete the entire
`distanceIssueKeywords` array and the `hasDistanceIssue` block including the
early return it guards (~`:298-318`).

There is nothing to replace it with, and that is the point: Step 8 now performs
the distance check against a coordinate, before Sonar is ever called. Scanning
menu prose for the phrase `'more than'` was never a distance check — it was a
string match that happened to delete restaurants.

- [ ] **Step 11: Verify the scan is gone and nothing referenced it**

Run: `grep -n "distanceIssueKeywords\|hasDistanceIssue\|Restaurant outside distance range" src/lib/external/perplexity-client.ts`
Expected: no output.

Run: `grep -rn "Restaurant outside distance range" src`
Expected: no output. If a component matched on that error string, it needs
updating — report it rather than guessing.

- [ ] **Step 12: Verify end to end**

Run: `npx tsc --noEmit 2>&1 | grep -c "error"` — unchanged from baseline.

Then `npm run dev` and generate restaurant meals for a survey with
`distancePreference: 'close'`.

Expected in the log:
- `📏 Distance preference: close → 1 miles radius`
- a `📏 Dropped N restaurant(s) beyond 1 miles` line, or none if all were in range
- **no** `⚠️ Using GPT-provided data for:` line — that branch no longer exists
- **no** `⚠️ Distance validation failed for` line — that check no longer exists

Spot-check one returned restaurant's address in a map. It should be plausibly
within the radius. This is the check that matters; the log lines only prove the
code ran.

- [ ] **Step 13: Commit**

```bash
git add src/lib/utils/distance.ts src/lib/utils/distance.test.ts src/lib/external/places-client.ts src/lib/external/perplexity-client.ts src/lib/ai/prompts/meal-generation.ts src/app/api/ai/meals/generate-restaurants/route.ts
git commit -m "fix(restaurants): drop invented restaurants, and check distance against a coordinate

Three defects that all reduced to never having a real distance.

When placeId matching failed, the model's own restaurant object was cast through
'as unknown as Restaurant' and pushed into the result set — a business that may
not exist, at an address that may not exist. That branch is gone; an unmatched
selection is now dropped.

Two mile tables disagreed: the Places search and the Sonar prompt used 1/3/8
while the meal-selection prompt told the model 2/5/10. One table now, in
lib/utils/distance.

And the 'distance validation' was a substring scan over Sonar prose for phrases
including 'more than' and 'beyond the'. A menu reading 'more than a dozen
toppings' discarded the entire restaurant's menu. Replaced with a haversine
check against the geocoded origin, run before Sonar is called at all."
```

---

### Task 9: Use the citations we already collect

**Finding:** B5 (S2)

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` — `processWithGPT4` (~`:779`), the return at `~:337-344`
- Modify: `src/lib/external/link-check.ts` — created by Plan 2 Task 4
- Test: `src/lib/external/link-check.test.ts` — extend the file Plan 2 Task 4 created

**Interfaces:**
- Consumes: `verifyLinks(links, opts)`, `parseHttpUrl`, `hostMatchesPlatform` from `src/lib/external/link-check.ts` (Plan 2 Task 4).
- Produces: `corroborate(links: Record<string, string | null>, citations: string[]) => Record<string, 'cited' | 'uncited'>`

**Background.**

Sonar returns a `citations` array — the URLs it actually retrieved. The code
captures it (`const citations = data.citations || []` at `:291`), logs the count
at `:295`, passes it into `processWithGPT4` at `:321` where it is interpolated
into the prompt, and finally stores the first five under `sources` at `:343`.

Nothing ever compares a claimed ordering link against that list.

This matters because the citation list is the only record in the entire pipeline
of a URL that was *retrieved* rather than *generated*. Plan 2 Task 4 added a
liveness probe, which answers "does this URL resolve." Citations answer a
different and complementary question: "did the search that produced this claim
ever actually visit this host." A link that resolves but appears in no citation
is a link the model produced from memory. That is worth knowing, and it is free —
the data is already in the response object.

This task does not *reject* uncited links. A restaurant's own DoorDash page can
be perfectly real and simply not among the five URLs Sonar chose to cite.
Corroboration is recorded as a signal, not a gate. The eval harness from Plan 1
can then measure how often uncited links fail the liveness probe, and a later
decision to gate on it would be evidence-backed rather than a guess.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/external/link-check.test.ts` (created by Plan 2 Task 4):

```typescript
import { corroborate } from './link-check';

test('a link whose host appears in the citations is cited', () => {
  const result = corroborate(
    { doordash: 'https://www.doordash.com/store/fanoos-berkeley-123' },
    ['https://www.doordash.com/store/fanoos-berkeley-123', 'https://yelp.com/biz/fanoos']
  );
  assert.equal(result.doordash, 'cited');
});

test('a link on a host that appears nowhere in the citations is uncited', () => {
  const result = corroborate(
    { ubereats: 'https://www.ubereats.com/store/fanoos' },
    ['https://www.doordash.com/store/fanoos-berkeley-123']
  );
  assert.equal(result.ubereats, 'uncited');
});

test('matching is on host, not exact URL', () => {
  const result = corroborate(
    { doordash: 'https://www.doordash.com/store/fanoos-berkeley-999' },
    ['https://www.doordash.com/store/some-other-place']
  );
  // Same host, different path — the search did visit doordash.com, so this is
  // weak corroboration rather than none.
  assert.equal(result.doordash, 'cited');
});

test('a null link is omitted from the result', () => {
  const result = corroborate({ grubhub: null }, ['https://doordash.com/x']);
  assert.equal(result.grubhub, undefined);
});

test('an unparseable citation does not throw', () => {
  assert.doesNotThrow(() =>
    corroborate({ direct: 'https://fanoos.com' }, ['not a url', '', 'https://fanoos.com'])
  );
});

test('an empty citation list marks everything uncited', () => {
  const result = corroborate({ direct: 'https://fanoos.com' }, []);
  assert.equal(result.direct, 'uncited');
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx tsx --test 'src/lib/external/link-check.test.ts'`
Expected: the six new tests fail on the missing `corroborate` export; the tests
Plan 2 Task 4 wrote still pass.

- [ ] **Step 3: Implement `corroborate`**

Add to `src/lib/external/link-check.ts`:

```typescript
/**
 * Host-level match against the URLs the search actually retrieved. Weak by
 * design: same host counts. An uncited link is one the model produced without
 * the search ever having visited that host.
 */
export function corroborate(
  links: Record<string, string | null | undefined>,
  citations: string[]
): Record<string, 'cited' | 'uncited'> {
  const citedHosts = new Set<string>();
  citations.forEach(c => {
    const parsed = parseHttpUrl(c);
    if (parsed) citedHosts.add(parsed.hostname.replace(/^www\./, ''));
  });

  const out: Record<string, 'cited' | 'uncited'> = {};
  Object.entries(links).forEach(([platform, url]) => {
    if (!url) return;
    const parsed = parseHttpUrl(url);
    if (!parsed) return;
    const host = parsed.hostname.replace(/^www\./, '');
    out[platform] = citedHosts.has(host) ? 'cited' : 'uncited';
  });
  return out;
}
```

`parseHttpUrl` already returns `null` for anything that is not a parseable
http(s) URL, which is what makes the unparseable-citation test pass without a
try/catch here.

- [ ] **Step 4: Run and watch them pass**

Run: `npx tsx --test 'src/lib/external/link-check.test.ts'`
Expected: all tests pass — the six new ones and everything Plan 2 Task 4 wrote.

- [ ] **Step 5: Wire it into the menu extraction return**

In `src/lib/external/perplexity-client.ts`, the success return currently reads:

```typescript
      return {
        menuItems: structuredData.menuItems || [],
        orderingLinks: orderingLinks,
        restaurant: restaurantName,
        sources: citations.map((c: any) => c.url || c).slice(0, 5),
        extractionSuccess: (structuredData.menuItems?.length || 0) > 0,
        linksFound: linksFound
      };
```

**Locate first:** Plan 2 Tasks 4, 5 and 6 all edit this return — `orderingLinks`
may already have become `resolvedLinks`, and a `rejected` log may sit above it.
Read the current state before editing; use whatever the links variable is
actually called.

Above the return, normalise the citations once and corroborate:

```typescript
      const citationUrls: string[] = citations
        .map((c: any) => (typeof c === 'string' ? c : c?.url))
        .filter((u: any): u is string => typeof u === 'string' && u.length > 0);

      const corroboration = corroborate(resolvedLinks, citationUrls);
      const uncited = Object.entries(corroboration)
        .filter(([, v]) => v === 'uncited')
        .map(([k]) => k);
      if (uncited.length > 0) {
        console.log(`[PERPLEXITY] 📎 Uncited links (host not in search results): ${uncited.join(', ')}`);
      }
```

and add to the returned object:

```typescript
        sources: citationUrls.slice(0, 5),
        linkCorroboration: corroboration,
```

Note `sources` now uses `citationUrls`, which drops entries that were neither a
string nor an object with a `url`. The previous `c.url || c` would push a whole
citation object into `sources` when it had no `url` key, producing `[object
Object]` downstream.

- [ ] **Step 6: Add the field to the response type**

`PerplexityMenuResponse` is the interface this return satisfies. Add:

```typescript
  linkCorroboration?: Record<string, 'cited' | 'uncited'>;
```

**Locate first:** grep for `interface PerplexityMenuResponse` — it is in the same
file. Confirm the early-return error paths still type-check; the field is
optional so they should need no change.

- [ ] **Step 7: Verify against a live call**

Run `npm run dev`, generate restaurant meals, and watch for
`[PERPLEXITY] 📎 Uncited links` lines. Some are expected — most restaurants'
DoorDash pages are not among Sonar's five citations. What you are checking is
that the line appears with plausible platform names and does not list every
platform every time (which would mean the host normalisation is broken) or none
of them ever (which would mean `citationUrls` is empty and the parse is wrong).

Cross-check one run: pick a link the log called `cited` and confirm its host
appears in the `sources` array of the saved response.

- [ ] **Step 8: Commit**

```bash
git add src/lib/external/link-check.ts src/lib/external/link-check.test.ts src/lib/external/perplexity-client.ts
git commit -m "feat(restaurants): corroborate ordering links against the citations we already had

Sonar returns the URLs it actually retrieved. We captured them, logged the count,
interpolated them into a prompt, stored five of them under 'sources' — and never
compared a single claimed ordering link against the list.

Citations answer a question the liveness probe cannot: not 'does this URL
resolve' but 'did the search that produced this claim ever visit this host'. A
link that resolves but is uncited came from the model's memory.

Recorded as a signal, not a gate — a real DoorDash page often isn't among the
five cited URLs. The eval harness can now measure how often uncited links fail
the probe, so any future decision to reject them is evidence-backed.

Also fixes 'sources' pushing [object Object] when a citation had no url key."
```

---

### Task 10: Show the violations we detect, and stop showing numbers we invented

**Findings:** B13 (S3), B14 (S2)

**Files:**
- Modify: `src/app/api/ai/meals/generate-restaurants/route.ts` — `updatedContext` (~`:881`) and `completePlan` (~`:918`)
- Modify: `src/components/dashboard/MealPlanPage.tsx` — the restaurant aggregation block (~`:2295-2348`)
- Test: `src/lib/utils/restaurant-facts.test.ts` (new)
- Create: `src/lib/utils/restaurant-facts.ts`

**Interfaces:**
- Consumes: `Restaurant` from `@/lib/external/places-client`, now carrying `lat`, `lng` and `distanceMiles` after Task 8.
- Produces: `buildRestaurantFacts(restaurants: Restaurant[]) => Record<string, RestaurantFacts>` where
  `RestaurantFacts = { rating: number | null; distanceMiles: number | null; address: string | null; userRatingsTotal: number | null }`,
  keyed on the lowercased restaurant name.

**Background.**

*B14 is the more visible of the two.* `MealPlanPage.tsx:2310` and `:2332`:

```typescript
                      rating: 4.2,
                      …
                      estimatedOrderTime: '25-40 min',
                      …
                      distance: 2.5
```

Every restaurant on the Restaurants tab displays a 4.2 rating, a 2.5-mile
distance and a 25–40 minute order time. None of the three is real. The 4.2 is
particularly bad because a genuine Google rating **was** fetched — `enrichPlaceDetails`
sets `rating: place.rating || 0` and `userRatingsTotal`, and the selection mapper
goes out of its way to preserve it with an explicit
`rating: fullRestaurant.rating, // Explicitly preserve rating from original Google Places data`.
That real number is then discarded at render time in favour of a literal.

The reason it gets discarded is structural: `RestaurantMealObject` in
`src/lib/ai/schemas/restaurants.ts:16-30` carries `restaurant` (a name string),
`dish`, `price`, `address`, `cuisine` — and no rating and no distance. The meal
object is a model output, so those fields *should not* be on it; adding them
would ask the model to invent a rating, which is exactly the B8 mistake. The
facts belong on a side channel, carried from Places to the client without passing
through a model.

`estimatedOrderTime` has no source at all — not Places, not Sonar. It is deleted,
not replaced.

*B13.* `restrictionViolations` is computed at `:804`, merged into `updatedContext`
at `:885-888` and written into `completePlan` at `:922`. `grep -rn
"restrictionViolations" src` outside the generation routes returns nothing: no
component reads it. The app detects that a selected dish violates a user's
dietary restriction, records it in the database, and shows the dish anyway with
no marker. After Plan 2 Task 1 expanded `RESTRICTION_MAPPINGS` from two diets to
nine, this detector will start firing far more often — which makes an unread
field actively worse than it was.

- [ ] **Step 1: Write the failing facts tests**

Create `src/lib/utils/restaurant-facts.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRestaurantFacts } from './restaurant-facts';

const places = [
  { name: "Fanoos", rating: 4.6, userRatingsTotal: 820, address: '1000 Shattuck Ave', distanceMiles: 0.8 },
  { name: "Gregoire", rating: 0, userRatingsTotal: 0, address: '2109 Cedar St', distanceMiles: 1.4 },
] as any[];

test('keys are lowercased names', () => {
  const facts = buildRestaurantFacts(places);
  assert.ok(facts['fanoos']);
});

test('a real rating survives', () => {
  assert.equal(buildRestaurantFacts(places)['fanoos'].rating, 4.6);
});

test('a zero rating becomes null rather than being shown as 0', () => {
  assert.equal(buildRestaurantFacts(places)['gregoire'].rating, null);
});

test('distance is carried through', () => {
  assert.equal(buildRestaurantFacts(places)['fanoos'].distanceMiles, 0.8);
});

test('a missing distance becomes null, not a default', () => {
  const facts = buildRestaurantFacts([{ name: 'X', rating: 4.1, address: 'a' } as any]);
  assert.equal(facts['x'].distanceMiles, null);
});

test('an entry with no name is skipped rather than keyed on undefined', () => {
  const facts = buildRestaurantFacts([{ rating: 4.1 } as any]);
  assert.equal(Object.keys(facts).length, 0);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx tsx --test 'src/lib/utils/restaurant-facts.test.ts'`
Expected: module not found.

- [ ] **Step 3: Create the module**

Create `src/lib/utils/restaurant-facts.ts`:

```typescript
import type { Restaurant } from '@/lib/external/places-client';

export interface RestaurantFacts {
  rating: number | null;
  userRatingsTotal: number | null;
  distanceMiles: number | null;
  address: string | null;
}

/**
 * Places-sourced facts, keyed by lowercased restaurant name, carried alongside
 * the model-authored meal objects rather than on them. Putting a rating on a
 * model output would ask the model to invent one.
 *
 * null means "we do not know", and the UI renders nothing. It never means zero.
 */
export function buildRestaurantFacts(
  restaurants: Array<Partial<Restaurant> & { distanceMiles?: number }>
): Record<string, RestaurantFacts> {
  const out: Record<string, RestaurantFacts> = {};
  restaurants.forEach(r => {
    const name = r?.name?.toLowerCase().trim();
    if (!name) return;
    out[name] = {
      rating: typeof r.rating === 'number' && r.rating > 0 ? r.rating : null,
      userRatingsTotal:
        typeof r.userRatingsTotal === 'number' && r.userRatingsTotal > 0 ? r.userRatingsTotal : null,
      distanceMiles: typeof r.distanceMiles === 'number' ? r.distanceMiles : null,
      address: r.address || null,
    };
  });
  return out;
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx tsx --test 'src/lib/utils/restaurant-facts.test.ts'`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: Persist the facts**

In `generate-restaurants/route.ts`, before the `updatedContext` object is built,
add:

```typescript
        const restaurantFacts = buildRestaurantFacts(selectedRestaurants);
```

and add `restaurantFacts,` as a key to **both** `updatedContext` (~`:881`) and
`completePlan` (~`:918`). Both write into `userContext`, so the client reads the
same shape either way.

Add `import { buildRestaurantFacts } from '@/lib/utils/restaurant-facts';`.

**Note:** `selectedRestaurants` carries `distanceMiles` only after Task 8 Step 8
annotated it. If Task 8 has not been executed, every `distanceMiles` will be
`null` and the UI will simply omit distance — degraded, not wrong. Do not add a
fallback distance to compensate; a fabricated distance is the bug being fixed.

- [ ] **Step 6: Render real facts, or nothing**

In `src/components/dashboard/MealPlanPage.tsx`, in the restaurant aggregation
block, replace each of the two literal groups.

The lookup, added once above `restaurantMeals.forEach`:

```typescript
              const facts = (userContext?.restaurantFacts || {}) as Record<string, any>;
              const factsFor = (name: string) => facts[(name || '').toLowerCase().trim()] || {};
```

**Locate first:** the variable holding the parsed `userContext` in this component
may not be named `userContext`. Grep upward from `:2295` for where
`restaurantMeals` is derived and use that same source object.

Then in the primary branch (~`:2306-2317`), replace:

```typescript
                      rating: 4.2,
```
with
```typescript
                      rating: factsFor(primaryRestaurant).rating ?? null,
                      userRatingsTotal: factsFor(primaryRestaurant).userRatingsTotal ?? null,
```

replace:
```typescript
                      distance: 2.5
```
with
```typescript
                      distance: factsFor(primaryRestaurant).distanceMiles ?? null
```

and **delete** the `estimatedOrderTime: '25-40 min',` line outright. No API in
this pipeline returns a delivery estimate; there is nothing to replace it with.

Apply the identical three changes in the alternative branch (~`:2328-2339`),
using `altRestaurant`.

- [ ] **Step 7: Make the renderer tolerate null**

Grep for the JSX that consumes these — `rating`, `distance` and
`estimatedOrderTime` are read somewhere below the aggregation. Guard each:

```tsx
{restaurant.rating != null && (
  <span>{restaurant.rating.toFixed(1)}{restaurant.userRatingsTotal != null ? ` (${restaurant.userRatingsTotal})` : ''}</span>
)}
{restaurant.distance != null && <span>{restaurant.distance.toFixed(1)} mi</span>}
```

and remove the `estimatedOrderTime` element and any icon or separator that only
existed to sit beside it. A dangling separator with nothing after it is how this
kind of change looks broken.

**Do not** substitute an em-dash or "N/A" placeholder. Absent is correct; the
whole finding is that we showed something where we knew nothing.

- [ ] **Step 8: Surface restriction violations**

Still in `MealPlanPage.tsx`, `restrictionViolations` is already on
`userContext`. Above the restaurant list, render a banner when it is non-empty:

```tsx
{(userContext?.restrictionViolations?.length ?? 0) > 0 && (
  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    <p className="font-medium">Some picks may not match your restrictions</p>
    <ul className="mt-1 list-disc pl-5">
      {userContext.restrictionViolations.slice(0, 5).map((v: any, i: number) => (
        <li key={i}>{typeof v === 'string' ? v : v.message || v.dish || JSON.stringify(v)}</li>
      ))}
    </ul>
  </div>
)}
```

**Locate first:** read one real `restrictionViolations` entry before writing this
— `restriction-validator.ts`'s `violations` array shape decides whether
`v.message` or `v.dish` is the right field, and the `typeof v === 'string'` arm
exists only because the shape has not been confirmed. Once you have read it,
narrow the expression to the actual field and delete the `JSON.stringify`
fallback. Shipping `JSON.stringify` into user-visible text is the same class of
error as `[object Object]` in `sources`.

Check whether an equivalent banner already exists for home meals — `grep -n
"restrictionViolations" src/components/dashboard/MealPlanPage.tsx`. If one does,
reuse its component rather than adding a second style of warning.

- [ ] **Step 9: Verify no fabricated literal survives**

Run: `grep -n "4\.2\|2\.5\|25-40 min" src/components/dashboard/MealPlanPage.tsx`
Expected: no output.

- [ ] **Step 10: Verify in the browser**

Run `npm run dev`, generate restaurant meals, open the Restaurants tab.

Expected:
- Ratings vary between restaurants and match what Google shows for those
  businesses. Spot-check two against Google Maps.
- Distances vary and are plausible for the chosen `distancePreference`.
- No order-time element anywhere.
- A restaurant Places gave no rating for shows no rating, with no layout gap or
  orphaned separator.
- If the survey has a restriction the picks violate, the amber banner appears.
  Force this by generating for a survey with `dietPrefs: ['vegan']` — after Plan 2
  Task 1, vegan is a mapped restriction, so violations should actually fire.

- [ ] **Step 11: Commit**

```bash
git add src/lib/utils/restaurant-facts.ts src/lib/utils/restaurant-facts.test.ts src/app/api/ai/meals/generate-restaurants/route.ts src/components/dashboard/MealPlanPage.tsx
git commit -m "fix(restaurants): show the real rating and drop the invented ones

Every restaurant on the Restaurants tab displayed rating 4.2, distance 2.5 mi and
'25-40 min'. All three literals. The rating is the galling one — Places returns a
real rating, enrichPlaceDetails stores it, and the selection mapper has a comment
explaining that it explicitly preserves it, after which the renderer threw it away
for a constant.

Places facts now travel on a side channel keyed by restaurant name, not on the
model-authored meal object, because putting a rating on a model output would just
ask the model to invent one. Unknown renders as absent, never as zero and never as
a placeholder. estimatedOrderTime is deleted — nothing in this pipeline returns a
delivery estimate.

Also surfaces restrictionViolations, which was computed, written to the database,
and read by no component. Plan 2 Task 1 took RESTRICTION_MAPPINGS from two diets
to nine, so that detector is about to start firing much more often."
```

---

### Task 11: Constrain the menu search itself

**Finding:** B3 (S1, deferred from Plan 2 by mechanism)

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` — the Sonar request body (~`:250-290`)
- Modify: `src/lib/ai/prompts/restaurant-menu.ts` — created by Plan 2 Task 2
- Create: `src/lib/ai/schemas/menu-search.ts`

**Interfaces:**
- Consumes: the prompt module from Plan 2 Task 2, `MenuExtractionSchema` from `src/lib/ai/schemas/restaurants.ts` (with `estimatedCarbs`/`estimatedFat` added by Plan 2 Task 3).
- Produces: `MenuSearchSchema` — the Sonar-side response schema.

**Precondition:** `src/lib/ai/prompts/restaurant-menu.ts` must exist. Run
`ls src/lib/ai/prompts/restaurant-menu.ts` first; if it is missing, Plan 2 Task 2
has not been executed and this task cannot proceed.

**Background.**

Plan 2 closed B1, B2 and B6 by testing the *artifact*: a link now has to parse,
match its platform's host, and survive an HTTP probe. That makes provenance much
less load-bearing than it was — a link that passes those checks is fine
regardless of where it came from.

What Plan 2 did not change is B3's mechanism. The Sonar call passes no
`response_format`, so it returns free prose. A second model, `processWithGPT4`,
is then asked to structure prose that the first model may itself have
fabricated. Every ordering link is therefore two model hops from any HTTP
response, and the second hop cannot distinguish "Sonar read this off the
restaurant's page" from "Sonar wrote a plausible sentence."

Perplexity's API is OpenAI-compatible and supports `response_format` with a JSON
schema. The grocery store call in this same file already uses it — that is the
in-repo precedent, and it is why this is a change of configuration rather than of
architecture.

Constraining Sonar directly collapses two hops to one. Whether it lets us delete
`processWithGPT4` entirely is an open question this task answers with a
measurement rather than a guess, because that function also enforces the dietary
exclusions (`perplexity-client.ts:571-601` per `CLAUDE.md`) and Plan 2 Task 2
moved its prompt but not its logic.

- [ ] **Step 1: Find the existing precedent and copy its shape**

Run: `grep -n "response_format" src/lib/external/perplexity-client.ts`

Read the grocery store call's request body in full. Note exactly how the schema
is passed — whether through `toStrictJsonSchema` or a hand-built object, and
whether Perplexity is being sent `strict: true`. Match that form. Do not invent a
second convention in the same file.

- [ ] **Step 2: Define the Sonar-side schema**

Create `src/lib/ai/schemas/menu-search.ts`:

```typescript
import { z } from 'zod';
import { OrderingLinks } from './shared';

/**
 * What Sonar returns directly. Deliberately looser than MenuExtractionSchema:
 * this is a search result, so price and calories are what the page said, and
 * anything the page did not say is null rather than estimated. The estimating
 * happens downstream where it can be labelled as an estimate.
 */
export const MenuSearchSchema = z.object({
  menuItems: z.array(z.object({
    name: z.string(),
    price: z.number().nullable(),
    description: z.string(),
    // Null when the menu did not publish it. Do not estimate here.
    statedCalories: z.number().nullable(),
    sourceUrl: z.string().nullable(),
  }).strict()).min(1).max(40),
  orderingLinks: OrderingLinks,
}).strict();
```

Strict mode forbids optionals, which is why every unknown is `.nullable()`
rather than `.optional()` — the established workaround in this repo.

The array is bounded `.min(1).max(40)` rather than pinned with `exactly()`.
Pinning is only safe when the prompt enumerates the exact count, and a menu
search cannot know in advance how many dishes a restaurant has. Pinning here
would force the model to invent filler dishes to close the array — the failure
mode Task 12 of Plan 2 removed from the grocery path.

- [ ] **Step 3: Attach it to the Sonar request**

In `perplexity-client.ts`, add `response_format` to the menu search request body,
in whatever form Step 1 established. Add the import.

**Locate first:** grep for the `sonar` model name to find the correct request
body — this file makes more than one Perplexity call and only the menu one is in
scope.

- [ ] **Step 4: Measure whether the extra hop still earns its place**

Do not delete `processWithGPT4` yet. Run both and compare.

Add a temporary log immediately after the Sonar response parses:

```typescript
      console.log(`[PERPLEXITY] 🔬 Sonar direct: ${parsed.menuItems.length} items, ${Object.values(parsed.orderingLinks).filter(Boolean).length} links`);
```

and immediately after `processWithGPT4` returns:

```typescript
      console.log(`[PERPLEXITY] 🔬 After GPT-4: ${structuredData.menuItems?.length || 0} items, ${linksFound} links`);
```

Run `npm run dev` and generate restaurant meals **five times**, recording both
lines each run. You are answering three questions:

1. Does Sonar's constrained output contain the items and links at all, or does
   constraining it cost recall?
2. Do the links that survive Plan 2 Task 6's `verifyLinks` probe come more often
   from the Sonar-direct set or the GPT-4 set?
3. Does GPT-4 ever *add* a link Sonar did not return? Any link it adds is by
   definition invented — Sonar is the only component with search access.

- [ ] **Step 5: Decide, and record the decision**

Two outcomes, and both are acceptable results for this task:

**If GPT-4 adds links Sonar did not return, and those links fail the probe more
often** — remove link extraction from `processWithGPT4` and take
`orderingLinks` from the Sonar response only. Keep `processWithGPT4` for the
dietary-exclusion filtering and the calorie/macro estimation, which are real work
it does that Sonar's search cannot.

**If the two agree** — keep both, and record that the second hop is not currently
introducing links. Add the finding to the commit body.

⚠️ **Whichever you choose, do not delete `processWithGPT4` wholesale.**
`CLAUDE.md` is explicit: dietary exclusions for vegan, halal and coeliac users
are enforced inside that function at `:571-601`, not in the Sonar prompt.
Removing it without moving that logic silently breaks dietary filtering for the
users it matters most to. If you conclude the function should go, its exclusion
logic must move first, as its own commit, with its own verification.

- [ ] **Step 6: Remove the temporary logs**

Run: `grep -n "🔬" src/lib/external/perplexity-client.ts`
Expected after cleanup: no output. Record the five runs' numbers in the commit
body instead — that is where the measurement belongs, not in the shipped code.

- [ ] **Step 7: Verify the constrained call still works end to end**

Run `npm run dev`, generate restaurant meals, and confirm:
- menu items appear for at least as many restaurants as before the change
- `[PERPLEXITY] 🎯 Extracted N menu items` shows a plausible N (not 1, not 40)
- no parse failures in the log
- the dietary filtering still fires — generate once with `dietPrefs: ['vegan']`
  and confirm no meat dish is selected

That last check is the one that catches the failure mode `CLAUDE.md` warns about.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai/schemas/menu-search.ts src/lib/external/perplexity-client.ts src/lib/ai/prompts/restaurant-menu.ts
git commit -m "fix(restaurants): constrain the menu search instead of structuring its prose

The Sonar call passed no response_format, so it returned prose, and a second
model was asked to structure prose the first may have fabricated. Every ordering
link was two model hops from any HTTP response, and the second hop could not tell
a retrieved fact from a plausible sentence.

Perplexity's API is OpenAI-compatible and the grocery store call in this same
file already sends a json_schema, so this is configuration, not architecture.

The schema is bounded 1..40 rather than pinned — a menu search cannot know a
restaurant's dish count in advance, and pinning would force invented filler to
close the array.

processWithGPT4 stays. It holds the dietary-exclusion enforcement for vegan,
halal and coeliac users, which the Sonar prompt does not."
```

---

## Section C — Groceries

Plan 2 closed C7 and C8 — the pinned three-store schema that made hallucination a
contract requirement, and the false comment claiming Places reconciled store
addresses. What remains is the price path: a cheapest-store ranking that rewards
incompleteness, a partial run reported as complete, and prices with no bound and
no provenance.

---

### Task 12: Make the cheapest-store comparison mean something

**Findings:** C4 (S2), C3 (S2)

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` — `getGroceryPrices` totals block (~`:541-566`)
- Create: `src/lib/utils/store-totals.ts`
- Test: `src/lib/utils/store-totals.test.ts`

**Interfaces:**
- Produces:
  - `canonicalStoreKey(name: string) => string`
  - `computeStoreTotals(items: PricedItem[]) => { totals: StoreTotal[]; comparableItemCount: number; skippedStores: string[] }`
  - `StoreTotal = { store: string; total: number; itemCount: number; comparable: boolean }`

**Background.**

The current computation:

```typescript
    const totalsByStore = new Map<string, number>();
    for (const item of pricedItems) {
      for (const option of item.storeOptions) {
        totalsByStore.set(option.store, (totalsByStore.get(option.store) || 0) + (option.price || 0));
      }
    }
    const storeTotals = [...totalsByStore.entries()]
      .map(([store, total]) => ({ store, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => a.total - b.total);

    const cheapest = storeTotals[0];
```

Two defects compound.

*C4.* `option.store` is a raw model string. Nothing normalises it. `"Trader Joe's"`
and `"Trader Joes"` are different map keys, so one store's basket splits across two
entries, each holding roughly half the items and therefore roughly half the total.
Then the split half wins the cheapest-store comparison, because half a basket costs
less than a whole one.

*C3.* Even with perfect keys, the sum is over *whatever items that store happened to
be priced for*. A store the model priced for 12 of 40 items totals 12 items' worth.
It is not cheaper — it is less complete. `cheapest = storeTotals[0]` therefore
systematically recommends the store with the worst coverage. `savings` compounds it:
`dearest.total - cheapest.total` is the difference between a 40-item basket and a
12-item one, presented to the user as money they would save.

The fix is to compare over the **intersection**: only items every candidate store
priced. A store that priced too few items is excluded from the ranking rather than
winning it.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/store-totals.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalStoreKey, computeStoreTotals } from './store-totals';

test('possessives and punctuation collapse to one key', () => {
  assert.equal(canonicalStoreKey("Trader Joe's"), canonicalStoreKey('Trader Joes'));
  assert.equal(canonicalStoreKey('Whole Foods Market'), canonicalStoreKey('whole foods market'));
});

test('a store suffix does not collapse two different stores', () => {
  assert.notEqual(canonicalStoreKey('Safeway'), canonicalStoreKey('Sprouts'));
});

test('the cheapest store is chosen over a comparable basket, not a smaller one', () => {
  const items = [
    { item: 'chicken', storeOptions: [{ store: 'Safeway', price: 10 }, { store: 'Lucky', price: 8 }] },
    { item: 'rice',    storeOptions: [{ store: 'Safeway', price: 4 },  { store: 'Lucky', price: 3 }] },
    // Lucky was not priced for spinach, so spinach is outside the comparison.
    { item: 'spinach', storeOptions: [{ store: 'Safeway', price: 5 }] },
  ] as any[];

  const { totals } = computeStoreTotals(items);
  const safeway = totals.find(t => t.store === 'Safeway')!;
  const lucky = totals.find(t => t.store === 'Lucky')!;

  // Comparison is over chicken + rice only: Safeway 14, Lucky 11.
  assert.equal(safeway.total, 14);
  assert.equal(lucky.total, 11);
  assert.ok(safeway.comparable && lucky.comparable);
});

test('a store priced for too few items is marked not comparable', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: 'Big', price: 1 }, { store: 'Sparse', price: 1 }] },
    { item: 'b', storeOptions: [{ store: 'Big', price: 1 }] },
    { item: 'c', storeOptions: [{ store: 'Big', price: 1 }] },
    { item: 'd', storeOptions: [{ store: 'Big', price: 1 }] },
  ] as any[];

  const { totals, skippedStores } = computeStoreTotals(items);
  assert.ok(skippedStores.includes('Sparse'));
  assert.equal(totals.find(t => t.store === 'Sparse')?.comparable, false);
});

test('a split store name is summed as one store', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: "Trader Joe's", price: 5 }] },
    { item: 'b', storeOptions: [{ store: 'Trader Joes', price: 5 }] },
  ] as any[];
  const { totals } = computeStoreTotals(items);
  assert.equal(totals.length, 1);
  assert.equal(totals[0].total, 10);
  assert.equal(totals[0].itemCount, 2);
});

test('comparableItemCount reports the size of the intersection', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: 'X', price: 1 }, { store: 'Y', price: 1 }] },
    { item: 'b', storeOptions: [{ store: 'X', price: 1 }, { store: 'Y', price: 1 }] },
    { item: 'c', storeOptions: [{ store: 'X', price: 1 }] },
  ] as any[];
  assert.equal(computeStoreTotals(items).comparableItemCount, 2);
});

test('no items yields empty totals rather than throwing', () => {
  const { totals, comparableItemCount } = computeStoreTotals([]);
  assert.deepEqual(totals, []);
  assert.equal(comparableItemCount, 0);
});

test('a single store is comparable with itself', () => {
  const items = [{ item: 'a', storeOptions: [{ store: 'Solo', price: 3 }] }] as any[];
  const { totals } = computeStoreTotals(items);
  assert.equal(totals[0].comparable, true);
  assert.equal(totals[0].total, 3);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx tsx --test 'src/lib/utils/store-totals.test.ts'`
Expected: module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/utils/store-totals.ts`:

```typescript
export interface StoreTotal {
  store: string;
  total: number;
  itemCount: number;
  comparable: boolean;
}

interface PricedItemLike {
  item?: string;
  storeOptions: Array<{ store: string; price?: number }>;
}

export function canonicalStoreKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A store priced for less than this share of the priced items is not being
// compared, it is being sampled. Excluded from the ranking rather than allowed
// to win it on a short basket.
const MIN_COVERAGE = 0.6;

/**
 * Totals over the intersection of items every comparable store priced.
 *
 * Summing each store over whatever it happened to be priced for made the
 * cheapest-store recommendation a coverage ranking in disguise: a store priced
 * for 12 of 40 items totalled 12 items' worth and won.
 */
export function computeStoreTotals(items: PricedItemLike[]): {
  totals: StoreTotal[];
  comparableItemCount: number;
  skippedStores: string[];
} {
  if (items.length === 0) return { totals: [], comparableItemCount: 0, skippedStores: [] };

  // canonical key -> display name (first spelling wins) and the set of item
  // indexes that store priced.
  const displayName = new Map<string, string>();
  const pricedIndexes = new Map<string, Set<number>>();
  const priceAt = new Map<string, Map<number, number>>();

  items.forEach((item, index) => {
    item.storeOptions?.forEach(option => {
      const key = canonicalStoreKey(option.store);
      if (!key) return;
      if (!displayName.has(key)) displayName.set(key, option.store);
      if (!pricedIndexes.has(key)) pricedIndexes.set(key, new Set());
      if (!priceAt.has(key)) priceAt.set(key, new Map());
      pricedIndexes.get(key)!.add(index);
      // A store listed twice for the same item keeps its first price rather
      // than double-counting it into the total.
      if (!priceAt.get(key)!.has(index)) {
        priceAt.get(key)!.set(index, option.price || 0);
      }
    });
  });

  const keys = [...pricedIndexes.keys()];
  const maxCoverage = Math.max(...keys.map(k => pricedIndexes.get(k)!.size));

  const comparableKeys = keys.filter(
    k => pricedIndexes.get(k)!.size >= maxCoverage * MIN_COVERAGE
  );
  const skippedStores = keys
    .filter(k => !comparableKeys.includes(k))
    .map(k => displayName.get(k)!);

  // The intersection across comparable stores only.
  const intersection: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (comparableKeys.every(k => pricedIndexes.get(k)!.has(i))) intersection.push(i);
  }

  const totals: StoreTotal[] = keys.map(k => {
    const comparable = comparableKeys.includes(k);
    const indexes = comparable ? intersection : [...pricedIndexes.get(k)!];
    const total = indexes.reduce((sum, i) => sum + (priceAt.get(k)!.get(i) || 0), 0);
    return {
      store: displayName.get(k)!,
      total: Math.round(total * 100) / 100,
      itemCount: indexes.length,
      comparable,
    };
  });

  // Comparable stores first, then by price. A non-comparable store can never
  // be totals[0] and therefore can never be recommended.
  totals.sort((a, b) => {
    if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
    return a.total - b.total;
  });

  return { totals, comparableItemCount: intersection.length, skippedStores };
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx tsx --test 'src/lib/utils/store-totals.test.ts'`
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Replace the totals block**

In `src/lib/external/perplexity-client.ts`, replace the whole block from
`const totalsByStore = new Map<string, number>();` through the `savings`
assignment with:

```typescript
    const { totals: storeTotals, comparableItemCount, skippedStores } =
      computeStoreTotals(pricedItems);

    if (skippedStores.length > 0) {
      console.warn(`[PERPLEXITY-GROCERY] ⚠️ Excluded from price comparison (too few items priced): ${skippedStores.join(', ')}`);
    }
    console.log(`[PERPLEXITY-GROCERY] ⚖️ Comparing ${storeTotals.filter(t => t.comparable).length} store(s) over ${comparableItemCount} shared item(s)`);

    const comparable = storeTotals.filter(t => t.comparable);
    const cheapest = comparable[0];
    const dearest = comparable[comparable.length - 1];
    const savings = cheapest && dearest && comparable.length > 1 && dearest.total > cheapest.total
      ? `Save $${(dearest.total - cheapest.total).toFixed(2)} on ${comparableItemCount} shared items vs ${dearest.store}`
      : '';
```

The savings string now names the basket it is talking about. Previously it read
`Save $16.50 vs Store X` where the two totals covered different item sets, so the
figure was not a saving at all.

Keep the existing comment above the block explaining why totals are summed
locally rather than taken from the model — it is still true and still the reason
the code is here.

Add `import { computeStoreTotals } from '@/lib/utils/store-totals';`.

- [ ] **Step 6: Widen the response type**

`GroceryPriceResponse` declares `storeTotals: { store: string; total: number }[]`
(~`:142`). Change it to:

```typescript
  storeTotals: { store: string; total: number; itemCount: number; comparable: boolean }[];
  comparableItemCount?: number;
```

and add `comparableItemCount,` to the success return. The zero-priced-items early
return at `~:526` sets `storeTotals: []`, which still satisfies the type.

- [ ] **Step 7: Verify the UI still renders**

`src/components/dashboard/GroceryListSection.tsx` reads `storeTotals`. Grep for it
there and confirm the added fields do not break the render. If the component maps
over `storeTotals`, consider filtering to `t.comparable` — but do not redesign the
component in this task; if a change is needed beyond a filter, note it and report.

- [ ] **Step 8: Verify against a real run**

Run `npm run dev`, generate a home meal plan (which triggers the grocery lookup
via Task 7's `after()`), and read the log.

Expected: a `⚖️ Comparing N store(s) over M shared item(s)` line where M is
meaningfully large — if M is 0 or 1, the stores share almost no items, which is
itself a finding worth reporting rather than a bug in this code.

Cross-check the arithmetic by hand: take the recommended store, add up its prices
for the shared items shown in the UI, and confirm it matches `total`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/store-totals.ts src/lib/utils/store-totals.test.ts src/lib/external/perplexity-client.ts
git commit -m "fix(groceries): compare stores over the same basket

The cheapest-store recommendation was a coverage ranking wearing a price
ranking's clothes. Each store was summed over whatever items it happened to be
priced for, so a store priced for 12 of 40 items totalled 12 items' worth and
won — it was not cheaper, it was less complete. And the savings line subtracted
those two different baskets and showed the difference as money.

Compounding it, store names were raw model strings, so \"Trader Joe's\" and
\"Trader Joes\" were two map keys splitting one basket in half, which is another
way to win on a short total.

Names are now canonicalised, totals are computed over the intersection of items
every comparable store priced, and a store with under 60% coverage is excluded
from the ranking rather than topping it."
```

---

### Task 13: Report a partial price run as partial, and stop the chunk size growing without limit

**Findings:** C5 (S2), C6 (S3)

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` — `getGroceryPrices` (~`:497-568`)
- Modify: `src/app/api/ai/meals/generate-groceries/route.ts` — the success return (~`:255-265`)
- Modify: `src/components/dashboard/GroceryListSection.tsx` — the `priceSearchSuccess` branches (~`:165`, `:181`)
- Test: extend `src/lib/utils/store-totals.test.ts`

**Background.**

*C5.* `getGroceryPrices` returns `priceSearchSuccess: true` on any non-empty
result. The code directly above it knows better:

```typescript
    if (failures.length > 0) {
      console.warn(`[PERPLEXITY-GROCERY] ⚠️ ${failures.length}/${chunks.length} chunk(s) failed — pricing ${pricedItems.length}/${items.length} items`);
    }
```

It counts the failures, logs them, and then reports unqualified success. The
route copies that through as `priceSearchSuccess: true` at `:263`, and
`GroceryListSection.tsx:165` renders the full-success state on
`priceSearchSuccess === true`. A run where two of three chunks timed out — two
thirds of the list unpriced — is presented identically to a complete one.

Note this is not the same defect as the unpriced-item carry-through, which is
already handled well: the route keeps unpriced originals rather than dropping
them, with a good comment explaining why. The items survive. What does not
survive is any signal that they are unpriced *because something failed*.

*C6.* `const chunkSize = Math.max(15, Math.ceil(items.length / PERPLEXITY_MAX_CONCURRENT));`

The floor is deliberate and documented — it keeps short lists as one request.
There is no ceiling. Because the divisor is the concurrency limit, the chunk
*count* stays at three and the chunk *size* grows without bound: 120 items gives
three requests of 40, 300 items gives three of 100. Each request carries every
item in its chunk across every store in one prompt. Past roughly 90 items this
rebuilds precisely the timeout the chunking was introduced to avoid, and the
symptom is a chunk failure — which, per C5, is then reported as success.

The two findings are one story, which is why they share a task.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/store-totals.test.ts`:

```typescript
import { planPriceChunks } from './store-totals';

test('a short list stays a single request', () => {
  assert.equal(planPriceChunks(12).chunkSize, 15);
  assert.equal(planPriceChunks(12).chunkCount, 1);
});

test('a medium list splits across the concurrency limit', () => {
  const { chunkSize, chunkCount } = planPriceChunks(60);
  assert.equal(chunkSize, 20);
  assert.equal(chunkCount, 3);
});

test('a long list adds chunks rather than growing them past the ceiling', () => {
  const { chunkSize, chunkCount } = planPriceChunks(300);
  assert.ok(chunkSize <= 40, `chunk size ${chunkSize} exceeds the ceiling`);
  assert.ok(chunkCount > 3, 'a 300-item list should need more than 3 chunks');
});

test('the ceiling is where the old formula started timing out', () => {
  // 120 items used to produce 3 requests of 40; anything larger grew from there.
  assert.ok(planPriceChunks(120).chunkSize <= 40);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx tsx --test 'src/lib/utils/store-totals.test.ts'`
Expected: the four new tests fail on the missing export; the eight from Task 12
still pass.

- [ ] **Step 3: Add the chunk planner**

Add to `src/lib/utils/store-totals.ts`:

```typescript
// Below this, chunking costs more in round trips than it saves.
const MIN_CHUNK = 15;
// Above this, one request carries too many items across too many stores and
// reconstructs the timeout the chunking was introduced to avoid. Past this
// point the list gets more chunks, not bigger ones — they queue past the
// concurrency limit, which is slower than three requests but finishes.
const MAX_CHUNK = 40;

export function planPriceChunks(
  itemCount: number,
  maxConcurrent = 3
): { chunkSize: number; chunkCount: number } {
  const even = Math.ceil(itemCount / maxConcurrent);
  const chunkSize = Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, even));
  return { chunkSize, chunkCount: Math.max(1, Math.ceil(itemCount / chunkSize)) };
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx tsx --test 'src/lib/utils/store-totals.test.ts'`
Expected: 12 pass, 0 fail.

- [ ] **Step 5: Use the planner**

In `getGroceryPrices`, replace:

```typescript
    const chunkSize = Math.max(15, Math.ceil(items.length / PERPLEXITY_MAX_CONCURRENT));
```

with:

```typescript
    const { chunkSize } = planPriceChunks(items.length, PERPLEXITY_MAX_CONCURRENT);
```

Add `planPriceChunks` to the `store-totals` import added in Task 12.

Update the doc comment above the function. It currently says *"At most 3 chunks,
matching PERPLEXITY_MAX_CONCURRENT, so they issue as one wave rather than
queueing behind each other."* That is no longer true above 120 items, and leaving
a false comment in place is the C8 mistake. Replace that sentence with:

```
   * Three chunks up to 120 items, so they issue as one wave. Past that the
   * list gets more chunks rather than bigger ones and they queue — slower than
   * one wave, but a request that finishes beats a request that times out.
```

- [ ] **Step 6: Report partial as partial**

In `getGroceryPrices`, replace the success return's `priceSearchSuccess: true`
with a computed value and add the counts:

```typescript
    const chunksFailed = failures.length;
    return {
      items: pricedItems,
      stores,
      storeTotals,
      comparableItemCount,
      recommendedStore: cheapest?.store || '',
      savings,
      // True only when nothing failed. A run that lost two of three chunks is
      // two thirds unpriced, and it used to be indistinguishable from a
      // complete one.
      priceSearchSuccess: chunksFailed === 0,
      pricedItemCount: pricedItems.length,
      requestedItemCount: items.length,
      chunksFailed,
      chunksTotal: chunks.length,
    };
```

Add the four new fields to `GroceryPriceResponse` as optional numbers.

- [ ] **Step 7: Carry the counts through the route**

In `generate-groceries/route.ts`, the enriched list at `~:255` sets
`priceSearchSuccess: true` as a literal. Replace it with the response's value and
carry the counts:

```typescript
      priceSearchSuccess: priceResponse.priceSearchSuccess,
      pricedItemCount: priceResponse.pricedItemCount,
      requestedItemCount: priceResponse.requestedItemCount,
```

The route's earlier `priceSearchSuccess: false` branch (`~:166`) is unchanged —
it already handles total failure correctly.

- [ ] **Step 8: Make the UI distinguish three states**

`GroceryListSection.tsx` currently branches on `=== true` (`:165`) and
`=== false` (`:181`). With `priceSearchSuccess` now false for a partial run, the
partial case falls into the existing failure branch, which says prices could not
be retrieved — wrong, since most of them were.

Add the middle state. Where the `=== false` branch renders, distinguish:

```tsx
{groceryList.priceSearchSuccess === false && groceryList.pricedItemCount > 0 ? (
  <p className="text-sm text-amber-800">
    Priced {groceryList.pricedItemCount} of {groceryList.requestedItemCount} items —
    the rest are listed without prices.
  </p>
) : groceryList.priceSearchSuccess === false ? (
  /* the existing could-not-retrieve-prices message, unchanged */
) : null}
```

**Locate first:** read the existing `:181` branch before editing. Match its markup
and class conventions rather than the sketch above, and add `pricedItemCount` and
`requestedItemCount` to the component's props interface at `~:67`.

- [ ] **Step 9: Verify a partial run renders as partial**

You cannot easily force a chunk timeout, so verify by forcing the flag. Temporarily,
in `getGroceryPrices`, hardcode `priceSearchSuccess: false` alongside a real
`pricedItemCount`. Load the grocery list, confirm the amber partial message shows
the right counts and that the unpriced items still render. Then remove the
hardcode and confirm the full-success state returns.

Run: `grep -n "priceSearchSuccess: false," src/lib/external/perplexity-client.ts`
Expected after cleanup: only the genuine zero-items early return at `~:526`.

- [ ] **Step 10: Verify chunking on a real list**

Run `npm run dev`, generate a full week's plan, and read:
`[PERPLEXITY-GROCERY] 💰 Getting prices for N items … (C requests of up to S)`.

Expected: `S <= 40` always. For a typical 40–60 item week, `C` is 3 and `S` is
between 15 and 20 — unchanged from before, which is the point: the ceiling only
engages on the long lists that were failing.

- [ ] **Step 11: Commit**

```bash
git add src/lib/utils/store-totals.ts src/lib/utils/store-totals.test.ts src/lib/external/perplexity-client.ts src/app/api/ai/meals/generate-groceries/route.ts src/components/dashboard/GroceryListSection.tsx
git commit -m "fix(groceries): report a partial price run as partial, and cap the chunk size

priceSearchSuccess was true whenever any item priced. The line directly above it
logs '2/3 chunk(s) failed — pricing 14/40 items' and then the function returned
unqualified success, so two thirds of the list coming back unpriced looked
exactly like a complete run.

The reason chunks fail is the other half of this: chunkSize had a documented
floor and no ceiling, and because the divisor is the concurrency limit the chunk
count stayed at three while the size grew — 300 items meant three requests of 100.
Past roughly 90 the request rebuilt the timeout the chunking existed to avoid,
and the resulting failure was reported as success.

Capped at 40; longer lists now get more chunks rather than bigger ones. Slower
than one wave, but a request that finishes beats one that times out."
```

---

### Task 14: Stop the model overwriting the meal plan, and bound the prices

**Findings:** C9 (S3), C10 (S3), C11 (S3)

**Files:**
- Modify: `src/app/api/ai/meals/generate-groceries/route.ts` — the merge loop (~`:215-245`)
- Modify: `src/lib/ai/schemas/grocery.ts:50` — `price: z.number()`
- Test: `src/lib/utils/grocery-merge.test.ts` (new)
- Create: `src/lib/utils/grocery-merge.ts`

**Interfaces:**
- Consumes: `normalizeGroceryKey` from `@/lib/utils/grocery-list`.
- Produces: `mergePricedItem(original, priced) => MergedItem` — one item's merge, extracted so the precedence rule is testable.

**Background — three small defects in one merge loop.**

```typescript
      const original = originalItemMap.get(`${category}:${key}`);
      groceryListWithPrices[category].push({
        ...original,
        ...item
      });
      if (key) pricedKeys.add(`${category}:${key}`);
```

*C10.* Spread order puts the model last, so every field it returns wins. `quantity`
and `uses` were derived from the meal plan — `uses` in particular is the list of
meals the item appears in, computed by `enhanceGroceryListWithUsage` from actual
recipe data. The model, which was shown those values in the prompt, is free to
return different ones, and they silently replace the computed truth. The model
should own price fields and nothing else.

*C9.* When the model renames an item — "chicken breast" comes back as "boneless
skinless chicken breasts" — `normalizeGroceryKey` produces a different key.
`originalItemMap.get()` misses, so the merge spreads `undefined` and pushes a row
carrying only the model's fields. The original key never enters `pricedKeys`, so
the carry-through loop below then pushes the original *again*, unpriced. The user
sees two rows for one ingredient: one priced under a name they did not write, one
unpriced under the name they did. The carry-through loop is otherwise correct and
well-reasoned — the bug is only that a rename looks identical to a skip.

*C11.* `price: z.number()` in `src/lib/ai/schemas/grocery.ts:50` accepts `-5` and
`999999`. A negative price makes a store's total smaller, which after Task 12
still means it can win the comparison. Grammar-constrained decoding will honour
a bound if we state one; we never stated one.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/grocery-merge.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePricedItem } from './grocery-merge';

const original = {
  name: 'chicken breast',
  quantity: '2 lbs',
  uses: 'Monday dinner, Wednesday lunch',
  category: 'proteins',
  perishability: 'high',
  usedInMeals: ['Monday dinner', 'Wednesday lunch'],
};

const priced = {
  item: 'boneless skinless chicken breasts',
  quantity: '1 lb',
  uses: 'dinner',
  category: 'proteins',
  storeOptions: [{ store: 'Safeway', price: 8.99, displayName: 'Chicken Breast', priceConfidence: 'exact' }],
};

test('the meal plan owns quantity', () => {
  assert.equal(mergePricedItem(original, priced).quantity, '2 lbs');
});

test('the meal plan owns uses', () => {
  assert.equal(mergePricedItem(original, priced).uses, 'Monday dinner, Wednesday lunch');
});

test('the meal plan owns the displayed name', () => {
  assert.equal(mergePricedItem(original, priced).name, 'chicken breast');
});

test('the model owns the store options', () => {
  assert.equal(mergePricedItem(original, priced).storeOptions.length, 1);
  assert.equal(mergePricedItem(original, priced).storeOptions[0].price, 8.99);
});

test('a rename is recorded, not silently applied', () => {
  assert.equal(mergePricedItem(original, priced).pricedAs, 'boneless skinless chicken breasts');
});

test('an identical name records no rename', () => {
  const same = { ...priced, item: 'chicken breast' };
  assert.equal(mergePricedItem(original, same).pricedAs, undefined);
});

test('fields the original did not have are carried from the model', () => {
  const merged = mergePricedItem(original, priced) as any;
  assert.ok(Array.isArray(merged.storeOptions));
});

test('a missing original still produces a usable row', () => {
  const merged = mergePricedItem(undefined, priced);
  assert.equal(merged.name, 'boneless skinless chicken breasts');
  assert.equal(merged.storeOptions[0].price, 8.99);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx tsx --test 'src/lib/utils/grocery-merge.test.ts'`
Expected: module not found.

- [ ] **Step 3: Implement the merge**

Create `src/lib/utils/grocery-merge.ts`:

```typescript
export interface MergedGroceryItem {
  name: string;
  quantity?: string;
  uses?: string;
  category?: string;
  storeOptions: any[];
  pricedAs?: string;
  [key: string]: any;
}

/**
 * Precedence: the meal plan owns what it computed, the model owns prices.
 *
 * The merge was `{...original, ...item}`, so every field the model echoed back
 * replaced the value derived from the recipes — including `uses`, which is the
 * list of meals the ingredient appears in and is not something the model is in
 * a position to know.
 */
export function mergePricedItem(
  original: Record<string, any> | undefined,
  priced: Record<string, any>
): MergedGroceryItem {
  if (!original) {
    return {
      ...priced,
      name: priced.item ?? priced.name ?? 'Unknown item',
      storeOptions: priced.storeOptions ?? [],
    };
  }

  const pricedName = priced.item ?? priced.name;
  const originalName = original.name ?? original.item;

  return {
    // Model fields first so plan-owned fields below win the collision.
    ...priced,
    ...original,
    name: originalName,
    storeOptions: priced.storeOptions ?? [],
    // Kept so the rename is visible rather than either lost or substituted:
    // the shelf name is useful, but it is not the name the user's plan uses.
    pricedAs:
      pricedName && pricedName !== originalName ? pricedName : undefined,
  };
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx tsx --test 'src/lib/utils/grocery-merge.test.ts'`
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Fix the duplicate-on-rename**

In `generate-groceries/route.ts`, the merge loop needs two changes: use
`mergePricedItem`, and mark the original as priced even when the model renamed it.

Replace:

```typescript
      const original = originalItemMap.get(`${category}:${key}`);
      groceryListWithPrices[category].push({
        ...original,
        ...item
      });
      if (key) pricedKeys.add(`${category}:${key}`);
```

with:

```typescript
      let original = originalItemMap.get(`${category}:${key}`);
      let matchedKey = key;

      // A rename produces a different key, which used to look exactly like a
      // skip: the merge lost the original's fields and the carry-through loop
      // below then re-added the original unpriced, so one ingredient rendered
      // as two rows. Fall back to a containment match on the normalised names.
      if (!original) {
        for (const [candidateKey, candidate] of originalItemMap) {
          if (!candidateKey.startsWith(`${category}:`)) continue;
          const bare = candidateKey.slice(category.length + 1);
          if (!bare || pricedKeys.has(candidateKey)) continue;
          if (key.includes(bare) || bare.includes(key)) {
            original = candidate;
            matchedKey = bare;
            console.log(`[GROCERY-PRICES] 🔤 Matched renamed item "${item.item}" to "${candidate.name || candidate.item}"`);
            break;
          }
        }
      }

      groceryListWithPrices[category].push(mergePricedItem(original, item));
      if (matchedKey) pricedKeys.add(`${category}:${matchedKey}`);
```

Add `import { mergePricedItem } from '@/lib/utils/grocery-merge';`.

Containment rather than fuzzy distance: "chicken breast" is a substring of
"boneless skinless chicken breasts" after normalisation, which covers the common
rename. It is deliberately conservative — a wrong match silently attaches a price
to the wrong ingredient, which is worse than a duplicate row. The
`pricedKeys.has(candidateKey)` guard stops one original absorbing two priced
items.

- [ ] **Step 6: Bound the price**

In `src/lib/ai/schemas/grocery.ts:50`, replace:

```typescript
  price: z.number(),
```

with:

```typescript
  // A grocery item priced outside this range is a parse error, not a bargain.
  // Unbounded, a negative price shrank a store's total and helped it win the
  // cheapest-store comparison.
  price: z.number().min(0.01).max(500),
```

**Check first:** `toStrictJsonSchema` must translate `.min`/`.max` into the JSON
Schema `minimum`/`maximum` keywords for OpenAI's strict decoder to enforce them.
Read `toStrictJsonSchema` in `src/lib/ai/schemas/index.ts` and confirm it does
not strip unknown keywords. If it does strip them, the bound still runs as a Zod
parse check at `parseChoice` — which turns an absurd price into a chunk failure
rather than a silent bad total. Note which of the two you got in the commit body;
they have different consequences and the next person needs to know which one is
in force.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -c "error"` — unchanged from baseline.

Run `npm run dev`, generate a plan, and check the grocery list in the browser:
- no ingredient appears twice
- quantities match the meal plan's amounts, not generic ones
- the "used in" text names real meals from the plan
- any `🔤 Matched renamed item` log lines name two plausibly-equivalent
  ingredients — read every one of them on the first run, since a wrong match here
  is silent

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/grocery-merge.ts src/lib/utils/grocery-merge.test.ts src/app/api/ai/meals/generate-groceries/route.ts src/lib/ai/schemas/grocery.ts
git commit -m "fix(groceries): let the meal plan keep its own fields, and bound the price

The merge was {...original, ...item}, so every field the model echoed back
replaced the computed one — including 'uses', which is the list of meals an
ingredient appears in, derived from the recipes. The model was shown those values
and was free to return different ones. It now owns prices and nothing else.

A renamed item produced a different normalised key, which was indistinguishable
from a skipped one: the merge lost the original's fields and the carry-through
loop re-added the original unpriced, so one ingredient rendered as two rows. A
conservative containment match closes that, and the shelf name is kept under
'pricedAs' rather than replacing the plan's name.

And price had no bounds, so a negative one shrank a store's total and helped it
win the cheapest-store comparison."
```

---

### Task 15: Give prices a provenance

**Findings:** C1 (S2), C2 (S3)

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` — `fetchPriceChunk` (~`:600-712`)
- Modify: `src/lib/ai/schemas/grocery.ts` — the store option object
- Modify: `src/components/dashboard/GroceryListSection.tsx` — price rendering

**Background.**

*C1.* The menu path captures Sonar's citations, however imperfectly. The price
path does not read `priceResult.data.citations` at all. Not one price the app
displays is traceable to anything.

*C2.* `priceConfidence: z.enum(['exact', 'estimate'])` is the model's report about
its own certainty. The prompt is unusually good about this — line 599 says
*"Be strict about this distinction — it is shown to the user, and marking a guess
as exact is worse than admitting the guess."* — and that is the right instruction.
But it is still self-assessment, and it is rendered with the authority of a
measurement.

These are the same finding from two directions: a claim about a price with no
evidence attached. Task 9 established the pattern on the restaurant side —
capture what the search retrieved and record whether the claim is corroborated,
without gating on it. This applies the same treatment.

- [ ] **Step 1: Capture citations in the price chunk**

In `fetchPriceChunk`, after `parseChoice` succeeds, the raw response is still in
scope as `priceResult.data`. Extract:

```typescript
      const chunkCitations: string[] = (priceResult.data?.citations || [])
        .map((c: any) => (typeof c === 'string' ? c : c?.url))
        .filter((u: any): u is string => typeof u === 'string' && u.length > 0);
```

Attach to each priced item in the existing `.map`:

```typescript
        sources: chunkCitations.slice(0, 3),
```

Chunk-level rather than item-level, because Sonar cites per response, not per
item. That is a real limitation and the UI copy in Step 4 must not overstate it.

- [ ] **Step 2: Add the field to the types**

Add `sources?: string[];` to `GroceryItemWithPrices` (~`:128` area — grep for
`priceConfidence:` to find the interface). Do **not** add it to the Zod schema:
`sources` is our own annotation, not something the model returns, and putting it
in the schema would invite the model to invent URLs — the exact B2 failure.

- [ ] **Step 3: Surface an honest confidence**

The rendered confidence should combine the model's self-report with whether the
search had anything to cite. In `GroceryListSection.tsx`, where
`priceConfidence` is rendered:

```tsx
{option.priceConfidence === 'exact' && (item.sources?.length ?? 0) > 0 ? (
  <span title={`Sourced from ${item.sources.length} search result(s)`}>Found price</span>
) : option.priceConfidence === 'exact' ? (
  <span title="The model reported this as a found price, but the search returned no sources for this batch">Reported price</span>
) : (
  <span title="Inferred from typical local pricing">Estimate</span>
)}
```

**Locate first:** grep for `priceConfidence` in the component to find the actual
render site and match its existing markup. If it is currently rendered as a badge
or icon, keep that treatment — only the three-way logic and the wording change.

The middle state is the one that matters. "Exact but uncited" is currently
displayed identically to "exact and cited," and it is the state where the model
is most likely to be wrong.

- [ ] **Step 4: Add a sources affordance**

Where an item has `sources`, render them as links under the item's price row —
or behind a disclosure if the row is tight. Attribute them honestly: these are
the pages the search returned for the *batch*, not proof of that specific item's
price. Label the disclosure "Search sources" rather than "Price source."

Overstating this would substitute one false authority for another, which is the
failure this task exists to correct.

- [ ] **Step 5: Verify**

Run `npm run dev`, generate a plan, open the grocery list.

Expected:
- some items show "Found price" with sources, some show "Estimate"
- if *every* item shows "Reported price", `citations` is not being returned on
  this call — check `priceResult.data` in the debugger before assuming the
  extraction is wrong, and report the finding either way
- source links open real pages. Click three.

- [ ] **Step 6: Commit**

```bash
git add src/lib/external/perplexity-client.ts src/components/dashboard/GroceryListSection.tsx
git commit -m "feat(groceries): attach the search sources to prices

The menu path captures Sonar's citations. The price path never read them, so no
price the app showed was traceable to anything — and priceConfidence, the only
signal the user had, is the model's report about its own certainty rendered with
the authority of a measurement.

Citations are now captured per chunk and surfaced, and the badge distinguishes
'exact and cited' from 'exact but the search returned nothing to cite' — the
second was previously displayed identically to the first, and it is the state
where the claim is most likely wrong.

Attributed as batch-level search sources, not per-item price proof, because
that is what they are. sources is deliberately not in the Zod schema: it is our
annotation, and asking the model for URLs is how the ordering links got invented."
```

---

## Section D — Workouts

Findings D1–D7 and D9. D8 (the nine-region injury button grid) is already closed
by Plan 2 Task 8 and is not repeated here.

The workout route is the one surface where the wiring is already right and only
the decisions are missing. `validateWorkoutPlan` is imported, called on the live
path, and its warnings and errors are printed. Nothing reads the result. Section
A had to build that plumbing for meals; here it exists, so these tasks are about
what to *do* with what the validator already knows.

---

### Task 16: Make the week the length the week is, and act on the validator we already run

Closes D1, D2, D4.

**The problem.** `WorkoutPlanSchema.weeklyPlan` is `z.array(WorkoutDayOutline)`
with no bounds (`src/lib/ai/schemas/workout.ts:22`). A week has exactly seven
days and the prompt enumerates them — "outline all 7 days", and when the user
gave availableDays, the exact training and rest day names. This is the one place
in the codebase where a pinned count is *safe*, by the rule in Global
Constraints: the prompt enumerates the count, so pinning cannot force the model
to invent filler. It can only stop the model closing the array early.

Today a four-day answer to a seven-day request parses, sanitizes, validates,
logs its own errors, and ships 200.

`validateWorkoutPlan` runs at `src/app/api/ai/workouts/generate/route.ts:699`.
Its result is destructured into a console.log at :705, errors are printed at
:713, warnings at :716, and then `return sanitizedWorkoutPlan;` on the next line
regardless. `validationResult.valid` is computed and thrown away.

**Files:**
- Modify: `src/lib/ai/schemas/workout.ts` — bound `weeklyPlan`
- Modify: `src/app/api/ai/workouts/generate/route.ts` — day-count check, act on validator
- Test: `src/lib/utils/workout-validator.test.ts` (create)

**Interfaces:**
- Consumes: `validateWorkoutPlan(weeklyPlan, preferences) => WorkoutValidationResult`
  from `src/lib/utils/workout-validator.ts:53`. Already exists, unchanged.
- Produces: no new symbols. Task 18 appends two cases to the test file this
  task creates, and reuses its `trainingDay(day, exercises = 5)` helper.

- [ ] **Step 1: Pin the week to seven days**

In `src/lib/ai/schemas/workout.ts`, change line 22:

```typescript
  weeklyPlan: z.array(WorkoutDayOutline).length(7),
```

`.length(7)` is `.min(7).max(7)`. Do not use the `exactly()` helper here — that
helper lives in the meal schemas and importing it across surfaces couples two
files that have no other relationship. `.length()` is the Zod built-in and reads
the same.

- [ ] **Step 2: Find out whether the bound reaches the model**

The same open question as Task 14 Step 6: `toStrictJsonSchema` may or may not
propagate `minItems`/`maxItems` into the JSON Schema it hands OpenAI. Render it
and look:

```bash
npx tsx -e "
import { WorkoutPlanSchema } from './src/lib/ai/schemas/workout';
import { toStrictJsonSchema } from './src/lib/ai/schemas/to-strict-json-schema';
const s: any = toStrictJsonSchema('workout_plan', WorkoutPlanSchema);
console.log(JSON.stringify(s.schema.properties.weeklyPlan, null, 2).slice(0, 400));
"
```

If `minItems: 7` and `maxItems: 7` appear, the decoder cannot close the array at
six and the bound is enforced at generation time. If they do not appear, Zod
still rejects a short array at parse time — the run fails loudly instead of
shipping four days. Either outcome is an improvement; write which one you got
into the commit message so the next person does not have to re-derive it.

Note that `toStrictJsonSchema` is imported in the route, not the schema file —
locate its actual path with `grep -rn "toStrictJsonSchema" src/lib/ai/schemas/`
before running the snippet, and fix the import above to match.

- [ ] **Step 3: Write the failing tests**

Create `src/lib/utils/workout-validator.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkoutPlan } from './workout-validator';

const trainingDay = (day: string, exercises = 5) => ({
  day,
  restDay: false,
  focus: 'Upper body push',
  estimatedTime: '45 minutes',
  estimatedCalories: 280,
  exercises: Array.from({ length: exercises }, (_, i) => ({
    name: `Exercise ${i + 1}`,
    sets: 3,
    reps: '8-10',
    restTime: '90 seconds',
  })),
});

const restDay = (day: string) => ({
  day,
  restDay: true,
  focus: 'Recovery',
  estimatedTime: '20 minutes',
  estimatedCalories: 80,
  activeRecovery: { suggestedActivity: 'Walk', duration: '20 min', description: 'x', alternatives: [] },
});

test('a day with one exercise is flagged, not passed', () => {
  const result = validateWorkoutPlan([trainingDay('monday', 1)], {
    preferredDuration: 45,
    availableDays: ['monday'],
    fitnessExperience: 'intermediate',
  });
  const monday = result.daySummaries.find(d => d.day === 'monday');
  assert.ok(monday, 'monday should have a summary');
  assert.equal(monday!.exerciseCount, 1);
  assert.ok(
    monday!.issues.some(i => /exercise count/i.test(i)),
    `expected an exercise-count issue, got ${JSON.stringify(monday!.issues)}`
  );
});

test('a normal training day produces no exercise-count issue', () => {
  const result = validateWorkoutPlan([trainingDay('monday', 5)], {
    preferredDuration: 45,
    availableDays: ['monday'],
    fitnessExperience: 'intermediate',
  });
  const monday = result.daySummaries.find(d => d.day === 'monday')!;
  assert.equal(
    monday.issues.some(i => /exercise count/i.test(i)),
    false,
    `expected no exercise-count issue, got ${JSON.stringify(monday.issues)}`
  );
});

test('an empty plan is invalid', () => {
  const result = validateWorkoutPlan([], { preferredDuration: 45 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('a training day with no exercises array is an error, not a warning', () => {
  const result = validateWorkoutPlan(
    [{ day: 'monday', restDay: false, focus: 'Push', estimatedTime: '45 minutes', estimatedCalories: 280 }],
    { preferredDuration: 45, availableDays: ['monday'] }
  );
  // No exercises array means the validator treats it as a rest day, and a rest
  // day with no activeRecovery is an error. Either way it must not be valid.
  assert.equal(result.valid, false, `expected invalid, got ${JSON.stringify(result.errors)}`);
});

test('a full week of rest days with activeRecovery is valid', () => {
  const week = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(restDay);
  const result = validateWorkoutPlan(week, { preferredDuration: 45 });
  assert.equal(result.valid, true, `expected valid, got ${JSON.stringify(result.errors)}`);
});
```

- [ ] **Step 4: Run the tests**

```bash
npx tsx --test "src/lib/utils/workout-validator.test.ts"
```

Expected: some pass immediately — this file characterizes behaviour the
validator already has. That is the point. These are the tests that must keep
passing while you change what the *route* does with the result. If any fail,
the validator does not behave as this task assumes; stop and read
`src/lib/utils/workout-validator.ts` before continuing, because Step 5 depends
on `valid` and `errors` meaning what they appear to mean.

- [ ] **Step 5: Check the day count in the route**

In `src/app/api/ai/workouts/generate/route.ts`, find:

```typescript
  if (weeklyOutline.length === 0) {
    throw new Error('Planning phase returned no days');
  }
```

Replace with:

```typescript
  if (weeklyOutline.length !== 7) {
    throw new Error(
      `Planning phase returned ${weeklyOutline.length} days, expected 7. ` +
      `Days present: ${weeklyOutline.map((d: any) => d.day).join(', ') || 'none'}`
    );
  }
```

A short week is not a degraded plan the user can work with — the day picker in
`WorkoutPlanPage.tsx` selects by day name, so a missing day is a dead tab. This
throw is caught by the route's existing error handling; the schema bound from
Step 1 should make it unreachable, and if it does fire the message names the
days so the next run is diagnosable.

- [ ] **Step 6: Act on the validation result**

Immediately after the existing `validationResult.warnings.forEach(...)` line and
before `return sanitizedWorkoutPlan;`:

```typescript
  if (!validationResult.valid) {
    throw new Error(
      `Workout plan failed validation: ${validationResult.errors.slice(0, 3).join('; ')}`
    );
  }
```

Errors, not warnings. Read `src/lib/utils/workout-validator.ts` and confirm the
split before writing this: errors are structural (missing day name, missing
focus, a training day with no exercises, a rest day with no activeRecovery) and
warnings are range checks (exercise count, estimated time, calories). Structural
failures produce a plan the UI cannot render. Range failures produce a plan that
is merely odd. Throwing on warnings would fail runs that are fine.

- [ ] **Step 7: Verify against a real generation**

```bash
npm run dev
```

Generate a workout plan through the UI. In the server log confirm:
- `[GPT-WORKOUT] ✅ Plan+parallel complete: 7 days`
- `[WORKOUT-GENERATION] Validation: { valid: true, ... }`
- No new throw

The failure path cannot be triggered from the UI on demand. To see it work,
temporarily add `validationResult.errors.push('forced');` and
`validationResult.valid = false;` above the new check, confirm the route returns
an error rather than a 200 with a broken plan, then remove both lines. Do not
commit the forced lines — grep for `forced` before committing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai/schemas/workout.ts src/app/api/ai/workouts/generate/route.ts src/lib/utils/workout-validator.test.ts
git commit -m "fix(workouts): make a short week fail instead of shipping

weeklyPlan was an unbounded array, so a four-day answer to a seven-day request
parsed, sanitized, validated, printed its own errors, and returned 200. The week
is exactly seven days and the prompt enumerates them, so pinning the count
cannot force filler — it can only stop the array closing early.

validateWorkoutPlan was already called on the live path and its result already
logged; nothing read it. Structural errors now fail the run. Range warnings
still only warn, because an unusual plan is not a broken one."
```

---

### Task 17: Make the numbers on the day header describe the day that was built

Closes D3, D5, D6, D7.

**The problem.** Four separate arithmetic faults, all of the same kind: a number
displayed with more authority than it has.

*D3.* `estimatedTime` and `estimatedCalories` come from the Phase 1 outline,
which is written before any exercise exists. Phase 2 fills in the exercises.
Nothing reconciles them. The day header can read "45min / 280 cal" over a single
exercise, because the outline promised a session that the detail stage did not
deliver.

*D5.* `WorkoutPlanPage.tsx:374` does `duration: parseInt(workoutDay.estimatedTime)`
and `:921` renders `{currentWorkout.duration}min`. `estimatedTime` is
`z.string()` (`src/lib/ai/schemas/workout.ts:8`) with no format constraint. The
prompt's example is `"45 minutes"`, which parses. `"About 45 minutes"` does not
— `parseInt` returns `NaN` and the header reads **"NaNmin"**.

*D6.* `rpeTarget: z.number()` (`workout.ts:45`) is unbounded. The prompt calls it
a "6-10 scale" in a TypeScript comment at
`src/lib/ai/prompts/workout-generation.ts:72` — a comment the model never sees —
and the JSON example at :444 shows `7`. `WorkoutPlanPage.tsx:541` renders
`(RPE {exercise.weightGuidance.rpeTarget}/10)`. A model that answers on a
percentage scale gives "(RPE 85/10)".

*D7.* `src/app/api/workouts/log-exercise/route.ts:94`:

```typescript
totalCaloriesBurned: allExercises.reduce((sum, e) => sum + (estimatedCalories ?? 0), 0)
```

`e` is declared and ignored. `estimatedCalories` is the single value from the
request body (destructured at :19) — the calorie estimate for *the whole day*.
So the total is the day's calories multiplied by the number of logged exercises.
Log five exercises from a 280-cal day and the log records 1400.

**Files:**
- Modify: `src/lib/ai/schemas/workout.ts` — bound `rpeTarget`
- Modify: `src/lib/ai/prompts/workout-generation.ts` — state the RPE scale and the time format in the prompt
- Create: `src/lib/utils/workout-numbers.ts`
- Modify: `src/components/dashboard/WorkoutPlanPage.tsx` — use it
- Modify: `src/app/api/workouts/log-exercise/route.ts` — fix the reducer
- Test: `src/lib/utils/workout-numbers.test.ts` (create)

**Interfaces:**
- Produces:
  ```typescript
  export function parseMinutes(value: unknown): number | null
  export function isPlausibleRpe(value: unknown): boolean
  export function reconcileDayEstimate(
    outlineMinutes: number | null,
    exerciseCount: number
  ): { minutes: number | null; trusted: boolean }
  ```
  Nothing later in this plan consumes them.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/workout-numbers.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMinutes, isPlausibleRpe, reconcileDayEstimate } from './workout-numbers';

test('parses the shapes the model actually returns', () => {
  assert.equal(parseMinutes('45 minutes'), 45);
  assert.equal(parseMinutes('45'), 45);
  assert.equal(parseMinutes('45-60 minutes'), 45);
  assert.equal(parseMinutes('About 45 minutes'), 45);
  assert.equal(parseMinutes('~45 min'), 45);
  assert.equal(parseMinutes(45), 45);
});

test('returns null rather than NaN when there is no number', () => {
  assert.equal(parseMinutes('as long as you need'), null);
  assert.equal(parseMinutes(''), null);
  assert.equal(parseMinutes(null), null);
  assert.equal(parseMinutes(undefined), null);
  assert.equal(parseMinutes({}), null);
});

test('rejects durations outside the plausible range', () => {
  assert.equal(parseMinutes('0 minutes'), null);
  assert.equal(parseMinutes('600 minutes'), null);
});

test('accepts the RPE scale the UI renders', () => {
  assert.equal(isPlausibleRpe(7), true);
  assert.equal(isPlausibleRpe(1), true);
  assert.equal(isPlausibleRpe(10), true);
});

test('rejects an RPE on the wrong scale', () => {
  assert.equal(isPlausibleRpe(85), false);
  assert.equal(isPlausibleRpe(0), false);
  assert.equal(isPlausibleRpe(-1), false);
  assert.equal(isPlausibleRpe('7'), false);
  assert.equal(isPlausibleRpe(null), false);
});

test('keeps the outline estimate when the day was actually built', () => {
  assert.deepEqual(reconcileDayEstimate(45, 5), { minutes: 45, trusted: true });
});

test('distrusts the outline estimate when almost nothing was delivered', () => {
  assert.deepEqual(reconcileDayEstimate(45, 1), { minutes: null, trusted: false });
});

test('a rest day has no exercises and no estimate to distrust', () => {
  assert.deepEqual(reconcileDayEstimate(null, 0), { minutes: null, trusted: false });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx tsx --test "src/lib/utils/workout-numbers.test.ts"
```

Expected: FAIL — `Cannot find module '.../workout-numbers'`.

- [ ] **Step 3: Write the module**

Create `src/lib/utils/workout-numbers.ts`:

```typescript
const MIN_MINUTES = 5;
const MAX_MINUTES = 240;

/**
 * parseInt('About 45 minutes') is NaN, and NaN reached the header as "NaNmin".
 * The first integer anywhere in the string is the answer for every phrasing the
 * model has produced, including ranges, where the low end is the honest one.
 */
export function parseMinutes(value: unknown): number | null {
  let n: number | null = null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    n = value;
  } else if (typeof value === 'string') {
    const match = value.match(/\d+/);
    n = match ? Number(match[0]) : null;
  }
  if (n === null || !Number.isFinite(n)) return null;
  if (n < MIN_MINUTES || n > MAX_MINUTES) return null;
  return Math.round(n);
}

export function isPlausibleRpe(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10;
}

const MIN_EXERCISES_FOR_ESTIMATE = 3;

/**
 * The outline writes estimatedTime before any exercise exists; the detail stage
 * decides what the session actually is. Below the validator's own floor for a
 * training day, the outline's number describes a session that was not built.
 */
export function reconcileDayEstimate(
  outlineMinutes: number | null,
  exerciseCount: number
): { minutes: number | null; trusted: boolean } {
  if (outlineMinutes === null || exerciseCount < MIN_EXERCISES_FOR_ESTIMATE) {
    return { minutes: null, trusted: false };
  }
  return { minutes: outlineMinutes, trusted: true };
}
```

`MIN_EXERCISES_FOR_ESTIMATE` is 3 to match `MIN_EXERCISES` in
`src/lib/utils/workout-validator.ts`. Grep for `MIN_EXERCISES` and confirm it is
still 3 before writing this; if it has changed, match it and say so in the
commit message. Do not import it across files — the validator's constant is a
warning threshold and this one is a display threshold, and coupling them means a
future change to one silently changes the other.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx tsx --test "src/lib/utils/workout-numbers.test.ts"
```

Expected: 8 pass, 0 fail.

- [ ] **Step 5: Use it in the day header**

In `src/components/dashboard/WorkoutPlanPage.tsx`, add the import alongside the
existing imports:

```typescript
import { parseMinutes, isPlausibleRpe, reconcileDayEstimate } from '@/lib/utils/workout-numbers';
```

In `getCurrentWorkout`, replace:

```typescript
          duration: parseInt(workoutDay.estimatedTime),
```

with:

```typescript
          duration: reconcileDayEstimate(
            parseMinutes(workoutDay.estimatedTime),
            Array.isArray(workoutDay.exercises) ? workoutDay.exercises.length : 0
          ).minutes,
```

`duration` is now `number | null`. Find every read of it — `grep -n
"currentWorkout.duration" src/components/dashboard/WorkoutPlanPage.tsx` — and
guard each one. The header at :921 is:

```tsx
              <span className="text-purple-600 font-medium">{currentWorkout.duration}min</span>
```

Change to:

```tsx
              {currentWorkout.duration !== null && (
                <span className="text-purple-600 font-medium">{currentWorkout.duration}min</span>
              )}
```

Omit it, do not substitute a placeholder. "NaNmin" and "—min" are the same
failure wearing different clothes; the honest render of a number we do not have
is no number. If omitting leaves a stray separator (a `·` or `•` between the
duration and the calorie count), remove that too — read the surrounding JSX
rather than assuming its shape, the line numbers here will have moved.

Also check the empty-state return further down `getCurrentWorkout`, which sets
`duration: 0`. Change it to `duration: null` so the two paths agree; `0` would
render "0min", which is a claim.

- [ ] **Step 6: Guard the RPE render**

Still in `WorkoutPlanPage.tsx`, the render is:

```tsx
                    {exercise.weightGuidance.rpeTarget && (
                      <span className="text-blue-600 ml-2">(RPE {exercise.weightGuidance.rpeTarget}/10)</span>
                    )}
```

Change the condition:

```tsx
                    {isPlausibleRpe(exercise.weightGuidance?.rpeTarget) && (
                      <span className="text-blue-600 ml-2">(RPE {exercise.weightGuidance.rpeTarget}/10)</span>
                    )}
```

The `?.` matters: `weightGuidance` is non-nullable in the schema but this
component also renders plans generated before the schema existed.

- [ ] **Step 7: Bound rpeTarget at the schema and say so in the prompt**

In `src/lib/ai/schemas/workout.ts`, change line 45:

```typescript
    rpeTarget: z.number().min(1).max(10),
```

The scale is currently documented only in a TypeScript comment at
`src/lib/ai/prompts/workout-generation.ts:72`, which is inside an interface
declaration and is never rendered into the prompt string. Find the JSON example
containing `"rpeTarget": 7` (around :444) and add an explicit line to the
prose above the example. Locate the surrounding requirement text first — do not
guess where it goes — then add:

```
- "rpeTarget" is Rate of Perceived Exertion on a 1-10 scale, where 10 is
  maximal effort. Never a percentage. 6-8 for most working sets.
- "estimatedTime" and "restTime" must lead with a number: "45 minutes",
  "90 seconds". Not "about an hour".
```

The second line is the D5 fix at the source. `parseMinutes` handles the
malformed case, but a prompt that asks for a parseable format is the cheaper
half of the fix.

- [ ] **Step 8: Verify the prompt renders the new text**

```bash
npx tsx -e "
import { createWorkoutDetailPrompt } from './src/lib/ai/prompts/workout-generation';
" 2>&1 | head -5
```

That import will fail if the export is named differently — `grep -n "^export
function create" src/lib/ai/prompts/workout-generation.ts` to get the real names,
then render the detail prompt with a minimal fixture and assert:

```bash
npx tsx -e "
const p = /* render the detail prompt */ '';
console.log(/1-10 scale/.test(p) ? 'RPE PRESENT' : 'RPE MISSING');
console.log(/lead with a number/.test(p) ? 'TIME PRESENT' : 'TIME MISSING');
"
```

Both must print PRESENT. If the RPE guidance belongs to the plan prompt rather
than the detail prompt, check that one instead — `rpeTarget` is produced by
whichever stage emits `Exercise` objects, which is Phase 2.

- [ ] **Step 9: Fix the calorie reducer**

In `src/app/api/workouts/log-exercise/route.ts`, the write at :94 is:

```typescript
        totalCaloriesBurned: allExercises.reduce((sum, e) => sum + (estimatedCalories ?? 0), 0)
```

This writes to the shared production database. Per `CLAUDE.md`, say what it
writes before running it: it sets `WorkoutLog.totalCaloriesBurned` for the log
row this request already created or updated. The change makes that column
smaller and correct; it does not create rows, delete rows, or touch any other
table. Confirm with the user before running the dev server against this path.

`estimatedCalories` is the day's total, taken from the request body at :19. It is
not per-exercise, and `e` is not used. Replace with:

```typescript
        // estimatedCalories is the whole day's estimate, not this exercise's.
        // Scale it by how much of the day the user actually completed.
        totalCaloriesBurned: (() => {
          const dayCalories = typeof estimatedCalories === 'number' && Number.isFinite(estimatedCalories)
            ? estimatedCalories
            : 0;
          const totalCount = allExercises.length;
          if (totalCount === 0 || dayCalories === 0) return 0;
          return Math.round(dayCalories * (completedCount / totalCount));
        })()
```

`completedCount` is already computed on the line above
(`allExercises.filter(e => e.setsCompleted > 0).length`) — confirm that with
`grep -n "completedCount" src/app/api/workouts/log-exercise/route.ts` before
relying on it.

This is proportional, not exact. A day whose exercises are all logged records
the day's estimate; a day half logged records half. That is a defensible
estimate. Multiplying the day's total by the exercise count was not.

- [ ] **Step 10: Verify the reducer against real numbers**

With the user's confirmation, log exercises through the UI for one day and check
`WorkoutLog.totalCaloriesBurned`:

```bash
npx prisma studio
```

Read-only. Find the `WorkoutLog` row for today and confirm `totalCaloriesBurned`
is at or below the day's `estimatedCalories` from the plan — never a multiple of
it. Before this change, logging five exercises on a 280-cal day wrote 1400.

- [ ] **Step 11: Verify the UI**

```bash
npm run dev
```

Open the workout page and step through every day of the week. Confirm:
- No "NaNmin" anywhere
- No "(RPE 85/10)" or any RPE outside 1-10
- A day with fewer than three exercises shows no duration rather than the
  outline's optimistic one
- Rest days still render their active recovery block unchanged

To see the D5 path specifically, temporarily edit the plan JSON in Prisma Studio
to set one day's `estimatedTime` to `"about an hour"` — read-only rule applies,
so instead do it in the browser console against the fetched object, or accept
that the unit test covers it. The unit test does cover it; do not edit
production data to exercise a render path.

- [ ] **Step 12: Commit**

```bash
git add src/lib/utils/workout-numbers.ts src/lib/utils/workout-numbers.test.ts src/lib/ai/schemas/workout.ts src/lib/ai/prompts/workout-generation.ts src/components/dashboard/WorkoutPlanPage.tsx src/app/api/workouts/log-exercise/route.ts
git commit -m "fix(workouts): stop displaying numbers we do not have

Four arithmetic faults of one kind. parseInt('About 45 minutes') is NaN and the
header rendered it as NaNmin. rpeTarget was unbounded and its 1-10 scale lived
only in a TypeScript comment the model never sees, so a percentage answer
rendered as (RPE 85/10). estimatedTime and estimatedCalories come from the
outline, written before any exercise exists, and were shown over whatever the
detail stage delivered. And the calorie log reducer ignored its element and
added the day's whole estimate once per logged exercise.

Durations and RPE are now parsed and range-checked, and omitted when absent
rather than replaced with a placeholder — a placeholder is the same claim in
politer type. The day estimate is shown only when the day was actually built.
The log total is the day's estimate scaled by completion."
```

---

### Task 18: Stop calling a default something the user told us

Closes D9.

**The problem.** `src/app/api/survey/route.ts:208-210`:

```typescript
        availableDays: parsed.data.workoutPreferences?.availableDays?.length
          ? parsed.data.workoutPreferences.availableDays
          : ['monday', 'wednesday', 'friday'],
```

When `availableDays` arrives empty, the route invents Monday/Wednesday/Friday
and writes it to the survey row. Nothing downstream can tell an invented value
from a chosen one — they are the same three strings in the same column.

`src/lib/ai/prompts/workout-generation.ts:200` then reads it, `:236` renders:

```
DAY SCHEDULE — THIS IS A HARD CONSTRAINT, NOT A PREFERENCE:
- Training days (restDay: false), exactly these 3: monday, wednesday, friday
...
The user told us which days they can train.
```

The user did not tell us. A three-day-a-week plan is then built, presented, and
defended as the user's own stated constraint, for someone who never answered the
question.

**Why it fires at all.** The survey UI blocks submission with an empty
availableDays (`src/app/survey/page.tsx:1100`), so the interactive path is safe.
`src/lib/schemas.ts:115` defaults the field to `[]`, so any submission that does
not go through the step-8 validator — an API caller, a resumed draft, an older
client — lands on the fabrication.

**The fix is to delete the fabrication, not to improve it.** The prompt already
handles the empty case: `:235` is `${trainingDays.length > 0 ? \`...\` : ''}`, so
with an empty list no day-schedule block is emitted and the model chooses days to
suit the split it picked. That is the honest behaviour. It also needs an explicit
instruction, because an absent constraint currently produces no guidance at all.

**Files:**
- Modify: `src/app/api/survey/route.ts` — remove the invented default
- Modify: `src/lib/ai/prompts/workout-generation.ts` — add the no-schedule branch
- Test: `src/lib/ai/prompts/workout-days.test.ts` (create)

**Interfaces:**
- Consumes: `canonicalDay` from `src/lib/ai/prompts/workout-generation.ts:119`.
  Already exists.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/prompts/workout-days.test.ts`. The exact export name for
the plan prompt must be looked up first:

```bash
grep -n "^export function create\|^export const create" src/lib/ai/prompts/workout-generation.ts
```

Use whatever that returns in place of `createWorkoutPlanningPrompt` below, and
read its signature — it takes `(surveyData, workoutPrefs, feedbackContext,
libraryExercises)` in the route call at `src/app/api/ai/workouts/generate/route.ts:584`,
but confirm rather than trusting this line.

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkoutPlanningPrompt } from './workout-generation';

const surveyData: any = {
  goal: 'MUSCLE_GAIN',
  age: 30,
  currentWeight: 170,
  targetWeight: 180,
};

const prefsWith = (availableDays: string[]) => ({
  preferredDuration: 45,
  availableDays,
  workoutTypes: [],
  gymAccess: 'full_gym',
  fitnessExperience: 'intermediate',
  injuryConsiderations: [],
  timePreferences: [],
});

const emptyFeedback: any = {
  poorlyRatedExercises: [], wellRatedExercises: [], completionRateByDay: {},
  savedCustomExercises: [], favoriteExercises: [],
  weightProgressionByExercise: {}, repCompletionByExercise: {},
};

test('a stated schedule is presented as a hard constraint', () => {
  const prompt = createWorkoutPlanningPrompt(surveyData, prefsWith(['Mon', 'Wed', 'Fri']), emptyFeedback, []);
  assert.match(prompt, /HARD CONSTRAINT/);
  assert.match(prompt, /monday, wednesday, friday/);
});

test('no stated schedule does not claim the user stated one', () => {
  const prompt = createWorkoutPlanningPrompt(surveyData, prefsWith([]), emptyFeedback, []);
  assert.equal(
    /The user told us which days they can train/.test(prompt),
    false,
    'prompt claims a user statement that was never made'
  );
});

test('no stated schedule still tells the model how to choose days', () => {
  const prompt = createWorkoutPlanningPrompt(surveyData, prefsWith([]), emptyFeedback, []);
  assert.match(
    prompt,
    /did not tell us which days/i,
    'prompt gives no guidance at all when the schedule is absent'
  );
});
```

- [ ] **Step 2: Run the test to verify the third one fails**

```bash
npx tsx --test "src/lib/ai/prompts/workout-days.test.ts"
```

Expected: tests 1 and 2 pass (the ternary at :235 already emits nothing for an
empty list), test 3 FAILS — there is no else branch.

If test 2 also fails, the prompt is emitting the hard-constraint block for an
empty list and the ternary guard is not what this task assumes; re-read
`:235-243` before continuing.

- [ ] **Step 3: Add the no-schedule branch**

In `src/lib/ai/prompts/workout-generation.ts`, the block at :235 is:

```
${trainingDays.length > 0 ? `
DAY SCHEDULE — THIS IS A HARD CONSTRAINT, NOT A PREFERENCE:
...
` : ''}
```

Change the empty branch from `''` to:

```
` : `
DAY SCHEDULE:
The user did not tell us which days they can train. Choose training and rest
days that suit the split you picked, spread across the week with rest between
sessions that work the same muscles. Do not present this as their schedule —
it is your recommendation.
`}
```

Locate the exact backtick nesting before editing. This is a nested template
literal inside a larger one; getting a backtick wrong turns the rest of the
prompt into a syntax error, and `next build` has `ignoreBuildErrors` on, so it
will not tell you. `npx tsx --test` on the file from Step 1 will.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx tsx --test "src/lib/ai/prompts/workout-days.test.ts"
```

Expected: 3 pass, 0 fail.

- [ ] **Step 5: Remove the invented default**

In `src/app/api/survey/route.ts`, replace:

```typescript
        availableDays: parsed.data.workoutPreferences?.availableDays?.length
          ? parsed.data.workoutPreferences.availableDays
          : ['monday', 'wednesday', 'friday'],
```

with:

```typescript
        availableDays: parsed.data.workoutPreferences?.availableDays ?? [],
```

This writes to the shared production database. Per `CLAUDE.md`, state the effect
before running anything that exercises it: the change alters what is stored in
`Survey.workoutPreferencesJson.availableDays` for *new and updated* survey
submissions only. It does not migrate existing rows, does not change the schema,
and does not touch any other column. Rows already carrying a fabricated
Mon/Wed/Fri keep it — there is no way to tell those apart from genuine
Mon/Wed/Fri choices, which is precisely the damage this removes going forward.
Confirm with the user before submitting a survey against the dev server.

- [ ] **Step 6: Check the other consumers tolerate an empty list**

```bash
grep -rn "availableDays" src/ --include="*.ts" --include="*.tsx"
```

Walk each hit and confirm none of them assume non-empty:

- `src/lib/utils/workout-validator.ts:73-74` — maps over the array; empty maps to
  empty. The check at :135 is `availableDays && ... && !availableDays.includes(...)`,
  so an empty array makes every training day fail the includes and warn on every
  day. **This is a regression and must be fixed.** Change the guard to
  `availableDays && availableDays.length > 0 && dayPlan?.day && ...` so an
  unstated schedule produces no warnings rather than seven.
- `src/app/api/ai/profiles/workout/route.ts:235` — `?.join(', ') || 'Flexible'`.
  An empty array joins to `''`, which is falsy, so it renders "Flexible". Correct
  already.
- `src/lib/ai/prompts/profile-generation.ts:103` — same pattern, same result.
- `src/lib/ai/prompts/workout-generation.ts:215` — already ternaried on
  `trainingDays.length > 0`, renders "flexible". Correct already.
- `src/app/survey/page.tsx` — UI state, still requires a selection at :1100.
  Unchanged.

Do not skip the validator fix. Seven spurious warnings per run is exactly the
noise that `canonicalDay` was written to eliminate, per the comment at
`workout-validator.ts:46`.

- [ ] **Step 7: Add a validator test for the empty case**

Append to `src/lib/utils/workout-validator.test.ts` from Task 16:

```typescript
test('an unstated schedule produces no day warnings', () => {
  const result = validateWorkoutPlan([trainingDay('monday'), trainingDay('thursday')], {
    preferredDuration: 45,
    availableDays: [],
    fitnessExperience: 'intermediate',
  });
  assert.equal(
    result.warnings.some(w => /not in availableDays/.test(w)),
    false,
    `expected no availableDays warnings, got ${JSON.stringify(result.warnings)}`
  );
});

test('a stated schedule still warns when training falls outside it', () => {
  const result = validateWorkoutPlan([trainingDay('thursday')], {
    preferredDuration: 45,
    availableDays: ['monday', 'wednesday', 'friday'],
    fitnessExperience: 'intermediate',
  });
  assert.ok(
    result.warnings.some(w => /not in availableDays/.test(w)),
    `expected an availableDays warning, got ${JSON.stringify(result.warnings)}`
  );
});
```

Run both files:

```bash
npx tsx --test "src/lib/utils/workout-validator.test.ts" "src/lib/ai/prompts/workout-days.test.ts"
```

Expected: all pass.

- [ ] **Step 8: Verify end to end**

```bash
npm run dev
```

With the user's confirmation for the survey write, submit a survey through the
UI and confirm the day picker still blocks an empty selection — the interactive
path must be unchanged. Then generate a workout and confirm in the log:
- `[WORKOUT-VALIDATOR]` prints no `not in availableDays` warnings for a plan that
  respects the chosen days
- The plan's training days match what was picked

The empty-availableDays path cannot be reached through the UI by design. The
prompt tests in Step 1 are its coverage.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/survey/route.ts src/lib/ai/prompts/workout-generation.ts src/lib/utils/workout-validator.ts src/lib/ai/prompts/workout-days.test.ts src/lib/utils/workout-validator.test.ts
git commit -m "fix(workouts): stop inventing a training schedule and calling it the user's

An empty availableDays was silently replaced with monday/wednesday/friday and
written to the survey row, indistinguishable from a real choice. The prompt then
declared it A HARD CONSTRAINT and told the model 'the user told us which days
they can train' — for someone who never answered.

The default is gone. The prompt already emitted nothing for an empty list; it
now says so explicitly and asks the model to choose days as its own
recommendation. The validator's availableDays check needed a length guard: an
empty list made every training day fail an includes() and warn."
```

---

## Section E — Recipes

### Task 19: Say whether a number is for the recipe or for one serving

Closes E3.

**The problem is a contradiction inside a single prompt.** Two rules reach the
model on every recipe generation and they cannot both be satisfied.

`SUM_VERIFICATION`, in `RECIPE_SYSTEM_PREAMBLE`
(`src/lib/ai/prompts/recipe-creation.ts:359-367`), is always present:

```
2. The SUM of all ingredient values MUST EQUAL the nutrition totals:
   - Sum of ingredient calories = nutrition.calories
```

`nutritionSection` (`:375-398`), present whenever the caller passed targets,
says the opposite:

```
3. In your JSON response, the "nutrition" object MUST contain these EXACT numbers:
     "calories": ${context.nutritionTargets.calories},
DO NOT return different nutrition values - use exactly these numbers.
```

Those targets are the *meal plan card's* macros — one serving. The ingredient
list is a shopping quantity — the whole recipe. The word "servings" appears in
neither rule.

**The prompt's own example demonstrates the contradiction.** At `:438-460`:
`"servings": 2`, `ingredientsWithNutrition` summing to 1000 calories
(760 + 240 + 0 + 0), and `"nutrition": { "calories": 320 }`. Every recipe
generated is shown a worked example in which rule 2 is violated by a factor of
three.

**And the validator scores the contradiction as a failure.**
`src/app/api/ai/recipes/generate/route.ts:214` calls `validateIngredientSums`
with `estimatedCalories: recipeData.nutrition.calories` and the raw
`ingredientsWithNutrition`. `src/lib/utils/ingredient-validator.ts:54-79` sums
the ingredients and compares directly — no divisor. A correct four-serving
recipe deviates by 300% and prints
`[RECIPE-INGREDIENT-VALIDATOR] ❌ Calorie mismatch`. It is warn-only, so the
recipe is cached and served anyway. The one check that could have caught a real
arithmetic error has been crying wolf on every multi-serving recipe.

**Pick the convention rather than splitting the difference.**
`ingredientsWithNutrition` is whole-recipe: an ingredient line reads "1 lb
chicken breast", and you cannot buy a per-serving fraction of it. `nutrition` is
per-serving: it must equal the number already on the meal plan card, which the
user has seen. So the relation is `sum(ingredients) / servings = nutrition`, and
both the prompt and the validator must say so.

**Files:**
- Modify: `src/lib/ai/prompts/recipe-creation.ts` — state the basis, fix the example
- Modify: `src/lib/ai/schemas/recipe.ts` — bound `servings`
- Modify: `src/lib/utils/ingredient-validator.ts` — accept a servings divisor
- Modify: `src/app/api/ai/recipes/generate/route.ts` — pass it
- Modify: `src/components/dashboard/MealPlanPage.tsx` — label the basis
- Test: `src/lib/utils/ingredient-validator.test.ts` (create)

**Interfaces:**
- Consumes: `validateIngredientSums(mealName, mealData) => IngredientValidationResult`
  at `src/lib/utils/ingredient-validator.ts:30`. Signature is extended, not
  replaced — the existing meal-path caller keeps working unchanged.
- Produces: `mealData.servings?: number` on the second parameter, defaulting
  to 1.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/ingredient-validator.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIngredientSums } from './ingredient-validator';

const ingredients = [
  { item: '1 lb chicken breast', calories: 760, protein: 140, carbs: 0, fat: 16 },
  { item: '2 tbsp olive oil', calories: 240, protein: 0, carbs: 0, fat: 28 },
];

test('a two-serving recipe whose halves match is valid', () => {
  const result = validateIngredientSums('Roast chicken', {
    estimatedCalories: 500,
    protein: 70,
    carbs: 0,
    fat: 22,
    servings: 2,
    ingredientsWithNutrition: ingredients,
  });
  assert.equal(result.valid, true, `expected valid, got ${JSON.stringify(result.errors)}`);
});

test('the same recipe read as one serving is not valid', () => {
  const result = validateIngredientSums('Roast chicken', {
    estimatedCalories: 500,
    protein: 70,
    carbs: 0,
    fat: 22,
    servings: 1,
    ingredientsWithNutrition: ingredients,
  });
  assert.equal(result.valid, false, 'a 2x mismatch must still be caught');
});

test('omitting servings behaves exactly as before', () => {
  const withoutServings = validateIngredientSums('Meal', {
    estimatedCalories: 1000,
    protein: 140,
    carbs: 0,
    fat: 44,
    ingredientsWithNutrition: ingredients,
  });
  const withOne = validateIngredientSums('Meal', {
    estimatedCalories: 1000,
    protein: 140,
    carbs: 0,
    fat: 44,
    servings: 1,
    ingredientsWithNutrition: ingredients,
  });
  assert.deepEqual(withoutServings.errors, withOne.errors);
  assert.equal(withoutServings.valid, true);
});

test('a nonsense servings value falls back to 1 rather than dividing by zero', () => {
  const result = validateIngredientSums('Meal', {
    estimatedCalories: 1000,
    protein: 140,
    carbs: 0,
    fat: 44,
    servings: 0,
    ingredientsWithNutrition: ingredients,
  });
  assert.equal(result.valid, true, 'servings: 0 must not produce Infinity deviations');
});

test('a real arithmetic error is still caught at four servings', () => {
  const result = validateIngredientSums('Roast chicken', {
    estimatedCalories: 800,
    protein: 35,
    carbs: 0,
    fat: 11,
    servings: 4,
    ingredientsWithNutrition: ingredients,
  });
  // ingredients/4 = 250 cal, stated 800. That is a genuine mismatch.
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /[Cc]alorie/.test(e)));
});

test('missing ingredient data is a warning, not an error', () => {
  const result = validateIngredientSums('Meal', {
    estimatedCalories: 500,
    servings: 2,
    ingredientsWithNutrition: [],
  });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.length > 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx tsx --test "src/lib/utils/ingredient-validator.test.ts"
```

Expected: the first, fourth and fifth FAIL — `servings` is not a recognised
field, so it is ignored and every comparison is against the undivided sum.
The third and sixth should pass already.

- [ ] **Step 3: Add the divisor**

In `src/lib/utils/ingredient-validator.ts`, add `servings` to the parameter
type:

```typescript
  mealData: {
    estimatedCalories?: number;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    servings?: number;
    ingredientsWithNutrition?: IngredientNutrition[];
  }
```

Then, immediately after the existing `const summed = ingredients.reduce(...)`
block, divide:

```typescript
  // ingredientsWithNutrition is whole-recipe — an ingredient line is a shopping
  // quantity. The stated nutrition is per serving, because it is the number
  // already shown on the meal plan card. Comparing them undivided made every
  // multi-serving recipe report a mismatch it did not have.
  const servings = typeof mealData.servings === 'number'
    && Number.isFinite(mealData.servings)
    && mealData.servings >= 1
      ? mealData.servings
      : 1;

  const perServing = {
    calories: summed.calories / servings,
    protein: summed.protein / servings,
    carbs: summed.carbs / servings,
    fat: summed.fat / servings,
  };
```

Then replace every subsequent use of `summed` with `perServing`. Grep for it —
`grep -n "summed" src/lib/utils/ingredient-validator.ts` — and change each hit,
including the ones inside the error and warning message templates and inside
`details`. Do not leave a mixed state where the deviation is computed from one
and reported from the other; that produces a message whose numbers do not
explain its own verdict.

Round the reported numbers so the messages stay readable:
`Math.round(perServing.calories)` in the message strings.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx tsx --test "src/lib/utils/ingredient-validator.test.ts"
```

Expected: 6 pass, 0 fail.

- [ ] **Step 5: Pass servings from the recipe route**

In `src/app/api/ai/recipes/generate/route.ts`, the call at :214 becomes:

```typescript
    const validation = validateIngredientSums(
      recipeData.name,
      {
        estimatedCalories: recipeData.nutrition.calories,
        protein: recipeData.nutrition.protein,
        carbs: recipeData.nutrition.carbs,
        fat: recipeData.nutrition.fat,
        servings: recipeData.servings,
        ingredientsWithNutrition: recipeData.ingredientsWithNutrition
      }
    );
```

Update the comment above it, which currently reads "the per-ingredient numbers
have to add up to the totals":

```typescript
    // Value-level checks strict mode cannot express: the per-ingredient numbers
    // are whole-recipe and have to add up to servings × the stated per-serving
    // totals. Warn-only — the recipe is still usable.
```

Leave the other `validateIngredientSums` caller alone. Find it with `grep -rn
"validateIngredientSums" src/` and confirm it is on the meal path, where a meal
is one serving and the default of 1 is correct.

- [ ] **Step 6: Bound servings**

In `src/lib/ai/schemas/recipe.ts`, change:

```typescript
  servings: z.number().int().min(1).max(12),
```

A recipe of zero servings makes the divisor meaningless and a recipe of 400
servings is not a recipe. As in Task 16 Step 2, check whether the bound reaches
the model or only the parser, and say which in the commit message.

- [ ] **Step 7: State the basis in the prompt**

In `src/lib/ai/prompts/recipe-creation.ts`, replace `SUM_VERIFICATION`
(`:359-367`) with a rule that names the basis:

```typescript
const SUM_VERIFICATION = `
⚠️ CRITICAL - PER-SERVING VS WHOLE-RECIPE:
"ingredientsWithNutrition" describes the WHOLE RECIPE — the quantities someone
would buy and cook, matching "ingredients" and "groceryList" exactly.
"nutrition" describes ONE SERVING.

1. List EVERY ingredient in "ingredientsWithNutrition" with its nutrition
   values for the amount actually used in the recipe.
2. The relation between them is division by "servings":
   - Sum of ingredient calories ÷ servings = nutrition.calories
   - Sum of ingredient protein  ÷ servings = nutrition.protein
   - Sum of ingredient carbs    ÷ servings = nutrition.carbs
   - Sum of ingredient fat      ÷ servings = nutrition.fat
3. VERIFY this division before finalizing. If the numbers do not divide
   cleanly, adjust the ingredient quantities — not the servings count.`;
```

Then in `nutritionSection` (`:376-398`), make the target's basis explicit. Change
the opening lines from:

```
These macros are ALREADY displayed to the user in their meal plan.
Your recipe MUST produce these EXACT values:
```

to:

```
These macros are ALREADY displayed to the user in their meal plan.
They are PER SERVING. Your "nutrition" object MUST contain these EXACT values,
and your ingredient quantities must be scaled so that the whole recipe divided
by "servings" produces them:
```

- [ ] **Step 8: Fix the worked example**

The example at `:438-460` currently teaches the contradiction. With
`"servings": 2` and ingredients summing to 1000 calories, `nutrition.calories`
must be 500 — but it is interpolated from `context.nutritionTargets`, which is
whatever the caller asked for.

Change `"servings": 2` to `"servings": 1` in the example. A one-serving example
is the only one that stays correct under interpolation, because with servings
of 1 the division is the identity and the example cannot contradict itself
whatever target is substituted.

Then make the ingredient amounts consistent with a single serving:

```json
  "ingredientsWithNutrition": [
    { "item": "6 oz chicken breast", "calories": 280, "protein": 52, "carbs": 0, "fat": 6 },
    { "item": "1 tbsp olive oil", "calories": 120, "protein": 0, "carbs": 0, "fat": 14 },
    { "item": "1 tsp salt", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
    { "item": "1/2 tsp black pepper", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
  ],
```

and update `"groceryList"` and `"ingredients"` in the same example to match — 6
oz chicken and 1 tbsp olive oil, not 1 lb and 2 tbsp. Three lists in one example
disagreeing about quantity is its own lesson, and not one worth teaching.

The default `"calories": ${context.nutritionTargets?.calories || 320}` at :477
now sits close to the 400-calorie ingredient sum, which is the point: the
example should approximately obey its own rule.

- [ ] **Step 9: Verify the prompt renders both statements**

```bash
npx tsx -e "
import { createRecipeGenerationPrompt, RECIPE_SYSTEM_PREAMBLE } from './src/lib/ai/prompts/recipe-creation';
const p = createRecipeGenerationPrompt({
  dishName: 'Roast chicken',
  mealType: 'dinner',
  nutritionTargets: { calories: 520, protein: 45, carbs: 12, fat: 22 },
} as any);
console.log(/They are PER SERVING/.test(p) ? 'TARGET BASIS PRESENT' : 'TARGET BASIS MISSING');
console.log(/\"servings\": 1/.test(p) ? 'EXAMPLE FIXED' : 'EXAMPLE STILL 2');
console.log(/÷ servings/.test(RECIPE_SYSTEM_PREAMBLE) ? 'SUM RULE PRESENT' : 'SUM RULE MISSING');
"
```

All three must print the positive form. Confirm the export names first with
`grep -n "^export const create\|^export const RECIPE_SYSTEM" src/lib/ai/prompts/recipe-creation.ts`
and adjust the import if they differ.

- [ ] **Step 10: Label the basis in the UI**

`src/components/dashboard/MealPlanPage.tsx:1698` renders the servings count.
Find the recipe modal's nutrition block near it — `grep -n "activeRecipeModal"
src/components/dashboard/MealPlanPage.tsx | head -30` — and read the surrounding
JSX rather than assuming its shape.

Add the words "per serving" to the heading of that nutrition block. If it has no
heading, add one. The user cannot tell whether 520 calories is what they eat or
what they cooked, and the entire class of complaint this plan addresses is
numbers presented without their basis.

Do not change the numbers, only the label. The numbers become correct because
of Steps 3 through 8; the label is what makes them legible.

- [ ] **Step 11: Verify against a real generation**

```bash
npm run dev
```

Recipe generation writes to the shared production database — it upserts into
`Recipe` keyed on `dishName`. Per `CLAUDE.md`, confirm with the user before
generating. The write is a cache entry for one dish; it creates or updates a
single row and touches nothing else.

Open a meal and generate its recipe. In the server log, confirm:
- `[RECIPE-INGREDIENT-VALIDATOR] ✅` with sums matching, for a recipe whose
  `servings` is greater than 1. Before this change that case always printed ❌.
- No `Calorie mismatch` on a recipe that is arithmetically fine

Generate three recipes for dishes of different sizes. If any still reports a
mismatch, read the actual numbers in the message before assuming the fix is
wrong — a genuine mismatch is now finally distinguishable from the servings
artifact, and finding one is this task working.

- [ ] **Step 12: Note the cache**

Recipes generated before this change are cached in the `Recipe` table with
whatever basis the model happened to choose that run. They are not migrated —
there is no reliable way to tell, after the fact, whether a stored
`nutrition.calories` was meant per-serving or whole-recipe, which is the
ambiguity being removed.

Do not write a migration. Do not clear the cache. Note the situation in the
commit message so the next person reading a suspicious cached recipe knows why.
`route.ts:97` already re-parses cached recipes through `RecipeSchema.safeParse`,
so the new `servings` bound will evict any cached recipe with a servings value
outside 1-12 the next time it is read — which is the only automatic cleanup
that is safe.

- [ ] **Step 13: Commit**

```bash
git add src/lib/ai/prompts/recipe-creation.ts src/lib/ai/schemas/recipe.ts src/lib/utils/ingredient-validator.ts src/app/api/ai/recipes/generate/route.ts src/components/dashboard/MealPlanPage.tsx src/lib/utils/ingredient-validator.test.ts
git commit -m "fix(recipes): say whether a number is for the recipe or for one serving

The recipe prompt carried two contradictory rules. The system preamble said the
ingredient sums must equal the nutrition totals; the target section said the
nutrition totals must be the meal plan's per-serving macros verbatim. The word
servings appeared in neither, and the prompt's own worked example was a
two-serving recipe with 1000 calories of ingredients and a 320-calorie
nutrition block.

validateIngredientSums compared the two undivided, so every multi-serving
recipe printed a calorie mismatch it did not have — the one check that could
have caught real arithmetic errors had been crying wolf.

The convention is now stated: ingredientsWithNutrition is whole-recipe, because
an ingredient line is a shopping quantity; nutrition is per serving, because it
must match the card the user already saw. The validator divides. The example is
one serving so it cannot contradict itself under interpolation.

Recipes cached before this change are not migrated — there is no way to tell
after the fact which basis a stored number used, which is the ambiguity being
removed. The new servings bound evicts out-of-range cached rows on read."
```

---

## Section F — Images

### Task 20: Stop serving a placeholder forever, and stop serving a 404

Closes F1, F2.

**F1 — the fallback is cached with no expiry.** When Pexels returns nothing for
a dish, `src/lib/external/pexels-client.ts:293-315` upserts the generic fallback
into `foodImage` with `imageSource: 'fallback'`. The read at `:210-228` is
`prisma.foodImage.findUnique({ where: { normalizedKey } })` with no condition on
`imageSource` and no age check. One transient Pexels failure — a timeout, a rate
limit, a bad minute — permanently assigns that dish a generic stock photo. The
retry never happens because the cache hit prevents it. The same shape exists on
the workout path at `:475`.

**F2 — two of the eleven hardcoded fallback URLs are dead.** Checked
2026-08-24, all eleven fetched with `-L --max-time 12`:

| Key | Photo ID | Status |
|---|---|---|
| food `dinner` | photo-1565299624946 | **404** |
| workout `chest` | photo-1571019613540 | **404** |
| workout `default` | photo-1571019613540 | **404** (same ID) |
| the other eight | — | 200 |

The workout `default` and `chest` share one dead ID, so every workout image
miss without a matching muscle key renders broken. And because of F1, each of
those 404s is then cached.

**Files:**
- Modify: `src/lib/external/pexels-client.ts`
- Create: `scripts/check-fallback-images.ts`
- Test: `src/lib/external/fallback-images.test.ts` (create)

**Interfaces:**
- Produces: `export const FOOD_FALLBACKS` and `export const WORKOUT_FALLBACKS`
  — the two maps lifted out of their methods so a test and a script can read
  them. Nothing else consumes them.

- [ ] **Step 1: Replace the dead URLs**

In `src/lib/external/pexels-client.ts`, change the food map entry at :626:

```typescript
      'dinner': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
```

and the workout map entries at :638 and :645:

```typescript
      'chest': 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
...
      'default': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=300&fit=crop'
```

`chest` and `default` get different IDs on purpose. They pointed at the same
photo, so one dead ID took out both the muscle-specific and the catch-all path.

These three replacements were fetched 2026-08-24 and returned 200. Step 3
re-checks them at execution time rather than trusting this paragraph — a URL
verified when a plan was written is exactly the kind of claim that rots.

- [ ] **Step 2: Lift the maps out so they can be checked**

The two maps are object literals inside `getFallbackImage` and its workout
equivalent. Locate them — `grep -n "getFallbackImage\|images.unsplash.com"
src/lib/external/pexels-client.ts` — and move each literal to a module-level
export above the class:

```typescript
export const FOOD_FALLBACKS: Record<string, string> = {
  breakfast: '...',
  lunch: '...',
  dinner: '...',
  default: '...',
};

export const WORKOUT_FALLBACKS: Record<string, string> = {
  chest: '...',
  back: '...',
  legs: '...',
  arms: '...',
  shoulders: '...',
  core: '...',
  'full body': '...',
  default: '...',
};
```

Then have the methods index into the exported constants. Keep the existing key
lookup and default behaviour exactly — read the current method bodies and
preserve whatever normalization they do on the incoming `mealType` /
muscle name. This step must not change which image any input maps to; it only
makes the mapping addressable from outside the class.

- [ ] **Step 3: Write the liveness script**

Create `scripts/check-fallback-images.ts`:

```typescript
import { FOOD_FALLBACKS, WORKOUT_FALLBACKS } from '../src/lib/external/pexels-client';

async function check(label: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    const ok = res.ok;
    console.log(`${ok ? '✅' : '❌'} ${res.status}  ${label}  ${url}`);
    return ok;
  } catch (err) {
    console.log(`❌ ERR   ${label}  ${url}  ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  const entries = [
    ...Object.entries(FOOD_FALLBACKS).map(([k, v]) => [`food/${k}`, v] as const),
    ...Object.entries(WORKOUT_FALLBACKS).map(([k, v]) => [`workout/${k}`, v] as const),
  ];
  const results = await Promise.all(entries.map(([k, v]) => check(k, v)));
  const dead = results.filter(r => !r).length;
  console.log(`\n${entries.length - dead}/${entries.length} fallback images live`);
  if (dead > 0) process.exit(1);
}

main();
```

Run it:

```bash
npx tsx scripts/check-fallback-images.ts
```

Expected: `11/11 fallback images live`, exit 0. If any report 404, replace that
URL before continuing — the whole point of the task is that this must be zero.
Importing `pexels-client` pulls in the Prisma client; if that fails at import
time in a bare script context, move the two maps to their own file
(`src/lib/external/fallback-images.ts`) and import from there instead. Prefer
that structure if it works, since it is the cleaner boundary anyway.

- [ ] **Step 4: Write the failing test for the TTL**

Create `src/lib/external/fallback-images.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { isFallbackStale, FALLBACK_TTL_MS } from './pexels-client';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

test('a fresh fallback is reused', () => {
  assert.equal(isFallbackStale({ imageSource: 'fallback', updatedAt: daysAgo(1) }), false);
});

test('an old fallback is retried', () => {
  assert.equal(isFallbackStale({ imageSource: 'fallback', updatedAt: daysAgo(30) }), true);
});

test('a real Pexels image never expires', () => {
  assert.equal(isFallbackStale({ imageSource: 'pexels', updatedAt: daysAgo(3650) }), false);
});

test('a missing timestamp is treated as stale rather than as fresh', () => {
  assert.equal(isFallbackStale({ imageSource: 'fallback', updatedAt: null }), true);
});

test('the TTL is a week, not a day and not a year', () => {
  assert.ok(FALLBACK_TTL_MS >= 5 * 24 * 60 * 60 * 1000);
  assert.ok(FALLBACK_TTL_MS <= 14 * 24 * 60 * 60 * 1000);
});
```

Run it:

```bash
npx tsx --test "src/lib/external/fallback-images.test.ts"
```

Expected: FAIL — `isFallbackStale` is not exported.

- [ ] **Step 5: Add the TTL**

In `src/lib/external/pexels-client.ts`, above the class:

```typescript
export const FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A fallback is a record that Pexels had nothing that minute, not that the dish
 * has no photo. Cached without expiry it meant one timeout permanently assigned
 * a generic stock image, and the cache hit prevented the retry that would have
 * fixed it. Real Pexels results do not expire — those are answers, not misses.
 */
export function isFallbackStale(
  cached: { imageSource: string | null; updatedAt: Date | null }
): boolean {
  if (cached.imageSource !== 'fallback') return false;
  if (!cached.updatedAt) return true;
  return Date.now() - cached.updatedAt.getTime() > FALLBACK_TTL_MS;
}
```

Confirm the column name first. `grep -n "model FoodImage" -A 20
prisma/schema.prisma` — the field may be `updatedAt`, `lastUsed`, or both. The
upsert at `:296-315` sets `lastUsed: new Date()` in its `update` branch, and
`lastUsed` is bumped on every *read* as well as on write, so it measures
popularity, not age. Use whichever field records when the row's `imageUrl` was
last written. If only `lastUsed` exists, add `updatedAt DateTime @updatedAt` —
and stop: that is a schema change to the shared production database, so ask the
user before running `prisma migrate dev`, per `CLAUDE.md`.

If the user declines the migration, fall back to `lastUsed` and say so in the
commit message. The TTL then expires popular fallbacks more slowly than
unpopular ones, which is wrong but still strictly better than never.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx tsx --test "src/lib/external/fallback-images.test.ts"
```

Expected: 5 pass, 0 fail.

- [ ] **Step 7: Use it on both read paths**

The food read is at `:210-228`:

```typescript
      const cached = await prisma.foodImage.findUnique({
        where: { normalizedKey }
      });
```

followed by a hit branch returning `imageSource: cached.imageSource as ...`.
Read the actual branch before editing — the summary line numbers will have
moved. Guard the hit:

```typescript
      if (cached && !isFallbackStale(cached)) {
        // ... existing hit branch, unchanged
      }
      if (cached) {
        console.log(`[PEXELS] ♻️ Fallback for "${normalizedKey}" is stale, retrying Pexels`);
      }
```

Do the same at the workout read (`:475`). Both then fall through to the existing
API path, and the existing upsert overwrites the stale row — no delete is
needed, and none should be added. A stale fallback that fails again is simply
re-upserted with a fresh timestamp, which resets the clock. That is correct: the
next retry is another week out, not immediate.

- [ ] **Step 8: Verify**

```bash
npx tsx scripts/check-fallback-images.ts
npm run dev
```

The script must print `11/11`. Then generate a meal plan and confirm in the
server log that cache hits still say `Cache hit` for dishes with real Pexels
images, and that no dish renders a broken image in the UI.

To see the retry path, you would need a row whose `imageSource` is `fallback`
and whose timestamp is over a week old. Those exist in production already — that
is the bug. Do not edit production rows to manufacture one; the unit tests cover
the predicate and the log line will show it firing on its own within a week.

- [ ] **Step 9: Commit**

```bash
git add src/lib/external/pexels-client.ts scripts/check-fallback-images.ts src/lib/external/fallback-images.test.ts
git commit -m "fix(images): expire cached fallbacks, and replace two dead URLs

A fallback records that Pexels had nothing that minute, not that the dish has no
photo. It was cached with no expiry and read back with no age check, so one
timeout permanently assigned a dish a generic stock image and the cache hit
prevented the retry that would have fixed it. Fallbacks now expire after a week;
real Pexels results still never expire, because those are answers.

Two of the eleven hardcoded fallback URLs 404. The workout 'chest' and 'default'
keys shared one dead photo ID, so every workout image miss without a matching
muscle key rendered broken — and then got cached. They now have separate live
IDs, and scripts/check-fallback-images.ts checks all eleven so the next dead one
is found by running a script rather than by a user seeing a broken image."
```

---

## Section G — Documentation

### Task 21: Make the orientation docs true again

Closes G1, G2.

Both files were accurate when written. `CLAUDE.md` says so about itself:
"Believe the code over the docs… Line numbers especially." This task applies that
rule to the two documents an agent reads first.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AUDIT-RESULTS.md`

**Interfaces:** none.

- [ ] **Step 1: Fix the dietary-exclusion pointer**

`CLAUDE.md`, under "Known traps", says:

> Dietary exclusions (vegan/halal/coeliac) are enforced in `processWithGPT4`
> (`perplexity-client.ts:571-601`), **not** in the Sonar prompt.

The function is still `processWithGPT4` and the claim is still true, but the
lines have moved. Verify and get the current numbers:

```bash
grep -n "vegan:\|halal:\|VEGAN:\|HALAL:" src/lib/external/perplexity-client.ts
```

As of 2026-08-24 that returns 829 and 834, inside a map beginning around 822 —
not 571-601. Re-run it rather than copying those numbers; if Plan 2 Task 5 or
Plan 3 Task 11 has landed, they will have moved again.

Replace the parenthetical with the function and the symbol rather than a line
range, so it stops rotting:

> Dietary exclusions (vegan/halal/coeliac) are enforced in `processWithGPT4` in
> `src/lib/external/perplexity-client.ts` — grep for `'VEGAN:'` — **not** in the
> Sonar prompt. Deleting that function without moving the logic silently breaks
> dietary filtering.

- [ ] **Step 2: Fix the "no test framework" claim**

`CLAUDE.md` currently says:

> ## There is no test framework
> `package.json` has no test script. Nothing in this repo is covered by
> automated tests.

Plan 1 and this plan add `*.test.ts` files co-located with the modules they
cover, run with Node's built-in runner. Check what actually exists before
writing the replacement:

```bash
find src scripts -name "*.test.ts" | wc -l
grep -n '"test"' package.json
```

If that count is zero, **skip this step and leave the section alone** — Plan 1
has not been executed and the claim is still true. Do not write a document that
describes tests nobody can run.

If tests do exist, replace the section with what is actually there:

> ## Tests
>
> Node's built-in runner via `npx tsx --test`, no new dependencies. Globs must be
> quoted for zsh:
>
> ```bash
> npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
> ```
>
> Test files sit next to the modules they cover, not in a separate tree.
>
> Coverage is partial and deliberate: it covers the pure helpers extracted
> during the 2026-08-24 correctness work. Route handlers, React components and
> anything that talks to OpenAI, Perplexity, Places or Prisma are not covered
> and are still verified by running the app.
>
> `next build` has `ignoreBuildErrors` on, so a green build proves nothing.
> `npx tsc --noEmit` is the real type check (~32 pre-existing errors; don't fix
> them incidentally).

Keep the last paragraph — it is still true and it is the more important warning.

- [ ] **Step 3: Date-stamp AUDIT-RESULTS.md**

`AUDIT-RESULTS.md` is a timeout investigation from February 2026. Its "Current
Configuration" section (`:26-32`) states:

```
- **Model**: `gpt-4o-mini`
- **Response Format**: `json_object`
```

Both are false. `src/lib/ai/models.ts:6-15` now defines roles resolving to
`gpt-5.4-mini`, `gpt-5.6-luna` and `sonar`, and Phase 0 replaced `json_object`
with strict `json_schema` everywhere. An agent reading that section will reason
about the wrong system.

Do not rewrite the analysis. It was a real investigation and its token-budget
reasoning is still instructive. Add a header immediately after the H1:

```markdown
> **Historical — February 2026.** This documents a `gpt-4o-mini` /
> `json_object` configuration that no longer exists. Models are now selected by
> role in `src/lib/ai/models.ts`, and every OpenAI call uses strict
> `json_schema`. The token-budget analysis below still describes the shape of
> the problem; the specific model names, limits and response-format claims do
> not describe this codebase. For current correctness findings see
> `docs/superpowers/specs/2026-08-24-generation-correctness-audit.md`.
```

Verify the model claim before writing it:

```bash
sed -n '1,20p' src/lib/ai/models.ts
grep -rn "json_object" src/ --include="*.ts" | head
```

The second command should return nothing. If it returns hits, Phase 0 is
incomplete and the header's claim about `json_schema` is too strong — narrow it
to name only the paths that were migrated, and say which were not.

- [ ] **Step 4: Point CLAUDE.md at the current work**

`CLAUDE.md`'s "The current work" section describes four plans dated 2026-08-17
and `README-HANDOFF.md`'s execution order. That is still accurate. Append the
three plans from this audit to the ordering block, after the existing list:

```
Then, from the 2026-08-24 correctness audit:

  docs/superpowers/plans/2026-08-24-generation-eval-harness.md      first
  docs/superpowers/plans/2026-08-24-generation-safety-fixes.md      second
  docs/superpowers/plans/2026-08-24-generation-silent-wrongness.md  third

The harness goes first so the fixes have something to measure against.
Findings and severities are in
docs/superpowers/specs/2026-08-24-generation-correctness-audit.md.
```

Confirm all four paths exist before writing them — `ls docs/superpowers/plans/
docs/superpowers/specs/` — and drop any that do not.

- [ ] **Step 5: Verify**

Read both files start to finish. For each factual claim about the code, either
confirm it with a grep or delete it. This is a five-minute pass over two short
documents and it is the entire value of the task; skipping it produces a
document that is wrong in a new way rather than the old way.

Specifically check the claims in `CLAUDE.md`'s "Known traps" that this task does
not otherwise touch:

```bash
grep -n "withTimeout" src/lib/utils/retry.ts
grep -rn "AbortSignal" src/lib/utils/retry.ts | head
```

If Phase 0 Task 1 has landed, the `withTimeout` trap is fixed and that bullet
should be deleted rather than left as a warning about a bug that no longer
exists. Same for the recipe-cache-poisoning bullet if Phase 0 Task 7 landed —
check with `grep -n "safeParse" src/app/api/ai/recipes/generate/route.ts`, which
as of 2026-08-24 returns a hit at :97, meaning that trap is already closed and
the bullet is stale.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md AUDIT-RESULTS.md
git commit -m "docs: make the orientation files describe this codebase

CLAUDE.md pointed at perplexity-client.ts:571-601 for the dietary exclusions;
they are around :822-834 now. Replaced the line range with the function name and
a grep target so it stops rotting. AUDIT-RESULTS.md describes a gpt-4o-mini /
json_object configuration that no longer exists — kept the analysis, which is
still instructive, behind a header saying which parts no longer apply.

CLAUDE.md's own advice is to believe the code over the docs. This applies it to
the two files an agent reads first."
```

---
