import type { Restaurant } from '@/lib/external/places-client';

export interface RestaurantFacts {
  rating: number | null;
  userRatingsTotal: number | null;
  distanceMiles: number | null;
  address: string | null;
  /** From Places `formatted_phone_number`. Gates the card's Call button. */
  phone: string | null;
}

/**
 * Places-sourced facts, keyed by lowercased restaurant name, carried alongside
 * the model-authored meal objects rather than on them. Putting a rating on a
 * model output would ask the model to invent one.
 *
 * null means "we do not know", and the UI renders nothing. It never means zero.
 */
export function buildRestaurantFacts(
  restaurants: Array<Partial<Restaurant> & { distanceMiles?: number }>
): Record<string, RestaurantFacts> {
  const out: Record<string, RestaurantFacts> = {};
  restaurants.forEach(r => {
    const name = r?.name?.toLowerCase().trim();
    if (!name) return;
    out[name] = {
      rating: typeof r.rating === 'number' && r.rating > 0 ? r.rating : null,
      userRatingsTotal:
        typeof r.userRatingsTotal === 'number' && r.userRatingsTotal > 0 ? r.userRatingsTotal : null,
      distanceMiles: typeof r.distanceMiles === 'number' ? r.distanceMiles : null,
      address: r.address || null,
      // Places names it phoneNumber; the card reads `phone`. Trimmed to a real
      // null so `restaurant.phone &&` cannot open a tel: link to whitespace.
      phone: typeof r.phoneNumber === 'string' && r.phoneNumber.trim() ? r.phoneNumber.trim() : null,
    };
  });
  return out;
}

/**
 * The distinct cuisines of the restaurant meals actually chosen for the week.
 *
 * Written to `metadata.cuisines`, which the Restaurants tab badge renders. The
 * survey's `preferredCuisines` is the tempting source and the wrong one: it is
 * what the user asked for, not what the week contains, so a preference nothing
 * matched would still appear on the badge. Deriving from the selection means
 * the badge can only name a cuisine that is on the screen below it.
 *
 * Returns [] when nothing is known, and the caller must check length — an empty
 * array is truthy, which is exactly the bug that made the badge render as the
 * bare word "cuisines".
 */
export function uniqueSelectedCuisines(meals: unknown): string[] {
  if (!Array.isArray(meals)) return [];
  const seen = new Map<string, string>();
  for (const meal of meals) {
    const raw = (meal as any)?.primary?.cuisine ?? (meal as any)?.cuisine;
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Dedupe case-insensitively but keep the first spelling seen, so the badge
    // shows "Mediterranean" rather than a lowercased key.
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()];
}
