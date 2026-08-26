import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRestrictions, normalizeRestriction, containsTerm } from './restriction-validator';

const meal = (name: string, ingredients: string[] = []) => ({
  name, ingredients, day: 'monday', mealType: 'dinner',
});

test('normalizeRestriction folds the aliases the survey actually stores', () => {
  assert.equal(normalizeRestriction('Gluten-Free'), 'gluten');
  assert.equal(normalizeRestriction('gluten free'), 'gluten');
  assert.equal(normalizeRestriction('coeliac'), 'gluten');
  assert.equal(normalizeRestriction('celiac'), 'gluten');
  assert.equal(normalizeRestriction('Dairy-Free'), 'dairy');
  assert.equal(normalizeRestriction('lactose intolerant'), 'dairy');
  assert.equal(normalizeRestriction('tree nuts'), 'nuts');
  assert.equal(normalizeRestriction('peanut'), 'nuts');
  assert.equal(normalizeRestriction('  VEGAN '), 'vegan');
});

test('normalizeRestriction leaves an unknown value alone rather than dropping it', () => {
  assert.equal(normalizeRestriction('low-FODMAP'), 'low-fodmap');
});

test('containsTerm respects word boundaries', () => {
  assert.equal(containsTerm('grilled eggplant parmesan', 'egg'), false);
  assert.equal(containsTerm('scrambled egg on toast', 'egg'), true);
  assert.equal(containsTerm('shellfish linguine', 'fish'), false);
  assert.equal(containsTerm('fish tacos', 'fish'), true);
  assert.equal(containsTerm('hamburger', 'ham'), false);
  assert.equal(containsTerm('ham and cheese', 'ham'), true);
});

test('containsTerm tolerates plurals', () => {
  assert.equal(containsTerm('roasted almonds', 'almond'), true);
  assert.equal(containsTerm('two poached eggs', 'eggs'), true);
  assert.equal(containsTerm('sweet potatoes', 'potato'), true);
});

test('halal flags pork, which the old table let through', () => {
  const r = validateRestrictions([meal('Pork belly bao')], { dietPrefs: ['halal'] });
  assert.equal(r.valid, false);
  assert.equal(r.violations[0].restriction, 'halal');
  assert.equal(r.violations[0].severity, 'error');
});

test('kosher flags shellfish', () => {
  const r = validateRestrictions([meal('Shrimp scampi')], { dietPrefs: ['kosher'] });
  assert.equal(r.valid, false);
});

test('gluten-free flags a pasta dish through its alias', () => {
  const r = validateRestrictions([meal('Chicken pasta bake')], { dietPrefs: ['gluten-free'] });
  assert.equal(r.valid, false);
  assert.ok(r.violations.some(v => v.ingredient === 'pasta'));
});

test('pescatarian allows fish and forbids chicken', () => {
  const ok = validateRestrictions([meal('Grilled salmon')], { dietPrefs: ['pescatarian'] });
  assert.equal(ok.valid, true);
  const bad = validateRestrictions([meal('Grilled chicken')], { dietPrefs: ['pescatarian'] });
  assert.equal(bad.valid, false);
});

test('keto is a preference, not a safety rule — it warns rather than erroring', () => {
  const r = validateRestrictions([meal('Rice bowl')], { dietPrefs: ['keto'] });
  assert.equal(r.valid, true, 'a keto miss must not invalidate the plan');
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].severity, 'warning');
});

test('an allergy is always an error and is matched through its alias table', () => {
  const r = validateRestrictions([meal('Pad thai', ['crushed peanuts'])], { foodAllergies: ['peanut'] });
  assert.equal(r.valid, false);
  assert.ok(r.violations.every(v => v.severity === 'error'));
});

test('a vegan plan of vegetables is clean — no false positive from eggplant', () => {
  const r = validateRestrictions([meal('Eggplant caponata', ['eggplant', 'olive oil'])], { dietPrefs: ['vegan'] });
  assert.deepEqual(r.violations, []);
  assert.equal(r.valid, true);
});

test('unknown restrictions register no terms and do not crash', () => {
  const r = validateRestrictions([meal('Anything')], { dietPrefs: ['low-FODMAP'] });
  assert.equal(r.valid, true);
});

/**
 * A restaurant meal is nothing like a home meal here.
 *
 * A home recipe arrives with an `ingredients` array, and that array is where
 * the forbidden foods actually appear. A restaurant option has no ingredients
 * field at all — `RestaurantMealObject` does not define one — so everything we
 * know about what is in the dish is in its `description`.
 *
 * The search text was built as `meal.name || meal.dish || meal.description`.
 * Those are `||`, not concatenation, and the restaurant route sets `name`
 * before calling. `name` is therefore always truthy and the description was
 * never once read. "Bento Box" described as pork belly passed a vegetarian
 * check.
 */
const restaurantOption = (dish: string, description: string) => ({
  name: dish, dish, description, day: 'tuesday', mealType: 'lunch',
});

test('a restaurant dish is checked on its description, not just its name', () => {
  const r = validateRestrictions(
    [restaurantOption('Bento Box', 'Braised pork belly over rice with pickles')],
    { dietPrefs: ['vegetarian'] }
  );
  assert.ok(
    r.violations.some(v => v.ingredient === 'pork'),
    'the description was not scanned'
  );
});

test('a description hit warns rather than invalidating the plan', () => {
  // Deliberate. The description is prose a model wrote, and a word-anchored
  // matcher cannot tell "pork belly" from "no pork". Over-flagging fails safe
  // only while the flag is advisory; making it an error would let the model's
  // own phrasing delete a user's week.
  const r = validateRestrictions(
    [restaurantOption('Bento Box', 'Braised pork belly over rice')],
    { dietPrefs: ['vegetarian'] }
  );
  assert.equal(r.valid, true);
  assert.ok(r.violations.every(v => v.severity === 'warning'));
});

test('the name still errors at full severity — the description pass adds, never downgrades', () => {
  const r = validateRestrictions(
    [restaurantOption('Pork Belly Bao', 'Steamed buns')],
    { dietPrefs: ['vegetarian'] }
  );
  assert.equal(r.valid, false);
  assert.ok(r.violations.some(v => v.ingredient === 'pork' && v.severity === 'error'));
});

test('a term in both the name and the description is reported once, at the higher severity', () => {
  const r = validateRestrictions(
    [restaurantOption('Pork Bao', 'Pork shoulder, steamed')],
    { dietPrefs: ['vegetarian'] }
  );
  const pork = r.violations.filter(v => v.ingredient === 'pork');
  assert.equal(pork.length, 1);
  assert.equal(pork[0].severity, 'error');
});

test('a meal whose only text is its description keeps erroring at full severity', () => {
  // The pre-existing fallback: with no name and no dish, `description` WAS the
  // name. That path must not be quietly demoted to a warning by the new pass.
  const r = validateRestrictions(
    [{ description: 'Pork belly rice bowl', day: 'monday', mealType: 'dinner' }],
    { dietPrefs: ['vegetarian'] }
  );
  assert.equal(r.valid, false);
  assert.ok(r.violations.some(v => v.ingredient === 'pork' && v.severity === 'error'));
});

test('an allergy in a restaurant description is still only a warning, and is labelled as one', () => {
  // Uncomfortable but correct. An allergy in a *name* stays an error; in prose
  // we cannot distinguish "contains peanuts" from "peanut-free". The violation
  // is surfaced to the user either way — the severity governs whether the plan
  // is thrown away, and a thrown-away plan helps nobody eat.
  const r = validateRestrictions(
    [restaurantOption('Pad Thai', 'Rice noodles with crushed peanuts')],
    { foodAllergies: ['peanut'] }
  );
  assert.ok(r.violations.some(v => v.ingredient === 'peanut'));
  assert.equal(r.valid, true);
});

test('a home recipe is unaffected — ingredients still carry their declared severity', () => {
  const r = validateRestrictions(
    [{ name: 'Pad thai', ingredients: ['crushed peanuts'], day: 'monday', mealType: 'dinner' }],
    { foodAllergies: ['peanut'] }
  );
  assert.equal(r.valid, false);
  assert.ok(r.violations.every(v => v.severity === 'error'));
});
