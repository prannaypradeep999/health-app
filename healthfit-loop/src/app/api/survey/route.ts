import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SurveySchema } from '@/lib/schemas';
import { parseHeight } from '@/lib/utils/nutrition';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';
import { getStartOfWeek } from '@/lib/utils/date-utils';
import { checkPreferenceConflicts } from '@/lib/utils/preference-conflict-checker';
import { sendEmail, generateDashboardReadyEmail } from '@/lib/email';

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
  let height = typeof data.height === 'string'
    ? parseHeight(data.height)
    : (Number(data.height) || 68);

  if (height < 36 || height > 96) {
    console.warn(`[SURVEY] Invalid height: ${height}, using default 68`);
    height = 68;
  }

  return {
    email: data.email || '',
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    age: data.age || 0,
    sex: data.sex || '',
    height,
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
    customFoodInput: data.customFoodInput || null,
    uploadedFiles: data.uploadedFiles || [],
    preferredNutrients: data.preferredNutrients || [],
    foodAllergies: data.fillerQuestions?.foodAllergies || [],
    eatingOutOccasions: data.fillerQuestions?.eatingOutOccasions || null,
    healthGoalPriority: data.fillerQuestions?.healthGoalPriority || null,
    motivationLevel: data.fillerQuestions?.motivationLevel || null,
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

export async function PATCH(req: Request) {
  try {
    const { surveyId, email } = await req.json();

    if (!surveyId || !email) {
      return NextResponse.json(
        { error: 'surveyId and email are required' },
        { status: 400 }
      );
    }

    // Update the survey with the email address
    await prisma.surveyResponse.update({
      where: { id: surveyId },
      data: { email }
    });

    console.log(`[SURVEY-PATCH] ✅ Email updated for survey ${surveyId}: ${email}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SURVEY-PATCH] ❌ Error updating email:', error);
    return NextResponse.json(
      { error: 'Failed to update email' },
      { status: 500 }
    );
  }
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

    const conflicts = checkPreferenceConflicts(
      parsed.data.preferredFoods || [],
      parsed.data.dietPrefs || [],
      parsed.data.strictExclusions || {},
      parsed.data.fillerQuestions?.foodAllergies || []
    );

    const errorConflicts = conflicts.filter(conflict => conflict.severity === 'error');
    if (errorConflicts.length > 0) {
      return NextResponse.json(
        {
          error: 'Conflicting preferences detected',
          conflicts: errorConflicts,
        },
        { status: 400 }
      );
    }

    const requiredFields = ['age', 'sex', 'height', 'weight', 'activityLevel', 'goal'] as const;
    const missingFields = requiredFields.filter((field) => {
      const value = parsed.data[field];
      if (typeof value === 'number') {
        return Number.isNaN(value);
      }
      return value === null || value === undefined || value === '';
    });

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: 'Missing required fields', fields: missingFields },
        { status: 400 }
      );
    }

    if (parsed.data.age < 13 || parsed.data.age > 120) {
      return NextResponse.json({ error: 'Invalid age' }, { status: 400 });
    }
    if (parsed.data.height < 36 || parsed.data.height > 96) {
      return NextResponse.json({ error: 'Invalid height' }, { status: 400 });
    }
    if (parsed.data.weight < 50 || parsed.data.weight > 700) {
      return NextResponse.json({ error: 'Invalid weight' }, { status: 400 });
    }

    const normalizedData = {
      ...parsed.data,
      dietPrefs: parsed.data.dietPrefs ?? [],
      strictExclusions: parsed.data.strictExclusions ?? {
        proteins: [],
        dairy: [],
        fruits: [],
        vegetables: [],
        nuts: [],
        grains: [],
        other: []
      },
      preferredCuisines: parsed.data.preferredCuisines ?? [],
      weeklyMealSchedule: parsed.data.weeklyMealSchedule ?? {},
      workoutPreferences: {
        preferredDuration: parsed.data.workoutPreferences?.preferredDuration ?? 45,
        availableDays: parsed.data.workoutPreferences?.availableDays?.length
          ? parsed.data.workoutPreferences.availableDays
          : ['monday', 'wednesday', 'friday'],
        workoutTypes: parsed.data.workoutPreferences?.workoutTypes ?? [],
        gymAccess: parsed.data.workoutPreferences?.gymAccess ?? 'no_gym',
        fitnessExperience: parsed.data.workoutPreferences?.fitnessExperience ?? 'intermediate',
        injuryConsiderations: parsed.data.workoutPreferences?.injuryConsiderations ?? [],
        timePreferences: parsed.data.workoutPreferences?.timePreferences ?? []
      }
    };

    const cookieStore = await cookies();
    let sessionId = cookieStore.get('guest_session')?.value;
    
    if (!sessionId) {
      sessionId = nanoid();
    }

    const mealsOutPerWeek = countRestaurantMeals(normalizedData.weeklyMealSchedule);
    const surveyFields = buildSurveyData(normalizedData, sessionId, mealsOutPerWeek);

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

    // Set cookies with 30-day expiration to persist across browser restarts
    cookieStore.set('guest_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    cookieStore.set('survey_id', survey.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    console.log(`[SURVEY-API] ✅ Survey saved: id=${survey.id}, session=${sessionId}, age=${survey.age}, weight=${survey.weight}, height=${survey.height}, sex=${survey.sex}`);

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
        path: '/',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });
      console.log(`[SURVEY-API] 🍪 Set cookies: guest_session=${sessionId}, survey_id=${survey.id}, meal_plan_id=${mealPlan.id} (maxAge: 30d)`);

      // Step 2: Sequential meal generation + parallel workout generation
      // The LoadingJourney will poll for status updates

      // Workouts are independent - start in background
      const workoutPromise = triggerBackgroundWorkoutGeneration(survey.id, sessionId, baseUrl);

      // Sequential meal generation for budget coordination
      (async () => {
        try {
          // Step 1: Generate restaurant meals FIRST (they're constrained by real menus)
          console.log('[FINAL] 🏪 Starting restaurant generation first (sequential)...');
          const restaurantResult = await triggerRestaurantGeneration(survey.id, sessionId, baseUrl, mealPlan.id);

          // Step 2: Extract actual calories from restaurant meals
          let restaurantCalories: Array<{ day: string; mealType: string; calories: number }> = [];
          if (restaurantResult.success && restaurantResult.mealCalories) {
            restaurantCalories = restaurantResult.mealCalories;
            console.log('[FINAL] 📊 Restaurant calories extracted:', restaurantCalories);
          }

          // Step 3: Pass remaining budget to home meal generator
          console.log('[FINAL] 🏠 Starting home meal generation with restaurant budget context...');
          await triggerHomeMealGeneration(survey.id, sessionId, baseUrl, mealPlan.id, restaurantCalories);

          // Wait for workouts too
          await workoutPromise;

          // Send dashboard ready email after all generation completes
          try {
            if (survey.email && !survey.dashboardEmailSent) {
              console.log(`[FINAL] 📧 Sending dashboard ready email to ${survey.email}...`);
              const { subject, html } = generateDashboardReadyEmail(survey.firstName, survey.id);
              const emailSent = await sendEmail({
                to: survey.email,
                subject,
                html
              });

              if (emailSent) {
                await prisma.surveyResponse.update({
                  where: { id: survey.id },
                  data: { dashboardEmailSent: true }
                });
                console.log(`[FINAL] ✅ Dashboard email sent to ${survey.email}`);
              } else {
                console.log(`[FINAL] ❌ Failed to send dashboard email to ${survey.email}`);
              }
            } else if (survey.dashboardEmailSent) {
              console.log(`[FINAL] 📧 Dashboard email already sent to ${survey.email}, skipping`);
            } else {
              console.log(`[FINAL] 📧 No email address found, skipping dashboard email`);
            }
          } catch (emailError) {
            console.error('[FINAL] ❌ Email send failed, continuing:', emailError);
          }

        } catch (error) {
          console.error('[FINAL] ❌ Sequential generation error:', error);
        }
      })();

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

    console.log(`[SURVEY-GET] 🔍 Looking up survey: userId="${userId}", sessionId="${sessionId}", surveyId="${surveyId}"`);

    let survey = null;

    // Priority 1: Direct surveyId lookup (most specific)
    if (surveyId) {
      survey = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
      if (survey) {
        console.log(`[SURVEY-GET] ✅ Found survey via surveyId: ${survey.id}`);
      }
    }

    // Priority 2: Session-based lookup
    if (!survey && sessionId) {
      survey = await prisma.surveyResponse.findFirst({
        where: {
          sessionId,
          isGuest: true
        },
        orderBy: { createdAt: 'desc' }
      });
      if (survey) {
        console.log(`[SURVEY-GET] ✅ Found survey via sessionId: ${survey.id}`);
      }
    }

    // Priority 3: User-based lookup (but verify user exists first)
    if (!survey && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });

      if (user) {
        survey = user.activeSurvey;
        if (survey) {
          console.log(`[SURVEY-GET] ✅ Found survey via userId: ${survey.id}`);
        }
      } else {
        console.warn(`[SURVEY-GET] ⚠️ Stale user_id cookie: ${userId} not found in DB, ignoring`);
      }
    }

    if (!survey) {
      console.log(`[SURVEY-GET] ❌ No survey found with any method`);
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
  const weekOfDate = getStartOfWeek();

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
  mealPlanId?: string,
  restaurantCalories?: Array<{ day: string; mealType: string; calories: number }>
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
        mealPlanId: mealPlanId, // Pass coordinated meal plan ID
        restaurantCalories: restaurantCalories || [] // NEW: Pass restaurant budget context
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
 * Triggers restaurant meal generation and returns actual meal calorie data
 */
async function triggerRestaurantGeneration(
  surveyId: string,
  sessionId: string,
  baseUrl: string,
  mealPlanId?: string
): Promise<{ success: boolean; mealCalories?: Array<{ day: string; mealType: string; calories: number }>; error?: string }> {
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

      // Extract per-meal calories from restaurant results
      const mealCalories = (result.restaurantMeals || []).map((meal: any) => ({
        day: meal.day,
        mealType: meal.mealType,
        calories: meal.primary?.estimatedCalories || meal.estimatedCalories || 0
      }));

      return { success: true, mealCalories };
    } else {
      console.error('[RESTAURANT-TRIGGER] ❌ Failed:', {
        status: response.status,
        totalTime: `${totalTime}ms`
      });
      return { success: false, error: `HTTP ${response.status}` };
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RESTAURANT-TRIGGER] ❌ Error:', {
      error: errorMessage,
      totalTime: `${totalTime}ms`
    });
    return { success: false, error: errorMessage };
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