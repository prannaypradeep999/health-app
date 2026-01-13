import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getStartOfWeek } from '@/lib/utils/date-utils';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';

const shouldLog = true; // Enable logging for debugging

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const mealPlanId = cookieStore.get('meal_plan_id')?.value;

    // Clean up undefined/null strings from cookies (including literal strings and actual nulls)
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null' || userId === null) ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null' || surveyId === null) ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null' || sessionId === null) ? undefined : sessionId;
    const cleanMealPlanId = (!mealPlanId || mealPlanId === 'undefined' || mealPlanId === 'null' || mealPlanId === null) ? undefined : mealPlanId;

    // Always log for debugging the session issue
    console.log(`[MealCurrent] Raw cookies - userId: "${userId}", surveyId: "${surveyId}", sessionId: "${sessionId}", mealPlanId: "${mealPlanId}"`);
    console.log(`[MealCurrent] Cleaned cookies - userId: "${cleanUserId}", surveyId: "${cleanSurveyId}", sessionId: "${cleanSessionId}", mealPlanId: "${cleanMealPlanId}"`);

    if (!cleanUserId && !cleanSurveyId && !cleanSessionId && !cleanMealPlanId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // PRIORITY 1: If we have a direct mealPlanId, use it (fastest, most accurate)
    let mealPlan = null;
    if (cleanMealPlanId) {
      console.log(`[MealCurrent] Using direct mealPlanId from cookie: ${cleanMealPlanId}`);
      mealPlan = await prisma.mealPlan.findUnique({
        where: { id: cleanMealPlanId }
      });

      if (mealPlan) {
        console.log(`[MealCurrent] ✅ Found meal plan via direct ID: ${mealPlan.id}, status: ${mealPlan.status}`);
      } else {
        console.log(`[MealCurrent] ⚠️ Meal plan ID from cookie not found, falling back to other methods`);
      }
    }

    // PRIORITY 2: Query by sessionId to get the NEWEST survey and its meal plan
    if (!mealPlan && cleanSessionId) {
      console.log(`[MealCurrent] Looking for latest survey via sessionId: ${cleanSessionId}`);

      // Find the LATEST survey for this session (fixes stale data issue)
      const latestSurvey = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId },
        orderBy: { createdAt: 'desc' }  // Get newest survey for this session
      });

      if (latestSurvey) {
        console.log(`[MealCurrent] Found latest survey for session: ${latestSurvey.id} (created: ${latestSurvey.createdAt})`);

        // Find meal plan for this latest survey
        mealPlan = await prisma.mealPlan.findFirst({
          where: {
            surveyId: latestSurvey.id,
            status: { in: ['active', 'complete', 'partial'] }
          },
          orderBy: { createdAt: 'desc' }  // Always get newest
        });

        if (mealPlan) {
          console.log(`[MealCurrent] ✅ Found meal plan via latest survey: ${mealPlan.id}, status: ${mealPlan.status}`);
        }
      } else {
        console.log(`[MealCurrent] No survey found for sessionId: ${cleanSessionId}`);
      }
    }

    // PRIORITY 3: Fall back to direct surveyId lookup
    if (!mealPlan && cleanSurveyId) {
      console.log(`[MealCurrent] Falling back to direct surveyId lookup: ${cleanSurveyId}`);

      mealPlan = await prisma.mealPlan.findFirst({
        where: {
          surveyId: cleanSurveyId,
          status: { in: ['active', 'complete', 'partial'] }
        },
        orderBy: { createdAt: 'desc' }  // Always get newest
      });

      if (mealPlan) {
        console.log(`[MealCurrent] ✅ Found meal plan via direct surveyId: ${mealPlan.id}, status: ${mealPlan.status}`);
      }
    }

    const finalMealPlan = mealPlan;

    if (shouldLog) console.log(`[MealCurrent] Query result: ${finalMealPlan ? 'Found meal plan' : 'No meal plan found'}`);

    if (!finalMealPlan) {
      // Debug: Check what meal plans exist at all
      const allMealPlans = await prisma.mealPlan.findMany({
        select: {
          id: true,
          surveyId: true,
          userId: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
      console.log('[MealCurrent] Debug - Recent meal plans in database:', allMealPlans);
      console.log('[MealCurrent] No meal plan found in database');
      return NextResponse.json(
        { error: 'No meal plan found' },
        { status: 404 }
      );
    }

    if (shouldLog) console.log('[MealCurrent] Found meal plan:', finalMealPlan.id);

    // Get survey data for nutrition targets
    let surveyData = null;
    if (cleanUserId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    }

    if (!surveyData && cleanSurveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: cleanSurveyId }
      });
    }

    if (!surveyData && cleanSessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId }
      });
    }

    // Calculate nutrition targets if we have survey data
    let nutritionTargets = null;
    if (surveyData && surveyData.age && surveyData.sex && surveyData.height && surveyData.weight) {
      try {
        const userProfile: UserProfile = {
          age: surveyData.age,
          sex: surveyData.sex,
          height: surveyData.height,
          weight: surveyData.weight,
          activityLevel: surveyData.activityLevel || 'MODERATELY_ACTIVE',
          goal: surveyData.goal || 'GENERAL_WELLNESS'
        };

        const macroTargets = calculateMacroTargets(userProfile);
        nutritionTargets = {
          dailyCalories: macroTargets.calories,
          dailyProtein: macroTargets.protein,
          dailyCarbs: macroTargets.carbs,
          dailyFat: macroTargets.fat
        };

        if (shouldLog) console.log(`[MealCurrent] Calculated nutrition targets:`, nutritionTargets);
      } catch (error) {
        console.error('[MealCurrent] Failed to calculate nutrition targets:', error);
      }
    }

    // Always convert to 7-day structured format
    const userContext = finalMealPlan.userContext as any;

    let restaurantMeals = userContext?.restaurantMeals || [];
    let metadata = userContext?.metadata || {};
    let days = userContext?.days || [];

    // MERGE: Inject restaurant meals into days structure if they exist separately
    if (restaurantMeals.length > 0 && days.length > 0) {
      console.log(`[MealCurrent] 🔄 Merging ${restaurantMeals.length} restaurant meals into days structure`);

      restaurantMeals.forEach((restaurantMeal: any) => {
        const dayName = restaurantMeal.day?.toLowerCase(); // e.g., "monday"
        const mealType = restaurantMeal.mealType?.toLowerCase(); // e.g., "lunch"

        if (!dayName || !mealType) {
          console.log(`[MealCurrent] ⚠️ Skipping restaurant meal - missing day or mealType:`, { dayName, mealType });
          return;
        }

        // Find the matching day in days array
        const dayIndex = days.findIndex((d: any) => d.day?.toLowerCase() === dayName);

        if (dayIndex !== -1) {
          // Ensure meals object exists
          if (!days[dayIndex].meals) {
            days[dayIndex].meals = {};
          }

          // Check if this slot already has a home meal - restaurant should override or coexist
          const existingMeal = days[dayIndex].meals[mealType];

          // Only add restaurant meal if slot is empty OR existing meal is not already a restaurant meal
          if (!existingMeal || !existingMeal.primary?.source || existingMeal.primary?.source !== 'restaurant') {
            // Format the restaurant meal to match expected structure
            const formattedMeal = {
              primary: {
                source: 'restaurant',
                restaurant: restaurantMeal.primary?.restaurant || restaurantMeal.restaurant,
                dish: restaurantMeal.primary?.dish || restaurantMeal.dish,
                description: restaurantMeal.primary?.description || restaurantMeal.description,
                calories: restaurantMeal.primary?.estimatedCalories || restaurantMeal.primary?.calories || restaurantMeal.estimatedCalories || restaurantMeal.calories,
                protein: restaurantMeal.primary?.protein || restaurantMeal.protein,
                carbs: restaurantMeal.primary?.carbs || restaurantMeal.carbs,
                fat: restaurantMeal.primary?.fat || restaurantMeal.fat,
                price: restaurantMeal.primary?.price || restaurantMeal.price,
                cuisine: restaurantMeal.primary?.cuisine || restaurantMeal.cuisine,
                address: restaurantMeal.primary?.address || restaurantMeal.address,
                orderingLinks: restaurantMeal.primary?.orderingLinks || restaurantMeal.orderingLinks,
                imageUrl: restaurantMeal.primary?.imageUrl || restaurantMeal.imageUrl
              },
              alternatives: restaurantMeal.alternatives || []
            };

            days[dayIndex].meals[mealType] = formattedMeal;
            console.log(`[MealCurrent] ✅ Merged restaurant meal: ${dayName} ${mealType} - ${formattedMeal.primary.dish} from ${formattedMeal.primary.restaurant}`);
          } else {
            console.log(`[MealCurrent] ⏭️ Skipping - slot already has restaurant meal: ${dayName} ${mealType}`);
          }
        } else {
          console.log(`[MealCurrent] ⚠️ Day not found for restaurant meal: ${dayName}`);
        }
      });

      console.log(`[MealCurrent] 🔄 Merge complete - days now have restaurant meals integrated`);
    }

    // Extract grocery and meal count data
    let groceryList = userContext?.groceryList || null;
    let totalEstimatedCost = userContext?.totalEstimatedCost || 0;
    let homeMeals = userContext?.homeMeals || [];

    // Count restaurant and home meals from different possible formats
    let restaurantMealCount = 0;
    let homeMealCount = 0;
    if (days.length > 0) {
      // Count from 7-day structure
      days.forEach(day => {
        Object.values(day.meals || {}).forEach(meal => {
          if (meal && meal.source === 'restaurant') {
            restaurantMealCount++;
          } else if (meal && meal.source !== 'restaurant') {
            homeMealCount++;
          }
        });
      });
    } else if (restaurantMeals.length > 0) {
      // Count from restaurantMeals array
      restaurantMealCount = restaurantMeals.length;
      homeMealCount = homeMeals.length;
    }

    if (shouldLog) console.log(`[MealCurrent] Using 7-day structured format with ${days.length} days`);

    // Extract all meals from the 7-day structure for compatibility
    let weeklyPlan = [];
    days.forEach(dayData => {
      Object.entries(dayData.meals || {}).forEach(([mealType, meal]) => {
        if (meal) {
          weeklyPlan.push({
            ...meal,
            day: dayData.day,
            mealType: mealType,
            date: dayData.date
          });
        }
      });
    });

    // Always return the 7-day structured format
    const mealData = {
      id: finalMealPlan.id,
      weekOf: finalMealPlan.weekOf.toISOString().split('T')[0],
      regenerationCount: finalMealPlan.regenerationCount,
      planData: {
        days: days, // 7-day calendar structure
        weeklyPlan: weeklyPlan, // Flat array for compatibility
        restaurantMeals: restaurantMeals,
        metadata: metadata,
        format: '7-day-structured'
      },
      // Add grocery and count data
      groceryList: groceryList,
      totalEstimatedCost: totalEstimatedCost,
      homeMealsCount: homeMealCount,
      restaurantMealsCount: restaurantMealCount,
      nutritionTargets
    };

    console.log('[MEALS-CURRENT-API] 📤 Returning meal plan:', {
      hasMealPlan: !!mealPlan,
      mealPlanId: mealPlan?.id,
      status: mealPlan?.status,
      hasUserContext: !!mealPlan?.userContext,
      hasDays: !!days,
      daysCount: days?.length || 0,
      hasRestaurantMeals: !!((mealPlan?.userContext as any)?.restaurantMeals),
      restaurantMealsCount: ((mealPlan?.userContext as any)?.restaurantMeals || []).length,
      hasGroceryList: !!((mealPlan?.userContext as any)?.groceryList),
      groceryListHasStores: !!((mealPlan?.userContext as any)?.groceryList?.stores),
      groceryListPriceSuccess: ((mealPlan?.userContext as any)?.groceryList?.priceSearchSuccess)
    });

    if (shouldLog) console.log(`[MealCurrent] Returning 7-day structured plan: ${days.length} days, ${weeklyPlan.length} total meals (${restaurantMealCount} restaurant)`);
    return NextResponse.json({
      success: true,
      mealPlan: mealData
    });

  } catch (error) {
    console.error('[MealCurrent] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load meal plan' },
      { status: 500 }
    );
  }
}