import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `userContext.days` holds only the home meals. Production plan cmtayzto2 has
 * seven day slots, all seven `source: 'home'`, while the week's seven restaurant
 * meals live in `userContext.restaurantMeals` and are merged into those days at
 * request time.
 *
 * The merge builds `formattedMeal` from an explicit field list, and that list
 * set `source` on `primary` but not on the envelope. The counting loop below it
 * reads the envelope — `meal.source === 'restaurant'` — so every merged
 * restaurant meal fell into the `!== 'restaurant'` branch and was counted as
 * home. The route reported 14 home meals and 0 restaurant meals for a week that
 * had seven of each, and DashboardHome renders those counts.
 *
 * Two things are pinned here, because either alone would have prevented it:
 * the merged meal carries `source` at the level the counter reads, and the
 * counter tolerates a meal that only says so on `primary`.
 */
const SRC = readFileSync(
  path.join(process.cwd(), 'src/app/api/ai/meals/current/route.ts'),
  'utf8'
);

test('a merged restaurant meal declares its source on the envelope', () => {
  // The envelope object, not the `primary:` block nested inside it.
  const formatted = SRC.slice(SRC.indexOf('const formattedMeal = {'));
  const envelope = formatted.slice(0, formatted.indexOf('primary: {'));
  assert.match(envelope, /source: 'restaurant'/);
});

test('the counter still branches on source, so home and restaurant stay apart', () => {
  // Anything that is not a restaurant meal falls to the home branch, which is
  // why the restaurant side has to be the one that declares itself.
  assert.match(SRC, /if \(source === 'restaurant'\) \{\s*restaurantMealCount\+\+;/);
  assert.match(SRC, /\} else \{\s*homeMealCount\+\+;/);
});

test('the counter falls back to primary.source rather than miscounting', () => {
  assert.match(SRC, /const source = meal\?\.source \?\? meal\?\.primary\?\.source;/);
});

test('the merged meal carries the Places phone through to the client', () => {
  // Same explicit-field-list trap: joinRestaurantDetails and buildRestaurantFacts
  // both carry `phone` now, and a list here that omits it drops it again.
  assert.match(SRC, /phone: restaurantMeal\.primary\?\.phone/);
});
