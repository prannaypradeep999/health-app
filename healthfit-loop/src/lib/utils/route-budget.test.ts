import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTE_TOTAL_BUDGET_MS,
  MEAL_SELECTION_RESERVE_MS,
  MENU_STRUCTURING_RESERVE_MS,
  OBSERVED_RESTAURANT_DISCOVERY_MS,
  withRouteBudget,
  reservingBudget,
  routeRemainingMs,
  clampToRouteBudget,
} from './route-budget';

/**
 * These are arithmetic tests over constants, which is an odd thing to write
 * until you notice that every restaurant-generation failure so far has been a
 * budget one, and each was a phase quietly given less time than it needed
 * rather than anything throwing.
 *
 * The 2026-08-19 run spent all 53s enriching menus and started selection with
 * -82ms. The 2026-08-26 run reserved 22s for a phase whose p95 is 22.8s and lost
 * a week of restaurant meals by 11ms. Both were visible in the constants before
 * they were visible in production; nothing was checking the constants.
 */

// Measured over ten bench runs at seven eating-out slots, 2026-08-26.
const SELECTION_P95_MS = 22_800;

test('the selection reserve clears the measured p95 of selection', () => {
  // The failure this exists to prevent: a reserve that promises less time than
  // the phase it reserves for actually takes. Selection is all-or-nothing — a
  // cut-off call returns [] — so a reserve below p95 means one run in twenty
  // loses the entire restaurant half of the week.
  assert.ok(
    MEAL_SELECTION_RESERVE_MS > SELECTION_P95_MS,
    `reserve ${MEAL_SELECTION_RESERVE_MS}ms does not clear selection p95 ${SELECTION_P95_MS}ms`
  );
});

test('the restaurant route budget still adds up', () => {
  // discovery + what extraction is left + what selection is promised must fit
  // inside the route, or one of them is being written a cheque the route
  // cannot cash.
  const leftForExtraction =
    ROUTE_TOTAL_BUDGET_MS - OBSERVED_RESTAURANT_DISCOVERY_MS - MEAL_SELECTION_RESERVE_MS;
  assert.ok(
    leftForExtraction > MENU_STRUCTURING_RESERVE_MS,
    `extraction gets ${leftForExtraction}ms, which cannot even cover its own ` +
      `${MENU_STRUCTURING_RESERVE_MS}ms structuring reserve — a Perplexity search ` +
      `would have zero time to answer`
  );
});

/**
 * The constraint that actually binds, and the one the test above is too coarse
 * to see.
 *
 * Menu extraction is not one call, it is six issued 1200ms apart (the interval
 * the Perplexity rate limit measures, in perplexity-client.ts). Every call
 * clamps to the route's remaining time, so the LAST restaurant in the wave —
 * opening ~6s after the phase starts — has the least. Out of whatever it has,
 * MENU_STRUCTURING_RESERVE_MS is held back for the GPT call that structures the
 * result, and the Perplexity search itself gets the rest.
 *
 * This is where raising the selection reserve is paid for, and it is paid by
 * the tail of the wave rather than by all six.
 */
const MENU_LOOKUP_WAVE_SIZE = 6;
const PERPLEXITY_MIN_INTERVAL_MS = 1200;
// Observed range of a completed Perplexity menu search, 2026-08-25 production run.
const OBSERVED_SEARCH_MIN_MS = 6_466;

test('the last restaurant in the extraction wave still has time to search', () => {
  const extractionMs =
    ROUTE_TOTAL_BUDGET_MS - OBSERVED_RESTAURANT_DISCOVERY_MS - MEAL_SELECTION_RESERVE_MS;
  const lastOpensAtMs = (MENU_LOOKUP_WAVE_SIZE - 1) * PERPLEXITY_MIN_INTERVAL_MS;
  const lastSearchWindowMs = extractionMs - lastOpensAtMs - MENU_STRUCTURING_RESERVE_MS;

  assert.ok(
    lastSearchWindowMs > 0,
    `restaurant ${MENU_LOOKUP_WAVE_SIZE} of the wave opens ${lastOpensAtMs}ms in with ` +
      `${lastSearchWindowMs}ms for its search — it is dropped before it starts, so ` +
      `the wave size is a lie and MAX_MENU_LOOKUPS should come down instead`
  );

  // Not an assertion, a record. At MEAL_SELECTION_RESERVE_MS = 26_000 this
  // window is ~2.5s against a search that has never been observed finishing in
  // under 6.5s, so the last one or two restaurants of the wave are expected to
  // be dropped. That is the known, accepted price of guaranteeing selection its
  // p95: extraction degrades one restaurant at a time, selection fails whole.
  // If this ever needs to stop being true, the lever is MAX_MENU_LOOKUPS or a
  // second selection call — not a quiet trim of the reserve.
  assert.ok(
    lastSearchWindowMs < OBSERVED_SEARCH_MIN_MS,
    `the last restaurant now gets ${lastSearchWindowMs}ms, above the ${OBSERVED_SEARCH_MIN_MS}ms ` +
      `floor — the wave tail is no longer expected to be dropped, which is good news ` +
      `and means this test should be rewritten to assert the stronger property`
  );
});

test('the route budget stays under the Vercel ceiling with room to persist', () => {
  // 60s is the ceiling; the difference is request parsing, the Prisma read and
  // the write back to Neon. A route that spends its whole budget on model calls
  // is killed while saving.
  assert.ok(ROUTE_TOTAL_BUDGET_MS < 60_000);
  assert.ok(60_000 - ROUTE_TOTAL_BUDGET_MS >= 5_000);
});

test('reservingBudget hands the reserved time to whatever runs after it', () => {
  return withRouteBudget(async () => {
    const insideReserved = await reservingBudget(26_000, async () => routeRemainingMs());
    const afterReserved = routeRemainingMs();
    assert.ok(insideReserved !== null && afterReserved !== null);
    assert.ok(
      afterReserved - insideReserved >= 25_000,
      `the reserved phase saw ${insideReserved}ms and the phase after it saw ` +
        `${afterReserved}ms — the reserve did not reach the caller`
    );
  }, 53_000);
});

test('outside a route budget nothing is clamped and nothing throws', () => {
  // Scripts, tests and background jobs run with no budget in scope. They must
  // keep their own timeouts rather than inherit a deadline of zero.
  assert.equal(routeRemainingMs(), null);
  assert.equal(clampToRouteBudget(8_000), 8_000);
});

test('clampToRouteBudget never returns more time than the route has left', () => {
  return withRouteBudget(async () => {
    assert.ok(clampToRouteBudget(90_000) <= 1_000);
    assert.equal(clampToRouteBudget(200), 200);
  }, 1_000);
});
