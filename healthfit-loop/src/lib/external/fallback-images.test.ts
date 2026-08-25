import test from 'node:test';
import assert from 'node:assert/strict';
import { isFallbackStale, FALLBACK_TTL_MS, FOOD_FALLBACKS, WORKOUT_FALLBACKS } from './fallback-images';

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
  for (const map of [FOOD_FALLBACKS, WORKOUT_FALLBACKS]) {
    const urls = Object.values(map);
    assert.equal(new Set(urls).size, urls.length, `duplicate URL in ${JSON.stringify(map, null, 2)}`);
  }
});

test('every map has a default', () => {
  assert.ok(FOOD_FALLBACKS.default);
  assert.ok(WORKOUT_FALLBACKS.default);
});
