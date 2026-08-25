import { NextRequest, NextResponse, after } from 'next/server';
import { withRouteBudget, routeRemainingMs } from '@/lib/utils/route-budget';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import { buildNutritionTargets } from '@/lib/utils/nutrition-targets';
import { validateMealPlan } from '@/lib/utils/meal-plan-validator';
import { validateIngredientSums } from '@/lib/utils/ingredient-validator';
import { validateRestrictions } from '@/lib/utils/restriction-validator';
import { buildFallbackGroceryList, enhanceGroceryListWithUsage } from '@/lib/utils/grocery-list';
import { isUsableMeal, isUsableOption } from '@/lib/utils/meal-usability';
import { summarizeCompleteness } from '@/lib/utils/completeness';
import { adjustTargetsForRestaurantBudget } from '@/lib/utils/restaurant-budget';
import { createHomeMealGenerationPrompt, createPlanningPrompt, createDetailPrompt, createGroceryPrompt, HOME_MEAL_NUTRITION_METHOD, type MealFeedbackContext } from '@/lib/ai/prompts';
import { pexelsClient } from '@/lib/external/pexels-client';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';
import { getStartOfWeek } from '@/lib/utils/date-utils';
import { getAuthUserId } from '@/lib/auth';
import { MODELS, tuning } from '@/lib/ai/models';
import { logUsage } from '@/lib/ai/usage';
import {
  GroceryListSchema,
  pinnedMealPlan,
  pinnedMealDetail,
  pinnedHomeMealsLegacy,
  toStrictJsonSchema,
} from '@/lib/ai/schemas';
import { parseChoice } from '@/lib/ai/validate';
import { runVerification, verifyGroceryCoverage } from '@/lib/verification';

export const runtime = 'nodejs';
// 60s is the Hobby ceiling and is valid on every Vercel plan. Without this
// line the route silently inherits the platform default of 10-15s, well
// under what a model call needs. RetryPresets budgets the inner calls to fit.
export const maxDuration = 60;

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

/**
 * A day slot holds `{ primary, alternative }`, and `source` lives on the option
 * — restaurantMeals[n].primary.source === 'restaurant' — never on the slot.
 *
 * The check here used to read `existingMeal.source`, one level too high, so it
 * was always undefined and no restaurant meal was ever recognised. Note that
 * the very next line reached for `existingMeal.primary?.dish`, so the shape was
 * understood; only the test was wrong.
 *
 * The consequence was not a lost log line. The slot then fell through to a
 * branch requiring a new home meal, and home generation produces `{}` for slots
 * it does not own, so all seven restaurant slots were PERSISTED as empty
 * objects. Verified against meal plan cmt07no4n00019k3vunoqntzv on 2026-08-19:
 * `days[friday].meals.lunch` is `{}`. The app looked fine only because
 * /meals/current re-merges restaurantMeals into days on every single read,
 * papering over the stored damage — and the daily calorie summaries, which read
 * the stored days, were computed without any restaurant calories, producing
 * seven bogus "under target" warnings.
 */
function isRestaurantSlot(slot: any): boolean {
  if (!slot || typeof slot !== 'object') return false;
  return slot.source === 'restaurant'
    || slot.primary?.source === 'restaurant'
    || Boolean(slot.primary?.restaurant);
}

/** True when a slot actually holds a meal rather than the `{}` placeholder. */
function hasContent(slot: any): boolean {
  if (!slot || typeof slot !== 'object') return false;
  if (Object.keys(slot).length === 0) return false;
  return Boolean(slot.primary || slot.name || slot.dish);
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
        if (isRestaurantSlot(existingMeal)) {
          console.log(`[MERGE-DAYS] 🏪 Preserving restaurant meal: ${day.day} ${mealType} - ${existingMeal.primary?.dish || 'Unknown'}`);
          day.meals[mealType] = existingMeal;
        } else if (hasContent(newHomeMeal)) {
          console.log(`[MERGE-DAYS] 🏠 Keeping home meal: ${day.day} ${mealType} - ${newHomeMeal.primary?.name || newHomeMeal.name || 'Unknown'}`);
          // Keep the new home meal (already in place)
        } else if (hasContent(existingMeal)) {
          // Neither side claimed this slot, but the previous plan had something
          // in it. Falling through used to leave the empty `{}` that the home
          // structure ships for slots it does not own.
          console.log(`[MERGE-DAYS] ♻️ Restoring existing meal: ${day.day} ${mealType}`);
          day.meals[mealType] = existingMeal;
        } else {
          console.warn(`[MERGE-DAYS] ⚠️ ${day.day} ${mealType} has no meal from either side — leaving empty`);
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

async function getMealFeedbackContext(surveyData: any): Promise<MealFeedbackContext | null> {
  const userId = surveyData.userId || null;
  const sessionId = surveyData.sessionId || null;
  const surveyId = surveyData.id || null;

  if (!userId && !sessionId && !surveyId) return null;

  const feedbackOrFilter = [
    ...(userId ? [{ userId }] : []),
    ...(sessionId ? [{ sessionId }] : []),
  ];

  const consumptionOrFilter = [
    ...(userId ? [{ userId }] : []),
    ...(sessionId ? [{ sessionId }] : []),
    ...(surveyId ? [{ surveyId }] : []),
  ];

  if (feedbackOrFilter.length === 0 && consumptionOrFilter.length === 0) return null;

  const [feedbackLogs, consumptionLogs] = await Promise.all([
    feedbackOrFilter.length > 0 ? prisma.mealFeedbackLog.findMany({
      where: { OR: feedbackOrFilter },
      select: { feedbackType: true, dishName: true, mealType: true, rating: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }) : Promise.resolve([]),
    consumptionOrFilter.length > 0 ? prisma.mealConsumptionLog.findMany({
      where: { OR: consumptionOrFilter },
      select: { wasEaten: true, mealType: true, optionType: true, calories: true },
      orderBy: { loggedAt: 'desc' },
      take: 100,
    }) : Promise.resolve([]),
  ]);

  if (feedbackLogs.length === 0 && consumptionLogs.length === 0) return null;

  const lovedDishes = [...new Set(
    feedbackLogs.filter(f => f.feedbackType === 'loved').map(f => f.dishName)
  )].slice(0, 10);

  const dislikedDishes = [...new Set(
    feedbackLogs.filter(f => f.feedbackType === 'disliked').map(f => f.dishName)
  )].slice(0, 10);

  const skipCounts: Record<string, number> = {};
  const totalCounts: Record<string, number> = {};
  consumptionLogs.forEach(l => {
    if (!l.mealType) return;
    totalCounts[l.mealType] = (totalCounts[l.mealType] || 0) + 1;
    if (!l.wasEaten) skipCounts[l.mealType] = (skipCounts[l.mealType] || 0) + 1;
  });
  const skippedMealTypes = Object.entries(skipCounts)
    .filter(([type, count]) => count / (totalCounts[type] || 1) > 0.3)
    .map(([type]) => type);

  const primCount = consumptionLogs.filter(l => l.optionType === 'primary' && l.wasEaten).length;
  const altCount = consumptionLogs.filter(l => l.optionType === 'alternative' && l.wasEaten).length;
  const preferredOptionType: 'primary' | 'alternative' | 'mixed' =
    primCount === 0 && altCount === 0 ? 'mixed' :
    altCount / (primCount + altCount) > 0.6 ? 'alternative' :
    primCount / (primCount + altCount) > 0.6 ? 'primary' : 'mixed';

  const eatenLogs = consumptionLogs.filter(l => l.wasEaten && l.calories > 0);
  const avgCalorieAdherence = eatenLogs.length > 0
    ? Math.min(100, Math.round(
        eatenLogs.reduce((sum, l) => sum + Math.min(l.calories / 600, 1), 0) / eatenLogs.length * 100
      ))
    : 100;

  return {
    lovedDishes,
    dislikedDishes,
    lovedCuisines: [],
    skippedMealTypes,
    preferredOptionType,
    avgCalorieAdherence,
  };
}

// Generate home meals based on 7-day schedule
async function generateHomeMealsForSchedule(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any,
  targetsByDay?: Record<string, any>
): Promise<any> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS-7DAY] 🏠 Generating ${homeMeals.length} home meals for 7-day schedule...`);

  // A user who eats out every meal reaches here with an empty slot list. Both
  // generation paths pin the array length into the grammar, so this would ask
  // the model for `minItems: 0, maxItems: 0` — a paid round trip whose only
  // legal answer is `[]`, plus a grocery call over nothing. Return the shape
  // the caller expects directly. Same keys, same types, no model call.
  if (homeMeals.length === 0) {
    console.log('[HOME-MEALS-7DAY] ⏭️ No home meals scheduled — skipping generation');
    return {
      homeMeals: [],
      groceryList: buildFallbackGroceryList([]),
      metadata: {
        generationTime: Date.now() - startTime,
        totalHomeMeals: 0,
        nutritionTargets,
        architecture: 'skipped-no-home-meals'
      }
    };
  }

  // Fetch behavioral feedback to improve generation
  const feedbackContext = await getMealFeedbackContext(surveyData);
  if (feedbackContext) {
    console.log(`[HOME-MEALS-7DAY] 📊 Meal feedback: ${feedbackContext.lovedDishes.length} loved, ${feedbackContext.dislikedDishes.length} disliked, skipped: ${feedbackContext.skippedMealTypes.join(', ') || 'none'}`);
  }

  // Try Phase 2 plan+parallel architecture first (NEW DEFAULT)
  try {
    console.log(`[HOME-MEALS-7DAY] 🚀 Trying Phase 2: Plan+Parallel architecture...`);
    const result = await generateHomeMealsParallel(homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext, targetsByDay);
    const totalTime = Date.now() - startTime;
    console.log(`[HOME-MEALS-7DAY] ✅ Phase 2 completed successfully in ${totalTime}ms`);
    return result;
  } catch (phase2Error) {
    console.warn(`[HOME-MEALS-7DAY] ⚠️ Phase 2 failed, falling back to Phase 1:`, (phase2Error as Error).message);

    // Fallback to Phase 1 (original single-call approach)
    return await generateHomeMealsLegacyChunked(homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext);
  }
}

/**
 * Was gpt-4o's hard output maximum — the API rejected more. That is no longer
 * true: MODELS.DETAIL is now a gpt-5 model, and 32000/64000/128000 were all
 * accepted in a direct probe on 2026-08-18. The number is kept as a deliberate
 * conservative cap rather than a vendor limit, because the two-call split below
 * measured no worse on cost and cannot truncate. Raising it is now a real
 * option; splitting is the safer default until someone measures the merged
 * single call.
 */
const LEGACY_MAX_TOKENS = 16384;

/**
 * A full 21-meal legacy week measures at 15424 output tokens — 94% of the
 * ceiling above, which cannot simply be raised. Under strict mode a truncated
 * response is a total loss rather than a short one, so anything past this many
 * slots goes out as two calls and gets merged. Two ~8k calls cost the same as
 * one ~15k call and cannot truncate.
 *
 * The old behaviour hid this: the model returned 1-3 of 21 meals well under
 * the ceiling and nothing checked the count.
 */
const LEGACY_MEALS_PER_CALL = 12;

async function generateHomeMealsLegacyChunked(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any,
  feedbackContext?: MealFeedbackContext | null
): Promise<any> {
  if (homeMeals.length <= LEGACY_MEALS_PER_CALL) {
    return generateHomeMealsLegacy(homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext);
  }

  const mid = Math.ceil(homeMeals.length / 2);
  const halves = [homeMeals.slice(0, mid), homeMeals.slice(mid)];
  console.log(`[HOME-MEALS-LEGACY] ✂️ Splitting ${homeMeals.length} meals into ${halves.map(h => h.length).join('+')} to stay clear of the ${LEGACY_MAX_TOKENS} output ceiling`);

  const results = await Promise.all(
    halves.map(half => generateHomeMealsLegacy(half, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext))
  );

  const mergedMeals = results.flatMap(r => r.homeMeals || []);

  // Rebuild the grocery list over the merged meals rather than concatenating
  // two half-lists, which would double-count anything used in both halves.
  const groceryList = mergedMeals.length > 0 ? buildFallbackGroceryList(mergedMeals) : null;

  const errors = results.map(r => r.error).filter(Boolean);
  console.log(`[HOME-MEALS-LEGACY] ✂️ Merged ${mergedMeals.length}/${homeMeals.length} meals from ${halves.length} calls` +
    (errors.length > 0 ? ` (${errors.length} half failed: ${errors.join('; ')})` : ''));

  return {
    homeMeals: mergedMeals,
    groceryList,
    restrictionViolations: results.flatMap(r => r.restrictionViolations || []),
    ...(errors.length > 0 && mergedMeals.length === 0 ? { error: errors.join('; ') } : {}),
    metadata: {
      generationTime: Math.max(...results.map(r => r.metadata?.generationTime || 0)),
      totalHomeMeals: homeMeals.length,
      nutritionTargets,
      legacySplit: halves.map(h => h.length),
    },
  };
}

// Phase 1: Legacy single-call approach (FALLBACK)
async function generateHomeMealsLegacy(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any,
  feedbackContext?: MealFeedbackContext | null
): Promise<any> {
  const startTime = Date.now();
  let restrictionViolations: any[] = [];
  console.log(`[HOME-MEALS-LEGACY] 🔄 Fallback: Using Phase 1 legacy approach for ${homeMeals.length} meals...`);

  // This is the call that used to return 1-3 of 21 meals every single run.
  // Strict mode alone got it to 21/21; pinning the count keeps it there even
  // after generateHomeMealsLegacyChunked splits the week into halves.
  const LegacySchema = pinnedHomeMealsLegacy(homeMeals.length);

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
    }, feedbackContext ?? undefined);

    // Replace the direct fetch with retry wrapper:
    console.log(`[HOME-MEALS-LEGACY] 🤖 Using model: ${MODELS.DETAIL}, max_tokens: ${LEGACY_MAX_TOKENS}`);
    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.DETAIL,
          // Split, not rewritten: the ~4.7k-token nutrition reference used to
          // sit mid-prompt behind this user's schedule, so the prefix cache
          // never matched it. Leading with it as its own system message makes
          // the second half of a chunked run a cache hit. Both parts stay
          // `system`, and together they carry the same text as before.
          messages: [
            { role: 'system', content: HOME_MEAL_NUTRITION_METHOD },
            { role: 'system', content: prompt }
          ],
          ...tuning(MODELS.DETAIL, { maxTokens: LEGACY_MAX_TOKENS, temperature: 0.5 }),
          response_format: toStrictJsonSchema('home_meals_legacy', LegacySchema)
        }),
        signal: signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new HttpError(response.status, `GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
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
    logUsage('home-meals-legacy', LEGACY_MAX_TOKENS, data);

    // Store token usage for later logging
    const tokenUsage = data.usage;

    console.log(`[HOME-MEALS-7DAY] ✅ Succeeded after ${gptResult.attempts} attempt(s)`);

    // Refusal, content filtering, truncation, bad JSON and shape drift all land
    // here. The four hand-rolled structural checks this replaces did not cover
    // truncation, which was the failure that actually happened in measurement.
    const legacyParsed = parseChoice(LegacySchema, data.choices?.[0], 'home-meals-legacy');

    let parsedResult: any;
    if (legacyParsed.ok) {
      parsedResult = legacyParsed.data;
      console.log(`[HOME-MEALS-LEGACY] ✅ Parsed ${parsedResult.homeMeals.length}/${homeMeals.length} meals, grocery list present`);
      if (parsedResult.homeMeals.length < homeMeals.length) {
        console.error(`[HOME-MEALS-LEGACY] ⚠️ Short week: ${parsedResult.homeMeals.length}/${homeMeals.length} meals requested`);
      }

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
        const requiredCategories = ['proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'snacks'];
        if (parsedResult.groceryList) {
          parsedResult.groceryList = enhanceGroceryListWithUsage(
            parsedResult.groceryList,
            parsedResult.homeMeals
          );
          // Post-parse guard: backfill any missing categories
          const missingCategories = requiredCategories.filter(
            cat => !parsedResult.groceryList[cat] || parsedResult.groceryList[cat].length === 0
          );
          if (missingCategories.length > 0) {
            console.warn(`[HOME-MEALS-LEGACY] ⚠️ Grocery list missing categories: ${missingCategories.join(', ')} — backfilling from ingredients`);
            const fallback = buildFallbackGroceryList(parsedResult.homeMeals);
            missingCategories.forEach(cat => {
              parsedResult.groceryList[cat] = fallback[cat] || [];
            });
          }
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
    } else {
      console.error(`[HOME-MEALS-LEGACY] ❌ ${legacyParsed.reason}: ${legacyParsed.detail}`);
      console.error('[HOME-MEALS-LEGACY] Raw content (first 1000):', legacyParsed.raw.substring(0, 1000));
      parsedResult = {
        homeMeals: [],
        groceryList: null,
        totalEstimatedCost: 0,
        weeklyBudgetUsed: "0%",
        error: `Failed to parse meal data (${legacyParsed.reason})`
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

    // Awaited by the caller inside after(), which keeps the serverless instance
    // alive past the response. Orphaning this promise dropped prices whenever
    // the platform reclaimed the instance first — invisibly, since it always
    // completes locally.
    const res = await fetch(`${url}/api/ai/meals/generate-groceries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[HOME-MEALS] ✅ Grocery prices complete: ${data.itemCount} items, best store: ${data.recommendedStore}`);
    } else {
      console.warn('[HOME-MEALS] ⚠️ Grocery price lookup failed:', res.status);
    }
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
  weeklyNutritionTargets?: any,
  feedbackContext?: MealFeedbackContext | null
): Promise<any> {
  console.log(`[HOME-MEALS-7DAY] 📋 Phase 1: Planning ${homeMeals.length} meals...`);
  const startTime = Date.now();

  // The prompt enumerates every slot by day and meal type, so the count is
  // known exactly and safe to pin into the grammar. See `exactly` in schemas/index.
  const PlanSchema = pinnedMealPlan(homeMeals.length);

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
  }, feedbackContext ?? undefined);

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS.PLANNING,
        // 21 home meals costs ~2900 output tokens at ~138/meal. The old 2000
        // ceiling truncated 10/10 in measurement, which threw in JSON.parse and
        // silently dropped every full-home-meal week to the legacy fallback.
        messages: [{ role: 'system', content: planningPrompt }],
        ...tuning(MODELS.PLANNING, { maxTokens: 8000, temperature: 0.7 }),
        response_format: toStrictJsonSchema('meal_plan', PlanSchema)
      }),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new HttpError(response.status, `GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    return response.json();
  }, 'Meal planning');

  if (!gptResult.success) {
    throw new Error(`Meal planning failed: ${gptResult.error}`);
  }

  const data = gptResult.data;
  logUsage('home-meals-planning', 8000, data);

  const planningTime = Date.now() - startTime;
  const tokenUsage = data.usage;

  if (tokenUsage) {
    console.log(`[HOME-MEALS-7DAY] ✅ Planning complete in ${planningTime}ms (prompt: ${tokenUsage.prompt_tokens} tokens, response: ${tokenUsage.completion_tokens} tokens)`);
  } else {
    console.log(`[HOME-MEALS-7DAY] ✅ Planning complete in ${planningTime}ms`);
  }

  const parsed = parseChoice(PlanSchema, data.choices?.[0], 'home-meals-planning');
  if (!parsed.ok) {
    throw new Error(`Meal planning ${parsed.reason}: ${parsed.detail}`);
  }

  console.log(`[HOME-MEALS-7DAY] 📝 Planning parsed: ${parsed.data.mealPlan.length}/${homeMeals.length} meals`);
  return parsed.data;
}

/**
 * Phase 2: Detail Generation - Generate full recipes for a chunk of planned meals
 */
async function generateMealDetails(
  plannedMealsChunk: any[],
  surveyData: any,
  nutritionTargets: any,
  chunkName: string,
  targetsByDay?: Record<string, any>
): Promise<any> {
  console.log(`[HOME-MEALS-7DAY] 📋 Phase 2: Generating details for ${chunkName} (${plannedMealsChunk.length} meals)...`);
  const startTime = Date.now();

  // Pinned to the chunk size. This phase came back short about one run in three
  // before the count was in the grammar.
  const DetailSchema = pinnedMealDetail(plannedMealsChunk.length);

  // A7. Prefer the chunk's own day over the week-level object, which is
  // Monday's. A chunk can span days (Fri-Sun), so the first day is not exact —
  // but it is strictly closer than always being Monday, and formatNutritionTargets
  // already carries the exact per-day numbers into the prompt when they vary.
  const chunkDay = plannedMealsChunk[0]?.day?.toLowerCase();
  const effectiveTargets = (chunkDay && targetsByDay?.[chunkDay]) || nutritionTargets;

  // Create detail prompt with planned meals and user context
  const detailPrompt = createDetailPrompt(plannedMealsChunk, {
    homeMeals: plannedMealsChunk.map(m => ({day: m.day, mealType: m.mealType})),
    surveyData,
    nutritionTargets: effectiveTargets,
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
        model: MODELS.DETAIL,
        messages: [{ role: 'system', content: detailPrompt }],
        // Measured p95 6283 against the old 8000 ceiling — 79%, too close to
        // truncate safely once strict mode makes a cut-off response a hard fail.
        ...tuning(MODELS.DETAIL, { maxTokens: 12000, temperature: 0.5 }),
        response_format: toStrictJsonSchema('meal_detail', DetailSchema)
      }),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new HttpError(response.status, `GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    return response.json();
  }, `Detail generation ${chunkName}`);

  // A failed chunk is not fatal. Its meals come back missing and the top-up
  // pass in generateHomeMealsParallel gets a second attempt at just those slots.
  if (!gptResult.success) {
    console.error(`[HOME-MEALS-7DAY] ❌ ${chunkName} failed: ${gptResult.error} — deferring to top-up`);
    return { meals: [] };
  }

  const data = gptResult.data;
  logUsage(`home-meals-detail:${chunkName}`, 12000, data);

  const detailTime = Date.now() - startTime;
  const tokenUsage = data.usage;

  if (tokenUsage) {
    console.log(`[HOME-MEALS-7DAY] ✅ ${chunkName} complete in ${detailTime}ms (prompt: ${tokenUsage.prompt_tokens} tokens, response: ${tokenUsage.completion_tokens} tokens)`);
  } else {
    console.log(`[HOME-MEALS-7DAY] ✅ ${chunkName} complete in ${detailTime}ms`);
  }

  const parsed = parseChoice(DetailSchema, data.choices?.[0], `home-meals-detail:${chunkName}`);
  if (!parsed.ok) {
    console.error(`[HOME-MEALS-7DAY] ❌ ${chunkName} ${parsed.reason}: ${parsed.detail} — deferring to top-up`);
    return { meals: [] };
  }

  console.log(`[HOME-MEALS-7DAY] 📝 ${chunkName} parsed: ${parsed.data.meals.length}/${plannedMealsChunk.length} meals with recipes`);
  return parsed.data;
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
        model: MODELS.DETAIL,
        messages: [{ role: 'system', content: groceryPrompt }],
        ...tuning(MODELS.DETAIL, { maxTokens: 4000, temperature: 0.3 }),
        response_format: toStrictJsonSchema('grocery_list', GroceryListSchema)
      }),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new HttpError(response.status, `GPT API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    return response.json();
  }, 'Grocery list generation');

  // The caller already backfills a null list from the meals' own ingredients,
  // so a grocery failure costs polish, not the meal plan.
  if (!gptResult.success) {
    console.error(`[HOME-MEALS-7DAY] ❌ Grocery generation failed: ${gptResult.error} — backfilling from ingredients`);
    return { groceryList: null };
  }

  const data = gptResult.data;
  logUsage('home-meals-grocery', 4000, data);

  const groceryTime = Date.now() - startTime;
  const tokenUsage = data.usage;

  if (tokenUsage) {
    console.log(`[HOME-MEALS-7DAY] ✅ Grocery list complete in ${groceryTime}ms (prompt: ${tokenUsage.prompt_tokens} tokens, response: ${tokenUsage.completion_tokens} tokens)`);
  } else {
    console.log(`[HOME-MEALS-7DAY] ✅ Grocery list complete in ${groceryTime}ms`);
  }

  const parsed = parseChoice(GroceryListSchema, data.choices?.[0], 'home-meals-grocery');
  if (!parsed.ok) {
    console.error(`[HOME-MEALS-7DAY] ❌ Grocery ${parsed.reason}: ${parsed.detail} — backfilling from ingredients`);
    return { groceryList: null };
  }

  const list = parsed.data.groceryList as Record<string, unknown[]>;
  const categories = Object.keys(list);
  const totalItems = categories.reduce((sum, cat) => sum + (list[cat]?.length || 0), 0);
  console.log(`[HOME-MEALS-7DAY] ✅ Grocery list: ${totalItems} items across ${categories.length} categories (${categories.join(', ')})`);

  return parsed.data;
}

/**
 * Main Plan+Parallel Generation Function
 */
async function generateHomeMealsParallel(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any,
  weeklyNutritionTargets?: any,
  feedbackContext?: MealFeedbackContext | null,
  targetsByDay?: Record<string, any>
): Promise<any> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS-7DAY] 🚀 Starting plan+parallel generation for ${homeMeals.length} home meals...`);

  // A4. Every degradation below used to be a console line and nothing else, so
  // "we ran out of time" and "there was nothing to generate" produced identical
  // responses. Each site records what it gave up and how much budget was left
  // when it did — a generic "budget exhausted" is not actionable; the phase and
  // the slot count are.
  const degradationReasons: string[] = [];
  const budgetNote = () => {
    const left = routeRemainingMs();
    return left === null ? 'no route budget in scope' : `${Math.max(0, Math.round(left / 1000))}s of route budget left`;
  };

  try {
    // Phase 1: Plan all meals
    const planningResult = await planWeekMeals(homeMeals, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext);

    // The grammar pins the response to { mealPlan: [...] }, so the old
    // plannedMeals || mealPlan || meals guessing is dead weight.
    const plannedMeals: any[] = planningResult.mealPlan;

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
      throw new Error('No meals planned - planning phase returned an empty mealPlan');
    }

    // Planning top-up. The model routinely returns fewer slots than asked for —
    // measurement caught 3 of 21 — and nothing downstream noticed, so the user
    // got a seven-day plan with three meals in it. Ask again for just the gaps
    // rather than failing or re-running the whole phase.
    const slotKey = (m: { day: string; mealType: string }) =>
      `${m.day?.toLowerCase()}|${m.mealType?.toLowerCase()}`;
    const plannedKeys = new Set(plannedMeals.map(slotKey));
    const unplanned = homeMeals.filter(m => !plannedKeys.has(slotKey(m)));

    if (unplanned.length > 0) {
      console.warn(`[HOME-MEALS-7DAY] 🔁 Planning top-up: ${unplanned.length}/${homeMeals.length} slots unplanned (${unplanned.map(slotKey).join(', ')})`);
      try {
        const topUp = await planWeekMeals(unplanned, surveyData, nutritionTargets, weeklyNutritionTargets, feedbackContext);
        for (const m of topUp.mealPlan as any[]) {
          if (!plannedKeys.has(slotKey(m))) {
            plannedKeys.add(slotKey(m));
            plannedMeals.push(m);
          }
        }
        console.log(`[HOME-MEALS-7DAY] 🔁 Planning top-up recovered ${plannedMeals.length}/${homeMeals.length} slots`);
      } catch (e) {
        console.error(`[HOME-MEALS-7DAY] ❌ Planning top-up failed: ${(e as Error).message} — continuing with ${plannedMeals.length} slots`);
        degradationReasons.push(
          `planning top-up failed with ${unplanned.length} slot(s) unplanned (${(e as Error).message}); ${budgetNote()}`
        );
      }
      const stillUnplanned = homeMeals.filter(m => !plannedKeys.has(slotKey(m)));
      if (stillUnplanned.length > 0) {
        degradationReasons.push(
          `planning left ${stillUnplanned.length} slot(s) unplanned after top-up: ${stillUnplanned.map(slotKey).join(', ')}`
        );
      }
    }

    // Phase 2: Split planned meals into chunks for parallel processing
    // Day names come straight from the model. The schema constrains them to the
    // seven weekday strings but not their casing, so "Monday" is a legal
    // response. Match case-insensitively or every chunk silently comes back
    // empty and the user gets a successful response with a blank week.
    const dayOf = (m: any) => String(m?.day ?? '').toLowerCase();
    const chunks = [
      { name: "Chunk A (Mon-Tue)", meals: plannedMeals.filter((m: any) => ['monday', 'tuesday'].includes(dayOf(m))) },
      { name: "Chunk B (Wed-Thu)", meals: plannedMeals.filter((m: any) => ['wednesday', 'thursday'].includes(dayOf(m))) },
      { name: "Chunk C (Fri-Sun)", meals: plannedMeals.filter((m: any) => ['friday', 'saturday', 'sunday'].includes(dayOf(m))) }
    ].filter(chunk => chunk.meals.length > 0);

    console.log(`[HOME-MEALS-7DAY] 📋 Phase 2: Generating details for ${chunks.length} chunks in parallel...`);

    // Generate details for all chunks in parallel
    const detailResults = await Promise.all(
      chunks.map(chunk => generateMealDetails(chunk.meals, surveyData, nutritionTargets, chunk.name, targetsByDay))
    );

    // Merge all detail results
    const allMeals: any[] = detailResults.flatMap(result => result.meals);

    console.log(`[HOME-MEALS-7DAY] 📋 Phase 3: Merging ${allMeals.length} meals...`);

    // A meal that arrived but carries no recipe is not a delivered meal.
    //
    // The 2026-08-18 run shipped four meals at 0 cal / 0 protein and ten with
    // empty ingredients and instructions, because the top-up below keyed on
    // `day|mealType` alone: the slot was present, so it counted as detailed and
    // was never retried. Presence was standing in for content. The schema could
    // not catch it either — `z.array(z.string())` is satisfied by `[]` and
    // `z.number()` by `0`, so strict mode passed all of it.
    // Moved to meal-usability.ts so it can be tested; see that file for the rest.

    // Detail top-up, same reasoning as planning: one extra call over just the
    // slots a chunk dropped or failed on, instead of shipping a short week.
    const detailedKeys = new Set(allMeals.filter(isUsableMeal).map(slotKey));
    const undetailed = plannedMeals.filter(m => !detailedKeys.has(slotKey(m)));

    const hollow = allMeals.filter(m => !isUsableMeal(m));
    if (hollow.length > 0) {
      console.warn(`[HOME-MEALS-7DAY] ⚠️ ${hollow.length} meals came back hollow (no recipe or zero macros): ${hollow.map(slotKey).join(', ')}`);
      degradationReasons.push(
        `${hollow.length} meal(s) arrived hollow and were dropped before the detail top-up: ${hollow.map(slotKey).join(', ')}`
      );
      // Drop them so the top-up's results replace rather than collide with them.
      for (let i = allMeals.length - 1; i >= 0; i--) {
        if (!isUsableMeal(allMeals[i])) allMeals.splice(i, 1);
      }
    }

    // Not a retry trigger — see isUsableMeal. But a week where every second
    // choice is empty is a half-delivered week, and until now nothing said so.
    const hollowAlternatives = (allMeals as any[]).filter((m) => !isUsableOption(m.alternative));
    if (hollowAlternatives.length > 0) {
      console.warn(`[HOME-MEALS-7DAY] ⚠️ ${hollowAlternatives.length}/${allMeals.length} meals have no usable alternative`);
      degradationReasons.push(
        `${hollowAlternatives.length}/${allMeals.length} meal(s) have no usable second choice`
      );
    }

    if (undetailed.length > 0) {
      console.warn(`[HOME-MEALS-7DAY] 🔁 Detail top-up: ${undetailed.length}/${plannedMeals.length} meals missing detail (${undetailed.map(slotKey).join(', ')})`);
      const topUp = await generateMealDetails(undetailed, surveyData, nutritionTargets, 'top-up', targetsByDay);
      for (const m of topUp.meals as any[]) {
        // Same content bar on the way back in. A hollow meal is worse than an
        // absent one: it renders as a card reading "0 cal / 0g protein" with no
        // recipe behind it, which reads as a broken product rather than a gap.
        // The week being short is logged loudly just below.
        if (!detailedKeys.has(slotKey(m)) && isUsableMeal(m)) {
          detailedKeys.add(slotKey(m));
          allMeals.push(m);
        }
      }
      const stillMissing = plannedMeals.filter(m => !detailedKeys.has(slotKey(m)));
      console.log(`[HOME-MEALS-7DAY] 🔁 Detail top-up: now ${allMeals.length}/${homeMeals.length} meals` +
        (stillMissing.length > 0 ? `, unrecovered: ${stillMissing.map(slotKey).join(', ')}` : ''));
      if (stillMissing.length > 0) {
        degradationReasons.push(
          `detail top-up left ${stillMissing.length} slot(s) without a usable recipe: ${stillMissing.map(slotKey).join(', ')}; ${budgetNote()}`
        );
      }
    }

    if (allMeals.length < homeMeals.length) {
      console.error(`[HOME-MEALS-7DAY] ⚠️ Delivering ${allMeals.length}/${homeMeals.length} home meals — the week is short`);
    }

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

    // A1. These three validators were written, and every call site sat in
    // generateHomeMealsLegacy — the path that only runs when this one throws.
    // In practice nothing has ever validated a home meal plan. They report
    // rather than block: a flawed week is still a week, and the user asked for
    // one. What changes is that the response can now say so.
    const planValidation = validateMealPlan(allMeals, weeklyNutritionTargets?.days ?? {});

    const ingredientErrors: string[] = [];
    for (const meal of allMeals as any[]) {
      for (const option of [meal.primary, meal.alternative]) {
        if (!option) continue;
        const result = validateIngredientSums(option.name, {
          estimatedCalories: option.estimatedCalories,
          protein: option.protein,
          carbs: option.carbs,
          fat: option.fat,
          ingredientsWithNutrition: option.ingredientsWithNutrition,
        });
        result.errors.forEach((e) => ingredientErrors.push(`${meal.day} ${meal.mealType}: ${e}`));
      }
    }

    // validateRestrictions takes the survey's three restriction fields as an
    // OBJECT — `{ dietPrefs, strictExclusions, foodAllergies }` — not a flat
    // list. Check the signature in restriction-validator.ts before changing
    // this; a flat array type-errors.
    const userRestrictions = {
      dietPrefs: surveyData.dietPrefs ?? [],
      foodAllergies: surveyData.foodAllergies ?? [],
      strictExclusions: (surveyData.strictExclusions as Record<string, string[]> | null) ?? undefined,
    };
    const hasRestrictions =
      userRestrictions.dietPrefs.length > 0 ||
      userRestrictions.foodAllergies.length > 0 ||
      Object.values(userRestrictions.strictExclusions ?? {}).some((v) => v.length > 0);

    // Skipped when the user has no restrictions: it would iterate every meal to
    // prove nothing, inside a route sharing a 52-second deadline.
    const restrictionResult = hasRestrictions
      ? validateRestrictions(
          (allMeals as any[]).flatMap((m) => [m.primary, m.alternative].filter(Boolean)),
          userRestrictions
        )
      : { valid: true, violations: [] as any[] };

    console.log(
      `[HOME-MEALS-7DAY] 🔎 Validation: ${planValidation.errors.length} plan error(s), ` +
      `${planValidation.warnings.length} warning(s), ${ingredientErrors.length} ingredient sum error(s), ` +
      `${restrictionResult.violations.length} restriction violation(s)`
    );
    ingredientErrors.forEach((e) => console.error(`[HOME-MEALS-7DAY] ❌ ${e}`));

    // Phase 3: Generate grocery list
    console.log(`[HOME-MEALS-7DAY] 📋 Phase 4: Grocery consolidation...`);
    const groceryResult = await generateGroceryList(allMeals, surveyData);

    // Post-parse guard: ensure all 6 required categories are present
    const requiredCategories = ['proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'snacks'];
    let groceryList = groceryResult.groceryList || null;
    if (groceryList) {
      const missingCategories = requiredCategories.filter(cat => !groceryList[cat] || groceryList[cat].length === 0);
      if (missingCategories.length > 0) {
        console.warn(`[HOME-MEALS-7DAY] ⚠️ Grocery list missing categories: ${missingCategories.join(', ')} — backfilling from ingredients`);
        const fallback = buildFallbackGroceryList(allMeals);
        missingCategories.forEach(cat => {
          if (fallback[cat] && fallback[cat].length > 0) {
            groceryList[cat] = fallback[cat];
          } else {
            groceryList[cat] = [];
          }
        });
      }
    } else {
      console.warn(`[HOME-MEALS-7DAY] ⚠️ No grocery list from GPT — using fallback`);
      groceryList = buildFallbackGroceryList(allMeals);
    }

    // Does the list cover the recipes it was built from? Both sides are already
    // in memory, so this costs no network time and cannot extend the deadline.
    // Shadow mode: it logs and rides along in the payload, nothing branches on it.
    const verification = runVerification(
      () => verifyGroceryCoverage(
        (allMeals as any[]).flatMap(m =>
          [m?.primary, m?.alternative].filter(Boolean).flatMap((o: any) => (o.ingredients ?? []) as string[])
        ),
        Object.values(groceryList ?? {}).flat().map((i: any) => String(i?.name ?? i ?? ''))
      ),
      'groceries'
    );
    console.log(`[VERIFY] groceries: ${JSON.stringify(verification.counts)}`);

    const completeness = summarizeCompleteness({
      requested: homeMeals,
      delivered: allMeals,
      reasons: degradationReasons,
    });
    if (completeness.status !== 'complete') {
      console.error(`[HOME-MEALS-7DAY] 📉 ${completeness.status}: ${completeness.deliveredSlots}/${completeness.requestedSlots} slots. Missing: ${completeness.missingSlots.join(', ')}. Reasons: ${completeness.reasons.join('; ') || 'none recorded'}`);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[HOME-MEALS-7DAY] 🏁 Total plan+parallel generation: ${totalTime}ms`);

    return {
      completeness,
      homeMeals: allMeals,
      groceryList,
      verification,
      metadata: {
        generationTime: totalTime,
        totalHomeMeals: allMeals.length,
        nutritionTargets,
        architecture: 'plan+parallel'
      },
      validation: {
        planErrors: planValidation.errors,
        planWarnings: planValidation.warnings,
        ingredientErrors,
        restrictionViolations: restrictionResult.violations,
        dailySummaries: planValidation.dailySummaries,
        hollowAlternatives: hollowAlternatives.length,
      },
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[HOME-MEALS-7DAY] ❌ Plan+parallel generation failed after ${totalTime}ms:`, error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  return withRouteBudget(() => handleGenerate_home(req));
}

async function handleGenerate_home(req: NextRequest) {
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
    const userId = await getAuthUserId();
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

    // A7. Per-day legacy targets. The week-level `nutritionTargets` above is
    // Monday's, because convertToLegacyTargets falls through to
    // Object.values(days)[0] when given no day — under a variable named
    // `avgDay`, which is not an average. Everything that knows which day it is
    // generating should read from here instead.
    const targetsByDay: Record<string, any> = {};
    Object.keys(adjustedTargets?.days ?? {}).forEach(day => {
      targetsByDay[day] = convertToLegacyTargets(adjustedTargets, day);
    });

    // Generate home meals (now includes grocery list)
    const homeMealPlan = await generateHomeMealsForSchedule(homeMealsSchedule, surveyData, nutritionTargets, adjustedTargets, targetsByDay);

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
      // Both maps are keyed lowercase; the model's strings are not guaranteed to
      // be. Without normalising, a "Monday"/"Breakfast" response drops the meal
      // from the calendar while homeMeals[] still looks populated.
      const day = String(meal?.day ?? '').toLowerCase();
      const mealType = String(meal?.mealType ?? '').toLowerCase();
      if (homeMealsByDay[day] && homeMealsByDay[day].plannedMeals[mealType] === 'home') {
        homeMealsByDay[day].meals[mealType] = {
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
      // Keyed by generator: the restaurant route writes its own report into this
      // same userContext, and an unkeyed value would let the later route win.
      verification: { groceries: homeMealPlan.verification ?? null },
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
              // This object is written by both generators. Spreading
              // initialMealPlan alone would drop a restaurants report that
              // landed first.
              verification: {
                ...(existingContext.verification ?? {}),
                groceries: homeMealPlan.verification ?? null,
              },
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

      // Runs after the response is flushed, but the platform keeps the instance
      // alive for it.
      after(triggerGroceryPriceLookup(surveyData.id));

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

    // A10. A run that produced nothing used to return 200 with success:true.
    // The client renders an empty week and has no way to tell it apart from a
    // week the user genuinely has no home meals in. 502 rather than 500: the
    // generation upstream failed, this handler did not.
    if (homeMealPlan.completeness?.status === 'empty') {
      console.error('[HOME-GENERATION] ❌ Zero meals generated — returning 502 rather than an empty success');
      return NextResponse.json({
        error: 'Home meal generation produced no meals',
        completeness: homeMealPlan.completeness,
        validation: homeMealPlan.validation ?? null,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      homeMealPlan: initialMealPlan,
      groceryList: homeMealPlan.groceryList || null,
      totalEstimatedCost: homeMealPlan.totalEstimatedCost || 0,
      weeklyBudgetUsed: homeMealPlan.weeklyBudgetUsed || "0%",
      // `?? null` rather than a default object: the legacy path does not produce
      // these, and a fabricated status:'complete' for a path we did not measure
      // would be exactly the lie this change exists to remove.
      completeness: homeMealPlan.completeness ?? null,
      validation: homeMealPlan.validation ?? null,
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