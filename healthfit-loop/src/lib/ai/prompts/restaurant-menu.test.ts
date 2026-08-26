import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllergyBlock,
  buildDietaryRulesBlock,
  createMenuSearchPrompt,
  createMenuStructuringPrompt,
} from './restaurant-menu';

const restaurant = { name: 'Sakura Ramen House', address: '1 Post St', city: 'San Francisco', cuisine: 'japanese' };
const survey = {
  dietPrefs: ['halal'],
  foodAllergies: ['peanut', 'shellfish'],
  preferredCuisines: ['japanese'],
  goal: 'muscle_gain',
  streetAddress: '500 Market St',
  city: 'San Francisco',
  state: 'CA',
  zipCode: '94105',
  distancePreference: 'medium',
};

test('buildAllergyBlock is empty when the user reported no allergies', () => {
  assert.equal(buildAllergyBlock({ ...survey, foodAllergies: [] }), '');
  assert.equal(buildAllergyBlock({}), '');
});

test('buildAllergyBlock names every allergen', () => {
  const block = buildAllergyBlock(survey);
  assert.match(block, /peanut/i);
  assert.match(block, /shellfish/i);
});

test('the search prompt carries the allergies', () => {
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /peanut/i);
  assert.match(p, /shellfish/i);
});

test('the search prompt still carries what it always carried', () => {
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /Sakura Ramen House/);
  assert.match(p, /doordash\.com/);
  assert.match(p, /ubereats\.com/);
  assert.match(p, /grubhub\.com/);
});

test('the search prompt tells the model not to stop once it has found a platform', () => {
  // GrubHub is listed third, and a model that treats the list as ranked stops
  // after DoorDash and Uber Eats answer. The links are then permanently absent
  // for that restaurant, so the UI has nothing to show no matter how it renders.
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /Do NOT stop early/i);
  assert.match(p, /equally important/i);
});

test('the search prompt no longer asks the model to re-check distance', () => {
  // Distance is decided on coordinates before this prompt runs. Under a min(1)
  // schema, a model that "skips extraction" because it thinks the restaurant is
  // too far produces a parse failure rather than a graceful skip.
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.doesNotMatch(p, /miles/);
  assert.doesNotMatch(p, /skip menu extraction/i);
});

test('the search prompt asks for null on a missing platform, which strict mode requires', () => {
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /Set a platform to null/);
  assert.doesNotMatch(p, /DO NOT include that platform/);
});

test('the structuring prompt carries the allergies and the diet rule', () => {
  const p = createMenuStructuringPrompt({
    content: 'Chicken katsu $14',
    citations: ['https://example.com/menu'],
    restaurant,
    surveyData: survey,
  });
  assert.match(p, /peanut/i);
  assert.match(p, /HALAL/);
  assert.match(p, /Chicken katsu \$14/, 'the Perplexity content must be interpolated');
  assert.match(p, /https:\/\/example\.com\/menu/, 'citations must be interpolated');
});

test('an unknown diet still produces a hard exclusion rather than silence', () => {
  const p = createMenuStructuringPrompt({
    content: '', citations: [], restaurant,
    surveyData: { dietPrefs: ['low-FODMAP'] },
  });
  assert.match(p, /LOW-FODMAP/);
});

test('allergy instructions outrank preferences in wording', () => {
  const block = buildAllergyBlock(survey);
  assert.match(block, /NEVER|MUST NOT|absolutely/i);
});
