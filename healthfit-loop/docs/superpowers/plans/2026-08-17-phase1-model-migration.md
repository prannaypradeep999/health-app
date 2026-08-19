# Phase 1: Model Migration (gpt-4o / gpt-4o-mini → GPT-5.6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan. Work one task at a time, verify each before moving on.

**Prerequisite: Phase 0 must be complete and merged.** This plan assumes `src/lib/ai/models.ts` exists, that every call site reads its model string from `MODELS.*`, and that `scripts/bench-generators.ts` runs and produces a saved baseline. If any of those is missing, stop and finish Phase 0 first. Migrating models before the schema is enforced means you cannot tell a model regression apart from a parsing regression.

## Goal

Move off `gpt-4o` and `gpt-4o-mini` onto the current GPT-5.6 family, without changing output shape, without a quality regression, and without a cost increase. Because Phase 0 centralised the model strings, the migration itself is a handful of environment variables. Almost all the work in this phase is measurement.

## Why now

The app hardcodes `gpt-4o` and `gpt-4o-mini` in fourteen places (all now routed through `MODELS`). Those models are older and, for `gpt-4o` in particular, more expensive per output token than the current lineup. The pricing as researched on 2026-08-17:

| Model | Input / 1M | Output / 1M | Notes |
|---|---|---|---|
| GPT-5.6 Sol | $5 | $30 | Frontier reasoning. Not needed here. |
| GPT-5.6 Terra | (mid) | (mid) | Price cut 20% on 2026-07-30 |
| GPT-5.6 Luna | $0.20 | $1.20 | Price cut 80% on 2026-07-30 |

Verify current prices at https://platform.openai.com/docs/pricing before you commit to a tier — these move, and the July 2026 cuts show they move fast.

**Note on urgency:** `gpt-4o` and `gpt-4o-mini` were retired from the ChatGPT product surface on 2026-02-13, but the **API was not shut off** and there is no announced API sunset for `gpt-4o-mini`. This migration is a cost and quality play, not a deadline. Do not let anyone tell you the app is about to break.

## Proposed mapping

| Current | Role | Proposed | Reasoning |
|---|---|---|---|
| `MODELS.FAST` = `gpt-4o-mini` | Chat replies, recipe generation, workout analysis | GPT-5.6 Luna | 80% cheaper than at launch; these are short, high-volume, low-stakes calls |
| `MODELS.PLANNING` = `gpt-4o` | Workout plan generation, meal plan structure | GPT-5.6 Terra | Multi-day structured planning; the one place a smarter model plausibly earns its cost |
| `MODELS.DETAIL` = `gpt-4o` | Per-meal expansion, grocery lists, restaurant reshaping | GPT-5.6 Luna, fall back to Terra | High-volume, output-heavy, schema-constrained. Strict mode does the structural work; the model only has to fill it in. |

This is a hypothesis, not a conclusion. Task 3 tests it. **It has now been partly
tested and it is half wrong — see Amendments below before acting on this table.**

**Explicitly rejected: Claude Opus 5.** At $5 / $25 per 1M it is roughly 20× Luna on output, and these generators are output-heavy structured JSON, not frontier reasoning. There is no evidence a frontier model produces better meal plans once the schema is grammar-enforced. If you want to try a Claude model here, try Haiku 4.5 ($1 / $5) as a **second vendor for redundancy**, not as an upgrade.

**Timing note if you are considering Claude:** Sonnet 5's $2 / $10 pricing is introductory **through 2026-08-31**, reverting to $3 / $15. Any cost model built on the intro price is wrong from September onward.

---

## ⚠️ Amendments — measured against the live API, 2026-08-18

Phase 0 is complete, so parts of Tasks 1–3 became cheap to answer immediately.
They were answered. Where this section conflicts with the task text below,
**this section wins.**

### A1. The models exist. Record the real IDs.

`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` — the API IDs *are* the marketing
names, unusually. Also visible on this key and not considered by the plan:
`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`. **Task 1 Steps 1–2 are
done.** Note the curl in Task 1 uses `$OPENAI_API_KEY`; this repo's key is
`$GPT_KEY`.

### A2. All three support strict mode. Task 1 Step 3 is done.

Trivial two-field strict schema, HTTP 200, conforming body, on both Luna and
Terra. Nothing is disqualified on this axis.

### A3. Task 1 Step 4 is a code change, and the plan under-states it.

Both failures are hard 400s, not ignored fields:

```
max_tokens  → "Unsupported parameter: 'max_tokens' is not supported with this
               model. Use 'max_completion_tokens' instead."
temperature → "Unsupported value: 'temperature' does not support 0.5 with this
               model. Only the default (1) value is supported."
```

The app sends **both** at every call site. So the migration is *not* "a handful
of environment variables" as the Goal section claims — flipping `AI_MODEL_*`
alone takes every generator to a 400. The parameter dialect must be switched
per-model *before* any env var moves. `scripts/bench-generators.ts` now does
this via `isReasoningModel()`; `src/` does not yet, and that is Phase 1's real
first task.

Also: **`reasoning_effort: 'minimal'` does not exist on this family.** Accepted
values are `none`, `low`, `medium`, `high`, `xhigh`. Code written against the
gpt-5.0 parameter surface will 400 here.

### A4. The proposed mapping is wrong for PLANNING. Terra costs *more* than gpt-4o.

Measured on the `meal-planning` site, `high-protein-gym` fixture, real prompt,
via the new `--override` flag. **n=1 per cell — directional, not conclusive;
Task 3 still owes n=5.**

| Model | Schema pass | Slots | Out tokens | Reasoning | p50 | $/1k runs |
|---|---|---|---|---|---|---|
| `gpt-4o` *(baseline)* | 100% | 21/21 | 1937 | — | 19.2s | **$20.97** |
| `gpt-5.6-luna` | 100% | 21/21 | 4038 | 15% | 26.0s | **$4.97** |
| `gpt-5.6-terra` | 100% | 21/21 | 4148 | 42% | 40.6s | **$42.28** |

Terra is **2× the cost of gpt-4o and 2× the latency**, for identical schema
conformance and identical slot counts. The plan picked it for PLANNING on the
reasoning that "multi-day structured planning is the one place a smarter model
plausibly earns its cost". On this evidence it does not earn it — 42% of its
output tokens are reasoning, billed at the output rate, and the visible result
is the same 21 slots. Recommend **Luna for PLANNING as well**, pending Task 4's
human quality review, which is the only thing this table cannot speak to.

`gpt-5.6-luna` on the `meal-legacy` site: $102.32/1k → **$12.66/1k**, 8× cheaper,
100% pass, and *faster* than gpt-4o (47.2s vs 79.4s p50).

### A5. Reasoning tokens are the number that decides this, and the plan never mentions them.

They are billed at the output rate and are already inside `completion_tokens`,
so a naive cost model that reads only the sticker price gets this backwards —
which is exactly how the Terra recommendation happened. The harness now reports
`avgReasoningTokens` and prints a "N% of output tokens were reasoning" note.

The share is strongly site-dependent, so it cannot be estimated once and reused:
**meal-planning 15% on Luna and 42% on Terra; meal-legacy 4% on Luna.**

### A6. New risk the plan does not carry: output inflation against the token ceiling.

The 5.6 family emits more output tokens than gpt-4o for the same prompt — 2.1×
on meal-planning, 1.18× on meal-legacy. Phase 0 found `meal-legacy` already runs
at 94% of gpt-4o's 16384 hard ceiling for an unchunked 21-meal week, and added
`LEGACY_MEALS_PER_CALL = 12` chunking to stay clear of it.

**Before migrating `DETAIL`, re-measure peak ceiling percentage at every site**,
not just cost. Under strict mode a truncation is a total loss, not a short
answer. Measured so far on Luna: meal-planning 50% of 8000, meal-legacy 52% of
16384 — both fine, but the margin is thinner than on gpt-4o and the 21-meal
unchunked path was not re-tested.

### A7. Task 3 Step 1 is done.

`--override ROLE=id` is implemented in `scripts/bench-generators.ts`, repeatable
and comma-separable:

```bash
npx tsx scripts/bench-generators.ts --n=5 --override PLANNING=gpt-5.6-luna
npx tsx scripts/bench-generators.ts --n=5 --override PLANNING=gpt-5.6-terra,DETAIL=gpt-5.6-luna
```

The plan's Task 2/3 flags (`--label`, `--runs`) do not exist. The harness uses
`--n=`, `--site=`, `--fixture=`, `--dry`, `--override`. There is no `--label`;
results are written to `bench-results/<ISO>.json`, which is what the "commit the
results file" instruction should refer to.

### A8. Task 7 Step 1's grep is already satisfied, with one caveat.

`grep -rn "model: *['\"]" src/ --include=*.ts --include=*.tsx | grep -v models.ts`
returns nothing. Phase 0 additionally removed the three hardcoded `gpt-4o` log
strings the plan lists as "permitted matches" (`generate-restaurants` ×2,
`generate-home` ×1) — they now interpolate `MODELS.*`. Permitted or not, they
would have started lying the moment this phase flipped a variable.

---

## Task 1: Confirm the models exist and are reachable

- [ ] **Step 1:** List the models your key can actually see. Do not trust a blog post.

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  | jq -r '.data[].id' | sort | grep -Ei '5\.6|sol|terra|luna|4o'
```

- [ ] **Step 2:** Record the exact model ID strings. Marketing names ("Luna") and API IDs are usually different. Everything downstream uses the API ID.

- [ ] **Step 3:** Verify each candidate supports `response_format: { type: "json_schema", ... }` with `strict: true`. Send one trivial request per candidate with a two-field schema and confirm a 200 and a conforming body. A model that does not support strict mode is disqualified outright — Phase 0's entire correctness story depends on it.

```bash
# repeat per candidate model id
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<MODEL_ID>",
    "messages": [{"role":"user","content":"Give me a fruit and its colour."}],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "fruit",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {"name":{"type":"string"},"colour":{"type":"string"}},
          "required": ["name","colour"],
          "additionalProperties": false
        }
      }
    }
  }'
```

- [ ] **Step 4:** Check the parameter surface for each candidate. Newer OpenAI models have changed or removed parameters the codebase currently passes. Specifically confirm the behaviour of `temperature`, `max_tokens` vs `max_completion_tokens`, and any reasoning-effort parameter. Grep for what the app sends today:

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
grep -rn "temperature\|max_tokens\|max_completion_tokens" src/ --include=*.ts
```

If a candidate rejects `temperature` or renames `max_tokens`, that is a code change, not a config change — note it and handle it in Task 4 before flipping any environment variable.

**Verification:** you have a table of candidate model IDs, each marked reachable / strict-capable / parameter-compatible.

---

## Task 2: Capture the gpt-4o baseline

You cannot claim "no regression" without a before.

- [ ] **Step 1:** With the environment still on `gpt-4o` / `gpt-4o-mini`, run the Phase 0 harness across the full fixture set:

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
npx tsx scripts/bench-generators.ts --label baseline-gpt4o --runs 5
```

- [ ] **Step 2:** Commit the results file. This is a permanent artefact; do not gitignore it. Future migrations will compare against it.

- [ ] **Step 3:** Confirm the baseline captures, per generator: schema-conformance rate, retry count, wall-clock p50 and p95, prompt tokens, completion tokens, and cost. If the harness does not emit completion tokens, add that first — token count is the single number that determines whether the migration saves money, and Phase 0 Task 5 already flagged that strict mode can change output length.

**Verification:** a committed baseline file with all seven metrics per generator, averaged over at least five runs.

---

## Task 3: A/B the candidates offline

Do not migrate straight into the app. Run the candidates through the harness first.

- [ ] **Step 1:** Add a `--model-override` flag to `scripts/bench-generators.ts` so a run can force a specific model ID for a specific role without touching `.env` or restarting the app.

- [ ] **Step 2:** For each role, benchmark each candidate against the baseline:

```bash
npx tsx scripts/bench-generators.ts --label luna-fast   --override FAST=<luna-id>  --runs 5
npx tsx scripts/bench-generators.ts --label terra-plan  --override PLANNING=<terra-id> --runs 5
npx tsx scripts/bench-generators.ts --label luna-detail --override DETAIL=<luna-id> --runs 5
npx tsx scripts/bench-generators.ts --label terra-detail --override DETAIL=<terra-id> --runs 5
```

- [ ] **Step 3:** Compare on four axes, in this priority order:

1. **Schema conformance.** Must be ≥ baseline. With strict mode on this should be ~100% for every candidate; if a candidate is below that, its strict-mode implementation is suspect and it is disqualified regardless of everything else.
2. **Content quality.** The harness cannot score this. You must read output by hand — see Task 4.
3. **Latency.** p95 matters more than p50; the meal generator already runs against a 240s retry timeout.
4. **Cost.** Compute from measured token counts and the current price sheet, not from estimates.

- [ ] **Step 4:** Write the comparison into `docs/superpowers/notes/2026-XX-model-ab-results.md` with the raw numbers, not just the conclusion. Whoever revisits this in six months needs the data.

**Verification:** a results document with a per-role recommendation backed by measured numbers on all four axes.

---

## Task 4: Human quality review

Automated conformance says the JSON has the right shape. It says nothing about whether the workout is any good. This step is not optional and it is not delegable to a model.

- [ ] **Step 1:** For each of the three roles, generate ten outputs on the baseline model and ten on the leading candidate, from identical inputs.

- [ ] **Step 2:** Strip the model identity from the outputs and shuffle them so the reviewer cannot tell which is which.

- [ ] **Step 3:** Have a human — ideally Pradeep, since this is a judgement call about the product — rate each pair. Concrete questions that matter for this app:
  - Are the exercises appropriate for the stated fitness level, and is the progression across the week sensible?
  - Do the meals actually hit the macro targets, and are the ingredient quantities realistic?
  - Are the grocery quantities purchasable (a recipe calling for 0.3 of an onion is a shape-valid failure)?
  - Does the restaurant output name real dishes, or plausible-sounding invented ones?

- [ ] **Step 4:** If the candidate is worse on any of these, it does not ship for that role no matter what it saves. Record the verdict.

**Verification:** a blind review with a recorded per-role verdict and the reviewer's notes.

---

## Task 5: Staged rollout

- [ ] **Step 1:** Confirm `src/lib/ai/models.ts` still reads from environment with a safe default, so a rollback is a config change and a restart, not a deploy:

```typescript
export const MODELS = {
  FAST: process.env.AI_MODEL_FAST ?? '<baseline-fast-id>',
  PLANNING: process.env.AI_MODEL_PLANNING ?? '<baseline-planning-id>',
  DETAIL: process.env.AI_MODEL_DETAIL ?? '<baseline-detail-id>',
} as const;
```

Keep the defaults on the **old** models until the rollout completes. The environment variable is what changes; the default is the rollback.

- [ ] **Step 2:** Roll out one role at a time, in ascending order of blast radius:
  1. `FAST` first — chat, recipes, workout analysis. Cheapest to be wrong about, and recipe output is already cached so errors are visible fast.
  2. `DETAIL` second — meal expansion and grocery lists. Highest volume, so the cost signal arrives quickly.
  3. `PLANNING` last — workout and meal plan structure. A bad plan is the most user-visible failure in the product.

- [ ] **Step 3:** After each role, wait for real traffic before proceeding. Watch for: `[RETRY]` lines in the logs (retry rate rising means the model is producing something the validator rejects), any `parseModelJson` failure reason other than `ok`, and p95 latency.

- [ ] **Step 4:** Define the rollback trigger before you start, not after something goes wrong. Suggested: revert the role if schema-failure rate exceeds 1%, if retry rate doubles against baseline, or if p95 latency rises more than 50%.

**Verification:** all three roles migrated, each with at least 24 hours of production traffic and no rollback trigger hit.

---

## Task 6: Reconcile the cost model

- [ ] **Step 1:** After a week on the new models, pull actual spend from the OpenAI usage dashboard and compare against what Task 3 predicted.

- [ ] **Step 2:** If actual diverges from predicted by more than 25%, find out why before believing either number. The usual culprits: the harness fixtures are not representative of real user inputs, retries are inflating real-world token use in a way the harness does not reproduce, or cached-input pricing is doing more work than you modelled.

- [ ] **Step 3:** Record the true per-generation cost in the results document. Phase 3 needs a credible cost baseline to judge search vendors against.

**Verification:** measured weekly spend, reconciled against prediction, written down.

---

## Task 7: Clean up

- [ ] **Step 1:** Grep for any surviving hardcoded model string. Phase 0 should have removed all fourteen; verify rather than assume.

The naive grep is too weak to be a real check — it excludes `.tsx`, misses `o1`/`o3`/`chatgpt-4o-latest`/embedding models, and matches log strings (`generate-restaurants:192, :445`, `generate-home:412`) plus the `models.ts` defaults, all of which are permitted, so it can never actually fail. Use the stricter form Phase 0 uses, which matches the *assignment* rather than the name:

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
# The real check: a model literal being assigned anywhere but models.ts
grep -rn "model: *['\"]" src/ --include=*.ts --include=*.tsx | grep -v "src/lib/ai/models.ts"
```

That must return nothing. Then run the broad name sweep as a secondary pass, where matches are expected and you are only eyeballing for surprises:

```bash
grep -rn "gpt-4o\|gpt-4\.1\|gpt-3\.5\|o1-\|o3-\|o4-mini\|chatgpt-4o-latest" src/ --include=*.ts --include=*.tsx
```

The only permitted matches in the second grep are log strings, comments, and the fallback defaults in `models.ts`.

- [ ] **Step 2:** Update `.env.example` with the three variables and a comment recording which model each was validated against and when.

- [ ] **Step 3:** Note in `models.ts` the date of the last migration and the location of the A/B results document, so the next person does not repeat Task 3 from scratch.

**Verification:** `grep` returns only comments and defaults; `.env.example` is current.

---

## Expected outcome

Every generator runs on a current model, chosen per role on measured evidence rather than on whatever was current when the code was written. Cost per generation is known rather than assumed. A rollback is one environment variable. The A/B harness and its results are committed, so the next model migration is a day of benchmarking rather than a week of archaeology.

**What this phase explicitly does not do:** it does not change any output shape, does not touch Perplexity (Phase 2), and does not switch vendors. If a task in this phase seems to require a schema change, that is a signal the model is wrong for the role — pick a different model rather than bending the schema.
