// Intelligent restaurant selection before expensive API calls
import { Restaurant } from '@/lib/external/places-client';
import { UserContext } from '@/lib/ai/prompts';

interface RestaurantScore {
  restaurant: Restaurant;
  score: number;
  reasoning: string;
}

export function selectOptimalRestaurants(
  restaurants: Restaurant[],
  userContext: UserContext,
  maxRestaurants: number = 5
): RestaurantScore[] {
  
  const scoredRestaurants = restaurants.map(restaurant => {
    let score = 0;
    let reasoning: string[] = [];

    // Base score from rating and price level
    score += (restaurant.rating || 0) * 10;
    reasoning.push(`${restaurant.rating}⭐ rating`);

    // Budget alignment
    const budgetAlignment = getBudgetAlignment(restaurant.priceLevel, userContext.surveyData.monthlyFoodBudget);
    score += budgetAlignment.score;
    reasoning.push(budgetAlignment.reason);

    // Goal-specific scoring
    const goalAlignment = getGoalAlignment(restaurant, userContext.surveyData.goal);
    score += goalAlignment.score;
    reasoning.push(goalAlignment.reason);

    // Chain category bonus (healthier vs moderate)
    if (restaurant.chainCategory === 'healthier') {
      score += 20;
      reasoning.push('verified healthy chain');
    } else if (restaurant.chainCategory === 'moderate') {
      score += 10;
      reasoning.push('moderate healthy options');
    }

    // Cuisine preference alignment
    const cuisineBonus = getCuisineAlignment(restaurant, userContext.surveyData.preferredCuisines || []);
    score += cuisineBonus.score;
    if (cuisineBonus.score > 0) reasoning.push(cuisineBonus.reason);

    return {
      restaurant,
      score,
      reasoning: reasoning.join(', ')
    };
  });

  // Sort by score and return top N
  return scoredRestaurants
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRestaurants);
}

function getBudgetAlignment(priceLevel: number, monthlyFoodBudget: number): { score: number; reason: string } {
  // Convert monthly budget to budget tier for existing logic
  let budgetTier: string;
  if (monthlyFoodBudget < 200) budgetTier = 'low';
  else if (monthlyFoodBudget < 400) budgetTier = 'medium';
  else if (monthlyFoodBudget < 600) budgetTier = 'high';
  else budgetTier = 'premium';

  const budgetMap = {
    'low': { optimal: [1, 2], acceptable: [3], avoid: [4] },
    'medium': { optimal: [2, 3], acceptable: [1, 4], avoid: [] },
    'high': { optimal: [3, 4], acceptable: [2], avoid: [1] },
    'premium': { optimal: [4], acceptable: [3], avoid: [1, 2] }
  };

  const budget = budgetMap[budgetTier as keyof typeof budgetMap] || budgetMap.medium;
  
  if (budget.optimal.includes(priceLevel)) {
    return { score: 15, reason: `perfect budget fit (${'$'.repeat(priceLevel)})` };
  }
  if (budget.acceptable.includes(priceLevel)) {
    return { score: 5, reason: `acceptable budget (${'$'.repeat(priceLevel)})` };
  }
  return { score: -10, reason: `budget mismatch (${'$'.repeat(priceLevel)})` };
}

function getGoalAlignment(restaurant: Restaurant, goal: string): { score: number; reason: string } {
  const chainName = restaurant.name.toLowerCase();
  
  if (goal === 'WEIGHT_LOSS') {
    // Prioritize chains known for lighter options
    if (['sweetgreen', 'freshii', 'saladworks'].some(name => chainName.includes(name))) {
      return { score: 25, reason: 'excellent for weight loss' };
    }
    if (['panera', 'subway'].some(name => chainName.includes(name))) {
      return { score: 15, reason: 'good lighter options' };
    }
  }
  
  if (goal === 'MUSCLE_GAIN') {
    // Prioritize chains with high-protein options
    if (['chipotle', 'qdoba', 'subway'].some(name => chainName.includes(name))) {
      return { score: 25, reason: 'excellent protein options' };
    }
    if (['panera', 'boston market'].some(name => chainName.includes(name))) {
      return { score: 15, reason: 'good protein choices' };
    }
  }

  if (goal === 'ENDURANCE') {
    // Prioritize balanced carb/protein options
    if (['noodles & company', 'panera'].some(name => chainName.includes(name))) {
      return { score: 20, reason: 'balanced carbs and protein' };
    }
  }

  return { score: 0, reason: 'standard options' };
}

function getCuisineAlignment(restaurant: Restaurant, preferredCuisines: string[]): { score: number; reason: string } {
  if (preferredCuisines.length === 0) return { score: 0, reason: '' };

  const restaurantCuisine = restaurant.cuisine.toLowerCase();
  const matchingCuisine = preferredCuisines.find(pref => 
    restaurantCuisine.includes(pref.toLowerCase()) || 
    pref.toLowerCase().includes(restaurantCuisine)
  );

  if (matchingCuisine) {
    return { score: 10, reason: `matches ${matchingCuisine} preference` };
  }

  return { score: 0, reason: '' };
}

// Helper function to log selection reasoning
export function logRestaurantSelection(selectedRestaurants: RestaurantScore[], userContext: UserContext): void {
  console.log(`[Restaurant-Selector] Selected ${selectedRestaurants.length} restaurants for ${userContext.surveyData.goal}:`);
  selectedRestaurants.forEach((scored, index) => {
    console.log(`  ${index + 1}. ${scored.restaurant.name} (score: ${scored.score.toFixed(1)}) - ${scored.reasoning}`);
  });
}
