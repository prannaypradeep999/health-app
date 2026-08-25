import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIngredientSums } from './ingredient-validator';

const ingredients = [
  { item: '1 lb chicken breast', calories: 760, protein: 140, carbs: 0, fat: 16 },
  { item: '2 tbsp olive oil', calories: 240, protein: 0, carbs: 0, fat: 28 },
];

test('a two-serving recipe whose halves match is valid', () => {
  const result = validateIngredientSums('Roast chicken', {
    estimatedCalories: 500,
    protein: 70,
    carbs: 0,
    fat: 22,
    servings: 2,
    ingredientsWithNutrition: ingredients,
  });
  assert.equal(result.valid, true, `expected valid, got ${JSON.stringify(result.errors)}`);
});

test('the same recipe read as one serving is not valid', () => {
  const result = validateIngredientSums('Roast chicken', {
    estimatedCalories: 500,
    protein: 70,
    carbs: 0,
    fat: 22,
    servings: 1,
    ingredientsWithNutrition: ingredients,
  });
  assert.equal(result.valid, false, 'a 2x mismatch must still be caught');
});

test('omitting servings behaves exactly as before', () => {
  const withoutServings = validateIngredientSums('Meal', {
    estimatedCalories: 1000,
    protein: 140,
    carbs: 0,
    fat: 44,
    ingredientsWithNutrition: ingredients,
  });
  const withOne = validateIngredientSums('Meal', {
    estimatedCalories: 1000,
    protein: 140,
    carbs: 0,
    fat: 44,
    servings: 1,
    ingredientsWithNutrition: ingredients,
  });
  assert.deepEqual(withoutServings.errors, withOne.errors);
  assert.equal(withoutServings.valid, true);
});

test('a nonsense servings value falls back to 1 rather than dividing by zero', () => {
  const result = validateIngredientSums('Meal', {
    estimatedCalories: 1000,
    protein: 140,
    carbs: 0,
    fat: 44,
    servings: 0,
    ingredientsWithNutrition: ingredients,
  });
  assert.equal(result.valid, true, 'servings: 0 must not produce Infinity deviations');
});

test('a real arithmetic error is still caught at four servings', () => {
  const result = validateIngredientSums('Roast chicken', {
    estimatedCalories: 800,
    protein: 35,
    carbs: 0,
    fat: 11,
    servings: 4,
    ingredientsWithNutrition: ingredients,
  });
  // ingredients/4 = 250 cal, stated 800. That is a genuine mismatch.
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /[Cc]alorie/.test(e)));
});

test('missing ingredient data is a warning, not an error', () => {
  const result = validateIngredientSums('Meal', {
    estimatedCalories: 500,
    servings: 2,
    ingredientsWithNutrition: [],
  });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.length > 0);
});
