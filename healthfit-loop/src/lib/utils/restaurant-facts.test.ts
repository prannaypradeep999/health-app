import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRestaurantFacts } from './restaurant-facts';

const places = [
  { name: "Fanoos", rating: 4.6, userRatingsTotal: 820, address: '1000 Shattuck Ave', distanceMiles: 0.8 },
  { name: "Gregoire", rating: 0, userRatingsTotal: 0, address: '2109 Cedar St', distanceMiles: 1.4 },
] as any[];

test('keys are lowercased names', () => {
  const facts = buildRestaurantFacts(places);
  assert.ok(facts['fanoos']);
});

test('a real rating survives', () => {
  assert.equal(buildRestaurantFacts(places)['fanoos'].rating, 4.6);
});

test('a zero rating becomes null rather than being shown as 0', () => {
  assert.equal(buildRestaurantFacts(places)['gregoire'].rating, null);
});

test('distance is carried through', () => {
  assert.equal(buildRestaurantFacts(places)['fanoos'].distanceMiles, 0.8);
});

test('a missing distance becomes null, not a default', () => {
  const facts = buildRestaurantFacts([{ name: 'X', rating: 4.1, address: 'a' } as any]);
  assert.equal(facts['x'].distanceMiles, null);
});

test('an entry with no name is skipped rather than keyed on undefined', () => {
  const facts = buildRestaurantFacts([{ rating: 4.1 } as any]);
  assert.equal(Object.keys(facts).length, 0);
});
