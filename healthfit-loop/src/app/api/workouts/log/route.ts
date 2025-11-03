import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;

    if (!userId && !sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const {
      workoutPlanId,
      day,
      date,
      duration,
      completed,
      exercises,
      totalCaloriesBurned,
      averageHeartRate,
      perceivedExertion,
      notes
    } = await req.json();

    // Create workout log
    const workoutLog = await prisma.workoutLog.create({
      data: {
        userId: userId || null,
        workoutPlanId,
        day,
        date: new Date(date),
        duration,
        completed,
        totalCaloriesBurned,
        averageHeartRate,
        perceivedExertion,
        notes,
        exercises: {
          create: exercises.map((exercise: any) => ({
            exerciseName: exercise.exerciseName,
            setsCompleted: exercise.setsCompleted || 0,
            repsCompleted: exercise.repsCompleted || [],
            weightUsed: exercise.weightUsed || [],
            duration: exercise.duration,
            distance: exercise.distance,
            formRating: exercise.formRating,
            difficultyRating: exercise.difficultyRating,
            notes: exercise.notes
          }))
        }
      },
      include: {
        exercises: true
      }
    });

    // Update progress tracking
    await updateWeeklyProgress(userId, workoutPlanId, date, duration || 0, completed);

    return NextResponse.json({
      success: true,
      workoutLog
    });

  } catch (error) {
    console.error('Error logging workout:', error);
    return NextResponse.json(
      { error: 'Failed to log workout' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const { searchParams } = new URL(req.url);
    const workoutPlanId = searchParams.get('workoutPlanId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const whereClause: any = {
      userId,
      ...(workoutPlanId && { workoutPlanId }),
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    };

    const workoutLogs = await prisma.workoutLog.findMany({
      where: whereClause,
      include: {
        exercises: true,
        workoutPlan: true
      },
      orderBy: { date: 'desc' }
    });

    return NextResponse.json({
      success: true,
      workoutLogs
    });

  } catch (error) {
    console.error('Error fetching workout logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout logs' },
      { status: 500 }
    );
  }
}

async function updateWeeklyProgress(userId: string | null, workoutPlanId: string, date: string, duration: number, completed: boolean) {
  if (!userId) return; // Skip for guest users

  const workoutDate = new Date(date);
  const weekStart = getStartOfWeek(workoutDate);

  // Find or create weekly progress record
  const existingProgress = await prisma.workoutProgress.findFirst({
    where: {
      userId,
      workoutPlanId,
      weekOf: weekStart
    }
  });

  if (existingProgress) {
    // Update existing progress
    await prisma.workoutProgress.update({
      where: { id: existingProgress.id },
      data: {
        workoutsCompleted: completed ? existingProgress.workoutsCompleted + 1 : existingProgress.workoutsCompleted,
        totalDuration: existingProgress.totalDuration + duration
      }
    });
  } else {
    // Create new progress record
    await prisma.workoutProgress.create({
      data: {
        userId,
        workoutPlanId,
        weekOf: weekStart,
        weekNumber: 1, // Calculate based on plan start date
        workoutsCompleted: completed ? 1 : 0,
        workoutsPlanned: 5, // Default assumption
        totalDuration: duration
      }
    });
  }
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}