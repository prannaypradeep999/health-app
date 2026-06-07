# Codebase Structure

**Analysis Date:** 2026-06-07

## Directory Layout

```
healthfit-loop/
├── .claude/                      # Claude project settings
├── .next/                        # Next.js build output (gitignored)
├── .planning/                    # GSD planning documents
├── audit-logs/                   # Application audit logs
├── docs/                         # Documentation and plans
├── logs/                         # Application runtime logs
├── node_modules/                 # Dependencies (gitignored)
├── prisma/                       # Database schema and migrations
│   ├── schema.prisma             # Prisma schema definition
│   └── seed.ts                   # Database seed script
├── public/                       # Static assets (images, fonts)
├── scripts/                      # Utility scripts
├── src/                          # Application source code
│   ├── app/                      # Next.js App Router
│   ├── components/               # React components
│   ├── hooks/                    # React hooks (empty directory)
│   ├── lib/                      # Shared utilities, services, business logic
│   └── middleware.ts             # Next.js middleware for auth routing
├── .env                          # Environment variables (gitignored)
├── .eslintrc.json                # ESLint config
├── eslint.config.mjs             # New ESLint flat config
├── next.config.ts                # Next.js config
├── package.json                  # Dependencies and scripts
├── package-lock.json             # Locked dependency versions
├── postcss.config.mjs            # PostCSS config (TailwindCSS)
├── tailwind.config.ts            # TailwindCSS config
└── tsconfig.json                 # TypeScript config
```

## Directory Purposes

**`.claude/`:**
- Purpose: Claude project configuration and settings
- Contains: `settings.json`, `settings.local.json` for project-specific configuration
- Key files: None for application logic

**`prisma/`:**
- Purpose: Database schema and migrations
- Contains: Prisma ORM schema definition, migrations folder
- Key files: `schema.prisma` (defines all database models)

**`public/`:**
- Purpose: Static assets served directly by Next.js
- Contains: Favicons, logos, images, fonts (not code-generated)
- Key files: Brand logos and UI assets

**`src/`:**
- Purpose: All application source code (TypeScript/React)
- Contains: Pages, components, utilities, business logic
- Key files: Entry points, service modules

**`src/app/`:**
- Purpose: Next.js App Router pages and API routes
- Contains: Page components (`.tsx`) and API route handlers (`route.ts`)
- Structure:
  - `layout.tsx`: Root layout wrapper
  - `page.tsx`: Home/landing page
  - `survey/page.tsx`: Multi-step survey form
  - `dashboard/page.tsx`: Main application dashboard (protected)
  - `login/page.tsx`: Login page
  - `api/auth/*`: Authentication endpoints (register, login, logout, magic-link, etc.)
  - `api/ai/*`: AI generation endpoints (meals, workouts, profiles, analysis, recipes)
  - `api/meals/*`: Meal operations (consume, feedback)
  - `api/workouts/*`: Workout operations (log exercise, complete workout, rate exercise)
  - `api/exercises/*`: Exercise library (favorites, add to plan)
  - `api/restaurants/*`: Restaurant operations (favorite management)
  - `api/tracking/*`: User metrics (weight tracking)
  - `api/survey/*`: Survey endpoints (save, retrieve, reset)
  - `api/waitlist/`: Waitlist signup
  - `api/chat/`: AI chat endpoint
  - `api/email/*`: Email operations (sending, testing)

**`src/components/`:**
- Purpose: Reusable React components
- Contains: UI components (buttons, cards, dialogs), layout components, page sections
- Structure:
  - `ui/`: Radix-UI based primitive components (Alert, Button, Card, Dropdown, etc.)
  - `dashboard/`: Dashboard page sections (DashboardHome, MealPlanPage, WorkoutPlanPage, etc.)
  - `dashboard/modals/`: Modal dialogs for dashboard interactions
  - `chat/`: AI chat widget components (DashboardChat, ChatPopup)
  - `logo.tsx`: Logo component used across app

**`src/lib/`:**
- Purpose: Shared utilities, services, and business logic
- Contains: Authentication, database client, utilities, AI prompts, external service clients
- Structure:
  - `auth.ts`: User authentication, password hashing, session management
  - `db.ts`: Prisma database client singleton
  - `email.ts`: Email sending via Nodemailer
  - `schemas.ts`: Zod validation schemas (SurveySchema, enums)
  - `ai/prompts/`: AI prompt generators
    - `index.ts`: Centralized exports
    - `meal-generation.ts`: Meal plan creation prompts
    - `workout-generation.ts`: Workout plan creation prompts
    - `recipe-creation.ts`: Recipe generation prompts
    - `profile-generation.ts`: User profile summary prompts
    - `analysis.ts`: Analysis and evaluation prompts
    - `shared-utilities.ts`: Common context builders
  - `external/`: External service clients
    - `pexels-client.ts`: Image search API
    - `perplexity-client.ts`: Web search API
    - `places-client.ts`: Geographic search API
  - `data/`: Static data
    - `exercise-library.ts`: Pre-defined exercises and categories
  - `utils/`: Utility functions
    - `nutrition.ts`: BMR, TDEE, calorie and macro calculations
    - `calorie-calculator.ts`: Calorie budget distribution
    - `meal-utils.ts`: Meal collection and parsing helpers
    - `workout-validator.ts`: Workout plan validation
    - `nutrition-targets.ts`: Nutrition goal builders
    - `date-utils.ts`: Date/week calculations
    - `grocery-list.ts`: Grocery list generation and enhancement
    - `meal-plan-validator.ts`: Meal plan structure validation
    - `restriction-validator.ts`: Dietary restriction checking
    - `preference-conflict-checker.ts`: Food preference conflict detection
    - `ingredient-validator.ts`: Ingredient sum validation
    - `retry.ts`: Retry logic with exponential backoff

**`src/hooks/`:**
- Purpose: Custom React hooks
- Contains: Empty directory (hooks are defined inline in components as needed)
- Usage: Add custom hooks here if refactoring from components

**`src/middleware.ts`:**
- Purpose: Next.js middleware for request-level processing
- Responsibility: Auth session checking, route protection, guest/user session management
- Accessed before any page or API route

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: Landing page with waitlist signup
- `src/app/survey/page.tsx`: Survey form (public, guest-accessible)
- `src/app/dashboard/page.tsx`: Dashboard (protected, auth-only)
- `src/middleware.ts`: Route protection and redirects

**Configuration:**
- `tsconfig.json`: Path alias `@/*` → `src/*` for absolute imports
- `tailwind.config.ts`: TailwindCSS color scheme, plugins
- `next.config.ts`: Next.js runtime, redirects, image optimization
- `.eslintrc.json`: Linting rules
- `prisma/schema.prisma`: Database schema

**Core Services:**
- `src/lib/auth.ts`: Authentication and session management
- `src/lib/db.ts`: Database connection
- `src/lib/email.ts`: Email service

**Business Logic:**
- `src/lib/utils/nutrition.ts`: Nutrition calculations
- `src/lib/utils/calorie-calculator.ts`: Calorie distribution
- `src/lib/utils/grocery-list.ts`: Grocery list logic
- `src/lib/ai/prompts/*`: AI prompt building

**API Routes:**
- `src/app/api/survey/route.ts`: Survey save/retrieve (handles generation triggers)
- `src/app/api/auth/register/route.ts`: User registration with guest data migration
- `src/app/api/auth/login/route.ts`: User login
- `src/app/api/ai/meals/generate-home/route.ts`: Home meal generation
- `src/app/api/ai/meals/generate-restaurants/route.ts`: Restaurant meal generation
- `src/app/api/ai/workouts/generate/route.ts`: Workout generation
- `src/app/api/ai/profiles/food/route.ts`: Food profile generation
- `src/app/api/ai/profiles/workout/route.ts`: Workout profile generation
- `src/app/api/ai/meals/current/route.ts`: Get current meal plan
- `src/app/api/ai/workouts/current/route.ts`: Get current workout plan

**UI Components:**
- `src/components/dashboard/DashboardContainer.tsx`: Main dashboard state and navigation
- `src/components/dashboard/MealPlanPage.tsx`: Meal plan display and interactions
- `src/components/dashboard/WorkoutPlanPage.tsx`: Workout plan display and logging
- `src/components/dashboard/ProgressPage.tsx`: Tracking and progress visualization
- `src/components/dashboard/AccountPage.tsx`: User account settings
- `src/components/dashboard/LoadingPage.tsx`: Generation progress screen
- `src/components/chat/DashboardChat.tsx`: Chat widget context provider

**Testing:**
- No test files detected in current structure (`.test.ts`, `.spec.ts` not found)

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention)
- API routes: `route.ts` (Next.js convention)
- Components: PascalCase, e.g., `MealPlanPage.tsx`, `DashboardContainer.tsx`
- Utilities: camelCase, e.g., `nutrition.ts`, `grocery-list.ts`
- Hooks: camelCase with `use` prefix, e.g., `useChatContext` (defined inline or in components)
- Types: PascalCase, e.g., `UserProfile`, `SurveyData` (defined in files or `schemas.ts`)

**Directories:**
- API route folders: kebab-case matching endpoint path, e.g., `api/ai/meals/generate-home/`
- Feature folders: camelCase, e.g., `dashboard/`, `chat/`, `auth/`
- Utility folders: camelCase, e.g., `utils/`, `prompts/`, `external/`

**Functions:**
- Exported functions: camelCase, e.g., `calculateBMR()`, `generateMealPlan()`
- Handler functions: `GET()`, `POST()`, `PATCH()` (HTTP method names, required by Next.js)
- Component functions: PascalCase, e.g., `DashboardContainer()`, `MealSwapDialog()`

**Variables:**
- Constants: UPPER_SNAKE_CASE, e.g., `MAX_DASHBOARD_POLL_ATTEMPTS`, `DEFAULT_ACTIVITY_LEVEL`
- Regular vars: camelCase, e.g., `surveyData`, `mealPlan`, `isLoading`
- Types: PascalCase, e.g., `SurveyData`, `GenerationStatus`

## Where to Add New Code

**New Feature (e.g., "Recipe saving"):**
- Primary code: `src/app/api/[feature]/` (API route) + `src/lib/utils/[feature].ts` (logic)
- Tests: `src/app/api/[feature]/__tests__/` or `src/lib/utils/__tests__/[feature].test.ts` (when testing structure is added)
- UI: `src/components/dashboard/[FeatureName].tsx` + `src/components/dashboard/modals/[FeatureName]Modal.tsx`

Example: If adding "recipe ratings", create:
- `src/app/api/recipes/rate/route.ts` (handler)
- `src/lib/utils/recipe-rating.ts` (business logic)
- `src/components/dashboard/RecipeRatingModal.tsx` (UI)
- Database migration in `prisma/` (new RecipeRating model or add field to Recipe)

**New Component/Modal:**
- Implementation: `src/components/dashboard/[ComponentName].tsx` or `src/components/dashboard/modals/[ComponentName]Modal.tsx`
- Export from: Component file (export default function)
- Import in: Parent component (e.g., DashboardContainer) that uses it

**Utilities:**
- Shared helpers: `src/lib/utils/[domain].ts`, e.g., `src/lib/utils/image-cache.ts`
- External integrations: `src/lib/external/[service]-client.ts`, e.g., `src/lib/external/openai-client.ts`
- Type definitions: In file that uses them, or in `src/lib/schemas.ts` if shared
- Constants: Top of the file that uses them, or in `src/components/dashboard/constants.ts`

**API Endpoints:**
- Path structure: `src/app/api/[domain]/[action]/route.ts`
- Examples:
  - `src/app/api/meals/consume/route.ts` (consume meal)
  - `src/app/api/exercises/favorites/route.ts` (manage favorites)
  - `src/app/api/workouts/log-exercise/route.ts` (log exercise)

**Database Models:**
- Schema: `prisma/schema.prisma` (define model)
- Migrations: Auto-generated in `prisma/migrations/` (run `npx prisma migrate`)
- Usage: Access via `prisma.[modelName].*()` from any API route or utility

## Special Directories

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes (by npm install)
- Committed: No (listed in .gitignore)

**`.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes (by npm run build)
- Committed: No (listed in .gitignore)

**`audit-logs/` and `logs/`:**
- Purpose: Application runtime and audit logs
- Generated: Yes (by application at runtime)
- Committed: No (should be in .gitignore)

**`prisma/migrations/`:**
- Purpose: Database migration history (if exists)
- Generated: Yes (by `npx prisma migrate`)
- Committed: Yes (part of schema versioning)

---

*Structure analysis: 2026-06-07*
