import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundToNearest10,
  optionCalories,
  optionMacro,
  displayCalories,
  displayMacro,
  sumDisplayCalories,
  sumDisplayMacro
} from './meal-nutrition';

test('roundToNearest10 rounds to the nearest ten', () => {
  assert.equal(roundToNearest10(1154), 1150);
  assert.equal(roundToNearest10(1155), 1160);
  assert.equal(roundToNearest10(0), 0);
});

test('roundToNearest10 treats non-finite input as zero', () => {
  assert.equal(roundToNearest10(NaN), 0);
  assert.equal(roundToNearest10(Infinity), 0);
});

test('optionCalories reads estimatedCalories, the field the generator writes', () => {
  assert.equal(optionCalories({ estimatedCalories: 620 }), 620);
});

test('optionCalories falls back to calories for consumption-log shapes', () => {
  assert.equal(optionCalories({ calories: 480 }), 480);
});

test('optionCalories prefers estimatedCalories when both spellings are present', () => {
  assert.equal(optionCalories({ estimatedCalories: 620, calories: 480 }), 620);
});

test('optionCalories returns 0 for missing, null and non-numeric input', () => {
  assert.equal(optionCalories(undefined), 0);
  assert.equal(optionCalories(null), 0);
  assert.equal(optionCalories({}), 0);
  assert.equal(optionCalories({ estimatedCalories: '620' }), 0);
  assert.equal(optionCalories({ estimatedCalories: NaN }), 0);
});

test('optionCalories preserves a genuine zero rather than falling through', () => {
  assert.equal(optionCalories({ estimatedCalories: 0, calories: 900 }), 0);
});

test('optionMacro reads plain macro fields', () => {
  const meal = { protein: 42, carbs: 55, fat: 18 };
  assert.equal(optionMacro(meal, 'protein'), 42);
  assert.equal(optionMacro(meal, 'carbs'), 55);
  assert.equal(optionMacro(meal, 'fat'), 18);
});

test('optionMacro falls back to the estimated* spelling used by menu data', () => {
  assert.equal(optionMacro({ estimatedProtein: 30 }, 'protein'), 30);
  assert.equal(optionMacro({ estimatedCarbs: 12 }, 'carbs'), 12);
  assert.equal(optionMacro({ estimatedFat: 7 }, 'fat'), 7);
});

test('optionMacro returns 0 when the macro is absent', () => {
  assert.equal(optionMacro({ protein: 42 }, 'fat'), 0);
  assert.equal(optionMacro(null, 'protein'), 0);
});

test('displayCalories rounds the awkward generated numbers the user objected to', () => {
  assert.equal(displayCalories({ estimatedCalories: 1154 }), 1150);
  assert.equal(displayCalories({ estimatedCalories: 617 }), 620);
});

test('displayMacro rounds grams to whole numbers but not to tens', () => {
  assert.equal(displayMacro({ protein: 32.4 }, 'protein'), 32);
  assert.equal(displayMacro({ fat: 17.6 }, 'fat'), 18);
});

test('a total equals the sum of the rounded numbers shown on the cards', () => {
  const day = [
    { estimatedCalories: 1154 },
    { estimatedCalories: 617 },
    { estimatedCalories: 483 }
  ];
  const shownOnCards = day.map(displayCalories);
  assert.deepEqual(shownOnCards, [1150, 620, 480]);
  // The property that was broken: the header total must be the sum of the
  // numbers the user can read off the cards, not a rounding of the raw sum.
  assert.equal(sumDisplayCalories(day), 2250);
  assert.equal(sumDisplayCalories(day), shownOnCards.reduce((a, b) => a + b, 0));
});

test('summing skips nothing and treats absent options as zero', () => {
  assert.equal(sumDisplayCalories([]), 0);
  assert.equal(sumDisplayCalories([undefined, null, { estimatedCalories: 500 }]), 500);
});

test('macro totals also sum the displayed values', () => {
  const day = [{ protein: 32.4 }, { protein: 17.6 }];
  assert.equal(sumDisplayMacro(day, 'protein'), 50);
  assert.equal(sumDisplayMacro(day, 'carbs'), 0);
});
