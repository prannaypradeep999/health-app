import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRestaurantName,
  findRestaurantRecord,
  toOrderingLinks,
  joinRestaurantDetails,
  joinRestaurantMealSlots,
  RestaurantMealChoice,
  RestaurantRecord,
} from './restaurant-join';

/** A record shaped like an entry of `restaurantMenuData`. */
function record(over: Partial<RestaurantRecord> = {}): RestaurantRecord {
  return {
    name: 'EJ BBQ & Sushi',
    address: '168 W 25th St, New York, NY 10001, USA',
    cuisine: 'Japanese',
    orderingLinks: {
      direct: 'https://ejbbqsushi.com/',
      ubereats: 'https://postmates.com/store/ej-bbq-&-sushi/FPPBE4WET1aWozeKRyf1vg',
    },
    ...over,
  };
}

/** What the model returns now: judgement only, no transcription. */
function choice(over: Partial<RestaurantMealChoice> = {}): RestaurantMealChoice {
  return {
    restaurant: 'EJ BBQ & Sushi',
    dish: 'California Roll',
    description: 'A classic sushi roll with crab, avocado, and cucumber.',
    price: 8.95,
    estimatedCalories: 300,
    protein: 6,
    carbs: 38,
    fat: 7,
    tags: ['lunch', 'japanese'],
    ...over,
  };
}

test('the joined meal has exactly the fields the dashboard already reads', () => {
  const { meal } = joinRestaurantDetails(choice(), [record()]);
  assert.deepEqual(
    Object.keys(meal).sort(),
    [
      'address', 'carbs', 'cuisine', 'description', 'dish', 'estimatedCalories',
      'fat', 'orderingLinks', 'price', 'protein', 'restaurant', 'source', 'tags',
    ]
  );
});

test('source is a constant, not something the model can mistype', () => {
  // Three dashboard components branch on `meal.source === 'restaurant'`. A
  // model typo there would render a restaurant meal as a home recipe.
  const { meal } = joinRestaurantDetails(choice(), [record()]);
  assert.equal(meal.source, 'restaurant');
});

test('address, cuisine and links come from the record, not the choice', () => {
  const { meal, matched } = joinRestaurantDetails(choice(), [record()]);
  assert.ok(matched);
  assert.equal(meal.address, '168 W 25th St, New York, NY 10001, USA');
  assert.equal(meal.cuisine, 'Japanese');
  assert.equal(meal.orderingLinks.direct, 'https://ejbbqsushi.com/');
});

test('a platform the record has no link for is null, not absent and not "null"', () => {
  // The string "null" is truthy and reached the UI as an order button pointing
  // nowhere. All four keys are always present so the card can test them.
  const { meal } = joinRestaurantDetails(choice(), [
    record({ orderingLinks: { direct: 'https://ejbbqsushi.com/', grubhub: 'null', doordash: '' } }),
  ]);
  assert.equal(meal.orderingLinks.grubhub, null);
  assert.equal(meal.orderingLinks.doordash, null);
  assert.equal(meal.orderingLinks.ubereats, null);
  assert.ok('ubereats' in meal.orderingLinks);
});

test('a non-http value is not a link', () => {
  const links = toOrderingLinks({ direct: 'ejbbqsushi.com', doordash: 'javascript:alert(1)' });
  assert.equal(links.direct, null);
  assert.equal(links.doordash, null);
});

test('surrounding whitespace does not disqualify a link', () => {
  assert.equal(toOrderingLinks({ direct: '  https://a.example/  ' }).direct, 'https://a.example/');
});

test('ampersand spelled out still matches the same restaurant', () => {
  // Places writes "EJ BBQ & Sushi"; a model repeating it sometimes writes "and".
  const found = findRestaurantRecord('EJ BBQ and Sushi', [record()]);
  assert.equal(found?.name, 'EJ BBQ & Sushi');
});

test('case and punctuation differences still match', () => {
  assert.ok(findRestaurantRecord("joe's pizza", [record({ name: 'Joe’s Pizza' })]));
  assert.ok(findRestaurantRecord('JOE S PIZZA', [record({ name: "Joe's Pizza" })]));
});

test('a shortened name matches the full record', () => {
  const found = findRestaurantRecord('Fanoos', [record({ name: 'Fanoos Persian Grill' })]);
  assert.equal(found?.name, 'Fanoos Persian Grill');
});

test('a short token cannot match everything by containment', () => {
  // "Ida" is inside "Idaho Grill", but three characters is too little evidence.
  assert.equal(findRestaurantRecord('Ida', [record({ name: 'Idaho Grill' })]), null);
});

test('the record spelling wins so the card and the link name one restaurant', () => {
  const { meal } = joinRestaurantDetails(choice({ restaurant: 'EJ BBQ and Sushi' }), [record()]);
  assert.equal(meal.restaurant, 'EJ BBQ & Sushi');
});

test('an invented restaurant yields a meal with no address and no buttons', () => {
  // Dropping the slot would leave a hole in the week with nothing explaining
  // it. An unorderable card is at least legible as unorderable.
  const { meal, matched } = joinRestaurantDetails(choice({ restaurant: 'Nowhere Cafe' }), [record()]);
  assert.equal(matched, false);
  assert.equal(meal.restaurant, 'Nowhere Cafe');
  assert.equal(meal.address, '');
  assert.deepEqual(meal.orderingLinks, { doordash: null, ubereats: null, grubhub: null, direct: null });
  assert.equal(meal.dish, 'California Roll');
});

test('a record missing an address does not produce the string "undefined"', () => {
  const { meal } = joinRestaurantDetails(choice(), [record({ address: null, cuisine: undefined })]);
  assert.equal(meal.address, '');
  assert.equal(meal.cuisine, '');
});

test('the nutrition and price the model chose are passed through untouched', () => {
  const c = choice({ price: 42.97, estimatedCalories: 1180, protein: 61, carbs: 90, fat: 44 });
  const { meal } = joinRestaurantDetails(c, [record()]);
  assert.equal(meal.price, 42.97);
  assert.equal(meal.estimatedCalories, 1180);
  assert.equal(meal.protein, 61);
  assert.equal(meal.carbs, 90);
  assert.equal(meal.fat, 44);
});

test('every slot is joined and unmatched names are reported once each', () => {
  const records = [record(), record({ name: 'Fanoos Persian Grill', cuisine: 'Persian', address: '5 Main St' })];
  const { slots, unmatched } = joinRestaurantMealSlots(
    [
      { day: 'monday', mealType: 'lunch', primary: choice(), alternative: choice({ restaurant: 'Fanoos Persian Grill' }) },
      { day: 'tuesday', mealType: 'dinner', primary: choice({ restaurant: 'Ghost Kitchen' }), alternative: choice() },
    ],
    records
  );
  assert.equal(slots.length, 2);
  assert.equal(slots[0].alternative.cuisine, 'Persian');
  assert.equal(slots[1].day, 'tuesday');
  assert.deepEqual(unmatched, ['Ghost Kitchen']);
});

test('an empty restaurant list leaves every meal unorderable rather than throwing', () => {
  const { slots, unmatched } = joinRestaurantMealSlots(
    [{ day: 'monday', mealType: 'lunch', primary: choice(), alternative: choice() }],
    []
  );
  assert.equal(slots[0].primary.orderingLinks.direct, null);
  assert.equal(unmatched.length, 2);
});

test('normalization is stable for names that differ only in decoration', () => {
  assert.equal(normalizeRestaurantName('  The  Bite!! '), 'the bite');
  assert.equal(normalizeRestaurantName('The Bite'), 'the bite');
  assert.equal(normalizeRestaurantName(null), '');
  assert.equal(normalizeRestaurantName(42), '');
});
