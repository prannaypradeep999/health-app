import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkCount, checkSlots, checkNonEmpty } from './completeness';

test('checkCount is silent when the count matches', () => {
  assert.deepEqual(checkCount('mealPlan', 'short-plan', 18, 18), []);
});

test('checkCount errors on a short result', () => {
  const out = checkCount('mealPlan', 'short-plan', 14, 18);
  assert.equal(out.length, 1);
  assert.equal(out[0].family, 'COMPLETENESS');
  assert.equal(out[0].severity, 'error');
  assert.match(out[0].message, /14.*18/);
});

test('checkCount errors on an over-long result too', () => {
  // Grammar padding is as wrong as truncation: it means invented filler.
  const out = checkCount('mealPlan', 'short-plan', 21, 18);
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'error');
});

test('checkSlots reports the specific day+slot pairs that are missing', () => {
  const want = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'monday', mealType: 'dinner' },
    { day: 'tuesday', mealType: 'dinner' },
  ];
  const got = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'tuesday', mealType: 'dinner' },
  ];
  const out = checkSlots('meals', got, want);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'missing-slot');
  assert.match(out[0].message, /monday\|dinner/);
});

test('checkSlots reports duplicates, which is how a pinned array hides a gap', () => {
  const want = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'monday', mealType: 'dinner' },
  ];
  // Right length, wrong content: exactly what exactly(n) cannot prevent.
  const got = [
    { day: 'monday', mealType: 'breakfast' },
    { day: 'monday', mealType: 'breakfast' },
  ];
  const out = checkSlots('meals', got, want);
  const codes = out.map(f => f.code).sort();
  assert.deepEqual(codes, ['duplicate-slot', 'missing-slot']);
});

test('checkSlots is case-insensitive about day and meal names', () => {
  const want = [{ day: 'monday', mealType: 'dinner' }];
  const got = [{ day: 'Monday', mealType: 'Dinner' }];
  assert.deepEqual(checkSlots('meals', got, want), []);
});

test('checkNonEmpty flags empty and missing arrays', () => {
  assert.deepEqual(checkNonEmpty('day.exercises', 'no-exercises', [1, 2]), []);
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', []).length, 1);
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', null).length, 1);
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', undefined).length, 1);
});

test('checkNonEmpty honours a minimum above one', () => {
  assert.equal(checkNonEmpty('day.exercises', 'no-exercises', [1, 2], 3).length, 1);
  assert.deepEqual(checkNonEmpty('day.exercises', 'no-exercises', [1, 2, 3], 3), []);
});
