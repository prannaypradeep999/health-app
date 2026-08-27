/**
 * Reading a combined restaurant order back apart.
 *
 * Rule 5 of the restaurant prompt tells the model to combine 2-3 menu items
 * into one order when no single plate reaches the calorie target, joined with
 * " + ". It never said the items had to be *different*, and for a large target
 * the cheapest way to satisfy the arithmetic is to order the same plate again.
 *
 * Measured on plan cmtblvky60001k204ys6mdkp0 (2026-08-27), a MUSCLE_GAIN user at
 * 3254 cal/day with a 1302 cal dinner target: 17 of 28 options repeated an item,
 * including "Mighty Kale Salad + Mighty Kale Salad + Mighty Kale Salad" at $49
 * and "Greek Gemista + Greek Gemista + Moussaka Vegetarian" at $96. The
 * description of one said so outright: "Two portions of layered vegetarian
 * moussaka."
 *
 * Two things are wrong with that and only one is the price. Nobody orders three
 * identical kale salads; seeing it offered is the moment a user stops trusting
 * the plan. The nutrition arithmetic is perfectly correct, which is why nothing
 * downstream caught it.
 */

/** How the prompt is told to join combined items. Kept here so the split and
 *  the instruction cannot drift apart. */
export const DISH_JOINER = ' + ';

/**
 * The individual menu items in a combined dish string.
 *
 * Returns [] rather than [''] for empty input: callers count these, and a
 * phantom item would report a one-item order for a meal that has no dish.
 */
export function dishComponents(dish: unknown): string[] {
  if (typeof dish !== 'string') return [];
  return dish
    .split('+')
    .map(part => part.trim())
    .filter(part => part.length > 0);
}

/** Case- and spacing-insensitive, because the model is not consistent about
 *  either and "Mighty Kale Salad" vs "mighty kale salad" is the same order. */
function normalize(item: string): string {
  return item.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The items that appear more than once in a single order, each reported once.
 *
 * Empty array means the order is fine. This is deliberately a list rather than
 * a boolean so the log can name the offending item — "repeats Mighty Kale
 * Salad" is actionable, "has a repeat" is not.
 */
export function repeatedComponents(dish: unknown): string[] {
  const seen = new Map<string, number>();
  for (const item of dishComponents(dish)) {
    const key = normalize(item);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const repeats: string[] = [];
  for (const item of dishComponents(dish)) {
    const key = normalize(item);
    if ((seen.get(key) ?? 0) > 1 && !repeats.includes(item)) repeats.push(item);
  }
  return repeats;
}

/** Whether this order asks for the same menu item more than once. */
export function hasRepeatedComponent(dish: unknown): boolean {
  return repeatedComponents(dish).length > 0;
}

/**
 * Collapse repeats, preserving order and the first spelling seen.
 *
 * Deliberately NOT used to rewrite meals: dropping a duplicated portion makes
 * the stated calories and price wrong, and a plan that under-reports what it
 * costs is a worse defect than one that suggests too much food. This exists for
 * reporting — counting how many distinct items an order really has.
 */
export function distinctComponents(dish: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of dishComponents(dish)) {
    const key = normalize(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
