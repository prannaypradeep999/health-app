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
