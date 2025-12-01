import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
    const recipePrompt = `You are a professional chef and nutritionist. Generate a comprehensive, detailed recipe for "${dishName}".

DISH DETAILS:
- Name: ${dishName}
- Description: ${description || 'No description provided'}
- Meal Type: ${mealType}

REQUIREMENTS:
1. Create a complete recipe with detailed ingredients and step-by-step instructions
2. Include accurate nutritional information
3. Provide a comprehensive grocery list with specific quantities
4. Make it practical and achievable for home cooking
5. Focus on fresh, healthy ingredients

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "name": "${dishName}",
  "description": "Brief appetizing description of the dish",
  "prepTime": "15 min",
  "cookTime": "25 min",
  "totalTime": "40 min",
  "servings": 2,
  "difficulty": "Easy|Medium|Hard",
  "cuisine": "Type of cuisine",
  "tags": ["healthy", "protein-rich", "quick"],
  "groceryList": [
    {
      "ingredient": "Chicken breast",
      "amount": "1 lb",
      "category": "Meat",
      "note": "boneless, skinless"
    },
    {
      "ingredient": "Olive oil",
      "amount": "2 tbsp",
      "category": "Pantry",
      "note": "extra virgin"
    }
  ],
  "ingredients": [
    "1 lb chicken breast, boneless and skinless",
    "2 tbsp extra virgin olive oil",
    "1 tsp salt",
    "1/2 tsp black pepper"
  ],
  "instructions": [
    "Preheat oven to 375°F (190°C).",
    "Season chicken breast with salt and pepper on both sides.",
    "Heat olive oil in an oven-safe skillet over medium-high heat.",
    "Sear chicken breast for 3-4 minutes per side until golden brown.",
    "Transfer skillet to preheated oven and bake for 15-20 minutes until internal temperature reaches 165°F (74°C).",
    "Let rest for 5 minutes before slicing and serving."
  ],
  "nutrition": {
    "calories": 320,
    "protein": 45,
    "carbs": 2,
    "fat": 14,
    "fiber": 0,
    "sodium": 580
  },
  "tips": [
    "Use a meat thermometer to ensure chicken is cooked through",
    "Let chicken rest to retain juices"
  ],
  "storage": "Store leftovers in refrigerator for up to 3 days",
  "reheatInstructions": "Reheat in 350°F oven for 10-12 minutes or microwave for 1-2 minutes"
}

CRITICAL: Response must be pure JSON starting with { and ending with }. No markdown, no explanations, no extra text.`;

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