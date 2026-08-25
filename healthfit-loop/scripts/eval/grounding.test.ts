import { test } from 'node:test';
import assert from 'node:assert';
import { verdictsToFindings, parseProseMenu, checkMenuAgainstProse, PROSE_MENU_TRUTH } from './grounding';
import { verdict } from '../../src/lib/verification/types';
import { tally } from './types';

// tally() indexes a pre-built object by family, so a family missing from its
// initializer is a TypeError at the end of a paid bench run, not a type error
// at compile time. This is the cheap guard against that.
test('tally counts the GROUNDING family instead of crashing on it', () => {
  const t = tally(verdictsToFindings([verdict('R1-dish-exists', 'w', 'contradicted', 'x', 'y')]));
  assert.equal(t.GROUNDING.error, 1);
  assert.equal(t.GROUNDING.warn, 0);
});

test('a contradicted verdict becomes an error finding', () => {
  const fs = verdictsToFindings([verdict('R1-dish-exists', 'monday.lunch', 'contradicted', 'Lobster', 'not on the menu')]);
  assert.equal(fs.length, 1);
  assert.equal(fs[0].severity, 'error');
  assert.equal(fs[0].family, 'GROUNDING');
});

test('the verdict check id survives as the finding code, so runs diff by check', () => {
  const fs = verdictsToFindings([verdict('R1-dish-exists', 'monday.lunch', 'contradicted', 'Lobster', 'nope')]);
  assert.equal(fs[0].code, 'R1-dish-exists');
});

test('an unchecked verdict is a warn, not an error', () => {
  const fs = verdictsToFindings([verdict('R1-dish-exists', 'w', 'unchecked', 'x', 'no evidence loaded')]);
  assert.equal(fs[0].severity, 'warn');
});

test('a verified verdict produces no finding', () => {
  assert.deepEqual(verdictsToFindings([verdict('R1-dish-exists', 'w', 'verified', 'x', 'found')]), []);
});

test('an unverified verdict produces no finding — it is honest, not failing', () => {
  assert.deepEqual(verdictsToFindings([verdict('R4-price-current', 'w', 'unverified', 'x', 'no feed exists')]), []);
});

test('an empty verdict list yields no findings rather than throwing', () => {
  assert.deepEqual(verdictsToFindings([]), []);
});

test('the prose fixture yields the dishes it names', () => {
  const names = PROSE_MENU_TRUTH.map(i => i.name.toLowerCase());
  assert.ok(names.some(n => n.includes('tonkotsu ramen')), `got: ${names.join(' | ')}`);
  assert.ok(names.some(n => n.includes('chicken karaage')), `got: ${names.join(' | ')}`);
});

test('the prose fixture yields the prices it states', () => {
  const tonkotsu = PROSE_MENU_TRUTH.find(i => /tonkotsu ramen/i.test(i.name));
  assert.equal(tonkotsu?.price, 16.5);
});

test('parsing finds every priced dish in the fixture', () => {
  assert.ok(PROSE_MENU_TRUTH.length >= 10, `only found ${PROSE_MENU_TRUTH.length}`);
});

test('a dish absent from the source is an error', () => {
  const fs = checkMenuAgainstProse('menuItems', [{ name: 'Lobster Thermidor', price: 40 }]);
  assert.equal(fs.length, 1);
  assert.equal(fs[0].code, 'dish-not-in-source');
});

test('a dish present in the source at the stated price is clean', () => {
  assert.deepEqual(checkMenuAgainstProse('menuItems', [{ name: 'Tonkotsu Ramen', price: 16.5 }]), []);
});

test('a price the model rewrote is an error naming both numbers', () => {
  const fs = checkMenuAgainstProse('menuItems', [{ name: 'Tonkotsu Ramen', price: 19.0 }]);
  assert.equal(fs[0].code, 'price-differs-from-source');
  assert.match(fs[0].message, /19\.00.*16\.50/);
});

test('a shortened dish name still matches, the way hop 3 shortens them', () => {
  assert.deepEqual(checkMenuAgainstProse('menuItems', [{ name: 'Tonkotsu', price: 16.5 }]), []);
});

test('empty ground truth reports ungraded rather than failing every dish', () => {
  const fs = checkMenuAgainstProse('menuItems', [{ name: 'Anything', price: 1 }], []);
  assert.equal(fs[0].code, 'no-ground-truth');
  assert.equal(fs[0].severity, 'warn');
});

test('prose with no priced dishes parses to an empty list, not junk', () => {
  assert.deepEqual(parseProseMenu('They are open late and the staff are friendly.'), []);
});
