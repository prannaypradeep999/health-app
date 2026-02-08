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

// Foods that belong to each restriction category
const RESTRICTION_MAPPINGS: Record<string, string[]> = {
  // Diet types
  vegetarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'steak', 'ground beef', 'ground turkey', 'sausage', 'fish', 'salmon', 'tuna', 'shrimp', 'cod', 'tilapia'],
  vegan: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'fish', 'salmon', 'egg', 'eggs', 'milk', 'cheese', 'yogurt', 'butter', 'cream', 'honey', 'whey'],

  // Category exclusions
  dairy: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'ice cream', 'sour cream', 'cream cheese', 'cottage cheese', 'ricotta', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'whey'],
  gluten: ['wheat', 'bread', 'pasta', 'flour', 'tortilla', 'bagel', 'croissant', 'muffin', 'cake', 'cookie', 'cracker', 'cereal', 'barley', 'rye', 'couscous', 'seitan', 'soy sauce'],
  nuts: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'peanut', 'pine nut'],
  shellfish: ['shrimp', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish'],
  fish: ['salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'sardine', 'anchovy', 'mackerel', 'bass'],
  eggs: ['egg', 'eggs', 'omelet', 'omelette', 'frittata', 'quiche', 'meringue', 'mayonnaise'],
  soy: ['soy', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce', 'soy milk'],

  // Protein exclusions
  chicken: ['chicken'],
  beef: ['beef', 'steak', 'ground beef', 'brisket'],
  pork: ['pork', 'bacon', 'ham', 'sausage', 'prosciutto'],
  lamb: ['lamb'],
  turkey: ['turkey', 'ground turkey'],
};

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
    const prefLower = pref.toLowerCase();
    const mappedFoods = RESTRICTION_MAPPINGS[prefLower];
    if (mappedFoods) {
      mappedFoods.forEach(food => {
        forbiddenTerms.push({ term: food, restriction: pref, severity: 'error' });
      });
    }
  });

  Object.entries(userRestrictions.strictExclusions || {}).forEach(([category, items]) => {
    const categoryFoods = RESTRICTION_MAPPINGS[category.toLowerCase()];
    if (categoryFoods) {
      categoryFoods.forEach(food => {
        forbiddenTerms.push({ term: food, restriction: `${category} dislike`, severity: 'warning' });
      });
    }
    (items || []).forEach(item => {
      forbiddenTerms.push({ term: item.toLowerCase(), restriction: `dislike: ${item}`, severity: 'warning' });
    });
  });

  (userRestrictions.foodAllergies || []).forEach(allergy => {
    const allergyLower = allergy.toLowerCase();
    forbiddenTerms.push({ term: allergyLower, restriction: `allergy: ${allergy}`, severity: 'error' });
    const mappedFoods = RESTRICTION_MAPPINGS[allergyLower];
    if (mappedFoods) {
      mappedFoods.forEach(food => {
        forbiddenTerms.push({ term: food, restriction: `allergy: ${allergy}`, severity: 'error' });
      });
    }
  });

  meals.forEach(meal => {
    const mealName = (meal.name || meal.dish || meal.description || '').toLowerCase();
    const ingredients = Array.isArray(meal.ingredients)
      ? meal.ingredients.map((item: string) => item.toLowerCase()).join(' ')
      : '';
    const searchText = `${mealName} ${ingredients}`;

    forbiddenTerms.forEach(({ term, restriction, severity }) => {
      if (searchText.includes(term)) {
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
  });

  return {
    valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
  };
}
