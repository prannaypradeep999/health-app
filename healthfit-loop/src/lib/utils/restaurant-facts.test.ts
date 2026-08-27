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

/**
 * Phone belongs here for the reason the module header gives about rating: it is
 * a Places fact, so it is carried beside the meal rather than on it, where a
 * model would be invited to invent one.
 *
 * The Call button in RestaurantListSection is gated on it, and the card object
 * MealPlanPage assembles reads its Places fields through `factsFor(name)`. Until
 * this, nothing populated it — production plan cmtayzto2 had 0 of 14 options
 * with a phone, and no user has ever seen the button.
 */
test('the phone Places returned is carried as a fact', () => {
  const facts = buildRestaurantFacts([
    { name: 'Fanoos', phoneNumber: '(510) 555-0143' },
  ] as any[]);
  assert.equal(facts['fanoos'].phone, '(510) 555-0143');
});

test('no phone is null, so the Call button stays hidden rather than dialling nothing', () => {
  assert.equal(buildRestaurantFacts(places)['fanoos'].phone, null);
});

test('an empty phone string is not a number to call', () => {
  const facts = buildRestaurantFacts([{ name: 'Fanoos', phoneNumber: '  ' }] as any[]);
  assert.equal(facts['fanoos'].phone, null);
});
