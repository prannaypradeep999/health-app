import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { pexelsClient } from '@/lib/external/pexels-client';
import { createFitnessProfilePrompt, createWorkoutPlanPrompt, type WorkoutPlan, type WorkoutDay } from '@/lib/ai/prompts';

export const runtime = 'nodejs';

// Generate personalized fitness profile based on survey data
async function generateFitnessProfile(surveyData: any): Promise<string> {
  const startTime = Date.now();
  console.log(`[FITNESS-PROFILE] 🏋️ Generating personalized fitness profile...`);

  try {
    const profilePrompt = createFitnessProfilePrompt(surveyData);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: profilePrompt }],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Fitness profile generation failed: ${response.status}`);
    }

    const data = await response.json();
    const profile = data.choices?.[0]?.message?.content || '';

    console.log(`[FITNESS-PROFILE] ✅ Generated in ${Date.now() - startTime}ms`);
    console.log(`[FITNESS-PROFILE] 🏋️ Profile:\n${profile}`);

    return profile;

  } catch (error) {
    console.error(`[FITNESS-PROFILE] ❌ Generation failed:`, error);
    return ''; // Return empty string if failed
  }
}

interface WorkoutDay {
  day: string;
  restDay: boolean;
  focus: string;
  estimatedTime: string;
  estimatedCalories: number;
  targetMuscles: string[];
  description: string;
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    restTime: string;
    description: string;
    instructions: string;
    formTips: string[];
    modifications: {
      beginner: string;
      intermediate: string;
      advanced: string;
    };
    muscleTargets: string[];
    imageUrl?: string;
    imageSource?: string;
    imageSearchQuery?: string;
    imageCached?: boolean;
  }>;
}

interface WorkoutPlan {
  weeklyPlan: WorkoutDay[];
  overview: {
    splitType: string;
    description: string;
    whyThisSplit: string;
    expectedResults: string[];
  };
  progressionTips: string[];
  safetyReminders: string[];
  equipmentNeeded: string[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[WORKOUT-GENERATION] 🚀 Starting workout generation at ${new Date().toISOString()}`);

  try {
    let requestData = {};
    try {
      requestData = await req.json();
    } catch (error) {
      console.log(`[WORKOUT-GENERATION] 📄 Empty request body, using defaults`);
    }
    const { backgroundGeneration } = requestData as {
      backgroundGeneration?: boolean;
    };
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
      // Check for guest session survey
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
    }

    // Removed testSurveyData development feature

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

    // Generate fitness profile and workout plan in parallel
    console.log('[WORKOUT-GENERATION] 🎯 Generating fitness profile and workout plan...');
    const generationStartTime = Date.now();

    const [fitnessProfile, workoutPlan] = await Promise.all([
      generateFitnessProfile(surveyData),
      generateWorkoutPlan(surveyData)
    ]);

    // Log the fitness profile for debugging
    if (fitnessProfile) {
      console.log(`[FITNESS-PROFILE] 🎯 Generated profile will enhance future workout recommendations`);
    }

    const generationTime = Date.now() - generationStartTime;
    console.log(`[WORKOUT-GENERATION] ✅ Profile and plan generation completed in ${generationTime}ms`);
    console.log(`[WORKOUT-GENERATION] 📋 Profile generated: ${fitnessProfile ? 'Yes' : 'No'}`);

    // Enhance workout plan with exercise images
    console.log('[WORKOUT-GENERATION] Enhancing workout plan with exercise images...');
    const imageStartTime = Date.now();
    const enhancedWorkoutPlan = await enhanceWorkoutPlanWithImages(workoutPlan, surveyData);
    const imageTime = Date.now() - imageStartTime;
    console.log(`[WORKOUT-GENERATION] Image enhancement completed in ${imageTime}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`[WORKOUT-GENERATION] 🏁 Total generation time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    // Save to database
    try {
      console.log(`[DATABASE] 💾 Saving workout plan to database for survey: ${surveyData.id}, userId: ${userId || 'null'}`);
      console.log(`[DATABASE] 🔍 Using identifiers - surveyId: ${surveyData.id}, userId: ${userId || 'null'}`);
      const weekOfDate = new Date();
      weekOfDate.setHours(0, 0, 0, 0);

      const createdWorkoutPlan = await prisma.workoutPlan.create({
        data: {
          surveyId: surveyData.id,
          userId: userId || null,
          weekOf: weekOfDate,
          planData: enhancedWorkoutPlan as any,
          status: 'active'
        }
      });
      console.log(`[DATABASE] ✅ Workout plan saved successfully with ID: ${createdWorkoutPlan.id}, surveyId: ${createdWorkoutPlan.surveyId}`);
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
      { error: 'Failed to generate workout plan', details: error.message },
      { status: 500 }
    );
  }
}

async function generateWorkoutPlan(surveyData: any): Promise<WorkoutPlan> {
  // Parse workout preferences if available
  const workoutPrefs = surveyData.workoutPreferencesJson || {};

  // Get current day info for proper day ordering
  const getCurrentDayInfo = () => {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayIndex = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

    const orderedDays = [
      ...dayNames.slice(todayIndex),    // Days from today to end of week
      ...dayNames.slice(0, todayIndex)  // Days from start of week to yesterday
    ];

    return {
      currentDay: dayNames[todayIndex],
      orderedDays,
      dayIndex: todayIndex
    };
  };

  const dayInfo = getCurrentDayInfo();
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const userPrompt = createWorkoutPlanPrompt(surveyData, workoutPrefs);

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
    console.error('[GPT-WORKOUT] ❌ API error:', response.status);
    throw new Error(`GPT API error: ${response.status}`);
  }

  const completion = await response.json();
  const workoutContent = completion.choices[0].message.content;

  try {
    const workoutPlan = JSON.parse(workoutContent) as WorkoutPlan;
    console.log(`[GPT-WORKOUT] ✅ Successfully generated ${workoutPlan.weeklyPlan.length} workout days`);
    return workoutPlan;
  } catch (parseError) {
    console.error('[GPT-WORKOUT] ❌ JSON parse error:', parseError);
    console.error('[GPT-WORKOUT] ❌ Raw content length:', workoutContent?.length);
    console.error('[GPT-WORKOUT] ❌ Raw content preview:', workoutContent?.substring(0, 200));
    console.error('[GPT-WORKOUT] ❌ Raw content ending:', workoutContent?.substring(workoutContent.length - 200));
    throw new Error('Failed to parse workout plan JSON');
  }
}

// Enhanced workout plan with exercise images
async function enhanceWorkoutPlanWithImages(workoutPlan: WorkoutPlan, surveyData: any): Promise<WorkoutPlan> {
  const enhanceStartTime = Date.now();
  console.log(`[WORKOUT-IMAGES] Starting image enhancement for ${workoutPlan.weeklyPlan?.length || 0} days...`);

  if (!workoutPlan.weeklyPlan || !Array.isArray(workoutPlan.weeklyPlan)) {
    console.log(`[WORKOUT-IMAGES] No days found in workout plan, returning original`);
    return workoutPlan;
  }

  // Get workout preferences for context
  const workoutPrefs = surveyData.workoutPreferencesJson || {};
  const equipmentContext = workoutPrefs.gymAccess || 'bodyweight';

  // Process each day's exercises in parallel for speed
  const enhancedDays = await Promise.all(
    workoutPlan.weeklyPlan.map(async (day: any, dayIndex: number) => {
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
              console.log(`[WORKOUT-IMAGES] No exercise name for exercise on ${day.day}`);
              return exercise;
            }

            // Determine muscle group from targetMuscles or day focus
            const primaryMuscleGroup = day.targetMuscles?.[0] ||
              exercise.muscleTargets?.[0] ||
              day.focus.toLowerCase().includes('chest') ? 'chest' :
              day.focus.toLowerCase().includes('back') ? 'back' :
              day.focus.toLowerCase().includes('legs') ? 'legs' :
              day.focus.toLowerCase().includes('shoulders') ? 'shoulders' :
              day.focus.toLowerCase().includes('arms') ? 'arms' :
              'full body';

            // Get image from Pexels with smart caching
            const imageResult = await pexelsClient.getWorkoutImage(exerciseName, {
              muscleGroup: primaryMuscleGroup,
              equipmentType: equipmentContext,
              searchTerms: exercise.description
            });

            console.log(`[WORKOUT-IMAGES] ${imageResult.cached ? 'cached' : 'fetched'} ${exerciseName} → ${imageResult.imageSource} (${imageResult.searchQuery})`);

            // Add image data to exercise
            return {
              ...exercise,
              imageUrl: imageResult.imageUrl,
              imageSource: imageResult.imageSource,
              imageSearchQuery: imageResult.searchQuery,
              imageCached: imageResult.cached
            };

          } catch (error) {
            console.error(`[WORKOUT-IMAGES] Error getting image for ${exercise.name}:`, error);
            return exercise; // Return original exercise if image fetch fails
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
  console.log(`[WORKOUT-IMAGES] All workout images enhanced in ${enhanceTime}ms (${(enhanceTime/1000).toFixed(2)}s)`);

  return {
    ...workoutPlan,
    weeklyPlan: enhancedDays
  };
}