import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import { createHomeMealGenerationPrompt } from '@/lib/ai/prompts';
import { pexelsClient } from '@/lib/external/pexels-client';

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

// Generate nutrition targets based on survey data
function calculateNutritionTargets(surveyData: any): any {
  if (!surveyData.age || !surveyData.sex || !surveyData.height || !surveyData.weight) {
    // Provide defaults for missing data
    return {
      dailyCalories: 2000,
      dailyProtein: 120,
      dailyCarbs: 250,
      dailyFat: 67,
      mealTargets: {
        breakfast: { calories: 500, protein: 25, carbs: 60, fat: 17 },
        lunch: { calories: 650, protein: 35, carbs: 85, fat: 22 },
        dinner: { calories: 750, protein: 45, carbs: 90, fat: 25 },
        snack: { calories: 100, protein: 15, carbs: 15, fat: 3 }
      }
    };
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
      throw new Error(`Home meal generation failed: ${response.status}`);
    }

    const data = await response.json();
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

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[HOME-GENERATION] 🚀 Starting home meal generation at ${new Date().toISOString()}`);

  try {
    // Parse request data (may be empty)
    let requestData: { backgroundGeneration?: boolean } = {};
    try {
      requestData = await req.json();
    } catch {
      console.log(`[HOME-GENERATION] 📄 Empty request body, using defaults`);
    }

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
      console.log(`[HOME-GENERATION] 💾 Saving initial home meal plan to database...`);
      const createdMealPlan = await prisma.mealPlan.create({
        data: {
          surveyId: surveyData.id,
          userId: cleanUserId || null, // FIXED: was using 'userId' instead of 'cleanUserId'
          weekOf: weekOfDate,
          userContext: initialMealPlan as any,
          status: 'partial',
          regenerationCount: 1
        }
      });
      console.log(`[HOME-GENERATION] ✅ Home meal plan saved with ID: ${createdMealPlan.id}`);
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