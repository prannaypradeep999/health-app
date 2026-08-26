# Restaurant generation: the four remaining measured defects

**Date:** 2026-08-26
**Status:** design, approved in advance
**Predecessors:** `2026-08-24-generation-correctness-audit.md`, `2026-08-25-generation-grounding-design.md`

## Why this document exists

The 2026-08-24 audit and the benchmark work that followed it closed the loud
failures: the route now records an honest phase status when selection returns
nothing, the selection prompt no longer asks the model to retype links it was
already shown, and the benchmark fixture now actually puts a menu in front of
the model instead of the string `No menu items available`.

Four defects survived that work. Three were *measured* — they are numbers from
`bench-results/`, not suspicions. The fourth is a code reading confirmed by
rendering the real prompt. They are unrelated to each other except that all four
are ways the restaurant half of a plan can be wrong without anything throwing.

This design covers all four. It deliberately does not restructure anything: the
standing instruction on this work is *"a small rewrite to confirm accuracy and
procedure of generation rather than something that can break the entire app."*
Every change below is additive or a single constant, and each one can be
reverted on its own.

---

## Defect 1 — `no-usable-link`: the Order button with nowhere to go

### What was measured

14 of 140 benched restaurant options carry no orderable link at all. Production
is worse: on the observed run, 2 of 9 discovered restaurants survived menu
extraction still holding a link.

### Why it happens, and why most of it is correct behaviour

Three filters stand between a restaurant and a rendered Order button, and two of
them are doing their job:

1. `suppressUndisplayablePlatforms` (`src/lib/external/link-check.ts`) nulls
   DoorDash and Uber Eats before they are ever probed, because both answer 403
   to datacenter IPs and we therefore cannot tell a live link from a dead one.
   That is a deliberate policy switch, documented in that file, and it should
   stay.
2. `verifyLinks` drops anything that does not answer, and anything whose deep
   path 302s to the site root. Also correct — a live-but-useless link is worse
   than none.
3. `extractMenuInformation` keeps a restaurant when it knows at least one dish,
   *not* when it has a link. Also correct: a walk-in place with a known menu is
   a real recommendation.

So the residue is genuine. After suppression and probing, some restaurants
simply have no link we are willing to stand behind. The defect is not that we
drop those links — it is that having dropped them, we leave the user holding a
dish name and no way to act on it. `MealPlanPage`'s `availableOrderLinks`
returns `[]` and no button renders at all.

### The fix

Give every restaurant option a destination that is **derived, never invented**:
a Google Maps *search* URL built from the restaurant's name and address, both of
which came from Google Places and are already on the meal object.

```
https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(name + ', ' + address)>
```

This is the documented Maps URL API. It matters that it is a *search* and not a
place deep link: a search cannot 404 into the wrong restaurant, which is the
exact failure mode `isHomepageRedirect` exists to catch. It needs no probe — so
it costs nothing against the route budget — and the Maps listing it lands on
carries the phone number, hours, directions, and frequently an order link of its
own.

It must be **labelled honestly**. It is not an Order button. It renders as
`Find it` / `Directions`, visually distinct from the platform buttons, and only
when no platform link survived.

### Where it lives

A new pure module, `src/lib/utils/restaurant-links.ts`, exporting:

```ts
export interface OrderOption { key: string; label: string; url: string; kind: 'order' | 'locate'; }
export function mapsSearchUrl(name: string, address?: string | null): string | null;
export function orderOptionsFor(meal: unknown): OrderOption[];
```

`orderOptionsFor` returns the surviving platform links as `kind: 'order'`, and
when there are none, the single Maps option as `kind: 'locate'`. When there is
not even a name it returns `[]` — that case still deserves the bench's
`no-usable-link` error, and it is now the *only* case that does.

Three call sites consume it: `MealPlanPage.availableOrderLinks`,
`MealPlanPage.handleRecipeClick`, and `RestaurantListSection`. `scripts/eval/links.ts`
consumes it too, so the harness scores the same thing production renders — the
principle already stated at the top of `link-check.ts`: *a harness measuring a
different implementation from production measures nothing.*

Doing this in a pure helper the UI calls at render time, rather than by writing
a fifth key into stored `orderingLinks`, has three advantages: `OrderingLinks`
in `src/lib/ai/schemas/shared.ts` is `.strict()` with exactly four required
keys and stays untouched; plans already in the database get the fallback for
free; and no route-budget time is spent.

---

## Defect 2 — `validateRestrictions` never reads a restaurant meal's description

### What is wrong

`src/lib/utils/restriction-validator.ts` builds its search text as:

```ts
const mealName = (meal.name || meal.dish || meal.description || '').toLowerCase();
const searchText = `${mealName} ${ingredients}`;
```

Those are `||`, not concatenation. For a restaurant meal, `dish` is always
truthy and `ingredients` is always absent — `RestaurantMealObject` has no
ingredients field. So the description is **never** scanned, and a restaurant
meal is checked on its dish name alone.

A dish called `Bento Box` whose description reads *"pork belly, rice, pickles"*
passes a vegetarian check today. Verified by reading both call sites: the
restaurant route at `generate-restaurants/route.ts` sets
`name: meal.primary.dish || ...` before calling, guaranteeing `name` is truthy.

### What must not be done about it

The obvious adjacent fix — teaching `containsTerm` about negation, so that
*"no pork"* stops matching `pork` — is the wrong one, and was rejected during
the bench work for a reason worth writing down: it would make a dietary and
allergy check **more permissive** by trusting the model's own prose that an
ingredient is absent. Over-flagging fails safe. Under-flagging does not.

### The fix

Scan the description, as a **separate pass at `warning` severity**, deduplicated
against the terms the name/ingredients pass already found.

Warning severity is what makes this safe to ship blind. `valid` is computed from
error-severity violations only, so this change cannot fail a plan that passes
today; it can only add information. Violations are already surfaced — they are
stored on the plan and rendered as a banner in `MealPlanPage` — so a real hit
reaches the user, and a false positive is a visible line rather than a lost
plan.

The existing behaviour where `description` *is* the name (when neither `name`
nor `dish` exists) is preserved at full severity, and the new pass skips the
description in that case so nothing is reported twice.

### The paired prompt change

The false-positive risk is real and has a measured source: when the user is
vegetarian, the model writes justification prose into `description` — *"no meat,
poultry, fish, or gelatin listed"* — which a word-anchored, negation-blind
matcher flags. This produced six spurious violations against a compliant Falafel
Wrap during the bench work.

The home-meal prompt already forbids exactly this (`meal-generation.ts`: *never
put an explanation or apology in the "description" field*). The restaurant
prompt does not. Adding the same rule there attacks the false positives at
their origin, which is the only honest place to attack them.

---

## Defect 4 — the selection reserve is smaller than selection's own p95

### What was measured

At seven restaurant slots — the load that failed in production on 2026-08-26 —
meal selection over ten runs:

| | measured | available in the failing run | margin |
|---|---|---|---|
| p50 | 17,370 ms | 26,705 ms | 35% |
| p95 | 22,800 ms | 26,705 ms | 15% |

The 26,705 ms figure is derived from that run's own timings:
53,000 − (discovery 9,466 + extraction 16,829).

### The defect

`generate-restaurants/route.ts` wraps Phase 2 in `reservingBudget(22_000, ...)`.
That constant is a promise: *Phase 3 will have at least 22 seconds.* The comment
beside it justifies 22s as "one DETAIL-model call... ~18s".

Selection's p95 is now 22,800 ms. **The reserve is below the p95 of the thing it
is reserving for.** It happened to be survivable in the failing run only because
Phase 2 finished early and handed Phase 3 26.7s it was never guaranteed. When
Phase 2 uses its full allowance, Phase 3 gets 22s and a p95 run is cut off —
and a cut-off Phase 3 returns `[]`, which is total loss of the restaurant half
of the week.

### The fix

Raise the reserve to `26_000`.

The trade is Phase 2's wall clock, and it is a good trade in both directions:

- Phase 2 loses ~4s of its ~21.5s. Because `mapWithLimit(toEnrich, 6, ...)` runs
  all six lookups in one wave, Phase 2's wall time is roughly the slowest single
  lookup, not the sum — so the loss costs the slowest one or two restaurants,
  not all six.
- Phase 2 **degrades gracefully**: a restaurant whose lookup does not finish is
  dropped and the rest of the plan is built from the ones that did. Phase 3 does
  not degrade at all; it is all-or-nothing.

Trading a phase that degrades for a phase that does not is the whole argument.
The constant is extracted and named so the reserve and the measurement that
justifies it sit next to each other, the way `MENU_STRUCTURING_RESERVE_MS`
already does in `route-budget.ts`.

### The measurement that was owed — taken 2026-08-26

Every latency number above came from a fixture showing the model three
restaurants of three dishes. Production shows it up to six of eight. The fixture
is now six of eight — the prompt's own `.slice(0, 8)` cap means eight is the
real per-restaurant ceiling, so this saturates production rather than
exaggerating it — and the seven-slot benchmark was re-run.

**The 15% margin was an artefact of the small fixture. It is gone.**

A/B in one session, same model and conditions, `eats-out-often` (7 slots), n=5:

| | old fixture 3×3 | new fixture 6×8 | available |
|---|---|---|---|
| p50 | 20,156 ms | **30,872 ms** | 26,705 ms |
| p95 | 28,778 ms | **34,752 ms** | 26,705 ms |

The old fixture reproduces ~20s against the ~17.4s originally recorded, so the
harness is consistent and the +53% p50 is caused by menu size, not by drift or a
slow API day. The median run now exceeds the budget; p95 exceeds it by 30%.

### What this means: the reserve is necessary but not sufficient

Raising the reserve to 26,000 is still strictly better than 22,000 and should
stay. But it cannot close this gap, because at full menu size **the three phases
do not fit the route budget at all**:

```
discovery        9,466 ms   (OBSERVED_RESTAURANT_DISCOVERY_MS)
extraction floor 9,000 ms   (MENU_STRUCTURING_RESERVE_MS)
selection p95   34,752 ms   (measured above)
                ─────────
                53,218 ms   against ROUTE_TOTAL_BUDGET_MS of 53,000
```

There is no reserve value that fixes this. Reserves divide the budget; they do
not create it.

**Why production has not collapsed:** link filtering leaves far fewer than six
restaurants — 2 of 9 survived on the one run observed in the runtime logs (§
Defect 1), which is a single observation rather than a measured range — so the
real prompt today sits below the 6×8 fixture. The
restaurant-pool defect is currently *masking* the latency defect. Fixing the
pool — previously logged as "the next real defect" — would surface this as total
loss of the restaurant half, because Phase 3 is all-or-nothing. **These two must
be scheduled together, pool first only if latency is addressed in the same
change.**

### Deliberately not fixed here

Each remaining option changes generation behaviour or the route's shape, which
is outside the containment this work was scoped to. Ranked by contained-ness:

1. ~~**Lower the dish cap**~~ — **measured and rejected.** `.slice(0, 8)` → 5 in
   `meal-generation.ts:979`, benched the same way (`eats-out-often`, n=5):

   | | cap 8 | cap 5 | available |
   |---|---|---|---|
   | p50 | 30,872 ms | 27,107 ms | 26,705 ms |
   | p95 | 34,752 ms | 31,011 ms | 26,705 ms |
   | worst adherence miss | 14% (warn) | **26% (error)** | 10% warn / 25% error |

   It buys ~12% and still does not fit, so it fails at the thing it was for.
   And it breaks what it was supposed to protect: with five dishes the model
   sometimes has nothing near the target, and a 26%-off meal appeared — the
   first adherence *error* any run has produced. Starving selection of choice
   is not a latency fix, it is a quality regression that does not even pay for
   itself. (n=5, so treat the warn counts as indicative; the error and the
   latency floor are the load-bearing parts.)

   Note also that `meal-generation.test.ts`'s "the bench fixture actually
   reaches the model as a menu" asserts every fixture dish renders, so it fails
   under any cap below the fixture's depth — by design. A future cap change
   must update that guard deliberately rather than discover it.

2. **Split selection into two parallel calls** — roughly halves wall time and
   keeps every dish. The largest change, and the one the original design named
   as the fallback if this measurement came in above 26s. It did, and option 1
   is now eliminated, so this is the recommendation.
3. **Raise `ROUTE_TOTAL_BUDGET_MS`** 53s → ~56s. Buys ~3s of a ~9s gap and eats
   headroom against `maxDuration = 60`. Insufficient alone; possibly useful
   alongside (2).

The reserve change stays shipped. Nothing above was undertaken unilaterally —
option 1 was measured on a scratch edit and reverted, not committed.

---

## Defect 3 — the audit for further `menuData`-class drift

### What was being looked for

The `menuData` bug had a specific shape, and it is the shape that makes it
dangerous: a field name went quiet. Nothing threw, no schema rejected anything,
no test failed. The bench fixture spelled the dish list `menuItems` — the
extraction schema's name for it — while the selection prompt reads `menuData`,
the name the route re-homes it under. So every benched restaurant rendered "No
menu items available", the model echoed that string back as a dish name with 0
calories, and the harness recorded `invented-dish` and `off-target` errors
against a generator that had been handed nothing to choose from.

The harness was reporting confidently on a question it was no longer asking. So
the audit's question was not "are there bugs" but "where else is a check
grading the fixture rather than the generator".

Ten findings. Seven were real and are fixed; two are real, understood and
deliberately left; one did not survive verification.

### Fixed — the restaurant path

**`invented-dish` fired on every correctly combined dish.** The check was exact
string equality against a single menu name, while prompt rule 5 tells the model
to combine dishes to hit a protein target and write the result joined with
`" + "`. Obeying the prompt *guaranteed* an ADHERENCE error. Now each component
is checked separately: a combination is invented when any one part is, which is
the real failure and is still caught.

**The recipe check read `d.dishName`.** `RecipeSchema` is `.strict()` and the
field is `name`, so this resolved to `''` on every run and the dish name was
never scanned. The `restricted` fixture asks for a "Lamb and Chickpea Tagine"
against a halal, no-lamb survey and passed on its name for as long as the check
has existed. Now reads `name` plus both ingredient lists — not `description`,
which is prose, and the term matcher is negation-blind.

**`restaurantMenuDataFixture` had no `rating`.** The selection prompt prints
`Rating: ${restaurant.rating || 'N/A'}`, so all three restaurants read "N/A" and
the bench never once exercised the model's ability to prefer a well-reviewed
place. The existing structural guard could not have caught this and it is worth
being precise about why: those records are a *join* — extraction's output merged
onto the chosen restaurant — and `rating` belongs to the selection half, so
parsing them against `MenuExtractionSchema` passes by omission, forever. The new
guard reads the *rendered prompt* for placeholder strings instead, which catches
a field going quiet whichever half it came from. It was verified by removing a
rating and confirming the test fails.

**The menu-extraction site benched an inlined prompt.** It was a hand-written
paraphrase of `createMenuStructuringPrompt`, and the two drifted. The part that
drifted is the part that matters: the real builder ends with
`buildDietaryRulesBlock` and `buildAllergyBlock` — the entire dietary-safety
mechanism for menu extraction, and the vocabulary CLAUDE.md warns must stay in
step with `normalizeRestriction` and `validateRestrictions`. None of it had ever
been benched. The site now calls the real builder.

### Fixed — cross-cutting

**The grocery site benched an empty ingredient list.** `createGroceryPrompt`
reads `meal.primary?.ingredientsWithNutrition`, which only the detail phase
produces; the bench passed `plan.mealPlan`, which is planning output and has no
`primary`. Every benched grocery prompt rendered `ALL INGREDIENTS FROM RECIPES:`
followed by nothing. The model was asked to consolidate an empty list and then
graded on whatever it invented to fill it. A cached `detailFor()` now seeds the
site the way `planFor()` seeds the others — and with real ingredients finally in
scope, the site gets a grounding check it could never have had before.

**The workout-detail outline was hard-coded to monday.** `verifyWorkoutPlan` is
handed the fixture's real `availableDays`; `restricted` trains tue/thu/sun and
`rural-sparse` trains sat/sun. Both scored a GROUNDING error for training on a
day the *bench* chose and the model was never offered an alternative to. The
outline is derived from `availableDays` now, so that verdict can only be earned
by actually inventing a day.

**`grocery-prices` graded a null price as `implausible-price`.** `price` is
`.nullable()` on purpose: with a required non-nullable number, Sonar answered 0
for everything it could not find, and zero is not a cheap price, it is a missing
one — it made whichever store failed to price an item look cheapest. `null` is
the model correctly reporting it could not price the item, and the check
`!(o.price > 0)` called that an error. Now a COMPLETENESS warning.

### Left, knowingly

**Workout prompts are benched without the exercise library or feedback
history** — the bench passes two arguments where production passes four or
five. Verified before deciding: `libraryExercises` renders through a
`length > 0` ternary, so `undefined` and `[]` produce byte-identical prompts.
The benched path is therefore exactly the path a new user gets, which is the
path that matters here. Fabricating a library fixture would invent ground truth
rather than measure it. Recorded, not fixed.

**Production sends system messages the bench never sends** —
`HOME_MEAL_NUTRITION_METHOD`, `RECIPE_SYSTEM_PREAMBLE`, and the
pricing-researcher message. This is the same class as the menu-extraction
finding above and deserves the same fix, but it touches every home-meal site
rather than one restaurant site. It is the largest remaining known gap in the
harness and should be the next piece of harness work.

### Did not survive verification

The audit reported that `invented-restaurant` can never fire, because
`joinRestaurantDetails` sets `restaurant: record?.name || choice.restaurant`
before scoring. Reading the join showed the opposite: `record` is `null` when
`findRestaurantRecord` matches nothing, the model's own spelling survives, and
the check fires exactly when the join failed — which is when it should. The
rewrite is what *fuzzy* matches are normalised by, and that is correct
behaviour, not a suppressed check. No change made.

The audit also noted that `RATES` has no `gpt-5.4-mini` entry, so the `recipe`
site reports a cost of 0. True, and already handled: the runner pushes a
`⚠️ no rate table entry` note, which is the "loud zero" the table's own comment
promises. No price was invented to fill it — that number has to come from the
billing page, not from a model that would be guessing.

### The through-line

Six of the seven fixes changed a *check* or a *fixture*, not a generator. That
is the finding underneath the findings: the bench's failure mode is not a false
negative in the model, it is a check that has quietly stopped asking its
question, and it reports that state as a clean column rather than as an error.
Every guard added here is aimed at that — the placeholder scan on the rendered
prompt is the general form, because it tests what the model was actually shown
rather than what we believe we passed it.
