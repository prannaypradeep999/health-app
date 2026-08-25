import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

/**
 * Build an OpenAI strict-mode `response_format` from a Zod schema.
 *
 * Uses the openai SDK's own helper rather than a direct zod-to-json-schema
 * call: it applies the required/nullable/additionalProperties transformation
 * strict mode needs, and throws at build time on `.optional()` without
 * `.nullable()` instead of letting the API reject the request at runtime.
 *
 * Pass the unrefined object schema — a `.superRefine()` wrapper is a ZodEffects
 * and carries no JSON Schema of its own. Refinements are local-only anyway.
 */
export function toStrictJsonSchema(name: string, schema: z.ZodType) {
  return zodResponseFormat(schema, name);
}

/**
 * Pin an array to exactly `count` entries.
 *
 * `minItems`/`maxItems` are grammar-enforced under strict mode, not merely
 * advisory — measured 2026-08-18: a prompt naming two fruits with minItems 5
 * returned five entries (the model padded), and the same prompt with minItems 2
 * returned two. The decoder cannot close the array early.
 *
 * That padding behaviour is the whole caveat. Only pin a count the prompt
 * genuinely enumerates, or the model will invent filler to satisfy the grammar.
 * Every call site that uses this lists its N items explicitly in the prompt.
 */
export function exactly<T extends z.ZodTypeAny>(element: T, count: number) {
  return z.array(element).min(count).max(count);
}

export * from './shared';
export * from './workout';
export * from './meals';
export * from './recipe';
export * from './restaurants';
export * from './grocery';

import { GroceryList, MealSlot } from './shared';
import { PlannedMeal } from './meals';
import { WorkoutDayDetail } from './workout';
import { RestaurantMealSlot } from './restaurants';
import { GroceryStoreObject } from './grocery';

/**
 * Count-pinned variants of the four schemas whose prompts enumerate an exact
 * set of slots. These are the sites that were silently returning short — the
 * legacy home-meals call came back with 1-3 of 21 meals on ten runs out of ten,
 * and the detail phase still drops entries about one run in three.
 *
 * Pinning the count moves that from a thing we detect and repair afterwards to
 * a thing the decoder cannot produce. The top-up passes stay regardless: the
 * grammar guarantees N entries, not N *correct* entries, so a duplicated or
 * mislabelled slot still leaves a real gap for them to fill.
 */
export const pinnedMealPlan = (count: number) =>
  z.object({ mealPlan: exactly(PlannedMeal, count) }).strict();

export const pinnedMealDetail = (count: number) =>
  z.object({ meals: exactly(MealSlot, count) }).strict();

export const pinnedHomeMealsLegacy = (count: number) =>
  z.object({ homeMeals: exactly(MealSlot, count), groceryList: GroceryList }).strict();

export const pinnedWorkoutDetail = (count: number) =>
  z.object({ days: exactly(WorkoutDayDetail, count) }).strict();

export const pinnedRestaurantMeals = (count: number) =>
  z.object({ restaurantMeals: exactly(RestaurantMealSlot, count) }).strict();

