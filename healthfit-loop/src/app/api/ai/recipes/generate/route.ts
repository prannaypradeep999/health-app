import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createRecipeGenerationPrompt } from '@/lib/ai/prompts';
import { validateIngredientSums } from '@/lib/utils/ingredient-validator';

export async function POST(req: NextRequest) {
  try {
    const {
      dishName,
      description,
      mealType,
      // NEW parameters
      nutritionTargets,
      existingGroceryItems,
      dietaryRestrictions
    } = await req.json();

    if (!dishName) {
      return NextResponse.json({ error: 'Dish name is required' }, { status: 400 });
    }

    // Check cache - but only use if nutrition targets match OR no specific targets requested
    const existingRecipe = await prisma.recipe.findFirst({
      where: {
        dishName: dishName.toLowerCase().trim()
      }
    });

    if (existingRecipe) {
      const targetCalories = nutritionTargets?.calories;
      const cachedCalories = (existingRecipe.recipeData as any)?.nutrition?.calories;

      const hasTarget = typeof targetCalories === 'number';
      const hasCachedCalories = typeof cachedCalories === 'number';

      if (hasTarget && hasCachedCalories && targetCalories > 0) {
        const deviationPercent = Math.abs(cachedCalories - targetCalories) / targetCalories * 100;

        if (deviationPercent > 15) {
          console.log(`[RECIPE-CACHE] Skipping cache for "${dishName}" — cached: ${cachedCalories} cal, target: ${targetCalories} cal (${Math.round(deviationPercent)}% off)`);
        } else {
          // Update hit count
          await prisma.recipe.update({
            where: { id: existingRecipe.id },
            data: {
              hitCount: { increment: 1 },
              lastUsed: new Date()
            }
          });
          console.log(`[RECIPE] ✅ Using cached recipe for "${dishName}" (hits: ${existingRecipe.hitCount + 1})`);
          return NextResponse.json({
            success: true,
            recipe: existingRecipe.recipeData,
            cached: true
          });
        }
      } else {
        // No target to compare against or cached calories missing - return cache
        await prisma.recipe.update({
          where: { id: existingRecipe.id },
          data: {
            hitCount: { increment: 1 },
            lastUsed: new Date()
          }
        });
        console.log(`[RECIPE] ✅ Using cached recipe for "${dishName}" (hits: ${existingRecipe.hitCount + 1})`);
        return NextResponse.json({
          success: true,
          recipe: existingRecipe.recipeData,
          cached: true
        });
      }
    }

    console.log(`[RECIPE] 🍳 Generating new recipe for "${dishName}" with targets:`, nutritionTargets);

    // Generate comprehensive recipe with GPT
    const recipePrompt = createRecipeGenerationPrompt({
      dishName,
      description,
      mealType,
      nutritionTargets,
      existingGroceryItems,
      dietaryRestrictions
    });

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

    if (recipeData?.ingredientsWithNutrition) {
      const validation = validateIngredientSums(
        recipeData.name || 'Recipe',
        {
          estimatedCalories: recipeData.nutrition?.calories,
          protein: recipeData.nutrition?.protein,
          carbs: recipeData.nutrition?.carbs,
          fat: recipeData.nutrition?.fat,
          ingredientsWithNutrition: recipeData.ingredientsWithNutrition
        }
      );

      validation.errors.forEach((e) => console.error(`[RECIPE-INGREDIENT-VALIDATOR] ❌ ${e}`));
      validation.warnings.forEach((w) => console.warn(`[RECIPE-INGREDIENT-VALIDATOR] ⚠️ ${w}`));
      if (validation.valid && validation.details) {
        console.log(`[RECIPE-INGREDIENT-VALIDATOR] ✅ ${recipeData.name}: ${validation.details.ingredientCount} ingredients, sums match`);
      }
    }

    // Always save recipe to cache using upsert
    try {
      await prisma.recipe.upsert({
        where: { dishName: dishName.toLowerCase().trim() },
        update: {
          recipeData: recipeData,
          hitCount: { increment: 1 },
          lastUsed: new Date()
        },
        create: {
          dishName: dishName.toLowerCase().trim(),
          originalDishName: dishName,
          mealType: mealType,
          description: description || null,
          recipeData: recipeData
        }
      });
      console.log(`[RECIPE] 💾 Cached new recipe for "${dishName}"`);
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