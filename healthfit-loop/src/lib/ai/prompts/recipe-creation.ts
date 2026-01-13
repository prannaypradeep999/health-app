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
NUTRITION TARGETS (recipe MUST match these closely):
- Calories: ${context.nutritionTargets.calories} cal (±50 cal)
- Protein: ${context.nutritionTargets.protein}g (±5g)
- Carbs: ${context.nutritionTargets.carbs}g (±10g)
- Fat: ${context.nutritionTargets.fat}g (±5g)

IMPORTANT: Adjust portion sizes and ingredients to hit these targets.` : '';

  const grocerySection = context.existingGroceryItems?.length ? `
PREFERRED INGREDIENTS (prioritize using these from user's grocery list):
${context.existingGroceryItems.map(item => `- ${item}`).join('\n')}

Try to use ingredients from this list when possible to minimize waste.` : '';

  const dietarySection = context.dietaryRestrictions?.length ? `
DIETARY RESTRICTIONS (must follow):
${context.dietaryRestrictions.map(r => `- ${r}`).join('\n')}` : '';

  return `You are a professional chef and nutritionist. Generate a comprehensive, detailed recipe for "${context.dishName}".

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