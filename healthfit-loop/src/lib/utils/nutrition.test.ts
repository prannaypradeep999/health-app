import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMacroTargets, PROTEIN_G_PER_KG, UserProfile } from './nutrition';

const LB_TO_KG = 0.453592;

/** The profile from the 2026-08-26 run that surfaced this: 25M, 170lb, 6'2". */
function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    age: 25,
    sex: 'male',
    height: 74,
    weight: 170,
    activityLevel: 'MODERATELY_ACTIVE',
    goal: 'MUSCLE_GAIN',
    ...over,
  };
}

function gPerKg(p: UserProfile): number {
  return calculateMacroTargets(p).protein / (p.weight * LB_TO_KG);
}

test('protein for the muscle-gain profile lands in the evidence-backed band', () => {
  // Was 244g = 3.17 g/kg, computed as 30% of a 3254 kcal target. ISSN 2017
  // gives 1.4-2.0 g/kg for building mass; Morton 2018 (BJSM) finds the
  // benefit plateaus near 1.62 g/kg with the CI reaching ~2.2.
  const p = profile();
  const ratio = gPerKg(p);
  assert.ok(ratio >= 1.4 && ratio <= 2.2, `expected 1.4-2.2 g/kg, got ${ratio.toFixed(2)}`);
  assert.equal(calculateMacroTargets(p).protein, Math.round(1.8 * 170 * LB_TO_KG));
});

test('every goal produces a defensible g/kg, none above the Morton CI', () => {
  for (const goal of ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS', 'NONSENSE']) {
    const ratio = gPerKg(profile({ goal }));
    assert.ok(ratio >= 1.0 && ratio <= 2.2, `${goal}: ${ratio.toFixed(2)} g/kg is outside 1.0-2.2`);
  }
});

test('protein tracks bodyweight, not calories', () => {
  // The defect in one line: the old formula was a share of the calorie target,
  // so raising activity raised protein even though the body being fed had not
  // changed. Same person, more exercise, same protein requirement.
  const sedentary = calculateMacroTargets(profile({ activityLevel: 'SEDENTARY' }));
  const extreme = calculateMacroTargets(profile({ activityLevel: 'EXTREMELY_ACTIVE' }));

  assert.equal(sedentary.protein, extreme.protein);
  assert.ok(extreme.calories > sedentary.calories);
  // The extra energy goes to carbs, which is where endurance fuel belongs.
  assert.ok(extreme.carbs > sedentary.carbs);
});

test('a heavier person gets proportionally more protein', () => {
  const light = calculateMacroTargets(profile({ weight: 130 }));
  const heavy = calculateMacroTargets(profile({ weight: 220 }));
  assert.ok(heavy.protein > light.protein);
  // Same goal, so the ratio is the same however the weight moves.
  assert.ok(Math.abs(gPerKg(profile({ weight: 130 })) - gPerKg(profile({ weight: 220 }))) < 0.01);
});

test('cutting keeps protein high to spare lean mass', () => {
  const cut = gPerKg(profile({ goal: 'WEIGHT_LOSS' }));
  const endurance = gPerKg(profile({ goal: 'ENDURANCE' }));
  assert.ok(cut > endurance);
});

test('macros add back up to the calorie target', () => {
  for (const goal of ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS']) {
    const m = calculateMacroTargets(profile({ goal }));
    const fromMacros = m.protein * 4 + m.carbs * 4 + m.fat * 9;
    // Rounding each macro to whole grams cannot drift more than a few kcal.
    assert.ok(
      Math.abs(fromMacros - m.calories) <= 12,
      `${goal}: macros total ${fromMacros} kcal against a ${m.calories} kcal target`
    );
  }
});

test('carbs never go negative when protein and fat crowd a small target', () => {
  // A short, light person cutting has the tightest calorie budget relative to
  // their protein floor. Nothing here may produce a negative carb target.
  const m = calculateMacroTargets({
    age: 60,
    sex: 'female',
    height: 58,
    weight: 95,
    activityLevel: 'SEDENTARY',
    goal: 'WEIGHT_LOSS',
  });
  assert.ok(m.carbs >= 0, `carbs came out ${m.carbs}`);
  assert.ok(m.protein > 0 && m.fat > 0);
});

test('a very heavy cutter does not get a protein target that eats the whole budget', () => {
  // 380lb on a 20% deficit: 2.0 g/kg would be 345g = 1380 kcal. Protein must
  // stay a sane share of intake rather than crowding out everything else.
  const m = calculateMacroTargets({
    age: 45,
    sex: 'male',
    height: 70,
    weight: 380,
    activityLevel: 'SEDENTARY',
    goal: 'WEIGHT_LOSS',
  });
  const proteinShare = (m.protein * 4) / m.calories;
  assert.ok(proteinShare <= 0.4, `protein is ${(proteinShare * 100).toFixed(0)}% of calories`);
  assert.ok(m.carbs >= 0);
});

test('the published table is the single place the numbers live', () => {
  // Guards against a second, drifting copy of these constants appearing.
  assert.equal(PROTEIN_G_PER_KG.MUSCLE_GAIN, 1.8);
  assert.equal(PROTEIN_G_PER_KG.WEIGHT_LOSS, 2.0);
  assert.equal(PROTEIN_G_PER_KG.ENDURANCE, 1.4);
  assert.equal(PROTEIN_G_PER_KG.GENERAL_WELLNESS, 1.2);
});
