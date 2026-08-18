import { z } from 'zod';
import { OrderingLinks } from './shared';

/** createRestaurantSelectionPrompt */
export const RestaurantSelectionSchema = z.object({
  selectedRestaurants: z.array(z.object({
    name: z.string(),
    placeId: z.string(),
    cuisine: z.string(),
    rating: z.number(),
    address: z.string(),
    reason: z.string(),
  }).strict()),
}).strict();

export const RestaurantMealObject = z.object({
  restaurant: z.string(),
  dish: z.string(),
  description: z.string(),
  price: z.number(),
  estimatedCalories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  cuisine: z.string(),
  address: z.string(),
  orderingLinks: OrderingLinks,
  source: z.string(),
  tags: z.array(z.string()),
}).strict();

/** createRestaurantMealGenerationPrompt */
export const RestaurantMealsSchema = z.object({
  restaurantMeals: z.array(z.object({
    day: z.string(),
    mealType: z.string(),
    primary: RestaurantMealObject,
    alternative: RestaurantMealObject,
  }).strict()),
}).strict();

/** Enum values are normalized with normalizeEnum before this runs. */
export const MENU_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const HEALTH_RATINGS = ['excellent', 'good', 'fair', 'poor'] as const;

/** processWithGPT4 in perplexity-client.ts — matches PerplexityMenuResponse. */
export const MenuExtractionSchema = z.object({
  menuItems: z.array(z.object({
    name: z.string(),
    price: z.number(),
    description: z.string(),
    category: z.enum(MENU_CATEGORIES),
    estimatedCalories: z.number(),
    healthRating: z.enum(HEALTH_RATINGS),
  }).strict()),
  orderingLinks: OrderingLinks,
}).strict();
