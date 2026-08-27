/**
 * Reading nutrition off a generated meal option, and displaying it.
 *
 * Two problems this module exists to remove.
 *
 * **The field name.** Generated options carry `estimatedCalories` and never
 * `calories` — verified against the six most recent plans in production: 108 of
 * 108 options had `estimatedCalories` only. `calories` is the column name on
 * `MealConsumptionLog`, a different shape entirely. Call sites had drifted into
 * reading the two in whichever order they were written, and because both
 * spellings were tried with `??` or `||` the mistake never surfaced as a crash.
 * There is one accessor here so the precedence can only be decided once.
 *
 * **Totals that disagree with the cards they sum.** A meal card displayed
 * `1154 cal` while the day total moved by a different amount. The cause was not
 * arithmetic — it was that the card and the total resolved *different objects*
 * for the same slot (see `getMealForSlot` in MealPlanPage). The residual
 * cosmetic half is rounding: a total rounded to the nearest 10 cannot equal a
 * sum of unrounded parts. So display rounding happens per option, and totals
 * sum the rounded values. The arithmetic on screen then adds up exactly, which
 * is the property a user actually checks.
 */

/** Round for display. Matches the existing convention in DashboardHome. */
export function roundToNearest10(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 10) * 10;
}

function readNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== 'object') return null;
  const value = (source as Record<string, unknown>)[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Calories as generated, unrounded.
 *
 * `estimatedCalories` is what the generator writes, so it is consulted first.
 * `calories` is accepted as a fallback because consumption-log rows and a few
 * legacy plans use that spelling; a slot carrying both is not a case that
 * occurs in the data.
 */
export function optionCalories(option: unknown): number {
  return readNumber(option, 'estimatedCalories') ?? readNumber(option, 'calories') ?? 0;
}

export type Macro = 'protein' | 'carbs' | 'fat';

/** Grams of a macro as generated, unrounded. */
export function optionMacro(option: unknown, macro: Macro): number {
  const capitalized = `estimated${macro[0].toUpperCase()}${macro.slice(1)}`;
  return readNumber(option, macro) ?? readNumber(option, capitalized) ?? 0;
}

/**
 * Calories as shown to the user.
 *
 * Rounded to the nearest 10 because a generated 1154 reads as false precision —
 * it is an LLM's estimate of a recipe, not a measurement. Totals must be built
 * from this function rather than from `optionCalories`, or they will drift from
 * the cards by a few calories per meal.
 */
export function displayCalories(option: unknown): number {
  return roundToNearest10(optionCalories(option));
}

/** Grams as shown. Macros are small integers, so they are not rounded to 10. */
export function displayMacro(option: unknown, macro: Macro): number {
  return Math.round(optionMacro(option, macro));
}

/**
 * Sum a set of already-resolved options the way the screen displays them.
 *
 * Takes resolved objects rather than a day structure on purpose: choosing
 * *which* option is eaten for a slot is the caller's job, and getting that
 * choice wrong — reading `meals[type].primary` when the card rendered a
 * custom-swapped meal — was the original defect. Keeping the choice out of
 * here means this function cannot reintroduce it.
 */
export function sumDisplayCalories(options: readonly unknown[]): number {
  return options.reduce<number>((total, option) => total + displayCalories(option), 0);
}

export function sumDisplayMacro(options: readonly unknown[], macro: Macro): number {
  return options.reduce<number>((total, option) => total + displayMacro(option, macro), 0);
}
