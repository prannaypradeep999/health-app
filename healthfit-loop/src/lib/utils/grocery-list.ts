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
    // A meal option carries both `ingredients` (display strings) and
    // `ingredientsWithNutrition` (objects). Reading only the first meant a meal
    // that lost it produced no grocery entries at all — the same wrong-field
    // failure A3 found in isUsableMeal.
    const ingredients: any[] = Array.isArray(meal.primary?.ingredients) && meal.primary.ingredients.length
      ? meal.primary.ingredients
      : (meal.primary?.ingredientsWithNutrition || []);

    if (!day || !Array.isArray(ingredients)) return;

    ingredients.forEach((ingredient: any) => {
      const raw = typeof ingredient === 'string' ? ingredient : (ingredient?.name || '');
      const name = extractIngredientName(raw);
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

/**
 * The six keys that hold shopping items. Duplicated from
 * `grocery-consolidation.ts` rather than imported: that module reaches OpenAI at
 * import time via its prompt/model imports, and this one is pure and is imported
 * by React components.
 */
const GROCERY_CATEGORY_KEYS = [
  'proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'snacks',
] as const;

export type GroceryCategory =
  | 'proteins' | 'vegetables' | 'grains' | 'dairy' | 'pantryStaples' | 'snacks';

// Order is load-bearing. `dairy` before `grains` so "cream cheese" does not fall
// through; `proteins` first because "chicken broth" is more useful shelved with
// proteins than with pantry staples. This is a heuristic on a fallback path — it
// does not need to be right about "xanthan gum", it needs to stop putting
// chicken and spinach in the same bucket.
const CATEGORY_TERMS: Array<[GroceryCategory, string[]]> = [
  ['proteins', ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'salmon', 'tuna', 'shrimp',
    'cod', 'tilapia', 'egg', 'tofu', 'tempeh', 'seitan', 'lentil', 'chickpea',
    'black bean', 'kidney bean', 'steak', 'bacon', 'sausage', 'ground']],
  ['dairy', ['milk', 'yogurt', 'cheese', 'butter', 'cream', 'feta', 'mozzarella',
    'parmesan', 'cheddar', 'ricotta', 'cottage']],
  ['grains', ['rice', 'quinoa', 'oat', 'pasta', 'bread', 'tortilla', 'couscous',
    'barley', 'farro', 'noodle', 'bagel', 'cereal', 'flour']],
  ['vegetables', ['spinach', 'kale', 'broccoli', 'carrot', 'onion', 'garlic', 'pepper',
    'tomato', 'cucumber', 'lettuce', 'zucchini', 'mushroom', 'potato',
    'cauliflower', 'asparagus', 'celery', 'cabbage', 'avocado', 'apple',
    'banana', 'berry', 'berries', 'lemon', 'lime', 'orange', 'peas', 'corn']],
  ['snacks', ['chip', 'cracker', 'granola bar', 'popcorn', 'pretzel', 'trail mix']],
];

export function categorizeGroceryItem(name: string): GroceryCategory {
  const n = (name || '').toLowerCase();
  if (!n) return 'pantryStaples';
  for (const [category, terms] of CATEGORY_TERMS) {
    if (terms.some(term => n.includes(term))) return category;
  }
  return 'pantryStaples';
}

export function buildFallbackGroceryList(homeMeals: any[]): Record<string, any> {
  const usageMap = getUsageMap(homeMeals);
  const categorized: Record<string, GroceryItem[]> = {
    proteins: [], vegetables: [], grains: [], dairy: [], pantryStaples: [], snacks: [],
  };

  usageMap.forEach((usages, name) => {
    const category = categorizeGroceryItem(name);
    categorized[category].push({
      name,
      // No amounts survive the usage map, so quantity is the honest count of
      // meals the item appears in rather than the placeholder 'varies'. A count
      // is at least actionable at the shelf; 'varies' never was.
      quantity: usages.length === 1 ? '1 meal' : `${usages.length} meals`,
      category,
      usedInMeals: usages,
      firstUseDay: getFirstUseDay(usages),
      perishability: getPerishability(name),
    });
  });

  return categorized;
}

/**
 * The grocery list as a flat list of shopping names.
 *
 * The recipe modal wanted this and asked for `groceryList.items`, a key the
 * persisted list has never had — items live under the six category arrays, and
 * `stores` / `storeTotals` sit beside them holding objects with a `name` too.
 * So this reads the categories by name rather than every array it finds, which
 * is what stops "Safeway" being offered to the model as an ingredient.
 *
 * Deduplicated case-insensitively, first spelling kept: "Olive oil" in
 * pantryStaples and "olive oil" in proteins is one thing to buy, and the prompt
 * that receives this renders one bullet per entry.
 */
export function flattenGroceryItemNames(groceryList: unknown): string[] {
  if (!groceryList || typeof groceryList !== 'object') return [];
  const list = groceryList as Record<string, unknown>;
  const seen = new Set<string>();
  const names: string[] = [];

  for (const category of GROCERY_CATEGORY_KEYS) {
    const items = list[category];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const raw = (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).item;
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }

  return names;
}
