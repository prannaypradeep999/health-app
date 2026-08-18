# Design: Fix Unsigned-Cookie Auth Bypass

**Date:** 2026-08-17
**Status:** Approved

## Problem

An unsigned `user_id` cookie is trusted as proof of identity across 26 call sites.
Because the cookie is never validated against a session, anyone who supplies a
known user ID is treated as that user.

Verified live against the running dev server:

```bash
curl -s -H "Cookie: user_id=cmlgcyopp001il004qd1dzxsm" http://localhost:3000/api/auth/me
# → {"authenticated":true,"user":{ email, firstName, lastName,
#     street address, city, state, zip, age, sex, height, weight, ... }}
```

Impact:

1. **PII disclosure** — `src/app/api/auth/me/route.ts:40-60` looks a user up by the
   raw cookie value with no session check and returns their full profile,
   including home address and body metrics.
2. **Dashboard gate bypass** — `src/middleware.ts:14` accepts `user_id` alone as
   proof of login.
3. **Writes attributed to other users** — 24 further routes read the cookie as
   identity, including `meals/consume`, `tracking/weight`, `workouts/log-exercise`,
   `workouts/complete`, `exercises/favorites`, and `chat`.

User IDs are cuids that appear in URLs, logs, and API responses, so they are not
secret and cannot serve as a bearer credential.

### Why the cookie cannot simply be dropped

`src/app/api/auth/magic-link/route.ts:72` sets `user_id` **without creating a
session row**. Magic-link users therefore have no `auth_session` at all. Removing
trust in `user_id` without first fixing magic link would lock those users out.
Magic link must be fixed first.

## Design

### Single source of identity

Add one helper to `src/lib/auth.ts`:

```ts
export async function getAuthUserId(): Promise<string | null>
```

It reads the `auth_session` cookie, validates the session row against the database
(existence and `expiresAt`), and returns the user ID or `null`. It never reads
`user_id`. All 26 call sites migrate onto it.

Rationale: `getCurrentUser()` already exists but returns a full `AuthUser` and
requires an extra join. Most call sites only need the ID as a query filter, so a
narrow helper keeps the migration mechanical and avoids over-fetching.

### Commit sequence

Ordered so the application is never broken between commits.

**Commit 1 — Magic link creates a real session.**
`magic-link/route.ts` calls `createSession(userId)` and sets `auth_session`,
matching the login flow. Stops setting `user_id`. Must land first, or commit 2
locks out magic-link users.

**Commit 2 — Add `getAuthUserId()`, migrate all 26 call sites.**
Includes deleting the legacy branch in `auth/me` (lines 40-60) and removing
`user_id` from the `isLoggedIn` check in `middleware.ts:14`.

**Commit 3 — Fix `DashboardContainer.tsx:97`.**
Delete the `setShouldShowInitialPreview(true)` call. Independent of the auth work;
see separate section below.

### Middleware is not the security boundary

Next.js middleware runs on the edge and cannot reach Prisma, so it can only check
for cookie *presence*, not validity. That is acceptable: it is a UX redirect, not
authorization. Real enforcement lives in `getAuthUserId()` inside each route
handler. A comment in `middleware.ts` will state this so it is not mistaken for
an access-control check.

### Guest flows are preserved

Most routes use `userId` as a nullable data filter alongside `surveyId` or
`sessionId` — for example `tracking/weight` writes `userId: userId || null`, and
plan reads use `where: { OR: [{ userId }, { surveyId }] }`. `getAuthUserId()`
returning `null` for an anonymous visitor preserves exactly this shape, so the
survey-first guest funnel is unaffected.

## Accepted behavior changes

- **Sessions resting only on `user_id` are invalidated.** Users who logged in or
  registered normally also hold `auth_session` and are unaffected. Magic-link
  users from already-sent emails re-authenticate on their next click and receive a
  proper session. This is unavoidable: that cookie is the vulnerability.
- **`login` and `register` keep writing the `user_id` cookie.** Nothing will trust
  it. Leaving the writes in place keeps this change reversible; removing them is a
  clean follow-up.

## Unrelated fix: `DashboardContainer.tsx:97`

`setShouldShowInitialPreview` is called but defined nowhere. Confirmed the only
occurrence of the identifier in the repository — no state, no prop, no import.
It throws a `ReferenceError` on the `?surveyCompleted=true` path, which is the
moment immediately after a user completes the survey.

Fix by deleting the line. Adding a `useState` would create a variable nothing
reads; the identifier is a leftover from removed code, and no "initial preview"
concept exists anywhere in the codebase.

## Verification

1. `npx tsc --noEmit` gains no new errors (baseline: 33).
2. Forged cookie no longer authenticates:
   `curl -H "Cookie: user_id=<real-id>" /api/auth/me` → `authenticated: false`.
3. Unauthenticated `/dashboard` still redirects (307) to `/survey`.
4. Forged `user_id` on `/dashboard` redirects to `/survey` instead of returning 200.
5. Public routes still serve: `/survey` 200, `/login` 200, `/api/exercises` 200.

## Out of scope (follow-ups)

- **Survey ID used as a magic-link token.** `email.ts:37` sends
  `/dashboard?token=${surveyId}`, making a non-secret, non-expiring cuid a 30-day
  credential. Fixing properly needs a token column and a migration against the
  shared production database. Downgraded from "bypass" to "weak token" by this
  work, but still needs addressing.
- Non-transactional `migrateGuestToUser()` (6 writes, swallowing catch).
- Credential logging: `perplexity-client.ts:82` logs an API key prefix;
  `register/route.ts:61` logs full session IDs.
- Removing the `user_id` cookie writes from `login` and `register`.
- The remaining 32 type errors and `ignoreBuildErrors: true`.
