import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SurveySchema } from '@/lib/schemas';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

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

    const {
      email,
      firstName,
      lastName,
      age,
      sex,
      height,
      weight,

      // Full address fields
      streetAddress,
      city,
      state,
      zipCode,
      country,
      goal,
      activityLevel,
      sportsInterests,
      fitnessTimeline,
      monthlyFoodBudget,
      monthlyFitnessBudget,
      dietPrefs,
      mealsOutPerWeek,
      distancePreference,
      preferredCuisines,
      preferredFoods,
      uploadedFiles,
      preferredNutrients,
      workoutPreferences,
      biomarkers,
      source,
    } = parsed.data;

    const survey = await prisma.surveyResponse.create({
      data: {
        email: email || '',
        firstName: firstName || '',
        lastName: lastName || '',
        age: age || 0,
        sex: sex || '',
        height: Number(height) || 0,
        weight: weight || 0,

        // Full address fields
        streetAddress: streetAddress || '',
        city: city || '',
        state: state || '',
        zipCode: zipCode || '',
        country: country || 'United States',
        goal,
        activityLevel: activityLevel || '',
        sportsInterests: sportsInterests || '',
        fitnessTimeline: fitnessTimeline || '',
        monthlyFoodBudget: monthlyFoodBudget || 200,
        monthlyFitnessBudget: monthlyFitnessBudget || 50,
        dietPrefs: dietPrefs || [],
        mealsOutPerWeek: mealsOutPerWeek || 0,
        distancePreference: distancePreference || 'medium',
        preferredCuisines: preferredCuisines || [],
        preferredFoods: preferredFoods || [],
        uploadedFiles: uploadedFiles || [],
        preferredNutrients: preferredNutrients || [],
        workoutPreferencesJson: workoutPreferences || undefined,
        biomarkerJson: biomarkers || undefined,
        source: source || 'web',
        isGuest: true,
        sessionId,
        userId: null
      }
    });

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

    // Check if this is step 5 completion to trigger meal generation
    if (payload.currentStep === 5) {
      console.log('[MEAL-TRIGGER] 🍽️ Step 5 completed - triggering background meal generation');
      console.log('[MEAL-TRIGGER] 📊 Survey data for meal generation:', {
        surveyId: survey.id,
        sessionId,
        goal: parsed.data.goal,
        city: parsed.data.city,
        state: parsed.data.state,
        cuisines: parsed.data.preferredCuisines?.length || 0,
        foods: parsed.data.preferredFoods?.length || 0,
        distancePreference: parsed.data.distancePreference
      });

      // Trigger background meal generation (non-blocking)
      const protocol = req.headers.get('x-forwarded-proto') || 'http';
      const host = req.headers.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;

      triggerMealGeneration(survey.id, sessionId, parsed.data, baseUrl).catch(error => {
        console.error('[MEAL-TRIGGER] ❌ Background meal generation failed:', error);
      });
    } else if (payload.currentStep === 6) {
      console.log('[WORKOUT-TRIGGER] 🏋️ Step 6 completed - triggering background workout generation');
      console.log('[WORKOUT-TRIGGER] 📊 Survey data for workout generation:', {
        surveyId: survey.id,
        sessionId,
        goal: parsed.data.goal,
        activityLevel: parsed.data.activityLevel,
        age: parsed.data.age,
        workoutPrefs: !!parsed.data.workoutPreferences
      });

      // Trigger background workout generation (non-blocking)
      const protocol = req.headers.get('x-forwarded-proto') || 'http';
      const host = req.headers.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;

      triggerBackgroundWorkoutGeneration(survey.id, sessionId, parsed.data, baseUrl).catch(error => {
        console.error('[WORKOUT-TRIGGER] ❌ Background workout generation failed:', error);
      });
    } else if (!payload.currentStep) {
      console.log('[FINAL] 🎯 Final survey submission - both meal and workout generation already triggered in previous steps');
    } else {
      console.log(`[PROGRESSIVE] ℹ️ Step ${payload.currentStep || 'final'} completed - no background processes triggered`);
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
    } 
    else if (surveyId) {
      survey = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    } 
    else if (sessionId) {
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

// Progressive generation functions

async function triggerBackgroundWorkoutGeneration(surveyId: string, sessionId: string, surveyData: any, baseUrl: string) {
  const startTime = Date.now();
  try {
    console.log('[WORKOUT-TRIGGER] 🏋️ Starting background workout generation for survey:', surveyId);
    console.log('[WORKOUT-TRIGGER] 🌐 Making fetch request to workout generation endpoint...');

    // baseUrl is now passed as parameter

    const fetchStartTime = Date.now();
    const response = await fetch(`${baseUrl}/api/ai/workouts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`
      },
      body: JSON.stringify({ backgroundGeneration: true })
    });
    const fetchTime = Date.now() - fetchStartTime;

    if (response.ok) {
      const result = await response.json();
      const totalTime = Date.now() - startTime;
      console.log('[WORKOUT-TRIGGER] ✅ Workout generation completed:', {
        success: result.success,
        timings: result.timings,
        totalBackgroundTime: totalTime
      });
      console.log('[WORKOUT-TRIGGER] 📈 Performance:', {
        fetchTime: `${fetchTime}ms`,
        totalTime: `${totalTime}ms`,
        workoutTimings: result.timings
      });
    } else {
      const totalTime = Date.now() - startTime;
      console.error('[WORKOUT-TRIGGER] ❌ Workout generation failed:', {
        status: response.status,
        statusText: response.statusText,
        totalTime: `${totalTime}ms`
      });
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[WORKOUT-TRIGGER] ❌ Workout generation error:', {
      error: error.message,
      totalTime: `${totalTime}ms`
    });
  }
}

async function triggerMealGeneration(surveyId: string, sessionId: string, surveyData: any, baseUrl: string) {
  const startTime = Date.now();
  try {
    console.log('[FINAL] 🍽️ Starting meal plan generation for survey:', surveyId);
    console.log('[FINAL] 🌐 Making fetch request to meal generation endpoint...');

    // baseUrl is now passed as parameter

    const fetchStartTime = Date.now();
    const response = await fetch(`${baseUrl}/api/ai/meals/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`
      },
      body: JSON.stringify({ backgroundGeneration: true })
    });
    const fetchTime = Date.now() - fetchStartTime;

    if (response.ok) {
      const result = await response.json();
      const totalTime = Date.now() - startTime;
      console.log('[FINAL] ✅ Meal generation completed:', {
        success: result.success,
        timings: result.timings,
        totalBackgroundTime: totalTime
      });
      console.log('[FINAL] 📈 Performance:', {
        fetchTime: `${fetchTime}ms`,
        totalTime: `${totalTime}ms`,
        mealTimings: result.timings
      });
    } else {
      const totalTime = Date.now() - startTime;
      console.error('[FINAL] ❌ Meal generation failed:', {
        status: response.status,
        statusText: response.statusText,
        totalTime: `${totalTime}ms`
      });
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[FINAL] ❌ Meal generation error:', {
      error: error.message,
      totalTime: `${totalTime}ms`
    });
  }
}