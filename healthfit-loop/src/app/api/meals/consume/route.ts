import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const {
      surveyId,
      mealPlanId,
      weekNumber = 1,
      day,
      mealType,
      optionType = 'primary',
      mealName,
      calories = 0,
      protein = 0,
      carbs = 0,
      fat = 0,
      source = 'home',
      restaurantName,
      wasEaten
    } = await req.json();

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value || cookieStore.get('session_id')?.value;

    if (!surveyId || !day || !mealType) {
      return NextResponse.json({ error: 'Missing required fields: surveyId, day, mealType' }, { status: 400 });
    }

    // Upsert - allows toggling eaten/uneaten
    const consumptionLog = await prisma.mealConsumptionLog.upsert({
      where: {
        surveyId_weekNumber_day_mealType_optionType: {
          surveyId,
          weekNumber,
          day,
          mealType,
          optionType
        }
      },
      update: {
        wasEaten,
        calories,
        protein,
        carbs,
        fat,
        mealName,
        source,
        restaurantName,
        updatedAt: new Date()
      },
      create: {
        userId: userId || null,
        sessionId: sessionId || null,
        surveyId,
        mealPlanId,
        weekNumber,
        mealId: `${day}-${mealType}-${optionType}`,
        day,
        mealType,
        optionType,
        mealName,
        calories,
        protein,
        carbs,
        fat,
        source,
        restaurantName,
        wasEaten
      }
    });

    console.log(`[MEAL-CONSUME] ${wasEaten ? '✓ Eaten' : '✗ Uneaten'}: ${mealName || `${day} ${mealType}`}`);

    return NextResponse.json({ success: true, consumptionLog });

  } catch (error) {
    console.error('[MEAL-CONSUME] Error:', error);
    return NextResponse.json({ error: 'Failed to log meal' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const surveyId = searchParams.get('surveyId');
    const weekNumber = parseInt(searchParams.get('weekNumber') || '1');

    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId required' }, { status: 400 });
    }

    // Get ALL meal logs for this week (eaten and uneaten for UI state restoration)
    const allMealLogs = await prisma.mealConsumptionLog.findMany({
      where: { surveyId, weekNumber },
      orderBy: { loggedAt: 'desc' }
    });

    const eatenMeals = allMealLogs.filter(m => m.wasEaten);

    return NextResponse.json({
      success: true,
      allMealLogs,
      eatenMeals,
      stats: {
        totalCalories: eatenMeals.reduce((sum, m) => sum + (m.calories || 0), 0),
        totalProtein: eatenMeals.reduce((sum, m) => sum + (m.protein || 0), 0),
        totalCarbs: eatenMeals.reduce((sum, m) => sum + (m.carbs || 0), 0),
        totalFat: eatenMeals.reduce((sum, m) => sum + (m.fat || 0), 0),
        mealsEaten: eatenMeals.length
      }
    });

  } catch (error) {
    console.error('[MEAL-CONSUME] GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}