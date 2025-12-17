import { z } from 'zod';

export const SurveySchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email format"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  age: z.number().int().min(13, "Must be at least 13 years old").max(120, "Invalid age"),
  sex: z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: "Please select your sex" }) }),
  height: z.number().int().min(36, "Height must be at least 36 inches").max(96, "Height must be less than 96 inches"),
  weight: z.number().int().min(50, "Weight must be at least 50 lbs").max(1000, "Weight must be less than 1000 lbs"),

  // Full address fields
  streetAddress: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "ZIP code is required"),
  country: z.string().default("United States"),
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS'], { errorMap: () => ({ message: "Please select a goal" }) }),
  activityLevel: z.enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE'], { errorMap: () => ({ message: "Please select your activity level" }) }),
  sportsInterests: z.string().default(""),
  fitnessTimeline: z.string().default(""),
  monthlyFoodBudget: z.number().int().min(0).max(1000).default(200),
  monthlyFitnessBudget: z.number().int().min(0).max(500).default(50),
  dietPrefs: z.array(z.string()).default([]),
  weeklyMealSchedule: z.record(
    z.object({
      breakfast: z.enum(['no-meal', 'home', 'restaurant']),
      lunch: z.enum(['no-meal', 'home', 'restaurant']),
      dinner: z.enum(['no-meal', 'home', 'restaurant'])
    })
  ).optional(),
  distancePreference: z.enum(['close', 'medium', 'far']).default('medium'),

  // New cuisine and food preferences
  preferredCuisines: z.array(z.string()).default([]),
  preferredFoods: z.array(z.string()).default([]),

  // Health metrics (optional)
  uploadedFiles: z.array(z.string()).default([]),
  preferredNutrients: z.array(z.string()).default([]),

  // Enhanced workout preferences
  workoutPreferences: z
    .object({
      preferredDuration: z.number().int().min(15).max(120).default(45),
      availableDays: z.array(z.string()).default([]),
      workoutTypes: z.array(z.string()).default([]),
      gymAccess: z.enum(['full_gym', 'no_gym', 'free_weights', 'calisthenics', 'recommend_gym']).default('no_gym'),
      fitnessExperience: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
      injuryConsiderations: z.array(z.string()).default([]),
      timePreferences: z.array(z.string()).default([]),
    })
    .optional(),

  biomarkers: z
    .object({
      cholesterol: z.number().min(0).max(500).optional(),
      vitaminD: z.number().min(0).max(200).optional(),
      iron: z.number().min(0).max(300).optional(),
    })
    .partial()
    .optional(),

  // Filler questions for background generation
  fillerQuestions: z
    .object({
      cookingFrequency: z.string().optional(),
      foodAllergies: z.array(z.string()).default([]),
      eatingOutOccasions: z.array(z.string()).default([]),
      healthGoalPriority: z.string().optional(),
      motivationLevel: z.string().optional(),
    })
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
  regenerationCount: z.number().int().min(0).max(100),
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