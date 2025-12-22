import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;

    // Clean up undefined/null strings from cookies (including literal strings and actual nulls)
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null' || userId === null) ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null' || surveyId === null) ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null' || sessionId === null) ? undefined : sessionId;

    // Reduce logging frequency for current workout API calls
    const shouldLog = Math.random() < 0.1; // Log only 10% of requests

    if (shouldLog) {
      console.log(`[WorkoutCurrent] Session info - userId: ${cleanUserId}, surveyId: ${cleanSurveyId}, sessionId: ${cleanSessionId}`);
    }

    if (!cleanUserId && !cleanSurveyId && !cleanSessionId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // If we have a sessionId, find the survey first
    let surveyFromSession = null;
    if (cleanSessionId && !cleanSurveyId) {
      surveyFromSession = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId }
      });
      if (shouldLog) console.log(`[WorkoutCurrent] Found survey from session: ${surveyFromSession?.id}`);
    }

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        OR: [
          { userId: cleanUserId },
          { surveyId: cleanSurveyId || surveyFromSession?.id }
        ].filter(condition => Object.values(condition).some(val => val !== undefined))
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (shouldLog) console.log(`[WorkoutCurrent] Query result: ${workoutPlan ? 'Found workout plan' : 'No workout plan found'}`);

    if (!workoutPlan) {
      // Debug: Check what workout plans exist at all
      const allWorkoutPlans = await prisma.workoutPlan.findMany({
        select: {
          id: true,
          surveyId: true,
          userId: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
      console.log('[WorkoutCurrent] Debug - Recent workout plans in database:', allWorkoutPlans);

      // Also check if there are ANY workout plans for debugging
      const anyPlan = await prisma.workoutPlan.findFirst({
        where: {
          OR: [
            { userId: cleanUserId },
            { surveyId: cleanSurveyId }
          ].filter(condition => Object.values(condition).some(val => val !== undefined))
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