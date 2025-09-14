import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.setDate(diff));
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    if (!userId && !surveyId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // Check for existing meal plan this week
    const startOfWeek = getStartOfWeek(new Date());
    const existingPlan = await prisma.mealPlan.findFirst({
      where: {
        OR: [
          { userId: userId || undefined },
          { surveyId: surveyId || undefined }
        ],
        weekOf: startOfWeek,
        status: 'active'
      }
    });

    return NextResponse.json({
      exists: !!existingPlan,
      regenerationCount: existingPlan?.regenerationCount || 0,
      remainingRegenerations: existingPlan ? Math.max(0, 100 - existingPlan.regenerationCount) : 100,
      weekOf: startOfWeek.toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('[MealStatus] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check meal plan status' },
      { status: 500 }
    );
  }
}