import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealIcon, hasFetchedPhoto, DEFAULT_MEAL_ICON } from './meal-icon';

test('a dish keyword beats the cuisine, because it is more specific', () => {
  // A salad at an Italian restaurant is a salad, not a plate of pasta.
  assert.equal(mealIcon({ dish: 'Tuscan Kale Salad', cuisine: 'Italian' }), '🥗');
});

test('reads the restaurant spelling and the home-meal spelling alike', () => {
  assert.equal(mealIcon({ dish: 'Margherita Pizza' }), '🍕');
  assert.equal(mealIcon({ name: 'Margherita Pizza' }), '🍕');
});

test('reads the description, because a dish name can say nothing', () => {
  // The exact failure that motivated reading descriptions elsewhere in this
  // repo: "Bento Box" is not a food word.
  assert.equal(mealIcon({ dish: 'Bento Box', description: 'grilled salmon with rice' }), '🐟');
});

test('falls back to cuisine when no dish keyword matches', () => {
  assert.equal(mealIcon({ dish: 'Chef Special', cuisine: 'Mexican' }), '🌮');
  assert.equal(mealIcon({ dish: 'Chef Special', cuisine: 'Indian' }), '🍛');
});

test('cuisine matching tolerates the casing and spacing the model emits', () => {
  assert.equal(mealIcon({ dish: 'House Plate', cuisine: '  MEDITERRANEAN ' }), '🥙');
  assert.equal(mealIcon({ dish: 'House Plate', cuisine: 'Middle Eastern' }), '🥙');
});

test('falls back to meal type when there is no dish or cuisine signal', () => {
  assert.equal(mealIcon({ dish: 'Chef Special' }, 'breakfast'), '🍳');
  assert.equal(mealIcon({}, 'lunch'), '🥪');
});

test('always returns a glyph rather than blanking the card', () => {
  assert.equal(mealIcon(undefined), DEFAULT_MEAL_ICON);
  assert.equal(mealIcon(null), DEFAULT_MEAL_ICON);
  assert.equal(mealIcon({}), DEFAULT_MEAL_ICON);
  assert.equal(mealIcon({ dish: 'Chef Special' }, 'brunch'), DEFAULT_MEAL_ICON);
});

test('never throws on hostile or malformed input', () => {
  // This feeds a render path; an exception here blanks a meal card.
  assert.doesNotThrow(() => mealIcon({ dish: 123, cuisine: {} } as unknown));
  assert.doesNotThrow(() => mealIcon('a string' as unknown));
  assert.doesNotThrow(() => mealIcon({ cuisine: 'constructor' }));
  assert.equal(mealIcon({ cuisine: 'constructor' }), DEFAULT_MEAL_ICON);
});

test('a prototype key cannot smuggle a function in where a glyph is expected', () => {
  assert.equal(typeof mealIcon({ dish: 'x', cuisine: 'toString' }), 'string');
});

test('word boundaries stop a substring from hijacking the icon', () => {
  // "Codfish" should not match on a bare "cod", and "Beefsteak Tomato Salad"
  // is a salad. Both are cases where a naive includes() picks the wrong icon.
  assert.equal(mealIcon({ dish: 'Beefsteak Tomato Salad' }), '🥗');
});

test('hasFetchedPhoto distinguishes a real photo from a category placeholder', () => {
  // mealImageUrl always returns a URL, so its return value cannot answer this.
  assert.equal(hasFetchedPhoto({ imageUrl: 'https://images.pexels.com/x.jpg' }), true);
  assert.equal(hasFetchedPhoto({ image: 'https://images.pexels.com/x.jpg' }), true);
  assert.equal(hasFetchedPhoto({ imageUrl: '' }), false);
  assert.equal(hasFetchedPhoto({ imageUrl: '   ' }), false);
  assert.equal(hasFetchedPhoto({}), false);
  assert.equal(hasFetchedPhoto(null), false);
  assert.equal(hasFetchedPhoto(undefined), false);
});
