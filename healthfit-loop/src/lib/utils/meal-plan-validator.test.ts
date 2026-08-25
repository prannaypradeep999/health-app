import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMealPlan } from './meal-plan-validator';

const option = (calories: number, protein: number, carbs: number, fat: number) => ({
  name: 'Test dish',
  description: '',
  estimatedCalories: calories,
  protein,
  carbs,
  fat,
  prepTime: '10 min',
  cookTime: '10 min',
  difficulty: 'easy',
  cuisine: 'any',
  ingredientsWithNutrition: [],
  ingredients: ['a'],
  instructions: ['b'],
  tags: [],
  source: 'test',
});

const targets = {
  monday: {
    breakfast: { calories: 500, protein: 30, carbs: 50, fat: 15 },
    dailyTotals: { calories: 500 },
  },
};

test('reads nutrition from the primary option, not the envelope', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(500, 30, 50, 15), alternative: option(500, 30, 50, 15) }];
  const result = validateMealPlan(meals, targets);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('a meal 30% off target is an error', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(650, 40, 65, 20), alternative: option(650, 40, 65, 20) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('off target')));
});

test('the day total is compared against dailyTotals', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(500, 30, 50, 15), alternative: option(500, 30, 50, 15) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.dailySummaries[0].totalCalories, 500);
  assert.equal(result.dailySummaries[0].targetCalories, 500);
});

test('an envelope-shaped meal still validates — the legacy path passes one', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', calories: 500, protein: 30, carbs: 50, fat: 15, recipeName: 'Legacy' }];
  const result = validateMealPlan(meals, targets);
  assert.deepEqual(result.errors, []);
});

test('a hollow meal is an error, not a pass', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: option(0, 0, 0, 0), alternative: option(0, 0, 0, 0) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.valid, false);
});

test('the meal name comes from the primary option', () => {
  const meals = [{ day: 'Monday', mealType: 'breakfast', primary: { ...option(500, 30, 50, 15), name: 'Shakshuka' }, alternative: option(500, 30, 50, 15) }];
  const result = validateMealPlan(meals, targets);
  assert.equal(result.dailySummaries[0].meals[0].name, 'Shakshuka');
});
