import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMinutes, isPlausibleRpe, reconcileDayEstimate } from './workout-numbers';

test('parses the shapes the model actually returns', () => {
  assert.equal(parseMinutes('45 minutes'), 45);
  assert.equal(parseMinutes('45'), 45);
  assert.equal(parseMinutes('45-60 minutes'), 45);
  assert.equal(parseMinutes('About 45 minutes'), 45);
  assert.equal(parseMinutes('~45 min'), 45);
  assert.equal(parseMinutes(45), 45);
});

test('returns null rather than NaN when there is no number', () => {
  assert.equal(parseMinutes('as long as you need'), null);
  assert.equal(parseMinutes(''), null);
  assert.equal(parseMinutes(null), null);
  assert.equal(parseMinutes(undefined), null);
  assert.equal(parseMinutes({}), null);
});

test('rejects durations outside the plausible range', () => {
  assert.equal(parseMinutes('0 minutes'), null);
  assert.equal(parseMinutes('600 minutes'), null);
});

test('accepts the RPE scale the UI renders', () => {
  assert.equal(isPlausibleRpe(7), true);
  assert.equal(isPlausibleRpe(1), true);
  assert.equal(isPlausibleRpe(10), true);
});

test('rejects an RPE on the wrong scale', () => {
  assert.equal(isPlausibleRpe(85), false);
  assert.equal(isPlausibleRpe(0), false);
  assert.equal(isPlausibleRpe(-1), false);
  assert.equal(isPlausibleRpe('7'), false);
  assert.equal(isPlausibleRpe(null), false);
});

test('keeps the outline estimate when the day was actually built', () => {
  assert.deepEqual(reconcileDayEstimate(45, 5), { minutes: 45, trusted: true });
});

test('distrusts the outline estimate when almost nothing was delivered', () => {
  assert.deepEqual(reconcileDayEstimate(45, 1), { minutes: null, trusted: false });
});

test('a rest day has no exercises and no estimate to distrust', () => {
  assert.deepEqual(reconcileDayEstimate(null, 0), { minutes: null, trusted: false });
});
