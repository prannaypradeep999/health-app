import { dishNameOf } from '@/lib/utils/meal-feedback-key';

/**
 * Which recipes to generate before anybody asks for them.
 *
 * `/api/ai/recipes/generate` already caches: it keys the `Recipe` table on the
 * dish name plus a hash of the user's dietary restrictions, so the second
 * request for a dish is a database read. The first request is not — it is a
 * full model call, measured at 20-40s, and it happens while the user is looking
 * at a spinner having just tapped a meal.
 *
 * Nothing warms that cache. A freshly generated week has twelve unseen dishes
 * and every one of them charges the first person to open it. This module names
 * the dishes; the caller fetches them in the background once the plan loads, so
 * the tap that used to start a generation now finishes one that already ran.
 */

export interface PrewarmTarget {
  dishName: string;
  description?: string;
  mealType: string;
  nutritionTargets: { calories: number; protein: number; carbs: number; fat: number };
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Restaurant meals are excluded, not merely skipped for tidiness: tapping one
 * opens an ordering link and never calls the recipe route at all, so generating
 * a recipe for it would be a model call nobody can ever spend.
 */
function isRestaurant(option: unknown): boolean {
  const o = option as Record<string, unknown> | null | undefined;
  if (!o || typeof o !== 'object') return false;
  return o.source === 'restaurant' || Boolean(o.restaurant);
}

/**
 * Primaries for the whole week first, then alternatives.
 *
 * The ordering is the point. Prewarming runs at a low concurrency so it does
 * not flood the route, which means it finishes over minutes rather than at
 * once, and whatever is at the front of the queue is warm soonest. The primary
 * is the dish shown on the card, so it is what a user taps unless they
 * deliberately go looking for the alternative.
 *
 * Dedupe is on the lowercased name because that is what `recipeCacheKey` does.
 * A week that repeats a dish across two days would otherwise queue it twice and
 * the second call would land on the row the first one had just written — a
 * cache hit, so harmless, but a round trip for nothing.
 */
export function collectPrewarmTargets(planData: unknown): PrewarmTarget[] {
  const plan = planData as Record<string, unknown> | null | undefined;
  const days = plan && typeof plan === 'object' ? plan.days : undefined;
  if (!Array.isArray(days)) return [];

  const primaries: PrewarmTarget[] = [];
  const alternatives: PrewarmTarget[] = [];

  for (const day of days) {
    const meals = (day as Record<string, unknown> | null)?.meals;
    if (!meals || typeof meals !== 'object') continue;

    for (const [mealType, slot] of Object.entries(meals as Record<string, unknown>)) {
      const s = slot as Record<string, unknown> | null | undefined;
      if (!s || typeof s !== 'object') continue;

      for (const [option, bucket] of [
        [s.primary, primaries] as const,
        [s.alternative, alternatives] as const
      ]) {
        if (!option || isRestaurant(option)) continue;
        const dishName = dishNameOf(option);
        if (!dishName) continue;

        const o = option as Record<string, unknown>;
        bucket.push({
          dishName,
          description: optionalString(o.description),
          mealType,
          nutritionTargets: {
            calories: num(o.calories),
            protein: num(o.protein),
            carbs: num(o.carbs),
            fat: num(o.fat)
          }
        });
      }
    }
  }

  const seen = new Set<string>();
  const ordered: PrewarmTarget[] = [];
  for (const target of [...primaries, ...alternatives]) {
    const key = target.dishName.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(target);
  }
  return ordered;
}
