/**
 * Fills in what we can infer about a grocery item's price at a store that did
 * not return one, without pretending we looked it up.
 *
 * The problem: the pricing call returns `price: null` when it cannot verify a
 * shelf price, and that null is correct and deliberate. Making the field
 * non-nullable was tried on 2026-08-25 and Sonar returned `0` for every option
 * alongside "the current shelf price could not be verified" — which is worse
 * than null, because zero is not a missing price, it is a very cheap one, and
 * it made whichever store failed to price an item win the cheapest-store
 * comparison.
 *
 * But nulls were reaching the UI as the bare words "no price" even for items
 * priced at two of their three stores. We knew roughly what those cost. This
 * module says so, and labels it.
 *
 * The one rule that matters: `price` is never written. `computeStoreTotals`
 * ranks stores on `price` and skips nulls precisely so an unpriced store cannot
 * look cheap, and an estimate written into `price` would re-enter that bug from
 * the other side. Estimates go in `estimatedPrice`, which nothing that ranks or
 * totals reads.
 */

export interface StoreOptionLike {
  store: string;
  price?: number | null;
  priceConfidence?: 'exact' | 'estimate';
  reason?: string | null;
  /** Inferred, never looked up. Absent unless this option had no real price. */
  estimatedPrice?: number;
  /** Which store's real price the estimate was taken from. */
  estimatedFrom?: string;
  /**
   * How the estimate was arrived at. The two are not equally good and the UI
   * says so differently: one is this exact item's real price at another branch,
   * the other is what comparable items in this same list cost.
   */
  estimateBasis?: 'other-store' | 'category-typical';
}

export interface PricedItemLike {
  item?: string;
  category?: string;
  storeOptions?: StoreOptionLike[];
  /**
   * A budget figure for an item no store priced, derived from what comparable
   * items in this same list actually cost. Set by `fillTypicalPriceEstimates`.
   *
   * Item-level as well as per-option because some items reach the UI with no
   * store options at all — the price search never returned a row for them — and
   * there is no option to hang a number on.
   */
  typicalPriceEstimate?: number;
  /** What the typical estimate was drawn from, for the UI to name. */
  typicalPriceBasis?: string;
}

/** A price we actually got back, as opposed to null, 0 or a negative. */
function isRealPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/**
 * Adds `estimatedPrice` to every store option that has no real price, taken
 * from the highest real price the same item got at any other store.
 *
 * Worst case rather than average on purpose: a grocery list is useful as an
 * upper bound on the shop. An average would put the user under budget half the
 * time, and being under budget at the till is the direction that costs
 * something.
 *
 * An item that no store priced is left alone — there is nothing to infer from,
 * and inventing a number there would be the fabrication this module exists to
 * avoid. Use `unpricedReason` to tell the user why instead.
 */
export function fillMissingPriceEstimates<T extends PricedItemLike>(items: T[]): T[] {
  return items.map(item => {
    const options = item.storeOptions;
    if (!Array.isArray(options) || options.length === 0) return item;

    let worst: { price: number; store: string } | null = null;
    for (const option of options) {
      if (!isRealPrice(option.price)) continue;
      if (!worst || option.price > worst.price) {
        worst = { price: option.price, store: option.store };
      }
    }
    if (!worst) return item;

    return {
      ...item,
      storeOptions: options.map(option => {
        if (isRealPrice(option.price)) return option;
        return {
          ...option,
          // `price` stays exactly as it was. See the header.
          estimatedPrice: worst!.price,
          estimatedFrom: worst!.store,
          estimateBasis: 'other-store' as const,
          priceConfidence: 'estimate' as const,
        };
      }),
    };
  });
}

/**
 * The dearest real price this item got at any store, or null if no store priced
 * it. Dearest rather than cheapest for the reason in `fillMissingPriceEstimates`
 * — a grocery list is useful as an upper bound.
 */
function dearestRealPrice(item: PricedItemLike): number | null {
  const options = item?.storeOptions;
  if (!Array.isArray(options)) return null;
  let worst: number | null = null;
  for (const option of options) {
    if (!isRealPrice(option.price)) continue;
    if (worst === null || option.price > worst) worst = option.price;
  }
  return worst;
}

/**
 * The upper of the two middle values for an even-length sample, the middle one
 * for an odd. Upper on purpose: same upper-bound argument as everywhere else in
 * this module, and it costs at most one sample's worth of pessimism.
 */
function upperMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * How many real prices a bucket needs before its median is worth quoting. Below
 * this a single odd item — a $34 bottle of saffron sitting alone in "pantry
 * staples" — becomes the typical price for the category.
 */
const MIN_TYPICAL_SAMPLES = 3;

/**
 * A budget figure for the items no store priced at all.
 *
 * `fillMissingPriceEstimates` above deliberately leaves these alone: it infers
 * one store's price from another store's price for the *same item*, and here no
 * store priced the item. That was the right call for that function and the wrong
 * outcome for the user, who saw "no price" on a third of the list and could not
 * budget from it. Measured on the 2026-08-27 vegetarian run: 13 of 29 items,
 * nearly all pantry staples.
 *
 * The number is not invented and it is not a lookup table anyone has to
 * maintain. It is the median of what comparable items in *this same list*
 * actually cost at *these same stores* — real prices, from this run, for this
 * user's city. An unpriced pantry staple is quoted the median pantry staple.
 * Where a category has too few real prices to have a median worth the name, the
 * whole list's median is used instead, and where the list has almost no prices
 * at all nothing is written: at that point the run has failed and the banner
 * above the list says so, which is more honest than 40 identical guesses.
 *
 * As everywhere else in this module, `price` is never written. The estimate goes
 * in `estimatedPrice` and `typicalPriceEstimate`, neither of which
 * `computeStoreTotals` reads, so the cheapest-store ranking still sees only
 * prices someone actually looked up.
 */
export function fillTypicalPriceEstimates<T extends PricedItemLike>(items: T[]): T[] {
  if (!Array.isArray(items) || items.length === 0) return items;

  const byCategory = new Map<string, number[]>();
  const wholeList: number[] = [];
  for (const item of items) {
    const price = dearestRealPrice(item);
    if (price === null) continue;
    wholeList.push(price);
    const key = normalizeCategory(item.category);
    if (!key) continue;
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(price);
    else byCategory.set(key, [price]);
  }

  return items.map(item => {
    // Anything with a real price anywhere is already answered.
    if (dearestRealPrice(item) !== null) return item;

    const key = normalizeCategory(item?.category);
    const categorySamples = key ? byCategory.get(key) ?? [] : [];

    let samples: number[];
    let basis: string;
    if (categorySamples.length >= MIN_TYPICAL_SAMPLES) {
      samples = categorySamples;
      basis = `typical ${key} price in this list`;
    } else if (wholeList.length >= MIN_TYPICAL_SAMPLES) {
      samples = wholeList;
      basis = 'typical price across this list';
    } else {
      return item;
    }

    const estimate = Math.round(upperMedian(samples) * 100) / 100;
    const options = item.storeOptions;

    return {
      ...item,
      typicalPriceEstimate: estimate,
      typicalPriceBasis: basis,
      storeOptions: Array.isArray(options)
        ? options.map(option => ({
            ...option,
            // `price` stays exactly as it was. See the header.
            estimatedPrice: estimate,
            estimatedFrom: basis,
            estimateBasis: 'category-typical' as const,
            priceConfidence: 'estimate' as const,
          }))
        : options,
    };
  });
}

/** Categories arrive from the model in whatever casing and plurality it likes. */
function normalizeCategory(category: unknown): string {
  if (typeof category !== 'string') return '';
  return category.trim().toLowerCase();
}

/**
 * Whether this row has any number to show — a looked-up price or an estimate of
 * either kind.
 *
 * The UI needs this per item. `hasRealPrices` there is a whole-list flag, so an
 * item nothing priced still rendered a three-column table reading "no price",
 * "no price", "no price" with an explanation underneath. Four ways of saying
 * nothing where one belonged.
 */
export function itemHasAnyPrice(item: PricedItemLike): boolean {
  if (isRealPrice(item?.typicalPriceEstimate)) return true;
  const options = item?.storeOptions;
  if (!Array.isArray(options)) return false;
  return options.some(o => isRealPrice(o.price) || isRealPrice(o.estimatedPrice));
}

/**
 * Why an item shows no price at all, taken from whatever the pricing call said
 * about it. Null when at least one store priced it, since then there is nothing
 * to explain.
 *
 * This is the other half of the user's request: an estimate where we can make
 * one, and a reason where we cannot.
 */
export function unpricedReason(item: PricedItemLike): string | null {
  const options = item.storeOptions;
  if (!Array.isArray(options) || options.length === 0) return null;
  if (options.some(option => isRealPrice(option.price))) return null;

  // Mapped through meaningfulReason rather than a blank check: a junk reason
  // sitting in front of a real one must not hide it.
  const stated = options.map(o => meaningfulReason(o.reason)).find(r => r !== null);
  return stated ?? 'no shelf price was found for this item';
}

/**
 * True when a price chunk came back with rows but not one real price in any of
 * them.
 *
 * This is a failure the error path cannot see. `fetchPriceChunk` throws on an
 * HTTP error or an unparseable body; a chunk that returns fifteen well-formed
 * rows whose every price is null resolves, and `Promise.all` records it as a
 * success. On the 2026-08-27 production run that is exactly what happened, and
 * the user got a grocery list with 25 of 40 items priced and
 * `priceSearchSuccess: true` above it.
 *
 * No downstream repair exists: `fillMissingPriceEstimates` derives a missing
 * price from another store that priced the same item, and in a priceless chunk
 * no store priced any item.
 *
 * The threshold is "nothing at all", not "less than we hoped" — partial results
 * are kept on purpose, and retrying a chunk that mostly worked would spend the
 * budget the price reserve exists to protect.
 */
export function chunkFoundNoPrices(items: PricedItemLike[]): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  return !items.some(item =>
    Array.isArray(item.storeOptions) && item.storeOptions.some(o => isRealPrice(o.price))
  );
}

/**
 * The fraction of a chunk's items that carry at least one real price, 0 to 1.
 *
 * `chunkFoundNoPrices` above only catches the all-or-nothing case, and the
 * partial case turns out to be the common one. On the 2026-08-27 vegetarian
 * production run 13 of 29 items came back with three store options each and a
 * null price in every one; they were nearly all pantry staples (olive oil,
 * honey, salsa, pesto, balsamic), the signature of a single chunk answering for
 * the front of its list and giving up on the rest. One item in that chunk did
 * get a price, so the priceless check said the chunk was fine and no retry ran.
 *
 * Returns a fraction rather than a boolean on purpose: the threshold belongs at
 * the call site, next to the time budget a retry spends. An empty chunk scores 1
 * — nothing to price means nothing failed, and scoring it 0 would mark the least
 * informative chunk as the most urgent to retry.
 */
export function chunkPriceCoverage(items: PricedItemLike[]): number {
  if (!Array.isArray(items) || items.length === 0) return 1;
  const priced = items.filter(item =>
    Array.isArray(item.storeOptions) && item.storeOptions.some(o => isRealPrice(o.price))
  ).length;
  return priced / items.length;
}

/**
 * A reason the user can read, or null.
 *
 * The model is asked for a sentence and sometimes returns its own debris. On
 * the 2026-08-27 production run a whole price chunk answered ":null" for all
 * fifteen of its items. ":null" is non-blank, so it passed the check that used
 * to live in `unpricedReason`, and GroceryListSection — which renders
 * `option.reason` verbatim — printed ":null" under fifteen grocery items where
 * an explanation belonged.
 *
 * The test is whether anything survives removing punctuation, plus an explicit
 * list for the spelled-out null literals: "null" survives as a word but is not
 * an explanation.
 */
const NON_REASONS = new Set(['null', 'undefined', 'none', 'na']);

export function meaningfulReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  // What is left after dropping everything that is not a letter or digit is the
  // information content: ":null," leaves "null", "/" leaves "", "Best value"
  // leaves "bestvalue".
  const bare = trimmed.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  if (bare === '' || NON_REASONS.has(bare)) return null;

  return trimmed;
}
