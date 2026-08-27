import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The home phase is the slowest one (50.9s on plan cmtb04zon), so it almost
 * always writes `userContext` LAST — after the restaurant phase has already
 * put its results there.
 *
 * It used to rebuild the context by spreading `initialMealPlan`, which is the
 * *home* object, and then re-adding the restaurant-owned keys it happened to
 * know the names of: `restaurantMeals`, `verification`, `restrictionViolations`,
 * `generators`, `metadata`. `restaurantFacts` was never on that list, so every
 * completed plan lost it: production plans cmtayzto2 and cmtb04zon both stored
 * `restaurantFacts: undefined` despite `generators.restaurants === 'completed'`.
 *
 * That object is the only carrier for the Places-sourced rating, review count,
 * distance and phone, so all four silently stopped rendering on the restaurant
 * cards — `factsFor(name)` returned `{}` for every restaurant.
 *
 * The fix is to spread `existingContext` as the base. `initialMealPlan` still
 * wins for all ten keys it defines, so nothing the home phase owns changes;
 * keys that only the restaurant phase writes now survive instead of vanishing.
 * That is structural: the next field the restaurant phase adds is preserved
 * without anyone remembering to name it here.
 */
const SRC = readFileSync(
  path.join(process.cwd(), 'src/app/api/ai/meals/generate-home/route.ts'),
  'utf8'
);

test('the merged context starts from existingContext, not from the home object', () => {
  const write = SRC.slice(SRC.indexOf('userContext: {'));
  const body = write.slice(0, write.indexOf('status: newStatus'));
  const existingAt = body.indexOf('...existingContext');
  const initialAt = body.indexOf('...initialMealPlan');
  assert.notEqual(existingAt, -1, 'existingContext must be spread into the write');
  assert.notEqual(initialAt, -1, 'initialMealPlan must still be spread');
  assert.ok(
    existingAt < initialAt,
    'existingContext must come FIRST so initialMealPlan still wins the keys it owns'
  );
});

test('the restaurant-owned keys the home phase re-adds are still re-added', () => {
  // These carry a deliberate merge (not a plain overwrite) and must not be
  // dropped in favour of relying on the base spread.
  assert.match(SRC, /restaurantMeals: existingContext\.restaurantMeals \|\| \[\]/);
  assert.match(SRC, /\.\.\.\(existingContext\.verification \?\? \{\}\)/);
  assert.match(SRC, /\.\.\.existingContext\.generators/);
});
