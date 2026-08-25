import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePricedItem } from './grocery-merge';

const original = {
  name: 'chicken breast',
  quantity: '2 lbs',
  uses: 'Monday dinner, Wednesday lunch',
  category: 'proteins',
  perishability: 'high',
  usedInMeals: ['Monday dinner', 'Wednesday lunch'],
};

const priced = {
  item: 'boneless skinless chicken breasts',
  quantity: '1 lb',
  uses: 'dinner',
  category: 'proteins',
  storeOptions: [{ store: 'Safeway', price: 8.99, displayName: 'Chicken Breast', priceConfidence: 'exact' }],
};

test('the meal plan owns quantity', () => {
  assert.equal(mergePricedItem(original, priced).quantity, '2 lbs');
});

test('the meal plan owns uses', () => {
  assert.equal(mergePricedItem(original, priced).uses, 'Monday dinner, Wednesday lunch');
});

test('the meal plan owns the displayed name', () => {
  assert.equal(mergePricedItem(original, priced).name, 'chicken breast');
});

test('the model owns the store options', () => {
  assert.equal(mergePricedItem(original, priced).storeOptions.length, 1);
  assert.equal(mergePricedItem(original, priced).storeOptions[0].price, 8.99);
});

test('a rename is recorded, not silently applied', () => {
  assert.equal(mergePricedItem(original, priced).pricedAs, 'boneless skinless chicken breasts');
});

test('an identical name records no rename', () => {
  const same = { ...priced, item: 'chicken breast' };
  assert.equal(mergePricedItem(original, same).pricedAs, undefined);
});

test('fields the original did not have are carried from the model', () => {
  const merged = mergePricedItem(original, priced) as any;
  assert.ok(Array.isArray(merged.storeOptions));
});

test('a missing original still produces a usable row', () => {
  const merged = mergePricedItem(undefined, priced);
  assert.equal(merged.name, 'boneless skinless chicken breasts');
  assert.equal(merged.storeOptions[0].price, 8.99);
});
