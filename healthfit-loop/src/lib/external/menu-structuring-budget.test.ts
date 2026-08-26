import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
// From route-budget rather than perplexity-client: that module constructs a
// client at import time and throws without PERPLEXITY_API_KEY.
import { MENU_STRUCTURING_RESERVE_MS, ROUTE_TOTAL_BUDGET_MS } from '../utils/route-budget';

const SRC = readFileSync(
  path.join(process.cwd(), 'src/lib/external/perplexity-client.ts'),
  'utf8'
);

test('the reserve is larger than the structuring calls that timed out', () => {
  // Observed 2026-08-25: clamps of 8151ms, 12587ms, 13683ms and 14455ms
  // succeeded; 7184ms and 5521ms timed out and lost their restaurant.
  assert.ok(
    MENU_STRUCTURING_RESERVE_MS > 8151,
    `${MENU_STRUCTURING_RESERVE_MS}ms would not have saved the 8151ms call`
  );
});

test('the reserve leaves the search phase usable time', () => {
  // Perplexity itself took 6466-15398ms in the same run. Reserving so much
  // that the search cannot run trades one failure for another.
  assert.ok(MENU_STRUCTURING_RESERVE_MS < 20_000);
  assert.ok(
    MENU_STRUCTURING_RESERVE_MS < ROUTE_TOTAL_BUDGET_MS / 2,
    'a reserve worth half the whole route is no longer a reserve'
  );
});

test('the Perplexity search runs inside a reserving budget', () => {
  assert.match(SRC, /reservingBudget\(\s*MENU_STRUCTURING_RESERVE_MS/);
});
