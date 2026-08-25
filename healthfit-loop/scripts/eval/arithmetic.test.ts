import { test } from 'node:test';
import assert from 'node:assert/strict';

import { caloriesFromMacros, pctOff, checkAtwater, checkTarget, checkSum } from './arithmetic';

test('caloriesFromMacros applies Atwater factors 4/4/9', () => {
  assert.equal(caloriesFromMacros({ protein: 30, carbs: 40, fat: 10 }), 30 * 4 + 40 * 4 + 10 * 9);
});

test('pctOff is symmetric magnitude, and 0 expected with 0 actual is 0', () => {
  assert.equal(pctOff(110, 100), 10);
  assert.equal(pctOff(90, 100), 10);
  assert.equal(pctOff(0, 0), 0);
  assert.equal(pctOff(5, 0), 100);
});

test('checkAtwater is silent when macros agree with stated calories', () => {
  // 30*4 + 40*4 + 10*9 = 370
  assert.deepEqual(checkAtwater('monday.dinner', { calories: 370, protein: 30, carbs: 40, fat: 10 }), []);
});

test('checkAtwater warns between 10% and 15% off', () => {
  // macros = 370; stated 330 => 12.1% off
  const out = checkAtwater('monday.dinner', { calories: 330, protein: 30, carbs: 40, fat: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'warn');
  assert.equal(out[0].family, 'ARITHMETIC');
  assert.equal(out[0].code, 'atwater-mismatch');
  assert.equal(out[0].where, 'monday.dinner');
});

test('checkAtwater errors above 15% off', () => {
  // macros = 370; stated 250 => 48% off
  const out = checkAtwater('monday.dinner', { calories: 250, protein: 30, carbs: 40, fat: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, 'error');
});

test('checkTarget flags a meal that misses its calorie target', () => {
  assert.deepEqual(checkTarget('monday.dinner', 520, 520), []);
  assert.equal(checkTarget('monday.dinner', 590, 520)[0].severity, 'warn');   // 13.5%
  assert.equal(checkTarget('monday.dinner', 800, 520)[0].severity, 'error');  // 53.8%
  assert.equal(checkTarget('monday.dinner', 520, 0).length, 0, 'a zero target is not a finding, it is a missing target');
});

test('checkSum compares parts against the stated whole with the ingredient tolerance', () => {
  assert.deepEqual(checkSum('recipe', 'ingredient-sum', [100, 200, 220], 520), []);
  assert.equal(checkSum('recipe', 'ingredient-sum', [100, 200, 160], 520)[0].severity, 'warn');  // 460 vs 520 = 11.5%
  assert.equal(checkSum('recipe', 'ingredient-sum', [100, 100, 100], 520)[0].severity, 'error'); // 300 vs 520 = 42%
});

test('checkSum on an empty parts list reports a missing breakdown, not a 100% error', () => {
  const out = checkSum('recipe', 'ingredient-sum', [], 520);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'ingredient-sum-empty');
  assert.equal(out[0].severity, 'error');
});
