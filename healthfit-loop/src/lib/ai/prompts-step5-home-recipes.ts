// Step 5: Home Recipe Generation - Separate from restaurant workflow
import { UserContext } from './prompts';

export function buildHomeRecipeGenerationPrompt(userContext: UserContext, mealDistribution: any): string {
  const { surveyData, targetCalories } = userContext;

  return `You are FYTR AI's home recipe specialist. Your job is to generate healthy, goal-aligned home-cooked recipes that complement the restaurant meal plan.

USER PROFILE:
- Name: ${surveyData.firstName}
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Target Calories: ${targetCalories}/day
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}
- Preferred Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'Open to all'}
- Preferred Foods: ${(surveyData as any).preferredFoods?.join(', ') || 'Variety of healthy ingredients'}

MEAL DISTRIBUTION NEEDED:
${JSON.stringify(mealDistribution, null, 2)}

HOME RECIPE REQUIREMENTS:

CALORIE TARGETS:
- Breakfast: ~${Math.round(targetCalories * 0.25)} calories
- Lunch: ~${Math.round(targetCalories * 0.35)} calories
- Dinner: ~${Math.round(targetCalories * 0.4)} calories

GOAL-SPECIFIC NUTRITION:
${surveyData.goal === 'WEIGHT_LOSS' ? '- Weight Loss: High protein (25-30g), moderate carbs, high fiber (8-12g), controlled portions' : ''}
${surveyData.goal === 'MUSCLE_GAIN' ? '- Muscle Gain: High protein (30-40g), complex carbs for energy, nutrient-dense ingredients' : ''}
${surveyData.goal === 'ENDURANCE' ? '- Endurance: Balanced macros, anti-inflammatory ingredients, sustained energy sources' : ''}

DIETARY FILTERING:
${surveyData.dietPrefs.includes('vegetarian') ? '- VEGETARIAN: No meat or fish, include plant-based proteins (legumes, tofu, tempeh, eggs, dairy)' : ''}
${surveyData.dietPrefs.includes('vegan') ? '- VEGAN: No animal products, focus on legumes, nuts, seeds, whole grains for protein' : ''}
${surveyData.dietPrefs.includes('paleo') ? '- PALEO: Whole foods only, no grains/legumes, emphasize quality proteins and vegetables' : ''}
${surveyData.dietPrefs.includes('keto') ? '- KETO: Very low carb (<10g net), high healthy fats, moderate protein' : ''}

RECIPE COMPLEXITY:
- Prioritize EASY recipes (15-20 minutes total time)
- Include some MODERATE complexity options for variety
- Focus on minimal prep and cleanup
- Use common, accessible ingredients

COST EFFICIENCY (Based on ${surveyData.budgetTier} budget tier):
- Target ${surveyData.budgetTier === 'low' ? '$2-4' : surveyData.budgetTier === 'high' || surveyData.budgetTier === 'premium' ? '$4-8' : '$3-6'} per serving
- Use budget-friendly protein sources ${surveyData.budgetTier === 'low' ? '(eggs, legumes, canned tuna)' : surveyData.budgetTier === 'premium' ? '(organic proteins, specialty ingredients welcome)' : '(mix of affordable and quality proteins)'}
- Incorporate seasonal vegetables to reduce costs
- ${surveyData.budgetTier === 'low' ? 'Minimize specialty ingredients, focus on pantry staples' : surveyData.budgetTier === 'premium' ? 'Include premium ingredients when they enhance nutrition' : 'Balance cost and quality ingredients'}

RESPONSE FORMAT:
{{
  "homeRecipes": {{
    "breakfast": [
      {{
        "recipeName": "${surveyData.goal === 'WEIGHT_LOSS' ? 'High-Fiber Protein Bowl' : surveyData.goal === 'MUSCLE_GAIN' ? 'High-Protein Power Oats' : 'Balanced Energy Breakfast'}",
        "targetMeals": ["Monday Breakfast", "Thursday Breakfast"],
        "description": "${surveyData.goal === 'WEIGHT_LOSS' ? 'Fiber-rich breakfast bowl with protein to keep you full and satisfied' : 'Protein-packed breakfast'} with ${surveyData.preferredCuisines?.includes('mediterranean') ? 'Mediterranean-inspired ingredients' : surveyData.preferredCuisines?.includes('asian') ? 'Asian-inspired flavors' : 'fresh, wholesome ingredients'}, perfectly designed for your ${surveyData.goal} goals. This ${surveyData.goal === 'WEIGHT_LOSS' ? 'satisfying yet light' : 'energy-boosting'} breakfast ${surveyData.goal === 'MUSCLE_GAIN' ? 'delivers muscle-supporting protein' : 'provides sustained energy'}.",
        "goalReasoning": "The ${surveyData.goal === 'WEIGHT_LOSS' ? '20g protein and 8g fiber help control appetite and support your weight loss journey' : surveyData.goal === 'MUSCLE_GAIN' ? '25g+ protein supports muscle recovery and growth for your muscle-building goals' : '20-25g protein provides sustained energy and muscle maintenance'}, while ${surveyData.dietPrefs.includes('keto') ? 'low carb content keeps you in ketosis' : 'complex carbs provide steady energy without blood sugar spikes'}.",
        "ingredients": [
          "${surveyData.dietPrefs.includes('keto') ? '1/4 cup chia seeds' : '1/2 cup rolled oats'}",
          "${surveyData.dietPrefs.includes('vegan') ? '1/2 cup coconut yogurt' : '1/2 cup Greek yogurt (plain, nonfat)'}",
          "1 tbsp ${surveyData.dietPrefs.includes('keto') ? 'coconut oil' : 'chia seeds'}",
          "${surveyData.goal === 'WEIGHT_LOSS' ? '1/3 cup mixed berries' : '1/2 cup mixed berries'}",
          "1 tbsp ${surveyData.preferredCuisines?.includes('mediterranean') ? 'tahini' : 'almond butter'}",
          "${surveyData.dietPrefs.includes('vegan') ? '1 tsp maple syrup' : '1 tsp honey'}",
          "1/4 cup ${surveyData.dietPrefs.includes('vegan') ? 'oat milk' : 'unsweetened almond milk'}"
        ],
        "instructions": [
          "Combine oats, chia seeds, and almond milk in a mason jar",
          "Stir in Greek yogurt and honey until well combined",
          "Layer in half the berries",
          "Refrigerate overnight (at least 4 hours)",
          "In the morning, top with remaining berries and almond butter",
          "Enjoy cold or warm slightly if preferred"
        ],
        "nutrition": {
          "calories": 380,
          "protein": 25,
          "carbs": 42,
          "fat": 12,
          "fiber": 8,
          "sodium": 95
        },
        "cookingTime": 0,
        "prepTime": 5,
        "totalTime": 5,
        "difficulty": "Easy",
        "servings": 1,
        "estimatedCost": ${surveyData.budgetTier === 'low' ? '250' : surveyData.budgetTier === 'high' || surveyData.budgetTier === 'premium' ? '450' : '350'},
        "dietaryTags": ["vegetarian", "gluten-free-option"],
        "makeAheadFriendly": true
      }}
    ],
    "lunch": [
      {{
        "recipeName": "Power Bowl with Grilled Chicken",
        "targetMeals": ["Tuesday Lunch", "Saturday Lunch"],
        "description": "Nutrient-packed bowl with lean protein, quinoa, and colorful vegetables. This restaurant-quality meal at home provides everything you need to fuel your ${surveyData.goal} goals while saving money.",
        "goalReasoning": "With 35g of complete protein and complex carbs, this bowl provides optimal nutrition for ${surveyData.goal}. The variety of vegetables delivers micronutrients essential for recovery and performance.",
        "ingredients": [
          "5 oz grilled chicken breast",
          "3/4 cup cooked quinoa",
          "1 cup roasted sweet potato cubes",
          "1 cup steamed broccoli",
          "1/4 avocado, sliced",
          "2 tbsp tahini dressing",
          "1 tbsp pumpkin seeds",
          "Fresh herbs for garnish"
        ],
        "instructions": [
          "Season and grill chicken breast until cooked through (165°F internal temp)",
          "Cook quinoa according to package directions",
          "Roast sweet potato cubes at 425°F for 20-25 minutes",
          "Steam broccoli until tender-crisp",
          "Assemble bowl with quinoa as base",
          "Top with chicken, vegetables, and avocado",
          "Drizzle with tahini dressing and sprinkle pumpkin seeds"
        ],
        "nutrition": {{
          "calories": ${surveyData.goal === 'WEIGHT_LOSS' ? '420' : surveyData.goal === 'MUSCLE_GAIN' ? '620' : '520'},
          "protein": ${surveyData.goal === 'MUSCLE_GAIN' ? '40' : '35'},
          "carbs": ${surveyData.dietPrefs.includes('keto') ? '15' : surveyData.goal === 'WEIGHT_LOSS' ? '35' : '48'},
          "fat": ${surveyData.dietPrefs.includes('keto') ? '35' : '22'},
          "fiber": 10,
          "sodium": 380
        }},
        "cookingTime": 25,
        "prepTime": 10,
        "totalTime": 35,
        "difficulty": "Moderate",
        "servings": 1,
        "estimatedCost": ${surveyData.budgetTier === 'low' ? '450' : surveyData.budgetTier === 'high' || surveyData.budgetTier === 'premium' ? '650' : '550'},
        "dietaryTags": [${surveyData.dietPrefs.includes('vegetarian') ? '"vegetarian"' : '"gluten-free"'}, "high-protein"],
        "mealPrepFriendly": true
      }}
    ],
    "dinner": [
      {{
        "recipeName": "Baked Salmon with Roasted Vegetables",
        "targetMeals": ["Wednesday Dinner", "Sunday Dinner"],
        "description": "Omega-3 rich salmon with colorful roasted vegetables makes for a restaurant-quality dinner at home. Perfect for your ${surveyData.goal} goals with anti-inflammatory benefits and satisfying portions.",
        "goalReasoning": "Salmon provides high-quality protein and omega-3s that support muscle recovery and reduce inflammation - crucial for your ${surveyData.goal}. The fiber-rich vegetables aid digestion and provide essential micronutrients.",
        "ingredients": [
          "6 oz salmon fillet",
          "1 cup Brussels sprouts, halved",
          "1 medium zucchini, sliced",
          "1/2 red bell pepper, strips",
          "2 tbsp olive oil",
          "1 lemon, juiced and zested",
          "2 cloves garlic, minced",
          "Fresh dill, chopped",
          "Salt and pepper to taste"
        ],
        "instructions": [
          "Preheat oven to 425°F",
          "Toss vegetables with 1 tbsp olive oil, salt, and pepper",
          "Roast vegetables for 15 minutes",
          "Season salmon with salt, pepper, lemon zest, and dill",
          "Heat remaining oil in oven-safe skillet",
          "Sear salmon skin-side up for 3 minutes",
          "Flip salmon and transfer skillet to oven",
          "Bake 8-10 minutes until salmon flakes easily",
          "Serve with lemon juice and roasted vegetables"
        ],
        "nutrition": {
          "calories": 450,
          "protein": 36,
          "carbs": 15,
          "fat": 28,
          "fiber": 6,
          "sodium": 320
        },
        "cookingTime": 20,
        "prepTime": 10,
        "totalTime": 30,
        "difficulty": "Moderate",
        "servings": 1,
        "estimatedCost": ${surveyData.budgetTier === 'low' ? '650' : surveyData.budgetTier === 'high' || surveyData.budgetTier === 'premium' ? '1050' : '850'},
        "dietaryTags": [${surveyData.dietPrefs.includes('paleo') ? '"paleo"' : surveyData.dietPrefs.includes('keto') ? '"keto-friendly"' : '"gluten-free"'}, "high-protein", ${surveyData.goal === 'ENDURANCE' ? '"omega-3-rich"' : '"nutrient-dense"'}],
        "specialEquipment": ["oven-safe skillet"]
      }}
    ]
  }},
  "recipeSummary": {{
    "totalRecipes": 6,
    "averageCaloriesPerMeal": ${surveyData.goal === 'WEIGHT_LOSS' ? '380' : surveyData.goal === 'MUSCLE_GAIN' ? '520' : '450'},
    "averageProteinPerMeal": ${surveyData.goal === 'MUSCLE_GAIN' ? '38' : '32'},
    "averageCostPerMeal": ${surveyData.budgetTier === 'low' ? '450' : surveyData.budgetTier === 'high' || surveyData.budgetTier === 'premium' ? '720' : '580'},
    "difficultyDistribution": {{
      "easy": 2,
      "moderate": 4
    }},
    "averagePrepTime": 8,
    "averageCookTime": 15,
    "goalAlignment": "All recipes specifically designed for ${surveyData.goal} with optimal macro distribution and ingredient selection"
  }}
}}

CRITICAL REQUIREMENTS:
- All recipes must align with user's dietary restrictions: ${surveyData.dietPrefs.join(', ') || 'none'}
- Include detailed nutritional calculations for each recipe
- Provide practical cooking instructions with timing
- Focus on ingredients user prefers: ${(surveyData as any).preferredFoods?.join(', ') || 'variety of healthy options'}
- Ensure recipes complement restaurant meals (variety in cuisines and preparation methods)
- Include estimated costs for budget planning
- Mark recipes suitable for meal prep when applicable

EXECUTION: Generate a complete set of home recipes that provide the third option for each meal type, designed to work alongside the restaurant meal plan.`;
}

export function buildWeeklyRecipeDistributionPrompt(restaurantMealPlan: any): string {
  return `Based on the restaurant meal plan provided, determine which days need home-cooked recipe options to complete the 7-day meal plan with 3 options per meal (2 restaurant + 1 home-cooked).

RESTAURANT MEAL PLAN ANALYSIS:
${JSON.stringify(restaurantMealPlan, null, 2)}

TASK: For each day of the week (Monday-Sunday) and each meal type (breakfast, lunch, dinner), identify which meals need a home-cooked option added as the third choice.

Return the distribution in this format:
{
  "recipeDistribution": {
    "monday": {
      "breakfast": { "needsHomeOption": true, "targetCalories": 300 },
      "lunch": { "needsHomeOption": true, "targetCalories": 420 },
      "dinner": { "needsHomeOption": true, "targetCalories": 480 }
    },
    // ... for all 7 days
  },
  "totalRecipesNeeded": 21,
  "recipesPerMealType": {
    "breakfast": 7,
    "lunch": 7,
    "dinner": 7
  }
}`;
}