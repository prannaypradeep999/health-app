/**
 * When to stop waiting for a generation phase that is never going to arrive.
 *
 * The dashboard polls `/api/ai/meals/current` until every phase reports done.
 * Two defects made that poll unbounded, and together they produced a
 * "Finding nearby restaurants..." spinner that ran for hours against a plan
 * whose generation had finished the previous night:
 *
 *   1. `DashboardContainer` reset its poll counter whenever meals and workouts
 *      were both complete. For a plan that finished *without* restaurants that
 *      condition is permanently true, so the 120-attempt cap never fired.
 *   2. `DashboardHome` chose the spinner on `!restaurantMealsGenerated` alone,
 *      with no notion of having given up, so even a stopped poll kept the
 *      bouncing pin on screen.
 *
 * Observed 2026-08-26: plan cmt9ldt760003kw04r2o3cqnh, last written at
 * 04:28:42Z with `restaurantMeals: 0`, was still being polled every 3s at
 * 21:54Z — roughly 17 hours and ~20,000 requests after the work had stopped.
 *
 * These are pure functions so they can be tested without React or Prisma.
 */

/**
 * Generation is a background job, not a request the user is waiting on, so the
 * bound is wall-clock rather than attempt count: a plan whose last write was
 * this long ago is finished, whatever its phase flags claim. Ten minutes is
 * comfortably past the worst observed end-to-end run (the relay gives each hop
 * its own 60s function, and the whole chain has never exceeded ~4 minutes).
 */
export const GENERATION_STALE_AFTER_MS = 10 * 60 * 1000;

export interface RestaurantProgressInput {
  /** True once at least one restaurant meal has been persisted. */
  restaurantMealsGenerated: boolean;
  /** `updatedAt` of the meal plan, in ms. Null when not yet known. */
  planUpdatedAtMs: number | null;
  /** Poll ticks spent on this plan. */
  pollAttempts: number;
  /** Ceiling on `pollAttempts`. */
  maxPollAttempts: number;
  /** Current time in ms; injected so tests need no clock control. */
  nowMs: number;
}

/**
 * True when the restaurant phase should stop claiming to be in progress.
 *
 * Deliberately returns false while `restaurantMealsGenerated` is true: a
 * finished phase is never "given up on", regardless of age or attempts. That
 * keeps the caller from having to order its checks correctly.
 */
export function hasGivenUpOnRestaurants(input: RestaurantProgressInput): boolean {
  if (input.restaurantMealsGenerated) return false;

  if (input.pollAttempts >= input.maxPollAttempts) return true;

  // A plan we have never seen a timestamp for is treated as live, not stale —
  // otherwise a slow first fetch would render failure before the first poll.
  if (input.planUpdatedAtMs === null) return false;

  return input.nowMs - input.planUpdatedAtMs >= GENERATION_STALE_AFTER_MS;
}

/**
 * Whether the poll counter may be reset to zero.
 *
 * The counter exists to bound the poll. Resetting it on partial progress is
 * what let the loop run forever, so a reset is only safe when every phase the
 * loop waits on has actually completed.
 */
export function canResetPollCounter(status: {
  mealsGenerated: boolean;
  workoutsGenerated: boolean;
  restaurantMealsGenerated: boolean;
}): boolean {
  return status.mealsGenerated && status.workoutsGenerated && status.restaurantMealsGenerated;
}
