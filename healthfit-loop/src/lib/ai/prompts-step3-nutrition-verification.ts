// Step 3: Nutrition Data Verification via Spoonacular Details API
import { UserContext } from './prompts';

export function buildNutritionVerificationPrompt(userContext: UserContext, selectedMenuItems: any): string {
  const { surveyData } = userContext;

  // Extract all item IDs that need nutrition verification
  const allItemIds = [
    ...selectedMenuItems.breakfast.map((item: any) => item.itemId),
    ...selectedMenuItems.lunch.map((item: any) => item.itemId),
    ...selectedMenuItems.dinner.map((item: any) => item.itemId)
  ];

  return `You are FYTR AI's nutrition verification specialist. Your job is to fetch detailed, verified nutrition data for the selected menu items using Spoonacular's nutrition API.

USER PROFILE:
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}

SELECTED MENU ITEMS TO VERIFY:
${JSON.stringify(selectedMenuItems, null, 2)}

NUTRITION VERIFICATION WORKFLOW:

PHASE 1: FETCH DETAILED NUTRITION DATA
For each selected menu item, call get_menu_item_nutrition(itemId=[ID]) to get:
- Exact calories, protein, carbs, fat, fiber, sodium
- Verified serving size information
- Any additional nutritional details

PHASE 2: VALIDATE AGAINST USER GOALS
Verify each item meets the user's requirements:
- Calorie ranges appropriate for meal type
- Protein content supports ${surveyData.goal} goals
- Dietary restrictions are met: ${surveyData.dietPrefs.join(', ') || 'none'}

PHASE 3: FLAG ISSUES
If any items don't meet requirements or have missing nutrition data:
- Note the specific issues
- Suggest replacements from the same restaurant if possible

RESPONSE FORMAT:
{{
  "verifiedNutrition": {{
    "breakfast": [
      {{
        "itemId": 364027,
        "restaurantName": "Sweetgreen",
        "itemTitle": "Citrus Shrimp",
        "verifiedNutrition": {{
          "calories": 110,
          "protein": 12,
          "carbs": 3,
          "fat": 5,
          "fiber": 0,
          "sodium": 0
        }},
        "goalAlignment": "✅ Good protein for ${surveyData.goal}, low calories perfect for breakfast",
        "dietaryCompliance": "✅ Meets all restrictions",
        "servingInfo": "73g serving size",
        "dataSource": "Verified by Spoonacular"
      }}
    ],
    "lunch": [
      {{
        "itemId": 363992,
        "restaurantName": "Sweetgreen",
        "itemTitle": "Earth Bowl", 
        "verifiedNutrition": {{
          "calories": 730,
          "protein": 37,
          "carbs": 50,
          "fat": 43,
          "fiber": 0,
          "sodium": 0
        }},
        "goalAlignment": "⚠️ High calories for lunch target, but excellent protein for ${surveyData.goal}",
        "dietaryCompliance": "✅ Meets all restrictions",
        "servingInfo": "369g serving size",
        "dataSource": "Verified by Spoonacular"
      }}
    ],
    "dinner": [
      // Similar structure for dinner items
    ]
  }},
  "nutritionSummary": {{
    "totalItemsVerified": 15,
    "itemsWithIssues": [
      {
        "itemId": 123456,
        "issue": "Exceeds target calories for meal type",
        "recommendation": "Use as dinner option instead of lunch"
      }
    ],
    "averageCaloriesPerMeal": {
      "breakfast": 250,
      "lunch": 520,
      "dinner": 650
    },
    "nextStep": "Create final meal plan with descriptions and recommendations"
  }}
}}

CRITICAL REQUIREMENTS:
- Call get_menu_item_nutrition() for EVERY selected item ID
- Use only verified nutrition data from Spoonacular responses
- Never estimate or guess nutrition values
- Flag items that don't align with user goals or dietary needs
- Provide clear reasoning for each item's suitability
- Note any missing or incomplete nutrition data

EXECUTION: Systematically verify nutrition for all selected items and prepare for final meal plan creation.`;
}

export const NUTRITION_VERIFICATION_FUNCTIONS = [
  {
    name: "get_menu_item_nutrition",
    description: "Get detailed verified nutrition facts for a specific Spoonacular menu item",
    parameters: {
      type: "object",
      properties: {
        itemId: {
          type: "number",
          description: "Spoonacular menu item ID"
        }
      },
      required: ["itemId"]
    }
  }
];
