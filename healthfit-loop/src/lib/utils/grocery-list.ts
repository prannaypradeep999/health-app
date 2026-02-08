export type GroceryPerishability = 'high' | 'medium' | 'low';

export interface GroceryUsage {
  day: string;
  meal: string;
  dishName: string;
}

export interface GroceryItem {
  name: string;
  quantity: string;
  unit?: string;
  category: string;
  uses?: string;
  usedInMeals: GroceryUsage[];
  firstUseDay: string;
  perishability: GroceryPerishability;
}

const PERISHABILITY: Record<string, GroceryPerishability> = {
  // HIGH - Use within 2-3 days
  chicken: 'high',
  beef: 'high',
  fish: 'high',
  salmon: 'high',
  shrimp: 'high',
  'ground beef': 'high',
  'ground turkey': 'high',
  'fresh herbs': 'high',
  cilantro: 'high',
  parsley: 'high',
  basil: 'high',
  berries: 'high',
  strawberries: 'high',
  raspberries: 'high',
  lettuce: 'high',
  spinach: 'high',
  'mixed greens': 'high',
  avocado: 'high',
  banana: 'high',
  milk: 'high',
  cream: 'high',
  yogurt: 'high',

  // MEDIUM - Use within 5-7 days
  eggs: 'medium',
  cheese: 'medium',
  tofu: 'medium',
  'bell pepper': 'medium',
  broccoli: 'medium',
  carrots: 'medium',
  zucchini: 'medium',
  tomatoes: 'medium',
  cucumber: 'medium',
  mushrooms: 'medium',
  apples: 'medium',
  oranges: 'medium',
  grapes: 'medium',
  butter: 'medium',
  bread: 'medium',

  // LOW - Shelf stable
  rice: 'low',
  pasta: 'low',
  oats: 'low',
  quinoa: 'low',
  'olive oil': 'low',
  'vegetable oil': 'low',
  'soy sauce': 'low',
  vinegar: 'low',
  honey: 'low',
  'maple syrup': 'low',
  'canned beans': 'low',
  'canned tomatoes': 'low',
  nuts: 'low',
  almonds: 'low',
  'peanut butter': 'low',
  spices: 'low',
  salt: 'low',
  pepper: 'low',
  garlic: 'low',
  onion: 'low',
  potato: 'low',
  'sweet potato': 'low',
};

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const UNITS = new Set([
  'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams',
  'kg', 'ml', 'l', 'liter', 'liters', 'clove', 'cloves', 'slice', 'slices', 'can',
  'cans', 'package', 'packages', 'bag', 'bags', 'pinch', 'dash', 'pieces', 'piece'
]);

const SIZE_WORDS = new Set(['small', 'medium', 'large', 'extra-large', 'xl']);

export function getPerishability(ingredient: string): GroceryPerishability {
  const lower = ingredient.toLowerCase();
  for (const [key, value] of Object.entries(PERISHABILITY)) {
    if (lower.includes(key)) {
      return value;
    }
  }
  return 'low';
}

function isQuantityToken(token: string): boolean {
  return /^[\d/.+-]+$/.test(token);
}

export function extractIngredientName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleaned.split(' ');
  let index = 0;

  while (index < parts.length && (isQuantityToken(parts[index]) || UNITS.has(parts[index]))) {
    index += 1;
  }

  if (parts[index] === 'of') {
    index += 1;
  }

  if (SIZE_WORDS.has(parts[index])) {
    index += 1;
  }

  const name = parts.slice(index).join(' ').trim();
  return name || cleaned;
}

export function normalizeGroceryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getUsageMap(homeMeals: any[]): Map<string, GroceryUsage[]> {
  const usageMap = new Map<string, GroceryUsage[]>();

  homeMeals.forEach((meal) => {
    const day = (meal.day || '').toLowerCase();
    const mealType = meal.mealType || 'meal';
    const dishName = meal.primary?.name || meal.name || 'Meal';
    const ingredients = meal.primary?.ingredients || [];

    if (!day || !Array.isArray(ingredients)) return;

    ingredients.forEach((ingredient: string) => {
      const name = extractIngredientName(ingredient);
      const key = normalizeGroceryKey(name);
      if (!key) return;
      const entry = usageMap.get(key) || [];
      entry.push({ day, meal: mealType, dishName });
      usageMap.set(key, entry);
    });
  });

  return usageMap;
}

function getFirstUseDay(usages: GroceryUsage[]): string {
  if (!usages.length) return 'unknown';
  const sorted = [...usages].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)
  );
  return sorted[0]?.day || 'unknown';
}

function findUsageForItem(
  usageMap: Map<string, GroceryUsage[]>,
  itemName: string
): GroceryUsage[] {
  const key = normalizeGroceryKey(itemName);
  if (usageMap.has(key)) return usageMap.get(key) || [];

  for (const [usageKey, usages] of usageMap.entries()) {
    if (usageKey.includes(key) || key.includes(usageKey)) {
      return usages;
    }
  }

  return [];
}

export function enhanceGroceryListWithUsage(
  groceryList: Record<string, any>,
  homeMeals: any[]
): Record<string, any> {
  if (!groceryList || !homeMeals?.length) return groceryList;

  const usageMap = getUsageMap(homeMeals);
  const categories = ['proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'snacks'];

  const enhanced: Record<string, any> = { ...groceryList };
  categories.forEach((category) => {
    const items = groceryList[category];
    if (!Array.isArray(items)) return;

    enhanced[category] = items.map((item: any) => {
      const name = item.name || item.item || 'Unknown item';
      const usages = findUsageForItem(usageMap, name);
      return {
        ...item,
        usedInMeals: usages,
        firstUseDay: getFirstUseDay(usages),
        perishability: getPerishability(name)
      };
    });
  });

  return enhanced;
}

export function buildFallbackGroceryList(homeMeals: any[]): Record<string, any> {
  const usageMap = getUsageMap(homeMeals);
  const categorized: Record<string, GroceryItem[]> = {
    proteins: [],
    vegetables: [],
    grains: [],
    dairy: [],
    pantryStaples: [],
    snacks: []
  };

  usageMap.forEach((usages, key) => {
    const name = key;
    const item: GroceryItem = {
      name,
      quantity: 'varies',
      category: 'pantryStaples',
      usedInMeals: usages,
      firstUseDay: getFirstUseDay(usages),
      perishability: getPerishability(name)
    };

    categorized.pantryStaples.push(item);
  });

  return categorized;
}
