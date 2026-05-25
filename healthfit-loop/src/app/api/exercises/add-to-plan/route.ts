import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    const { workoutPlanId, day, additionType, source, exerciseLibraryId, customData, weightUsedLbs } =
      await req.json();

    if (!workoutPlanId || !day || !additionType || !source) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const addition = await prisma.userWorkoutAddition.create({
      data: {
        userId: userId || null,
        surveyId: surveyId || null,
        workoutPlanId,
        day,
        additionType,
        source,
        exerciseLibraryId: exerciseLibraryId || null,
        customData: customData || null,
        weightUsedLbs: weightUsedLbs ?? null,
      },
      include: { exerciseLibrary: true },
    });

    return NextResponse.json({ success: true, addition });
  } catch (error) {
    console.error('[ADD-TO-PLAN] Error:', error);
    return NextResponse.json({ error: 'Failed to add exercise' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_id')?.value;
  const surveyId = cookieStore.get('survey_id')?.value;
  const { searchParams } = new URL(req.url);
  const workoutPlanId = searchParams.get('workoutPlanId');
  const day = searchParams.get('day');

  const additions = await prisma.userWorkoutAddition.findMany({
    where: {
      ...(workoutPlanId && { workoutPlanId }),
      ...(day && { day }),
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(surveyId ? [{ surveyId }] : []),
      ],
    },
    include: { exerciseLibrary: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ additions });
}
