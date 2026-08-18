import { z } from 'zod';

/** meal-generation.ts (x4) and recipe-creation.ts */
export const IngredientWithNutrition = z.object({
  item: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
}).strict();

/**
 * perplexity-client.ts `PerplexityMenuResponse.orderingLinks` and
 * meal-generation.ts restaurant meals.
 *
 * Nullable, not optional: strict mode requires every key present. The prompts
 * that produce this must ask for null on missing platforms — the restaurant
 * prompt used to ask the model to omit the key, which strict mode forbids.
 */
export const OrderingLinks = z.object({
  doordash: z.string().nullable(),
  ubereats: z.string().nullable(),
  grubhub: z.string().nullable(),
  direct: z.string().nullable(),
}).strict();

export const GroceryItem = z.object({
  name: z.string(),
  quantity: z.string(),
  uses: z.string(),
}).strict();

/** Six fixed categories, per "use these EXACT categories" in both grocery prompts. */
export const GroceryList = z.object({
  proteins: z.array(GroceryItem),
  vegetables: z.array(GroceryItem),
  grains: z.array(GroceryItem),
  dairy: z.array(GroceryItem),
  pantryStaples: z.array(GroceryItem),
  snacks: z.array(GroceryItem),
}).strict();

/** Duplicated verbatim in meal-generation.ts at the legacy and detail prompts. */
export const MealObject = z.object({
  name: z.string(),
  description: z.string(),
  estimatedCalories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  prepTime: z.string(),
  cookTime: z.string(),
  difficulty: z.string(),
  cuisine: z.string(),
  ingredientsWithNutrition: z.array(IngredientWithNutrition),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  tags: z.array(z.string()),
  source: z.string(),
}).strict();

/** Both meal prompts wrap primary/alternative in this day+slot envelope. */
export const MealSlot = z.object({
  day: z.string(),
  mealType: z.string(),
  primary: MealObject,
  alternative: MealObject,
}).strict();
