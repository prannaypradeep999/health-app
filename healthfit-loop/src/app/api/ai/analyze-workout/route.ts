import { NextRequest, NextResponse } from 'next/server';

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
    const prompt = `Analyze this workout quickly and return JSON with calories and tips:

Activity: ${activity}
Details: ${details}

Provide:
1. Realistic calorie estimate based on activity type, intensity keywords, and duration
2. Short encouraging tip/advice related to this specific workout

Look for duration indicators (45 min, 1 hour, etc.)
Look for intensity words (high, intense, easy, light, etc.)

Base calorie rates per minute:
- Run: 12 cal/min
- Bike: 9 cal/min
- Swim: 10 cal/min
- Class (fitness): 8 cal/min
- Yoga: 3 cal/min
- Other: 6 cal/min

Respond with ONLY this JSON format:
{"calories": 280, "tips": "Great high-intensity session! That heart rate boost will improve your cardiovascular fitness."}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Fast model for quick analysis
        messages: [
          { role: 'system', content: 'You are a fitness expert. Respond with ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('No content returned from OpenAI');
    }

    // Parse the JSON response
    let analysis;
    try {
      // Clean the content in case it has markdown formatting
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse LLM response:', content);
      throw new Error('Invalid JSON response from LLM');
    }

    // Validate the response structure
    if (typeof analysis.calories !== 'number' || typeof analysis.tips !== 'string') {
      throw new Error('Invalid response structure');
    }

    // Ensure reasonable calorie range (50-800 calories)
    analysis.calories = Math.max(50, Math.min(800, analysis.calories));

    console.log(`[WORKOUT-ANALYSIS] ✅ Analyzed ${activity}: ${analysis.calories} calories`);

    return NextResponse.json(analysis);

  } catch (error) {
    console.error('[WORKOUT-ANALYSIS] ❌ Error:', error);

    // Fallback response
    return NextResponse.json({
      calories: 200,
      tips: 'Great workout! Keep up the consistent effort to reach your fitness goals.'
    });
  }
}