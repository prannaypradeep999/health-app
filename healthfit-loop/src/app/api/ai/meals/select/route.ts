import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { MealSelectionSchema } from '@/lib/schemas';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = MealSelectionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { mealId, selectedOptionId } = parsed.data;

    // Verify the option belongs to this meal
    const meal = await prisma.meal.findUnique({
      where: { id: mealId },
      include: { options: true }
    });

    if (!meal) {
      return NextResponse.json(
        { error: 'Meal not found' },
        { status: 404 }
      );
    }

    const option = meal.options.find(opt => opt.id === selectedOptionId);
    if (!option) {
      return NextResponse.json(
        { error: 'Invalid meal option' },
        { status: 400 }
      );
    }

    // Update meal selection
    await prisma.meal.update({
      where: { id: mealId },
      data: { selectedOptionId }
    });

    return NextResponse.json({
      success: true,
      message: 'Meal selection saved'
    });

  } catch (error) {
    console.error('[MealSelect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save meal selection' },
      { status: 500 }
    );
  }
}