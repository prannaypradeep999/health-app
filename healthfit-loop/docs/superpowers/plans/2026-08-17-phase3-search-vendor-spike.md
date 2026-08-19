# Phase 3: Search Vendor Spike

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan. Work one task at a time, verify each before moving on.

**Prerequisite: Phase 2 complete — with one exception.** The incumbent must be running structured before you benchmark alternatives against it, or you will be measuring the regex bug rather than the vendor.

The exception is **Task 0 below, which should run BEFORE Phase 2.** It deletes `getLocalGroceryStores` entirely, and Phase 2 would otherwise spend effort adding a JSON schema to a method that is about to disappear. Do Task 0, then Phase 2, then return here for Tasks 1 onward.

**This is a spike, not an implementation.** The deliverable is a decision document with numbers behind it. Migration, if any, is a separate plan written after this one concludes. Timebox it: two weeks. If the answer is not clear by then, the answer is "keep Perplexity" — the incumbent wins ties, because switching has a cost the challenger has to beat, not match.

## Goal

Answer, with measured evidence: is Perplexity Sonar the right vendor for restaurant menu search and grocery store/price search, or is something else meaningfully better on accuracy, cost, or latency?

## Why this is open

The app uses Sonar for three searches. Sonar is a *search-and-synthesise* product: it finds sources and writes prose about them, with citations. The app then discards the prose and keeps the facts. You are paying for synthesis you throw away — which is a reason to look, not a reason to switch. Sonar's pricing is roughly $1/$1 per 1M tokens **plus $5–14 per 1,000 requests**, and that per-request fee is where the money actually is for this workload.

There is also unfinished business: `tavily ^1.0.2` sits in `package.json` dependencies but appears nowhere in `src/`. Task 1 resolves that before anything else, because if someone already ran this evaluation there is no point running it twice.

## Candidates

| Vendor | Model | Notes |
|---|---|---|
| **Perplexity Sonar** (incumbent) | Search + synthesis + citations | Now structured after Phase 2. No official MCP server. |
| **Anthropic web search** | Server-side tool, $10 / 1,000 searches plus token costs; errored searches not billed | Would collapse search and structuring into one call. **Documented as incompatible with Citations — returns 400.** See the blocker below. |
| **Firecrawl** | Extraction-first: crawls and returns structured page content | Vendor-published benchmark claims 77.2% coverage / 0.638 F1 against Exa's 69.2% / 0.508. Treat vendor numbers as a hypothesis. 1,000 free credits/month with no card, then $16/month Hobby. Official MCP server. |
| **Exa** | Neural search | Firecrawl's comparison point. Include so the comparison is not a two-horse race. Official MCP server. |
| **Tavily** | Search API | Already in `package.json`. Include only if Task 1 does not explain why it was removed. |

**Note on the Anthropic option:** the premise that "the Anthropic API doesn't do web search" is wrong — it has a first-party web search server tool. But its structured-outputs feature is documented as incompatible with Citations, which is the exact combination that would make it attractive here. Task 4 exists to test whether that incompatibility is real in the shape you need, because a lot rides on it.

## What this workload actually needs

Write this down before you look at any vendor, so you are not talked into someone else's benchmark.

1. **Menu accuracy.** Real dish names, at a specific location, with prices where available. Hallucinated dishes are worse than missing dishes — a user ordering a dish that does not exist is a product failure; a thin menu is a mild disappointment.
2. **Grocery price accuracy.** Plausible current prices for specific items at named stores. (Store *discovery* drops off this list once Task 0 moves it to Google Places — do not score vendors on it.)
3. **Structured output.** Non-negotiable. A vendor that returns prose puts you back in the two-hop architecture Phase 2 just deleted.
4. **Freshness.** Menus and prices change. Cached results from six months ago are wrong in a way that is invisible.
5. **Provenance, maybe.** Depends on the answer from Phase 2 Task 5. If the app shows sources to users, citation support is a hard requirement and it disqualifies at least one candidate outright.

Rank these before running the benchmark. A benchmark whose weights are chosen after you see the results tells you nothing.

---

## ⚠️ Amendments — verified against code and git history, 2026-08-18

Where this section conflicts with the task text below, **this section wins.**

### A1. Task 1 is answered. Tavily was deliberately replaced by Perplexity.

Not "removed in a refactor" and not "the free tier ran out". The evidence is one
commit doing both halves of a swap:

```
$ git show --stat 5efe030   # "commit working restrauant links", 2025-12-21
 .../meals/generate-restaurants/route.ts   | 519 +++--
 .../src/lib/external/perplexity-client.ts | 337 +++      <- created here

$ git show 5efe030 -- .../generate-restaurants/route.ts | grep '^-.*[Tt]avily'
-import { TavilyClient } from 'tavily';
-  const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });
-      const searchResponse = await tavilyClient.search({
```

The removed code used `max_results: 2` with `include_answer: true`, then
filtered results by location match — i.e. it was doing store-URL lookup, the
same job `orderingLinks` does now.

Per Step 5, **the dependency has been removed from `package.json`** (Phase 0
Task 9 Step 2 reached the same conclusion). `TAVILY_API_KEY` is still in `.env`
and is now dead — Pradeep should revoke it rather than leave a live key for an
uninstalled package.

This does *not* fully settle Step 3. The commit proves the *what*, not the
*why*; the message says nothing about quality. Step 3's remaining value is one
question to Pradeep: "was Tavily inaccurate, or just superseded?" If the former,
Step 4's inference — that delivery platforms block automated access, which would
also hit Firecrawl and Exa — is the single most candidate-narrowing fact in this
phase. **Ask before building the harness, not after.**

### A2. Task 0 Step 2 over-scopes `distance`. It is free to drop.

The step calls `distance` "the harder one" and says keeping it needs haversine
plus coordinate plumbing, while dropping it needs a component update. Neither is
true:

```typescript
// perplexity-client.ts:34 — and GroceryListSection.tsx:47, redeclared
export interface GroceryStore {
  name: string;
  address: string;
  distance?: string;   // optional
  type: 'budget' | 'mid-range' | 'premium';
}
```

It is **optional**, and `grep -rn '\.distance\b' src/` finds exactly one render
site — `RestaurantListSection.tsx:167` — which is on a **`Restaurant`**, not a
`GroceryStore`. Nothing renders a grocery store's distance. The plan's citation
of `GroceryListSection.tsx:50` points at the field's *declaration* in the local
interface copy, not a use.

So: drop `distance`, change no component, compute no haversine. The "budget half
a day" estimate stands on the other findings in that step, which are all
correct — the missing nearby-search-by-type, the `rating < 3.5` filter at
`places-client.ts:106` combined with `rating: place.rating || 0` at `:275` and
`:301` (verified — unrated independents really would be silently eaten), the
private `searchNearbyFallback` at `:204`, and `enrichPlaceDetails`.

### A3. New risk for Task 0: `places-client.ts` is on the legacy Places API.

```typescript
private placesBaseUrl  = 'https://maps.googleapis.com/maps/api/place';
private geocodeBaseUrl = 'https://maps.googleapis.com/maps/api/geocode';
```

That is Places API **legacy**, not Places API (New) at
`https://places.googleapis.com/v1`. Google closed the legacy endpoints to new
projects; existing enabled projects keep working, so nothing is broken today.

But Task 0 Step 1 says to *write a new public method* on this client, which
means writing new code against the legacy surface. **Check the project's Places
API enablement state before starting**, and decide deliberately whether the new
`searchNearbyByType` targets legacy (consistent with the file, no migration) or
New (`searchNearby` POST with a field mask, and now two API styles in one
client). Either is defensible; drifting into it by copy-paste is not. Do not let
this expand into a full client migration inside a spike.

### A4. Task 6 Step 2 is right about the API and wrong about the UI.

"The app does **not** have Grubhub" is true in the sense that matters — there is
no partnership and no menu feed, and `orderingLinks` is only ever populated from
URLs a search model mentioned in prose. Keep that comment.

But the app absolutely does *render* Grubhub: `RestaurantListSection.tsx:246-253`
draws a GrubHub button, and `MealPlanPage.tsx:1069, 1092, 2355` read the field.
Anyone reading "the app does not have Grubhub" and then deleting the UI would
break four working buttons. Phrase the code comment as *"these URLs are
model-reported, not partner feeds"* rather than *"we don't have Grubhub"*.

Related cleanup this phase should collect, now that Phase 0 made the shape a
grammar guarantee — `MealPlanPage.tsx:2355`:

```typescript
grubhub: links.grubhub || links.grubHub || links.GrubHub || links.grub_hub || null,
```

Four spellings of one key. That is exactly the defensive parsing strict mode
exists to delete; the schema now guarantees lowercase `grubhub` is present and
is `string | null`. Same file, `:2366`, already has the right idea with
`knownPlatforms`.

### A5. Scope note on Task 6 Step 4.

The step's own warning is correct and worth repeating louder: deleting
`orderingLinks` touches the prompt contract, a route, and two components. It is
a separate plan. **Also note Phase 0 found the model returns `""` rather than
`null` for a missing platform even when the prompt asks for `null`** — `""`
satisfies the grammar. The `http(s)`-prefix filter in `perplexity-client.ts` is
what actually removes those, and it is the reason that loop still exists. Any
"is `orderingLinks` low-value?" measurement must count post-filter links, not
raw schema fields, or it will overcount coverage.

---

## Task 0: Retire the grocery store search entirely

Do this before anything else. It removes a third of the problem, and you cannot benchmark a call site you are about to delete.

`getLocalGroceryStores` (`src/lib/external/perplexity-client.ts:236`) asks a search model "what grocery stores are near me". The Google Places API is authoritative for exactly that question — real names, real addresses, no hallucination risk. You already pay for it.

**But this is not a trivial rewire, and the existing client will actively fight you.** `src/lib/external/places-client.ts` has **no generic nearby-search-by-type**. Its only public search is `searchRestaurantsByCuisine` (`:120`), which:
- hardcodes `type: 'restaurant'` (`:147`, `:218`)
- injects a `healthy ${cuisine}` keyword (`:141`)
- post-filters `types` to restaurant / meal_delivery / meal_takeaway (`:182-186`)
- runs `filterOpenRestaurants` (`:99`), which drops anything with `rating < 3.5` — and `rating` **defaults to `0`** at `:275`, so every unrated grocery store would be silently discarded
- calls `enrichPlaceDetails`, which hardcodes `needsMenuAnalysis: true` and costs an extra Details API call per result

`searchNearbyFallback` is private. So this task is a new public method and a new result type, not an exposure of something that exists. Budget half a day, not an hour.

- [ ] **Step 1:** Read `places-client.ts` end to end. Add a new public `searchNearbyByType(location, placeType, radius)` that does **not** apply the rating filter, the keyword injection, or the restaurant type post-filter, and does **not** call `enrichPlaceDetails`. Do not try to generalise `searchRestaurantsByCuisine` — the restaurant path depends on every one of those behaviours.

- [ ] **Step 2:** Map `GroceryStore` (`perplexity-client.ts:30`) against what Places actually returns, and note that there are **two** gaps, not one:
  - `type` (`:34`) — an inferred category. Map from the Places `types` array, or drop it.
  - `distance` (`:33`) — **the harder one.** Places nearby-search does not return a distance, and this client cannot compute one: it never maps `geometry`, and its `Restaurant` type carries no lat/lng. `distance` is consumed at `GroceryListSection.tsx:50`. To keep it you must plumb coordinates through the client and compute haversine against the user's location. To drop it you must update the component. Decide before writing code.

  Also correct the record: this client exposes only `isOpen` (`:281`) — no coordinates, no opening hours. Any plan assuming richer Places data is wrong about *this* client, whatever the API supports.

- [ ] **Step 3:** Rewire `generate-groceries/route.ts:83` to the new method. Keep `getGroceryPrices` on Sonar — prices genuinely need a search model, and Places does not carry them.

- [ ] **Step 4:** Verify against the same four postcodes you will use in Task 2, including the rural one. Confirm results are at least as complete as Sonar's and materially more accurate on addresses. Specifically check that small independent stores with no Google rating still appear — that is the exact case the old rating filter would have eaten.

- [ ] **Step 5:** Delete `getLocalGroceryStores` and its greedy regex at `:304` once nothing references it. **Keep the exported `GroceryStore` interface at `:30`** — it is the parameter type of `getGroceryPrices` (`:335`), a return field (`:64`), and is re-declared at `GroceryListSection.tsx:44-52`. Deleting the method must not delete the type.

**Verification:** grocery store discovery runs on Places; one of the three Sonar call sites is gone; addresses are verifiably real; unrated independents appear in results; `GroceryStore` still compiles everywhere.

**Note:** this shrinks the rest of this phase to two questions — restaurant menus and grocery prices. Scope the benchmark accordingly, and ignore the grocery-store-accuracy axis in the requirements list above.

---

## Task 1: Resolve the Tavily question

Do this next. It is an hour and it may shorten the whole phase.

- [ ] **Step 1:** Find the removed integration in git history:

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
git log --all -S "TAVILY" --oneline -- src/
git log --all -S "tavily" --oneline
git log --all --diff-filter=D --name-only -- '*tavily*'
```

- [ ] **Step 2:** Read `server.log` around lines 177–205. It shows a working integration searching DoorDash, UberEats and Grubhub store URLs with location-match scoring, using a `tvly-dev-` key. That is a real prior implementation, not a stub.

- [ ] **Step 3:** Find out why it was removed. Check commit messages on the deleting commit, any PR description, and ask Pradeep directly — he will remember, and it is faster than inferring. The plausible answers point in very different directions: accuracy was poor (deprioritise Tavily), the free tier ran out (a pricing question, not a quality one), or it was replaced by Perplexity for reasons that may no longer hold.

- [ ] **Step 4:** If the removal reason was a quality problem that a current vendor also has — for instance, delivery platforms blocking automated access — that finding applies to Firecrawl and Exa too and materially narrows the candidate list.

- [ ] **Step 5:** Either restore Tavily as a benchmark candidate or remove the dependency from `package.json`. Do not leave an unused dependency sitting there for a third round of this question.

**Verification:** a written answer to "why was Tavily removed", and `package.json` either uses the dependency or does not list it.

---

## Task 2: Build the evaluation set

The benchmark is only as good as its ground truth. This is the most laborious task in the phase and the one most likely to be skipped. Do not skip it.

- [ ] **Step 1:** Pick 20 restaurants spanning the cases that actually break search: national chains, regional chains, independents in major metros, independents in small towns, restaurants with no website, restaurants whose only menu is a PDF, and at least two with a Facebook page and nothing else.

- [ ] **Step 2:** Pick 20 grocery baskets: common items, regional items, brand-specific items, and items with ambiguous names ("peppers"). Span at least four postcodes including one rural.

- [ ] **Step 3:** Establish ground truth **by hand**. Visit each restaurant's actual menu and record real dish names and prices with a date. Check real store prices. This is tedious and unavoidable — without it you are comparing vendors against each other's guesses rather than against reality, which cannot detect the failure mode you most care about (all vendors confidently wrong).

- [ ] **Step 4:** Store the evaluation set as a committed fixture at `scripts/fixtures/search-eval.json`, with a `groundTruthDate` on every entry. Menus change; a fixture without a date silently rots into a false benchmark.

- [ ] **Step 5:** Define scoring explicitly, before running anything:
  - **Precision** — of the dishes returned, what fraction are real? This is the number that matters most.
  - **Recall** — of the real dishes, what fraction were returned?
  - **Price accuracy** — within 10% of truth.
  - **Hallucination rate** — dishes returned that do not exist. Track separately from precision and weight it heavily.

**Verification:** a committed fixture with hand-verified ground truth for 20 restaurants and 20 baskets, plus a written scoring rubric.

---

## Task 3: Build the harness

- [ ] **Step 1:** Create `scripts/bench-search.ts`. Model it on the Phase 0 `scripts/bench-generators.ts` and reuse its result-reporting so outputs are comparable.

- [ ] **Step 2:** Define a vendor adapter interface so each candidate is a small module implementing the same shape:

```typescript
interface SearchVendor {
  name: string;
  getRestaurantMenu(restaurant: Restaurant): Promise<MenuResult>;
  getGroceryPrices(items: string[], location: Location): Promise<PriceResult>;
  costPerCall(usage: Usage): number;
}
```

- [ ] **Step 3:** Record per call: latency, cost, raw response, parsed output, and schema-conformance. Keep the raw response — when a vendor scores badly you need to see why, and re-running costs money.

- [ ] **Step 4:** Run each vendor over the whole eval set three times on different days. Search results are not deterministic and a single run will mislead you.

- [ ] **Step 5:** Score against ground truth automatically where possible, but hand-check a 20% sample of the automatic scores. Fuzzy dish-name matching gets both false positives and false negatives, and you need to know its error rate before trusting the aggregate.

**Verification:** the harness runs all candidates over the full eval set and emits a comparable scorecard per vendor.

---

## Task 4: Resolve the Anthropic Citations blocker

This determines whether the most architecturally attractive option is available at all.

- [ ] **Step 1:** Reproduce the incompatibility. Send one request combining the web search server tool with `output_config.format: { type: "json_schema", ... }` and record exactly what happens — a 400, a silent citation drop, or success.

- [ ] **Step 2:** If it errors, test the workarounds in order of preference:
  - Web search **without** Citations, with structured output, capturing source URLs as a schema field. Weaker provenance (the model can invent a URL), single call.
  - Two calls: search with citations, then a separate structuring call. This is the same two-hop shape Phase 2 just deleted, so it must clear a high bar to be worth it.
  - Web search with Citations and no structured output, parsed with `parseModelJson()` as best-effort. Only acceptable if conformance measures near-perfect, which is exactly what a benchmark can tell you.

- [ ] **Step 3:** Check whether the incompatibility has been lifted. It was documented as of early 2026; check the current changelog before designing around it. This is the single highest-value thing to re-verify in this whole phase.

- [ ] **Step 4:** Note the other structured-output caveats when scoring Anthropic: `stop_reason: "refusal"` and `stop_reason: "max_tokens"` both break the schema guarantee, and **enum capitalization is not guaranteed** — compare enums case-insensitively. The Phase 0 `normalizeEnum()` helper already handles the last one.

**Verification:** a tested, written answer on whether Anthropic web search plus structured output works in the shape this app needs.

---

## Task 5: Score and decide

- [ ] **Step 1:** Build the scorecard: per vendor, per task, with precision, recall, price accuracy, hallucination rate, p50/p95 latency, cost per call, cost per meal plan, and schema conformance.

- [ ] **Step 2:** Compute cost at realistic volume, not per call. Sonar's per-request fee dominates at high volume in a way per-token pricing does not; Firecrawl's credit model behaves differently again. Model at 10×, 100× and 1000× current volume — the ranking can invert.

- [ ] **Step 3:** Apply the weights from "What this workload actually needs", which you fixed before seeing results. If you now want to change them, write down why, separately, so the change is visible rather than laundered into the conclusion.

- [ ] **Step 4:** Make one of three calls, explicitly:
  - **Keep Perplexity.** Structured Sonar is good enough and the switching cost is not repaid. This is the default and requires no justification beyond the numbers being close.
  - **Switch.** A challenger wins decisively on a weighted axis. Requires a migration plan as a separate document, plus a rollback path.
  - **Hybrid.** Different vendors for menus and groceries — plausible, since extraction-first tools should suit menus (a menu is a page to extract) while search-first tools should suit "what stores are near me". Costs you two integrations to maintain; the win has to be real.

- [ ] **Step 5:** Write `docs/superpowers/notes/2026-XX-search-vendor-decision.md` containing the scorecard, the raw data, the decision, and — most importantly — **what would change the decision**. In a year someone will ask why; a decision document without falsification conditions cannot answer that.

**Verification:** a decision document with data, a conclusion, and stated conditions for revisiting.

---

## Task 6: Delivery platform reality check

Answers a question Pradeep asked directly and closes it off permanently.

- [ ] **Step 1:** Record the current state of delivery platform APIs. As of the 2026-08-17 research: DoorDash store and menu endpoints are gated to active integration partners and the Marketplace APIs are not generally available; Uber Eats Marketplace APIs are partner-scoped; Grubhub requires a formal partnership. **There is no public menu API from any of them.**

- [ ] **Step 2:** Correct the record in the codebase: the app does **not** have Grubhub. The `orderingLinks` field (`src/lib/external/perplexity-client.ts:15-21`) is populated from URLs that Sonar happens to mention in prose, filtered to strings starting with `http`. There is no menu feed and no partnership. Add a comment on the interface declaration at `:15-21` saying so, so this does not get rediscovered a third time. (Do not look for the filter at `:672-682` — Phase 2 Task 4 moves it into `normalizeMenuResponse`.)

- [ ] **Step 3:** On OCR-scraping DoorDash: technically conceivable, but weigh it against their terms of service and the anti-bot measures. Note also that Phase 3's own rules forbid bypassing bot detection. If ordering links matter commercially, the real path is applying for partner access, not scraping. Record that as the recommendation and move on.

- [ ] **Step 4:** If `orderingLinks` is low-value — check whether users click them — consider deleting the field. Unreliable data in a UI is worse than absent data, because users learn to distrust the parts that are correct.

  **Scope this honestly before agreeing to it.** `orderingLinks` is load-bearing in more places than it looks: `meal-generation.ts:1067-1126` mandates it in the prompt contract, `generate-restaurants/route.ts:386` derives `menuUrl` from it, `RestaurantListSection.tsx:224-257` renders four buttons off it (with no optional chaining), and it is read at `MealPlanPage.tsx:1065, 1088, 2313-2374` and `meals/current/route.ts:281`. This is a multi-file removal touching prompts, API routes and two components. If the answer is "delete it", write a separate plan; do not do it as a step inside a spike.

**Verification:** a written, dated statement of delivery API availability, a corrective comment in the code, and a decision about `orderingLinks`.

---

## Expected outcome

A decision, backed by hand-verified ground truth, about whether to keep Perplexity. A reusable search benchmark that makes the next vendor question a week rather than a month. The Tavily dependency resolved. The delivery-platform question closed with a dated answer.

**The most likely outcome is "keep Perplexity."** That is a legitimate result and it is worth two weeks to establish, because Phase 2 already captured most of the available value — structured output — and the remaining question is only whether a different vendor is meaningfully more accurate. If the answer is no, you stop wondering.
