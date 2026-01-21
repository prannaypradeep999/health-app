import { prisma } from '@/lib/db';
import { withPexelsRetry } from '@/lib/utils/retry';

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

      if (cached) {
        // Cache hit - removed verbose logging

        // Update cache usage stats
        await prisma.foodImage.update({
          where: { id: cached.id },
          data: {
            hitCount: { increment: 1 },
            lastUsed: new Date()
          }
        });

        return {
          imageUrl: cached.imageUrl,
          imageSource: cached.imageSource as 'pexels' | 'cached' | 'fallback',
          searchQuery: cached.searchQuery,
          cached: true
        };
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
    const queries: string[] = [];

    // Primary: Use AI-generated search terms if available
    if (aiSearchTerms) {
      queries.push(`${aiSearchTerms} food`);
      queries.push(aiSearchTerms);
    }

    // Secondary: Full dish name with cuisine context
    if (cuisineType) {
      queries.push(`${dishName} ${cuisineType} food`);
    }
    queries.push(`${dishName} food`);
    queries.push(dishName);

    // Tertiary: Simple word extraction
    const words = dishName.split(/\s+/).filter(word => word.length > 3);
    if (words.length > 0) {
      queries.push(`${words[0]} food`); // First significant word
    }

    // Final: Generic fallbacks
    if (mealType) {
      queries.push(`${mealType} food`);
    }
    queries.push('healthy food', 'delicious food');

    console.log(`[PEXELS] Search strategy for "${dishName}":`, queries.slice(0, 3));
    return queries;
  }

  /**
   * Makes actual API call to Pexels with retry logic
   */
  private async searchPexels(query: string): Promise<string | null> {
    const pexelsResult = await withPexelsRetry(async () => {
      const response = await fetch(`${this.baseUrl}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, {
        headers: {
          'Authorization': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Pexels API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.photos && data.photos.length > 0) {
        return data.photos[0].src.large;
      }

      return null;
    }, `Pexels image search: "${query}"`);

    if (!pexelsResult.success) {
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

      if (cached) {
        console.log(`[PEXELS] ✅ Cache hit for workout "${normalizedKey}"`);

        // Update cache usage stats
        await prisma.workoutImage.update({
          where: { id: cached.id },
          data: {
            hitCount: { increment: 1 },
            lastUsed: new Date()
          }
        });

        return {
          imageUrl: cached.imageUrl,
          imageSource: cached.imageSource as 'pexels' | 'cached' | 'fallback',
          searchQuery: cached.searchQuery,
          cached: true
        };
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
    const queries: string[] = [];

    // Primary: Use AI-generated search terms if available
    if (aiSearchTerms) {
      queries.push(`${aiSearchTerms} exercise`);
      queries.push(`${aiSearchTerms} workout`);
    }

    // Secondary: Full exercise name with context
    queries.push(`${exerciseName} exercise workout`);
    queries.push(`${exerciseName} fitness`);
    queries.push(`${exerciseName} exercise`);

    // Add muscle group context
    if (muscleGroup) {
      queries.push(`${exerciseName} ${muscleGroup} workout`);
      queries.push(`${muscleGroup} exercise`);
    }

    // Add equipment context
    if (equipmentType) {
      queries.push(`${exerciseName} ${equipmentType} exercise`);
    }

    // Extract key words for fallback searches
    const words = exerciseName.toLowerCase().split(/[\s\-\(\)]+/).filter(word =>
      word.length > 3 && !['exercise', 'workout', 'with', 'using'].includes(word)
    );

    if (words.length > 0) {
      queries.push(`${words[0]} exercise`);
      queries.push(`${words[0]} workout`);
    }

    // Final: Generic fallbacks
    queries.push('fitness workout', 'gym exercise', 'strength training');

    console.log(`[PEXELS] Workout search strategy for "${exerciseName}":`, queries.slice(0, 3));
    return queries;
  }

  /**
   * Provides fallback images when Pexels fails
   */
  private getFallbackImage(mealType?: string | null): string {
    const fallbacks = {
      'breakfast': 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400&h=300&fit=crop',
      'lunch': 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=300&fit=crop',
      'dinner': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop',
      'default': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop'
    };

    return fallbacks[mealType as keyof typeof fallbacks] || fallbacks.default;
  }

  /**
   * Provides workout fallback images
   */
  private getWorkoutFallbackImage(muscleGroup?: string | null): string {
    const fallbacks = {
      'chest': 'https://images.unsplash.com/photo-1571019613540-996a182a2d6c?w=400&h=300&fit=crop',
      'back': 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=400&h=300&fit=crop',
      'legs': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=300&fit=crop',
      'arms': 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&h=300&fit=crop',
      'shoulders': 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400&h=300&fit=crop',
      'core': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop',
      'full body': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=300&fit=crop',
      'default': 'https://images.unsplash.com/photo-1571019613540-996a182a2d6c?w=400&h=300&fit=crop'
    };

    return fallbacks[muscleGroup as keyof typeof fallbacks] || fallbacks.default;
  }
}

// Export singleton instance
export const pexelsClient = new PexelsClient();