// Step 4: Final Meal Plan Creation with Descriptions and Reasoning
import { UserContext } from './prompts';

// NEW: Daily meal plan generation (replaces weekly)
export function buildDailyMealPlanPrompt(userContext: UserContext, day: string, verifiedNutritionData: any): string {
  const { surveyData, targetCalories, weeklyBudgetCents } = userContext;
  const weeklyBudgetDollars = (weeklyBudgetCents / 100).toFixed(2);

  return `You are FYTR AI's daily meal plan architect. Your job is to create ONE DAY of meals (${day.toUpperCase()}) with rich descriptions, goal reasoning, and practical information using ONLY verified nutrition data.

USER PROFILE:
- Name: ${surveyData.firstName}
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Target Calories: ${targetCalories}/day
- Weekly Budget: $${weeklyBudgetDollars}
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}
- Preferred Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'Open to all'}

VERIFIED NUTRITION DATA FOR ${day.toUpperCase()}:
${JSON.stringify(verifiedNutritionData, null, 2)}

DAILY MEAL PLAN REQUIREMENTS:

STRUCTURE FOR ${day.toUpperCase()}:
- 3 meals (breakfast, lunch, dinner)
- 2 restaurant options per meal (home recipes added separately)
- Total: 6 meal options for this day

CALORIE DISTRIBUTION:
- Breakfast: ~${Math.round(targetCalories * 0.25)} calories (lighter start)
- Lunch: ~${Math.round(targetCalories * 0.35)} calories (main fuel)
- Dinner: ~${Math.round(targetCalories * 0.4)} calories (satisfying end)

DESCRIPTION REQUIREMENTS:
1. **Rich Descriptions**: Explain why each dish fits the user's ${surveyData.goal} goal
2. **Goal Reasoning**: Specific benefits for ${surveyData.goal} (protein for muscle, fiber for weight loss, etc.)
3. **Exact Nutrition**: Use ONLY verified Spoonacular data - never estimate
4. **Cost Estimates**: Realistic pricing based on restaurant type and location
5. **Practical Info**: Ordering methods, delivery times, preparation notes

RESPONSE FORMAT FOR ${day.toUpperCase()}:
{{
  "dailyMealPlan": {{
    "${day}": {{
      "breakfast": {{
        "options": [
          {{
            "optionNumber": 1,
            "optionType": "restaurant",
            "restaurantName": "Sweetgreen",
            "dishName": "Citrus Shrimp",
            "description": "Light and protein-packed breakfast featuring sustainably-sourced shrimp with citrus flavors. Perfect for starting your day with clean energy and supporting your ${surveyData.goal} goals through high-quality protein.",
            "goalReasoning": "The 12g of protein helps maintain muscle mass and provides satiety for your ${surveyData.goal} journey, while the low carb content (3g) keeps morning energy stable.",
            "verifiedNutrition": {{
              "calories": 110,
              "protein": 12,
              "carbs": 3,
              "fat": 5,
              "fiber": 0,
              "sodium": 0
            }},
            "priceEstimate": "$$",
            "orderingInfo": "Available on DoorDash, Uber Eats, Grubhub",
            "deliveryTime": "15-25 minutes",
            "healthRating": "Excellent - verified nutrition, lean protein",
            "dataSource": "Verified by Spoonacular"
          }},
          {{
            "optionNumber": 2,
            "optionType": "restaurant",
            "restaurantName": "Panera Bread",
            "dishName": "Greek Yogurt Parfait",
            "description": "Creamy Greek yogurt layered with fresh berries and granola. A balanced breakfast that provides probiotics for gut health and sustained energy for your active lifestyle.",
            "goalReasoning": "High protein content supports ${surveyData.goal} while probiotics aid digestion and nutrient absorption. Complex carbs provide steady energy without blood sugar spikes.",
            "verifiedNutrition": {{
              "calories": 280,
              "protein": 18,
              "carbs": 35,
              "fat": 8,
              "fiber": 4,
              "sodium": 120
            }},
            "priceEstimate": "$$",
            "orderingInfo": "Available on Panera app, delivery platforms",
            "deliveryTime": "10-20 minutes",
            "healthRating": "Very Good - balanced macros, probiotic benefits",
            "dataSource": "Verified by Spoonacular"
          }}
        ]
      }},
      "lunch": {{
        "options": [
          {{
            "optionNumber": 1,
            "optionType": "restaurant",
            "restaurantName": "Sweetgreen",
            "dishName": "Earth Bowl",
            "description": "Nutrient-dense power bowl featuring organic vegetables, quinoa, and lean protein. This signature bowl is designed for peak performance and aligns perfectly with health-conscious goals.",
            "goalReasoning": "With 37g of protein, this bowl provides exceptional muscle-building support for your ${surveyData.goal}. The balanced macros (730 cal, 50g carbs) fuel afternoon activities while keeping you satisfied.",
            "verifiedNutrition": {{
              "calories": 730,
              "protein": 37,
              "carbs": 50,
              "fat": 43,
              "fiber": 0,
              "sodium": 0
            }},
            "priceEstimate": "$$$",
            "orderingInfo": "Available on Sweetgreen app, DoorDash",
            "deliveryTime": "15-25 minutes",
            "healthRating": "Excellent - high protein, whole food ingredients",
            "dataSource": "Verified by Spoonacular"
          }},
          {{
            "optionNumber": 2,
            "optionType": "restaurant",
            "restaurantName": "Panera Bread",
            "dishName": "Mediterranean Bowl",
            "description": "Fresh Mediterranean bowl with quinoa, vegetables, and protein. Nutrient-dense option that supports your ${surveyData.goal} goals with balanced macros.",
            "goalReasoning": "Balanced protein and complex carbs provide sustained energy for your ${surveyData.goal} journey. Mediterranean flavors with anti-inflammatory benefits.",
            "verifiedNutrition": {{
              "calories": 520,
              "protein": 28,
              "carbs": 45,
              "fat": 25,
              "fiber": 8,
              "sodium": 450
            }},
            "priceEstimate": "$$",
            "orderingInfo": "Available on Panera app, delivery platforms",
            "deliveryTime": "15-20 minutes",
            "healthRating": "Very Good - Mediterranean ingredients, balanced nutrition",
            "dataSource": "Verified by Spoonacular"
          }}
        ]
      }},
      "dinner": {{
        "options": [
          {{
            "optionNumber": 1,
            "optionType": "restaurant",
            "restaurantName": "Chipotle",
            "dishName": "Protein Bowl",
            "description": "Build-your-own protein bowl with grilled chicken, black beans, and fresh vegetables. Customizable option perfect for your ${surveyData.goal} goals.",
            "goalReasoning": "High protein content (45g) supports muscle maintenance for your ${surveyData.goal}. Fiber-rich beans and vegetables provide satiety and micronutrients.",
            "verifiedNutrition": {{
              "calories": 650,
              "protein": 45,
              "carbs": 52,
              "fat": 28,
              "fiber": 12,
              "sodium": 980
            }},
            "priceEstimate": "$$",
            "orderingInfo": "Available on Chipotle app, DoorDash, Uber Eats",
            "deliveryTime": "15-25 minutes",
            "healthRating": "Good - high protein, customizable, fiber-rich",
            "dataSource": "Verified by Spoonacular"
          }},
          {{
            "optionNumber": 2,
            "optionType": "restaurant",
            "restaurantName": "Subway",
            "dishName": "Turkey & Avocado Salad",
            "description": "Fresh salad with lean turkey, avocado, and mixed greens. Light but satisfying dinner option that aligns with your ${surveyData.goal} objectives.",
            "goalReasoning": "Lean protein from turkey supports ${surveyData.goal} while healthy fats from avocado provide satiety. Low calorie density helps with portion control.",
            "verifiedNutrition": {{
              "calories": 380,
              "protein": 32,
              "carbs": 18,
              "fat": 22,
              "fiber": 8,
              "sodium": 720
            }},
            "priceEstimate": "$$",
            "orderingInfo": "Available on Subway app, delivery platforms",
            "deliveryTime": "10-20 minutes",
            "healthRating": "Excellent - lean protein, healthy fats, low calorie",
            "dataSource": "Verified by Spoonacular"
          }}
        ]
      }}
    }}
  }},
  "daySummary": {{
    "day": "${day}",
    "totalMealOptions": 6,
    "estimatedDailyCost": "$35-50",
    "averageCaloriesPerMeal": 450,
    "totalDailyProtein": 180,
    "goalAlignment": "All ${day} meals selected specifically to support ${surveyData.goal} through optimal protein distribution, calorie control, and nutrient density."
  }}
}}

CRITICAL REQUIREMENTS:
- Use ONLY verified nutrition data from the provided dataset
- NEVER estimate or invent nutrition values
- Provide rich, detailed descriptions for each meal
- Explain specifically how each meal supports the user's ${surveyData.goal} goal
- Include realistic cost estimates based on restaurant type
- Focus on lunch and dinner for primary calories and variety
- Maintain dietary restrictions: ${surveyData.dietPrefs.join(', ') || 'none'}
- Select diverse options for this ${day} to provide user choice

PRICING GUIDELINES (Based on ${surveyData.budgetTier} budget tier):
- Fast-casual chains (Sweetgreen, Panera): ${surveyData.budgetTier === 'low' ? '$6-10' : surveyData.budgetTier === 'high' || surveyData.budgetTier === 'premium' ? '$10-18' : '$8-15'} per meal
- Quick service (Subway, Qdoba): ${surveyData.budgetTier === 'low' ? '$4-8' : surveyData.budgetTier === 'high' || surveyData.budgetTier === 'premium' ? '$8-14' : '$6-12'} per meal
- Add 20-25% for delivery fees and tips
- Consider local market pricing and user's weekly budget of $${weeklyBudgetDollars}

EXECUTION: Create ${day.toUpperCase()} meal plan with 2 restaurant options per meal (home recipes added separately), rich descriptions, and verified nutrition data only.`;
}

// LEGACY: Keep original weekly function for fallback
export function buildFinalMealPlanPrompt(userContext: UserContext, verifiedNutritionData: any): string {
  const { surveyData, targetCalories, weeklyBudgetCents } = userContext;
  const weeklyBudgetDollars = (weeklyBudgetCents / 100).toFixed(2);

  return `You are FYTR AI's meal plan architect. Your job is to create the final weekly meal plan with rich descriptions, goal reasoning, and practical information using ONLY verified nutrition data.

USER PROFILE:
- Name: ${surveyData.firstName}
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Target Calories: ${targetCalories}/day
- Weekly Budget: $${weeklyBudgetDollars}
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}
- Preferred Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'Open to all'}

VERIFIED NUTRITION DATA:
${JSON.stringify(verifiedNutritionData, null, 2)}

MEAL PLAN REQUIREMENTS:

STRUCTURE:
- 7 days (Monday through Sunday)
- 3 meals per day (breakfast, lunch, dinner)
- 2 restaurant options per meal (home recipes added separately)
- Total: 42 restaurant meal options (21 meals × 2 options each)

CALORIE DISTRIBUTION:
- Breakfast: ~${Math.round(targetCalories * 0.25)} calories (lighter start)
- Lunch: ~${Math.round(targetCalories * 0.35)} calories (main fuel)
- Dinner: ~${Math.round(targetCalories * 0.4)} calories (satisfying end)

DESCRIPTION REQUIREMENTS:
1. **Rich Descriptions**: Explain why each dish fits the user's ${surveyData.goal} goal
2. **Goal Reasoning**: Specific benefits for ${surveyData.goal} (protein for muscle, fiber for weight loss, etc.)
3. **Exact Nutrition**: Use ONLY verified Spoonacular data - never estimate
4. **Cost Estimates**: Realistic pricing based on restaurant type and location
5. **Practical Info**: Ordering methods, delivery times, preparation notes

RESPONSE FORMAT:
{
  "weeklyMealPlan": {
    "monday": {
      "breakfast": {
        "options": [
          {
            "optionNumber": 1,
            "optionType": "restaurant",
            "restaurantName": "Sweetgreen",
            "dishName": "Citrus Shrimp",
            "description": "Light and protein-packed breakfast...",
            "goalReasoning": "The 12g of protein helps...",
            "verifiedNutrition": {
              "calories": 110,
              "protein": 12,
              "carbs": 3,
              "fat": 5,
              "fiber": 0,
              "sodium": 0
            },
            "priceEstimate": "$$",
            "orderingInfo": "Available on DoorDash, Uber Eats, Grubhub",
            "deliveryTime": "15-25 minutes",
            "healthRating": "Excellent - verified nutrition, lean protein",
            "dataSource": "Verified by Spoonacular"
          }
        ]
      }
    }
  },
  "weekSummary": {
    "totalMeals": 21,
    "averageDailyCalories": 2000,
    "averageDailyProtein": 150,
    "estimatedWeeklyCost": "$180-220",
    "restaurantDistribution": {
      "Sweetgreen": 8,
      "Panera Bread": 6,
      "Subway": 4,
      "Qdoba": 3
    },
    "goalAlignment": "All meals selected specifically to support ${surveyData.goal} through optimal protein distribution, calorie control, and nutrient density."
  }
}

CRITICAL REQUIREMENTS:
- Use ONLY verified nutrition data from the provided dataset
- NEVER estimate or invent nutrition values
- Provide rich, detailed descriptions for each meal
- Explain specifically how each meal supports the user's ${surveyData.goal} goal
- Include realistic cost estimates based on restaurant type
- Ensure variety across the week while allowing strategic repetition
- Focus on lunch and dinner for primary calories and variety
- Maintain dietary restrictions: ${surveyData.dietPrefs.join(', ') || 'none'}

EXECUTION: Create a complete 7-day meal plan with 2 restaurant options per meal (home recipes will be added separately), rich descriptions, and verified nutrition data only.`;
}

// No function calling needed for this step - it's pure meal plan composition
