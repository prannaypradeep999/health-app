import { verdict, type Verdict } from './types';
import { extractIngredientName, normalizeGroceryKey } from '@/lib/utils/grocery-list';

/**
 * Things a recipe names but a shopping list is not wrong to omit. Flagging
 * these buries the real misses — a plan of seven dinners mentions salt and
 * pepper twenty times.
 */
export const PANTRY_STAPLES = new Set([
  'salt', 'pepper', 'black pepper', 'water', 'olive oil', 'oil', 'vegetable oil',
  'cooking spray', 'sugar', 'flour', 'baking powder', 'baking soda', 'vinegar',
  'garlic powder', 'onion powder', 'paprika', 'cumin', 'oregano', 'basil',
  'thyme', 'cinnamon', 'chili powder', 'red pepper flakes', 'bay leaf',
  'soy sauce', 'honey', 'butter', 'ice',
]);

const key = (raw: string) => normalizeGroceryKey(extractIngredientName(String(raw ?? '')));

/**
 * G1/G2: does the grocery list cover the plan it was built from, and does every
 * item on it trace back to a recipe?
 *
 * This is the check most likely to catch the original complaint. "The
 * generation doesn't always give me the full answer" describes a grocery list
 * missing ingredients far better than it describes a wrong macro — and it is
 * verifiable for free against data already in memory.
 */
export function verifyGroceryCoverage(
  recipeIngredients: string[],
  groceryItemNames: string[]
): Verdict[] {
  const out: Verdict[] = [];

  if (recipeIngredients.length === 0) {
    out.push(verdict('G1-ingredient-covered', 'groceries', 'unchecked', '', 'no recipe ingredients to check against'));
    out.push(verdict('G2-item-traced', 'groceries', 'unchecked', '', 'no recipe ingredients to check against'));
    return out;
  }

  const listed = new Set(groceryItemNames.map(key).filter(Boolean));

  // G1: every ingredient the recipes call for should be buyable from the list.
  const seen = new Set<string>();
  for (const raw of recipeIngredients) {
    const k = key(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);

    if (PANTRY_STAPLES.has(k)) {
      out.push(verdict('G1-ingredient-covered', `groceries.${k}`, 'unverified', raw, 'pantry staple; omission is not an error'));
      continue;
    }
    // Containment in either direction: the list says "Chicken Breast" where the
    // recipe said "boneless chicken breast", and both are the same purchase.
    const covered = listed.has(k) || [...listed].some(l => l.includes(k) || k.includes(l));
    out.push(covered
      ? verdict('G1-ingredient-covered', `groceries.${k}`, 'verified', raw, 'present in the grocery list')
      : verdict('G1-ingredient-covered', `groceries.${k}`, 'contradicted', raw, 'no grocery item covers this ingredient'));
  }

  // G2: the reverse. An item traceable to no recipe is either an invented
  // purchase or a sign the list was built from a different plan.
  for (const name of groceryItemNames) {
    const k = key(name);
    if (!k) continue;
    const traced = seen.has(k) || [...seen].some(s => s.includes(k) || k.includes(s));
    if (!traced) {
      out.push(verdict('G2-item-traced', `groceries.${k}`, 'contradicted', name, 'no recipe in the plan uses this item'));
    }
  }

  return out;
}
