import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The relay: survey -> restaurants -> home meals -> groceries, each hop its own
 * 60s function. Before this, survey tried to own the whole chain inside one
 * orphaned promise and nothing past the first hop ever ran.
 */
const SRC = readFileSync(
  path.join(process.cwd(), 'src/app/api/ai/meals/generate-restaurants/route.ts'),
  'utf8'
);

test('restaurant generation triggers the home-meal hop', () => {
  assert.match(SRC, /generate-home/);
});

test('the handoff is registered with after(), not orphaned', () => {
  assert.match(SRC, /import \{[^}]*\bafter\b[^}]*\} from 'next\/server'/);
  assert.match(SRC, /after\(\s*triggerHomeMeals/);
});
