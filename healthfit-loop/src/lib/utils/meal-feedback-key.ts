/**
 * Identity for a piece of meal feedback.
 *
 * Feedback was originally keyed on `MealOption.id`, a real row in a normalized
 * table. That table is empty and always has been — the generator writes the
 * whole week as JSON into `MealPlan.userContext`, so meals reach the client
 * without an id. Everything downstream of `meal.id` therefore read `undefined`
 * and failed quietly.
 *
 * The replacement is derived from what a meal actually carries: the day, the
 * meal type, and the dish. That is enough to be unique within one user's week,
 * which is the scope the feedback UI operates in.
 */

/** Lowercase, trim, and collapse internal runs of whitespace. */
function normalize(part: string): string {
  return part.trim().toLowerCase().replace(/\s+/g, ' ');
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * The dish name a meal should be remembered by.
 *
 * Restaurant meals carry `dish` plus a `restaurant`; home meals carry `name`.
 * `dishName` and `recipeName` are deliberately not consulted: those are column
 * names on the unused `MealOption` table, and reading them is what made every
 * meal the feedback buttons submitted come through as "Unknown Dish".
 */
export function dishNameOf(meal: unknown): string | null {
  const m = meal as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== 'object') return null;

  const isRestaurant = m.source === 'restaurant' || Boolean(m.restaurant);
  return nonEmptyString(isRestaurant ? m.dish : m.name);
}

/**
 * Stable key for one meal slot. Returns null when any part is missing, so
 * callers can skip the request rather than write a row that collides with
 * every other incomplete meal.
 *
 * Keys are only ever constructed, never parsed, so a dish name containing the
 * separator is harmless — it still produces a distinct string.
 */
export function mealFeedbackKey(
  day: unknown,
  mealType: unknown,
  dishName: unknown
): string | null {
  const d = nonEmptyString(day);
  const t = nonEmptyString(mealType);
  const n = nonEmptyString(dishName);
  if (!d || !t || !n) return null;
  return `${normalize(d)}|${normalize(t)}|${normalize(n)}`;
}

/**
 * Who the feedback belongs to.
 *
 * The old unique constraint was `@@unique([mealOptionId])`. With a cuid minted
 * per meal plan that was incidentally scoped to one user; with a key derived
 * from day and dish it is not — "monday|dinner|kale salad" is the same string
 * for everybody. The owner is part of the constraint so one user's rating
 * cannot overwrite another's.
 *
 * The prefixes keep a user id and a session id with identical text apart.
 */
export function feedbackOwnerKey(
  userId: string | null | undefined,
  sessionId: string | null | undefined
): string {
  const uid = nonEmptyString(userId);
  if (uid) return `user:${uid}`;
  const sid = nonEmptyString(sessionId);
  if (sid) return `session:${sid}`;
  return 'anon';
}
