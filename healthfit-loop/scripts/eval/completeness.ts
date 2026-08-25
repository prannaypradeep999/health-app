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
