import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import { createHomeMealGenerationPrompt } from '@/lib/ai/prompts';
import { pexelsClient } from '@/lib/external/pexels-client';
import { withGPTRetry } from '@/lib/utils/retry';

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

// Generate nutrition targets based on survey data
function calculateNutritionTargets(surveyData: any): any {
  if (!surveyData.age || !surveyData.sex || !surveyData.height || !surveyData.weight) {
    // Return null to indicate incomplete data instead of hardcoded fallbacks
    return null;
  }

  const userProfile: UserProfile = {
    age: surveyData.age,
    sex: surveyData.sex,
    height: surveyData.height,
    weight: surveyData.weight,
    activityLevel: surveyData.activityLevel || 'MODERATELY_ACTIVE',
    goal: surveyData.goal || 'GENERAL_WELLNESS'
  };

  const macroTargets = calculateMacroTargets(userProfile);

  // Calculate meal targets (approximate distribution)
  const breakfastPercent = 0.25;
  const lunchPercent = 0.32;
  const dinnerPercent = 0.38;
  const snackPercent = 0.05;

  return {
    dailyCalories: macroTargets.calories,
    dailyProtein: macroTargets.protein,
    dailyCarbs: macroTargets.carbs,
    dailyFat: macroTargets.fat,
    mealTargets: {
      breakfast: {
        calories: Math.round(macroTargets.calories * breakfastPercent),
        protein: Math.round(macroTargets.protein * breakfastPercent),
        carbs: Math.round(macroTargets.carbs * breakfastPercent),
        fat: Math.round(macroTargets.fat * breakfastPercent)
      },
      lunch: {
        calories: Math.round(macroTargets.calories * lunchPercent),
        protein: Math.round(macroTargets.protein * lunchPercent),
        carbs: Math.round(macroTargets.carbs * lunchPercent),
        fat: Math.round(macroTargets.fat * lunchPercent)
      },
      dinner: {
        calories: Math.round(macroTargets.calories * dinnerPercent),
        protein: Math.round(macroTargets.protein * dinnerPercent),
        carbs: Math.round(macroTargets.carbs * dinnerPercent),
        fat: Math.round(macroTargets.fat * dinnerPercent)
      },
      snack: {
        calories: Math.round(macroTargets.calories * snackPercent),
        protein: Math.round(macroTargets.protein * snackPercent),
        carbs: Math.round(macroTargets.carbs * snackPercent),
        fat: Math.round(macroTargets.fat * snackPercent)
      }
    }
  };
}

// Generate home meals based on 7-day schedule
async function generateHomeMealsForSchedule(
  homeMeals: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any
): Promise<any> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS-7DAY] 🏠 Generating ${homeMeals.length} home meals for 7-day schedule...`);

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
      scheduleText
    });

    // Replace the direct fetch with retry wrapper:
    const gptResult = await withGPTRetry(async () => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: prompt }],
          temperature: 0.8,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
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
    console.log(`[HOME-MEALS-7DAY] ✅ Succeeded after ${gptResult.attempts} attempt(s)`);
    const content = data.choices?.[0]?.message?.content || '{}';

    console.log('[HOME-MEALS-7DAY] 🔍 Raw GPT response (first 500 chars):', content.substring(0, 500));

    let parsedResult;
    try {
      parsedResult = JSON.parse(content);
      console.log('[HOME-MEALS-7DAY] ✅ Successfully parsed JSON:', {
        homeMealsCount: parsedResult.homeMeals?.length || 0,
        hasGroceryList: !!parsedResult.groceryList,
        totalEstimatedCost: parsedResult.totalEstimatedCost || 0
      });
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
    console.log(`[HOME-MEALS-7DAY] ✅ Generated ${parsedResult.homeMeals?.length || 0} home meals in ${generationTime}ms`);

    return {
      ...parsedResult,
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

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[HOME-GENERATION] 🚀 Starting home meal generation at ${new Date().toISOString()}`);

  try {
    // Parse request data (may be empty)
    let requestData: { backgroundGeneration?: boolean; mealPlanId?: string } = {};
    try {
      requestData = await req.json();
    } catch {
      console.log(`[HOME-GENERATION] 📄 Empty request body, using defaults`);
    }

    console.log(`[HOME-GENERATION] 📋 Request data:`, {
      backgroundGeneration: requestData.backgroundGeneration,
      mealPlanId: requestData.mealPlanId || 'none - will create new'
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

    // Calculate nutrition targets
    const nutritionTargets = calculateNutritionTargets(surveyData);
    if (!nutritionTargets) {
      console.error(`[HOME-GENERATION] ❌ Survey data incomplete - missing required fields (age, sex, height, weight)`);
      return NextResponse.json({
        error: 'Survey data incomplete',
        message: 'Missing required profile information (age, sex, height, weight)'
      }, { status: 400 });
    }
    console.log(`[HOME-GENERATION] 📊 Calculated nutrition targets: ${nutritionTargets.dailyCalories} calories/day`);

    // Generate home meals (now includes grocery list)
    const homeMealPlan = await generateHomeMealsForSchedule(homeMealsSchedule, surveyData, nutritionTargets);

    // Enhance meals with Pexels images
    console.log(`[HOME-GENERATION] 🖼️ Enhancing meals with images...`);
    const imageStartTime = Date.now();
    const enhancedHomeMeals = await enhanceMealsWithImages(homeMealPlan.homeMeals || []);
    const imageTime = Date.now() - imageStartTime;
    console.log(`[HOME-GENERATION] ✅ Image enhancement completed in ${imageTime}ms`);

    // Update homeMealPlan with enhanced meals
    homeMealPlan.homeMeals = enhancedHomeMeals;

    // Create initial meal plan in database with just home meals
    const weekOfDate = new Date();
    weekOfDate.setHours(0, 0, 0, 0);

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
        const newStatus = (hasRestaurantMeals && hasHomeMeals) ? 'complete' : 'partial';

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
      // Continue anyway since we have the data
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