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
