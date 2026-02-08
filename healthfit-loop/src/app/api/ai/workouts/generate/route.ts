import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { pexelsClient } from '@/lib/external/pexels-client';
import { createWorkoutPlanPrompt, type WorkoutPlan, type WorkoutDay } from '@/lib/ai/prompts';
import { withGPTRetry } from '@/lib/utils/retry';
import { validateWorkoutPlan } from '@/lib/utils/workout-validator';
import { getStartOfWeek } from '@/lib/utils/date-utils';

export const runtime = 'nodejs';

/**
 * Workout Generation API Route
 * 
 * CHANGES MADE:
 * - Removed duplicate WorkoutDay and WorkoutPlan interface definitions (now imported from prompts)
 * - Removed unused generateFitnessProfile() function (was generating data that was never stored/used)
 * - Removed unused dayInfo and currentDate variables in generateWorkoutPlan()
 * - Fixed error.message TypeScript issues with proper type casting
 * - Fixed template literal syntax errors
 */

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[WORKOUT-GENERATION] 🚀 Starting workout generation at ${new Date().toISOString()}`);

  try {
    let requestData: { backgroundGeneration?: boolean } = {};
    try {
      requestData = await req.json();
    } catch {
      console.log(`[WORKOUT-GENERATION] 📄 Empty request body, using defaults`);
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    console.log('[WORKOUT-GENERATION] 📊 Cookie data:', { userId, sessionId, surveyId });

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
      console.log('[WORKOUT-GENERATION] ❌ No survey data found');
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log('[WORKOUT-GENERATION] ✅ Survey data found:', {
      goal: surveyData.goal,
      activityLevel: surveyData.activityLevel,
      age: surveyData.age,
      workoutPrefs: !!surveyData.workoutPreferencesJson
    });

    // Generate workout plan
    console.log('[WORKOUT-GENERATION] 🎯 Generating workout plan...');
    const generationStartTime = Date.now();

    const workoutPlan = await generateWorkoutPlan(surveyData);

    const generationTime = Date.now() - generationStartTime;
    console.log(`[WORKOUT-GENERATION] ✅ Plan generation completed in ${generationTime}ms`);

    // Enhance workout plan with exercise images
    console.log('[WORKOUT-GENERATION] 🖼️ Enhancing workout plan with exercise images...');
    const imageStartTime = Date.now();
    const enhancedWorkoutPlan = await enhanceWorkoutPlanWithImages(workoutPlan, surveyData);
    const imageTime = Date.now() - imageStartTime;
    console.log(`[WORKOUT-GENERATION] ✅ Image enhancement completed in ${imageTime}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`[WORKOUT-GENERATION] 🏁 Total generation time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    // Save to database
    try {
      console.log(`[DATABASE] 💾 Saving workout plan for survey: ${surveyData.id}`);
      const weekOfDate = getStartOfWeek();

      const createdWorkoutPlan = await prisma.workoutPlan.create({
        data: {
          surveyId: surveyData.id,
          userId: userId || null,
          weekOf: weekOfDate,
          planData: enhancedWorkoutPlan as any,
          status: 'active'
        }
      });
      console.log(`[DATABASE] ✅ Workout plan saved with ID: ${createdWorkoutPlan.id}`);
    } catch (dbError) {
      console.error(`[DATABASE] ❌ Failed to save workout plan:`, dbError);
      // Continue anyway since we have the data
    }

    return NextResponse.json({
      success: true,
      workoutPlan: enhancedWorkoutPlan,
      timings: {
        generationTime: `${generationTime}ms`,
        imageTime: `${imageTime}ms`,
        totalTime: `${totalTime}ms`
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[WORKOUT-GENERATION] ❌ Error after ${totalTime}ms:`, error);
    return NextResponse.json(
      { error: 'Failed to generate workout plan', details: (error as Error).message },
      { status: 500 }
    );
  }
}

async function generateWorkoutPlan(surveyData: any): Promise<WorkoutPlan> {
  const workoutPrefs = surveyData.workoutPreferencesJson || {};

  const userPrompt = createWorkoutPlanPrompt(surveyData, workoutPrefs);

  const gptResult = await withGPTRetry(async () => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You must respond with valid JSON only. Start with { and end with }. No markdown, no code blocks, no additional text.'
          },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status}`);
    }
    return response.json();
  }, 'Workout plan generation');

  if (!gptResult.success) {
    throw new Error(`Workout generation failed after retries: ${gptResult.error}`);
  }

  const completion = gptResult.data;
  const workoutContent = completion.choices[0].message.content;

  try {
    const workoutPlan = JSON.parse(workoutContent) as WorkoutPlan;
    console.log(`[GPT-WORKOUT] ✅ Successfully generated ${workoutPlan.weeklyPlan.length} workout days`);

    const toNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && !Number.isNaN(value)) return value;
      if (typeof value === 'string') {
        const match = value.match(/\d+/);
        return match ? Number(match[0]) : null;
      }
      return null;
    };

    const sanitizeWorkoutDay = (day: any): { sanitized: any; warnings: string[] } => {
      const warnings: string[] = [];
      const sanitized = { ...day };
      const dayLabel = typeof day?.day === 'string' ? day.day : 'unknown';

      if (day?.estimatedCalories !== undefined) {
        const calories = toNumber(day.estimatedCalories);
        if (calories !== null) {
          if (calories < 50) {
            warnings.push(`${dayLabel}: estimatedCalories ${calories} too low, setting to 50`);
            sanitized.estimatedCalories = 50;
          } else if (calories > 800) {
            warnings.push(`${dayLabel}: estimatedCalories ${calories} too high, capping at 800`);
            sanitized.estimatedCalories = 800;
          } else {
            sanitized.estimatedCalories = calories;
          }
        }
      }

      if (day?.estimatedTime !== undefined) {
        const time = toNumber(day.estimatedTime);
        if (time !== null) {
          if (time < 10) {
            warnings.push(`${dayLabel}: estimatedTime ${time} too low, setting to 10`);
            sanitized.estimatedTime = '10 minutes';
          } else if (time > 120) {
            warnings.push(`${dayLabel}: estimatedTime ${time} too high, capping at 120`);
            sanitized.estimatedTime = '120 minutes';
          } else {
            sanitized.estimatedTime = `${time} minutes`;
          }
        }
      }

      if (Array.isArray(day?.exercises) && day.exercises.length > 15) {
        warnings.push(`${dayLabel}: ${day.exercises.length} exercises is too many, truncating to 12`);
        sanitized.exercises = day.exercises.slice(0, 12);
      }

      return { sanitized, warnings };
    };

    const sanitizedWeeklyPlan = Array.isArray(workoutPlan.weeklyPlan)
      ? workoutPlan.weeklyPlan.map(day => {
          const { sanitized, warnings } = sanitizeWorkoutDay(day);
          warnings.forEach(warn => console.warn(`[WORKOUT-SANITIZE] ${warn}`));
          return sanitized;
        })
      : [];

    const sanitizedWorkoutPlan = {
      ...workoutPlan,
      weeklyPlan: sanitizedWeeklyPlan
    };

    const validationResult = validateWorkoutPlan(sanitizedWorkoutPlan.weeklyPlan, {
      preferredDuration: workoutPrefs.preferredDuration,
      availableDays: workoutPrefs.availableDays,
      fitnessExperience: workoutPrefs.fitnessExperience
    });

    console.log('[WORKOUT-GENERATION] Validation:', {
      valid: validationResult.valid,
      warnings: validationResult.warnings.length,
      errors: validationResult.errors.length
    });

    if (!validationResult.valid) {
      validationResult.errors.forEach(err => console.error(`  ❌ ${err}`));
    }
    validationResult.warnings.forEach(warn => console.warn(`  ⚠️ ${warn}`));

    return sanitizedWorkoutPlan;
  } catch (parseError) {
    console.error('[GPT-WORKOUT] ❌ JSON parse error:', parseError);
    console.error('[GPT-WORKOUT] ❌ Raw content preview:', workoutContent?.substring(0, 200));
    throw new Error('Failed to parse workout plan JSON');
  }
}

async function enhanceWorkoutPlanWithImages(workoutPlan: WorkoutPlan, surveyData: any): Promise<WorkoutPlan> {
  const enhanceStartTime = Date.now();
  console.log(`[WORKOUT-IMAGES] Starting image enhancement for ${workoutPlan.weeklyPlan?.length || 0} days...`);

  if (!workoutPlan.weeklyPlan || !Array.isArray(workoutPlan.weeklyPlan)) {
    console.log(`[WORKOUT-IMAGES] No days found in workout plan, returning original`);
    return workoutPlan;
  }

  const workoutPrefs = surveyData.workoutPreferencesJson || {};
  const equipmentContext = workoutPrefs.gymAccess || 'bodyweight';

  // Process each day's exercises in parallel
  const enhancedDays = await Promise.all(
    workoutPlan.weeklyPlan.map(async (day: WorkoutDay) => {
      const dayStartTime = Date.now();
      console.log(`[WORKOUT-IMAGES] Processing ${day.day} (${day.focus})...`);

      // Skip rest days
      if (day.restDay || !day.exercises || day.exercises.length === 0) {
        console.log(`[WORKOUT-IMAGES] Skipping rest day: ${day.day}`);
        return day;
      }

      // Enhance each exercise with images
      const enhancedExercises = await Promise.all(
        day.exercises.map(async (exercise: any) => {
          try {
            const exerciseName = exercise.name;
            if (!exerciseName) {
              return exercise;
            }

            // Determine muscle group
            const primaryMuscleGroup = day.targetMuscles?.[0] ||
              exercise.muscleTargets?.[0] ||
              (day.focus.toLowerCase().includes('chest') ? 'chest' :
              day.focus.toLowerCase().includes('back') ? 'back' :
              day.focus.toLowerCase().includes('legs') ? 'legs' :
              day.focus.toLowerCase().includes('shoulders') ? 'shoulders' :
              day.focus.toLowerCase().includes('arms') ? 'arms' :
              'full body');

            // Get image from Pexels
            const imageResult = await pexelsClient.getWorkoutImage(exerciseName, {
              muscleGroup: primaryMuscleGroup,
              equipmentType: equipmentContext,
              searchTerms: exercise.description
            });

            console.log(`[WORKOUT-IMAGES] ${imageResult.cached ? '📦 cached' : '🌐 fetched'} ${exerciseName}`);

            return {
              ...exercise,
              imageUrl: imageResult.imageUrl,
              imageSource: imageResult.imageSource,
              imageSearchQuery: imageResult.searchQuery,
              imageCached: imageResult.cached
            };

          } catch (error) {
            console.error(`[WORKOUT-IMAGES] Error getting image for ${exercise.name}:`, error);
            return exercise;
          }
        })
      );

      const dayTime = Date.now() - dayStartTime;
      console.log(`[WORKOUT-IMAGES] ${day.day} enhanced in ${dayTime}ms`);

      return {
        ...day,
        exercises: enhancedExercises
      };
    })
  );

  const enhanceTime = Date.now() - enhanceStartTime;
  console.log(`[WORKOUT-IMAGES] All workout images enhanced in ${enhanceTime}ms`);

  return {
    ...workoutPlan,
    weeklyPlan: enhancedDays
  };
}