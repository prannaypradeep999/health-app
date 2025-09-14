// New API endpoint for the 4-step restaurant meal planning system
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { generateRestaurantMealPlan } from '@/lib/ai/meal-orchestrator';
import { UserContext } from '@/lib/ai/prompts';

export async function GET(req: NextRequest) {
  try {
    console.log('[Restaurant-Plan] Starting restaurant meal plan generation');
    
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    // Get survey data
    let surveyData = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    } else if (surveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    }

    if (!surveyData) {
      console.log('[Restaurant-Plan] No survey data found');
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[Restaurant-Plan] User: ${surveyData.firstName}, Goal: ${surveyData.goal}, ZIP: ${surveyData.zipCode}`);

    // Calculate dynamic values
    const targetCalories = calculateDynamicCalories(surveyData);
    const weeklyBudgetCents = calculateDynamicBudget(surveyData);
    const mealsOutPerWeek = surveyData.mealsOutPerWeek || 5;
    const homeMealsPerWeek = 21 - mealsOutPerWeek;

    const userContext: UserContext = {
      surveyData,
      weekOf: new Date().toISOString().split('T')[0],
      targetCalories,
      weeklyBudgetCents,
      mealsOutPerWeek,
      homeMealsPerWeek
    };

    console.log(`[Restaurant-Plan] Target calories: ${targetCalories}, Budget: $${weeklyBudgetCents/100}`);

    // Use the new 4-step orchestrator
    const restaurantMealPlan = await generateRestaurantMealPlan(userContext);

    console.log('[Restaurant-Plan] Restaurant meal plan generated successfully');

    return NextResponse.json({
      success: true,
      weeklyMealPlan: restaurantMealPlan.weeklyMealPlan,
      weekSummary: restaurantMealPlan.weekSummary,
      userContext: {
        goal: surveyData.goal,
        targetCalories,
        weeklyBudget: weeklyBudgetCents
      }
    });

  } catch (error) {
    console.error('[Restaurant-Plan] Error:', error);
    return NextResponse.json({ error: 'Restaurant meal plan generation failed' }, { status: 500 });
  }
}

// Helper functions (copied from existing system)
function calculateDynamicCalories(surveyData: any): number {
  console.log('[Calories] Calculating target calories dynamically');
  
  const baseCalories = surveyData.sex === 'male' ? 2200 : 1800;
  const ageAdjustment = surveyData.age > 50 ? -100 : surveyData.age < 25 ? 100 : 0;
  const activityMultiplier = surveyData.activityLevel === 'very_active' ? 1.4 : 
                           surveyData.activityLevel === 'moderately_active' ? 1.3 : 
                           surveyData.activityLevel === 'lightly_active' ? 1.2 : 1.1;
  
  let goalAdjustment = 0;
  if (surveyData.goal === 'WEIGHT_LOSS') goalAdjustment = -400;
  if (surveyData.goal === 'MUSCLE_GAIN') goalAdjustment = 300;
  if (surveyData.goal === 'ENDURANCE') goalAdjustment = 200;
  
  const targetCalories = Math.round((baseCalories + ageAdjustment) * activityMultiplier + goalAdjustment);
  console.log(`[Calories] Calculated ${targetCalories} for ${surveyData.goal}`);
  return targetCalories;
}

function calculateDynamicBudget(surveyData: any): number {
  console.log('[Budget] Calculating weekly budget dynamically');
  
  const budgetBase = {
    'low': 4500,
    'medium': 7500, 
    'high': 11000,
    'premium': 16000
  };
  
  const baseBudget = budgetBase[surveyData.budgetTier as keyof typeof budgetBase] || 7500;
  const mealOutMultiplier = 1 + (surveyData.mealsOutPerWeek / 21);
  
  const weeklyBudget = Math.round(baseBudget * mealOutMultiplier);
  console.log(`[Budget] Calculated $${weeklyBudget/100} for ${surveyData.budgetTier} tier`);
  return weeklyBudget;
}
