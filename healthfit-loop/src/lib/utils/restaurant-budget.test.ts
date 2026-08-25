import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustTargetsForRestaurantBudget } from './restaurant-budget';

function targets() {
  return {
    dailyCalories: 2000,
    macros: { protein: 150, carbs: 200, fat: 67 },
    days: {
      monday: {
        breakfast: { calories: 500, protein: 38, carbs: 50, fat: 17, source: 'home' },
        lunch: { calories: 700, protein: 52, carbs: 70, fat: 23, source: 'restaurant' },
        dinner: { calories: 800, protein: 60, carbs: 80, fat: 27, source: 'restaurant' },
      },
    },
  };
}

test('two restaurant meals in one day compose instead of clobbering', () => {
  const result = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'lunch', calories: 700 },
    { day: 'monday', mealType: 'dinner', calories: 900 },
  ]);
  // 2000 - 700 - 900 = 400 left for the single home meal
  assert.equal(result.days.monday.breakfast.calories, 400);
});

test('order of restaurant meals does not change the result', () => {
  const forward = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'lunch', calories: 700 },
    { day: 'monday', mealType: 'dinner', calories: 900 },
  ]);
  const reverse = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'dinner', calories: 900 },
    { day: 'monday', mealType: 'lunch', calories: 700 },
  ]);
  assert.equal(forward.days.monday.breakfast.calories, reverse.days.monday.breakfast.calories);
});

test('a single restaurant meal leaves two home meals split 40/60', () => {
  const t = targets();
  t.days.monday.dinner.source = 'home';
  const result = adjustTargetsForRestaurantBudget(t, [
    { day: 'monday', mealType: 'lunch', calories: 700 },
  ]);
  const b = result.days.monday.breakfast.calories;
  const d = result.days.monday.dinner.calories;
  assert.equal(b + d, 1300);
  assert.ok(d > b, 'dinner should take the larger share');
});

test('does not mutate its input', () => {
  const input = targets();
  adjustTargetsForRestaurantBudget(input, [
    { day: 'monday', mealType: 'lunch', calories: 700 },
  ]);
  assert.equal(input.days.monday.breakfast.calories, 500);
});

test('an unknown day is ignored rather than throwing', () => {
  const result = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'caturday', mealType: 'lunch', calories: 700 },
  ]);
  assert.equal(result.days.monday.breakfast.calories, 500);
});

test('restaurant calories exceeding the day budget floor the home meal at zero', () => {
  const result = adjustTargetsForRestaurantBudget(targets(), [
    { day: 'monday', mealType: 'lunch', calories: 1400 },
    { day: 'monday', mealType: 'dinner', calories: 1400 },
  ]);
  assert.equal(result.days.monday.breakfast.calories, 0);
});
