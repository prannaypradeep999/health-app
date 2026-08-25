import { test } from 'node:test';
import assert from 'node:assert';
import { verifyGroceryCoverage } from './groceries';

test('G1 contradicts an ingredient missing from the list', () => {
  const vs = verifyGroceryCoverage(['2 lb chicken thighs', '1 cup quinoa'], ['Quinoa']);
  const g1 = vs.filter(v => v.check === 'G1-ingredient-covered');
  assert.equal(g1.find(v => v.claim.includes('chicken'))?.status, 'contradicted');
  assert.equal(g1.find(v => v.claim.includes('quinoa'))?.status, 'verified');
});

test('G1 exempts pantry staples', () => {
  const vs = verifyGroceryCoverage(['1 tsp salt', '2 tbsp olive oil'], []);
  assert.ok(vs.filter(v => v.check === 'G1-ingredient-covered').every(v => v.status === 'unverified'));
});

test('G1 matches despite quantities and units', () => {
  const vs = verifyGroceryCoverage(['1.5 lbs boneless chicken breast'], ['Boneless Chicken Breast']);
  assert.equal(vs.find(v => v.check === 'G1-ingredient-covered')?.status, 'verified');
});

test('G2 flags a grocery item no recipe asked for', () => {
  const vs = verifyGroceryCoverage(['1 cup quinoa'], ['Quinoa', 'Caviar']);
  const g2 = vs.filter(v => v.check === 'G2-item-traced');
  assert.equal(g2.find(v => v.claim === 'Caviar')?.status, 'contradicted');
});

test('an empty grocery list against a real plan contradicts every ingredient', () => {
  const vs = verifyGroceryCoverage(['2 lb chicken thighs'], []);
  assert.equal(vs.find(v => v.check === 'G1-ingredient-covered')?.status, 'contradicted');
});

test('an empty plan yields unchecked rather than a clean sweep', () => {
  const vs = verifyGroceryCoverage([], ['Quinoa']);
  assert.ok(vs.every(v => v.status === 'unchecked'));
});

test('a repeated ingredient is reported once', () => {
  const vs = verifyGroceryCoverage(['1 cup quinoa', '2 cups quinoa'], ['Quinoa']);
  assert.equal(vs.filter(v => v.check === 'G1-ingredient-covered').length, 1);
});

test('a fully covered plan produces no contradictions at all', () => {
  const vs = verifyGroceryCoverage(['2 lb chicken thighs', '1 cup quinoa'], ['Chicken Thighs', 'Quinoa']);
  assert.equal(vs.filter(v => v.status === 'contradicted').length, 0);
});
