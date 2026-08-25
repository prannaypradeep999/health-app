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
