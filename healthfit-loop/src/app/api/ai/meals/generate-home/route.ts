import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import { createHomeMealGenerationPrompt } from '@/lib/ai/prompts';

export const runtime = 'nodejs';

// Helper function to extract home meals from weekly schedule
function extractHomeMealsFromSchedule(weeklyMealSchedule: any): Array<{day: string, mealType: string}> {
  const homeMeals: Array<{day: string, mealType: string}> = [];

  if (!weeklyMealSchedule || typeof weeklyMealSchedule !== 'object') {
    // Default to all home meals if no schedule provided
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const mealTypes = ['breakfast', 'lunch', 'dinner'];

    days.forEach(day => {
      mealTypes.forEach(mealType => {
        homeMeals.push({ day, mealType });
      });
    });
    return homeMeals;
  }

  Object.entries(weeklyMealSchedule).forEach(([day, meals]: [string, any]) => {
    if (meals?.breakfast === 'home') homeMeals.push({ day, mealType: 'breakfast' });
    if (meals?.lunch === 'home') homeMeals.push({ day, mealType: 'lunch' });
    if (meals?.dinner === 'home') homeMeals.push({ day, mealType: 'dinner' });
  });

  return homeMeals;
}

// Generate nutrition targets based on survey data
function calculateNutritionTargets(surveyData: any): any {
  if (!surveyData.age || !surveyData.sex || !surveyData.height || !surveyData.weight) {
    // Provide defaults for missing data
    return {
      dailyCalories: 2000,
      dailyProtein: 120,
      dailyCarbs: 250,
      dailyFat: 67,
      mealTargets: {
        breakfast: { calories: 500, protein: 25, carbs: 60, fat: 17 },
        lunch: { calories: 650, protein: 35, carbs: 85, fat: 22 },
        dinner: { calories: 750, protein: 45, carbs: 90, fat: 25 },
        snack: { calories: 100, protein: 15, carbs: 15, fat: 3 }
      }
    };
  }

  const userProfile: UserProfile = {
    age: surveyData.age,
    sex: surveyData.sex,
    height: surveyData.height,
    weight: surveyData.weight,
    activityLevel: surveyData.activityLevel || 'MODERATELY_ACTIVE',
    goal: surveyData.goal || 'GENERAL_WELLNESS'
  };

  const macroTargets = calculateMacroTargets(userProfile);

  // Calculate meal targets (approximate distribution)
  const breakfastPercent = 0.25;
  const lunchPercent = 0.32;
  const dinnerPercent = 0.38;
  const snackPercent = 0.05;

  return {
    dailyCalories: macroTargets.calories,
    dailyProtein: macroTargets.protein,
    dailyCarbs: macroTargets.carbs,
    dailyFat: macroTargets.fat,
    mealTargets: {
      breakfast: {
        calories: Math.round(macroTargets.calories * breakfastPercent),
        protein: Math.round(macroTargets.protein * breakfastPercent),
        carbs: Math.round(macroTargets.carbs * breakfastPercent),
        fat: Math.round(macroTargets.fat * breakfastPercent)
      },
      lunch: {
        calories: Math.round(macroTargets.calories * lunchPercent),
        protein: Math.round(macroTargets.protein * lunchPercent),
        carbs: Math.round(macroTargets.carbs * lunchPercent),
        fat: Math.round(macroTargets.fat * lunchPercent)
      },
      dinner: {
        calories: Math.round(macroTargets.calories * dinnerPercent),
        protein: Math.round(macroTargets.protein * dinnerPercent),
        carbs: Math.round(macroTargets.carbs * dinnerPercent),
        fat: Math.round(macroTargets.fat * dinnerPercent)
      },
      snack: {
        calories: Math.round(macroTargets.calories * snackPercent),
        protein: Math.round(macroTargets.protein * snackPercent),
        carbs: Math.round(macroTargets.carbs * snackPercent),
        fat: Math.round(macroTargets.fat * snackPercent)
      }
    }
  };
}

// Generate home meals based on 7-day schedule
async function generateHomeMealsForSchedule(homeMeals: Array<{day: string, mealType: string}>, surveyData: any, nutritionTargets: any): Promise<any> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS-7DAY] 🏠 Generating ${homeMeals.length} home meals for 7-day schedule...`);

  try {
    // Organize meals by type for better prompting
    const mealsByType = homeMeals.reduce((acc, meal) => {
      if (!acc[meal.mealType]) acc[meal.mealType] = [];
      acc[meal.mealType].push(meal.day);
      return acc;
    }, {} as Record<string, string[]>);

    const prompt = `Generate home-cooked meal recipes for a 7-day meal plan based on the user's weekly schedule.

USER WEEKLY SCHEDULE:
${Object.entries(mealsByType).map(([mealType, days]) =>
  `${mealType.charAt(0).toUpperCase() + mealType.slice(1)}: ${days.join(', ')}`
).join('\n')}

TOTAL HOME MEALS TO GENERATE: ${homeMeals.length}

NUTRITION TARGETS PER MEAL:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.calories} calories, ${nutritionTargets.mealTargets.breakfast.protein}g protein
- Lunch: ${nutritionTargets.mealTargets.lunch.calories} calories, ${nutritionTargets.mealTargets.lunch.protein}g protein
- Dinner: ${nutritionTargets.mealTargets.dinner.calories} calories, ${nutritionTargets.mealTargets.dinner.protein}g protein

USER PREFERENCES:
- Goal: ${surveyData.goal || 'General Wellness'}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Foods: ${(surveyData.preferredFoods || []).slice(0, 10).join(', ') || 'No specific preferences'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Varied'}
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

REQUIREMENTS:
1. Generate EXACTLY one recipe for each meal in the schedule
2. Each meal MUST hit its nutrition targets (±50 calories)
3. MAXIMUM VARIETY - no repeated main ingredients across the week
4. Use diverse cuisines and cooking methods
5. Mix easy (15-20 min) and moderate (30-45 min) prep times
6. Include complete ingredient lists and basic instructions
7. Consider batch cooking possibilities for similar meals

Return ONLY this JSON structure:
{
  "homeMeals": [
    {
      "day": "monday",
      "mealType": "breakfast",
      "name": "Protein-Packed Breakfast Bowl",
      "description": "Quick and nutritious start to the day",
      "estimatedCalories": ${nutritionTargets.mealTargets.breakfast.calories},
      "protein": ${nutritionTargets.mealTargets.breakfast.protein},
      "carbs": ${nutritionTargets.mealTargets.breakfast.carbs},
      "fat": ${nutritionTargets.mealTargets.breakfast.fat},
      "prepTime": "15 min",
      "cookTime": "10 min",
      "difficulty": "Easy",
      "cuisine": "Mediterranean",
      "ingredients": [
        "2 eggs",
        "1/2 cup quinoa, cooked",
        "1/4 avocado",
        "1/4 cup cherry tomatoes",
        "2 tbsp feta cheese",
        "1 tbsp olive oil",
        "Fresh herbs"
      ],
      "instructions": [
        "Cook eggs to preference",
        "Mix quinoa with diced tomatoes",
        "Top with avocado, feta, and herbs",
        "Drizzle with olive oil"
      ],
      "tags": ["high-protein", "quick", "vegetarian"],
      "source": "home"
    }
  ],
  "nutritionSummary": {
    "totalMeals": ${homeMeals.length},
    "averageCaloriesPerMeal": 520,
    "weeklyCaloriesFromHome": 3640,
    "proteinPercentage": 25,
    "variety": "High - 7 different cuisines used"
  },
  "weeklySchedule": {
    "monday": {"breakfast": "home", "lunch": "restaurant", "dinner": "home"},
    "tuesday": {"breakfast": "home", "lunch": "home", "dinner": "restaurant"}
  }
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`Home meal generation failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let parsedResult;
    try {
      parsedResult = JSON.parse(content);
    } catch (parseError) {
      console.error('[HOME-MEALS-7DAY] JSON parse failed:', parseError);
      // Return a fallback structure
      parsedResult = {
        homeMeals: [],
        nutritionSummary: { totalMeals: homeMeals.length },
        error: 'Failed to parse meal data'
      };
    }

    const generationTime = Date.now() - startTime;
    console.log(`[HOME-MEALS-7DAY] ✅ Generated ${parsedResult.homeMeals?.length || 0} home meals in ${generationTime}ms`);

    return {
      ...parsedResult,
      metadata: {
        generationTime,
        totalHomeMeals: homeMeals.length,
        nutritionTargets
      }
    };

  } catch (error) {
    const generationTime = Date.now() - startTime;
    console.error(`[HOME-MEALS-7DAY] ❌ Generation failed after ${generationTime}ms:`, error);
    return {
      homeMeals: [],
      nutritionSummary: { totalMeals: homeMeals.length },
      error: (error as Error).message
    };
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[HOME-GENERATION] 🚀 Starting home meal generation at ${new Date().toISOString()}`);

  try {
    // Parse request data
    let requestData = {};
    try {
      requestData = await req.json();
    } catch (error) {
      console.log(`[HOME-GENERATION] 📄 Empty request body, using defaults`);
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    console.log(`[HOME-GENERATION] 🍪 Cookies found:`, {
      userId: userId || 'null',
      sessionId: sessionId || 'null',
      surveyId: surveyId || 'null'
    });

    // Early exit if no session data available
    if (!userId && !surveyId && !sessionId) {
      console.error(`[HOME-GENERATION] ❌ No session data found`);
      return NextResponse.json({
        error: 'No session data found. Please complete the survey first.'
      }, { status: 400 });
    }

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
    } else if (sessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
    }

    if (!surveyData) {
      console.log(`[HOME-GENERATION] ❌ No survey data found`);
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[HOME-GENERATION] ✅ Survey data found for ${surveyData.firstName}`);
    console.log(`[HOME-GENERATION] 📅 Weekly schedule:`, surveyData.weeklyMealSchedule);

    // Extract home meals from schedule
    const homeMealsSchedule = extractHomeMealsFromSchedule(surveyData.weeklyMealSchedule);
    console.log(`[HOME-GENERATION] 🏠 Found ${homeMealsSchedule.length} home meals in schedule`);

    // Calculate nutrition targets
    const nutritionTargets = calculateNutritionTargets(surveyData);
    console.log(`[HOME-GENERATION] 📊 Calculated nutrition targets: ${nutritionTargets.dailyCalories} calories/day`);

    // Generate home meals
    const homeMealPlan = await generateHomeMealsForSchedule(homeMealsSchedule, surveyData, nutritionTargets);

    // Create initial meal plan in database with just home meals
    const weekOfDate = new Date();
    weekOfDate.setHours(0, 0, 0, 0);

    // Organize home meals by day for better calendar structure
    const homeMealsByDay = {};
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Initialize all days
    dayOrder.forEach(day => {
      homeMealsByDay[day] = {
        day: day,
        date: new Date(weekOfDate.getTime() + (dayOrder.indexOf(day) * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
        meals: {
          breakfast: null,
          lunch: null,
          dinner: null
        },
        plannedMeals: surveyData.weeklyMealSchedule[day] || { breakfast: 'home', lunch: 'home', dinner: 'home' }
      };
    });

    // Place generated home meals into the correct day/meal slots
    (homeMealPlan.homeMeals || []).forEach(meal => {
      if (homeMealsByDay[meal.day] && homeMealsByDay[meal.day].plannedMeals[meal.mealType] === 'home') {
        homeMealsByDay[meal.day].meals[meal.mealType] = meal;
      }
    });

    const initialMealPlan = {
      days: dayOrder.map(day => homeMealsByDay[day]), // 7-day structured format
      weeklySchedule: surveyData.weeklyMealSchedule,
      nutritionTargets,
      homeMeals: homeMealPlan.homeMeals || [], // Keep flat array for compatibility
      metadata: {
        type: 'home_meals_only',
        generationMethod: 'split_pipeline_phase1',
        restaurantsStatus: 'pending',
        totalHomeMeals: (homeMealPlan.homeMeals || []).length,
        ...homeMealPlan.metadata
      }
    };

    try {
      console.log(`[HOME-GENERATION] 💾 Saving initial home meal plan to database...`);
      const createdMealPlan = await prisma.mealPlan.create({
        data: {
          surveyId: surveyData.id,
          userId: userId || null,
          weekOf: weekOfDate,
          userContext: initialMealPlan as any,
          status: 'partial', // Mark as partial since restaurants are pending
          regenerationCount: 1
        }
      });
      console.log(`[HOME-GENERATION] ✅ Home meal plan saved with ID: ${createdMealPlan.id}`);
    } catch (dbError) {
      console.error(`[HOME-GENERATION] ❌ Failed to save home meal plan:`, dbError);
      // Continue anyway since we have the data
    }

    const totalTime = Date.now() - startTime;
    console.log(`[HOME-GENERATION] 🏁 Home meal generation completed in ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    return NextResponse.json({
      success: true,
      homeMealPlan: initialMealPlan,
      timings: {
        totalTime: `${totalTime}ms`,
        homeMealsGenerated: homeMealPlan.homeMeals?.length || 0
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[HOME-GENERATION] Error:', error);
    return NextResponse.json({
      error: 'Failed to generate home meal plan',
      details: (error as Error).message
    }, { status: 500 });
  }
}