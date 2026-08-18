# HealthFit Loop — Architecture Orientation

Read `DEVELOPMENT.md` first for how to run things. This doc is the mental model.

Deeper generated analysis already exists in `.planning/codebase/` — `STACK.md`,
`ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`,
`TESTING.md`, `CONCERNS.md` (~1,650 lines, dated 2026-06-07, spot-checked accurate).
This file is the short orientation on top of it.

## What the app is

A personalized health app. A user fills out a long survey (age, goals, diet
preferences, budget, equipment, schedule), and LLMs generate a weekly **meal plan**
(home-cooked + restaurant options + grocery list) and a **workout plan**. The user
logs what they actually ate and lifted, and that feedback loops back into the next
generation — hence "loop."

~36,500 lines of TypeScript across 200+ files.

## Stack

Next.js 16.1 (App Router, Turbopack) · React 19.1 · TypeScript 5 ·
Prisma 6.13 → Neon Postgres · Tailwind 4 + Radix UI · Zod ·
OpenAI (`gpt-4o` / `gpt-4o-mini`) · Perplexity (`sonar`) · Google Places · Pexels

## Directory map

```
src/
  app/
    survey/page.tsx          3,122 lines — the whole multi-step survey (monolith)
    dashboard/               shell; real UI lives in components/dashboard
    login/
    api/
      ai/                    all LLM generation endpoints
        meals/generate-home         1,445 lines — the biggest, most complex route
        meals/generate-restaurants    920
        meals/generate-groceries
        meals/current, update-preferences
        workouts/generate             639
        workouts/current
        profiles/food, profiles/workout    fast "consultation" summaries
        recipes/generate, analyze-workout
      auth/                  register, login, logout, me, magic-link, check-email
      meals/                 consume, feedback, feedback/batch
      workouts/              complete, custom, log-exercise, rate-exercise, last-weight
      exercises/             library list, favorites, add-to-plan
      tracking/weight, survey, chat, waitlist, email
  components/
    dashboard/               MealPlanPage (2,452), DashboardHome (2,003),
                             WorkoutPlanPage (1,148), ProgressPage (903),
                             GroceryListSection, LoadingJourney, modals/
    chat/ChatPopup.tsx       LLM assistant with tool-calling
    ui/                      shadcn-style Radix primitives
  lib/
    db.ts                    singleton PrismaClient (global cache in dev)
    auth.ts                  sessions, bcrypt, guest→user migration
    schemas.ts               Zod validation
    ai/prompts/              ⭐ centralized prompt system — see below
    utils/                   calorie-calculator, nutrition-targets, grocery-list,
                             *-validator (meal-plan, ingredient, restriction,
                             workout), preference-conflict-checker, retry
    external/                perplexity-client (701), pexels-client (481),
                             places-client (380)
    data/exercise-library.ts 699 lines — curated exercise catalog, seeds a DB table
  middleware.ts              cookie-based route gating
prisma/
  schema.prisma              ~20 models
  migrations/                8 migrations, all applied
  seed.ts                    seeds exercise library (⚠️ broken, needs ts-node)
```

## The prompt system

`src/lib/ai/prompts/` is the intended single home for all LLM prompt construction:

| File | Lines | Role |
|---|---|---|
| `meal-generation.ts` | 1,412 | Weekly meal plan prompts |
| `workout-generation.ts` | 1,009 | Workout plans; receives the exercise library as context |
| `recipe-creation.ts` | 464 | Individual recipe expansion |
| `profile-generation.ts` | — | Conversational food/workout profile summaries |
| `analysis.ts` | — | Workout analysis |
| `shared-utilities.ts` | — | Common prompt fragments |
| `index.ts` | — | Barrel export |

**Convention: add new prompts here, not inline in route handlers.**

## Request shapes

**Survey → plans (the main funnel)**

```
/survey (guest, no account)
  → POST /api/survey                          persists SurveyResponse, sets guest_session
  → POST /api/ai/profiles/food   ┐ parallel, fast (~3-5s) — shown as engaging filler
    POST /api/ai/profiles/workout┘             while the heavy work runs behind it
  → POST /api/ai/meals/generate-home + generate-restaurants + workouts/generate
                                              slow (~30-60s), OpenAI + Perplexity + Places
  → /dashboard?surveyCompleted=true           client polls for fresh data
```

`LoadingJourney.tsx` (744 lines) carries the wait. `DashboardContainer.tsx` does the
polling with a `MAX_DASHBOARD_POLL_ATTEMPTS` cap. **Note:** this exact path hits the
undefined-function bug documented in `DEVELOPMENT.md`.

**Register/login** → `migrateGuestToUser()` reassigns the guest's survey, meal plans,
workout plans, and profiles to the new user ID and sets `activeSurveyId`.

**The feedback loop** (the app's actual thesis, and the most recent work per git log)

```
user logs a meal        → /api/meals/consume    → MealConsumptionLog
user rates a meal       → /api/meals/feedback   → MealFeedback (loved/disliked/skipped)
user logs sets + weight → /api/workouts/log-exercise → WorkoutLog
                                    ↓
      getMealFeedbackContext() / WorkoutFeedbackContext
                                    ↓
      injected into the next generation prompt → progressive overload,
      more of what they loved, less of what they skipped
```

## Data model highlights

`User` → `SurveyResponse` (with a unique `activeSurveyId` pointer) → `MealPlan` /
`WorkoutPlan`. Plans store generated content as `Json` columns rather than
normalized rows — flexible for LLM output, but it means shape drift is caught at
runtime by the `lib/utils/*-validator.ts` modules rather than by the DB.

Nearly every user-scoped model carries **both** `userId` and `surveyId`/`sessionId`
so guest and authenticated data share one set of tables. That dual-ownership is why
queries throughout look like `where: { OR: [{ userId }, { surveyId }] }`.

Other models: `MealFeedback`, `MealConsumptionLog`, `MealFeedbackLog`,
`UserFoodPreferences`, `FoodProfile`, `WorkoutProfile`, `WorkoutLog`,
`WorkoutProgress`, `ExerciseLibrary`, `UserCustomWorkout`, `UserWorkoutAddition`,
`UserExerciseFavorite`, `UserSession`.

## Conventions worth matching

- **Server-side identity:** `const cookieStore = await cookies()` then read the
  cookie. ⚠️ Most routes read `user_id` directly — that's the security bug. New
  code should use `getCurrentUser()` / `getUserBySession()` from `src/lib/auth.ts`.
- **Validation:** Zod schemas in `src/lib/schemas.ts`; LLM output additionally
  passes through `src/lib/utils/*-validator.ts` before it's trusted.
- **LLM calls:** mostly raw `fetch` to the OpenAI REST API with
  `Authorization: Bearer ${process.env.GPT_KEY}`, not the SDK client. Only
  `api/chat/route.ts` uses the `openai` package. Inconsistent but pervasive.
- **Retries:** `src/lib/utils/retry.ts` wraps flaky external calls.
- **Logging:** heavy, emoji-tagged `console.log` with bracket prefixes —
  `[AUTH] 🔑`, `[PERPLEXITY] 🔑`, `[Auth Migration] ✅`. Match the style if you add
  logs, but don't log credentials (currently violated in two places).
- **Prisma access:** always the shared `prisma` singleton from `src/lib/db.ts`.

## Where the risk concentrates

Four files hold most of the complexity and most of the bugs:

1. `src/app/survey/page.tsx` (3,122) — one component, ~30 survey fields, drifted
   field names (`goal` vs `primaryGoal`, `fitnessLevel` vs `healthFocus`).
2. `src/components/dashboard/MealPlanPage.tsx` (2,452) — 7 type errors.
3. `src/components/dashboard/DashboardContainer.tsx` (650) — 11 type errors,
   including the undefined function on the post-survey path.
4. `src/app/api/ai/meals/generate-home/route.ts` (1,445) — generation, validation,
   image lookup, and persistence all in one handler.

`.planning/codebase/CONCERNS.md` counts 331+ `any` annotations, concentrated in
exactly these files. With `ignoreBuildErrors: true` masking the compiler, that's
the main source of silent runtime failures.

## Not present

No tests, no test runner, no CI, no `.env.example`, no separate dev database, no
error tracking, no structured logging. `npx tsc --noEmit` is the only automated
check available — and it currently fails with 33 errors.
