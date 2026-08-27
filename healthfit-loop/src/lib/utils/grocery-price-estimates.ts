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
}

export interface PricedItemLike {
  item?: string;
  storeOptions?: StoreOptionLike[];
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
          priceConfidence: 'estimate' as const,
        };
      }),
    };
  });
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
