import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient } from '@/lib/external/places-client';
import { MEAL_PLANNING_FUNCTIONS, type FunctionCall, type FunctionResult } from '@/lib/ai/functions';
import { buildMealPlannerPrompt, type UserContext } from '@/lib/ai/prompts';

// Type definitions for meal planning
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
}

interface Meal {
  day: string;
  mealType: string;
  options: MealOption[];
}

// Initialize OpenAI client
const OPENAI_API_KEY = process.env.GPT_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('GPT_KEY environment variable is required');
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    // Get user survey data
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
      return NextResponse.json(
        { error: 'No survey data found. Please complete the survey first.' },
        { status: 400 }
      );
    }

    // Check regeneration limit (max 2 per week)
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

    if (existingPlan && existingPlan.regenerationCount >= 99) {
      return NextResponse.json(
        { 
          error: 'Maximum regenerations reached for this week (2/2). Please wait until next week.',
          regenerationCount: existingPlan.regenerationCount 
        },
        { status: 429 }
      );
    }

    // Calculate target calories and budget
    const targetCalories = calculateTargetCalories(surveyData);
    const weeklyBudgetCents = parseBudgetTier(surveyData.budgetTier);
    
    // Calculate meal distribution
    const totalMeals = 21; // 7 days × 3 meals
    const mealsOutPerWeek = surveyData.mealsOutPerWeek || 0;
    const homeMealsPerWeek = totalMeals - mealsOutPerWeek;

    // Build user context
    const userContext: UserContext = {
      surveyData,
      weekOf: startOfWeek.toISOString().split('T')[0],
      targetCalories,
      weeklyBudgetCents,
      mealsOutPerWeek,
      homeMealsPerWeek
    };

    // Generate meal plan with AI
    console.log(`[MealGen] Starting generation for ${surveyData.firstName} (${surveyData.zipCode})`);
    const generatedMeals = await generateMealPlanWithAI(userContext);

    // Save to database
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
                recipeName: option.title,
                ingredients: option.ingredients || [],
                cookingTime: option.cookingTime,
                instructions: option.instructions ? (
                  Array.isArray(option.instructions) 
                    ? option.instructions.join('. ') 
                    : String(option.instructions)
                ) : null,
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

    // Archive old plan if exists
    if (existingPlan) {
      await prisma.mealPlan.update({
        where: { id: existingPlan.id },
        data: { status: 'archived' }
      });
    }

    console.log(`[MealGen] Successfully generated plan with ${newPlan.meals.length} meals`);

    return NextResponse.json({
      success: true,
      mealPlan: newPlan,
      regenerationCount: newPlan.regenerationCount,
      remainingRegenerations: 2 - newPlan.regenerationCount
    });

  } catch (error) {
    console.error('[MealGen] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate meal plan. Please try again.' },
      { status: 500 }
    );
  }
}

async function generateMealPlanWithAI(userContext: UserContext): Promise<Meal[]> {
  const prompt = buildMealPlannerPrompt(userContext);
  
  console.log(`[AI] Starting GPT-4o-mini meal generation with JSON mode...`);
  
  const messages: any[] = [
    {
      role: 'system',
      content: prompt
    },
    {
      role: 'user', 
      content: `Generate my personalized 7-day meal plan with 2 options per meal. Start by finding restaurants near ${userContext.surveyData.zipCode}. Return only valid JSON format.`
    }
  ];

  // Call OpenAI with function calling and JSON mode
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
    const errorText = await response.text();
    console.error('[AI] OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  let completion = await response.json();

  let currentMessages = [...messages];
  let functionCallCount = 0;
  const maxFunctionCalls = 10;

  // Handle function calling loop (updated for tools API)
  while (completion.choices[0].message.tool_calls && functionCallCount < maxFunctionCalls) {
    const toolCalls = completion.choices[0].message.tool_calls;
    console.log(`[AI] Function calls ${functionCallCount + 1}: ${toolCalls.map((tc: any) => tc.function.name).join(', ')}`);
    
    // Add the assistant's message with tool calls
    currentMessages.push(completion.choices[0].message);
    
    // Execute all function calls
    for (const toolCall of toolCalls) {
      const functionResult = await executeFunctionCall({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      }, userContext);

      // Add function result to conversation
      currentMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: functionResult.content
      });
    }

    // Continue conversation
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
      const errorText = await nextResponse.text();
      console.error('[AI] OpenAI API continuation error:', nextResponse.status, errorText);
      throw new Error(`OpenAI API error: ${nextResponse.status}`);
    }

    const nextCompletion = await nextResponse.json();
    completion.choices[0] = nextCompletion.choices[0];
    functionCallCount++;
  }

  // Parse final meal plan from AI response
  const finalResponse = completion.choices[0].message.content || '';
  console.log(`[AI] Generation complete after ${functionCallCount} function calls`);
  
  return parseMealPlanFromAI(finalResponse);
}

async function executeFunctionCall(call: FunctionCall, userContext: UserContext): Promise<FunctionResult> {
  let args;
  try {
    args = JSON.parse(call.arguments);
  } catch (error) {
    console.error(`[Function] Error parsing arguments for ${call.name}:`, error);
    return {
      name: call.name,
      content: `Error: Invalid arguments for ${call.name}`
    };
  }
  
  try {
    switch (call.name) {
      case 'find_local_restaurants':
        const restaurants = await googlePlacesClient.findNearbyRestaurants(
          args.zipcode || userContext.surveyData.zipCode,
          args.cuisineType,
          args.priceLevel
        );
        return {
          name: call.name,
          content: `Found ${restaurants.length} restaurants: ${restaurants.map(r => 
            `${r.name} (${r.cuisine}, ${'$'.repeat(Math.max(1, r.priceLevel || 2))}, ${r.rating}⭐)`
          ).join(', ')}`
        };

      case 'get_recipe_instructions':
        const recipe = generateRecipeInstructions(args.recipeName, args.dietaryRestrictions, args.cookingSkill);
        return {
          name: call.name,
          content: JSON.stringify(recipe)
        };

      default:
        throw new Error(`Unknown function: ${call.name}`);
    }
  } catch (error) {
    console.error(`[Function] Error executing ${call.name}:`, error);
    return {
      name: call.name,
      content: `Error: Could not execute ${call.name}. Please try with different parameters.`
    };
  }
}

function parseMealPlanFromAI(response: string): Meal[] {
  console.log('[Parse] Raw AI response length:', response.length);
  console.log('[Parse] Response preview:', response.substring(0, 500));
  
  try {
    // Clean the response - remove any trailing incomplete data
    let cleanedResponse = response.trim();
    
    // If response doesn't end with '}', try to find the last complete meal
    if (!cleanedResponse.endsWith('}')) {
      console.log('[Parse] Response appears truncated, attempting to fix...');
      const lastCompleteIndex = cleanedResponse.lastIndexOf('}');
      if (lastCompleteIndex > 0) {
        cleanedResponse = cleanedResponse.substring(0, lastCompleteIndex + 1);
        // Add closing brackets if needed
        const openBrackets = (cleanedResponse.match(/\[/g) || []).length;
        const closeBrackets = (cleanedResponse.match(/\]/g) || []).length;
        const openBraces = (cleanedResponse.match(/\{/g) || []).length;
        const closeBraces = (cleanedResponse.match(/\}/g) || []).length;
        
        while (closeBrackets < openBrackets) {
          cleanedResponse += ']';
        }
        while (closeBraces < openBraces) {
          cleanedResponse += '}';
        }
      }
    }
    
    // Parse the JSON response
    const parsed = JSON.parse(cleanedResponse);
    
    // Extract meals array from the response
    if (parsed.meals && Array.isArray(parsed.meals)) {
      console.log(`[Parse] Successfully parsed ${parsed.meals.length} meals from JSON response`);
      return parsed.meals;
    }
    
    // If response is already an array, return it
    if (Array.isArray(parsed)) {
      console.log(`[Parse] Response is already an array with ${parsed.length} items`);
      return parsed;
    }
    
    throw new Error('Response does not contain a meals array');
    
  } catch (error) {
    console.error('[Parse] JSON parsing failed:', error);
    console.log('[Parse] Problematic section:', response.substring(Math.max(0, response.length - 200)));
    console.log('[Parse] Using fallback meal structure...');
    
    // Use fallback meal plan
    return generateFallbackMealPlan();
  }
}

function generateFallbackMealPlan(): Meal[] {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  
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
            title: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} Option`,
            restaurantName: 'Local Restaurant',
            estimatedPrice: 1200,
            calories: 450,
            protein: 25,
            carbs: 35,
            fat: 20,
            orderingInfo: 'Search on DoorDash or call restaurant',
            deliveryTime: '20-30 min'
          },
          {
            optionNumber: 2,
            optionType: 'home' as const,
            title: `Homemade ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`,
            ingredients: ['Fresh ingredients', 'Basic seasonings'],
            cookingTime: 30,
            difficulty: 'easy',
            estimatedPrice: 800,
            calories: 400,
            protein: 20,
            carbs: 40,
            fat: 15,
            instructions: `Simple ${mealType} recipe with healthy ingredients`
          }
        ]
      });
    }
  }
  return meals;
}

// Utility functions
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  // Normalize to midnight UTC to avoid timestamp mismatches
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function calculateTargetCalories(surveyData: any): number {
  // Simplified calculation - can be enhanced
  const baseCalories = surveyData.sex === 'male' ? 2200 : 1800;
  const activityMultiplier = surveyData.activityLevel === 'high' ? 1.3 : 
                           surveyData.activityLevel === 'medium' ? 1.2 : 1.1;
  
  let goalAdjustment = 0;
  if (surveyData.goal === 'WEIGHT_LOSS') goalAdjustment = -300;
  if (surveyData.goal === 'MUSCLE_GAIN') goalAdjustment = 200;
  
  return Math.round(baseCalories * activityMultiplier + goalAdjustment);
}

function parseBudgetTier(budgetTier: string): number {
  // Convert budget tier to weekly cents
  const budgetMap: Record<string, number> = {
    'low': 5000,      // $50/week
    'medium': 8000,   // $80/week  
    'high': 12000,    // $120/week
    'premium': 20000  // $200/week
  };
  return budgetMap[budgetTier] || 8000;
}

function generateRecipeInstructions(recipeName: string, restrictions: string[] = [], skill: string = 'beginner'): any {
  return {
    name: recipeName,
    prepTime: skill === 'beginner' ? 20 : 15,
    cookTime: 25,
    difficulty: skill,
    instructions: [
      'Prep all ingredients',
      'Follow recipe steps',
      'Cook according to directions',
      'Serve and enjoy'
    ],
    tips: skill === 'beginner' ? ['Take your time', 'Read all steps first'] : ['Prep efficiently', 'Taste as you go']
  };
}