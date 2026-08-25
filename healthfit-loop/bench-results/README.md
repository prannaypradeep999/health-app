# Benchmark results

Produced by `npm run bench` (`scripts/bench-generators.ts`). Filenames are the
run's ISO timestamp. **Do not gitignore these** — Phase 1 compares model
migrations against them, and a cost regression is only visible against a before.

Each file records the model map, the price table used, and per-cell schema-pass
rate, finish reasons, latency p50/p95, prompt/completion/reasoning tokens, peak
percentage of the token ceiling, and estimated cost per 1000 runs.

## The runs so far

| File | What it is |
|---|---|
| `2026-08-19T02-52-39-548Z.json` | First full-site sweep, one fixture. Superseded by the matrix below; kept because it is the first run after strict mode landed. |
| `2026-08-19T03-08-26-728Z.json` | **The Phase 0 baseline.** All 8 sites × 3 fixtures × n=2 = 24 cells, 48 calls. |
| `2026-08-19T03-05-26-905Z.json` | Phase 1 A/B: `meal-planning` on `gpt-4o`, the control for the two below. |
| `2026-08-19T03-05-58-275Z.json` | Phase 1 A/B: `meal-planning` on `gpt-5.6-luna`. |
| `2026-08-19T03-06-39-394Z.json` | Phase 1 A/B: `meal-planning` on `gpt-5.6-terra`. |
| `2026-08-19T03-07-49-983Z.json` | Phase 1 A/B: `meal-legacy` on `gpt-5.6-luna` — the ceiling-risk probe. |

## Phase 0 baseline, in one line

**100% schema pass on all 24 cells. Zero truncations. No site above 46% of its
token ceiling. $561.53 per 1000 runs of each site.**

That last number is the sum across all eight sites, which is not what one user
costs — a real generation hits a subset. It is a comparison constant, not a
budget.

The interesting column is `peakCeilingPct`. Under strict mode a truncated
response is a total loss rather than a short one, so headroom is a correctness
property now, not just a cost one. `meal-legacy` at 46% is the tightest, and
that is *with* Phase 0's chunking; without it the same week measured 94%.

## Reading the A/B files

Cost reversal, `meal-planning`, same prompt and fixture:

| Model | Out tokens | Reasoning | $/1k |
|---|---|---|---|
| `gpt-4o` | 1937 | — | $20.97 |
| `gpt-5.6-luna` | 4038 | 15% | $4.97 |
| `gpt-5.6-terra` | 4148 | 42% | $42.28 |

Terra costs twice what gpt-4o does for identical output. Reasoning tokens bill
at the output rate and are already inside `completion_tokens`, so a cost model
built on the sticker price alone gets this backwards. See the Amendments section
of `docs/superpowers/plans/2026-08-17-phase1-model-migration.md`.

These A/B cells are **n=1 — directional only.** Phase 1 Task 3 owes n=5.

---

# Pre-fix correctness baseline — 2026-08-25

This section records where generation correctness stands **before** any of the
three follow-up plans land. It is the number the fixes are measured against.

Run: `npm run bench -- --n=1`, 2026-08-25T06:34:29Z, 11 sites × 6 fixtures.
Models: `FAST` = `gpt-5.4-mini`, `PLANNING` = `gpt-5.6-luna`,
`DETAIL` = `gpt-5.6-luna`, `SEARCH` = `sonar`.

**n=1, so per-cell rates are directional, not significant.** A cell reading
`6e/0w` means one run produced six error-level findings — not that six is the
expected count. The plan asked for n=2; this was run at n=1 to halve the spend,
which weakens per-cell reading further. Treat the *ordering* of the codes as the
signal and the counts as an upper-bound sketch.

**Schema pass rate is 100% in every cell.** That is the headline. Phase 0's
`json_schema` + `strict: true` migration works exactly as advertised — every
response is shape-valid. All 345 findings below are *semantic*: correctly shaped
responses carrying wrong content. This is the central claim of the audit,
reproduced empirically.

## Per-family totals

| Family | Errors | Warns | Codes, by frequency |
|---|---|---|---|
| ARITHMETIC | 165 | 65 | implausible-price(120), identical-prices(40), ingredient-sum(32), off-target(18), unparseable-duration(15), serving-unit-mismatch(3), atwater-mismatch(2) |
| ADHERENCE | 55 | 4 | restriction-violation(37), invented-dish(18), injury-unreviewed(4) |
| LINKS | 24 | 12 | dead-link(18), link-unverifiable(12), no-usable-link(6) |
| COMPLETENESS | 18 | 2 | selection-count(6), empty-grocery-list(5), no-menu-items(4), missing-slot(2), thin-grocery-list(2), duplicate-slot(1) |

**345 findings total — 262 error, 83 warn.**

The user's three reported symptoms map cleanly onto three of the four families:
*"doesn't give the full answer"* → COMPLETENESS, *"the numbers are wrong"* →
ARITHMETIC, *"we always want accurate links"* → LINKS. ADHERENCE was not a
reported symptom and is the largest single error code after prices, which is
the most alarming result here: 37 restriction violations means the model served
gluten to the coeliac fixture without anyone complaining, because nothing in
the product surfaces it.

## Per-cell results

| Site | Fixture | Model | n | Pass | CMPL | ARITH | ADHR | LINKS | p50 ms | Out | $/1k |
|---|---|---|---|---|---|---|---|---|---|---|---|
| meal-planning | vegetarian-cut | gpt-5.6-luna | 1 | 100% | 2e/0w | · | · | · | 24455 | 3010 | 3.74 |
| meal-detail | vegetarian-cut | gpt-5.6-luna | 1 | 100% | · | 0e/1w | · | · | 51982 | 6148 | 9.42 |
| grocery-list | vegetarian-cut | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 2613 | 139 | 0.4 |
| meal-legacy | vegetarian-cut | gpt-5.6-luna | 1 | 100% | · | 0e/2w | · | · | 53630 | 7074 | 9.36 |
| workout-planning | vegetarian-cut | gpt-5.6-luna | 1 | 100% | · | 3e/0w | · | · | 13341 | 1147 | 1.53 |
| workout-detail | vegetarian-cut | gpt-5.6-luna | 1 | 100% | · | · | 0e/1w | · | 22744 | 2208 | 2.98 |
| recipe | vegetarian-cut | gpt-5.4-mini | 1 | 100% | · | 1e/0w | · | · | 7667 | 1314 | 0 |
| menu-extraction | vegetarian-cut | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | 1e/1w | 4484 | 395 | 0.58 |
| restaurant-selection | vegetarian-cut | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 1540 | 86 | 0.33 |
| restaurant-meals | vegetarian-cut | gpt-5.6-luna | 1 | 100% | · | 6e/0w | 6e/0w | 6e/2w | 9680 | 1322 | 2.22 |
| grocery-prices | vegetarian-cut | sonar | 1 | 100% | · | · | · | · | 22973 | 2780 | 3.46 |
| meal-planning | high-protein-gym | gpt-5.6-luna | 1 | 100% | · | · | · | · | 27997 | 3575 | 4.42 |
| meal-detail | high-protein-gym | gpt-5.6-luna | 1 | 100% | · | 0e/1w | · | · | 59824 | 7364 | 10.88 |
| grocery-list | high-protein-gym | gpt-5.6-luna | 1 | 100% | 0e/1w | · | · | · | 8640 | 874 | 1.28 |
| meal-legacy | high-protein-gym | gpt-5.6-luna | 1 | 100% | · | 2e/4w | · | · | 64778 | 8383 | 10.92 |
| workout-planning | high-protein-gym | gpt-5.6-luna | 1 | 100% | · | 2e/0w | · | · | 12216 | 1090 | 1.46 |
| workout-detail | high-protein-gym | gpt-5.6-luna | 1 | 100% | · | · | · | · | 21455 | 2229 | 3 |
| recipe | high-protein-gym | gpt-5.4-mini | 1 | 100% | · | 2e/0w | · | · | 7774 | 1335 | 0 |
| menu-extraction | high-protein-gym | gpt-5.6-luna | 1 | 100% | · | · | · | 1e/1w | 4689 | 497 | 0.7 |
| restaurant-selection | high-protein-gym | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 4243 | 481 | 0.79 |
| grocery-prices | high-protein-gym | sonar | 1 | 100% | · | · | · | · | 17932 | 2941 | 3.63 |
| meal-planning | restricted | gpt-5.6-luna | 1 | 100% | · | · | · | · | 25381 | 2864 | 3.56 |
| meal-detail | restricted | gpt-5.6-luna | 1 | 100% | · | 0e/1w | · | · | 64170 | 7648 | 11.23 |
| grocery-list | restricted | gpt-5.6-luna | 1 | 100% | 1e/1w | · | · | · | 3298 | 229 | 0.51 |
| meal-legacy | restricted | gpt-5.6-luna | 1 | 100% | · | 1e/3w | 19e/0w | · | 56705 | 7470 | 9.84 |
| workout-planning | restricted | gpt-5.6-luna | 1 | 100% | · | · | · | · | 11632 | 1106 | 1.48 |
| workout-detail | restricted | gpt-5.6-luna | 1 | 100% | · | · | 0e/1w | · | 20776 | 1986 | 2.71 |
| recipe | restricted | gpt-5.4-mini | 1 | 100% | · | 2e/0w | · | · | 7294 | 1245 | 0 |
| menu-extraction | restricted | gpt-5.6-luna | 1 | 100% | 1e/0w | · | 2e/0w | 1e/1w | 8132 | 691 | 0.94 |
| restaurant-selection | restricted | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 2502 | 155 | 0.41 |
| restaurant-meals | restricted | gpt-5.6-luna | 1 | 100% | · | 6e/0w | 6e/0w | 6e/2w | 9535 | 1385 | 2.3 |
| grocery-prices | restricted | sonar | 1 | 100% | · | 60e/20w | · | · | 19428 | 2752 | 3.43 |
| meal-planning | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 21645 | 2891 | 3.59 |
| meal-detail | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | · | · | · | · | 56396 | 6879 | 10.3 |
| grocery-list | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 4179 | 279 | 0.57 |
| meal-legacy | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | · | 0e/1w | 9e/0w | · | 54168 | 7074 | 9.36 |
| workout-planning | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | · | 1e/0w | · | · | 12159 | 1117 | 1.5 |
| workout-detail | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | · | · | 0e/1w | · | 21865 | 2155 | 2.91 |
| recipe | coeliac-nut-allergy | gpt-5.4-mini | 1 | 100% | · | 1e/0w | · | · | 6345 | 1159 | 0 |
| menu-extraction | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | 1e/0w | · | 3e/0w | 1e/1w | 7003 | 642 | 0.88 |
| restaurant-selection | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 4477 | 293 | 0.57 |
| restaurant-meals | coeliac-nut-allergy | gpt-5.6-luna | 1 | 100% | · | 6e/0w | 6e/0w | 6e/2w | 8888 | 1188 | 2.06 |
| grocery-prices | coeliac-nut-allergy | sonar | 1 | 100% | · | · | · | · | 21828 | 2758 | 3.43 |
| meal-planning | rural-sparse | gpt-5.6-luna | 1 | 100% | · | · | · | · | 27479 | 3534 | 4.37 |
| meal-detail | rural-sparse | gpt-5.6-luna | 1 | 100% | · | 0e/1w | · | · | 49944 | 6448 | 9.78 |
| grocery-list | rural-sparse | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 1984 | 137 | 0.39 |
| meal-legacy | rural-sparse | gpt-5.6-luna | 1 | 100% | · | 0e/4w | · | · | 55070 | 7130 | 9.41 |
| workout-planning | rural-sparse | gpt-5.6-luna | 1 | 100% | · | 5e/0w | · | · | 9898 | 934 | 1.27 |
| workout-detail | rural-sparse | gpt-5.6-luna | 1 | 100% | · | · | · | · | 20881 | 2072 | 2.81 |
| recipe | rural-sparse | gpt-5.4-mini | 1 | 100% | · | 2e/0w | · | · | 6179 | 1169 | 0 |
| menu-extraction | rural-sparse | gpt-5.6-luna | 1 | 100% | · | · | · | 1e/1w | 4582 | 552 | 0.77 |
| restaurant-selection | rural-sparse | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 1948 | 134 | 0.37 |
| grocery-prices | rural-sparse | sonar | 1 | 100% | · | · | · | · | 47325 | 2947 | 3.64 |
| meal-planning | large-household | gpt-5.6-luna | 1 | 100% | · | · | · | · | 32336 | 3957 | 4.88 |
| meal-detail | large-household | gpt-5.6-luna | 1 | 100% | · | · | · | · | 59070 | 7297 | 10.81 |
| grocery-list | large-household | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 2395 | 159 | 0.42 |
| meal-legacy | large-household | gpt-5.6-luna | 1 | 100% | · | 0e/7w | 2e/0w | · | 58399 | 7822 | 10.26 |
| workout-planning | large-household | gpt-5.6-luna | 1 | 100% | · | 4e/0w | · | · | 10141 | 1019 | 1.38 |
| workout-detail | large-household | gpt-5.6-luna | 1 | 100% | · | · | 0e/1w | · | 20879 | 2134 | 2.89 |
| recipe | large-household | gpt-5.4-mini | 1 | 100% | · | 1e/0w | 2e/0w | · | 6673 | 1202 | 0 |
| menu-extraction | large-household | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | 1e/1w | 4686 | 419 | 0.61 |
| restaurant-selection | large-household | gpt-5.6-luna | 1 | 100% | 1e/0w | · | · | · | 3335 | 280 | 0.56 |
| grocery-prices | large-household | sonar | 1 | 100% | · | 60e/20w | · | · | 25177 | 2781 | 3.47 |

Total across all benchmarked sites: $210.77 per 1000 runs of each.

`$210.77 per 1000 runs of each` is the total across all benchmarked sites.

## Findings by code

Every code with more than three occurrences, and the audit finding it
corresponds to. Codes at or below three are listed in the table above and in
the JSON artefact.

- **implausible-price — 120 [ARITHMETIC].** Sonar quotes `0` for the price of
  eggs, spinach, tomatoes at every store. This is **C11** (`price: z.number()`
  has no lower bound, so zero is schema-valid) meeting **C1** (prices are
  model-asserted and the citations that could refute them are dropped).
- **identical-prices — 40 [ARITHMETIC].** All three stores quote the same
  number for an item — here, `0`. The prompt itself names this as the signature
  of estimating rather than looking up, which makes it **C2**: `priceConfidence`
  is the model's self-report, and the model does not report low confidence when
  it estimates.
- **restriction-violation — 37 [ADHERENCE].** Bulgur served to the Gluten-Free
  fixture, feta and yogurt to the Dairy-Free one. This is **A9** —
  `strictExclusions` never reaches the planning prompt — surfacing through the
  now-working `normalizeRestriction` from Plan 2 Task 1. Before that fix the
  checker would have reported zero for exactly these cases.
- **ingredient-sum — 32 [ARITHMETIC].** Ingredient calories do not sum to the
  stated total; worst case is a recipe 125% out. This is **E4**:
  `validateIngredientSums` is warn-only and does not block the write, so a
  recipe that fails it is cached and served forever. Plan 2 Task 10 closes the
  cache half of this.
- **dead-link — 18 [LINKS].** `https://sakuraramenhouse.com`,
  `https://zaytoonberkeley.com` — DNS failures. This is **B2** (all five
  ordering-link fields are model-authored) made visible by the new liveness
  probe, which is **B1** (no link liveness check existed anywhere).
- **off-target — 18 [ARITHMETIC].** Restaurant meals stating 0 calories against
  a 480 target — 100% off. Downstream of the empty menu extraction below rather
  than an arithmetic failure in its own right: the model has no menu item, emits
  a placeholder, and the placeholder carries zeros. Related to **B8**
  (restaurant `carbs` and `fat` exist in no upstream source).
- **invented-dish — 18 [ADHERENCE].** `"No menu item available"` is offered as a
  dish. The model was handed an empty or near-empty menu and filled the pinned
  slot anyway — the pinned-array behaviour described in **C7**, occurring on the
  restaurant path.
- **unparseable-duration — 15 [ARITHMETIC].** `estimatedTime: "Rest day"`
  contains no digits and reaches `parseInt` as `NaN`. This is **D5** exactly.
- **link-unverifiable — 12 [LINKS].** DoorDash store URLs returning HTTP 403 to
  the probe. Warn, not error: 403 is bot-blocking, not a dead link, and the
  checker cannot distinguish a real store page from a fabricated one behind it.
  This is the residual risk **B6** (no host allow-list per platform key) is
  meant to bound.
- **selection-count — 6 [COMPLETENESS].** Restaurant selection returns 0, 1, or
  6 restaurants where the prompt asks for 8-10. The `vegetarian-cut` cell
  returning **zero** is the sharpest single instance of the user's "doesn't give
  the full answer" complaint in the whole sweep.
- **no-usable-link — 6 [LINKS].** No orderable link on any platform — the Order
  Now button has nowhere to go. **B2** again, in its total-failure form.
- **empty-grocery-list — 5 [COMPLETENESS].** 0 or 1 entries where at least 8 are
  needed. **A11**: `buildFallbackGroceryList` puts everything in `pantryStaples`
  with quantity `'varies'`, which the checker correctly declines to count.
- **injury-unreviewed — 4 [ADHERENCE].** The fixture declares a lower-back
  sensitivity, a shoulder impingement, a knee restriction; the checker can only
  flag that it needs review, not judge the movements. This is **D8** —
  `injuryConsiderations` has no UI write site, so in production this field is
  empty and the model is never told at all.
- **no-menu-items — 4 [COMPLETENESS].** 2-3 menu items where at least 6 are
  needed. **B3**: the Sonar menu call passes no `response_format`, so extraction
  degrades silently and everything downstream — dish choice, calories, links —
  is built on two items.

## What this baseline cannot see

Sixteen audit findings are properties of the *route code*, not of a model
response: a discarded validator result, a fire-and-forget dispatch, a cache key,
a hardcoded UI literal. A1, A4, A6, A7, A12, B4, B13, B14, C5, C8, D4, D8, E1,
E2, F1, F2 are invisible to an offline prompt-and-schema harness and are
verified by inspection in the follow-up plans instead. **A green eval run is not
evidence that those are fixed.**

Re-run with `npm run eval` (which is `--fail-on=error`) after the fixes land.
