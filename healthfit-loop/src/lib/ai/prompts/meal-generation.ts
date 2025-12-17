import { SurveyResponse } from '@prisma/client';

// Types for prompt functions
export interface Restaurant {
  name: string;
  cuisine: string;
  rating: number;
  priceLevel: number;
  address: string;
  placeId: string;
  city: string;
  zipCode?: string;
  description?: string;
}

export interface MenuExtractionContext {
  restaurantName: string;
  restaurantCuisine: string;
  restaurantCity: string;
  content: string;
  currentHour: number;
  now: Date;
}

// Restaurant Selection Prompts
export const createRestaurantSelectionPrompt = (restaurants: Restaurant[], surveyData: SurveyResponse): string => {
  return `You are a health-focused meal planning assistant. Analyze the following restaurants and select the best 5 that match the user's health goals and dietary preferences.

USER PROFILE:
- Goal: ${surveyData.goal}
- Dietary Preferences: ${(surveyData.dietPrefs || []).join(', ') || 'None specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Monthly Food Budget: $${surveyData.monthlyFoodBudget || 200}
- Distance Preference: ${surveyData.distancePreference}

RESTAURANTS TO CHOOSE FROM:
${restaurants.map((r, i) => {
  return `${i + 1}. ${r.name} (${r.cuisine}) - Rating: ${r.rating}/5, Price Level: ${r.priceLevel}/4
     Address: ${r.address}
     ${r.description ? `Description: ${r.description}` : ''}`;
}).join('\n\n')}

**SELECTION CRITERIA (CRITICAL - FOLLOW EXACTLY):**
1. **MUST** align with user's health goal (${surveyData.goal})
2. **MUST** respect dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
3. **MUST** be reasonably priced for monthly food budget: $${surveyData.monthlyFoodBudget || 200} (avoid expensive fine dining, focus on affordable options)
4. **MUST** be well-known, established restaurants that actually exist and are operational
5. **SHOULD** include variety of cuisines from user's preferences
6. **SHOULD** have good ratings (4.0+ preferred) and reasonable price level (1-3, avoid 4)
7. **PRIORITIZE** restaurants known for healthier options and affordable pricing

CRITICAL: Your response must be PURE JSON ONLY. Do not include any markdown formatting, code blocks, backticks, or text before/after the JSON. Start your response with [ and end with ]. No code blocks, no explanations, no additional text.

Please respond with ONLY a JSON array containing exactly 5 restaurant objects with these fields: name, cuisine, rating, priceLevel, address, placeId, city, zipCode. Extract the city and zipCode from the address field.

REMINDER: Response must start with [ and end with ] - pure JSON array only.`;
};

// URL Selection Prompts
export const createExtractionUrlSelectionPrompt = (extractionUrls: any[], restaurant: Restaurant): string => {
  return `Select the best URL for menu extraction for ${restaurant.name}.

RESTAURANT: ${restaurant.name} (${restaurant.cuisine})
LOCATION: ${restaurant.city}

URLs:
${extractionUrls.map((r, i) => `${i + 1}. ${r.url}
Title: ${r.title || 'No title'}
Content: ${r.content?.substring(0, 100) || 'No content'}`).join('\n\n')}

PRIORITY:
1. Restaurant official website menu page
2. PDF menu files
3. Pages with menu items and prices

Return ONLY the number (1-${extractionUrls.length}) of the best URL. If none good, return 0.`;
};

// Menu Analysis Prompts
export const createMenuAnalysisPrompt = (context: MenuExtractionContext): string => {
  return `Analyze this restaurant menu and extract specific menu items with prices and calories.

Restaurant: ${context.restaurantName} (${context.restaurantCuisine})
Location: ${context.restaurantCity}
Current Time: ${context.now.toISOString()} (Hour: ${context.currentHour})

MENU CONTENT:
${context.content}

EXTRACTION RULES:
1. Extract ONLY actual menu items with names and prices
2. Focus on healthier options when available
3. Include variety across meal types (if time-appropriate)
4. NEVER invent items or prices not in the content
5. If content is unclear, extract what's clearly visible

TIME-BASED FOCUS:
- Hours 6-11: Breakfast items
- Hours 11-16: Lunch items
- Hours 16-22: Dinner items
- Other hours: All available items

RESPONSE FORMAT (JSON ONLY):
{
  "menuItems": [
    {
      "name": "Item name exactly as shown",
      "price": 12.99,
      "description": "Brief description if available",
      "category": "breakfast/lunch/dinner",
      "estimatedCalories": 450,
      "healthier": true/false
    }
  ]
}

Extract 8-15 items maximum. Return ONLY valid JSON.`;
};

// Delivery Platform Analysis Prompt
export const createDeliveryPlatformAnalysisPrompt = (restaurant: Restaurant, searchResults: any[], currentHour: number, now: Date): string => {
  return `You are analyzing real delivery platform data for ${restaurant.name}. Extract EXACT menu items and prices from the search results.

CURRENT TIME: ${now.toISOString()} (Hour: ${currentHour})
- If hour 6-11: Focus on breakfast items
- If hour 11-16: Focus on lunch items
- If hour 16-22: Focus on dinner items
- Other hours: Extract all available items

RESTAURANT: ${restaurant.name}
SEARCH RESULTS:
${JSON.stringify(Array.isArray(searchResults) ? searchResults.slice(0, 3) : searchResults || [], null, 2)}

EXTRACTION RULES (CRITICAL):
1. Extract ONLY items that appear in the search results
2. Include exact prices as shown (no estimation)
3. Focus on healthier options when multiple choices available
4. NEVER invent items not in the data
5. Include item descriptions when available
6. Mark items as breakfast/lunch/dinner based on typical consumption

RESPONSE FORMAT - PURE JSON ONLY:
{
  "restaurant": "${restaurant.name}",
  "extractedItems": [
    {
      "name": "Exact item name from data",
      "price": 8.99,
      "description": "Description if available",
      "category": "breakfast/lunch/dinner",
      "platform": "doordash/ubereats/grubhub",
      "estimatedCalories": 350,
      "healthRating": "good/fair/poor"
    }
  ],
  "dataSource": "delivery_platform"
}

Extract 5-12 items maximum. NO markdown, NO explanations, PURE JSON ONLY.`;
};

// Restaurant Meal Selection Prompts
export const createRestaurantMealSelectionPrompt = (todayName: string, surveyData: SurveyResponse, restaurantData: any[], nutritionTargets: any): string => {
  return `Select 7-10 restaurant meals for a 4-day period starting TODAY (${todayName}).

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = Next day after ${todayName}
Day 3 = Two days after ${todayName}
Day 4 = Three days after ${todayName}

USER PROFILE:
- Goal: ${surveyData.goal}
- Dietary Preferences: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Target Daily Calories: ${nutritionTargets.dailyTargets.calories}

VERIFIED RESTAURANT DATA:
${JSON.stringify(restaurantData, null, 2)}

SELECTION RULES:
1. Use ONLY menu items from the provided restaurant data
2. Select meals that align with user's ${surveyData.goal} goal
3. Respect dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
4. Distribute across 4 days with variety
5. Include breakfast, lunch, and dinner options
6. Prioritize healthier menu items when available

CALORIE TARGETS:
- Breakfast: ~${nutritionTargets.mealTargets.breakfast.calories} calories
- Lunch: ~${nutritionTargets.mealTargets.lunch.calories} calories
- Dinner: ~${nutritionTargets.mealTargets.dinner.calories} calories

RESPONSE FORMAT - JSON ONLY:
{
  "selectedMeals": [
    {
      "restaurantName": "Restaurant name from data",
      "itemName": "Exact menu item name",
      "price": 12.99,
      "estimatedCalories": 450,
      "mealType": "breakfast/lunch/dinner",
      "day": "day1/day2/day3/day4",
      "healthRating": "excellent/good/fair",
      "description": "Brief description of why this fits user's goals"
    }
  ]
}

Select 7-10 total meals. NO markdown, NO explanations, PURE JSON ONLY.`;
};

// Home Meal Generation Prompts
export const createHomeMealGenerationPrompt = (todayName: string, surveyData: SurveyResponse, nutritionTargets: any): string => {
  return `Generate 12-15 diverse home-cooked meal names with descriptions for a 4-day period starting TODAY (${todayName}).

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = Next day after ${todayName}
Day 3 = Two days after ${todayName}
Day 4 = Three days after ${todayName}

USER PROFILE:
- Goal: ${surveyData.goal}
- Dietary Preferences: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Foods: ${(surveyData as any).preferredFoods?.join(', ') || 'Open to variety'}
- Target Daily Calories: ${nutritionTargets.dailyTargets.calories}

MEAL REQUIREMENTS:
1. Create meal concepts perfect for user's ${surveyData.goal} goal
2. Respect dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
3. Include preferred foods when possible
4. Focus on realistic home cooking (30 minutes or less prep)
5. Provide nutritional reasoning for each meal
6. Distribute across 4 days with maximum variety

CALORIE TARGETS:
- Breakfast: ~${nutritionTargets.mealTargets.breakfast.calories} calories
- Lunch: ~${nutritionTargets.mealTargets.lunch.calories} calories
- Dinner: ~${nutritionTargets.mealTargets.dinner.calories} calories

RESPONSE FORMAT - JSON ONLY:
{
  "homeMeals": [
    {
      "mealName": "Specific descriptive meal name",
      "description": "Why this meal supports user's ${surveyData.goal} goal and health",
      "estimatedCalories": 420,
      "prepTime": "25 minutes",
      "mealType": "breakfast/lunch/dinner",
      "day": "day1/day2/day3/day4",
      "keyIngredients": ["ingredient1", "ingredient2", "ingredient3"],
      "nutritionalHighlight": "High protein for muscle building"
    }
  ]
}

Generate 12-15 meal concepts. NO markdown, NO explanations, PURE JSON ONLY.`;
};

// Meal Plan Organization Prompt
export const createMealPlanOrganizationPrompt = (todayName: string, restaurantMeals: any[], homeMeals: any[], nutritionTargets: any, surveyData: SurveyResponse): string => {
  return `Organize meals into a 4-day structure starting TODAY (${todayName}).

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = Next day after ${todayName}
Day 3 = Two days after ${todayName}
Day 4 = Three days after ${todayName}

USER PROFILE:
- Goal: ${surveyData.goal}
- Target Daily Calories: ${nutritionTargets.dailyTargets.calories}

AVAILABLE RESTAURANT MEALS:
${JSON.stringify(restaurantMeals, null, 2)}

AVAILABLE HOME MEALS:
${JSON.stringify(homeMeals, null, 2)}

ORGANIZATION RULES:
1. Create exactly 4 days of meals (day1, day2, day3, day4)
2. Each day must have breakfast, lunch, and dinner
3. Each meal must have exactly 2 options: 1 restaurant + 1 home
4. Ensure extreme variety - no duplicate restaurants, cuisines, or cooking methods
5. Balance calories to meet daily targets
6. Every meal option MUST include complete nutrition data

DAILY CALORIE DISTRIBUTION:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.calories} calories
- Lunch: ${nutritionTargets.mealTargets.lunch.calories} calories
- Dinner: ${nutritionTargets.mealTargets.dinner.calories} calories

RESPONSE FORMAT - JSON ONLY:
{
  "mealPlan": [
    {
      "day": "day1",
      "mealType": "breakfast",
      "options": [
        {
          "optionNumber": 1,
          "optionType": "restaurant",
          "title": "Menu item name",
          "restaurantName": "Restaurant name",
          "estimatedPrice": 899,
          "calories": 420,
          "protein": 25,
          "carbs": 35,
          "fat": 18,
          "description": "Why this supports user's goals"
        },
        {
          "optionNumber": 2,
          "optionType": "home",
          "title": "Home meal name",
          "estimatedPrice": 450,
          "calories": 415,
          "protein": 28,
          "carbs": 32,
          "fat": 16,
          "cookingTime": 20,
          "description": "Why this supports user's goals",
          "keyIngredients": ["ingredient1", "ingredient2"]
        }
      ]
    }
  ]
}

Create 12 meal objects total (4 days × 3 meals). NO markdown, PURE JSON ONLY.`;
};

// Nutrition Target Refinement Prompt
export const createNutritionTargetRefinementPrompt = (targetCalories: number, surveyData: SurveyResponse): string => {
  return `You are a certified nutritionist with expertise in metabolic science. Refine these calculated nutrition targets based on the user's complete profile.

CALCULATED BASE TARGETS:
- Daily Calories: ${targetCalories}
- Based on: ${surveyData.goal} goal, ${surveyData.activityLevel} activity level

USER PROFILE:
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Goal: ${surveyData.goal}
- Activity Level: ${surveyData.activityLevel}
- Dietary Preferences: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Current Weight Status: ${(surveyData as any).currentWeight || 'Not provided'}

REFINEMENT REQUIREMENTS:
1. Adjust calorie targets based on metabolic factors
2. Set optimal protein targets for user's goal
3. Balance carb/fat ratios for activity level and goal
4. Account for dietary restrictions in macro distribution
5. Create realistic meal-specific calorie targets

RESPONSE FORMAT - JSON ONLY:
{
  "dailyTargets": {
    "calories": ${targetCalories},
    "protein": 120,
    "carbs": 200,
    "fat": 65,
    "fiber": 25
  },
  "mealTargets": {
    "breakfast": {
      "calories": 350,
      "calorieRange": [300, 400],
      "protein": 25,
      "carbs": 35,
      "fat": 15
    },
    "lunch": {
      "calories": 450,
      "calorieRange": [400, 500],
      "protein": 35,
      "carbs": 45,
      "fat": 18
    },
    "dinner": {
      "calories": 500,
      "calorieRange": [450, 550],
      "protein": 40,
      "carbs": 50,
      "fat": 20
    }
  },
  "rationale": "Brief explanation of adjustments for user's profile"
}

Return ONLY valid JSON with precise nutrition calculations.`;
};

// Restaurant Nutrition Analysis Prompt
export const createRestaurantNutritionAnalysisPrompt = (menuItems: any[], nutritionTargets: any): string => {
  return `You are a registered dietitian with expertise in restaurant nutrition analysis. Provide accurate calorie and macro estimates for these menu items.

NUTRITION TARGETS:
${JSON.stringify(nutritionTargets.mealTargets, null, 2)}

MENU ITEMS TO ANALYZE:
${JSON.stringify(menuItems, null, 2)}

ANALYSIS REQUIREMENTS:
1. Provide realistic calorie estimates based on typical restaurant portions
2. Estimate protein, carbs, and fat content
3. Consider cooking methods and ingredients
4. Account for restaurant-typical oil/butter usage
5. Classify healthiness rating for user's goals

RESPONSE FORMAT - JSON ONLY:
{
  "nutritionAnalysis": [
    {
      "restaurantName": "Restaurant name",
      "itemName": "Menu item name",
      "originalPrice": 12.99,
      "estimatedCalories": 520,
      "protein": 28,
      "carbs": 45,
      "fat": 22,
      "fiber": 6,
      "sodium": 890,
      "healthRating": "excellent/good/fair/poor",
      "mealTypeMatch": "breakfast/lunch/dinner",
      "goalAlignment": "High protein supports muscle building goals"
    }
  ]
}

Analyze all provided menu items. Return ONLY valid JSON with nutrition data.`;
};

// Home Recipe Generation with Calorie Targets Prompt
export const createHomeRecipeGenerationPrompt = (nutritionTargets: any, surveyData: SurveyResponse, todayName: string): string => {
  return `Generate 12 home-cooked meals with SPECIFIC calorie targets for a 4-day meal plan.

CALORIE TARGETS PER MEAL:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.calories} calories (range: ${nutritionTargets.mealTargets.breakfast.calorieRange[0]}-${nutritionTargets.mealTargets.breakfast.calorieRange[1]})
- Lunch: ${nutritionTargets.mealTargets.lunch.calories} calories (range: ${nutritionTargets.mealTargets.lunch.calorieRange[0]}-${nutritionTargets.mealTargets.lunch.calorieRange[1]})
- Dinner: ${nutritionTargets.mealTargets.dinner.calories} calories (range: ${nutritionTargets.mealTargets.dinner.calorieRange[0]}-${nutritionTargets.mealTargets.dinner.calorieRange[1]})

USER PROFILE:
- Goal: ${surveyData.goal}
- Dietary Preferences: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Foods: ${(surveyData as any).preferredFoods?.join(', ') || 'Open to variety'}

MEAL GENERATION REQUIREMENTS:
1. Each meal must hit its specific calorie target (±25 calories)
2. Optimize protein content for ${surveyData.goal} goal
3. Include realistic prep times (15-45 minutes)
4. Use common, accessible ingredients
5. Respect all dietary restrictions
6. Provide complete recipes with instructions

DAILY STRUCTURE (Starting ${todayName}):
- Day 1: ${todayName} - 3 meals (breakfast, lunch, dinner)
- Day 2: Next day - 3 meals
- Day 3: Two days later - 3 meals
- Day 4: Three days later - 3 meals

RESPONSE FORMAT - JSON ONLY:
{
  "homeRecipes": [
    {
      "recipeName": "Descriptive recipe name",
      "mealType": "breakfast/lunch/dinner",
      "day": "day1/day2/day3/day4",
      "targetCalories": 420,
      "actualCalories": 415,
      "protein": 28,
      "carbs": 32,
      "fat": 18,
      "fiber": 6,
      "prepTime": "20 minutes",
      "cookTime": "15 minutes",
      "difficulty": "easy/medium/hard",
      "servings": 1,
      "ingredients": ["1 cup oats", "1/2 cup blueberries", "1 tbsp almond butter"],
      "instructions": ["Step 1", "Step 2", "Step 3"],
      "description": "Why this meal supports ${surveyData.goal} goals",
      "estimatedCost": 450
    }
  ]
}

Generate exactly 12 recipes (3 per day × 4 days). Every meal must hit its calorie target. Return ONLY valid JSON.`;
};

// Meal Plan Validation Prompt
export const createMealPlanValidationPrompt = (mealSelection: any, nutritionTargets: any): string => {
  return `Validate and optimize this 4-day meal selection for nutritional balance.

NUTRITION TARGETS:
${JSON.stringify(nutritionTargets, null, 2)}

CURRENT MEAL SELECTION:
${JSON.stringify(mealSelection, null, 2)}

VALIDATION REQUIREMENTS:
1. Check if daily calorie targets are met (±50 calories tolerance)
2. Verify protein targets support user's goals
3. Ensure meal variety and cuisine diversity
4. Identify any nutritional gaps or imbalances
5. Suggest specific optimizations if needed

RESPONSE FORMAT - JSON ONLY:
{
  "validationResults": {
    "overallScore": 85,
    "calorieBalance": "excellent/good/needs_adjustment",
    "proteinAdequacy": "excellent/good/needs_adjustment",
    "varietyScore": "excellent/good/needs_adjustment",
    "dailyBreakdown": [
      {
        "day": "day1",
        "totalCalories": 1650,
        "targetCalories": 1680,
        "calorieGap": -30,
        "proteinTotal": 98,
        "proteinTarget": 110,
        "status": "within_range/needs_adjustment"
      }
    ],
    "recommendations": [
      "Specific suggestion to improve nutrition balance",
      "Another recommendation if needed"
    ],
    "approved": true
  }
}

Return ONLY valid JSON with complete validation analysis.`;
};