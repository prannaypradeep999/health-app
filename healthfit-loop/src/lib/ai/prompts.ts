import { SurveyResponse } from '@prisma/client';

export interface UserContext {
  surveyData: SurveyResponse;
  weekOf: string; // "2024-01-15" (Monday)
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
  const {
    surveyData,
    weekOf,
    targetCalories,
    weeklyBudgetCents,
    mealsOutPerWeek,
    homeMealsPerWeek
  } = userContext;

  const weeklyBudgetDollars = (weeklyBudgetCents / 100).toFixed(2);
  
  return `You are FYTR AI's personalized meal planning assistant. Generate a complete 7-day meal plan with EXACTLY 2 options for each meal.

USER PROFILE:
- Name: ${surveyData.firstName} ${surveyData.lastName}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Location: ${surveyData.zipCode}
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Activity Level: ${surveyData.activityLevel}
- Weekly Budget: $${weeklyBudgetDollars}
- Diet Preferences: ${surveyData.dietPrefs.join(', ') || 'None specified'}

MEAL DISTRIBUTION (from user survey):
- Restaurant/Takeout meals per week: ${mealsOutPerWeek}  
- Home-cooked meals per week: ${homeMealsPerWeek}
- Target daily calories: ${targetCalories}

CRITICAL REQUIREMENTS:

1. MEAL STRUCTURE:
   - Generate 21 meals total (7 days × 3 meals)
   - Each meal must have EXACTLY 2 options
   - Distribute restaurant vs home meals according to user's survey preferences

2. OPTION REQUIREMENTS:
   For RESTAURANT options:
   - Use find_local_restaurants() to get real restaurants near ${surveyData.zipCode}
   - Search the web for actual menu items and prices from DoorDash/delivery apps
   - CRITICAL: Look up "[Restaurant Name] DoorDash menu prices ${surveyData.zipCode}" 
   - Find real ordering links (DoorDash URLs) for each restaurant meal suggestion
   - Include actual dish names, real prices, and direct ordering links
   - If DoorDash not available, search for UberEats, Grubhub, or restaurant websites
   - Always prioritize delivery apps with real pricing over estimates
   
   For HOME COOKING options:
   - Use get_recipe_instructions() for detailed recipes
   - Consider cooking skill: user is ${surveyData.activityLevel} level
   - Include prep time, cooking time, and difficulty
   - Suggest time-saving shortcuts for busy days

3. NUTRITIONAL TARGETS:
   - Daily calories: ${targetCalories} ± 150 calories
   - Protein: 25-35% of calories (support ${surveyData.goal.toLowerCase()})
   - Include variety of nutrients and food groups
   - Use calculate_nutrition() for accuracy

4. BUDGET CONSTRAINTS:
   - Weekly total must not exceed $${weeklyBudgetDollars}
   - Include delivery fees, tax, tip in restaurant meal costs
   - Balance expensive and budget-friendly options
   - Suggest money-saving tips when appropriate

5. DIETARY RESTRICTIONS:
   - Strictly avoid: ${surveyData.dietPrefs.length > 0 ? surveyData.dietPrefs.join(', ') : 'No restrictions'}
   - Check all ingredients and menu items for compliance
   
6. PRACTICAL CONSIDERATIONS:
   - Consider meal prep opportunities (Sunday prep for busy weekdays)
   - Suggest quick options for busy days
   - Include variety in cuisines and cooking methods
   - Account for realistic shopping and cooking schedules

RESPONSE FORMAT - MUST BE VALID JSON:
Return a JSON object with this EXACT structure:

{{
  "meals": [
    {{
      "day": "monday",
      "mealType": "breakfast",
      "options": [
        {{
          "optionNumber": 1,
          "optionType": "restaurant",
          "title": "Starbucks Protein Box",
          "description": "Hard-boiled eggs, cheese, fruit, and nuts",
          "restaurantName": "Starbucks",
          "estimatedPrice": 650,
          "calories": 380,
          "protein": 20,
          "carbs": 15,
          "fat": 22,
          "orderingInfo": "Order via DoorDash app or call restaurant",
          "deliveryTime": "15-25 min"
        }},
        {{
          "optionNumber": 2,
          "optionType": "home",
          "title": "Greek Yogurt Parfait",
          "description": "Greek yogurt with berries and granola",
          "ingredients": ["1 cup Greek yogurt", "1/2 cup mixed berries", "1/4 cup granola"],
          "cookingTime": 5,
          "difficulty": "easy",
          "calories": 320,
          "protein": 20,
          "carbs": 35,
          "fat": 8,
          "instructions": "Layer yogurt, berries, and granola. Drizzle with honey if desired."
        }}
      ]
    }}
  ]
}}

CRITICAL: Return ONLY valid JSON. No explanatory text, no markdown formatting, just pure JSON.

Start by calling find_local_restaurants() to discover what's available near the user, then begin meal planning for the week of ${weekOf}.

Remember: This user chose ${mealsOutPerWeek} restaurant meals per week, so make sure your plan reflects their preferences while staying within budget and meeting their ${surveyData.goal.toLowerCase()} goals.`;
}

export function buildValidationPrompt(mealPlan: any, userContext: UserContext): string {
  const weeklyBudgetDollars = (userContext.weeklyBudgetCents / 100).toFixed(2);
  
  return `You are a meal plan validator. Check this meal plan for issues and suggest fixes.

VALIDATION CHECKLIST:

1. BUDGET ANALYSIS:
   - Total weekly cost ≤ $${weeklyBudgetDollars}
   - Include 20% markup for delivery fees, tax, tips
   - Flag meals that seem overpriced for the area

2. NUTRITIONAL BALANCE:
   - Daily calories: ${userContext.targetCalories} ± 150
   - Adequate protein for ${userContext.surveyData.goal.toLowerCase()}
   - Variety of food groups across the week
   - No nutritional deficiencies

3. MEAL DISTRIBUTION:
   - Restaurant meals: ${userContext.mealsOutPerWeek} per week
   - Home meals: ${userContext.homeMealsPerWeek} per week
   - Realistic cooking time for home meals

4. DIETARY COMPLIANCE:
   - No prohibited foods: ${userContext.surveyData.dietPrefs.join(', ')}
   - Check all ingredients and menu items

5. PRACTICAL FEASIBILITY:
   - Restaurants actually exist and deliver to ${userContext.surveyData.zipCode}
   - Home recipes match user's cooking skill
   - Shopping list is realistic

If issues found, provide specific fixes with reasoning.

MEAL PLAN TO VALIDATE:
${JSON.stringify(mealPlan, null, 2)}`;
}