import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { formatDateKey, getStartOfWeek } from '@/lib/utils/date-utils';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const workoutPlanId = cookieStore.get('workout_plan_id')?.value;

    // Clean up undefined/null strings from cookies (including literal strings and actual nulls)
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null' || userId === null) ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null' || surveyId === null) ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null' || sessionId === null) ? undefined : sessionId;
    const cleanWorkoutPlanId = (!workoutPlanId || workoutPlanId === 'undefined' || workoutPlanId === 'null' || workoutPlanId === null) ? undefined : workoutPlanId;

    // Reduce logging frequency for current workout API calls
    const shouldLog = Math.random() < 0.1; // Log only 10% of requests

    if (shouldLog) {
      console.log(`[WorkoutCurrent] Raw cookies - userId: "${userId}", surveyId: "${surveyId}", sessionId: "${sessionId}", workoutPlanId: "${workoutPlanId}"`);
      console.log(`[WorkoutCurrent] Cleaned cookies - userId: "${cleanUserId}", surveyId: "${cleanSurveyId}", sessionId: "${cleanSessionId}", workoutPlanId: "${cleanWorkoutPlanId}"`);
    }

    if (!cleanUserId && !cleanSurveyId && !cleanSessionId && !cleanWorkoutPlanId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // PRIORITY 1: If we have a direct workoutPlanId, use it (fastest, most accurate)
    let workoutPlan = null;
    if (cleanWorkoutPlanId) {
      if (shouldLog) console.log(`[WorkoutCurrent] Using direct workoutPlanId from cookie: ${cleanWorkoutPlanId}`);
      workoutPlan = await prisma.workoutPlan.findUnique({
        where: { id: cleanWorkoutPlanId }
      });

      if (workoutPlan) {
        if (shouldLog) console.log(`[WorkoutCurrent] ✅ Found workout plan via direct ID: ${workoutPlan.id}, status: ${workoutPlan.status}`);
      } else {
        if (shouldLog) console.log(`[WorkoutCurrent] ⚠️ Workout plan ID from cookie not found, falling back to other methods`);
      }
    }

    // PRIORITY 2: Query by sessionId to get the NEWEST survey and its workout plan
    if (!workoutPlan && cleanSessionId) {
      if (shouldLog) console.log(`[WorkoutCurrent] Looking for latest survey via sessionId: ${cleanSessionId}`);

      // Find the LATEST survey for this session (fixes stale data issue)
      const latestSurvey = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId },
        orderBy: { createdAt: 'desc' }  // Get newest survey for this session
      });

      if (latestSurvey) {
        if (shouldLog) console.log(`[WorkoutCurrent] Found latest survey for session: ${latestSurvey.id} (created: ${latestSurvey.createdAt})`);

        // Find workout plan for this latest survey
        workoutPlan = await prisma.workoutPlan.findFirst({
          where: {
            surveyId: latestSurvey.id,
            status: { in: ['active', 'complete', 'partial'] }
          },
          orderBy: { createdAt: 'desc' }  // Always get newest
        });

        if (workoutPlan) {
          if (shouldLog) console.log(`[WorkoutCurrent] ✅ Found workout plan via latest survey: ${workoutPlan.id}, status: ${workoutPlan.status}`);
        }
      } else {
        if (shouldLog) console.log(`[WorkoutCurrent] No survey found for sessionId: ${cleanSessionId}`);
      }
    }

    // PRIORITY 3: Fall back to direct surveyId lookup
    if (!workoutPlan && cleanSurveyId) {
      if (shouldLog) console.log(`[WorkoutCurrent] Falling back to direct surveyId lookup: ${cleanSurveyId}`);

      workoutPlan = await prisma.workoutPlan.findFirst({
        where: {
          surveyId: cleanSurveyId,
          status: { in: ['active', 'complete', 'partial'] }
        },
        orderBy: { createdAt: 'desc' }  // Always get newest
      });

      if (workoutPlan) {
        if (shouldLog) console.log(`[WorkoutCurrent] ✅ Found workout plan via direct surveyId: ${workoutPlan.id}, status: ${workoutPlan.status}`);
      }
    }

    // PRIORITY 4: Fall back to userId lookup (but verify user exists first)
    if (!workoutPlan && cleanUserId) {
      // Check if user exists before doing userId lookup
      const userExists = await prisma.user.findUnique({ where: { id: cleanUserId } });
      if (!userExists) {
        console.warn(`[WorkoutCurrent] ⚠️ Stale user_id cookie: ${cleanUserId} - user not found in DB`);
      } else {
        if (shouldLog) console.log(`[WorkoutCurrent] Falling back to userId lookup: ${cleanUserId}`);

        workoutPlan = await prisma.workoutPlan.findFirst({
          where: {
            userId: cleanUserId,
            status: { in: ['active', 'complete', 'partial'] }
          },
          orderBy: { createdAt: 'desc' }  // Always get newest
        });

        if (workoutPlan) {
          if (shouldLog) console.log(`[WorkoutCurrent] ✅ Found workout plan via userId: ${workoutPlan.id}, status: ${workoutPlan.status}`);
        }
      }
    }

    const finalWorkoutPlan = workoutPlan;

    if (shouldLog) console.log(`[WorkoutCurrent] Query result: ${finalWorkoutPlan ? 'Found workout plan' : 'No workout plan found'}`);

    if (!finalWorkoutPlan) {
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
      console.log('[WorkoutCurrent] No workout plan found in database');

      return NextResponse.json(
        { error: 'No workout plan found' },
        { status: 404 }
      );
    }

    const currentWeekStart = getStartOfWeek();
    const workoutWeekOf = finalWorkoutPlan.weekOf.toISOString().split('T')[0];
    const isCurrentWeek = formatDateKey(currentWeekStart) === formatDateKey(finalWorkoutPlan.weekOf);

    if (shouldLog) console.log(`[WorkoutCurrent] Returning workout plan: ${finalWorkoutPlan.id}, status: ${finalWorkoutPlan.status}`);

    return NextResponse.json({
      success: true,
      workoutPlan: {
        id: finalWorkoutPlan.id,
        weekOf: workoutWeekOf,
        startDate: finalWorkoutPlan.generatedAt.toISOString(),
        status: finalWorkoutPlan.status,
        planData: finalWorkoutPlan.planData,
        generatedAt: finalWorkoutPlan.generatedAt
      },
      isCurrentWeek,
      weekOf: workoutWeekOf,
      currentWeek: formatDateKey(currentWeekStart)
    });

  } catch (error) {
    console.error('[WorkoutCurrent] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load workout plan' },
      { status: 500 }
    );
  }
}