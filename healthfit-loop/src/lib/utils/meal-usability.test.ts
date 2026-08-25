import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUsableOption, isUsableMeal } from './meal-usability';

const good = {
  name: 'Shakshuka',
  estimatedCalories: 520,
  protein: 28,
  ingredients: ['eggs', 'tomatoes'],
  ingredientsWithNutrition: [{ name: 'eggs', quantity: '3', calories: 210, protein: 18, carbs: 1, fat: 15 }],
  instructions: ['simmer'],
};

test('a complete option is usable', () => {
  assert.equal(isUsableOption(good), true);
});

test('zero calories is not usable', () => {
  assert.equal(isUsableOption({ ...good, estimatedCalories: 0 }), false);
});

test('empty instructions is not usable', () => {
  assert.equal(isUsableOption({ ...good, instructions: [] }), false);
});

test('empty ingredientsWithNutrition is not usable, even with ingredients present', () => {
  assert.equal(isUsableOption({ ...good, ingredientsWithNutrition: [] }), false);
});

test('a missing option is not usable', () => {
  assert.equal(isUsableOption(undefined), false);
  assert.equal(isUsableOption(null), false);
});

test('a slot is usable when its primary is', () => {
  assert.equal(isUsableMeal({ primary: good, alternative: { ...good, ingredientsWithNutrition: [] } }), true);
});

test('a slot with a hollow primary is not usable', () => {
  assert.equal(isUsableMeal({ primary: { ...good, protein: 0 }, alternative: good }), false);
});

test('a slot with no options is not usable', () => {
  assert.equal(isUsableMeal({}), false);
});
