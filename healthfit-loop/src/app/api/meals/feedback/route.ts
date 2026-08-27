import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { mealFeedbackKey, feedbackOwnerKey } from '@/lib/utils/meal-feedback-key';

export async function POST(req: NextRequest) {
  try {
    const {
      feedbackType,  // 'loved' | 'disliked' | 'neutral'
      rating,        // 1-5 star rating
      dishName,
      restaurantName,
      isHomemade,
      mealType,
      day,
      weekNumber,
      weekOf
    } = await req.json();

    // The key is derived here rather than trusted from the body. The client
    // sends day, mealType and dishName anyway, so deriving server-side means
    // the two sides cannot drift into different key formats — which is how the
    // star rating and the Love it button ended up writing rows that could
    // never find each other.
    const mealKey = mealFeedbackKey(day, mealType, dishName);

    if (!mealKey || !feedbackType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get user or session
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value ?? null;

    // Try to get userId from session
    let userId: string | null = null;
    if (sessionId) {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
        select: { userId: true }
      });
      userId = session?.userId || null;
    }

    const ownerKey = feedbackOwnerKey(userId, sessionId);

    // Upsert feedback (update if exists, create if not)
    const feedback = await prisma.mealFeedbackLog.upsert({
      where: { ownerKey_mealKey: { ownerKey, mealKey } },
      update: {
        feedbackType,
        rating,
        createdAt: new Date()
      },
      create: {
        userId,
        sessionId: userId ? null : sessionId,
        mealKey,
        ownerKey,
        feedbackType,
        rating,
        dishName,
        restaurantName: restaurantName || null,
        isHomemade: isHomemade || false,
        mealType,
        day,
        weekNumber: weekNumber || 1,
        weekOf: weekOf ? new Date(weekOf) : new Date()
      }
    });

    // There is deliberately no MealOption.userRating write here. That table has
    // never had a row, so the update threw P2025 and took the whole request
    // down with it after the feedback had already been written.

    console.log(`[FEEDBACK] ${feedbackType} - "${dishName}" (${mealKey})`);

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

    // Build the ownership filter conditionally. `{ userId: undefined }` is not
    // "userId is null" to Prisma — it is "no condition", so an unidentified
    // caller used to get an OR of two empty objects and match every row in the
    // table, which is every other user's feedback.
    const ownerFilter = [
      ...(userId ? [{ userId }] : []),
      ...(sessionId ? [{ sessionId }] : []),
    ];

    if (ownerFilter.length === 0) {
      return NextResponse.json({
        success: true,
        summary: { lovedCount: 0, dislikedCount: 0, totalFeedback: 0 },
        lovedMeals: [],
        dislikedMeals: []
      });
    }

    const feedback = await prisma.mealFeedbackLog.findMany({
      where: {
        OR: ownerFilter,
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