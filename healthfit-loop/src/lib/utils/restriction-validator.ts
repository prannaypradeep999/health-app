export interface RestrictionViolation {
  mealName: string;
  day: string;
  mealType: string;
  violation: string;
  ingredient: string;
  restriction: string;
  severity: 'error' | 'warning';
}

export interface RestrictionValidationResult {
  valid: boolean;
  violations: RestrictionViolation[];
}

/**
 * Survey values arrive in whatever casing and phrasing the UI offered, and the
 * same restriction has several names. `gluten-free`, `gluten free` and
 * `coeliac` are one rule; `peanut` and `tree nuts` both mean the nut list.
 * Folding them here is what lets the table below have one entry per rule.
 *
 * An unrecognised value is lowercased and returned unchanged rather than
 * dropped. It will find no entry in the table and register no terms — which is
 * the old behaviour, now confined to values we genuinely have no list for.
 */
const ALIASES: Record<string, string> = {
  'gluten-free': 'gluten',
  'gluten free': 'gluten',
  glutenfree: 'gluten',
  celiac: 'gluten',
  coeliac: 'gluten',
  wheat: 'gluten',
  'dairy-free': 'dairy',
  'dairy free': 'dairy',
  'lactose intolerant': 'dairy',
  'lactose-free': 'dairy',
  lactose: 'dairy',
  milk: 'dairy',
  'nut-free': 'nuts',
  'nut free': 'nuts',
  'tree nuts': 'nuts',
  'tree nut': 'nuts',
  nut: 'nuts',
  peanut: 'nuts',
  peanuts: 'nuts',
  egg: 'eggs',
  'egg-free': 'eggs',
  crustacean: 'shellfish',
  seafood: 'shellfish',
  'soy-free': 'soy',
  soya: 'soy',
};

export function normalizeRestriction(raw: string): string {
  const key = String(raw ?? '').toLowerCase().trim();
  return ALIASES[key] ?? key;
}

// Foods that belong to each restriction category, keyed on the canonical name
// normalizeRestriction produces.
//
// `mediterranean` is deliberately absent: it is a preference expressed as what
// to favour, not a list of what to exclude, so there is nothing here it could
// honestly contain. It normalizes to itself, matches no entry, and registers no
// terms — the correct outcome rather than an accidental one.
const RESTRICTION_MAPPINGS: Record<string, string[]> = {
  // Diet types
  vegetarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'steak', 'ground beef', 'ground turkey', 'sausage', 'fish', 'salmon', 'tuna', 'shrimp', 'cod', 'tilapia', 'anchovy', 'gelatin'],
  vegan: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'fish', 'salmon', 'eggs', 'milk', 'cheese', 'yogurt', 'butter', 'cream', 'honey', 'whey', 'gelatin'],
  pescatarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'steak', 'ground beef', 'ground turkey', 'sausage', 'duck', 'venison', 'prosciutto'],
  halal: ['pork', 'bacon', 'ham', 'sausage', 'prosciutto', 'pepperoni', 'lard', 'gelatin', 'wine', 'beer', 'rum', 'vodka', 'alcohol'],
  kosher: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'lard', 'shrimp', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'catfish', 'cheeseburger'],
  keto: ['rice', 'pasta', 'bread', 'potato', 'tortilla', 'bagel', 'oats', 'cereal', 'sugar', 'banana', 'couscous', 'quinoa'],
  paleo: ['bread', 'pasta', 'rice', 'oats', 'cereal', 'beans', 'lentils', 'chickpeas', 'peanut', 'milk', 'cheese', 'yogurt', 'sugar', 'couscous'],

  // Category exclusions
  dairy: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'ice cream', 'sour cream', 'cream cheese', 'cottage cheese', 'ricotta', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'whey'],
  gluten: ['wheat', 'bread', 'pasta', 'flour', 'tortilla', 'bagel', 'croissant', 'muffin', 'cake', 'cookie', 'cracker', 'cereal', 'barley', 'rye', 'couscous', 'seitan', 'soy sauce', 'orzo', 'farro', 'panko'],
  nuts: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'peanut', 'pine nut'],
  shellfish: ['shrimp', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish', 'prawn'],
  fish: ['salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'sardine', 'anchovy', 'mackerel', 'bass'],
  eggs: ['egg', 'eggs', 'omelet', 'omelette', 'frittata', 'quiche', 'meringue', 'mayonnaise'],
  soy: ['soy', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce'],

  // Protein exclusions
  chicken: ['chicken'],
  beef: ['beef', 'steak', 'ground beef', 'brisket'],
  pork: ['pork', 'bacon', 'ham', 'sausage', 'prosciutto'],
  lamb: ['lamb'],
  turkey: ['turkey', 'ground turkey'],
};

/**
 * Diets a miss on which is a preference rather than a safety or religious
 * failure. They still produce a violation so it is visible; they do not make
 * the plan invalid. Without this split, adding keto and paleo to the table
 * above would start failing plans over a bowl of rice.
 */
const PREFERENCE_ONLY = new Set(['keto', 'paleo']);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The old test was `searchText.includes(term)`. That is why `egg` matched
 * eggplant and `ham` matched hamburger — and with the expanded table above,
 * `fish` would have matched shellfish and flagged every kosher plan containing
 * one. Anchoring both ends on a word boundary is the whole fix; the optional
 * plural suffix is what keeps "almonds" matching the term "almond".
 */
export function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return new RegExp(`\\b${escapeRegExp(t)}(s|es)?\\b`, 'i').test(text);
}

export function validateRestrictions(
  meals: any[],
  userRestrictions: {
    dietPrefs?: string[];
    strictExclusions?: Record<string, string[]>;
    foodAllergies?: string[];
  }
): RestrictionValidationResult {
  const violations: RestrictionViolation[] = [];

  const forbiddenTerms: { term: string; restriction: string; severity: 'error' | 'warning' }[] = [];

  (userRestrictions.dietPrefs || []).forEach(pref => {
    const key = normalizeRestriction(pref);
    const severity: 'error' | 'warning' = PREFERENCE_ONLY.has(key) ? 'warning' : 'error';
    (RESTRICTION_MAPPINGS[key] || []).forEach(food => {
      forbiddenTerms.push({ term: food, restriction: pref, severity });
    });
  });

  Object.entries(userRestrictions.strictExclusions || {}).forEach(([category, items]) => {
    (RESTRICTION_MAPPINGS[normalizeRestriction(category)] || []).forEach(food => {
      forbiddenTerms.push({ term: food, restriction: `${category} dislike`, severity: 'warning' });
    });
    (items || []).forEach(item => {
      forbiddenTerms.push({ term: String(item).toLowerCase(), restriction: `dislike: ${item}`, severity: 'warning' });
    });
  });

  (userRestrictions.foodAllergies || []).forEach(allergy => {
    const key = normalizeRestriction(allergy);
    // The literal allergen the user typed, plus everything in its category.
    // An allergy is never downgraded to a warning.
    forbiddenTerms.push({ term: key, restriction: `allergy: ${allergy}`, severity: 'error' });
    (RESTRICTION_MAPPINGS[key] || []).forEach(food => {
      forbiddenTerms.push({ term: food, restriction: `allergy: ${allergy}`, severity: 'error' });
    });
  });

  meals.forEach(meal => {
    const mealName = (meal.name || meal.dish || meal.description || '').toLowerCase();
    const ingredients = Array.isArray(meal.ingredients)
      ? meal.ingredients.map((item: any) => String(item).toLowerCase()).join(' ')
      : '';
    const searchText = `${mealName} ${ingredients}`;

    /**
     * The second pass, and the reason it is separate.
     *
     * A home recipe carries an `ingredients` array and that is where its
     * forbidden foods appear. A restaurant option carries none —
     * `RestaurantMealObject` in src/lib/ai/schemas/restaurants.ts defines no
     * ingredients field — so everything known about what is in the dish sits in
     * `description`.
     *
     * `mealName` above is `name || dish || description`. Those are `||`, and
     * both meal routes set `name` before calling, so `name` was always truthy
     * and the description was never once read. A dish called "Bento Box"
     * described as pork belly passed a vegetarian check.
     *
     * It is scanned at `warning` severity regardless of what the restriction
     * itself declares, because a description is prose a model wrote and
     * `containsTerm` is word-anchored and negation-blind: it cannot tell "pork
     * belly" from "no pork". Six spurious violations against a compliant
     * falafel wrap were measured that way during the 2026-08-26 bench work.
     *
     * The alternative — teaching `containsTerm` about negation — is rejected on
     * purpose. It would make a dietary and allergy check MORE permissive by
     * believing the model's own claim that an ingredient is absent.
     * Over-flagging fails safe; under-flagging does not. Warning severity keeps
     * the flag visible (violations are stored on the plan and rendered in
     * MealPlanPage) without letting a model's phrasing invalidate a week.
     *
     * Skipped when the description already IS `mealName`, so the pre-existing
     * fallback path keeps its full severity instead of being demoted here.
     */
    const description = String(meal.description ?? '').toLowerCase();
    const descriptionText = description && description !== mealName ? description : '';

    // Terms the first pass already reported on this meal. The description pass
    // skips them, so a term present in both is reported once and keeps the
    // declared severity rather than being duplicated as a warning.
    //
    // Deliberately NOT consulted by the first pass: one term can arrive from
    // two restrictions ("peanut" from both the allergy and the nuts table) and
    // reporting it against each is the existing behaviour, which this change
    // has no business altering.
    const seen = new Set<string>();

    forbiddenTerms.forEach(({ term, restriction, severity }) => {
      if (containsTerm(searchText, term)) {
        seen.add(term);
        violations.push({
          mealName: meal.name || meal.dish || meal.description || 'Unknown meal',
          day: meal.day || 'unknown',
          mealType: meal.mealType || 'unknown',
          violation: `Contains "${term}"`,
          ingredient: term,
          restriction,
          severity,
        });
      }
    });

    if (!descriptionText) return;

    forbiddenTerms.forEach(({ term, restriction }) => {
      if (seen.has(term)) return;
      if (containsTerm(descriptionText, term)) {
        seen.add(term);
        violations.push({
          mealName: meal.name || meal.dish || meal.description || 'Unknown meal',
          day: meal.day || 'unknown',
          mealType: meal.mealType || 'unknown',
          violation: `Description mentions "${term}"`,
          ingredient: term,
          restriction,
          severity: 'warning',
        });
      }
    });
  });

  return {
    valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
  };
}
