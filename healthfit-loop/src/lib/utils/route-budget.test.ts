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

/**
 * What a Perplexity menu search actually costs, from the 2026-08-27 production
 * run (deployment 37aa9aa, meal plan cmtavzc620001ic04k0arbt0x). This is the
 * number the earlier version of this file got wrong, and the error mattered.
 *
 * The one search that completed took 6971ms. But two others were cut off at
 * 7314ms and 8516ms — that is, they were still running when their clamp
 * expired. So 6971ms is what a search can cost, not what it does cost, and a
 * window has to clear the observed cut-offs to be worth opening at all.
 */
const OBSERVED_SEARCH_COMPLETED_MS = 6_971;
const OBSERVED_SEARCH_CUTOFF_MS = 8_516;

/** The window the Nth restaurant of the wave gets for its Perplexity search. */
function searchWindowForPosition(position: number): number {
  const extractionMs =
    ROUTE_TOTAL_BUDGET_MS - OBSERVED_RESTAURANT_DISCOVERY_MS - MEAL_SELECTION_RESERVE_MS;
  return extractionMs - position * PERPLEXITY_MIN_INTERVAL_MS - MENU_STRUCTURING_RESERVE_MS;
}

test('at least one restaurant in the extraction wave can finish a search', () => {
  // The floor under the whole restaurant feature. Menu extraction is what turns
  // a discovered restaurant into an orderable one; a restaurant with no menu is
  // dropped. If no position in the wave clears the cost of a search, the route
  // returns zero restaurants with links and the restaurant half of the week is
  // empty regardless of how well selection is doing.
  const viable = Array.from({ length: MENU_LOOKUP_WAVE_SIZE }, (_, i) =>
    searchWindowForPosition(i)
  ).filter(ms => ms >= OBSERVED_SEARCH_CUTOFF_MS);

  assert.ok(
    viable.length >= 1,
    `no position in the ${MENU_LOOKUP_WAVE_SIZE}-wide wave gets the ${OBSERVED_SEARCH_CUTOFF_MS}ms ` +
      `a search has been observed needing — every restaurant would be dropped and the ` +
      `feature returns nothing`
  );

  // How close that is: the head of the wave clears the cut-off by 18ms at the
  // current constants. Adding 2s to MEAL_SELECTION_RESERVE_MS takes this count
  // to zero. The restaurant feature is one small budget change away from
  // returning nothing at all, which is why the reserve cannot be raised again
  // without first lowering what selection actually needs.
  assert.ok(
    viable[0] - OBSERVED_SEARCH_CUTOFF_MS < 1_000,
    `the head of the wave now clears the cut-off by ${viable[0] - OBSERVED_SEARCH_CUTOFF_MS}ms ` +
      `rather than the 18ms measured on 2026-08-27 — the margin has genuinely improved and ` +
      `this guard should be retightened around the new value`
  );
});

/**
 * The measured cost of the current constants, recorded rather than asserted so
 * that it is visible and so that improving it is visible too.
 *
 * On 2026-08-27 the wave issued six searches with clamps descending in exact
 * 1200ms steps — 9716, 8516, 7314, 6116, 4916, 3716 — and exactly ONE returned
 * a menu. Nine restaurants were discovered, one survived with ordering links,
 * and all 14 meals came from it. The variety check then passed vacuously:
 * "1 of 1 available restaurant(s) across 14 meals, max 14/14 ✓".
 *
 * An earlier version of this file called that "the last one or two restaurants
 * of the wave are expected to be dropped" and filed it as the accepted price of
 * guaranteeing selection its p95. That was wrong by a factor of three, and
 * because it read as accepted it sent the investigation at the link prober
 * instead of at the budget. The starvation is the primary cause of
 * no-usable-link; DoorDash/UberEats 403ing datacenter IPs is real but secondary.
 *
 * The lever is not a quiet trim of MEAL_SELECTION_RESERVE_MS — extraction
 * degrades one restaurant at a time but selection fails whole, so a reserve
 * below selection's true p95 trades a partial loss for a total one. The reserve
 * can only come down if selection's actual demand comes down with it.
 */
test('the measured survivor count of the extraction wave has not silently changed', () => {
  const windows = Array.from({ length: MENU_LOOKUP_WAVE_SIZE }, (_, i) =>
    searchWindowForPosition(i)
  );
  const clearsCutoff = windows.filter(ms => ms >= OBSERVED_SEARCH_CUTOFF_MS).length;
  const clearsBestCase = windows.filter(ms => ms >= OBSERVED_SEARCH_COMPLETED_MS).length;

  assert.equal(
    clearsCutoff,
    1,
    `${clearsCutoff} of ${MENU_LOOKUP_WAVE_SIZE} positions now clear the ${OBSERVED_SEARCH_CUTOFF_MS}ms ` +
      `cut-off (was 1). If this went up the budget work is paying off and the number here ` +
      `should be raised; if it went down the restaurant half is about to return nothing`
  );
  assert.equal(
    clearsBestCase,
    2,
    `${clearsBestCase} of ${MENU_LOOKUP_WAVE_SIZE} positions clear even the best observed ` +
      `search cost of ${OBSERVED_SEARCH_COMPLETED_MS}ms (was 2)`
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
