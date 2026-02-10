import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import { buildNutritionTargets } from '@/lib/utils/nutrition-targets';
import { validateMealPlan } from '@/lib/utils/meal-plan-validator';
import { validateIngredientSums } from '@/lib/utils/ingredient-validator';
import { validateRestrictions } from '@/lib/utils/restriction-validator';
import { buildFallbackGroceryList, enhanceGroceryListWithUsage } from '@/lib/utils/grocery-list';
import { createHomeMealGenerationPrompt, createPlanningPrompt, createDetailPrompt, createGroceryPrompt } from '@/lib/ai/prompts';
import { pexelsClient } from '@/lib/external/pexels-client';
import { withGPTRetry } from '@/lib/utils/retry';
import { getStartOfWeek } from '@/lib/utils/date-utils';

export const runtime = 'nodejs';

/**
 * Home Meal Generation API Route
 * 
 * CHANGES MADE:
 * - Fixed bug: userId → cleanUserId when saving to database (line ~220)
 * - Now returns groceryList in the response for dashboard preview
 * - Added groceryList and grocerySummary to the saved meal plan
 */

// Helper function to extract home meals from weekly schedule
function extractHomeMealsFromSchedule(weeklyMealSchedule: any): Array<{day: string, mealType: string}> {
  const homeMeals: Array<{day: string, mealType: string}> = [];

  if (!weeklyMealSchedule || typeof weeklyMealSchedule !== 'object') {
    // Default to all home meals if no schedule provided
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const mealTypes = ['breakfast', 'lunch', 'dinner'];

    days.forEach(day => {
      mealTypes.forEach(mealType => {
        homeMeals.push({ day, mealType });
      });
    });
    return homeMeals;
  }

  Object.entries(weeklyMealSchedule).forEach(([day, meals]: [string, any]) => {
    if (meals?.breakfast === 'home') homeMeals.push({ day, mealType: 'breakfast' });
    if (meals?.lunch === 'home') homeMeals.push({ day, mealType: 'lunch' });
    if (meals?.dinner === 'home') homeMeals.push({ day, mealType: 'dinner' });
  });

  return homeMeals;
}

// Helper function to merge days arrays combining home and restaurant meals
function mergeDaysWithRestaurantMeals(newHomeDays: any[], existingDays: any[]): any[] {
  console.log(`[MERGE-DAYS] 🔄 Merging days - Home: ${newHomeDays.length}, Existing: ${existingDays.length}`);

  // Start with the new home days structure
  const mergedDays = [...newHomeDays];

  // For each day in the merged structure, check if the existing structure has restaurant meals
  mergedDays.forEach((day, dayIndex) => {
    // Find the corresponding day in existing structure
    const existingDay = existingDays.find(ed => ed.day === day.day || ed.date === day.date);

    if (existingDay && existingDay.meals) {
      // Merge meals for each meal type, keeping restaurant meals from existing
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const existingMeal = existingDay.meals[mealType];
        const newHomeMeal = day.meals[mealType];

        // If existing meal is a restaurant meal, keep it; otherwise use new home meal
        if (existingMeal && existingMeal.source === 'restaurant') {
          console.log(`[MERGE-DAYS] 🏪 Preserving restaurant meal: ${day.day} ${mealType} - ${existingMeal.primary?.dish || 'Unknown'}`);
          day.meals[mealType] = existingMeal;
        } else if (newHomeMeal && newHomeMeal.source !== 'restaurant') {
          console.log(`[MERGE-DAYS] 🏠 Keeping home meal: ${day.day} ${mealType} - ${newHomeMeal.name || 'Unknown'}`);
          // Keep the new home meal (already in place)
        }
      });
    }
  });

  console.log(`[MERGE-DAYS] ✅ Merged ${mergedDays.length} days with combined home and restaurant meals`);
  return mergedDays;
}

// Build daily calorie summaries for UI/debugging
function buildDailyCalorieSummaries(days: any[], dailyTarget: number) {
  const summaries = days.map(day => {
    const plannedMeals = day.plannedMeals || {};
    const meals = day.meals || {};

    const getMealData = (mealType: 'breakfast' | 'lunch' | 'dinner') => {
      const meal = meals[mealType];
      const plannedType = plannedMeals[mealType];

      if (!meal || plannedType === 'no-meal') {
        return { calories: 0, source: 'skipped' as const };
      }

      const calories =
        meal?.primary?.calories ??
        meal?.primary?.estimatedCalories ??
        meal?.calories ??
        meal?.estimatedCalories ??
        0;

      const source =
        meal?.source ||
        meal?.primary?.source ||
        (plannedType === 'restaurant' ? 'restaurant' : 'home');

      return { calories, source: source as 'home' | 'restaurant' | 'skipped' };
    };

    const breakfast = getMealData('breakfast');
    const lunch = getMealData('lunch');
    const dinner = getMealData('dinner');
    const planned = breakfast.calories + lunch.calories + dinner.calories;
    const deviation = dailyTarget > 0 ? ((planned - dailyTarget) / dailyTarget) * 100 : 0;

    const status =
      Math.abs(deviation) <= 10 ? 'on-target' :
      deviation < -15 ? 'under' :
      deviation > 15 ? 'over' : 'warning';

    return {
      day: day.day,
      target: dailyTarget,
      planned,
      breakdown: { breakfast, lunch, dinner },
      deviation,
      status
    };
  });

  console.log('[DAILY-SUMMARY] Weekly calorie overview:');
  summaries.forEach(summary => {
    const icon = summary.status === 'on-target' ? '✓' : '⚠';
    console.log(`  ${summary.day}: ${summary.planned} / ${summary.target} (${summary.deviation.toFixed(1)}%) ${icon} ${summary.status}`);
  });

  return summaries;
}

function hasHomeSlots(weeklySchedule: any): boolean {
  if (!weeklySchedule || typeof weeklySchedule !== 'object') return true;
  return Object.values(weeklySchedule).some((day: any) =>
    day?.breakfast === 'home' || day?.lunch === 'home' || day?.dinner === 'home'
  );
}

function hasRestaurantSlots(weeklySchedule: any): boolean {
  if (!weeklySchedule || typeof weeklySchedule !== 'object') return false;
  return Object.values(weeklySchedule).some((day: any) =>
    day?.breakfast === 'restaurant' || day?.lunch === 'restaurant' || day?.dinner === 'restaurant'
  );
}

// Adjust nutrition targets based on restaurant meal budget
function adjustTargetsForRestaurantBudget(
  weeklyTargets: any,
  restaurantCalories: Array<{ day: string; mealType: string; calories: number }>
): any {
  if (!weeklyTargets || !weeklyTargets.days) return weeklyTargets;

  const adjustedDays = { ...weeklyTargets.days };

  // For each day, subtract restaurant calories from daily total and redistribute
  restaurantCalories.forEach(({ day, mealType, calories }) => {
    const dayKey = day.toLowerCase();
    const dayTargets = adjustedDays[dayKey];

    if (!dayTargets) return;

    console.log(`[BUDGET-ADJUST] ${day} ${mealType}: reducing by ${calories} calories`);

    // Calculate remaining calories for home meals
    const remainingCalories = Math.max(0, weeklyTargets.dailyCalories - calories);

    // Get home meal slots for this day (excluding the restaurant meal)
    const homeMealSlots = [];
    if (mealType !== 'breakfast' && dayTargets.breakfast?.source === 'home') homeMealSlots.push('breakfast');
    if (mealType !== 'lunch' && dayTargets.lunch?.source === 'home') homeMealSlots.push('lunch');
    if (mealType !== 'dinner' && dayTargets.dinner?.source === 'home') homeMealSlots.push('dinner');

    if (homeMealSlots.length === 0) return; // No home meals to adjust

    // Redistribute remaining calories across home meals
    if (homeMealSlots.length === 1) {
      // One home meal gets all remaining calories (capped at 1200)
      const slot = homeMealSlots[0] as 'breakfast' | 'lunch' | 'dinner';
      const newCalories = Math.min(remainingCalories, 1200);
      const proportion = newCalories / weeklyTargets.dailyCalories;

      adjustedDays[dayKey][slot] = {
        ...dayTargets[slot],
        calories: newCalories,
        protein: Math.round(weeklyTargets.macros.protein * proportion),
        carbs: Math.round(weeklyTargets.macros.carbs * proportion),
        fat: Math.round(weeklyTargets.macros.fat * proportion)
      };
    } else if (homeMealSlots.length === 2) {
      // Two home meals - distribute 40/60
      const smallerMeal = Math.round(remainingCalories * 0.4);
      const largerMeal = remainingCalories - smallerMeal;

      homeMealSlots.forEach((slot, index) => {
        const slotTyped = slot as 'breakfast' | 'lunch' | 'dinner';
        const calories = index === 0 ? smallerMeal : largerMeal;
        const proportion = calories / weeklyTargets.dailyCalories;

        adjustedDays[dayKey][slotTyped] = {
          ...dayTargets[slotTyped],
          calories,
          protein: Math.round(weeklyTargets.macros.protein * proportion),
          carbs: Math.round(weeklyTargets.macros.carbs * proportion),
          fat: Math.round(weeklyTargets.macros.fat * proportion)
        };
      });
    }
  });

  return {
    ...weeklyTargets,
    days: adjustedDays
  };
}

// Convert new nutrition targets to legacy format for backward compatibility
function convertToLegacyTargets(weeklyTargets: any, day?: string): any {
  if (!weeklyTargets) return null;

  // If specific day requested, get that day's targets
  if (day && weeklyTargets.days[day.toLowerCase()]) {
    const dayTargets = weeklyTargets.days[day.toLowerCase()];
    return {
      dailyCalories: weeklyTargets.dailyCalories,
      dailyProtein: weeklyTargets.macros.protein,
      dailyCarbs: weeklyTargets.macros.carbs,
      dailyFat: weeklyTargets.macros.fat,
      mealTargets: {
        breakfast: dayTargets.breakfast || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        lunch: dayTargets.lunch || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        dinner: dayTargets.dinner || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        snack: { calories: 0, protein: 0, carbs: 0, fat: 0 } // No snack support in new system yet
      }
    };
  }

  // Default: return general targets with average meal distribution
  const avgDay = Object.values(weeklyTargets.days)[0] as any;
  return {
    dailyCalories: weeklyTargets.dailyCalories,
    dailyProtein: weeklyTargets.macros.protein,
    dailyCarbs: weeklyTargets.macros.carbs,
    dailyFat: weeklyTargets.macros.fat,
    mealTargets: {
      breakfast: avgDay?.breakfast || { calories: Math.round(weeklyTargets.dailyCalories * 0.25), protein: Math.round(weeklyTargets.macros.protein * 0.25), carbs: Math.round(weeklyTargets.macros.carbs * 0.25), fat: Math.round(weeklyTargets.macros.fat * 0.25) },
      lunch: avgDay?.lunch || { calories: Math.round(weeklyTargets.dailyCalories * 0.35), protein: Math.round(weeklyTargets.macros.protein * 0.35), carbs: Math.round(weeklyTargets.macros.carbs * 0.35), fat: Math.round(weeklyTargets.macros.fat * 0.35) },
      dinner: avgDay?.dinner || { calories: Math.round(weeklyTargets.dailyCalories * 0.40), protein: Math.round(weeklyTargets.macros.protein * 0.40), carbs: Math.round(weeklyTargets.macros.carbs * 0.40), fat: Math.round(weeklyTargets.macros.fat * 0.40) },
      snack: { calories: 0, protein: 0, carbs: 0, fat: 0 }
    }
  };
}

// Generate home meals based on 7-day schedule
async function generateHomeMealsForSchedule(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any
): Promise<any> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS-7DAY] 🏠 Generating ${homeMeals.length} home meals for 7-day schedule...`);

  // Try Phase 2 plan+parallel architecture first (NEW DEFAULT)
  try {
    console.log(`[HOME-MEALS-7DAY] 🚀 Trying Phase 2: Plan+Parallel architecture...`);
    const result = await generateHomeMealsParallel(homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets);
    const totalTime = Date.now() - startTime;
    console.log(`[HOME-MEALS-7DAY] ✅ Phase 2 completed successfully in ${totalTime}ms`);
    return result;
  } catch (phase2Error) {
    console.warn(`[HOME-MEALS-7DAY] ⚠️ Phase 2 failed, falling back to Phase 1:`, (phase2Error as Error).message);

    // Fallback to Phase 1 (original single-call approach)
    return await generateHomeMealsLegacy(homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets);
  }
}

// Phase 1: Legacy single-call approach (FALLBACK)
async function generateHomeMealsLegacy(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any
): Promise<any> {
  const startTime = Date.now();
  let restrictionViolations: any[] = [];
  console.log(`[HOME-MEALS-LEGACY] 🔄 Fallback: Using Phase 1 legacy approach for ${homeMeals.length} meals...`);

  try {
    // Organize meals by type for better prompting
    const mealsByType = homeMeals.reduce((acc, meal) => {
      if (!acc[meal.mealType]) acc[meal.mealType] = [];
      acc[meal.mealType].push(meal.day);
      return acc;
    }, {} as Record<string, string[]>);

    // Build schedule summary
    const scheduleText = Object.entries(mealsByType).map(([mealType, days]) =>
      `${mealType.charAt(0).toUpperCase() + mealType.slice(1)}: ${days.join(', ')}`
    ).join('\n');

    const prompt = createHomeMealGenerationPrompt({
      homeMeals,
      surveyData,
      nutritionTargets,
      scheduleText,
      weeklyNutritionTargets: weeklyNutritionTargets
    });

    // Replace the direct fetch with retry wrapper:
    console.log(`[HOME-MEALS-LEGACY] 🤖 Using model: gpt-4o, max_tokens: 16384`);
    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: prompt }],
          temperature: 0.5,
          max_tokens: 16384,
          response_format: { type: "json_object" }
        }),
        signal: signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
      }

      return response.json();
    }, 'Home meal generation');

    if (!gptResult.success) {
      console.error(`[HOME-MEALS-7DAY] ❌ Generation failed after ${gptResult.attempts} attempts`);
      return {
        homeMeals: [],
        groceryList: null,
        error: gptResult.error,
        retryAttempts: gptResult.attempts
      };
    }

    const data = gptResult.data;

    // Store token usage for later logging
    const tokenUsage = data.usage;

    // Check for OpenAI refusal or content filtering
    if (data.choices?.[0]?.finish_reason === 'content_filter') {
      console.error('[HOME-MEALS-7DAY] ❌ Content filtered by OpenAI');
      return {
        homeMeals: [],
        groceryList: null,
        error: 'Content filtered by OpenAI - please try rephrasing your meal preferences',
        retryAttempts: gptResult.attempts
      };
    }

    if (data.choices?.[0]?.message?.refusal) {
      console.error('[HOME-MEALS-7DAY] ❌ OpenAI refused request:', data.choices[0].message.refusal);
      return {
        homeMeals: [],
        groceryList: null,
        error: `OpenAI refused request: ${data.choices[0].message.refusal}`,
        retryAttempts: gptResult.attempts
      };
    }

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('[HOME-MEALS-7DAY] ❌ Invalid response structure - no choices');
      return {
        homeMeals: [],
        groceryList: null,
        error: 'Invalid response structure from OpenAI',
        retryAttempts: gptResult.attempts
      };
    }

    if (!data.choices[0]?.message?.content) {
      console.error('[HOME-MEALS-7DAY] ❌ Invalid response structure - no content');
      return {
        homeMeals: [],
        groceryList: null,
        error: 'No content in OpenAI response',
        retryAttempts: gptResult.attempts
      };
    }

    console.log(`[HOME-MEALS-7DAY] ✅ Succeeded after ${gptResult.attempts} attempt(s)`);
    const content = data.choices[0].message.content;

    console.log('[HOME-MEALS-7DAY] 🔍 Raw GPT response (first 500 chars):', content.substring(0, 500));

    let parsedResult;
    try {
      parsedResult = JSON.parse(content);
      console.log('[HOME-MEALS-7DAY] ✅ Successfully parsed JSON:', {
        homeMealsCount: parsedResult.homeMeals?.length || 0,
        hasGroceryList: !!parsedResult.groceryList,
        totalEstimatedCost: parsedResult.totalEstimatedCost || 0
      });

      // Validate meal plan against nutrition targets
      if (parsedResult.homeMeals && weeklyNutritionTargets) {
        const validationResult = validateMealPlan(
          parsedResult.homeMeals,
          weeklyNutritionTargets.days
        );

        console.log('[HOME-MEALS-7DAY] Validation:', {
          valid: validationResult.valid,
          warnings: validationResult.warnings.length,
          errors: validationResult.errors.length
        });

        if (!validationResult.valid) {
          console.warn('[HOME-MEALS-7DAY] ⚠️ Meal plan has validation errors:');
          validationResult.errors.forEach(err => console.error(`  ❌ ${err}`));
        }
        validationResult.warnings.forEach(warn => console.warn(`  ⚠️ ${warn}`));

        // DON'T block saving - just log for now. We'll tighten later.
      }

      if (parsedResult.homeMeals && Array.isArray(parsedResult.homeMeals)) {
        let totalMealsValidated = 0;
        let totalErrors = 0;
        let totalWarnings = 0;

        parsedResult.homeMeals.forEach((meal: any) => {
          const day = meal.day || 'unknown-day';
          const mealType = meal.mealType || 'unknown-meal';

          if (meal.primary) {
            const validation = validateIngredientSums(
              `${day} ${mealType} (primary)`,
              meal.primary
            );
            totalMealsValidated += 1;
            totalErrors += validation.errors.length;
            totalWarnings += validation.warnings.length;

            validation.errors.forEach((e) => console.error(`[INGREDIENT-VALIDATOR] ❌ ${e}`));
            validation.warnings.forEach((w) => console.warn(`[INGREDIENT-VALIDATOR] ⚠️ ${w}`));
            if (validation.valid && validation.details) {
              console.log(`[INGREDIENT-VALIDATOR] ✅ ${day} ${mealType} (primary): ${validation.details.ingredientCount} ingredients, sums match`);
            }
          }

          if (meal.alternative) {
            const validation = validateIngredientSums(
              `${day} ${mealType} (alternative)`,
              meal.alternative
            );
            totalMealsValidated += 1;
            totalErrors += validation.errors.length;
            totalWarnings += validation.warnings.length;

            validation.errors.forEach((e) => console.error(`[INGREDIENT-VALIDATOR] ❌ ${e}`));
            validation.warnings.forEach((w) => console.warn(`[INGREDIENT-VALIDATOR] ⚠️ ${w}`));
            if (validation.valid && validation.details) {
              console.log(`[INGREDIENT-VALIDATOR] ✅ ${day} ${mealType} (alternative): ${validation.details.ingredientCount} ingredients, sums match`);
            }
          }
        });

        console.log(`[INGREDIENT-VALIDATOR] Summary: validated ${totalMealsValidated} meals, ${totalErrors} errors, ${totalWarnings} warnings`);
      }

      if (parsedResult.homeMeals && Array.isArray(parsedResult.homeMeals)) {
        if (parsedResult.groceryList) {
          parsedResult.groceryList = enhanceGroceryListWithUsage(
            parsedResult.groceryList,
            parsedResult.homeMeals
          );
        } else {
          parsedResult.groceryList = buildFallbackGroceryList(parsedResult.homeMeals);
        }
      }

      const userRestrictions = {
        dietPrefs: surveyData.dietPrefs || [],
        strictExclusions: surveyData.strictExclusions || {},
        foodAllergies: surveyData.foodAllergies || [],
      };

      const restrictionMeals: any[] = [];
      (parsedResult.homeMeals || []).forEach((meal: any) => {
        const day = meal.day || 'unknown';
        const mealType = meal.mealType || 'unknown';
        if (meal.primary) {
          restrictionMeals.push({
            ...meal.primary,
            name: meal.primary.name || meal.primary.dish || meal.primary.description,
            ingredients: meal.primary.ingredients || [],
            day,
            mealType,
            option: 'primary'
          });
        }
        if (meal.alternative) {
          restrictionMeals.push({
            ...meal.alternative,
            name: meal.alternative.name || meal.alternative.dish || meal.alternative.description,
            ingredients: meal.alternative.ingredients || [],
            day,
            mealType,
            option: 'alternative'
          });
        }
      });

      const restrictionValidation = validateRestrictions(restrictionMeals, userRestrictions);
      restrictionViolations = restrictionValidation.violations;

      if (!restrictionValidation.valid) {
        restrictionValidation.violations.forEach(v => {
          console.error(`[RESTRICTION-VALIDATOR] ❌ ${v.day} ${v.mealType}: "${v.mealName}" violates ${v.restriction} (contains ${v.ingredient})`);
        });
        console.error(`[RESTRICTION-VALIDATOR] Found ${restrictionValidation.violations.length} restriction violations`);
      } else {
        console.log(`[RESTRICTION-VALIDATOR] ✅ All meals pass restriction checks`);
      }
    } catch (parseError) {
      console.error('[HOME-MEALS-7DAY] JSON parse failed:', parseError);
      console.error('[HOME-MEALS-7DAY] Raw content (full):', content);
      parsedResult = {
        homeMeals: [],
        groceryList: null,
        totalEstimatedCost: 0,
        weeklyBudgetUsed: "0%",
        error: 'Failed to parse meal data'
      };
    }

    const generationTime = Date.now() - startTime;
    if (tokenUsage) {
      console.log(`[HOME-MEALS-7DAY] ✅ GPT home meals generated in ${generationTime}ms (prompt: ${tokenUsage.prompt_tokens} tokens, response: ${tokenUsage.completion_tokens} tokens)`);
    } else {
      console.log(`[HOME-MEALS-7DAY] ✅ GPT home meals generated in ${generationTime}ms (token usage not available)`);
    }

    return {
      ...parsedResult,
      restrictionViolations,
      metadata: {
        generationTime,
        totalHomeMeals: homeMeals.length,
        nutritionTargets
      }
    };

  } catch (error) {
    const generationTime = Date.now() - startTime;
    console.error(`[HOME-MEALS-7DAY] ❌ Generation failed after ${generationTime}ms:`, error);
    return {
      homeMeals: [],
      groceryList: null,
      totalEstimatedCost: 0,
      weeklyBudgetUsed: "0%",
      error: (error as Error).message
    };
  }
}

/**
 * Enhance home meals with Pexels images
 * Fetches food images for both primary and alternative meal options
 */
async function enhanceMealsWithImages(homeMeals: any[]): Promise<any[]> {
  const enhanceStartTime = Date.now();
  console.log(`[MEAL-IMAGES] 🖼️ Starting image enhancement for ${homeMeals.length} meals...`);

  if (!homeMeals || homeMeals.length === 0) {
    console.log(`[MEAL-IMAGES] No meals to enhance`);
    return homeMeals;
  }

  // Process all meals in parallel for speed
  const enhancedMeals = await Promise.all(
    homeMeals.map(async (meal) => {
      try {
        const mealStartTime = Date.now();
        
        // Fetch image for primary meal
        let primaryImage = null;
        if (meal.primary?.name) {
          const primaryResult = await pexelsClient.getFoodImage(meal.primary.name, {
            cuisineType: meal.primary.cuisine,
            mealType: meal.mealType,
            searchTerms: meal.primary.tags?.join(' ') || meal.primary.description
          });
          primaryImage = primaryResult.imageUrl;
          console.log(`[MEAL-IMAGES] ${primaryResult.cached ? '📦' : '🌐'} Primary: ${meal.primary.name}`);
        }

        // Fetch image for alternative meal
        let alternativeImage = null;
        if (meal.alternative?.name) {
          const altResult = await pexelsClient.getFoodImage(meal.alternative.name, {
            cuisineType: meal.alternative.cuisine,
            mealType: meal.mealType,
            searchTerms: meal.alternative.tags?.join(' ') || meal.alternative.description
          });
          alternativeImage = altResult.imageUrl;
          console.log(`[MEAL-IMAGES] ${altResult.cached ? '📦' : '🌐'} Alt: ${meal.alternative.name}`);
        }

        const mealTime = Date.now() - mealStartTime;
        console.log(`[MEAL-IMAGES] ${meal.day} ${meal.mealType} enhanced in ${mealTime}ms`);

        return {
          ...meal,
          primary: meal.primary ? {
            ...meal.primary,
            imageUrl: primaryImage
          } : null,
          alternative: meal.alternative ? {
            ...meal.alternative,
            imageUrl: alternativeImage
          } : null
        };

      } catch (error) {
        console.error(`[MEAL-IMAGES] Error enhancing ${meal.day} ${meal.mealType}:`, error);
        return meal; // Return original meal if image fetch fails
      }
    })
  );

  const enhanceTime = Date.now() - enhanceStartTime;
  console.log(`[MEAL-IMAGES] ✅ All meal images enhanced in ${enhanceTime}ms`);

  return enhancedMeals;
}

/**
 * Trigger background grocery price lookup
 * Runs after meal plan is saved to enrich grocery list with real local prices
 */
async function triggerGroceryPriceLookup(surveyId: string) {
  console.log('[HOME-MEALS] 🛒 Triggering background grocery price lookup...');

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

    // Fire and forget - don't await
    fetch(`${url}/api/ai/meals/generate-groceries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}`
      }
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        console.log(`[HOME-MEALS] ✅ Grocery prices complete: ${data.itemCount} items, best store: ${data.recommendedStore}`);
      } else {
        console.warn('[HOME-MEALS] ⚠️ Grocery price lookup failed:', res.status);
      }
    }).catch(err => {
      console.error('[HOME-MEALS] ❌ Grocery price lookup error:', err.message);
    });
  } catch (error) {
    console.error('[HOME-MEALS] ❌ Failed to trigger grocery price lookup:', error);
  }
}

// ========================================
// PHASE 2: PLAN+PARALLEL ARCHITECTURE
// ========================================

/**
 * Phase 1: Planning Call - High-level meal planning for the entire week
 */
async function planWeekMeals(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any
): Promise<any> {
  console.log(`[HOME-MEALS-7DAY] 📋 Phase 1: Planning ${homeMeals.length} meals...`);
  const startTime = Date.now();

  // Build schedule summary
  const mealsByType = homeMeals.reduce((acc, meal) => {
    if (!acc[meal.mealType]) acc[meal.mealType] = [];
    acc[meal.mealType].push(meal.day);
    return acc;
  }, {} as Record<string, string[]>);

  const scheduleText = Object.entries(mealsByType).map(([mealType, days]) =>
    `${mealType.charAt(0).toUpperCase() + mealType.slice(1)}: ${days.join(', ')}`
  ).join('\n');

  // Create planning prompt with user context but simpler output
  const planningPrompt = createPlanningPrompt({
    homeMeals,
    surveyData,
    nutritionTargets,
    scheduleText,
    weeklyNutritionTargets
  });

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: planningPrompt }],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      }),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    return response.json();
  }, 'Meal planning');

  if (!gptResult.success) {
    throw new Error(`Meal planning failed: ${gptResult.error}`);
  }

  const data = gptResult.data;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No planning content received');
  }

  const planningTime = Date.now() - startTime;
  const tokenUsage = data.usage;

  if (tokenUsage) {
    console.log(`[HOME-MEALS-7DAY] ✅ Planning complete in ${planningTime}ms (prompt: ${tokenUsage.prompt_tokens} tokens, response: ${tokenUsage.completion_tokens} tokens)`);
  } else {
    console.log(`[HOME-MEALS-7DAY] ✅ Planning complete in ${planningTime}ms`);
  }

  try {
    const planningResult = JSON.parse(content);
    console.log(`[HOME-MEALS-7DAY] 📝 Planning raw response (first 500 chars):`, content.substring(0, 500));
    console.log(`[HOME-MEALS-7DAY] 📝 Planning response structure:`, Object.keys(planningResult));

    return planningResult;
  } catch (parseError) {
    console.error('[HOME-MEALS-7DAY] Planning JSON parse failed:', parseError);
    console.error('[HOME-MEALS-7DAY] Raw content:', content.substring(0, 1000));
    throw new Error('Failed to parse meal planning response');
  }
}

/**
 * Phase 2: Detail Generation - Generate full recipes for a chunk of planned meals
 */
async function generateMealDetails(
  plannedMealsChunk: any[],
  surveyData: any,
  nutritionTargets: any,
  chunkName: string
): Promise<any> {
  console.log(`[HOME-MEALS-7DAY] 📋 Phase 2: Generating details for ${chunkName} (${plannedMealsChunk.length} meals)...`);
  const startTime = Date.now();

  // Create detail prompt with planned meals and user context
  const detailPrompt = createDetailPrompt(plannedMealsChunk, {
    homeMeals: plannedMealsChunk.map(m => ({day: m.day, mealType: m.mealType})),
    surveyData,
    nutritionTargets,
    scheduleText: `Details for ${chunkName}`
  });

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: detailPrompt }],
        temperature: 0.5,
        max_tokens: 8000,
        response_format: { type: "json_object" }
      }),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    return response.json();
  }, `Detail generation ${chunkName}`);

  if (!gptResult.success) {
    throw new Error(`Detail generation failed for ${chunkName}: ${gptResult.error}`);
  }

  const data = gptResult.data;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`No detail content received for ${chunkName}`);
  }

  const detailTime = Date.now() - startTime;
  const tokenUsage = data.usage;

  if (tokenUsage) {
    console.log(`[HOME-MEALS-7DAY] ✅ ${chunkName} complete in ${detailTime}ms (prompt: ${tokenUsage.prompt_tokens} tokens, response: ${tokenUsage.completion_tokens} tokens)`);
  } else {
    console.log(`[HOME-MEALS-7DAY] ✅ ${chunkName} complete in ${detailTime}ms`);
  }

  try {
    const detailResult = JSON.parse(content);
    console.log(`[HOME-MEALS-7DAY] 📝 ${chunkName} raw response (first 500 chars):`, content.substring(0, 500));
    console.log(`[HOME-MEALS-7DAY] 📝 ${chunkName} parsed: ${detailResult.meals?.length || 0} meals with recipes`);

    return detailResult;
  } catch (parseError) {
    console.error(`[HOME-MEALS-7DAY] ${chunkName} JSON parse failed:`, parseError);
    console.error(`[HOME-MEALS-7DAY] ${chunkName} raw content:`, content.substring(0, 1000));
    throw new Error(`Failed to parse detail response for ${chunkName}`);
  }
}

/**
 * Phase 3: Generate grocery list from all meals
 */
async function generateGroceryList(allMeals: any[], surveyData: any): Promise<any> {
  console.log(`[HOME-MEALS-7DAY] 📋 Phase 3: Consolidating grocery list from ${allMeals.length} meals...`);
  const startTime = Date.now();

  // Create grocery prompt
  const groceryPrompt = createGroceryPrompt(allMeals, surveyData);

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: groceryPrompt }],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      }),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    return response.json();
  }, 'Grocery list generation');

  if (!gptResult.success) {
    throw new Error(`Grocery list generation failed: ${gptResult.error}`);
  }

  const data = gptResult.data;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No grocery content received');
  }

  const groceryTime = Date.now() - startTime;
  const tokenUsage = data.usage;

  if (tokenUsage) {
    console.log(`[HOME-MEALS-7DAY] ✅ Grocery list complete in ${groceryTime}ms (prompt: ${tokenUsage.prompt_tokens} tokens, response: ${tokenUsage.completion_tokens} tokens)`);
  } else {
    console.log(`[HOME-MEALS-7DAY] ✅ Grocery list complete in ${groceryTime}ms`);
  }

  try {
    const groceryResult = JSON.parse(content);
    console.log(`[HOME-MEALS-7DAY] 📝 Grocery raw response (first 500 chars):`, content.substring(0, 500));

    const list = groceryResult.groceryList || groceryResult;
    const categories = Object.keys(list || {});
    const totalItems = categories.reduce((sum, cat) => sum + (list[cat]?.length || 0), 0);
    console.log(`[HOME-MEALS-7DAY] ✅ Grocery list: ${totalItems} items across ${categories.length} categories (${categories.join(', ')})`);

    return groceryResult;
  } catch (parseError) {
    console.error('[HOME-MEALS-7DAY] Grocery JSON parse failed:', parseError);
    console.error('[HOME-MEALS-7DAY] Raw grocery content:', content.substring(0, 1000));
    throw new Error('Failed to parse grocery list response');
  }
}

/**
 * Main Plan+Parallel Generation Function
 */
async function generateHomeMealsParallel(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any
): Promise<any> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS-7DAY] 🚀 Starting plan+parallel generation for ${homeMeals.length} home meals...`);

  try {
    // Phase 1: Plan all meals
    const planningResult = await planWeekMeals(homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets);

    // Defensive parsing - try multiple possible response shapes
    const plannedMeals = planningResult.plannedMeals || planningResult.mealPlan || planningResult.meals || [];

    console.log(`[HOME-MEALS-7DAY] 📝 Planning parsed: ${plannedMeals.length} meals found`);
    if (plannedMeals.length > 0) {
      console.log(`[HOME-MEALS-7DAY] 📝 Sample meal:`, {
        day: plannedMeals[0].day,
        mealType: plannedMeals[0].mealType,
        name: plannedMeals[0].plannedName,
        protein: plannedMeals[0].primaryProtein,
        calories: plannedMeals[0].targetCalories
      });
    }

    if (plannedMeals.length === 0) {
      console.error('[HOME-MEALS-7DAY] ❌ Unexpected planning response shape:', Object.keys(planningResult));
      throw new Error(`No meals planned - planning phase failed. Response keys: ${Object.keys(planningResult).join(', ')}`);
    }

    // Phase 2: Split planned meals into chunks for parallel processing
    const chunks = [
      { name: "Chunk A (Mon-Tue)", meals: plannedMeals.filter((m: any) => ['monday', 'tuesday'].includes(m.day)) },
      { name: "Chunk B (Wed-Thu)", meals: plannedMeals.filter((m: any) => ['wednesday', 'thursday'].includes(m.day)) },
      { name: "Chunk C (Fri-Sun)", meals: plannedMeals.filter((m: any) => ['friday', 'saturday', 'sunday'].includes(m.day)) }
    ].filter(chunk => chunk.meals.length > 0);

    console.log(`[HOME-MEALS-7DAY] 📋 Phase 2: Generating details for ${chunks.length} chunks in parallel...`);

    // Generate details for all chunks in parallel
    const detailResults = await Promise.all(
      chunks.map(chunk => generateMealDetails(chunk.meals, surveyData, nutritionTargets, chunk.name))
    );

    // Merge all detail results
    const allMeals = detailResults.flatMap(result => result.meals || []);

    console.log(`[HOME-MEALS-7DAY] 📋 Phase 3: Merging ${allMeals.length} meals...`);

    // Count meals by day for verification
    const mealsByDay = allMeals.reduce((acc: any, meal: any) => {
      if (!acc[meal.day]) acc[meal.day] = 0;
      acc[meal.day]++;
      return acc;
    }, {});
    console.log(`[HOME-MEALS-7DAY] 📝 Merged meals by day:`, mealsByDay);

    if (allMeals.length === 0) {
      console.error('[HOME-MEALS-7DAY] ❌ No detailed meals generated from chunks:',
        detailResults.map((r, i) => `Chunk ${i}: ${r.meals?.length || 0} meals`));
      throw new Error('No detailed meals generated - detail phase failed');
    }

    // Phase 3: Generate grocery list
    console.log(`[HOME-MEALS-7DAY] 📋 Phase 4: Grocery consolidation...`);
    const groceryResult = await generateGroceryList(allMeals, surveyData);

    const totalTime = Date.now() - startTime;
    console.log(`[HOME-MEALS-7DAY] 🏁 Total plan+parallel generation: ${totalTime}ms`);

    return {
      homeMeals: allMeals,
      groceryList: groceryResult.groceryList || null,
      metadata: {
        generationTime: totalTime,
        totalHomeMeals: allMeals.length,
        nutritionTargets,
        architecture: 'plan+parallel'
      }
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[HOME-MEALS-7DAY] ❌ Plan+parallel generation failed after ${totalTime}ms:`, error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[HOME-GENERATION] 🚀 Starting home meal generation at ${new Date().toISOString()}`);

  try {
    // Parse request data (may be empty)
    let requestData: {
      backgroundGeneration?: boolean;
      mealPlanId?: string;
      restaurantCalories?: Array<{ day: string; mealType: string; calories: number }>;
    } = {};
    try {
      requestData = await req.json();
    } catch {
      console.log(`[HOME-GENERATION] 📄 Empty request body, using defaults`);
    }

    console.log(`[HOME-GENERATION] 📋 Request data:`, {
      backgroundGeneration: requestData.backgroundGeneration,
      mealPlanId: requestData.mealPlanId || 'none - will create new',
      restaurantCalories: requestData.restaurantCalories?.length || 0
    });

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    // Clean up undefined/null strings from cookies
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null') ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null') ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null') ? undefined : sessionId;

    console.log(`[HOME-GENERATION] 🍪 Cookies found:`, {
      userId: cleanUserId || 'null',
      sessionId: cleanSessionId || 'null',
      surveyId: cleanSurveyId || 'null'
    });

    // Early exit if no session data available
    if (!cleanUserId && !cleanSurveyId && !cleanSessionId) {
      console.error(`[HOME-GENERATION] ❌ No session data found`);
      return NextResponse.json({
        error: 'No session data found. Please complete the survey first.'
      }, { status: 400 });
    }

    // Get survey data using clean values
    let surveyData = null;
    if (cleanUserId) {
      const user = await prisma.user.findUnique({
        where: { id: cleanUserId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    } else if (cleanSurveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: cleanSurveyId }
      });
    } else if (cleanSessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId }
      });
    }

    if (!surveyData) {
      console.log(`[HOME-GENERATION] ❌ No survey data found`);
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[HOME-GENERATION] ✅ Survey data found for ${surveyData.firstName}`);
    console.log(`[HOME-GENERATION] 📅 Weekly schedule:`, surveyData.weeklyMealSchedule);

    // Extract home meals from schedule
    const homeMealsSchedule = extractHomeMealsFromSchedule(surveyData.weeklyMealSchedule);
    console.log(`[HOME-GENERATION] 🏠 Found ${homeMealsSchedule.length} home meals in schedule`);

    // Calculate nutrition targets using shared function
    const weeklyNutritionTargets = buildNutritionTargets(surveyData);

    // Adjust targets based on restaurant calories if provided
    let adjustedTargets = weeklyNutritionTargets;
    if (requestData.restaurantCalories && requestData.restaurantCalories.length > 0 && weeklyNutritionTargets) {
      console.log(`[HOME-GENERATION] 🏪 Adjusting targets for ${requestData.restaurantCalories.length} restaurant meals...`);
      adjustedTargets = adjustTargetsForRestaurantBudget(weeklyNutritionTargets, requestData.restaurantCalories);
    }

    const nutritionTargets = convertToLegacyTargets(adjustedTargets);
    if (!nutritionTargets) {
      console.error(`[HOME-GENERATION] ❌ Survey data incomplete - missing required fields (age, sex, height, weight)`);
      return NextResponse.json({
        error: 'Survey data incomplete',
        message: 'Missing required profile information (age, sex, height, weight)'
      }, { status: 400 });
    }
    console.log(`[HOME-GENERATION] 📊 Calculated nutrition targets: ${nutritionTargets.dailyCalories} calories/day`);

    // Generate home meals (now includes grocery list)
    const homeMealPlan = await generateHomeMealsForSchedule(homeMealsSchedule, surveyData, nutritionTargets, adjustedTargets);

    // Enhance meals with Pexels images
    console.log(`[HOME-GENERATION] 🖼️ Enhancing meals with images...`);
    const imageStartTime = Date.now();
    const enhancedHomeMeals = await enhanceMealsWithImages(homeMealPlan.homeMeals || []);
    const imageTime = Date.now() - imageStartTime;
    console.log(`[HOME-GENERATION] ✅ Image enhancement completed in ${imageTime}ms`);

    // Update homeMealPlan with enhanced meals
    homeMealPlan.homeMeals = enhancedHomeMeals;

    // Create initial meal plan in database with just home meals
    const weekOfDate = getStartOfWeek();

    // Organize home meals by day for better calendar structure
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const homeMealsByDay: Record<string, any> = {};

    // Initialize all days
    dayOrder.forEach((day, index) => {
      homeMealsByDay[day] = {
        day: day,
        date: new Date(weekOfDate.getTime() + (index * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
        meals: {
          breakfast: null,
          lunch: null,
          dinner: null
        },
        plannedMeals: (surveyData.weeklyMealSchedule as any)?.[day] || { breakfast: 'home', lunch: 'home', dinner: 'home' }
      };
    });

    // Place generated home meals into the correct day/meal slots
    (homeMealPlan.homeMeals || []).forEach((meal: any) => {
      if (homeMealsByDay[meal.day] && homeMealsByDay[meal.day].plannedMeals[meal.mealType] === 'home') {
        homeMealsByDay[meal.day].meals[meal.mealType] = {
          primary: meal.primary,
          alternative: meal.alternative,
          source: 'home'
        };
      }
    });

    const initialMealPlan = {
      days: dayOrder.map(day => homeMealsByDay[day]),
      weeklySchedule: surveyData.weeklyMealSchedule,
      nutritionTargets,
      homeMeals: homeMealPlan.homeMeals || [],
      restrictionViolations: homeMealPlan.restrictionViolations || [],
      groceryList: homeMealPlan.groceryList || null,
      totalEstimatedCost: homeMealPlan.totalEstimatedCost || 0,
      weeklyBudgetUsed: homeMealPlan.weeklyBudgetUsed || "0%",
      metadata: {
        type: 'home_meals_only',
        generationMethod: 'split_pipeline_phase1',
        restaurantsStatus: 'pending',
        totalHomeMeals: (homeMealPlan.homeMeals || []).length,
        ...homeMealPlan.metadata
      }
    };

    try {
      let mealPlan;

      if (requestData.mealPlanId) {
        // Update existing coordinated meal plan - MERGE with existing restaurant data
        console.log(`[HOME-GENERATION] 💾 Updating coordinated meal plan ${requestData.mealPlanId} with home meals...`);

        // First, fetch the existing meal plan to get current context
        const existingMealPlan = await prisma.mealPlan.findUnique({
          where: { id: requestData.mealPlanId }
        });

        if (!existingMealPlan) {
          throw new Error(`Coordinated meal plan ${requestData.mealPlanId} not found`);
        }

        const existingContext = existingMealPlan.userContext as any;
        console.log(`[HOME-GENERATION] 🔄 Merging home meals with existing context...`);
        console.log(`[HOME-GENERATION] 📊 Existing context has:`, {
          hasRestaurantMeals: !!(existingContext.restaurantMeals?.length),
          restaurantCount: existingContext.restaurantMeals?.length || 0,
          hasDays: !!(existingContext.days?.length),
          daysCount: existingContext.days?.length || 0
        });

        // Merge days arrays - combine home meals with any existing restaurant meals
        const mergedDays = mergeDaysWithRestaurantMeals(initialMealPlan.days, existingContext.days || []);

        // Check if both home and restaurant meals are now present
        const hasRestaurantMeals = existingContext.restaurantMeals?.length > 0;
        const hasHomeMeals = initialMealPlan.homeMeals?.length > 0;
        const homeExpected = hasHomeSlots(initialMealPlan.weeklySchedule);
        const restaurantExpected = hasRestaurantSlots(initialMealPlan.weeklySchedule);
        const homeSatisfied = !homeExpected || hasHomeMeals;
        const restaurantSatisfied = !restaurantExpected || hasRestaurantMeals;
        const newStatus = (homeSatisfied && restaurantSatisfied) ? 'complete' : 'partial';

        const dailySummaries = newStatus === 'complete'
          ? buildDailyCalorieSummaries(mergedDays, initialMealPlan.nutritionTargets.dailyCalories)
          : undefined;

        console.log(`[HOME-GENERATION] 📋 Merge summary:`, {
          homeMealsCount: initialMealPlan.homeMeals?.length || 0,
          restaurantMealsCount: existingContext.restaurantMeals?.length || 0,
          mergedDaysCount: mergedDays.length,
          newStatus
        });

        // Update with merged data, preserving existing restaurant context
        mealPlan = await prisma.mealPlan.update({
          where: { id: requestData.mealPlanId },
          data: {
            userContext: {
              ...initialMealPlan,
              // Preserve existing restaurant meals
              restaurantMeals: existingContext.restaurantMeals || [],
              // Use merged days that include both home and restaurant meals
              days: mergedDays,
              restrictionViolations: [
                ...(existingContext.restrictionViolations || []),
                ...(homeMealPlan.restrictionViolations || [])
              ],
              ...(dailySummaries ? { dailySummaries } : {}),
              // Update generator status
              generators: {
                ...existingContext.generators,
                homeMeals: 'completed'
              },
              // Preserve any existing metadata and merge with new
              metadata: {
                ...existingContext.metadata,
                ...initialMealPlan.metadata
              }
            } as any,
            status: newStatus
          }
        });

        console.log(`[HOME-GENERATION] ✅ Updated coordinated meal plan ${requestData.mealPlanId} with merged data (status: ${newStatus})`);
      } else {
        // Create new meal plan (legacy behavior)
        console.log(`[HOME-GENERATION] 💾 Creating new meal plan (legacy mode)...`);
        mealPlan = await prisma.mealPlan.create({
          data: {
            surveyId: surveyData.id,
            userId: cleanUserId || null,
            weekOf: weekOfDate,
            userContext: initialMealPlan as any,
            status: 'partial',
            regenerationCount: 1
          }
        });
        console.log(`[HOME-GENERATION] ✅ Created new meal plan ${mealPlan.id} (legacy mode)`);
      }

      // Trigger grocery price lookup in background
      triggerGroceryPriceLookup(surveyData.id);

    } catch (dbError) {
      console.error(`[HOME-GENERATION] ❌ Failed to save home meal plan:`, dbError);
      console.error(`[HOME-GENERATION] ❌ Full error details:`, {
        name: (dbError as Error).name,
        message: (dbError as Error).message,
        stack: (dbError as Error).stack
      });
      return NextResponse.json(
        {
          error: 'Failed to save home meal plan to database',
          details: (dbError as Error).message,
          homeMealPlanGenerated: true // Plan was generated but not saved
        },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log(`[HOME-GENERATION] 🏁 Home meal generation completed in ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    return NextResponse.json({
      success: true,
      homeMealPlan: initialMealPlan,
      groceryList: homeMealPlan.groceryList || null,
      totalEstimatedCost: homeMealPlan.totalEstimatedCost || 0,
      weeklyBudgetUsed: homeMealPlan.weeklyBudgetUsed || "0%",
      timings: {
        totalTime: `${totalTime}ms`,
        imageEnhancementTime: `${imageTime}ms`,
        homeMealsGenerated: homeMealPlan.homeMeals?.length || 0
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[HOME-GENERATION] Error:', error);
    return NextResponse.json({
      error: 'Failed to generate home meal plan',
      details: (error as Error).message
    }, { status: 500 });
  }
}