# HealthFit Loop — agent orientation

Read this first. It is short on purpose; it points at the real docs.

## Read these before doing anything

1. **`DEVELOPMENT.md`** — how to run the app, the database situation, environment
   variables, and a list of known-broken things. Read it fully before running any
   command. It will save you from at least three wrong turns.
2. **`ARCHITECTURE-OVERVIEW.md`** — the mental model: what the app does, the
   directory map, where the LLM generation happens.
3. **`.planning/codebase/`** — deeper generated analysis (`STACK.md`,
   `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`,
   `TESTING.md`, `CONCERNS.md`). Dated 2026-06-07. Consult when you need detail,
   don't read cover-to-cover.

## ⚠️ The database is shared production data

`DATABASE_URL` points at a **remote Neon Postgres instance holding real user
data**. There is no local database and no dev/staging copy. Anything you write
locally hits production.

- `npm run dev` alone is safe — it reads.
- **Never** run `prisma migrate reset`, `prisma db push`, or the seed script.
- `prisma migrate dev` alters the shared schema. Ask before running it.
- Before any code path that writes to Prisma, say what it will write and to which
  table, and get confirmation. This applies especially to the recipe cache.
- `npx prisma studio` edits real data. Use it read-only.
- `npx prisma migrate status` is read-only and safe.

`npx prisma dev` is the wrong command for this project — see `DEVELOPMENT.md §1`.

## Starting up

```bash
npm install     # postinstall runs `prisma generate`
npm run dev     # Next.js on http://localhost:3000
```

No database to start. If you edit `prisma/schema.prisma`, run `npx prisma generate`
and restart the dev server.

## Tests

Node's built-in runner via `npx tsx --test`, no new dependencies and no `test`
script in `package.json`. Globs must be quoted for zsh:

```bash
npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"
```

Test files sit next to the modules they cover, not in a separate tree.

Coverage is partial and deliberate: it covers the pure helpers extracted during
the 2026-08-24 correctness work. Route handlers, React components and anything
that talks to OpenAI, Perplexity, Places or Prisma are not covered and are still
verified by running the app.

Do not claim a change is verified because it compiles — `next build` has
`ignoreBuildErrors` on, so it will happily build broken TypeScript.
`npx tsc --noEmit` is the real check (currently 29 pre-existing errors; don't
try to fix them incidentally).

## Working style for this repo

- **Believe the code over the docs.** The markdown files here, including the plans
  in `docs/superpowers/plans/`, were accurate when written and drift afterward.
  Line numbers especially. Navigate by symbol name — function, interface, the
  literal string being matched.
- **Locate, don't assume.** `grep` for a symbol before editing it. Several
  near-duplicate shapes exist across the meal/grocery/restaurant code and it is
  easy to edit the wrong one.
- **Say when a task is bigger than described.** Stop and report rather than
  shipping a partial version silently.
- Commit after each verified unit of work, with a message naming it.

## The current work

Four plans in `docs/superpowers/plans/`, dated 2026-08-17, plus `README-HANDOFF.md`
which gives the execution order. The order is **not** the phase numbering:

```
Phase 0                    schema enforcement — everything depends on it
Phase 3 Task 0 only        Google Places swap, deliberately out of order
Phase 2                    structured Perplexity
Phase 1                    model migration
Phase 3 Tasks 1-6          vendor spike, optional
```

Context for why: every OpenAI call used to use `response_format:
{type:"json_object"}`, which guarantees valid JSON syntax and nothing about
shape. The fix is `json_schema` + `strict: true`, which is grammar-constrained.
Phase 0 has landed — `grep -rn "json_object" src/` now finds only a comment
recording the change. `MODEL-MIGRATION-PLAN.md` in the repo root is the full
audit behind the plans.

Then, from the 2026-08-24 correctness audit:

```
docs/superpowers/plans/2026-08-24-generation-eval-harness.md      first
docs/superpowers/plans/2026-08-24-generation-safety-fixes.md      second
docs/superpowers/plans/2026-08-24-generation-silent-wrongness.md  third
```

The harness goes first so the fixes have something to measure against. Findings
and severities are in
`docs/superpowers/specs/2026-08-24-generation-correctness-audit.md`.

## Known traps

- `src/lib/external/perplexity-client.ts` is at `lib/external`, not `lib/ai`.
- Dietary exclusions (vegan/halal/coeliac) no longer live in
  `perplexity-client.ts`. The vocabulary is in
  `src/lib/utils/restriction-validator.ts` (`normalizeRestriction`), the prompt
  wording is built from it in `src/lib/ai/prompts/restaurant-menu.ts` — grep for
  `'HALAL:'` — and the post-hoc check is `validateRestrictions`, called from both
  meal routes. Changing the vocabulary in one place and not the others silently
  breaks dietary filtering.
- Recipe nutrition is **per serving**; `ingredientsWithNutrition` is
  **whole-recipe**. The relation is `sum(ingredients) / servings`. Anything that
  compares them undivided reports a mismatch that is not there.
- The `foodImage` / `workoutImage` caches store fallback images too. Those expire
  after a week (`src/lib/external/fallback-images.ts`); real Pexels results never
  do. A cache-hit path that bumps `updatedAt` would make a popular fallback
  permanently fresh.
