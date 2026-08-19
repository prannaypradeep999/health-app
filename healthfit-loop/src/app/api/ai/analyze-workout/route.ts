import { NextRequest, NextResponse } from 'next/server';
import { createWorkoutAnalysisPrompt } from '@/lib/ai/prompts';
import { MODELS } from '@/lib/ai/models';
import { WorkoutAnalysisSchema, toStrictJsonSchema } from '@/lib/ai/schemas';
import { parseChoice } from '@/lib/ai/validate';
import { logUsage } from '@/lib/ai/usage';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';

const FALLBACK = {
  calories: 200,
  tips: 'Great workout! Keep up the consistent effort to reach your fitness goals.',
};

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { activity, details } = await request.json();

    if (!activity || !details?.trim()) {
      return NextResponse.json(
        { error: 'Activity and details are required' },
        { status: 400 }
      );
    }

    // Use fast model for quick analysis
    const prompt = createWorkoutAnalysisPrompt({ activity, details });

    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.FAST, // Fast model for quick analysis
          messages: [
            { role: 'system', content: 'You are a fitness expert.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: toStrictJsonSchema('workout_analysis', WorkoutAnalysisSchema),
        }),
        signal,
      });

      if (!response.ok) {
        throw new HttpError(response.status, `OpenAI API error: ${response.status}`);
      }
      return response.json();
    }, 'Workout analysis');

    if (!gptResult.success) {
      console.error('[WORKOUT-ANALYSIS] ❌ Generation failed, using fallback:', gptResult.error);
      return NextResponse.json(FALLBACK);
    }

    logUsage('workout-analysis', 500, gptResult.data);

    const parsed = parseChoice(WorkoutAnalysisSchema, gptResult.data.choices?.[0], 'workout-analysis');
    if (!parsed.ok) {
      console.error(`[WORKOUT-ANALYSIS] ❌ ${parsed.reason}, using fallback`);
      return NextResponse.json(FALLBACK);
    }

    // Ensure reasonable calorie range (50-800 calories)
    const analysis = {
      ...parsed.data,
      calories: Math.max(50, Math.min(800, parsed.data.calories)),
    };

    console.log(`[WORKOUT-ANALYSIS] ✅ Analyzed ${activity}: ${analysis.calories} calories`);

    return NextResponse.json(analysis);

  } catch (error) {
    console.error('[WORKOUT-ANALYSIS] ❌ Error:', error);
    return NextResponse.json(FALLBACK);
  }
}