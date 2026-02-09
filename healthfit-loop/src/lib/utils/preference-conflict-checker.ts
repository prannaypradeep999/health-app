export interface PreferenceConflict {
  preference: string;
  restriction: string;
  reason: string;
  severity: 'error' | 'warning';
}

const DIET_EXCLUSIONS: Record<string, string[]> = {
  vegetarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'salmon', 'tuna', 'shrimp', 'bacon', 'ham'],
  vegan: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'salmon', 'egg', 'eggs', 'milk', 'cheese', 'yogurt', 'butter', 'honey'],
  'gluten-free': ['bread', 'pasta', 'wheat', 'flour', 'bagel', 'tortilla'],
  'dairy-free': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'ice cream'],
  pescatarian: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham'],
  keto: ['bread', 'pasta', 'rice', 'potato', 'sugar', 'fruit juice'],
  paleo: ['bread', 'pasta', 'rice', 'oats', 'quinoa', 'beans', 'lentils', 'peanuts', 'dairy', 'cheese', 'milk'],
  halal: ['pork', 'bacon', 'ham', 'alcohol', 'wine', 'beer'],
  kosher: ['pork', 'bacon', 'ham', 'shellfish'],
};


export function checkPreferenceConflicts(
  preferredFoods: string[],
  dietPrefs: string[],
  strictExclusions: Record<string, string[]>,
  foodAllergies: string[]
): PreferenceConflict[] {
  const conflicts: PreferenceConflict[] = [];
  const preferredLower = preferredFoods.map(f => f.toLowerCase());

  dietPrefs.forEach(diet => {
    const dietLower = diet.toLowerCase();
    const excludedByDiet = DIET_EXCLUSIONS[dietLower] || [];

    preferredLower.forEach(food => {
      if (excludedByDiet.some(excluded => food.includes(excluded) || excluded.includes(food))) {
        conflicts.push({
          preference: food,
          restriction: diet,
          reason: `"${food}" is not compatible with ${diet} diet`,
          severity: 'error',
        });
      }
    });
  });

  Object.entries(strictExclusions).forEach(([category, items]) => {
    // Only check against actually selected exclusions, not all available options
    (items || []).forEach(excludedItem => {
      const excludedLower = excludedItem.toLowerCase();
      if (preferredLower.some(food => food.includes(excludedLower) || excludedLower.includes(food))) {
        conflicts.push({
          preference: excludedItem,
          restriction: `excluded item`,
          reason: `"${excludedItem}" is listed in both preferred foods and dislikes`,
          severity: 'warning',
        });
      }
    });
  });

  foodAllergies.forEach(allergy => {
    const allergyLower = allergy.toLowerCase();
    if (preferredLower.some(food => food.includes(allergyLower) || allergyLower.includes(food))) {
      conflicts.push({
        preference: allergy,
        restriction: `allergy: ${allergy}`,
        reason: `"${allergy}" is listed as both preferred and an allergy - please remove from preferences`,
        severity: 'error',
      });
    }
  });

  return conflicts;
}
