# Codebase Concerns

**Analysis Date:** 2026-06-07

## Tech Debt

**Type Safety and `any` Usage:**
- Issue: 331+ instances of `any` type annotations across codebase, primarily in API routes and utility functions. This bypasses TypeScript type checking and creates runtime error risks.
- Files: `src/app/api/ai/meals/generate-home/route.ts`, `src/app/api/ai/meals/generate-restaurants/route.ts`, `src/app/api/ai/workouts/generate/route.ts`, `src/components/dashboard/MealPlanPage.tsx`
- Impact: Silent failures when API responses don't match expected structures; hard to debug data flow issues; refactoring becomes risky
- Fix approach: Create proper interfaces for API responses, survey data structures, and meal/workout plan types. Start with the largest routes (`generate-home/route.ts`, `MealPlanPage.tsx`)

**Missing Dietary Restrictions Integration:**
- Issue: TODO comment in `src/components/dashboard/MealPlanPage.tsx:1138` indicates dietary restrictions are not being pulled from user survey during meal swaps
- Files: `src/components/dashboard/MealPlanPage.tsx:1138`
- Impact: Meal swap suggestions may not respect user restrictions, leading to unsuitable recommendations
- Fix approach: Extract dietary restrictions from `surveyData` and pass to meal generation endpoints during swaps

**Stale Debug Files in Root:**
- Issue: 7 debug JavaScript files left in repository root from development
- Files: `debug-meals.js`, `debug-plandata.js`, `debug-specific-plan.js`, `debug-tuesday.js`, `test-email.js`, `temp_debug_middleware.js`, `perplexity-query.js`
- Impact: Clutter, confusion about which files are production code, potential for accidental commits to production
- Fix approach: Move to `scripts/debug/` or delete; add `.gitignore` rule

## Known Bugs

**Multiple Survey Data Field Name Collisions:**
- Symptoms: Survey response data uses inconsistent field naming across different screens (e.g., `primaryGoal` vs `goal`, `healthFocus` vs `maintainFocus` vs `fitnessLevel`)
- Files: `src/app/survey/page.tsx:66-98`, `src/components/dashboard/MealPlanPage.tsx:1138`
- Trigger: Different survey flows set different field names for the same data
- Workaround: Multiple conditional checks for field existence (shown in lines 96-98 of survey/page.tsx)
- Root cause: Schema evolution without field migration

**Inconsistent API Response Error Handling:**
- Symptoms: Some API routes log errors but silently continue; some return generic 500 errors; others expose implementation details
- Files: `src/app/api/ai/meals/generate-home/route.ts:283-550`, `src/app/api/ai/meals/generate-restaurants/route.ts`
- Trigger: OpenAI API failures, parsing errors, validation failures
- Workaround: Client-side error toasts show generic messages, users don't know which step failed

## Security Considerations

**API Key Logging:**
- Risk: API keys are partially logged to console (e.g., first 10 chars visible)
- Files: `src/lib/external/perplexity-client.ts:82`, `src/app/api/auth/register/route.ts:61`
- Current mitigation: Only first 10 characters logged, not full key
- Recommendations: Remove all API key logging entirely, including substrings. Use structured logging with redaction rules for production.

**Password Strength Validation Too Weak:**
- Risk: Minimum 6-character password requirement is below NIST recommendations (12 characters for user-chosen passwords)
- Files: `src/app/api/auth/register/route.ts:17-22`
- Current mitigation: bcrypt hashing with salt rounds 12
- Recommendations: Increase minimum to 10-12 characters; add password strength meter in UI; consider entropy checks

**Guest Session Migration Race Condition:**
- Risk: Guest data migration in `src/lib/auth.ts:219-302` has no transaction wrapper. If migration partially succeeds, data becomes orphaned.
- Files: `src/lib/auth.ts:262-290`
- Current mitigation: Logging at each step
- Recommendations: Wrap entire migration in Prisma transaction; add rollback logic; handle orphaned guest records cleanup job

**Sensitive Data in Console Logs:**
- Risk: Email addresses, survey IDs, user IDs logged throughout API routes in production-like logs
- Files: `src/app/api/ai/meals/generate-home/route.ts:54`, `src/lib/auth.ts:224-225`, `src/app/api/chat/route.ts`
- Current mitigation: Only in dev/debug logs (console.log)
- Recommendations: Use request IDs instead of user emails in logs; strip PII before logging; structured logging with log levels

**Cookies Lack Explicit Path and Domain:**
- Risk: Auth cookies set without path/domain constraints (defaults to current path, vulnerable to cross-path attacks)
- Files: `src/lib/auth.ts:196-201`, `src/app/api/auth/register/route.ts:55-60`
- Current mitigation: httpOnly + secure flags present
- Recommendations: Add explicit `path: '/'` and `domain` properties; add SameSite validation

## Performance Bottlenecks

**Large Components with Multiple State Updates:**
- Problem: `MealPlanPage.tsx` (2452 lines) has 13+ `useState` and 4+ `useEffect` hooks triggering re-renders
- Files: `src/components/dashboard/MealPlanPage.tsx:70-105`
- Cause: Component renders entire meal plan UI with complex nested data; no memoization of meal lists or derived state
- Improvement path: Break into smaller components (MealCard, DaySection, NutritionSummary); use `useMemo` for expensive calculations; consider `useCallback` for event handlers

**N+1 Query Pattern in Meal Generation:**
- Problem: Meal plan generation fetches restaurant data, then for each restaurant calls separate API to Perplexity/GPT
- Files: `src/app/api/ai/meals/generate-restaurants/route.ts:85-180`
- Cause: Sequential API calls in map/loop without batching
- Improvement path: Batch restaurant queries; parallel Promise.all() where possible; cache restaurant data

**Uncached External API Calls:**
- Problem: Every meal swap or plan view may call Pexels, Perplexity, Google Places, OpenAI APIs
- Files: `src/lib/external/pexels-client.ts`, `src/lib/external/perplexity-client.ts`, `src/lib/external/places-client.ts`
- Cause: No request deduplication or result caching at application level
- Improvement path: Add Redis cache layer for: restaurant lists by location, menu data (24h TTL), food images (30d TTL)

**Synchronous JSON Parsing in Hot Path:**
- Problem: Large meal plan responses (1000+ line JSON) parsed synchronously on every generation
- Files: `src/app/api/ai/meals/generate-home/route.ts:542-550`
- Cause: Parsing happens in request handler blocking thread
- Improvement path: Stream JSON parsing; validate schema early; consider chunked processing

**No Pagination on Meal Consumption Logs:**
- Problem: `MealConsumptionLog` queries fetch all records without limit; could hit 10K+ rows per user
- Files: `src/app/api/meals/consume/route.ts`, dashboard consumption display
- Cause: No query pagination implemented
- Improvement path: Implement cursor-based pagination; limit default queries to last 30 days; archive old logs

## Fragile Areas

**Meal Plan Generation Pipeline:**
- Files: `src/app/api/ai/meals/generate-home/route.ts` (1323 lines), `src/app/api/ai/meals/generate-restaurants/route.ts` (920 lines)
- Why fragile: Complex multi-step pipeline with 5+ fallback branches, manual error recovery, and extensive console.log debugging code mixed with business logic
- Safe modification: Add comprehensive logging wrapper; extract each phase (home generation, restaurant discovery, image enhancement, grocery list) into separate functions; add detailed comments for each phase transition
- Test coverage: Phase transitions untested; validation failures not covered; error recovery paths not verified

**Survey Data Structure:**
- Files: `prisma/schema.prisma:42-98`, `src/app/survey/page.tsx`
- Why fragile: 15+ overlapping fields for same data (`goal`/`primaryGoal`, `healthFocus`/`fitnessLevel`/`maintainFocus`), no clear field semantics
- Safe modification: Create data migration plan; map old fields to new normalized schema; update all consumers atomically
- Test coverage: Survey response mapping not tested; field fallback logic implicit

**Authentication Session Migration:**
- Files: `src/lib/auth.ts:219-302`
- Why fragile: No transaction wrapper; multiple sequential updates can fail partially; orphaned guest data not cleaned up
- Safe modification: Wrap in Prisma transaction; add pre-checks for consistency; log transaction ID for audit trail
- Test coverage: Happy path tested, but failure scenarios not covered; race conditions not detected

**Middleware Route Matching:**
- Files: `src/middleware.ts:47-57`
- Why fragile: Regex pattern with lookahead/negative lookahead for image exclusion; easy to accidentally match/exclude unintended paths
- Safe modification: Add explicit route array; update config.matcher with tested patterns; add comments for each exclusion reason
- Test coverage: Edge cases like `.webp` files, static routes not verified

**Meal Swap Dialog State Management:**
- Files: `src/components/dashboard/MealPlanPage.tsx:83-88`, `src/components/dashboard/MealSwapDialog.tsx`
- Why fragile: Complex state lifting across component hierarchy; swap selection state in parent, meal data in child, validation happening asynchronously
- Safe modification: Create custom hook for swap state (useSwapDialog); centralize all swap logic; add race condition guards
- Test coverage: Concurrent swaps not tested; validation errors during swap not verified

## Scaling Limits

**Meal Plan Data Storage:**
- Current capacity: ~10,000 meal options per user per year (7 meals/day × ~3 options × 52 weeks)
- Limit: Meal option queries will hit performance cliff around 50K+ records due to lack of indexing on specific combinations
- Scaling path: Add compound index on `(mealPlanId, day, mealType)`; partition meal history by year; implement soft delete with cleanup jobs

**Workout Plan Complexity:**
- Current capacity: Stored as JSON `planData` field without schema validation
- Limit: JSON field can store ~1MB; complex plans with 100+ exercises may approach limits
- Scaling path: Normalize `WorkoutExercise` as separate model; add indexes on day/muscleGroup; implement query caching

**External API Rate Limits:**
- Current capacity: No rate limit awareness; concurrent requests to Perplexity/OpenAI can trigger 429 errors
- Limit: OpenAI: 3.5K RPM (gpt-4-turbo), 90K TPM; Perplexity: undocumented but typical 100 RPM
- Scaling path: Implement queue system (Bull, RabbitMQ); add exponential backoff; monitor token usage per user

**Guest Session Proliferation:**
- Current capacity: `SurveyResponse.isGuest = true` records never cleaned up
- Limit: Database will grow unbounded; queries filtering on `isGuest = false` will slow
- Scaling path: Add cleanup job for guest sessions >30 days old; archive to cold storage; partition by creation date

## Dependencies at Risk

**Anthropic Claude Code SDK (@anthropic-ai/claude-code ^1.0.113):**
- Risk: Pinned to specific version; unclear maintenance status; not core to application (only used in potentially unused chat route)
- Impact: Security patches may not be applied automatically; breaking changes in minor versions possible
- Migration plan: Verify if actually used in production; if not, remove; if yes, switch to published @anthropic-ai/sdk for consistency

**OpenAI SDK Tight Coupling (openai ^5.15.0):**
- Risk: API rate limiting, price increases, model deprecations not handled. No fallback provider.
- Impact: Any OpenAI outage blocks meal/workout generation entirely; price increases hit unpredictably
- Migration plan: Implement adapter pattern for LLM providers; add Anthropic as fallback; support local models (Ollama) for development

**Prisma Client Auto-generation (^6.13.0):**
- Risk: Breaking changes in minor versions; generated types don't match runtime if schema changes missed
- Impact: Type mismatches in production; migrations can fail silently
- Migration plan: Pin to exact version; add pre-commit hook to verify `prisma generate` ran; test schema changes in isolated branch

## Missing Critical Features

**No Data Backup or Export:**
- Problem: User data (meal plans, workout logs, preferences) cannot be exported or backed up by user
- Blocks: GDPR right to data portability; disaster recovery; switching providers
- Recommendation: Implement CSV/JSON export endpoint; add scheduled backup job

**No Undo/Rollback for Meal Swaps:**
- Problem: Users can swap meals but cannot undo; no history of changes
- Blocks: Users cannot recover from accidental swaps; no audit trail
- Recommendation: Add soft delete to swap history; implement undo endpoint; show change log in UI

**No Notification System:**
- Problem: Users don't know when plans are ready, when they should log meals, meal deadlines
- Blocks: Engagement; user retention; accountability
- Recommendation: Add push notifications; email reminders for upcoming meal dates; in-app notifications

**No Rate Limiting on API Endpoints:**
- Problem: Any endpoint can be called unlimited times; no protection against abuse or accidents
- Blocks: Cost control; DDoS protection
- Recommendation: Add rate limiting middleware; per-user quotas; exponential backoff for external APIs

## Test Coverage Gaps

**No API Route Integration Tests:**
- Untested area: Entire API layer (`src/app/api/**`)
- Files: All route handlers
- Risk: Breaking changes in API contracts not caught; error handling paths not verified; race conditions in concurrent requests
- Priority: High — these are critical to data integrity

**No Complex Async Flow Tests:**
- Untested area: Multi-step async operations (meal generation → validation → image enhancement → grocery list)
- Files: `src/app/api/ai/meals/generate-home/route.ts`, `src/app/api/ai/meals/generate-restaurants/route.ts`
- Risk: Pipeline breaks at different points depending on input data; fallback logic untested; partial failures corrupt data
- Priority: High — affects core features

**No Component State Management Tests:**
- Untested area: React state updates, event handlers, local storage persistence
- Files: `src/components/dashboard/MealPlanPage.tsx`, `src/components/dashboard/WorkoutPlanPage.tsx`
- Risk: Race conditions in state updates; event handlers fail silently; localStorage data becomes stale
- Priority: Medium — UI issues not data loss

**No Database Constraint Tests:**
- Untested area: Unique constraints, cascade deletes, foreign keys
- Files: Database operations in all routes
- Risk: Data duplication (duplicate meal options); orphaned records on delete; constraint violations on concurrent updates
- Priority: Medium — edge case bugs

**No External API Failure Tests:**
- Untested area: Fallback logic when Perplexity, OpenAI, Google Places, Pexels fail
- Files: `src/lib/external/*.ts`
- Risk: Cascading failures; unclear error messages to users; partial data corruption
- Priority: High — affects production reliability

**No Auth Session Edge Case Tests:**
- Untested area: Session expiration, concurrent requests with same sessionId, session migration during login
- Files: `src/lib/auth.ts`
- Risk: Users locked out; session leaks; concurrent request race conditions
- Priority: High — affects all users

---

*Concerns audit: 2026-06-07*
