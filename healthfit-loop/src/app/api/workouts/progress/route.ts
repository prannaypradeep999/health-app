import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const { searchParams } = new URL(req.url);
    const workoutPlanId = searchParams.get('workoutPlanId');
    const timeframe = searchParams.get('timeframe') || 'current_week';

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let startDate: Date;
    let endDate: Date = new Date();

    switch (timeframe) {
      case 'current_week':
        startDate = getStartOfWeek(new Date());
        break;
      case 'last_4_weeks':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 28);
        break;
      case 'all_time':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate = getStartOfWeek(new Date());
    }

    // Get workout progress data
    const progressData = await prisma.workoutProgress.findMany({
      where: {
        userId,
        ...(workoutPlanId && { workoutPlanId }),
        weekOf: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        workoutPlan: true
      },
      orderBy: { weekOf: 'desc' }
    });

    // Get recent workout logs for detailed analytics
    const recentLogs = await prisma.workoutLog.findMany({
      where: {
        userId,
        ...(workoutPlanId && { workoutPlanId }),
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        exercises: true
      },
      orderBy: { date: 'desc' }
    });

    // Calculate summary statistics
    const totalWorkouts = recentLogs.filter(log => log.completed).length;
    const totalDuration = recentLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
    const averageDuration = totalWorkouts > 0 ? Math.round(totalDuration / totalWorkouts) : 0;
    const totalCaloriesBurned = recentLogs.reduce((sum, log) => sum + (log.totalCaloriesBurned || 0), 0);
    const averagePerceivedExertion = recentLogs.length > 0
      ? Math.round(recentLogs.reduce((sum, log) => sum + (log.perceivedExertion || 0), 0) / recentLogs.length * 10) / 10
      : 0;

    // Calculate consistency metrics
    const daysWithWorkouts = new Set(recentLogs.filter(log => log.completed).map(log =>
      log.date.toISOString().split('T')[0]
    )).size;

    const weeksSinceStart = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const consistencyPercentage = weeksSinceStart > 0 ? Math.round((daysWithWorkouts / (weeksSinceStart * 5)) * 100) : 0;

    // Exercise performance trends
    const exercisePerformance = calculateExercisePerformance(recentLogs);

    return NextResponse.json({
      success: true,
      summary: {
        totalWorkouts,
        totalDuration,
        averageDuration,
        totalCaloriesBurned,
        averagePerceivedExertion,
        consistencyPercentage,
        daysWithWorkouts
      },
      weeklyProgress: progressData,
      recentLogs: recentLogs.slice(0, 10), // Last 10 workouts
      exercisePerformance,
      timeframe: {
        startDate,
        endDate,
        type: timeframe
      }
    });

  } catch (error) {
    console.error('Error fetching workout progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout progress' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const {
      workoutPlanId,
      weekOf,
      weight,
      bodyFatPercentage,
      measurements,
      goalProgress
    } = await req.json();

    // Update or create progress record with body metrics
    const weekStart = new Date(weekOf);
    const existingProgress = await prisma.workoutProgress.findFirst({
      where: {
        userId,
        workoutPlanId,
        weekOf: weekStart
      }
    });

    const progressData = {
      weight,
      bodyFatPercentage,
      measurements,
      goalProgress
    };

    if (existingProgress) {
      await prisma.workoutProgress.update({
        where: { id: existingProgress.id },
        data: progressData
      });
    } else {
      await prisma.workoutProgress.create({
        data: {
          userId,
          workoutPlanId,
          weekOf: weekStart,
          weekNumber: 1,
          ...progressData
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Progress updated successfully'
    });

  } catch (error) {
    console.error('Error updating progress:', error);
    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
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

function calculateExercisePerformance(logs: any[]) {
  const exerciseStats: { [key: string]: any } = {};

  logs.forEach(log => {
    log.exercises?.forEach((exercise: any) => {
      const name = exercise.exerciseName;
      if (!exerciseStats[name]) {
        exerciseStats[name] = {
          exerciseName: name,
          sessions: 0,
          totalSets: 0,
          averageReps: 0,
          maxWeight: 0,
          progressTrend: 'stable'
        };
      }

      exerciseStats[name].sessions++;
      exerciseStats[name].totalSets += exercise.setsCompleted;

      if (exercise.repsCompleted.length > 0) {
        const avgReps = exercise.repsCompleted.reduce((sum: number, rep: number) => sum + rep, 0) / exercise.repsCompleted.length;
        exerciseStats[name].averageReps = (exerciseStats[name].averageReps + avgReps) / 2;
      }

      if (exercise.weightUsed.length > 0) {
        const maxSessionWeight = Math.max(...exercise.weightUsed);
        exerciseStats[name].maxWeight = Math.max(exerciseStats[name].maxWeight, maxSessionWeight);
      }
    });
  });

  return Object.values(exerciseStats).slice(0, 10); // Top 10 exercises
}