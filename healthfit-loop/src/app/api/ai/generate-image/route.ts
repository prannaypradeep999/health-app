import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.GPT_KEY;

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    console.log('[DEBUG-Image] Generating image for:', prompt);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        style: 'natural'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[DEBUG-Image] OpenAI error:', errorData);
      return NextResponse.json({ 
        error: 'Failed to generate image',
        details: errorData 
      }, { status: response.status });
    }

    const data = await response.json();
    const imageUrl = data.data[0]?.url;

    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL returned' }, { status: 500 });
    }

    console.log('[DEBUG-Image] Generated image successfully');

    return NextResponse.json({ 
      success: true,
      imageUrl: imageUrl 
    });

  } catch (error) {
    console.error('[DEBUG-Image] Error generating image:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
