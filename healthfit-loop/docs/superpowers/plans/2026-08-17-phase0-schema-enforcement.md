# Phase 0: Schema Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every LLM JSON response shape-guaranteed and validated before use, so malformed model output can no longer reach the UI or the database. No vendor change, no new API account, no new spend.

**Why this first:** All 11 JSON-producing call sites use `response_format: { type: "json_object" }`, which guarantees syntactically valid JSON but *not* field names, types, or required fields. OpenAI classifies that mode as legacy and has shipped `json_schema` + `strict: true` — grammar-constrained decoding with ~100% schema compliance — on the models already in use. This is a per-call-site parameter change on the existing key.

**Architecture:** Five layers, built bottom-up. (1) Fix the timeout primitive so failures surface at all. (2) Centralize model selection so later phases are one-line changes. (3) Build shared Zod schemas from the five shapes currently duplicated across prompt files. (4) Switch call sites to strict mode and validate responses. (5) Gate persistence on validation so the recipe cache stops being poisonable.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma/PostgreSQL (Neon), TypeScript, `openai ^5.15.0`, `zod ^3.25.76`, Tailwind CSS 4.

**Prerequisite reading:** `MODEL-MIGRATION-PLAN.md` in the repo root — sections "Current state: every generation site" and "Phase 0".

---

## ⚠️ Amendments — verified against code and vendor docs, 2026-08-17 (later same day)

The plan was re-verified before execution. Seven corrections, in severity order.
Where this section conflicts with the task text below, **this section wins.**

1. **Task 1 is already complete.** Commit `4331434` did it and went further: the plan
   named 6 dead call sites, grep found **11** (5 more in `places-client.ts` and
   `pexels-client.ts`). `grep -rn "Retry(async () =>" src/` returns nothing. The
   timeout-fires proof was done with an offline never-responding server rather than
   by editing `RetryPresets` — better, since it needs no revert. **Skip Task 1.**

2. **Task 3 Step 2 has the wrong shape for `activeRecovery`.** The plan says
   `z.array(z.string())`. It is an **object**:
   `{suggestedActivity: string, duration: string, description: string, alternatives: string[]}`
   (`workout-generation.ts`, detail-phase prompt). `WorkoutPlanPage.tsx:669-678` reads
   `.suggestedActivity`, `.duration`, `.description` and `.alternatives`. Building the
   plan's version would break rest-day rendering for every user.

3. **Do not install `zod-to-json-schema`.** `openai@5.15.0` already vendors it and
   exports `zodResponseFormat` from `openai/helpers/zod`. It does the
   required/nullable/`additionalProperties` transformation correctly and **throws at
   build time** on `.optional()` without `.nullable()` — the hand-rolled version in
   Task 3 Step 4 would instead emit an API-rejected schema at runtime, per call site.
   Verified live against `gpt-4o`: HTTP 200, correct branch nulling, zod re-validates.
   No new dependency. `toStrictJsonSchema` becomes a thin wrapper over the helper.

4. **Two strict-mode facts in Task 3 are outdated.** `$ref`/`$defs` **are** supported
   (so `$refStrategy:'none'` is unnecessary), and `minimum`/`maximum`/`minItems`/
   `maxItems`/`pattern`/`format` are **no longer stripped** — OpenAI added them
   2025-05. Still unsupported: `minLength`, `maxLength`, `default`, `allOf`.
   Still true: no `anyOf` at the root, everything in `required`,
   `additionalProperties: false` everywhere.
   Source: https://developers.openai.com/api/docs/guides/structured-outputs

5. **Task 4's `parseModelJson` misses refusals.** Under Structured Outputs a model
   refusal returns `finish_reason: 'stop'`, `content: null`, and a dedicated
   `choices[0].message.refusal` field. Checking only `finish_reason` misses it and
   then `JSON.parse(null)` throws. Add a `refusal` parameter, checked first.

6. **Task 3 Step 3 states `MealDetailSchema` wrong.** It is not `{meals: [MealObject]}`.
   It is `{meals: [{day, mealType, primary: MealObject, alternative: MealObject}]}`.
   Same wrapper for `HomeMealsLegacySchema`'s `homeMeals`. Confirmed in the prompt.

7. **Task 6 Step 2 needs a prompt change, not just a schema.** The restaurant prompt
   ends: *"Only include platforms in orderingLinks that have actual URLs... don't
   include grubhub."* Strict mode requires all four keys always present. The prompt
   must be changed to instruct `null` for missing platforms, or every response fails
   the schema. The plan does not mention this.

Also noted, outside this plan's scope: `recipes/generate` caches on `dishName`
alone while the prompt consumes `dietaryRestrictions` and `nutritionTargets`, so a
vegan user can be served another user's cached non-vegan version of the same dish.
Task 7 does not fix this. Raised separately.

---

## ⚠️ Amendment 8 — added during execution, 2026-08-18

**`minItems`/`maxItems` are grammar-enforced under strict mode, not advisory.** The
body of this plan says the opposite in two places (the "Before you start" note and
Task 6 Step 4); both are struck through inline. Amendment 4 above already had it
right. This matters more than a documentation nit, because the wrong version is
what stopped the plan from pinning counts — and pinning counts is what actually
fixed the bug the plan was trying to work around.

Measured directly, twice, against `gpt-4o`:

| Prompt | Schema | Returned |
|---|---|---|
| "list the fruits: apple, banana" | `minItems: 5, maxItems: 5` | **5** entries — three invented |
| same prompt | `minItems: 2, maxItems: 2` | **2** entries |

The decoder cannot close the array early. That is the guarantee; the padding is
the price. **Only pin a count the prompt genuinely enumerates.** Pin a number the
prompt does not name and the model fabricates filler to satisfy the grammar —
which is worse than a short array, because a short array is detectable and
invented data is not.

### What this changes

The known "3 of 21 meals" failure was framed here as something to catch after the
fact with a recovery call. It is fixable at the decoder instead. `exactly()` in
`src/lib/ai/schemas/index.ts` wraps the pattern, and five sites use it — each one
a case where the prompt lists its slots by name:

| Site | Helper | Why the count is exact |
|---|---|---|
| `generate-home` planning | `pinnedMealPlan(homeMeals.length)` | prompt renders every scheduled slot |
| `generate-home` detail | `pinnedMealDetail(chunk.length)` | prompt lists the chunk's meals |
| `generate-home` legacy | `pinnedHomeMealsLegacy(homeMeals.length)` | same schedule text |
| `workouts/generate` detail | `pinnedWorkoutDetail(dayOutlines.length)` | prompt names each day |
| `generate-restaurants` | `pinnedRestaurantMeals(schedule.length)` | prompt names each eating-out slot |

Deliberately **not** pinned: the Perplexity menu extraction (the prompt asks for
"6–12 items", a range — a real restaurant page may yield fewer) and the grocery
list (derived, not enumerated).

### The top-up passes stay anyway

Pinning guarantees *N entries*, not *N correct entries*. The model can satisfy
`minItems` by duplicating a slot, which leaves a real gap while the array length
looks right. Each pinned site therefore still reconciles returned entries against
requested ones by `slotKey` and re-requests only the genuinely missing ones. Belt
and braces, and the braces are cheap: when the grammar holds, the top-up pass
finds nothing missing and makes no call.

Per the standing instruction that a wrong answer should degrade to the next-best
answer rather than fail: every path added here degrades (chunk empty → top-up →
serve what exists). The one exception is `recipes/generate`, which returns 502
instead of caching an unvalidated recipe — justified because a bad cache row is
served forever, so failing loudly once beats failing quietly for months.

## ⚠️ Before you start

**Line numbers in this plan were verified on 17 Aug 2026 but drift as you edit.** Every step says what to search for as well as where it was. Locate code by symbol name or string match, not by line number alone. If a reference is wrong, note it in the completion summary rather than guessing.

**There is no test framework in this repo.** No jest, no vitest, no test script in `package.json`. Task 8 builds a standalone harness. Until then, `npx tsc --noEmit` and manual route invocation are the only verification available.

**Do not delete the hand-rolled validators.** Strict mode constrains *shape*, not *semantics*. It cannot express "the per-ingredient calories sum to the recipe total", "a rest day has no exercises", or "this meal contains no pork" — and those are exactly what `workout-validator.ts`, `ingredient-validator.ts`, `restriction-validator.ts` and `grocery-list.ts` do. All of them must survive. What becomes deletable is the *defensive parsing*: `cleanJsonResponse`, multi-key fallbacks, greedy regexes.

~~`minimum`, `maximum`, `minItems` and `format` are stripped from strict schemas by both vendors.~~ **Wrong — see Amendment 8.** They are supported *and grammar-enforced*, which is what makes count-pinning possible.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/lib/utils/retry.ts` | Verify | Confirm `withTimeout` signature already passes `AbortSignal` to callback — it does; the bug is at the call sites |
| `src/lib/external/perplexity-client.ts` | Modify | Add `signal` param to 4 fetch callbacks (`:131, :269, :402, :626`) |
| `src/app/api/ai/profiles/workout/route.ts` | Modify | Add `signal` to fetch callback at `:246` |
| `src/app/api/ai/profiles/food/route.ts` | Modify | Add `signal` to fetch callback at `:150` |
| `src/lib/ai/models.ts` | **Create** | Central model config, env-resolved, named by role |
| `src/lib/ai/schemas/shared.ts` | **Create** | The 5 duplicated shapes as Zod schemas |
| `src/lib/ai/schemas/workout.ts` | **Create** | Workout plan + detail schemas |
| `src/lib/ai/schemas/meals.ts` | **Create** | Meal plan, detail, grocery list schemas |
| `src/lib/ai/schemas/recipe.ts` | **Create** | Recipe schema |
| `src/lib/ai/schemas/restaurants.ts` | **Create** | Restaurant selection + meal schemas |
| `src/lib/ai/schemas/index.ts` | **Create** | Re-exports + `toStrictJsonSchema()` helper |
| `src/lib/ai/validate.ts` | **Create** | `parseModelJson()` — parse, validate, branch on finish_reason |
| `src/app/api/ai/recipes/generate/route.ts` | Modify | Strict schema, validation, gate DB write, fix cache guard |
| `src/app/api/ai/analyze-workout/route.ts` | Modify | Add `response_format` (currently has none), wrap in `withGPTRetry` |
| `src/app/api/ai/workouts/generate/route.ts` | Modify | Strict schemas both phases, validate, remove bare `JSON.parse` |
| `src/app/api/ai/meals/generate-home/route.ts` | Modify | Strict schemas ×4, remove multi-key fallback at `:1051` |
| `src/app/api/ai/meals/generate-restaurants/route.ts` | Modify | Strict schemas ×2, retire `cleanJsonResponse` |
| `scripts/bench-generators.ts` | **Create** | Benchmark harness (Task 8) |
| `package.json` | Modify | Add `bench` script; move `@anthropic-ai/*` out of `dependencies` |

---

## Task 1: Fix the silent timeout bug

**Files:**
- Verify: `src/lib/utils/retry.ts`
- Modify: `src/lib/external/perplexity-client.ts`, `src/app/api/ai/profiles/workout/route.ts`, `src/app/api/ai/profiles/food/route.ts`

`withTimeout` (`retry.ts:39-54`) is already correctly typed — `fn: (signal: AbortSignal) => Promise<T>`. It creates a controller, aborts it on timeout, and converts the abort into a thrown error. **The primitive is fine.** The bug is that six call sites declare their callback as `async () => {` and ignore the signal parameter entirely.

The consequence is worse than a missing timeout: because `fetch` never sees the signal, it never rejects, so `withTimeout`'s `catch` block never executes and **the timeout error is never thrown at all**. The retry loop sits waiting indefinitely. The 75s and 240s presets are decorative at these six sites.

Correct examples already in the codebase, for reference: `workouts/generate/route.ts:347` and `:391`, `meals/generate-home/route.ts:413, :825, :903, :971`, `meals/generate-restaurants/route.ts:194` and `:447`. All of these use `async (signal) => { ... fetch(url, { signal, ... }) }`.

- [ ] **Step 1: Confirm the primitive is correct**

Read `src/lib/utils/retry.ts:39-54`. Confirm the signature is `fn: (signal: AbortSignal) => Promise<T>` and that `withRetry` passes it through at `:71`. **Do not modify this file** — if it already matches, the fix is entirely at the call sites.

- [ ] **Step 2: Fix the four Perplexity call sites**

In `src/lib/external/perplexity-client.ts`, at the callbacks wrapping the fetches near lines `131`, `269`, `402` and `626`, change each from:

```typescript
async () => {
  const response = await fetch(this.baseUrl, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify(requestBody)
  });
```

to:

```typescript
async (signal) => {
  const response = await fetch(this.baseUrl, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify(requestBody),
    signal
  });
```

Note `:626` posts to `https://api.openai.com/v1/chat/completions`, not `this.baseUrl` — same fix, different URL.

- [ ] **Step 3: Fix the two profile routes**

`src/app/api/ai/profiles/workout/route.ts` around `:246` and `src/app/api/ai/profiles/food/route.ts` around `:150`. Same change: accept `signal`, pass it into `fetch`.

- [ ] **Step 4: Thread the signal through generate-groceries**

`src/app/api/ai/meals/generate-groceries/route.ts:82` and `:128` accept a `signal` but hand off to `perplexityClient.getLocalGroceryStores()` / `.getGroceryPrices()`, which take no signal parameter. Add an optional `signal?: AbortSignal` parameter to both client methods and forward it to the fetch calls fixed in Step 2.

- [ ] **Step 5: Verify the timeout actually fires**

Temporarily set `RetryPresets.perplexity.timeoutMs` to `1000` in `retry.ts`, trigger a grocery generation, and confirm the log shows `Operation timed out after 1000ms` followed by a retry. **Revert the timeout value afterwards.** This is the only way to prove the fix — a passing type check does not exercise it.

```bash
npx tsc --noEmit
```

---

## Task 2: Central model configuration

**Files:**
- Create: `src/lib/ai/models.ts`
- Modify: all 14 OpenAI call sites

There are 14 hardcoded model strings and no env-var control. Note that OpenAI auth reads `process.env.GPT_KEY`, **not** `OPENAI_API_KEY` — the SDK is explicitly re-pointed at `src/app/api/chat/route.ts:7`. Preserve that; do not "fix" it to the conventional name without checking deployment env vars.

- [ ] **Step 1: Create the config module**

```typescript
// src/lib/ai/models.ts

/**
 * Central model configuration.
 * Roles, not model names, so vendor/model migration is a one-line change.
 */

export const MODELS = {
  /** Short prose, chat, light JSON. Latency-sensitive, high volume. */
  FAST: process.env.AI_MODEL_FAST ?? 'gpt-4o-mini',
  /** Multi-step planning that sets structure for downstream calls. */
  PLANNING: process.env.AI_MODEL_PLANNING ?? 'gpt-4o',
  /** Large structured JSON generation. Output-token heavy. */
  DETAIL: process.env.AI_MODEL_DETAIL ?? 'gpt-4o',
} as const;

export type ModelRole = keyof typeof MODELS;

/** Per-role output ceilings. See Task 7 before changing these. */
export const MAX_TOKENS: Record<ModelRole, number> = {
  FAST: 2000,
  PLANNING: 4000,
  DETAIL: 8000,
};
```

Defaults intentionally reproduce today's behaviour so this task is a pure refactor with no behavioural change.

- [ ] **Step 2: Replace every hardcoded model string**

Map each call site to a role:

| Call site | Current | Role |
|---|---|---|
| `chat/route.ts:277` | gpt-4o-mini | `FAST` |
| `profiles/workout/route.ts:253` | gpt-4o-mini | `FAST` |
| `profiles/food/route.ts:157` | gpt-4o-mini | `FAST` |
| `recipes/generate/route.ts:94` | gpt-4o-mini | `FAST` |
| `analyze-workout/route.ts:27` | gpt-4o-mini | `FAST` |
| `workouts/generate/route.ts:354` | gpt-4o | `PLANNING` |
| `workouts/generate/route.ts:398` | gpt-4o | `DETAIL` |
| `meals/generate-home/route.ts:421` | gpt-4o | `DETAIL` |
| `meals/generate-home/route.ts:833` | gpt-4o | `PLANNING` |
| `meals/generate-home/route.ts:911` | gpt-4o | `DETAIL` |
| `meals/generate-home/route.ts:979` | gpt-4o | `DETAIL` |
| `meals/generate-restaurants/route.ts:201` | gpt-4o | `PLANNING` |
| `meals/generate-restaurants/route.ts:454` | gpt-4o | `DETAIL` |
| `perplexity-client.ts:634` | gpt-4o | `DETAIL` |

- [ ] **Step 3: Verify nothing changed behaviourally**

```bash
npx tsc --noEmit
```

Grep to confirm zero hardcoded strings remain:

```bash
grep -rn "model: 'gpt-\|model: \"gpt-" src/
```

Should return nothing.

---

## Task 3: Shared Zod schemas

**Files:**
- Create: `src/lib/ai/schemas/shared.ts`, `workout.ts`, `meals.ts`, `recipe.ts`, `restaurants.ts`, `index.ts`

Five shapes are duplicated across prompt files today. Build each once.

**Strict-mode rules that apply to both OpenAI and Anthropic:**
- Every property must appear in `required`. Optionality is expressed as a nullable union (`z.string().nullable()`), never by omission.
- `additionalProperties: false` on every object.
- `z.record()` is unsupported — the six-key `groceryList` map is fine only because its keys are fixed. Model it as an explicit object.
- `min`/`max`/`length` constraints are stripped from the schema sent to the model. Keep them in the Zod schema anyway — they still run client-side during validation, which is where they belong.
- **Do not use `anyOf` at the schema root.** OpenAI strict forbids it.

- [ ] **Step 1: Build `shared.ts`**

The four cross-cutting shapes:

```typescript
// src/lib/ai/schemas/shared.ts
import { z } from 'zod';

/** Duplicated at meal-generation.ts (×4) and recipe-creation.ts:428 */
export const IngredientWithNutrition = z.object({
  item: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
}).strict();

/** Duplicated at perplexity-client.ts:15, :615 and meal-generation.ts:1093 */
export const OrderingLinks = z.object({
  doordash: z.string().nullable(),
  ubereats: z.string().nullable(),
  grubhub: z.string().nullable(),
  direct: z.string().nullable(),
}).strict();

export const GroceryItem = z.object({
  name: z.string(),
  quantity: z.string(),
  uses: z.string(),
}).strict();

/** Six fixed categories. Explicit object, NOT z.record(). */
export const GroceryList = z.object({
  proteins: z.array(GroceryItem),
  vegetables: z.array(GroceryItem),
  grains: z.array(GroceryItem),
  dairy: z.array(GroceryItem),
  pantryStaples: z.array(GroceryItem),
  snacks: z.array(GroceryItem),
}).strict();

/** Duplicated verbatim at meal-generation.ts:836 and :1308 */
export const MealObject = z.object({
  name: z.string(),
  description: z.string(),
  estimatedCalories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  prepTime: z.string(),
  cookTime: z.string(),
  difficulty: z.string(),
  cuisine: z.string(),
  ingredientsWithNutrition: z.array(IngredientWithNutrition),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  tags: z.array(z.string()),
  source: z.string(),
}).strict();
```

Before writing, **read the actual prompt files** (`src/lib/ai/prompts/meal-generation.ts:836` and `:1308`, `src/lib/ai/prompts/recipe-creation.ts:403-462`) and confirm field names character-for-character. The prompts are the current contract; the schema must match what the UI already consumes or you will break rendering.

- [ ] **Step 2: Build `workout.ts`**

Two schemas, matching `src/lib/ai/prompts/workout-generation.ts:172-199` (plan) and `:263-299` (detail).

**The discriminated-union problem:** a training day carries `warmup` / `exercises` / `cooldown`; a rest day carries `activeRecovery` (see `:300-309`). Under required-everything plus `additionalProperties: false`, and with `anyOf` forbidden at the root, model this as a **flat object with all branches present and nullable**, discriminated by the existing `restDay: boolean`:

```typescript
export const WorkoutDayDetail = z.object({
  day: z.string(),
  restDay: z.boolean(),
  // Present-and-nullable, not optional. Populated per restDay.
  warmup: z.array(WarmupItem).nullable(),
  exercises: z.array(Exercise).nullable(),
  cooldown: z.array(CooldownItem).nullable(),
  activeRecovery: z.array(z.string()).nullable(),
}).strict();
```

Then enforce the branch invariant in Zod with `.superRefine()` — that runs client-side and is not sent to the model:

```typescript
.superRefine((d, ctx) => {
  if (!d.restDay && (!d.exercises || d.exercises.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Training day must have exercises' });
  }
});
```

This `superRefine` is important — it catches the exact failure at `workouts/generate/route.ts:511` where a day-key mismatch silently yields an exercise-less training day.

Complexity check: the exercise object is 13 properties, 20 including the nested `weightGuidance` (4) and `modifications` (3) subtrees, ~35 for the full detail schema at max nesting depth 6. Well inside OpenAI's strict limits (5000 properties, depth 10). With everything `required`, Anthropic's 24-optional-parameter cap is never approached.

- [ ] **Step 3: Build `meals.ts`, `recipe.ts`, `restaurants.ts`**

- `meals.ts` — `MealPlanSchema` (`{mealPlan: [...]}`, matching `generate-home:833`), `MealDetailSchema` (`{meals: [MealObject]}`), `GroceryListSchema` (`{groceryList: GroceryList}`), `HomeMealsLegacySchema` (`{homeMeals: [...], groceryList: GroceryList}`).
- `recipe.ts` — matching `recipe-creation.ts:403-462`. Include `nutrition` as **required**; this is what fixes the cache bug in Task 6.
- `restaurants.ts` — `RestaurantSelectionSchema` (`{selectedRestaurants: [...]}`), `RestaurantMealsSchema` (`{restaurantMeals: [...]}` per `meal-generation.ts:1077-1124`), `MenuExtractionSchema` (matching `PerplexityMenuResponse`).

- [ ] **Step 4: Build `index.ts` with the strict-JSON-Schema helper**

```typescript
// src/lib/ai/schemas/index.ts
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod schema to an OpenAI strict-mode response_format payload.
 * Strict mode requires every property in `required` and additionalProperties:false.
 */
export function toStrictJsonSchema(name: string, schema: z.ZodType) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name,
      strict: true,
      schema: zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }),
    },
  };
}

export * from './shared';
export * from './workout';
export * from './meals';
export * from './recipe';
export * from './restaurants';
```

Install the converter:

```bash
npm install zod-to-json-schema
```

`$refStrategy: 'none'` matters — strict mode does not accept `$ref` indirection, and your schemas reuse `MealObject` in several places, which would otherwise emit refs.

- [ ] **Step 5: Verify schemas compile and convert**

Write a throwaway script that calls `toStrictJsonSchema` on every exported schema and prints the result. Confirm no `$ref`, no `anyOf` at root, every object has `additionalProperties: false`, and every property appears in `required`.

```bash
npx tsc --noEmit
```

---

## Task 4: The validation helper

**Files:**
- Create: `src/lib/ai/validate.ts`

One place that parses, checks the finish reason, validates, and returns a discriminated result. Every call site uses it.

- [ ] **Step 1: Write `parseModelJson`**

```typescript
// src/lib/ai/validate.ts
import { z } from 'zod';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'refusal' | 'truncated' | 'invalid_json' | 'schema'; detail: string; raw: string };

/**
 * Parse and validate a model JSON response.
 * Checks finish_reason BEFORE parsing — a truncated response is a hard failure
 * under grammar-constrained decoding, not something to salvage.
 */
export function parseModelJson<T>(
  schema: z.ZodType<T>,
  content: string | null | undefined,
  finishReason: string | null | undefined,
  context: string
): ParseResult<T> {
  if (finishReason === 'length') {
    console.error(`[VALIDATE] ${context}: truncated (finish_reason=length)`);
    return { ok: false, reason: 'truncated', detail: 'max_tokens reached', raw: content ?? '' };
  }
  if (finishReason === 'content_filter') {
    return { ok: false, reason: 'refusal', detail: 'content filter', raw: content ?? '' };
  }
  if (!content) {
    return { ok: false, reason: 'invalid_json', detail: 'empty content', raw: '' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error(`[VALIDATE] ${context}: JSON.parse failed`, content.slice(0, 500));
    return { ok: false, reason: 'invalid_json', detail: String(e), raw: content };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    console.error(`[VALIDATE] ${context}: schema failed`, result.error.issues.slice(0, 5));
    return { ok: false, reason: 'schema', detail: result.error.message, raw: content };
  }
  return { ok: true, data: result.data };
}

/** Enums are not capitalization-guaranteed by either vendor. Normalize at the boundary. */
export function normalizeEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  const hit = allowed.find(a => a.toLowerCase() === value?.toLowerCase?.());
  return hit ?? null;
}
```

`normalizeEnum` exists because neither OpenAI nor Anthropic guarantees enum capitalization — Anthropic documents this explicitly. Apply it to `category`, `healthRating` (`perplexity-client.ts:9, :11`), `priceConfidence` (`:51`) and store `type` (`:34`), all of which currently reach the UI unchecked.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

---

## Task 5: Measure output tokens before enabling strict mode

**Files:** none — this is a measurement task.

**Do not skip this and do not reorder it after Task 6.** `generate-home/route.ts:424` sets `max_tokens: 16384`, which is gpt-4o's absolute output ceiling with zero headroom, and it generates a full week of primary + alternative meals across 21 slots in one shot.

Today a truncated response sometimes partially survives, because the parser at `:641` is lenient and falls back. **Under grammar-constrained decoding, truncation is a hard schema failure.** Turning on strict mode without knowing the current output-token distribution risks converting an occasional degraded response into a consistent hard failure.

- [ ] **Step 1: Log actual output token usage**

At each of the four `generate-home` call sites plus both `workouts/generate` sites, log `response.usage.completion_tokens` and `choices[0].finish_reason`.

- [ ] **Step 2: Collect a sample**

Run 10 generations per site against realistic survey data. Record max, p95 and any `finish_reason === 'length'` occurrences.

- [ ] **Step 3: Decide**

If p95 exceeds roughly 70% of the configured `max_tokens`, raise the ceiling or reduce per-call scope (more chunks, fewer days per call) **before** Task 6 touches that site. Record the numbers in the completion summary — Phase 1 needs them to size the GPT-5.6 migration.

---

## Task 6: Switch call sites to strict mode

**Files:** the five route files plus `perplexity-client.ts`

Work one call site at a time. After each, type-check and manually exercise the route. Do not batch all eleven and hope.

Order matters — start with the lowest-risk site to validate the pattern, finish with the highest-risk.

- [ ] **Step 1: `analyze-workout/route.ts:27` — the pattern-setter**

Smallest schema (`{calories: number, tips: string}`), best existing fallback, so failures are harmless. It currently sets **no** `response_format` at all despite a system prompt demanding "ONLY valid JSON", and parses via regex fence-stripping at `:51`.

Add `response_format: toStrictJsonSchema('workout_analysis', WorkoutAnalysisSchema)`, replace the regex strip with `parseModelJson`, keep the existing clamp at `:64` and the hardcoded fallback at `:73`. Also wrap the call in `withGPTRetry` — it is one of only two OpenAI calls that isn't.

- [ ] **Step 2: `meals/generate-restaurants/route.ts:201` and `:454`**

Both already fail gracefully (`null` → `slice(0,8)` fallback; `[]`). Replace `cleanJsonResponse` (`:98`) with `parseModelJson`. Keep `validateRestaurantMeals` (`:533`) — it does value-level work.

Note: the `orderingLinks` access at `:519` is already null-safe and inside a `console.log`. It is **not** a bug; leave it.

- [ ] **Step 3: `workouts/generate/route.ts:354` and `:398`**

Replace both bare `JSON.parse` calls (`:375`, `:419`) with `parseModelJson`. On failure, return a proper error rather than throwing an unhandled exception.

Then fix the merge at `:505`. It keys on `day?.toLowerCase()`; a missing or misspelled `day` drops all exercise detail and the `:511` fallback assigns `[]` in both ternary branches, which is a no-op. With the schema guaranteeing `day` is present, add an explicit check that every planned day found a detail match, and log loudly when one doesn't.

- [ ] **Step 4: `meals/generate-home/route.ts` — all four sites**

`:421` (legacy), `:833` (plan), `:911` (detail), `:979` (grocery).

At `:1051`, delete the defensive multi-key read `plannedMeals || mealPlan || meals`. That fallback exists because the model drifted between key names in production — exactly what the schema now prevents. Keeping it would mask a schema violation.

Keep the grocery backfill at `:1106-1124`. ~~It checks `length === 0`, which is a `minItems` constraint and therefore unexpressible in strict mode.~~ **The stated reason is wrong** (see Amendment 8 — `minItems` is expressible and enforced), but the conclusion stands for a different reason: the grocery list is *derived* from the meals, so its correct length is whatever the meals imply, and pinning a number the prompt never enumerates would make the model invent groceries. Keep it as a value-level backfill. As implemented, `buildFallbackGroceryList(mergedMeals)` derives it from the merged meal set so a top-up pass cannot double-count.

- [ ] **Step 5: `perplexity-client.ts:634`**

This gpt-4o call exists solely to convert Sonar prose into JSON. Add the strict schema now; Phase 2 may delete the call entirely.

- [ ] **Step 6: Verify each site**

```bash
npx tsc --noEmit && npm run build
```

Manually trigger each route and confirm a well-formed response. Where `parseModelJson` returns `ok: false`, confirm the fallback path runs rather than a 500 escaping.

---

## Task 7: Fix the recipe cache poisoning

**Files:**
- Modify: `src/app/api/ai/recipes/generate/route.ts`

This is the worst failure mode found in the audit and it gets its own task because the existing guard structurally cannot catch it.

`:115` parses with a bare `JSON.parse` and no local try/catch. The unvalidated object is written to `prisma.recipe.recipeData` at `:141`/`:150` and read back at `:23-73`. The staleness guard at `:36-41` only skips the cache when `nutrition.calories` **exists** and is more than 15% off target. A recipe missing `nutrition` entirely falls through to the `else` at `:57` and is served from cache **unconditionally, forever.**

The guard catches recipes that are merely wrong and misses recipes that are malformed.

- [ ] **Step 1: Validate before persisting**

Replace the `JSON.parse` at `:115` with `parseModelJson(RecipeSchema, ...)`. On `ok: false`, return an error response and **do not write to Prisma**.

- [ ] **Step 2: Harden the cache read**

At `:36-41`, validate cached `recipeData` against `RecipeSchema` before serving. Treat a validation failure as a cache miss and regenerate. This heals existing poisoned rows on next access without a migration.

- [ ] **Step 3: Restructure the guard**

Make the shape check explicit and ordered:

```
1. Does cached recipeData parse against RecipeSchema? No → cache miss, regenerate.
2. Is nutrition.calories within 15% of target? No → cache miss, regenerate.
3. Otherwise → serve from cache.
```

The current code conflates 1 and 2, which is how the malformed case slips through.

- [ ] **Step 4: Wrap in `withGPTRetry`**

This route is the other of the two OpenAI calls not wrapped.

- [ ] **Step 5: Verify**

Manually poison a row — write a recipe with `recipeData` missing `nutrition` — then request that dish and confirm it regenerates instead of serving the bad row.

---

## Task 8: Benchmark harness

**Files:**
- Create: `scripts/bench-generators.ts`
- Modify: `package.json`

Without this you cannot tell whether Phase 0 worked, and Phase 1's model migration becomes guesswork. There is no test framework in this repo, so this is a standalone script run with `npx tsx`.

- [ ] **Step 1: Write the harness**

For each named generator, run N iterations against fixed fixture inputs and record: schema-pass rate, `finish_reason` distribution, wall-clock latency (p50/p95), prompt and completion tokens, and estimated cost from a per-model rate table.

```typescript
// scripts/bench-generators.ts
interface BenchResult {
  site: string;
  model: string;
  n: number;
  schemaPassRate: number;
  finishReasons: Record<string, number>;
  latencyP50Ms: number;
  latencyP95Ms: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  estCostPer1000Runs: number;
}
```

Output a markdown table to stdout and a JSON file to `bench-results/<ISO-date>.json`.

- [ ] **Step 2: Fixtures**

Create `scripts/fixtures/` with 3 realistic survey payloads spanning the range: a low-calorie vegetarian goal, a high-protein gym-access goal, and one with dietary restrictions. Reuse the shapes `SurveySchema` in `src/lib/schemas.ts` already validates.

- [ ] **Step 3: Add the script**

```json
"bench": "tsx scripts/bench-generators.ts"
```

Install `tsx` as a devDependency.

- [ ] **Step 4: Capture the baseline**

Run before and after the Task 6 changes. **Schema-pass rate should go up and truncation rate should not.** If truncation rises, Task 5's measurement was wrong for that site — raise `max_tokens` or reduce scope before proceeding to Phase 1.

```bash
npm run bench
```

---

## Task 9: Dependency cleanup

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Move the unused Anthropic packages**

`@anthropic-ai/claude-code ^1.0.113` and `@anthropic-ai/sdk ^0.102.0` are both in `dependencies` and ship to production. Neither is imported anywhere in `src/`.

`claude-code` is a developer CLI — move to `devDependencies` or remove. **Keep `@anthropic-ai/sdk`** but move it to `devDependencies` for now; Phase 3 may promote it back if the Anthropic web search spike wins.

- [ ] **Step 2: Investigate `tavily ^1.0.2`**

`tavily` is in `dependencies` and appears **nowhere in `src/`** — but `server.log:177-205` shows a fully working Tavily integration that searched DoorDash, Uber Eats and Grubhub for store URLs, with location-match scoring and a `tvly-dev-` API key.

**Before Phase 3, find out what happened to it.** Check git history for the deleted module:

```bash
git log --all --oneline -S "TAVILY" -- src/
git log --all --diff-filter=D --name-only -- "*tavily*"
```

If it was removed because it didn't work well enough, that is directly relevant evidence for the Phase 3 vendor decision and should be recorded. If it was removed accidentally during a refactor, that is a different conclusion entirely. Do not re-litigate Tavily from scratch without this answer.

- [ ] **Step 3: Verify the build still works**

```bash
rm -rf node_modules && npm install && npm run build
```

---

## Completion criteria

- [ ] ~~`npx tsc --noEmit` clean~~ — **unachievable as written.** The repo has 32
      pre-existing errors unrelated to this work, and CLAUDE.md says not to fix
      them incidentally. Restated: **`npx tsc --noEmit` reports exactly 32 errors,
      the same 32 as before Phase 0.** Verified after every commit in this phase.
- [ ] `npm run build` succeeds
- [ ] Timeout fires correctly at all six previously-broken sites (verified by temporary timeout reduction, then reverted)
- [ ] Zero hardcoded model strings in `src/`
- [ ] Every JSON call site uses `toStrictJsonSchema` + `parseModelJson`
- [ ] A poisoned recipe row regenerates instead of being served
- [ ] `npm run bench` produces a before/after comparison showing improved schema-pass rate with no increase in truncation
- [ ] Hand-rolled *value* validators still present and running; only *parsing* defenses removed

## Notes for the summary

Record for Phase 1: the measured output-token p95 per call site from Task 5, and the baseline schema-pass rates from Task 8. Record for Phase 3: the git-history finding on why Tavily was removed.

---

# Execution record — 2026-08-18

Tasks 1–9 implemented. `npx tsc --noEmit` held at exactly 32 errors (the
pre-existing baseline) after every commit; `npm run build` exits 0.

| Commit | Task |
|---|---|
| `4331434` *(pre-existing)* | Task 1 — already done before this plan ran |
| `5f4bc5b` | Task 2 — central model configuration |
| `c630367` | Task 3 — Zod schemas for every structured response |
| `737a28e` | Task 4 — the validation helper |
| `7856be0` | Task 5 — token measurement, and fixes it surfaced |
| `735898e` | Task 6 Step 1 — `analyze-workout` |
| `d947611` | Task 6 Step 2 — `generate-restaurants` |
| `13bbc56` | Task 6 Step 3 — `workouts/generate` + top-up |
| `e7f7b86` | Task 6 Step 4 — `generate-home` + top-up |
| `0fbeadb` | count-pinning at five sites (Amendment 8) |
| `8d76450` | Task 6 Step 5 + Task 7 — `recipes/generate` |
| `ea68fd7` | Task 6 Step 5 — Perplexity, the last `json_object` |
| `71a593d` | Tasks 8 + 9 — bench harness, fixtures, deps |

## Deviations from the plan text

1. **Count-pinning** — the largest change, not in the original plan at all. See
   Amendment 8. It is what actually fixed the 3-of-21 bug.

2. **Legacy home-meals is now chunked.** Task 5 measured a full 21-meal legacy
   week at 15424 output tokens — 94% of gpt-4o's 16384 hard maximum, which cannot
   be raised. Before strict mode a truncated response degraded to a short one;
   under strict mode it is a total loss. `generateHomeMealsLegacyChunked` splits
   anything over `LEGACY_MEALS_PER_CALL = 12` into two calls and merges. Same
   cost, no truncation risk.

3. **Top-up passes at the pinned sites**, per Amendment 8 — reconcile by
   `slotKey`, re-request only genuine gaps, serve what exists if the re-request
   also comes up short. Never throw.

4. **Task 6 Step 5 and Task 7 were done in one commit.** Both rewrite the same
   function body in `recipes/generate/route.ts`; splitting them would have meant
   committing a half-rewritten handler.

5. **Task 7 found a second bug the plan did not name.** The old cache guard only
   skipped the cache when `nutrition.calories` existed *and* was >15% off target,
   so a row missing `nutrition` entirely fell through to the else branch and was
   served unconditionally, forever — the exact poisoning the task exists to stop.
   Now: validate shape first, check freshness second. Validating on read also
   heals already-poisoned rows on next request, with no migration.

6. **Task 8 fixtures are `SurveyResponse`-shaped, not `SurveySchema`-shaped.** The
   plan said to reuse `SurveySchema`, but the prompt builders never see that
   shape — the routes read the survey out of Prisma, so enums arrive lowercased
   and JSON columns arrive as objects. Benchmarking `SurveySchema` would have
   measured a code path that does not exist.

7. **`scripts/bench-generators.ts` has no top-level await.** The plan mandates the
   `.ts` extension, which tsx compiles as CJS, which forbids it. `.mts` was tried
   and rejected — it cannot resolve the `export *` barrel in `schemas/index.ts`.
   Everything lives in `async function main()` instead.

8. **Task 9 Step 2 (Tavily) is answered, not open.** `git diff --stat 50519e6
   5efe030` shows the single commit "commit working restaurant links" both removed
   `import { TavilyClient } from 'tavily'` from `generate-restaurants/route.ts`
   and created `perplexity-client.ts` (+337 lines). Tavily was **deliberately
   replaced**, not lost in a refactor. Phase 3 should treat it as tried and
   rejected rather than re-litigating it.

9. **Hardcoded `gpt-4o` removed from three log lines** (`generate-home` ×1,
   `generate-restaurants` ×2) and the magic `16384` given a name. These were not
   model *selections* — the calls already used `MODELS.*` — but they would have
   silently lied after Phase 1 swapped the model, which is worse than no log.

## Baseline for Phase 1

Full run, all 8 sites, `high-protein-gym`: **100% schema pass, zero truncations,
every site peaking under 45% of its token ceiling, $204.48 per 1000 runs.**
Stored in `bench-results/`. This is the number Phase 1's model migration must be
measured against — cost *and* schema-pass rate, not cost alone.

## Still open

- Timeout-fires verification at the six previously-broken sites. Commit `4331434`
  proved it with an offline never-responding server, which is stronger than the
  temporary-timeout-reduction method the plan describes, but it predates this
  phase's edits and has not been re-run against them.
- The `dishName`-only recipe cache key (noted above, outside scope) is still
  unfixed: a vegan user can be served another user's non-vegan version of the
  same dish. Task 7 hardened *what* gets cached, not *who it is keyed for*.
