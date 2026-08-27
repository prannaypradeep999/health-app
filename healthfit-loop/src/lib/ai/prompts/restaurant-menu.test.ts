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
  assert.match(p, /grubhub\.com/);
});

test('the search prompt spends its effort on the platforms we actually display', () => {
  // Reversal of a previous rule, on evidence. The prompt used to list DoorDash
  // and Uber Eats FIRST and call all four "equally important" — but
  // DISPLAYED_PLATFORMS is ['grubhub','direct'], so those two are nulled out
  // before the user ever sees them. We were buying searches we then threw away,
  // which is the likeliest reason GrubHub coverage was thin: measured on the
  // 2026-08-27 plan, only 2 of 5 restaurants had a GrubHub link.
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /THE PRIORITY/);
  assert.match(p, /Do NOT run separate\s+searches for those two/i);
  assert.doesNotMatch(p, /equally important/i);
  // GrubHub must be named before the suppressed platforms are mentioned at all.
  assert.ok(
    p.indexOf('grubhub.com') < p.indexOf('doordash'),
    'GrubHub must come first in the search instruction'
  );
});

test('the search prompt rejects a city listing as the GrubHub link', () => {
  // Measured: asked for Piccolo Forno, which is genuinely not on GrubHub, the
  // model answered with /delivery/ca_san_francisco/piccolo-forno — a city index.
  // That renders as an Order button that lands the user nowhere useful.
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /\/delivery\/ URL/);
  assert.match(p, /restaurant-slug/);
});

test('the search prompt says why a guessed GrubHub URL cannot be caught later', () => {
  // grubhub.com answers 200 with a byte-identical SPA shell for every
  // /restaurant/ path, including fabricated ones, so the link prober cannot
  // detect a hallucinated URL. The prompt is the only place this is preventable.
  const p = createMenuSearchPrompt(restaurant, survey);
  assert.match(p, /200/);
  assert.match(p, /NEVER make up or guess URLs/i);
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
