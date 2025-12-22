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
 * - Step 5: Now AWAITS home meal generation before returning (was fire-and-forget)
 * - Step 5: Restaurant generation still runs in background (fire-and-forget)
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
    activityLevel: data.activityLevel || '',
    sportsInterests: data.sportsInterests || '',
    fitnessTimeline: data.fitnessTimeline || '',
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

    // Set cookies
    cookieStore.set('guest_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    cookieStore.set('survey_id', survey.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    // Build base URL for internal API calls
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    // Trigger background processes based on step
    if (payload.currentStep === 5) {
      console.log('[MEAL-TRIGGER] 🍽️ Step 5 completed - starting meal generation');
      console.log('[MEAL-TRIGGER] 📊 Survey data:', {
        surveyId: survey.id,
        sessionId,
        goal: parsed.data.goal,
        city: parsed.data.city,
        cuisines: parsed.data.preferredCuisines?.length || 0,
        foods: parsed.data.preferredFoods?.length || 0,
      });

      // AWAIT home meals (this is the critical change - we wait for home meals to complete)
      // This ensures the dashboard has home meals + grocery list ready
      const homeMealsResult = await triggerHomeMealGeneration(survey.id, sessionId, baseUrl);

      // Fire-and-forget restaurant generation (runs in background)
      triggerRestaurantGeneration(survey.id, sessionId, baseUrl).catch(error => {
        console.error('[RESTAURANT-TRIGGER] ❌ Background restaurant generation failed:', error);
      });

      return NextResponse.json({
        ok: true,
        surveyId: survey.id,
        sessionId,
        homeMealsReady: homeMealsResult.success,
        groceryList: homeMealsResult.groceryList || null
      });

    } else if (payload.currentStep === 6) {
      console.log('[WORKOUT-TRIGGER] 🏋️ Step 6 completed - triggering background workout generation');

      // Fire-and-forget workout generation
      triggerBackgroundWorkoutGeneration(survey.id, sessionId, baseUrl).catch(error => {
        console.error('[WORKOUT-TRIGGER] ❌ Background workout generation failed:', error);
      });

    } else if (!payload.currentStep) {
      console.log('[FINAL] 🎯 Final survey submission');
    } else {
      console.log(`[PROGRESSIVE] ℹ️ Step ${payload.currentStep} completed`);
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

    return NextResponse.json({ survey });

  } catch (err) {
    console.error('[GET /api/survey] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
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
  baseUrl: string
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
      body: JSON.stringify({ backgroundGeneration: true })
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
  baseUrl: string
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
      body: JSON.stringify({ backgroundGeneration: true })
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