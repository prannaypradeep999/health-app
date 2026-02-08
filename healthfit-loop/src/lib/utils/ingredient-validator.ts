export interface IngredientNutrition {
  item: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface IngredientValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  details: {
    ingredientCount: number;
    summedCalories: number;
    statedCalories: number;
    calorieDeviation: number;
    summedProtein: number;
    statedProtein: number;
    proteinDeviation: number;
    summedCarbs: number;
    statedCarbs: number;
    carbsDeviation: number;
    summedFat: number;
    statedFat: number;
    fatDeviation: number;
  } | null;
}

export function validateIngredientSums(
  mealName: string,
  mealData: {
    estimatedCalories?: number;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    ingredientsWithNutrition?: IngredientNutrition[];
  }
): IngredientValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const calories = mealData.estimatedCalories ?? mealData.calories ?? 0;
  const protein = mealData.protein ?? 0;
  const carbs = mealData.carbs ?? 0;
  const fat = mealData.fat ?? 0;

  if (!mealData.ingredientsWithNutrition || mealData.ingredientsWithNutrition.length === 0) {
    warnings.push(`${mealName}: No ingredientsWithNutrition data - cannot validate sums`);
    return { valid: true, warnings, errors, details: null };
  }

  const ingredients = mealData.ingredientsWithNutrition;
  const summed = ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.calories || 0),
      protein: acc.protein + (ing.protein || 0),
      carbs: acc.carbs + (ing.carbs || 0),
      fat: acc.fat + (ing.fat || 0)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const THRESHOLD_WARNING = 10;
  const THRESHOLD_ERROR = 20;

  const calorieDeviation = calories > 0
    ? Math.abs(calories - summed.calories) / calories * 100
    : 0;
  const proteinDeviation = protein > 0
    ? Math.abs(protein - summed.protein) / protein * 100
    : 0;
  const carbsDeviation = carbs > 0
    ? Math.abs(carbs - summed.carbs) / carbs * 100
    : 0;
  const fatDeviation = fat > 0
    ? Math.abs(fat - summed.fat) / fat * 100
    : 0;

  if (calorieDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Calorie mismatch - ingredients sum to ${summed.calories} but stated ${calories} (${calorieDeviation.toFixed(1)}% off)`
    );
  } else if (calorieDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Calorie deviation - ingredients sum to ${summed.calories} vs stated ${calories} (${calorieDeviation.toFixed(1)}% off)`
    );
  }

  if (proteinDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Protein mismatch - ingredients sum to ${summed.protein}g but stated ${protein}g`
    );
  } else if (proteinDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Protein deviation - ingredients sum to ${summed.protein}g vs stated ${protein}g`
    );
  }

  if (carbsDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Carbs mismatch - ingredients sum to ${summed.carbs}g but stated ${carbs}g`
    );
  } else if (carbsDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Carbs deviation - ingredients sum to ${summed.carbs}g vs stated ${carbs}g`
    );
  }

  if (fatDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Fat mismatch - ingredients sum to ${summed.fat}g but stated ${fat}g`
    );
  } else if (fatDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Fat deviation - ingredients sum to ${summed.fat}g vs stated ${fat}g`
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    details: {
      ingredientCount: ingredients.length,
      summedCalories: summed.calories,
      statedCalories: calories,
      calorieDeviation,
      summedProtein: summed.protein,
      statedProtein: protein,
      proteinDeviation,
      summedCarbs: summed.carbs,
      statedCarbs: carbs,
      carbsDeviation,
      summedFat: summed.fat,
      statedFat: fat,
      fatDeviation
    }
  };
}
