// Profile Generation Prompts
// These prompts create conversational, personalized profiles based on survey data

import { SurveyResponse } from '@prisma/client';

// User Food Profile Generation Prompt
export const createFoodProfilePrompt = (surveyData: SurveyResponse): string => {
  // Get the relevant sub-option based on primary goal
  const getGoalKey = () => {
    const goalValue = surveyData.goal;
    if (typeof goalValue === 'string') {
      const lowerGoal = goalValue.toLowerCase();
      if (['lose_weight', 'build_muscle', 'get_healthier', 'maintain'].includes(lowerGoal)) {
        return lowerGoal;
      }
      switch (goalValue) {
        case 'WEIGHT_LOSS':
          return 'lose_weight';
        case 'MUSCLE_GAIN':
          return 'build_muscle';
        case 'ENDURANCE':
          return 'get_healthier';
        case 'GENERAL_WELLNESS':
          return null;
        default:
          return null;
      }
    }
    return surveyData.primaryGoal || null;
  };
  const getSubOptionContext = () => {
    switch (getGoalKey()) {
      case 'lose_weight':
        return surveyData.goalChallenge
          ? `Their main challenge: ${surveyData.goalChallenge.replace('_', ' ')}`
          : '';
      case 'build_muscle':
        return surveyData.fitnessLevel
          ? `Their fitness level: ${surveyData.fitnessLevel}`
          : '';
      case 'get_healthier':
        return surveyData.healthFocus
          ? `Their health focus: ${surveyData.healthFocus.replace('_', ' ')}`
          : '';
      case 'maintain':
        return surveyData.maintainFocus
          ? `Their maintenance focus: ${surveyData.maintainFocus}`
          : '';
      default:
        return '';
    }
  };

  return `You are a friendly, expert nutritionist creating a personalized food profile summary.

USER PROFILE:
- Name: ${surveyData.firstName} ${surveyData.lastName}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Primary Goal: ${surveyData.goal || surveyData.primaryGoal || 'GENERAL_WELLNESS'}
${getSubOptionContext()}
- Activity Level: ${surveyData.activityLevel}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Varied'}
- Preferred Foods: ${(surveyData.preferredFoods || []).slice(0, 10).join(', ') || 'No specific preferences'}
- Monthly Food Budget: $${surveyData.monthlyFoodBudget || 200}
- Additional Notes: ${surveyData.additionalGoalsNotes || 'None'}

TASK: Create a friendly, conversational profile that:
1. Acknowledges their specific goal (${surveyData.goal || surveyData.primaryGoal || 'GENERAL_WELLNESS'}) and their particular focus/challenge
2. Addresses their specific sub-goal directly (e.g., if they struggle with snacking, mention strategies for that)
3. Summarizes their dietary preferences and restrictions
4. Explains our planned nutrition approach tailored to their situation
5. Provides honest, realistic expectations for their journey

TONE: Warm, encouraging, expert but honest
LENGTH: 250-350 words
FORMAT: Write in 2nd person ("you") like a personal nutritionist

Include sections:
- **Your Goals** (mention both primary goal AND their specific challenge/focus)
- **Your Food Preferences**
- **Our Nutrition Strategy** (tailored to their specific sub-goal)
- **What to Expect**

Use **bold text** for key points. Return ONLY the conversational text.`;
};

// User Workout Profile Generation Prompt
export const createWorkoutProfilePrompt = (surveyData: SurveyResponse): string => {
  const workoutPrefs = (surveyData.workoutPreferencesJson as any) || {};

  return `You are an encouraging, expert fitness trainer creating a personalized workout profile.

USER PROFILE:
- Name: ${surveyData.firstName} ${surveyData.lastName}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Primary Goal: ${surveyData.goal || surveyData.primaryGoal || 'GENERAL_WELLNESS'}
- Fitness Level: ${surveyData.fitnessLevel || workoutPrefs.fitnessExperience || 'intermediate'}
- Health Focus: ${surveyData.healthFocus || 'general fitness'}
- Activity Level: ${surveyData.activityLevel}
- Preferred Activities: ${(surveyData.preferredActivities || []).join(', ') || 'Varied'}
- Gym Access: ${workoutPrefs.gymAccess || 'unknown'}
- Available Days: ${(workoutPrefs.availableDays || []).join(', ') || 'Flexible'}
- Preferred Duration: ${workoutPrefs.preferredDuration || 45} minutes
- Monthly Fitness Budget: $${surveyData.monthlyFitnessBudget || 50}
- Additional Notes: ${surveyData.additionalGoalsNotes || 'None'}

TASK: Create an inspiring, conversational profile that:
1. Acknowledges their fitness goal and current fitness level
2. Addresses their specific situation (e.g., beginner needs different approach than advanced)
3. Explains our planned training approach
4. Sets realistic expectations based on their level and available time

TONE: Motivational, encouraging, expert but realistic
LENGTH: 250-350 words
FORMAT: Write in 2nd person ("you") like a personal trainer

Include sections:
- **Your Fitness Goals** (mention primary goal and fitness level)
- **Your Training Style**
- **Our Workout Strategy**
- **What to Expect**

Use **bold text** for key points. Return ONLY the conversational text.`;
};

// Profile Response Types
export interface ProfileGenerationResponse {
  profile: string;
  success: boolean;
  error?: string;
}

export interface FoodProfile {
  id: string;
  userId?: string;
  surveyId: string;
  profileContent: string;
  isApproved: boolean;
  userEdits?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkoutProfile {
  id: string;
  userId?: string;
  surveyId: string;
  profileContent: string;
  isApproved: boolean;
  userEdits?: string;
  createdAt: Date;
  updatedAt: Date;
}