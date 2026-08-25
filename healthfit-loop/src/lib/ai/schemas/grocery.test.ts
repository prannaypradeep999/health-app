import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GroceryStoreSearchSchema } from './grocery';

const store = (name: string) => ({
  name,
  address: '1 Main St',
  distance: '0.4 mi',
  type: 'mid-range' as const,
});

test('accepts two stores', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [store('A'), store('B')] });
  assert.equal(r.success, true);
});

test('accepts one store', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [store('A')] });
  assert.equal(r.success, true);
});

test('accepts three stores', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [store('A'), store('B'), store('C')] });
  assert.equal(r.success, true);
});

test('rejects zero stores — the route cannot use an empty list', () => {
  const r = GroceryStoreSearchSchema.safeParse({ stores: [] });
  assert.equal(r.success, false);
});

test('rejects four stores — the prompt asks for at most three', () => {
  const r = GroceryStoreSearchSchema.safeParse({
    stores: [store('A'), store('B'), store('C'), store('D')],
  });
  assert.equal(r.success, false);
});
