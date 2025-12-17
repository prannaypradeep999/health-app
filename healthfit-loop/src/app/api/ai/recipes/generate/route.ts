import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createRecipeGenerationPrompt } from '@/lib/ai/prompts';

export async function POST(req: NextRequest) {
  try {
    const { dishName, description, mealType } = await req.json();

    if (!dishName) {
      return NextResponse.json({ error: 'Dish name is required' }, { status: 400 });
    }

    // Check if recipe already exists in cache
    const existingRecipe = await prisma.recipe.findFirst({
      where: {
        dishName: dishName.toLowerCase().trim()
      }
    });

    if (existingRecipe) {
      console.log(`[RECIPE] ✅ Found cached recipe for "${dishName}"`);
      return NextResponse.json({
        success: true,
        recipe: existingRecipe.recipeData,
        cached: true
      });
    }

    console.log(`[RECIPE] 🍳 Generating new recipe for "${dishName}"`);

    // Generate comprehensive recipe with GPT
    const recipePrompt = createRecipeGenerationPrompt({ dishName, description, mealType });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional chef and nutritionist. Respond only with valid JSON recipe data.'
          },
          {
            role: 'user',
            content: recipePrompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const recipeData = JSON.parse(data.choices[0].message.content);

    // Save recipe to cache
    try {
      await prisma.recipe.create({
        data: {
          dishName: dishName.toLowerCase().trim(),
          originalDishName: dishName,
          mealType: mealType,
          description: description || null,
          recipeData: recipeData
        }
      });
      console.log(`[RECIPE] 💾 Cached recipe for "${dishName}"`);
    } catch (cacheError) {
      console.error('[RECIPE] Failed to cache recipe:', cacheError);
    }

    return NextResponse.json({
      success: true,
      recipe: recipeData,
      cached: false
    });

  } catch (error) {
    console.error('Recipe generation failed:', error);
    return NextResponse.json({
      error: 'Recipe generation failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}