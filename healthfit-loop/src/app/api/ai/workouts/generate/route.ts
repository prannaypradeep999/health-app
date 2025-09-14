import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { buildWorkoutPlannerPrompt, type WorkoutUserContext } from '@/lib/ai/prompts-workout';

const OPENAI_API_KEY = process.env.GPT_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('GPT_KEY environment variable is required');
}

interface WorkoutDay {
  day: string;
  restDay: boolean;
  focus: string;
  estimatedTime: string;
  targetMuscles: string[];
  warmup: Array<{
    exercise: string;
    duration: string;
    purpose: string;
  }>;
  mainWorkout: Array<{
    exercise: string;
    sets?: number;
    reps?: string;
    duration?: string;
    restBetweenSets?: string;
    instructions: string;
    formCues: string[];
    modifications: {
      beginner: string;
      intermediate: string;
      advanced: string;
    };
    safetyNotes: string;
  }>;
  cooldown: Array<{
    exercise: string;
    duration: string;
    instructions: string;
  }>;
}

interface WorkoutPlan {
  weeklyPlan: WorkoutDay[];
  weeklyNotes: string;
  progressionTips: string[];
  safetyReminders: string[];
  equipmentNeeded: string[];
  estimatedCaloriesBurn: number;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function POST(req: NextRequest) {
  try {
    console.log('[DEBUG-Workout] Starting workout plan generation');
    
    const { forceRegenerate } = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    
    console.log('[DEBUG-Workout] Cookie values:', { userId, sessionId, surveyId });

    let surveyData = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      
      if (user) {
        surveyData = user?.activeSurvey;
        console.log('[DEBUG-Workout] User lookup:', { userFound: !!user, hasSurvey: !!user?.activeSurvey });
      } else {
        console.log('[DEBUG-Workout] Stale userId cookie found');
        const response = NextResponse.json({ 
          error: 'Authentication expired. Please refresh the page and try again.' 
        }, { status: 401 });
        response.cookies.delete('user_id');
        return response;
      }
    }
    
    // If no survey found via user, try direct surveyId lookup
    if (!surveyData && surveyId) {
      console.log('[DEBUG-Workout] Falling back to direct survey lookup');
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    }

    if (!surveyData) {
      console.log('[DEBUG-Workout] No survey data found');
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[DEBUG-Workout] User: ${surveyData.firstName}, Goal: ${surveyData.goal}, Activity: ${surveyData.activityLevel}`);

    // Calculate workout parameters based on user profile
    const activityMap = {
      'SEDENTARY': { fitnessLevel: 'beginner' as const, days: 3, duration: 20 },
      'LIGHTLY_ACTIVE': { fitnessLevel: 'beginner' as const, days: 4, duration: 25 },
      'MODERATELY_ACTIVE': { fitnessLevel: 'intermediate' as const, days: 5, duration: 35 },
      'VERY_ACTIVE': { fitnessLevel: 'advanced' as const, days: 6, duration: 45 },
      'ATHLETE': { fitnessLevel: 'advanced' as const, days: 6, duration: 60 }
    };

    const userActivity = activityMap[surveyData.activityLevel as keyof typeof activityMap] || activityMap.MODERATELY_ACTIVE;
    
    const startOfWeek = getStartOfWeek(new Date());
    const userContext: WorkoutUserContext = {
      surveyData,
      weekOf: startOfWeek.toISOString().split('T')[0],
      fitnessLevel: userActivity.fitnessLevel,
      availableDays: userActivity.days,
      preferredDuration: userActivity.duration
    };

    console.log(`[DEBUG-Workout] Context: ${userActivity.fitnessLevel} level, ${userActivity.days} days, ${userActivity.duration}min sessions`);

    // Generate workout plan with LLM
    const workoutPlan = await generateWorkoutPlanWithLLM(userContext);

    // Store in database (simplified - you may want a separate WorkoutPlan model)
    const newPlan = {
      id: `workout-${surveyData.id}-${Date.now()}`,
      userId: userId || null,
      surveyId: surveyData.id,
      weekOf: startOfWeek,
      plan: workoutPlan,
      createdAt: new Date()
    };

    console.log(`[DEBUG-Workout] Successfully generated ${workoutPlan.weeklyPlan.length}-day workout plan`);
    
    return NextResponse.json({
      success: true,
      workoutPlan: newPlan,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[DEBUG-Workout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate workout plan' },
      { status: 500 }
    );
  }
}

async function generateWorkoutPlanWithLLM(userContext: WorkoutUserContext): Promise<WorkoutPlan> {
  const prompt = buildWorkoutPlannerPrompt(userContext);
  
  console.log('[DEBUG-Workout-LLM] Starting GPT-4o-mini for workout generation');
  
  const messages = [
    {
      role: 'system',
      content: prompt
    },
    {
      role: 'user', 
      content: `Generate my complete 7-day workout plan for ${userContext.surveyData.goal} goal at ${userContext.fitnessLevel} fitness level. 

CRITICAL: Return ONLY pure JSON starting with { and ending with } - no explanations, no markdown blocks, no extra text whatsoever.`
    }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DEBUG-Workout-LLM] OpenAI error:', response.status);
    console.error('[DEBUG-Workout-LLM] OpenAI error details:', errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const completion = await response.json();
  const workoutContent = completion.choices[0].message.content;

  console.log('[DEBUG-Workout-LLM] Raw response length:', workoutContent.length);

  try {
    const workoutPlan = JSON.parse(workoutContent) as WorkoutPlan;
    
    // Validate the workout plan structure
    if (!workoutPlan.weeklyPlan || !Array.isArray(workoutPlan.weeklyPlan)) {
      throw new Error('Invalid workout plan structure: missing weeklyPlan array');
    }

    if (workoutPlan.weeklyPlan.length !== 7) {
      throw new Error(`Invalid workout plan: expected 7 days, got ${workoutPlan.weeklyPlan.length}`);
    }

    console.log(`[DEBUG-Workout-LLM] Successfully parsed workout plan with ${workoutPlan.weeklyPlan.length} days`);
    console.log(`[DEBUG-Workout-LLM] Active days: ${workoutPlan.weeklyPlan.filter(d => !d.restDay).length}, Rest days: ${workoutPlan.weeklyPlan.filter(d => d.restDay).length}`);

    return workoutPlan;
    
  } catch (parseError) {
    console.error('[DEBUG-Workout-LLM] JSON parsing failed:', parseError);
    console.error('[DEBUG-Workout-LLM] Raw content:', workoutContent.substring(0, 500));
    throw new Error('Failed to parse workout plan JSON response');
  }
}
