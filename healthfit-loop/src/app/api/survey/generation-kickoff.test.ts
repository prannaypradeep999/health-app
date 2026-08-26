import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The survey route used to start generation in a floating `(async () => {})()`
 * and return immediately. On Vercel the instance is reclaimed once the response
 * is sent, so the promise never resumed past its first await: restaurants were
 * dispatched, and home meals and groceries were never triggered at all. It was
 * invisible locally, where the process stays alive.
 *
 * A static check because the failure is structural — the route cannot be
 * invoked in a unit test without Prisma, OpenAI and a live base URL.
 */
const SRC = readFileSync(path.join(process.cwd(), 'src/app/api/survey/route.ts'), 'utf8');

test('the survey route declares a duration for the work it now awaits', () => {
  assert.match(SRC, /export const maxDuration\s*=\s*60/);
});

test('background generation is registered with after(), not orphaned', () => {
  assert.match(SRC, /import \{[^}]*\bafter\b[^}]*\} from 'next\/server'/);
  assert.match(SRC, /after\(/);
});

test('no floating async IIFE remains', () => {
  assert.doesNotMatch(SRC, /\}\)\(\);/, 'a self-invoking async block is still being orphaned');
});

test('the survey route no longer tries to own the home-meal hop', () => {
  // Restaurants alone take ~53s. Chaining home meals behind them inside one
  // 60s function cannot fit; generate-restaurants owns that hop now.
  assert.doesNotMatch(SRC, /triggerHomeMealGeneration\(/);
});
