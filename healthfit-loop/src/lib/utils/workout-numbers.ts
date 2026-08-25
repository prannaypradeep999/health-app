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

// Matches MIN_EXERCISES in workout-validator.ts, deliberately not imported: that
// one is a warning threshold and this one a display threshold, and coupling them
// means a change to either silently changes the other.
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
