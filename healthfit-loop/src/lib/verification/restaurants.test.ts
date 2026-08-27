import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeDishName, matchDish, verifyRestaurantMeal } from './restaurants';
import type { SearchItem } from './receipt';

const items: SearchItem[] = [
  { name: 'Grilled Chicken Shawarma Plate', price: 16.5, description: '', statedCalories: 720, sourceUrl: 'https://x.test/m' },
  { name: 'Falafel Wrap', price: null, description: '', statedCalories: null, sourceUrl: null },
];

const at = (over: Partial<any> = {}) => ({
  restaurant: 'Fanoos', dish: 'Chicken Shawarma', price: 16.5,
  estimatedCalories: 720, address: '123 Main St', ...over,
});

test('normalizeDishName strips case, punctuation and articles', () => {
  assert.equal(normalizeDishName('The Grilled  Chicken-Shawarma Plate!'), 'grilled chicken shawarma plate');
});

test('matchDish accepts a shortened name', () => {
  assert.equal(matchDish('Chicken Shawarma', items)?.name, 'Grilled Chicken Shawarma Plate');
});

test('matchDish rejects an invented dish', () => {
  assert.strictEqual(matchDish('Lobster Thermidor', items), null);
});

test('R1 contradicts a dish the menu never listed', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at({ dish: 'Lobster Thermidor' }), items, undefined);
  const r1 = vs.find(v => v.check === 'R1-dish-exists');
  assert.equal(r1?.status, 'contradicted');
});

test('R2 verifies a price that matches the published one', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at(), items, undefined);
  assert.equal(vs.find(v => v.check === 'R2-price-matches')?.status, 'verified');
});

test('R2 contradicts a drifted price and carries the real one as evidence', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at({ price: 18.95 }), items, undefined);
  const r2 = vs.find(v => v.check === 'R2-price-matches');
  assert.equal(r2?.status, 'contradicted');
  assert.match(r2!.evidence, /16\.5/);
});

test('R2 is unverified, not verified, when the menu published no price', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at({ dish: 'Falafel Wrap', price: 12 }), items, undefined);
  assert.equal(vs.find(v => v.check === 'R2-price-matches')?.status, 'unverified');
});

test('R3 tolerates calories within 15% and contradicts beyond it', () => {
  const near = verifyRestaurantMeal('w', at({ estimatedCalories: 790 }), items, undefined);
  assert.equal(near.find(v => v.check === 'R3-calories-match')?.status, 'verified');
  const far = verifyRestaurantMeal('w', at({ estimatedCalories: 1200 }), items, undefined);
  assert.equal(far.find(v => v.check === 'R3-calories-match')?.status, 'contradicted');
});

test('R4 always reports macros unverified', () => {
  const vs = verifyRestaurantMeal('w', at(), items, undefined);
  assert.equal(vs.find(v => v.check === 'R4-macros-estimated')?.status, 'unverified');
});

test('R7 contradicts an address that disagrees with Places', () => {
  const vs = verifyRestaurantMeal('w', at(), items, { rating: 4.6, userRatingsTotal: 10, distanceMiles: 0.8, address: '999 Other Ave', phone: null });
  assert.equal(vs.find(v => v.check === 'R7-restaurant-identity')?.status, 'contradicted');
});

test('R7 verifies an address that matches Places despite punctuation', () => {
  const vs = verifyRestaurantMeal('w', at({ address: '123 Main St.' }), items, { rating: 4.6, userRatingsTotal: 10, distanceMiles: 0.8, address: '123 Main St', phone: null });
  assert.equal(vs.find(v => v.check === 'R7-restaurant-identity')?.status, 'verified');
});

test('everything is unchecked when hop 1 did not parse', () => {
  const vs = verifyRestaurantMeal('w', at(), undefined, undefined);
  assert.ok(vs.length > 0);
  assert.ok(vs.filter(v => v.check.startsWith('R1') || v.check.startsWith('R2') || v.check.startsWith('R3'))
    .every(v => v.status === 'unchecked'));
});

test('an unmatched dish never leaves price or calories looking verified', () => {
  const vs = verifyRestaurantMeal('w', at({ dish: 'Lobster Thermidor' }), items, undefined);
  assert.equal(vs.find(v => v.check === 'R2-price-matches')?.status, 'unchecked');
  assert.equal(vs.find(v => v.check === 'R3-calories-match')?.status, 'unchecked');
});
