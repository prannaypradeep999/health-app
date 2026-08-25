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

/**
 * getLocalGroceryStores.
 *
 * Bounded, not pinned. The cap is real — the prompt asks for three and the UI
 * lays out three. The floor is 1 because generate-groceries/route.ts cannot
 * proceed with an empty list. What is deliberately absent is a *pin*: under
 * grammar-constrained decoding an `exactly(_, 3)` array cannot close before its
 * third element, so an address with two nearby stores got a third one invented,
 * address and all, rendered beside the two real ones with nothing to tell them
 * apart. A short honest list beats a padded one.
 */
export const GroceryStoreSearchSchema = z.object({
  stores: z.array(GroceryStoreObject).min(1).max(3),
}).strict();

/**
 * `storeAddress` is deliberately absent. It used to be here, and the model was
 * asked to supply it for every option — while the caller already held the
 * address for exactly these stores, returned by the store-search call a few
 * lines earlier in this same file. (An earlier version of this comment said
 * those addresses came from Google Places. They do not: GooglePlacesClient has
 * restaurant methods only and no grocery search exists.) Measured 2026-08-19: two
 * of three came back "No San Francisco address verified in gathered data", and
 * the third came back "399 4th St" for a Whole Foods whose real address, sitting
 * in a variable a few lines away, is "1765 California St". Asking a model for a
 * fact you already have is how you turn a correct value into a wrong one. The
 * field is rejoined from the stores array after parsing, so the shape the app
 * sees is unchanged.
 */
export const GroceryStoreOption = z.object({
  store: z.string(),
  displayName: z.string(),
  // Bounded because unbounded, a negative price shrank a store's total and
  // helped it win the cheapest-store comparison.
  //
  // Nullable because the model needs a way to say it does not know. Measured
  // 2026-08-25: with `price` a required non-nullable number, Sonar returned 0
  // for every option alongside reason "the current shelf price could not be
  // verified from the available result" — and the same call with no
  // response_format returned `price: null`. Zero is not a cheap price, it is a
  // missing one, and it made whichever store failed to price an item look
  // cheapest.
  price: z.number().min(0.01).max(500).nullable(),
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
/**
 * Items only. `storeTotals`, `recommendedStore` and `savings` were removed once
 * pricing was split into parallel chunks: each request sees a fraction of the
 * list, so any total it produces is a total of the wrong thing. The caller sums
 * across all chunks and picks the cheapest store arithmetically. Leaving the
 * fields in the schema meant every chunk spent output tokens computing a
 * number that was then discarded — and grammar-constrained decoding made
 * producing it mandatory.
 */
export const GroceryPricesSchema = z.object({
  items: z.array(GroceryItemPrices),
}).strict();
