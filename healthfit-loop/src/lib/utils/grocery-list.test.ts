import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildFallbackGroceryList, categorizeGroceryItem, enhanceGroceryListWithUsage, flattenGroceryItemNames } from './grocery-list';

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

/**
 * Consolidation happens in generate-groceries now (2026-08-27, commit b7a4efb),
 * and it returns bare category arrays: name, quantity, uses. The route merges
 * them over the placeholder with `{...placeholderList, ...consolidated}`, which
 * replaces the six category arrays wholesale — so the usage fields the
 * placeholder carried are dropped with them.
 *
 * Nothing throws. The list renders. But `usedInMeals` is empty for every item,
 * `firstUseDay` is undefined, and GroceryListSection's "Next 3 days" tab filters
 * on exactly that field — so it showed an empty list to every user, and sorting
 * by day or perishability did nothing. Production plan cmtayzto2 had 0 of 40
 * items with a usage entry.
 *
 * These tests pin the enhancement against a consolidated-shaped list, where the
 * item names are the shopping names ("Chicken breast") rather than the recipe's
 * ingredient lines ("4 oz chicken breast").
 */
const consolidatedShape = {
  proteins: [{ name: 'Chicken breast', quantity: '1 lb' }],
  grains: [{ name: 'Brown rice', quantity: '2 cups' }],
  vegetables: [{ name: 'Spinach', quantity: '1 bag' }],
  pantryStaples: [{ name: 'Olive oil', quantity: '1 bottle' }],
  dairy: [],
  snacks: [],
};

test('a consolidated item learns which meals it is used in', () => {
  const enhanced = enhanceGroceryListWithUsage(consolidatedShape, meals);
  assert.deepEqual(enhanced.proteins[0].usedInMeals, [
    { day: 'monday', meal: 'dinner', dishName: 'Chicken and Rice' },
  ]);
});

test('a consolidated item learns the day it is first needed', () => {
  const enhanced = enhanceGroceryListWithUsage(consolidatedShape, meals);
  assert.equal(enhanced.grains[0].firstUseDay, 'monday');
  assert.equal(enhanced.vegetables[0].firstUseDay, 'monday');
});

test('a consolidated item gets a perishability so the filter has something to read', () => {
  const enhanced = enhanceGroceryListWithUsage(consolidatedShape, meals);
  assert.equal(enhanced.proteins[0].perishability, 'high');
  assert.equal(enhanced.grains[0].perishability, 'low');
});

test('enhancement keeps the fields consolidation produced', () => {
  const enhanced = enhanceGroceryListWithUsage(consolidatedShape, meals);
  assert.equal(enhanced.proteins[0].name, 'Chicken breast');
  assert.equal(enhanced.proteins[0].quantity, '1 lb');
});

test('the groceries route enhances the consolidated list before pricing it', () => {
  const src = readFileSync(
    path.join(process.cwd(), 'src/app/api/ai/meals/generate-groceries/route.ts'),
    'utf8'
  );
  // Consolidation replaces the placeholder's categories, so the usage fields
  // have to be put back on the merged list — not on the placeholder.
  assert.match(src, /enhanceGroceryListWithUsage/);
  assert.match(src, /const groceryList = enhanceGroceryListWithUsage\(/);
});

/**
 * MealPlanPage's handleRecipeClick read `groceryList?.items`. No such key has
 * ever existed — the persisted list is six category arrays plus pricing
 * metadata (production plan cmtayzto2 top level: dairy, grains, snacks, stores,
 * savings, location, proteins, vegetables, storeTotals, pantryStaples,
 * pricedItemCount, pricesUpdatedAt, recommendedStore, priceSearchSuccess,
 * requestedItemCount).
 *
 * Optional chaining made that silent: `existingGroceryItems` was always [], so
 * recipe-creation.ts always took its `: 'Provide a comprehensive grocery list'`
 * branch and the "Prioritize ingredients from the user's existing grocery list"
 * instruction never once reached the model.
 */
test('the flat name list reads the categories, which is where items actually live', () => {
  const names = flattenGroceryItemNames({
    proteins: [{ name: 'Chicken breast' }],
    grains: [{ name: 'Brown rice' }],
    vegetables: [{ item: 'Spinach' }],
    dairy: [], pantryStaples: [], snacks: [],
  });
  assert.deepEqual(names.sort(), ['Brown rice', 'Chicken breast', 'Spinach']);
});

test('pricing metadata sitting beside the categories is not mistaken for an item', () => {
  const names = flattenGroceryItemNames({
    proteins: [{ name: 'Chicken breast' }],
    stores: [{ name: 'Safeway' }],
    storeTotals: [{ name: 'Safeway', total: 40 }],
    recommendedStore: 'Safeway',
    pricedItemCount: 40,
  });
  assert.deepEqual(names, ['Chicken breast']);
});

test('a nameless row does not become an empty bullet in the prompt', () => {
  const names = flattenGroceryItemNames({
    proteins: [{ name: 'Chicken breast' }, { name: '' }, { quantity: '1 lb' }, null],
  });
  assert.deepEqual(names, ['Chicken breast']);
});

test('the same item in two categories is listed once', () => {
  const names = flattenGroceryItemNames({
    proteins: [{ name: 'Olive oil' }],
    pantryStaples: [{ name: 'olive oil' }],
  });
  assert.deepEqual(names, ['Olive oil']);
});

test('a missing or malformed list yields no items rather than throwing', () => {
  assert.deepEqual(flattenGroceryItemNames(undefined), []);
  assert.deepEqual(flattenGroceryItemNames(null), []);
  assert.deepEqual(flattenGroceryItemNames({ proteins: 'not an array' }), []);
});
