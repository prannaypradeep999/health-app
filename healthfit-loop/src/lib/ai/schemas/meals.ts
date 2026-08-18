import { z } from 'zod';
import { GroceryList, MealSlot } from './shared';

/** Planning phase: createPlanningPrompt returns { mealPlan: [...] }. */
export const PlannedMeal = z.object({
  day: z.string(),
  mealType: z.string(),
  plannedName: z.string(),
  primaryProtein: z.string(),
  cuisine: z.string(),
  targetCalories: z.number(),
  targetProtein: z.number(),
  targetCarbs: z.number(),
  targetFat: z.number(),
  prepTime: z.string(),
  mealFormat: z.string(),
  keyIngredients: z.array(z.string()),
  batchCookingNotes: z.string(),
}).strict();

export const MealPlanSchema = z.object({
  mealPlan: z.array(PlannedMeal),
}).strict();

/** Detail phase: createDetailPrompt returns { meals: [day+slot envelope] }. */
export const MealDetailSchema = z.object({
  meals: z.array(MealSlot),
}).strict();

/** Grocery phase: createGroceryPrompt. */
export const GroceryListSchema = z.object({
  groceryList: GroceryList,
}).strict();

/** Legacy single-shot path: meals and grocery list in one response. */
export const HomeMealsLegacySchema = z.object({
  homeMeals: z.array(MealSlot),
  groceryList: GroceryList,
}).strict();
