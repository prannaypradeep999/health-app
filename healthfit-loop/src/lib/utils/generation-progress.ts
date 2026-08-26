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

/** The parts of "have we given up" that do not depend on which phase it is. */
export interface PhaseProgressInput {
  /** True once the phase has persisted something. */
  phaseComplete: boolean;
  /**
   * The generator itself recorded that it finished empty.
   *
   * Staleness and attempt count are both inferences from silence. This is the
   * phase saying so directly, which it can do the moment it happens: on
   * 2026-08-26 restaurant meal selection timed out and persisted zero meals,
   * and without this the panel would have waited out the full staleness window
   * for a phase that was already over.
   */
  phaseReportedFailure?: boolean;
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
 * True when a generation phase should stop claiming to be in progress.
 *
 * Deliberately returns false while `phaseComplete` is true: a finished phase is
 * never "given up on", regardless of age or attempts. That keeps the caller
 * from having to order its checks correctly.
 */
export function hasGivenUpOnPhase(input: PhaseProgressInput): boolean {
  if (input.phaseComplete) return false;

  // Checked after phaseComplete so a late write still wins over a stale status
  // field, and before the inferences below because it is not an inference.
  if (input.phaseReportedFailure) return true;

  if (input.pollAttempts >= input.maxPollAttempts) return true;

  // A plan we have never seen a timestamp for is treated as live, not stale —
  // otherwise a slow first fetch would render failure before the first poll.
  if (input.planUpdatedAtMs === null) return false;

  return input.nowMs - input.planUpdatedAtMs >= GENERATION_STALE_AFTER_MS;
}

export interface RestaurantProgressInput extends Omit<PhaseProgressInput, 'phaseComplete'> {
  /** True once at least one restaurant meal has been persisted. */
  restaurantMealsGenerated: boolean;
}

/** True when the restaurant phase should stop claiming to be in progress. */
export function hasGivenUpOnRestaurants(input: RestaurantProgressInput): boolean {
  return hasGivenUpOnPhase({ ...input, phaseComplete: input.restaurantMealsGenerated });
}

export interface HomeMealProgressInput extends Omit<PhaseProgressInput, 'phaseComplete'> {
  /** True once at least one home meal has been persisted. */
  homeMealsGenerated: boolean;
}

/**
 * True when the home-meal phase should stop claiming to be in progress.
 *
 * Restaurants got this treatment first because that was the phase observed
 * spinning. The 2026-08-26 run showed home meals can strand the same way and
 * worse: the relay handed off to `generate-home` from inside a `after()` that
 * had seconds of `maxDuration` left, the instance was frozen mid-await, and the
 * phase never started. Nothing wrote to the plan again, so `homeMealsGenerated`
 * stayed false forever and the dashboard showed "Creating home meal..." and an
 * unfinished grocery list against a plan that had already stopped.
 *
 * The handoff is fixed separately; this is the backstop for every other way a
 * phase can fail to arrive.
 */
export function hasGivenUpOnHomeMeals(input: HomeMealProgressInput): boolean {
  return hasGivenUpOnPhase({ ...input, phaseComplete: input.homeMealsGenerated });
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

/**
 * Status values a phase writes about itself before it knows the answer.
 *
 * `pending` is what a generator sets for a phase that has not reported yet. It
 * is a statement about ignorance, so it must never replace a phase's own
 * account of how it went.
 */
const PLACEHOLDER_STATUSES = new Set(['pending', 'unknown', '']);

/**
 * Fields in `userContext.metadata` that belong to one phase and no other.
 *
 * Every generator merges into the same JSON blob, so "spread mine over theirs"
 * is only safe for keys I own. These are the ones I do not.
 */
const FOREIGN_STATUS_KEYS = ['restaurantsStatus', 'homeMealsStatus', 'workoutsStatus'] as const;

/**
 * Merge one generator's metadata into the plan's without overwriting another
 * phase's verdict with a placeholder.
 *
 * `generate-home` built its metadata object with `restaurantsStatus: 'pending'`
 * hardcoded — correct for the legacy path where it creates the plan itself, and
 * wrong for the relay, where the restaurant phase has already run and written a
 * real answer. Spread second, the placeholder won every time. This is not a
 * race: home always runs after restaurants in the relay, so it clobbered the
 * value on every run.
 *
 * Observed on plan cmta7lxql0003js040c5ta846 (2026-08-26): the same object held
 * `generators.restaurants: "completed"` and `metadata.restaurantsStatus:
 * "pending"`, because `generators` was spread-merged key by key and `metadata`
 * was not. `DashboardContainer` reads `restaurantsStatus`, so it kept waiting
 * for a phase that had already finished — and, since the restaurant phase now
 * reports `failed` when it saves nothing, it would have erased that too.
 *
 * A real status still overwrites a real status: the phase that wrote most
 * recently is the one that knows. Only placeholders lose.
 */
export function mergeGenerationMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing ?? {}), ...(incoming ?? {}) };

  for (const key of FOREIGN_STATUS_KEYS) {
    const before = (existing ?? {})[key];
    const after = (incoming ?? {})[key];
    const afterIsPlaceholder =
      after === undefined || (typeof after === 'string' && PLACEHOLDER_STATUSES.has(after));
    if (before !== undefined && afterIsPlaceholder) {
      merged[key] = before;
    }
  }

  return merged;
}
