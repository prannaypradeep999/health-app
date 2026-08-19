import { z } from 'zod';

/**
 * Schemas for the two Perplexity grocery calls in perplexity-client.ts.
 *
 * Both used to pull their JSON out with `content.match(/\{[\s\S]*\}/)` — a
 * greedy match that takes everything from the first `{` to the last `}`. Any
 * prose the model wrapped around the object broke it, and any field it renamed
 * or dropped sailed straight through unvalidated into the UI. Sonar accepts
 * `response_format: {type:'json_schema', strict:true}` and enforces it with a
 * grammar (measured 2026-08-18, see the DECISION block in perplexity-client.ts),
 * so the shape is now guaranteed at the decoder rather than hoped for.
 *
 * These mirror GroceryStore / GroceryItemWithPrices / GroceryPriceResponse in
 * perplexity-client.ts exactly. Strict mode has no optionals, so the two fields
 * that are optional in those interfaces (`distance`, `reason`) are nullable
 * here and mapped back to `undefined` at the boundary — `JSON.stringify` drops
 * an undefined key, which reproduces the old wire format byte for byte.
 */

export const GROCERY_STORE_TYPES = ['budget', 'mid-range', 'premium'] as const;
export const PRICE_CONFIDENCE = ['exact', 'estimate'] as const;

export const GroceryStoreObject = z.object({
  name: z.string(),
  address: z.string(),
  distance: z.string().nullable(),
  type: z.enum(GROCERY_STORE_TYPES),
}).strict();

/** getLocalGroceryStores */
export const GroceryStoreSearchSchema = z.object({
  stores: z.array(GroceryStoreObject),
}).strict();

export const GroceryStoreOption = z.object({
  store: z.string(),
  displayName: z.string(),
  price: z.number(),
  storeAddress: z.string(),
  priceConfidence: z.enum(PRICE_CONFIDENCE),
  isRecommended: z.boolean(),
  reason: z.string().nullable(),
}).strict();

export const GroceryItemPrices = z.object({
  item: z.string(),
  quantity: z.string(),
  uses: z.string(),
  category: z.string(),
  storeOptions: z.array(GroceryStoreOption),
}).strict();

/**
 * getGroceryPrices.
 *
 * Deliberately NOT count-pinned, unlike the meal and workout schemas. The
 * prompt does enumerate every item, so pinning would be legitimate — but a
 * 40-item list at three store options each is far more output than a pinned
 * array can safely fit, and under grammar-constrained decoding a truncated
 * response is a total loss rather than a short one. Items the model skips are
 * recovered in generate-groceries/route.ts instead, priced or not.
 */
export const GroceryPricesSchema = z.object({
  items: z.array(GroceryItemPrices),
  storeTotals: z.array(z.object({
    store: z.string(),
    total: z.number(),
  }).strict()),
  recommendedStore: z.string(),
  savings: z.string(),
}).strict();
