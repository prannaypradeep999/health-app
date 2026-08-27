import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { feedbackOwnerKey } from '@/lib/utils/meal-feedback-key';

/**
 * Load the caller's existing feedback for a set of meal slots, so the page can
 * render saved hearts and stars on load.
 *
 * This used to take `mealOptionIds` and query them unscoped. Two things were
 * wrong with that: the ids came from `meal.id`, which generated meals do not
 * have, so the array was always empty; and had it not been empty, the query
 * had no owner filter and would have returned other users' feedback for any
 * key they happened to share.
 */
export async function POST(req: NextRequest) {
  try {
    const { mealKeys } = await req.json();

    if (!Array.isArray(mealKeys) || mealKeys.length === 0) {
      return NextResponse.json({ feedback: {} });
    }

    const keys = mealKeys.filter((k: unknown): k is string => typeof k === 'string' && k.length > 0);
    if (keys.length === 0) {
      return NextResponse.json({ feedback: {} });
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value ?? null;

    let userId: string | null = null;
    if (sessionId) {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
        select: { userId: true }
      });
      userId = session?.userId || null;
    }

    const ownerKey = feedbackOwnerKey(userId, sessionId);

    const feedbackLogs = await prisma.mealFeedbackLog.findMany({
      where: {
        ownerKey,
        mealKey: { in: keys }
      },
      select: {
        mealKey: true,
        feedbackType: true,
        rating: true
      }
    });

    // Convert to map
    const feedback: Record<string, string> = {};
    const ratings: Record<string, number> = {};
    feedbackLogs.forEach(log => {
      feedback[log.mealKey] = log.feedbackType;
      if (typeof log.rating === 'number') ratings[log.mealKey] = log.rating;
    });

    return NextResponse.json({ feedback, ratings });
  } catch (error) {
    console.error('[Feedback Batch] Error:', error);
    return NextResponse.json({ feedback: {}, ratings: {} });
  }
}
