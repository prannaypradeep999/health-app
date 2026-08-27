export interface MealValidationDetail {
  mealType: string;
  name: string;
  calories: number;
  target: number;
  deviationPercent: number;
  macroCheck: {
    statedCalories: number;
    calculatedFromMacros: number; // protein*4 + carbs*4 + fat*9
    deviationPercent: number;
  };
}

export interface DayValidationSummary {
  day: string;
  totalCalories: number;
  targetCalories: number;
  deviationPercent: number;
  meals: MealValidationDetail[];
}

export interface ValidationResult {
  valid: boolean;          // true if no errors (warnings are OK)
  warnings: string[];      // 10-15% deviation, minor issues
  errors: string[];        // >15% deviation, sanity check failures
  dailySummaries: DayValidationSummary[];
}

export function validateMealPlan(
  meals: any[],           // Parsed LLM response - the homeMeals array
  weeklyTargets: any      // From buildNutritionTargets - the days record
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const dailySummaries: DayValidationSummary[] = [];

  // Group meals by day
  const mealsByDay: Record<string, any[]> = {};
  meals.forEach(meal => {
    const day = meal.day?.toLowerCase();
    if (!day) return;
    if (!mealsByDay[day]) mealsByDay[day] = [];
    mealsByDay[day].push(meal);
  });

  // Validate each day
  Object.entries(mealsByDay).forEach(([day, dayMeals]) => {
    const dayTargets = weeklyTargets[day];
    if (!dayTargets) {
      warnings.push(`No targets found for ${day}`);
      return;
    }

    const mealValidations: MealValidationDetail[] = [];
    let dayTotalCalories = 0;

    // Validate each meal
    dayMeals.forEach(meal => {
      const mealType = meal.mealType?.toLowerCase();

      // A MealSlot is { day, mealType, primary, alternative } — the nutrition
      // lives on the option objects, not the envelope. This function read
      // `meal.calories` and therefore scored every slot at 0 kcal, which made
      // every meal simultaneously 100% off target and below the 150 cal floor.
      // The envelope read stays as a fallback because the legacy path in
      // generate-home/route.ts passes a flattened shape.
      const option = meal.primary ?? meal;
      const mealName = option.name || meal.recipeName || meal.dishName || 'Unnamed meal';
      const calories = option.estimatedCalories ?? option.calories ?? meal.calories ?? 0;

      // Get target for this meal slot
      const mealTarget = dayTargets[mealType];
      const target = mealTarget?.calories || 0;

      if (target === 0) {
        warnings.push(`No target found for ${day} ${mealType}`);
        return;
      }

      // 1. MEAL-LEVEL CALORIE CHECK
      const deviationPercent = Math.abs(calories - target) / target * 100;

      if (deviationPercent > 15) {
        errors.push(`${day} ${mealType}: ${Math.round(deviationPercent)}% off target (${calories} vs ${target} cal)`);
      } else if (deviationPercent > 10) {
        warnings.push(`${day} ${mealType}: ${Math.round(deviationPercent)}% off target (${calories} vs ${target} cal)`);
      }

      // 2. SANITY CHECK - ABSOLUTE BOUNDS
      if (calories < 150) {
        errors.push(`${day} ${mealType}: Too low (${calories} cal) - minimum 150 cal per meal`);
      } else if (calories < 200) {
        warnings.push(`${day} ${mealType}: Suspiciously low (${calories} cal)`);
      }

      if (calories > 1200) {
        errors.push(`${day} ${mealType}: Too high (${calories} cal) - maximum 1200 cal per meal`);
      }

      // 3. MACRO CONSISTENCY CHECK
      const protein = option.protein || 0;
      const carbs = option.carbs || option.carbohydrates || 0;
      const fat = option.fat || 0;

      const calculatedCalories = (protein * 4) + (carbs * 4) + (fat * 9);
      const macroDeviationPercent = calories > 0 ? Math.abs(calories - calculatedCalories) / calories * 100 : 0;

      if (macroDeviationPercent > 15) {
        warnings.push(`${day} ${mealType}: Macro inconsistency - stated ${calories} cal vs calculated ${Math.round(calculatedCalories)} cal`);
      }

      mealValidations.push({
        mealType,
        name: mealName,
        calories,
        target,
        deviationPercent,
        macroCheck: {
          statedCalories: calories,
          calculatedFromMacros: Math.round(calculatedCalories),
          deviationPercent: macroDeviationPercent
        }
      });

      dayTotalCalories += calories;
    });

    // 4. DAILY TOTAL CHECK
    //
    // Against the slots we were actually given, NOT `dailyTotals`.
    //
    // This function is called on the home meals alone, while `dailyTotals`
    // covers the whole day including anything eaten out. A user with a
    // restaurant lunch and dinner leaves breakfast and snacks here — about a
    // quarter of the day — and comparing that quarter against the whole
    // produced `friday daily total: 75% off target (820 vs 3254 cal)` on five
    // of seven days of an otherwise correct plan. Every meal had passed its own
    // slot target immediately above.
    //
    // Summing the supplied slots' targets asks the question that is actually
    // meant: do these meals add up to what these meals were for? It reduces to
    // `dailyTotals` exactly when every slot is present, which is the all-home
    // case this check was written against.
    const dailyTarget = mealValidations.reduce((sum, m) => sum + m.target, 0);
    const dailyDeviationPercent = dailyTarget > 0 ? Math.abs(dayTotalCalories - dailyTarget) / dailyTarget * 100 : 0;

    if (dailyDeviationPercent > 10) {
      errors.push(`${day} daily total: ${Math.round(dailyDeviationPercent)}% off target (${dayTotalCalories} vs ${dailyTarget} cal)`);
    } else if (dailyDeviationPercent > 8) {
      warnings.push(`${day} daily total: ${Math.round(dailyDeviationPercent)}% off target (${dayTotalCalories} vs ${dailyTarget} cal)`);
    }

    dailySummaries.push({
      day,
      totalCalories: dayTotalCalories,
      targetCalories: dailyTarget,
      deviationPercent: dailyDeviationPercent,
      meals: mealValidations
    });
  });

  const valid = errors.length === 0;

  // 5. Log everything to console
  console.log('[MEAL-VALIDATOR] Validation result:', {
    valid,
    warningCount: warnings.length,
    errorCount: errors.length
  });

  errors.forEach(message => {
    console.error('[MEAL-VALIDATOR] ERROR:', message);
  });

  warnings.forEach(message => {
    console.warn('[MEAL-VALIDATOR] WARNING:', message);
  });

  return {
    valid,
    warnings,
    errors,
    dailySummaries
  };
}