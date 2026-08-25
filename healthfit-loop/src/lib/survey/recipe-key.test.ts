import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipeCacheKey, restrictionsFromSurvey } from './recipe-key';

test('no restrictions gives the bare lowercased dish name', () => {
  assert.equal(recipeCacheKey('Chicken Alfredo', []), 'chicken alfredo');
});

test('the bare key is what existing cached rows already use', () => {
  assert.equal(recipeCacheKey('  Pad Thai  ', []), 'pad thai');
});

test('restrictions produce a distinct key', () => {
  const bare = recipeCacheKey('Chicken Alfredo', []);
  const vegan = recipeCacheKey('Chicken Alfredo', ['vegan']);
  assert.notEqual(bare, vegan);
  assert.ok(vegan.startsWith('chicken alfredo::'));
});

test('restriction order does not change the key', () => {
  assert.equal(
    recipeCacheKey('Pasta', ['vegan', 'gluten']),
    recipeCacheKey('Pasta', ['gluten', 'vegan'])
  );
});

test('different restriction sets give different keys', () => {
  assert.notEqual(recipeCacheKey('Pasta', ['vegan']), recipeCacheKey('Pasta', ['gluten']));
});

test('aliases collapse so celiac and gluten-free share a key', () => {
  assert.equal(
    recipeCacheKey('Pasta', ['celiac']),
    recipeCacheKey('Pasta', ['gluten-free'])
  );
});

test('restrictionsFromSurvey merges diet prefs and allergies, deduped and sorted', () => {
  const out = restrictionsFromSurvey({
    dietPrefs: ['Vegan', 'gluten-free'],
    foodAllergies: ['Peanuts', 'vegan'],
  });
  assert.deepEqual(out, ['gluten', 'nuts', 'vegan']);
});

test('restrictionsFromSurvey tolerates a null survey', () => {
  assert.deepEqual(restrictionsFromSurvey(null), []);
});

test('restrictionsFromSurvey drops blanks', () => {
  assert.deepEqual(restrictionsFromSurvey({ dietPrefs: ['', '  '], foodAllergies: [] }), []);
});
