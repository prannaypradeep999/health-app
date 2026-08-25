import { test } from 'node:test';
import assert from 'node:assert';
import { verifyWorkoutPlan, equipmentFromGymAccess } from './workouts';

const survey = { equipmentAccess: ['dumbbells'], injuryConsiderations: ['knee'], availableDays: ['Monday', 'Wednesday', 'Friday'] };
const day = (over: any = {}) => ({ day: 'Monday', restDay: false, exercises: [{ name: 'Dumbbell Press' }], ...over });

test('W1 contradicts an exercise needing equipment the user does not have', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Barbell Back Squat' }] })], survey);
  const w1 = vs.find(v => v.check === 'W1-equipment-available');
  assert.equal(w1?.status, 'contradicted');
  assert.match(w1!.evidence, /barbell/i);
});

test('W1 accepts equipment the survey did list', () => {
  const vs = verifyWorkoutPlan([day()], survey);
  assert.equal(vs.find(v => v.check === 'W1-equipment-available')?.status, 'verified');
});

test('W1 passes bodyweight movements with no equipment at all', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Push-Up' }] })], { ...survey, equipmentAccess: [] });
  assert.notEqual(vs.find(v => v.check === 'W1-equipment-available')?.status, 'contradicted');
});

test('W2 contradicts a movement contraindicated by a reported injury', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Jump Squat' }] })], survey);
  assert.equal(vs.find(v => v.check === 'W2-injury-safe')?.status, 'contradicted');
});

test('W2 is unchecked when no injuries were reported', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Jump Squat' }] })], { ...survey, injuryConsiderations: [] });
  assert.equal(vs.find(v => v.check === 'W2-injury-safe')?.status, 'unchecked');
});

test('W3 contradicts a training day the user said they are unavailable', () => {
  const vs = verifyWorkoutPlan([day({ day: 'Tuesday' })], survey);
  assert.equal(vs.find(v => v.check === 'W3-day-available')?.status, 'contradicted');
});

test('W3 does not flag a rest day on an unavailable day', () => {
  const vs = verifyWorkoutPlan([day({ day: 'Tuesday', restDay: true, exercises: null })], survey);
  assert.notEqual(vs.find(v => v.check === 'W3-day-available')?.status, 'contradicted');
});

test('an empty availableDays list yields unchecked, not a clean sweep', () => {
  const vs = verifyWorkoutPlan([day({ day: 'Tuesday' })], { ...survey, availableDays: [] });
  assert.equal(vs.find(v => v.check === 'W3-day-available')?.status, 'unchecked');
});

test('a rest day with null exercises produces no exercise verdicts', () => {
  const vs = verifyWorkoutPlan([day({ restDay: true, exercises: null })], survey);
  assert.equal(vs.filter(v => v.check.startsWith('W1') || v.check.startsWith('W2')).length, 0);
});

test('an empty plan produces no verdicts rather than throwing', () => {
  assert.deepEqual(verifyWorkoutPlan([], survey), []);
});

test('full_gym expands to every equipment kind the patterns know about', () => {
  const eq = equipmentFromGymAccess('full_gym')!;
  assert.ok(eq.includes('barbell') && eq.includes('cable') && eq.includes('machine'));
});

test('no_gym allows bands but not barbells', () => {
  const eq = equipmentFromGymAccess('no_gym')!;
  assert.deepEqual(eq, ['bands']);
});

test('recommend_gym is treated as no_gym, matching the prompt', () => {
  assert.deepEqual(equipmentFromGymAccess('recommend_gym'), equipmentFromGymAccess('no_gym'));
});

test('free_weights allows barbells but not cables', () => {
  const eq = equipmentFromGymAccess('free_weights')!;
  assert.ok(eq.includes('barbell'));
  assert.ok(!eq.includes('cable'));
});

test('a missing gymAccess falls back to no_gym exactly as the prompt does', () => {
  assert.deepEqual(equipmentFromGymAccess(undefined), ['bands']);
});

test('an unrecognized gymAccess yields null, not a permissive list', () => {
  assert.equal(equipmentFromGymAccess('space_station'), null);
});

test('a null equipment list makes W1 unchecked rather than contradicted', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Barbell Back Squat' }] })], { ...survey, equipmentAccess: null });
  assert.equal(vs.find(v => v.check === 'W1-equipment-available')?.status, 'unchecked');
});

test('a null equipment list never reports W1 as verified', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Barbell Back Squat' }] })], { ...survey, equipmentAccess: null });
  assert.equal(vs.filter(v => v.check === 'W1-equipment-available' && v.status === 'verified').length, 0);
});

test('the free_weights expansion clears a dumbbell press', () => {
  const vs = verifyWorkoutPlan([day()], { ...survey, equipmentAccess: equipmentFromGymAccess('free_weights') });
  assert.equal(vs.find(v => v.check === 'W1-equipment-available')?.status, 'verified');
});
