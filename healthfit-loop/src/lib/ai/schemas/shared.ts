import { z } from 'zod';

/** meal-generation.ts (x4) and recipe-creation.ts */
export const IngredientWithNutrition = z.object({
  item: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
}).strict();

/**
 * perplexity-client.ts `PerplexityMenuResponse.orderingLinks` and
 * meal-generation.ts restaurant meals.
 *
 * Nullable, not optional: strict mode requires every key present. The prompts
 * that produce this must ask for null on missing platforms — the restaurant
 * prompt used to ask the model to omit the key, which strict mode forbids.
 */
export const OrderingLinks = z.object({
  doordash: z.string().nullable(),
  ubereats: z.string().nullable(),
  grubhub: z.string().nullable(),
  direct: z.string().nullable(),
}).strict();

/**
 * Coerce every non-URL value in an orderingLinks object to a real null.
 *
 * `z.string().nullable()` is satisfied by the four-character string "null", and
 * that is exactly what the model tends to emit for a platform it could not
 * find — observed in the 2026-08-18 plan:
 *
 *   "orderingLinks": { "direct": "https://...", "grubhub": "null",
 *                      "doordash": "null", "ubereats": "https://..." }
 *
 * `"null"` is truthy, so the UI rendered an enabled "Order Now" button that
 * navigated nowhere, and the link counts treated it as a real link — which also
 * kept restaurants alive that had nothing orderable. Anything that is not an
 * http(s) URL becomes null here, which is what the schema meant to say.
 *
 * Applied after parsing rather than as a `.transform()` on the schema itself:
 * the same object is fed to `zodResponseFormat` to build the wire JSON Schema,
 * and a ZodEffects there is not reliably convertible.
 *
 * The key set and the value types are unchanged, so the serialized shape is
 * identical — only bogus values become null.
 */
export function normalizeOrderingLinks<T extends Record<string, unknown>>(links: T): T {
  if (!links || typeof links !== 'object') return links;
  const out: Record<string, unknown> = { ...links };
  for (const [platform, value] of Object.entries(out)) {
    const ok = typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
    out[platform] = ok ? (value as string).trim() : null;
  }
  return out as T;
}

export const GroceryItem = z.object({
  name: z.string(),
  quantity: z.string(),
  uses: z.string(),
}).strict();

/** Six fixed categories, per "use these EXACT categories" in both grocery prompts. */
export const GroceryList = z.object({
  proteins: z.array(GroceryItem),
  vegetables: z.array(GroceryItem),
  grains: z.array(GroceryItem),
  dairy: z.array(GroceryItem),
  pantryStaples: z.array(GroceryItem),
  snacks: z.array(GroceryItem),
}).strict();

/** Duplicated verbatim in meal-generation.ts at the legacy and detail prompts. */
export const MealObject = z.object({
  name: z.string(),
  description: z.string(),
  estimatedCalories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  prepTime: z.string(),
  cookTime: z.string(),
  difficulty: z.string(),
  cuisine: z.string(),
  ingredientsWithNutrition: z.array(IngredientWithNutrition),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  tags: z.array(z.string()),
  source: z.string(),
}).strict();

/** Both meal prompts wrap primary/alternative in this day+slot envelope. */
export const MealSlot = z.object({
  day: z.string(),
  mealType: z.string(),
  primary: MealObject,
  alternative: MealObject,
}).strict();
