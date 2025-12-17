// Centralized AI Prompts Export
// This file consolidates all AI prompts for easy importing across the application

// Re-export all meal generation prompts
export * from './meal-generation';
export type {
  Restaurant,
  MenuExtractionContext
} from './meal-generation';

// Re-export all workout generation prompts
export * from './workout-generation';
export type {
  WorkoutPreferences,
  WorkoutDay,
  WorkoutPlan
} from './workout-generation';

// Re-export all recipe creation prompts
export * from './recipe-creation';
export type {
  RecipeContext,
  Recipe
} from './recipe-creation';

// Re-export all analysis prompts
export * from './analysis';
export type {
  WorkoutAnalysisContext,
  WorkoutAnalysisResult
} from './analysis';

// Re-export shared utilities and types
export * from './shared-utilities';
export type {
  UserContext
} from './shared-utilities';

// Re-export profile generation prompts
export * from './profile-generation';
export type {
  ProfileGenerationResponse,
  FoodProfile,
  WorkoutProfile
} from './profile-generation';