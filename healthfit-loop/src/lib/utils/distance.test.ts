import { test } from 'node:test';
import assert from 'node:assert/strict';
import { milesBetween, radiusMilesFor, DISTANCE_RADIUS_MILES } from './distance';

test('the mile table has exactly three tiers', () => {
  assert.deepEqual(Object.keys(DISTANCE_RADIUS_MILES).sort(), ['close', 'far', 'medium']);
});

test('an unknown preference falls back to medium', () => {
  assert.equal(radiusMilesFor('moderate'), DISTANCE_RADIUS_MILES.medium);
  assert.equal(radiusMilesFor(undefined), DISTANCE_RADIUS_MILES.medium);
  assert.equal(radiusMilesFor(null), DISTANCE_RADIUS_MILES.medium);
});

test('a known preference maps to its tier', () => {
  assert.equal(radiusMilesFor('close'), DISTANCE_RADIUS_MILES.close);
  assert.equal(radiusMilesFor('FAR'), DISTANCE_RADIUS_MILES.far);
});

test('distance from a point to itself is zero', () => {
  const p = { lat: 37.8715, lng: -122.2730 };
  assert.equal(milesBetween(p, p), 0);
});

test('a known distance is right to within a tenth of a mile', () => {
  // UC Berkeley campanile to the Oakland Museum of California.
  const berkeley = { lat: 37.8721, lng: -122.2578 };
  const oakland = { lat: 37.7955, lng: -122.2639 };
  const d = milesBetween(berkeley, oakland);
  assert.ok(d > 5.2 && d < 5.5, `expected ~5.3 miles, got ${d}`);
});

test('distance is symmetric', () => {
  const a = { lat: 37.8721, lng: -122.2578 };
  const b = { lat: 37.7955, lng: -122.2639 };
  assert.equal(milesBetween(a, b).toFixed(6), milesBetween(b, a).toFixed(6));
});
