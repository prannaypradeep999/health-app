// 7-Day Meal Generation Prompts
// These prompts support the complete 7-day meal planning system

/**
 * CHANGES MADE:
 * - Added grocery list generation to createHomeMealGenerationPrompt()
 * - Grocery list is categorized by: produce, protein, dairy, grains, pantry, frozen
 * - Added estimatedGroceryCost to help with budget tracking
 * - Enhanced restaurant meal prompt to preserve ordering links
 */

export interface MealGenerationContext {
  homeMeals: Array<{day: string, mealType: string}>;
  surveyData: any;
  nutritionTargets: any;
  scheduleText: string;
}

export interface RestaurantMealContext {
  restaurantMealsSchedule: Array<{day: string, mealType: string}>;
  restaurantMenuData: any[];
  surveyData: any;
}

// Home meal generation prompt for 7-day system (NOW INCLUDES GROCERY LIST)
export function createHomeMealGenerationPrompt(context: MealGenerationContext): string {
  const { homeMeals, nutritionTargets, scheduleText, surveyData } = context;

  return `Generate home-cooked meal recipes for a 7-day meal plan WITH a consolidated grocery list.

USER WEEKLY SCHEDULE:
${scheduleText}

TOTAL HOME MEALS TO GENERATE: ${homeMeals.length}

NUTRITION TARGETS PER MEAL:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.calories} calories, ${nutritionTargets.mealTargets.breakfast.protein}g protein
- Lunch: ${nutritionTargets.mealTargets.lunch.calories} calories, ${nutritionTargets.mealTargets.lunch.protein}g protein
- Dinner: ${nutritionTargets.mealTargets.dinner.calories} calories, ${nutritionTargets.mealTargets.dinner.protein}g protein

USER PREFERENCES & GOALS:
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Activity Level: ${surveyData.activityLevel || 'MODERATELY_ACTIVE'}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Foods: ${(surveyData.preferredFoods || []).slice(0, 10).join(', ') || 'No specific preferences'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Varied'}
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

${(() => {
  // Comprehensive goal-specific guidance
  function getGoalSpecificGuidance(surveyData) {
    const { primaryGoal, goalChallenge, fitnessLevel, healthFocus, maintainFocus } = surveyData;

    let guidance = '';

    // Goal Challenge guidance (lose_weight)
    if (primaryGoal === 'lose_weight' && goalChallenge) {
      const challengeGuidance = {
        'snacking': `USER STRUGGLES WITH SNACKING: Include 2 satisfying high-protein snacks per day.
                     Make meals filling with fiber and protein to reduce between-meal hunger.
                     Suggest healthy snack swaps. Avoid recipes that create leftovers prone to snacking.`,
        'eating_out': `USER EATS OUT FREQUENTLY: Keep home recipes simple since cooking isn't their main habit.
                       Focus on quick 15-20 min meals. Prep-friendly recipes for busy days.
                       Include meals that compete with restaurant appeal.`,
        'portions': `USER STRUGGLES WITH PORTIONS: Include specific portion sizes in grams/oz for everything.
                     Suggest using smaller plates. Pre-portioned meal prep recipes preferred.
                     Visual portion guides in recipe instructions.`,
        'late_night': `USER TENDS TO EAT LATE AT NIGHT: Front-load calories earlier in the day.
                       Make dinner very satisfying with protein + fiber + volume.
                       Include a planned 150-200 cal evening snack (casein-rich: Greek yogurt, cottage cheese).
                       Avoid simple carbs at dinner that spike then crash blood sugar.`,
        'dont_know': `USER UNSURE WHAT TO EAT: Provide extra variety and educational notes.
                      Explain WHY each meal supports weight loss in the description.
                      Keep choices simple and approachable. No exotic ingredients.`
      };
      guidance += challengeGuidance[goalChallenge] || '';
    }

    // Fitness Level guidance (build_muscle)
    if (primaryGoal === 'build_muscle' && fitnessLevel) {
      const levelGuidance = {
        'beginner': `BEGINNER LIFTER: Focus on protein basics (0.8-1g per lb bodyweight).
                     Simpler recipes with clear protein counts. Meal timing less critical.
                     Emphasize whole food protein sources over supplements.`,
        'intermediate': `INTERMEDIATE LIFTER: Higher protein targets (1-1.2g per lb).
                         Include pre/post workout meal suggestions.
                         Strategic carb timing around training windows.`,
        'advanced': `ADVANCED LIFTER: Performance nutrition focus (1.2-1.5g protein per lb).
                     Precise macro breakdowns. Meal timing for optimal recovery.
                     Include intra-workout nutrition suggestions if training >90min.`
      };
      guidance += levelGuidance[fitnessLevel] || '';
    }

    // Health Focus guidance (get_healthier)
    if (primaryGoal === 'get_healthier' && healthFocus) {
      const healthGuidance = {
        'energy': `USER WANTS MORE ENERGY: Focus on complex carbohydrates for sustained energy.
                   Iron-rich foods (spinach, lean red meat, legumes). B-vitamin foods.
                   Avoid sugar spikes - always pair carbs with protein/fat.
                   Strategic meal timing: bigger breakfast, moderate lunch, lighter dinner.`,
        'digestion': `USER WANTS BETTER DIGESTION: High fiber focus (25-35g daily).
                      Include fermented foods (yogurt, kimchi, sauerkraut, miso).
                      Probiotic-rich options. Adequate hydration reminders.
                      Avoid common irritants in recipes (excess dairy, fried foods, artificial sweeteners).`,
        'mental_clarity': `USER WANTS MENTAL CLARITY: Omega-3 rich foods (salmon, walnuts, flaxseed).
                           Fatty fish 2-3x per week. Antioxidant-rich berries and leafy greens.
                           Blood sugar stability crucial - no simple carb meals.
                           Include brain foods: eggs, avocado, dark chocolate, blueberries.`,
        'bloodwork': `USER WANTS TO IMPROVE BLOODWORK: Heart-healthy fats (olive oil, avocado, nuts).
                      Lower sodium options (<1500mg daily). High fiber for cholesterol.
                      Lean proteins. Whole foods over processed. Limit red meat to 1-2x/week.
                      Include foods that lower LDL: oats, beans, almonds, fatty fish.`,
        'general': `USER WANTS GENERAL WELLNESS: Balanced, whole-food focused meals.
                    Rainbow of vegetables for micronutrient variety.
                    Anti-inflammatory foods. Moderate portions. Sustainable and enjoyable.`
      };
      guidance += healthGuidance[healthFocus] || '';
    }

    // Maintain Focus guidance
    if (primaryGoal === 'maintain' && maintainFocus) {
      const maintainGuidance = {
        'consistency': `USER WANTS CONSISTENCY: Repeatable, sustainable meal patterns.
                        Use similar structures each week (e.g., "Taco Tuesday", "Stir-fry Friday").
                        Batch-cooking friendly recipes. Simple ingredients always available.
                        Predictable grocery lists week to week.`,
        'recomp': `USER WANTS BODY RECOMPOSITION: High protein priority (1g+ per lb bodyweight).
                   Maintenance calories with strategic distribution.
                   Higher carbs on training days, lower on rest days.
                   Prioritize lean proteins and time carbs around workouts.`,
        'habits': `USER WANTS TO BUILD BETTER HABITS: Include habit-building tips with recipes.
                   Suggest habit stacking ("prep tomorrow's lunch while dinner cooks").
                   Small, achievable daily goals. Consistency over perfection messaging.
                   Weekly review suggestions for what worked/didn't.`,
        'intuitive': `USER WANTS INTUITIVE EATING: Include portion guidance using hand measures:
                      - Palm-sized protein (4-6oz)
                      - Fist-sized carbs (1 cup)
                      - Thumb-sized fats (1-2 tbsp)
                      No strict calorie counting in descriptions. Focus on balanced plates.
                      Hunger/fullness awareness cues. Flexibility in portions.`
      };
      guidance += maintainGuidance[maintainFocus] || '';
    }

    return guidance;
  }

  const guidance = getGoalSpecificGuidance(surveyData);
  return guidance ? `PERSONALIZED GUIDANCE BASED ON USER'S SPECIFIC SITUATION:
${guidance}

` : '';
})()}
REQUIREMENTS:
1. Generate EXACTLY ${homeMeals.length} recipes - one for each meal in the schedule above
2. Each meal MUST hit its nutrition targets (±50 calories)
3. MAXIMUM VARIETY - no repeated main ingredients across the week
4. Use diverse cuisines and cooking methods
5. Mix easy (15-20 min) and moderate (30-45 min) prep times
6. Include complete ingredient lists and basic instructions
7. Consider batch cooking possibilities for similar meals
8. Generate a CONSOLIDATED GROCERY LIST from all ingredients
9. ⚠️ CRITICAL: You MUST provide BOTH a primary AND alternative option for EVERY meal. NEVER leave alternative empty or null.

Return a JSON object with this EXACT structure:

{
  "homeMeals": [
    {
      "day": "monday",
      "mealType": "breakfast",
      "primary": {
        "name": "Recipe Name 1",
        "description": "Brief description",
        "estimatedCalories": 540,
        "protein": 47,
        "carbs": 54,
        "fat": 15,
        "prepTime": "15 min",
        "cookTime": "10 min",
        "difficulty": "Easy",
        "cuisine": "Mediterranean",
        "ingredients": ["3 large eggs", "2 cups spinach", "1 tbsp olive oil"],
        "instructions": ["step1", "step2"],
        "tags": ["high-protein", "quick"],
        "source": "home"
      },
      "alternative": {
        "name": "Recipe Name 2 (different from primary)",
        "description": "Different description",
        "estimatedCalories": 530,
        "protein": 45,
        "carbs": 52,
        "fat": 17,
        "prepTime": "10 min",
        "cookTime": "15 min",
        "difficulty": "Easy",
        "cuisine": "American",
        "ingredients": ["1 cup oats", "1 medium banana", "1 tbsp honey"],
        "instructions": ["different steps"],
        "tags": ["fiber-rich", "easy"],
        "source": "home"
      }
    }
  ],
  "groceryList": {
    "proteins": [
      {"name": "Chicken breast", "quantity": "2 lbs", "estimatedCost": 12.99, "uses": "Multiple protein-rich meals"},
      {"name": "Eggs", "quantity": "1 dozen", "estimatedCost": 4.99, "uses": "Breakfast, baking"}
    ],
    "vegetables": [
      {"name": "Spinach", "quantity": "2 bags", "estimatedCost": 5.99, "uses": "Salads, smoothies, cooking"},
      {"name": "Broccoli", "quantity": "2 heads", "estimatedCost": 4.99, "uses": "Side dishes, stir-fries"}
    ],
    "grains": [
      {"name": "Brown rice", "quantity": "2 lbs bag", "estimatedCost": 4.49, "uses": "Base for bowls and sides"},
      {"name": "Oats", "quantity": "1 container", "estimatedCost": 4.99, "uses": "Breakfast, baking"}
    ],
    "dairy": [
      {"name": "Greek yogurt", "quantity": "32oz container", "estimatedCost": 6.99, "uses": "Breakfast, snacks, cooking"}
    ],
    "pantryStaples": [
      {"name": "Olive oil", "quantity": "500ml bottle", "estimatedCost": 8.99, "uses": "Cooking, dressings"}
    ],
    "snacks": [
      {"name": "Mixed nuts", "quantity": "1 lb", "estimatedCost": 9.99, "uses": "Healthy snacking"}
    ]
  },
  "totalEstimatedCost": 85.50,
  "weeklyBudgetUsed": "43%"
}

GROCERY LIST RULES:
1. Consolidate duplicate ingredients across all meals (combine amounts)
2. Round up quantities for practical shopping (e.g., can't buy 1.5 eggs)
3. Estimate prices based on typical US grocery store prices
4. Use these EXACT categories: proteins, vegetables, grains, dairy, pantryStaples, snacks
5. Each item MUST have: name, quantity, estimatedCost, uses
6. Include ONLY ingredients from the primary recipes (not alternatives)
7. Calculate realistic total cost and weeklyBudgetUsed as percentage of user's monthly budget / 4`;
}

// Restaurant meal generation prompt for 7-day system
export function createRestaurantMealGenerationPrompt(context: RestaurantMealContext): string {
  const { restaurantMealsSchedule, restaurantMenuData, surveyData } = context;

  // Build detailed restaurant info with ordering links prominently displayed
  const restaurantDetails = restaurantMenuData.map(restaurant => {
    const links = restaurant.orderingLinks || {};
    const availableLinks = Object.entries(links)
      .filter(([_, url]) => url && typeof url === 'string' && url.trim() !== '')
      .map(([platform, url]) => `${platform}: ${url}`)
      .join('\n    ');
    
    return `
RESTAURANT: ${restaurant.name}
  Cuisine: ${restaurant.cuisine || 'Mixed'}
  Address: ${restaurant.address}
  Rating: ${restaurant.rating || 'N/A'}
  
  ORDERING LINKS (MUST USE THESE EXACT URLs):
    ${availableLinks || 'No links available'}
  
  MENU ITEMS:
${(restaurant.menuData || []).slice(0, 8).map((item: any) => 
    `    - ${item.name}: $${item.price} (${item.category || 'meal'}) - ${item.estimatedCalories || '~500'} cal`
  ).join('\n') || '    No menu items available'}
`;
  }).join('\n---\n');

  return `Select specific restaurant meals for this user's weekly schedule.

RESTAURANT MEALS NEEDED:
${restaurantMealsSchedule.map(meal => `- ${meal.day} ${meal.mealType}`).join('\n')}

AVAILABLE RESTAURANTS WITH VERIFIED ORDERING LINKS:
${restaurantDetails}

USER PREFERENCES & GOALS:
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

⚠️ CRITICAL REQUIREMENTS:
1. Select EXACTLY ${restaurantMealsSchedule.length} meals matching the schedule
2. For EACH meal, provide BOTH a primary AND alternative option from DIFFERENT restaurants
3. ⚠️ ORDERING LINKS ARE REQUIRED: Copy the EXACT orderingLinks from the restaurant data above
4. Distribute across different restaurants for variety
5. Consider meal timing (lighter lunches, heartier dinners)
6. Stay within budget and dietary preferences
7. Use ONLY restaurants and menu items from the data provided above
8. NEVER leave orderingLinks empty - copy them directly from the restaurant data

Return ONLY this JSON structure:
{
  "restaurantMeals": [
    {
      "day": "friday",
      "mealType": "dinner",
      "primary": {
        "restaurant": "Exact Restaurant Name from data",
        "dish": "Exact Dish Name from menu",
        "description": "Brief description",
        "price": 18.99,
        "estimatedCalories": 650,
        "protein": 35,
        "carbs": 45,
        "fat": 28,
        "cuisine": "Italian",
        "address": "Restaurant address from data",
        "orderingLinks": {
          "doordash": "COPY EXACT URL FROM RESTAURANT DATA",
          "ubereats": "COPY EXACT URL FROM RESTAURANT DATA",
          "grubhub": "COPY EXACT URL FROM RESTAURANT DATA",
          "direct": "COPY EXACT URL FROM RESTAURANT DATA"
        },
        "source": "restaurant",
        "tags": ["dinner", "italian", "protein-rich"]
      },
      "alternative": {
        "restaurant": "Different Restaurant Name",
        "dish": "Different Dish Name",
        "description": "Different description",
        "price": 16.99,
        "estimatedCalories": 620,
        "protein": 32,
        "carbs": 42,
        "fat": 25,
        "cuisine": "Different cuisine",
        "address": "Different restaurant address",
        "orderingLinks": {
          "doordash": "COPY EXACT URL FROM DIFFERENT RESTAURANT",
          "ubereats": "COPY EXACT URL FROM DIFFERENT RESTAURANT",
          "grubhub": "COPY EXACT URL FROM DIFFERENT RESTAURANT",
          "direct": "COPY EXACT URL FROM DIFFERENT RESTAURANT"
        },
        "source": "restaurant",
        "tags": ["dinner", "different-cuisine"]
      }
    }
  ]
}

⚠️ IMPORTANT: Only include platforms in orderingLinks that have actual URLs in the restaurant data. If a restaurant doesn't have a GrubHub link, don't include grubhub in that meal's orderingLinks.`;
}

// Restaurant selection prompt (for choosing best restaurants from search results)
export function createRestaurantSelectionPrompt(restaurants: any[], surveyData: any): string {
  return `Select the 6-8 best restaurants from this list for a weekly meal plan.

AVAILABLE RESTAURANTS:
${restaurants.map((r, i) => `
${i + 1}. Name: ${r.name}
   PlaceId: ${r.placeId}
   Cuisine: ${r.cuisine || 'Mixed'}
   Rating: ${r.rating}/5
   Price Level: ${r.priceLevel || 'Unknown'}
   Address: ${r.address || r.formatted_address || r.vicinity}
   City: ${r.city || 'Unknown'}
`).join('\n')}

USER PREFERENCES & GOALS:
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

SELECTION CRITERIA:
1. Choose 6-8 restaurants maximum
2. Prioritize variety in cuisine types
3. Balance high-rated options with budget constraints
4. Consider location convenience
5. Ensure good mix for different meal types (lunch/dinner)

Return JSON with this EXACT structure - include placeId for matching:
{
  "selectedRestaurants": [
    {
      "name": "Restaurant Name",
      "placeId": "COPY THE EXACT placeId FROM ABOVE",
      "cuisine": "Cuisine type",
      "rating": 4.5,
      "address": "Full address",
      "reason": "Why this restaurant was selected"
    }
  ]
}`;
}