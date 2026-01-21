import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SurveySchema } from '@/lib/schemas';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

/**
 * Survey API Route
 *
 * CHANGES MADE:
 * - Extracted buildSurveyData() helper to reduce code duplication
 * - Moved countRestaurantMeals() to top level
 * - Removed dead code: step 5 and 6 blocks that never execute (frontend sends 7/8)
 * - All generation now happens only on final submission (step 9)
 * - Removed dead triggerMealGeneration() function (was never called)
 * - Fixed all error.message TypeScript issues with proper type guards
 * - Removed unused surveyData parameter from triggerBackgroundWorkoutGeneration
 */

// Helper function to build survey data object (reduces duplication)
function buildSurveyData(data: any, sessionId: string, mealsOutPerWeek: number) {
  return {
    email: data.email || '',
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    age: data.age || 0,
    sex: data.sex || '',
    height: Number(data.height) || 0,
    weight: data.weight || 0,
    streetAddress: data.streetAddress || '',
    city: data.city || '',
    state: data.state || '',
    zipCode: data.zipCode || '',
    country: data.country || 'United States',
    goal: data.goal,
    primaryGoal: data.primaryGoal || null,
    goalChallenge: data.goalChallenge || null,
    fitnessLevel: data.fitnessLevel || null,
    healthFocus: data.healthFocus || null,
    maintainFocus: data.maintainFocus || null,
    activityLevel: data.activityLevel || '',
    sportsInterests: data.sportsInterests || '',
    fitnessTimeline: data.fitnessTimeline || '',
    preferredActivities: data.preferredActivities || [],
    additionalGoalsNotes: data.additionalGoalsNotes || '',
    monthlyFoodBudget: data.monthlyFoodBudget || 200,
    monthlyFitnessBudget: data.monthlyFitnessBudget || 50,
    dietPrefs: data.dietPrefs || [],
    weeklyMealSchedule: data.weeklyMealSchedule || null,
    mealsOutPerWeek,
    distancePreference: data.distancePreference || 'medium',
    preferredCuisines: data.preferredCuisines || [],
    preferredFoods: data.preferredFoods || [],
    uploadedFiles: data.uploadedFiles || [],
    preferredNutrients: data.preferredNutrients || [],
    strictExclusions: data.strictExclusions || null,
    workoutPreferencesJson: data.workoutPreferences || undefined,
    biomarkerJson: data.biomarkers || undefined,
    source: data.source || 'web',
    isGuest: true,
    sessionId,
    userId: null
  };
}

// Helper function to count restaurant meals from schedule
function countRestaurantMeals(weeklyMealSchedule: any): number {
  if (!weeklyMealSchedule || typeof weeklyMealSchedule !== 'object') {
    return 7; // Default fallback
  }

  let count = 0;
  Object.values(weeklyMealSchedule).forEach((dayMeals: any) => {
    if (dayMeals?.breakfast === 'restaurant') count++;
    if (dayMeals?.lunch === 'restaurant') count++;
    if (dayMeals?.dinner === 'restaurant') count++;
  });

  return count;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log(`[SURVEY] 📝 Survey submission received. Step: ${payload.currentStep || 'final'}`);

    const parsed = SurveySchema.safeParse(payload);

    if (!parsed.success) {
      console.error('[POST /api/survey] Validation failed:', JSON.stringify(parsed.error.flatten(), null, 2));
      console.error('[POST /api/survey] Input data:', JSON.stringify(payload, null, 2));
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    let sessionId = cookieStore.get('guest_session')?.value;
    
    if (!sessionId) {
      sessionId = nanoid();
    }

    const mealsOutPerWeek = countRestaurantMeals(parsed.data.weeklyMealSchedule);
    const surveyFields = buildSurveyData(parsed.data, sessionId, mealsOutPerWeek);

    // Check if survey already exists for this session
    const existingSurvey = await prisma.surveyResponse.findFirst({
      where: { sessionId }
    });

    let survey;
    if (existingSurvey) {
      survey = await prisma.surveyResponse.update({
        where: { id: existingSurvey.id },
        data: surveyFields
      });
    } else {
      survey = await prisma.surveyResponse.create({
        data: surveyFields
      });
    }

    // Set cookies (session cookies that expire on browser close)
    cookieStore.set('guest_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    cookieStore.set('survey_id', survey.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    console.log('[SURVEY-API] ✅ Survey saved successfully:', {
      surveyId: survey.id,
      hasAge: !!survey.age,
      hasWeight: !!survey.weight,
      hasHeight: !!survey.height,
      hasSex: !!survey.sex,
      age: survey.age,
      weight: survey.weight,
      height: survey.height,
      sex: survey.sex,
      goal: survey.goal,
      activityLevel: survey.activityLevel,
      weeklyMealSchedule: JSON.stringify(survey.weeklyMealSchedule).substring(0, 200)
    });

    // Build base URL for internal API calls
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    // Trigger generation processes on final submission only
    if (!payload.currentStep || payload.currentStep === 9) {
      console.log('[FINAL] 🎯 Final survey submission - creating meal plan and coordinating generation');

      // Step 1: Create a single meal plan record UPFRONT
      const mealPlan = await createCoordinatedMealPlan(survey.id);
      console.log(`[FINAL] ✅ Created coordinated meal plan: ${mealPlan.id}`);

      // Set mealPlanId cookie for direct lookup by /api/ai/meals/current
      cookieStore.set('meal_plan_id', mealPlan.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      console.log(`[FINAL] 🍪 Set meal_plan_id cookie: ${mealPlan.id}`);

      // Step 2: Fire all generation processes in parallel with shared mealPlanId
      // The LoadingJourney will poll for status updates
      Promise.all([
        triggerHomeMealGeneration(survey.id, sessionId, baseUrl, mealPlan.id),
        triggerBackgroundWorkoutGeneration(survey.id, sessionId, baseUrl),
        triggerRestaurantGeneration(survey.id, sessionId, baseUrl, mealPlan.id)
      ]).catch(error => {
        console.error('[FINAL] ❌ Generation error:', error);
      });

      // Also trigger profile generation (fast)
      Promise.all([
        fetch(`${baseUrl}/api/ai/profiles/food`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `survey_id=${survey.id}; guest_session=${sessionId}`
          }
        }),
        fetch(`${baseUrl}/api/ai/profiles/workout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `survey_id=${survey.id}; guest_session=${sessionId}`
          }
        })
      ]).catch(error => {
        console.error('[FINAL] ❌ Profile generation error:', error);
      });

    } else {
      console.log(`[PROGRESSIVE] ℹ️ Step ${payload.currentStep} completed - data saved, no generation triggered`);
    }

    return NextResponse.json({
      ok: true,
      surveyId: survey.id,
      sessionId
    });

  } catch (err) {
    console.error('[POST /api/survey] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const userId = cookieStore.get('user_id')?.value;

    let survey = null;

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      survey = user?.activeSurvey;
    } else if (surveyId) {
      survey = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    } else if (sessionId) {
      survey = await prisma.surveyResponse.findFirst({
        where: { 
          sessionId,
          isGuest: true 
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!survey) {
      return NextResponse.json({ error: 'No survey found' }, { status: 404 });
    }

    console.log('[SURVEY-API-GET] 📋 Returning survey:', {
      surveyId: survey?.id,
      hasAge: !!survey?.age,
      hasWeight: !!survey?.weight,
      hasHeight: !!survey?.height,
      hasSex: !!survey?.sex,
      goal: survey?.goal,
      sessionId: sessionId || 'none',
      userId: userId || 'none'
    });

    return NextResponse.json({ survey });

  } catch (err) {
    console.error('[GET /api/survey] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ============================================================================
// MEAL PLAN COORDINATION
// ============================================================================

/**
 * Create a coordinated meal plan that all generators will use
 */
async function createCoordinatedMealPlan(surveyId: string) {
  console.log(`[COORDINATED-PLAN] 🗑️ Cleaning up old meal plans for survey ${surveyId}...`);

  // Delete any existing meal plans for this survey (from previous attempts)
  const deleted = await prisma.mealPlan.deleteMany({
    where: { surveyId: surveyId }
  });

  if (deleted.count > 0) {
    console.log(`[COORDINATED-PLAN] 🗑️ Deleted ${deleted.count} old meal plan(s)`);
  }

  // Get start of week date for consistent meal plans
  const weekOfDate = new Date();
  weekOfDate.setHours(0, 0, 0, 0);
  // Set to Monday of current week
  const dayOfWeek = weekOfDate.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekOfDate.setDate(weekOfDate.getDate() + daysToMonday);

  // Now create fresh coordinated meal plan
  const mealPlan = await prisma.mealPlan.create({
    data: {
      surveyId: surveyId,
      userId: null, // Set later if user registers
      weekOf: weekOfDate,
      userContext: {
        coordinatedGeneration: true,
        status: 'generating',
        createdAt: new Date().toISOString(),
        generators: {
          homeMeals: 'pending',
          restaurants: 'pending',
          workouts: 'pending'
        },
        days: [],
        homeMeals: [],
        restaurantMeals: [],
        groceryList: null
      },
      status: 'partial',  // Will be updated to 'complete' when all generation finishes
      regenerationCount: 1
    }
  });

  console.log(`[COORDINATED-PLAN] ✅ Created fresh shared meal plan ${mealPlan.id} for survey ${surveyId}`);
  return mealPlan;
}

// ============================================================================
// GENERATION TRIGGER FUNCTIONS
// ============================================================================

/**
 * Triggers home meal generation and WAITS for completion
 * Returns the result including grocery list
 */
async function triggerHomeMealGeneration(
  surveyId: string,
  sessionId: string,
  baseUrl: string,
  mealPlanId?: string
): Promise<{ success: boolean; groceryList?: any; error?: string }> {
  const startTime = Date.now();
  try {
    console.log('[HOME-MEAL-TRIGGER] 🏠 Starting home meal generation (AWAITED)...');

    const response = await fetch(`${baseUrl}/api/ai/meals/generate-home`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`
      },
      body: JSON.stringify({
        backgroundGeneration: true,
        mealPlanId: mealPlanId // Pass coordinated meal plan ID
      })
    });

    const totalTime = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      console.log('[HOME-MEAL-TRIGGER] ✅ Home meals generated:', {
        success: result.success,
        mealsCount: result.timings?.homeMealsGenerated || 0,
        hasGroceryList: !!result.homeMealPlan?.groceryList,
        totalTime: `${totalTime}ms`
      });

      return {
        success: true,
        groceryList: result.homeMealPlan?.groceryList || null
      };
    } else {
      console.error('[HOME-MEAL-TRIGGER] ❌ Home meal generation failed:', {
        status: response.status,
        totalTime: `${totalTime}ms`
      });
      return { success: false, error: `HTTP ${response.status}` };
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[HOME-MEAL-TRIGGER] ❌ Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      totalTime: `${totalTime}ms`
    });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Triggers restaurant meal generation in the background (fire-and-forget)
 */
async function triggerRestaurantGeneration(
  surveyId: string,
  sessionId: string,
  baseUrl: string,
  mealPlanId?: string
): Promise<void> {
  const startTime = Date.now();
  try {
    console.log('[RESTAURANT-TRIGGER] 🏪 Starting restaurant generation (BACKGROUND)...');

    const response = await fetch(`${baseUrl}/api/ai/meals/generate-restaurants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`
      },
      body: JSON.stringify({
        backgroundGeneration: true,
        mealPlanId: mealPlanId // Pass coordinated meal plan ID
      })
    });

    const totalTime = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      console.log('[RESTAURANT-TRIGGER] ✅ Restaurant meals generated:', {
        success: result.success,
        restaurantCount: result.restaurantMeals?.length || 0,
        totalTime: `${totalTime}ms`
      });
    } else {
      console.error('[RESTAURANT-TRIGGER] ❌ Failed:', {
        status: response.status,
        totalTime: `${totalTime}ms`
      });
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[RESTAURANT-TRIGGER] ❌ Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      totalTime: `${totalTime}ms`
    });
  }
}

/**
 * Triggers workout generation in the background (fire-and-forget)
 */
async function triggerBackgroundWorkoutGeneration(
  surveyId: string, 
  sessionId: string, 
  baseUrl: string
): Promise<void> {
  const startTime = Date.now();
  try {
    console.log('[WORKOUT-TRIGGER] 🏋️ Starting workout generation (BACKGROUND)...');

    const response = await fetch(`${baseUrl}/api/ai/workouts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`
      },
      body: JSON.stringify({ backgroundGeneration: true })
    });

    const totalTime = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      console.log('[WORKOUT-TRIGGER] ✅ Workouts generated:', {
        success: result.success,
        totalTime: `${totalTime}ms`
      });
    } else {
      console.error('[WORKOUT-TRIGGER] ❌ Failed:', {
        status: response.status,
        totalTime: `${totalTime}ms`
      });
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[WORKOUT-TRIGGER] ❌ Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      totalTime: `${totalTime}ms`
    });
  }
}