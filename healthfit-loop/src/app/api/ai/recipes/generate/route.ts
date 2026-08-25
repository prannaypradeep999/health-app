import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createRecipeGenerationPrompt, RECIPE_SYSTEM_PREAMBLE } from '@/lib/ai/prompts';
import { validateIngredientSums } from '@/lib/utils/ingredient-validator';
import { MODELS, tuning } from '@/lib/ai/models';
import { RecipeSchema, toStrictJsonSchema } from '@/lib/ai/schemas';
import { parseChoice } from '@/lib/ai/validate';
import { logUsage } from '@/lib/ai/usage';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';
import { resolveSurveyResponse } from '@/lib/survey/resolve';
import { recipeCacheKey, restrictionsFromSurvey } from '@/lib/survey/recipe-key';

// 60s is the Hobby ceiling and is valid on every Vercel plan. Without this
// line the route silently inherits the platform default of 10-15s, well
// under what a model call needs. RetryPresets budgets the inner calls to fit.
export const maxDuration = 60;

/**
 * The client sends `nutritionTargets` straight through, and it is not always
 * complete. Measured 2026-08-19: a shakshuka request arrived as
 * `{ calories: 0, protein: 85, carbs: 105, fat: 42 }`.
 *
 * Zero calories is not a soft problem here. The prompt renders those numbers
 * as "EXACT NUTRITION REQUIREMENTS (NON-NEGOTIABLE)" and separately demands
 * "Sum of ingredient calories = nutrition.calories", so the model was ordered
 * to build a 0-calorie dish containing 85g of protein — 340 calories of
 * protein alone. The constraint is arithmetically unsatisfiable, and the model
 * did not give up on it: it spent the ENTIRE output budget reasoning and
 * emitted nothing.
 *
 *   [USAGE] recipe-generation out=4000/4000 (100%) [visible=0 reasoning=4000]
 *           in=8196 finish=length  ⚠️ TRUNCATED
 *
 * visible=0 is the tell. This was not a recipe too long to fit; it was a
 * recipe that never started. Truncation then correctly refuses to cache, and
 * the route 502s.
 *
 * So repair the targets before they reach the prompt: calories are recomputed
 * from the macros (4/4/9) whenever they are missing or non-positive, which for
 * the case above yields 1138 — the number the caller should have sent. If not
 * even the macros are usable, return undefined so the prompt omits the
 * nutrition section entirely rather than stating an impossible one.
 */
function sanitizeNutritionTargets(raw: any):
  { calories: number; protein: number; carbs: number; fat: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const protein = num(raw.protein);
  const carbs = num(raw.carbs);
  const fat = num(raw.fat);
  let calories = num(raw.calories);

  if (calories === 0) {
    const derived = Math.round(protein * 4 + carbs * 4 + fat * 9);
    if (derived <= 0) {
      console.warn('[RECIPE] Nutrition targets unusable (no positive calories or macros) — generating without targets');
      return undefined;
    }
    console.warn(`[RECIPE] Nutrition targets arrived with calories=${raw.calories}; derived ${derived} cal from ${protein}p/${carbs}c/${fat}f`);
    calories = derived;
  }

  return { calories, protein, carbs, fat };
}

export async function POST(req: NextRequest) {
  try {
    const {
      dishName,
      description,
      mealType,
      // NEW parameters
      nutritionTargets: rawNutritionTargets,
      existingGroceryItems
    } = await req.json();

    const nutritionTargets = sanitizeNutritionTargets(rawNutritionTargets);

    if (!dishName) {
      return NextResponse.json({ error: 'Dish name is required' }, { status: 400 });
    }

    // E2. The client used to send `dietaryRestrictions: []` with a TODO next to
    // it, because MealPlanPage has no survey data and cannot get any. So the
    // prompt's dietary section was empty for every recipe ever generated. The
    // survey is on the server; read it here.
    const survey = await resolveSurveyResponse();
    const dietaryRestrictions = restrictionsFromSurvey(survey);
    const cacheKey = recipeCacheKey(dishName, dietaryRestrictions);

    if (dietaryRestrictions.length > 0) {
      console.log(`[RECIPE] Restrictions for "${dishName}": ${dietaryRestrictions.join(', ')} (key ${cacheKey})`);
    }

    // Check cache - but only use if nutrition targets match OR no specific targets requested
    const existingRecipe = await prisma.recipe.findFirst({
      where: {
        dishName: cacheKey
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

    // Reasoning tokens are billed inside completion_tokens, so they draw from
    // this same ceiling (see the note in ai/models.ts). At 4000 a single bad
    // prompt consumed the whole budget on reasoning and left nothing for the
    // answer. Fixing the impossible target is the real repair; this is the
    // margin that keeps a merely hard recipe from failing the same way.
    const RECIPE_MAX_TOKENS = 6000;

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
            // The ~16KB ingredient reference used to sit in the middle of the
            // user message, behind this call's dish name. OpenAI's prompt cache
            // matches on longest common *prefix*, so a per-user token in front
            // of a static block means the block never gets cached — measured 0%
            // hit rate across four consecutive calls. Hoisting it into the
            // system message puts identical bytes first for every caller: 100%
            // from call two onward, ~28% off latency. The text is unchanged and
            // the model still sees it before the request, so output is the same.
            {
              role: 'system',
              content: RECIPE_SYSTEM_PREAMBLE
            },
            {
              role: 'user',
              content: recipePrompt
            }
          ],
          response_format: toStrictJsonSchema('recipe', RecipeSchema),
          ...tuning(MODELS.FAST, { maxTokens: RECIPE_MAX_TOKENS, temperature: 0.7 })
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
    // are whole-recipe and have to add up to servings × the stated per-serving
    // totals. Warn-only — the recipe is still usable.
    const validation = validateIngredientSums(
      recipeData.name,
      {
        estimatedCalories: recipeData.nutrition.calories,
        protein: recipeData.nutrition.protein,
        carbs: recipeData.nutrition.carbs,
        fat: recipeData.nutrition.fat,
        servings: recipeData.servings,
        ingredientsWithNutrition: recipeData.ingredientsWithNutrition
      }
    );

    validation.errors.forEach((e) => console.error(`[RECIPE-INGREDIENT-VALIDATOR] ❌ ${e}`));
    validation.warnings.forEach((w) => console.warn(`[RECIPE-INGREDIENT-VALIDATOR] ⚠️ ${w}`));
    if (validation.valid && validation.details) {
      console.log(`[RECIPE-INGREDIENT-VALIDATOR] ✅ ${recipeData.name}: ${validation.details.ingredientCount} ingredients, sums match`);
    }

    // Cache only what we would be willing to serve again unexamined. parseChoice
    // above already refuses to cache a malformed recipe on the grounds that a
    // cached one is served back forever; arithmetic that is more than 20% out is
    // wrong for the same duration and for the same reason. The recipe is still
    // returned to the caller — the user asked for it and it is displayable — but
    // it does not become the permanent answer for this dish.
    if (validation.errors.length > 0) {
      console.warn(
        `[RECIPE] Not caching "${dishName}" — ${validation.errors.length} ingredient sum error(s). ` +
        `Returning it to the caller uncached so the next request regenerates.`
      );
      return NextResponse.json({
        success: true,
        recipe: recipeData,
        cached: false
      });
    }

    try {
      await prisma.recipe.upsert({
        where: { dishName: cacheKey },
        update: {
          recipeData: recipeData,
          hitCount: { increment: 1 },
          lastUsed: new Date()
        },
        create: {
          dishName: cacheKey,
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