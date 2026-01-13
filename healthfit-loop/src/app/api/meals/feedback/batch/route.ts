import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { mealOptionIds } = await req.json();

    if (!mealOptionIds?.length) {
      return NextResponse.json({ feedback: {} });
    }

    const feedbackLogs = await prisma.mealFeedbackLog.findMany({
      where: {
        mealOptionId: { in: mealOptionIds }
      },
      select: {
        mealOptionId: true,
        feedbackType: true
      }
    });

    // Convert to map
    const feedback: Record<string, string> = {};
    feedbackLogs.forEach(log => {
      feedback[log.mealOptionId] = log.feedbackType;
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('[Feedback Batch] Error:', error);
    return NextResponse.json({ feedback: {} });
  }
}