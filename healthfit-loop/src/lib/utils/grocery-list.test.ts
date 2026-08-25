import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackGroceryList, categorizeGroceryItem } from './grocery-list';

const meals = [
  {
    day: 'monday',
    mealType: 'dinner',
    primary: {
      name: 'Chicken and Rice',
      ingredientsWithNutrition: [
        { name: 'chicken breast', amount: '6 oz' },
        { name: 'brown rice', amount: '1 cup' },
        { name: 'spinach', amount: '2 cups' },
        { name: 'olive oil', amount: '1 tbsp' },
      ],
    },
  },
];

test('categorizes a protein', () => {
  assert.equal(categorizeGroceryItem('chicken breast'), 'proteins');
});

test('categorizes a vegetable', () => {
  assert.equal(categorizeGroceryItem('spinach'), 'vegetables');
});

test('categorizes a grain', () => {
  assert.equal(categorizeGroceryItem('brown rice'), 'grains');
});

test('an unrecognized item falls back to pantryStaples', () => {
  assert.equal(categorizeGroceryItem('xanthan gum'), 'pantryStaples');
});

test('the fallback list does not dump everything into pantryStaples', () => {
  const list = buildFallbackGroceryList(meals);
  assert.ok(list.proteins.length > 0, 'proteins should not be empty');
  assert.ok(list.vegetables.length > 0, 'vegetables should not be empty');
  assert.ok(list.grains.length > 0, 'grains should not be empty');
});

test('the fallback list carries a real quantity, not "varies"', () => {
  const list = buildFallbackGroceryList(meals);
  const all = Object.values(list).flat() as Array<{ quantity: string }>;
  assert.ok(all.length > 0);
  assert.ok(
    all.every(item => item.quantity !== 'varies'),
    'no item should carry the placeholder quantity'
  );
});

test('an item used twice reports the combined count', () => {
  const twice = [meals[0], { ...meals[0], day: 'tuesday' }];
  const list = buildFallbackGroceryList(twice);
  const chicken = (list.proteins as any[]).find(i => i.name.includes('chicken'));
  assert.ok(chicken);
  assert.equal(chicken.usedInMeals.length, 2);
});

test('an item field the category table has never seen does not throw', () => {
  assert.doesNotThrow(() => categorizeGroceryItem(''));
});
