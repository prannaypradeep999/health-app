import { report, verdict, type Verdict, type VerificationReport } from './types';
import { verifyRestaurantMeal, type MealClaim } from './restaurants';
import { verifyOrderingLinks } from './links';
import type { SearchItem } from './receipt';
import type { RestaurantFacts } from '@/lib/utils/restaurant-facts';

export * from './types';
export * from './receipt';
export * from './restaurants';
export * from './links';
export * from './groceries';
export * from './workouts';

/**
 * The fail-open boundary. Verification is a diagnostic; it must never be able
 * to fail a generation the user is waiting on. On throw every verdict is
 * `unchecked`, which is distinct from `verified` precisely so a crash cannot
 * read as a clean bill of health.
 */
export function runVerification(fn: () => Verdict[], label: string): VerificationReport {
  try {
    return report(fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[VERIFY] ${label} threw, reporting unchecked: ${message}`);
    return report([verdict(`${label}-crashed`, label, 'unchecked', '', message)]);
  }
}

/** One restaurant's worth of hop-1 evidence, keyed by lowercased restaurant name. */
export interface MenuEvidence {
  searchItems?: SearchItem[];
  sourceHosts?: string[];
}

export function verifyRestaurantPayload(
  slots: Array<{ day: string; mealType: string; primary: any; alternative: any }>,
  evidenceByRestaurant: Record<string, MenuEvidence>,
  facts: Record<string, RestaurantFacts>
): Verdict[] {
  const out: Verdict[] = [];
  for (const slot of slots ?? []) {
    for (const which of ['primary', 'alternative'] as const) {
      const meal = slot?.[which];
      if (!meal) continue;
      const target = `${slot.day}.${slot.mealType}.${which}`;
      const key = String(meal.restaurant ?? '').toLowerCase().trim();
      const evidence = evidenceByRestaurant?.[key] ?? {};

      out.push(...verifyRestaurantMeal(target, {
        restaurant: meal.restaurant,
        dish: meal.dish,
        price: Number(meal.price),
        estimatedCalories: Number(meal.estimatedCalories),
        address: meal.address,
      } as MealClaim, evidence.searchItems, facts?.[key]));

      out.push(...verifyOrderingLinks(target, meal.orderingLinks ?? {}, evidence.sourceHosts));
    }
  }
  return out;
}
