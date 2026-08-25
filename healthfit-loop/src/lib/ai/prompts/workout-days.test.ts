import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkoutPlanningPrompt } from './workout-generation';

const surveyData: any = {
  goal: 'MUSCLE_GAIN',
  age: 30,
  currentWeight: 170,
  targetWeight: 180,
};

const prefsWith = (availableDays: string[]): any => ({
  preferredDuration: 45,
  availableDays,
  workoutTypes: [],
  gymAccess: 'full_gym',
  fitnessExperience: 'intermediate',
  injuryConsiderations: [],
  timePreferences: [],
});

const emptyFeedback: any = {
  poorlyRatedExercises: [], wellRatedExercises: [], completionRateByDay: {},
  savedCustomExercises: [], favoriteExercises: [],
  weightProgressionByExercise: {}, repCompletionByExercise: {},
};

test('a stated schedule is presented as a hard constraint', () => {
  const prompt = createWorkoutPlanningPrompt(surveyData, prefsWith(['Mon', 'Wed', 'Fri']), emptyFeedback, []);
  assert.match(prompt, /HARD CONSTRAINT/);
  assert.match(prompt, /monday, wednesday, friday/);
});

test('no stated schedule does not claim the user stated one', () => {
  const prompt = createWorkoutPlanningPrompt(surveyData, prefsWith([]), emptyFeedback, []);
  assert.equal(
    /The user told us which days they can train/.test(prompt),
    false,
    'prompt claims a user statement that was never made'
  );
});

test('no stated schedule still tells the model how to choose days', () => {
  const prompt = createWorkoutPlanningPrompt(surveyData, prefsWith([]), emptyFeedback, []);
  assert.match(
    prompt,
    /did not tell us which days/i,
    'prompt gives no guidance at all when the schedule is absent'
  );
});
