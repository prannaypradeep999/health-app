# Generation Safety Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every S1 finding in the generation-correctness audit — the ones where a user with a dietary restriction, an allergy, or an injury currently receives output generated as though they had told us nothing, and the ones where the app shows a link it has never tested.

**Architecture:** Three kinds of change, in this order. First, make the safety data the user already gave us actually reach the model: allergies into the menu prompts, injuries into a UI that can write them, dietary restrictions into the recipe route. Second, stop the model inventing facts we can look up or simply do not have: seed the direct ordering link from Google Places, verify every link with a real HTTP request, drop the two restaurant macros that exist in no upstream source. Third, make the recipe cache safe to share: key it on the restrictions the recipe was generated under, and refuse to write a recipe whose own numbers do not add up.

**Tech Stack:** TypeScript, Next.js 16 App Router, Zod 3.25 strict JSON schemas, Prisma 6 (remote Neon Postgres — **production data**), `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-08-24-generation-correctness-audit.md`

**Depends on:** `docs/superpowers/plans/2026-08-24-generation-eval-harness.md` (Plan 1). Land Plan 1 first. Two reasons, and only one of them is measurement:

1. Plan 1 Task 10 captures a baseline. Without it there is no before-number for any fix here to move.
2. **Task 4 of this plan takes ownership of code Plan 1 wrote.** Plan 1 Task 4 created `probe`, `PLATFORM_HOSTS` and the homepage-redirect test inside `scripts/eval/links.ts`. Production needs the same three primitives. Task 4 below moves them into `src/lib/external/link-check.ts` and rewrites `scripts/eval/links.ts` to import them. Executing Task 4 before Plan 1 Task 4 exists will fail at the delete step.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No new npm dependencies.** Not one. `node:test`, `node:assert/strict` and the platform `fetch` are the whole toolkit.
- **`DATABASE_URL` points at production.** There is no local database and no staging copy. Do not run `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, or the seed script. **No task in this plan requires a schema migration** — this is a deliberate design constraint, and Task 9 explains how the recipe cache key changes without one. If you find yourself reaching for a migration, stop and report rather than running it.
- **Test command:** `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"`. Quote the globs — zsh expands unquoted globs itself and errors with `no matches found`.
- **`npx tsc --noEmit` has roughly 32 pre-existing errors.** The bar is *no new* errors, not zero errors. Capture the count before you start (`npx tsc --noEmit 2>&1 | grep -c "error TS"`) and compare after.
- **`next build` has `ignoreBuildErrors` on.** A successful build proves nothing about types. `npx tsc --noEmit` is the real check.
- **Every new pure function gets a `node:test` file next to it.** Route handlers and React components are verified by inspection and by a manual run, because this repo has no way to test them otherwise; say so explicitly rather than implying coverage.
- **Tolerances are copied, never re-derived.** `ingredient-validator.ts` uses warn > 10% / error > 20%. `meal-plan-validator.ts` uses warn > 10% / error > 15%. Do not change either number in this plan.
- **Commit after every task.** One task, one commit, message naming the finding IDs it closes.

## Findings closed by this plan

| Task | Findings | One line |
|---|---|---|
| 1 | B12 | `RESTRICTION_MAPPINGS` covers 2 of 10 diets; substring matching has false positives |
| 2 | B11 | `foodAllergies` never reach either menu prompt |
| 3 | B8 | Restaurant `carbs` and `fat` exist in no upstream source |
| 4 | B1, B6 | No link liveness check exists; no host allow-list |
| 5 | B4 | The one Google-verified URL in the system is discarded |
| 6 | B1 (wiring) | Links reach the user unverified |
| 7 | C7, C8 | Three grocery stores are structurally mandatory; a comment claims Places verification that does not exist |
| 8 | D8 | `injuryConsiderations` has no UI write site |
| 9 | E1, E2 | Recipe cache keyed on dish name alone; restrictions never sent |
| 10 | E4 | A recipe that fails its own arithmetic is cached anyway |

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/utils/restriction-validator.ts` | *Modify.* Full diet coverage, alias normalisation, word-boundary matching. |
| `src/lib/utils/restriction-validator.test.ts` | *Create.* Unit tests for the above. |
| `src/lib/ai/prompts/restaurant-menu.ts` | *Create.* The two restaurant-menu prompt builders, extracted from `perplexity-client.ts` so they are pure and testable. |
| `src/lib/ai/prompts/restaurant-menu.test.ts` | *Create.* Asserts allergies and diets appear in both prompts. |
| `src/lib/external/link-check.ts` | *Create.* `probe`, `PLATFORM_HOSTS`, `parseHttpUrl`, `isHomepageRedirect`. The single implementation, shared by production and the eval harness. |
| `src/lib/external/link-check.test.ts` | *Create.* Offline tests for the pure parts. |
| `scripts/eval/links.ts` | *Modify.* Delete its local copies; import from `src/lib/external/link-check`. |
| `src/lib/external/perplexity-client.ts` | *Modify.* Use the extracted prompts; unpin the grocery store count; correct a false comment. |
| `src/lib/ai/schemas/restaurants.ts` | *Modify.* Add `estimatedCarbs` / `estimatedFat` to `MenuExtractionSchema`. |
| `src/lib/ai/schemas/grocery.ts` | *Modify.* Bound the store array 1–3 instead of pinning it at 3. |
| `src/lib/ai/schemas/index.ts` | *Modify.* Delete `pinnedGroceryStores`, now unused. |
| `src/app/api/ai/meals/generate-restaurants/route.ts` | *Modify.* Seed `direct` from Places `website`; verify links before returning. |
| `src/lib/survey/resolve.ts` | *Create.* Server-side survey lookup from cookies, extracted from the pattern duplicated across routes. |
| `src/app/api/ai/recipes/generate/route.ts` | *Modify.* Resolve restrictions server-side, key the cache on them, block the write on arithmetic errors. |
| `src/app/survey/page.tsx` | *Modify.* Add the injury capture UI. |

---

## Task 1: Make the restriction validator cover every diet the survey offers

**Finding B12.** `RESTRICTION_MAPPINGS` has entries for `vegetarian` and `vegan` and nothing else. A user who selects halal, kosher, gluten-free, dairy-free, keto, paleo or pescatarian gets `RESTRICTION_MAPPINGS[pref] === undefined`, the `if (mappedFoods)` guard skips them, and zero forbidden terms are registered. The validator then reports `valid: true` for a plan it never examined.

Two problems get fixed together, because fixing only the first makes the second worse. The lookup is `searchText.includes(term)`, a raw substring test. Adding `gluten` (which maps to `wheat`, `bread`, `pasta`, …) and `eggs` to the active set multiplies the false positives that test already produces: `egg` matches **eggplant**, `ham` matches **hamburger** and **hammered**, `oats` matches **oatstraw**. Word-boundary matching is not a nicety here; it is what makes the expanded table usable.

**Files:**
- Modify: `src/lib/utils/restriction-validator.ts` (whole file rewrite — it is 111 lines)
- Test: `src/lib/utils/restriction-validator.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `normalizeRestriction(raw: string): string` — lowercases, trims, and maps aliases to canonical keys.
  - `containsTerm(text: string, term: string): boolean` — word-boundary-aware, plural-tolerant substring test.
  - `validateRestrictions(meals, userRestrictions)` — unchanged signature and unchanged return type. Callers do not change.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/restriction-validator.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRestrictions, normalizeRestriction, containsTerm } from './restriction-validator';

const meal = (name: string, ingredients: string[] = []) => ({
  name, ingredients, day: 'monday', mealType: 'dinner',
});

test('normalizeRestriction folds the aliases the survey actually stores', () => {
  assert.equal(normalizeRestriction('Gluten-Free'), 'gluten');
  assert.equal(normalizeRestriction('gluten free'), 'gluten');
  assert.equal(normalizeRestriction('coeliac'), 'gluten');
  assert.equal(normalizeRestriction('celiac'), 'gluten');
  assert.equal(normalizeRestriction('Dairy-Free'), 'dairy');
  assert.equal(normalizeRestriction('lactose intolerant'), 'dairy');
  assert.equal(normalizeRestriction('tree nuts'), 'nuts');
  assert.equal(normalizeRestriction('peanut'), 'nuts');
  assert.equal(normalizeRestriction('  VEGAN '), 'vegan');
});

test('normalizeRestriction leaves an unknown value alone rather than dropping it', () => {
  assert.equal(normalizeRestriction('low-FODMAP'), 'low-fodmap');
});

test('containsTerm respects word boundaries', () => {
  assert.equal(containsTerm('grilled eggplant parmesan', 'egg'), false);
  assert.equal(containsTerm('scrambled egg on toast', 'egg'), true);
  assert.equal(containsTerm('shellfish linguine', 'fish'), false);
  assert.equal(containsTerm('fish tacos', 'fish'), true);
  assert.equal(containsTerm('hamburger', 'ham'), false);
  assert.equal(containsTerm('ham and cheese', 'ham'), true);
});

test('containsTerm tolerates plurals', () => {
  assert.equal(containsTerm('roasted almonds', 'almond'), true);
  assert.equal(containsTerm('two poached eggs', 'eggs'), true);
  assert.equal(containsTerm('sweet potatoes', 'potato'), true);
});

test('halal flags pork, which the old table let through', () => {
  const r = validateRestrictions([meal('Pork belly bao')], { dietPrefs: ['halal'] });
  assert.equal(r.valid, false);
  assert.equal(r.violations[0].restriction, 'halal');
  assert.equal(r.violations[0].severity, 'error');
});

test('kosher flags shellfish', () => {
  const r = validateRestrictions([meal('Shrimp scampi')], { dietPrefs: ['kosher'] });
  assert.equal(r.valid, false);
});

test('gluten-free flags a pasta dish through its alias', () => {
  const r = validateRestrictions([meal('Chicken pasta bake')], { dietPrefs: ['gluten-free'] });
  assert.equal(r.valid, false);
  assert.ok(r.violations.some(v => v.ingredient === 'pasta'));
});

test('pescatarian allows fish and forbids chicken', () => {
  const ok = validateRestrictions([meal('Grilled salmon')], { dietPrefs: ['pescatarian'] });
  assert.equal(ok.valid, true);
  const bad = validateRestrictions([meal('Grilled chicken')], { dietPrefs: ['pescatarian'] });
  assert.equal(bad.valid, false);
});

test('keto is a preference, not a safety rule — it warns rather than erroring', () => {
  const r = validateRestrictions([meal('Rice bowl')], { dietPrefs: ['keto'] });
  assert.equal(r.valid, true, 'a keto miss must not invalidate the plan');
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].severity, 'warning');
});

test('an allergy is always an error and is matched through its alias table', () => {
  const r = validateRestrictions([meal('Pad thai', ['crushed peanuts'])], { foodAllergies: ['peanut'] });
  assert.equal(r.valid, false);
  assert.ok(r.violations.every(v => v.severity === 'error'));
});

test('a vegan plan of vegetables is clean — no false positive from eggplant', () => {
  const r = validateRestrictions([meal('Eggplant caponata', ['eggplant', 'olive oil'])], { dietPrefs: ['vegan'] });
  assert.deepEqual(r.violations, []);
  assert.equal(r.valid, true);
});

test('unknown restrictions register no terms and do not crash', () => {
  const r = validateRestrictions([meal('Anything')], { dietPrefs: ['low-FODMAP'] });
  assert.equal(r.valid, true);
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx --test src/lib/utils/restriction-validator.test.ts
```

Expected: fails. `normalizeRestriction` and `containsTerm` are not exported yet, so the import throws before any test body runs.

- [ ] **Step 3: Rewrite `src/lib/utils/restriction-validator.ts`**

Keep `RestrictionViolation` and `RestrictionValidationResult` byte-identical — they are imported elsewhere. Replace everything from the `RESTRICTION_MAPPINGS` const to the end of the file with:

```typescript
/**
 * Survey values arrive in whatever casing and phrasing the UI offered, and the
 * same restriction has several names. `gluten-free`, `gluten free` and
 * `coeliac` are one rule; `peanut` and `tree nuts` both mean the nut list.
 * Folding them here is what lets the table below have one entry per rule.
 *
 * An unrecognised value is lowercased and returned unchanged rather than
 * dropped. It will find no entry in the table and register no terms — which is
 * the old behaviour, now confined to values we genuinely have no list for.
 */
const ALIASES: Record<string, string> = {
  'gluten-free': 'gluten',
  'gluten free': 'gluten',
  glutenfree: 'gluten',
  celiac: 'gluten',
  coeliac: 'gluten',
  wheat: 'gluten',
  'dairy-free': 'dairy',
  'dairy free': 'dairy',
  'lactose intolerant': 'dairy',
  'lactose-free': 'dairy',
  lactose: 'dairy',
  milk: 'dairy',
  'nut-free': 'nuts',
  'nut free': 'nuts',
  'tree nuts': 'nuts',
  'tree nut': 'nuts',
  nut: 'nuts',
  peanut: 'nuts',
  peanuts: 'nuts',
  egg: 'eggs',
  'egg-free': 'eggs',
  crustacean: 'shellfish',
  seafood: 'shellfish',
  'soy-free': 'soy',
  soya: 'soy',
};

export function normalizeRestriction(raw: string): string {
  const key = String(raw ?? '').toLowerCase().trim();
  return ALIASES[key] ?? key;
}

// Foods that belong to each restriction category, keyed on the canonical name
// normalizeRestriction produces.
//
// `mediterranean` is deliberately absent: it is a preference expressed as what
// to favour, not a list of what to exclude, so there is nothing here it could
// honestly contain. It normalizes to itself, matches no entry, and registers no
// terms — the correct outcome rather than an accidental one.
const RESTRICTION_MAPPINGS: Record<string, string[]> = {
  // Diet types
  vegetarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'steak', 'ground beef', 'ground turkey', 'sausage', 'fish', 'salmon', 'tuna', 'shrimp', 'cod', 'tilapia', 'anchovy', 'gelatin'],
  vegan: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'fish', 'salmon', 'eggs', 'milk', 'cheese', 'yogurt', 'butter', 'cream', 'honey', 'whey', 'gelatin'],
  pescatarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'steak', 'ground beef', 'ground turkey', 'sausage', 'duck', 'venison', 'prosciutto'],
  halal: ['pork', 'bacon', 'ham', 'sausage', 'prosciutto', 'pepperoni', 'lard', 'gelatin', 'wine', 'beer', 'rum', 'vodka', 'alcohol'],
  kosher: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'lard', 'shrimp', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'catfish', 'cheeseburger'],
  keto: ['rice', 'pasta', 'bread', 'potato', 'tortilla', 'bagel', 'oats', 'cereal', 'sugar', 'banana', 'couscous', 'quinoa'],
  paleo: ['bread', 'pasta', 'rice', 'oats', 'cereal', 'beans', 'lentils', 'chickpeas', 'peanut', 'milk', 'cheese', 'yogurt', 'sugar', 'couscous'],

  // Category exclusions
  dairy: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'ice cream', 'sour cream', 'cream cheese', 'cottage cheese', 'ricotta', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'whey'],
  gluten: ['wheat', 'bread', 'pasta', 'flour', 'tortilla', 'bagel', 'croissant', 'muffin', 'cake', 'cookie', 'cracker', 'cereal', 'barley', 'rye', 'couscous', 'seitan', 'soy sauce', 'orzo', 'farro', 'panko'],
  nuts: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'peanut', 'pine nut'],
  shellfish: ['shrimp', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish', 'prawn'],
  fish: ['salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'sardine', 'anchovy', 'mackerel', 'bass'],
  eggs: ['egg', 'eggs', 'omelet', 'omelette', 'frittata', 'quiche', 'meringue', 'mayonnaise'],
  soy: ['soy', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce'],

  // Protein exclusions
  chicken: ['chicken'],
  beef: ['beef', 'steak', 'ground beef', 'brisket'],
  pork: ['pork', 'bacon', 'ham', 'sausage', 'prosciutto'],
  lamb: ['lamb'],
  turkey: ['turkey', 'ground turkey'],
};

/**
 * Diets a miss on which is a preference rather than a safety or religious
 * failure. They still produce a violation so it is visible; they do not make
 * the plan invalid. Without this split, adding keto and paleo to the table
 * above would start failing plans over a bowl of rice.
 */
const PREFERENCE_ONLY = new Set(['keto', 'paleo']);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The old test was `searchText.includes(term)`. That is why `egg` matched
 * eggplant and `ham` matched hamburger — and with the expanded table above,
 * `fish` would have matched shellfish and flagged every kosher plan containing
 * one. Anchoring both ends on a word boundary is the whole fix; the optional
 * plural suffix is what keeps "almonds" matching the term "almond".
 */
export function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return new RegExp(`\\b${escapeRegExp(t)}(s|es)?\\b`, 'i').test(text);
}

export function validateRestrictions(
  meals: any[],
  userRestrictions: {
    dietPrefs?: string[];
    strictExclusions?: Record<string, string[]>;
    foodAllergies?: string[];
  }
): RestrictionValidationResult {
  const violations: RestrictionViolation[] = [];

  const forbiddenTerms: { term: string; restriction: string; severity: 'error' | 'warning' }[] = [];

  (userRestrictions.dietPrefs || []).forEach(pref => {
    const key = normalizeRestriction(pref);
    const severity: 'error' | 'warning' = PREFERENCE_ONLY.has(key) ? 'warning' : 'error';
    (RESTRICTION_MAPPINGS[key] || []).forEach(food => {
      forbiddenTerms.push({ term: food, restriction: pref, severity });
    });
  });

  Object.entries(userRestrictions.strictExclusions || {}).forEach(([category, items]) => {
    (RESTRICTION_MAPPINGS[normalizeRestriction(category)] || []).forEach(food => {
      forbiddenTerms.push({ term: food, restriction: `${category} dislike`, severity: 'warning' });
    });
    (items || []).forEach(item => {
      forbiddenTerms.push({ term: String(item).toLowerCase(), restriction: `dislike: ${item}`, severity: 'warning' });
    });
  });

  (userRestrictions.foodAllergies || []).forEach(allergy => {
    const key = normalizeRestriction(allergy);
    // The literal allergen the user typed, plus everything in its category.
    // An allergy is never downgraded to a warning.
    forbiddenTerms.push({ term: key, restriction: `allergy: ${allergy}`, severity: 'error' });
    (RESTRICTION_MAPPINGS[key] || []).forEach(food => {
      forbiddenTerms.push({ term: food, restriction: `allergy: ${allergy}`, severity: 'error' });
    });
  });

  meals.forEach(meal => {
    const mealName = (meal.name || meal.dish || meal.description || '').toLowerCase();
    const ingredients = Array.isArray(meal.ingredients)
      ? meal.ingredients.map((item: any) => String(item).toLowerCase()).join(' ')
      : '';
    const searchText = `${mealName} ${ingredients}`;

    forbiddenTerms.forEach(({ term, restriction, severity }) => {
      if (containsTerm(searchText, term)) {
        violations.push({
          mealName: meal.name || meal.dish || meal.description || 'Unknown meal',
          day: meal.day || 'unknown',
          mealType: meal.mealType || 'unknown',
          violation: `Contains "${term}"`,
          ingredient: term,
          restriction,
          severity,
        });
      }
    });
  });

  return {
    valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx tsx --test src/lib/utils/restriction-validator.test.ts
```

Expected: all pass.

- [ ] **Step 5: Confirm no new type errors and no caller broke**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
grep -rn "validateRestrictions" src/ --include="*.ts" --include="*.tsx"
```

Expected: the error count matches the baseline you captured. The signature did not change, so every call site compiles unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/restriction-validator.ts src/lib/utils/restriction-validator.test.ts
git commit -m "fix(restrictions): cover every diet the survey offers, and match on word boundaries

B12. RESTRICTION_MAPPINGS had entries for vegetarian and vegan only, so halal,
kosher, gluten-free, dairy-free, keto, paleo and pescatarian registered zero
forbidden terms and the validator reported a clean plan it had not examined.
Substring matching is replaced with word-boundary matching in the same change,
because the expanded table makes egg/eggplant and fish/shellfish reachable."
```

---

## Task 2: Route `foodAllergies` into both restaurant-menu prompts

**Finding B11.** The survey collects `foodAllergies`, the restaurant route reads it (`generate-restaurants/route.ts`, in the `userRestrictions` object), and it is used for exactly one thing: a *post-hoc* `validateRestrictions` call whose result is written to the database and, per B13, read by nobody. Neither prompt that selects dishes has ever seen it. `buildMenuQuery` reads `surveyData.dietPrefs` only. `processWithGPT4`'s `RULES` block reads `surveyData.dietPrefs` only. A user with a peanut allergy gets dishes chosen without reference to it.

The prompts are extracted into `src/lib/ai/prompts/restaurant-menu.ts` first, for the same reason Plan 1 Task 8 extracted `createGroceryPricePrompt`: a template literal buried in a private method of a class whose constructor throws without an API key cannot be asserted on. Once it is a pure exported function, "does the allergy appear in the prompt" is a two-line test instead of a manual read.

**Files:**
- Create: `src/lib/ai/prompts/restaurant-menu.ts`
- Create: `src/lib/ai/prompts/restaurant-menu.test.ts`
- Modify: `src/lib/ai/prompts/index.ts` (one re-export line)
- Modify: `src/lib/external/perplexity-client.ts` (delete `buildMenuQuery`; replace the inline `gptPrompt`)

**Interfaces:**
- Consumes: `normalizeRestriction` from `src/lib/utils/restriction-validator` (Task 1).
- Produces:
  - `buildAllergyBlock(surveyData: MenuPromptSurvey): string` — empty string when there are no allergies.
  - `buildDietaryRulesBlock(surveyData: MenuPromptSurvey): string`
  - `createMenuSearchPrompt(restaurant: any, surveyData: MenuPromptSurvey): string`
  - `createMenuStructuringPrompt(args: { content: string; citations: any[]; restaurant: any; surveyData: MenuPromptSurvey }): string`
  - `MenuPromptSurvey` — the survey fields these prompts read.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/prompts/restaurant-menu.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllergyBlock,
  buildDietaryRulesBlock,
  createMenuSearchPrompt,
  createMenuStructuringPrompt,
} from './restaurant-menu';

const restaurant = { name: 'Sakura Ramen House', address: '1 Post St', city: 'San Francisco', cuisine: 'japanese' };
const survey = {
  dietPrefs: ['halal'],
  foodAllergies: ['peanut', 'shellfish'],
  preferredCuisines: ['japanese'],
  goal: 'muscle_gain',
  streetAddress: '500 Market St',
  city: 'San Francisco',
  state: 'CA',
  zipCode: '94105',
  distancePreference: 'medium',
};

test('buildAllergyBlock is empty when the user reported no allergies', () => {
  assert.equal(buildAllergyBlock({ ...survey, foodAllergies: [] }), '');
  assert.equal(buildAllergyBlock({}), '');
});

test('buildAllergyBlock names every allergen', () => {
  const block = buildAllergyBlock(survey);
  assert.match(block, /peanut/i);
  assert.match(block, /shellfish/i);
});

test('the search prompt carries the allergies', () => {
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /peanut/i);
  assert.match(p, /shellfish/i);
});

test('the search prompt still carries what it always carried', () => {
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /Sakura Ramen House/);
  assert.match(p, /doordash\.com/);
  assert.match(p, /ubereats\.com/);
  assert.match(p, /grubhub\.com/);
  assert.match(p, /3 miles/, 'distancePreference "medium" maps to 3 miles');
});

test('the structuring prompt carries the allergies and the diet rule', () => {
  const p = createMenuStructuringPrompt({
    content: 'Chicken katsu $14',
    citations: ['https://example.com/menu'],
    restaurant,
    surveyData: survey,
  });
  assert.match(p, /peanut/i);
  assert.match(p, /HALAL/);
  assert.match(p, /Chicken katsu \$14/, 'the Perplexity content must be interpolated');
  assert.match(p, /https:\/\/example\.com\/menu/, 'citations must be interpolated');
});

test('an unknown diet still produces a hard exclusion rather than silence', () => {
  const p = createMenuStructuringPrompt({
    content: '', citations: [], restaurant,
    surveyData: { dietPrefs: ['low-FODMAP'] },
  });
  assert.match(p, /LOW-FODMAP/);
});

test('allergy instructions outrank preferences in wording', () => {
  const block = buildAllergyBlock(survey);
  assert.match(block, /NEVER|MUST NOT|absolutely/i);
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx --test src/lib/ai/prompts/restaurant-menu.test.ts
```

Expected: fails — `./restaurant-menu` does not exist.

- [ ] **Step 3: Create `src/lib/ai/prompts/restaurant-menu.ts`**

Move, do not retype, the two template literals. Open `src/lib/external/perplexity-client.ts` and cut:

1. The whole body of `private buildMenuQuery(restaurant: any, surveyData: any): string` — the six `const` declarations and the returned template literal.
2. The `const gptPrompt = \`…\`;` assignment inside `processWithGPT4`, from `Convert this restaurant menu information` through `Return ONLY valid JSON.`.

Paste them into the new file inside the functions below. The only edits to the moved text are the two marked `+++ NEW` insertions.

```typescript
import { normalizeRestriction } from '@/lib/utils/restriction-validator';

/** The survey fields the two restaurant-menu prompts read. */
export interface MenuPromptSurvey {
  dietPrefs?: string[];
  foodAllergies?: string[];
  preferredCuisines?: string[];
  goal?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  distancePreference?: string;
}

/**
 * B11: this block did not exist, and `foodAllergies` reached neither prompt.
 * The survey collected it, the route read it, and the only consumer was a
 * post-hoc validator whose output nothing renders — so an allergy influenced
 * nothing a user could see.
 *
 * Worded harder than the dietary rules on purpose. A diet is a preference the
 * model may trade off against calories or price; an allergen is not.
 */
export function buildAllergyBlock(surveyData: MenuPromptSurvey): string {
  const allergies = (surveyData.foodAllergies || []).map(a => String(a).trim()).filter(Boolean);
  if (allergies.length === 0) return '';
  return `
🚨 ALLERGIES — HARD EXCLUSION, NOT A PREFERENCE:
The user is allergic to: ${allergies.join(', ')}.
NEVER select a dish containing any of these, and never select a dish whose
description makes it unclear. If a dish might contain one, skip it and choose
another. A missing option is acceptable; an allergen is not.
`;
}

/**
 * Extracted verbatim from the IIFE that used to sit inline in processWithGPT4.
 * The lowercase keys are the values the survey actually persists — see the note
 * in restriction-validator.ts. `normalizeRestriction` is applied first so that
 * "Gluten-Free" and "gluten free" reach the same rule.
 */
export function buildDietaryRulesBlock(surveyData: MenuPromptSurvey): string {
  const restrictions = surveyData.dietPrefs || [];
  if (restrictions.length === 0) return '   - No dietary restrictions to apply';

  const RULES: Record<string, string> = {
    vegetarian:    'VEGETARIAN: Exclude dishes with meat, poultry, fish, or gelatin',
    vegan:         'VEGAN: Exclude dishes with any animal products (meat, dairy, eggs, honey)',
    pescatarian:   'PESCATARIAN: Exclude meat and poultry dishes, but fish/seafood is allowed',
    keto:          'KETO: Exclude high-carb dishes like rice bowls, pasta, or bread-heavy items',
    paleo:         'PALEO: Exclude grains, legumes, dairy, and processed/refined foods',
    mediterranean: 'MEDITERRANEAN: Prefer fish, vegetables, legumes and olive oil; exclude heavily processed or deep-fried dishes',
    halal:         'HALAL: Exclude pork dishes and non-halal meat options',
    kosher:        'KOSHER: Exclude pork and shellfish, and any dish mixing meat with dairy',
    gluten:        'GLUTEN-FREE: Exclude bread-based, pasta, or wheat dishes unless marked gluten-free',
    dairy:         'DAIRY-FREE: Exclude dishes with cheese, cream sauces, or dairy ingredients',
  };

  let rules = '';
  restrictions.forEach((pref: string) => {
    const key = normalizeRestriction(pref);
    // Unknown values must still produce a hard exclusion. Falling through
    // silently is what made this bug invisible the first time.
    rules += `   - ${RULES[key] ?? `${String(pref).toUpperCase()}: Strictly exclude any dish that violates a "${pref}" diet`}\n`;
  });
  return rules;
}

export function createMenuSearchPrompt(restaurant: any, surveyData: MenuPromptSurvey): string {
  // …the six const declarations moved verbatim from buildMenuQuery…
  // …the returned template literal moved verbatim, with ONE insertion…
}

export function createMenuStructuringPrompt(args: {
  content: string;
  citations: any[];
  restaurant: any;
  surveyData: MenuPromptSurvey;
}): string {
  // …the gptPrompt template literal moved verbatim, with ONE insertion…
}
```

The two insertions, in full:

**In `createMenuSearchPrompt`**, immediately after the `USER PREFERENCES (prioritize when selecting items):` block and before `INFORMATION TO INCLUDE:`, insert the interpolation:

```
${buildAllergyBlock(surveyData)}
```

**In `createMenuStructuringPrompt`**, the numbered rule `6. Apply dietary restrictions when extracting menu items:` currently interpolates an inline IIFE. Replace the IIFE with the extracted call and add rule 7:

```
6. Apply dietary restrictions when extracting menu items:
${buildDietaryRulesBlock(surveyData)}
7. Apply allergy exclusions before anything else:
${buildAllergyBlock(surveyData) || '   - No allergies reported'}
```

Note the two renamed `RULES` keys: `'gluten-free'` became `gluten` and `'dairy-free'` became `dairy`, because `normalizeRestriction` folds the hyphenated survey values onto those canonical names. The rule *text* still says GLUTEN-FREE and DAIRY-FREE — only the lookup key changed.

- [ ] **Step 4: Rewire `perplexity-client.ts`**

```typescript
// at the top, with the other prompt imports
import { createMenuSearchPrompt, createMenuStructuringPrompt } from '@/lib/ai/prompts/restaurant-menu';
```

In `getRestaurantMenu`, replace:

```typescript
const query = this.buildMenuQuery(restaurant, surveyData);
```

with:

```typescript
const query = createMenuSearchPrompt(restaurant, surveyData);
```

In `processWithGPT4`, replace the whole `const gptPrompt = \`…\`;` assignment with:

```typescript
const gptPrompt = createMenuStructuringPrompt({ content, citations, restaurant, surveyData });
```

Delete the now-orphaned `private buildMenuQuery` method. `restaurantName` and `restaurantCity` are still read further down in `processWithGPT4`, so leave those two `const` lines where they are.

Add the re-export to `src/lib/ai/prompts/index.ts`, next to the others:

```typescript
export * from './restaurant-menu';
```

- [ ] **Step 5: Verify the moved text survived the move**

The point of this step is that a hand-move of a 60-line template is exactly where a stray character gets lost.

```bash
git stash
npx tsx -e "
  const c = require('fs').readFileSync('src/lib/external/perplexity-client.ts','utf8');
  const m = c.match(/return \`Find the current menu[\s\S]*?VERIFIED ordering links only\.\`/);
  require('fs').writeFileSync('/tmp/before-search-prompt.txt', m[0]);
  console.log('captured', m[0].length, 'chars');
"
git stash pop
```

Then render the new function with an empty-allergy survey — which makes `buildAllergyBlock` return `''` — and diff:

```bash
npx tsx -e "
  import('./src/lib/ai/prompts/restaurant-menu.ts').then(m => {
    const out = m.createMenuSearchPrompt(
      { name: 'X', address: 'A', city: 'C', cuisine: 'mixed' },
      { streetAddress: 'S', city: 'C', state: 'ST', zipCode: '00000' }
    );
    require('fs').writeFileSync('/tmp/after-search-prompt.txt', out);
  });
"
diff <(sed -e 's/^return \`//' -e 's/\`$//' /tmp/before-search-prompt.txt) /tmp/after-search-prompt.txt
```

Expected: the only difference is one blank line where `${buildAllergyBlock(...)}` interpolated an empty string. If anything else differs, the move dropped something — fix it before continuing.

- [ ] **Step 6: Run the tests and the type check**

```bash
npx tsx --test src/lib/ai/prompts/restaurant-menu.test.ts
npx tsc --noEmit 2>&1 | grep -c "error TS"
grep -n "buildMenuQuery" src/lib/external/perplexity-client.ts
```

Expected: tests pass; error count matches baseline; the `grep` returns nothing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/prompts/restaurant-menu.ts src/lib/ai/prompts/restaurant-menu.test.ts src/lib/ai/prompts/index.ts src/lib/external/perplexity-client.ts
git commit -m "fix(restaurants): send the user's allergies to the prompts that pick their dishes

B11. foodAllergies was collected, read by the route, and used only for a
post-hoc validator whose output nothing renders. Neither the Sonar menu search
nor the GPT structuring step had ever seen it. Both prompts move into
lib/ai/prompts/restaurant-menu.ts on the way, so that what they contain is
assertable instead of buried in a private method."
```

---

## Task 3: Give restaurant carbs and fat an upstream source

**Finding B8.** `RestaurantMealObject` requires `carbs` and `fat`, so under grammar-constrained decoding the model *must* emit them. `MenuExtractionSchema` carries `estimatedCalories` and `estimatedProtein` and nothing else, and the menu listing the selection prompt renders is:

```
    - Chicken Katsu: $14.99 (lunch) - 780 cal, 42g protein
```

So the selection model is asked for two numbers it has never been shown. Worse, rule 5 of that prompt instructs it that *"`estimatedCalories`, `protein`, `carbs` and `fat` are each the SUM of those items' values as listed in the menu data above"* — an instruction that cannot be followed, because those values are not listed. The model complies by inventing, and the UI renders the invention beside two numbers that are real.

The fix follows the precedent already set for protein, which the comment above the listing line explains: a number the model is expected to report must first be a number it was shown. Extract carbs and fat at the same point calories and protein are extracted, print them in the listing, and rule 5 becomes true.

**Files:**
- Modify: `src/lib/ai/schemas/restaurants.ts` (`MenuExtractionSchema`)
- Modify: `src/lib/external/perplexity-client.ts` (`PerplexityMenuResponse.menuItems` type; the JSON example in `createMenuStructuringPrompt` — now in `src/lib/ai/prompts/restaurant-menu.ts` after Task 2)
- Modify: `src/lib/ai/prompts/meal-generation.ts` (the menu listing line, inside `createRestaurantMealGenerationPrompt`)

**Interfaces:**
- Consumes: `createMenuStructuringPrompt` (Task 2).
- Produces: `MenuExtractionSchema` gains two required number fields, `estimatedCarbs` and `estimatedFat`. Every menu item flowing through `menuData` carries them from here on.

- [ ] **Step 1: Add the two fields to the schema**

In `src/lib/ai/schemas/restaurants.ts`, inside `MenuExtractionSchema`'s item object, directly after `estimatedProtein`:

```typescript
    // B8: RestaurantMealObject requires carbs and fat, so the selection model
    // was obliged to emit two numbers no upstream source supplied — not Sonar,
    // not Places, not this schema. They were invention rendered beside measured
    // values. Extracted here for the same reason estimatedProtein is: a number
    // the model must report has to be a number it was shown.
    estimatedCarbs: z.number(),
    estimatedFat: z.number(),
```

Strict mode forbids optionals, so both are required. That is intentional — a menu item without them is what created the problem.

- [ ] **Step 2: Ask for them in the structuring prompt**

In `src/lib/ai/prompts/restaurant-menu.ts`, the `REQUIRED JSON FORMAT` example inside `createMenuStructuringPrompt` shows one menu item. Add the two keys to it:

```
      "estimatedCalories": 520,
      "estimatedProtein": 38,
      "estimatedCarbs": 44,
      "estimatedFat": 19,
```

And extend the paragraph that begins `estimatedCalories and estimatedProtein are per portion as served` so it covers all four. Replace its first sentence with:

```
estimatedCalories, estimatedProtein, estimatedCarbs and estimatedFat are per
portion as served, for the whole dish.
```

Then append one sentence to that paragraph:

```
Carbs and fat are estimated the same way as the other two, from the ingredients
and portion size — a katsu curry is mostly rice and fried batter, a sashimi
plate is neither. These four numbers are what the meal-selection step sums.
```

- [ ] **Step 3: Print them in the menu listing the selection prompt renders**

In `src/lib/ai/prompts/meal-generation.ts`, inside `createRestaurantMealGenerationPrompt`, find the line that renders each menu item (search for the literal `g protein\``). Replace that single template line with:

```typescript
    `    - ${item.name}: $${item.price} (${item.category || 'meal'}) - ${item.estimatedCalories ?? '?'} cal, ${item.estimatedProtein ?? '?'}g protein, ${item.estimatedCarbs ?? '?'}g carbs, ${item.estimatedFat ?? '?'}g fat`
```

Leave the comment above it in place and append to it:

```typescript
    // Carbs and fat joined the listing for the same reason (B8): rule 5 below
    // tells the model they are the SUM of the listed values, which was false
    // while they were not listed.
```

- [ ] **Step 4: Update the `PerplexityMenuResponse` menu item type**

In `src/lib/external/perplexity-client.ts`, the `menuItems` array element in the `PerplexityMenuResponse` interface declares the extracted fields. Add:

```typescript
    estimatedCarbs: number;
    estimatedFat: number;
```

- [ ] **Step 5: Verify the four numbers now travel together**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
grep -n "estimatedCarbs" src/lib/ai/schemas/restaurants.ts src/lib/ai/prompts/restaurant-menu.ts src/lib/ai/prompts/meal-generation.ts src/lib/external/perplexity-client.ts
```

Expected: error count matches baseline; `estimatedCarbs` appears in all four files.

Then run the two restaurant sites in the eval harness Plan 1 built, which exercise the real models:

```bash
npm run eval -- --site=menu-extraction --n=2 --no-links
```

Expected: the run completes and every extracted item carries four numbers. A grammar violation here would surface as a `parse` failure, not as a missing field — strict mode cannot emit an object without a required key.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/schemas/restaurants.ts src/lib/ai/prompts/restaurant-menu.ts src/lib/ai/prompts/meal-generation.ts src/lib/external/perplexity-client.ts
git commit -m "fix(restaurants): extract carbs and fat instead of inventing them at selection time

B8. RestaurantMealObject requires carbs and fat, MenuExtractionSchema supplied
neither, and the selection prompt told the model to sum values it had never
been shown. Both are now extracted alongside calories and protein and printed
in the menu listing, which is what makes that instruction true."
```

---

## Task 4: One link-checking implementation, shared by production and the harness

**Findings B1 and B6.** `grep -rn "method: 'HEAD'" src/ scripts/` returned nothing before Plan 1. Not one URL this app displays has ever been requested. And nothing asserts that the value stored under `doordash` is on doordash.com — the classic failure, a plausible-looking storefront URL that 302s to the platform's front page, is undetectable by construction.

Plan 1 Task 4 built `probe`, `PLATFORM_HOSTS` and the homepage-redirect test inside `scripts/eval/links.ts`. Production needs exactly those three. Rather than write them twice — where they would drift, and where the harness would stop measuring what production does — this task moves the primitives into `src/lib/external/link-check.ts` and leaves `scripts/eval/links.ts` holding only its `Finding`-producing wrappers.

The split is by dependency direction. `src/lib/external/link-check.ts` knows about URLs and HTTP and nothing about the eval harness. `scripts/eval/links.ts` imports it and knows about `Finding`. Nothing in `src/` imports anything from `scripts/`.

**Files:**
- Create: `src/lib/external/link-check.ts`
- Create: `src/lib/external/link-check.test.ts`
- Modify: `scripts/eval/links.ts` (delete four declarations, add one import)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface LinkVerdict { url: string; alive: boolean; status: number | null; finalUrl: string | null; reason: string }`
  - `PLATFORM_HOSTS: Record<string, RegExp>`
  - `parseHttpUrl(url: string): URL | null`
  - `isUsableLink(v: unknown): v is string`
  - `probe(url: string, timeoutMs?: number): Promise<LinkVerdict>`
  - `hostMatchesPlatform(platform: string, url: string): boolean`
  - `isHomepageRedirect(verdict: LinkVerdict): boolean`
  - `verifyLinks(links, opts?): Promise<Record<string, string>>` — the production entry point. Takes an `orderingLinks` object, returns only the entries that survive host check, liveness and redirect check.

- [ ] **Step 1: Write the failing test**

Create `src/lib/external/link-check.test.ts`. Everything here is offline; `verifyLinks` takes an injectable prober so the test never touches the network.

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHttpUrl, isUsableLink, hostMatchesPlatform, isHomepageRedirect, verifyLinks,
  type LinkVerdict,
} from './link-check';

const verdict = (url: string, over: Partial<LinkVerdict> = {}): LinkVerdict => ({
  url, alive: true, status: 200, finalUrl: url, reason: 'ok', ...over,
});

test('parseHttpUrl rejects non-http schemes and junk', () => {
  assert.equal(parseHttpUrl('javascript:alert(1)'), null);
  assert.equal(parseHttpUrl('ftp://example.com'), null);
  assert.equal(parseHttpUrl('not a url'), null);
  assert.equal(parseHttpUrl('null'), null);
  assert.ok(parseHttpUrl('https://doordash.com/store/1'));
});

test('isUsableLink matches the test the route already applies', () => {
  assert.equal(isUsableLink('https://x.com/a'), true);
  assert.equal(isUsableLink(''), false);
  assert.equal(isUsableLink('null'), false);
  assert.equal(isUsableLink(null), false);
});

test('hostMatchesPlatform accepts the right domain and its subdomains', () => {
  assert.equal(hostMatchesPlatform('doordash', 'https://www.doordash.com/store/sakura-12345/'), true);
  assert.equal(hostMatchesPlatform('doordash', 'https://doordash.com/store/1'), true);
});

test('hostMatchesPlatform rejects the wrong platform and lookalike domains', () => {
  assert.equal(hostMatchesPlatform('doordash', 'https://www.ubereats.com/store/sakura'), false);
  assert.equal(hostMatchesPlatform('doordash', 'https://doordash.com.evil.example/store/1'), false);
  assert.equal(hostMatchesPlatform('doordash', 'https://mydoordash.com/store/1'), false);
});

test('hostMatchesPlatform does not constrain direct, which can be any domain', () => {
  assert.equal(hostMatchesPlatform('direct', 'https://sakuraramenhouse.com'), true);
});

test('isHomepageRedirect catches a deep link that landed on the root', () => {
  assert.equal(isHomepageRedirect(verdict('https://doordash.com/store/sakura-12345', {
    finalUrl: 'https://www.doordash.com/',
  })), true);
});

test('isHomepageRedirect does not fire when the link was already a homepage', () => {
  assert.equal(isHomepageRedirect(verdict('https://sakuraramenhouse.com/', {
    finalUrl: 'https://sakuraramenhouse.com/',
  })), false);
});

test('isHomepageRedirect does not fire on a dead link', () => {
  assert.equal(isHomepageRedirect(verdict('https://doordash.com/store/1', {
    alive: false, status: 404, finalUrl: null, reason: 'HTTP 404',
  })), false);
});

test('verifyLinks keeps a link that is on-host, alive and not redirected', async () => {
  const out = await verifyLinks(
    { doordash: 'https://www.doordash.com/store/sakura-12345' },
    { prober: async (u) => verdict(u) }
  );
  assert.deepEqual(out, { doordash: 'https://www.doordash.com/store/sakura-12345' });
});

test('verifyLinks drops a wrong-host link without spending a request on it', async () => {
  let probed = 0;
  const out = await verifyLinks(
    { doordash: 'https://www.ubereats.com/store/sakura' },
    { prober: async (u) => { probed++; return verdict(u); } }
  );
  assert.deepEqual(out, {});
  assert.equal(probed, 0, 'the host check is free; do not pay for a request to reject it');
});

test('verifyLinks drops a dead link', async () => {
  const out = await verifyLinks(
    { direct: 'https://sakura.example/order' },
    { prober: async (u) => verdict(u, { alive: false, status: 404, reason: 'HTTP 404' }) }
  );
  assert.deepEqual(out, {});
});

test('verifyLinks drops a link that redirected to the homepage', async () => {
  const out = await verifyLinks(
    { grubhub: 'https://www.grubhub.com/restaurant/sakura-99' },
    { prober: async (u) => verdict(u, { finalUrl: 'https://www.grubhub.com/' }) }
  );
  assert.deepEqual(out, {});
});

test('verifyLinks ignores unusable values rather than throwing on them', async () => {
  const out = await verifyLinks(
    { doordash: 'null', ubereats: '', grubhub: null, direct: 'https://sakura.example/order' },
    { prober: async (u) => verdict(u) }
  );
  assert.deepEqual(out, { direct: 'https://sakura.example/order' });
});

test('verifyLinks returns an empty object rather than throwing on an empty input', async () => {
  assert.deepEqual(await verifyLinks({}, { prober: async (u) => verdict(u) }), {});
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx --test src/lib/external/link-check.test.ts
```

Expected: fails — `./link-check` does not exist.

- [ ] **Step 3: Write `src/lib/external/link-check.ts`**

```typescript
/**
 * Link verification for anything this app is about to show a user.
 *
 * B1: before this file, `grep -rn "method: 'HEAD'" src/ scripts/` returned
 * nothing. Every ordering link the UI rendered had been produced by a model,
 * passed a regex that checks it looks like a URL, and shipped. B6: nothing
 * checked that the value under `doordash` was on doordash.com.
 *
 * The primitives live in src/ rather than in the eval harness because both need
 * them and a second copy would drift — a harness measuring a different
 * implementation from production measures nothing. scripts/eval/links.ts
 * imports from here; nothing here imports from scripts/.
 */

export interface LinkVerdict {
  url: string;
  alive: boolean;
  status: number | null;
  finalUrl: string | null;
  reason: string;
}

/**
 * Anchored with (^|\.) so that `doordash.com.evil.example` does not match — a
 * bare `endsWith('doordash.com')` would accept it, and so would a substring
 * test against `mydoordash.com`.
 *
 * `direct` is absent on purpose: a restaurant's own site can be any domain, so
 * there is nothing to allow-list. Its correctness comes from liveness and from
 * being seeded off the Google Places `website` field (see Task 5), not host.
 */
export const PLATFORM_HOSTS: Record<string, RegExp> = {
  doordash: /(^|\.)doordash\.com$/i,
  ubereats: /(^|\.)ubereats\.com$/i,
  grubhub: /(^|\.)grubhub\.com$/i,
};

export function parseHttpUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** The same test the restaurant route already applies, in one place. */
export const isUsableLink = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());

/**
 * HEAD first because it is cheap, then GET on any status that smells like
 * "this server does not implement HEAD" — 405 and 501 are the standard ones,
 * and some CDNs answer 403. Treating those as dead would fail URLs that work
 * perfectly in a browser.
 */
export async function probe(url: string, timeoutMs = 8000): Promise<LinkVerdict> {
  if (!parseHttpUrl(url)) {
    return { url, alive: false, status: null, finalUrl: null, reason: 'unsupported scheme or malformed URL' };
  }

  const attempt = async (method: 'HEAD' | 'GET'): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'healthfit-loop/1.0' },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await attempt('HEAD');
    if ([403, 405, 501].includes(res.status)) res = await attempt('GET');
    return {
      url,
      alive: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      reason: res.ok ? 'ok' : `HTTP ${res.status}`,
    };
  } catch (e) {
    const reason = e instanceof Error && e.name === 'AbortError'
      ? `timed out after ${timeoutMs}ms`
      : `network error: ${e instanceof Error ? e.message : String(e)}`;
    return { url, alive: false, status: null, finalUrl: null, reason };
  }
}

/** Unknown platforms — `direct`, and anything added later — are unconstrained. */
export function hostMatchesPlatform(platform: string, url: string): boolean {
  const expected = PLATFORM_HOSTS[platform];
  if (!expected) return true;
  const parsed = parseHttpUrl(url);
  return parsed ? expected.test(parsed.hostname) : false;
}

/**
 * Did a deep link quietly become a homepage?
 *
 * This is the failure a liveness check alone misses: the model invents a store
 * path, the platform 302s the unknown path to its front page, and the response
 * is a cheerful 200. The link is alive and useless — an Order Now button that
 * drops the user on doordash.com with no idea what they were ordering.
 */
export function isHomepageRedirect(verdict: LinkVerdict): boolean {
  if (!verdict.alive || !verdict.finalUrl) return false;
  const from = parseHttpUrl(verdict.url);
  const to = parseHttpUrl(verdict.finalUrl);
  if (!from || !to) return false;
  const hadPath = from.pathname.replace(/\/+$/, '').length > 0;
  const landedAtRoot = to.pathname.replace(/\/+$/, '').length === 0;
  return hadPath && landedAtRoot;
}

/**
 * The production entry point: given an orderingLinks object, return only the
 * entries a user can actually be sent to.
 *
 * Rejected keys are dropped rather than set to null, matching what
 * processWithGPT4's `cleanedLinks` already does — callers downstream count
 * `Object.keys(...)`, and the failure paths in that file already return `{}`.
 *
 * `prober` is injectable so the unit tests never touch the network. Production
 * always uses the default.
 */
export async function verifyLinks(
  links: Record<string, string | null | undefined>,
  opts: { prober?: (url: string) => Promise<LinkVerdict>; timeoutMs?: number } = {}
): Promise<Record<string, string>> {
  const prober = opts.prober ?? ((u: string) => probe(u, opts.timeoutMs));

  // Host is checked first because it is free. Spending an HTTP request to
  // reject a link we can already prove is on the wrong domain is waste inside
  // a route that shares a 52-second budget with everything else.
  const candidates = Object.entries(links ?? {})
    .filter(([, v]) => isUsableLink(v))
    .map(([platform, v]) => [platform, (v as string).trim()] as const)
    .filter(([platform, url]) => hostMatchesPlatform(platform, url));

  const verdicts = await Promise.all(candidates.map(([, url]) => prober(url)));

  const out: Record<string, string> = {};
  candidates.forEach(([platform, url], i) => {
    const v = verdicts[i];
    if (v.alive && !isHomepageRedirect(v)) out[platform] = url;
  });
  return out;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx tsx --test src/lib/external/link-check.test.ts
```

Expected: all pass.

- [ ] **Step 5: Point the eval harness at the shared implementation**

In `scripts/eval/links.ts`, delete the local `LinkVerdict` interface, `PLATFORM_HOSTS`, `parse`, `probe`, and the body of `checkRedirectedToHomepage`'s path comparison. Replace the top of the file's declarations with:

```typescript
import {
  probe, PLATFORM_HOSTS, parseHttpUrl, isUsableLink, isHomepageRedirect,
  type LinkVerdict,
} from '../../src/lib/external/link-check';

export { probe, PLATFORM_HOSTS, type LinkVerdict };
```

`checkHost` keeps its `Finding`-producing body but calls the shared parser:

```typescript
export function checkHost(where: string, platform: string, url: string): Finding[] {
  const expected = PLATFORM_HOSTS[platform];
  if (!expected) return [];
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return [finding('LINKS', 'error', 'malformed-url', where, `${platform}: not a usable URL — ${url}`)];
  }
  if (!expected.test(parsed.hostname)) {
    return [finding('LINKS', 'error', 'wrong-host', where, `${platform} link points at ${parsed.hostname}`)];
  }
  return [];
}
```

`checkRedirectedToHomepage` becomes a thin wrapper:

```typescript
export function checkRedirectedToHomepage(where: string, verdict: LinkVerdict): Finding[] {
  if (!isHomepageRedirect(verdict)) return [];
  return [finding('LINKS', 'error', 'homepage-redirect', where,
    `${verdict.url} redirected to the site root — the specific page does not exist`)];
}
```

Delete `scripts/eval/links.ts`'s local `isUsable` const and use the imported `isUsableLink` in `checkOrderingLinks`.

- [ ] **Step 6: Confirm the harness still passes its own tests**

```bash
npx tsx --test scripts/eval/links.test.ts
npx tsx --test "scripts/eval/*.test.ts"
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: Plan 1's link tests pass unchanged — they were written against this behaviour, which is the point of moving rather than rewriting. Error count matches baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/external/link-check.ts src/lib/external/link-check.test.ts scripts/eval/links.ts
git commit -m "feat(links): add link verification, and give the harness and production one copy of it

B1, B6. No URL this app displays had ever been requested, and nothing checked
that a doordash link was on doordash.com. probe, the host allow-list and the
homepage-redirect test move out of scripts/eval into src/lib/external so both
callers share an implementation — a harness measuring a second copy measures
nothing. Task 6 wires verifyLinks into the restaurant route."
```

---

### Task 5: Seed the direct ordering link from the Google Places website field

**Finding:** B4 — `GooglePlacesClient.enrichPlaceDetails` already requests and stores `website`, and nothing has ever read it. Meanwhile the model is asked to produce `orderingLinks.direct` by guessing a restaurant's own URL. We are asking an LLM to invent a fact we were handed by an API two function calls earlier.

**Files:**
- Modify: `src/app/api/ai/meals/generate-restaurants/route.ts` — the result mapper inside `extractMenuInformation`
- Test: none (this task adds no pure function; Task 6's test covers the combined mapper behaviour)

**Interfaces:**
- Consumes: `Restaurant.website?: string` from `src/lib/external/places-client.ts:4` — populated at `places-client.ts:283` from the Places details response, requested in the field list at `places-client.ts:75`
- Produces: an `orderingLinks.direct` that, when Places supplied a website, is a Google-sourced URL rather than a model-generated one. Task 6 consumes the same object.

**Locate first.** The function is `extractMenuInformation` — *not* `enrichRestaurantsWithMenus`, which does not exist in this repo. Navigate by `grep -n "async function extractMenuInformation" src/app/api/ai/meals/generate-restaurants/route.ts`. The block you are editing is the `return { ...restaurant, menuData: menuItems, ... }` object inside the `mapWithLimit` callback.

- [ ] **Step 1: Read the mapper and confirm it matches the plan**

```bash
grep -n "menuUrl: orderingLinks.doordash" -B 20 src/app/api/ai/meals/generate-restaurants/route.ts
```

Expected: you see `const orderingLinks = menuResponse.orderingLinks || {};`, a local `isUsableLink` arrow function, `const linksFound = ...`, a logging loop, then the return object. If the shape differs, stop and report — the rest of this task assumes it.

- [ ] **Step 2: Prefer the Places website over the model's guess**

Immediately after the `const menuItems = menuResponse.menuItems || [];` line, insert:

```typescript
      // B4. Places already told us this restaurant's website; asking the model
      // to guess `direct` and then believing the guess is strictly worse than
      // using the answer we were handed. Places wins when it has one — it is
      // the only source here that looked the business up rather than recalled
      // it. The model's value survives only as the fallback.
      const placesWebsite = (restaurant as { website?: string }).website;
      const resolvedLinks = {
        ...orderingLinks,
        direct: isUsableLink(placesWebsite) ? placesWebsite : orderingLinks.direct ?? null,
      };
```

Then change the two references below it to read from `resolvedLinks`:

```typescript
      const linksFound = Object.values(resolvedLinks).filter(isUsableLink).length;
```

and in the logging loop:

```typescript
      Object.entries(resolvedLinks).forEach(([platform, url]) => {
```

and in the return object:

```typescript
        menuUrl: resolvedLinks.doordash || resolvedLinks.ubereats || resolvedLinks.grubhub || resolvedLinks.direct,
        orderingLinks: resolvedLinks,
```

**Ordering matters.** `const linksFound` currently appears *above* where you are inserting `resolvedLinks`. Move the `linksFound` line to below the `resolvedLinks` block — a `const` cannot reference a `const` declared after it, and TypeScript will tell you so at the point of use.

- [ ] **Step 3: Verify it type-checks**

```bash
npx tsc --noEmit 2>&1 | grep "generate-restaurants"
```

Expected: no output. If you see `Property 'website' does not exist`, the cast in Step 2 was dropped — `restaurant` is loosely typed at this point in the file and the cast is what makes the read legal without widening anything.

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: the baseline count, unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/meals/generate-restaurants/route.ts
git commit -m "fix(restaurants): use the restaurant website Places gave us instead of the one the model guessed

B4. enrichPlaceDetails has requested and stored `website` since it was written
and no code ever read it, while the menu prompt asked the model to produce
orderingLinks.direct from memory. Places wins when it has a value; the model's
stays as the fallback."
```

---

### Task 6: Verify every ordering link before it reaches the user

**Finding:** B1 (wiring) — Task 4 built `verifyLinks`. Until something calls it, no behaviour has changed. This is the task that makes the four surfaced order buttons trustworthy.

**Files:**
- Modify: `src/app/api/ai/meals/generate-restaurants/route.ts` — same mapper as Task 5
- Test: `src/app/api/ai/meals/generate-restaurants/link-resolution.test.ts` (create)

**Interfaces:**
- Consumes: `verifyLinks(links, opts)` and `isUsableLink(value)` from `src/lib/external/link-check.ts` (Task 4)
- Produces: `orderingLinks` on every restaurant object contains only URLs that (a) parse as http/https, (b) sit on the host their platform key claims, and (c) answered a request without a homepage redirect. `linksFound` counts that set. `menuUrl` is drawn from it.

**Why the route and not the client.** `perplexityClient.getRestaurantMenu` is called from more than one place and returns raw model output by contract. Filtering inside it would make the same function return verified links to one caller and unverified to another depending on when it was called. The route is where the restaurant object is assembled for the response, so it is where the guarantee belongs.

**The budget question.** This route shares a ~52s `withRouteBudget` deadline and this phase gets roughly 22s of it. `verifyLinks` runs the four probes for one restaurant concurrently and is bounded by its 8s timeout, and the host check rejects wrong-domain links with no request at all. Six restaurants are already running concurrently under `mapWithLimit`, so the added wall-clock cost is one probe round, not twenty-four. Pass a tightened timeout so the worst case cannot eat the phase.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/ai/meals/generate-restaurants/link-resolution.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyLinks, type LinkVerdict } from '@/lib/external/link-check';

function fakeProber(map: Record<string, boolean>) {
  return async (url: string): Promise<LinkVerdict> =>
    map[url]
      ? { url, ok: true, status: 200, finalUrl: url }
      : { url, ok: false, status: 404, finalUrl: url, reason: 'not found' };
}

test('drops a link whose host does not match its platform', async () => {
  const out = await verifyLinks(
    { doordash: 'https://example.com/menu' },
    { prober: fakeProber({ 'https://example.com/menu': true }) }
  );
  assert.deepEqual(out, {});
});

test('keeps a link that is on the right host and answers', async () => {
  const url = 'https://www.doordash.com/store/pho-99-123456/';
  const out = await verifyLinks({ doordash: url }, { prober: fakeProber({ [url]: true }) });
  assert.deepEqual(out, { doordash: url });
});

test('drops a link that does not answer', async () => {
  const url = 'https://www.ubereats.com/store/gone';
  const out = await verifyLinks({ ubereats: url }, { prober: fakeProber({}) });
  assert.deepEqual(out, {});
});

test('accepts any host for the direct link', async () => {
  const url = 'https://pho99.com/';
  const out = await verifyLinks({ direct: url }, { prober: fakeProber({ [url]: true }) });
  assert.deepEqual(out, { direct: url });
});

test('ignores null and the literal string null', async () => {
  const out = await verifyLinks(
    { doordash: null, grubhub: 'null', ubereats: undefined },
    { prober: async () => { throw new Error('should not probe'); } }
  );
  assert.deepEqual(out, {});
});
```

- [ ] **Step 2: Run it to see it pass against Task 4's implementation**

```bash
npx tsx --test src/app/api/ai/meals/generate-restaurants/link-resolution.test.ts
```

Expected: **all five pass.** This test characterises Task 4's contract from the caller's side rather than driving new code — it is the executable statement of what the route is about to depend on. If any fail, `verifyLinks` does not do what Task 6 needs and you fix Task 4 before continuing, not this test.

If the `@/` import does not resolve under `tsx`, check `tsconfig.json`'s `paths` — Plan 1 Task 1 established that `tsx` honours it. Do not switch to a relative import; the rest of the repo uses `@/`.

- [ ] **Step 3: Call verifyLinks in the mapper**

Add to the route's imports, beside the existing `@/lib/...` imports:

```typescript
import { verifyLinks, isUsableLink } from '@/lib/external/link-check';
```

Delete the route's local `isUsableLink` arrow function — the one declared just above `const linksFound`, with the comment beginning "Count valid ordering links." Keep that comment; it explains a real past bug. Retarget its last sentence by replacing "Same URL test as normalizeOrderingLinks so the count and the rendered buttons agree." with "Same URL test as normalizeOrderingLinks so the count and the rendered buttons agree; verifyLinks then removes the ones that do not answer."

Replace the `resolvedLinks` block from Task 5 with:

```typescript
      const placesWebsite = (restaurant as { website?: string }).website;
      const candidateLinks = {
        ...orderingLinks,
        direct: isUsableLink(placesWebsite) ? placesWebsite : orderingLinks.direct ?? null,
      };

      // B1. Nothing had ever requested one of these URLs. A 404 doordash link
      // renders as an order button that leads nowhere, which is worse than no
      // button — the user drives somewhere on the strength of it. 6s rather
      // than the 8s default: this phase owns ~22s of the route budget and a
      // link check must not be what spends it.
      const resolvedLinks = await verifyLinks(candidateLinks, { timeoutMs: 6000 });
      const rejected = Object.keys(candidateLinks).filter(
        (k) => isUsableLink((candidateLinks as Record<string, unknown>)[k]) && !(k in resolvedLinks)
      );
      if (rejected.length > 0) {
        console.log(`[MENU-EXTRACTION] ${restaurant.name}: dropped unreachable links: ${rejected.join(', ')}`);
      }
```

`linksFound`, the logging loop and the return object already read `resolvedLinks` after Task 5, so they need no further change. Confirm that by eye — if any still says `orderingLinks`, Task 5 was applied incompletely.

- [ ] **Step 4: Verify the route still type-checks and the suite passes**

```bash
npx tsc --noEmit 2>&1 | grep "generate-restaurants"
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: no route errors, every test passes, baseline error count unchanged.

The `await` inside the `mapWithLimit` callback is already inside an `async` function — no signature change is needed. If TypeScript reports `await` outside async, you inserted the block into the wrong scope.

- [ ] **Step 5: Prove it end to end against a real generation**

```bash
npm run dev
```

In a second terminal, run one restaurant generation the way the app does. Watch the dev-server log for `[MENU-EXTRACTION]` lines. Expected: the `✅ platform: url` lines still appear for links that survive, and you see at least one `dropped unreachable links:` line across six restaurants — a run that drops nothing is possible but is more likely a sign that `verifyLinks` short-circuited. If nothing is ever dropped, add a temporary `console.log(candidateLinks)` and confirm the model is actually producing links to check.

**This is the verification that matters.** `tsc` proves the code compiles; only a live run proves the probe fires within the budget and that the phase still returns restaurants. Check the response still contains restaurants with menus — if `verifyLinks` timing out has pushed the phase past its deadline, you will see the budget warnings described in the comment above `MAX_MENU_LOOKUPS`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/meals/generate-restaurants/route.ts src/app/api/ai/meals/generate-restaurants/link-resolution.test.ts
git commit -m "fix(restaurants): stop showing order buttons for links nobody checked

B1. Every ordering link now has to parse, sit on the host its platform key
claims, and answer a request before it can reach the UI. A dead DoorDash button
is worse than no button — the user acts on it. 6s timeout so the check cannot
spend the menu phase's share of the route budget."
```

---

### Task 7: Stop forcing three grocery stores into existence

**Findings:** C7 and C8.

**C7.** `perplexity-client.ts` pins the store array to exactly three (`exactly(GroceryStoreObject, 3)`) *and* the system message says "Always provide 3 stores - use common regional chains if exact location data is unavailable." Under grammar-constrained decoding the model cannot emit two even if only two exist — the array cannot close before its third element. Combined with the instruction to substitute regional chains, a rural or thinly-served address gets a third store the model invented, complete with an address it invented, presented beside two real ones with no marking. `min(1).max(3)` keeps the cap, keeps the route's non-empty requirement, and lets the truthful answer be two.

**C8.** The comment above `GroceryStoreOption` in `src/lib/ai/schemas/grocery.ts` justifies removing `storeAddress` on the grounds that "the caller already held verified Google Places addresses for exactly these stores." That is false. `GooglePlacesClient` has restaurant methods only — `grep -n "async " src/lib/external/places-client.ts` shows no grocery search. The addresses the caller holds come from *this same Perplexity call*. The removal of `storeAddress` was still correct, for a different reason: the address is already in the stores array and asking for it twice invites two different answers. The comment must say the true thing, because the next person to read it will otherwise go looking for a Places grocery lookup that does not exist.

**Files:**
- Modify: `src/lib/ai/schemas/grocery.ts` — `GroceryStoreSearchSchema`, and the comment above `GroceryStoreOption`
- Modify: `src/lib/ai/schemas/index.ts` — delete `pinnedGroceryStores` and its doc comment
- Modify: `src/lib/external/perplexity-client.ts` — import, `StoreSchema` binding, system message, prompt
- Test: `src/lib/ai/schemas/grocery.test.ts` (create)

**Interfaces:**
- Consumes: `GroceryStoreObject` from `src/lib/ai/schemas/grocery.ts` (unchanged)
- Produces: `GroceryStoreSearchSchema` = `z.object({ stores: z.array(GroceryStoreObject).min(1).max(3) }).strict()`. `pinnedGroceryStores` ceases to exist.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/schemas/grocery.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GroceryStoreSearchSchema } from './grocery';

const store = (name: string) => ({
  name,
  address: '1 Main St',
  distance: '0.4 mi',
  type: 'mid-range' as const,
});

test('accepts two stores', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [store('A'), store('B')] });
  assert.equal(r.success, true);
});

test('accepts one store', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [store('A')] });
  assert.equal(r.success, true);
});

test('accepts three stores', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [store('A'), store('B'), store('C')] });
  assert.equal(r.success, true);
});

test('rejects zero stores — the route cannot use an empty list', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [] });
  assert.equal(r.success, false);
});

test('rejects four stores — the prompt asks for at most three', () => {
  const r = GroceryStoreSearchSchema.safeParse({
    stores: [store('A'), store('B'), store('C'), store('D')],
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx tsx --test src/lib/ai/schemas/grocery.test.ts
```

Expected: "accepts two stores" and "accepts one store" FAIL. The current `GroceryStoreSearchSchema` is an unbounded `z.array(GroceryStoreObject)`, so "rejects zero" and "rejects four" fail too. Three of five failing is the expected starting point — the exported schema and the schema actually used at the call site have drifted apart, which is itself part of C7.

- [ ] **Step 3: Bound the exported schema**

In `src/lib/ai/schemas/grocery.ts`, replace:

```typescript
/** getLocalGroceryStores */
export const GroceryStoreSearchSchema = z.object({
  stores: z.array(GroceryStoreObject),
}).strict();
```

with:

```typescript
/**
 * getLocalGroceryStores.
 *
 * Bounded, not pinned. The cap is real — the prompt asks for three and the UI
 * lays out three. The floor is 1 because generate-groceries/route.ts cannot
 * proceed with an empty list. What is deliberately absent is a *pin*: under
 * grammar-constrained decoding an `exactly(_, 3)` array cannot close before its
 * third element, so an address with two nearby stores got a third one invented,
 * address and all, rendered beside the two real ones with nothing to tell them
 * apart. A short honest list beats a padded one.
 */
export const GroceryStoreSearchSchema = z.object({
  stores: z.array(GroceryStoreObject).min(1).max(3),
}).strict();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test src/lib/ai/schemas/grocery.test.ts
```

Expected: all five PASS.

- [ ] **Step 5: Use it at the call site and delete the pinned variant**

In `src/lib/external/perplexity-client.ts`:

Replace `const StoreSchema = pinnedGroceryStores(3);` with:

```typescript
      const StoreSchema = GroceryStoreSearchSchema;
```

In the import block at the top of the file, remove `pinnedGroceryStores,` and add `GroceryStoreSearchSchema,` in its place. Check whether `GroceryStoreSearchSchema` is already imported before adding a duplicate:

```bash
grep -n "GroceryStoreSearchSchema" src/lib/external/perplexity-client.ts
```

In `src/lib/ai/schemas/index.ts`, delete the `pinnedGroceryStores` export **and the doc comment above it** — the comment's central claim ("safe to pin") is the thing this task disproves, so leaving it orphaned above the next export would be worse than deleting it.

Confirm nothing else referenced it:

```bash
grep -rn "pinnedGroceryStores" src/ scripts/
```

Expected: no output.

- [ ] **Step 6: Stop the prompt asking for a store that may not exist**

In `perplexity-client.ts`, change the system message from:

```
'You are a helpful assistant that finds local grocery stores. Return accurate, real store information in JSON format only. No markdown, no explanation, just the JSON object. Always provide 3 stores - use common regional chains if exact location data is unavailable.'
```

to:

```
'You are a helpful assistant that finds local grocery stores. Return accurate, real store information in JSON format only. No markdown, no explanation, just the JSON object. Return up to 3 stores. Return only stores that actually exist near the address — if you can find just one or two, return one or two. Never invent a store or an address to reach three.'
```

And change the first line of the user prompt from:

```
Find the 3 closest grocery stores to this exact address: ${fullAddress}
```

to:

```
Find up to 3 of the closest grocery stores to this exact address: ${fullAddress}
```

Add a sixth line to the CRITICAL REQUIREMENTS list:

```
5. Return only stores you can actually place near this address. Fewer real stores is the correct answer; do not pad the list.
```

**Do not touch the worked JSON example.** A three-element example alongside a "fewer is fine" instruction is the right shape: the example teaches the field names, the instruction sets the count. Trimming the example to two would teach the model that two is the target.

- [ ] **Step 7: Correct the false comment (C8)**

In `src/lib/ai/schemas/grocery.ts`, in the comment above `GroceryStoreOption`, replace:

```
 * asked to supply it for every option — while the caller already held verified
 * Google Places addresses for exactly these stores. Measured 2026-08-19: two
```

with:

```
 * asked to supply it for every option — while the caller already held the
 * address for exactly these stores, returned by the store-search call a few
 * lines earlier in this same file. (An earlier version of this comment said
 * those addresses came from Google Places. They do not: GooglePlacesClient has
 * restaurant methods only and no grocery search exists.) Measured 2026-08-19: two
```

The rest of the comment stands — the measurement it reports is real and the conclusion it draws is right.

- [ ] **Step 8: Verify**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: all pass; baseline error count unchanged. If `tsc` reports `pinnedGroceryStores` missing, a call site was missed — re-run the grep from Step 5.

Then run one grocery generation against the dev server and confirm the store list still renders. A city address will still return three; that is the correct outcome and does not disprove the fix. What you are checking is that the schema swap did not break parsing:

```bash
npm run dev
```

Expected in the log: `[PERPLEXITY-GROCERY] ✅ Found 3 stores: ...` with no `Store search returned an unusable response` line.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/schemas/grocery.ts src/lib/ai/schemas/grocery.test.ts src/lib/ai/schemas/index.ts src/lib/external/perplexity-client.ts
git commit -m "fix(groceries): let the store list be short when only two stores are near

C7, C8. The array was pinned at exactly 3 and the system message told the model
to substitute regional chains, so a thinly-served address got a third store
invented with an invented address, indistinguishable from the two real ones.
min(1).max(3) keeps the cap and the route's non-empty requirement. Also corrects
the comment claiming these addresses come from Google Places — there is no
grocery search in GooglePlacesClient; they come from this same Perplexity call."
```

---

### Task 8: Ask the user about injuries the workout prompt already reads

**Finding:** D8. `src/lib/ai/prompts/workout-generation.ts` consumes `injuryConsiderations` in two places — it prints them in the profile block at `:219` and turns them into a hard constraint at `:333-335`:

```typescript
  const injuryConstraint = (workoutPrefs.injuryConsiderations || []).length > 0
    ? `AVOID exercises that stress: ${workoutPrefs.injuryConsiderations!.join(', ')}`
    : 'No injuries - full exercise selection.';
```

The survey initialises the field to `[]` at `src/app/survey/page.tsx:758` and never sets it. There is no setter anywhere in the file. So the second branch is the only branch that has ever run: **every user in the database is told to the model to have no injuries, and every user gets the full exercise selection.** A user with a bad knee is prescribed squats and lunges because nobody asked.

The prompt side needs no change. This is a pure data-capture gap, and it is the cheapest safety fix in the plan.

**Files:**
- Modify: `src/app/survey/page.tsx` — `case 8:`, immediately after the `gymAccess` block
- Test: none (JSX with no extractable pure function; verification is a live survey run)

**Interfaces:**
- Consumes: `formData.workoutPreferences.injuryConsiderations: string[]` — already declared in the form type at `src/app/survey/page.tsx:272-279`, already initialised at `:758`. No type change required.
- Produces: a non-empty `injuryConsiderations` for users who report one. `workout-generation.ts` reads it unchanged.

**Design note — why a fixed list and not free text.** The prompt joins the array into "AVOID exercises that stress: {list}". That sentence works when the elements are body regions and degrades when they are narratives ("I hurt my back moving house in 2019"). A fixed set of regions is also the only form we can state a coverage guarantee about. If a user's injury is not on the list, the honest outcome is that they tell their trainer, not that we ship a free-text box whose contents we then paste into a prompt unexamined.

- [ ] **Step 1: Confirm the insertion point**

```bash
grep -n "Do you have access to a full functional gym" src/app/survey/page.tsx
```

Note the line. Scroll down from it to the `</div>` that closes the gym block, followed by `</div>` closing the step and `);`. You are inserting a new sibling `<div>` between the gym block's closing `</div>` and the step's closing `</div>`.

**Navigate by the question text, not by line number.** This file is over 2500 lines and the numbers in this plan will have drifted.

- [ ] **Step 2: Add the injury question**

Insert, as the last child of `case 8:`'s outer `<div className="space-y-8">`:

```tsx
            <div>
              <Label className="text-neutral-700 mb-2 block">
                Any injuries or areas we should work around?
              </Label>
              <p className="text-sm text-gray-600 mb-4">
                Select any that apply. We&apos;ll avoid exercises that stress these areas. Leave blank if none.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  'Lower back', 'Neck', 'Shoulders', 'Elbows', 'Wrists',
                  'Hips', 'Knees', 'Ankles', 'Feet'
                ].map((area) => (
                  <button
                    key={area}
                    onClick={() => {
                      const current = formData.workoutPreferences.injuryConsiderations;
                      const updated = current.includes(area)
                        ? current.filter(a => a !== area)
                        : [...current, area];
                      updateFormData("workoutPreferences", { ...formData.workoutPreferences, injuryConsiderations: updated });
                    }}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-center min-h-[44px] flex items-center justify-center ${
                      formData.workoutPreferences.injuryConsiderations.includes(area)
                        ? "bg-red-600 text-white border-red-600"
                        : "border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
```

This is the `workoutTypes` grid a few dozen lines above, with the array and the field name changed. That is deliberate — the two questions are the same interaction and should look and behave identically. Do not improve the styling here; a visual difference between two adjacent multi-selects reads as a bug.

- [ ] **Step 3: Confirm no type change is needed**

```bash
npx tsc --noEmit 2>&1 | grep "survey/page"
```

Expected: no new output. `injuryConsiderations: string[]` is already in the form type, so nothing widens. If you see `Property 'injuryConsiderations' does not exist`, you are editing a different form object — re-check that you are inside `workoutPreferences`.

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: baseline, unchanged.

- [ ] **Step 4: Verify in the browser**

```bash
npm run dev
```

Walk the survey to the workout-preferences step. Check:
1. The new question renders below the gym question and the buttons toggle red/white like the workout-type buttons.
2. Selecting two areas, navigating forward and then back, keeps them selected — this proves `updateFormData` persisted them rather than the click only touching local state.
3. Complete the survey and generate a workout plan. In the dev-server log, the workout prompt should now carry `AVOID exercises that stress: Knees, Lower back` instead of `No injuries - full exercise selection.`

Add a temporary `console.log(injuryConstraint)` in `workout-generation.ts` if the prompt is not otherwise logged, and remove it before committing.

**Step 4.3 is the actual acceptance test.** Steps 1-3 prove the UI compiles. Only the generated prompt proves the value reached the model — which is precisely the link that was missing.

- [ ] **Step 5: Note the existing-user gap**

Every survey already in the database has `injuryConsiderations: []`, and this task does not backfill them. That is correct — we do not know their injuries and must not guess. But it means the fix only helps users who complete or re-complete the survey after it ships. Record that in the commit message so it is not later mistaken for a bug.

Do **not** write a migration or a backfill script. `DATABASE_URL` is production.

- [ ] **Step 6: Commit**

```bash
git add src/app/survey/page.tsx
git commit -m "feat(survey): ask about injuries, which the workout prompt has always read

D8. workout-generation.ts turns injuryConsiderations into a hard AVOID
constraint, and the survey never set the field — so the 'No injuries - full
exercise selection' branch is the only one that has ever run and a user with a
bad knee was prescribed squats. Existing surveys keep an empty list; we cannot
guess an injury we never asked about, so the fix applies from the next survey
completion onward."
```

---

### Task 9: Stop serving one user's recipe to another user's allergy

**Findings:** E1 and E2. These are one bug in two halves and must be fixed together.

**E2.** `src/components/dashboard/MealPlanPage.tsx` sends `dietaryRestrictions: [] // TODO: Get from user survey if available` on every recipe request. The component's props are `{onNavigate, generationStatus, isGuest?, onShowAccountModal?, nutritionTargets?}` — it has no survey data and cannot get any. So the recipe prompt's dietary section has always been empty. **Every recipe row in the production database was generated with zero restrictions.**

**E1.** `prisma/schema.prisma:294` declares `dishName String @unique` and the route caches on `dishName.toLowerCase().trim()`. The cache key does not include restrictions. So even once E2 is fixed, a vegan user asking for "chicken alfredo" — or, far worse, a coeliac user asking for a pasta dish someone else already generated — is served the existing row, wheat and all, marked `cached: true`. Fixing E2 alone would make E1 *more* dangerous, not less: the moment restrictions start reaching the prompt, restriction-free rows and restriction-aware rows collide in one key space.

**The order is not optional.** E2's fix is what makes the cache key wrong; E1's fix is what makes it right. One commit.

**No migration.** `dishName @unique` already exists and `dishName` is a Postgres `text` column with no length bound. We change the *value* written into it, not the schema. `CLAUDE.md` forbids running a migration against production without confirmation, and this task does not need one. Existing bare-name rows stay correct and reachable, because E2 means every one of them was in fact generated with zero restrictions — a bare key is the truthful description of what they are.

**Files:**
- Create: `src/lib/survey/resolve.ts`
- Create: `src/lib/survey/recipe-key.ts`
- Create: `src/lib/survey/recipe-key.test.ts`
- Modify: `src/app/api/ai/recipes/generate/route.ts`
- Modify: `src/components/dashboard/MealPlanPage.tsx` — remove the `dietaryRestrictions: []` field and its TODO

**Interfaces:**
- Consumes: `getAuthUserId()` from `@/lib/auth` (`src/lib/auth.ts:191`), `cookies()` from `next/headers`, `prisma` from `@/lib/db`, `normalizeRestriction` from `@/lib/utils/restriction-validator` (Task 1)
- Produces:
  - `resolveSurveyResponse(): Promise<SurveyResponse | null>` — the three-way user/survey_id/guest_session lookup, extracted once
  - `restrictionsFromSurvey(survey): string[]` — normalized, deduped, sorted
  - `recipeCacheKey(dishName: string, restrictions: string[]): string`

**Why extract the resolver.** The three-way lookup is copy-pasted across 18 API route files today. This task needs a *nineteenth* copy in the recipe route, and adding one more by hand is how the drift continues. Extracting it here does not require touching the other 18 — Plan 3 can migrate them. What matters now is that the new call site is the shared one.

- [ ] **Step 1: Write the failing test for the cache key**

Create `src/lib/survey/recipe-key.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipeCacheKey, restrictionsFromSurvey } from './recipe-key';

test('no restrictions gives the bare lowercased dish name', () => {
  assert.equal(recipeCacheKey('Chicken Alfredo', []), 'chicken alfredo');
});

test('the bare key is what existing cached rows already use', () => {
  assert.equal(recipeCacheKey('  Pad Thai  ', []), 'pad thai');
});

test('restrictions produce a distinct key', () => {
  const bare = recipeCacheKey('Chicken Alfredo', []);
  const vegan = recipeCacheKey('Chicken Alfredo', ['vegan']);
  assert.notEqual(bare, vegan);
  assert.ok(vegan.startsWith('chicken alfredo::'));
});

test('restriction order does not change the key', () => {
  assert.equal(
    recipeCacheKey('Pasta', ['vegan', 'gluten']),
    recipeCacheKey('Pasta', ['gluten', 'vegan'])
  );
});

test('different restriction sets give different keys', () => {
  assert.notEqual(recipeCacheKey('Pasta', ['vegan']), recipeCacheKey('Pasta', ['gluten']));
});

test('aliases collapse so celiac and gluten-free share a key', () => {
  assert.equal(
    recipeCacheKey('Pasta', ['celiac']),
    recipeCacheKey('Pasta', ['gluten-free'])
  );
});

test('restrictionsFromSurvey merges diet prefs and allergies, deduped and sorted', () => {
  const out = restrictionsFromSurvey({
    dietPrefs: ['Vegan', 'gluten-free'],
    foodAllergies: ['Peanuts', 'vegan'],
  });
  assert.deepEqual(out, ['gluten', 'nuts', 'vegan']);
});

test('restrictionsFromSurvey tolerates a null survey', () => {
  assert.deepEqual(restrictionsFromSurvey(null), []);
});

test('restrictionsFromSurvey drops blanks', () => {
  assert.deepEqual(restrictionsFromSurvey({ dietPrefs: ['', '  '], foodAllergies: [] }), []);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx tsx --test src/lib/survey/recipe-key.test.ts
```

Expected: FAIL — `Cannot find module './recipe-key'`.

- [ ] **Step 3: Write the key builder**

Create `src/lib/survey/recipe-key.ts`:

```typescript
import { createHash } from 'node:crypto';
import { normalizeRestriction } from '@/lib/utils/restriction-validator';

export interface SurveyRestrictionSource {
  dietPrefs?: string[] | null;
  foodAllergies?: string[] | null;
}

/**
 * Every restriction that must reach the recipe prompt, in one canonical list.
 *
 * Diet preferences and allergies are merged deliberately. The prompt does not
 * distinguish them — both become "do not put this in the food" — and keeping
 * them apart in the cache key would let a peanut allergy and a peanut-free diet
 * preference produce two rows with identical contents.
 */
export function restrictionsFromSurvey(survey: SurveyRestrictionSource | null | undefined): string[] {
  if (!survey) return [];
  const raw = [...(survey.dietPrefs ?? []), ...(survey.foodAllergies ?? [])];
  const normalized = raw
    .map((r) => normalizeRestriction(String(r)))
    .filter((r) => r.length > 0);
  return [...new Set(normalized)].sort();
}

/**
 * The Recipe table keys on `dishName @unique`, and until now that key was the
 * dish name alone — so a coeliac user asking for a pasta dish was served the
 * wheat-flour row another user had generated, marked `cached: true`. The key
 * has to carry whatever changed the generation.
 *
 * A request with no restrictions keeps the bare name. That is not a
 * compatibility shim: it is the truthful key for those rows. MealPlanPage sent
 * `dietaryRestrictions: []` on every request until this commit, so every row
 * already in the database was in fact generated with no restrictions, and the
 * bare key describes them correctly. They stay reachable, and only by the
 * requests they actually match.
 *
 * The suffix is a hash rather than the readable list because a survey's
 * allergy array is user-entered and unbounded; the log line below records the
 * list itself so the hash stays debuggable.
 */
export function recipeCacheKey(dishName: string, restrictions: string[]): string {
  const dish = dishName.toLowerCase().trim();
  if (restrictions.length === 0) return dish;
  const canonical = [...new Set(restrictions)].sort().join('|');
  const fingerprint = createHash('sha256').update(canonical).digest('hex').slice(0, 12);
  return `${dish}::${fingerprint}`;
}
```

`restrictionsFromSurvey` sorts and `recipeCacheKey` sorts again. That is not redundant — `recipeCacheKey` is exported and callable with a hand-built array, and an order-dependent cache key is exactly the kind of bug that only shows up in production.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test src/lib/survey/recipe-key.test.ts
```

Expected: all nine PASS.

If "aliases collapse" fails, `normalizeRestriction` from Task 1 is not mapping `celiac` and `gluten-free` to the same token — fix Task 1's `ALIASES`, not this test. If "merges diet prefs and allergies" returns `['gluten','peanuts','vegan']` instead of `['gluten','nuts','vegan']`, the `peanut → nuts` alias is missing from Task 1.

- [ ] **Step 5: Extract the survey resolver**

Create `src/lib/survey/resolve.ts`:

```typescript
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';

/**
 * The authenticated-user / survey_id / guest_session lookup, in that order.
 *
 * This sequence is copy-pasted into 18 API route files. The recipe route needed
 * a nineteenth copy, which is a good moment to stop making copies. The other
 * call sites are unchanged by this commit and can migrate later; what matters
 * is that new code calls this one.
 *
 * The `'undefined'` / `'null'` string checks are not paranoia — cookies get
 * written by client code that interpolated an undefined value, and the literal
 * four-character string reaches Prisma as a perfectly valid-looking id.
 */
export async function resolveSurveyResponse() {
  const cookieStore = await cookies();
  const clean = (v: string | null | undefined) =>
    !v || v === 'undefined' || v === 'null' ? undefined : v;

  const userId = clean(await getAuthUserId());
  const surveyId = clean(cookieStore.get('survey_id')?.value);
  const sessionId = clean(cookieStore.get('guest_session')?.value);

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { activeSurvey: true },
    });
    if (user?.activeSurvey) return user.activeSurvey;
  }
  if (surveyId) {
    const survey = await prisma.surveyResponse.findUnique({ where: { id: surveyId } });
    if (survey) return survey;
  }
  if (sessionId) {
    return prisma.surveyResponse.findFirst({ where: { sessionId } });
  }
  return null;
}
```

**One deliberate difference from the 18 copies.** They use `else if`, so an authenticated user whose `activeSurvey` is null returns null and never tries the cookies. This version falls through. A signed-in user who filled the survey as a guest and has not had it linked yet is a real state, and returning null for them means generating a recipe with no restrictions — the exact failure this task exists to close.

No unit test: the function is three database reads and a cookie read with no branching logic worth isolating. It is verified in Step 8 against a live request.

- [ ] **Step 6: Use the survey in the recipe route**

In `src/app/api/ai/recipes/generate/route.ts`:

Add imports:

```typescript
import { resolveSurveyResponse } from '@/lib/survey/resolve';
import { recipeCacheKey, restrictionsFromSurvey } from '@/lib/survey/recipe-key';
```

Remove `dietaryRestrictions` from the request-body destructuring. **The client's value is not used, and leaving the binding in place invites someone to wire it back up.** The destructuring becomes:

```typescript
    const {
      dishName,
      description,
      mealType,
      // NEW parameters
      nutritionTargets: rawNutritionTargets,
      existingGroceryItems
    } = await req.json();
```

After the `if (!dishName)` guard, insert:

```typescript
    // E2. The client used to send `dietaryRestrictions: []` with a TODO next to
    // it, because MealPlanPage has no survey data and cannot get any. So the
    // prompt's dietary section was empty for every recipe ever generated. The
    // survey is on the server; read it here.
    const survey = await resolveSurveyResponse();
    const dietaryRestrictions = restrictionsFromSurvey(survey);
    const cacheKey = recipeCacheKey(dishName, dietaryRestrictions);

    if (dietaryRestrictions.length > 0) {
      console.log(`[RECIPE] Restrictions for "${dishName}": ${dietaryRestrictions.join(', ')} (key ${cacheKey})`);
    }
```

Then replace **every** `dishName.toLowerCase().trim()` in the file with `cacheKey`. There are three:

```bash
grep -n "dishName.toLowerCase().trim()" src/app/api/ai/recipes/generate/route.ts
```

1. the `prisma.recipe.findFirst` cache read
2. the `prisma.recipe.upsert` `where`
3. the `create.dishName`

Leave `originalDishName: dishName` alone — that column exists to hold the human-readable name and is now the only place it lives.

`createRecipeGenerationPrompt({ ..., dietaryRestrictions })` needs no change: the variable it reads now holds the resolved list instead of the client's empty array.

- [ ] **Step 7: Stop the client sending a field the server ignores**

In `src/components/dashboard/MealPlanPage.tsx`, delete these two lines from the recipe fetch body:

```typescript
            // NEW: Pass dietary restrictions if available
            dietaryRestrictions: [] // TODO: Get from user survey if available
```

Also delete the now-dangling trailing comma on the line above if TypeScript complains.

Do not replace it with anything. The component still cannot see the survey; the point is that it no longer needs to.

- [ ] **Step 8: Verify**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: all pass, baseline unchanged.

Then the live check — and this one needs care, because it writes to production:

```bash
npm run dev
```

**Before generating anything, state what will be written.** A successful recipe generation performs `prisma.recipe.upsert` against the production `Recipe` table. With this change the row's `dishName` is the composite key rather than the bare name, so a restricted user's request creates a *new* row rather than overwriting an existing one. That is the intended behaviour and it is additive — no existing row is modified by a restricted request. Confirm with the user before running a generation that reaches the upsert.

Read-only confirmation first, which touches nothing:

```bash
npx prisma studio   # read-only; do not edit
```

Check the `Recipe` table: every existing `dishName` should be a bare name with no `::`.

Then, with permission, request a recipe as a user whose survey has at least one diet preference. Expected in the log:

```
[RECIPE] Restrictions for "Chicken Alfredo": vegan (key chicken alfredo::a1b2c3d4e5f6)
[RECIPE] 🍳 Generating new recipe for "Chicken Alfredo" ...
[RECIPE] 💾 Cached new recipe for "Chicken Alfredo"
```

The **absence** of `✅ Using cached recipe` on that first restricted request is the proof. Request the same dish again as the same user and it must then say `✅ Using cached recipe`. Request it as a user with no restrictions and it must serve the original bare-key row.

Confirm the prompt actually carries the restrictions — if `createRecipeGenerationPrompt` does not log, add a temporary `console.log(recipePrompt.slice(0, 1200))` and check the dietary section is populated. Remove it before committing.

- [ ] **Step 9: Commit**

```bash
git add src/lib/survey/resolve.ts src/lib/survey/recipe-key.ts src/lib/survey/recipe-key.test.ts src/app/api/ai/recipes/generate/route.ts src/components/dashboard/MealPlanPage.tsx
git commit -m "fix(recipes): key the recipe cache on restrictions, and read them from the survey

E1, E2. MealPlanPage sent dietaryRestrictions: [] with a TODO beside it because
it has no survey data, so no recipe was ever generated with a restriction. The
cache then keyed on dish name alone, so once restrictions did start reaching the
prompt a coeliac user asking for a pasta dish would have been served another
user's wheat-flour row marked cached:true. Both halves in one commit: fixing
either alone makes the other worse.

Restrictions now resolve server-side from the survey. The cache key stays the
bare dish name when there are none, which is the truthful key for every row
already in the database. No schema change."
```

---

### Task 10: Refuse to cache a recipe whose ingredients do not add up

**Finding:** E4. The recipe route runs `validateIngredientSums`, prints the errors, and then caches the recipe anyway:

```typescript
    validation.errors.forEach((e) => console.error(`[RECIPE-INGREDIENT-VALIDATOR] ❌ ${e}`));
    validation.warnings.forEach((w) => console.warn(`[RECIPE-INGREDIENT-VALIDATOR] ⚠️ ${w}`));
    ...
    // Always save recipe to cache using upsert
    try {
      await prisma.recipe.upsert({ ... });
```

The comment above the validator call says "Warn-only — the recipe is still usable." For *display*, that is a defensible position. For *caching* it is not, and the difference is what makes E4 a separate finding from a merely noisy log. `validateIngredientSums` raises an error at >20% deviation (`src/lib/utils/ingredient-validator.ts`; warnings start at 10%). A recipe whose ingredient calories are more than a fifth away from its stated total is wrong, and caching it means every future request for that dish is served the wrong numbers — the same wrongness, permanently, with `cached: true` beside it. One bad generation becomes the answer forever.

Note what is already right here: the route refuses to cache a recipe that failed `parseChoice`, with the comment "A malformed recipe that gets cached is served back forever." That reasoning is correct and this task extends it from malformed shape to malformed arithmetic.

**Files:**
- Modify: `src/app/api/ai/recipes/generate/route.ts`
- Test: none — the change is a conditional around an I/O call, and Step 3 verifies it live

**Interfaces:**
- Consumes: `validateIngredientSums(mealName, mealData) → { valid, warnings, errors, details }` from `src/lib/utils/ingredient-validator.ts`, and `cacheKey` from Task 9
- Produces: no new exports. The response gains `cached: false` for un-cached results, which it already reports.

**Depends on Task 9.** The upsert block you are editing uses `cacheKey` after Task 9, not `dishName.toLowerCase().trim()`. If you see the old expression, Task 9 has not been applied — go back.

- [ ] **Step 1: Guard the upsert**

Replace the comment and opening of the cache block:

```typescript
    // Always save recipe to cache using upsert
    try {
```

with:

```typescript
    // Cache only what we would be willing to serve again unexamined. parseChoice
    // above already refuses to cache a malformed recipe on the grounds that a
    // cached one is served back forever; arithmetic that is more than 20% out is
    // wrong for the same duration and for the same reason. The recipe is still
    // returned to the caller — the user asked for it and it is displayable — but
    // it does not become the permanent answer for this dish.
    if (validation.errors.length > 0) {
      console.warn(
        `[RECIPE] Not caching "${dishName}" — ${validation.errors.length} ingredient sum error(s). ` +
        `Returning it to the caller uncached so the next request regenerates.`
      );
      return NextResponse.json({
        success: true,
        recipe: recipeData,
        cached: false
      });
    }

    try {
```

The early return duplicates the response object at the bottom of the handler. That is deliberate and is three lines; extracting a helper for two call sites would obscure the one thing a reader needs to see here, which is that this path skips the write.

- [ ] **Step 2: Verify the types and the suite**

```bash
npx tsc --noEmit 2>&1 | grep "recipes/generate"
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: no route errors, all tests pass, baseline count unchanged.

- [ ] **Step 3: Prove the guard fires**

You cannot reliably make the model produce bad arithmetic on demand, so force the branch instead. Temporarily insert, immediately after the `validateIngredientSums` call:

```typescript
    validation.errors.push('FORCED TEST ERROR');
```

```bash
npm run dev
```

Request any recipe for a dish that is **not** already cached. Expected in the log:

```
[RECIPE] Not caching "<dish>" — 1 ingredient sum error(s). Returning it to the caller uncached so the next request regenerates.
```

and **no** `[RECIPE] 💾 Cached new recipe` line. Confirm in `npx prisma studio` (read-only) that no row was created for that dish.

**Remove the forced line.** Then request the same dish again and confirm it now logs `💾 Cached new recipe`.

```bash
grep -n "FORCED TEST ERROR" src/app/api/ai/recipes/generate/route.ts
```

Expected: no output before you commit. If this greps to a line, you are about to ship a route that never caches anything.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/recipes/generate/route.ts
git commit -m "fix(recipes): stop caching a recipe whose ingredient sums are more than 20% out

E4. validateIngredientSums logged its errors and the upsert ran regardless, so
one bad generation became the permanent answer for that dish, served back with
cached:true. parseChoice already refuses to cache a malformed recipe for exactly
this reason; wrong arithmetic lasts just as long as a wrong shape. The recipe is
still returned to the caller — it is displayable — it just does not become the
cached one."
```

---

## Self-Review

Run after all ten tasks are written, before execution begins. This is the plan author's check, not an executor step.

### 1. Spec coverage

Findings this plan closes, each traced to a task:

| Finding | Severity | Task | Closed by |
|---|---|---|---|
| B1 | S1 | 4, 6 | `verifyLinks` built (4), called in the restaurant route (6) |
| B4 | S1 | 5 | `direct` seeded from the Places `website` field |
| B6 | S1 | 4 | Platform host allow-list inside `verifyLinks` |
| B8 | S1 | 3 | `estimatedCarbs` / `estimatedFat` added to `MenuExtractionSchema` |
| B11 | S1 | 2 | Menu prompts extracted to `src/lib/ai/prompts/restaurant-menu.ts` |
| B12 | S1 | 1 | `restriction-validator.ts` rewritten: aliases, word boundaries, all diets |
| C7 | S1 | 7 | Store array `min(1).max(3)`; `pinnedGroceryStores` deleted |
| C8 | S1 | 7 | False Google-Places comment corrected |
| D8 | S1 | 8 | Injury capture added to the survey |
| E1 | S1 | 9 | Recipe cache key carries a restriction fingerprint |
| E2 | S1 | 9 | Restrictions resolved server-side from the survey |
| E4 | S2 | 10 | Failed sum validation skips the upsert |

**B2 and B3 — closed by consequence, not by direct fix.** Both are S1 and neither has a task of its own. That is deliberate and needs stating plainly, because "no task" usually means "missed".

- **B2 · All five ordering-link fields are model-authored.** After Task 5, `direct` is no longer model-authored — it comes from Google Places. After Task 6, the remaining four must survive a host check and an HTTP probe before they can reach a user. A model-authored URL that resolves on the host it claims is not the failure B2 describes; the failure was authorship *with nothing downstream to catch it*. The downstream now exists.
- **B3 · The Sonar menu call passes no `response_format`.** Its stated harm is that "links are twice removed from any real HTTP response." Task 6 makes every link one step removed from a real HTTP response — its own. Provenance stops being the guarantee once the artifact itself is tested.

The *mechanisms* both findings name do survive this plan, and they still cost tokens and invite bad menu data. **Plan 3 should revisit B3 specifically** — giving the Sonar search call a `json_schema` the way the grocery store call already has one, and deciding whether the GPT-4 structuring pass is still earning its place. That is a design change to the two-model pipeline, not a mechanical fix, which is why it does not belong in a plan whose contract is "safety-critical, low-risk". Task 2 moves the menu prompts into their own file first, which is where that work will happen.

**C7 and C8 are covered** (Task 7). No other S1 finding is unaccounted for.

E1 and E2 are the two findings whose fix order the audit called load-bearing; both are in Task 9, in one commit, with the reason stated in the commit message.

### 2. Placeholder scan

No task contains "TBD", "TODO", "add appropriate error handling", "handle edge cases", "similar to Task N", or "write tests for the above". Every code step carries the actual code. Two tasks deliberately have no unit test — Task 5 (a three-line field preference, covered by Task 6's live run) and Task 8 (JSX with no extractable function) — and both say so explicitly with the verification that replaces it.

The one instruction that reads like a placeholder is Task 2's `git stash` / render / `diff` step. It is not: it is a concrete procedure with an exact expected output (an empty diff), and it exists because a 60-line prompt template moved between files is precisely the change that silently loses a line.

### 3. Type consistency

- `isUsableLink` is defined once, in `src/lib/external/link-check.ts` (Task 4). Task 5 uses it, Task 6 deletes the route's local copy and imports it. It is never redefined.
- `verifyLinks(links, opts) → Promise<Record<string, string>>` — the signature in Task 4 matches the call in Task 6 and the assertions in Task 6's test.
- `normalizeRestriction(input) → string` — defined in Task 1, consumed by Task 9's `restrictionsFromSurvey`. Task 9's alias tests (`celiac` ≡ `gluten-free`, `peanuts` → `nuts`) assert exactly the `ALIASES` entries Task 1 defines.
- `GroceryStoreSearchSchema` — Task 7 modifies the existing export rather than adding one, so the name in the schema file, the import in `perplexity-client.ts` and the test all refer to the same symbol.
- `cacheKey` — introduced in Task 9, consumed in Task 10. Task 10 states the dependency and gives the reader a way to detect that Task 9 was skipped.
- `resolveSurveyResponse()` returns Prisma's `SurveyResponse | null`; `restrictionsFromSurvey` accepts the narrower structural type `SurveyRestrictionSource`, which `SurveyResponse` satisfies. This is why the test can pass an object literal without constructing a full survey row.

### 4. Ordering

Tasks 1-3 and 7-10 are independent of each other. The one hard chain is **4 → 5 → 6**: Task 4 creates `link-check.ts`, Task 5 introduces the `resolvedLinks` binding that Task 6 rewrites, and Task 6 imports from Task 4. Doing 6 before 5 leaves `linksFound` reading the wrong object; doing 5 before 4 has nothing to import.

Task 2 must precede any Plan 3 work on B2 or B3.

**Plan 1 lands before any of this.** Task 4 deletes code Plan 1 Task 4 writes.
