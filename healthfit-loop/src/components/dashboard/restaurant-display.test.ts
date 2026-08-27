import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Two display bugs on the Restaurants tab, both of the same family: the code
 * read a field the pipeline never wrote, and nothing failed loudly.
 *
 * 1. The cuisines badge was gated on `metadata?.cuisines &&`. The generator
 *    never writes `metadata.cuisines`, and MealPlanPage defaults it to `[]` on
 *    the way in — and `[]` is truthy. So the guard passed, `[].join(' • ')`
 *    produced the empty string, and the badge rendered as the bare word
 *    "cuisines" with nothing in front of it.
 *
 * 2. The restriction banner listed one bullet per violating meal slot. One
 *    dish scheduled on four days produced four byte-identical bullets, which
 *    reads as a broken banner rather than as one dish flagged four times.
 */
const DIR = path.join(process.cwd(), 'src/components/dashboard');
const SECTION = readFileSync(path.join(DIR, 'RestaurantListSection.tsx'), 'utf8');
const PAGE = readFileSync(path.join(DIR, 'MealPlanPage.tsx'), 'utf8');

test('the cuisines badge is gated on length, not on the array being present', () => {
  // `metadata?.cuisines &&` is the exact shape that shipped the empty badge:
  // an empty array passes it. Anything that reaches for `.length` cannot.
  assert.match(SECTION, /displayCuisines\.length > 0 && \(/);
  assert.doesNotMatch(SECTION, /\{metadata\?\.cuisines && \(/);
});

test('the badge falls back to the cuisines of the restaurants actually listed', () => {
  // The fallback has to come from data we already render on the cards, so the
  // badge cannot claim a cuisine that is not on screen.
  assert.match(SECTION, /const displayCuisines/);
  assert.match(SECTION, /restaurants \?\? \[\]\)\.map\(r => r\.cuisine\)/);
});

test('a single ordering platform is not labelled "1 platforms"', () => {
  assert.match(SECTION, /linksFound === 1 \? 'platform' : 'platforms'/);
});

test('restriction violations are collapsed on the text the reader sees', () => {
  // Grouping on the rendered triple is what makes duplicates disappear; a key
  // that included the day would group nothing.
  assert.match(PAGE, /const key = `\$\{v\.mealName\}\|\$\{v\.violation\}\|\$\{v\.restriction\}`/);
});

test('a violation spanning several days says so instead of repeating', () => {
  assert.match(PAGE, /days\.size > 1 &&/);
  assert.match(PAGE, /on \{days\.size\} days/);
});
