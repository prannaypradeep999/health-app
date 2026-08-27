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
