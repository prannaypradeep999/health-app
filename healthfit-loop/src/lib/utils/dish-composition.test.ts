import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dishComponents,
  distinctComponents,
  hasRepeatedComponent,
  repeatedComponents,
} from './dish-composition';

test('splits a combined order into its menu items', () => {
  assert.deepEqual(dishComponents('Chicken Shawarma Platter + Hummus'), [
    'Chicken Shawarma Platter',
    'Hummus',
  ]);
});

test('a single dish is one component, not a combination', () => {
  assert.deepEqual(dishComponents('Moussaka Vegetarian'), ['Moussaka Vegetarian']);
});

test('catches the exact orders measured on plan cmtblvky6', () => {
  // These shipped to a real user. $49 for three identical salads.
  assert.deepEqual(
    repeatedComponents('Mighty Kale Salad + Mighty Kale Salad + Mighty Kale Salad'),
    ['Mighty Kale Salad']
  );
  assert.deepEqual(
    repeatedComponents('Greek Gemista + Greek Gemista + Moussaka Vegetarian'),
    ['Greek Gemista']
  );
  assert.deepEqual(
    repeatedComponents('Moussaka Vegetarian + Moussaka Vegetarian + HH Acuka'),
    ['Moussaka Vegetarian']
  );
});

test('a genuine combination of different items is not a repeat', () => {
  // Rule 5 exists for exactly this order; it must stay legal.
  assert.equal(
    hasRepeatedComponent('Chicken Shawarma Platter + Side of Grilled Chicken + Hummus'),
    false
  );
  assert.equal(hasRepeatedComponent('Lentil Soup + Mighty Kale Salad'), false);
});

test('casing and spacing do not hide a repeat', () => {
  // The model is inconsistent about both, and these are the same order.
  assert.equal(hasRepeatedComponent('Kale Salad + kale salad'), true);
  assert.equal(hasRepeatedComponent('Kale  Salad + Kale Salad'), true);
});

test('reports each repeated item once, however many times it appears', () => {
  assert.deepEqual(repeatedComponents('A + A + A + B'), ['A']);
  assert.deepEqual(repeatedComponents('A + B + A + B'), ['A', 'B']);
});

test('never throws on malformed input, because this gates a generation path', () => {
  for (const bad of [undefined, null, 42, {}, [], '']) {
    assert.doesNotThrow(() => hasRepeatedComponent(bad as unknown));
    assert.equal(hasRepeatedComponent(bad as unknown), false);
  }
});

test('an empty dish has no components rather than one blank one', () => {
  // [''] would report a one-item order for a meal that has no dish at all.
  assert.deepEqual(dishComponents(''), []);
  assert.deepEqual(dishComponents('   '), []);
  assert.deepEqual(dishComponents(' + + '), []);
});

test('a trailing joiner does not invent an item', () => {
  assert.deepEqual(dishComponents('Hummus + '), ['Hummus']);
});

test('distinctComponents collapses repeats but keeps order and spelling', () => {
  assert.deepEqual(distinctComponents('Greek Gemista + greek gemista + Moussaka'), [
    'Greek Gemista',
    'Moussaka',
  ]);
});
