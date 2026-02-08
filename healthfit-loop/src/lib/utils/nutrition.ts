// Nutrition calculation utilities
export interface UserProfile {
  age: number;
  sex: string;
  height: number; // inches
  weight: number; // pounds
  activityLevel: string;
  goal: string;
}

// Calculate BMR using Mifflin-St Jeor equation
export function calculateBMR(profile: UserProfile): number {
  const { age, sex, height, weight } = profile;

  // Convert height from inches to cm and weight from lbs to kg
  const heightCm = height * 2.54;
  const weightKg = weight * 0.453592;

  let bmr: number;

  if (sex.toLowerCase() === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  return Math.round(bmr);
}

// Activity level multipliers
const ACTIVITY_MULTIPLIERS = {
  'SEDENTARY': 1.2,
  'LIGHTLY_ACTIVE': 1.375,
  'MODERATELY_ACTIVE': 1.55,
  'VERY_ACTIVE': 1.725,
  'EXTREMELY_ACTIVE': 1.9
};

// Calculate TDEE (Total Daily Energy Expenditure)
export function calculateTDEE(profile: UserProfile): number {
  const bmr = calculateBMR(profile);
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel as keyof typeof ACTIVITY_MULTIPLIERS] || 1.55;

  return Math.round(bmr * multiplier);
}

// Adjust calories based on goal
export function calculateTargetCalories(profile: UserProfile): number {
  const tdee = calculateTDEE(profile);

  switch (profile.goal) {
    case 'WEIGHT_LOSS':
      return Math.round(tdee * 0.8); // 20% deficit
    case 'MUSCLE_GAIN':
      return Math.round(tdee * 1.15); // 15% surplus
    case 'ENDURANCE':
      return Math.round(tdee * 1.1); // 10% surplus
    case 'GENERAL_WELLNESS':
    default:
      return tdee; // Maintenance
  }
}

// Calculate macronutrient targets based on goal
export interface MacroTargets {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
}

export function calculateMacroTargets(profile: UserProfile): MacroTargets {
  const calories = calculateTargetCalories(profile);
  const weightKg = profile.weight * 0.453592;

  let proteinRatio: number;
  let fatRatio: number;

  switch (profile.goal) {
    case 'WEIGHT_LOSS':
      proteinRatio = 0.35; // 35% protein for satiety and muscle preservation
      fatRatio = 0.25; // 25% fat
      break;
    case 'MUSCLE_GAIN':
      proteinRatio = 0.30; // 30% protein for muscle building
      fatRatio = 0.25; // 25% fat
      break;
    case 'ENDURANCE':
      proteinRatio = 0.20; // 20% protein
      fatRatio = 0.25; // 25% fat
      break;
    case 'GENERAL_WELLNESS':
    default:
      proteinRatio = 0.25; // 25% protein
      fatRatio = 0.30; // 30% fat
      break;
  }

  const carbRatio = 1 - proteinRatio - fatRatio;

  return {
    calories,
    protein: Math.round((calories * proteinRatio) / 4), // 4 cal/g protein
    carbs: Math.round((calories * carbRatio) / 4), // 4 cal/g carbs
    fat: Math.round((calories * fatRatio) / 9) // 9 cal/g fat
  };
}

// Weekly meal schedule types
export type MealType = 'no-meal' | 'home' | 'restaurant';
export type DaySchedule = {
  breakfast: MealType;
  lunch: MealType;
  dinner: MealType;
};
export type WeeklyMealSchedule = Record<string, DaySchedule>;

// Meal slot with source information
export interface MealSlotTarget {
  calories: number | null;
  source: 'home' | 'restaurant' | 'skipped';
}

// Daily meal distribution result
export interface DailyMealDistribution {
  breakfast: MealSlotTarget;
  lunch: MealSlotTarget;
  dinner: MealSlotTarget;
}

// Weekly meal distribution result
export interface WeeklyMealDistribution {
  [day: string]: DailyMealDistribution;
}

// Calculate dynamic meal distribution based on user's weekly schedule
export function getDynamicMealDistribution(
  dailyCalories: number,
  weeklySchedule: WeeklyMealSchedule
): WeeklyMealDistribution {
  const result: WeeklyMealDistribution = {};

  // Default meal weight ratios when all 3 meals exist
  const defaultRatios = {
    breakfast: 0.25, // 25%
    lunch: 0.35,     // 35%
    dinner: 0.40     // 40%
  };

  Object.entries(weeklySchedule).forEach(([day, daySchedule]) => {
    const activeMeals = {
      breakfast: daySchedule.breakfast !== 'no-meal',
      lunch: daySchedule.lunch !== 'no-meal',
      dinner: daySchedule.dinner !== 'no-meal'
    };

    const activeMealCount = Object.values(activeMeals).filter(Boolean).length;

    // Initialize with skipped meals
    let distribution: DailyMealDistribution = {
      breakfast: { calories: null, source: 'skipped' },
      lunch: { calories: null, source: 'skipped' },
      dinner: { calories: null, source: 'skipped' }
    };

    // Set source types from schedule
    distribution.breakfast.source = daySchedule.breakfast === 'no-meal' ? 'skipped' : daySchedule.breakfast;
    distribution.lunch.source = daySchedule.lunch === 'no-meal' ? 'skipped' : daySchedule.lunch;
    distribution.dinner.source = daySchedule.dinner === 'no-meal' ? 'skipped' : daySchedule.dinner;

    if (activeMealCount === 0) {
      // All meals skipped - calories stay null
    } else if (activeMealCount === 1) {
      // Only one meal - give it most calories but cap at reasonable amount
      const maxSingleMealCalories = Math.min(dailyCalories, 1200);
      if (activeMeals.breakfast) distribution.breakfast.calories = maxSingleMealCalories;
      else if (activeMeals.lunch) distribution.lunch.calories = maxSingleMealCalories;
      else if (activeMeals.dinner) distribution.dinner.calories = maxSingleMealCalories;
    } else if (activeMealCount === 2) {
      // Two meals - distribute roughly 40/60
      const mealCalories = Math.round(dailyCalories * 0.4);
      const largerMealCalories = dailyCalories - mealCalories;

      if (activeMeals.breakfast && activeMeals.lunch) {
        distribution.breakfast.calories = mealCalories;
        distribution.lunch.calories = largerMealCalories;
      } else if (activeMeals.breakfast && activeMeals.dinner) {
        distribution.breakfast.calories = mealCalories;
        distribution.dinner.calories = largerMealCalories;
      } else if (activeMeals.lunch && activeMeals.dinner) {
        distribution.lunch.calories = mealCalories;
        distribution.dinner.calories = largerMealCalories;
      }
    } else {
      // All three meals - use weighted ratios
      distribution.breakfast.calories = Math.round(dailyCalories * defaultRatios.breakfast);
      distribution.lunch.calories = Math.round(dailyCalories * defaultRatios.lunch);
      distribution.dinner.calories = Math.round(dailyCalories * defaultRatios.dinner);
    }

    result[day] = distribution;
  });

  return result;
}

// Legacy function for backward compatibility - uses hardcoded 25/35/40 split
export function getMealCalorieDistribution(targetCalories: number) {
  return {
    breakfast: Math.round(targetCalories * 0.25), // 25%
    lunch: Math.round(targetCalories * 0.35), // 35%
    dinner: Math.round(targetCalories * 0.40) // 40%
  };
}

// Helper function to parse height strings like "5'8\"" to inches
export function parseHeight(heightString: string): number {
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

// Meal calorie data interface for progress calculations
export interface MealCalorieData {
  mealType: 'breakfast' | 'lunch' | 'dinner';
  calories: number;
  goal: number;
  percentage: number;
}

// Calculate meal progress for dashboard display
export function calculateMealProgress(meals: Record<string, any>[], calorieGoal: {
  dailyGoal: number;
  breakfast: number;
  lunch: number;
  dinner: number;
}): {
  totalCalories: number;
  dailyPercentage: number;
  mealBreakdown: MealCalorieData[];
} {
  const mealBreakdown: MealCalorieData[] = [];
  let totalCalories = 0;

  // Group meals by type and calculate totals
  const mealsByType = meals.reduce((acc: Record<'breakfast' | 'lunch' | 'dinner', Record<string, any>[]>, meal: any) => {
    const mealType = meal.mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner';
    if (!acc[mealType]) acc[mealType] = [];
    acc[mealType].push(meal);
    return acc;
  }, {} as Record<'breakfast' | 'lunch' | 'dinner', Record<string, any>[]>);

  // Calculate calories for each meal type
  ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
    const typedMealType = mealType as 'breakfast' | 'lunch' | 'dinner';
    const mealsOfType = mealsByType[typedMealType] || [];
    const calories = mealsOfType.reduce((sum: number, meal: any) => {
      // Get calories from selected option or average of all options
      if (meal.selectedOptionId) {
        const selectedOption = meal.options?.find((opt: Record<string, any>) => opt.id === meal.selectedOptionId);
        return sum + (selectedOption?.calories ?? 0);
      } else {
        // Average calories if no selection made
        const avgCalories = meal.options?.length
          ? meal.options.reduce((optSum: number, opt: Record<string, any>) => optSum + (opt.calories ?? 0), 0) / meal.options.length
          : 0;
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

// Get color class for calorie status display
export function getCalorieStatusColor(percentage: number): string {
  if (percentage < 70) return 'text-orange-600'; // Under target
  if (percentage <= 110) return 'text-green-600'; // On target
  return 'text-red-600'; // Over target
}

// Get status message for calorie progress
export function getCalorieStatusMessage(percentage: number): string {
  if (percentage < 70) return 'Below target';
  if (percentage <= 110) return 'On track';
  return 'Above target';
}

// Convenience function to get complete weekly calorie targets
export function getWeeklyCalorieTargets(
  profile: UserProfile,
  weeklySchedule: WeeklyMealSchedule
): {
  dailyCalories: number;
  macros: MacroTargets;
  weeklyDistribution: WeeklyMealDistribution;
} {
  const macros = calculateMacroTargets(profile);
  const weeklyDistribution = getDynamicMealDistribution(macros.calories, weeklySchedule);

  return {
    dailyCalories: macros.calories,
    macros,
    weeklyDistribution
  };
}