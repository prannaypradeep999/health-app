# Generation Grounding — Design

**Date:** 2026-08-25
**Status:** proposed
**Predecessor:** `docs/superpowers/specs/2026-08-24-generation-correctness-audit.md`

## The problem in one paragraph

The 2026-08-24 work made generation *internally* consistent: schemas are
grammar-constrained, sums add up, durations parse, links that are emitted are
probed. It did not make generation *true*. A dish can be schema-valid, priced to
two decimals, macro-balanced, linked to a live grubhub.com page, and still not
exist. Nothing in the pipeline compares what the user sees against what the web
actually said, even though the pipeline already fetched what the web actually
said and then threw it away.

## Root cause: the trust inversion

Restaurant meals are produced by three model calls in series.

| Hop | Call | Grounded? | Output |
|-----|------|-----------|--------|
| 1 | Perplexity Sonar (`extractMenuData`) | **Yes** — retrieval-backed, returns `citations` and `search_results` | `MenuSearchSchema`: `name`, `price\|null`, `description`, `statedCalories\|null`, `sourceUrl\|null`, `orderingLinks` |
| 2 | GPT `MODELS.DETAIL` (`processWithGPT4`) | No | `MenuExtractionSchema`: adds `category`, `estimatedCalories`, `estimatedProtein/Carbs/Fat`, `healthRating`; **`price` loses its nullability** |
| 3 | GPT `MODELS.DETAIL` (`selectRestaurantMealsForSchedule`) | No | `RestaurantMealObject` — what the user sees |

Hop 1 is the only hop that looked at the internet. Its output is deliberately
conservative: `MenuSearchSchema` comments say *"Null when the menu did not
publish it. Do not estimate here."*

Then `perplexity-client.ts` does this:

```ts
const content = data.choices?.[0]?.message?.content || '';
// ...
const structuredData = await this.processWithGPT4(content, citations, restaurant, surveyData);
```

`content` is grammar-constrained `MenuSearchSchema` JSON. It is passed to hop 2
**as a string** and never parsed. `data.search_results` is never read at all.
Hop 2's schema then makes `price` non-nullable, so every price the menu did not
publish must be invented, and the invention is indistinguishable from the ones
that were real. Hop 3 rewrites everything again with no source in view.

The one grounding signal that does exist — `corroborate(orderingLinks,
citationUrls)` — is computed, logged, returned as `linkCorroboration`, and has
**zero consumers**. `grep -rn "linkCorroboration" src/ scripts/` finds only its
own type declaration and its own assignment.

So: the pipeline holds the receipt and does not read it. That is the bug, and it
is small.

## What can actually be verified

Not everything the user asked for is verifiable. Being honest about that is part
of the design, because a system that claims to verify prices it cannot verify is
worse than one that says "estimate".

**Tier A — evidence already in hand.** Zero latency, zero cost, zero new
dependencies. This is the whole of the request-path work.

- Hop-1 `MenuSearchSchema` JSON (currently discarded)
- Perplexity `citations` and `search_results` (partly discarded)
- Google Places facts, already carried as `buildRestaurantFacts`
- The survey itself
- The recipe's own `ingredientsWithNutrition`
- The meal plan the grocery list was derived from

**Tier B — real external ground truth, cheap but not free.**

- HTTP link probes (`src/lib/external/link-check.ts`) — already running in the
  restaurant route at `timeoutMs: 6000`
- USDA FoodData Central for ingredient nutrition — free API, but a network call
  per ingredient. **Harness only.** Never in the request path.

**Tier C — not verifiable at our scale.** Current restaurant prices and grocery
prices. Every verified feed (menu, item, price) is partner-gated: Grubhub,
DoorDash, Uber Eats, Instacart, Kroger and Spoonacular all require a commercial
agreement, and none sells to an app this size at any price. There is no clever
workaround. Policy: **corroborate against what the page said, label everything
else an estimate, and never render an unverified number as a fact.**

That last line is the product decision this design asks you to accept. The
system gets meaningfully more accurate. It does not become authoritative.

## Architecture: a sidecar, not a rewrite

Your constraint was "a small rewrite to confirm accuracy and procedure of
generation rather than something that can break the entire app." The design is
shaped around that constraint, not around what would be maximally thorough.

**New code lives in a new directory.** `src/lib/verification/` holds pure
functions of the form `(claim, evidence) => Verdict[]`. No network, no Prisma, no
OpenAI in the pure layer. They are unit-testable with fixtures, like
`scripts/eval/*`.

**Verdicts travel beside the payload, never on it.** The repo already has the
right precedent in `buildRestaurantFacts`:

> *"Places-sourced facts, keyed by lowercased restaurant name, carried alongside
> the model-authored meal objects rather than on them. Putting a rating on a
> model output would ask the model to invent one."*

Verification verdicts get the same treatment — a `verification` block in
`userContext`, keyed the same way. Generated objects are byte-identical to today.

```ts
type VerdictStatus = 'verified' | 'unverified' | 'contradicted' | 'unchecked';

interface Verdict {
  check: string;        // 'R2-price-matches'
  target: string;       // 'monday.lunch.primary.price'
  status: VerdictStatus;
  claim: string;        // '18.95'
  evidence: string;     // 'menu listed 16.50'
  source: string | null;// the sourceUrl or citation that grounds it
}
```

The four statuses are distinct on purpose. `unverified` means we had no evidence
either way — that is the honest state for a macro estimate. `unchecked` means the
verifier itself did not run. Collapsing those two would let a crash read as a
clean bill of health.

**Fail-open, always.** One `try/catch` around the whole verification pass. On
throw, every verdict is `unchecked` and the request proceeds untouched.
Availability must not become the product of two systems' uptimes.

**Three-state flags.** Each check reads `off | shadow | enforce`. Everything
ships in `shadow`: verdicts are computed, persisted and logged, and change
nothing the user sees. A check is promoted to `enforce` only after a clean run
across the fixture sweep. `off` is the panic switch.

**Enforce, when we get there, is conservative.** A `contradicted` price is
replaced by the hop-1 price — we have the better number, we just were not using
it. A `contradicted` dish name falls back to the slot's `alternative`. Nothing
deletes a meal and leaves a hole; the audit's whole first family was
COMPLETENESS.

## The checks

### Restaurants — compare hop 3 against hop 1

Requires one plumbing change: `extractMenuData` must `JSON.parse` the hop-1
content it already has and return it as `searchItems` alongside `menuItems`. That
is the single highest-value line in this document.

| ID | Claim | Evidence | On contradiction |
|----|-------|----------|------------------|
| R1 | hop-3 `dish` exists | normalized match against hop-1 `menuItems[].name` | fall back to `alternative` |
| R2 | hop-3 `price` | hop-1 `price` when non-null | replace with hop-1 price |
| R3 | hop-3 `estimatedCalories` | hop-1 `statedCalories` when non-null, ±15% | replace with stated value |
| R4 | `protein`/`carbs`/`fat` | *none exists upstream* | always `unverified`; UI must label |
| R5 | `orderingLinks` host | hop-1 links ∪ `citations` ∪ `search_results` hosts | drop the link, keep the meal |
| R6 | link resolves | existing `verifyLinks` probe | already handled |
| R7 | `restaurant`, `address` | `buildRestaurantFacts` (Places) | replace with Places value |

"Normalized match" in R1 means: lowercase, strip punctuation and articles,
collapse whitespace, then require that one string contains the other. Hop 2 and
hop 3 shorten names ("Grilled Chicken Shawarma Plate" → "Chicken Shawarma"), so
exact equality would flag honest rewording; token-overlap scoring would need a
threshold nobody can defend. Containment is the narrowest rule that tolerates
shortening and still catches an invented dish. Ambiguous cases resolve to
`unverified`, never to `verified`.

R5 is `corroborate` finally being wired to something, applied per meal rather
than per restaurant. R4 is not a check — it is a standing admission, and it
exists so the UI has something to key a "est." label off.

Grubhub matters here and is already supported: `PLATFORM_HOSTS` in
`link-check.ts` includes `grubhub: /(^|\.)grubhub\.com$/i`, and grubhub URLs get
the same host-filter-then-probe treatment as every other platform. R5 is what
stops a *plausible-but-invented* grubhub URL, which host filtering and probing
both let through.

### Home meals

| ID | Claim | Evidence |
|----|-------|----------|
| M1 | recipe macros | `sum(ingredientsWithNutrition) / servings` — existing `ingredient-validator` |
| M2 | ingredient nutrition is plausible | USDA FoodData Central — **harness only** |
| M3 | no restricted ingredient | `restriction-validator` vocabulary, plus the judge below |

### Groceries

| ID | Claim | Evidence |
|----|-------|----------|
| G1 | every recipe ingredient appears in the list | the meal plan itself |
| G2 | every list item traces to a recipe | the meal plan itself |
| G3 | prices | Tier C — `unverified`, labelled estimate |

G1 is the check most likely to catch the original complaint. "The generation
doesn't always give me the full answer" describes a grocery list missing
ingredients far better than it describes a wrong macro, and it is verifiable for
free against data already in memory.

### Workouts

| ID | Claim | Evidence |
|----|-------|----------|
| W1 | exercise equipment ⊆ available equipment | survey |
| W2 | no contraindicated movement | survey injuries |
| W3 | day count and session duration | survey |

All Tier A. Workouts are the easy surface, as you said — the evidence is the
survey, which we are holding.

## Do we need a second LLM check?

You asked and were unsure. The answer is: **in exactly one place, and not on the
request path.**

Where a deterministic check exists, a model is strictly worse — slower, costlier,
non-reproducible, and capable of being confidently wrong in the direction of
"looks fine." R1–R7, G1–G2 and W1–W3 are all string and number comparisons
against evidence in memory. Adding a model to those would be pure cost.

The exception is dietary and allergen adherence, where the vocabulary is
genuinely open-ended. Regex knows `pork`; it does not know that carnitas is pork,
that ghee is dairy, that Worcestershire sauce contains anchovy, or that a dish
described only as "the house special" needs a second look. That is a language
problem and it wants a language model.

Two rules govern it:

1. **It may flag. It may never clear.** A `pass` from the judge does not upgrade
   anything to `verified`. Judge errors correlate with generator errors — the
   same blind spot that let the model write "carnitas bowl" under a vegan profile
   can let it approve one. Self-consistency and retries do not fix correlated
   error. The judge only ever adds `contradicted` verdicts.
2. **It runs after the response, not inside it.** The restaurant route's budget
   is `ROUTE_TOTAL_BUDGET_MS = 53_000` and it is fully allocated: Places ~3s,
   selection ~9s, menu extraction reserves 22s, meal selection ~18s. There is no
   headroom. The judge is one `MODELS.FAST` call over a compact list of
   dish and ingredient strings (~1–2s), fired after the payload is persisted,
   writing its verdicts back into `userContext`. First render is unchanged.

**Net latency added to generation by this entire design: zero.** Everything on
the request path compares data already in memory. Nothing new goes over the wire
before the user sees a result.

## Testing

`scripts/eval/` gains a fifth family, **GROUNDING**, alongside COMPLETENESS,
ARITHMETIC, ADHERENCE and LINKS. It replays fixtures that pair a hop-1 payload
with a hop-3 payload and asserts the verdicts. Fixtures include at least one
seeded fabrication per check — an invented dish, a drifted price, a plausible
uncited grubhub URL — so the harness proves the checks *fire*, not merely that
they run.

Unit tests sit next to the modules, per repo convention, and run under
`npx tsx --test`.

## Blast radius

Files modified in the existing request path, in full:

- `src/lib/external/perplexity-client.ts` — parse hop-1 content, return
  `searchItems`; return `searchResults` hosts. Additive to the return type.
- `src/app/api/ai/meals/generate-restaurants/route.ts` — one call to the verifier
  before the existing `prisma.mealPlan.update`, one `verification` key added to
  `userContext`.
- `src/app/api/ai/meals/generate-home/route.ts`,
  `generate-groceries/route.ts`, `workouts/generate/route.ts` — same one-call
  shape.

Everything else is new files under `src/lib/verification/` and `scripts/eval/`.
No existing function changes its behaviour; two change their return type
additively. With every flag at `shadow` — the shipping default — the user-visible
output is byte-identical to today's.

## Explicitly out of scope

- Any paid or partner data feed
- Scraping restaurant or grocery sites directly
- Replacing the three-hop architecture with a single call
- Fine-tuning or hosting a local entailment model
- Changing any UI, beyond what an `est.` label eventually needs

## Open decision for review

The UI work implied by R4 and G3 — rendering unverified numbers as estimates
rather than facts — is deliberately left out of this spec. The verdicts will
exist in `userContext` from day one; deciding how they surface is a separate,
smaller design once we can see real verdict distributions from shadow mode.
