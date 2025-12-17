import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getStartOfWeek } from '@/lib/utils/date-utils';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    console.log(`[MealCurrent] Session info - userId: ${userId}, surveyId: ${surveyId}, sessionId: ${sessionId}`);

    if (!userId && !surveyId && !sessionId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // If we have a sessionId, find the survey first (same logic as workouts)
    let surveyFromSession = null;
    if (sessionId && !surveyId) {
      surveyFromSession = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
      console.log(`[MealCurrent] Found survey from session: ${surveyFromSession?.id}`);
    }

    // Query by survey ID like workouts do - this ensures we get the RIGHT meal plan
    const mealPlan = await prisma.mealPlan.findFirst({
      where: {
        OR: [
          { userId: userId || undefined },
          { surveyId: surveyId || surveyFromSession?.id || undefined }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`[MealCurrent] Query result: ${mealPlan ? 'Found meal plan' : 'No meal plan found'}`);

    if (!mealPlan) {
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

    console.log('[MealCurrent] Found meal plan:', mealPlan.id);

    // Get survey data for nutrition targets
    let surveyData = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    }

    if (!surveyData && surveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    }

    if (!surveyData && sessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
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

        console.log(`[MealCurrent] Calculated nutrition targets:`, nutritionTargets);
      } catch (error) {
        console.error('[MealCurrent] Failed to calculate nutrition targets:', error);
      }
    }

    // Handle both legacy and new 7-day structured formats
    const userContext = mealPlan.userContext as any;

    let weeklyPlan = [];
    let restaurantMeals = userContext?.restaurantMeals || [];
    let metadata = userContext?.metadata || {};
    let days = userContext?.days || [];

    // Check if this is the new 7-day structured format
    if (days.length > 0 && days[0]?.day && days[0]?.meals) {
      console.log(`[MealCurrent] Using new 7-day structured format with ${days.length} days`);

      // Extract all meals from the 7-day structure for compatibility
      days.forEach(dayData => {
        Object.entries(dayData.meals).forEach(([mealType, meal]) => {
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

      // Return the new structured format
      const mealData = {
        id: mealPlan.id,
        weekOf: mealPlan.weekOf.toISOString().split('T')[0],
        regenerationCount: mealPlan.regenerationCount,
        planData: {
          days: days, // 7-day calendar structure
          weeklyPlan: weeklyPlan, // Flat array for compatibility
          restaurantMeals: restaurantMeals,
          metadata: metadata,
          format: '7-day-structured'
        },
        nutritionTargets
      };

      console.log(`[MealCurrent] Returning 7-day structured plan: ${days.length} days, ${weeklyPlan.length} total meals (${restaurantMeals.length} restaurant)`);
      return NextResponse.json({
        success: true,
        mealPlan: mealData
      });
    }

    // Legacy format handling
    console.log(`[MealCurrent] Using legacy format`);
    weeklyPlan = userContext?.days || [];

    // For legacy split pipeline, combine home meals and restaurant meals
    if (userContext?.homeMeals && Array.isArray(userContext.homeMeals)) {
      weeklyPlan = [...userContext.homeMeals];
    }

    // Add restaurant meals if they exist
    if (restaurantMeals.length > 0) {
      weeklyPlan = [...weeklyPlan, ...restaurantMeals];
    }

    const mealData = {
      id: mealPlan.id,
      weekOf: mealPlan.weekOf.toISOString().split('T')[0],
      regenerationCount: mealPlan.regenerationCount,
      planData: {
        weeklyPlan: weeklyPlan,
        restaurantMeals: restaurantMeals,
        metadata: metadata,
        format: 'legacy'
      },
      nutritionTargets
    };

    console.log(`[MealCurrent] Returning legacy format: ${weeklyPlan.length} total meals (${restaurantMeals.length} restaurant) with nutrition targets`);

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