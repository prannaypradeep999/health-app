# Generation Correctness Audit — 2026-08-24

## Why this exists

The reported symptoms are: *"the generation doesn't always give me the full answer,"*
*"sometimes the numbers are wrong,"* and *"we always want accurate links."*

Those three complaints look like three bugs. They are one gap.

Phase 0 landed grammar-constrained decoding — every OpenAI call now uses
`toStrictJsonSchema(name, schema)`, producing `response_format: {type:'json_schema',
strict:true}`, and `exactly(el, n)` pins array lengths at six sites. That work
succeeded: the Phase 0 baseline in `bench-results/README.md` records 100% schema
pass on all 24 cells and zero truncations.

But a strict schema guarantees that a `calories` field **exists and is a number**.
It says nothing about whether the number is *right*. It guarantees a `directUrl`
field is a **string matching a URL pattern**. It says nothing about whether that
URL *resolves*. Grammar-constrained decoding solved shape. Every remaining failure
is semantic, and nothing in this codebase checks semantics on any live path.

Four failure families follow from the symptoms:

| Family | Question it answers |
|---|---|
| **COMPLETENESS** | Did we get every day, meal, exercise, and item we asked for? |
| **ARITHMETIC** | Do the numbers add up — macros to calories, items to totals, parts to whole? |
| **ADHERENCE** | Did the output obey the constraints in the prompt (diet, injuries, budget, distance)? |
| **LINKS** | Does every URL we show resolve to the thing we claim it is? |

**Current coverage of those four families on live request paths: zero.**
Four validators exist (`meal-plan-validator`, `ingredient-validator`,
`restriction-validator`, `workout-validator`). One is never called on the live path,
two are called and have their results discarded, one is warn-only and does not block
a bad write. No HEAD request exists anywhere in the repository.

## Method

Four parallel read-only audits (home meals, restaurants/links, groceries,
workouts/recipe/images), followed by direct verification of every
highest-consequence claim by grep and file read rather than trusting agent
summaries. Findings marked ✓ were personally confirmed against the source.

No files were modified. This document is measurement only; fixes are sequenced in
the accompanying implementation plan.

## Severity legend

- **S1 — Safety or trust.** Can harm a user or show a confidently wrong fact.
- **S2 — Silent wrongness.** Output is incomplete or incorrect and reports success.
- **S3 — Correctness debt.** Wrong under conditions that are reachable but narrower.
- **S4 — Hygiene.** Misleading code, dead paths, stale docs.

---

## A. Home meals — `src/app/api/ai/meals/generate-home/route.ts`

**A1 · S2 · ✓ The live path runs zero validators.**
`generateHomeMealsParallel` (:1143) is what production calls. Every
`validateMealPlan` / `validateIngredientSums` / `validateRestrictions` call site
(:624, :654, :670, :744) sits inside `generateHomeMealsLegacy` — the path that no
longer runs. The four validators are, in practice, dead code for home meals.

**A2 · S2 · Short weeks are logged, never signaled.**
When the plan comes back with fewer days than requested, the handler emits a
`console.error` and continues. No throw, no response field, no user-visible marker.
This is the literal mechanism behind *"doesn't give me the full answer."*

**A3 · S2 · `isUsableMeal` checks the wrong field and only the primary option.**
It inspects only `primary`, only four fields, and tests `o.ingredients` — while the
grocery prompt downstream reads `ingredientsWithNutrition`. A meal with an empty
`ingredientsWithNutrition` passes as usable and then contributes nothing to the
grocery list.

**A4 · S2 · Every budget-exhaustion path degrades to "skip," indistinguishable from success.**
When `withRouteBudget` runs out of deadline, the affected slot is skipped. The
response shape for "we ran out of time" is identical to "there was nothing to
generate." The user cannot tell a truncated plan from a complete one, and neither
can we.

**A5 · S2 · No day-total-versus-target check anywhere.**
Nothing compares the sum of a day's meals against that day's calorie and macro
targets. The single most direct check for *"sometimes the numbers are wrong"* does
not exist.

**A6 · S3 · `validateMealPlan` reads a field that does not exist on the object it is given.**
It reads envelope-level `meal.calories`. A `MealSlot` carries nutrition on its
option objects, not the envelope. Even if A1 were fixed by wiring this validator
into the live path, it would score every meal as 0 kcal and flag the entire plan.
**Fixing A1 without fixing A6 produces a validator that fails everything.**

**A7 · S3 · `convertToLegacyTargets` is called with no day argument.**
The result is that **Monday's targets are applied to the whole week**. Any per-day
variation in the targets is discarded before generation begins.

**A8 · S3 · `adjustTargetsForRestaurantBudget` mutates its input and overwrites instead of accumulating.**
Shallow-spreads its argument, then writes back over the same nested object.
Successive adjustments clobber rather than compose.

**A9 · S3 · `strictExclusions` never reaches the planning prompt.**
`createPlanningPrompt` omits them. The detail phase is explicitly forbidden from
renaming dishes. So an excluded ingredient chosen at planning time cannot be
corrected later — the constraint arrives after the only stage that could act on it.

**A10 · S2 · A zero-meal run returns HTTP 200 with `success: true`.**
Complete generation failure is reported to the client as success.

**A11 · S3 · `buildFallbackGroceryList` puts everything in `pantryStaples` with quantity `'varies'`.**
The fallback is structurally valid and semantically useless — no quantities, no
aisle assignment, nothing priceable.

**A12 · S2 · ✓ Grocery price lookup is fire-and-forget with no `waitUntil`.**
`route.ts:879-880` (`// Fire and forget - don't await`) and the dispatch at `:1605`.
On a serverless platform the instance may be reclaimed the moment the response is
written. When that happens the user loses grocery prices entirely, with no error
and no retry.

---

## B. Restaurants and ordering links

This is the surface behind *"we always want accurate links."* It is the weakest
surface in the codebase.

**B1 · S1 · ✓ No link liveness check exists anywhere in the repository.**
`grep -rn "method: 'HEAD'" src/ scripts/` returns nothing. Not one URL the app
displays has ever been verified to resolve.

**B2 · S1 · All five ordering-link fields are model-authored.**
They are invented by `processWithGPT4`. They are not looked up, not resolved, not
corroborated against anything.

**B3 · S1 · The Sonar menu call passes no `response_format`.**
Links are therefore twice removed from any real HTTP response: free prose from
Sonar, then a second model asked to structure prose it may itself have invented.

**B4 · S1 · ✓ The one authoritative URL in the system is thrown away.**
`places-client.ts:283` — `website: details?.website` — is a Google-verified
restaurant URL. It is never used to seed the `direct` ordering link.

**B5 · S2 · Citations are captured and never used.**
Sonar returns citations. They are stored and then ignored — never used to
corroborate a claimed link or menu item.

**B6 · S2 · No host allow-list per platform key.**
Nothing asserts that the value under `doordash` is actually on `doordash.com`. The
classic hallucination — a plausible platform URL that redirects to a homepage — is
undetectable by construction.

**B7 · S2 · GPT-invented restaurants enter the pool.**
When placeId matching fails, the model's restaurant survives into the result set. A
restaurant that does not exist can be presented to the user.

**B8 · S1 · Restaurant `carbs` and `fat` exist in no upstream source.**
Neither Sonar nor Places supplies them. They are pure invention, presented with the
same visual authority as measured values.

**B9 · S3 · Distance is enforced by a biased search radius plus asking the model to self-police.**
There is no post-hoc distance check. Two disagreeing mile tables exist in the
codebase (1/3/8 and 2/5/10), so "nearby" means two different things depending on
which path you enter through.

**B10 · S3 · The distance "validation" is a substring scan that hard-deletes on false positives.**
It scans for phrases including `"more than"` and `"beyond the"`. A menu description
containing either phrase in an unrelated sense causes the entry to be deleted.

**B11 · S1 · `foodAllergies` never reach menu extraction.**
The allergy field is collected and then dropped before the prompt that selects
dishes.

**B12 · S1 · `RESTRICTION_MAPPINGS` covers only vegetarian and vegan.**
Halal, kosher, gluten-free, dairy-free, keto, paleo, and pescatarian match nothing.
A user who selects any of those receives unfiltered results while the UI implies
filtering occurred.

**B13 · S3 · `restrictionViolations` is written to the database and read by no component.**
The detection result exists in storage and reaches no user.

**B14 · S2 · Rating, distance, and delivery time on the Restaurants tab are hardcoded literals.**
`4.2`, `2.5`, `'25-40 min'`. Every restaurant displays the same fabricated numbers.

---

## C. Groceries — stores and prices

**C1 · S2 · Prices are model-asserted and citations are dropped.**
Unlike the menu path, which at least captures citations, the price path discards
them. No price the app shows is traceable to a source.

**C2 · S3 · `priceConfidence` is the model's self-report.**
It is a number the model chose about its own certainty, displayed as if it were a
measurement.

**C3 · S2 · Store totals compare non-identical baskets.**
A store that returns fewer priced items produces a smaller total and therefore
"wins" the cheapest-store comparison. The ranking systematically rewards
incompleteness.

**C4 · S2 · Totals are keyed on raw model strings.**
`"Trader Joe's"` and `"Trader Joes"` become two stores, each holding half a basket,
each with a total that means nothing.

**C5 · S2 · Partial chunk failures are reported as complete.**
`priceSearchSuccess: true` is set whenever *any* item was priced. A run in which
four of five chunks failed reports success.

**C6 · S3 · Chunk size has a floor but no ceiling.**
`Math.max(15, ...)` — above roughly 90 items this reconstructs exactly the 45-second
timeout condition the chunking was introduced to avoid.

**C7 · S1 · ✓ Three stores are structurally required, and the prompt insists on filling them.**
`perplexity-client.ts:401` — `const StoreSchema = pinnedGroceryStores(3);` — pinned
to exactly three. `perplexity-client.ts:416` — *"Always provide 3 stores - use common
regional chains if exact location data is unavailable."* In a sparse area,
hallucination is not a risk; it is a requirement of the contract.

**C8 · S1 · ✓ Store addresses are not reconciled against Google Places.**
A code comment claims they are. `GooglePlacesClient` contains no grocery-store
search. The comment is false. Addresses are model-authored.

**C9 · S3 · Renamed items produce duplicate rows.**
When the model renames an item, the original persists unpriced alongside the priced
rename.

**C10 · S3 · Spread order lets the model overwrite user data.**
`{...original, ...item}` — the model's `quantity` and `uses` win over the values
derived from the meal plan.

**C11 · S3 · `price: z.number()` has no bounds.**
Negative and absurd prices validate.

---

## D. Workouts

**D1 · S2 · ✓ `weeklyPlan` is the one enumerable-count site left unpinned.**
`src/lib/ai/schemas/workout.ts:22` — `weeklyPlan: z.array(WorkoutDayOutline),`.
A four-day week for a six-day request ships with HTTP 200.

**D2 · S2 · Per-day exercise count is unpinned and unchecked.**

**D3 · S2 · Nothing compares delivered exercises against the outline.**
The day header — "45 min, 280 cal" — is generated from the outline. If the detail
phase returns one exercise, the header still says 45 minutes.

**D4 · S2 · `validateWorkoutPlan` is called on the live path and its result is discarded.**
Unlike A1, the wiring exists. The return value is simply never inspected.

**D5 · S2 · Free-form numeric strings reach `parseInt` and surface as `NaN`.**
`reps`, `restTime`, and `estimatedTime` are unconstrained strings. `parseInt("about
an hour")` → `NaN`. The UI prints **"NaNmin"**.

**D6 · S3 · `rpeTarget` is unbounded.**
The UI renders "(RPE 85/10)".

**D7 · S3 · `totalCaloriesBurned` reduce ignores its accumulator element.**
The reducer discards part of what it is summing.

**D8 · S1 · ✓ `injuryConsiderations` has no UI write site.**
Initialized to `[]` at `src/app/survey/page.tsx:758`, with no setter anywhere. The
prompt therefore always says "Injuries: none" — while the survey placeholder text
literally invites *"I have a knee injury."* We ask, we discard, and then we tell the
model there are no injuries.

**D9 · S3 · `availableDays` silently defaults to Mon/Wed/Fri and is then declared "A HARD CONSTRAINT."**
A default the user never chose is elevated to an inviolable rule.

---

## E. Recipes

**E1 · S1 · ✓ The recipe cache is keyed on dish name alone.**
`prisma/schema.prisma:293-294` — `dishName String @unique`. No dietary restrictions,
no nutrition targets in the key. **A coeliac user can be served a wheat-pasta recipe
generated for a different user.** This is the single highest-severity finding in the
audit.

**E2 · S1 · ✓ Dietary restrictions are never sent to the recipe route.**
`src/components/dashboard/MealPlanPage.tsx:1138` —
`dietaryRestrictions: [] // TODO: Get from user survey if available`.
The restrictions block in the recipe prompt is never emitted in production. The
feature is dead code.

**E3 · S2 · Per-serving versus whole-recipe nutrition is ambiguous in the prompt.**
Three mutually unsatisfiable instructions are given. The resulting error is not
random — it is off by exactly `servings`.

**E4 · S2 · `validateIngredientSums` is warn-only and does not block the write.**
It is correctly called on the recipe route. A recipe that fails it is upserted into
the shared cache anyway, where E1 then serves it to everyone.

---

## F. Images

**F1 · S2 · ✓ Fallback images are cached permanently.**
`src/lib/external/pexels-client.ts:290-323` upserts the fallback into `foodImage`
with `imageSource: 'fallback'`. There is no TTL, no expiry, and no
revalidate-on-read — the cache-hit branch returns early and never re-searches. One
transient Pexels outage permanently pins a generic image to that dish for every
user, forever.

**F2 · S2 · Two of eleven hardcoded fallback image URLs are dead 404s** — including
the workout `default`, which is the most-hit fallback in the set.

---

## G. Cross-cutting

**G1 · S4 · `CLAUDE.md` is stale in three places.**
It states *"every OpenAI call currently uses `response_format: {type:"json_object"}`"*
and describes Phase 0 as pending. Phase 0 has landed; `json_object` now appears only
in one stale comment and in `scripts/measure-tokens.mts`. The `withTimeout`
AbortSignal trap it warns about is fixed (now `Promise.race`), and the
recipe-cache-poisoning warning is partly healed by `RecipeSchema.safeParse` on read.
An agent following this file will re-litigate finished work — I did, at the start of
this audit.

**G2 · S4 · `AUDIT-RESULTS.md` is stale.** Claims gpt-4o-mini and `json_object`.

**G3 · S2 · The bench harness has three blind spots.**
`scripts/bench-generators.ts` covers eight sites but not `grocery-prices` (where
prices originate) or `restaurant-selection` / `restaurant-meals` (where ordering
links are assembled). The two surfaces the user complained about most are the two
the harness cannot see.

**G4 · S2 · `inspect` returns prose, not a verdict.**
The hook exists on all eight sites (:165, :189, :204, :222, :231, :252, :280, :312)
and is invoked at :435-437. It returns a descriptive string — `"21 meals, grocery
present"` — which a human must read. Nothing can fail on it, so nothing does.
**This is the natural seam for the eval harness**: `inspect` becomes a structured
four-family scorer rather than a log line.

**G5 · S3 · Three fixtures is not a corpus.**
`scripts/fixtures/surveys.ts` holds `vegetarian-cut`, `high-protein-gym`, and
`restricted`. None of them exercise halal, kosher, coeliac, an allergy, an injury,
a sparse geography, or a large basket — which is to say none of them would catch
B11, B12, C7, D8, or E1.

---

## What this adds up to

The user's three complaints map cleanly onto the findings:

- *"Doesn't give me the full answer"* → A2, A4, D1, D2, D3, C5. Incompleteness is
  detected in several places and signaled in none.
- *"Sometimes the numbers are wrong"* → A5, A6, A7, B8, C3, C4, D3, D5, E3. There is
  no arithmetic check on any live path, and the one validator that could do it reads
  a field that does not exist.
- *"We always want accurate links"* → B1, B2, B3, B4, B6. Every link is invented, the
  one verified URL available is discarded, and no link has ever been tested.

And beneath all three sits a safety tier the complaints did not mention: E1, E2,
B11, B12, and D8 mean that a user with coeliac disease, a nut allergy, a halal
requirement, or a knee injury is currently receiving output generated as though they
had told us nothing.

## Sequencing note for the fix plan

Two ordering constraints are load-bearing:

1. **A6 must be fixed before A1.** Wiring `validateMealPlan` into the live path
   while it still reads a nonexistent field produces a validator that rejects every
   plan.
2. **The eval harness (G3, G4, G5) should precede the semantic fixes.** Without a
   structured scorer there is no way to demonstrate that any fix in sections A–F
   actually moved a number, and no regression barrier afterward. The Phase 0
   baseline in `bench-results/README.md` is the precedent: measure, then change.
