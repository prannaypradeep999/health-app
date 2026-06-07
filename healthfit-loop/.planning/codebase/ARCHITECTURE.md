<!-- refreshed: 2026-06-07 -->
# Architecture

**Analysis Date:** 2026-06-07

## System Overview

FYTR AI is a full-stack Next.js health and fitness application that generates personalized meal plans and workout routines using AI. The system follows a layered client-server architecture with guest-to-authenticated user migration and coordinated AI generation.

```text
┌────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                          │
│  ┌──────────────────────┬──────────────────────────────────┐   │
│  │  Pages & Screens     │      UI Components (Radix-UI)    │   │
│  │  `src/app/*`         │      `src/components/ui/*`       │   │
│  │  `src/components/*`  │                                  │   │
│  └──────────────────────┴──────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                      API & Server Layer                        │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Auth Endpoints       │  AI Generation Endpoints       │   │
│  │  `src/app/api/auth/*` │  `src/app/api/ai/*`            │   │
│  │                       │                                │   │
│  │  Meal/Workout Ops    │  Chat & Analysis              │   │
│  │  `src/app/api/meals/*`│  `src/app/api/chat/*`         │   │
│  │  `src/app/api/workouts/*`                             │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                    Business Logic Layer                        │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  Auth & Sessions            │  AI Prompts            │    │
│  │  `src/lib/auth.ts`          │  `src/lib/ai/prompts/` │    │
│  │                             │                        │    │
│  │  Utilities & Calculators    │  External Services    │    │
│  │  `src/lib/utils/*`          │  `src/lib/external/*` │    │
│  └───────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                     Data Layer (Prisma ORM)                   │
│  PostgreSQL Database via `src/lib/db.ts`                       │
│  Models: User, Survey, MealPlan, WorkoutPlan, etc.             │
└────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                   External Services                            │
│  AI: Claude (Anthropic), GPT (OpenAI)                          │
│  Search: Tavily, Perplexity                                    │
│  Images: Pexels                                                │
│  Geo: Google Places                                            │
│  Email: Nodemailer                                             │
└────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root Layout | HTML structure, metadata setup | `src/app/layout.tsx` |
| Home Page | Waitlist signup landing page | `src/app/page.tsx` |
| Survey Page | Multi-step health profile form | `src/app/survey/page.tsx` |
| Dashboard | Main application interface with tabs (meals, workouts, progress, account) | `src/app/dashboard/page.tsx` |
| DashboardContainer | Dashboard state management and tab navigation | `src/components/dashboard/DashboardContainer.tsx` |
| DashboardChat | AI chat widget context provider | `src/components/chat/DashboardChat.tsx` |
| Auth Middleware | Route protection, guest→user session migration | `src/middleware.ts` |
| Auth Service | User creation, password hashing, session management | `src/lib/auth.ts` |
| Database Client | Prisma singleton instance | `src/lib/db.ts` |
| Meal Generation | AI-powered meal plan creation (home & restaurant) | `src/app/api/ai/meals/*` |
| Workout Generation | AI-powered workout plan creation | `src/app/api/ai/workouts/*` |
| Profile Generation | AI food and workout profile summaries | `src/app/api/ai/profiles/*` |
| Nutrition Calculations | Calorie targets, macro ratios, TDEE | `src/lib/utils/nutrition.ts` |
| AI Prompts | LLM prompt templates and context builders | `src/lib/ai/prompts/` |

## Pattern Overview

**Overall:** Client-side Next.js (React) frontend with App Router, connected to server-side API routes that delegate to AI services and database operations.

**Key Characteristics:**
- **Guest-first flow:** Users can complete surveys without account, saved with `guest_session` cookie
- **Guest-to-user migration:** When logging in, guest data (surveys, meal/workout plans) automatically associates with authenticated user
- **Coordinated generation:** After survey completion, meal and workout generation happens sequentially (restaurants first, then home meals with budget awareness) and in parallel (workouts independent)
- **Polling patterns:** Frontend polls API endpoints to monitor generation status (meals, workouts) and meal plan freshness
- **Database-driven UI:** Most dashboard screens fetch from Prisma models in real-time

## Layers

**Frontend (Client-Side React):**
- Purpose: User interface, form handling, data display, navigation
- Location: `src/app/` (pages), `src/components/` (UI components)
- Contains: Next.js App Router pages, React components using Radix-UI primitives, TailwindCSS styling
- Depends on: API routes, Next.js hooks, external libraries (framer-motion, lucide-react, recharts)
- Used by: End users via browser

**API Routes (Server-Side):**
- Purpose: HTTP endpoints for authentication, data operations, AI generation triggers
- Location: `src/app/api/`
- Contains: Handler functions (GET, POST, PATCH) that validate input, call business logic, return JSON
- Depends on: Business logic layer (auth, DB, prompts), Next.js server utilities
- Used by: Frontend via fetch, external webhooks

**Business Logic (Services & Utilities):**
- Purpose: Core algorithms, calculations, AI prompt building, external service calls
- Location: `src/lib/` (auth, utils, ai, external)
- Contains: Pure functions (nutrition calcs, validators), async operations (AI calls, DB queries), prompt generators
- Depends on: Prisma ORM, external API SDKs (Anthropic, OpenAI, Tavily)
- Used by: API routes, other utilities

**Data (Prisma ORM):**
- Purpose: Structured data persistence and relationships
- Location: `prisma/schema.prisma`, accessed via `src/lib/db.ts`
- Contains: SQL schema definitions, Prisma generated types
- Depends on: PostgreSQL database
- Used by: Auth service, API routes, business logic

## Data Flow

### Primary Request Path: Survey → Generation → Dashboard

1. **Landing Page** (`src/app/page.tsx`)
   - User fills waitlist form, posts to `/api/waitlist`

2. **Survey Flow** (`src/app/survey/page.tsx` → `/api/survey` POST)
   - Multi-step form collects health data
   - On final submission (step 9), POST to `/api/survey` with complete profile
   - Server validates, stores `SurveyResponse` record, sets `guest_session` & `survey_id` cookies
   - Triggers background generation for meals, workouts, and profiles

3. **Generation Coordination** (`src/app/api/survey/route.ts`)
   - Creates empty coordinated `MealPlan` record with status `generating`
   - Triggers restaurant meal generation first (POST `/api/ai/meals/generate-restaurants`)
   - Extracts actual calories from restaurant results
   - Triggers home meal generation with restaurant budget context (POST `/api/ai/meals/generate-home`)
   - Launches workout generation in parallel (POST `/api/ai/workouts/generate`)
   - Triggers profile generation (POST `/api/ai/profiles/food`, `/api/ai/profiles/workout`)

4. **Meal Generation** (`src/app/api/ai/meals/generate-home/route.ts`)
   - Receives survey data from cookies (`survey_id`)
   - Builds nutrition targets based on user profile
   - Calls Claude API with structured meal generation prompt
   - Receives 7 days of meals (breakfast, lunch, dinner)
   - Generates or fetches recipe images via Pexels
   - Builds grocery list from ingredients
   - Saves to `MealPlan.userContext.homeMeals` array

5. **Workout Generation** (`src/app/api/ai/workouts/generate/route.ts`)
   - Receives survey data and preferences
   - Calls Claude API with workout generation prompt
   - Generates 7-day program with exercises, sets, reps
   - Saves structured plan to `WorkoutPlan.planData`

6. **Dashboard Load** (`src/app/dashboard/page.tsx` → `DashboardContainer.tsx`)
   - Middleware redirects authenticated users to `/dashboard`
   - Component fetches current survey via GET `/api/survey`
   - Polls `/api/ai/meals/current` for meal plan status
   - Polls `/api/ai/workouts/current` for workout plan status
   - Renders tabs: Dashboard Home, Meal Plan, Workout Plan, Progress, Account

### Meal Plan Current Lookup (`/api/ai/meals/current`)

- Checks cookies in order: `meal_plan_id` (direct), `survey_id` (session), `user_id` (authenticated)
- Returns structured meal plan with:
  - Daily meals (breakfast, lunch, dinner)
  - Nutrition targets (calories, protein, carbs, fat)
  - Restaurant and home meal options
  - Grocery list

### Secondary Flows

**User Registration** (`/api/auth/register`)
- POST with email, password, firstName, lastName
- Calls `createUser()` to hash password and store User record
- Calls `createSession()` to create UserSession
- Calls `migrateGuestToUser()` to link existing guest data (surveys, meal/workout plans)
- Sets `auth_session` and `user_id` cookies

**Meal Consumption Logging** (`/api/meals/consume`)
- Records which meal the user actually ate
- Updates `MealConsumptionLog` record

**Workout Exercise Logging** (`/api/workouts/log-exercise`)
- Records set/rep completion for workout exercises
- Updates `WorkoutExerciseLog` record

**State Management:**
- **Client-side:** React hooks (`useState`, `useRef`) in DashboardContainer manage tab state, loading states, generation status
- **Server-side:** Database via Prisma is source of truth for surveys, meal plans, workout plans
- **Session:** Cookie-based (httpOnly, secure) for session tracking and guest identification

## Key Abstractions

**SurveyResponse:**
- Purpose: Captures complete user health profile (demographics, goals, preferences, dietary restrictions)
- Examples: `src/lib/schemas.ts` (Zod validation), `prisma/schema.prisma` (model)
- Pattern: Immutable input to generation pipelines; can be guest (isGuest=true) or authenticated (userId set)

**MealPlan:**
- Purpose: Container for 7-day meal schedule with nutrition targets
- Examples: `src/app/api/ai/meals/*` (generators), `src/components/dashboard/MealPlanPage.tsx` (display)
- Pattern: Created once per survey, updated incrementally (restaurant meals, home meals, grocery list) via coordinated generation

**WorkoutPlan:**
- Purpose: Container for 7-day exercise schedule with progressions
- Examples: `src/app/api/ai/workouts/generate/route.ts`, `src/components/dashboard/WorkoutPlanPage.tsx`
- Pattern: Created once per survey, stored as structured JSON in `planData` field

**UserProfile (Nutrition):**
- Purpose: Derived metrics (BMR, TDEE, calorie targets, macro ratios) computed from survey demographics
- Examples: `src/lib/utils/nutrition.ts`, `src/lib/utils/calorie-calculator.ts`
- Pattern: Calculated on-demand from survey data; used to drive meal plan nutrition targets

**FoodProfile / WorkoutProfile:**
- Purpose: AI-generated plain-English summaries of food and fitness recommendations
- Examples: `src/app/api/ai/profiles/food/route.ts`, `src/app/api/ai/profiles/workout/route.ts`
- Pattern: Generated from survey, stored as markdown text in database, displayed in dashboard modals

## Entry Points

**Root Entry Point:**
- Location: `src/app/page.tsx`
- Triggers: User lands on https://fytr.ai or root path
- Responsibilities: Display landing page, handle waitlist signup

**Authenticated Entry Point (Dashboard):**
- Location: `src/app/dashboard/page.tsx`
- Triggers: User navigates to /dashboard (protected by middleware)
- Responsibilities: Render main application interface with nested tabs

**Survey Entry Point:**
- Location: `src/app/survey/page.tsx`
- Triggers: User is not authenticated or has no session (redirected by middleware)
- Responsibilities: Collect health profile, drive state machine through 9 steps

**API Entry Point (Generation):**
- Location: `src/app/api/survey/route.ts` (POST)
- Triggers: Survey form final submission (step 9)
- Responsibilities: Validate survey, create database records, coordinate meal/workout/profile generation

**Middleware Entry Point:**
- Location: `src/middleware.ts`
- Triggers: Every HTTP request
- Responsibilities: Enforce route protection, redirect to appropriate page based on auth state

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js). Long-running operations (AI generation, image fetching) run async and may timeout; use background job approach or increased server timeout limits.
- **Global state:** Prisma client is instantiated as module-level singleton in `src/lib/db.ts` to reuse connections in development. Cookies hold session identifiers but no user data.
- **Circular imports:** None detected in current codebase; import order is: pages → components → API routes → lib (auth, db, utils) → external SDKs.
- **Database transactions:** No explicit transaction boundaries; Prisma updates are atomic per operation. Consider adding transactions for complex multi-step operations (e.g., guest→user migration involving multiple tables).
- **External API limits:** Claude/GPT API calls made sequentially in meal generation (restaurant → home) and in parallel with workouts; no rate limiting or backoff strategy implemented. If API calls spike, may hit rate limits.
- **File storage:** All files are stored as metadata/URLs (Pexels image URLs, recipe PDFs); no local file system writes. Scalable across instances.
- **Cookie size:** Session cookies are small (IDs only). No risk of exceeding HTTP header size limits.

## Anti-Patterns

### Guest-to-User Coupling Issues

**What happens:** When a user completes survey as guest, then registers, the system tries to auto-migrate survey/plans to new user account. Migration logic in `src/lib/auth.ts:migrateGuestToUser()` copies records but doesn't validate all relationships are valid.

**Why it's wrong:** If migration fails midway (e.g., meal plan already exists for user), orphaned records can remain. Also, if guest completes multiple surveys, only the most recent is migrated (checked by `sessionId`).

**Do this instead:** Wrap migration in a database transaction. Log and alert if migration finds conflicts. Provide admin UI to manually reconcile orphaned data. See `src/lib/auth.ts:219-302` for current implementation.

### Hardcoded Polling Limits

**What happens:** Dashboard polls `/api/ai/meals/current` with `MAX_DASHBOARD_POLL_ATTEMPTS = 120` (10 minutes). If generation takes longer, polling stops and user sees an error.

**Why it's wrong:** AI generation time is unpredictable (network latency, API load, complexity). Hard limit creates false failures for users on slow networks or during API congestion.

**Do this instead:** Use exponential backoff polling (start every 2s, increase to 10s max). Add a "generation taking longer than expected" message instead of hard error. Return estimated time remaining from generation API if available. See `src/components/dashboard/DashboardContainer.tsx:49-120`.

### No Idempotency on Generation

**What happens:** Calling `/api/ai/meals/generate-home` twice will create two different meal plans. User can accidentally trigger duplication by double-clicking or refreshing during generation.

**Why it's wrong:** Wastes API quota and creates confusion (which plan is current?). Database stores multiple plans for same survey/week.

**Do this instead:** Check if meal plan already exists for week before generation. Return existing plan if in progress. Use idempotency keys in API (deduplicate by survey+week+operation). See `src/app/api/survey/route.ts:467-509` for current meal plan creation logic.

### Implicit Status Tracking via userContext JSON

**What happens:** Meal plan generation status (whether homeMeals completed, restaurantMeals completed, etc.) is stored in `MealPlan.userContext` as ad-hoc JSON. Frontend polls and inspects this field to determine "is generation done?"

**Why it's wrong:** No schema validation, fragile to mutations, hard to query (can't use SQL WHERE clauses). If two generators write concurrently, one update can overwrite the other.

**Do this instead:** Add explicit status columns to MealPlan: `homeMealsStatus`, `restaurantMealsStatus` (enum: pending|in_progress|complete|failed). Use Prisma `update()` with conditions to prevent race conditions. Consider adding a separate GenerationJob table if multiple long-running operations per resource.

## Error Handling

**Strategy:** Try-catch at API route level with logging. Return JSON error responses. No global error boundary for API (Next.js error pages exist but are less useful for JSON APIs).

**Patterns:**
- Auth errors: Custom `AuthError` class in `src/lib/auth.ts` with code + message
- Validation errors: Zod `safeParse().error.flatten()` returned to client
- AI generation errors: Logged to console, response includes `success: false` + error message
- Database errors: Caught, logged, generic 500 response (no leak of internal details)

Example from `src/app/api/auth/register/route.ts`:
```typescript
if (error instanceof AuthError) {
  return NextResponse.json(
    { error: error.message },
    { status: error.code === 'USER_EXISTS' ? 409 : 400 }
  );
}
return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
```

## Cross-Cutting Concerns

**Logging:** Console.log with prefixes like `[SURVEY]`, `[AUTH]`, `[MEAL-GENERATION]`. No structured logging (no Winston/Pino). Logs go to stdout, captured by hosting platform. Level is effectively `info` (all logs printed); no way to adjust verbosity per module without code change.

**Validation:** 
- Input: Zod schemas in `src/lib/schemas.ts` (`SurveySchema`) applied at API routes
- Business logic: Custom validators in `src/lib/utils/*` (e.g., `validateRestrictions()`, `validateMealPlan()`)
- Return: No consistent response shape; some endpoints return `{ success, data }`, others `{ error, details }`

**Authentication:** 
- Session-based via cookies (auth_session, user_id)
- Verified at middleware level (check cookie, look up session in DB)
- No JWT; sessions stored in database
- Magic link tokens generated but not yet fully integrated

**Rate limiting:** Not implemented. No protection against brute-force login or generation API spam.

---

*Architecture analysis: 2026-06-07*
