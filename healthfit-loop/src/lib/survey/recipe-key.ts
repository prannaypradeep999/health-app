import { createHash } from 'node:crypto';
import { normalizeRestriction } from '@/lib/utils/restriction-validator';

export interface SurveyRestrictionSource {
  dietPrefs?: string[] | null;
  foodAllergies?: string[] | null;
}

/**
 * Every restriction that must reach the recipe prompt, in one canonical list.
 *
 * Diet preferences and allergies are merged deliberately. The prompt does not
 * distinguish them — both become "do not put this in the food" — and keeping
 * them apart in the cache key would let a peanut allergy and a peanut-free diet
 * preference produce two rows with identical contents.
 */
export function restrictionsFromSurvey(survey: SurveyRestrictionSource | null | undefined): string[] {
  if (!survey) return [];
  const raw = [...(survey.dietPrefs ?? []), ...(survey.foodAllergies ?? [])];
  const normalized = raw
    .map((r) => normalizeRestriction(String(r)))
    .filter((r) => r.length > 0);
  return [...new Set(normalized)].sort();
}

/**
 * The Recipe table keys on `dishName @unique`, and until now that key was the
 * dish name alone — so a coeliac user asking for a pasta dish was served the
 * wheat-flour row another user had generated, marked `cached: true`. The key
 * has to carry whatever changed the generation.
 *
 * A request with no restrictions keeps the bare name. That is not a
 * compatibility shim: it is the truthful key for those rows. MealPlanPage sent
 * `dietaryRestrictions: []` on every request until this commit, so every row
 * already in the database was in fact generated with no restrictions, and the
 * bare key describes them correctly. They stay reachable, and only by the
 * requests they actually match.
 *
 * Restrictions are normalized and sorted here as well as in
 * restrictionsFromSurvey, because this function is exported and callable with a
 * hand-built array. "celiac" and "gluten-free" describe the same recipe, and a
 * cache key that depends on which word the caller typed is a cache miss that
 * looks like a hit somewhere else.
 *
 * The suffix is a hash rather than the readable list because a survey's allergy
 * array is user-entered and unbounded; the caller logs the list itself so the
 * hash stays debuggable.
 */
export function recipeCacheKey(dishName: string, restrictions: string[]): string {
  const dish = dishName.toLowerCase().trim();
  const canonical = [...new Set(
    restrictions.map((r) => normalizeRestriction(String(r))).filter((r) => r.length > 0)
  )].sort().join('|');
  if (canonical.length === 0) return dish;
  const fingerprint = createHash('sha256').update(canonical).digest('hex').slice(0, 12);
  return `${dish}::${fingerprint}`;
}
