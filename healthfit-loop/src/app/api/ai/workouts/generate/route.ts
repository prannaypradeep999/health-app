import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { pexelsClient } from '@/lib/external/pexels-client';
import { createWorkoutPlanPrompt, createWorkoutPlanningPrompt, createWorkoutDetailPrompt, type WorkoutPlan, type WorkoutDay, type WorkoutFeedbackContext, type WorkoutPreferences } from '@/lib/ai/prompts';
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
    console.log(`[WORKOUT-GENERATION] ✅ GPT workout plan generated in ${generationTime}ms`);

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

      const existingPlan = await prisma.workoutPlan.findFirst({
        where: { surveyId: surveyData.id, weekOf: weekOfDate },
        select: { id: true }
      });

      let createdWorkoutPlan;
      if (existingPlan) {
        createdWorkoutPlan = await prisma.workoutPlan.update({
          where: { id: existingPlan.id },
          data: {
            planData: enhancedWorkoutPlan as any,
            status: 'active'
          }
        });
        console.log(`[DATABASE] ✅ Workout plan updated (upsert) with ID: ${createdWorkoutPlan.id}`);
      } else {
        createdWorkoutPlan = await prisma.workoutPlan.create({
          data: {
            surveyId: surveyData.id,
            userId: userId || null,
            weekOf: weekOfDate,
            planData: enhancedWorkoutPlan as any,
            status: 'active'
          }
        });
        console.log(`[DATABASE] ✅ Workout plan saved with ID: ${createdWorkoutPlan.id}`);
      }

      // Set workout_plan_id cookie for direct lookup
      const cookieStore = await cookies();
      cookieStore.set('workout_plan_id', createdWorkoutPlan.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });
      console.log(`[DATABASE] 🍪 Set workout_plan_id cookie: ${createdWorkoutPlan.id}`);
    } catch (dbError) {
      console.error(`[DATABASE] ❌ Failed to save workout plan:`, dbError);
      console.error(`[DATABASE] ❌ Full error details:`, {
        name: (dbError as Error).name,
        message: (dbError as Error).message,
        stack: (dbError as Error).stack
      });
      return NextResponse.json(
        {
          error: 'Failed to save workout plan to database',
          details: (dbError as Error).message,
          workoutGenerated: true // Plan was generated but not saved
        },
        { status: 500 }
      );
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

async function getWorkoutFeedbackContext(surveyData: any): Promise<WorkoutFeedbackContext | undefined> {
  const userId = surveyData.userId;
  const surveyId = surveyData.id;
  if (!userId && !surveyId) return undefined;

  const userFilter = [
    ...(userId ? [{ userId }] : []),
    ...(surveyId ? [{ surveyId }] : []),
  ];

  const [exerciseLogs, workoutLogs, customWorkouts, favoritesRaw] = await Promise.all([
    prisma.workoutExerciseLog.findMany({
      where: { workoutLog: { userId: userId || undefined } },
      select: {
        exerciseName: true,
        difficultyRating: true,
        formRating: true,
        weightUsedLbs: true,
        weightUsed: true,
        repsCompleted: true,
        setsCompleted: true,
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workoutLog.findMany({
      where: { userId: userId || undefined },
      select: { day: true, completed: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userCustomWorkout.findMany({
      where: { OR: userFilter },
      select: { exercises: true },
      take: 10,
    }),
    prisma.userExerciseFavorite.findMany({
      where: { OR: userFilter },
      select: { exerciseLibrary: { select: { name: true } } },
      take: 20,
    }),
  ]);

  const poor = exerciseLogs.filter(l => (l.difficultyRating || 0) >= 8).map(l => l.exerciseName);
  const good = exerciseLogs.filter(l => (l.formRating || 0) >= 8).map(l => l.exerciseName);

  const dayTotals: Record<string, { total: number; completed: number }> = {};
  for (const log of workoutLogs) {
    if (!dayTotals[log.day]) dayTotals[log.day] = { total: 0, completed: 0 };
    dayTotals[log.day].total++;
    if (log.completed) dayTotals[log.day].completed++;
  }
  const completionRateByDay: Record<string, number> = {};
  for (const [day, { total, completed }] of Object.entries(dayTotals)) {
    completionRateByDay[day] = Math.round((completed / total) * 100);
  }

  const savedNames = customWorkouts.flatMap(cw => {
    const exs = cw.exercises as Array<{ name: string }>;
    return exs.map(e => e.name);
  });

  const favoriteNames = favoritesRaw.map(f => f.exerciseLibrary.name);

  // Build per-exercise weight progression (most recent log per exercise)
  const exerciseWeightMap = new Map<string, { lastWeightLbs: number; suggestedWeightLbs: number }>();
  const seenExercises = new Set<string>();

  for (const log of exerciseLogs) {
    if (!log.exerciseName || seenExercises.has(log.exerciseName)) continue;
    seenExercises.add(log.exerciseName);

    const lastWeight = log.weightUsedLbs
      ?? (log.weightUsed?.length ? log.weightUsed[log.weightUsed.length - 1] : null);

    if (lastWeight && lastWeight > 0) {
      const increase = lastWeight < 50 ? 2.5 : lastWeight < 100 ? 5 : 10;
      const suggested = Math.round((lastWeight + increase) / 2.5) * 2.5;
      exerciseWeightMap.set(log.exerciseName, {
        lastWeightLbs: lastWeight,
        suggestedWeightLbs: suggested,
      });
    }
  }

  const exerciseRepMap = new Map<string, number[]>();
  const seenForReps = new Set<string>();
  for (const log of exerciseLogs) {
    if (!log.exerciseName || seenForReps.has(log.exerciseName)) continue;
    seenForReps.add(log.exerciseName);
    if (log.repsCompleted?.length) {
      exerciseRepMap.set(log.exerciseName, log.repsCompleted);
    }
  }

  const weightProgressionByExercise = Object.fromEntries(exerciseWeightMap);
  const repCompletionByExercise = Object.fromEntries(exerciseRepMap);

  if (!poor.length && !good.length && !savedNames.length && !favoriteNames.length && !Object.keys(completionRateByDay).length && !exerciseWeightMap.size && !exerciseRepMap.size) {
    return undefined;
  }

  return {
    poorlyRatedExercises: [...new Set(poor)].slice(0, 10),
    wellRatedExercises: [...new Set(good)].slice(0, 10),
    completionRateByDay,
    savedCustomExercises: [...new Set(savedNames)].slice(0, 10),
    favoriteExercises: [...new Set(favoriteNames)].slice(0, 10),
    weightProgressionByExercise,
    repCompletionByExercise,
  };
}

// ─── Shared sanitizer ───────────────────────────────────────────────────────

const toNumberLocal = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  }
  return null;
};

function sanitizeDay(day: any): { sanitized: any; warnings: string[] } {
  const warnings: string[] = [];
  const sanitized = { ...day };
  const dayLabel = typeof day?.day === 'string' ? day.day : 'unknown';

  if (day?.estimatedCalories !== undefined) {
    const calories = toNumberLocal(day.estimatedCalories);
    if (calories !== null) {
      if (calories < 50) { sanitized.estimatedCalories = 50; warnings.push(`${dayLabel}: estimatedCalories too low → 50`); }
      else if (calories > 800) { sanitized.estimatedCalories = 800; warnings.push(`${dayLabel}: estimatedCalories too high → 800`); }
      else sanitized.estimatedCalories = calories;
    }
  }

  if (day?.estimatedTime !== undefined) {
    const time = toNumberLocal(day.estimatedTime);
    if (time !== null) {
      if (time < 10) { sanitized.estimatedTime = '10 minutes'; warnings.push(`${dayLabel}: estimatedTime too low → 10`); }
      else if (time > 120) { sanitized.estimatedTime = '120 minutes'; warnings.push(`${dayLabel}: estimatedTime too high → 120`); }
      else sanitized.estimatedTime = `${time} minutes`;
    }
  }

  if (Array.isArray(day?.exercises) && day.exercises.length > 15) {
    warnings.push(`${dayLabel}: ${day.exercises.length} exercises truncated to 12`);
    sanitized.exercises = day.exercises.slice(0, 12);
  }

  return { sanitized, warnings };
}

// ─── Phase 1: Planning call ──────────────────────────────────────────────────

async function planWorkout(
  surveyData: any,
  workoutPrefs: WorkoutPreferences,
  feedbackContext?: WorkoutFeedbackContext
): Promise<any> {
  console.log('[GPT-WORKOUT] 📋 Phase 1: Planning workout structure...');
  const planningPrompt = createWorkoutPlanningPrompt(surveyData, workoutPrefs, feedbackContext);

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You must respond with valid JSON only. No markdown.' },
          { role: 'user', content: planningPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000
      }),
      signal
    });
    if (!response.ok) throw new Error(`GPT error ${response.status}`);
    return response.json();
  }, 'Workout planning');

  if (!gptResult.success) throw new Error(`Workout planning failed: ${gptResult.error}`);

  const content = gptResult.data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content from workout planning call');

  const plan = JSON.parse(content);
  console.log(`[GPT-WORKOUT] ✅ Planning complete: ${plan.weeklyPlan?.length || 0} days outlined`);
  return plan;
}

// ─── Phase 2: Detail call for one chunk ─────────────────────────────────────

async function generateDayDetails(
  dayOutlines: any[],
  surveyData: any,
  workoutPrefs: WorkoutPreferences,
  chunkLabel: string
): Promise<any[]> {
  console.log(`[GPT-WORKOUT] 📋 Phase 2: Generating details for ${chunkLabel} (${dayOutlines.length} days)...`);
  const detailPrompt = createWorkoutDetailPrompt(dayOutlines, surveyData, workoutPrefs);

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You must respond with valid JSON only. No markdown.' },
          { role: 'user', content: detailPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 6000
      }),
      signal
    });
    if (!response.ok) throw new Error(`GPT error ${response.status}`);
    return response.json();
  }, `Workout detail ${chunkLabel}`);

  if (!gptResult.success) throw new Error(`Workout detail failed for ${chunkLabel}: ${gptResult.error}`);

  const content = gptResult.data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No content for ${chunkLabel}`);

  const result = JSON.parse(content);
  const days = result.days || [];
  console.log(`[GPT-WORKOUT] ✅ ${chunkLabel}: ${days.length} days detailed`);
  return days;
}

// ─── Main generation function (plan + parallel) ───────────────────────────────

async function generateWorkoutPlan(surveyData: any): Promise<WorkoutPlan> {
  const workoutPrefs: WorkoutPreferences = surveyData.workoutPreferencesJson || {};

  // Fetch feedback context for progressive overload and personalization
  const feedbackContext = await getWorkoutFeedbackContext(surveyData);
  if (feedbackContext) {
    console.log(`[GPT-WORKOUT] 📊 Feedback context: ${Object.keys(feedbackContext.weightProgressionByExercise).length} exercises with weight history`);
  }

  // Phase 1: Get high-level plan outline
  const planResult = await planWorkout(surveyData, workoutPrefs, feedbackContext);
  const weeklyOutline: any[] = planResult.weeklyPlan || [];

  if (weeklyOutline.length === 0) {
    throw new Error('Planning phase returned no days');
  }

  // Split into 3 chunks for parallel Phase 2 calls
  const allDayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const chunkDefs = [
    { label: 'Mon-Tue', days: ['monday', 'tuesday'] },
    { label: 'Wed-Thu', days: ['wednesday', 'thursday'] },
    { label: 'Fri-Sun', days: ['friday', 'saturday', 'sunday'] }
  ];

  const chunks = chunkDefs.map(def => ({
    label: def.label,
    outlines: weeklyOutline.filter(d => def.days.includes(d.day?.toLowerCase()))
  })).filter(c => c.outlines.length > 0);

  console.log(`[GPT-WORKOUT] 🚀 Phase 2: Running ${chunks.length} parallel detail calls...`);

  // Phase 2: Generate exercise details for each chunk in parallel
  const detailArrays = await Promise.all(
    chunks.map(c => generateDayDetails(c.outlines, surveyData, workoutPrefs, c.label))
  );

  // Merge detail results back, preserving order from plan outline
  const detailMap = new Map<string, any>();
  detailArrays.flat().forEach(d => { if (d?.day) detailMap.set(d.day.toLowerCase(), d); });

  const weeklyPlan = weeklyOutline.map(outline => {
    const detail = detailMap.get(outline.day?.toLowerCase());
    if (detail) {
      // Merge: plan outline fields + exercise detail fields
      return { ...outline, ...detail };
    }
    // Fallback: outline-only day (shouldn't happen)
    console.warn(`[GPT-WORKOUT] ⚠️ No detail for ${outline.day}, using outline only`);
    return { ...outline, exercises: outline.restDay ? [] : [] };
  });

  // Sanitize all days
  const sanitizedWeeklyPlan = weeklyPlan.map(day => {
    const { sanitized, warnings } = sanitizeDay(day);
    warnings.forEach(w => console.warn(`[WORKOUT-SANITIZE] ${w}`));
    return sanitized;
  });

  const sanitizedWorkoutPlan: WorkoutPlan = {
    weeklyPlan: sanitizedWeeklyPlan,
    overview: {
      splitType: planResult.splitType || 'Mixed',
      description: planResult.description || '',
      whyThisSplit: planResult.whyThisSplit || '',
      expectedResults: planResult.expectedResults || []
    },
    progressionTips: planResult.progressionTips || [],
    safetyReminders: planResult.safetyReminders || [],
    equipmentNeeded: planResult.equipmentNeeded || []
  };

  console.log(`[GPT-WORKOUT] ✅ Plan+parallel complete: ${sanitizedWeeklyPlan.length} days`);

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