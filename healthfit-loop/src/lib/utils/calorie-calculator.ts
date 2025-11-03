import { SurveyResponse } from '@prisma/client';

export interface CalorieGoal {
  dailyGoal: number;
  breakfast: number;
  lunch: number;
  dinner: number;
}

export function calculateDailyCalorieGoal(surveyData: SurveyResponse): CalorieGoal {
  // Base metabolic rate calculation (simplified Harris-Benedict)
  const age = surveyData.age || 30;
  const weight = surveyData.weight || 150;
  const heightInInches = parseHeight(surveyData.height || "5'8\"");
  const sex = surveyData.sex?.toLowerCase() || 'male';

  let baseCalories: number;
  if (sex === 'male') {
    baseCalories = 88.362 + (13.397 * weight * 0.453592) + (4.799 * heightInInches * 2.54) - (5.677 * age);
  } else {
    baseCalories = 447.593 + (9.247 * weight * 0.453592) + (3.098 * heightInInches * 2.54) - (4.330 * age);
  }

  // Activity level multiplier
  const activityMultipliers = {
    'SEDENTARY': 1.2,
    'LIGHTLY_ACTIVE': 1.375,
    'MODERATELY_ACTIVE': 1.55,
    'VERY_ACTIVE': 1.725,
    'EXTREMELY_ACTIVE': 1.9
  };

  const activityLevel = surveyData.activityLevel as keyof typeof activityMultipliers || 'MODERATELY_ACTIVE';
  const activityMultiplier = activityMultipliers[activityLevel] || 1.55;

  // Age adjustment
  let ageAdjustment = 0;
  if (age > 40) ageAdjustment = -50;
  if (age > 60) ageAdjustment = -100;

  // Goal-specific adjustments
  let goalAdjustment = 0;
  if (surveyData.goal === 'WEIGHT_LOSS') goalAdjustment = -500; // Deficit
  if (surveyData.goal === 'MUSCLE_GAIN') goalAdjustment = 300; // Surplus
  if (surveyData.goal === 'ENDURANCE') goalAdjustment = 200;

  const dailyGoal = Math.round((baseCalories + ageAdjustment) * activityMultiplier + goalAdjustment);

  // Meal distribution (same as existing logic)
  const breakfast = Math.round(dailyGoal * 0.25);
  const lunch = Math.round(dailyGoal * 0.35);
  const dinner = Math.round(dailyGoal * 0.4);

  return {
    dailyGoal,
    breakfast,
    lunch,
    dinner
  };
}

function parseHeight(heightString: string): number {
  // Parse heights like "5'8\"", "6'0\"", "5'10\"" to inches
  const match = heightString.match(/(\d+)'(\d+)"/);
  if (match) {
    const feet = parseInt(match[1]);
    const inches = parseInt(match[2]);
    return feet * 12 + inches;
  }

  // Fallback: try to parse as just inches
  const inchesOnly = parseInt(heightString);
  if (!isNaN(inchesOnly)) {
    return inchesOnly;
  }

  // Default height if parsing fails
  return 68; // 5'8"
}

export interface MealCalorieData {
  mealType: 'breakfast' | 'lunch' | 'dinner';
  calories: number;
  goal: number;
  percentage: number;
}

export function calculateMealProgress(meals: Record<string, any>[], calorieGoal: CalorieGoal): {
  totalCalories: number;
  dailyPercentage: number;
  mealBreakdown: MealCalorieData[];
} {
  const mealBreakdown: MealCalorieData[] = [];
  let totalCalories = 0;

  // Group meals by type and calculate totals
  const mealsByType = meals.reduce((acc, meal) => {
    const mealType = meal.mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner';
    if (!acc[mealType]) acc[mealType] = [];
    acc[mealType].push(meal);
    return acc;
  }, {} as Record<'breakfast' | 'lunch' | 'dinner', Record<string, any>[]>);

  // Calculate calories for each meal type
  ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
    const typedMealType = mealType as 'breakfast' | 'lunch' | 'dinner';
    const mealsOfType = mealsByType[typedMealType] || [];
    const calories = mealsOfType.reduce((sum, meal) => {
      // Get calories from selected option or average of all options
      if (meal.selectedOptionId) {
        const selectedOption = meal.options?.find((opt: Record<string, any>) => opt.id === meal.selectedOptionId);
        return sum + (selectedOption?.calories || 0);
      } else {
        // Average calories if no selection made
        const avgCalories = meal.options?.reduce((optSum: number, opt: Record<string, any>) => optSum + (opt.calories || 0), 0) / (meal.options?.length || 1) || 0;
        return sum + avgCalories;
      }
    }, 0);

    const goal = calorieGoal[typedMealType];
    const percentage = goal > 0 ? Math.round((calories / goal) * 100) : 0;

    mealBreakdown.push({
      mealType: typedMealType,
      calories,
      goal,
      percentage
    });

    totalCalories += calories;
  });

  const dailyPercentage = calorieGoal.dailyGoal > 0 ? Math.round((totalCalories / calorieGoal.dailyGoal) * 100) : 0;

  return {
    totalCalories,
    dailyPercentage,
    mealBreakdown
  };
}

export function getCalorieStatusColor(percentage: number): string {
  if (percentage < 70) return 'text-orange-600'; // Under target
  if (percentage <= 110) return 'text-green-600'; // On target
  return 'text-red-600'; // Over target
}

export function getCalorieStatusMessage(percentage: number): string {
  if (percentage < 70) return 'Below target';
  if (percentage <= 110) return 'On track';
  return 'Above target';
}