# HealthFit Loop

Personalized meal and workout planning. A user completes a health survey, LLMs
generate a weekly meal plan (home-cooked + restaurant + grocery list) and a workout
plan, and the user's logged meals and lifts feed back into the next generation.

Next.js 16 (App Router) · React 19 · TypeScript · Prisma → Neon Postgres ·
Tailwind 4 + Radix UI · OpenAI + Perplexity

## Quick start

```bash
npm install     # postinstall runs `prisma generate`
npm run dev     # http://localhost:3000
```

Requires a `.env` file (gitignored, not committed — get it from a teammate).
**The database is hosted Neon Postgres and is always on — there is no local DB to
start, and `npx prisma dev` is not the right command here.**

Verify the connection:

```bash
npx prisma migrate status   # → "Database schema is up to date!"
```

## Docs

| Doc | What's in it |
|---|---|
| **[DEVELOPMENT.md](./DEVELOPMENT.md)** | How to run the app and DB, every Prisma command and whether it's safe, all env vars, smoke tests, and the current list of verified known issues. **Start here.** |
| **[ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md)** | Directory map, request flows, data model, conventions, and where the risk concentrates. |
| [.planning/codebase/](./.planning/codebase/) | Deeper generated analysis — `STACK`, `ARCHITECTURE`, `STRUCTURE`, `CONVENTIONS`, `INTEGRATIONS`, `TESTING`, `CONCERNS`. |
| [FYTR_CALORIE_CONSISTENCY_AUDIT.md](./FYTR_CALORIE_CONSISTENCY_AUDIT.md) · [AUDIT-RESULTS.md](./AUDIT-RESULTS.md) | Prior domain-specific audits. |

## Scripts

```bash
npm run dev        # dev server (Turbopack)
npm run build      # prisma generate && next build
npm start          # serve production build
npx tsc --noEmit   # typecheck — currently 32 errors, see DEVELOPMENT.md
npm run lint       # BROKEN: `next lint` was removed in Next.js 16; use `npx eslint .`
```

## Security note

A critical authentication bypass (an unsigned `user_id` cookie trusted as identity
across 26 call sites) was **fixed on 2026-08-17**. Identity now comes only from
`getAuthUserId()` in `src/lib/auth.ts`, which validates a real session against the
database.

**When writing new routes, resolve the user with `getAuthUserId()`. Never read the
`user_id` cookie.**

Still outstanding: magic-link tokens are survey IDs (non-secret, non-expiring),
there are no tests, and no CI. See
[DEVELOPMENT.md](./DEVELOPMENT.md#5-known-issues-verified-current-as-of-2026-08-17).
