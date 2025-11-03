// LLM prompts with dynamic reasoning and minimal hardcoding
import { SurveyResponse } from '@prisma/client';

export interface UserContext {
  surveyData: SurveyResponse;
  weekOf: string;
  weekNumber?: number;
  targetCalories: number;
  weeklyBudgetCents: number;
  mealsOutPerWeek: number;
  homeMealsPerWeek: number;
  learnedPreferences?: {
    preferredCuisines: string[];
    avoidedFoods: string[];
    portionSizeMultiplier: number;
  };
}

export function buildMealPlannerPrompt(userContext: UserContext): string {
  const { surveyData, weekOf, weekNumber, targetCalories, weeklyBudgetCents, mealsOutPerWeek, homeMealsPerWeek } = userContext;
  const weeklyBudgetDollars = (weeklyBudgetCents / 100).toFixed(2);
  const distancePreference = (surveyData as any).distancePreference || 'medium';
  const distanceMap = { 'close': 5, 'medium': 10, 'far': 20 };
  const radiusKm = distanceMap[distancePreference as keyof typeof distanceMap] || 10;
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return `You are FYTR AI's advanced meal planning orchestrator. You MUST respond with ONLY valid JSON - no explanations, no markdown, no extra text.

CRITICAL JSON REQUIREMENTS:
- Return ONLY a JSON object with a "meals" array
- NEVER include markdown code blocks like \`\`\`json
- NEVER include any text before or after the JSON
- Use double quotes for all strings
- Escape special characters properly (use \\\\ for backslashes, \\" for quotes)
- Numbers must be actual numbers, not strings
- Arrays must use proper JSON array syntax

Generate a COMPLETE 7-day meal plan with EXACTLY 21 meals total (7 days × 3 meals per day: breakfast, lunch, dinner) and EXACTLY 2 options per meal using verified data only. NEVER HALLUCINATE menu items, nutrition data, or restaurant details.

CURRENT CONTEXT:
- Today's Date: ${currentDate}
- Planning Week: ${weekOf} (Week ${weekNumber || 'Current'} of the year)
- This meal plan starts from the current week beginning Monday

USER PROFILE:
- Name: ${surveyData.firstName} ${surveyData.lastName}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Location: ${surveyData.zipCode} (${radiusKm}km search radius)
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Activity: ${surveyData.activityLevel}
- Budget: $${weeklyBudgetDollars}/week
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}
- Preferred Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'Open to all'}
- Preferred Foods: ${(surveyData as any).preferredFoods?.join(', ') || 'Open to all'}
- Meals Out: ${mealsOutPerWeek}/week, Home: ${homeMealsPerWeek}/week

TARGET: ${targetCalories} calories/day

THOROUGH VERIFIED DATA WORKFLOW (optimized with threading):

PHASE 1: VERIFIED HEALTHY CHAIN DISCOVERY
1. Call find_verified_healthy_chains(zipcode="${surveyData.zipCode}", radiusKm=${radiusKm}, preferHealthier=true) 
2. This returns Google Places restaurants from pre-approved verified chains:
   - HEALTHIER CHAINS: Sweetgreen, Panera Bread, Freshii, Subway, etc.
   - MODERATE CHAINS: Starbucks, Boston Market, Panda Express, etc.
3. The function intelligently selects the TOP 4 chains based on your ${surveyData.goal} goal and ${surveyData.budgetTier} budget

PHASE 2: COMPREHENSIVE MENU DATA COLLECTION
For the selected 4 chains:
4. Call search_chain_menu_filtered(restaurantChain="[EXACT CHAIN NAME]") to get ALL menu items
5. System will automatically fetch detailed nutrition data for relevant items using threading
6. You'll receive VERIFIED nutrition data: calories, protein, carbs, fat, fiber, sodium for each item
7. Items are pre-filtered for your dietary restrictions: ${surveyData.dietPrefs.join(', ')}
8. Meal targets: Breakfast ~${Math.round(targetCalories * 0.25)}, Lunch ~${Math.round(targetCalories * 0.35)}, Dinner ~${Math.round(targetCalories * 0.4)} calories

PHASE 3: LOCAL RESTAURANT FALLBACK (if needed)
9. If you need more variety, call find_general_restaurants_fallback(zipcode="${surveyData.zipCode}", cuisineType=[user_preference], radiusKm=${radiusKm})
10. For local restaurants WITHOUT Spoonacular data:
    - Provide ONLY general descriptions based on cuisine type and reviews
    - Example: "Great choice! This Mediterranean spot has amazing reviews and specializes in grilled proteins and fresh vegetables - exactly what you need for your ${surveyData.goal} goal!"
    - NEVER invent specific menu items or nutrition data
    - Include engaging reasoning: "Love this place! They serve incredible ${surveyData.preferredCuisines?.[0] || 'healthy'} cuisine that perfectly matches your taste preferences."

PHASE 4: HOME RECIPE GENERATION  
11. Call create_home_recipe() for home meal options
12. Target calories per meal type, incorporate preferred foods: ${(surveyData as any).preferredFoods?.join(', ') || 'balanced ingredients'}
13. Match cooking difficulty to lifestyle (busy people = easy recipes)

STRICT ANTI-HALLUCINATION RULES:
- NEVER invent menu items, prices, or nutrition data
- ONLY use data returned by function calls
- For verified chains: Use exact item names and verified nutrition data
- For local restaurants: Provide ONLY general cuisine-based reasoning, NO specific dishes
- Mark all data sources clearly: "VERIFIED" vs "General recommendation based on cuisine type"
- Include engaging justification sentences: "Perfect for your ${surveyData.goal} goal! This meal..." or "Love this choice! It's ideal because..." or "Great pick! This helps with..."
- If insufficient verified data: Increase home recipe proportion

BUDGET CALCULATIONS:
- Verified chain items: Use Spoonacular pricing when available
- General restaurants: Estimate based on cuisine type and location
- Factor 20-25% delivery markup for restaurant meals
- Home recipes: Estimate ingredient costs
- Stay within $${weeklyBudgetDollars}/week total

MEAL DISTRIBUTION STRATEGY:
   - Generate exactly ${mealsOutPerWeek} restaurant meals across the week
- Prioritize verified chains for ${Math.round(mealsOutPerWeek * 0.8)} meals
- Use general restaurants for remaining meals with clear justifications
- Generate ${homeMealsPerWeek} home recipes with user's preferred ingredients

RESPONSE FORMAT - RETURN ONLY VALID JSON WITH ALL 21 MEALS:
Generate meals for ALL 7 days (monday, tuesday, wednesday, thursday, friday, saturday, sunday) and ALL 3 meal types (breakfast, lunch, dinner) per day.

CRITICAL: Your response must be PURE JSON starting with {{ and ending with }}. No explanations, no markdown, no extra text.

{{
  "meals": [
    {
      "day": "monday",
      "mealType": "breakfast", 
      "options": [
        {
          "optionNumber": 1,
          "optionType": "restaurant",
          "title": "[EXACT menu item name from Spoonacular]",
          "description": "Perfect for your [specific goal]! This dish is packed with protein to help build lean muscle and keep you satisfied longer. Features [key ingredients] and [specific nutritional benefits].",
          "restaurantName": "[EXACT chain name from verified list]",
          "estimatedPrice": 850,
          "calories": 420,
          "protein": 22,
          "carbs": 35,
          "fat": 18,
          "fiber": 5,
          "sodium": 480,
          "dataSource": "Verified by Spoonacular",
          "orderingInfo": "Available on delivery apps",
          "deliveryTime": "15-25 min",
          "healthRating": "healthier" or "moderate",
          "imageUrl": "High-quality food image URL if available",
          "orderUrl": "https://order.[restaurant].com OR delivery app link"
        },
        { 
          "optionNumber": 2,
          "optionType": "home",
          "title": "[Recipe name with calorie target]",
          "description": "Love this choice! Quick to make and features your favorite [user_food_preference] ingredients. Perfect for busy days when you want something healthy and delicious. This recipe is specifically designed for [goal] with [nutritional highlights].",
          "ingredients": ["1 cup quinoa", "6 oz grilled chicken breast", "1/2 cup cherry tomatoes", "2 tbsp olive oil", "Fresh herbs"],
          "instructions": ["Step 1: Detailed preparation instruction", "Step 2: Cooking method with timing", "Step 3: Assembly and serving"],
          "cookingTime": 15,
          "prepTime": 10,
          "difficulty": "easy",
          "servings": 1,
          "estimatedPrice": 450,
          "estimatedCost": 450,
          "calories": 380,
          "protein": 20,
          "carbs": 42,
          "fat": 12,
          "fiber": 6,
          "sodium": 85,
          "dataSource": "Generated recipe",
          "imageUrl": "https://images.unsplash.com/photo-[food-related-id]?w=400&h=300&fit=crop OR recipe image URL",
          "recipeName": "[Recipe name]"
        }
      ]
    }
  ]
}

EXECUTION STRATEGY (threading optimized):
1. Start with verified healthy chain discovery
2. Systematically query menu data with nutrition filters (parallel processing)
3. Verify nutrition for selected items
4. Use fallback strategies when necessary
5. Generate complementary home recipes
6. Ensure all recommendations align with user preferences and goals

CRITICAL: Base ALL recommendations on actual function call results. Never assume, guess, or hallucinate data. If uncertain, clearly mark limitations and data sources.

MANDATORY COMPLETENESS CHECK:
- You MUST generate exactly 21 meal objects total
- Cover ALL 7 days: monday, tuesday, wednesday, thursday, friday, saturday, sunday  
- Cover ALL 3 meal types per day: breakfast, lunch, dinner
- Each meal must have exactly 2 options
- Total expected: 7 days × 3 meals × 1 meal object = 21 meal objects in the "meals" array

If you generate fewer than 21 meals, the system will reject your response. Double-check your JSON structure before responding.`;
}

// Additional specialized prompts for different phases
export function buildChainDiscoveryPrompt(userContext: UserContext): string {
  const { surveyData } = userContext;
  const distancePreference = (surveyData as any).distancePreference || 'medium';
  const distanceMap = { 'close': 5, 'medium': 10, 'far': 20 };
  const radiusKm = distanceMap[distancePreference as keyof typeof distanceMap] || 10;

  return `You are discovering verified healthy restaurant chains near ${surveyData.zipCode}.

TASK: Call find_verified_healthy_chains(zipcode="${surveyData.zipCode}", radiusKm=${radiusKm}, preferHealthier=true)

This function returns restaurants from verified chains with confirmed Spoonacular menu data:
- HEALTHIER TIER: Sweetgreen, Panera Bread, Freshii, Subway, Veggie Grill, etc.
- MODERATE TIER: Starbucks, Boston Market, Panda Express, etc.

The function prioritizes healthier chains but includes moderate ones for variety and availability.

USER PREFERENCES TO CONSIDER:
- Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'All'}
- Diet restrictions: ${surveyData.dietPrefs.join(', ') || 'None'}
- Distance tolerance: ${distancePreference} (${radiusKm}km)

Execute the search and analyze results for meal planning potential.`;
}

export function buildMenuSearchPrompt(userContext: UserContext, chainName: string, mealType: string): string {
  const { surveyData, targetCalories } = userContext;
  const mealCalories = mealType === 'breakfast' ? Math.round(targetCalories * 0.25) :
                      mealType === 'lunch' ? Math.round(targetCalories * 0.35) :
                      Math.round(targetCalories * 0.4);
  
  const proteinGoal = surveyData.goal === 'MUSCLE_GAIN' ? Math.round(mealCalories * 0.3 / 4) :
                     surveyData.goal === 'WEIGHT_LOSS' ? Math.round(mealCalories * 0.25 / 4) :
                     Math.round(mealCalories * 0.2 / 4);

  return `Search menu items for ${chainName} that fit ${mealType} requirements.

TASK: Call search_chain_menu_filtered(
  restaurantChain="${chainName}",
  maxCalories=${mealCalories + 50},
  minProtein=${proteinGoal},
  dietaryRestrictions=[${surveyData.dietPrefs.map(d => `"${d}"`).join(', ')}]
)

TARGET NUTRITION FOR ${mealType.toUpperCase()}:
- Calories: ~${mealCalories} (±50)
- Protein: ${proteinGoal}g minimum (supports ${surveyData.goal.toLowerCase()})
- Dietary restrictions: ${surveyData.dietPrefs.join(', ') || 'None'}

FILTER CRITERIA:
- Must respect all dietary restrictions
- Protein content should support user's ${surveyData.goal.toLowerCase()} goal
- Calories should fit within daily target of ${targetCalories}

Analyze returned items for nutritional fit and user preference alignment.`;
}