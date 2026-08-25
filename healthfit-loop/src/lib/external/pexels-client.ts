import { prisma } from '@/lib/db';
import { withPexelsRetry, HttpError } from '@/lib/utils/retry';
import { createLimiter } from '@/lib/utils/concurrency';
import { routeRemainingMs } from '@/lib/utils/route-budget';
import { FOOD_FALLBACKS, WORKOUT_FALLBACKS, isFallbackStale, pickFallback } from './fallback-images';

/**
 * Process-wide, deliberately not per-instance: Pexels counts concurrent
 * connections per client, so a limiter scoped to one PexelsClient would still
 * let two callers collide. Every image request in the process funnels through
 * this one gate.
 *
 * Both numbers come from measurement, not taste — see `lib/utils/concurrency.ts`.
 * Concurrency 2 keeps us clear of the connection-queue tarpit that produced
 * blanket 20s timeouts, and the 350ms pacing (~3 requests/sec) keeps us under
 * the separate short-window throttle that returns "Throttle limit exceeded".
 * Unpaced, concurrency 2 alone still drew 429s on 14 of 20 requests.
 */
const pexelsLimit = createLimiter(2, 350);

/**
 * Throttle circuit breaker.
 *
 * Measured 2026-08-18: even at concurrency 2 with 350ms pacing, Pexels allowed
 * roughly 8 requests and then answered 429 to the remaining 52 of 60. The
 * account's sustained allowance is simply below what a cold generation wants
 * (~50 uncached images), so being throttled partway through a run is the
 * normal case, not an anomaly.
 *
 * Once throttled, continuing to ask is strictly worse than not asking: the
 * image is not coming either way, but each attempt spends part of the route's
 * 60s budget. That is how one run reached `POST /api/ai/workouts/generate 200
 * in 4.3min`. Tripping the breaker turns a slow failure into an instant one
 * and lets the static fallback image render immediately.
 */
const THROTTLE_COOLDOWN_MS = 60_000;
let throttledUntil = 0;

function openThrottleBreaker(cooldownMs: number) {
  const until = Date.now() + cooldownMs;
  if (until <= throttledUntil) return;
  throttledUntil = until;
  console.warn(
    `[PEXELS] ⚠️ Throttled by Pexels — serving fallback images for the next ${Math.round(cooldownMs / 1000)}s`
  );
}

/**
 * A search needs roughly 2s to be worth starting: one request plus the caller's
 * own handling. Below that we would spend the route's last moments on a call we
 * cannot finish, and the write to Prisma is what actually has to happen.
 *
 * Returns false outside a route budget (scripts, background jobs), so nothing
 * off the request path changes behaviour.
 */
const MIN_MS_TO_START_A_SEARCH = 2_000;

function isOutOfRouteTime(): boolean {
  const remaining = routeRemainingMs();
  return remaining !== null && remaining < MIN_MS_TO_START_A_SEARCH;
}

/**
 * Simple normalization for cache keys - the AI will handle the smart categorization
 * This just creates consistent keys for exact matches and simple variations
 */
export function normalizeDishName(dishName: string): string {
  return dishName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim();
}

/**
 * Normalize exercise names for workout image caching
 * Example: "Push-ups" → "push_ups_exercise"
 */
export function normalizeExerciseName(exerciseName: string): string {
  return exerciseName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim() + '_exercise';
}

/**
 * Rejects strings that are prose rather than a search term.
 *
 * The generation routes sometimes put an explanation where a name belongs —
 * the 2026-08-18 run searched Pexels for "The supplied reference table does not
 * include cottage cheese, apples, flour, milk, or pancake ingredients, so exact
 * nutrition cannot be calculated." A sentence like that cannot match a stock
 * photo, so spending a round trip on it is pure waste. Skipping it here just
 * drops the rung; the generic fallback still yields an image. The upstream
 * field is the real bug and is not fixed by this guard.
 */
function usableQuery(text?: string | null): text is string {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  if (trimmed.split(/\s+/).length > 8) return false;
  // A terminal period is the giveaway for a sentence; dish names don't have one.
  if (/[.!?]$/.test(trimmed)) return false;
  return true;
}

/**
 * Dietary and nutritional descriptors that no image search can match, because
 * they describe what a dish does not contain or how it performs rather than
 * what it looks like. Photos are indexed by visible subject.
 *
 * Anything hyphenated with "free" is caught by pattern, so this list only needs
 * the terms that do not follow that shape.
 */
const NON_VISUAL_TERMS = new Set([
  'high', 'low', 'rich', 'protein', 'high-protein', 'low-carb', 'lowcarb',
  'carb', 'carbs', 'fiber', 'fibre', 'fiber-rich', 'calorie', 'calories',
  'lowcalorie', 'low-calorie', 'macro', 'macros', 'balanced', 'lean',
  'vegan', 'vegetarian', 'pescatarian', 'keto', 'ketogenic', 'paleo',
  'halal', 'kosher', 'coeliac', 'celiac', 'diet', 'dietary',
  'healthy', 'nutritious', 'wholesome', 'clean', 'light',
  'quick', 'easy', 'simple', 'budget', 'cheap', 'meal', 'prep', 'mealprep',
  'one-pot', 'onepot', 'batch', 'leftover', 'friendly', 'boost', 'boosted',
  'gain', 'loss', 'muscle', 'recovery', 'postworkout', 'post-workout',
  'preworkout', 'pre-workout', 'gluten', 'dairy', 'nut', 'peanut', 'soy',
]);

/**
 * Keeps only the words in `terms` that could plausibly appear in a photograph.
 * Returns undefined when nothing survives, so the caller can skip the rung
 * instead of searching for an empty string.
 */
function stripNonVisualTerms(terms?: string | null): string | undefined {
  if (!terms) return undefined;

  const kept = terms
    .split(/[\s,]+/)
    .map(w => w.trim().toLowerCase().replace(/^[^a-z]+|[^a-z-]+$/g, ''))
    .filter(w => w.length > 2)
    // "gluten-free", "nut-free", "sugar-free" — the whole family, by shape.
    .filter(w => !/-?free$/.test(w))
    .filter(w => !NON_VISUAL_TERMS.has(w));

  if (kept.length === 0) return undefined;
  // Three words is plenty for an image search and keeps us inside usableQuery.
  return kept.slice(0, 3).join(' ');
}

/** Drops nulls and duplicates while preserving ladder order. */
function dedupeQueries(candidates: Array<string | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const key = c.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c.trim());
  }
  return out;
}

export interface FoodImageResult {
  imageUrl: string;
  imageSource: 'pexels' | 'cached' | 'fallback';
  searchQuery: string;
  cached: boolean;
}

export interface WorkoutImageResult {
  imageUrl: string;
  imageSource: 'pexels' | 'cached' | 'fallback';
  searchQuery: string;
  cached: boolean;
}

/**
 * Enhanced Pexels API client with smart caching and fallback strategies
 */
export class PexelsClient {
  private apiKey: string;
  private baseUrl = 'https://api.pexels.com/v1/search';

  constructor() {
    this.apiKey = process.env.PEXELS_API_KEY!;
    if (!this.apiKey) {
      throw new Error('PEXELS_API_KEY environment variable is required');
    }
  }

  /**
   * Gets food image with simple caching - AI provides the smart categorization
   */
  async getFoodImage(
    dishName: string,
    options: {
      cuisineType?: string;
      mealType?: string;
      searchTerms?: string; // AI-generated optimal search terms
      description?: string;
    } = {}
  ): Promise<FoodImageResult> {
    const { cuisineType, mealType, searchTerms, description } = options;
    const normalizedKey = normalizeDishName(dishName);

    // Removed verbose logging for production

    // Try cache first
    try {
      const cached = await prisma.foodImage.findUnique({
        where: { normalizedKey }
      });

      if (cached && !isFallbackStale(cached)) {
        // Cache hit - removed verbose logging

        // Update cache usage stats. updatedAt is passed through unchanged so it
        // keeps meaning "when imageUrl was last written" — @updatedAt would
        // otherwise bump it on every read, and a popular fallback would never
        // reach its TTL.
        await prisma.foodImage.update({
          where: { id: cached.id },
          data: {
            hitCount: { increment: 1 },
            lastUsed: new Date(),
            updatedAt: cached.updatedAt
          }
        });

        return {
          imageUrl: cached.imageUrl,
          imageSource: cached.imageSource as 'pexels' | 'cached' | 'fallback',
          searchQuery: cached.searchQuery,
          cached: true
        };
      }

      if (cached) {
        console.log(`[PEXELS] ♻️ Fallback for "${normalizedKey}" is stale, retrying Pexels`);
      }
    } catch (error) {
      console.error('[PEXELS] Cache lookup error:', error);
    }

    // Cache miss - fetching from API

    // Build search queries - prefer AI-generated search terms, then fallback to simple approaches
    const searchQueries = this.buildSearchQueries(dishName, cuisineType, mealType, searchTerms);

    // Try each search query until we get a result
    for (const searchQuery of searchQueries) {
      try {
        const imageUrl = await this.searchPexels(searchQuery);

        if (imageUrl) {
          // Found image - removed verbose logging

          // Cache the result using upsert to handle unique constraint conflicts
          try {
            await prisma.foodImage.upsert({
              where: { normalizedKey },
              update: {
                imageUrl,
                searchQuery,
                hitCount: { increment: 1 },
                lastUsed: new Date()
              },
              create: {
                normalizedKey,
                originalDishName: dishName,
                searchQuery,
                imageUrl,
                imageSource: 'pexels',
                cuisineType,
                mealType,
                dishCategory: searchTerms ? 'ai_categorized' : null
              }
            });
            // Successfully cached image
          } catch (cacheError) {
            console.error('[PEXELS] Failed to cache image:', cacheError);
          }

          return {
            imageUrl,
            imageSource: 'pexels',
            searchQuery,
            cached: false
          };
        }
      } catch (error) {
        console.error(`[PEXELS] Error with query "${searchQuery}":`, error);
        continue;
      }
    }

    // Ultimate fallback - use a generic food image
    // No images found, using fallback
    const fallbackUrl = this.getFallbackImage(mealType);

    // Cache the fallback too to avoid repeated API calls
    try {
      await prisma.foodImage.upsert({
        where: { normalizedKey },
        update: {
          imageUrl: fallbackUrl,
          searchQuery: 'fallback',
          hitCount: { increment: 1 },
          lastUsed: new Date()
        },
        create: {
          normalizedKey,
          originalDishName: dishName,
          searchQuery: 'fallback',
          imageUrl: fallbackUrl,
          imageSource: 'fallback',
          cuisineType,
          mealType,
          dishCategory: 'fallback'
        }
      });
    } catch (cacheError) {
      console.error('[PEXELS] Failed to cache fallback:', cacheError);
    }

    return {
      imageUrl: fallbackUrl,
      imageSource: 'fallback',
      searchQuery: 'fallback',
      cached: false
    };
  }

  /**
   * Builds search queries - AI provides smart terms, we add simple fallbacks
   */
  private buildSearchQueries(
    dishName: string,
    cuisineType?: string | null,
    mealType?: string | null,
    aiSearchTerms?: string
  ): string[] {
    // Each rung of this ladder is a full network round trip, so the ladder is
    // three rungs, not nine. The old tail ("healthy food", "delicious food",
    // first-word-of-dish) never returned anything the rung above it wouldn't
    // have — it just spent the latency budget proving that again per dish.
    //
    // The dish name leads. It used to be second, behind the model's tags, and
    // those tags are dietary rather than visual: the 2026-08-19 run spent its
    // first — and, once the budget ran down, only — request per dish on
    // "high-protein vegetarian peanut-free food", "high-protein fiber-rich
    // peanut-free food", "high-protein one-pot peanut-free food". A stock photo
    // library indexes what a picture shows, and nothing shows peanut-freeness.
    // Those queries could not have matched at any budget; they were spending the
    // one affordable round trip to prove it, and the dish name — the one term
    // that describes a photographable object — never got asked.
    const cleanedTerms = stripNonVisualTerms(aiSearchTerms);

    const queries = dedupeQueries([
      // Primary: the dish itself. Cuisine sharpens it when we have it.
      usableQuery(dishName)
        ? (cuisineType ? `${dishName} ${cuisineType} food` : `${dishName} food`)
        : null,
      // Secondary: the model's terms, minus anything a camera cannot capture.
      // Skipped entirely when nothing visual survives the filter, rather than
      // spending a request on the leftovers.
      usableQuery(cleanedTerms) ? `${cleanedTerms} food` : null,
      // Final: a generic that always resolves, so a miss still yields an image.
      mealType ? `${mealType} food` : 'healthy food',
    ]);

    console.log(`[PEXELS] Search strategy for "${dishName}":`, queries);
    return queries;
  }

  /**
   * Makes actual API call to Pexels with retry logic
   */
  private async searchPexels(query: string): Promise<string | null> {
    // The limiter wraps the retry helper rather than sitting inside it, so the
    // 20s attempt timer starts only once this request owns a slot. Inverting
    // the two makes queue depth look like vendor latency and every request
    // past the front of the queue "times out" without ever being sent.
    if (throttledUntil > Date.now()) {
      // Already known-throttled. Returning null costs nothing and lets the
      // caller fall back to a static image; issuing the request instead would
      // buy another 429 and, worse, another slice of the route's time budget.
      return null;
    }

    // Images are the most disposable thing any route produces — every caller
    // falls back to a static image — so they are the first thing to drop when
    // the route is out of time.
    //
    // Checked twice, and the second check is the one that matters. On the
    // 2026-08-19 run `generate-home` finished in 83s, past the 60s Vercel
    // ceiling, with ~25s of that inside the image phase *after* the budget was
    // already spent. Clamping the phase's own ceiling did not help: the cost
    // was not the requests, it was `pexelsLimit(2, 350ms)` pacing the queue.
    // A refused call still has to reach the front of that queue to be refused.
    // So: the pre-check stops new work being enqueued, and the post-slot check
    // catches whatever was already waiting when the budget ran out.
    if (isOutOfRouteTime()) {
      return null;
    }

    const pexelsResult = await pexelsLimit(async () => {
      if (isOutOfRouteTime()) return null;
      return withPexelsRetry(async (signal) => {
      const response = await fetch(`${this.baseUrl}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, {
        headers: {
          'Authorization': this.apiKey
        },
        signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Honour Retry-After when Pexels sends one; its throttle responses
          // usually omit it, so fall back to a fixed cooldown.
          const retryAfter = Number(response.headers.get('retry-after'));
          const cooldownMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : THROTTLE_COOLDOWN_MS;
          openThrottleBreaker(cooldownMs);
        }
        throw new HttpError(response.status, `Pexels API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.photos && data.photos.length > 0) {
        return data.photos[0].src.large;
      }

      return null;
    }, `Pexels image search: "${query}"`);
    });

    // Null only when the budget ran out while this search sat in the queue.
    // Not an error, and deliberately not logged as one — a spent budget is an
    // expected outcome, and 84 lines of it would bury the real failures.
    if (pexelsResult === null) return null;

    if (!pexelsResult.success) {
      // The breaker used to open only on an explicit 429, which missed the
      // failure mode that actually cost us the 4.3min run. Pexels tarpits
      // excess connections rather than rejecting them: the request never gets
      // a socket, so it never returns a status and surfaces only as our own
      // abort timer. Those runs looked healthy to the breaker while every
      // remaining search still paid the full 25s retry budget. A timeout is
      // throttling until proven otherwise — treat it as one.
      if (/timed out/i.test(pexelsResult.error || '')) {
        openThrottleBreaker(THROTTLE_COOLDOWN_MS);
      }
      console.error(`[PEXELS] API error for query "${query}" after retries:`, pexelsResult.error);
      return null;
    }

    return pexelsResult.data;
  }

  /**
   * Gets workout image with smart caching and exercise-specific queries
   */
  async getWorkoutImage(
    exerciseName: string,
    options: {
      muscleGroup?: string;
      equipmentType?: string;
      difficulty?: string;
      searchTerms?: string;
    } = {}
  ): Promise<WorkoutImageResult> {
    const { muscleGroup, equipmentType, difficulty, searchTerms } = options;
    const normalizedKey = normalizeExerciseName(exerciseName);

    console.log(`[PEXELS] Getting workout image for "${exerciseName}" → normalized: "${normalizedKey}"`);

    // Try cache first
    try {
      const cached = await prisma.workoutImage.findUnique({
        where: { normalizedKey }
      });

      if (cached && !isFallbackStale(cached)) {
        console.log(`[PEXELS] ✅ Cache hit for workout "${normalizedKey}"`);

        // See the food path: updatedAt is preserved so a read cannot reset the
        // fallback TTL.
        await prisma.workoutImage.update({
          where: { id: cached.id },
          data: {
            hitCount: { increment: 1 },
            lastUsed: new Date(),
            updatedAt: cached.updatedAt
          }
        });

        return {
          imageUrl: cached.imageUrl,
          imageSource: cached.imageSource as 'pexels' | 'cached' | 'fallback',
          searchQuery: cached.searchQuery,
          cached: true
        };
      }

      if (cached) {
        console.log(`[PEXELS] ♻️ Fallback for workout "${normalizedKey}" is stale, retrying Pexels`);
      }
    } catch (error) {
      console.error('[PEXELS] Workout cache lookup error:', error);
    }

    console.log(`[PEXELS] 🔍 Cache miss for workout "${normalizedKey}", fetching from API...`);

    // Build workout-specific search queries
    const searchQueries = this.buildWorkoutSearchQueries(exerciseName, muscleGroup, equipmentType, searchTerms);

    // Try each search query until we get a result
    for (const searchQuery of searchQueries) {
      try {
        const imageUrl = await this.searchPexels(searchQuery);

        if (imageUrl) {
          console.log(`[PEXELS] ✅ Found workout image with query: "${searchQuery}"`);

          // Cache the result in WorkoutImage table using upsert
          try {
            await prisma.workoutImage.upsert({
              where: { normalizedKey },
              update: {
                imageUrl,
                searchQuery,
                hitCount: { increment: 1 },
                lastUsed: new Date()
              },
              create: {
                normalizedKey,
                originalExerciseName: exerciseName,
                searchQuery,
                imageUrl,
                imageSource: 'pexels',
                muscleGroup,
                equipmentType,
                exerciseCategory: searchTerms ? 'ai_categorized' : null
              }
            });
            console.log(`[PEXELS] 💾 Cached workout image for "${normalizedKey}"`);
          } catch (cacheError) {
            console.error('[PEXELS] Failed to cache workout image:', cacheError);
          }

          return {
            imageUrl,
            imageSource: 'pexels',
            searchQuery,
            cached: false
          };
        }
      } catch (error) {
        console.error(`[PEXELS] Error with workout query "${searchQuery}":`, error);
        continue;
      }
    }

    // Ultimate fallback - use a generic workout image
    console.log(`[PEXELS] ⚠️ No workout images found, using fallback for "${exerciseName}"`);
    const fallbackUrl = this.getWorkoutFallbackImage(muscleGroup);

    // Cache the fallback too using upsert
    try {
      await prisma.workoutImage.upsert({
        where: { normalizedKey },
        update: {
          imageUrl: fallbackUrl,
          searchQuery: 'fallback',
          hitCount: { increment: 1 },
          lastUsed: new Date()
        },
        create: {
          normalizedKey,
          originalExerciseName: exerciseName,
          searchQuery: 'fallback',
          imageUrl: fallbackUrl,
          imageSource: 'fallback',
          muscleGroup,
          equipmentType,
          exerciseCategory: 'fallback'
        }
      });
    } catch (cacheError) {
      console.error('[PEXELS] Failed to cache workout fallback:', cacheError);
    }

    return {
      imageUrl: fallbackUrl,
      imageSource: 'fallback',
      searchQuery: 'fallback',
      cached: false
    };
  }

  /**
   * Builds workout-specific search queries
   */
  private buildWorkoutSearchQueries(
    exerciseName: string,
    muscleGroup?: string | null,
    equipmentType?: string | null,
    aiSearchTerms?: string
  ): string[] {
    // Three rungs, for the same reason as buildSearchQueries above. The old
    // version issued up to eleven searches per exercise; with several
    // exercises in flight that alone was enough to saturate the connection
    // limit and make every one of them time out.
    const queries = dedupeQueries([
      // Primary: the terms the model picked for this specific exercise.
      usableQuery(aiSearchTerms) ? `${aiSearchTerms} exercise` : null,
      // Secondary: the exercise itself, with equipment when we have it since
      // that discriminates far better than muscle group for stock photos.
      usableQuery(exerciseName)
        ? (equipmentType ? `${exerciseName} ${equipmentType} exercise` : `${exerciseName} exercise`)
        : null,
      // Final: a generic that always resolves.
      muscleGroup ? `${muscleGroup} workout` : 'fitness workout',
    ]);

    console.log(`[PEXELS] Workout search strategy for "${exerciseName}":`, queries);
    return queries;
  }

  /**
   * Provides fallback images when Pexels fails
   */
  private getFallbackImage(mealType?: string | null): string {
    return pickFallback(FOOD_FALLBACKS, mealType);
  }

  /**
   * Provides workout fallback images
   */
  private getWorkoutFallbackImage(muscleGroup?: string | null): string {
    return pickFallback(WORKOUT_FALLBACKS, muscleGroup);
  }
}

// Export singleton instance
export const pexelsClient = new PexelsClient();