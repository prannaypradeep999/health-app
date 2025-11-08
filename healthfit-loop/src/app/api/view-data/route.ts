import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'prannay_test';
    const surveyId = searchParams.get('surveyId') || 'cmhqf60yj00019ksg5fynzcr8';

    console.log('Fetching data for:', { userId, surveyId });

    // Get user profile
    const userProfile = await prisma.userProfile.findFirst({
      where: {
        OR: [
          { user_id: userId },
          { survey_id: surveyId }
        ]
      }
    });

    // Get current meal plan
    const currentMealPlan = await prisma.currentMealPlan.findFirst({
      where: {
        OR: [
          { user_id: userId },
          { survey_id: surveyId }
        ]
      }
    });

    // Get current workout plan
    const currentWorkoutPlan = await prisma.currentWorkoutPlan.findFirst({
      where: {
        OR: [
          { user_id: userId },
          { survey_id: surveyId }
        ]
      }
    });

    // Get meal history
    const mealHistory = await prisma.mealHistory.findMany({
      where: {
        OR: [
          { user_id: userId },
          { survey_id: surveyId }
        ]
      },
      orderBy: {
        consumed_at: 'desc'
      }
    });

    // Get workout history
    const workoutHistory = await prisma.workoutHistory.findMany({
      where: {
        OR: [
          { user_id: userId },
          { survey_id: surveyId }
        ]
      },
      orderBy: {
        completed_at: 'desc'
      }
    });

    const data = {
      userProfile,
      currentMealPlan: currentMealPlan ? JSON.parse(currentMealPlan.plan_data) : null,
      currentWorkoutPlan: currentWorkoutPlan ? JSON.parse(currentWorkoutPlan.plan_data) : null,
      mealHistory,
      workoutHistory,
      metadata: {
        userId,
        surveyId,
        timestamp: new Date().toISOString()
      }
    };

    return NextResponse.json(data, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json({
      error: 'Failed to fetch user data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}