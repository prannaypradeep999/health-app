// src/lib/config/meal-planning.ts - Required configuration file
export const HEALTHIER_CHAINS = [
  'Sweetgreen',
  'Chipotle',
  'Panera Bread',
  'Subway',
  'Pret A Manger',
  'Tender Greens',
  'Just Salad',
  'Freshii'
];

export const MODERATE_CHAINS = [
  'Qdoba',
  'Panda Express',
  'Noodles & Company',
  'Blaze Pizza',
  'Five Guys',
  'Shake Shack',
  'In-N-Out Burger'
];

export const ALL_VERIFIED_CHAINS = [...HEALTHIER_CHAINS, ...MODERATE_CHAINS];

export const PROMPT_CONFIG = {
  // Meal distribution
  MEAL_CALORIE_DISTRIBUTION: {
    breakfast: 0.25,
    lunch: 0.35,
    dinner: 0.4
  },
  
  // Plan structure
  DAYS_PER_WEEK: 7,
  MEALS_PER_DAY: 3,
  OPTIONS_PER_MEAL: 3, // 2 restaurant + 1 home-cooked
  
  // Restaurant limits
  TARGET_TOTAL_RESTAURANTS: 6,
  MAX_VERIFIED_CHAINS: 4,
  MAX_LOCAL_RESTAURANTS: 4,
  MAX_MENU_ITEMS_PER_CHAIN: 20,
  
  // Distance mapping
  DISTANCE_MAP: {
    'close': 5,
    'medium': 10, 
    'far': 20
  },
  DEFAULT_RADIUS: 10,
  
  // Function call limits
  MAX_FUNCTION_CALLS: 8
};

// Helper function to match restaurant names to verified chains
export function getMatchingChain(restaurantName: string): { name: string; category: 'healthier' | 'moderate' } | null {
  const normalized = restaurantName.toLowerCase().trim();
  
  for (const chain of HEALTHIER_CHAINS) {
    const chainNormalized = chain.toLowerCase().trim();
    if (normalized.includes(chainNormalized) || chainNormalized.includes(normalized)) {
      return { name: chain, category: 'healthier' };
    }
  }
  
  for (const chain of MODERATE_CHAINS) {
    const chainNormalized = chain.toLowerCase().trim();
    if (normalized.includes(chainNormalized) || chainNormalized.includes(normalized)) {
      return { name: chain, category: 'moderate' };
    }
  }
  
  return null;
}