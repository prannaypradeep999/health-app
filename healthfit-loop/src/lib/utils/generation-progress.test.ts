import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATION_STALE_AFTER_MS,
  canResetPollCounter,
  hasGivenUpOnHomeMeals,
  hasGivenUpOnRestaurants,
} from './generation-progress';

const NOW = 1_800_000_000_000;

function input(over: Partial<Parameters<typeof hasGivenUpOnRestaurants>[0]> = {}) {
  return {
    restaurantMealsGenerated: false,
    planUpdatedAtMs: NOW - 1000,
    pollAttempts: 0,
    maxPollAttempts: 120,
    nowMs: NOW,
    ...over,
  };
}

test('a fresh plan with no restaurants yet is still in progress', () => {
  assert.equal(hasGivenUpOnRestaurants(input()), false);
});

test('the plan that spun for 17 hours is given up on', () => {
  // Observed: cmt9ldt760003kw04r2o3cqnh, last written 04:28Z, polled at 21:54Z.
  const seventeenHours = 17 * 60 * 60 * 1000;
  assert.equal(
    hasGivenUpOnRestaurants(input({ planUpdatedAtMs: NOW - seventeenHours })),
    true
  );
});

test('a plan goes stale exactly at the threshold, not a tick before', () => {
  assert.equal(
    hasGivenUpOnRestaurants(input({ planUpdatedAtMs: NOW - GENERATION_STALE_AFTER_MS + 1 })),
    false
  );
  assert.equal(
    hasGivenUpOnRestaurants(input({ planUpdatedAtMs: NOW - GENERATION_STALE_AFTER_MS })),
    true
  );
});

test('exhausting the poll budget gives up even on a fresh plan', () => {
  assert.equal(
    hasGivenUpOnRestaurants(input({ pollAttempts: 120, maxPollAttempts: 120 })),
    true
  );
});

test('a plan with no known timestamp is treated as live', () => {
  // Otherwise the first render, before any fetch resolves, would show failure.
  assert.equal(hasGivenUpOnRestaurants(input({ planUpdatedAtMs: null })), false);
});

test('restaurants that did generate are never reported as given up on', () => {
  const ancient = NOW - 17 * 60 * 60 * 1000;
  assert.equal(
    hasGivenUpOnRestaurants(
      input({ restaurantMealsGenerated: true, planUpdatedAtMs: ancient, pollAttempts: 999 })
    ),
    false
  );
});

function homeInput(
  over: Partial<Parameters<typeof hasGivenUpOnHomeMeals>[0]> = {}
) {
  return {
    homeMealsGenerated: false,
    planUpdatedAtMs: NOW - 1000,
    pollAttempts: 0,
    maxPollAttempts: 120,
    nowMs: NOW,
    ...over,
  };
}

test('a fresh plan with no home meals yet is still in progress', () => {
  assert.equal(hasGivenUpOnHomeMeals(homeInput()), false);
});

test('home meals that never arrived are given up on once the plan goes stale', () => {
  // The 2026-08-26 run: restaurants persisted, the relay died before home meals
  // ran, and the dashboard showed "Creating home meal..." with nothing behind
  // it. Nothing was ever going to write to this plan again.
  assert.equal(
    hasGivenUpOnHomeMeals(homeInput({ planUpdatedAtMs: NOW - GENERATION_STALE_AFTER_MS })),
    true
  );
});

test('home meals go stale exactly at the threshold, not a tick before', () => {
  assert.equal(
    hasGivenUpOnHomeMeals(homeInput({ planUpdatedAtMs: NOW - GENERATION_STALE_AFTER_MS + 1 })),
    false
  );
});

test('exhausting the poll budget gives up on home meals too', () => {
  assert.equal(
    hasGivenUpOnHomeMeals(homeInput({ pollAttempts: 120, maxPollAttempts: 120 })),
    true
  );
});

test('a plan with no known timestamp keeps home meals live', () => {
  assert.equal(hasGivenUpOnHomeMeals(homeInput({ planUpdatedAtMs: null })), false);
});

test('home meals that did generate are never reported as given up on', () => {
  assert.equal(
    hasGivenUpOnHomeMeals(
      homeInput({
        homeMealsGenerated: true,
        planUpdatedAtMs: NOW - 17 * 60 * 60 * 1000,
        pollAttempts: 999,
      })
    ),
    false
  );
});

test('the poll counter may not reset while restaurants are outstanding', () => {
  // This is the exact state that polled forever: meals and workouts done,
  // restaurants never arriving, counter reset on every tick.
  assert.equal(
    canResetPollCounter({
      mealsGenerated: true,
      workoutsGenerated: true,
      restaurantMealsGenerated: false,
    }),
    false
  );
});

test('the poll counter resets only when every phase is complete', () => {
  assert.equal(
    canResetPollCounter({
      mealsGenerated: true,
      workoutsGenerated: true,
      restaurantMealsGenerated: true,
    }),
    true
  );
  assert.equal(
    canResetPollCounter({
      mealsGenerated: false,
      workoutsGenerated: true,
      restaurantMealsGenerated: true,
    }),
    false
  );
});

test('a phase that reports its own failure is given up on immediately', () => {
  // The 2026-08-26 run: restaurant meal selection timed out and returned zero
  // meals. Waiting out the staleness window would have spun the panel for ten
  // more minutes over a phase that had already finished and knows it failed.
  assert.equal(
    hasGivenUpOnRestaurants(input({ phaseReportedFailure: true })),
    true
  );
  assert.equal(
    hasGivenUpOnHomeMeals(homeInput({ phaseReportedFailure: true })),
    true
  );
});

test('a reported failure does not override meals that actually arrived', () => {
  // A late write beats a stale status field. If the meals are there, show them.
  assert.equal(
    hasGivenUpOnRestaurants(input({ phaseReportedFailure: true, restaurantMealsGenerated: true })),
    false
  );
});

test('no reported failure leaves the existing staleness rules untouched', () => {
  assert.equal(hasGivenUpOnRestaurants(input({ phaseReportedFailure: false })), false);
  assert.equal(hasGivenUpOnRestaurants(input({ phaseReportedFailure: undefined })), false);
});
