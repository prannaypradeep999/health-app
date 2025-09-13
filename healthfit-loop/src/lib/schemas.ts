import { z } from 'zod';

export const SurveySchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  age: z.number().int().min(13).max(100).optional(),
  sex: z.string().optional(),
  height: z.string().optional(),
  weight: z.number().int().min(80).max(400).optional(),
  zipCode: z.string().optional(),
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS']),
  activityLevel: z.string().optional(),
  budgetTier: z.string().min(1),
  dietPrefs: z.array(z.string()).default([]),
  mealsOutPerWeek: z.number().int().min(0).max(14).optional(),
  distancePreference: z.enum(['close', 'medium', 'far']).default('medium'),
  
  // New cuisine and food preferences
  preferredCuisines: z.array(z.string()).default([]),
  preferredFoods: z.array(z.string()).default([]),
  
  biomarkers: z
    .object({
      cholesterol: z.number().min(0).max(500).optional(),
      vitaminD: z.number().min(0).max(200).optional(),
      iron: z.number().min(0).max(300).optional(),
    })
    .partial()
    .optional(),
  source: z.string().optional(),
});

export type SurveyInput = z.infer<typeof SurveySchema>;

// Meal Planning Schemas
export const MealOptionSchema = z.object({
  id: z.string(),
  optionNumber: z.number().int().min(1).max(2),
  optionType: z.enum(['restaurant', 'home']),
  
  restaurantName: z.string().optional(),
  dishName: z.string().optional(),
  estimatedPrice: z.number().int().optional(),
  orderingUrl: z.string().optional(),
  deliveryTime: z.string().optional(),
  
  recipeName: z.string().optional(),
  ingredients: z.array(z.string()).default([]),
  cookingTime: z.number().int().optional(),
  instructions: z.string().optional(),
  difficulty: z.string().optional(),
  
  calories: z.number().int(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number().optional(),
  sodium: z.number().int().optional(),
  
  wasEaten: z.boolean().default(false),
  userRating: z.number().int().min(1).max(5).optional(),
});

export const MealSchema = z.object({
  id: z.string(),
  day: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
  mealType: z.enum(['breakfast', 'lunch', 'dinner']),
  options: z.array(MealOptionSchema).length(2),
  selectedOptionId: z.string().optional(),
});

export const MealPlanSchema = z.object({
  id: z.string(),
  weekOf: z.date(),
  status: z.enum(['active', 'completed', 'archived']),
  regenerationCount: z.number().int().min(0).max(2),
  meals: z.array(MealSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const MealFeedbackSchema = z.object({
  mealOptionId: z.string(),
  feedbackType: z.enum(['loved', 'liked', 'disliked', 'too_much', 'too_little', 'too_expensive', 'cant_find']),
  notes: z.string().optional(),
});

export const GenerateMealPlanRequestSchema = z.object({
  forceRegenerate: z.boolean().default(false),
});

export const MealSelectionSchema = z.object({
  mealId: z.string(),
  selectedOptionId: z.string(),
});

export type MealOption = z.infer<typeof MealOptionSchema>;
export type Meal = z.infer<typeof MealSchema>;
export type MealPlan = z.infer<typeof MealPlanSchema>;
export type MealFeedback = z.infer<typeof MealFeedbackSchema>;
export type GenerateMealPlanRequest = z.infer<typeof GenerateMealPlanRequestSchema>;
export type MealSelection = z.infer<typeof MealSelectionSchema>;