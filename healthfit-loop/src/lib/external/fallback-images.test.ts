import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isFallbackStale,
  FALLBACK_TTL_MS,
  FOOD_FALLBACKS,
  WORKOUT_FALLBACKS,
  CUISINE_FALLBACKS,
  mealImageUrl,
  normalizeCuisineKey,
  pickFallback,
} from './fallback-images';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

test('a fresh fallback is reused', () => {
  assert.equal(isFallbackStale({ imageSource: 'fallback', updatedAt: daysAgo(1) }), false);
});

test('an old fallback is retried', () => {
  assert.equal(isFallbackStale({ imageSource: 'fallback', updatedAt: daysAgo(30) }), true);
});

test('a real Pexels image never expires', () => {
  assert.equal(isFallbackStale({ imageSource: 'pexels', updatedAt: daysAgo(3650) }), false);
});

test('a missing timestamp is treated as stale rather than as fresh', () => {
  assert.equal(isFallbackStale({ imageSource: 'fallback', updatedAt: null }), true);
});

test('the TTL is a week, not a day and not a year', () => {
  assert.ok(FALLBACK_TTL_MS >= 5 * 24 * 60 * 60 * 1000);
  assert.ok(FALLBACK_TTL_MS <= 14 * 24 * 60 * 60 * 1000);
});

test('no two fallback keys share a photo, so one dead URL breaks one path', () => {
  for (const map of [FOOD_FALLBACKS, WORKOUT_FALLBACKS, CUISINE_FALLBACKS]) {
    const urls = Object.values(map);
    assert.equal(new Set(urls).size, urls.length, `duplicate URL in ${JSON.stringify(map, null, 2)}`);
  }
});

test('every map has a default', () => {
  assert.ok(FOOD_FALLBACKS.default);
  assert.ok(WORKOUT_FALLBACKS.default);
});

test('every map has a cuisine default too', () => {
  assert.ok(CUISINE_FALLBACKS.default);
});

/**
 * Restaurant meals never call Pexels — `getFoodImage` is wired only into the
 * home-meal route — so all fourteen of a week's restaurant meals fell through
 * to one Unsplash URL hardcoded inline in the JSX. Four such URLs existed, in
 * two components, none of them in this module, so `check-fallback-images.ts`
 * never checked them and a dead ID would have surfaced as a broken image.
 */

test('a restaurant meal gets an image for its cuisine, not the generic one', () => {
  const url = mealImageUrl({ source: 'restaurant', cuisine: 'Italian', restaurant: "Marcella's" }, 'dinner');
  assert.equal(url, CUISINE_FALLBACKS.italian);
  assert.notEqual(url, CUISINE_FALLBACKS.default);
});

test('two restaurant meals of different cuisines do not share a photo', () => {
  // This is the whole point: a week that showed one image fourteen times.
  const a = mealImageUrl({ source: 'restaurant', cuisine: 'Mediterranean' }, 'lunch');
  const b = mealImageUrl({ source: 'restaurant', cuisine: 'Mexican' }, 'lunch');
  assert.notEqual(a, b);
});

test('cuisine matching is case- and whitespace-insensitive', () => {
  // Cuisines come from the model and from Places; casing varies between them.
  assert.equal(mealImageUrl({ source: 'restaurant', cuisine: '  ITALIAN ' }), CUISINE_FALLBACKS.italian);
});

test('an unknown cuisine falls back to the restaurant default, not to a crash', () => {
  assert.equal(mealImageUrl({ source: 'restaurant', cuisine: 'Martian' }), CUISINE_FALLBACKS.default);
});

test('a restaurant meal is recognised by its restaurant name when source is absent', () => {
  // Plans stored before `source` was added to the envelope still render.
  assert.equal(mealImageUrl({ restaurant: 'Milos Taverna', cuisine: 'Greek' }), CUISINE_FALLBACKS.greek);
});

test('a real fetched photo always wins over any fallback', () => {
  const real = 'https://images.pexels.com/photos/123/real.jpg';
  assert.equal(mealImageUrl({ source: 'restaurant', cuisine: 'Italian', imageUrl: real }), real);
  assert.equal(mealImageUrl({ image: real }, 'dinner'), real);
});

test('a blank imageUrl is treated as absent rather than rendered', () => {
  // An empty string is falsy, but a whitespace string is not — and `src="  "`
  // renders as a broken image rather than as the fallback.
  assert.equal(mealImageUrl({ imageUrl: '   ' }, 'lunch'), FOOD_FALLBACKS.lunch);
});

test('a home meal still keys on meal type', () => {
  assert.equal(mealImageUrl({ name: 'Oatmeal' }, 'breakfast'), FOOD_FALLBACKS.breakfast);
  assert.equal(mealImageUrl({ name: 'Stew' }, 'DINNER'), FOOD_FALLBACKS.dinner);
});

test('a home meal with no usable meal type gets the generic food image', () => {
  assert.equal(mealImageUrl({ name: 'Something' }, null), FOOD_FALLBACKS.default);
  assert.equal(mealImageUrl(undefined), FOOD_FALLBACKS.default);
});

test('normalizeCuisineKey returns null rather than an empty key', () => {
  assert.equal(normalizeCuisineKey('  '), null);
  assert.equal(normalizeCuisineKey(null), null);
  assert.equal(normalizeCuisineKey(42), null);
  assert.equal(normalizeCuisineKey(' Thai '), 'thai');
});

test('a model-supplied cuisine cannot reach Object.prototype', () => {
  // pickFallback uses Object.hasOwn for exactly this reason; the key is model
  // output, and a plain index would return a function where a URL is expected.
  assert.equal(pickFallback(CUISINE_FALLBACKS, 'constructor'), CUISINE_FALLBACKS.default);
  assert.equal(mealImageUrl({ source: 'restaurant', cuisine: 'constructor' }), CUISINE_FALLBACKS.default);
});
