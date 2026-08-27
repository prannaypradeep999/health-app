import { createGroceryPrompt } from '@/lib/ai/prompts';
import { MODELS, tuning } from '@/lib/ai/models';
import { logUsage } from '@/lib/ai/usage';
import { GroceryListSchema, toStrictJsonSchema } from '@/lib/ai/schemas';
import { parseChoice } from '@/lib/ai/validate';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';
import { buildFallbackGroceryList } from '@/lib/utils/grocery-list';

export const GROCERY_CATEGORIES = [
  'proteins',
  'vegetables',
  'grains',
  'dairy',
  'pantryStaples',
  'snacks',
] as const;

/**
 * Consolidation turns a week of recipe ingredient lines into a shopping list.
 *
 * Measured 2026-08-27 against the 14 meals of production plan
 * cmtaxfpqe0003lb04bqh02i4g, four runs per model:
 *
 *                    p50       p95     ingredients covered (G1, of 97)
 *   gpt-5.6-luna   13,235ms  13,507ms  68.5
 *   gpt-5.4-mini    7,493ms   7,885ms  59.3
 *
 * The cheap model is worth 6s and costs 9 ingredients — it drops things the
 * recipes actually call for, which is the one thing this call exists to avoid.
 * So DETAIL stays, and the latency is a fact to budget around rather than
 * optimise away. Across all measurement rounds the p95 ranged 13.5-17.7s;
 * 17,700ms is the worst observed and is what the caller should reserve for.
 */
export const GROCERY_CONSOLIDATION_P95_MS = 17_700;

/**
 * Consolidate a week of meals into a categorised shopping list.
 *
 * Returns `null` rather than throwing: a grocery failure costs polish, not the
 * meal plan, and every caller has a fallback that is merely worse rather than
 * absent.
 */
export async function consolidateGroceryList(
  allMeals: any[],
  surveyData: any,
  logPrefix = '[GROCERY-CONSOLIDATION]'
): Promise<Record<string, any> | null> {
  if (!Array.isArray(allMeals) || allMeals.length === 0) {
    console.warn(`${logPrefix} ⚠️ No meals to consolidate`);
    return null;
  }

  const startTime = Date.now();
  console.log(`${logPrefix} 📋 Consolidating grocery list from ${allMeals.length} meals...`);

  const groceryPrompt = createGroceryPrompt(allMeals, surveyData);

  const gptResult = await withGPTRetry(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS.DETAIL,
        messages: [{ role: 'system', content: groceryPrompt }],
        ...tuning(MODELS.DETAIL, { maxTokens: 4000, temperature: 0.3 }),
        response_format: toStrictJsonSchema('grocery_list', GroceryListSchema),
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new HttpError(
        response.status,
        `GPT API error ${response.status}: ${errorText.substring(0, 100)}`
      );
    }

    return response.json();
  }, 'Grocery list consolidation');

  if (!gptResult.success) {
    console.error(`${logPrefix} ❌ Consolidation failed: ${gptResult.error}`);
    return null;
  }

  const data = gptResult.data;
  logUsage('grocery-consolidation', 4000, data);

  const parsed = parseChoice(GroceryListSchema, data.choices?.[0], 'grocery-consolidation');
  if (!parsed.ok) {
    console.error(`${logPrefix} ❌ Consolidation ${parsed.reason}: ${parsed.detail}`);
    return null;
  }

  const list = parsed.data.groceryList as Record<string, any[]>;

  // The schema guarantees a well-formed list, not a complete one. A category the
  // model left empty is filled from the meals' own ingredients so the section
  // is not simply missing from the UI.
  const missing = GROCERY_CATEGORIES.filter(cat => !list[cat] || list[cat].length === 0);
  if (missing.length > 0) {
    console.warn(`${logPrefix} ⚠️ Missing categories: ${missing.join(', ')} — backfilling those from ingredients`);
    const fallback = buildFallbackGroceryList(allMeals);
    for (const cat of missing) list[cat] = fallback[cat]?.length ? fallback[cat] : [];
  }

  const totalItems = GROCERY_CATEGORIES.reduce((sum, cat) => sum + (list[cat]?.length || 0), 0);
  console.log(
    `${logPrefix} ✅ ${totalItems} items across ${GROCERY_CATEGORIES.length} categories in ${Date.now() - startTime}ms`
  );

  return list;
}
