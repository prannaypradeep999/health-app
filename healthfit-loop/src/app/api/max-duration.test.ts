import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Every route that calls a model must declare maxDuration.
 *
 * /api/chat did not, and inherited the ~10s platform default while running up
 * to three sequential tool-calling rounds. It was killed mid-loop on every
 * request, so the assistant answered nothing in production while working fine
 * locally, where `next dev` does not enforce maxDuration.
 */
const API_ROOT = path.join(process.cwd(), 'src/app/api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

/** Routes that call OpenAI or Perplexity and therefore need the long ceiling. */
const MODEL_CALLING_ROUTES = routeFiles(API_ROOT).filter(f => {
  const src = readFileSync(f, 'utf8');
  return /openai|api\.perplexity\.ai|MODELS\./i.test(src);
});

test('the scan finds the model-calling routes at all', () => {
  assert.ok(MODEL_CALLING_ROUTES.length >= 8, `found only ${MODEL_CALLING_ROUTES.length}`);
});

test('every model-calling route declares maxDuration = 60', () => {
  const missing = MODEL_CALLING_ROUTES.filter(
    f => !/export const maxDuration\s*=\s*60/.test(readFileSync(f, 'utf8'))
  ).map(f => path.relative(process.cwd(), f));

  assert.deepEqual(missing, [], `routes without maxDuration = 60: ${missing.join(', ')}`);
});
