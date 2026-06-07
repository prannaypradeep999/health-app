# Testing Patterns

**Analysis Date:** 2026-06-07

## Test Framework

**Status:** Not Configured

This codebase currently has **no testing framework configured**. No test runner, assertion library, or test files exist in the source code (outside of node_modules).

**Package.json Scripts:**
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "prisma generate && next build",
    "postinstall": "prisma generate",
    "start": "next start",
    "lint": "next lint"
  }
}
```

**Note:** There is no `test`, `test:watch`, or `test:coverage` script defined.

## Test File Organization

**Current Status:** No test files exist in the source tree.

**Recommended Location (if testing is added):**
- Co-located with source files: `src/lib/utils/date-utils.test.ts` alongside `src/lib/utils/date-utils.ts`
- Or: Separate directory structure mirroring `src/` → `test/` or `__tests__/`

**Recommended Naming:**
- Unit tests: `*.test.ts` or `*.spec.ts`
- Integration tests: `*.integration.test.ts`
- E2E tests: `e2e/` directory with feature-specific files

## Test Structure

**Recommended Patterns (based on codebase analysis):**

Since no tests are currently implemented, here are patterns that would match this codebase's conventions:

**Testing async functions:**
```typescript
// For async utility functions like those in src/lib/auth.ts
describe('Auth Module', () => {
  test('hashPassword creates a valid hash', async () => {
    const password = 'test123';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  test('authenticateUser throws AuthError on invalid credentials', async () => {
    await expect(
      authenticateUser('nonexistent@example.com', 'password')
    ).rejects.toThrow(AuthError);
  });
});
```

**Testing React components:**
```typescript
// For components like SmartLoadingStates.tsx
describe('SmartLoadingStates', () => {
  test('renders with analyzing stage', () => {
    render(<SmartLoadingStates stage="analyzing" />);
    expect(screen.getByText('Analyzing your preferences')).toBeInTheDocument();
  });

  test('accepts custom message prop', () => {
    render(<SmartLoadingStates message="Custom message" />);
    expect(screen.getByText('Custom message')).toBeInTheDocument();
  });
});
```

**Testing API routes:**
```typescript
// For routes like /api/auth/login
describe('POST /api/auth/login', () => {
  test('returns user and session on successful login', async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'password' })
    });
    const data = await response.json();
    expect(data.user).toBeDefined();
    expect(data.sessionId).toBeDefined();
  });
});
```

## Mocking

**Not Configured:** No mocking framework is currently set up.

**Recommended Approach (if testing is added):**

**Mock Patterns for this codebase:**
```typescript
// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    }
  }
}));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

// Mock cookies
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  }))
}));

// Mock external APIs
jest.mock('@/lib/external/perplexity-client', () => ({
  PerplexityClient: jest.fn(() => ({
    chat: jest.fn()
  }))
}));
```

**What to Mock:**
- Database calls (`@/lib/db` - Prisma client)
- External APIs (`@/lib/external/*` - Perplexity, Pexels, Places)
- Cookies and headers (`next/headers`)
- Environment variables for feature flags
- AI SDK calls (`openai`, `@anthropic-ai/sdk`)
- Third-party services for authentication

**What NOT to Mock:**
- Core business logic in utilities (`@/lib/utils/*`)
- Pure functions (calorie calculation, date operations)
- Zod schema validation
- Custom error classes and validators
- Component rendering (unless testing integration)

## Fixtures and Factories

**Not Implemented:** No test fixtures or factories currently exist.

**Recommended Patterns:**

**Test data builders:**
```typescript
// test/fixtures/user.ts
export function createMockUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: 'test-user-123',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    emailVerified: true,
    lastLoginAt: new Date(),
    ...overrides
  };
}

// test/fixtures/survey.ts
export function createMockSurveyResponse(overrides?: Partial<SurveyResponse>): SurveyResponse {
  return {
    id: 'survey-123',
    email: 'test@example.com',
    firstName: 'Test',
    age: 30,
    sex: 'male',
    height: 70,
    weight: 180,
    goal: 'WEIGHT_LOSS' as HealthGoal,
    activityLevel: 'MODERATELY_ACTIVE',
    isGuest: false,
    dietPrefs: [],
    ...overrides
  };
}
```

**Location (if testing is added):**
- `test/fixtures/` directory with separate files for each entity type
- Or: `test/factories/` with factory functions for complex objects

## Coverage

**Requirements:** None currently enforced

**Note:** No test coverage configuration exists. Coverage reporting is not enabled.

**If testing is added, recommended targets:**
- Utility functions: 80%+ coverage (these have clear inputs/outputs)
- API routes: 70%+ coverage (harder to test due to dependencies)
- Components: 60%+ coverage (integration testing more valuable than unit)
- Database logic: 75%+ coverage (critical for data integrity)

**View Coverage (if configured):**
```bash
# Would require Jest or Vitest config
npm test -- --coverage
# or
npm run test:coverage
```

## Test Types

**Unit Tests (recommended to add):**
- Scope: Individual functions and components in isolation
- Examples: Utility functions (`calculateDailyCalorieGoal`, `hashPassword`, `getStartOfWeek`)
- Approach: Mock all external dependencies (database, APIs, cookies)
- Use: Jest or Vitest with mocked Prisma/external APIs

**Integration Tests (recommended to add):**
- Scope: Multiple functions working together
- Examples: Auth flow (register → login → session creation), meal plan generation
- Approach: Use real or test database, mock external APIs only
- Use: Jest/Vitest with test database fixtures

**E2E Tests (not implemented):**
- Framework: Not configured (could use Playwright, Cypress, or Puppeteer)
- Scope: Full user workflows through the UI
- Would test: Survey → meal plan generation → dashboard interactions
- Recommended if: Application grows to production

## Common Patterns

**Testing async/await:**
```typescript
test('async function resolves correctly', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

test('async function rejects with error', async () => {
  await expect(asyncFunction()).rejects.toThrow();
});
```

**Testing error throwing:**
```typescript
test('throws custom error on invalid input', () => {
  expect(() => {
    processData(invalidInput);
  }).toThrow(CustomError);
});

test('throws with correct error code', async () => {
  try {
    await authenticateUser('wrong@email.com', 'password');
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe('INVALID_CREDENTIALS');
  }
});
```

**Testing database interactions (with mocks):**
```typescript
test('creates user in database', async () => {
  const mockCreate = jest.fn().mockResolvedValue({ id: '123', email: 'new@example.com' });
  prisma.user.create = mockCreate;

  const user = await createUser({ email: 'new@example.com', password: 'pwd', firstName: 'Test', lastName: 'User' });

  expect(mockCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({ email: 'new@example.com' })
  });
  expect(user.id).toBe('123');
});
```

**Testing React hooks (if implemented):**
```typescript
test('useState updates state correctly', () => {
  const { result } = renderHook(() => useState(0));
  expect(result.current[0]).toBe(0);
  
  act(() => {
    result.current[1](1);
  });
  
  expect(result.current[0]).toBe(1);
});
```

---

*Testing analysis: 2026-06-07*

## Notes on Current State

- **No tests exist** in the codebase (excluding node_modules)
- **No test runner configured** in package.json scripts
- **No test configuration files** (jest.config.js, vitest.config.ts, etc.)
- **Recommended first step:** Add Jest or Vitest with basic config and start with utility function tests
- **High-value tests to prioritize:** Auth functions, calorie/nutrition calculations, schema validation
