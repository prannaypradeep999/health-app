# Generation Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `scripts/bench-generators.ts` a structured four-family scorer (COMPLETENESS, ARITHMETIC, ADHERENCE, LINKS) so that a wrong number, a missing day, an ignored dietary restriction, or a dead URL becomes a failing run instead of a line of prose nobody reads.

**Architecture:** Pure checker functions in `scripts/eval/`, each taking already-parsed model output and returning `Finding[]`. The bench harness's existing `inspect` hook — which returns a descriptive string — is replaced by a `check` hook returning `{ summary, findings }`. Findings roll up into per-family counts on `BenchResult`, and a `--fail-on` flag turns them into a process exit code. Checkers are network-free except LINKS, which is separately gated by `--no-links`.

**Tech Stack:** TypeScript, `tsx` 4.19 (already a devDependency), Zod 3.25, and Node 24's built-in `node:test` + `node:assert/strict` as the test runner. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-24-generation-correctness-audit.md` — sections G3, G4, G5 motivate this plan; sections A–F are what it must be able to detect.

## Global Constraints

- **No new npm dependencies.** Node 24 ships `node:test`; `tsx --test` runs it against TypeScript. Verified working in this repo on 2026-08-24.
- **Never write to the database.** `DATABASE_URL` points at production Neon (see `CLAUDE.md`). Nothing in `scripts/eval/` may import Prisma.
- **No production behaviour changes in this plan.** This is the measurement pass. Every file created or modified is under `scripts/`. If a fix seems obvious while working here, note it and leave it for the follow-up plans.
- **Test command:** `npx tsx --test "scripts/eval/*.test.ts"` — quote the glob so zsh does not expand it.
- **Type check:** `npx tsc --noEmit` has ~32 pre-existing errors. Your bar is *no new* errors, not zero. Capture the count before you start: `npx tsc --noEmit 2>&1 | grep -c "error TS"`.
- **Tolerances, copied from the existing validators so the harness agrees with production:** calorie-vs-target and Atwater macro checks warn above **10%** and error above **15%** (`src/lib/utils/meal-plan-validator.ts`). Ingredient-sum checks warn above **10%** and error above **20%** (`src/lib/utils/ingredient-validator.ts`).
- **Atwater factors:** protein 4, carbs 4, fat 9 kcal/g.
- **Every checker is a pure function.** Input in, `Finding[]` out. No `console.log`, no I/O, no clock. This is what makes them testable without an API key.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/eval/types.ts` | `Family`, `Severity`, `Finding`, `CheckResult`, and small constructors. Nothing else. |
| `scripts/eval/arithmetic.ts` | Atwater consistency, sum-of-parts-vs-whole, actual-vs-target deviation. |
| `scripts/eval/completeness.ts` | Expected-vs-actual counts, missing/duplicate day+slot pairs, empty required arrays. |
| `scripts/eval/adherence.ts` | Dietary restriction and allergy keyword rules; checks free text against them. |
| `scripts/eval/links.ts` | HTTP liveness probing, platform host allow-list, homepage-redirect detection. |
| `scripts/eval/*.test.ts` | One test file per checker module, run by `node:test`. |
| `scripts/bench-generators.ts` | **Modified.** `inspect` → `check`; findings aggregated onto `BenchResult`; `--fail-on` and `--no-links` flags. |
| `scripts/fixtures/surveys.ts` | **Modified.** Adds fixtures that exercise halal, coeliac, allergy, injury, sparse geography, large basket. |
| `bench-results/README.md` | **Modified.** Records the first four-family baseline. |

Checkers are split by family rather than by generation site because a family's tolerance rules must stay identical everywhere — one Atwater implementation, used by meals, recipes, and restaurant dishes alike.

---

## Task 1: Finding types and the arithmetic checkers

**Files:**
- Create: `scripts/eval/types.ts`
- Create: `scripts/eval/arithmetic.ts`
- Test: `scripts/eval/arithmetic.test.ts`

**Interfaces:**
- Consumes: nothing — this is the base of the dependency graph.
- Produces:
  - `type Family = 'COMPLETENESS' | 'ARITHMETIC' | 'ADHERENCE' | 'LINKS'`
  - `type Severity = 'error' | 'warn'`
  - `interface Finding { family: Family; severity: Severity; code: string; where: string; message: string }`
  - `interface CheckResult { summary: string; findings: Finding[] }`
  - `caloriesFromMacros(m: { protein: number; carbs: number; fat: number }): number`
  - `pctOff(actual: number, expected: number): number`
  - `checkAtwater(where: string, m: Macros): Finding[]`
  - `checkTarget(where: string, actual: number, target: number): Finding[]`
  - `checkSum(where: string, code: string, parts: number[], whole: number, warnPct?: number, errorPct?: number): Finding[]`
  - `interface Macros { calories: number; protein: number; carbs: number; fat: number }`

- [ ] **Step 1: Write `scripts/eval/types.ts`**

This file has no logic to test on its own; it is created here because Task 1's tests import from it.

```typescript
/**
 * Shared vocabulary for the generation eval harness.
 *
 * A Finding is the unit the harness gates on. `code` is stable across runs so
 * two bench results can be diffed by code rather than by prose.
 */

export type Family = 'COMPLETENESS' | 'ARITHMETIC' | 'ADHERENCE' | 'LINKS';

export type Severity = 'error' | 'warn';

export interface Finding {
  family: Family;
  severity: Severity;
  /** Stable identifier, e.g. 'atwater-mismatch'. Groups findings across runs. */
  code: string;
  /** Path into the payload, e.g. 'monday.dinner.primary'. */
  where: string;
  message: string;
}

export interface CheckResult {
  /** One line for the console, replacing the old `inspect` return value. */
  summary: string;
  findings: Finding[];
}

export function finding(
  family: Family, severity: Severity, code: string, where: string, message: string
): Finding {
  return { family, severity, code, where, message };
}

/** Count findings by family and severity, for the results table. */
export function tally(findings: Finding[]): Record<Family, { error: number; warn: number }> {
  const out = {
    COMPLETENESS: { error: 0, warn: 0 },
    ARITHMETIC: { error: 0, warn: 0 },
    ADHERENCE: { error: 0, warn: 0 },
    LINKS: { error: 0, warn: 0 },
  } as Record<Family, { error: number; warn: number }>;
  for (const f of findings) out[f.family][f.severity]++;
  return out;
}
```

- [ ] **Step 2: Write the failing test**

Create `scripts/eval/arithmetic.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { caloriesFromMacros, pctOff, checkAtwater, checkTarget, checkSum } from './arithmetic';

test('caloriesFromMacros applies Atwater factors 4/4/9', () => {
  assert.equal(caloriesFromMacros({ protein: 30, carbs: 40, fat: 10 }), 30 * 4 + 40 * 4 + 10 * 9);
});

test('pctOff is symmetric magnitude, and 0 expected with 0 actual is 0', () => {
  assert.equal(pctOff(110, 100), 10);
  assert.equal(pctOff(90, 100), 10);
  assert.equal(pctOff(0, 0), 0);
  assert.equal(pctOff(5, 0), 100);
});

test('checkAtwater is silent when macros agree with stated calories', () => {
  // 30*4 + 40*4 + 10*9 = 370
  assert.deepEqual(checkAtwater('monday.dinner', { calories: 370, protein: 30, carbs: 40, fat: 10 }), []);
});

test('checkAtwater warns between 10% and 15% off', () => {
  // macros = 370; stated 330 => 12.1% off
  const out = checkAtwater('monday.dinner', { calories: 330, protein: 30, carbs: 40, fat: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'warn');
  assert.equal(out[0].family, 'ARITHMETIC');
  assert.equal(out[0].code, 'atwater-mismatch');
  assert.equal(out[0].where, 'monday.dinner');
});

test('checkAtwater errors above 15% off', () => {
  // macros = 370; stated 250 => 48% off
  const out = checkAtwater('monday.dinner', { calories: 250, protein: 30, carbs: 40, fat: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'error');
});

test('checkTarget flags a meal that misses its calorie target', () => {
  assert.deepEqual(checkTarget('monday.dinner', 520, 520), []);
  assert.equal(checkTarget('monday.dinner', 590, 520)[0].severity, 'warn');   // 13.5%
  assert.equal(checkTarget('monday.dinner', 800, 520)[0].severity, 'error');  // 53.8%
  assert.equal(checkTarget('monday.dinner', 520, 0).length, 0, 'a zero target is not a finding, it is a missing target');
});

test('checkSum compares parts against the stated whole with the ingredient tolerance', () => {
  assert.deepEqual(checkSum('recipe', 'ingredient-sum', [100, 200, 220], 520), []);
  assert.equal(checkSum('recipe', 'ingredient-sum', [100, 200, 160], 520)[0].severity, 'warn');  // 460 vs 520 = 11.5%
  assert.equal(checkSum('recipe', 'ingredient-sum', [100, 100, 100], 520)[0].severity, 'error'); // 300 vs 520 = 42%
});

test('checkSum on an empty parts list reports a missing breakdown, not a 100% error', () => {
  const out = checkSum('recipe', 'ingredient-sum', [], 520);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'ingredient-sum-empty');
  assert.equal(out[0].severity, 'error');
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx tsx --test "scripts/eval/arithmetic.test.ts"
```

Expected: FAIL — `Cannot find module './arithmetic'`.

- [ ] **Step 4: Write `scripts/eval/arithmetic.ts`**

```typescript
import { finding, type Finding } from './types';

/**
 * Atwater factors, kcal per gram. The same constants meal-plan-validator.ts and
 * ingredient-validator.ts already use — kept in one place so the harness cannot
 * drift from what production considers correct.
 */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/** Tolerances mirror src/lib/utils/meal-plan-validator.ts. */
const CAL_WARN_PCT = 10;
const CAL_ERROR_PCT = 15;

/** Tolerances mirror src/lib/utils/ingredient-validator.ts. */
const SUM_WARN_PCT = 10;
const SUM_ERROR_PCT = 20;

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function caloriesFromMacros(m: { protein: number; carbs: number; fat: number }): number {
  return m.protein * ATWATER.protein + m.carbs * ATWATER.carbs + m.fat * ATWATER.fat;
}

/** Absolute deviation as a percentage of `expected`. */
export function pctOff(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 100;
  return (Math.abs(actual - expected) / expected) * 100;
}

function graded(
  where: string, code: string, off: number, message: string,
  warnPct: number, errorPct: number
): Finding[] {
  if (off > errorPct) return [finding('ARITHMETIC', 'error', code, where, message)];
  if (off > warnPct) return [finding('ARITHMETIC', 'warn', code, where, message)];
  return [];
}

/**
 * Do the macros add up to the stated calorie count?
 *
 * This is the check that catches "sometimes the numbers are wrong" at its most
 * basic: a model that picks a plausible calorie figure and then picks plausible
 * macros independently will fail here even though both look reasonable alone.
 */
export function checkAtwater(where: string, m: Macros): Finding[] {
  const calc = caloriesFromMacros(m);
  const off = pctOff(calc, m.calories);
  return graded(where, 'atwater-mismatch', off,
    `stated ${m.calories} cal vs ${Math.round(calc)} cal from macros (${Math.round(off)}% off)`,
    CAL_WARN_PCT, CAL_ERROR_PCT);
}

/**
 * Did the generated item land near the target it was given?
 *
 * A target of 0 means "no target was supplied", which is a wiring problem rather
 * than an arithmetic one, so it returns nothing here. Completeness checks own
 * missing targets.
 */
export function checkTarget(where: string, actual: number, target: number): Finding[] {
  if (target === 0) return [];
  const off = pctOff(actual, target);
  return graded(where, 'off-target', off,
    `${actual} vs target ${target} (${Math.round(off)}% off)`,
    CAL_WARN_PCT, CAL_ERROR_PCT);
}

/**
 * Do the parts sum to the stated whole?
 *
 * Used for ingredients against a meal's calories and for priced items against a
 * basket total. An empty parts list is reported separately: summing to zero is a
 * 100% error that hides the real problem, which is that no breakdown was
 * produced at all.
 */
export function checkSum(
  where: string, code: string, parts: number[], whole: number,
  warnPct: number = SUM_WARN_PCT, errorPct: number = SUM_ERROR_PCT
): Finding[] {
  if (parts.length === 0) {
    return [finding('ARITHMETIC', 'error', `${code}-empty`, where,
      `stated ${whole} but no parts were provided to sum`)];
  }
  const total = parts.reduce((a, b) => a + b, 0);
  const off = pctOff(total, whole);
  return graded(where, code, off,
    `parts sum to ${Math.round(total)} vs stated ${whole} (${Math.round(off)}% off)`,
    warnPct, errorPct);
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx tsx --test "scripts/eval/arithmetic.test.ts"
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Confirm no new type errors**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: the same count you recorded before starting.

- [ ] **Step 7: Commit**

```bash
git add scripts/eval/types.ts scripts/eval/arithmetic.ts scripts/eval/arithmetic.test.ts
git commit -m "feat(eval): add Finding types and arithmetic checkers

Atwater macro consistency, actual-vs-target deviation, and sum-of-parts
checks, with tolerances copied from the existing production validators so
the harness and the app agree on what 'wrong' means."
```

---

## Task 2: Completeness checkers

**Files:**
- Create: `scripts/eval/completeness.ts`
- Test: `scripts/eval/completeness.test.ts`

**Interfaces:**
- Consumes: `Finding`, `finding` from `./types` (Task 1).
- Produces:
  - `interface Slot { day: string; mealType: string }`
  - `checkCount(where: string, code: string, actual: number, expected: number): Finding[]`
  - `checkSlots(where: string, got: Slot[], want: Slot[]): Finding[]`
  - `checkNonEmpty(where: string, code: string, arr: unknown[] | null | undefined, min?: number): Finding[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/eval/completeness.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkCount, checkSlots, checkNonEmpty } from './completeness';

test('checkCount is silent when the count matches', () => {
  assert.deepEqual(checkCount('mealPlan', 'short-plan', 18, 18), []);
});

test('checkCount errors on a short result', () => {
  const out = checkCount('mealPlan', 'short-plan', 14, 18);
  assert.equal(out.length, 1);
  assert.equal(out[0].family, 'COMPLETENESS');
  assert.equal(out[0].severity, 'error');
  assert.match(out[0].message, /14.*18/);
});

test('checkCount errors on an over-long result too', () => {
  // Grammar padding is as wrong as truncation: it means invented filler.
  const out = checkCount('mealPlan', 'short-plan', 21, 18);
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'error');
});

test('checkSlots reports the specific day+slot pairs that are missing', () => {
  const want = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'monday', mealType: 'dinner' },
    { day: 'tuesday', mealType: 'dinner' },
  ];
  const got = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'tuesday', mealType: 'dinner' },
  ];
  const out = checkSlots('meals', got, want);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'missing-slot');
  assert.match(out[0].message, /monday\|dinner/);
});

test('checkSlots reports duplicates, which is how a pinned array hides a gap', () => {
  const want = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'monday', mealType: 'dinner' },
  ];
  // Right length, wrong content: exactly what exactly(n) cannot prevent.
  const got = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'monday', mealType: 'breakfast' },
  ];
  const out = checkSlots('meals', got, want);
  const codes = out.map(f => f.code).sort();
  assert.deepEqual(codes, ['duplicate-slot', 'missing-slot']);
});

test('checkSlots is case-insensitive about day and meal names', () => {
  const want = [{ day: 'monday', mealType: 'dinner' }];
  const got = [{ day: 'Monday', mealType: 'Dinner' }];
  assert.deepEqual(checkSlots('meals', got, want), []);
});

test('checkNonEmpty flags empty and missing arrays', () => {
  assert.deepEqual(checkNonEmpty('day.exercises', 'no-exercises', [1, 2]), []);
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', []).length, 1);
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', null).length, 1);
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', undefined).length, 1);
});

test('checkNonEmpty honours a minimum above one', () => {
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', [1, 2], 3).length, 1);
  assert.deepEqual(checkNonEmpty('day.exercises', 'no-exercises', [1, 2, 3], 3), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx tsx --test "scripts/eval/completeness.test.ts"
```

Expected: FAIL — `Cannot find module './completeness'`.

- [ ] **Step 3: Write `scripts/eval/completeness.ts`**

```typescript
import { finding, type Finding } from './types';

export interface Slot {
  day: string;
  mealType: string;
}

const key = (s: Slot) => `${s.day.toLowerCase().trim()}|${s.mealType.toLowerCase().trim()}`;

/**
 * Did we get the number of entries we asked for?
 *
 * Over-long is graded as harshly as short. Under grammar-constrained decoding
 * the model pads an array it cannot close early, so a count above expectation
 * means invented filler rather than generosity.
 */
export function checkCount(where: string, code: string, actual: number, expected: number): Finding[] {
  if (actual === expected) return [];
  const direction = actual < expected ? 'short' : 'over';
  return [finding('COMPLETENESS', 'error', code, where,
    `${actual} entries, expected ${expected} (${direction} by ${Math.abs(actual - expected)})`)];
}

/**
 * Did we get every day+slot pair we asked for, exactly once?
 *
 * `exactly(el, n)` guarantees N entries and nothing about which N. A response
 * that repeats Monday breakfast twice and drops Monday dinner passes the schema,
 * passes checkCount, and is still missing a meal. This is the check that catches
 * it.
 */
export function checkSlots(where: string, got: Slot[], want: Slot[]): Finding[] {
  const out: Finding[] = [];
  const gotKeys = got.map(key);
  const wantKeys = want.map(key);

  const gotSet = new Set(gotKeys);
  const missing = wantKeys.filter(k => !gotSet.has(k));
  if (missing.length > 0) {
    out.push(finding('COMPLETENESS', 'error', 'missing-slot', where,
      `${missing.length} slot(s) absent: ${missing.join(', ')}`));
  }

  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const k of gotKeys) {
    if (seen.has(k)) dupes.add(k);
    seen.add(k);
  }
  if (dupes.size > 0) {
    out.push(finding('COMPLETENESS', 'error', 'duplicate-slot', where,
      `${dupes.size} slot(s) delivered more than once: ${[...dupes].join(', ')}`));
  }

  return out;
}

/** An array that the consuming UI treats as required but the schema allows to be empty. */
export function checkNonEmpty(
  where: string, code: string, arr: unknown[] | null | undefined, min = 1
): Finding[] {
  const len = Array.isArray(arr) ? arr.length : 0;
  if (len >= min) return [];
  return [finding('COMPLETENESS', 'error', code, where,
    `${len} entries, need at least ${min}`)];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test "scripts/eval/completeness.test.ts"
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/completeness.ts scripts/eval/completeness.test.ts
git commit -m "feat(eval): add completeness checkers

checkSlots is the important one: pinned array lengths guarantee N entries
and say nothing about which N, so a duplicated slot hiding a dropped one
passes both the schema and a naive count check."
```

---

## Task 3: Adherence checkers

This is the family the user named directly — *"should check its accuracy to the prompt."* It answers: did the output obey the constraints the prompt carried?

**Files:**
- Create: `scripts/eval/adherence.ts`
- Test: `scripts/eval/adherence.test.ts`

**Interfaces:**
- Consumes: `Finding`, `finding` from `./types` (Task 1).
- Produces:
  - `interface Rule { label: string; severity: Severity; pattern: RegExp }`
  - `rulesFor(surveyData: any): Rule[]`
  - `checkText(where: string, text: string, rules: Rule[]): Finding[]`
  - `RESTRICTION_PATTERNS: Record<string, RegExp>`

- [ ] **Step 1: Write the failing test**

Create `scripts/eval/adherence.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rulesFor, checkText } from './adherence';

const vegetarian = { dietPrefs: ['Vegetarian'], foodAllergies: [], strictExclusions: null };
const halalCoeliac = {
  dietPrefs: ['Halal', 'Gluten-Free'],
  foodAllergies: ['shellfish', 'tree nuts'],
  strictExclusions: { meats: ['pork'], other: ['alcohol'] },
};

test('rulesFor derives a rule per declared restriction', () => {
  const labels = rulesFor(vegetarian).map(r => r.label);
  assert.deepEqual(labels, ['Vegetarian']);
});

test('rulesFor covers restrictions beyond vegetarian and vegan', () => {
  // RESTRICTION_MAPPINGS in production covers only vegetarian and vegan; the
  // harness must be able to see the gap that leaves.
  const labels = rulesFor(halalCoeliac).map(r => r.label);
  assert.ok(labels.includes('Halal'));
  assert.ok(labels.includes('Gluten-Free'));
  assert.ok(labels.includes('allergy:shellfish'));
  assert.ok(labels.includes('allergy:tree nuts'));
  assert.ok(labels.includes('exclusion:pork'));
  assert.ok(labels.includes('exclusion:alcohol'));
});

test('checkText is silent on compliant text', () => {
  assert.deepEqual(checkText('monday.dinner', 'Red lentil dal with spinach and brown rice', rulesFor(vegetarian)), []);
});

test('checkText catches a meat dish under a vegetarian rule', () => {
  const out = checkText('monday.dinner', 'Grilled chicken thighs with rice', rulesFor(vegetarian));
  assert.equal(out.length, 1);
  assert.equal(out[0].family, 'ADHERENCE');
  assert.equal(out[0].severity, 'error');
  assert.equal(out[0].code, 'restriction-violation');
  assert.match(out[0].message, /Vegetarian/);
  assert.match(out[0].message, /chicken/i);
});

test('checkText catches an allergen', () => {
  const out = checkText('monday.dinner', 'Shrimp and walnut salad', rulesFor(halalCoeliac));
  const labels = out.map(f => f.message);
  assert.ok(labels.some(m => /allergy:shellfish/.test(m)), 'shrimp is shellfish');
  assert.ok(labels.some(m => /allergy:tree nuts/.test(m)), 'walnut is a tree nut');
});

test('checkText catches gluten under Gluten-Free', () => {
  const out = checkText('monday.lunch', 'Whole wheat pasta with tomato sauce', rulesFor(halalCoeliac));
  assert.ok(out.some(f => /Gluten-Free/.test(f.message)));
});

test('checkText catches a strict exclusion', () => {
  const out = checkText('monday.dinner', 'Slow-braised pork shoulder', rulesFor(halalCoeliac));
  assert.ok(out.some(f => /exclusion:pork/.test(f.message)));
});

test('checkText matches on word boundaries, not substrings', () => {
  // "hammock" contains "ham"; "grape" contains no meat. Neither is a violation.
  const out = checkText('x', 'Grape and hammock themed picnic spread', rulesFor(halalCoeliac));
  assert.deepEqual(out, [], 'substring matching would fire on ham inside hammock');
});

test('checkText is case-insensitive', () => {
  assert.equal(checkText('x', 'GRILLED CHICKEN', rulesFor(vegetarian)).length, 1);
});

test('a user with no restrictions produces no rules and no findings', () => {
  const none = { dietPrefs: [], foodAllergies: [], strictExclusions: null };
  assert.deepEqual(rulesFor(none), []);
  assert.deepEqual(checkText('x', 'Grilled chicken with pork belly and shrimp', rulesFor(none)), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx tsx --test "scripts/eval/adherence.test.ts"
```

Expected: FAIL — `Cannot find module './adherence'`.

- [ ] **Step 3: Write `scripts/eval/adherence.ts`**

Note the escaping: inside a `RegExp` constructor built from a string you would need `\\b`, but these are regex literals, so a single `\b` is correct.

```typescript
import { finding, type Finding, type Severity } from './types';

export interface Rule {
  /** Human-readable source of the constraint, e.g. 'Halal' or 'allergy:shellfish'. */
  label: string;
  severity: Severity;
  pattern: RegExp;
}

/**
 * Forbidden-term patterns per declared restriction.
 *
 * Deliberately broader than production's RESTRICTION_MAPPINGS, which covers only
 * vegetarian and vegan. A harness that shared production's blind spot could not
 * detect production's blind spot.
 *
 * These are recall-oriented: a false positive costs a reviewer thirty seconds,
 * a false negative ships a coeliac user a wheat dish. Word boundaries keep the
 * obvious substring collisions out ("ham" in "hammock").
 */
export const RESTRICTION_PATTERNS: Record<string, RegExp> = {
  vegetarian: /\b(chicken|beef|pork|lamb|mutton|veal|bacon|ham|prosciutto|salami|pepperoni|sausage|turkey|duck|venison|fish|salmon|tuna|cod|halibut|tilapia|anchov(y|ies)|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|squid|calamari|octopus|gelatin|lard)\b/i,
  vegan: /\b(chicken|beef|pork|lamb|bacon|ham|turkey|fish|salmon|tuna|shrimp|crab|lobster|milk|cream|butter|cheese|yogh?urt|ghee|egg|eggs|honey|gelatin|whey|casein|lard)\b/i,
  pescatarian: /\b(chicken|beef|pork|lamb|mutton|veal|bacon|ham|turkey|duck|venison|sausage)\b/i,
  halal: /\b(pork|bacon|ham|prosciutto|lard|gelatin|wine|beer|rum|vodka|whisk(e)?y|bourbon|brandy|sake|mirin|alcohol)\b/i,
  kosher: /\b(pork|bacon|ham|prosciutto|lard|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|squid|calamari|octopus|catfish|eel)\b/i,
  'gluten-free': /\b(wheat|barley|rye|malt|farro|spelt|semolina|couscous|bulgur|seitan|panko|breadcrumbs?|flour tortilla|soy sauce|pasta|bread|baguette|pita|naan|noodles?|cracker|beer)\b/i,
  'dairy-free': /\b(milk|cream|creamy|butter|cheese|parmesan|mozzarella|cheddar|feta|ricotta|yogh?urt|ghee|whey|casein|custard)\b/i,
  keto: /\b(sugar|rice|pasta|bread|potato(es)?|corn|oats|honey|banana|maple syrup)\b/i,
  paleo: /\b(bread|pasta|rice|beans?|lentils?|chickpeas?|peanuts?|milk|cheese|yogh?urt|sugar)\b/i,
};

/** Allergen name → the terms that carry that allergen. */
const ALLERGEN_PATTERNS: Record<string, RegExp> = {
  shellfish: /\b(shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|crawfish|langoustine)\b/i,
  'tree nuts': /\b(almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|brazil nut|pine nut)\b/i,
  peanuts: /\b(peanut|groundnut|satay)\b/i,
  soy: /\b(soy|soya|tofu|edamame|tempeh|miso)\b/i,
  eggs: /\b(egg|eggs|mayonnaise|meringue|aioli)\b/i,
  dairy: /\b(milk|cream|butter|cheese|yogh?urt|ghee|whey|casein)\b/i,
  fish: /\b(fish|salmon|tuna|cod|halibut|tilapia|anchov(y|ies)|sardine|mackerel)\b/i,
  sesame: /\b(sesame|tahini|halva)\b/i,
  gluten: RESTRICTION_PATTERNS['gluten-free'],
  wheat: RESTRICTION_PATTERNS['gluten-free'],
};

/** Escape a user-supplied exclusion so it can go into a RegExp safely. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turn a survey row into the set of rules its output must satisfy.
 *
 * Three sources, all of which exist on the survey and only some of which reach
 * the prompts in production: dietPrefs, foodAllergies, and strictExclusions.
 */
export function rulesFor(surveyData: any): Rule[] {
  const rules: Rule[] = [];

  for (const pref of (surveyData?.dietPrefs ?? []) as string[]) {
    const pattern = RESTRICTION_PATTERNS[String(pref).toLowerCase().replace(/_/g, '-')];
    if (pattern) rules.push({ label: pref, severity: 'error', pattern });
  }

  for (const allergy of (surveyData?.foodAllergies ?? []) as string[]) {
    const pattern = ALLERGEN_PATTERNS[String(allergy).toLowerCase().trim()];
    if (pattern) rules.push({ label: `allergy:${allergy}`, severity: 'error', pattern });
  }

  const strict = surveyData?.strictExclusions;
  if (strict && typeof strict === 'object') {
    const terms = [...(strict.meats ?? []), ...(strict.other ?? [])] as string[];
    for (const term of terms) {
      const t = String(term).toLowerCase().trim();
      // 'all' under meats means every meat, which the vegetarian pattern already encodes.
      if (t === 'all') {
        rules.push({ label: 'exclusion:all meats', severity: 'error', pattern: RESTRICTION_PATTERNS.vegetarian });
        continue;
      }
      if (!t) continue;
      rules.push({
        label: `exclusion:${t}`,
        severity: 'error',
        pattern: new RegExp(`\\b${escapeForRegex(t)}\\b`, 'i'),
      });
    }
  }

  return rules;
}

/**
 * Check one piece of generated text — a dish name, a description, an ingredient
 * list joined together — against every rule.
 */
export function checkText(where: string, text: string, rules: Rule[]): Finding[] {
  if (!text) return [];
  const out: Finding[] = [];
  for (const rule of rules) {
    const hit = text.match(rule.pattern);
    if (hit) {
      out.push(finding('ADHERENCE', rule.severity, 'restriction-violation', where,
        `${rule.label} violated by "${hit[0]}" in: ${text.slice(0, 120)}`));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test "scripts/eval/adherence.test.ts"
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/adherence.ts scripts/eval/adherence.test.ts
git commit -m "feat(eval): add dietary adherence checkers

Covers halal, kosher, gluten-free, dairy-free, keto, paleo and pescatarian
alongside vegetarian and vegan, plus allergens and strictExclusions. Broader
than production's RESTRICTION_MAPPINGS on purpose: a harness sharing the
app's blind spot cannot measure it."
```

---

## Task 4: Link liveness checkers

The audit's most decisive finding: `grep -rn "method: 'HEAD'" src/ scripts/` returns nothing. Not one URL this app displays has ever been verified. This task builds the first one.

**Files:**
- Create: `scripts/eval/links.ts`
- Test: `scripts/eval/links.test.ts`

**Interfaces:**
- Consumes: `Finding`, `finding` from `./types` (Task 1).
- Produces:
  - `interface LinkVerdict { url: string; alive: boolean; status: number | null; finalUrl: string | null; reason: string }`
  - `probe(url: string, timeoutMs?: number): Promise<LinkVerdict>`
  - `PLATFORM_HOSTS: Record<string, RegExp>`
  - `checkHost(where: string, platform: string, url: string): Finding[]`
  - `checkRedirectedToHomepage(where: string, verdict: LinkVerdict): Finding[]`
  - `checkOrderingLinks(where: string, links: Record<string, string | null>, opts?: { probeNetwork?: boolean }): Promise<Finding[]>`

- [ ] **Step 1: Write the failing test**

The network tests run against a throwaway `node:http` server on an ephemeral port, so they are deterministic and work offline.

Create `scripts/eval/links.test.ts`:

```typescript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { probe, checkHost, checkRedirectedToHomepage, checkOrderingLinks } from './links';

let base = '';
let server: http.Server;

before(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/ok') { res.writeHead(200); res.end('ok'); return; }
    if (url === '/gone') { res.writeHead(404); res.end('no'); return; }
    if (url === '/no-head') {
      // Some CDNs reject HEAD but serve GET. The prober must fall back.
      if (req.method === 'HEAD') { res.writeHead(405); res.end(); return; }
      res.writeHead(200); res.end('ok');
      return;
    }
    if (url === '/store/some-restaurant') {
      // The classic hallucination: a plausible deep link that redirects home.
      res.writeHead(302, { Location: '/' }); res.end();
      return;
    }
    if (url === '/') { res.writeHead(200); res.end('homepage'); return; }
    res.writeHead(500); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => { server.close(); });

test('probe reports a 200 as alive', async () => {
  const v = await probe(`${base}/ok`);
  assert.equal(v.alive, true);
  assert.equal(v.status, 200);
});

test('probe reports a 404 as dead', async () => {
  const v = await probe(`${base}/gone`);
  assert.equal(v.alive, false);
  assert.equal(v.status, 404);
});

test('probe falls back to GET when HEAD is rejected', async () => {
  const v = await probe(`${base}/no-head`);
  assert.equal(v.alive, true, 'a 405 on HEAD must not be reported as a dead link');
  assert.equal(v.status, 200);
});

test('probe records the final URL after redirects', async () => {
  const v = await probe(`${base}/store/some-restaurant`);
  assert.equal(v.alive, true);
  assert.equal(new URL(v.finalUrl!).pathname, '/');
});

test('probe reports an unreachable host as dead rather than throwing', async () => {
  const v = await probe('http://127.0.0.1:1/nothing', 1500);
  assert.equal(v.alive, false);
  assert.equal(v.status, null);
});

test('probe rejects a non-http scheme without touching the network', async () => {
  const v = await probe('javascript:alert(1)');
  assert.equal(v.alive, false);
  assert.match(v.reason, /scheme/i);
});

test('checkHost accepts a URL on the right platform domain', () => {
  assert.deepEqual(checkHost('x', 'doordash', 'https://www.doordash.com/store/sakura-12345/'), []);
});

test('checkHost rejects a URL parked on the wrong platform domain', () => {
  const out = checkHost('x', 'doordash', 'https://www.ubereats.com/store/sakura');
  assert.equal(out.length, 1);
  assert.equal(out[0].family, 'LINKS');
  assert.equal(out[0].severity, 'error');
  assert.equal(out[0].code, 'wrong-host');
});

test('checkHost does not constrain the direct platform, which is any real site', () => {
  assert.deepEqual(checkHost('x', 'direct', 'https://sakuraramenhouse.com'), []);
});

test('checkHost is not fooled by a lookalike domain', () => {
  const out = checkHost('x', 'doordash', 'https://doordash.com.evil.example/store/1');
  assert.equal(out.length, 1, 'suffix matching must be anchored to the registrable domain');
});

test('checkRedirectedToHomepage flags a deep link that lands on /', () => {
  const out = checkRedirectedToHomepage('x', {
    url: 'https://www.doordash.com/store/sakura-12345/',
    alive: true, status: 200,
    finalUrl: 'https://www.doordash.com/',
    reason: 'ok',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'homepage-redirect');
});

test('checkRedirectedToHomepage is silent when the link was always a homepage', () => {
  const out = checkRedirectedToHomepage('x', {
    url: 'https://sakuraramenhouse.com',
    alive: true, status: 200,
    finalUrl: 'https://sakuraramenhouse.com/',
    reason: 'ok',
  });
  assert.deepEqual(out, []);
});

test('checkOrderingLinks skips nulls and needs at least one usable link', async () => {
  const none = await checkOrderingLinks('monday.dinner',
    { doordash: null, ubereats: null, grubhub: null, direct: null },
    { probeNetwork: false });
  assert.equal(none.length, 1);
  assert.equal(none[0].code, 'no-usable-link');

  const some = await checkOrderingLinks('monday.dinner',
    { doordash: 'https://www.doordash.com/store/x-1/', ubereats: null, grubhub: null, direct: null },
    { probeNetwork: false });
  assert.deepEqual(some, []);
});

test('checkOrderingLinks treats the literal string "null" as absent', async () => {
  // normalizeOrderingLinks in shared.ts exists because the model emits this.
  const out = await checkOrderingLinks('monday.dinner',
    { doordash: 'null', ubereats: null, grubhub: null, direct: null } as any,
    { probeNetwork: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'no-usable-link');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx tsx --test "scripts/eval/links.test.ts"
```

Expected: FAIL — `Cannot find module './links'`.

- [ ] **Step 3: Write `scripts/eval/links.ts`**

```typescript
import { finding, type Finding } from './types';

export interface LinkVerdict {
  url: string;
  alive: boolean;
  /** HTTP status of the final response, or null if the request never completed. */
  status: number | null;
  /** URL after redirects. Null when the request never completed. */
  finalUrl: string | null;
  reason: string;
}

/**
 * Registrable domain per ordering platform.
 *
 * Anchored with (^|\.) so that `doordash.com.evil.example` does not match — a
 * bare `endsWith('doordash.com')` would accept it.
 *
 * `direct` is absent on purpose: a restaurant's own site can be any domain, so
 * there is nothing to allow-list. Its correctness is checked by liveness and by
 * corroboration against the Google Places `website` field, not by host.
 */
export const PLATFORM_HOSTS: Record<string, RegExp> = {
  doordash: /(^|\.)doordash\.com$/i,
  ubereats: /(^|\.)ubereats\.com$/i,
  grubhub: /(^|\.)grubhub\.com$/i,
};

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Is this URL reachable?
 *
 * HEAD first because it is cheap, then GET on any 4xx that smells like "this
 * server does not implement HEAD" — 405 and 501 are the standard ones, and some
 * CDNs answer 403. Treating those as dead links would produce false failures on
 * URLs that work perfectly in a browser.
 */
export async function probe(url: string, timeoutMs = 8000): Promise<LinkVerdict> {
  const parsed = parse(url);
  if (!parsed) {
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
        headers: { 'User-Agent': 'healthfit-loop-eval/1.0' },
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

/** Is a platform link actually on that platform's domain? */
export function checkHost(where: string, platform: string, url: string): Finding[] {
  const expected = PLATFORM_HOSTS[platform];
  if (!expected) return [];
  const parsed = parse(url);
  if (!parsed) {
    return [finding('LINKS', 'error', 'malformed-url', where, `${platform}: not a usable URL — ${url}`)];
  }
  if (!expected.test(parsed.hostname)) {
    return [finding('LINKS', 'error', 'wrong-host', where,
      `${platform} link points at ${parsed.hostname}`)];
  }
  return [];
}

/**
 * Did a deep link quietly become a homepage?
 *
 * This is the specific failure mode a liveness check alone misses: the model
 * invents a store path, the platform 302s the unknown path to its front page,
 * and the response is a cheerful 200. The link is alive and useless.
 */
export function checkRedirectedToHomepage(where: string, verdict: LinkVerdict): Finding[] {
  if (!verdict.alive || !verdict.finalUrl) return [];
  const from = parse(verdict.url);
  const to = parse(verdict.finalUrl);
  if (!from || !to) return [];
  const hadPath = from.pathname.replace(/\/+$/, '').length > 0;
  const landedAtRoot = to.pathname.replace(/\/+$/, '').length === 0;
  if (hadPath && landedAtRoot) {
    return [finding('LINKS', 'error', 'homepage-redirect', where,
      `${verdict.url} redirected to the site root — the specific page does not exist`)];
  }
  return [];
}

const isUsable = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());

/**
 * Full check of one orderingLinks object.
 *
 * `probeNetwork: false` runs only the offline checks (host allow-list, usable
 * count), which is what `--no-links` and the unit tests use.
 */
export async function checkOrderingLinks(
  where: string,
  links: Record<string, string | null>,
  opts: { probeNetwork?: boolean } = {}
): Promise<Finding[]> {
  const probeNetwork = opts.probeNetwork ?? true;
  const out: Finding[] = [];

  const usable = Object.entries(links ?? {}).filter(([, v]) => isUsable(v)) as Array<[string, string]>;

  if (usable.length === 0) {
    out.push(finding('LINKS', 'error', 'no-usable-link', where,
      'no orderable link on any platform — the Order Now button has nowhere to go'));
    return out;
  }

  for (const [platform, url] of usable) {
    out.push(...checkHost(where, platform, url));
  }

  if (!probeNetwork) return out;

  const verdicts = await Promise.all(usable.map(([, url]) => probe(url)));
  for (const [i, verdict] of verdicts.entries()) {
    const platform = usable[i][0];
    if (!verdict.alive) {
      out.push(finding('LINKS', 'error', 'dead-link', where,
        `${platform}: ${verdict.url} — ${verdict.reason}`));
      continue;
    }
    out.push(...checkRedirectedToHomepage(`${where}.${platform}`, verdict));
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx tsx --test "scripts/eval/links.test.ts"
```

Expected: PASS, 14 tests. These need no network access and no API key.

- [ ] **Step 5: Sanity-check the prober against the real internet**

```bash
npx tsx -e "import('./scripts/eval/links.ts').then(async m => {
  console.log(await m.probe('https://www.doordash.com/'));
  console.log(await m.probe('https://www.doordash.com/store/this-does-not-exist-99999/'));
})"
```

Expected: the first is alive. The second demonstrates whichever real behaviour DoorDash has — a 404, or an `homepage-redirect`-shaped 200. Record which in the commit message; it tells the follow-up plan whether host checking alone is sufficient.

- [ ] **Step 6: Commit**

```bash
git add scripts/eval/links.ts scripts/eval/links.test.ts
git commit -m "feat(eval): add link liveness and platform host checking

First HTTP verification of a generated URL anywhere in this repo. Covers
dead links, wrong-platform hosts, and the deep-link-302s-to-homepage case
that a bare liveness check reports as a healthy 200."
```

---

## Task 5: Replace the `inspect` hook with a structured `check` hook

Deliberately behaviour-neutral. This task changes the plumbing and mechanically converts all eight sites to the new signature while keeping their existing prose. No new findings are produced yet — that is Task 6. Splitting it this way means a reviewer can verify the wiring without also reviewing eight new checkers.

**Files:**
- Modify: `scripts/bench-generators.ts` — the `Site` interface (~line 117), `runSite` (~line 424), `BenchResult` (~line 397), and `main` (~line 485).

**Interfaces:**
- Consumes: `Finding`, `CheckResult`, `tally` from `scripts/eval/types` (Task 1).
- Produces: `Site.check?: (data: any, f: Fixture) => CheckResult | Promise<CheckResult>` — Task 6 and Task 7 implement this on every site.

Navigate by symbol name, not line number: `CLAUDE.md` warns that line numbers in this repo drift, and this file has already been edited since the audit.

- [ ] **Step 1: Add the import**

In `scripts/bench-generators.ts`, below the existing `import { MODELS } from '../src/lib/ai/models';` line, add:

```typescript
import { tally, type Finding, type CheckResult, type Family } from './eval/types';
```

- [ ] **Step 2: Change the `Site` interface**

Find this in the `Site` interface and replace it:

```typescript
  /** Site-specific quality signal, beyond "did it parse". */
  inspect?: (data: any, f: Fixture) => string;
```

with:

```typescript
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
```

- [ ] **Step 3: Mechanically convert all eight sites**

Each existing site has an `inspect: (...) => <string expression>`. Convert every one to `check`, wrapping the same expression as the `summary` with an empty findings array. Do not change what the strings say — that is Task 6's job.

The pattern, using `meal-planning` as the worked example. Replace:

```typescript
    inspect: (d, f) => {
      const want = homeMealsFrom(f.surveyData.weeklyMealSchedule).length;
      const slots = new Set(d.mealPlan.map((m: any) => `${m.day}|${m.mealType}`));
      return `${d.mealPlan.length}/${want} entries, ${slots.size} distinct slots`;
    },
```

with:

```typescript
    check: (d, f) => {
      const want = homeMealsFrom(f.surveyData.weeklyMealSchedule).length;
      const slots = new Set(d.mealPlan.map((m: any) => `${m.day}|${m.mealType}`));
      return {
        summary: `${d.mealPlan.length}/${want} entries, ${slots.size} distinct slots`,
        findings: [],
      };
    },
```

Apply the same transformation to the remaining seven: `meal-detail`, `grocery-list`, `meal-legacy`, `workout-planning`, `workout-detail`, `recipe`, `menu-extraction`. For the three that use concise arrow bodies (`grocery-list`, `meal-legacy`, `workout-planning`), the conversion is:

```typescript
    // grocery-list
    check: (d) => ({
      summary: Object.entries(d.groceryList as Record<string, any[]>)
        .map(([k, v]) => `${k}=${v.length}`).join(' '),
      findings: [],
    }),
```

```typescript
    // meal-legacy
    check: (d) => ({ summary: `${d.homeMeals.length} meals, grocery present`, findings: [] }),
```

```typescript
    // workout-planning
    check: (d) => ({
      summary: `${d.weeklyPlan.length} days, ${d.weeklyPlan.filter((x: any) => x.restDay).length} rest`,
      findings: [],
    }),
```

After this step, `grep -n "inspect" scripts/bench-generators.ts` must return nothing.

- [ ] **Step 4: Add findings to `BenchResult`**

In the `BenchResult` interface, after the `notes: string[];` field, add:

```typescript
  /** Every structured finding across all n runs, deduplicated by code+where+message. */
  findings: Finding[];
  /** findings rolled up per family, for the results table and the exit gate. */
  familyCounts: Record<Family, { error: number; warn: number }>;
```

- [ ] **Step 5: Update `runSite` to await `check` and collect findings**

Change the signature to accept the link option:

```typescript
async function runSite(site: Site, f: Fixture, n: number): Promise<BenchResult | null> {
```

becomes

```typescript
async function runSite(site: Site, f: Fixture, n: number, probeLinks: boolean): Promise<BenchResult | null> {
```

Add a findings accumulator beside `notes`:

```typescript
  const outcomes: CallOutcome[] = [];
  const notes: string[] = [];
  const findings: Finding[] = [];
```

Replace the `inspect` invocation block inside the run loop:

```typescript
    if (o.parsed && site.inspect) {
      try { notes.push(site.inspect(o.parsed, f)); }
      catch (e) { notes.push(`inspect threw: ${e}`); }
    }
```

with:

```typescript
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
```

`probeLinks` is threaded through to the site checks in Task 6 via a module-level flag; declare it now, immediately above the `SITES` array:

```typescript
/**
 * Whether LINKS-family checks may make HTTP requests. Set from --no-links in
 * main(). Module-level rather than threaded through every check signature: the
 * flag is process-wide and read-only after startup.
 */
export let PROBE_LINKS = true;
```

and set it inside `runSite` before the loop:

```typescript
  PROBE_LINKS = probeLinks;
```

Finally, in the returned object, after `notes: [...new Set(notes)],` add:

```typescript
    findings: dedupeFindings(findings),
    familyCounts: tally(dedupeFindings(findings)),
```

- [ ] **Step 6: Add the dedupe helper**

Immediately above `async function runSite`, add:

```typescript
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
```

- [ ] **Step 7: Update the two `runSite` call sites**

In `main`, add the flag parse beside the existing ones:

```typescript
  const dry = process.argv.includes('--dry');
  const probeLinks = !process.argv.includes('--no-links');
```

and change the call:

```typescript
        const r = await runSite(s, f, n);
```

to:

```typescript
        const r = await runSite(s, f, n, probeLinks);
```

- [ ] **Step 8: Verify the dry run still works**

```bash
npx tsx scripts/bench-generators.ts --dry
```

Expected: same output as before this task — every site reports `✅ prompt N chars, schema builds`, exit code 0. No API key needed.

- [ ] **Step 9: Verify no new type errors**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: unchanged from your recorded baseline.

- [ ] **Step 10: Commit**

```bash
git add scripts/bench-generators.ts
git commit -m "refactor(bench): replace inspect with a structured check hook

Behaviour-neutral. inspect returned prose a human had to read, so nothing
could fail on it. check returns {summary, findings} and the runner tallies
findings by family. All eight sites converted mechanically; real checks
land in the next commit."
```

---

## Task 6: Give the eight existing sites real checks

**Files:**
- Modify: `scripts/bench-generators.ts` — the `check` on each of the eight sites.

**Interfaces:**
- Consumes: `checkAtwater`, `checkTarget`, `checkSum` (Task 1); `checkCount`, `checkSlots`, `checkNonEmpty` (Task 2); `rulesFor`, `checkText` (Task 3); `checkOrderingLinks` (Task 4); `PROBE_LINKS` (Task 5).
- Produces: no new exports. This task makes the harness able to fail.

- [ ] **Step 1: Add the checker imports**

Below the `./eval/types` import added in Task 5:

```typescript
import { checkAtwater, checkTarget, checkSum } from './eval/arithmetic';
import { checkCount, checkSlots, checkNonEmpty } from './eval/completeness';
import { rulesFor, checkText } from './eval/adherence';
import { checkOrderingLinks } from './eval/links';
```

- [ ] **Step 2: Add a shared meal-slot checker above the `SITES` array**

Four sites emit the same `MealSlot` envelope (`day`, `mealType`, `primary`, `alternative`), so the logic lives once. Place this immediately below the `PROBE_LINKS` declaration:

```typescript
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
```

- [ ] **Step 3: Replace the `meal-planning` check**

```typescript
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
```

- [ ] **Step 4: Replace the `meal-detail` check**

The detail site builds its chunk inside `build`, so the check recomputes the same two-day chunk to know what to expect.

```typescript
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
```

- [ ] **Step 5: Replace the `grocery-list` check**

```typescript
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
```

- [ ] **Step 6: Replace the `meal-legacy` check**

```typescript
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
```

- [ ] **Step 7: Replace the `workout-planning` check**

This is the site that catches finding D1 — `weeklyPlan` is the one enumerable-count array left unpinned.

```typescript
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
```

- [ ] **Step 8: Replace the `workout-detail` check**

```typescript
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
```

- [ ] **Step 9: Replace the `recipe` check**

This is where finding E3 — the per-serving versus whole-recipe ambiguity — becomes measurable. The tell is an error that is off by exactly `servings`.

```typescript
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
```

- [ ] **Step 10: Replace the `menu-extraction` check**

The fixture prose names exactly which links exist, so this check knows the ground truth — the only site in the harness where a hallucinated link is provable rather than merely suspicious.

```typescript
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
```

- [ ] **Step 11: Verify the dry run and the type check**

```bash
npx tsx scripts/bench-generators.ts --dry && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: dry run exits 0; error count unchanged from baseline.

- [ ] **Step 12: Run one real site to see findings appear**

Requires `GPT_KEY`. One site, one fixture, one run — a few cents.

```bash
set -a && source .env.local && set +a
npx tsx scripts/bench-generators.ts --site=recipe --fixture=restricted --n=1
```

Expected: the run prints its summary line plus any `↳` findings. The `restricted` fixture is halal, gluten-free, dairy-free with shellfish and tree-nut allergies, so ADHERENCE findings here are real signal, not noise. Record what you see.

- [ ] **Step 13: Commit**

```bash
git add scripts/bench-generators.ts
git commit -m "feat(bench): implement four-family checks on all eight sites

Meals get Atwater consistency, target deviation, slot completeness and
dietary adherence; workouts get duration and RPE parseability plus missing
training days; recipes get the per-serving/whole-recipe unit mismatch;
menu extraction gets link liveness against a fixture whose ground truth
says which platforms actually exist."
```

---

## Task 7: Add the two missing restaurant sites

Audit finding G3: the harness cannot see the surface the user complained about most. `restaurant-selection` and `restaurant-meals` are both plain OpenAI calls, so they need no new transport.

**Files:**
- Modify: `scripts/bench-generators.ts` — two new entries in `SITES`, plus imports.
- Modify: `scripts/fixtures/surveys.ts` — add `restaurantFixture` and `restaurantSlotsFrom`.

**Interfaces:**
- Consumes: `createRestaurantSelectionPrompt`, `createRestaurantMealGenerationPrompt` from `src/lib/ai/prompts/meal-generation`; `RestaurantSelectionSchema` from `src/lib/ai/schemas/restaurants`; `pinnedRestaurantMeals` from `src/lib/ai/schemas/index`.
- Produces:
  - `scripts/fixtures/surveys.ts` → `export const nearbyRestaurantsFixture: any[]`
  - `scripts/fixtures/surveys.ts` → `export const restaurantMenuDataFixture: any[]`
  - `scripts/fixtures/surveys.ts` → `export function restaurantSlotsFrom(schedule): Array<{day: string; mealType: string}>`

- [ ] **Step 1: Add the restaurant fixtures**

Append to `scripts/fixtures/surveys.ts`:

```typescript
/** Flatten a weeklyMealSchedule into the eating-out slots the restaurant prompts take. */
export function restaurantSlotsFrom(schedule: Record<string, Record<string, string>>) {
  return DAYS.flatMap(day =>
    ['breakfast', 'lunch', 'dinner']
      .filter(slot => schedule[day]?.[slot] === 'restaurant')
      .map(mealType => ({ day, mealType }))
  );
}

/**
 * Stands in for a Google Places nearbysearch result.
 *
 * Deliberately includes one restaurant whose cuisine matches no fixture
 * preference and one with a missing placeId: the selection prompt is supposed
 * to work from this list only, and a model that invents a restaurant or drops
 * the placeId is exactly the failure worth catching.
 */
export const nearbyRestaurantsFixture = [
  { name: 'Sakura Ramen House', placeId: 'place_sakura_1', cuisine: 'japanese', rating: 4.5, priceLevel: 2, address: '2100 Shattuck Ave', city: 'Berkeley' },
  { name: 'Zaytoon Mediterranean', placeId: 'place_zaytoon_2', cuisine: 'middle_eastern', rating: 4.4, priceLevel: 2, address: '1133 Solano Ave', city: 'Berkeley' },
  { name: 'Comal Next Door', placeId: 'place_comal_3', cuisine: 'mexican', rating: 4.3, priceLevel: 2, address: '2020 Shattuck Ave', city: 'Berkeley' },
  { name: 'Great China', placeId: 'place_greatchina_4', cuisine: 'chinese', rating: 4.2, priceLevel: 2, address: '2190 Bancroft Way', city: 'Berkeley' },
  { name: 'Cheese Board Pizza', placeId: 'place_cheeseboard_5', cuisine: 'pizza', rating: 4.7, priceLevel: 1, address: '1512 Shattuck Ave', city: 'Berkeley' },
  { name: 'Angeline\'s Louisiana Kitchen', placeId: 'place_angelines_6', cuisine: 'cajun', rating: 4.1, priceLevel: 2, address: '2261 Shattuck Ave', city: 'Berkeley' },
  { name: 'Kiraku Izakaya', placeId: 'place_kiraku_7', cuisine: 'japanese', rating: 4.4, priceLevel: 2, address: '2566 Telegraph Ave', city: 'Berkeley' },
  { name: 'Tacos Sinaloa', placeId: 'place_tacos_8', cuisine: 'mexican', rating: 4.3, priceLevel: 1, address: '2384 Telegraph Ave', city: 'Berkeley' },
  { name: 'La Note Provencale', placeId: 'place_lanote_9', cuisine: 'french', rating: 4.2, priceLevel: 2, address: '2377 Shattuck Ave', city: 'Berkeley' },
  { name: 'Ippuku', placeId: 'place_ippuku_10', cuisine: 'japanese', rating: 4.5, priceLevel: 3, address: '2130 Center St', city: 'Berkeley' },
  { name: 'Berkeley Social Club', placeId: 'place_bsc_11', cuisine: 'american', rating: 3.9, priceLevel: 2, address: '2050 University Ave', city: 'Berkeley' },
];

/**
 * Stands in for the menu data the restaurant-meal prompt receives.
 *
 * The ordering links here are the ground truth: Sakura has DoorDash and a
 * direct site, Zaytoon has only a direct site, Comal has nothing. A generated
 * meal that produces a Grubhub URL for any of them invented it — the prompt
 * explicitly tells the model to use null for platforms marked "not available".
 */
export const restaurantMenuDataFixture = [
  {
    name: 'Sakura Ramen House', cuisine: 'japanese', address: '2100 Shattuck Ave, Berkeley',
    orderingLinks: {
      doordash: 'https://www.doordash.com/store/sakura-ramen-house-berkeley-12345/',
      ubereats: null, grubhub: null, direct: 'https://sakuraramenhouse.com',
    },
    menuItems: [
      { name: 'Tonkotsu Ramen', price: 16.5, category: 'dinner', estimatedCalories: 780, description: 'Pork bone broth with chashu' },
      { name: 'Vegetable Gyoza', price: 8.5, category: 'lunch', estimatedCalories: 320, description: 'Six pieces, pan fried' },
      { name: 'Salmon Poke Bowl', price: 18.25, category: 'lunch', estimatedCalories: 620, description: 'Over brown rice' },
    ],
  },
  {
    name: 'Zaytoon Mediterranean', cuisine: 'middle_eastern', address: '1133 Solano Ave, Berkeley',
    orderingLinks: { doordash: null, ubereats: null, grubhub: null, direct: 'https://zaytoonberkeley.com' },
    menuItems: [
      { name: 'Chicken Shawarma Plate', price: 17.0, category: 'dinner', estimatedCalories: 720, description: 'With rice and salad' },
      { name: 'Falafel Wrap', price: 12.5, category: 'lunch', estimatedCalories: 540, description: 'Tahini and pickles' },
      { name: 'Lamb Kofta', price: 21.0, category: 'dinner', estimatedCalories: 810, description: 'Grilled, with hummus' },
    ],
  },
  {
    name: 'Comal Next Door', cuisine: 'mexican', address: '2020 Shattuck Ave, Berkeley',
    orderingLinks: { doordash: null, ubereats: null, grubhub: null, direct: null },
    menuItems: [
      { name: 'Carnitas Tacos', price: 14.0, category: 'lunch', estimatedCalories: 610, description: 'Three tacos, salsa verde' },
      { name: 'Grilled Fish Bowl', price: 18.0, category: 'dinner', estimatedCalories: 650, description: 'Rice, beans, cabbage' },
    ],
  },
];
```

- [ ] **Step 2: Add the imports to `scripts/bench-generators.ts`**

Extend the existing meal-generation import to include the two restaurant builders:

```typescript
import {
  createPlanningPrompt,
  createDetailPrompt,
  createGroceryPrompt,
  createHomeMealGenerationPrompt,
  createRestaurantSelectionPrompt,
  createRestaurantMealGenerationPrompt,
} from '../src/lib/ai/prompts/meal-generation';
```

Add the schema imports:

```typescript
import { RestaurantSelectionSchema, MenuExtractionSchema } from '../src/lib/ai/schemas/restaurants';
```

(`MenuExtractionSchema` is already imported — merge rather than duplicate.)

Add `pinnedRestaurantMeals` to the existing `schemas/index` import list.

Extend the fixtures import:

```typescript
import {
  fixtures, homeMealsFrom, scheduleTextFrom, menuProseFixture,
  restaurantSlotsFrom, nearbyRestaurantsFixture, restaurantMenuDataFixture,
  type Fixture,
} from './fixtures/surveys';
```

- [ ] **Step 3: Add the `restaurant-selection` site**

Insert into `SITES`, after `menu-extraction`:

```typescript
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
```

- [ ] **Step 4: Add the `restaurant-meals` site**

```typescript
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
```

- [ ] **Step 5: Exempt the new sites from the dry run's live-upstream skip list**

Neither needs `planFor`, so both dry-run cleanly. Confirm:

```bash
npx tsx scripts/bench-generators.ts --dry --site=restaurant-selection
npx tsx scripts/bench-generators.ts --dry --site=restaurant-meals
```

Expected: `restaurant-selection` builds for all fixtures. `restaurant-meals` reports `n/a for this fixture` for `high-protein-gym` (its schedule is all-home) and builds for the other two.

- [ ] **Step 6: Run both against the API once**

```bash
set -a && source .env.local && set +a
npx tsx scripts/bench-generators.ts --site=restaurant-meals --fixture=restricted --n=1
```

Expected: `restricted` is halal with a shellfish allergy, and the supplied menus contain carnitas (pork) and a salmon dish. Any ADHERENCE finding here is a genuine dietary failure. Any `fabricated-link` finding is the user's *"we always want accurate links"* complaint, reproduced on demand.

- [ ] **Step 7: Commit**

```bash
git add scripts/bench-generators.ts scripts/fixtures/surveys.ts
git commit -m "feat(bench): add restaurant-selection and restaurant-meals sites

The two surfaces behind the accurate-links complaint had no bench coverage.
Both fixtures carry ground truth — which restaurants exist, which dishes are
on their menus, which ordering platforms they actually have — so an invented
restaurant, dish, or URL is provable rather than merely suspected."
```

---

## Task 8: Add the grocery-prices site (Perplexity transport)

Audit findings C1–C5 all live in `fetchPriceChunk`, and the harness cannot reach it: the prompt is a template literal inside a private method, and the call goes to Perplexity rather than OpenAI. Both are fixed here.

**This is the one task that modifies `src/`.** The change is a pure extraction — the prompt string is moved into an exported function and called from where it used to be inlined. Step 3 verifies the output is byte-identical, so no behaviour changes.

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` — extract the price prompt.
- Modify: `scripts/bench-generators.ts` — add a `provider` field to `Site`, teach `callOnce` about Perplexity, add the site.

**Interfaces:**
- Produces: `src/lib/external/perplexity-client.ts` → `export function createGroceryPricePrompt(args: { items: Array<{ name: string; quantity: string; uses: string; category: string }>; storeNames: string; city: string; userGoal: string }): string`
- Produces: `scripts/bench-generators.ts` → `Site.provider?: 'openai' | 'perplexity'` (defaults to `'openai'`)

- [ ] **Step 1: Extract the prompt builder**

In `src/lib/external/perplexity-client.ts`, at module scope above `export class PerplexityClient`, add an exported function containing the exact template literal currently assigned to `const query` inside `fetchPriceChunk`. Copy it verbatim — every line, every backtick-interpolation — changing only the interpolated identifiers to come from the argument object:

```typescript
/**
 * The grocery price query, extracted from fetchPriceChunk so the bench harness
 * can build it without a network call or a private-method escape hatch.
 *
 * Pure: same arguments in, same string out. fetchPriceChunk calls this instead
 * of inlining the literal.
 */
export function createGroceryPricePrompt(args: {
  items: Array<{ name: string; quantity: string; uses: string; category: string }>;
  storeNames: string;
  city: string;
  userGoal: string;
}): string {
  const { items, storeNames, city, userGoal } = args;
  const itemList = items.map(i => `- ${i.name} (${i.quantity})`).join('\n');
  return `Search the web for what these products actually cost right now at ${storeNames} in ${city}:
...
```

(Continue with the remainder of the existing literal unchanged, through the closing `}\`` of the JSON example.)

- [ ] **Step 2: Call it from `fetchPriceChunk`**

Replace the `const itemList = ...` and `const query = \`...\`` block with:

```typescript
      const query = createGroceryPricePrompt({ items, storeNames, city, userGoal });
```

- [ ] **Step 3: Verify the extraction changed nothing**

```bash
git stash && npx tsx -e "
  const m = require('./src/lib/external/perplexity-client.ts');
" 2>/dev/null; git stash pop
```

That will not work directly — instead capture both versions and diff them:

```bash
npx tsx -e "
import('./src/lib/external/perplexity-client.ts').then(m => {
  const s = m.createGroceryPricePrompt({
    items: [{ name: 'Chicken Breast', quantity: '2 lbs', uses: 'salad', category: 'proteins' }],
    storeNames: 'Whole Foods, Trader Joe\\'s', city: 'Berkeley', userGoal: 'lose_weight',
  });
  require('node:fs').writeFileSync('/tmp/price-prompt-after.txt', s);
  console.log(s.length + ' chars written');
})"
```

Then confirm by eye against `git show HEAD:src/lib/external/perplexity-client.ts` that the literal is unchanged apart from the interpolated variable names. The three interpolations are `${storeNames}`, `${city}` (twice), and `${userGoal}` (twice), plus `${itemList}`.

- [ ] **Step 4: Add provider support to `callOnce`**

Add the field to `Site`:

```typescript
  /** Which API to call. Defaults to 'openai'. Perplexity is OpenAI-compatible on the wire. */
  provider?: 'openai' | 'perplexity';
```

Change the `callOnce` signature to take a provider and select endpoint plus key:

```typescript
async function callOnce(
  model: string, prompt: string, schema: z.ZodType,
  schemaName: string, maxTokens: number, temperature: number,
  provider: 'openai' | 'perplexity' = 'openai'
): Promise<CallOutcome> {
```

Inside, replace the hardcoded URL and Authorization header:

```typescript
  const endpoint = provider === 'perplexity'
    ? 'https://api.perplexity.ai/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const apiKey = provider === 'perplexity' ? process.env.PERPLEXITY_API_KEY : KEY;
  if (!apiKey) {
    return { ...blank, parsed: null, error: `${provider} API key is not set`, latencyMs: 0 };
  }
```

and use `endpoint` in the `fetch` call and `apiKey` in the header. Perplexity's Sonar models are not in `isReasoningModel`'s pattern, so they take the `max_tokens`/`temperature` dialect, which is correct.

Add Sonar to `RATES` with a comment that the figure needs checking:

```typescript
  // Perplexity Sonar. Search requests also carry a per-request fee that this
  // table does not model, so the $/1k figure for grocery-prices is a floor.
  'sonar': { in: 1, out: 1 },
  'sonar-pro': { in: 3, out: 15 },
```

Pass the provider through at both call sites in `runSite` and `planFor`:

```typescript
    const o = await callOnce(site.model, built.prompt, built.schema,
      site.name.replace(/-/g, '_'), site.maxTokens, site.temperature, site.provider ?? 'openai');
```

- [ ] **Step 5: Add the site**

Import what it needs:

```typescript
import { createGroceryPricePrompt } from '../src/lib/external/perplexity-client';
import { GroceryPricesSchema } from '../src/lib/ai/schemas/grocery';
import { MODELS } from '../src/lib/ai/models';  // already imported — MODELS.SEARCH is the Sonar id
```

Add to `SITES`:

```typescript
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
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
set -a && source .env.local && set +a
npx tsx scripts/bench-generators.ts --site=grocery-prices --fixture=vegetarian-cut --n=1
```

Expected: error count unchanged. The run either prices items or reports findings. `ragged-basket` and `identical-prices` are the two most likely to fire — both are audit findings C3 and C1 becoming visible for the first time.

- [ ] **Step 7: Commit**

```bash
git add src/lib/external/perplexity-client.ts scripts/bench-generators.ts
git commit -m "feat(bench): add grocery-prices site over the Perplexity transport

Extracts the price query from fetchPriceChunk into a pure exported builder
(byte-identical output) and teaches callOnce to talk to Perplexity, which is
OpenAI-compatible on the wire. Checks the ragged-basket and store-name-variant
failures that make the cheapest-store comparison meaningless."
```

---

## Task 9: Expand the fixture corpus

Audit finding G5: the three existing fixtures would not catch B11, B12, C7, D8, or E1. None exercises a coeliac diet, a sparse geography, an injury the workout must respect, or a basket large enough to reproduce the chunking failure.

**Files:**
- Modify: `scripts/fixtures/surveys.ts`

**Interfaces:**
- Consumes: the existing `Fixture` interface and `base` object.
- Produces: three new entries appended to the exported `fixtures` array — `coeliac-nut-allergy`, `rural-sparse`, `large-household`.

**Cost note:** every fixture multiplies the bench cost. With 11 sites the corpus goes from 3 to 6 fixtures, roughly doubling a full run. Use `--fixture=` when iterating and reserve full runs for baselines.

- [ ] **Step 1: Append the three fixtures to the `fixtures` array**

```typescript
  {
    // Exists to catch E1/E2: a cross-user recipe cache hit that ignores diet is
    // a medical problem for this person, not a quality problem.
    name: 'coeliac-nut-allergy',
    surveyData: {
      ...base,
      firstName: 'Nora', lastName: 'Whelan',
      age: 36, sex: 'female', height: 66, weight: 152,
      goal: 'GENERAL_WELLNESS', primaryGoal: 'maintain',
      goalChallenge: 'cross-contamination when eating out',
      additionalGoalsNotes: 'coeliac disease, diagnosed — not a preference',
      healthFocus: 'digestive', maintainFocus: 'energy',
      activityLevel: 'moderately_active',
      fitnessLevel: 'intermediate', fitnessTimeline: '6_months',
      preferredActivities: ['running', 'pilates'], sportsInterests: '',
      dietPrefs: ['Gluten-Free', 'Dairy-Free'],
      foodAllergies: ['tree nuts', 'peanuts'],
      strictExclusions: { meats: [], other: ['soy sauce', 'barley'] },
      preferredCuisines: ['mediterranean', 'mexican'],
      preferredFoods: ['rice', 'eggs', 'chicken', 'avocado'],
      preferredNutrients: ['iron', 'b12'],
      customFoodInput: 'coeliac — trace gluten is not acceptable',
      monthlyFoodBudget: 500, monthlyFitnessBudget: 60,
      eatingOutOccasions: '2', mealsOutPerWeek: 2,
      distancePreference: 'medium',
      weeklyMealSchedule: mixedSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'intermediate', gymAccess: 'full_gym',
      workoutTypes: ['strength', 'running'],
      availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      preferredDuration: 45,
      // Six available days against an unpinned weeklyPlan is the D1 probe.
      injuryConsiderations: ['left knee — no deep squats or jumping'],
      timePreferences: ['morning'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 420, protein: 26, carbs: 44, fat: 15 },
      lunch: { calories: 580, protein: 36, carbs: 60, fat: 20 },
      dinner: { calories: 640, protein: 40, carbs: 64, fat: 22 },
    } },
  },
  {
    // Exists to catch C7: pinnedGroceryStores(3) plus "Always provide 3 stores"
    // in a place that does not have three stores.
    name: 'rural-sparse',
    surveyData: {
      ...base,
      firstName: 'Dale', lastName: 'Ferris',
      streetAddress: '412 Main St', city: 'Eureka', state: 'NV', zipCode: '89316',
      age: 52, sex: 'male', height: 71, weight: 215,
      goal: 'WEIGHT_LOSS', primaryGoal: 'lose_weight',
      goalChallenge: 'nearest supermarket is 40 minutes away',
      additionalGoalsNotes: 'shops once a fortnight',
      healthFocus: 'cardiovascular', maintainFocus: null,
      activityLevel: 'lightly_active',
      fitnessLevel: 'beginner', fitnessTimeline: '12_months',
      preferredActivities: ['walking'], sportsInterests: '',
      dietPrefs: [],
      foodAllergies: [],
      strictExclusions: null,
      preferredCuisines: ['american'],
      preferredFoods: ['ground beef', 'potatoes', 'frozen vegetables'],
      preferredNutrients: ['fiber'],
      customFoodInput: 'nothing that spoils in three days',
      monthlyFoodBudget: 280, monthlyFitnessBudget: 0,
      eatingOutOccasions: '0', mealsOutPerWeek: 0,
      distancePreference: 'far',
      weeklyMealSchedule: allHomeSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'beginner', gymAccess: 'no_gym',
      workoutTypes: ['bodyweight', 'walking'], availableDays: ['saturday', 'sunday'],
      preferredDuration: 25, injuryConsiderations: [],
      timePreferences: ['morning'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 400, protein: 24, carbs: 42, fat: 14 },
      lunch: { calories: 560, protein: 34, carbs: 58, fat: 19 },
      dinner: { calories: 600, protein: 38, carbs: 60, fat: 21 },
    } },
  },
  {
    // Exists to catch C6: Math.max(15, ...) has a floor and no ceiling, so a
    // basket above ~90 items reproduces the 45s timeout chunking was meant to fix.
    name: 'large-household',
    surveyData: {
      ...base,
      firstName: 'Priya', lastName: 'Raghavan',
      age: 41, sex: 'female', height: 64, weight: 138,
      goal: 'GENERAL_WELLNESS', primaryGoal: 'maintain',
      goalChallenge: 'cooking for five with three different diets',
      additionalGoalsNotes: 'household of five, one vegetarian teenager',
      healthFocus: 'body_composition', maintainFocus: 'energy',
      activityLevel: 'moderately_active',
      fitnessLevel: 'intermediate', fitnessTimeline: '6_months',
      preferredActivities: ['swimming', 'strength'], sportsInterests: 'badminton',
      dietPrefs: ['Vegetarian'],
      foodAllergies: [],
      strictExclusions: { meats: ['all'], other: [] },
      preferredCuisines: ['indian', 'thai', 'italian', 'mediterranean', 'mexican'],
      preferredFoods: ['paneer', 'lentils', 'chickpeas', 'spinach', 'rice', 'tofu', 'yogurt'],
      preferredNutrients: ['protein', 'iron', 'calcium'],
      customFoodInput: 'batch cooking, big shops',
      monthlyFoodBudget: 1100, monthlyFitnessBudget: 90,
      eatingOutOccasions: '1', mealsOutPerWeek: 1,
      distancePreference: 'close',
      weeklyMealSchedule: allHomeSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'intermediate', gymAccess: 'full_gym',
      workoutTypes: ['strength', 'swimming'],
      availableDays: ['monday', 'wednesday', 'friday'],
      preferredDuration: 50, injuryConsiderations: ['right wrist — no heavy pressing'],
      timePreferences: ['evening'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 430, protein: 25, carbs: 48, fat: 14 },
      lunch: { calories: 600, protein: 34, carbs: 66, fat: 20 },
      dinner: { calories: 650, protein: 38, carbs: 70, fat: 22 },
    } },
  },
```

- [ ] **Step 2: Verify every site still builds for every fixture**

```bash
npx tsx scripts/bench-generators.ts --dry
```

Expected: exit 0. `restaurant-meals` reports `n/a` for the three all-home fixtures (`high-protein-gym`, `rural-sparse`, `large-household`), which is correct — they have no eating-out slots.

- [ ] **Step 3: Verify the adherence rules fire on the new fixtures without an API call**

```bash
npx tsx -e "
Promise.all([import('./scripts/eval/adherence.ts'), import('./scripts/fixtures/surveys.ts')]).then(([a, s]) => {
  for (const f of s.fixtures) {
    const rules = a.rulesFor(f.surveyData);
    console.log(f.name.padEnd(22), rules.length + ' rules:', rules.map(r => r.label).join(', ') || '(none)');
  }
})"
```

Expected: `coeliac-nut-allergy` yields at least five rules (Gluten-Free, Dairy-Free, allergy:tree nuts, allergy:peanuts, exclusion:soy sauce, exclusion:barley). `rural-sparse` yields zero, which is correct and is why it is in the corpus — it isolates completeness and arithmetic from adherence.

- [ ] **Step 4: Commit**

```bash
git add scripts/fixtures/surveys.ts
git commit -m "test(bench): add coeliac, sparse-geography and large-basket fixtures

The three existing fixtures could not have caught the store-hallucination,
recipe-cache-collision, unpinned-weekly-plan or chunk-ceiling findings. These
three are each built around one of them."
```

---

## Task 10: The gate, the report, and the baseline

Findings that do not change an exit code are notes. This task makes them a build signal and records where the numbers stand today.

**Files:**
- Modify: `scripts/bench-generators.ts` — reporting and exit code in `main`.
- Modify: `bench-results/README.md` — the four-family baseline.
- Modify: `package.json` — an `eval` script.

**Interfaces:**
- Consumes: `BenchResult.findings` and `BenchResult.familyCounts` (Task 5).
- Produces: exit code 1 when the gate trips; `npm run eval` as the entry point.

- [ ] **Step 1: Add the per-family column to the results table**

In `main`, replace the two table header lines:

```typescript
  console.log('| Site | Fixture | Model | n | Pass | p50 ms | p95 ms | In | Out | Peak % | $/1k |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
```

with:

```typescript
  console.log('| Site | Fixture | Model | n | Pass | CMPL | ARITH | ADHR | LINKS | p50 ms | Out | $/1k |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
```

and the row line with:

```typescript
  for (const r of results) {
    const c = r.familyCounts;
    const cell = (x: { error: number; warn: number }) =>
      x.error === 0 && x.warn === 0 ? '·' : `${x.error}e/${x.warn}w`;
    console.log(`| ${r.site} | ${r.fixture} | ${r.model} | ${r.n} | ${Math.round(r.schemaPassRate * 100)}% | ` +
      `${cell(c.COMPLETENESS)} | ${cell(c.ARITHMETIC)} | ${cell(c.ADHERENCE)} | ${cell(c.LINKS)} | ` +
      `${r.latencyP50Ms} | ${r.avgCompletionTokens} | ${r.estCostPer1000Runs} |`);
  }
```

- [ ] **Step 2: Add the findings detail block and the gate**

After the existing `tight` warning block and before `mkdirSync('bench-results', ...)`, insert:

```typescript
  const allFindings = results.flatMap(r => r.findings.map(f => ({ ...f, site: r.site, fixture: r.fixture })));
  const errors = allFindings.filter(f => f.severity === 'error');
  const warns = allFindings.filter(f => f.severity === 'warn');

  if (allFindings.length > 0) {
    console.log(`\n## Findings — ${errors.length} error, ${warns.length} warn\n`);
    // Grouped by code rather than by site: a code that fires across many sites
    // is one bug, and reading it site-by-site hides that.
    const byCode = new Map<string, typeof allFindings>();
    for (const f of allFindings) byCode.set(f.code, [...(byCode.get(f.code) ?? []), f]);
    const ordered = [...byCode.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [code, group] of ordered) {
      const sev = group.some(f => f.severity === 'error') ? '✗' : '⚠';
      console.log(`${sev} ${code} — ${group.length} occurrence(s) [${group[0].family}]`);
      for (const f of group.slice(0, 3)) {
        console.log(`    ${f.site}/${f.fixture} ${f.where}: ${f.message}`);
      }
      if (group.length > 3) console.log(`    … and ${group.length - 3} more`);
    }
  } else {
    console.log('\nNo findings across any family. ✅');
  }
```

Then, after the `console.log(\`\nWrote ${out}\`)` line at the end of `main`:

```typescript
  // The gate. Default is to report and exit 0 so an exploratory run is never
  // blocked; CI and regression runs pass --fail-on=error.
  const failOn = arg('fail-on');
  if (failOn === 'error' && errors.length > 0) {
    console.error(`\n❌ ${errors.length} error-level finding(s). Failing because --fail-on=error.`);
    process.exit(1);
  }
  if (failOn === 'warn' && allFindings.length > 0) {
    console.error(`\n❌ ${allFindings.length} finding(s). Failing because --fail-on=warn.`);
    process.exit(1);
  }
```

Include the findings in the JSON artefact by adding `findings: allFindings,` to the `writeFileSync` object.

- [ ] **Step 3: Document the new flags in the file header**

Extend the usage comment at the top of `scripts/bench-generators.ts`:

```
 *   npx tsx scripts/bench-generators.ts --dry            # build prompts, call nothing
 *   npx tsx scripts/bench-generators.ts --n=3
 *   npx tsx scripts/bench-generators.ts --site=meal-detail --fixture=restricted
 *   npx tsx scripts/bench-generators.ts --no-links       # skip HTTP link probing
 *   npx tsx scripts/bench-generators.ts --fail-on=error  # exit 1 on any error finding
```

- [ ] **Step 4: Add the npm scripts**

In `package.json`, beside the existing `"bench"` entry:

```json
    "bench": "tsx scripts/bench-generators.ts",
    "eval": "tsx scripts/bench-generators.ts --fail-on=error",
    "test:eval": "tsx --test \"scripts/eval/*.test.ts\""
```

- [ ] **Step 5: Verify the whole suite and a dry run**

```bash
npm run test:eval && npx tsx scripts/bench-generators.ts --dry
```

Expected: all checker tests pass; dry run exits 0.

- [ ] **Step 6: Capture the baseline**

This is a full run and costs real money — 11 sites × 6 fixtures × 2 runs. Check the estimate the script prints before confirming.

```bash
set -a && source .env.local && set +a
npm run bench -- --n=2 2>&1 | tee /tmp/eval-baseline.txt
```

Note: use `npm run bench`, not `npm run eval` — the baseline must complete and write its JSON rather than exiting 1 partway.

- [ ] **Step 7: Write the baseline into `bench-results/README.md`**

Append a section recording, from `/tmp/eval-baseline.txt`:
- the date and the model IDs used
- the per-family error and warn totals for every site/fixture cell
- the findings-by-code list, in full
- the total `$/1k`
- one sentence per code with more than three occurrences, saying which audit finding it corresponds to

State explicitly that this is the **pre-fix** baseline, that `n=2` makes per-cell rates directional rather than significant, and that the follow-up plans are expected to move these numbers.

- [ ] **Step 8: Commit**

```bash
git add scripts/bench-generators.ts package.json bench-results/README.md
git commit -m "feat(bench): gate on findings and record the pre-fix baseline

Adds per-family columns, a findings-by-code report, and --fail-on so a wrong
number or dead link can fail a run. bench-results/README.md now carries the
baseline the correctness fixes will be measured against."
```

---

## Self-Review

Checked against `docs/superpowers/specs/2026-08-24-generation-correctness-audit.md`:

**Spec coverage.** G3 (missing sites) → Tasks 7 and 8. G4 (`inspect` returns prose) → Tasks 5 and 6. G5 (three fixtures is not a corpus) → Task 9. The four families named in the spec's opening table each get a module: COMPLETENESS → Task 2, ARITHMETIC → Task 1, ADHERENCE → Task 3, LINKS → Task 4.

**Detection coverage of the A–F findings.** This plan does not fix them; it must be able to *see* them. Traced: A2/A3/A5 (short weeks, empty ingredient arrays, no day-total check) → `checkMealSlot` plus `checkSlots`. A11 (`'varies'` quantities) → `unpriceable-quantity`. B1/B2/B6 (dead, invented, wrong-host links) → Task 4 plus `fabricated-link` in Tasks 6 and 7. B7 (invented restaurants) → `invented-restaurant` in Task 7. B11/B12 (allergies and unmapped restrictions) → Task 3. C3/C4 (ragged baskets, store-name variants) → Task 8. C7 (forced three stores) → the `rural-sparse` fixture. D1 (unpinned `weeklyPlan`) → `missing-training-day`. D5/D6 (`NaNmin`, RPE out of range) → `unparseable-duration`, `unparseable-reps`, `rpe-out-of-range`. E3 (per-serving unit mismatch) → `serving-unit-mismatch`.

**Not detectable by this harness, by design.** A1, A4, A6, A7, A12, B4, B13, B14, C5, C8, D4, D8, E1, E2, F1, F2 are properties of the *route code*, not of a model response: a discarded validator result, a fire-and-forget dispatch, a cache key, a hardcoded UI literal. An offline prompt-and-schema harness cannot observe them. They are verified by inspection in the follow-up plans, and this is called out here so nobody reads a green eval run as evidence that they are fixed.

**Placeholder scan.** No TBDs. Every code step carries the code. Task 8 Step 1 ends the literal with an ellipsis because the body is a verbatim copy of an existing 40-line template — the instruction is to copy it unchanged, which is more reliable than retyping it here and risking a transcription difference.

**Type consistency.** `Finding`, `CheckResult`, `Family`, `Severity`, `finding()`, `tally()` are defined once in Task 1 Step 1 and imported everywhere after. `check` has the same signature in Task 5 where it is declared and in Tasks 6, 7, 8 where it is implemented. `probeNetwork` is the option name in both `checkOrderingLinks`'s definition (Task 4) and all three call sites. `PROBE_LINKS` is declared in Task 5 Step 5 and read in Tasks 6, 7. `checkSum`'s parameter order — `(where, code, parts, whole, warnPct?, errorPct?)` — matches at every call site.

**One ordering note for the executor.** Task 6 Step 2's `checkMealSlot` references `Finding` as a bare type; it is imported in Task 5 Step 1. If you execute Task 6 without Task 5, it will not compile. The tasks are in dependency order — run them in order.
