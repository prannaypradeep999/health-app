import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createRecipeGenerationPrompt } from '@/lib/ai/prompts';
import { validateIngredientSums } from '@/lib/utils/ingredient-validator';
import { MODELS } from '@/lib/ai/models';
import { RecipeSchema, toStrictJsonSchema } from '@/lib/ai/schemas';
import { parseChoice } from '@/lib/ai/validate';
import { logUsage } from '@/lib/ai/usage';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';

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

    // Two independent questions, asked in order. The old guard conflated them:
    // it only skipped the cache when nutrition.calories existed AND was more
    // than 15% off, so a row missing `nutrition` entirely fell through to the
    // else branch and was served unconditionally, forever. Shape first, then
    // freshness. Validating on read also heals already-poisoned rows the next
    // time anyone asks for that dish, with no migration.
    if (existingRecipe) {
      const cachedShape = RecipeSchema.safeParse(existingRecipe.recipeData);

      if (!cachedShape.success) {
        console.warn(
          `[RECIPE-CACHE] Poisoned row for "${dishName}" — ${cachedShape.error.issues.length} schema issue(s), ` +
          `first: ${cachedShape.error.issues[0]?.path.join('.')} ${cachedShape.error.issues[0]?.message}. Regenerating.`
        );
      } else {
        const targetCalories = nutritionTargets?.calories;
        const cachedCalories = cachedShape.data.nutrition.calories;
        const hasTarget = typeof targetCalories === 'number' && targetCalories > 0;
        const deviationPercent = hasTarget
          ? Math.abs(cachedCalories - targetCalories) / targetCalories * 100
          : 0;

        if (hasTarget && deviationPercent > 15) {
          console.log(`[RECIPE-CACHE] Skipping cache for "${dishName}" — cached: ${cachedCalories} cal, target: ${targetCalories} cal (${Math.round(deviationPercent)}% off)`);
        } else {
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
            recipe: cachedShape.data,
            cached: true
          });
        }
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

    const RECIPE_MAX_TOKENS = 4000;

    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODELS.FAST,
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
          response_format: toStrictJsonSchema('recipe', RecipeSchema),
          max_tokens: RECIPE_MAX_TOKENS,
          temperature: 0.7
        }),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new HttpError(response.status, `GPT API error ${response.status}: ${errorText.substring(0, 200)}`);
      }

      return response.json();
    }, `Recipe generation: ${dishName}`);

    if (!gptResult.success) {
      throw new Error(`Recipe generation failed: ${gptResult.error}`);
    }

    logUsage('recipe-generation', RECIPE_MAX_TOKENS, gptResult.data);

    // Nothing unvalidated reaches Prisma. A malformed recipe that gets cached
    // is served back forever, so a failure here returns an error rather than
    // writing a row we would then have to heal.
    const parsed = parseChoice(RecipeSchema, gptResult.data.choices?.[0], 'recipe-generation');
    if (!parsed.ok) {
      console.error(`[RECIPE] ❌ "${dishName}" ${parsed.reason}: ${parsed.detail} — not caching`);
      return NextResponse.json({
        error: 'Recipe generation returned an unusable response',
        details: `${parsed.reason}: ${parsed.detail}`
      }, { status: 502 });
    }

    const recipeData = parsed.data;

    // Value-level checks strict mode cannot express: the per-ingredient numbers
    // have to add up to the totals. Warn-only — the recipe is still usable.
    const validation = validateIngredientSums(
      recipeData.name,
      {
        estimatedCalories: recipeData.nutrition.calories,
        protein: recipeData.nutrition.protein,
        carbs: recipeData.nutrition.carbs,
        fat: recipeData.nutrition.fat,
        ingredientsWithNutrition: recipeData.ingredientsWithNutrition
      }
    );

    validation.errors.forEach((e) => console.error(`[RECIPE-INGREDIENT-VALIDATOR] ❌ ${e}`));
    validation.warnings.forEach((w) => console.warn(`[RECIPE-INGREDIENT-VALIDATOR] ⚠️ ${w}`));
    if (validation.valid && validation.details) {
      console.log(`[RECIPE-INGREDIENT-VALIDATOR] ✅ ${recipeData.name}: ${validation.details.ingredientCount} ingredients, sums match`);
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