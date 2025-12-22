import { z } from 'zod';

/**
 * Survey Schema - Supports progressive submission
 * 
 * The survey is submitted multiple times during the onboarding flow:
 * - Step 5: Triggers meal generation (home meals AWAITED, restaurants in background)
 * - Step 6: Triggers workout generation
 * - Final: Completes the survey
 * 
 * Most fields are optional to allow partial submissions at each step.
 * 
 * CHANGES MADE:
 * - Made all fields optional (except those with defaults) to support progressive submission
 * - Added currentStep field to track which step is being submitted
 * - Removed unused schemas: MealOptionSchema, MealSchema, MealPlanSchema, 
 *   MealFeedbackSchema, GenerateMealPlanRequestSchema, MealSelectionSchema
 */
export const SurveySchema = z.object({
  // Progressive step tracking (sent by frontend)
  currentStep: z.number().int().min(1).max(7).optional(),

  // Step 1: Personal Information
  email: z.string().email("Invalid email format").optional().or(z.literal('')),
  firstName: z.string().optional().default(''),
  lastName: z.string().optional().default(''),
  age: z.number().int().min(13, "Must be at least 13 years old").max(120, "Invalid age").optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  height: z.number().int().min(36, "Height must be at least 36 inches").max(96, "Height must be less than 96 inches").optional(),
  weight: z.number().int().min(50, "Weight must be at least 50 lbs").max(1000, "Weight must be less than 1000 lbs").optional(),

  // Step 4: Address fields (needed for restaurant recommendations)
  streetAddress: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zipCode: z.string().optional().default(''),
  country: z.string().default("United States"),

  // Step 2: Health Goals
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS']).optional(),
  activityLevel: z.enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE']).optional(),
  sportsInterests: z.string().default(""),
  fitnessTimeline: z.string().default(""),

  // Step 3: Budget Preferences
  monthlyFoodBudget: z.number().int().min(0).max(1000).default(200),
  monthlyFitnessBudget: z.number().int().min(0).max(500).default(50),
  weeklyMealSchedule: z.record(
    z.object({
      breakfast: z.enum(['no-meal', 'home', 'restaurant']),
      lunch: z.enum(['no-meal', 'home', 'restaurant']),
      dinner: z.enum(['no-meal', 'home', 'restaurant'])
    })
  ).optional(),
  distancePreference: z.enum(['close', 'medium', 'far']).default('medium'),

  // Step 4-5: Diet & Food Preferences
  dietPrefs: z.array(z.string()).default([]),
  preferredCuisines: z.array(z.string()).default([]),
  preferredFoods: z.array(z.string()).default([]),

  // Step 7: Health Metrics (optional)
  uploadedFiles: z.array(z.string()).default([]),
  preferredNutrients: z.array(z.string()).default([]),

  // Step 6: Workout Preferences
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

  // Step 7: Biomarkers (optional)
  biomarkers: z
    .object({
      cholesterol: z.number().min(0).max(500).optional(),
      vitaminD: z.number().min(0).max(200).optional(),
      iron: z.number().min(0).max(300).optional(),
    })
    .partial()
    .optional(),

  // Metadata
  source: z.string().optional(),
});

export type SurveyInput = z.infer<typeof SurveySchema>;