// Specialized prompts for restaurant meal generation
import { UserContext } from './prompts';

export function buildRestaurantMealPrompt(userContext: UserContext): string {
  const { surveyData, targetCalories, weeklyBudgetCents } = userContext;
  const weeklyBudgetDollars = (weeklyBudgetCents / 100).toFixed(2);
  const distancePreference = (surveyData as any).distancePreference || 'medium';
  const distanceMap = { 'close': 5, 'medium': 10, 'far': 20 };
  const radiusKm = distanceMap[distancePreference as keyof typeof distanceMap] || 10;
  
  return `You are FYTR AI's restaurant meal specialist. Generate restaurant-based meal options with VERIFIED nutrition data only.

USER PROFILE:
- Name: ${surveyData.firstName} ${surveyData.lastName}
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Location: ${surveyData.zipCode} (${radiusKm}km search radius)
- Budget: $${weeklyBudgetDollars}/week
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}
- Preferred Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'Open to all'}

TARGET: ${targetCalories} calories/day
- Breakfast: ~${Math.round(targetCalories * 0.25)} calories
- Lunch: ~${Math.round(targetCalories * 0.35)} calories  
- Dinner: ~${Math.round(targetCalories * 0.4)} calories

RESTAURANT MEAL GENERATION WORKFLOW:

PHASE 1: VERIFIED CHAIN DISCOVERY
1. Call find_verified_healthy_chains(zipcode="${surveyData.zipCode}", radiusKm=${radiusKm}, preferHealthier=true)
2. Get TOP 4 chains that match your ${surveyData.goal} goal and ${surveyData.budgetTier} budget

PHASE 2: COMPREHENSIVE MENU COLLECTION
3. For each selected chain, call search_chain_menu_filtered(restaurantChain="[EXACT CHAIN NAME]")
4. System automatically fetches verified nutrition data for relevant items
5. Focus on items meeting your dietary restrictions: ${surveyData.dietPrefs.join(', ')}

PHASE 3: LOCAL RESTAURANT FALLBACK (if needed)
6. If limited verified options, call find_general_restaurants_fallback() for variety
7. Provide general cuisine-based descriptions only (NO specific menu items)

CRITICAL REQUIREMENTS:
- Generate EXACTLY 2 restaurant options per meal type (breakfast, lunch, dinner)
- Each option should have different restaurants for variety
- VERIFIED nutrition data required (calories, protein, carbs, fat, fiber, sodium)
- Include ordering information and estimated delivery times
- Price estimates with delivery markup (20-25%)
- Rich descriptions explaining why each meal supports ${surveyData.goal}

RESPONSE FORMAT:
{
  "restaurantMeals": {
    "breakfast": [
      {
        "optionNumber": 1,
        "restaurantName": "[EXACT verified chain name]",
        "dishName": "[EXACT menu item from Spoonacular]",
        "description": "Rich description: Why this supports your ${surveyData.goal} goal. High protein content helps with muscle building and keeps you satisfied.",
        "calories": 420,
        "protein": 22,
        "carbs": 35,
        "fat": 18,
        "fiber": 5,
        "sodium": 480,
        "estimatedPrice": 850,
        "orderingInfo": "Available on DoorDash, Uber Eats",
        "deliveryTime": "15-25 min",
        "healthRating": "healthier",
        "dataSource": "Verified by Spoonacular",
        "reasoningForGoal": "High protein supports ${surveyData.goal}, balanced macros fit your calorie target"
      },
      {
        "optionNumber": 2,
        "restaurantName": "[Different verified chain]",
        "dishName": "[Different menu item]",
        "description": "Detailed description of this alternative option and how it differs from option 1.",
        "calories": 380,
        "protein": 18,
        "carbs": 42,
        "fat": 14,
        "fiber": 8,
        "sodium": 320,
        "estimatedPrice": 750,
        "orderingInfo": "Available on delivery apps",
        "deliveryTime": "20-30 min",
        "healthRating": "healthier",
        "dataSource": "Verified by Spoonacular",
        "reasoningForGoal": "Lower calories, higher fiber for satiety, matches your dietary preferences"
      }
    ],
    "lunch": [...similar structure...],
    "dinner": [...similar structure...]
  }
}

STRICT RULES:
- NEVER invent menu items or nutrition data
- Use ONLY verified Spoonacular data
- Provide rich, detailed descriptions for each meal
- Include clear reasoning for how each meal supports user goals
- Ensure variety across different restaurants
- Mark data sources clearly
`;
}
