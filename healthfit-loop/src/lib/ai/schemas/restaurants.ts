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

/** One scheduled eating-out slot: the pick and its backup. */
export const RestaurantMealSlot = z.object({
  day: z.string(),
  mealType: z.string(),
  primary: RestaurantMealObject,
  alternative: RestaurantMealObject,
}).strict();

/** createRestaurantMealGenerationPrompt */
export const RestaurantMealsSchema = z.object({
  restaurantMeals: z.array(RestaurantMealSlot),
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
    // Extracted per dish because selection cannot optimise for a number it is
    // never shown. Without this the meal-selection prompt lists each dish as
    // "$14.99 (lunch) - 520 cal" and the model picks against the calorie
    // window, then estimates protein at output time from whatever it already
    // chose. Measured 2026-08-19: a Fanoos dish came back at 42g against an
    // 85g target — not the target being ignored, but protein never having been
    // a selectable attribute.
    estimatedProtein: z.number(),
    healthRating: z.enum(HEALTH_RATINGS),
  }).strict()),
  orderingLinks: OrderingLinks,
}).strict();
