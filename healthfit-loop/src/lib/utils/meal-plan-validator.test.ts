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

/**
 * The fixture above hides the case that actually occurs: it gives the day a
 * `dailyTotals` equal to its one slot, so summing the slots and reading
 * `dailyTotals` are the same number and the difference between them is
 * invisible.
 *
 * In production they are never the same. This validator is called on the HOME
 * meals only, while `dailyTotals` covers the whole day including the meals
 * eaten out. On the 2026-08-27 run the user had a restaurant lunch and dinner
 * every day — 74% of the day's calories — so home meals were breakfast and
 * snacks, and the check read:
 *
 *     ERROR: friday daily total: 75% off target (820 vs 3254 cal)
 *
 * on five of seven days. Every individual meal passed its own slot target; the
 * plan was correct and the validator was wrong. That is the expensive kind of
 * false alarm, because a validator that cries wolf on a correct plan is one
 * nobody reads when it is right.
 *
 * The day total must be compared against the targets for the slots it was
 * actually given.
 */
const partialDayTargets = {
  monday: {
    breakfast: { calories: 700, protein: 40, carbs: 70, fat: 20 },
    lunch: { calories: 1139, protein: 49, carbs: 160, fat: 32 },
    dinner: { calories: 1302, protein: 56, carbs: 185, fat: 36 },
    snack: { calories: 113, protein: 8, carbs: 14, fat: 3 },
    dailyTotals: { calories: 3254 },
  },
};

test('a day whose lunch and dinner are eaten out is not scored against the whole day', () => {
  const meals = [
    { day: 'Monday', mealType: 'breakfast', primary: option(700, 40, 70, 20), alternative: option(700, 40, 70, 20) },
  ];
  const result = validateMealPlan(meals, partialDayTargets);
  assert.deepEqual(
    result.errors,
    [],
    'home meals were scored against a daily total that includes the restaurant meals'
  );
  assert.equal(result.dailySummaries[0].targetCalories, 700);
});

test('a day that really is short still reports it', () => {
  // The guard above must not be a blanket amnesty: if the slots supplied do not
  // add up to what those slots were supposed to be, that is still an error.
  const meals = [
    { day: 'Monday', mealType: 'breakfast', primary: option(400, 20, 40, 12), alternative: option(400, 20, 40, 12) },
  ];
  const result = validateMealPlan(meals, partialDayTargets);
  assert.ok(
    result.errors.some(e => e.includes('daily total')),
    'a breakfast 43% under its own target did not raise a daily-total error'
  );
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
