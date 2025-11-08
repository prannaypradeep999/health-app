import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { mealId, day, mealType, calories } = await req.json();

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;

    if (!userId && !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Log the meal consumption
    const consumptionLog = await prisma.mealConsumptionLog.create({
      data: {
        userId: userId || null,
        sessionId: sessionId || null,
        mealId: mealId || `${day}_${mealType}`,
        day,
        calories: calories || 0,
        wasEaten: true,
        loggedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Meal consumption logged',
      consumptionLog
    });

  } catch (error) {
    console.error('[MEAL-CONSUME] Error:', error);
    return NextResponse.json(
      { error: 'Failed to log meal consumption' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;

    if (!userId && !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Get today's consumed meals
    const consumedMeals = await prisma.mealConsumptionLog.findMany({
      where: {
        OR: [
          { userId: userId || undefined },
          { sessionId: sessionId || undefined }
        ],
        day: today,
        wasEaten: true
      },
      orderBy: {
        loggedAt: 'desc'
      }
    });

    // Calculate total calories consumed today
    const totalCaloriesConsumed = consumedMeals.reduce((sum, log) => sum + log.calories, 0);

    return NextResponse.json({
      success: true,
      consumedMeals,
      totalCaloriesConsumed,
      consumedMealTypes: consumedMeals.map(log => log.mealId)
    });

  } catch (error) {
    console.error('[MEAL-CONSUME] Error fetching:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meal consumption' },
      { status: 500 }
    );
  }
}