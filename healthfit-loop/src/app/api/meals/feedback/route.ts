import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const {
      mealOptionId,
      feedbackType,  // 'loved' | 'disliked' | 'neutral'
      dishName,
      restaurantName,
      isHomemade,
      mealType,
      day,
      weekNumber,
      weekOf
    } = await req.json();

    if (!mealOptionId || !feedbackType || !dishName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get user or session
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;

    // Try to get userId from session
    let userId: string | null = null;
    if (sessionId) {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
        select: { userId: true }
      });
      userId = session?.userId || null;
    }

    // Upsert feedback (update if exists, create if not)
    const feedback = await prisma.mealFeedbackLog.upsert({
      where: { mealOptionId },
      update: {
        feedbackType,
        createdAt: new Date()
      },
      create: {
        userId,
        sessionId: userId ? null : sessionId,
        mealOptionId,
        feedbackType,
        dishName,
        restaurantName: restaurantName || null,
        isHomemade: isHomemade || false,
        mealType,
        day,
        weekNumber: weekNumber || 1,
        weekOf: weekOf ? new Date(weekOf) : new Date()
      }
    });

    // Also update MealOption.userRating for quick access
    const ratingValue = feedbackType === 'loved' ? 5 : feedbackType === 'disliked' ? 1 : 3;
    await prisma.mealOption.update({
      where: { id: mealOptionId },
      data: { userRating: ratingValue }
    });

    console.log(`[FEEDBACK] ${feedbackType} - "${dishName}"`);

    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
      message: feedbackType === 'loved'
        ? "Great! We'll suggest similar meals."
        : feedbackType === 'disliked'
        ? "Got it. We'll avoid this next time."
        : "Noted!"
    });

  } catch (error) {
    console.error('[FEEDBACK] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save feedback' },
      { status: 500 }
    );
  }
}

// GET - Retrieve user's feedback history (for meal plan generation)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weeksBack = parseInt(searchParams.get('weeks') || '4');

    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;

    // Get userId
    let userId: string | null = null;
    if (sessionId) {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
        select: { userId: true }
      });
      userId = session?.userId || null;
    }

    const weeksAgo = new Date();
    weeksAgo.setDate(weeksAgo.getDate() - (weeksBack * 7));

    const feedback = await prisma.mealFeedbackLog.findMany({
      where: {
        OR: [
          { userId: userId || undefined },
          { sessionId: sessionId || undefined }
        ],
        createdAt: { gte: weeksAgo }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Group by feedback type
    const loved = feedback.filter(f => f.feedbackType === 'loved');
    const disliked = feedback.filter(f => f.feedbackType === 'disliked');

    return NextResponse.json({
      success: true,
      summary: {
        lovedCount: loved.length,
        dislikedCount: disliked.length,
        totalFeedback: feedback.length
      },
      lovedMeals: loved.map(f => ({
        dishName: f.dishName,
        restaurantName: f.restaurantName,
        isHomemade: f.isHomemade,
        mealType: f.mealType
      })),
      dislikedMeals: disliked.map(f => ({
        dishName: f.dishName,
        restaurantName: f.restaurantName,
        isHomemade: f.isHomemade,
        mealType: f.mealType
      }))
    });

  } catch (error) {
    console.error('[FEEDBACK] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}