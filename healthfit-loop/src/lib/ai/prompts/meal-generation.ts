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
  nutritionTargets?: any;
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
- Name: ${surveyData.firstName || 'User'}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Weight: ${surveyData.weight} lbs, Height: ${surveyData.height} inches
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Activity Level: ${surveyData.activityLevel || 'MODERATELY_ACTIVE'}
- Sports/Activities: ${surveyData.sportsInterests || surveyData.preferredActivities?.join(', ') || 'General fitness'}
- Budget: ${surveyData.monthlyFoodBudget || 200}/month (approximately ${Math.round((surveyData.monthlyFoodBudget || 200) / 4)}/week)

⚠️ DIETARY RESTRICTIONS (STRICTLY ENFORCE - NO EXCEPTIONS):
${(() => {
  const restrictions = surveyData.dietPrefs || [];
  if (restrictions.length === 0) return '- No dietary restrictions - full ingredient selection available';

  let rules = '';
  restrictions.forEach(pref => {
    if (pref === 'Vegetarian') {
      rules += `- VEGETARIAN: Absolutely NO meat, poultry, or fish. Eggs and dairy ARE allowed.\n`;
    }
    if (pref === 'Vegan') {
      rules += `- VEGAN: Absolutely NO animal products whatsoever. No meat, fish, eggs, dairy, honey, or gelatin.\n`;
    }
    if (pref === 'Gluten-Free') {
      rules += `- GLUTEN-FREE: NO wheat, barley, rye, or gluten-containing grains. Use rice, quinoa, certified GF oats.\n`;
    }
    if (pref === 'Dairy-Free') {
      rules += `- DAIRY-FREE: NO milk, cheese, yogurt, butter, or cream. Use plant-based alternatives.\n`;
    }
    if (pref === 'Keto') {
      rules += `- KETO: Maximum 20-30g net carbs per day. High fat, moderate protein. No grains, sugar, most fruits.\n`;
    }
    if (pref === 'Paleo') {
      rules += `- PALEO: No grains, legumes, dairy, refined sugar, or processed foods. Focus on whole foods.\n`;
    }
    if (pref === 'Low-Carb') {
      rules += `- LOW-CARB: Keep total carbs under 100g/day. Prioritize protein and healthy fats.\n`;
    }
    if (pref === 'Pescatarian') {
      rules += `- PESCATARIAN: No meat or poultry. Fish and seafood ARE allowed, plus eggs and dairy.\n`;
    }
    if (pref === 'Halal') {
      rules += `- HALAL: No pork or pork products. Meat must be halal-certified. No alcohol in cooking.\n`;
    }
    if (pref === 'Low-Sodium') {
      rules += `- LOW-SODIUM: Keep sodium under 1500mg/day. Avoid processed foods, use herbs/spices for flavor.\n`;
    }
  });
  return rules || '- Standard dietary guidelines apply';
})()}

🥗 PREFERRED FOODS (PRIORITIZE THESE INGREDIENTS):
${(() => {
  const foods = surveyData.preferredFoods || [];
  if (foods.length === 0) return '- No specific preferences - use varied healthy ingredients';

  return `The user specifically selected these foods as favorites - USE THEM FREQUENTLY:
${foods.map(food => `- ${food}`).join('\n')}

⚠️ Build meals around these preferred ingredients. If user selected "Salmon", include salmon dishes 2-3x/week.
If user selected "Rice" and "Chicken", make rice bowls with chicken a staple.`;
})()}

🍳 PREFERRED CUISINES (MATCH COOKING STYLES):
${(() => {
  const cuisines = surveyData.preferredCuisines || [];
  if (cuisines.length === 0) return '- Varied cuisines - mix different cooking styles';

  return `User enjoys these cuisines - incorporate their cooking styles and flavor profiles:
${cuisines.map(cuisine => `- ${cuisine}`).join('\n')}

Design meals that feel like these cuisines. For Mediterranean, use olive oil, herbs, lemon.
For Mexican, use cumin, lime, cilantro. For Asian cuisines, use ginger, soy sauce, sesame.`;
})()}

💊 NUTRIENT PRIORITIES (INCLUDE THESE IN MEALS):
${(() => {
  const nutrients = surveyData.preferredNutrients || [];
  if (nutrients.length === 0) return '- Standard balanced nutrition';

  let nutrientGuide = `User wants meals rich in these nutrients - actively include foods that provide them:\n`;

  nutrients.forEach(nutrient => {
    if (nutrient.includes('Iron')) {
      nutrientGuide += `- IRON-RICH: Include spinach, red meat (if allowed), lentils, fortified cereals, pumpkin seeds\n`;
    }
    if (nutrient.includes('Vitamin D')) {
      nutrientGuide += `- VITAMIN D: Include fatty fish (salmon, mackerel), egg yolks, fortified milk/alternatives, mushrooms\n`;
    }
    if (nutrient.includes('B12')) {
      nutrientGuide += `- VITAMIN B12: Include meat, fish, eggs, dairy, or fortified plant milks (critical for vegans)\n`;
    }
    if (nutrient.includes('Omega-3')) {
      nutrientGuide += `- OMEGA-3: Include salmon, sardines, walnuts, flaxseed, chia seeds - aim for fatty fish 2-3x/week\n`;
    }
    if (nutrient.includes('Calcium')) {
      nutrientGuide += `- CALCIUM: Include dairy, fortified plant milk, leafy greens (kale, bok choy), almonds, sardines with bones\n`;
    }
    if (nutrient.includes('Magnesium')) {
      nutrientGuide += `- MAGNESIUM: Include dark chocolate, avocado, nuts, seeds, legumes, whole grains\n`;
    }
    if (nutrient.includes('Zinc')) {
      nutrientGuide += `- ZINC: Include oysters, beef, pumpkin seeds, chickpeas, cashews, yogurt\n`;
    }
    if (nutrient.includes('Fiber')) {
      nutrientGuide += `- FIBER-RICH: Include beans, lentils, whole grains, vegetables, berries - aim for 25-35g/day\n`;
    }
    if (nutrient.includes('Protein')) {
      nutrientGuide += `- PROTEIN-RICH: Prioritize protein at every meal - eggs, Greek yogurt, lean meats, legumes, tofu\n`;
    }
    if (nutrient.includes('Probiotic')) {
      nutrientGuide += `- PROBIOTIC: Include yogurt, kefir, kimchi, sauerkraut, miso, kombucha in the meal plan\n`;
    }
    if (nutrient.includes('Antioxidant')) {
      nutrientGuide += `- ANTIOXIDANT-RICH: Include berries, dark leafy greens, dark chocolate, pecans, artichokes, red cabbage\n`;
    }
    if (nutrient.includes('Vitamin C')) {
      nutrientGuide += `- VITAMIN C: Include citrus, bell peppers, strawberries, broccoli, Brussels sprouts\n`;
    }
    if (nutrient.includes('Vitamin A')) {
      nutrientGuide += `- VITAMIN A: Include sweet potato, carrots, spinach, kale, eggs, liver (if allowed)\n`;
    }
    if (nutrient.includes('Folate')) {
      nutrientGuide += `- FOLATE: Include leafy greens, legumes, asparagus, eggs, fortified grains\n`;
    }
    if (nutrient.includes('Potassium')) {
      nutrientGuide += `- POTASSIUM: Include bananas, potatoes, beans, spinach, avocado, coconut water\n`;
    }
    if (nutrient.includes('Biotin')) {
      nutrientGuide += `- BIOTIN: Include eggs (especially yolks), nuts, seeds, salmon, avocado, sweet potato\n`;
    }
  });

  return nutrientGuide;
})()}

🩺 BIOMARKER CONSIDERATIONS:
${(() => {
  const biomarkers = surveyData.biomarkerJson || surveyData.biomarkers || {};
  if (Object.keys(biomarkers).length === 0) return '- No biomarker data provided';

  let advice = '';
  if (biomarkers.cholesterol && biomarkers.cholesterol > 200) {
    advice += `- HIGH CHOLESTEROL (${biomarkers.cholesterol}): Reduce saturated fats, increase fiber, include oats, nuts, fatty fish. Limit red meat to 1-2x/week.\n`;
  }
  if (biomarkers.vitaminD && biomarkers.vitaminD < 30) {
    advice += `- LOW VITAMIN D (${biomarkers.vitaminD}): Prioritize vitamin D foods: fatty fish, fortified milk, egg yolks, mushrooms exposed to UV.\n`;
  }
  if (biomarkers.iron && biomarkers.iron < 60) {
    advice += `- LOW IRON (${biomarkers.iron}): Include iron-rich foods with vitamin C to boost absorption. Red meat, spinach, lentils + citrus.\n`;
  }

  return advice || '- Biomarker values within normal range';
})()}

📝 USER'S ADDITIONAL NOTES:
${surveyData.additionalGoalsNotes
  ? `"${surveyData.additionalGoalsNotes}"

Consider any food-related preferences or restrictions mentioned here.`
  : '- No additional notes'}

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
4. Use diverse cuisines matching user's preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'varied'}
5. Mix easy (15-20 min) and moderate (30-45 min) prep times
6. Include complete ingredient lists and basic instructions
7. Consider batch cooking possibilities for similar meals
8. Generate a CONSOLIDATED GROCERY LIST from all ingredients
9. ⚠️ CRITICAL: Provide BOTH primary AND alternative for EVERY meal
10. ⚠️ DIETARY RESTRICTIONS ARE NON-NEGOTIABLE - never include forbidden ingredients
11. ⚠️ PRIORITIZE user's preferred foods: ${(surveyData.preferredFoods || []).slice(0, 15).join(', ') || 'varied ingredients'}
12. ⚠️ Include nutrient-rich foods based on user's preferences: ${(surveyData.preferredNutrients || []).join(', ') || 'balanced nutrition'}
13. Stay within weekly budget of ~${Math.round((surveyData.monthlyFoodBudget || 200) / 4)}

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
      {"name": "Chicken breast", "quantity": "2 lbs", "uses": "Multiple protein-rich meals"},
      {"name": "Eggs", "quantity": "1 dozen", "uses": "Breakfast, baking"},
      {"name": "Salmon fillet", "quantity": "1 lb", "uses": "Dinner entrees"}
    ],
    "vegetables": [
      {"name": "Spinach", "quantity": "2 bags (10oz each)", "uses": "Salads, smoothies, cooking"},
      {"name": "Broccoli", "quantity": "2 heads", "uses": "Side dishes, stir-fries"},
      {"name": "Bell peppers", "quantity": "3 mixed colors", "uses": "Salads, stir-fries, snacking"}
    ],
    "grains": [
      {"name": "Brown rice", "quantity": "2 lb bag", "uses": "Base for bowls and sides"},
      {"name": "Oats", "quantity": "42oz container", "uses": "Breakfast, baking"},
      {"name": "Whole wheat bread", "quantity": "1 loaf", "uses": "Toast, sandwiches"}
    ],
    "dairy": [
      {"name": "Greek yogurt", "quantity": "32oz container", "uses": "Breakfast, snacks, cooking"},
      {"name": "Milk", "quantity": "1 gallon", "uses": "Cereal, smoothies, cooking"}
    ],
    "pantryStaples": [
      {"name": "Olive oil", "quantity": "500ml bottle", "uses": "Cooking, dressings"},
      {"name": "Honey", "quantity": "12oz bottle", "uses": "Sweetening, marinades"}
    ],
    "snacks": [
      {"name": "Mixed nuts", "quantity": "1 lb bag", "uses": "Healthy snacking"},
      {"name": "Dark chocolate", "quantity": "3.5oz bar (85% cacao)", "uses": "Healthy treat"}
    ]
  }
}

GROCERY LIST RULES:
1. Consolidate duplicate ingredients across all meals (combine amounts)
2. Round up quantities for practical shopping (e.g., can't buy 1.5 eggs)
3. Do NOT include prices - real prices will be added from local stores later
4. Use these EXACT categories: proteins, vegetables, grains, dairy, pantryStaples, snacks
5. Each item MUST have exactly 3 fields: name, quantity, uses
6. Include ONLY ingredients from the primary recipes (not alternatives)
7. Be SPECIFIC with quantities - include package sizes when relevant:
   - Good: "2 lb bag", "32oz container", "1 dozen", "3 medium"
   - Bad: "some", "a few", "as needed"
8. The "uses" field should list which meals use this ingredient`;
}

// Restaurant meal generation prompt for 7-day system
export function createRestaurantMealGenerationPrompt(context: RestaurantMealContext): string {
  const { restaurantMealsSchedule, restaurantMenuData, surveyData, nutritionTargets } = context;

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

NUTRITION TARGETS PER MEAL (IMPORTANT - meals should be within ±100 calories):
${nutritionTargets ? `- Breakfast: ${nutritionTargets.mealTargets?.breakfast?.calories || 500} calories, ${nutritionTargets.mealTargets?.breakfast?.protein || 30}g protein
- Lunch: ${nutritionTargets.mealTargets?.lunch?.calories || 600} calories, ${nutritionTargets.mealTargets?.lunch?.protein || 40}g protein
- Dinner: ${nutritionTargets.mealTargets?.dinner?.calories || 700} calories, ${nutritionTargets.mealTargets?.dinner?.protein || 45}g protein` : `- Breakfast: 500 calories, 30g protein
- Lunch: 600 calories, 40g protein
- Dinner: 700 calories, 45g protein`}

USER PREFERENCES & GOALS:
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Varied'}
- Budget: ${surveyData.monthlyFoodBudget || 200}/month

⚠️ DIETARY RESTRICTIONS (MUST FILTER MENU ITEMS):
${(() => {
  const restrictions = surveyData.dietPrefs || [];
  if (restrictions.length === 0) return '- No restrictions - any menu items allowed';

  return restrictions.map(pref => {
    if (pref === 'Vegetarian') return '- VEGETARIAN: Only select dishes without meat, poultry, or fish';
    if (pref === 'Vegan') return '- VEGAN: Only select dishes with no animal products (no meat, dairy, eggs)';
    if (pref === 'Gluten-Free') return '- GLUTEN-FREE: Avoid bread, pasta, breaded items unless marked GF';
    if (pref === 'Dairy-Free') return '- DAIRY-FREE: Avoid dishes with cheese, cream sauces, butter';
    if (pref === 'Keto') return '- KETO: Select high-fat, low-carb options. Skip rice, bread, pasta sides';
    if (pref === 'Halal') return '- HALAL: Skip pork dishes and non-halal meats';
    return `- ${pref}: Apply appropriate restrictions`;
  }).join('\n');
})()}

🥗 PREFERRED FOODS (SELECT DISHES FEATURING THESE):
${(surveyData.preferredFoods || []).length > 0
  ? `Prioritize menu items containing: ${surveyData.preferredFoods.slice(0, 10).join(', ')}`
  : '- No specific ingredient preferences'}

⚠️ CRITICAL REQUIREMENTS:
1. Select EXACTLY ${restaurantMealsSchedule.length} meals matching the schedule
2. ⚠️ CALORIE TARGETS: Each meal MUST be within ±100 calories of the target above
3. For EACH meal, provide BOTH a primary AND alternative option from DIFFERENT restaurants
4. ⚠️ ORDERING LINKS ARE REQUIRED: Copy the EXACT orderingLinks from the restaurant data above
5. Distribute across different restaurants for variety
6. Consider meal timing (lighter lunches, heartier dinners)
7. Stay within budget and dietary preferences
8. Use ONLY restaurants and menu items from the data provided above
9. NEVER leave orderingLinks empty - copy them directly from the restaurant data
10. ⚠️ DIETARY RESTRICTIONS ARE ABSOLUTE - never select forbidden menu items
11. ⚠️ PREFERRED FOODS: When available, prioritize dishes featuring user's preferred ingredients

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