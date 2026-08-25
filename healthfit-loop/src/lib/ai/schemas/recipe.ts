import { z } from 'zod';
import { IngredientWithNutrition } from './shared';

/** Recipe's own grocery list is a flat array, unrelated to the six-category meal one. */
export const RecipeGroceryItem = z.object({
  ingredient: z.string(),
  amount: z.string(),
  category: z.string(),
  note: z.string().nullable(),
}).strict();

export const RecipeNutrition = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
  sodium: z.number(),
}).strict();

/**
 * Matches createRecipeGenerationPrompt in recipe-creation.ts.
 * `nutrition` is required here even though the TS interface allows it to be
 * absent — a cached recipe without it is what poisons the recipe cache.
 */
export const RecipeSchema = z.object({
  name: z.string(),
  description: z.string(),
  prepTime: z.string(),
  cookTime: z.string(),
  totalTime: z.string(),
  // The divisor between the whole-recipe ingredient sums and the per-serving
  // nutrition block. Zero makes that division meaningless; 400 is not a recipe.
  servings: z.number().int().min(1).max(12),
  difficulty: z.string(),
  cuisine: z.string(),
  tags: z.array(z.string()),
  groceryList: z.array(RecipeGroceryItem),
  ingredientsWithNutrition: z.array(IngredientWithNutrition),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  nutrition: RecipeNutrition,
  tips: z.array(z.string()),
  storage: z.string(),
  reheatInstructions: z.string(),
}).strict();
