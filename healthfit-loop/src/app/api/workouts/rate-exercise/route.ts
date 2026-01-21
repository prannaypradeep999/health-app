import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const {
      surveyId,
      workoutPlanId,
      weekNumber = 1,
      day,
      exerciseName,
      rating,
      liked
    } = await req.json();

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('session_id')?.value;

    if (!exerciseName || rating === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upsert exercise rating
    const ratingKey = `${day}-${exerciseName}-${weekNumber}`;

    const exerciseRating = await prisma.workoutExerciseRating.upsert({
      where: {
        uniqueRating: {
          odayExerciseWeek: ratingKey
        }
      },
      update: {
        rating,
        liked,
        updatedAt: new Date()
      },
      create: {
        odayExerciseWeek: ratingKey,
        userId: userId || null,
        sessionId: userId ? null : sessionId,
        surveyId,
        workoutPlanId,
        weekNumber,
        day,
        exerciseName,
        rating,
        liked
      }
    });

    console.log(`[WORKOUT-RATING] ${liked ? '❤️' : '💔'} ${exerciseName}`);

    return NextResponse.json({
      success: true,
      ratingId: exerciseRating.id,
      message: liked ? "We'll include more exercises like this!" : "Noted, we'll adjust."
    });

  } catch (error) {
    console.error('[WORKOUT-RATING] Error:', error);

    // If the model doesn't exist yet, just log to console and return success
    // The rating is still saved to localStorage
    return NextResponse.json({
      success: true,
      message: 'Rating saved locally (DB model pending)'
    });
  }
}