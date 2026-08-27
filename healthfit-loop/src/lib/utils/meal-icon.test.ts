import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealIcon, DEFAULT_MEAL_ICON } from './meal-icon';
import { MEAL_VISUAL_SIZES } from '../../components/ui/MealVisual';

test('a dish keyword beats the cuisine, because it is more specific', () => {
  // A salad at an Italian restaurant is a salad, not a plate of pasta.
  assert.equal(mealIcon({ dish: 'Tuscan Kale Salad', cuisine: 'Italian' }), '🥗');
});

test('reads the restaurant spelling and the home-meal spelling alike', () => {
  assert.equal(mealIcon({ dish: 'Margherita Pizza' }), '🍕');
  assert.equal(mealIcon({ name: 'Margherita Pizza' }), '🍕');
});

test('reads the description, because a dish name can say nothing', () => {
  // The exact failure that motivated reading descriptions elsewhere in this
  // repo: "Bento Box" is not a food word.
  assert.equal(mealIcon({ dish: 'Bento Box', description: 'grilled salmon with rice' }), '🐟');
});

test('falls back to cuisine when no dish keyword matches', () => {
  assert.equal(mealIcon({ dish: 'Chef Special', cuisine: 'Mexican' }), '🌮');
  assert.equal(mealIcon({ dish: 'Chef Special', cuisine: 'Indian' }), '🍛');
});

test('cuisine matching tolerates the casing and spacing the model emits', () => {
  assert.equal(mealIcon({ dish: 'House Plate', cuisine: '  MEDITERRANEAN ' }), '🥙');
  assert.equal(mealIcon({ dish: 'House Plate', cuisine: 'Middle Eastern' }), '🥙');
});

test('falls back to meal type when there is no dish or cuisine signal', () => {
  assert.equal(mealIcon({ dish: 'Chef Special' }, 'breakfast'), '🍳');
  assert.equal(mealIcon({}, 'lunch'), '🥪');
});

test('always returns a glyph rather than blanking the card', () => {
  assert.equal(mealIcon(undefined), DEFAULT_MEAL_ICON);
  assert.equal(mealIcon(null), DEFAULT_MEAL_ICON);
  assert.equal(mealIcon({}), DEFAULT_MEAL_ICON);
  assert.equal(mealIcon({ dish: 'Chef Special' }, 'brunch'), DEFAULT_MEAL_ICON);
});

test('never throws on hostile or malformed input', () => {
  // This feeds a render path; an exception here blanks a meal card.
  assert.doesNotThrow(() => mealIcon({ dish: 123, cuisine: {} } as unknown));
  assert.doesNotThrow(() => mealIcon('a string' as unknown));
  assert.doesNotThrow(() => mealIcon({ cuisine: 'constructor' }));
  assert.equal(mealIcon({ cuisine: 'constructor' }), DEFAULT_MEAL_ICON);
});

test('a prototype key cannot smuggle a function in where a glyph is expected', () => {
  assert.equal(typeof mealIcon({ dish: 'x', cuisine: 'toString' }), 'string');
});

test('word boundaries stop a substring from hijacking the icon', () => {
  // "Codfish" should not match on a bare "cod", and "Beefsteak Tomato Salad"
  // is a salad. Both are cases where a naive includes() picks the wrong icon.
  assert.equal(mealIcon({ dish: 'Beefsteak Tomato Salad' }), '🥗');
});

test('every size variant sets both a box and a glyph', () => {
  // Box and glyph are one decision. A variant that sets only one of them is how
  // the sizes drifted out of proportion when they lived at the call sites.
  for (const [name, variant] of Object.entries(MEAL_VISUAL_SIZES)) {
    assert.ok(variant.box.trim(), `${name} has no box classes`);
    assert.ok(variant.glyph.trim(), `${name} has no glyph classes`);
  }
});

test('every size variant is square, so no card renders a letterboxed icon', () => {
  // The lg variant was previously `w-full ... h-48` on mobile: a full-width
  // 192px panel sized to flatter a photograph, with a small glyph adrift in it.
  for (const [name, { box }] of Object.entries(MEAL_VISUAL_SIZES)) {
    const widths = box.match(/(?:^|\s)(?:sm:)?w-(\S+)/g) ?? [];
    const heights = box.match(/(?:^|\s)(?:sm:)?h-(\S+)/g) ?? [];
    assert.equal(
      widths.length,
      heights.length,
      `${name} has ${widths.length} width(s) but ${heights.length} height(s)`
    );
    widths.forEach((w, i) => {
      assert.equal(
        w.trim().replace('w-', ''),
        heights[i].trim().replace('h-', ''),
        `${name} is not square at breakpoint ${i}`
      );
    });
  }
});
