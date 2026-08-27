import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Two display bugs that shared one cause: a component read a shape the pipeline
 * never wrote, and nothing failed loudly enough to notice.
 *
 * 1. `getMealForSlot(day, mealType)` accepted two parameters. `getCurrentMeals`
 *    called it with three — passing 'primary' and then 'alternative' for the
 *    two choice cards — and JavaScript discarded the extra argument. Both calls
 *    returned whatever the toggle state said, so every slot rendered the same
 *    dish twice. It read as the generator producing a single option; in fact
 *    all 14 restaurant meals on production plan cmtb3l1j1 had distinct
 *    alternatives stored the whole time. TypeScript did flag it — 6 of the
 *    repo's 29 errors — but next.config has ignoreBuildErrors on, so it shipped.
 *
 * 2. The home page previewed restaurant names from `r.restaurant?.name`,
 *    `r.restaurantName` and `r.name`. A restaurantMeals entry is
 *    `{ day, mealType, primary, alternative }` with the name at
 *    `primary.restaurant` as a plain string, so all three paths returned
 *    undefined, filter(Boolean) emptied the list, and a week spanning six
 *    restaurants previewed as none.
 */
const MEAL_PLAN = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/MealPlanPage.tsx'),
  'utf8'
);
const DASHBOARD = readFileSync(
  path.join(process.cwd(), 'src/components/dashboard/DashboardHome.tsx'),
  'utf8'
);

test('getMealForSlot accepts the side its callers already pass', () => {
  const decl = MEAL_PLAN.slice(MEAL_PLAN.indexOf('const getMealForSlot = ('));
  const signature = decl.slice(0, decl.indexOf(') => {') + 1);
  assert.match(signature, /which\?: 'primary' \| 'alternative'/);
});

test('an explicit side wins over the toggle, or the two cards match again', () => {
  // The toggle branch reads component state; if it ran first, asking for
  // 'primary' and 'alternative' would still return the same object.
  const body = MEAL_PLAN.slice(MEAL_PLAN.indexOf('const getMealForSlot = ('));
  const fn = body.slice(0, body.indexOf('\n  };'));
  const explicitAt = fn.indexOf("which === 'alternative'");
  const toggleAt = fn.indexOf("selection === 'alternative'");
  assert.notEqual(explicitAt, -1, "getMealForSlot must honour an explicit 'alternative'");
  assert.notEqual(toggleAt, -1, 'the toggle behaviour must survive for callers that omit the side');
  assert.ok(explicitAt < toggleAt, 'the explicit side must be checked before the toggle');
});

test('both choice cards still ask for opposite sides', () => {
  // The bug was invisible because these calls always looked correct. If someone
  // drops the third argument to match an older signature, the cards silently
  // converge again.
  assert.match(MEAL_PLAN, /primary: getMealForSlot\(selectedDay, 'lunch', 'primary'\)/);
  assert.match(MEAL_PLAN, /alternative: getMealForSlot\(selectedDay, 'lunch', 'alternative'\)/);
});

test('the home page reads the restaurant name from where it is actually stored', () => {
  const effect = DASHBOARD.slice(DASHBOARD.indexOf('// Extract unique restaurant names'));
  const block = effect.slice(0, effect.indexOf('.filter(Boolean)'));
  assert.match(block, /r\.primary\?\.restaurant/);
});
