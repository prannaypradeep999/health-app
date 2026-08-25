import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkoutPlan } from './workout-validator';

const trainingDay = (day: string, exercises = 5) => ({
  day,
  restDay: false,
  focus: 'Upper body push',
  estimatedTime: '45 minutes',
  estimatedCalories: 280,
  exercises: Array.from({ length: exercises }, (_, i) => ({
    name: `Exercise ${i + 1}`,
    sets: 3,
    reps: '8-10',
    restTime: '90 seconds',
  })),
});

const restDay = (day: string) => ({
  day,
  restDay: true,
  focus: 'Recovery',
  estimatedTime: '20 minutes',
  estimatedCalories: 80,
  activeRecovery: { suggestedActivity: 'Walk', duration: '20 min', description: 'x', alternatives: [] },
});

test('a day with one exercise is flagged, not passed', () => {
  const result = validateWorkoutPlan([trainingDay('monday', 1)], {
    preferredDuration: 45,
    availableDays: ['monday'],
    fitnessExperience: 'intermediate',
  });
  const monday = result.daySummaries.find(d => d.day === 'monday');
  assert.ok(monday, 'monday should have a summary');
  assert.equal(monday!.exerciseCount, 1);
  assert.ok(
    monday!.issues.some(i => /exercise count/i.test(i)),
    `expected an exercise-count issue, got ${JSON.stringify(monday!.issues)}`
  );
});

test('a normal training day produces no exercise-count issue', () => {
  const result = validateWorkoutPlan([trainingDay('monday', 5)], {
    preferredDuration: 45,
    availableDays: ['monday'],
    fitnessExperience: 'intermediate',
  });
  const monday = result.daySummaries.find(d => d.day === 'monday')!;
  assert.equal(
    monday.issues.some(i => /exercise count/i.test(i)),
    false,
    `expected no exercise-count issue, got ${JSON.stringify(monday.issues)}`
  );
});

test('an empty plan is invalid', () => {
  const result = validateWorkoutPlan([], { preferredDuration: 45 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('a training day with no exercises array is an error, not a warning', () => {
  const result = validateWorkoutPlan(
    [{ day: 'monday', restDay: false, focus: 'Push', estimatedTime: '45 minutes', estimatedCalories: 280 }],
    { preferredDuration: 45, availableDays: ['monday'] }
  );
  // No exercises array means the validator treats it as a rest day, and a rest
  // day with no activeRecovery is an error. Either way it must not be valid.
  assert.equal(result.valid, false, `expected invalid, got ${JSON.stringify(result.errors)}`);
});

test('an unstated schedule produces no day warnings', () => {
  const result = validateWorkoutPlan([trainingDay('monday'), trainingDay('thursday')], {
    preferredDuration: 45,
    availableDays: [],
    fitnessExperience: 'intermediate',
  });
  assert.equal(
    result.warnings.some(w => /not in availableDays/.test(w)),
    false,
    `expected no availableDays warnings, got ${JSON.stringify(result.warnings)}`
  );
});

test('a stated schedule still warns when training falls outside it', () => {
  const result = validateWorkoutPlan([trainingDay('thursday')], {
    preferredDuration: 45,
    availableDays: ['monday', 'wednesday', 'friday'],
    fitnessExperience: 'intermediate',
  });
  assert.ok(
    result.warnings.some(w => /not in availableDays/.test(w)),
    `expected an availableDays warning, got ${JSON.stringify(result.warnings)}`
  );
});

test('a full week of rest days with activeRecovery is valid', () => {
  const week = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(restDay);
  const result = validateWorkoutPlan(week, { preferredDuration: 45 });
  assert.equal(result.valid, true, `expected valid, got ${JSON.stringify(result.errors)}`);
});
