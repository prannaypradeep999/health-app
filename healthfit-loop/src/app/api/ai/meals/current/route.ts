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

    // Super simple: just return the data directly like workouts
    const userContext = mealPlan.userContext as any;
    const mealData = {
      id: mealPlan.id,
      weekOf: mealPlan.weekOf.toISOString().split('T')[0],
      regenerationCount: mealPlan.regenerationCount,
      planData: {
        weeklyPlan: userContext?.days || []
      },
      nutritionTargets
    };

    console.log(`[MealCurrent] Returning ${mealData.planData.weeklyPlan.length} days with nutrition targets`);

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