import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROCERY_CONSOLIDATION_P95_MS, GROCERY_CATEGORIES } from './grocery-consolidation';
import { ROUTE_TOTAL_BUDGET_MS } from '@/lib/utils/route-budget';

/**
 * Grocery consolidation starved for as long as it lived at the end of
 * generate-home, and the failure was silent: the route fell back to an
 * ingredient backfill and still returned 200 with a grocery list, just one full
 * of unshoppable rows like "ground turkey oz sauted in a nonstick pan", which
 * generate-groceries then priced verbatim.
 *
 * These are source-text and arithmetic guards rather than behavioural tests —
 * the call itself is a network round trip. What they pin is the reason the move
 * happened, so putting it back is a failing test rather than a quiet regression.
 */

const root = join(__dirname, '../../..');
const homeRoute = readFileSync(
  join(root, 'src/app/api/ai/meals/generate-home/route.ts'),
  'utf8'
);
const groceriesRoute = readFileSync(
  join(root, 'src/app/api/ai/meals/generate-groceries/route.ts'),
  'utf8'
);

test('generate-home no longer makes the consolidation call', () => {
  // The whole point of the move. createGroceryPrompt is the tell: it builds the
  // consolidation prompt and has no other use.
  assert.doesNotMatch(
    homeRoute,
    /createGroceryPrompt/,
    'generate-home is building a consolidation prompt again — that is the call that starved'
  );
});

test('generate-home still always writes some grocery list', () => {
  // The fallback is what makes the move safe: it is pure, cannot fail, and
  // means the plan is never persisted without a list at all.
  assert.match(homeRoute, /buildFallbackGroceryList\(allMeals\)/);
});

test('generate-groceries runs consolidation alongside the store search', () => {
  assert.match(groceriesRoute, /consolidateGroceryList/);
  // Sequential would add the full ~17.7s to the route instead of hiding it
  // behind the store search, which is what makes the reserve arithmetic below
  // hold.
  assert.match(
    groceriesRoute,
    /Promise\.all\(\[\s*[\s\S]{0,200}getLocalGroceryStores[\s\S]{0,200}consolidateGroceryList/,
    'consolidation should share a Promise.all with the store search, not follow it'
  );
});

test('consolidation fits in the window the store search already had', () => {
  // generate-groceries reserves 28s for the price lookup, so the parallel phase
  // gets whatever is left. Consolidation has to fit inside that or it becomes
  // the new starved tail phase — the exact bug being fixed.
  const PRICE_RESERVE_MS = 28_000;
  const parallelWindow = ROUTE_TOTAL_BUDGET_MS - PRICE_RESERVE_MS;

  assert.match(
    groceriesRoute,
    new RegExp(`reservingBudget\\(${PRICE_RESERVE_MS / 1000}_000`),
    'the price reserve moved; this arithmetic is stale'
  );
  assert.ok(
    GROCERY_CONSOLIDATION_P95_MS < parallelWindow,
    `consolidation p95 ${GROCERY_CONSOLIDATION_P95_MS}ms does not fit the ${parallelWindow}ms parallel window`
  );
});

test('the measured p95 is the one the comment argues from', () => {
  // A constant that drifts from its own justification is worse than no comment.
  assert.equal(GROCERY_CONSOLIDATION_P95_MS, 17_700);
});

test('every category the pricing route reads is one consolidation fills', () => {
  // generate-groceries flattens exactly these six buckets. A category named in
  // one place and not the other silently drops every item in it.
  for (const cat of GROCERY_CATEGORIES) {
    assert.match(
      groceriesRoute,
      new RegExp(`'${cat}'`),
      `generate-groceries never reads the "${cat}" category that consolidation fills`
    );
  }
});
