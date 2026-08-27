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

/**
 * The invocation split, guarded at the source.
 *
 * route-budget.test.ts computes that all six restaurants in the extraction wave
 * now clear the observed search cost. But that computation is arithmetic over
 * constants — it describes the budget the route is SUPPOSED to have, and it goes
 * on passing even if the route reverts to reserving selection's time out of
 * extraction's. These tests are the other half: they check the route actually
 * spends its budget the way the arithmetic assumes.
 *
 * What went wrong without them: extraction issues six Perplexity lookups 1200ms
 * apart, each clamped to the route's remaining time. Holding back 26s for a
 * selection call later in the SAME function took that 26s out of the tail of the
 * wave — windows of 9716, 8516, 7314, 6116, 4916, 3716ms against a search that
 * needs ~8516ms. One of six returned a menu. Nine discovered restaurants became
 * one, and the user's whole week came from it.
 */
test('extraction does not reserve time for selection any more', () => {
  // The specific regression: selection runs in a different invocation now, so
  // reserving its time here takes it from the wave and gives it to nobody.
  assert.doesNotMatch(
    SRC,
    /reservingBudget\s*\(\s*MEAL_SELECTION_RESERVE_MS/,
    'menu extraction is reserving MEAL_SELECTION_RESERVE_MS again. Selection no ' +
      'longer runs in this invocation, so this reserve is taken out of the tail of ' +
      'the six-wide Perplexity wave and handed to nothing — the exact shape of the ' +
      'failure where 9 restaurants became 1'
  );
  assert.doesNotMatch(
    SRC,
    /import\s*\{[^}]*\bMEAL_SELECTION_RESERVE_MS\b/,
    'generate-restaurants imports MEAL_SELECTION_RESERVE_MS again'
  );
});

test('extraction hands selection to its own invocation', () => {
  // Vercel Hobby caps a single function at 60s (the account was confirmed on
  // hobby, 2026-08-27), and discovery + extraction + selection do not fit in
  // one. They do fit in two, because the cap is per invocation.
  assert.match(
    SRC,
    /internalFetch\(\s*'\/api\/ai\/meals\/generate-restaurants'/,
    'nothing hands off to the selection phase — the route re-enters itself for it'
  );
  assert.match(SRC, /after\(async \(\) => \{\s*await triggerSelectionPhase/);
});

test('the selection handoff carries the caller cookies', () => {
  // Phase 2 re-reads the survey row to rebuild nutrition targets. Without the
  // cookies it authenticates as nobody, finds no survey, and 400s — which would
  // take the home-meal hop down with it, since that hop lives on the far side
  // of selection.
  const call = SRC.match(/async function triggerSelectionPhase[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(call, 'triggerSelectionPhase is gone');
  assert.match(call, /'Cookie'/, 'the selection handoff sends no Cookie header');
  assert.match(call, /survey_id=\$\{surveyId\}/);
});

test('the re-entrant route cannot loop', () => {
  // Phase 2 is entered on the presence of restaurantMenuData in the body, and
  // must never trigger another hop. One call site, in the phase-1 branch.
  const callSites = SRC.match(/\btriggerSelectionPhase\s*\(/g) ?? [];
  assert.equal(
    callSites.length,
    2,
    `triggerSelectionPhase appears ${callSites.length} times (expected 2: the ` +
      `definition and a single call in the extraction branch). A second call site ` +
      `risks an invocation loop, which on a metered platform is expensive before it ` +
      `is noticeable`
  );
  assert.match(
    SRC,
    /const isSelectionPhase = Array\.isArray\(requestData\.restaurantMenuData\)/,
    'the phase marker changed shape; the loop guard above no longer means anything'
  );
});

test('the phases that ran in the other invocation still report their timings', () => {
  // Phase 2 writes restaurantTimings, but discovery and extraction happened in
  // phase 1. Locals initialised to 0 in the phase-2 branch are still 0 at write
  // time, so the row recorded {"discovery":"0ms","menuExtraction":"0ms"} — the
  // two phases whose cost caused the invocation split in the first place became
  // invisible in the only place anyone would look for it.
  //
  // Same reasoning as restaurantsSearched: reporting metadata that only phase 1
  // can know has to travel across the hop.
  const call = SRC.match(/async function triggerSelectionPhase[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(call, 'triggerSelectionPhase is gone');
  assert.match(
    call,
    /restaurantDiscoveryTime/,
    'the discovery timing is not sent across the hop, so phase 2 records it as 0ms'
  );
  assert.match(
    call,
    /menuExtractionTime/,
    'the extraction timing is not sent across the hop, so phase 2 records it as 0ms'
  );

  const phase2 = SRC.match(/if \(isSelectionPhase\) \{[\s\S]*?\n    \} else \{/)?.[0] ?? '';
  assert.ok(phase2, 'the phase-2 branch changed shape');
  assert.match(
    phase2,
    /restaurantDiscoveryTime = requestData\.restaurantDiscoveryTime/,
    'phase 2 never reads the carried discovery timing back out of the body'
  );
  assert.match(
    phase2,
    /menuExtractionTime = requestData\.menuExtractionTime/,
    'phase 2 never reads the carried extraction timing back out of the body'
  );
});
