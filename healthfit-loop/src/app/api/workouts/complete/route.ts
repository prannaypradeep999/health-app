import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { day, exerciseName, completed } = await req.json();

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    if (!userId && !sessionId && !surveyId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Find the user's current workout plan
    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        OR: [
          { userId: userId || undefined },
          { surveyId: surveyId || undefined }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!workoutPlan) {
      return NextResponse.json({ error: 'No workout plan found' }, { status: 404 });
    }

    // Find or create today's workout log
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let workoutLog = await prisma.workoutLog.findFirst({
      where: {
        workoutPlanId: workoutPlan.id,
        day: day.toLowerCase(),
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      },
      include: {
        exercises: true
      }
    });

    if (!workoutLog) {
      // Create new workout log for today
      workoutLog = await prisma.workoutLog.create({
        data: {
          workoutPlanId: workoutPlan.id,
          userId: userId || null,
          day: day.toLowerCase(),
          date: today,
          completed: false
        },
        include: {
          exercises: true
        }
      });
    }

    // Find or create exercise log
    let exerciseLog = await prisma.workoutExerciseLog.findFirst({
      where: {
        workoutLogId: workoutLog.id,
        exerciseName
      }
    });

    if (!exerciseLog) {
      // Create new exercise log
      exerciseLog = await prisma.workoutExerciseLog.create({
        data: {
          workoutLogId: workoutLog.id,
          exerciseName,
          setsCompleted: completed ? 1 : 0
        }
      });
    } else {
      // Update existing exercise log
      exerciseLog = await prisma.workoutExerciseLog.update({
        where: { id: exerciseLog.id },
        data: {
          setsCompleted: completed ? Math.max(1, exerciseLog.setsCompleted) : 0
        }
      });
    }

    // Check if all exercises for the day are completed
    const planData = workoutPlan.planData as any;
    const dayPlan = planData?.weeklyPlan?.find((d: any) => d.day === day.toLowerCase());
    const totalExercises = dayPlan?.exercises?.length || 0;

    const completedExercises = await prisma.workoutExerciseLog.count({
      where: {
        workoutLogId: workoutLog.id,
        setsCompleted: {
          gt: 0
        }
      }
    });

    // Update workout log completion status
    const workoutCompleted = completedExercises >= totalExercises && totalExercises > 0;
    await prisma.workoutLog.update({
      where: { id: workoutLog.id },
      data: {
        completed: workoutCompleted
      }
    });

    return NextResponse.json({
      success: true,
      exerciseLog,
      workoutCompleted,
      completedExercises,
      totalExercises
    });

  } catch (error) {
    console.error('[WORKOUT-COMPLETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to log workout completion' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    if (!userId && !sessionId && !surveyId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Find the user's current workout plan
    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        OR: [
          { userId: userId || undefined },
          { surveyId: surveyId || undefined }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!workoutPlan) {
      return NextResponse.json({
        completedWorkouts: 0,
        totalWorkouts: 0,
        todayCompleted: false
      });
    }

    // Get today's workout completion
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayWorkout = await prisma.workoutLog.findFirst({
      where: {
        workoutPlanId: workoutPlan.id,
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      }
    });

    // Get total completed workouts this week
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    const completedWorkouts = await prisma.workoutLog.count({
      where: {
        workoutPlanId: workoutPlan.id,
        completed: true,
        date: {
          gte: weekStart
        }
      }
    });

    const planData = workoutPlan.planData as any;
    const totalWorkouts = planData?.weeklyPlan?.filter((day: any) => !day.restDay).length || 4;

    return NextResponse.json({
      success: true,
      completedWorkouts,
      totalWorkouts,
      todayCompleted: todayWorkout?.completed || false
    });

  } catch (error) {
    console.error('[WORKOUT-COMPLETE] Error fetching:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout completion' },
      { status: 500 }
    );
  }
}