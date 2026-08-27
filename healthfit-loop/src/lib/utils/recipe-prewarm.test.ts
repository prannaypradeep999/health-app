import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectPrewarmTargets } from './recipe-prewarm';

const homeMeal = (name: string, extra: Record<string, unknown> = {}) => ({
  source: 'home',
  name,
  description: `${name} description`,
  calories: 600,
  protein: 40,
  carbs: 55,
  fat: 20,
  ...extra
});

const restaurantMeal = (dish: string) => ({
  source: 'restaurant',
  dish,
  restaurant: 'Somewhere',
  calories: 700
});

const plan = (days: unknown[]) => ({ days });

test('returns nothing when there is no plan to read', () => {
  assert.deepEqual(collectPrewarmTargets(null), []);
  assert.deepEqual(collectPrewarmTargets(undefined), []);
  assert.deepEqual(collectPrewarmTargets({}), []);
  assert.deepEqual(collectPrewarmTargets({ days: 'monday' }), []);
});

test('collects a home meal with the fields the recipe route expects', () => {
  const targets = collectPrewarmTargets(
    plan([{ day: 'monday', meals: { breakfast: { primary: homeMeal('Tofu Scramble') } } }])
  );

  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0], {
    dishName: 'Tofu Scramble',
    description: 'Tofu Scramble description',
    mealType: 'breakfast',
    nutritionTargets: { calories: 600, protein: 40, carbs: 55, fat: 20 }
  });
});

test('skips restaurant meals, which never call the recipe route', () => {
  const targets = collectPrewarmTargets(
    plan([
      {
        day: 'monday',
        meals: {
          lunch: { primary: restaurantMeal('Bento Box') },
          dinner: { primary: homeMeal('Lentil Curry') }
        }
      }
    ])
  );

  assert.deepEqual(targets.map((t) => t.dishName), ['Lentil Curry']);
});

test('a meal carrying a restaurant is treated as one even without source', () => {
  const targets = collectPrewarmTargets(
    plan([
      {
        day: 'monday',
        meals: { lunch: { primary: { dish: 'Pad Thai', restaurant: 'Thai House', calories: 800 } } }
      }
    ])
  );

  assert.deepEqual(targets, []);
});

test('orders every primary ahead of every alternative', () => {
  const targets = collectPrewarmTargets(
    plan([
      {
        day: 'monday',
        meals: {
          breakfast: { primary: homeMeal('P1'), alternative: homeMeal('A1') },
          dinner: { primary: homeMeal('P2'), alternative: homeMeal('A2') }
        }
      },
      {
        day: 'tuesday',
        meals: { breakfast: { primary: homeMeal('P3'), alternative: homeMeal('A3') } }
      }
    ])
  );

  assert.deepEqual(targets.map((t) => t.dishName), ['P1', 'P2', 'P3', 'A1', 'A2', 'A3']);
});

test('dedupes on the lowercased name, matching recipeCacheKey', () => {
  const targets = collectPrewarmTargets(
    plan([
      { day: 'monday', meals: { dinner: { primary: homeMeal('Chili Bowl') } } },
      { day: 'friday', meals: { dinner: { primary: homeMeal('  chili bowl  ') } } }
    ])
  );

  assert.deepEqual(targets.map((t) => t.dishName), ['Chili Bowl']);
});

test('an alternative duplicating a primary does not queue a second call', () => {
  const targets = collectPrewarmTargets(
    plan([
      {
        day: 'monday',
        meals: { dinner: { primary: homeMeal('Chili Bowl'), alternative: homeMeal('chili bowl') } }
      }
    ])
  );

  assert.deepEqual(targets.map((t) => t.dishName), ['Chili Bowl']);
});

test('drops meals with no usable dish name', () => {
  const targets = collectPrewarmTargets(
    plan([
      {
        day: 'monday',
        meals: {
          breakfast: { primary: { source: 'home', name: '   ', calories: 400 } },
          lunch: { primary: { source: 'home', calories: 400 } },
          dinner: { primary: homeMeal('Real Dish') }
        }
      }
    ])
  );

  assert.deepEqual(targets.map((t) => t.dishName), ['Real Dish']);
});

test('missing or negative macros become zero rather than reaching the prompt', () => {
  const targets = collectPrewarmTargets(
    plan([
      {
        day: 'monday',
        meals: {
          breakfast: {
            primary: homeMeal('Odd Dish', { calories: null, protein: -5, carbs: undefined, fat: 'x' })
          }
        }
      }
    ])
  );

  assert.deepEqual(targets[0].nutritionTargets, { calories: 0, protein: 0, carbs: 0, fat: 0 });
});

test('omits description when the meal has none', () => {
  const targets = collectPrewarmTargets(
    plan([{ day: 'monday', meals: { breakfast: { primary: homeMeal('Plain', { description: '' }) } } }])
  );

  assert.equal(targets[0].description, undefined);
});

test('survives malformed days and slots without throwing', () => {
  const targets = collectPrewarmTargets(
    plan([
      null,
      'monday',
      { day: 'tuesday' },
      { day: 'wednesday', meals: null },
      { day: 'thursday', meals: { dinner: null } },
      { day: 'friday', meals: { dinner: { primary: homeMeal('Survivor') } } }
    ])
  );

  assert.deepEqual(targets.map((t) => t.dishName), ['Survivor']);
});
