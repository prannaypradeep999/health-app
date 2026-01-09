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

    // Clean up undefined/null strings from cookies (including literal strings and actual nulls)
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null' || userId === null) ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null' || surveyId === null) ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null' || sessionId === null) ? undefined : sessionId;

    // Always log for debugging the session issue
    console.log(`[MealCurrent] Raw cookies - userId: "${userId}", surveyId: "${surveyId}", sessionId: "${sessionId}"`);
    console.log(`[MealCurrent] Cleaned cookies - userId: "${cleanUserId}", surveyId: "${cleanSurveyId}", sessionId: "${cleanSessionId}"`);
    console.log(`[MealCurrent] Session info - userId: ${cleanUserId}, surveyId: ${cleanSurveyId}, sessionId: ${cleanSessionId}`);

    if (!cleanUserId && !cleanSurveyId && !cleanSessionId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // If we have a sessionId, find the survey first (same logic as workouts)
    let surveyFromSession = null;
    if (cleanSessionId && !cleanSurveyId) {
      surveyFromSession = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId }
      });
      if (shouldLog) console.log(`[MealCurrent] Found survey from session: ${surveyFromSession?.id}`);
    }


    // Query by survey ID - try both complete and partial status
    // This ensures we get the latest plan regardless of restaurant completion status
    const mealPlan = await prisma.mealPlan.findFirst({
      where: {
        surveyId: cleanSurveyId || surveyFromSession?.id,
        // Accept active, complete and partial plans - this fixes the issue where meal plans use different status values
        status: { in: ['active', 'complete', 'partial'] }
      },
      orderBy: [
        // Prefer complete plans, but get most recent if only partial exists
        { status: 'desc' }, // 'complete' comes before 'partial' alphabetically when reversed
        { createdAt: 'desc' }
      ]
    });

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