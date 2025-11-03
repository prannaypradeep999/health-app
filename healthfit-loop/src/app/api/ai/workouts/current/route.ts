import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getStartOfWeek } from '@/lib/utils/date-utils';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;

    console.log(`[WorkoutCurrent] Session info - userId: ${userId}, surveyId: ${surveyId}, sessionId: ${sessionId}`);

    if (!userId && !surveyId && !sessionId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // If we have a sessionId, find the survey first
    let surveyFromSession = null;
    if (sessionId && !surveyId) {
      surveyFromSession = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
      console.log(`[WorkoutCurrent] Found survey from session: ${surveyFromSession?.id}`);
    }

    const workoutPlan = await prisma.workoutPlan.findFirst({
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

    console.log(`[WorkoutCurrent] Query result: ${workoutPlan ? 'Found workout plan' : 'No workout plan found'}`);

    if (!workoutPlan) {
      // Also check if there are ANY workout plans for debugging
      const anyPlan = await prisma.workoutPlan.findFirst({
        where: {
          OR: [
            { userId: userId || undefined },
            { surveyId: surveyId || undefined }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`[WorkoutCurrent] Any workout plan exists: ${anyPlan ? 'Yes, created: ' + anyPlan.createdAt.toISOString() : 'No'}`);

      return NextResponse.json(
        { error: 'No workout plan found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      workoutPlan: {
        id: workoutPlan.id,
        weekOf: workoutPlan.weekOf.toISOString().split('T')[0],
        status: workoutPlan.status,
        planData: workoutPlan.planData,
        generatedAt: workoutPlan.generatedAt
      }
    });

  } catch (error) {
    console.error('[WorkoutCurrent] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load workout plan' },
      { status: 500 }
    );
  }
}