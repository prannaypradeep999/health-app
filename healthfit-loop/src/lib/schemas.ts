import { z } from 'zod';

/**
 * Survey Schema - Supports progressive submission
 *
 * The survey is submitted multiple times during the onboarding flow:
 * - Step 6: Triggers meal generation (home meals AWAITED, restaurants in background)
 * - Step 7: Triggers workout generation
 * - Final: Completes the survey
 *
 * Most fields are optional to allow partial submissions at each step.
 *
 * CHANGES MADE:
 * - Made all fields optional (except those with defaults) to support progressive submission
 * - Added currentStep field to track which step is being submitted
 * - Added enhanced goal selection with sub-options (primaryGoal, goalChallenge, etc.)
 * - Removed unused schemas: MealOptionSchema, MealSchema, MealPlanSchema,
 *   MealFeedbackSchema, GenerateMealPlanRequestSchema, MealSelectionSchema
 */

// Enhanced Goal Selection Enums
export const PrimaryGoalEnum = z.enum(['lose_weight', 'build_muscle', 'get_healthier', 'maintain']);
export const GoalChallengeEnum = z.enum(['snacking', 'eating_out', 'portions', 'late_night', 'dont_know']);
export const FitnessLevelEnum = z.enum(['beginner', 'intermediate', 'advanced']);
export const HealthFocusEnum = z.enum(['energy', 'digestion', 'mental_clarity', 'bloodwork', 'general']);
export const MaintainFocusEnum = z.enum(['consistency', 'recomp', 'habits', 'intuitive']);
export const SurveySchema = z.object({
  // Progressive step tracking (sent by frontend)
  currentStep: z.number().int().min(1).max(9).optional(),

  // Step 1: Personal Information
  email: z.string().email("Invalid email format").optional().or(z.literal('')),
  firstName: z.string().optional().default(''),
  lastName: z.string().optional().default(''),
  age: z.number().int().min(13, "Please enter a valid age").max(120, "Please enter a valid age"),
  sex: z.enum(['male', 'female', 'nonbinary'], { required_error: "Please select your sex" }),
  height: z.number().int().min(36, "Please enter height in inches (3-8 feet)").max(96, "Please enter height in inches (3-8 feet)"),
  weight: z.number().int().min(50, "Please enter weight in pounds").max(700, "Please enter weight in pounds"),

  // Step 4: Address fields (needed for restaurant recommendations)
  streetAddress: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zipCode: z.string().optional().default(''),
  country: z.string().default("United States"),

  // Step 2: Health Goals (enhanced)
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS'], {
    required_error: "Please select your goal"
  }),
  primaryGoal: PrimaryGoalEnum.optional(),
  goalChallenge: GoalChallengeEnum.optional(),
  fitnessLevel: FitnessLevelEnum.optional(),
  healthFocus: HealthFocusEnum.optional(),
  maintainFocus: MaintainFocusEnum.optional(),
  activityLevel: z.enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE'], {
    required_error: "Please select your activity level"
  }),
  sportsInterests: z.string().default(""),
  fitnessTimeline: z.string().default(""),
  preferredActivities: z.array(z.string()).default([]),
  additionalGoalsNotes: z.string().default(""),

  // Step 3: Budget Preferences
  monthlyFoodBudget: z.number().int().min(0).max(1000).default(200),
  monthlyFitnessBudget: z.number().int().min(0).max(500).default(50),
  weeklyMealSchedule: z.record(
    z.object({
      breakfast: z.enum(['no-meal', 'home', 'restaurant']),
      lunch: z.enum(['no-meal', 'home', 'restaurant']),
      dinner: z.enum(['no-meal', 'home', 'restaurant'])
    })
  ).default({}),
  distancePreference: z.enum(['close', 'medium', 'far']).default('medium'),

  // Step 4-5: Diet & Food Preferences
  dietPrefs: z.array(z.string()).default([]),
  preferredCuisines: z.array(z.string()).default([]),
  preferredFoods: z.array(z.string()).default([]),
  customFoodInput: z.string().optional().default(''),

  // Step 7: Health Metrics (optional)
  uploadedFiles: z.array(z.string()).default([]),
  preferredNutrients: z.array(z.string()).default([]),

  // Extra personalization (optional)
  fillerQuestions: z
    .object({
      foodAllergies: z.array(z.string()).default([]),
      eatingOutOccasions: z.string().optional(),
      healthGoalPriority: z.string().optional(),
      motivationLevel: z.string().optional()
    })
    .optional(),

  // Foods to avoid (preferences, not allergies)
  strictExclusions: z.object({
    proteins: z.array(z.string()).default([]),
    dairy: z.array(z.string()).default([]),
    fruits: z.array(z.string()).default([]),
    vegetables: z.array(z.string()).default([]),
    other: z.array(z.string()).default([])
  }).default({
    proteins: [],
    dairy: [],
    fruits: [],
    vegetables: [],
    other: []
  }),

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
    .default({
      preferredDuration: 45,
      availableDays: [],
      workoutTypes: [],
      gymAccess: 'no_gym',
      fitnessExperience: 'intermediate',
      injuryConsiderations: [],
      timePreferences: [],
    }),

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