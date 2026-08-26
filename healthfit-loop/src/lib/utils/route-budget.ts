import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One wall-clock deadline shared by every external call inside a route.
 *
 * The problem this exists to solve: `RetryPresets.gpt.maxTotalMs` is 52s, but
 * it is applied *per `withGPTRetry` invocation*, and the AI routes make several
 * of those in sequence. The workout route alone chains a planning call, a
 * widened planning retry, the parallel detail chunks, and a top-up pass — four
 * independent 52s budgets, ~208s worst case, inside a route that declares
 * `maxDuration = 60`.
 *
 * Locally that surfaced as `POST /api/ai/workouts/generate 200 in 4.3min`,
 * because `next dev` does not enforce `maxDuration`. On Vercel the same run is
 * killed at 60s and the user gets a 504 with nothing written to the database —
 * strictly worse, because the work is lost rather than merely slow.
 *
 * Rather than thread a budget parameter through every call site (invasive, and
 * easy to forget at exactly the site that needs it), the deadline lives in
 * AsyncLocalStorage. `withRetry` reads it and clamps its own `maxTotalMs` to
 * whatever is actually left, so a call that starts 40s in gets 10s, not a
 * fresh 52s. Nested calls inherit it for free, including ones added later.
 *
 * All AI routes are `runtime = 'nodejs'`, so ALS is available. Outside a
 * budgeted route `remaining()` returns null and every caller keeps its existing
 * behaviour unchanged.
 */
const budgetStore = new AsyncLocalStorage<{ deadline: number }>();

/**
 * 60s is the Vercel Hobby ceiling and is accepted on every plan, so it is the
 * one value safe to assume without knowing the account's plan. We claim 53s of
 * it and leave the rest for the work that happens around the external calls:
 * request parsing, the Prisma read and write, and serialising the response.
 * Those are not free — the write in particular crosses the network to Neon.
 */
export const ROUTE_TOTAL_BUDGET_MS = 53_000;

/**
 * Time held back from the Perplexity menu search so the GPT call that structures
 * its output can always finish. Passed to `reservingBudget` at that call site.
 *
 * Measured on the 2026-08-25 production run: structuring succeeded at clamps of
 * 8151ms and above, and timed out at 7184ms and 5521ms. A timeout there is not a
 * slow result — `processWithGPT4` returns zero menu items, and
 * generate-restaurants then drops the restaurant from the plan entirely. Two of
 * six restaurants were lost that way, both after their Perplexity search had
 * already returned good content we had paid for.
 *
 * 9s clears the highest observed success by a small margin. Raising it further
 * starves the search itself, which took 6466-15398ms in the same run.
 *
 * It lives here rather than in perplexity-client because that module builds a
 * client at import time and throws without PERPLEXITY_API_KEY, so a test cannot
 * import a constant from it. This file has no side effects.
 */
export const MENU_STRUCTURING_RESERVE_MS = 9_000;

/**
 * Time held back from restaurant menu extraction so the meal-selection call
 * that consumes it can always finish. Passed to `reservingBudget` in
 * generate-restaurants/route.ts.
 *
 * This constant is a promise — "Phase 3 will have at least this long" — and it
 * was 22_000 while being wrong. Selection at seven eating-out slots, measured
 * over ten bench runs on 2026-08-26:
 *
 *   p50  17,370ms
 *   p95  22,800ms
 *
 * The reserve was below the p95 of the very thing it reserved for. The
 * 2026-08-26 production failure survived to 26,694ms only because extraction
 * happened to finish early and handed selection 26,705ms it had never been
 * guaranteed — and was still cut off 11ms short, returning zero meals.
 *
 * 26_000 clears the measured p95 by 14%. The cost is ~4s of extraction's ~21.5s,
 * and the trade is good in both directions: `mapWithLimit(toEnrich, 6, ...)`
 * runs all six lookups in one wave, so extraction's wall time is roughly the
 * slowest single lookup rather than the sum, and the loss costs the slowest one
 * or two restaurants rather than all six. More importantly extraction DEGRADES
 * — a restaurant whose lookup does not finish is dropped and the plan is built
 * from the rest — while selection does not degrade at all. It is one call that
 * either returns a week of meals or returns `[]`.
 *
 * Trading a phase that degrades for a phase that does not is the whole
 * argument.
 *
 * The p95 above comes from a fixture of three restaurants at three dishes each;
 * production shows the model up to six at eight. `route-budget.test.ts` pins
 * the arithmetic so raising one constant cannot silently overcommit the route.
 */
export const MEAL_SELECTION_RESERVE_MS = 26_000;

/**
 * Restaurant discovery (Places + the selection call that ranks its results)
 * measured 9,466ms on the 2026-08-26 run. Not a budget — nothing clamps to it —
 * but the third term in the route's arithmetic, recorded here so the test that
 * checks the reserves add up has a real number to check against.
 */
export const OBSERVED_RESTAURANT_DISCOVERY_MS = 9_466;

/**
 * Run `fn` under a shared deadline. Wrap the whole body of a route handler.
 */
export function withRouteBudget<T>(fn: () => Promise<T>, totalMs = ROUTE_TOTAL_BUDGET_MS): Promise<T> {
  return budgetStore.run({ deadline: Date.now() + totalMs }, fn);
}

/**
 * Milliseconds left in the enclosing route budget, or null when there is no
 * budget in scope (background jobs, scripts, tests). Can go negative; callers
 * decide what to do about that.
 */
export function routeRemainingMs(): number | null {
  const ctx = budgetStore.getStore();
  return ctx ? ctx.deadline - Date.now() : null;
}

/**
 * Run `fn` under a deadline that stops `reserveMs` short of the route's, so
 * whatever runs *after* it is guaranteed that much time.
 *
 * Needed because a plain shared deadline is first-come-first-served, and the
 * greedy phase is rarely the important one. Measured on the 2026-08-19 run:
 * restaurant menu extraction spent all 53s enriching 10 restaurants, so the
 * selection call that actually picks the meals started with `-82ms` left and
 * was refused. The route returned 200 with **0 restaurant meals** — every menu
 * fetched, nothing chosen. Enrichment starved the deliverable.
 *
 * Reserving inverts that: the enrichment phase gets "everything except what the
 * finisher needs" rather than "everything".
 */
export function reservingBudget<T>(reserveMs: number, fn: () => Promise<T>): Promise<T> {
  const outer = budgetStore.getStore();
  if (!outer) return fn();
  return budgetStore.run({ deadline: outer.deadline - reserveMs }, fn);
}

/**
 * Clamp a phase's own budget to what the route has left.
 *
 * Use for phases that are time-boxed but not routed through `withRetry` — the
 * Pexels image pass, for instance, which has its own ceiling but should not
 * spend 20s when only 6s remain.
 */
export function clampToRouteBudget(desiredMs: number): number {
  const remaining = routeRemainingMs();
  if (remaining === null) return desiredMs;
  return Math.max(0, Math.min(desiredMs, remaining));
}
