// Step 2: Menu Item Selection from Spoonacular Data
import { UserContext } from './prompts';
import { PROMPT_CONFIG } from '../config/meal-planning';

export function buildMenuSelectionPrompt(userContext: UserContext, restaurantMenuData: any[], localRestaurants: any[]): string {
  const { surveyData, targetCalories } = userContext;
  
  // Format verified menu data for the prompt
  const formattedMenus = restaurantMenuData.map(restaurant => {
    return `
🏪 ${restaurant.restaurantName} (${restaurant.totalItems} verified menu items available):
${restaurant.items.map((item: any) => 
  `  • ID: ${item.id} | ${item.title} | ${item.servings?.size || 'N/A'} ${item.servings?.unit || ''}`
).join('\n')}
`;
  }).join('\n');

  // Format local restaurants (no specific menu items)
  const formattedLocalRestaurants = localRestaurants.map(restaurant => {
    return `
🏪 ${restaurant.name} (LOCAL - No verified menu data):
  • Cuisine: ${restaurant.cuisineMatch}
  • Reasoning: ${restaurant.reasoning}
  • Price Range: ${restaurant.estimatedPriceRange}
  • Location: ${restaurant.location}
`;
  }).join('\n');

  return `You are FYTR AI's menu curation specialist. Your job is to select the best menu items from verified restaurant data to create a week-long meal plan focused on lunch and dinner.

USER PROFILE:
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Target Calories: ${targetCalories}/day (lunch ~${Math.round(targetCalories * 0.35)}, dinner ~${Math.round(targetCalories * 0.4)})
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}
- Preferred Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'Open to all'}
- Budget Tier: ${surveyData.budgetTier}

VERIFIED MENU DATA:
${formattedMenus}

LOCAL RESTAURANTS (No specific menu items - general recommendations only):
${formattedLocalRestaurants}

SELECTION CRITERIA:

MEAL FOCUS:
- PRIMARY: Lunch and dinner (these should get most calories and variety)
- SECONDARY: Breakfast (lighter, can be simpler options)

CALORIE TARGETS PER MEAL:
- Breakfast: ~${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.breakfast)} calories (${Math.round(PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.breakfast * 100)}%)
- Lunch: ~${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.lunch)} calories (${Math.round(PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.lunch * 100)}% - MAIN FOCUS)
- Dinner: ~${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.dinner)} calories (${Math.round(PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.dinner * 100)}% - MAIN FOCUS)

GOAL-SPECIFIC SELECTION:
${surveyData.goal === 'WEIGHT_LOSS' ? '- Weight Loss: Prioritize high protein, moderate carbs, fiber-rich options' : ''}
${surveyData.goal === 'MUSCLE_GAIN' ? '- Muscle Gain: Prioritize high protein, complex carbs, nutrient-dense options' : ''}
${surveyData.goal === 'ENDURANCE' ? '- Endurance: Prioritize balanced carbs, lean proteins, anti-inflammatory foods' : ''}

DIETARY FILTERING:
${surveyData.dietPrefs.includes('vegetarian') ? '- VEGETARIAN: Exclude all meat and fish items' : ''}
${surveyData.dietPrefs.includes('vegan') ? '- VEGAN: Exclude all animal products (meat, dairy, eggs)' : ''}
${surveyData.dietPrefs.includes('paleo') ? '- PALEO: Focus on whole foods, exclude grains and processed items' : ''}
${surveyData.dietPrefs.includes('keto') ? '- KETO: Prioritize very low carb options' : ''}

ITEM SELECTION STRATEGY:
1. Filter out obvious single ingredients and condiments (oils, dressings, single vegetables)
2. Focus on complete meals: bowls, salads, sandwiches, entrees
3. Select items that likely fit calorie targets (avoid tiny items <200 cal or huge items >800 cal)
4. Ensure variety across restaurants and meal types
5. Consider preparation style (grilled > fried for health goals)

WEEKLY PLAN STRUCTURE:
- ${PROMPT_CONFIG.DAYS_PER_WEEK} days × ${PROMPT_CONFIG.MEALS_PER_DAY} meals = ${PROMPT_CONFIG.DAYS_PER_WEEK * PROMPT_CONFIG.MEALS_PER_DAY} total meals
- Each meal should have ${PROMPT_CONFIG.OPTIONS_PER_MEAL} options for variety
- Focus variety and quality on lunch and dinner
- Breakfast can be simpler/repeated options

RESPONSE FORMAT:
{{
  "selectedMenuItems": {{
    "verifiedItems": {{
      "breakfast": [
        {{
          "itemId": 364027,
          "restaurantName": "Sweetgreen",
          "itemTitle": "Citrus Shrimp",
          "estimatedCalories": "200-300",
          "reasoning": "Light protein option, good for morning energy without being too heavy",
          "targetMeals": ["Monday Breakfast", "Wednesday Breakfast"],
          "hasVerifiedNutrition": true
        }}
      ],
      "lunch": [
        {{
          "itemId": 363992,
          "restaurantName": "Sweetgreen", 
          "itemTitle": "Earth Bowl",
          "estimatedCalories": "400-600",
          "reasoning": "Nutrient-dense bowl, high protein for ${surveyData.goal} goals, balanced macros",
          "targetMeals": ["Monday Lunch", "Thursday Lunch"],
          "hasVerifiedNutrition": true
        }
      ],
      "dinner": [
        {{
          "itemId": 123456,
          "restaurantName": "Panera Bread",
          "itemTitle": "Mediterranean Bowl",
          "estimatedCalories": "${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.dinner)}-${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.dinner * 1.2)}",
          "reasoning": "Higher calorie dinner option, ${surveyData.preferredCuisines?.[0] || 'Mediterranean'} flavors align with user preferences and ${surveyData.goal} goals",
          "targetMeals": ["Monday Dinner", "Friday Dinner"],
          "hasVerifiedNutrition": true
        }}
      ]
    }},
    "localRestaurantMeals": {{
      "lunch": [
        {{
          "restaurantName": "Local ${surveyData.preferredCuisines?.[0] || 'Mediterranean'} Grill",
          "generalDescription": "Grilled protein with vegetables and whole grains",
          "estimatedCalories": "${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.lunch)}-${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.lunch * 1.3)}",
          "reasoning": "${surveyData.preferredCuisines?.[0] || 'Mediterranean'} cuisine typically offers lean proteins and anti-inflammatory ingredients perfect for ${surveyData.goal} goals",
          "targetMeals": ["Tuesday Lunch", "Friday Lunch"],
          "hasVerifiedNutrition": false,
          "generalGuidance": "Look for ${surveyData.dietPrefs.includes('vegetarian') ? 'plant-based proteins like tofu' : 'grilled chicken or fish'} with quinoa and vegetables. ${surveyData.dietPrefs.includes('keto') ? 'Ask for extra vegetables instead of grains.' : 'Ask for olive oil-based dressings.'}"
        }}
      ],
      "dinner": [
        {{
          "restaurantName": "Local ${surveyData.preferredCuisines?.[1] || 'Italian'} Bistro",
          "generalDescription": "${surveyData.dietPrefs.includes('keto') ? 'Grilled protein with vegetables' : 'Pasta with lean protein and vegetables'}",
          "estimatedCalories": "${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.dinner)}-${Math.round(targetCalories * PROMPT_CONFIG.MEAL_CALORIE_DISTRIBUTION.dinner * 1.3)}",
          "reasoning": "${surveyData.preferredCuisines?.[1] || 'Italian'} cuisine can support ${surveyData.goal} when choosing ${surveyData.dietPrefs.includes('vegetarian') ? 'plant-based proteins' : 'grilled proteins'} and vegetable-rich sauces",
          "targetMeals": ["Wednesday Dinner"],
          "hasVerifiedNutrition": false,
          "generalGuidance": "Choose ${surveyData.dietPrefs.includes('vegetarian') ? 'eggplant or legume-based dishes' : 'grilled chicken or fish'} ${surveyData.dietPrefs.includes('keto') ? 'with vegetables instead of pasta' : 'pasta with marinara or olive oil base'}. Add extra vegetables."
        }}
      ]
    }}
  }},
  "selectionSummary": {{
    "verifiedItems": 12,
    "localRecommendations": 8,
    "totalMealOptions": 20,
    "restaurantDistribution": {{
      "Sweetgreen": 6,
      "Panera Bread": 4,
      "Local ${surveyData.preferredCuisines?.[0] || 'Mediterranean'}": 4,
      "Local ${surveyData.preferredCuisines?.[1] || 'Italian'}": 3,
      "Local ${surveyData.preferredCuisines?.[2] || 'Asian'}": 3
    }},
    "nextStep": "Fetch detailed nutrition data for verified items only, create general meal descriptions for local restaurants"
  }}
}}

CRITICAL REQUIREMENTS FOR VERIFIED ITEMS:
- Select only items that exist in the provided verified menu data
- Use exact item IDs and titles from the Spoonacular data
- Focus on complete meals, not individual ingredients

CRITICAL REQUIREMENTS FOR LOCAL RESTAURANTS:
- NEVER invent specific menu items or dish names
- Provide only general cuisine-based descriptions ("grilled protein with vegetables")
- Base recommendations on cuisine type and general healthy options
- Include practical guidance for ordering healthy options
- Mark clearly as "not verified nutrition"

GENERAL REQUIREMENTS:
- Provide clear reasoning for each selection based on user goals
- Ensure variety across the week but allow some repetition of good options
- Prioritize lunch and dinner for calories and variety
- Consider dietary restrictions strictly
- Balance verified nutrition data with local variety

EXECUTION: Analyze verified menu data for specific items, create general healthy guidance for local restaurants, ensure balanced weekly distribution.`;
}

// No function calling needed for this step - it's pure menu analysis
