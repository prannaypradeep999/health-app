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
    servings?: number;
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

  // ingredientsWithNutrition is whole-recipe — an ingredient line is a shopping
  // quantity. The stated nutrition is per serving, because it is the number
  // already shown on the meal plan card. Comparing them undivided made every
  // multi-serving recipe report a mismatch it did not have.
  const servings = typeof mealData.servings === 'number'
    && Number.isFinite(mealData.servings)
    && mealData.servings >= 1
      ? mealData.servings
      : 1;

  const perServing = {
    calories: summed.calories / servings,
    protein: summed.protein / servings,
    carbs: summed.carbs / servings,
    fat: summed.fat / servings,
  };

  const THRESHOLD_WARNING = 10;
  const THRESHOLD_ERROR = 20;

  const calorieDeviation = calories > 0
    ? Math.abs(calories - perServing.calories) / calories * 100
    : 0;
  const proteinDeviation = protein > 0
    ? Math.abs(protein - perServing.protein) / protein * 100
    : 0;
  const carbsDeviation = carbs > 0
    ? Math.abs(carbs - perServing.carbs) / carbs * 100
    : 0;
  const fatDeviation = fat > 0
    ? Math.abs(fat - perServing.fat) / fat * 100
    : 0;

  if (calorieDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Calorie mismatch - ingredients come to ${Math.round(perServing.calories)} per serving but stated ${calories} (${calorieDeviation.toFixed(1)}% off)`
    );
  } else if (calorieDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Calorie deviation - ingredients come to ${Math.round(perServing.calories)} per serving vs stated ${calories} (${calorieDeviation.toFixed(1)}% off)`
    );
  }

  if (proteinDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Protein mismatch - ingredients come to ${Math.round(perServing.protein)}g per serving but stated ${protein}g`
    );
  } else if (proteinDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Protein deviation - ingredients come to ${Math.round(perServing.protein)}g per serving vs stated ${protein}g`
    );
  }

  if (carbsDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Carbs mismatch - ingredients come to ${Math.round(perServing.carbs)}g per serving but stated ${carbs}g`
    );
  } else if (carbsDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Carbs deviation - ingredients come to ${Math.round(perServing.carbs)}g per serving vs stated ${carbs}g`
    );
  }

  if (fatDeviation > THRESHOLD_ERROR) {
    errors.push(
      `${mealName}: Fat mismatch - ingredients come to ${Math.round(perServing.fat)}g per serving but stated ${fat}g`
    );
  } else if (fatDeviation > THRESHOLD_WARNING) {
    warnings.push(
      `${mealName}: Fat deviation - ingredients come to ${Math.round(perServing.fat)}g per serving vs stated ${fat}g`
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    details: {
      ingredientCount: ingredients.length,
      summedCalories: perServing.calories,
      statedCalories: calories,
      calorieDeviation,
      summedProtein: perServing.protein,
      statedProtein: protein,
      proteinDeviation,
      summedCarbs: perServing.carbs,
      statedCarbs: carbs,
      carbsDeviation,
      summedFat: perServing.fat,
      statedFat: fat,
      fatDeviation
    }
  };
}
