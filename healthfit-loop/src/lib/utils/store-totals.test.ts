import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalStoreKey, computeStoreTotals } from './store-totals';

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
