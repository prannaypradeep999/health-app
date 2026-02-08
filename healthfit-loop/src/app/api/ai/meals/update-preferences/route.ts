import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { mealPlanId, selectedMealOptions } = await request.json();

    if (!mealPlanId) {
      return NextResponse.json({ error: 'Missing mealPlanId' }, { status: 400 });
    }

    // Get existing meal plan
    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: mealPlanId },
    });

    if (!mealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
    }

    // Update userContext with selected options
    const existingContext = (mealPlan.userContext as any) || {};
    const updatedContext = {
      ...existingContext,
      selectedMealOptions,
    };

    await prisma.mealPlan.update({
      where: { id: mealPlanId },
      data: { userContext: updatedContext },
    });

    console.log('[UPDATE-PREFERENCES] Updated meal preferences for plan:', mealPlanId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update meal preferences:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}