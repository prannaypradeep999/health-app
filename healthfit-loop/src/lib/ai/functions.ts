// LLM function calling definitions for meal planning orchestration
export const MEAL_PLANNING_FUNCTIONS = [
  {
    name: "find_verified_healthy_chains",
    description: "Find verified healthy restaurant chains near user with confirmed Spoonacular menu data",
    parameters: {
      type: "object",
      properties: {
        zipcode: {
          type: "string",
          description: "User's ZIP code for location search"
        },
        radiusKm: {
          type: "number",
          description: "Search radius in kilometers (5, 10, or 20 based on user preference)"
        },
        preferHealthier: {
          type: "boolean",
          description: "Whether to prioritize healthier chains over moderate ones",
          default: true
        }
      },
      required: ["zipcode"]
    }
  },
  {
    name: "search_chain_menu_filtered",
    description: "Search Spoonacular for menu items from a specific verified chain with nutrition filtering",
    parameters: {
      type: "object",
      properties: {
        restaurantChain: {
          type: "string",
          description: "Exact name of verified restaurant chain (e.g. 'Sweetgreen', 'Panera Bread')"
        },
        maxCalories: {
          type: "number",
          description: "Maximum calories per item based on user's daily target"
        },
        minProtein: {
          type: "number", 
          description: "Minimum protein grams per item based on user's goals"
        },
        maxCarbs: {
          type: "number",
          description: "Maximum carbs grams per item for user's diet preferences"
        },
        dietaryRestrictions: {
          type: "array",
          items: { type: "string" },
          description: "User's dietary restrictions to filter menu items"
        }
      },
      required: ["restaurantChain"]
    }
  },
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
  },
  {
    name: "find_general_restaurants_fallback",
    description: "Fallback: Find general restaurants near user when no verified chains available",
    parameters: {
      type: "object",
      properties: {
        zipcode: {
          type: "string",
          description: "User's ZIP code for location search"
        },
        cuisineType: {
          type: "string", 
          description: "Preferred cuisine type from user's survey data"
        },
        radiusKm: {
          type: "number",
          description: "Search radius based on user's distance preference"
        }
      },
      required: ["zipcode"]
    }
  },
  {
    name: "create_home_recipe",
    description: "Generate detailed home cooking recipe with nutrition estimates",
    parameters: {
      type: "object",
      properties: {
        recipeName: {
          type: "string",
          description: "Name of recipe to create"
        },
        dietaryRestrictions: {
          type: "array",
          items: { type: "string" },
          description: "Dietary restrictions to consider"
        },
        targetCalories: {
          type: "number",
          description: "Target calorie count for recipe"
        },
        cookingSkill: {
          type: "string",
          description: "Cooking difficulty level",
          enum: ["easy", "medium", "hard"]
        },
        preferredIngredients: {
          type: "array",
          items: { type: "string" },
          description: "User's preferred food ingredients from survey"
        }
      },
      required: ["recipeName", "targetCalories"]
    }
  }
];

export const MEAL_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    meals: {
      type: "array",
      minItems: 21,
      maxItems: 21,
      items: {
        type: "object",
        properties: {
          day: {
            type: "string",
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
          },
          mealType: {
            type: "string", 
            enum: ["breakfast", "lunch", "dinner"]
          },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: {
              type: "object",
              properties: {
                optionNumber: { type: "number", enum: [1, 2] },
                optionType: { type: "string", enum: ["restaurant", "home"] },
                title: { type: "string" },
                description: { type: "string" },
                restaurantName: { type: "string" },
                estimatedPrice: { type: "number" },
                calories: { type: "number" },
                protein: { type: "number" },
                carbs: { type: "number" },
                fat: { type: "number" },
                fiber: { type: "number" },
                sodium: { type: "number" },
                orderingInfo: { type: "string" },
                deliveryTime: { type: "string" },
                ingredients: { type: "array", items: { type: "string" } },
                cookingTime: { type: "number" },
                difficulty: { type: "string" },
                instructions: { type: "string" },
                imageUrl: { type: "string" }
              },
              required: ["optionNumber", "optionType", "title", "estimatedPrice", "calories", "protein", "carbs", "fat"]
            }
          }
        },
        required: ["day", "mealType", "options"]
      }
    }
  },
  required: ["meals"]
};

export type FunctionCall = {
  name: string;
  arguments: string;
};

export type FunctionResult = {
  name: string;
  content: string;
};