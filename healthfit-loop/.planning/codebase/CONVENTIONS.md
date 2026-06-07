# Coding Conventions

**Analysis Date:** 2026-06-07

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `SmartLoadingStates.tsx`, `ChatSearchBar.tsx`, `DashboardContainer.tsx`)
- Utilities: kebab-case (e.g., `calorie-calculator.ts`, `meal-utils.ts`, `date-utils.ts`, `workout-validator.ts`)
- API routes: kebab-case for route files (e.g., `/api/auth/magic-link/route.ts`, `/api/workouts/complete/route.ts`)
- UI components: kebab-case (e.g., `alert-dialog.tsx`, `scroll-area.tsx`, `input-otp.tsx`)

**Functions:**
- Named exports: camelCase (e.g., `calculateDailyCalorieGoal`, `validateWorkoutPlan`, `getStartOfWeek`, `hashPassword`)
- Descriptive, verb-first naming (e.g., `generateToken`, `createSession`, `verifyPassword`, `authenticateUser`)
- Helper functions: camelCase with clear purpose (e.g., `getLoadingContent`, `normalizeDietPrefs`, `collectAllMeals`)

**Variables:**
- Local variables: camelCase (e.g., `userProfile`, `surveyData`, `mealPlanId`, `sessionId`)
- Constants: camelCase or UPPER_SNAKE_CASE for module constants (e.g., `MEAL_BOUNDARIES`, `expiresAt`)
- React props: camelCase (e.g., `surveyData`, `onContinue`, `className`, `stage`, `message`)
- Boolean variables: prefix with `is`, `has`, or `can` (e.g., `emailVerified`, `isGuest`, `isPasswordValid`)

**Types:**
- Interface names: PascalCase with suffix `Props` for component props (e.g., `SmartLoadingStatesProps`, `LogoProps`, `QuickProfileSummaryProps`)
- Type definitions: PascalCase (e.g., `AuthUser`, `CalorieGoal`, `UserProfile`, `WeeklyMealSchedule`)
- Enum-like constants: UPPER_SNAKE_CASE (e.g., `PrimaryGoalEnum`, `FitnessLevelEnum`)
- Custom error classes: PascalCase with `Error` suffix (e.g., `AuthError`)

## Code Style

**Formatting:**
- No strict formatter configured (Prettier not enforced)
- ESLint with Next.js and TypeScript rules enabled
- Code is formatted with inline spacing and readable structure

**Linting:**
- Tool: ESLint 9 with `@eslint/eslintrc`
- Config: `eslint.config.mjs` (flat config format)
- Extends: `next/core-web-vitals` and `next/typescript`
- Build: ESLint and TypeScript errors are ignored during builds (`ignoreDuringBuilds: true`, `ignoreBuildErrors: true`)

**Indentation:**
- 2 spaces (inferred from codebase)
- Consistent with React/TypeScript patterns

## Import Organization

**Order:**
1. React and Next.js imports (e.g., `import React from 'react'`, `import { useState, useEffect } from 'react'`)
2. Next.js specific (e.g., `import { useRouter } from 'next/navigation'`, `import { cookies } from 'next/headers'`)
3. Third-party library imports (e.g., `import { nanoid } from 'nanoid'`, `import bcrypt from 'bcryptjs'`)
4. Internal absolute imports using path aliases (e.g., `import { prisma } from '@/lib/db'`, `import { Button } from '@/components/ui/button'`)
5. Type imports: marked with `type` keyword (e.g., `import type { NextRequest } from 'next/server'`)

**Path Aliases:**
- Single root alias: `@/*` → `./src/*` (defined in `tsconfig.json`)
- All imports use `@/` prefix for absolute paths
- Examples: `@/components/ui/button`, `@/lib/auth`, `@/lib/utils/date-utils`

## Error Handling

**Patterns:**
- Custom error classes extend `Error` with typed error codes (e.g., `AuthError` with `code` property)
  - Example: `throw new AuthError('User with this email already exists', 'USER_EXISTS')`
- Try-catch blocks in async functions, especially in API routes and server-side functions
- Error message checking: `error instanceof AuthError` for type-specific handling
- Graceful fallback: Return null or false on error rather than throwing in some utility functions
- Logging errors with descriptive prefixes: `[API Path]`, `[Auth]`, `[WORKOUT-RATING]` etc.

**Error Handling in API Routes:**
```typescript
try {
  // operation
} catch (error) {
  console.error('[Context] Error detail:', error);
  return NextResponse.json(
    { error: error instanceof CustomError ? error.message : 'Internal server error' },
    { status: 500 }
  );
}
```

**Error Handling in Utilities:**
- User authentication functions throw `AuthError` with specific codes
- Data transformation functions use try-catch with type guards
- Database queries wrapped in try-catch when side effects occur

## Logging

**Framework:** Native `console` object

**Patterns:**
- Log context with square brackets prefix: `[Feature Name]`, `[Auth Migration]`, `[Magic Link API]`
- Use emoji for visual log levels in critical operations:
  - `❌` for errors: `console.error('[Context] ❌ Error detail')`
  - `✅` for success: `console.log('[Context] ✅ Success message')`
  - `🍪` for cookies: `console.log('[Auth] 🍪 Set user_id cookie')`
  - `🔗` for connections/migrations: `console.log('[Auth] 🔗 Migrating guest data')`
- Use camelCase for log message variables: `userId`, `surveyId`, `sessionId`
- Logging is used for debugging and tracking state changes
- No log level filtering (all console calls are included)

**Examples:**
- `console.log('[Auth Migration] Starting migration for user ${userId}')`
- `console.error('[Magic Link API] ❌ Error processing magic link:', error)`
- `console.log('[AUTH] 🍪 Set cookies: user_id=${user.id}, session_id=${sessionId}')`

## Comments

**When to Comment:**
- JSDoc comments for exported functions and public APIs (required for clarity)
- Block comments explaining complex algorithms or non-obvious logic
- Inline comments for edge cases or specific business rules
- Change documentation in code comments (e.g., "CHANGES MADE:" sections in schema files)

**JSDoc/TSDoc:**
- Standard JSDoc format with description and optional parameter/return docs
- Used for all exported functions, especially in utility modules
- Example from `auth.ts`:
  ```typescript
  /**
   * Hash a password for storage
   */
  export async function hashPassword(password: string): Promise<string> {
  ```

**Inline Documentation:**
- Comments explain *why* not *what* (code should be self-documenting for what)
- Describe business logic and constraints
- Example: `// Auto-verify for now, can add email verification later`

## Function Design

**Size:** Prefer small, single-responsibility functions (typically 20-60 lines)

**Parameters:**
- Named parameters: Use objects for functions with multiple parameters
  - Example: `createUser(data: { email, password, firstName, lastName })`
- Type all parameters with TypeScript interfaces or primitives
- Optional parameters marked with `?` in type definitions
- Destructure parameters in function signature when using object params

**Return Values:**
- Explicit return types on all functions (required by TypeScript strict mode)
- Async functions return `Promise<T>`
- Null return for "not found" cases (e.g., `getUserBySession` returns `AuthUser | null`)
- Error throwing for invalid states or authorization failures
- APIs return JSON with `{ success, data/error, message }` structure

**Examples:**
```typescript
// Function with object params
export async function createUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<AuthUser>

// Function with multiple simple params
export async function verifyPassword(password: string, hash: string): Promise<boolean>

// Query function returning null on not found
export async function getUserBySession(sessionId: string): Promise<AuthUser | null>
```

## Module Design

**Exports:**
- Named exports preferred: `export function`, `export interface`, `export const`
- Default exports for components: `export default ComponentName`
- Barrel files (index files) re-export from subdirectories: `export * from './module'`
- Type exports marked with `type` keyword when re-exporting

**Examples:**
- `/src/components/ui/button.tsx` → `export const Button = ...`
- `/src/components/dashboard/DashboardContainer.tsx` → `export default DashboardContainer`
- `/src/lib/ai/prompts/index.ts` → `export * from './meal-generation'`, `export * from './workout-generation'`

**Barrel Files:**
- Used in UI component libraries: `/src/components/ui/` exports all components
- Used in library directories: `/src/lib/ai/prompts/index.ts` aggregates all prompts
- Simplifies imports from packages of related modules

## Client/Server Boundaries

**Server Functions:**
- API routes in `/src/app/api/`
- Server-side utilities in `/src/lib/` (non-UI logic)
- Direct database access via Prisma
- Environment variable access

**Client Components:**
- Marked with `'use client'` directive at top of file
- Component files in `/src/components/`
- Page files in `/src/app/` for most pages
- Use React hooks: `useState`, `useEffect`, `useContext`, etc.

**Next.js Patterns:**
- App Router structure in `/src/app/`
- API routes follow file system paths: `/src/app/api/[feature]/route.ts`
- Server Components by default (opt-in to client with `'use client'`)

---

*Convention analysis: 2026-06-07*
