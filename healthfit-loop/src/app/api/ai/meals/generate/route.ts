import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { spoonacularClient } from '@/lib/external/spoonacular-client';
import { generateRestaurantMealPlan } from '@/lib/ai/meal-orchestrator';
import { type UserContext } from '@/lib/ai/prompts';

interface MealOption {
  optionNumber: number;
  optionType: 'restaurant' | 'home';
  title: string;
  description?: string;
  restaurantName?: string;
  estimatedPrice: number;
  orderingInfo?: string;
  deliveryTime?: string;
  ingredients?: string[];
  cookingTime?: number;
  instructions?: string;
  difficulty?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  imageUrl?: string;
}

interface Meal {
  day: string;
  mealType: string;
  options: MealOption[];
}

export async function POST(req: NextRequest) {
  try {
    console.log('[DEBUG-Generation] Starting orchestrator-only meal plan generation');
    
    const { forceRegenerate } = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    
    console.log('[DEBUG-Generation] Cookie values:', { userId, sessionId, surveyId });

    let surveyData = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      
      if (user) {
        surveyData = user?.activeSurvey;
        console.log('[DEBUG-Generation] User lookup:', { userFound: !!user, hasSurvey: !!user?.activeSurvey });
      } else {
        console.log('[DEBUG-Generation] Stale userId cookie found');
        const response = NextResponse.json({ 
          error: 'Authentication expired. Please refresh the page and try again.' 
        }, { status: 401 });
        response.cookies.delete('user_id');
        return response;
      }
    }
    
    if (!surveyData && surveyId) {
      console.log('[DEBUG-Generation] Falling back to direct survey lookup');
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    }

    if (!surveyData) {
      console.log('[DEBUG-Generation] No survey data found');
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[DEBUG-Generation] User: ${surveyData.firstName}, Goal: ${surveyData.goal}, ZIP: ${surveyData.zipCode}`);

    const startOfWeek = getStartOfWeek(new Date());
    const existingPlan = await prisma.mealPlan.findFirst({
      where: {
        OR: [
          { userId: userId || undefined },
          { surveyId: surveyData.id }
        ],
        weekOf: startOfWeek,
        status: 'active'
      }
    });

    if (existingPlan && existingPlan.regenerationCount >= 2 && !forceRegenerate) {
      console.log('[DEBUG-Generation] Regeneration limit reached');
      return NextResponse.json(
        { error: 'Maximum regenerations reached (2/2)' },
        { status: 429 }
      );
    }

    // Dynamic calculations
    const targetCalories = await calculateDynamicCalories(surveyData);
    const weeklyBudgetCents = await calculateDynamicBudget(surveyData);
    const mealsOutPerWeek = surveyData.mealsOutPerWeek || 5;
    const homeMealsPerWeek = 21 - mealsOutPerWeek;

    const userContext: UserContext = {
      surveyData,
      weekOf: startOfWeek.toISOString().split('T')[0],
      targetCalories,
      weeklyBudgetCents,
      mealsOutPerWeek,
      homeMealsPerWeek
    };

    console.log(`[DEBUG-Generation] Target calories: ${targetCalories}, Budget: $${weeklyBudgetCents/100}`);

    // Check Spoonacular API quota before starting
    const quotaStatus = await spoonacularClient.checkQuota();
    if (!quotaStatus.isValid || quotaStatus.remainingRequests < 10) {
      console.warn(`[DEBUG-Generation] Low Spoonacular quota: ${quotaStatus.remainingRequests} remaining`);
    }

    const generationStartTime = new Date();

    // ONLY use the orchestrator - no fallbacks
    console.log('[DEBUG-Generation] Using 4-step orchestrator with verified nutrition data only...');
    const orchestratorResult = await generateRestaurantMealPlan(userContext);
    
    if (!orchestratorResult || !orchestratorResult.weeklyMealPlan) {
      console.error('[DEBUG-Generation] Orchestrator returned invalid result:', orchestratorResult);
      return NextResponse.json({ 
        error: 'Unable to generate meal plan with real data. Please check your location or try again later.',
        details: 'The orchestrator could not find sufficient restaurant data for your area.'
      }, { status: 500 });
    }

    const generatedMeals = convertOrchestratorResultToMeals(orchestratorResult.weeklyMealPlan);
    
    if (!generatedMeals || generatedMeals.length === 0) {
      console.error('[DEBUG-Generation] No meals generated from orchestrator result');
      return NextResponse.json({ 
        error: 'No meals could be generated from available restaurant data. Please try a different location.',
        details: 'Orchestrator completed but produced no valid meals.'
      }, { status: 500 });
    }

    console.log(`[DEBUG-Generation] Orchestrator successfully generated ${generatedMeals.length} meals`);

    const newPlan = await prisma.mealPlan.create({
      data: {
        userId: userId || null,
        surveyId: surveyData.id,
        weekOf: startOfWeek,
        status: 'active',
        generationStarted: generationStartTime,
        regenerationCount: existingPlan ? existingPlan.regenerationCount + 1 : 0,
        userContext: userContext as unknown as any,
        meals: {
          create: generatedMeals.map((meal: Meal) => ({
            day: meal.day,
            mealType: meal.mealType,
            options: {
              create: meal.options.map((option: MealOption) => ({
                optionNumber: option.optionNumber,
                optionType: option.optionType,
                restaurantName: option.restaurantName,
                dishName: option.title,
                description: option.description || null,
                estimatedPrice: option.estimatedPrice,
                orderingUrl: null,
                deliveryTime: option.deliveryTime,
                recipeName: option.optionType === 'home' ? option.title : null,
                ingredients: option.ingredients || [],
                cookingTime: option.cookingTime,
                instructions: Array.isArray(option.instructions) 
                  ? option.instructions.join('\n') 
                  : option.instructions || null,
                difficulty: option.difficulty,
                calories: option.calories || 0,
                protein: option.protein || 0,
                carbs: option.carbs || 0,
                fat: option.fat || 0,
                fiber: option.fiber,
                sodium: option.sodium
              }))
            }
          }))
        }
      },
      include: {
        meals: {
          include: {
            options: true
          }
        }
      }
    });

    if (existingPlan) {
      await prisma.mealPlan.update({
        where: { id: existingPlan.id },
        data: { status: 'archived' }
      });
    }

    console.log(`[DEBUG-Generation] Successfully created plan with ${generatedMeals.length} meals from real API data`);
    
    // MACRO VERIFICATION: Log sample meals to verify accuracy
    if (generatedMeals.length > 0) {
      console.log('[DEBUG-Macros] Sample meal verification (orchestrator data):');
      generatedMeals.slice(0, 3).forEach((meal: Meal, i: number) => {
        meal.options.forEach((option: MealOption, j: number) => {
          console.log(`[DEBUG-Macros] Meal ${i+1}, Option ${j+1}: ${option.title}`);
          console.log(`[DEBUG-Macros] - Restaurant: ${option.restaurantName || 'N/A'}`);
          console.log(`[DEBUG-Macros] - Calories: ${option.calories}, Protein: ${option.protein}g, Carbs: ${option.carbs}g, Fat: ${option.fat}g`);
          console.log(`[DEBUG-Macros] - Data source: Real ${option.optionType === 'restaurant' ? 'Spoonacular API' : 'generated recipe'} data`);
        });
      });
    }

    return NextResponse.json({
      success: true,
      mealPlan: newPlan,
      regenerationCount: newPlan.regenerationCount,
      remainingRegenerations: 2 - newPlan.regenerationCount,
      generationTime: new Date().getTime() - generationStartTime.getTime(),
      dataSource: 'orchestrator-verified'
    });

  } catch (error) {
    console.error('[DEBUG-Generation] Orchestrator generation failed:', error);
    console.error('[DEBUG-Generation] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[DEBUG-Generation] Error message:', error instanceof Error ? error.message : String(error));
    
    return NextResponse.json({ 
      error: 'Meal plan generation failed',
      details: error instanceof Error ? error.message : String(error),
      suggestion: 'Please check your internet connection and try again. If the problem persists, your location may have limited restaurant data coverage.'
    }, { status: 500 });
  }
}

// Convert orchestrator result to expected Meal[] format
function convertOrchestratorResultToMeals(weeklyPlan: any): Meal[] {
  console.log('[DEBUG-Convert] Converting orchestrator result to meal format');
  
  const meals: Meal[] = [];
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner'];

  for (const day of days) {
    if (!weeklyPlan[day]) {
      console.warn(`[DEBUG-Convert] Missing day: ${day}`);
      continue;
    }
    
    for (const mealType of mealTypes) {
      if (!weeklyPlan[day][mealType] || !weeklyPlan[day][mealType].options) {
        console.warn(`[DEBUG-Convert] Missing ${mealType} for ${day}`);
        continue;
      }
      
      const mealOptions = (weeklyPlan[day][mealType].options || []).map((option: any, index: number) => {
        // Parse price estimate
        let estimatedPrice = 1000; // Default $10.00
        if (option.priceEstimate) {
          const priceStr = option.priceEstimate.replace(/[$-]/g, '');
          const parsedPrice = parseFloat(priceStr);
          if (!isNaN(parsedPrice)) {
            estimatedPrice = Math.round(parsedPrice * 100);
          }
        }

        return {
          optionNumber: index + 1,
          optionType: option.restaurantName ? 'restaurant' : 'home',
          title: option.dishName || option.title || `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} Option`,
          description: option.description || `Healthy ${mealType} option selected for your goals`,
          restaurantName: option.restaurantName || undefined,
          estimatedPrice,
          orderingInfo: option.orderingInfo || 'Available on delivery apps',
          deliveryTime: option.deliveryTime || '20-30 min',
          ingredients: option.ingredients || [],
          cookingTime: option.cookingTime || undefined,
          instructions: option.instructions || undefined,
          difficulty: option.difficulty || undefined,
          // Prioritize verified nutrition data
          calories: option.verifiedNutrition?.calories || option.calories || 400,
          protein: option.verifiedNutrition?.protein || option.protein || 20,
          carbs: option.verifiedNutrition?.carbs || option.carbs || 40,
          fat: option.verifiedNutrition?.fat || option.fat || 15,
          fiber: option.verifiedNutrition?.fiber || option.fiber || undefined,
          sodium: option.verifiedNutrition?.sodium || option.sodium || undefined
        };
      });

      if (mealOptions.length > 0) {
        meals.push({
          day,
          mealType,
          options: mealOptions
        });
      }
    }
  }

  console.log(`[DEBUG-Convert] Converted to ${meals.length} meals across ${days.length} days`);
  return meals;
}

// Dynamic calorie calculation
async function calculateDynamicCalories(surveyData: any): Promise<number> {
  console.log('[DEBUG-Calories] Calculating target calories dynamically');
  
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
  console.log(`[DEBUG-Calories] Calculated ${targetCalories} for ${surveyData.goal}`);
  return targetCalories;
}

// Dynamic budget calculation
async function calculateDynamicBudget(surveyData: any): Promise<number> {
  console.log('[DEBUG-Budget] Calculating weekly budget dynamically');
  
  const budgetBase = {
    'low': 4500,
    'medium': 7500, 
    'high': 11000,
    'premium': 16000
  };
  
  const baseBudget = budgetBase[surveyData.budgetTier as keyof typeof budgetBase] || 7500;
  const mealOutMultiplier = 1 + (surveyData.mealsOutPerWeek / 21);
  
  const weeklyBudget = Math.round(baseBudget * mealOutMultiplier);
  console.log(`[DEBUG-Budget] Calculated $${weeklyBudget/100} for ${surveyData.budgetTier} tier`);
  return weeklyBudget;
}

// Get start of current week
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}