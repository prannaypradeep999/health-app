import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const { searchParams } = new URL(req.url);
    const exerciseName = searchParams.get('exerciseName');

    if (!exerciseName) return NextResponse.json({ weightUsedLbs: null });

    const userFilter = [
      ...(userId ? [{ userId }] : []),
      ...(surveyId ? [{ surveyId }] : []),
    ];

    if (userFilter.length === 0) return NextResponse.json({ weightUsedLbs: null });

    const addition = await prisma.userWorkoutAddition.findFirst({
      where: {
        OR: userFilter,
        weightUsedLbs: { not: null },
        exerciseLibrary: { name: { contains: exerciseName, mode: 'insensitive' } },
      },
      orderBy: { createdAt: 'desc' },
      select: { weightUsedLbs: true },
    });

    if (addition?.weightUsedLbs) {
      return NextResponse.json({ weightUsedLbs: addition.weightUsedLbs });
    }

    const exerciseLog = await prisma.workoutExerciseLog.findFirst({
      where: {
        exerciseName: { contains: exerciseName, mode: 'insensitive' },
        ...(userId ? { workoutLog: { userId } } : {}),
        weightUsedLbs: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { weightUsedLbs: true },
    });

    return NextResponse.json({ weightUsedLbs: exerciseLog?.weightUsedLbs ?? null });
  } catch (error) {
    console.error('[LAST-WEIGHT] Error:', error);
    return NextResponse.json({ weightUsedLbs: null });
  }
}
