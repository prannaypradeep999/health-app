# Phase 2: Structured Perplexity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan. Work one task at a time, verify each before moving on.

**Prerequisite: Phase 0 complete.** This plan reuses `parseModelJson()` from `src/lib/ai/validate.ts` and the shared Zod schemas from `src/lib/ai/schemas/`.

**Phase 1 is not a prerequisite, but the two are not fully independent.** Task 4 deletes the `gpt-4o` call at `:634`, which is a `DETAIL`-role site in Phase 0's model mapping. Running the two phases concurrently invalidates Phase 1's `DETAIL` baseline. Either let Phase 1 Task 2 capture its baseline first, or plan to re-baseline `DETAIL` after Task 4 lands.

**Phase 3 Task 0 should ideally run before this plan.** It retires `getLocalGroceryStores` in favour of Google Places, and there is no point adding a JSON schema to a method that is about to be deleted. This plan assumes that ordering; if you are going strictly in phase order, skip the store-search work rather than doing it twice.

All work in this plan is in one file: `src/lib/external/perplexity-client.ts`. Note the path — it is `lib/external`, not `lib/ai`. Line numbers below were accurate on 2026-08-17; locate code by symbol name, not by line, since the file will shift as you edit it.

## 🚨 Amendment — the target API retires in 41 days (verified 2026-08-17)

**Perplexity is retiring Sonar Chat Completions on 2026-09-27.** Every task in this
plan targets `https://api.perplexity.ai/chat/completions`, which will stop working.

Primary source: [Sonar is moving to the Agent API](https://community.perplexity.ai/t/sonar-is-moving-to-the-agent-api/5802),
posted by Perplexity staff 2026-08-13 — *"Sonar endpoints are fully available today
and retire on September 27, in 45 days."* Corroborated by the
[changelog](https://docs.perplexity.ai/changelog/changelog) ("Sonar Chat Completions
is now Agent API") and the
[models page](https://docs.perplexity.ai/getting-started/models). Note that the
[migration overview](https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview)
still calls Sonar "supported" with no EOL date — the docs are internally
inconsistent, and the dated staff announcement is the one to trust.

What changes:

- **Endpoint** → `POST /v1/agent`, with `POST /v1/responses` as an OpenAI-SDK-compatible alias.
- **Request** → `messages[]` becomes `input`; web search becomes an explicit
  tool, `tools: [{"type":"web_search"}]`.
- **Response** → a typed `output` array with search results and messages as
  separate items, replacing `choices[]` plus a sibling `citations` array. **This
  breaks the citation handling Task 5 is written to preserve.**
- **Model IDs** → provider-qualified (`openai/gpt-5.4-mini`). The new Sonar
  identifier was not documented at time of writing; confirm before coding.
  Separately, `sonar-reasoning` was removed 2025-12-15 — use `sonar-reasoning-pro`.

**Three consequences for this plan:**

1. **Task 1 changes meaning.** It should verify structured output on the *Agent
   API*, not on Chat Completions. Verifying the retiring surface teaches us
   nothing that survives September.
2. **The core premise is weaker than stated.**
   [Output Control](https://docs.perplexity.ai/docs/agent-api/output-control)
   documents `response_format: {type:"json_schema", json_schema:{name, schema}}`
   but **no `strict: true` flag**. Perplexity schema adherence is best-effort and
   degrades when output exceeds `max_tokens`. It is *not* the grammar-constrained
   guarantee Phase 0 buys from OpenAI. Wherever this plan implies the two are
   equivalent, it is overselling. Keep validating with `parseModelJson` — do not
   treat a Perplexity schema as a contract.
3. **A documented 10–30s first-token delay applies per new schema.** That
   interacts directly with the `withTimeout` fix from Phase 0 Task 1, which now
   actually aborts. Size the timeout for it, or the first call with each new
   schema will abort.

**Recommendation: do not execute this plan as written.** Either re-scope it to the
Agent API, or defer it and let the migration subsume it. Adding a schema to an
endpoint that dies in 41 days is throwaway work.

## Amendment A1 — Task 1 has been run. Point 2 above is wrong. (measured 2026-08-18)

The amendment above was written from documentation. I ran the spike against both
live surfaces with the repo's `PERPLEXITY_API_KEY`. **The retirement date holds
and the recommendation stands, but the technical reasoning in point 2 does not.**

**Sonar `/chat/completions` accepts `strict: true` and genuinely enforces it.**
The claim that Perplexity offers no `strict` flag and only best-effort adherence
is false. Same padding probe used in Phase 0 Amendment 8 — `minItems: 5` against
a prompt naming two fruits:

| Surface | n | Contents |
|---|---|---|
| Sonar `/chat/completions` | 5, 5, 5 | `["apple","banana","cherry","orange","mango"]` — clean, 3/3 |
| Agent API `/v1/agent` | 5, 5, — | chain-of-thought leaked into string values, multilingual junk tokens; **1 of 3 trials returned no message at all** |

The array *length* is honoured on both. The difference is what fills it: the
Agent API hits the count by emitting garbage tokens. On realistic,
loosely-constrained prompts it was fine (3/3 valid menus, 19–30 items), so this
is not "the Agent API is broken" — it is specific to schemas that constrain
harder than the prompt supports, which is exactly the regime Phase 0's
count-pinning operates in.

**Task 1 Step 2's go/no-go passes on Sonar.** Citations survive `response_format`:
15 `citations` and 15 `search_results` on a schema'd menu query, ~5.5s, `content`
returned as a string still needing `JSON.parse`, valid both trials. **Task 5
(citation fallback) is therefore unnecessary on the current surface** — but
becomes necessary again after the Agent API migration, which restructures
citations into the `output` array.

Two further corrections:

- **No 10–30s first-schema delay observed** (point 3). Schema'd menu queries ran
  5.74s and 5.45s — indistinguishable from unschema'd. Do not oversize the
  Phase 0 Task 1 timeout on the strength of that doc claim; measure it.
- **Cost is not a tiebreaker, but the shape changed.** Sonar bills a flat
  `request_cost` ($0.005 of a $0.0053 call, ~94%). The Agent API bills per tool
  call plus cache creation ($0.00594 same query: `search_web` $0.0025 +
  `cache_creation` $0.00293). Phase 3's "the per-request fee is where the money
  is" stops being true post-migration; requests get cheaper to repeat and more
  expensive to make wide.

**Net effect on the plan.** The premise ("Sonar can emit the JSON directly, the
`gpt-4o` hop exists only because nobody knew `response_format` was available") is
now *confirmed*, more strongly than the plan claimed. The reason not to execute is
purely the calendar, not the capability. Concretely:

- Task 1 — **done, recorded here.** Do not re-run against Chat Completions.
- Tasks 2/3 (grocery schemas) — skip. Task 3's method is being retired by Phase 3
  Task 0, and the surface dies 2026-09-27.
- Task 4 (collapse the two-hop) — **the valuable one, and the one to defer**, not
  because it won't work but because it should be built once, on `/v1/agent`.
  Its real risk is unchanged and unrelated to any of this: `processWithGPT4`
  enforces dietary exclusions at `:571-601` and `buildMenuQuery` only says
  "prioritize". That logic must move before the hop is deleted.
- Task 5 (citation fallback) — unnecessary now, required after migration.

**Decision taken 2026-08-18: stay on Sonar through the demo, migrate before
2026-09-27.** Recorded as a dated comment above `PerplexityClient` in
`src/lib/external/perplexity-client.ts`, including the probe to re-run.

## Goal

Stop asking Perplexity for prose and then reverse-engineering JSON out of it. Perplexity's Sonar API supports `response_format` with a JSON Schema. Using it deletes two greedy regexes and one entire `gpt-4o` round trip.

## The current state

Three Sonar calls, all `model: 'sonar'`, none using `response_format`:

| Method | Line | What it does now | The problem |
|---|---|---|---|
| `getRestaurantMenu` | 114 | Asks Sonar for a menu, gets prose back, then at `:190` hands the prose to `processWithGPT4` (`:534`) which calls `gpt-4o` at `:634` with `response_format: { type: "json_object" }` at `:636` to reshape it | Two API calls, two failure modes, two latencies, and the second call is a legacy `json_object` request that guarantees valid JSON syntax and nothing about shape |
| `getLocalGroceryStores` | 277 | Asks Sonar for stores, then at `:304` runs `content.match(/\{[\s\S]*\}/)` | The regex is greedy — it takes from the first `{` to the **last** `}` in the whole response. Any prose containing a brace after the JSON block silently corrupts the capture |
| `getGroceryPrices` | 410 | Same pattern, regex at `:437` | Same bug |

The greedy-regex failure is the interesting one. It does not throw. It produces a longer string that usually still parses, or fails `JSON.parse` in a way the surrounding code swallows. Either way the user sees missing stores or missing prices with no error anywhere.

## The key insight

`getRestaurantMenu` currently pays for **two models** to do one job: Sonar searches and writes prose, then `gpt-4o` reads the prose and writes JSON. Sonar can emit the JSON directly. The second hop exists only because nobody knew `response_format` was available on Sonar.

## Caveats you must plan around

**Schema compile latency.** Perplexity compiles a new JSON schema on first use, adding a documented 10–30 second delay to the first request with a given schema. Subsequent requests with the same schema are fast. Consequences: schema definitions must be stable (a schema built by string interpolation from user input recompiles every time and is a latency disaster), and the first request after a deploy will be slow. Warm the schemas at startup if the latency lands on a user.

**Prose is being thrown away today, but citations are not.** `getRestaurantMenu` passes `citations` into `processWithGPT4` at `:190`. Check what the citations end up feeding — if they populate a user-visible `sources` field, the structured path must still capture them. Sonar returns citations as a top-level response field alongside the message content, so this is generally survivable, but verify rather than assume.

**Retry timeout.** `RetryPresets.perplexity` allows 75s per attempt (`src/lib/utils/retry.ts`). A 30s schema compile plus a slow search can approach that. If the first post-deploy request times out, that is the compile, not a real failure — do not chase it as a bug.

**The Phase 0 timeout bug applies here too.** Confirm the Perplexity call sites use the `signal` argument that `withRetry` passes them. If they ignore it, the 75s timeout does nothing and a hung request hangs forever. Phase 0 Task 1 should have fixed this; verify.

---

## Task 1: Verify Sonar's structured output surface

Do not build against documentation you have not tested.

- [ ] **Step 1:** Send one request with a trivial schema and confirm the response body conforms:

```bash
curl https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonar",
    "messages": [{"role":"user","content":"What grocery stores are in Palo Alto, CA?"}],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "schema": {
          "type": "object",
          "properties": {
            "stores": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {"name":{"type":"string"},"address":{"type":"string"}},
                "required": ["name","address"]
              }
            }
          },
          "required": ["stores"]
        }
      }
    }
  }'
```

- [ ] **Step 2:** Record three things from that response: (a) whether the JSON came back inside `choices[0].message.content` as a string that still needs `JSON.parse`, or as a parsed object; (b) whether `citations` (or `search_results`) is still populated when `response_format` is set; (c) how long the first request took versus a second identical one.

Point (b) is the go/no-go for this phase. If setting `response_format` suppresses citations, you have a decision to make — see Task 5.

- [ ] **Step 3:** Test the failure mode. Send a schema with a field Sonar cannot plausibly find (`"michelin_star_count"` for a taco truck). Does it return null, omit the field, hallucinate a number, or error? The answer determines how defensive the schemas in Task 2 need to be.

- [ ] **Step 4:** Confirm whether Sonar's schema support is strict (grammar-constrained) or best-effort. Perplexity's implementation is not necessarily as strong as OpenAI's `strict: true`. If it is best-effort, `parseModelJson()` stays mandatory on these paths — which it should anyway.

**Verification:** a note recording the answers to all four steps, written down before any code changes.

---

## Task 2: Define the schemas

**Critical distinction: the existing TypeScript interfaces are NOT the schemas.** Each interface is an *envelope* containing both model-emitted data and fields the application computes after the call. Handing the whole interface to Sonar as a schema tells the model to invent values for fields it has no business producing.

Audit before you write anything. The app-computed fields are:

| Interface | App-computed, must NOT be in the schema | Where computed |
|---|---|---|
| `PerplexityMenuResponse` (`:4`) | `restaurant`, `sources`, `extractionSuccess`, `linksFound`, `error` | `:193-215` |
| `GroceryStoreSearchResponse` (`:37`) | `location`, `searchSuccess` | `:313-316` |
| `GroceryPriceResponse` (`:62`) | `stores` — echoed straight back from the **input argument** | `:449` |

- [ ] **Step 1:** For each of the three, write down the model-emitted subset. That subset is the schema. The envelope stays as the TypeScript return type, assembled in application code exactly as it is today.

- [ ] **Step 2:** Create `src/lib/ai/schemas/search.ts` with Zod schemas for the three subsets.

**Do not blindly import from Phase 0's `shared.ts` — two of the shared pieces do not fit:**
- Phase 0's `OrderingLinks` has no `website` field; the Perplexity shape has one at `:20`. Extend the shared schema (preferred, if the OpenAI sites tolerate an added nullable field) or define a local variant. Decide deliberately and comment which.
- Phase 0's `GroceryItem` is `{name, quantity, uses}`. The Perplexity shape is `GroceryItemWithPrices`, keyed `item`, not `name`. These are different types that happen to describe similar things. Do not force them together; renaming a key here breaks `GroceryListSection.tsx`.

- [ ] **Step 3:** Check for a schema that already exists. Phase 0 Task 3 creates `MenuExtractionSchema` in `schemas/restaurants.ts`, matching `PerplexityMenuResponse`, for the `gpt-4o` reshaping call at `:634`. Since Task 4 deletes that call, **reuse and relocate that schema rather than writing a second one.** Two menu schemas that drift apart is exactly the duplication Phase 0 set out to remove.

- [ ] **Step 4:** Find every consumer and confirm the schema is a superset of what they read:

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
grep -rn "getRestaurantMenu\|getLocalGroceryStores\|getGroceryPrices" src/ --include=*.ts
grep -rn "orderingLinks" src/ --include=*.ts --include=*.tsx
```

`orderingLinks` has more consumers than is obvious, and **not all are null-guarded**. `RestaurantListSection.tsx:224, 235, 246, 257` read `restaurant.orderingLinks.doordash` with **no optional chaining**, even though `:64` in the same file treats it as possibly undefined. Other reads: `MealPlanPage.tsx:1065, 1088, 2313, 2321, 2335, 2343, 2363, 2374`; `meal-generation.ts:942, 1093, 1113`; `generate-restaurants/route.ts:369-387, :519`; `meals/current/route.ts:281`. If your schema makes `orderingLinks` nullable, `RestaurantListSection` throws. Either keep it required-and-present with nullable members, or fix those four reads first.

- [ ] **Step 5:** Make optional-in-practice fields explicitly nullable rather than absent. A required-and-nullable field gives you a schema that always validates plus an application-level emptiness check, instead of a schema that fails when the search finds nothing. A restaurant with no delivery links is a normal outcome, not an error.

- [ ] **Step 6:** Convert to JSON Schema with the Phase 0 `toStrictJsonSchema` helper (`zodToJsonSchema` with `$refStrategy: 'none'`). Perplexity's schema support may not handle `$ref`, and inlining sidesteps the question.

- [ ] **Step 7:** Define the schemas as module-level constants. They must be referentially stable across requests so Perplexity's compile cache actually hits. Never build one inside a request handler from interpolated values.

**Verification:** `src/lib/ai/schemas/search.ts` exists; no schema contains an app-computed envelope field; the menu schema is the one from Phase 0, relocated rather than duplicated; every field read by an existing consumer is present.

---

## Task 3: Convert the grocery price search

Start here rather than with the menu. It is the simpler change and it proves the pattern before you touch the two-hop path.

**Scope note:** this task covers `getGroceryPrices` only. `getLocalGroceryStores` is being **retired entirely** in Phase 3 Task 0 in favour of Google Places — do not spend effort adding a schema to a method that is about to be deleted. If you are running Phase 2 and Phase 3 out of order, do Phase 3 Task 0 first.

- [ ] **Step 1:** In `getGroceryPrices` (`:332`), add `response_format` with the price schema to the request body at `:410`.

- [ ] **Step 2:** Delete the greedy regex at `:437` and replace the whole extraction block with a `parseModelJson` call. **Mind the signature** — Phase 0 defines it as `parseModelJson(schema, content, finishReason, context)`, schema first, four required arguments. Sonar responses expose `finish_reason` on the choice; pass it through, and pass a context string for the logs:

```typescript
const result = parseModelJson(
  GroceryPriceSchema,
  content,
  data.choices?.[0]?.finish_reason,
  'perplexity.getGroceryPrices'
);
```

- [ ] **Step 3:** Handle the `ParseResult` discriminated union properly. On `{ok: false}`, log the `reason` and the `raw` body and return the existing failure shape — including `searchSuccess: false` — rather than throwing. These searches are best-effort and a failure should degrade the meal plan, not kill the request.

- [ ] **Step 4:** Reassemble the envelope in application code exactly as `:449` does today, echoing `stores` from the input argument. The model does not supply it.

- [ ] **Step 5:** Verify against real inputs, including deliberately hard cases: a rural postcode, an ambiguous item name ("peppers"), and a basket where no store carries an item. Confirm the empty case returns cleanly.

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
npx tsx scripts/bench-generators.ts --label perplexity-structured --only groceries --runs 5
```

**Verification:** run this exact grep — the escaping matters, and a wrongly-escaped pattern returns nothing even before you make the change, so it would pass vacuously:

```bash
grep -nF 'match(/{[\s\S]*}/)' src/lib/external/perplexity-client.ts
```

Expect one remaining hit at `:304` (the store search, deleted in Phase 3 Task 0) and none for `getGroceryPrices`. Sanity-check the grep by running it before your change and confirming it finds two.

---

## Task 4: Collapse the menu two-hop

This is the change with the real payoff and the real risk. Do it after Task 3 has been running successfully.

> **Read this before starting.** `processWithGPT4` is not a formatter. It is doing product logic, and the naive version of this task silently removes it. It applies **dietary exclusion rules at `:571-601`**, plus calorie estimation, health rating, and meal-category assignment. Meanwhile `buildMenuQuery` (`:487-531`) — the Sonar prompt — only asks the model to *prioritize* dietary restrictions; it never states them as hard exclusions. So today the exclusion is enforced entirely in the second hop. Delete the hop without moving that logic and a vegan user gets recommended a dish with meat in it, with no error anywhere. That is the single worst outcome available in this plan.

- [ ] **Step 1:** Read `processWithGPT4` (`:534`) end to end and classify every transformation into one of three buckets:
  - **Pure post-processing** — operates only on the parsed object. The URL filter at `:672-682` is the clear example. These move to a `normalizeMenuResponse(parsed)` helper.
  - **Model judgement** — calorie estimation, health rating, meal-category assignment. These cannot be post-processed; they must become fields in the schema and instructions in the Sonar prompt.
  - **Safety-critical filtering** — the dietary exclusions at `:571-601`. Treat these separately and with the most care; see Step 3.

- [ ] **Step 2:** Rewrite `buildMenuQuery` (`:487-531`) **before** touching the request. Dietary restrictions must move from "prioritize X" to explicit hard exclusions: name the restriction, name the disallowed ingredients, and instruct the model to omit non-compliant dishes entirely rather than flagging them. Then add instructions covering the model-judgement fields from Step 1.

- [ ] **Step 3:** Keep the dietary exclusion filter in code **even after** the prompt asks for it. A prompt instruction is not an enforcement mechanism, and this is the one place in the app where a wrong answer is a genuine harm rather than a disappointment. Port `:571-601` into `normalizeMenuResponse` as a belt-and-braces post-filter and leave it there permanently.

- [ ] **Step 4:** Add `response_format` with the menu schema to the Sonar request at `:114`.

- [ ] **Step 5:** Replace the `processWithGPT4` call at `:190` with a `parseModelJson` call, followed by `normalizeMenuResponse`, followed by the existing envelope assembly at `:193-215`. Mind the signature again — schema first, four arguments:

```typescript
const result = parseModelJson(
  MenuExtractionSchema,
  content,
  data.choices?.[0]?.finish_reason,
  'perplexity.getRestaurantMenu'
);
```

- [ ] **Step 6:** Verify citations still flow through. They are currently passed into `processWithGPT4` at `:190` and end up in the `sources` field. If Task 1 Step 2 showed citations survive `response_format`, wire them into the envelope directly. If not, go to Task 5 before proceeding.

- [ ] **Step 7:** Run the restaurant path against at least fifteen real restaurants spanning chains and independents, comparing structured output against the current two-hop output on the same inputs. **Include at least three restaurants under a strict dietary restriction — vegan, halal, and coeliac — and verify by hand that no returned dish violates it.** You are looking for dropped fields and dropped filtering, not just valid JSON.

- [ ] **Step 8:** Only after Step 7 passes, delete `processWithGPT4` and its `gpt-4o` call at `:634`. Remove the now-orphaned `withGPTRetry` import at `:2` — leaving it is a lint error. Confirm nothing else references the method:

```bash
grep -rn "processWithGPT4" src/
```

**Verification:** the restaurant menu path makes exactly one API call; `processWithGPT4` is deleted; `withGPTRetry` no longer imported; benchmark output matches or beats the two-hop baseline on field completeness **and on dietary-exclusion correctness**.

**Phase 1 interaction:** if Phase 1 is running concurrently, note that `:634` is a `DETAIL`-role call site in Phase 0's model mapping. Deleting it mid-migration makes Phase 1's `DETAIL` baseline non-comparable. Either finish Phase 1 Task 2's baseline capture first, or re-baseline `DETAIL` after this task lands.

---

## Task 5: Citation contingency (only if Task 1 showed citations are suppressed)

Skip this task if citations survive `response_format`. Read it before starting Task 4 so you know whether you need it.

- [ ] **Step 1:** Determine whether the app actually surfaces citations to users, or merely logs them. Grep for `citations` and `sources` across `src/`. If they are log-only, drop them and close this task.

- [ ] **Step 2:** If they are user-visible, the cleanest fix is to put the sources **in the schema** — add a `sources: { type: "array", items: { type: "string" } }` field and ask the model to populate it. This is weaker than real citation metadata (the model can invent a URL) but it keeps the single-call architecture.

- [ ] **Step 3:** If provenance must be trustworthy, keep the two-hop for the menu path only and accept the cost. Record the reason in a comment so a future reader does not "optimise" it away. Note this same tension appears in Phase 3 as the Anthropic-web-search blocker — Anthropic's structured outputs are documented as incompatible with its Citations feature, returning a 400. It is the same architectural problem with the same three answers.

**Verification:** an explicit, written decision about provenance, with the code matching it.

---

## Task 6: Measure the win

- [ ] **Step 1:** Compare against the Phase 0 baseline on: number of API calls per restaurant menu (expect 2 → 1), p50 and p95 latency for both remaining methods, parse-failure rate, and cost per menu.

- [ ] **Step 2:** Measure the first-request compile penalty separately, on a cold schema, so it is not confused with steady-state latency.

- [ ] **Step 3:** If p95 got worse despite dropping a call, suspect schema compile churn — something is producing a schema that is not referentially stable. Recheck Task 2 Step 5.

**Verification:** measured before/after numbers recorded in the plan notes.

---

## Expected outcome

The two surviving Sonar calls — restaurant menus and grocery prices — return schema-conformant JSON directly. The greedy regex in `getGroceryPrices` is gone, along with the silent-corruption class of bug it caused. The restaurant menu path makes one API call where it made two, removing a `gpt-4o` round trip, its latency, its cost, and its own failure mode. Dietary exclusion, previously enforced only in the deleted second hop, is now enforced in both the prompt and a permanent post-filter.

(The third Sonar call, `getLocalGroceryStores`, and its regex at `:304` are removed in Phase 3 Task 0, not here.)

**What this phase does not decide:** whether Perplexity remains the search vendor. That is Phase 3. This phase is deliberately cheap — roughly an hour of code — precisely so it is not wasted if Phase 3 recommends a switch. A structured Sonar path is also the only honest baseline to benchmark alternatives against; comparing a prose-plus-regex incumbent against a structured challenger would flatter the challenger for the wrong reason.
