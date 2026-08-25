import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rulesFor, checkText } from './adherence';

const vegetarian = { dietPrefs: ['Vegetarian'], foodAllergies: [], strictExclusions: null };
const halalCoeliac = {
  dietPrefs: ['Halal', 'Gluten-Free'],
  foodAllergies: ['shellfish', 'tree nuts'],
  strictExclusions: { meats: ['pork'], other: ['alcohol'] },
};

test('rulesFor derives a rule per declared restriction', () => {
  const labels = rulesFor(vegetarian).map(r => r.label);
  assert.deepEqual(labels, ['Vegetarian']);
});

test('rulesFor covers restrictions beyond vegetarian and vegan', () => {
  // RESTRICTION_MAPPINGS in production covers only vegetarian and vegan; the
  // harness must be able to see the gap that leaves.
  const labels = rulesFor(halalCoeliac).map(r => r.label);
  assert.ok(labels.includes('Halal'));
  assert.ok(labels.includes('Gluten-Free'));
  assert.ok(labels.includes('allergy:shellfish'));
  assert.ok(labels.includes('allergy:tree nuts'));
  assert.ok(labels.includes('exclusion:pork'));
  assert.ok(labels.includes('exclusion:alcohol'));
});

test('checkText is silent on compliant text', () => {
  assert.deepEqual(checkText('monday.dinner', 'Red lentil dal with spinach and brown rice', rulesFor(vegetarian)), []);
});

test('checkText catches a meat dish under a vegetarian rule', () => {
  const out = checkText('monday.dinner', 'Grilled chicken thighs with rice', rulesFor(vegetarian));
  assert.equal(out.length, 1);
  assert.equal(out[0].family, 'ADHERENCE');
  assert.equal(out[0].severity, 'error');
  assert.equal(out[0].code, 'restriction-violation');
  assert.match(out[0].message, /Vegetarian/);
  assert.match(out[0].message, /chicken/i);
});

test('checkText catches an allergen', () => {
  const out = checkText('monday.dinner', 'Shrimp and walnut salad', rulesFor(halalCoeliac));
  const labels = out.map(f => f.message);
  assert.ok(labels.some(m => /allergy:shellfish/.test(m)), 'shrimp is shellfish');
  assert.ok(labels.some(m => /allergy:tree nuts/.test(m)), 'walnut is a tree nut');
});

test('checkText catches gluten under Gluten-Free', () => {
  const out = checkText('monday.lunch', 'Whole wheat pasta with tomato sauce', rulesFor(halalCoeliac));
  assert.ok(out.some(f => /Gluten-Free/.test(f.message)));
});

test('checkText catches a strict exclusion', () => {
  const out = checkText('monday.dinner', 'Slow-braised pork shoulder', rulesFor(halalCoeliac));
  assert.ok(out.some(f => /exclusion:pork/.test(f.message)));
});

test('checkText matches on word boundaries, not substrings', () => {
  // "hammock" contains "ham"; "grape" contains no meat. Neither is a violation.
  const out = checkText('x', 'Grape and hammock themed picnic spread', rulesFor(halalCoeliac));
  assert.deepEqual(out, [], 'substring matching would fire on ham inside hammock');
});

test('checkText is case-insensitive', () => {
  assert.equal(checkText('x', 'GRILLED CHICKEN', rulesFor(vegetarian)).length, 1);
});

test('a user with no restrictions produces no rules and no findings', () => {
  const none = { dietPrefs: [], foodAllergies: [], strictExclusions: null };
  assert.deepEqual(rulesFor(none), []);
  assert.deepEqual(checkText('x', 'Grilled chicken with pork belly and shrimp', rulesFor(none)), []);
});
