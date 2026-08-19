import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { pexelsClient } from '@/lib/external/pexels-client';
import { createWorkoutPlanningPrompt, createWorkoutDetailPrompt, type WorkoutPlan, type WorkoutDay, type WorkoutFeedbackContext, type WorkoutPreferences } from '@/lib/ai/prompts';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';
import { validateWorkoutPlan } from '@/lib/utils/workout-validator';
import { getStartOfWeek } from '@/lib/utils/date-utils';
import { getAuthUserId } from '@/lib/auth';
import { MODELS, tuning } from '@/lib/ai/models';
import { logUsage } from '@/lib/ai/usage';
import { WorkoutPlanSchema, pinnedWorkoutDetail, toStrictJsonSchema } from '@/lib/ai/schemas';
import { parseChoice } from '@/lib/ai/validate';

export const runtime = 'nodejs';
// 60s is the Hobby ceiling and is valid on every Vercel plan. Without this
// line the route silently inherits the platform default of 10-15s, well
// under what a model call needs. RetryPresets budgets the inner calls to fit.
export const maxDuration = 60;

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
    const userId = await getAuthUserId();
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
  feedbackContext?: WorkoutFeedbackContext,
  libraryExercises?: Array<{
    name: string;
    muscleGroup: string | null;
    equipmentType: string | null;
    defaultSets: number | null;
    defaultReps: string | null;
    difficulty: string | null;
    weightGuidance: string | null;
  }>
): Promise<any> {
  console.log('[GPT-WORKOUT] 📋 Phase 1: Planning workout structure...');
  const planningPrompt = createWorkoutPlanningPrompt(surveyData, workoutPrefs, feedbackContext, libraryExercises);

  // The old ceiling was 2000. WorkoutPlanSchema is six prose/array fields plus a
  // seven-day outline, and the prompt now carries up to 60 library exercises for
  // the model to choose from — the response grew, the ceiling never did. Under
  // strict mode a truncated response is a total loss, not a short one, so this
  // failed as a 500 with no plan rather than as a slightly thin week.
  const PLANNING_TOKENS = 4000;

  async function attempt(maxTokens: number, label: string) {
    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.PLANNING,
          messages: [
            { role: 'system', content: 'You must respond with valid JSON only. No markdown.' },
            { role: 'user', content: planningPrompt }
          ],
          response_format: toStrictJsonSchema('workout_plan', WorkoutPlanSchema),
          ...tuning(MODELS.PLANNING, { maxTokens, temperature: 0.3 })
        }),
        signal
      });
      if (!response.ok) throw new HttpError(response.status, `GPT error ${response.status}`);
      return response.json();
    }, label);

    if (!gptResult.success) return { ok: false as const, reason: 'transport', detail: gptResult.error };
    logUsage('workout-planning', maxTokens, gptResult.data);
    return parseChoice(WorkoutPlanSchema, gptResult.data.choices?.[0], 'workout-planning');
  }

  let parsed = await attempt(PLANNING_TOKENS, 'Workout planning');

  // Truncation is the one failure a second identical call cannot fix and a
  // second wider call usually can. Everything else (refusal, transport) has
  // already exhausted withGPTRetry's budget.
  if (!parsed.ok && parsed.reason === 'truncated') {
    console.warn(`[GPT-WORKOUT] 🔁 Planning truncated at ${PLANNING_TOKENS} tokens — one retry at ${PLANNING_TOKENS * 2}`);
    parsed = await attempt(PLANNING_TOKENS * 2, 'Workout planning (widened)');
  }

  if (!parsed.ok) throw new Error(`Workout planning ${parsed.reason}: ${parsed.detail}`);

  console.log(`[GPT-WORKOUT] ✅ Planning complete: ${parsed.data.weeklyPlan.length} days outlined`);
  return parsed.data;
}

// ─── Phase 2: Detail call for one chunk ─────────────────────────────────────

async function generateDayDetails(
  dayOutlines: any[],
  surveyData: any,
  workoutPrefs: WorkoutPreferences,
  chunkLabel: string,
  feedbackContext?: WorkoutFeedbackContext,
  libraryExercises?: Array<{
    name: string;
    muscleGroup: string | null;
    equipmentType: string | null;
    defaultSets: number | null;
    defaultReps: string | null;
    difficulty: string | null;
    weightGuidance: string | null;
  }>
): Promise<any[]> {
  console.log(`[GPT-WORKOUT] 📋 Phase 2: Generating details for ${chunkLabel} (${dayOutlines.length} days)...`);
  // The prompt lists each day of the chunk by name, so the count is exact.
  // Unrefined on purpose: the branch invariant is a superRefine, which has no
  // JSON Schema form. It is re-applied as the filter below.
  const DetailSchema = pinnedWorkoutDetail(dayOutlines.length);
  const detailPrompt = createWorkoutDetailPrompt(dayOutlines, surveyData, workoutPrefs, feedbackContext, libraryExercises);

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS.DETAIL,
        messages: [
          { role: 'system', content: 'You must respond with valid JSON only. No markdown.' },
          { role: 'user', content: detailPrompt }
        ],
        response_format: toStrictJsonSchema('workout_detail', DetailSchema),
        // Measured p95 4135 against the old 6000 ceiling — 69%, no useful margin.
        ...tuning(MODELS.DETAIL, { maxTokens: 9000, temperature: 0.4 })
      }),
      signal
    });
    if (!response.ok) throw new HttpError(response.status, `GPT error ${response.status}`);
    return response.json();
  }, `Workout detail ${chunkLabel}`);

  // A chunk that fails does not sink the week. Its days come back missing and
  // the top-up pass in generateWorkoutPlan gets another shot at them.
  if (!gptResult.success) {
    console.error(`[GPT-WORKOUT] ❌ ${chunkLabel} failed: ${gptResult.error} — deferring to top-up`);
    return [];
  }

  logUsage(`workout-detail:${chunkLabel}`, 9000, gptResult.data);

  const parsed = parseChoice(DetailSchema, gptResult.data.choices?.[0], `workout-detail:${chunkLabel}`);
  if (!parsed.ok) {
    console.error(`[GPT-WORKOUT] ❌ ${chunkLabel} ${parsed.reason}: ${parsed.detail} — deferring to top-up`);
    return [];
  }

  // The grammar guarantees the four branch keys exist; it cannot express "a
  // training day has exercises". Drop the days that came back hollow so the
  // top-up pass treats them as missing rather than shipping an empty workout.
  const days = parsed.data.days.filter(d => {
    if (!d.restDay && (!d.exercises || d.exercises.length === 0)) {
      console.warn(`[GPT-WORKOUT] ⚠️ ${chunkLabel}: training day "${d.day}" came back with no exercises, dropping`);
      return false;
    }
    if (d.restDay && !d.activeRecovery) {
      console.warn(`[GPT-WORKOUT] ⚠️ ${chunkLabel}: rest day "${d.day}" came back with no activeRecovery, dropping`);
      return false;
    }
    return true;
  });

  console.log(`[GPT-WORKOUT] ✅ ${chunkLabel}: ${days.length}/${dayOutlines.length} days detailed`);
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

  // Query exercise library filtered by user's equipment and fitness level
  const gymAccess = workoutPrefs.gymAccess || 'no_gym';
  const fitnessLevel = (surveyData as any).fitnessLevel || workoutPrefs.fitnessExperience || 'intermediate';

  const equipmentFilter: Record<string, string[]> = {
    no_gym: ['bodyweight'],
    calisthenics: ['bodyweight'],
    free_weights: ['bodyweight', 'dumbbells', 'barbell', 'kettlebell'],
    full_gym: [],
  };
  const allowedEquipment = equipmentFilter[gymAccess] || [];

  const libraryExercises = await prisma.exerciseLibrary.findMany({
    where: {
      ...(allowedEquipment.length > 0
        ? { equipmentType: { in: allowedEquipment } }
        : {}),
      ...(fitnessLevel === 'beginner'
        ? { difficulty: { in: ['beginner', 'intermediate'] } }
        : {}),
    },
    select: {
      name: true,
      muscleGroup: true,
      equipmentType: true,
      defaultSets: true,
      defaultReps: true,
      difficulty: true,
      weightGuidance: true,
    },
    take: 60,
    orderBy: { name: 'asc' },
  }).catch(() => []);

  console.log(`[GPT-WORKOUT] 📚 Exercise library: ${libraryExercises.length} exercises available for ${gymAccess}`);

  // Phase 1: Get high-level plan outline
  const planResult = await planWorkout(surveyData, workoutPrefs, feedbackContext, libraryExercises);
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
    chunks.map(c => generateDayDetails(c.outlines, surveyData, workoutPrefs, c.label, feedbackContext, libraryExercises))
  );

  // Merge detail results back, preserving order from plan outline
  const detailMap = new Map<string, any>();
  detailArrays.flat().forEach(d => { if (d?.day) detailMap.set(d.day.toLowerCase(), d); });

  // Top-up: one extra call for whatever the parallel chunks did not deliver.
  // A dropped or failed chunk otherwise costs the user a blank day, and a
  // second attempt over a smaller day set is both cheaper and likelier to
  // succeed than re-running the whole phase.
  const missing = weeklyOutline.filter(o => !detailMap.has(o.day?.toLowerCase()));
  if (missing.length > 0) {
    console.warn(`[GPT-WORKOUT] 🔁 Top-up: ${missing.length} day(s) missing detail (${missing.map(m => m.day).join(', ')})`);
    const topUp = await generateDayDetails(missing, surveyData, workoutPrefs, 'top-up', feedbackContext, libraryExercises);
    topUp.forEach(d => { if (d?.day) detailMap.set(d.day.toLowerCase(), d); });
    const stillMissing = weeklyOutline.filter(o => !detailMap.has(o.day?.toLowerCase()));
    if (stillMissing.length > 0) {
      console.error(`[GPT-WORKOUT] ❌ Top-up did not recover: ${stillMissing.map(m => m.day).join(', ')}`);
    }
  }

  const weeklyPlan = weeklyOutline.map(outline => {
    const detail = detailMap.get(outline.day?.toLowerCase());
    if (detail) {
      // Merge: plan outline fields + exercise detail fields
      return { ...outline, ...detail };
    }
    // Last resort after the top-up: present the day as active recovery rather
    // than as a training day with an empty exercise list. The outline still
    // carries focus, targetMuscles and a description, so the day is not blank.
    console.warn(`[GPT-WORKOUT] ⚠️ No detail for ${outline.day} after top-up, degrading to active recovery`);
    return {
      ...outline,
      restDay: true,
      warmup: null,
      exercises: null,
      cooldown: null,
      activeRecovery: {
        suggestedActivity: 'Light activity of your choice',
        duration: '20-30 minutes',
        description: `We could not build a full session for ${outline.day}. Take a walk, stretch, or repeat a session you enjoyed this week.`,
        alternatives: ['20-minute walk', 'Foam rolling', 'Light stretching'],
      },
    };
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

  /**
   * Hard ceiling on the whole image phase.
   *
   * This runs on the critical path — it is awaited before the Prisma write and
   * before the response — and it fans out over days × exercises with no cap: a
   * 6-day plan of 7 exercises is 42 lookups, each of which can spend up to
   * `RetryPresets.pexels.maxTotalMs` (25s). The 2026-08-18 run returned in
   * 4.3 minutes with a storm of Pexels timeouts on "chest exercise",
   * "resistance workout", "legs exercise". Decorative photography must not be
   * what makes a user wait minutes for their training plan.
   *
   * Exercises that miss the deadline simply keep whatever they had. That is
   * already a supported state — the per-exercise catch below returns the bare
   * exercise on failure, so `imageUrl` being absent is a path the UI has always
   * had to handle. Nothing about the response shape changes here.
   */
  const IMAGE_PHASE_BUDGET_MS = 20_000;
  const imageDeadline = Date.now() + IMAGE_PHASE_BUDGET_MS;
  let skippedForTime = 0;

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

            // Checked per exercise rather than racing the phase as a whole, so
            // the images that already resolved are kept instead of being thrown
            // away wholesale when the budget runs out.
            if (Date.now() > imageDeadline) {
              skippedForTime++;
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
  if (skippedForTime > 0) {
    console.warn(`[WORKOUT-IMAGES] ⏱️ Budget of ${IMAGE_PHASE_BUDGET_MS}ms spent — ${skippedForTime} exercise(s) shipped without an image rather than delaying the plan`);
  }
  console.log(`[WORKOUT-IMAGES] Image phase finished in ${enhanceTime}ms`);

  return {
    ...workoutPlan,
    weeklyPlan: enhancedDays
  };
}