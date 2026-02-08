import {
  calculateMacroTargets,
  getDynamicMealDistribution,
  getWeeklyCalorieTargets,
  UserProfile,
  WeeklyMealSchedule,
  WeeklyMealDistribution,
  MacroTargets
} from './nutrition';

export interface MealSlotNutritionTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'home' | 'restaurant' | 'skipped';
}

export interface DailyNutritionTargets {
  breakfast: MealSlotNutritionTarget | null;
  lunch: MealSlotNutritionTarget | null;
  dinner: MealSlotNutritionTarget | null;
  dailyTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface WeeklyNutritionTargets {
  dailyCalories: number;
  macros: MacroTargets;
  days: Record<string, DailyNutritionTargets>;
}

export function buildNutritionTargets(surveyData: any): WeeklyNutritionTargets | null {
  // 1. Validate required fields - return null if incomplete
  if (!surveyData.age || !surveyData.sex || !surveyData.height || !surveyData.weight) {
    return null;
  }

  // 2. Create UserProfile from surveyData
  const userProfile: UserProfile = {
    age: surveyData.age,
    sex: surveyData.sex,
    height: surveyData.height,
    weight: surveyData.weight,
    activityLevel: surveyData.activityLevel || 'MODERATELY_ACTIVE',
    goal: surveyData.goal || 'GENERAL_WELLNESS'
  };

  // 3. Get weekly schedule or use default
  let weeklySchedule: WeeklyMealSchedule = surveyData.weeklyMealSchedule;
  if (!weeklySchedule || typeof weeklySchedule !== 'object') {
    // Fall back to default 7-day all-home schedule with standard distribution
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    weeklySchedule = {};
    days.forEach(day => {
      weeklySchedule[day] = {
        breakfast: 'home',
        lunch: 'home',
        dinner: 'home'
      };
    });
  }

  // 4. Get weekly calorie targets with dynamic distribution
  const weeklyTargets = getWeeklyCalorieTargets(userProfile, weeklySchedule);

  // 5. Build per-day nutrition targets with proportional macros
  const days: Record<string, DailyNutritionTargets> = {};

  Object.entries(weeklyTargets.weeklyDistribution).forEach(([day, dayDistribution]) => {
    // Calculate daily totals
    const dailyTotals = {
      calories: weeklyTargets.dailyCalories,
      protein: weeklyTargets.macros.protein,
      carbs: weeklyTargets.macros.carbs,
      fat: weeklyTargets.macros.fat
    };

    // Build meal targets with proportional macros
    const buildMealTarget = (
      mealSlot: { calories: number | null; source: 'home' | 'restaurant' | 'skipped' }
    ): MealSlotNutritionTarget | null => {
      if (mealSlot.calories === null || mealSlot.source === 'skipped') {
        return null;
      }

      // Calculate this meal's proportion of daily calories
      const proportion = mealSlot.calories / dailyTotals.calories;

      return {
        calories: mealSlot.calories,
        protein: Math.round(dailyTotals.protein * proportion),
        carbs: Math.round(dailyTotals.carbs * proportion),
        fat: Math.round(dailyTotals.fat * proportion),
        source: mealSlot.source
      };
    };

    days[day] = {
      breakfast: buildMealTarget(dayDistribution.breakfast),
      lunch: buildMealTarget(dayDistribution.lunch),
      dinner: buildMealTarget(dayDistribution.dinner),
      dailyTotals
    };
  });

  return {
    dailyCalories: weeklyTargets.dailyCalories,
    macros: weeklyTargets.macros,
    days
  };
}