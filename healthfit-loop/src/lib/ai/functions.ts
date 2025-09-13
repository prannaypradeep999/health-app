// LLM function calling definitions for meal planning orchestration
export const MEAL_PLANNING_FUNCTIONS = [
  {
    name: "find_restaurants_near_user",
    description: "Discover restaurants near user location with optional cuisine and price filtering",
    parameters: {
      type: "object",
      properties: {
        zipcode: {
          type: "string",
          description: "User's ZIP code for location search"
        },
        cuisineType: {
          type: "string", 
          description: "Cuisine filter: italian, chinese, mexican, american, etc."
        },
        priceLevel: {
          type: "number",
          description: "Price filter 1-4 (1=$ to 4=$$$$)",
          minimum: 1,
          maximum: 4
        }
      },
      required: ["zipcode"]
    }
  },
  {
    name: "search_restaurant_menu",
    description: "Search Spoonacular for verified menu items from a specific restaurant chain",
    parameters: {
      type: "object",
      properties: {
        restaurantChain: {
          type: "string",
          description: "Name of restaurant chain (e.g. 'Starbucks', 'Chipotle')"
        },
        maxCalories: {
          type: "number",
          description: "Maximum calories per item"
        },
        minProtein: {
          type: "number", 
          description: "Minimum protein grams per item"
        },
        maxCarbs: {
          type: "number",
          description: "Maximum carbs grams per item"
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
    name: "check_restaurant_data_available",
    description: "Check if a restaurant has verified menu data in Spoonacular database",
    parameters: {
      type: "object",
      properties: {
        restaurantName: {
          type: "string",
          description: "Restaurant name to check for data availability"
        }
      },
      required: ["restaurantName"]
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