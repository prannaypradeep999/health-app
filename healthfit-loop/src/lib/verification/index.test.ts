import { test } from 'node:test';
import assert from 'node:assert';
import { runVerification, verifyRestaurantPayload } from './index';
import { verdict } from './types';

test('a normal pass reports its verdicts', () => {
  const r = runVerification(() => [verdict('a', 'w', 'verified', '1', '1')], 'test');
  assert.equal(r.counts.verified, 1);
  assert.equal(r.verdicts.length, 1);
});

test('a throwing check yields unchecked and does not propagate', () => {
  const r = runVerification(() => { throw new Error('boom'); }, 'test');
  assert.equal(r.counts.unchecked, 1);
  assert.equal(r.counts.contradicted, 0);
  assert.match(r.verdicts[0].evidence, /boom/);
});

test('a throwing check never reports anything as verified', () => {
  const r = runVerification(() => { throw new Error('boom'); }, 'test');
  assert.equal(r.counts.verified, 0);
});

test('the report carries a timestamp', () => {
  assert.ok(!Number.isNaN(Date.parse(runVerification(() => [], 'test').ranAt)));
});

const items = [{ name: 'Chicken Shawarma Plate', price: 16.5, description: '', statedCalories: 720, sourceUrl: 'https://fanoossf.com/menu' }];
const evidence = { fanoos: { searchItems: items, sourceHosts: ['fanoossf.com', 'grubhub.com'] } };
// `phone` is part of RestaurantFacts but nothing in verification reads it;
// it is present here so the fixture stays a complete RestaurantFacts.
const facts = { fanoos: { rating: 4.6, userRatingsTotal: 10, distanceMiles: 0.8, address: '123 Main St', phone: null } };
const slot = (over: any = {}) => ({
  day: 'monday', mealType: 'lunch',
  primary: {
    restaurant: 'Fanoos', dish: 'Chicken Shawarma', price: 16.5, estimatedCalories: 720,
    address: '123 Main St', orderingLinks: { grubhub: 'https://www.grubhub.com/restaurant/fanoos/1' },
    ...over,
  },
  alternative: null,
});

test('a faithful payload yields no contradictions', () => {
  const vs = verifyRestaurantPayload([slot()], evidence, facts);
  assert.equal(vs.filter(v => v.status === 'contradicted').length, 0);
});

test('verdict targets name the slot, the option and the field', () => {
  const vs = verifyRestaurantPayload([slot()], evidence, facts);
  assert.ok(vs.some(v => v.target === 'monday.lunch.primary.dish'));
});

test('a null alternative is skipped rather than crashing', () => {
  assert.doesNotThrow(() => verifyRestaurantPayload([slot()], evidence, facts));
});

test('a restaurant with no evidence reports unchecked, never verified', () => {
  const vs = verifyRestaurantPayload([slot()], {}, facts);
  assert.equal(vs.filter(v => v.check === 'R1-dish-exists')[0].status, 'unchecked');
});

test('an invented dish surfaces as contradicted through the top-level entry point', () => {
  const vs = verifyRestaurantPayload([slot({ dish: 'Lobster Thermidor' })], evidence, facts);
  assert.ok(vs.some(v => v.check === 'R1-dish-exists' && v.status === 'contradicted'));
});
