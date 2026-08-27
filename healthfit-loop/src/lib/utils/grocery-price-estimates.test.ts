import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fillMissingPriceEstimates,
  fillTypicalPriceEstimates,
  itemHasAnyPrice,
  estimatedBasketTotal,
  unpricedReason,
  meaningfulReason,
  chunkFoundNoPrices,
  chunkPriceCoverage,
  type StoreOptionLike,
  type PricedItemLike,
} from './grocery-price-estimates';

/**
 * The user's complaint: "grocery list has a lot of no prices (should be an
 * estimate and say estimate worst case or why is it no prices)".
 *
 * A null price is honest — see grocery.ts, where making the field non-nullable
 * got Sonar to return 0 for everything and made whichever store failed to price
 * an item look cheapest. So the nulls stay. What was missing is that we already
 * know something about an item priced at two of its three stores, and were
 * showing "no price" as though we knew nothing.
 */

// storeOptions is annotated rather than inferred: fillMissingPriceEstimates is
// generic in the item type so the caller keeps its own fields, which means a
// narrowly-inferred literal here would hide `estimatedPrice` from the assertions
// below and the file would not typecheck.
const item = (prices: Array<number | null>): { item: string; storeOptions: StoreOptionLike[] } => ({
  item: 'Chicken breast',
  storeOptions: prices.map((price, i) => ({
    store: `store-${i}`,
    price,
    priceConfidence: 'exact' as const,
    reason: price === null ? 'could not verify shelf price' : null,
  })),
});

test('an unpriced store gets an estimate from the item\'s other stores', () => {
  const [filled] = fillMissingPriceEstimates([item([4.99, null, 6.49])]);
  assert.equal(filled.storeOptions[1].estimatedPrice, 6.49);
});

test('the estimate is the worst case, not the average', () => {
  // A grocery budget is useful as an upper bound. Estimating the middle would
  // put the user under budget half the time, which is the direction that
  // actually costs them something at the till.
  const [filled] = fillMissingPriceEstimates([item([2.0, 10.0, null])]);
  assert.equal(filled.storeOptions[2].estimatedPrice, 10.0);
});

test('the real price is never overwritten by an estimate', () => {
  // computeStoreTotals ranks stores on `price` alone and deliberately skips
  // nulls, so that the store which failed to price an item cannot win the
  // cheapest-store comparison by default. Writing an estimate into `price`
  // would silently re-enter that bug through the back door.
  const [filled] = fillMissingPriceEstimates([item([4.99, null, 6.49])]);
  assert.equal(filled.storeOptions[0].price, 4.99);
  assert.equal(filled.storeOptions[1].price, null, 'the estimate leaked into `price`');
  assert.equal(filled.storeOptions[0].estimatedPrice, undefined);
});

test('an item nothing priced anywhere gets no invented number', () => {
  const [filled] = fillMissingPriceEstimates([item([null, null])]);
  assert.equal(filled.storeOptions[0].estimatedPrice, undefined);
  assert.equal(filled.storeOptions[1].estimatedPrice, undefined);
});

test('an item nothing priced anywhere reports why', () => {
  const [filled] = fillMissingPriceEstimates([item([null, null])]);
  assert.equal(unpricedReason(filled), 'could not verify shelf price');
});

test('a fully priced item reports no reason', () => {
  const [filled] = fillMissingPriceEstimates([item([1.5, 2.5])]);
  assert.equal(unpricedReason(filled), null);
});

test('a zero or negative price counts as missing, not as cheap', () => {
  // The 2026-08-25 measurement: with a non-nullable price, Sonar returned 0 for
  // every option. Zero is a missing price wearing a number.
  const [filled] = fillMissingPriceEstimates([item([0, 5.0, -1])]);
  assert.equal(filled.storeOptions[0].estimatedPrice, 5.0);
  assert.equal(filled.storeOptions[2].estimatedPrice, 5.0);
});

test('estimates are marked so the UI cannot render them as found prices', () => {
  const [filled] = fillMissingPriceEstimates([item([4.99, null])]);
  assert.equal(filled.storeOptions[1].priceConfidence, 'estimate');
  assert.match(String(filled.storeOptions[1].estimatedFrom), /store-0/);
});

test('items without storeOptions pass through untouched', () => {
  const out = fillMissingPriceEstimates([{ item: 'Salt' } as any]);
  assert.equal(out.length, 1);
  assert.equal((out[0] as any).item, 'Salt');
});

test('estimating does not change how many items or options there are', () => {
  const input = [item([1, null, 3]), item([null, null])];
  const out = fillMissingPriceEstimates(input);
  assert.equal(out.length, 2);
  assert.equal(out[0].storeOptions.length, 3);
  assert.equal(out[1].storeOptions.length, 2);
});

/**
 * Production run cmtayzto20003ji04znsqp55s, 2026-08-27: one price chunk came
 * back with `price: null` for all 15 of its items and a `reason` of ":null" —
 * the model's own truncated output, not a sentence. `unpricedReason` takes the
 * first non-blank reason, ":null" is non-blank, and GroceryListSection renders
 * `option.reason` verbatim, so the user read ":null" underneath fifteen grocery
 * items where an explanation was supposed to be.
 *
 * A reason has to say something. Punctuation and the spelled-out null literals
 * are the model failing to answer, and the honest default sentence is better
 * than passing its debris through to a shopper.
 */
test('a reason made only of punctuation is not an explanation', () => {
  for (const junk of [':null', ':null,', '/', '-', 'null', 'NULL', 'undefined', '::', ' , ']) {
    const item = {
      item: 'Chicken breast',
      storeOptions: [
        { store: 'Safeway', price: null, reason: junk },
        { store: 'Whole Foods Market', price: null, reason: junk },
      ],
    };
    assert.equal(
      unpricedReason(item as any),
      'no shelf price was found for this item',
      `"${junk}" was passed through to the user as the reason there is no price`
    );
  }
});

test('a real stated reason still wins over the default', () => {
  const item = {
    item: 'Beef sirloin',
    storeOptions: [
      { store: 'Safeway', price: null, reason: ':null' },
      { store: 'Whole Foods Market', price: null, reason: 'sold only at the butcher counter' },
    ],
  };
  // The junk one comes first; skipping it must not mean skipping the real one
  // behind it.
  assert.equal(unpricedReason(item as any), 'sold only at the butcher counter');
});

test('meaningfulReason keeps text and rejects debris', () => {
  assert.equal(meaningfulReason('Best value'), 'Best value');
  assert.equal(meaningfulReason('  Best value  '), 'Best value');
  assert.equal(meaningfulReason(':null'), null);
  assert.equal(meaningfulReason('/'), null);
  assert.equal(meaningfulReason(''), null);
  assert.equal(meaningfulReason(null), null);
  assert.equal(meaningfulReason(undefined), null);
  assert.equal(meaningfulReason(42 as any), null);
});

/**
 * The chunk that produced the ":null" reasons above did not fail. It returned
 * fifteen well-formed rows in which every single price was null, so
 * Promise.all recorded it as a success and the caller priced 25 of 40 items
 * while reporting priceSearchSuccess: true.
 *
 * Strict JSON schema constrains the shape, not the content — the model filled
 * the shape with placeholders (displayName "Whole Foods Market chicken breast")
 * rather than admitting it found nothing. Nothing downstream can recover it
 * either: fillMissingPriceEstimates derives a missing price from another store
 * that priced the SAME item, and here no store priced any of them.
 *
 * So the caller has to notice. One chunk of many coming back completely
 * priceless is the signature.
 */
test('a chunk where nothing at all got a price is a failed chunk', () => {
  const priceless = [
    { item: 'Chicken breast', storeOptions: [
      { store: 'Safeway', price: null }, { store: 'Whole Foods Market', price: null }] },
    { item: 'Beef sirloin', storeOptions: [
      { store: 'Safeway', price: null }, { store: 'Whole Foods Market', price: null }] },
  ];
  assert.equal(chunkFoundNoPrices(priceless as any), true);
});

test('one real price anywhere in the chunk means the chunk worked', () => {
  // Deliberately the LAST option of the LAST item: partial results are kept on
  // purpose, so the threshold for a retry is "nothing at all", not "less than
  // we hoped". Retrying a chunk that mostly worked spends the budget that the
  // price reserve exists to protect.
  const partial = [
    { item: 'Chicken breast', storeOptions: [
      { store: 'Safeway', price: null }, { store: 'Whole Foods Market', price: null }] },
    { item: 'Beef sirloin', storeOptions: [
      { store: 'Safeway', price: null }, { store: 'Whole Foods Market', price: 12.99 }] },
  ];
  assert.equal(chunkFoundNoPrices(partial as any), false);
});

test('an empty chunk is not reported as priceless', () => {
  // Nothing to retry, and the existing throw/partial-result path already covers
  // a chunk that came back with no rows.
  assert.equal(chunkFoundNoPrices([]), false);
});

test('items with no storeOptions at all still count as priceless', () => {
  assert.equal(chunkFoundNoPrices([{ item: 'Salt' }] as any), true);
});

/**
 * `chunkFoundNoPrices` only catches the all-or-nothing case, and the 2026-08-27
 * vegetarian production run showed the gap: 13 of 29 items came back with three
 * store options each and a null price in every one. Those 13 were nearly all
 * pantry staples — olive oil, honey, salsa, pesto, balsamic — i.e. one chunk
 * that answered for part of its list and gave up on the rest. Because *some*
 * item in that chunk got a price, the retry never fired.
 *
 * `chunkPriceCoverage` reports the fraction of items carrying at least one real
 * price, so the caller can retry a chunk that mostly failed rather than only one
 * that entirely failed. It stays a fraction rather than a boolean so the
 * threshold lives at the call site with the budget it spends.
 */
test('coverage is the fraction of items carrying at least one real price', () => {
  const half = [
    { item: 'Olive oil', storeOptions: [{ store: 'Safeway', price: null }] },
    { item: 'Honey', storeOptions: [{ store: 'Safeway', price: null }] },
    { item: 'Oats', storeOptions: [{ store: 'Safeway', price: 4.99 }] },
    { item: 'Bananas', storeOptions: [{ store: 'Safeway', price: 1.29 }] },
  ];
  assert.equal(chunkPriceCoverage(half as any), 0.5);
});

test('a chunk that priced everything reports full coverage', () => {
  const full = [
    { item: 'Oats', storeOptions: [{ store: 'Safeway', price: 4.99 }] },
    { item: 'Bananas', storeOptions: [{ store: 'Safeway', price: 1.29 }] },
  ];
  assert.equal(chunkPriceCoverage(full as any), 1);
});

test('a priceless chunk reports zero coverage, agreeing with chunkFoundNoPrices', () => {
  // The two helpers must not disagree about the same chunk: anything
  // chunkFoundNoPrices calls priceless has to score 0 here, or a retry rule
  // built on coverage would skip a chunk the older rule would have caught.
  const priceless = [
    { item: 'Olive oil', storeOptions: [{ store: 'Safeway', price: null }] },
    { item: 'Honey', storeOptions: [] },
    { item: 'Salt' },
  ];
  assert.equal(chunkPriceCoverage(priceless as any), 0);
  assert.equal(chunkFoundNoPrices(priceless as any), true);
});

test('an empty chunk reports full coverage so it is never retried', () => {
  // Nothing to price means nothing failed. Returning 0 here would make an empty
  // chunk look like the worst possible result and retry it forever.
  assert.equal(chunkPriceCoverage([]), 1);
});

/**
 * The second estimate tier. `fillMissingPriceEstimates` above deliberately
 * leaves an item nothing priced anywhere alone, because it infers one store's
 * price from another store's price for the SAME item and here there is none.
 * Right call for that function, wrong outcome for the shopper: the 2026-08-27
 * vegetarian run left 13 of 29 items reading "no price", which is not a list you
 * can budget from.
 *
 * The number is neither invented nor a maintained table — it is the median of
 * what comparable items in this same list cost at these same stores.
 */
// Annotated for the same reason as `item` above: these functions are generic in
// the item type, so a narrowly-inferred literal would hide the fields the
// estimator adds and the assertions below would not typecheck. storeOptions is
// kept non-optional here so the tests can index it without a bang.
type TypicalItem = PricedItemLike & { item: string; storeOptions: StoreOptionLike[] };

const priced = (name: string, category: string, price: number | null): TypicalItem => ({
  item: name,
  category,
  storeOptions: [
    { store: 'Safeway', price },
    { store: 'Whole Foods Market', price },
  ],
});

test('an item no store priced is quoted the median of its category', () => {
  const out = fillTypicalPriceEstimates([
    priced('Olive oil', 'pantryStaples', null),
    priced('Honey', 'pantryStaples', 6.0),
    priced('Salsa', 'pantryStaples', 4.0),
    priced('Balsamic', 'pantryStaples', 8.0),
  ]);
  // Median of 4, 6, 8.
  assert.equal(out[0].typicalPriceEstimate, 6.0);
  assert.equal(out[0].storeOptions[0].estimatedPrice, 6.0);
  assert.equal(out[0].storeOptions[1].estimatedPrice, 6.0);
});

test('the typical estimate never leaks into price', () => {
  // Same rule as the other tier, and it matters more here: computeStoreTotals
  // ranks stores on `price` and skips nulls precisely so a store that failed to
  // price an item cannot win the cheapest-store comparison.
  const out = fillTypicalPriceEstimates([
    priced('Olive oil', 'pantryStaples', null),
    priced('Honey', 'pantryStaples', 6.0),
    priced('Salsa', 'pantryStaples', 4.0),
    priced('Balsamic', 'pantryStaples', 8.0),
  ]);
  assert.equal(out[0].storeOptions[0].price, null);
  assert.equal(out[0].storeOptions[1].price, null);
});

test('a category estimate is drawn from that category, not the whole list', () => {
  // The point of bucketing: a steak must not set the price of a lemon.
  const out = fillTypicalPriceEstimates([
    priced('Lemons', 'vegetables', null),
    priced('Carrots', 'vegetables', 2.0),
    priced('Kale', 'vegetables', 3.0),
    priced('Onions', 'vegetables', 2.5),
    priced('Ribeye', 'proteins', 40.0),
    priced('Salmon', 'proteins', 30.0),
    priced('Prawns', 'proteins', 35.0),
  ]);
  assert.equal(out[0].typicalPriceEstimate, 2.5);
});

test('a category with too few real prices falls back to the whole list', () => {
  // One $34 jar of saffron alone in its category must not become the typical
  // price for that category.
  const out = fillTypicalPriceEstimates([
    priced('Vanilla pods', 'spices', null),
    priced('Saffron', 'spices', 34.0),
    priced('Carrots', 'vegetables', 2.0),
    priced('Kale', 'vegetables', 3.0),
    priced('Onions', 'vegetables', 4.0),
  ]);
  // Median of 34, 2, 3, 4 taking the upper middle: 4.
  assert.equal(out[0].typicalPriceEstimate, 4.0);
  assert.match(String(out[0].typicalPriceBasis), /across this list/);
});

test('a list with almost no prices gets no estimates at all', () => {
  // At that point the run failed and the banner above the list says so, which is
  // more honest than stamping one guess across forty items.
  const out = fillTypicalPriceEstimates([
    priced('Olive oil', 'pantryStaples', null),
    priced('Honey', 'pantryStaples', null),
    priced('Salsa', 'pantryStaples', 6.0),
  ]);
  assert.equal(out[0].typicalPriceEstimate, undefined);
  assert.equal(out[0].storeOptions[0].estimatedPrice, undefined);
});

test('an item that already has a real price is left completely alone', () => {
  const out = fillTypicalPriceEstimates([
    priced('Honey', 'pantryStaples', 6.0),
    priced('Salsa', 'pantryStaples', 4.0),
    priced('Balsamic', 'pantryStaples', 8.0),
  ]);
  assert.equal(out[0].typicalPriceEstimate, undefined);
  assert.equal(out[0].storeOptions[0].price, 6.0);
  assert.equal(out[0].storeOptions[0].estimatedPrice, undefined);
});

test('an item the price search never returned still gets a budget figure', () => {
  // These arrive with no storeOptions at all — generate-groceries carries them
  // through rather than dropping them. There is no option to hang a number on,
  // which is why the estimate is also recorded on the item.
  const out = fillTypicalPriceEstimates<PricedItemLike>([
    { item: 'Salt', category: 'pantryStaples' },
    priced('Honey', 'pantryStaples', 6.0),
    priced('Salsa', 'pantryStaples', 4.0),
    priced('Balsamic', 'pantryStaples', 8.0),
  ]);
  assert.equal(out[0].typicalPriceEstimate, 6.0);
});

test('estimates are marked as typical, not as this item priced elsewhere', () => {
  // The two tiers are not equally trustworthy and the UI has to be able to tell
  // them apart: one is this exact item at another branch, the other is what
  // similar things cost.
  const out = fillTypicalPriceEstimates([
    priced('Olive oil', 'pantryStaples', null),
    priced('Honey', 'pantryStaples', 6.0),
    priced('Salsa', 'pantryStaples', 4.0),
    priced('Balsamic', 'pantryStaples', 8.0),
  ]);
  assert.equal(out[0].storeOptions[0].estimateBasis, 'category-typical');
  assert.equal(out[0].storeOptions[0].priceConfidence, 'estimate');

  const [tier1] = fillMissingPriceEstimates([item([4.99, null])]);
  assert.equal(tier1.storeOptions[1].estimateBasis, 'other-store');
});

test('category matching survives the casing the model happens to use', () => {
  const out = fillTypicalPriceEstimates<PricedItemLike>([
    { item: 'Olive oil', category: 'Pantry Staples', storeOptions: [{ store: 'Safeway', price: null }] },
    { item: 'Honey', category: 'pantry staples', storeOptions: [{ store: 'Safeway', price: 6.0 }] },
    { item: 'Salsa', category: 'PANTRY STAPLES', storeOptions: [{ store: 'Safeway', price: 4.0 }] },
    { item: 'Balsamic', category: ' pantry staples ', storeOptions: [{ store: 'Safeway', price: 8.0 }] },
  ]);
  assert.equal(out[0].typicalPriceEstimate, 6.0);
});

test('estimating typical prices does not change the shape of the list', () => {
  const input = [
    priced('Olive oil', 'pantryStaples', null),
    priced('Honey', 'pantryStaples', 6.0),
    priced('Salsa', 'pantryStaples', 4.0),
    priced('Balsamic', 'pantryStaples', 8.0),
  ];
  const out = fillTypicalPriceEstimates(input);
  assert.equal(out.length, 4);
  for (const row of out) assert.equal(row.storeOptions?.length, 2);
});

test('never throws on the malformed rows a model can produce', () => {
  for (const bad of [undefined, null, 42, {}, [], '']) {
    assert.doesNotThrow(() => fillTypicalPriceEstimates([bad as any]));
    assert.doesNotThrow(() => itemHasAnyPrice(bad as any));
    assert.equal(itemHasAnyPrice(bad as any), false);
  }
  assert.doesNotThrow(() => fillTypicalPriceEstimates([] as any));
});

/**
 * The per-item flag the UI was missing. `hasRealPrices` there is a whole-list
 * boolean, so an item nothing priced still rendered a three-column table reading
 * "no price", "no price", "no price" — and then the explanation underneath.
 * Four ways of saying nothing where one belonged.
 */
test('itemHasAnyPrice counts a real price, either estimate, or nothing', () => {
  assert.equal(itemHasAnyPrice({ storeOptions: [{ store: 'A', price: 4.99 }] }), true);
  assert.equal(
    itemHasAnyPrice({ storeOptions: [{ store: 'A', price: null, estimatedPrice: 4.99 }] }),
    true
  );
  assert.equal(itemHasAnyPrice({ item: 'Salt', typicalPriceEstimate: 3.5 }), true);
  assert.equal(itemHasAnyPrice({ storeOptions: [{ store: 'A', price: null }] }), false);
  assert.equal(itemHasAnyPrice({ item: 'Salt' }), false);
});

test('itemHasAnyPrice treats zero as the missing price it is', () => {
  // The 2026-08-25 measurement again: with a non-nullable price Sonar returned 0
  // for everything. A row reading "$0.00" is not a row with a price.
  assert.equal(itemHasAnyPrice({ storeOptions: [{ store: 'A', price: 0 }] }), false);
  assert.equal(
    itemHasAnyPrice({ storeOptions: [{ store: 'A', price: null, estimatedPrice: 0 }] }),
    false
  );
});

/**
 * What the list costs, as opposed to what it costs to compare stores.
 *
 * computeStoreTotals sums only the items EVERY comparable store priced — right
 * for ranking, wrong for a shopper. On the 2026-08-27 run it was the only total
 * we had, and totalEstimatedCost reached the dashboard as 0 next to
 * weeklyBudgetUsed "0%": a week of groceries reported as free.
 */
const atStores = (prices: Record<string, number | null>): TypicalItem => ({
  item: 'thing',
  storeOptions: Object.entries(prices).map(([store, price]) => ({ store, price })),
});

test('the basket total sums every item at one store', () => {
  const out = estimatedBasketTotal(
    [atStores({ Safeway: 4.0, Target: 9.0 }), atStores({ Safeway: 6.0, Target: 1.0 })],
    'Safeway'
  );
  assert.equal(out.total, 10.0);
  assert.equal(out.itemsCounted, 2);
  assert.equal(out.itemsUnknown, 0);
});

test('the basket total includes items the comparison total leaves out', () => {
  // The whole point. Target priced only one of these two, so it is not in the
  // intersection computeStoreTotals ranks over — but the shopper still buys it.
  const items = [atStores({ Safeway: 4.0, Target: 9.0 }), atStores({ Safeway: 6.0, Target: null })];
  assert.equal(estimatedBasketTotal(items, 'Target').itemsCounted, 2);
  assert.equal(estimatedBasketTotal(items, 'Target').total, 15.0);
});

test('the basket total prefers the chosen store over a cheaper one elsewhere', () => {
  // You shop at one store. Taking each item's cheapest price across three shops
  // is a total nobody can actually pay.
  const items = [atStores({ Safeway: 10.0, Target: 2.0 })];
  assert.equal(estimatedBasketTotal(items, 'Safeway').total, 10.0);
});

test('the basket total falls back through estimates before giving up', () => {
  const withEstimate: TypicalItem = {
    item: 'Olive oil',
    storeOptions: [{ store: 'Safeway', price: null, estimatedPrice: 7.5 }],
  };
  assert.equal(estimatedBasketTotal([withEstimate], 'Safeway').total, 7.5);

  const onlyTypical: TypicalItem = {
    item: 'Salt',
    storeOptions: [],
    typicalPriceEstimate: 3.25,
  };
  assert.equal(estimatedBasketTotal([onlyTypical], 'Safeway').total, 3.25);
});

test('an item with no number anywhere is reported, not counted as free', () => {
  // Counting it as zero is how a 40-item list reports as costing less than a
  // 25-item one, and the user has no way to see that it happened.
  const out = estimatedBasketTotal(
    [atStores({ Safeway: 4.0 }), atStores({ Safeway: null })],
    'Safeway'
  );
  assert.equal(out.total, 4.0);
  assert.equal(out.itemsCounted, 1);
  assert.equal(out.itemsUnknown, 1);
});

test('the basket total matches store names the way everything else does', () => {
  // The pricing chunks each name the stores independently: "Target Berkeley" on
  // some items, "Target in Berkeley" on others.
  const items = [atStores({ "Trader Joe's Berkeley": 5.0 }), atStores({ 'trader joes berkeley': 6.0 })];
  assert.equal(estimatedBasketTotal(items, "Trader Joe's Berkeley").total, 11.0);
});

test('an empty list totals zero rather than throwing', () => {
  assert.deepEqual(estimatedBasketTotal([], 'Safeway'), {
    total: 0,
    itemsCounted: 0,
    itemsUnknown: 0,
  });
  assert.doesNotThrow(() => estimatedBasketTotal([undefined as any], 'Safeway'));
  assert.doesNotThrow(() => estimatedBasketTotal(undefined as any, 'Safeway'));
});

test('with no store named, the basket falls back to the dearest price per item', () => {
  // Upper bound, same convention as everywhere else in this module.
  const out = estimatedBasketTotal([atStores({ Safeway: 4.0, Target: 9.0 })]);
  assert.equal(out.total, 9.0);
});

test('the two tiers compose: same-item first, typical only for what is left', () => {
  // The order matters. A real price at a sibling store is better evidence than
  // the category median, so tier 1 has to run first and tier 2 must not
  // overwrite what it wrote.
  const partial = {
    item: 'Chicken breast',
    category: 'proteins',
    storeOptions: [{ store: 'A', price: 9.99 }, { store: 'B', price: null }] as StoreOptionLike[],
  };
  const nothing = {
    item: 'Tempeh',
    category: 'proteins',
    storeOptions: [{ store: 'A', price: null }, { store: 'B', price: null }] as StoreOptionLike[],
  };
  const others = [
    priced('Salmon', 'proteins', 12.0),
    priced('Tofu', 'proteins', 3.0),
  ];
  const out = fillTypicalPriceEstimates(
    fillMissingPriceEstimates([partial, nothing, ...others] as any)
  );
  assert.equal(out[0].storeOptions![1].estimatedPrice, 9.99, 'tier 2 overwrote a sibling price');
  assert.equal(out[0].storeOptions![1].estimateBasis, 'other-store');
  // Medians over 9.99, 12, 3 → 9.99.
  assert.equal(out[1].typicalPriceEstimate, 9.99);
  assert.equal(out[1].storeOptions![0].estimateBasis, 'category-typical');
  assert.equal(itemHasAnyPrice(out[1]), true);
});
