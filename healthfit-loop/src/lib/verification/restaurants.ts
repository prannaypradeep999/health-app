import { verdict, type Verdict } from './types';
import type { SearchItem } from './receipt';
import type { RestaurantFacts } from '@/lib/utils/restaurant-facts';

export interface MealClaim {
  restaurant: string;
  dish: string;
  price: number;
  estimatedCalories: number;
  address: string;
}

const ARTICLES = /\b(the|a|an|with|and|of)\b/g;

export function normalizeDishName(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(ARTICLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Containment, not equality and not token-overlap scoring.
 *
 * Hops 2 and 3 shorten names — "Grilled Chicken Shawarma Plate" becomes
 * "Chicken Shawarma" — so equality would flag honest rewording as fabrication.
 * Overlap scoring would need a threshold nobody can defend. Containment in
 * either direction is the narrowest rule that tolerates shortening while still
 * catching a dish the menu never listed.
 */
export function matchDish(dish: string, items: SearchItem[]): SearchItem | null {
  const d = normalizeDishName(dish);
  if (!d) return null;
  for (const item of items) {
    const n = normalizeDishName(item.name);
    if (!n) continue;
    if (n === d || n.includes(d) || d.includes(n)) return item;
  }
  return null;
}

/** Published calories and a model's estimate of them are not expected to agree exactly. */
const CALORIE_TOLERANCE = 0.15;
/** Prices are printed on a menu. A cent of drift is a different price. */
const PRICE_TOLERANCE = 0.01;

export function verifyRestaurantMeal(
  target: string,
  meal: MealClaim,
  items: SearchItem[] | undefined,
  facts: RestaurantFacts | undefined
): Verdict[] {
  const out: Verdict[] = [];

  // R4 is not a check. It is a standing admission: no upstream source — not
  // Sonar, not Places — supplies per-dish protein, carbs or fat, so every one
  // of those numbers is a model estimate. It exists so the UI has something to
  // hang an "est." label on.
  out.push(verdict(
    'R4-macros-estimated', `${target}.macros`, 'unverified',
    'protein/carbs/fat', 'no upstream source publishes per-dish macros'
  ));

  if (!items) {
    for (const check of ['R1-dish-exists', 'R2-price-matches', 'R3-calories-match']) {
      out.push(verdict(check, target, 'unchecked', String(meal.dish), 'hop-1 menu payload unavailable'));
    }
  } else {
    const match = matchDish(meal.dish, items);
    if (!match) {
      out.push(verdict(
        'R1-dish-exists', `${target}.dish`, 'contradicted', meal.dish,
        `not among the ${items.length} items the menu search returned`
      ));
      // Price and calories cannot be checked against an item we could not find.
      out.push(verdict('R2-price-matches', `${target}.price`, 'unchecked', String(meal.price), 'no matching menu item'));
      out.push(verdict('R3-calories-match', `${target}.estimatedCalories`, 'unchecked', String(meal.estimatedCalories), 'no matching menu item'));
    } else {
      out.push(verdict('R1-dish-exists', `${target}.dish`, 'verified', meal.dish, `menu listed "${match.name}"`, match.sourceUrl));

      if (match.price === null) {
        // MenuSearchSchema: "Null when the menu did not publish it." The price
        // shown is therefore an estimate, and saying so is the honest verdict.
        out.push(verdict('R2-price-matches', `${target}.price`, 'unverified', String(meal.price), 'the menu did not publish a price', match.sourceUrl));
      } else if (Math.abs(match.price - meal.price) <= PRICE_TOLERANCE) {
        out.push(verdict('R2-price-matches', `${target}.price`, 'verified', String(meal.price), `menu listed ${match.price}`, match.sourceUrl));
      } else {
        out.push(verdict('R2-price-matches', `${target}.price`, 'contradicted', String(meal.price), `menu listed ${match.price}`, match.sourceUrl));
      }

      if (match.statedCalories === null) {
        out.push(verdict('R3-calories-match', `${target}.estimatedCalories`, 'unverified', String(meal.estimatedCalories), 'the menu did not publish calories', match.sourceUrl));
      } else {
        const drift = Math.abs(match.statedCalories - meal.estimatedCalories) / match.statedCalories;
        out.push(verdict(
          'R3-calories-match', `${target}.estimatedCalories`,
          drift <= CALORIE_TOLERANCE ? 'verified' : 'contradicted',
          String(meal.estimatedCalories), `menu stated ${match.statedCalories}`, match.sourceUrl
        ));
      }
    }
  }

  // Places holds the address. A model asked for a fact we already have turns a
  // correct value into a wrong one — the same failure grocery.ts documents for
  // store addresses.
  if (!facts || !facts.address) {
    out.push(verdict('R7-restaurant-identity', `${target}.address`, 'unchecked', meal.address, 'no Places record for this restaurant'));
  } else {
    const same = normalizeDishName(facts.address) === normalizeDishName(meal.address);
    out.push(verdict(
      'R7-restaurant-identity', `${target}.address`,
      same ? 'verified' : 'contradicted',
      meal.address, `Places has "${facts.address}"`
    ));
  }

  return out;
}
