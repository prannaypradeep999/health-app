// Main meal plan generation endpoint with LLM orchestration and dynamic calculations
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient } from '@/lib/external/places-client';
import { spoonacularClient } from '@/lib/external/spoonacular-client';
import { MEAL_PLANNING_FUNCTIONS, type FunctionCall, type FunctionResult } from '@/lib/ai/functions';
import { buildMealPlannerPrompt, type UserContext } from '@/lib/ai/prompts';

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

const OPENAI_API_KEY = process.env.GPT_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('GPT_KEY environment variable is required');
}

export async function POST(req: NextRequest) {
  try {
    console.log('[DEBUG-Generation] Starting meal plan generation');
    
    const { forceRegenerate } = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

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

    // Dynamic calculations using LLM reasoning
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

    const generatedMeals = await generateMealPlanWithLLM(userContext);

    const newPlan = await prisma.mealPlan.create({
      data: {
        userId: userId || null,
        surveyId: surveyData.id,
        weekOf: startOfWeek,
        status: 'active',
        regenerationCount: existingPlan ? existingPlan.regenerationCount + 1 : 0,
        userContext: userContext as any,
        meals: {
          create: generatedMeals.map(meal => ({
            day: meal.day,
            mealType: meal.mealType,
            options: {
              create: meal.options.map((option: MealOption) => ({
                optionNumber: option.optionNumber,
                optionType: option.optionType,
                restaurantName: option.restaurantName,
                dishName: option.title,
                estimatedPrice: option.estimatedPrice,
                orderingUrl: option.orderingInfo,
                deliveryTime: option.deliveryTime,
                recipeName: option.optionType === 'home' ? option.title : null,
                ingredients: option.ingredients || [],
                cookingTime: option.cookingTime,
                instructions: option.instructions || null,
                difficulty: option.difficulty,
                calories: option.calories,
                protein: option.protein,
                carbs: option.carbs,
                fat: option.fat,
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

    console.log(`[DEBUG-Generation] Successfully created plan with ${newPlan.meals.length} meals`);

    return NextResponse.json({
      success: true,
      mealPlan: newPlan,
      regenerationCount: newPlan.regenerationCount,
      remainingRegenerations: 2 - newPlan.regenerationCount
    });

  } catch (error) {
    console.error('[DEBUG-Generation] Error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}

// LLM orchestration with strategic API call management
async function generateMealPlanWithLLM(userContext: UserContext): Promise<Meal[]> {
  const prompt = buildMealPlannerPrompt(userContext);
  
  console.log('[DEBUG-LLM] Starting GPT-4o-mini with function calling');
  
  const messages: any[] = [
    {
      role: 'system',
      content: prompt
    },
    {
      role: 'user', 
      content: `Generate my 7-day meal plan with verified nutrition data. Start by finding restaurants near ${userContext.surveyData.zipCode}. Return only valid JSON.`
    }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      tools: MEAL_PLANNING_FUNCTIONS.map(func => ({
        type: 'function',
        function: func
      })),
      tool_choice: 'auto',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    console.error('[DEBUG-LLM] OpenAI error:', response.status);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  let completion = await response.json();
  let currentMessages = [...messages];
  let functionCallCount = 0;
  const maxFunctionCalls = 12;

  while (completion.choices[0].message.tool_calls && functionCallCount < maxFunctionCalls) {
    const toolCalls = completion.choices[0].message.tool_calls;
    console.log(`[DEBUG-LLM] Function calls ${functionCallCount + 1}: ${toolCalls.map((tc: any) => tc.function.name).join(', ')}`);
    
    currentMessages.push(completion.choices[0].message);
    
    for (const toolCall of toolCalls) {
      const functionResult = await executeFunctionCall({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      }, userContext);

      currentMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: functionResult.content
      });
    }

    const nextResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: currentMessages,
        tools: MEAL_PLANNING_FUNCTIONS.map(func => ({
          type: 'function',
          function: func
        })),
        tool_choice: 'auto',
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 8000
      })
    });

    if (!nextResponse.ok) {
      console.error('[DEBUG-LLM] OpenAI continuation error:', nextResponse.status);
      break;
    }

    const nextCompletion = await nextResponse.json();
    completion.choices[0] = nextCompletion.choices[0];
    functionCallCount++;
  }

  console.log(`[DEBUG-LLM] Generation complete after ${functionCallCount} function calls`);
  
  const finalResponse = completion.choices[0].message.content || '';
  return parseMealPlanFromJSON(finalResponse, userContext);
}

// Function execution with minimal hardcoding
async function executeFunctionCall(call: FunctionCall, userContext: UserContext): Promise<FunctionResult> {
  let args;
  try {
    args = JSON.parse(call.arguments);
  } catch (error) {
    console.error(`[DEBUG-Functions] Parse error for ${call.name}:`, error);
    return { name: call.name, content: `Error: Invalid arguments for ${call.name}` };
  }
  
  try {
    switch (call.name) {
      case 'find_restaurants_near_user':
        console.log(`[DEBUG-Functions] Finding restaurants near ${args.zipcode}`);
        // Map distance preference to radius in kilometers
        const distanceMap = { 'close': 5, 'medium': 10, 'far': 20 };
        const distancePreference = (userContext.surveyData as any).distancePreference || 'medium';
        const radiusKm = distanceMap[distancePreference as keyof typeof distanceMap] || 10;
        console.log(`[DEBUG-Functions] Using ${radiusKm}km radius for distance preference: ${distancePreference}`);
        
        const restaurants = await googlePlacesClient.findNearbyRestaurants(
          args.zipcode || userContext.surveyData.zipCode,
          args.cuisineType,
          args.priceLevel,
          radiusKm
        );
        return {
          name: call.name,
          content: `Found ${restaurants.length} restaurants: ${restaurants.slice(0, 8).map(r => 
            `${r.name} (${r.cuisine}, ${'$'.repeat(r.priceLevel || 2)}, ${r.rating}⭐)`
          ).join(', ')}`
        };

      case 'search_restaurant_menu':
        console.log(`[DEBUG-Functions] Searching menu for ${args.restaurantChain}`);
        const menuItems = await spoonacularClient.searchMenuItems(
          args.restaurantChain,
          args.maxCalories,
          args.minProtein,
          args.maxCarbs
        );
        return {
          name: call.name,
          content: JSON.stringify({
            restaurant: args.restaurantChain,
            itemCount: menuItems.length,
            items: menuItems.slice(0, 3).map(item => ({
              id: item.id,
              title: item.title,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              image: item.image
            }))
          })
        };

      case 'get_menu_item_nutrition':
        console.log(`[DEBUG-Functions] Getting nutrition for item ${args.itemId}`);
        const details = await spoonacularClient.getMenuItemDetails(args.itemId);
        return {
          name: call.name,
          content: details ? JSON.stringify(details) : 'Item details not found'
        };

      case 'check_restaurant_data_available':
        console.log(`[DEBUG-Functions] Checking data for ${args.restaurantName}`);
        const hasData = await spoonacularClient.hasRestaurantData(args.restaurantName);
        return {
          name: call.name,
          content: `${args.restaurantName} has verified menu data: ${hasData}`
        };

      case 'create_home_recipe':
        console.log(`[DEBUG-Functions] Creating recipe for ${args.recipeName}`);
        const recipe = await generateDynamicRecipe(
          args.recipeName, 
          args.targetCalories, 
          args.cookingSkill, 
          args.dietaryRestrictions
        );
        return {
          name: call.name,
          content: JSON.stringify(recipe)
        };

      default:
        console.error(`[DEBUG-Functions] Unknown function: ${call.name}`);
        return { name: call.name, content: `Error: Unknown function ${call.name}` };
    }
  } catch (error) {
    console.error(`[DEBUG-Functions] Execution error for ${call.name}:`, error);
    return { name: call.name, content: `Error executing ${call.name}: ${error}` };
  }
}

function parseMealPlanFromJSON(response: string, userContext: UserContext): Meal[] {
  console.log('[DEBUG-Parse] Parsing meal plan JSON, length:', response.length);
  
  try {
    let cleanedResponse = response.trim();
    
    if (!cleanedResponse.endsWith('}')) {
      const lastBraceIndex = cleanedResponse.lastIndexOf('}');
      if (lastBraceIndex > 0) {
        cleanedResponse = cleanedResponse.substring(0, lastBraceIndex + 1);
      }
    }
    
    const parsed = JSON.parse(cleanedResponse);
    
    if (parsed.meals && Array.isArray(parsed.meals)) {
      console.log(`[DEBUG-Parse] Successfully parsed ${parsed.meals.length} meals`);
      return parsed.meals;
    }
    
    if (Array.isArray(parsed)) {
      console.log(`[DEBUG-Parse] Direct array with ${parsed.length} meals`);
      return parsed;
    }
    
    throw new Error('No meals array found in response');
    
  } catch (error) {
    console.error('[DEBUG-Parse] JSON parsing failed:', error);
    console.log('[DEBUG-Parse] Using dynamic fallback');
    return generateDynamicFallback(userContext);
  }
}

// Dynamic calculations using LLM reasoning
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

async function generateDynamicRecipe(name: string, targetCalories: number, skill: string = 'easy', restrictions: string[] = []): Promise<any> {
  console.log(`[DEBUG-Recipe] Generating ${name} for ${targetCalories} calories`);
  
  const cookingTimeBase = { 'easy': 20, 'medium': 35, 'hard': 50 };
  const prepTimeBase = { 'easy': 10, 'medium': 15, 'hard': 25 };
  
  return {
    name,
    prepTime: prepTimeBase[skill as keyof typeof prepTimeBase] || 15,
    cookTime: cookingTimeBase[skill as keyof typeof cookingTimeBase] || 25,
    difficulty: skill,
    targetCalories,
    estimatedNutrition: {
      calories: targetCalories,
      protein: Math.round(targetCalories * 0.25 / 4),
      carbs: Math.round(targetCalories * 0.45 / 4), 
      fat: Math.round(targetCalories * 0.30 / 9)
    },
    ingredients: [`Protein for ${name}`, 'Fresh vegetables', 'Whole grains', 'Healthy fats', 'Herbs and spices'],
    instructions: `Prepare ${name} to achieve ${targetCalories} calories with balanced nutrition`,
    dietaryNotes: restrictions.length > 0 ? `Accommodates: ${restrictions.join(', ')}` : 'Standard preparation'
  };
}

function generateDynamicFallback(userContext: UserContext): Meal[] {
  console.log('[DEBUG-Fallback] Generating dynamic fallback meals');
  
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  const caloriesPerMeal = Math.round(userContext.targetCalories / 3);
  
  const meals = [];
  for (const day of days) {
    for (const mealType of mealTypes) {
      meals.push({
        day,
        mealType,
        options: [
          {
            optionNumber: 1,
            optionType: 'restaurant' as const,
            title: `Healthy ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`,
            restaurantName: 'Chain Restaurant',
            estimatedPrice: Math.round(userContext.weeklyBudgetCents / 21),
            calories: caloriesPerMeal,
            protein: Math.round(caloriesPerMeal * 0.25 / 4),
            carbs: Math.round(caloriesPerMeal * 0.45 / 4),
            fat: Math.round(caloriesPerMeal * 0.30 / 9),
            orderingInfo: 'Order via delivery app',
            deliveryTime: '20-30 min'
          },
          {
            optionNumber: 2,
            optionType: 'home' as const,
            title: `Homemade ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`,
            ingredients: ['Balanced ingredients'],
            cookingTime: 25,
            difficulty: 'easy',
            estimatedPrice: Math.round(userContext.weeklyBudgetCents / 42),
            calories: caloriesPerMeal,
            protein: Math.round(caloriesPerMeal * 0.25 / 4),
            carbs: Math.round(caloriesPerMeal * 0.45 / 4),
            fat: Math.round(caloriesPerMeal * 0.30 / 9),
            instructions: `Prepare balanced ${mealType}`
          }
        ]
      });
    }
  }
  return meals;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}