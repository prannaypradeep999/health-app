import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const {
      surveyId,
      workoutPlanId,
      weekNumber = 1,
      day,
      exerciseName,
      focus,
      completed,
      setsCompleted,
      repsCompleted,
      duration,
      estimatedCalories,
      weightUsedLbs,
    } = await req.json();

    const cookieStore = await cookies();
    const userId = await getAuthUserId();

    if (!workoutPlanId || !day || !exerciseName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find or create WorkoutLog for this day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let workoutLog = await prisma.workoutLog.findFirst({
      where: {
        workoutPlanId,
        day,
        date: { gte: today, lt: tomorrow }
      }
    });

    if (!workoutLog) {
      workoutLog = await prisma.workoutLog.create({
        data: {
          userId: userId || null,
          workoutPlanId,
          day,
          date: new Date(),
          completed: false
        }
      });
    }

    // Upsert exercise completion
    const existingExercise = await prisma.workoutExerciseLog.findFirst({
      where: { workoutLogId: workoutLog.id, exerciseName }
    });

    let exerciseLog;
    if (existingExercise) {
      exerciseLog = await prisma.workoutExerciseLog.update({
        where: { id: existingExercise.id },
        data: {
          setsCompleted: completed ? (setsCompleted || 1) : 0,
          duration: duration || null,
          weightUsedLbs: weightUsedLbs || null,
        }
      });
    } else if (completed) {
      exerciseLog = await prisma.workoutExerciseLog.create({
        data: {
          workoutLogId: workoutLog.id,
          exerciseName,
          setsCompleted: setsCompleted || 1,
          repsCompleted: repsCompleted || [],
          duration: duration || null,
          weightUsedLbs: weightUsedLbs || null,
        }
      });
    }

    // Update workout log completion status
    const allExercises = await prisma.workoutExerciseLog.findMany({
      where: { workoutLogId: workoutLog.id }
    });
    const completedCount = allExercises.filter(e => e.setsCompleted > 0).length;

    await prisma.workoutLog.update({
      where: { id: workoutLog.id },
      data: {
        completed: completedCount > 0,
        // estimatedCalories is the whole day's estimate, not this exercise's.
        // Scale it by how much of the day the user actually completed. The
        // reducer this replaces ignored its element and added the day's total
        // once per logged exercise, so five exercises on a 280-cal day wrote 1400.
        totalCaloriesBurned: (() => {
          const dayCalories = typeof estimatedCalories === 'number' && Number.isFinite(estimatedCalories)
            ? estimatedCalories
            : 0;
          const totalCount = allExercises.length;
          if (totalCount === 0 || dayCalories === 0) return 0;
          return Math.round(dayCalories * (completedCount / totalCount));
        })()
      }
    });

    console.log(`[WORKOUT-LOG] ${completed ? '✓' : '✗'} ${exerciseName} on ${day}`);

    return NextResponse.json({ success: true, exerciseLog, workoutLog });

  } catch (error) {
    console.error('[WORKOUT-LOG] Error:', error);
    return NextResponse.json({ error: 'Failed to log exercise' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workoutPlanId = searchParams.get('workoutPlanId');
    const day = searchParams.get('day');

    if (!workoutPlanId) {
      return NextResponse.json({ error: 'workoutPlanId required' }, { status: 400 });
    }

    const workoutLogs = await prisma.workoutLog.findMany({
      where: { workoutPlanId },
      include: { exercises: true },
      orderBy: { date: 'desc' }
    });

    // Build a map of completed exercises by day
    const completedByDay: Record<string, string[]> = {};
    workoutLogs.forEach(log => {
      const completedExercises = log.exercises
        .filter(e => e.setsCompleted > 0)
        .map(e => e.exerciseName);
      completedByDay[log.day] = completedExercises;
    });

    return NextResponse.json({ success: true, workoutLogs, completedByDay });

  } catch (error) {
    console.error('[WORKOUT-LOG] GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}