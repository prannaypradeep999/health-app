import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCompleteness } from './completeness';

const slot = (day: string, mealType: string) => ({ day, mealType });

test('every requested slot delivered is complete', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
  });
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.missingSlots, []);
});

test('a missing slot makes the plan partial and names it', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast')],
  });
  assert.equal(report.status, 'partial');
  assert.deepEqual(report.missingSlots, ['monday|lunch']);
  assert.equal(report.deliveredSlots, 1);
  assert.equal(report.requestedSlots, 2);
});

test('nothing delivered is empty, not partial', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast')],
    delivered: [],
  });
  assert.equal(report.status, 'empty');
});

test('nothing requested is complete, not empty', () => {
  const report = summarizeCompleteness({ requested: [], delivered: [] });
  assert.equal(report.status, 'complete');
});

test('slot matching is case-insensitive — the model does not lowercase', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast')],
    delivered: [slot('Monday', 'Breakfast')],
  });
  assert.equal(report.status, 'complete');
});

test('supplied reasons are carried through', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast')],
    reasons: ['route budget exhausted before the detail top-up'],
  });
  assert.deepEqual(report.reasons, ['route budget exhausted before the detail top-up']);
});

test('an extra delivered slot does not mask a missing one', () => {
  const report = summarizeCompleteness({
    requested: [slot('monday', 'breakfast'), slot('monday', 'lunch')],
    delivered: [slot('monday', 'breakfast'), slot('tuesday', 'dinner')],
  });
  assert.equal(report.status, 'partial');
  assert.deepEqual(report.missingSlots, ['monday|lunch']);
});
