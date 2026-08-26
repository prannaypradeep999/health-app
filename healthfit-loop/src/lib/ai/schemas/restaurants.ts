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

/**
 * What meal selection actually decides, with the transcription removed.
 *
 * `RestaurantMealObject` above is the shape the rest of the app consumes, and
 * it stays that shape — but five of its thirteen fields (`cuisine`, `address`,
 * the four `orderingLinks`, `source`) were values printed into the prompt from
 * Places and Perplexity and copied back out by the model one token at a time.
 * Measured on plan cmt9jxhs30003l504dl202k46, that transcription was 47.7% of
 * the emitted JSON, and on 2026-08-26 the selection call was cut off by the
 * route deadline at 26691ms having produced nothing at all.
 *
 * `restaurant` stays because it is the choice — which of the listed places to
 * order from. `src/lib/utils/restaurant-join.ts` looks the rest up from that
 * name and rebuilds the full object, so nothing downstream sees a difference
 * except that the links are now the ones we measured rather than the ones the
 * model retyped.
 */
export const RestaurantMealChoice = z.object({
  restaurant: z.string(),
  dish: z.string(),
  description: z.string(),
  price: z.number(),
  estimatedCalories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  tags: z.array(z.string()),
}).strict();

export const RestaurantMealChoiceSlot = z.object({
  day: z.string(),
  mealType: z.string(),
  primary: RestaurantMealChoice,
  alternative: RestaurantMealChoice,
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
    // B8: RestaurantMealObject requires carbs and fat, so the selection model
    // was obliged to emit two numbers no upstream source supplied — not Sonar,
    // not Places, not this schema. They were invention rendered beside measured
    // values. Extracted here for the same reason estimatedProtein is: a number
    // the model must report has to be a number it was shown.
    estimatedCarbs: z.number(),
    estimatedFat: z.number(),
    healthRating: z.enum(HEALTH_RATINGS),
  }).strict()),
  orderingLinks: OrderingLinks,
}).strict();
