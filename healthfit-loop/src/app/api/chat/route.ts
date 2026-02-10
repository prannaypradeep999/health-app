import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

const openai = new OpenAI({
  apiKey: process.env.GPT_KEY,
});

export const runtime = 'nodejs';

// Tool definitions for OpenAI function calling
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_meal_plan',
      description: 'Get the user\'s current meal plan with all meals, nutrition info, and restaurant recommendations',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_workout_plan',
      description: 'Get the user\'s current workout plan with exercises, schedules, and recommendations',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_eaten_meals',
      description: 'Get the user\'s meal consumption log to see what they\'ve eaten recently',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_nutrition_targets',
      description: 'Get the user\'s daily nutrition targets (calories, protein, carbs, fat)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_survey_details',
      description: 'Get the user\'s complete survey response with all preferences, goals, and personal details',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

async function getUserContext() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_id')?.value;
  const guestSession = cookieStore.get('guest_session')?.value;
  const surveyId = cookieStore.get('survey_id')?.value;

  let surveyData = null;
  let currentUserId = null;

  if (userId && userId !== 'undefined' && userId !== 'null') {
    // Logged in user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { activeSurvey: true }
    });
    if (user?.activeSurvey) {
      surveyData = user.activeSurvey;
      currentUserId = userId;
    }
  } else if (guestSession && surveyId) {
    // Guest user with session
    surveyData = await prisma.surveyResponse.findFirst({
      where: {
        OR: [
          { id: surveyId },
          { sessionId: guestSession }
        ]
      }
    });
  }

  if (!surveyData) {
    throw new Error('No user session found');
  }

  return { surveyData, userId: currentUserId, guestSession };
}

async function executeToolCall(functionName: string, args: any, userContext: any) {
  const { surveyData, userId, guestSession } = userContext;

  switch (functionName) {
    case 'get_current_meal_plan':
      try {
        const response = await fetch('http://localhost:3000/api/ai/meals/current', {
          headers: {
            'Cookie': `auth_session=${userId}; user_id=${userId}; guest_session=${guestSession}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            mealPlan: data.mealPlan,
            status: data.status,
            daysCount: data.daysCount,
            restaurantMealsCount: data.restaurantMealsCount
          };
        }
        return { success: false, error: 'Could not fetch meal plan' };
      } catch (error) {
        return { success: false, error: 'Error fetching meal plan' };
      }

    case 'get_current_workout_plan':
      try {
        const response = await fetch('http://localhost:3000/api/ai/workouts/current', {
          headers: {
            'Cookie': `auth_session=${userId}; user_id=${userId}; guest_session=${guestSession}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            workoutPlan: data.workoutPlan,
            currentWeek: data.currentWeek,
            isCurrentWeek: data.isCurrentWeek
          };
        }
        return { success: false, error: 'Could not fetch workout plan' };
      } catch (error) {
        return { success: false, error: 'Error fetching workout plan' };
      }

    case 'get_eaten_meals':
      try {
        const mealConsumptions = await prisma.mealConsumption.findMany({
          where: {
            OR: [
              { userId: userId },
              { surveyId: surveyData.id }
            ]
          },
          orderBy: { consumedAt: 'desc' },
          take: 50
        });
        return {
          success: true,
          consumptions: mealConsumptions.map(c => ({
            day: c.day,
            mealType: c.mealType,
            dishName: c.dishName,
            restaurant: c.restaurant,
            consumedAt: c.consumedAt,
            calories: c.calories,
            protein: c.protein,
            carbs: c.carbs,
            fat: c.fat
          }))
        };
      } catch (error) {
        return { success: false, error: 'Error fetching consumption log' };
      }

    case 'get_nutrition_targets':
      try {
        const response = await fetch('http://localhost:3000/api/user/nutrition-targets', {
          headers: {
            'Cookie': `auth_session=${userId}; user_id=${userId}; guest_session=${guestSession}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            targets: data.nutritionTargets
          };
        }
        return { success: false, error: 'Could not fetch nutrition targets' };
      } catch (error) {
        return { success: false, error: 'Error fetching nutrition targets' };
      }

    case 'get_survey_details':
      return {
        success: true,
        survey: {
          name: `${surveyData.firstName} ${surveyData.lastName}`,
          age: surveyData.age,
          sex: surveyData.sex,
          height: surveyData.height,
          weight: surveyData.weight,
          goal: surveyData.goal,
          activityLevel: surveyData.activityLevel,
          dietPrefs: surveyData.dietPrefs,
          preferredCuisines: surveyData.preferredCuisines,
          foodAllergies: surveyData.foodAllergies,
          strictExclusions: surveyData.strictExclusions,
          location: `${surveyData.city}, ${surveyData.state}`,
          monthlyFoodBudget: surveyData.monthlyFoodBudget,
          monthlyFitnessBudget: surveyData.monthlyFitnessBudget
        }
      };

    default:
      return { success: false, error: 'Unknown function' };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
    }

    // Get user context
    const userContext = await getUserContext();
    const { surveyData } = userContext;

    // Create compact user summary for system prompt
    const userSummary = `User: ${surveyData.firstName}, age ${surveyData.age}, ${surveyData.sex}, goal: ${surveyData.goal}, activity: ${surveyData.activityLevel}. Diet preferences: ${surveyData.dietPrefs?.join(', ') || 'none'}. Location: ${surveyData.city}, ${surveyData.state}.`;

    const systemPrompt = `You are a helpful AI health and fitness assistant. You have access to tools to fetch the user's current meal plans, workout plans, nutrition data, and consumption logs.

${userSummary}

Guidelines:
- Be conversational, helpful, and encouraging
- Provide specific, actionable advice based on their data
- If asked about meals/nutrition, use get_current_meal_plan and/or get_nutrition_targets
- If asked about workouts/exercise, use get_current_workout_plan
- If asked about what they've eaten, use get_eaten_meals
- For general health questions, you can answer directly using your knowledge
- Keep responses concise but informative
- Always be supportive of their health journey`;

    const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    let toolCallRounds = 0;
    const maxToolRounds = 3;

    while (toolCallRounds < maxToolRounds) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: conversationMessages,
        tools: tools,
        tool_choice: 'auto',
        stream: false
      });

      const response = completion.choices[0]?.message;
      if (!response) break;

      conversationMessages.push(response);

      if (!response.tool_calls || response.tool_calls.length === 0) {
        // No tool calls, return final response as stream
        let streamClosed = false;
        const stream = new ReadableStream({
          start(controller) {
            const content = response.content || '';
            const encoder = new TextEncoder();

            // Stream the content progressively
            let index = 0;
            const streamChunk = () => {
              if (streamClosed || index >= content.length) {
                if (!streamClosed) {
                  try {
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                  } catch (e) {
                    // Controller already closed, ignore
                  }
                  streamClosed = true;
                }
                return;
              }

              try {
                const chunk = content.slice(index, index + 5);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
                index += 5;
                setTimeout(streamChunk, 30);
              } catch (e) {
                // Controller already closed, stop streaming
                streamClosed = true;
                return;
              }
            };

            streamChunk();
          },
          cancel() {
            // Client disconnected or stream was closed
            streamClosed = true;
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        });
      }

      // Execute tool calls
      for (const toolCall of response.tool_calls) {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || '{}');

          const result = await executeToolCall(functionName, args, userContext);

          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id
          });
        }
      }

      toolCallRounds++;
    }

    // If we hit max rounds, return a fallback response
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const content = "I'm having trouble accessing your data right now. Please try asking your question again.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}