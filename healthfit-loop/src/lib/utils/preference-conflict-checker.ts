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

const CATEGORY_ITEMS: Record<string, string[]> = {
  proteins: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'salmon', 'tuna', 'shrimp', 'tofu'],
  dairy: ['milk', 'cheese', 'yogurt'],
  fruits: ['apple', 'banana', 'grape', 'mango'],
  vegetables: ['broccoli', 'spinach', 'mushroom', 'onion'],
  other: ['spicy', 'raw fish', 'cilantro'],
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
    const categoryItems = CATEGORY_ITEMS[category.toLowerCase()] || [];
    preferredLower.forEach(food => {
      if (categoryItems.some(item => food.includes(item) || item.includes(food))) {
        conflicts.push({
          preference: food,
          restriction: `${category} exclusion`,
          reason: `"${food}" is listed as a dislike in ${category}`,
          severity: 'warning',
        });
      }
    });

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
