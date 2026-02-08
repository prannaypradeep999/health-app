import { SurveyResponse } from '@prisma/client';
import {
  calculateTargetCalories,
  getMealCalorieDistribution,
  getDynamicMealDistribution,
  UserProfile,
  WeeklyMealSchedule,
  parseHeight,
  calculateMealProgress,
  getCalorieStatusColor,
  getCalorieStatusMessage,
  MealCalorieData
} from './nutrition';

export interface CalorieGoal {
  dailyGoal: number;
  breakfast: number;
  lunch: number;
  dinner: number;
}

export function calculateDailyCalorieGoal(
  surveyData: SurveyResponse,
  day?: string,
  weeklyMealSchedule?: WeeklyMealSchedule
): CalorieGoal {
  // Create UserProfile for nutrition.ts functions
  const userProfile: UserProfile = {
    age: surveyData.age || 30,
    sex: surveyData.sex || 'male',
    height: typeof surveyData.height === 'string' ? parseHeight(surveyData.height) : (surveyData.height || 68),
    weight: surveyData.weight || 150,
    activityLevel: surveyData.activityLevel || 'MODERATELY_ACTIVE',
    goal: surveyData.goal || 'GENERAL_WELLNESS'
  };

  // Use the more modern Mifflin-St Jeor equation from nutrition.ts
  const dailyGoal = calculateTargetCalories(userProfile);

  // Use dynamic distribution if day and schedule are provided
  if (day && weeklyMealSchedule && weeklyMealSchedule[day]) {
    const weeklyDist = getDynamicMealDistribution(dailyGoal, weeklyMealSchedule);
    const dayDist = weeklyDist[day];
    return {
      dailyGoal,
      breakfast: dayDist.breakfast.calories ?? 0,
      lunch: dayDist.lunch.calories ?? 0,
      dinner: dayDist.dinner.calories ?? 0
    };
  }

  // Legacy fallback - use hardcoded 25/35/40 distribution
  const mealDistribution = getMealCalorieDistribution(dailyGoal);

  return {
    dailyGoal,
    breakfast: mealDistribution.breakfast,
    lunch: mealDistribution.lunch,
    dinner: mealDistribution.dinner
  };
}

// Re-export helper functions from nutrition.ts for backward compatibility
export { parseHeight, calculateMealProgress, getCalorieStatusColor, getCalorieStatusMessage } from './nutrition';
export type { MealCalorieData } from './nutrition';

// Re-exported from nutrition.ts - kept here for backward compatibility
// The actual implementation is now in nutrition.ts