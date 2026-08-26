# Production Generation Failures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the post-survey generation chain actually finish on Vercel, make the chat assistant answer, and stop showing ordering platforms we cannot verify.

**Architecture:** Four independent defects, all found in live runtime logs from the
`fytr-app` deployment on 2026-08-25. Three are one-to-twenty-line changes at a single
choke point each. The fourth (the generation chain) is a two-hop restructure that
copies a pattern already proven elsewhere in this same repo. No new dependencies, no
schema changes, no UI changes.

**Tech Stack:** Next.js 16.1, `after()` from `next/server`, Node's built-in test runner
via `npx tsx --test`, Zod, Vercel serverless (60s function ceiling).

**Spec:** No separate spec document. The evidence is the runtime log analysis recorded
in §Evidence below, captured via `vercel logs https://fytr-app.vercel.app --json` on
2026-08-25 against deployment `fytr-2qrhj5b3l`.

## Global Constraints

- **Never** run `prisma migrate reset`, `prisma db push`, or the seed script. `DATABASE_URL` is shared production data on Neon.
- `npx tsc --noEmit` currently reports **exactly 29 pre-existing errors**. Do not fix them incidentally; do not add to them. 29 in, 29 out.
- `next build` has `ignoreBuildErrors` on. Compiling is not verification.
- Test command (globs MUST be quoted for zsh): `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"`
- Baseline before this plan: **290 tests passing**.
- Tests live next to the module they cover, not in a separate tree.
- `ROUTE_TOTAL_BUDGET_MS` is `53_000` and `maxDuration` is `60` on every AI route. Both are load-bearing against the Vercel Hobby ceiling. Do not raise either.
- Commit after each task with a message naming it.
- Standing user constraint: prefer a small, contained change over one that could break the whole app.

---

## Evidence

All four defects are grounded in one production run (survey submitted 2026-08-26T04:26:51Z).

**E1 — The generation chain dies silently.** These log lines appear:

```
[FINAL] ✅ Created coordinated meal plan: cmt9ldt760003kw04r2o3cqnh
[FINAL] 🏪 Starting restaurant generation first (sequential)...
[RESTAURANT-TRIGGER] 🏪 Starting restaurant generation (BACKGROUND)...
```

and then nothing. `[RESTAURANT-TRIGGER] ✅ Restaurant meals generated`,
`[FINAL] 📊 Restaurant calories extracted`, `[FINAL] 🏠 Starting home meal generation`,
`[HOME-MEAL-TRIGGER]` and every `[GROCERY*]` marker are **absent from the entire capture**.

Cause: `src/app/api/survey/route.ts:295-348` is a floating `(async () => { ... })();`
IIFE. It is neither awaited nor registered with `after()`. The handler returns its
response at line 373, Vercel reclaims the instance, and the orphaned promise never
resumes past its first `await`.

This exact bug was already found and fixed once in this repo, in
`src/app/api/ai/meals/generate-home/route.ts:1684` — `after(triggerGroceryPriceLookup(...))`
— whose comment reads: *"Orphaning this promise dropped prices whenever the platform
reclaimed the instance first — invisibly, since it always completes locally."* The
survey route has the identical bug and never received the identical fix.

**E2 — `/api/chat` has no `maxDuration`.** Every other AI route sets `maxDuration = 60`:
`ai/analyze-workout`, `ai/meals/generate-groceries`, `ai/meals/generate-home`,
`ai/meals/generate-restaurants`, `ai/profiles/food`, `ai/profiles/workout`,
`ai/recipes/generate`, `ai/workouts/generate`. `src/app/api/chat/route.ts` sets only
`runtime = 'nodejs'`, so it inherits the platform default (~10s) while running up to
**3 sequential** non-streaming tool-calling rounds (`maxToolRounds = 3`, line 288)
plus Prisma reads between them.

**E3 — DoorDash links are dropped 3 times out of 3.** `dropped unreachable links: doordash`
fired for Falafelland, La Oaxaqueña and Piccolo Forno — every restaurant where the model
found one. Measured directly:

```
GET https://www.doordash.com/  -> 403   (our UA and a Chrome UA alike)
GET https://www.ubereats.com/  -> 403
GET https://www.grubhub.com/   -> 200
```

`probe()` in `src/lib/external/link-check.ts` retries GET on 403, receives 403 again, and
`alive: res.ok` renders 403 as dead. So a valid DoorDash link is discarded as broken.
GrubHub answers 200 and survives.

**E4 — The last restaurants are starved of structuring time.** Menu structuring clamps
observed, in order: `14455ms, 13683ms, 12587ms, 8151ms, 7184ms, 5521ms`. The three
largest succeeded. The `7184ms` and `5521ms` calls timed out, returned 0 menu items, and
their restaurants were then dropped entirely:

```
[MENU-EXTRACTION]   - 2 with no menu found (removing): New Thai Elephant, Kolapasi South Indian cuisine
```

Both had already received good Perplexity content (2542 and 2715 characters, 15 citations
each). The route paid for the search and discarded the result at the last step. Six
restaurants enriched, four delivered.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/app/api/chat/route.ts` | Chat assistant endpoint | Add `maxDuration` export (Task 1) |
| `src/app/api/max-duration.test.ts` | **New.** Guard that every AI route declares a duration | Created (Task 1) |
| `src/lib/external/link-check.ts` | Platform knowledge + link probing | Add `DISPLAYED_PLATFORMS` + `suppressUndisplayablePlatforms` (Task 2) |
| `src/lib/external/link-check.test.ts` | Tests for the above | Extended (Task 2) |
| `src/app/api/ai/meals/generate-restaurants/route.ts` | Restaurant pipeline | Filter platforms before probing (Task 2); hand off to home meals (Task 4) |
| `src/app/api/survey/route.ts` | Survey submit + generation kickoff | `after()` + `maxDuration`; stop owning the whole chain (Task 3) |
| `src/lib/external/perplexity-client.ts` | Perplexity search + GPT structuring | Reserve structuring budget (Task 5) |

Tasks 1, 2 and 5 are fully independent. Task 4 depends on Task 3.

---

### Task 1: Give the chat assistant a real time limit

The chat assistant currently cannot answer anything. It is the only AI route without a
`maxDuration`, so it is killed at the platform default (~10s) partway through its
tool-calling loop.

**Files:**
- Modify: `src/app/api/chat/route.ts` (near the top, beside `export const runtime = 'nodejs'`)
- Create: `src/app/api/max-duration.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Write the failing test**

This is a static guard rather than a unit test, deliberately. Importing a route module
pulls in Prisma and the OpenAI client, which the test runner should not do. Reading the
source text is enough to catch the regression, and it covers every AI route at once
rather than only the one we are fixing today.

Create `src/app/api/max-duration.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx tsx --test "src/app/api/max-duration.test.ts"
```

Expected: FAIL, listing `src/app/api/chat/route.ts` as the one route missing `maxDuration = 60`.

- [ ] **Step 3: Add the declaration**

In `src/app/api/chat/route.ts`, find this line (it is around line 12):

```ts
export const runtime = 'nodejs';
```

Replace it with:

```ts
export const runtime = 'nodejs';

/**
 * The tool-calling loop below runs up to `maxToolRounds` (3) sequential
 * non-streaming completions, with Prisma reads between them. Without this
 * declaration the route inherited the ~10s platform default and was killed
 * mid-loop on every production request, so the assistant answered nothing.
 * 60 is the Vercel Hobby ceiling and matches every other AI route here.
 */
export const maxDuration = 60;
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx tsx --test "src/app/api/max-duration.test.ts"
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full suite and the type check**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | tail -15
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 292 passing (290 baseline + 2 new). `tsc` reports exactly **29**.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts src/app/api/max-duration.test.ts
git commit -m "fix(chat): declare maxDuration so the tool-calling loop can finish"
```

---

### Task 2: Show only the ordering platforms we can actually verify

DoorDash and Uber Eats answer 403 to datacenter IPs, so `probe()` cannot distinguish
"this link is dead" from "this platform refuses to talk to servers". Every DoorDash link
is currently discarded. Rather than guess, show only the platforms whose liveness we can
genuinely establish — GrubHub and the restaurant's own site — and suppress the other two
at a single, clearly-labelled switch that can be flipped back in one line.

This also buys back budget for Task 5: two fewer HTTP probes per restaurant, six
restaurants per run, inside the phase that is running out of time.

**Files:**
- Modify: `src/lib/external/link-check.ts` (add to the exports near `PLATFORM_HOSTS`)
- Modify: `src/lib/external/link-check.test.ts`
- Modify: `src/app/api/ai/meals/generate-restaurants/route.ts` (the `candidateLinks` block, ~line 393)

**Interfaces:**
- Consumes: `isUsableLink` (already exported from `link-check.ts`).
- Produces: `DISPLAYED_PLATFORMS: readonly string[]` and
  `suppressUndisplayablePlatforms(links: Record<string, string | null | undefined>): Record<string, string | null>`.
  Task 5 does not use these; nothing else depends on them.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/external/link-check.test.ts`:

```ts
test('suppression keeps grubhub and direct', () => {
  const out = suppressUndisplayablePlatforms({
    doordash: 'https://www.doordash.com/store/x',
    ubereats: 'https://www.ubereats.com/store/x',
    grubhub: 'https://www.grubhub.com/restaurant/x',
    direct: 'https://example.com',
  });
  assert.equal(out.grubhub, 'https://www.grubhub.com/restaurant/x');
  assert.equal(out.direct, 'https://example.com');
});

test('suppression nulls the platforms that 403 datacenter IPs', () => {
  // Not "drops": OrderingLinks is .strict() and every key is required, so a
  // missing key is a schema violation downstream. Null is the schema's way of
  // saying "no link", and it is what the UI already skips.
  const out = suppressUndisplayablePlatforms({
    doordash: 'https://www.doordash.com/store/x',
    ubereats: 'https://www.ubereats.com/store/x',
    grubhub: null,
    direct: null,
  });
  assert.equal(out.doordash, null);
  assert.equal(out.ubereats, null);
  assert.ok('doordash' in out, 'the key must survive even though the value does not');
  assert.ok('ubereats' in out);
});

test('suppression leaves an already-empty object alone', () => {
  assert.deepEqual(suppressUndisplayablePlatforms({}), {});
});

test('DISPLAYED_PLATFORMS is the single switch for this policy', () => {
  assert.deepEqual([...DISPLAYED_PLATFORMS].sort(), ['direct', 'grubhub']);
});
```

Add `DISPLAYED_PLATFORMS` and `suppressUndisplayablePlatforms` to the existing import
at the top of that test file.

- [ ] **Step 2: Run them and watch them fail**

```bash
npx tsx --test "src/lib/external/link-check.test.ts"
```

Expected: FAIL — `suppressUndisplayablePlatforms is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/external/link-check.ts`, directly below the `PLATFORM_HOSTS` declaration, add:

```ts
/**
 * The platforms whose links we are willing to put in front of a user.
 *
 * Measured 2026-08-25 from a Vercel function:
 *
 *   GET https://www.doordash.com/  -> 403   (our UA and a Chrome UA alike)
 *   GET https://www.ubereats.com/  -> 403
 *   GET https://www.grubhub.com/   -> 200
 *
 * DoorDash and Uber Eats refuse datacenter IPs outright, so `probe` cannot tell
 * a dead link from a live one it is not allowed to see. In production this
 * dropped every DoorDash link the model found — 3 of 3 in the observed run —
 * while reporting them as "unreachable", which was a guess dressed as a fact.
 *
 * Rather than show links we cannot stand behind, we show the two we can check.
 * This is deliberately a policy switch and not a code change: when there is a
 * verification path for the other two (a residential egress, an official API,
 * or treating 403 as `unverified` rather than `contradicted` and labelling it
 * in the UI), add them back here and the rest of the pipeline follows.
 */
export const DISPLAYED_PLATFORMS: readonly string[] = ['grubhub', 'direct'];

/**
 * Null out every platform not in DISPLAYED_PLATFORMS, preserving the key set.
 *
 * Keys are preserved rather than deleted because `OrderingLinks` in
 * src/lib/ai/schemas/shared.ts is `.strict()` with all four keys required —
 * a missing key is a schema violation, whereas null is how that schema spells
 * "no link". The UI already skips nulls.
 */
export function suppressUndisplayablePlatforms(
  links: Record<string, string | null | undefined>
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [platform, url] of Object.entries(links ?? {})) {
    out[platform] = DISPLAYED_PLATFORMS.includes(platform) && isUsableLink(url) ? url.trim() : null;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx tsx --test "src/lib/external/link-check.test.ts"
```

Expected: PASS, including the 4 new tests.

- [ ] **Step 5: Apply it in the restaurant pipeline**

In `src/app/api/ai/meals/generate-restaurants/route.ts`, find the `candidateLinks`
declaration (search for `const candidateLinks = {`). It currently reads:

```ts
      const candidateLinks = {
        ...orderingLinks,
        direct: isUsableLink(placesWebsite) ? placesWebsite : orderingLinks.direct ?? null,
      };
```

Replace with:

```ts
      // Suppressed before probing, not after: a platform we will not display is
      // not worth an HTTP request from inside the tightest phase of the route
      // budget. This removes two probes per restaurant.
      const candidateLinks = suppressUndisplayablePlatforms({
        ...orderingLinks,
        direct: isUsableLink(placesWebsite) ? placesWebsite : orderingLinks.direct ?? null,
      });
```

Add `suppressUndisplayablePlatforms` to the existing import from
`@/lib/external/link-check` in that file. If `isUsableLink` is imported from elsewhere
there, leave that import alone.

- [ ] **Step 6: Run the full suite and the type check**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | tail -15
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 296 passing. `tsc` reports exactly **29**.

- [ ] **Step 7: Commit**

```bash
git add src/lib/external/link-check.ts src/lib/external/link-check.test.ts src/app/api/ai/meals/generate-restaurants/route.ts
git commit -m "fix(links): show only platforms we can verify, not ones that 403 our probe"
```

---

### Task 3: Stop the survey route orphaning the generation chain

`/api/survey` starts generation in a floating IIFE and returns immediately. Vercel
reclaims the instance and the promise never resumes, so nothing after the first `await`
ever runs. This is why no home meals and no groceries exist.

The fix has two halves, and both are needed. `after()` keeps the instance alive past the
response — but work inside `after()` still counts against `maxDuration`, and the full
chain (restaurants ~53s, then home meals ~53s) cannot fit in 60s no matter what. So this
task makes the survey route reliably *dispatch* restaurant generation and stop trying to
own the rest; Task 4 moves the next hop to where its budget actually lives.

**Files:**
- Modify: `src/app/api/survey/route.ts` (import line 1; add `maxDuration`; the IIFE at ~295-348; the `Promise.all` at ~350-368)

**Interfaces:**
- Consumes: `triggerRestaurantGeneration`, `triggerBackgroundWorkoutGeneration` (both already in this file).
- Produces: nothing importable. Task 4 depends on this task having removed the home-meal call from here.

- [ ] **Step 1: Read the proven pattern first**

Before changing anything, read `src/app/api/ai/meals/generate-home/route.ts` line 1684
and the comment at lines 813-816. That route hit this exact bug, and the comment records
the diagnosis: *"Orphaning this promise dropped prices whenever the platform reclaimed
the instance first — invisibly, since it always completes locally."* You are applying the
same fix to the route that never got it. No test is written for this step.

- [ ] **Step 2: Write the failing test**

Create `src/app/api/survey/generation-kickoff.test.ts`:

```ts
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
  // 60s function cannot fit; generate-restaurants owns that hop now (Task 4).
  assert.doesNotMatch(SRC, /triggerHomeMealGeneration\(/);
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx tsx --test "src/app/api/survey/generation-kickoff.test.ts"
```

Expected: FAIL on all four assertions.

- [ ] **Step 4: Change the import**

`src/app/api/survey/route.ts` line 1 currently reads:

```ts
import { NextResponse } from 'next/server';
```

Replace with:

```ts
import { NextResponse, after } from 'next/server';
```

- [ ] **Step 5: Add the duration declaration**

Find `export const runtime = 'nodejs';` (around line 12) and replace it with:

```ts
export const runtime = 'nodejs';

/**
 * The kickoff below runs inside `after()`, which keeps the instance alive past
 * the response — but that work still counts against maxDuration, and without
 * this declaration the route inherited the ~10s platform default.
 */
export const maxDuration = 60;
```

- [ ] **Step 6: Replace the orphaned IIFE**

Find the block that begins `// Sequential meal generation for budget coordination`
followed by `(async () => {`, and ends at `})();` (around lines 295-348). Replace the
**entire** block, from the comment through `})();` inclusive, with:

```ts
      // Dispatch, don't own.
      //
      // This used to be a floating `(async () => { ... })()` that awaited
      // restaurant generation, then home meals, then workouts, then sent the
      // email. Nothing after the first await ever ran in production: the
      // handler returns below, Vercel reclaims the instance, and the orphaned
      // promise is discarded. Home meals and groceries were never generated.
      //
      // `after()` fixes the orphaning. It does not fix the arithmetic: this
      // route may run for 60s, and restaurant generation alone budgets 53s of
      // its own. So the chain is now a relay — generate-restaurants triggers
      // home meals when it finishes (see that route), home meals already
      // triggers groceries. Each hop gets a fresh 60s instead of sharing one.
      after(
        triggerRestaurantGeneration(survey.id, sessionId, baseUrl, mealPlan.id)
          .then(result => {
            console.log('[FINAL] 🏪 Restaurant kickoff settled:', {
              success: result.success,
              error: result.error ?? null,
            });
          })
          .catch(error => {
            console.error('[FINAL] ❌ Restaurant kickoff threw:', error);
          })
      );

      after(
        workoutPromise.catch(error => {
          console.error('[FINAL] ❌ Workout generation error:', error);
        })
      );
```

Note that `workoutPromise` is declared just above this block and must stay where it is.

- [ ] **Step 7: Register the profile generation too**

Immediately below, find the `Promise.all([...])` that fetches `/api/ai/profiles/food` and
`/api/ai/profiles/workout` and ends with `]).catch(error => { ... });` (around lines
350-368). It has the same orphaning problem. Wrap it: change the opening

```ts
      Promise.all([
```

to

```ts
      after(Promise.all([
```

and change the closing

```ts
      }).catch(error => {
        console.error('[FINAL] ❌ Profile generation error:', error);
      });
```

to

```ts
      }).catch(error => {
        console.error('[FINAL] ❌ Profile generation error:', error);
      }));
```

Be careful with the parenthesis: the `after(` opened before `Promise.all([` must be
closed after `.catch(...)`.

- [ ] **Step 8: Run the test and watch it pass**

```bash
npx tsx --test "src/app/api/survey/generation-kickoff.test.ts"
```

Expected: PASS, 4 tests. If `no floating async IIFE remains` still fails, search the file
for a remaining `})();` — there should be none.

- [ ] **Step 9: Run the full suite and the type check**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | tail -15
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 300 passing. `tsc` reports exactly **29**. If `triggerHomeMealGeneration` is now
reported as unused, leave it — Task 4 does not use it either, and deleting it is a
separate cleanup. If it is reported as an *error* rather than a warning, the count will
rise above 29; in that case delete the now-dead `triggerHomeMealGeneration` function
and its `[HOME-MEAL-TRIGGER]` helper from this file and re-run.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/survey/route.ts src/app/api/survey/generation-kickoff.test.ts
git commit -m "fix(survey): register background generation with after() so it survives the response"
```

---

### Task 4: Hand off from restaurants to home meals

Task 3 removed the home-meal hop from the survey route because it could not fit in the
same 60s. This task puts it where it does fit: at the end of restaurant generation, which
is the only place that knows the restaurant calories the home-meal generator needs.

**Files:**
- Modify: `src/app/api/ai/meals/generate-restaurants/route.ts` (import line 1; the success return path near line 997-1040)

**Interfaces:**
- Consumes: nothing from Task 3 at the code level — only the fact that the survey route no longer makes this call.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/ai/meals/generate-restaurants/handoff.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx tsx --test "src/app/api/ai/meals/generate-restaurants/handoff.test.ts"
```

Expected: FAIL — no `generate-home` reference in that file.

- [ ] **Step 3: Change the import**

Line 1 of `src/app/api/ai/meals/generate-restaurants/route.ts` imports from
`next/server`. Add `after` to that import. For example, if it reads:

```ts
import { NextRequest, NextResponse } from 'next/server';
```

make it:

```ts
import { NextRequest, NextResponse, after } from 'next/server';
```

- [ ] **Step 4: Add the handoff function**

Add this near the other module-level helper functions in that file, above the exported
`POST` handler:

```ts
/**
 * Second hop of the generation relay.
 *
 * Home meals need the restaurant calories to size the remaining daily budget,
 * so this hop cannot start until restaurant generation finishes. It used to be
 * awaited inside the survey route, which meant one 60s function had to cover
 * both ~53s phases. It never did — the survey handler returned first and the
 * promise was reclaimed, so home meals and groceries were never generated at
 * all. Triggering from here gives the hop its own full 60s.
 *
 * generate-home triggers groceries itself, so the relay completes from here.
 */
async function triggerHomeMeals(
  surveyId: string,
  sessionId: string,
  mealPlanId: string,
  restaurantCalories: Array<{ day: string; mealType: string; calories: number }>
): Promise<void> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const url = base.startsWith('http') ? base : `https://${base}`;

  console.log('[RESTAURANT-GENERATION] 🏠 Handing off to home meal generation...', {
    mealPlanId,
    restaurantMealsCounted: restaurantCalories.length,
  });

  try {
    const res = await fetch(`${url}/api/ai/meals/generate-home`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`,
      },
      body: JSON.stringify({ backgroundGeneration: true, mealPlanId, restaurantCalories }),
    });

    if (res.ok) {
      console.log('[RESTAURANT-GENERATION] ✅ Home meal generation accepted the handoff');
    } else {
      console.error('[RESTAURANT-GENERATION] ❌ Home meal handoff rejected:', res.status);
    }
  } catch (error) {
    console.error('[RESTAURANT-GENERATION] ❌ Home meal handoff threw:', error);
  }
}
```

- [ ] **Step 5: Call it on the success path**

Find the line that logs `✅ Updated meal plan ${existingMealPlan.id} with restaurant data`
(around line 997). This is inside the persistence block. After the whole
persistence block completes and just before the handler builds its success
`NextResponse.json(...)`, add:

```ts
    // The relay's second hop. after() keeps this instance alive past the
    // response so the fetch is actually dispatched — the survey route's
    // equivalent call was orphaned exactly here and silently dropped.
    after(
      triggerHomeMeals(
        surveyData.id,
        sessionId,
        mealPlanId,
        (restaurantMeals || []).map((meal: any) => ({
          day: meal.day,
          mealType: meal.mealType,
          calories: meal.primary?.estimatedCalories || meal.estimatedCalories || 0,
        }))
      )
    );
```

Use whatever the local variable names actually are in that scope for the survey record,
session id, meal plan id and the generated meals array — grep the surrounding function
rather than assuming these names. The variables exist; only their spelling may differ.

- [ ] **Step 6: Run the test and watch it pass**

```bash
npx tsx --test "src/app/api/ai/meals/generate-restaurants/handoff.test.ts"
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Run the full suite and the type check**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | tail -15
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 302 passing. `tsc` reports exactly **29**.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/ai/meals/generate-restaurants/route.ts src/app/api/ai/meals/generate-restaurants/handoff.test.ts
git commit -m "feat(meals): relay restaurant generation into home meals so the chain completes"
```

---

### Task 5: Guarantee menu structuring enough time to finish

Structuring needs roughly 8s. In the observed run the last two restaurants were clamped
to 7184ms and 5521ms, timed out, returned zero items, and were dropped from the plan
entirely — after their Perplexity search had already been paid for.

The repo already has the right tool: `reservingBudget(reserveMs, fn)` in
`src/lib/utils/route-budget.ts`, written for exactly this failure ("Enrichment starved the
deliverable"). Here the greedy phase is the Perplexity search and the starved deliverable
is the structuring call that turns its prose into menu items.

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` (imports; the Perplexity call at ~line 285)

**Interfaces:**
- Consumes: `reservingBudget` from `@/lib/utils/route-budget`.
- Produces: exported constant `MENU_STRUCTURING_RESERVE_MS = 9_000`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/external/menu-structuring-budget.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MENU_STRUCTURING_RESERVE_MS } from './perplexity-client';

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
});

test('the Perplexity search runs inside a reserving budget', () => {
  assert.match(SRC, /reservingBudget\(\s*MENU_STRUCTURING_RESERVE_MS/);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx tsx --test "src/lib/external/menu-structuring-budget.test.ts"
```

Expected: FAIL — `MENU_STRUCTURING_RESERVE_MS` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/external/perplexity-client.ts`, add `reservingBudget` to the imports:

```ts
import { reservingBudget } from '@/lib/utils/route-budget';
```

Then add this exported constant near the top of the file, beside the other module-level
constants:

```ts
/**
 * Time held back from the Perplexity search so the GPT call that structures its
 * output can always finish.
 *
 * Measured on the 2026-08-25 production run: structuring succeeded at clamps of
 * 8151ms and above, and timed out at 7184ms and 5521ms. A timeout here is not a
 * slow result — `processWithGPT4` returns zero menu items, and
 * generate-restaurants then drops the restaurant from the plan entirely. Two of
 * six restaurants were lost that way, both after their Perplexity search had
 * already returned good content.
 *
 * 9s clears the highest observed success by a small margin. Raising it further
 * starves the search itself, which took 6466-15398ms in the same run.
 */
export const MENU_STRUCTURING_RESERVE_MS = 9_000;
```

Now find the Perplexity call (search for `const perplexityResult = await perplexityLimit(`,
around line 285). Wrap it in the reserving budget. It currently begins:

```ts
      const perplexityResult = await perplexityLimit(() => withPerplexityRetry(async (signal) => {
```

Change that line to:

```ts
      // The search is the greedy phase and the structuring call below is the
      // deliverable. Left to a plain shared deadline the search takes whatever
      // it wants and structuring gets the remainder, which was sometimes 5.5s
      // against an 8s need — and a structuring timeout costs the whole
      // restaurant, not just its prose.
      const perplexityResult = await reservingBudget(MENU_STRUCTURING_RESERVE_MS, () =>
        perplexityLimit(() => withPerplexityRetry(async (signal) => {
```

and close the extra parenthesis at that call's end. Find the matching close — it will
look like `}));` or `}, { ... }));` — and add one more `)` so the `reservingBudget` call
is closed. Run `npx tsc --noEmit` immediately after this edit to confirm the parentheses
balance before moving on.

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx tsx --test "src/lib/external/menu-structuring-budget.test.ts"
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite and the type check**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | tail -15
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 305 passing. `tsc` reports exactly **29**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/external/perplexity-client.ts src/lib/external/menu-structuring-budget.test.ts
git commit -m "fix(menus): reserve structuring budget so a slow search cannot cost a restaurant"
```

---

## Verification after all tasks

- [ ] **Full suite green and type check unchanged**

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | tail -15
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 305 passing, 0 failing. `tsc` reports exactly **29**.

- [ ] **Deploy and confirm the build is green**

```bash
git push origin main
eval "$(grep '^export VERCEL_TOKEN=' ~/.zshrc)"; npx vercel ls fytr-app | head -8
```

The newest deployment must read `● Ready`. Note that this repo deploys to the Vercel
project **`fytr-app`**, not `healthfit-loop` — the similarly-named project is empty.

- [ ] **Confirm the relay completes in production**

Submit a survey on `https://fytr-app.vercel.app`, then:

```bash
eval "$(grep '^export VERCEL_TOKEN=' ~/.zshrc)"; npx vercel logs https://fytr-app.vercel.app --json > /tmp/relay.json
grep -o '\[FINAL\][^"]\{0,60\}\|\[RESTAURANT-GENERATION\] 🏠[^"]\{0,60\}\|\[HOME-MEALS\][^"]\{0,60\}' /tmp/relay.json | sort -u
```

Success is all four hops present: the survey kickoff, `🏪 Restaurant kickoff settled`,
`🏠 Handing off to home meal generation`, and a `[HOME-MEALS] ✅ Grocery prices complete`.
Before this plan, only the first two lines of the first hop appeared.

- [ ] **Confirm the chat answers**

Open the dashboard, click the "Ask anything…" bar, and send "what should I eat today?".
Then:

```bash
eval "$(grep '^export VERCEL_TOKEN=' ~/.zshrc)"; npx vercel logs https://fytr-app.vercel.app --json | grep -c 'api/chat'
```

Expected: a non-zero count, and a real answer in the UI. Before this plan the count was 0.

- [ ] **Confirm ordering links**

In the same log capture, `dropped unreachable links: doordash` must no longer appear —
DoorDash is suppressed before probing now. GrubHub and direct links should still be
listed by `[MENU-EXTRACTION]`.

---

## What this plan deliberately does not do

- **It does not restore DoorDash and Uber Eats.** Task 2 suppresses them behind a
  one-line switch rather than solving datacenter-IP blocking. The principled fix is to
  treat a 403 as `unverified` rather than `contradicted` — the four-state vocabulary for
  that already exists in `src/lib/verification/` — and label it in the UI. That is a
  product decision about whether to show an unverified link, and it is not this plan's to
  make.
- **It does not memoize geocoding.** The observed run geocoded
  `1244 California St San Francisco, CA 94109` **seven times**, identical result each
  time, inside one request. That is wasted Google Places spend and wasted budget in the
  phase Task 5 is trying to protect. It is a genuine finding and a separate, easy task.
- **It does not shrink the restaurant-selection prompt.** 15,217 characters over 67
  restaurants costing 9839ms is the single largest consumer of the route budget. Reducing
  it would help, but it changes what the model sees, and that needs its own before/after
  measurement against the eval harness rather than a guess.
