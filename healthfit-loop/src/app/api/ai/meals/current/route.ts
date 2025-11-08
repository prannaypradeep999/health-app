import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getStartOfWeek } from '@/lib/utils/date-utils';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;

    console.log(`[MealCurrent] Session info - userId: ${userId}, surveyId: ${surveyId}, sessionId: ${sessionId}`);

    if (!userId && !surveyId && !sessionId) {
      return NextResponse.json(
        { error: 'No user session found' },
        { status: 401 }
      );
    }

    // If we have a sessionId, find the survey first
    let surveyFromSession = null;
    if (sessionId && !surveyId) {
      surveyFromSession = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
      console.log(`[MealCurrent] Found survey from session: ${surveyFromSession?.id}`);
    }

    // Find the most recent meal plan (simplified to match workout query)
    const mealPlan = await prisma.mealPlan.findFirst({
      where: {
        OR: [
          { userId: userId || undefined },
          { surveyId: surveyId || surveyFromSession?.id || undefined }
        ]
      },
      orderBy: {
        createdAt: 'desc'
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

    const typedMealPlan = mealPlan as any; // Type assertion for JsonValue
    console.log(`[MealCurrent] Query result: ${mealPlan ? 'Found meal plan with ' + (typedMealPlan.userContext?.meals?.length || 0) + ' meals' : 'No meal plan found'}`);

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
        { error: 'No meal plan found' },
        { status: 404 }
      );
    }

    console.log(`[MealCurrent] Found meal plan with ${(typedMealPlan.userContext?.meals?.length || 0)} meals`);

    // Format the response - handle both old structure (meals table) and new structure (userContext JSON)
    let formattedMealPlan;

    if (typedMealPlan.userContext?.meals && typedMealPlan.userContext.meals.length > 0) {
      // Old structure with meals table
      formattedMealPlan = {
        id: mealPlan.id,
        weekOf: mealPlan.weekOf.toISOString().split('T')[0],
        regenerationCount: mealPlan.regenerationCount,
        meals: typedMealPlan.userContext.meals.map((meal: any) => ({
          id: meal.id,
          day: meal.day,
          mealType: meal.mealType,
          selectedOptionId: meal.selectedOptionId,
          options: meal.options.map((option: any) => ({
            id: option.id,
            optionNumber: option.optionNumber,
            optionType: option.optionType,
            restaurantName: option.restaurantName,
            dishName: option.dishName,
            description: option.description,
            estimatedPrice: option.estimatedPrice,
            orderingUrl: null,
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
    } else {
      // New structure with userContext JSON
      const userContext = mealPlan.userContext as any;
      console.log(`[MealCurrent] userContext content:`, JSON.stringify(userContext, null, 2));
      formattedMealPlan = {
        id: mealPlan.id,
        weekOf: mealPlan.weekOf.toISOString().split('T')[0],
        regenerationCount: mealPlan.regenerationCount,
        meals: userContext?.days || [],
        extraOptions: userContext?.extra_options || {}
      };
      console.log(`[MealCurrent] formattedMealPlan meals count:`, formattedMealPlan.meals.length);
    }

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