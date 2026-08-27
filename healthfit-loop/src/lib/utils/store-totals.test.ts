import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalStoreKey,
  computeStoreTotals,
  planPriceChunks,
  snapStoreNames,
} from './store-totals';

test('possessives and punctuation collapse to one key', () => {
  assert.equal(canonicalStoreKey("Trader Joe's"), canonicalStoreKey('Trader Joes'));
  assert.equal(canonicalStoreKey('Whole Foods Market'), canonicalStoreKey('whole foods market'));
});

test('a store suffix does not collapse two different stores', () => {
  assert.notEqual(canonicalStoreKey('Safeway'), canonicalStoreKey('Sprouts'));
});

test('the cheapest store is chosen over a comparable basket, not a smaller one', () => {
  const items = [
    { item: 'chicken', storeOptions: [{ store: 'Safeway', price: 10 }, { store: 'Lucky', price: 8 }] },
    { item: 'rice',    storeOptions: [{ store: 'Safeway', price: 4 },  { store: 'Lucky', price: 3 }] },
    // Lucky was not priced for spinach, so spinach is outside the comparison.
    { item: 'spinach', storeOptions: [{ store: 'Safeway', price: 5 }] },
  ] as any[];

  const { totals } = computeStoreTotals(items);
  const safeway = totals.find(t => t.store === 'Safeway')!;
  const lucky = totals.find(t => t.store === 'Lucky')!;

  // Comparison is over chicken + rice only: Safeway 14, Lucky 11.
  assert.equal(safeway.total, 14);
  assert.equal(lucky.total, 11);
  assert.ok(safeway.comparable && lucky.comparable);
});

test('a store priced for too few items is marked not comparable', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: 'Big', price: 1 }, { store: 'Sparse', price: 1 }] },
    { item: 'b', storeOptions: [{ store: 'Big', price: 1 }] },
    { item: 'c', storeOptions: [{ store: 'Big', price: 1 }] },
    { item: 'd', storeOptions: [{ store: 'Big', price: 1 }] },
  ] as any[];

  const { totals, skippedStores } = computeStoreTotals(items);
  assert.ok(skippedStores.includes('Sparse'));
  assert.equal(totals.find(t => t.store === 'Sparse')?.comparable, false);
});

test('a split store name is summed as one store', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: "Trader Joe's", price: 5 }] },
    { item: 'b', storeOptions: [{ store: 'Trader Joes', price: 5 }] },
  ] as any[];
  const { totals } = computeStoreTotals(items);
  assert.equal(totals.length, 1);
  assert.equal(totals[0].total, 10);
  assert.equal(totals[0].itemCount, 2);
});

test('comparableItemCount reports the size of the intersection', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: 'X', price: 1 }, { store: 'Y', price: 1 }] },
    { item: 'b', storeOptions: [{ store: 'X', price: 1 }, { store: 'Y', price: 1 }] },
    { item: 'c', storeOptions: [{ store: 'X', price: 1 }] },
  ] as any[];
  assert.equal(computeStoreTotals(items).comparableItemCount, 2);
});

test('no items yields empty totals rather than throwing', () => {
  const { totals, comparableItemCount } = computeStoreTotals([]);
  assert.deepEqual(totals, []);
  assert.equal(comparableItemCount, 0);
});

test('a single store is comparable with itself', () => {
  const items = [{ item: 'a', storeOptions: [{ store: 'Solo', price: 3 }] }] as any[];
  const { totals } = computeStoreTotals(items);
  assert.equal(totals[0].comparable, true);
  assert.equal(totals[0].total, 3);
});

test('an unpriced option does not make its store the cheapest', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: 'X', price: 10 }, { store: 'Y', price: 8 }] },
    { item: 'b', storeOptions: [{ store: 'X', price: 5 }, { store: 'Y', price: 4 }] },
    // Y could not price this one. Counting the null as 0 used to keep item c in
    // the intersection, so X was charged 5 for it and Y was charged nothing.
    { item: 'c', storeOptions: [{ store: 'X', price: 5 }, { store: 'Y', price: null }] },
  ] as any[];

  const { totals, comparableItemCount } = computeStoreTotals(items);
  assert.equal(comparableItemCount, 2);
  assert.equal(totals.find(t => t.store === 'X')!.total, 15);
  assert.equal(totals.find(t => t.store === 'Y')!.total, 12);
});

test('a zero price is treated as missing, not free', () => {
  const items = [
    { item: 'a', storeOptions: [{ store: 'X', price: 4 }, { store: 'Y', price: 0 }] },
  ] as any[];
  const { totals } = computeStoreTotals(items);
  assert.equal(totals.length, 1);
  assert.equal(totals[0].store, 'X');
});

test('a short list stays a single request', () => {
  assert.equal(planPriceChunks(12).chunkSize, 15);
  assert.equal(planPriceChunks(12).chunkCount, 1);
});

test('a medium list splits across the concurrency limit', () => {
  const { chunkSize, chunkCount } = planPriceChunks(60);
  assert.equal(chunkSize, 20);
  assert.equal(chunkCount, 3);
});

test('a long list adds chunks rather than growing them past the ceiling', () => {
  const { chunkSize, chunkCount } = planPriceChunks(300);
  assert.ok(chunkSize <= 40, `chunk size ${chunkSize} exceeds the ceiling`);
  assert.ok(chunkCount > 3, 'a 300-item list should need more than 3 chunks');
});

test('the ceiling is where the old formula started timing out', () => {
  // 120 items used to produce 3 requests of 40; anything larger grew from there.
  assert.ok(planPriceChunks(120).chunkSize <= 40);
});

/**
 * Store-name drift across price chunks.
 *
 * Measured on the 2026-08-27 production run: 79 items were priced in 6 parallel
 * chunks, and the model named the same shop "Target Berkeley" in some chunks and
 * "Target in Berkeley" in others. canonicalStoreKey collapses punctuation and
 * case but not an inserted word, so that is two keys. No item was priced at all
 * four keys, the intersection came out empty, and every store total rendered as
 * $0.00 with itemCount 0.
 *
 * The store list is not the model's to invent — findGroceryStores already
 * returned it. snapStoreNames puts the model's spelling back on the name we
 * asked about, which is the same rule the grocery schema already applies to
 * storeAddress.
 */
test('a store named differently across chunks collapses to one', () => {
  const stores = ['Target', "Downtown Berkeley Farmers' Market", 'Mezzoni Foods'];
  const items = [
    { item: 'miso', storeOptions: [{ store: 'Target Berkeley', price: 17.99 }] },
    { item: 'rice', storeOptions: [{ store: 'Target in Berkeley', price: 4.99 }] },
  ] as any[];

  const snapped = snapStoreNames(items, stores);
  assert.equal(snapped[0].storeOptions[0].store, 'Target');
  assert.equal(snapped[1].storeOptions[0].store, 'Target');
});

test('the drift is what zeroed the totals, and snapping is what fixes it', () => {
  // The item counts here are load-bearing, so they are worth stating.
  //
  // For drift to EMPTY the intersection rather than merely get the drifted
  // names dropped, each spelling has to be disjoint from the other AND still
  // clear MIN_COVERAGE * maxCoverage. Disjointness caps each spelling at half
  // the list, so a third store priced for much more than half would push
  // maxCoverage up until the two Targets fell below the threshold and were
  // excluded — which is a different bug from the one this test is about.
  //
  // Hence: 8 items, each Target spelling on its own half (4 each), Mezzoni on 6.
  //   before: coverage 4 / 4 / 6, threshold 6 * 0.6 = 3.6, all three comparable,
  //           and the two Target halves share no item -> intersection empty.
  //   after:  coverage 8 / 6, threshold 8 * 0.6 = 4.8, both comparable,
  //           intersection = the 6 items Mezzoni priced.
  const stores = ['Target', 'Mezzoni Foods'];
  const items = Array.from({ length: 8 }, (_, i) => ({
    item: `item-${i}`,
    storeOptions: [
      { store: i < 4 ? 'Target Berkeley' : 'Target in Berkeley', price: 10 },
      ...(i < 6 ? [{ store: 'Mezzoni Foods', price: 12 }] : []),
    ],
  })) as any[];

  const before = computeStoreTotals(items);
  assert.equal(
    before.totals.length,
    3,
    'the two spellings are supposed to survive the coverage filter as separate stores — if they do not, this fixture is measuring something else'
  );
  assert.equal(
    before.comparableItemCount,
    0,
    'the drift is supposed to empty the intersection — if it no longer does, this test is not measuring the bug'
  );
  assert.ok(
    before.totals.every(t => t.total === 0),
    'every total rendered $0.00 in production; that is the symptom under test'
  );

  const after = computeStoreTotals(snapStoreNames(items, stores));
  assert.equal(after.totals.length, 2, 'the two spellings should now be one store');
  assert.equal(after.comparableItemCount, 6);
  assert.equal(after.totals.find(t => t.store === 'Target')!.total, 60);
  assert.equal(after.totals.find(t => t.store === 'Mezzoni Foods')!.total, 72);
  // The point of the whole exercise: a real recommendation instead of an
  // arbitrary pick among four stores all tied at zero.
  assert.equal(after.totals[0].store, 'Target');
});

test('a store that matches nothing we asked about keeps its own name', () => {
  // Inventing a mapping is worse than leaving it alone: a wrong snap merges two
  // real shops and silently averages their prices into one total.
  const snapped = snapStoreNames(
    [{ item: 'x', storeOptions: [{ store: 'Berkeley Bowl', price: 3 }] }] as any[],
    ['Target', 'Safeway']
  );
  assert.equal(snapped[0].storeOptions[0].store, 'Berkeley Bowl');
});

test('the longest matching store wins an ambiguous name', () => {
  // "Whole Foods" and "Whole Foods Market Telegraph" both match a raw
  // "Whole Foods Market Telegraph Ave"; the specific one is the right answer.
  const snapped = snapStoreNames(
    [{ item: 'x', storeOptions: [{ store: 'Whole Foods Market Telegraph Ave', price: 3 }] }] as any[],
    ['Whole Foods', 'Whole Foods Market Telegraph']
  );
  assert.equal(snapped[0].storeOptions[0].store, 'Whole Foods Market Telegraph');
});

test('snapping preserves prices and every other field', () => {
  const snapped = snapStoreNames(
    [{
      item: 'x',
      storeOptions: [{ store: 'Target Berkeley', price: 3.5, priceConfidence: 'exact', reason: null, displayName: 'Great Value' }],
    }] as any[],
    ['Target']
  );
  const o = snapped[0].storeOptions[0] as any;
  assert.equal(o.price, 3.5);
  assert.equal(o.displayName, 'Great Value');
  assert.equal(o.priceConfidence, 'exact');
});

test('an empty store list leaves every name untouched', () => {
  const items = [{ item: 'x', storeOptions: [{ store: 'Target Berkeley', price: 3 }] }] as any[];
  assert.equal(snapStoreNames(items, [])[0].storeOptions[0].store, 'Target Berkeley');
});
