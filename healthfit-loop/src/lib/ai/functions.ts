// Function calling definitions for ChatGPT meal planning
export const MEAL_PLANNING_FUNCTIONS = [
  {
    name: "find_local_restaurants",
    description: "Find restaurants near user's location using Google Places API",
    parameters: {
      type: "object",
      properties: {
        zipcode: {
          type: "string",
          description: "User's ZIP code"
        },
        cuisineType: {
          type: "string", 
          description: "Type of cuisine (italian, chinese, mexican, etc.)"
        },
        priceLevel: {
          type: "number",
          description: "Price level 1-4 (1=$ to 4=$$)",
          minimum: 1,
          maximum: 4
        }
      },
      required: ["zipcode"]
    }
  },
  {
    name: "get_recipe_instructions",
    description: "Get detailed cooking instructions for a home recipe",
    parameters: {
      type: "object",
      properties: {
        recipeName: {
          type: "string",
          description: "Name of the recipe"
        },
        dietaryRestrictions: {
          type: "array",
          items: { type: "string" },
          description: "Any dietary restrictions to consider"
        },
        cookingSkill: {
          type: "string",
          description: "User's cooking skill level",
          enum: ["beginner", "intermediate", "advanced"]
        }
      },
      required: ["recipeName"]
    }
  }
];

// JSON Schema for meal plan response structure
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
                optionNumber: { 
                  type: "number", 
                  enum: [1, 2] 
                },
                optionType: { 
                  type: "string", 
                  enum: ["restaurant", "home"] 
                },
                title: { 
                  type: "string",
                  description: "Name of the meal/dish"
                },
                description: { 
                  type: "string" 
                },
                restaurantName: { 
                  type: "string",
                  description: "Required for restaurant options"
                },
                estimatedPrice: { 
                  type: "number",
                  description: "Price in cents"
                },
                calories: { 
                  type: "number" 
                },
                protein: { 
                  type: "number" 
                },
                carbs: { 
                  type: "number" 
                },
                fat: { 
                  type: "number" 
                },
                fiber: { 
                  type: "number" 
                },
                sodium: { 
                  type: "number" 
                },
                orderingInfo: { 
                  type: "string",
                  description: "How to order (DoorDash link, phone, etc.)"
                },
                deliveryTime: { 
                  type: "string",
                  description: "Estimated delivery time"
                },
                ingredients: { 
                  type: "array",
                  items: { type: "string" },
                  description: "Required for home cooking options"
                },
                cookingTime: { 
                  type: "number",
                  description: "Cooking time in minutes for home options"
                },
                difficulty: { 
                  type: "string",
                  enum: ["easy", "medium", "hard"]
                },
                instructions: { 
                  type: "string",
                  description: "Cooking instructions for home options"
                }
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

// Function implementations
export type FunctionCall = {
  name: string;
  arguments: string;
};

export type FunctionResult = {
  name: string;
  content: string;
};