import test from 'node:test';
import assert from 'node:assert/strict';
import { dishNameOf, mealFeedbackKey, feedbackOwnerKey } from './meal-feedback-key';

/**
 * Feedback used to be keyed on `MealOption.id`. That table has never had a row:
 * the generator writes the whole plan as JSON into `MealPlan.userContext`, so
 * every meal object reaches the client without an `id`. Four separate call
 * sites read `meal.id`, got `undefined`, and failed silently — the prompt never
 * opened, the batch load sent an empty array, and the POST hit a foreign key
 * pointing at the empty table. The key below is derived from fields the meal
 * actually carries.
 */

test('a home meal is named by `name`', () => {
  assert.equal(dishNameOf({ name: 'Overnight Oats' }), 'Overnight Oats');
});

test('a restaurant meal is named by `dish`, not by the restaurant', () => {
  assert.equal(dishNameOf({ source: 'restaurant', restaurant: "Marcella's", dish: 'Cacio e Pepe' }), 'Cacio e Pepe');
});

test('a restaurant meal is recognised by its restaurant name when source is absent', () => {
  // Plans stored before `source` was added to the envelope still render.
  assert.equal(dishNameOf({ restaurant: 'Milos Taverna', dish: 'Gyro Plate', name: 'ignored' }), 'Gyro Plate');
});

test('dishName and recipeName are MealOption columns and are never consulted', () => {
  // The Love it / Meh buttons read these two, which is why every meal they sent
  // was called "Unknown Dish". They are not fields on a generated meal.
  assert.equal(dishNameOf({ dishName: 'Bento Box', recipeName: 'Stew' }), null);
});

test('a nameless meal yields null rather than a key that collides with every other nameless meal', () => {
  assert.equal(dishNameOf({}), null);
  assert.equal(dishNameOf(null), null);
  assert.equal(dishNameOf({ name: '   ' }), null);
});

test('the key is stable across the three call sites that build it', () => {
  // StarRating passed `mealName`, handleRating recomputed it, the buttons used a
  // different field again. Same meal, three keys, so a rating saved by one was
  // invisible to the others.
  const key = mealFeedbackKey('Monday', 'breakfast', 'Overnight Oats');
  assert.equal(mealFeedbackKey('monday', 'Breakfast', 'overnight oats'), key);
  assert.equal(mealFeedbackKey(' monday ', ' breakfast ', ' Overnight  Oats '), key);
});

test('the key separates day, meal type and dish', () => {
  assert.equal(mealFeedbackKey('monday', 'breakfast', 'Overnight Oats'), 'monday|breakfast|overnight oats');
});

test('two meal types on the same day do not share a key', () => {
  assert.notEqual(
    mealFeedbackKey('monday', 'lunch', 'Kale Salad'),
    mealFeedbackKey('monday', 'dinner', 'Kale Salad')
  );
});

test('the same dish on two days is rated separately', () => {
  assert.notEqual(
    mealFeedbackKey('monday', 'dinner', 'Super Burrito'),
    mealFeedbackKey('tuesday', 'dinner', 'Super Burrito')
  );
});

test('a missing part yields null, so no request is sent at all', () => {
  assert.equal(mealFeedbackKey('monday', 'breakfast', null), null);
  assert.equal(mealFeedbackKey(null, 'breakfast', 'Oats'), null);
  assert.equal(mealFeedbackKey('monday', '', 'Oats'), null);
});

test('a dish whose name contains the separator cannot forge another key', () => {
  // Keys are only ever built, never parsed, but a dish named with a pipe should
  // still not be able to land on a different day's row.
  assert.notEqual(
    mealFeedbackKey('monday', 'breakfast', 'a|breakfast|b'),
    mealFeedbackKey('monday', 'breakfast', 'a-breakfast-b')
  );
});

test('a signed-in user owns their feedback by user id', () => {
  assert.equal(feedbackOwnerKey('user_123', 'sess_abc'), 'user:user_123');
});

test('a guest owns their feedback by session', () => {
  assert.equal(feedbackOwnerKey(null, 'sess_abc'), 'session:sess_abc');
});

test('two guests do not overwrite each other', () => {
  // The old unique constraint was on mealOptionId alone. With a cuid per plan
  // that was incidentally per-user; with a derived key it is not, so the owner
  // has to be part of the constraint or one guest's rating clobbers another's.
  assert.notEqual(feedbackOwnerKey(null, 'sess_a'), feedbackOwnerKey(null, 'sess_b'));
});

test('an unidentified caller gets a constant key, so anonymous rows collapse rather than fan out', () => {
  assert.equal(feedbackOwnerKey(null, null), 'anon');
  assert.equal(feedbackOwnerKey(undefined, undefined), 'anon');
});

test('a user id and a session id with the same text do not collide', () => {
  assert.notEqual(feedbackOwnerKey('x', null), feedbackOwnerKey(null, 'x'));
});
