import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  // Normalize to midnight UTC to avoid timestamp mismatches
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    console.log(`[MealCurrent] Session info - userId: ${userId}, surveyId: ${surveyId}`);

    if (!userId && !surveyId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // Get current week's meal plan
    const startOfWeek = getStartOfWeek(new Date());
    console.log(`[MealCurrent] Looking for meal plan - weekOf: ${startOfWeek.toISOString()}`);

    const mealPlan = await prisma.mealPlan.findFirst({
      where: {
        OR: [
          { userId: userId || undefined },
          { surveyId: surveyId || undefined }
        ],
        weekOf: startOfWeek,
        status: 'active'
      },
      include: {
        meals: {
          include: {
            options: true
          },
          orderBy: [
            { day: 'asc' },
            { mealType: 'asc' }
          ]
        }
      }
    });

    console.log(`[MealCurrent] Query result: ${mealPlan ? 'Found meal plan with ' + mealPlan.meals.length + ' meals' : 'No meal plan found'}`);

    if (!mealPlan) {
      // Also check if there are ANY meal plans for debugging
      const anyPlan = await prisma.mealPlan.findFirst({
        where: {
          OR: [
            { userId: userId || undefined },
            { surveyId: surveyId || undefined }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`[MealCurrent] Any meal plan exists: ${anyPlan ? 'Yes, weekOf: ' + anyPlan.weekOf.toISOString() + ', status: ' + anyPlan.status : 'No'}`);

      return NextResponse.json(
        { error: 'No meal plan found for this week' },
        { status: 404 }
      );
    }

    console.log(`[MealCurrent] Found meal plan with ${mealPlan.meals.length} meals`);

    // Format the response to match what the modal expects
    const formattedMealPlan = {
      id: mealPlan.id,
      weekOf: mealPlan.weekOf.toISOString().split('T')[0],
      regenerationCount: mealPlan.regenerationCount,
      meals: mealPlan.meals.map(meal => ({
        id: meal.id,
        day: meal.day,
        mealType: meal.mealType,
        selectedOptionId: meal.selectedOptionId,
        options: meal.options.map(option => ({
          id: option.id,
          optionNumber: option.optionNumber,
          optionType: option.optionType,
          restaurantName: option.restaurantName,
          dishName: option.dishName,
          estimatedPrice: option.estimatedPrice,
          orderingUrl: option.orderingUrl,
          deliveryTime: option.deliveryTime,
          recipeName: option.recipeName,
          ingredients: option.ingredients,
          cookingTime: option.cookingTime,
          instructions: option.instructions,
          difficulty: option.difficulty,
          calories: option.calories,
          protein: option.protein,
          carbs: option.carbs,
          fat: option.fat,
          fiber: option.fiber,
          sodium: option.sodium,
          wasEaten: option.wasEaten,
          userRating: option.userRating
        }))
      }))
    };

    return NextResponse.json({
      success: true,
      mealPlan: formattedMealPlan
    });

  } catch (error) {
    console.error('[MealCurrent] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load meal plan' },
      { status: 500 }
    );
  }
}