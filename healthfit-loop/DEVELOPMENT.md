# HealthFit Loop — Development Guide

Everything you need to run this app locally. **Verified working on 2026-08-17.**

## TL;DR

```bash
npm install          # installs deps; postinstall runs `prisma generate`
npm run dev          # starts Next.js on http://localhost:3000
```

That's it. **There is no local database to start.** See below for why.

---

## 1. The database: hosted Neon Postgres (no local server)

**`npx prisma dev` is the WRONG command for this project.**

`prisma dev` spins up a *local* Prisma Postgres server and only applies when
`DATABASE_URL` uses the `prisma+postgres://` scheme. This project's `.env` has:

```
DATABASE_URL="postgresql://neondb_owner:***@ep-shiny-snow-aduy4jgn-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&..."
```

That's a **remote Neon Postgres** instance. It is always on. Running `npx prisma dev`
would start an unrelated empty local database that nothing connects to.

### Confirm the DB is reachable

```bash
npx prisma migrate status
```

Expected output:

```
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-shiny-snow-...neon.tech"
8 migrations found in prisma/migrations
Database schema is up to date!
```

> ⚠️ This connects to the **shared/production** Neon database. Any write you make
> locally hits real data. There is currently no separate dev/staging database.
> Treat `db push`, `migrate reset`, and seed scripts with care.

### Commands that DO apply

| Command | What it does | Safe locally? |
|---|---|---|
| `npx prisma generate` | Regenerate the typed client. **Run after every `schema.prisma` edit.** | ✅ Yes |
| `npx prisma migrate status` | Check if local migrations match the DB | ✅ Yes, read-only |
| `npx prisma studio` | Browse/edit data in a browser GUI (localhost:5555) | ⚠️ Edits hit real data |
| `npx prisma migrate dev --name <desc>` | Create + apply a new migration | ⚠️ Alters the shared DB |
| `npx prisma migrate deploy` | Apply pending migrations without generating new ones (**production**) | ⚠️ Production command |
| `npx prisma db push` | Push schema without a migration file | ❌ Avoid — causes migration drift |
| `npx prisma migrate reset` | **DROPS ALL DATA** | ❌ Never — this is the real DB |

### Migration workflow

```bash
# 1. Edit prisma/schema.prisma
# 2. Create and apply the migration
npx prisma migrate dev --name add_my_feature
# 3. Client regenerates automatically; if not:
npx prisma generate
# 4. Restart the dev server so Next.js picks up new client types
```

Production deploy uses `npx prisma migrate deploy` (never `migrate dev`).

### Known broken: the seed script

`package.json` declares a Prisma seed:

```json
"prisma": { "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts" }
```

**`ts-node` is not installed**, so `npx prisma db seed` fails. `prisma/seed.ts`
seeds the exercise library from `src/lib/data/exercise-library.ts`. To fix, either
install `ts-node` as a devDependency or switch the seed command to `tsx`.

Prisma 6 also warns that the `package.json#prisma` key is deprecated and should
move to a `prisma.config.ts` file before Prisma 7.

---

## 2. Starting the app

```bash
npm run dev      # next dev --turbopack → http://localhost:3000
```

### Expected startup warnings (harmless, but see Known Issues)

```
⚠ `eslint` configuration in next.config.ts is no longer supported.
⚠ Invalid next.config.ts options detected: Unrecognized key(s): 'eslint'
▲ Next.js 16.1.0 (Turbopack)
- Local: http://localhost:3000
```

### "Port 3000 is in use" / "Unable to acquire lock at .next/dev/lock"

Only one `next dev` can run per directory. Find and kill the stale process:

```bash
lsof -ti:3000 | xargs kill
```

Do **not** just let it fall back to port 3002 — `src/app/api/chat/route.ts`
hardcodes `http://localhost:3000` for internal fetches and will break on any
other port (see Known Issues).

### Other scripts

```bash
npm run build    # prisma generate && next build
npm start        # serve the production build
npm run lint     # ❌ BROKEN — `next lint` was removed in Next.js 16
npx tsc --noEmit # typecheck (currently 33 errors, see below)
```

---

## 3. Environment variables

`.env` is gitignored and **not** committed (verified). There is no `.env.example`,
so a new machine needs these copied from a teammate or your secret store:

| Variable | Purpose | Required to boot? |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | **Yes** |
| `GPT_KEY` | OpenAI API key — *note the nonstandard name*, not `OPENAI_API_KEY` | **Yes** for all AI features |
| `PERPLEXITY_API_KEY` | Restaurant menu lookups (`sonar` model) | For restaurant meals |
| `GOOGLE_PLACES` | Restaurant discovery | For restaurant meals |
| `PEXELS_API_KEY` | Meal/food imagery | Images degrade without it |
| `TAVILY_API_KEY` | Web search | Optional |
| `SERPAPI_KEY` | Search | Optional |
| `SPOONACULAR_API_KEY` | Nutrition data | Optional |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Transactional email via nodemailer | For email flows |
| `NEXT_PUBLIC_APP_URL` | Public base URL used in emails/links | For email links |
| `AIRTABLE_API_KEY` / `AIRTABLE_BASE_ID` / `AIRTABLE_WAITLIST_TABLE_ID` | Waitlist capture | For `/api/waitlist` |
| `JWT_SECRET` | **Declared but unused** — no code references it. Auth uses DB-backed session rows, not JWTs. | No |

**OpenAI billing:** if AI generation starts failing with 429s, check quota at
https://platform.openai.com/settings/organization/billing/overview

Models in use: `gpt-4o` (9 call sites), `gpt-4o-mini` (5), `sonar` (3, Perplexity).

---

## 4. Verifying it works

With the dev server up:

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/
# 307 -> http://localhost:3000/survey     (no session → survey)

curl -s http://localhost:3000/api/auth/me
# {"authenticated":false,"guestSession":false}

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/exercises
# 200
```

All three verified passing.

### Routing / auth model

`src/middleware.ts` gates everything:

- `/` → `/dashboard` if any session cookie, else `/survey`
- `/dashboard/*` requires a session cookie (or `?token=` magic link)
- Public: `/survey`, `/login`, `/register`, `/api/*`

Three cookies are in play: `auth_session` (real, DB-validated session),
`user_id` (legacy, **unsigned — see security issue below**), and `guest_session`
(survey completed but not registered).

The primary flow is **survey-first**: an anonymous visitor completes the survey,
plans generate against a `guest_session`, and `migrateGuestToUser()` in
`src/lib/auth.ts` reassigns that data on register/login.

---

## 5. Known issues (verified, current as of 2026-08-17)

### ✅ FIXED (2026-08-17) — Auth bypass via forged `user_id` cookie

The `user_id` cookie was unsigned and never validated, so supplying any known
user ID impersonated that user and returned their full PII. Fixed in
`31e76d4` / `0078be8`:

- `getAuthUserId()` in `src/lib/auth.ts` is now the **single source of identity**.
  It validates `auth_session` against the DB and returns `null` when
  absent/expired. **Use it in all new routes — never read `user_id`.**
- The legacy branch in `/api/auth/me` is gone; `middleware.ts` no longer accepts
  `user_id` as proof of login; all 23 other call sites migrated.
- Magic link now calls `createSession()` instead of setting `user_id`.

Verified: forged cookie → `authenticated:false`; `/dashboard` 200 → 307; real
sessions and the guest funnel unaffected.

`login`/`register` still *write* the `user_id` cookie, but nothing trusts it.
Removing those writes is a clean follow-up.

### 🔴 `get_eaten_meals` chat tool always fails

`src/app/api/chat/route.ts:165` calls `prisma.mealConsumption` — that model does
not exist. The schema defines `MealConsumptionLog` (`prisma/schema.prisma:184`).
The field names are also wrong: the code reads `consumedAt`, `dishName`, and
`restaurant`; the model has `loggedAt`, `mealName`, and `restaurantName`. The
whole block sits in a `try/catch` that swallows it into a generic
`'Error fetching consumption log'`, so the tool silently never works.

### 🔴 `/api/user/nutrition-targets` does not exist

`src/app/api/chat/route.ts:195` fetches it; `src/app/api/user/` isn't there.
Verified 404. The `get_nutrition_targets` chat tool is dead. Real logic lives in
`src/lib/utils/nutrition-targets.ts` — call it directly instead of over HTTP.

### 🟠 Hardcoded `http://localhost:3000` in server-side fetches

`src/app/api/chat/route.ts:122, 144, 195` fetch absolute localhost URLs. These
break in production **and** locally whenever the dev server falls back to another
port. Server-to-server HTTP hops like this should be direct function calls.

### 🟠 Type errors are hidden, and there are 29 of them

`next.config.ts` sets `typescript.ignoreBuildErrors: true` and
`eslint.ignoreDuringBuilds: true`, so `npm run build` passes while
`npx tsc --noEmit` reports 29 errors (counted 2026-08-24):

| File | Count |
|---|---|
| `src/components/dashboard/DashboardContainer.tsx` | 10 |
| `src/components/dashboard/MealPlanPage.tsx` | 7 |
| `src/app/survey/page.tsx` | 6 |
| `src/lib/ai/prompts/meal-generation.ts` | 3 |
| `WorkoutPlanPage.tsx`, `api/survey/route.ts`, `generate-restaurants` | 1 each |

Not all are cosmetic. Real ones include:

- ✅ **FIXED (`40da0e3`)** `DashboardContainer.tsx:97` — `setShouldShowInitialPreview`
  was undefined and threw a `ReferenceError` on the `?surveyCompleted=true` path.
  Line deleted; that path now renders 200.
- `DashboardContainer.tsx:511-516` — `surveyData` used without a null check.
- `MealPlanPage.tsx:462-471` — six calls passing 3 args to a 2-arg function.
- `survey/page.tsx` — `activityLevel` read off `SurveyData`, which doesn't
  declare it (part of the field-naming drift noted in `.planning/codebase/CONCERNS.md`).

Also note `eslint.ignoreDuringBuilds` is now a *rejected* config key in Next 16
(it prints `Unrecognized key(s)`), so that suppression may not even apply.

### 🟠 `npm run lint` is broken

`next lint` was removed in Next.js 16. Migrate to the ESLint CLI:
`npx eslint .` (an `eslint.config.mjs` already exists).

### 🟡 API keys partially logged

`src/lib/external/perplexity-client.ts:82` logs the first 10 chars of the
Perplexity key on every client construction. `src/app/api/auth/register/route.ts:61`
logs full session IDs and user IDs. Remove both — session IDs are bearer
credentials.

### 🟡 Guest→user migration is not transactional

`migrateGuestToUser()` (`src/lib/auth.ts`) performs 6 sequential writes with no
transaction, and its `catch` swallows errors. A partial failure orphans the user's
survey and plans while login still succeeds. Wrap in `prisma.$transaction()`.

### 🟡 Repo hygiene

Tracked in git but shouldn't be: `cookies.txt`, `server.log` (468 KB),
`debug-meals.js`, `debug-plandata.js`, `debug-specific-plan.js`, `debug-tuesday.js`,
`temp_debug_middleware.js`, `test-email.js`, and a stray file literally named `{`.

Scanned: none of these contain live secrets, and `.env` is correctly gitignored
and untracked. Still worth `git rm --cached`-ing them.

Two full directory copies also sit beside the repo (`../healthfit-loop copy/`,
`../healthfit-loop copybefore optimization/`) — untracked, but they make
grep/search noisy.

### 🟡 Test coverage is partial, and there is no CI

Node's built-in runner covers the pure helpers extracted during the 2026-08-24
correctness work — see `CLAUDE.md § Tests` for how to run it. Route handlers,
React components and anything that talks to OpenAI, Perplexity, Places or Prisma
are not covered. Nothing runs the suite automatically.

---

## 6. Suggested first moves for a new agent

The two critical items (auth bypass, post-survey crash) are **fixed**. Remaining,
roughly in priority order:

1. Repair the two dead chat tools (`get_eaten_meals` uses a nonexistent Prisma
   model; `get_nutrition_targets` fetches a 404 route).
2. Replace the survey-ID-as-magic-link-token with a real expiring token
   (`email.ts:37`). Needs a schema migration.
3. Get `npx tsc --noEmit` to zero (32 left), then drop `ignoreBuildErrors` so it
   stays there.
4. Wrap `migrateGuestToUser()` in a transaction; stop swallowing its errors.
5. Remove credential logging (`perplexity-client.ts:82`, `register/route.ts:61`).
6. Fix `npm run lint`; install `ts-node`/`tsx` so `prisma db seed` runs.
7. Stand up a separate dev database so local work stops writing to real user data.
8. Drop the `user_id` cookie writes from `login`/`register` (nothing reads it now).
