// Kept out of pexels-client so the liveness script and the tests can read them
// without pulling in the Prisma client.

export const FOOD_FALLBACKS: Record<string, string> = {
  'breakfast': 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400&h=300&fit=crop',
  'lunch': 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=300&fit=crop',
  'dinner': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
  'default': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop'
};

/**
 * Restaurant meals never call Pexels at all — `getFoodImage` is only wired into
 * the home-meal route — so every one of them fell through to a single Unsplash
 * URL hardcoded inline in the JSX. A week of fourteen restaurant meals showed
 * the same photograph fourteen times, which reads as broken software.
 *
 * Cuisine is the right key because it is the one category the pipeline already
 * carries on every restaurant meal, and it is a closed vocabulary: these keys
 * are the survey's own cuisine options, lowercased. Per-dish accuracy is not
 * achievable this way and is not the goal — the goal is that a week does not
 * look like one repeated image.
 *
 * Every URL here was verified live over HTTP before being committed. IDs are
 * distinct on purpose: sharing one between two keys means a single dead photo
 * takes out both paths, which has already happened once in WORKOUT_FALLBACKS.
 */
export const CUISINE_FALLBACKS: Record<string, string> = {
  'mediterranean': 'https://images.unsplash.com/photo-1544510808-91bcbee1df55?w=400&h=300&fit=crop',
  'italian': 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400&h=300&fit=crop',
  'mexican': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop',
  'chinese': 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&h=300&fit=crop',
  'japanese': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&h=300&fit=crop',
  'thai': 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400&h=300&fit=crop',
  'indian': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=300&fit=crop',
  'middle eastern': 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&h=300&fit=crop',
  'american': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
  'korean': 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=400&h=300&fit=crop',
  'vietnamese': 'https://images.unsplash.com/photo-1503764654157-72d979d9af2f?w=400&h=300&fit=crop',
  'greek': 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?w=400&h=300&fit=crop',
  'french': 'https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400&h=300&fit=crop',
  'spanish': 'https://images.unsplash.com/photo-1515443961218-a51367888e4b?w=400&h=300&fit=crop',
  'vegan': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop',
  'seafood': 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=300&fit=crop',
  // The catch-all is a restaurant table rather than a dish, because at this
  // point we know the meal is eaten out and nothing more.
  'default': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop'
};

export const WORKOUT_FALLBACKS: Record<string, string> = {
  'chest': 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
  'back': 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=400&h=300&fit=crop',
  'legs': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=300&fit=crop',
  'arms': 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&h=300&fit=crop',
  'shoulders': 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400&h=300&fit=crop',
  'core': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop',
  // Distinct from 'chest' on purpose. They shared one photo ID, so when that ID
  // died it took out both the muscle-specific and the catch-all path at once.
  'full body': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=300&fit=crop',
  'default': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=300&fit=crop'
};

/**
 * The key is model-supplied, so a plain index would let "constructor" return a
 * function where the caller expects a URL string.
 */
export function pickFallback(map: Record<string, string>, key?: string | null): string {
  return (typeof key === 'string' && Object.hasOwn(map, key) && map[key]) || map.default;
}

/**
 * The image to render for one meal card.
 *
 * This existed in four places as four different hardcoded Unsplash URLs written
 * inline in JSX — two in MealPlanPage, two in DashboardHome. None of them was
 * in this file, so `scripts/check-fallback-images.ts` never checked them and a
 * dead photo ID would have gone unnoticed until a user saw a broken image.
 *
 * Order matters: a real fetched photo beats a category guess, and a category
 * guess beats a generic one. Restaurant meals have no fetched photo at all, so
 * for them the cuisine branch is the whole story.
 */
export function mealImageUrl(meal: unknown, mealType?: string | null): string {
  const m = meal as any;
  const fetched = m?.imageUrl || m?.image;
  if (typeof fetched === 'string' && fetched.trim()) return fetched;

  // `source` is the envelope's own field; restaurant meals also always carry a
  // `restaurant` name, which is the older signal and still worth honouring.
  const isRestaurant = m?.source === 'restaurant' || Boolean(m?.restaurant);
  if (isRestaurant) {
    return pickFallback(CUISINE_FALLBACKS, normalizeCuisineKey(m?.cuisine));
  }

  return pickFallback(FOOD_FALLBACKS, typeof mealType === 'string' ? mealType.toLowerCase() : null);
}

/**
 * Cuisines arrive from the model and from Places, so casing and stray whitespace
 * both vary. Lowercasing is enough to hit the keys above, which are the survey's
 * options lowercased.
 */
export function normalizeCuisineKey(cuisine: unknown): string | null {
  if (typeof cuisine !== 'string') return null;
  const trimmed = cuisine.trim().toLowerCase();
  return trimmed || null;
}

export const FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A fallback is a record that Pexels had nothing that minute, not that the dish
 * has no photo. Cached without expiry it meant one timeout permanently assigned
 * a generic stock image, and the cache hit prevented the retry that would have
 * fixed it. Real Pexels results do not expire — those are answers, not misses.
 */
export function isFallbackStale(
  cached: { imageSource: string | null; updatedAt: Date | null }
): boolean {
  if (cached.imageSource !== 'fallback') return false;
  if (!cached.updatedAt) return true;
  return Date.now() - cached.updatedAt.getTime() > FALLBACK_TTL_MS;
}
