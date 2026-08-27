import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fillMissingPriceEstimates,
  unpricedReason,
  type StoreOptionLike,
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
