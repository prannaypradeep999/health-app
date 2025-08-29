import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { MealFeedbackSchema } from '@/lib/schemas';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;

    const body = await req.json();
    const parsed = MealFeedbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { mealOptionId, feedbackType, notes } = parsed.data;

    // Verify the meal option exists
    const mealOption = await prisma.mealOption.findUnique({
      where: { id: mealOptionId }
    });

    if (!mealOption) {
      return NextResponse.json(
        { error: 'Meal option not found' },
        { status: 404 }
      );
    }

    // Save feedback
    await prisma.mealFeedback.create({
      data: {
        userId: userId || null,
        mealOptionId,
        feedbackType,
        notes
      }
    });

    console.log(`[MealFeedback] User feedback: ${feedbackType} for option ${mealOptionId}`);

    return NextResponse.json({
      success: true,
      message: 'Feedback saved successfully'
    });

  } catch (error) {
    console.error('[MealFeedback] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save feedback' },
      { status: 500 }
    );
  }
}