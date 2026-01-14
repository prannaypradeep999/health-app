// Recipe Generation Prompts

export interface RecipeContext {
  dishName: string;
  description?: string;
  mealType: string;
  // NEW: Add nutrition targets
  nutritionTargets?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  // NEW: Add existing grocery list items to use
  existingGroceryItems?: string[];
  // NEW: User dietary restrictions
  dietaryRestrictions?: string[];
}

export interface Recipe {
  name: string;
  description: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  servings: number;
  difficulty: string;
  cuisine: string;
  tags: string[];
  groceryList: Array<{
    ingredient: string;
    amount: string;
    category: string;
    note?: string;
  }>;
  ingredients: string[];
  instructions: string[];
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium: number;
  };
  tips: string[];
  storage: string;
  reheatInstructions: string;
}

// Main Recipe Generation Prompt
export const createRecipeGenerationPrompt = (context: RecipeContext): string => {
  const nutritionSection = context.nutritionTargets ? `
⚠️ CRITICAL - EXACT NUTRITION REQUIREMENTS (NON-NEGOTIABLE):
These macros are ALREADY displayed to the user in their meal plan.
Your recipe MUST produce these EXACT values:

- Calories: ${context.nutritionTargets.calories} cal
- Protein: ${context.nutritionTargets.protein}g
- Carbs: ${context.nutritionTargets.carbs}g
- Fat: ${context.nutritionTargets.fat}g

REQUIREMENTS:
1. Adjust ingredient quantities to hit these exact targets
2. Scale portions up or down as needed
3. In your JSON response, the "nutrition" object MUST contain these EXACT numbers:
   "nutrition": {
     "calories": ${context.nutritionTargets.calories},
     "protein": ${context.nutritionTargets.protein},
     "carbs": ${context.nutritionTargets.carbs},
     "fat": ${context.nutritionTargets.fat},
     "fiber": <your calculation>,
     "sodium": <your calculation>
   }

DO NOT return different nutrition values - use exactly these numbers.
The recipe instructions should guide the user to produce a meal matching these macros.` : '';

  const grocerySection = context.existingGroceryItems?.length ? `
PREFERRED INGREDIENTS (prioritize using these from user's grocery list):
${context.existingGroceryItems.map(item => `- ${item}`).join('\n')}

Try to use ingredients from this list when possible to minimize waste.` : '';

  const dietarySection = context.dietaryRestrictions?.length ? `
DIETARY RESTRICTIONS (must follow):
${context.dietaryRestrictions.map(r => `- ${r}`).join('\n')}` : '';

  const ingredientReference = `
INGREDIENT REFERENCE TABLE (use for accurate portion scaling):
Use these values when adjusting ingredient quantities to hit macro targets:

PROTEINS:
- Egg (large): 72 cal, 6g protein, 0.4g carbs, 5g fat
- Chicken breast (4oz): 165 cal, 31g protein, 0g carbs, 3.6g fat
- Salmon (4oz): 208 cal, 23g protein, 0g carbs, 12g fat
- Ground beef 90% lean (4oz): 200 cal, 23g protein, 0g carbs, 11g fat
- Tofu firm (4oz): 94 cal, 10g protein, 2g carbs, 5g fat
- Greek yogurt (1 cup): 130 cal, 17g protein, 8g carbs, 0.7g fat
- Shrimp (4oz): 120 cal, 23g protein, 1g carbs, 2g fat

GRAINS:
- Rice (1 cup cooked): 206 cal, 4g protein, 45g carbs, 0.4g fat
- Quinoa (1 cup cooked): 222 cal, 8g protein, 39g carbs, 4g fat
- Oats (1/2 cup dry): 154 cal, 5g protein, 27g carbs, 2.5g fat
- Pasta (2oz dry): 200 cal, 7g protein, 42g carbs, 1g fat
- Bread whole wheat (1 slice): 81 cal, 4g protein, 14g carbs, 1g fat

FATS:
- Olive oil (1 tbsp): 119 cal, 0g protein, 0g carbs, 13.5g fat
- Butter (1 tbsp): 102 cal, 0g protein, 0g carbs, 12g fat
- Avocado (half): 161 cal, 2g protein, 9g carbs, 15g fat
- Almonds (1oz): 164 cal, 6g protein, 6g carbs, 14g fat

VEGETABLES:
- Broccoli (1 cup): 55 cal, 4g protein, 11g carbs, 0.5g fat
- Spinach cooked (1 cup): 41 cal, 5g protein, 7g carbs, 0g fat
- Bell pepper (1 medium): 30 cal, 1g protein, 7g carbs, 0g fat
- Sweet potato (1 medium): 103 cal, 2g protein, 24g carbs, 0g fat

Scale ingredient quantities up or down to hit the exact macro targets.
For ingredients not listed, use standard nutritional knowledge.`;

  return `You are a professional chef and nutritionist. Generate a comprehensive, detailed recipe for "${context.dishName}".
${ingredientReference}

DISH DETAILS:
- Name: ${context.dishName}
- Description: ${context.description || 'No description provided'}
- Meal Type: ${context.mealType}
${nutritionSection}
${grocerySection}
${dietarySection}

REQUIREMENTS:
1. Create a complete recipe with detailed ingredients and step-by-step instructions
2. ${context.nutritionTargets ? 'CRITICAL: Match the nutrition targets above as closely as possible' : 'Include accurate nutritional information'}
3. ${context.existingGroceryItems?.length ? 'Prioritize ingredients from the user\'s existing grocery list' : 'Provide a comprehensive grocery list with specific quantities'}
4. Make it practical and achievable for home cooking
5. Focus on fresh, healthy ingredients

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "name": "${context.dishName}",
  "description": "Brief appetizing description of the dish",
  "prepTime": "15 min",
  "cookTime": "25 min",
  "totalTime": "40 min",
  "servings": 2,
  "difficulty": "Easy|Medium|Hard",
  "cuisine": "Type of cuisine",
  "tags": ["healthy", "protein-rich", "quick"],
  "groceryList": [
    {
      "ingredient": "Chicken breast",
      "amount": "1 lb",
      "category": "Meat",
      "note": "boneless, skinless"
    },
    {
      "ingredient": "Olive oil",
      "amount": "2 tbsp",
      "category": "Pantry",
      "note": "extra virgin"
    }
  ],
  "ingredients": [
    "1 lb chicken breast, boneless and skinless",
    "2 tbsp extra virgin olive oil",
    "1 tsp salt",
    "1/2 tsp black pepper"
  ],
  "instructions": [
    "Preheat oven to 375°F (190°C).",
    "Season chicken breast with salt and pepper on both sides.",
    "Heat olive oil in an oven-safe skillet over medium-high heat.",
    "Sear chicken breast for 3-4 minutes per side until golden brown.",
    "Transfer skillet to preheated oven and bake for 15-20 minutes until internal temperature reaches 165°F (74°C).",
    "Let rest for 5 minutes before slicing and serving."
  ],
  "nutrition": {
    "calories": ${context.nutritionTargets?.calories || 320},
    "protein": ${context.nutritionTargets?.protein || 45},
    "carbs": ${context.nutritionTargets?.carbs || 2},
    "fat": ${context.nutritionTargets?.fat || 14},
    "fiber": 0,
    "sodium": 580
  },
  "tips": [
    "Use a meat thermometer to ensure chicken is cooked through",
    "Let chicken rest to retain juices"
  ],
  "storage": "Store leftovers in refrigerator for up to 3 days",
  "reheatInstructions": "Reheat in 350°F oven for 10-12 minutes or microwave for 1-2 minutes"
}

CRITICAL: Response must be pure JSON starting with { and ending with }. No markdown, no explanations, no extra text.`;
};