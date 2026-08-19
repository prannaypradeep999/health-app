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
