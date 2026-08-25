// Kept out of pexels-client so the liveness script and the tests can read them
// without pulling in the Prisma client.

export const FOOD_FALLBACKS: Record<string, string> = {
  'breakfast': 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400&h=300&fit=crop',
  'lunch': 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=300&fit=crop',
  'dinner': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
  'default': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop'
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
