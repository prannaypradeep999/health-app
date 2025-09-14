// Fixed meal-orchestrator.ts - Complete with proper data flow
import { UserContext } from './prompts';
import { buildRestaurantDiscoveryPrompt, RESTAURANT_DISCOVERY_FUNCTIONS } from './prompts-step1-restaurant-discovery';
import { buildMenuSelectionPrompt } from './prompts-step2-menu-selection';
import { buildNutritionVerificationPrompt, NUTRITION_VERIFICATION_FUNCTIONS } from './prompts-step3-nutrition-verification';
import { buildFinalMealPlanPrompt, buildDailyMealPlanPrompt } from './prompts-step4-final-meal-plan';
import { buildHomeRecipeGenerationPrompt } from './prompts-step5-home-recipes';
import { spoonacularClient } from '../external/spoonacular-client';
import { googlePlacesClient } from '../external/places-client';
import { PROMPT_CONFIG } from '../config/meal-planning';
import { spoonacularAuditor } from '../utils/spoonacular-audit';

const OPENAI_API_KEY = process.env.GPT_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('GPT_KEY environment variable is required');
}

export async function generateRestaurantMealPlan(userContext: UserContext): Promise<any> {
  const orchestratorStartTime = Date.now();
  console.log('[Meal-Orchestrator] Starting 6-step restaurant + home meal plan generation with PARALLEL PROCESSING');

  try {
    // STEP 1: Restaurant Discovery (LLM + Function Calling)
    console.log('[Meal-Orchestrator] Step 1: Restaurant Discovery');
    const restaurantDiscovery = await callLLMWithFunctions(
      buildRestaurantDiscoveryPrompt(userContext),
      RESTAURANT_DISCOVERY_FUNCTIONS,
      userContext
    );

    // STEP 2: Fetch Menu Data (Parallel API calls for all chains)
    console.log('[Meal-Orchestrator] Step 2: Fetching Menu Data in Parallel');
    const verifiedChains = restaurantDiscovery.selectedRestaurants?.verifiedChains || [];
    const localRestaurants = restaurantDiscovery.selectedRestaurants?.localRestaurants || [];

    const menuData = await fetchMenuDataForChainsParallel(verifiedChains);

    // STEP 3: Menu Item Selection (LLM Analysis)
    console.log('[Meal-Orchestrator] Step 3: Menu Item Selection');
    const menuSelection = await callLLMAnalysis(
      buildMenuSelectionPrompt(userContext, menuData, localRestaurants)
    );

    // STEP 4: Nutrition Verification (Manual API calls)
    console.log('[Meal-Orchestrator] Step 4: Nutrition Verification');
    const selectedItems = menuSelection.selectedMenuItems;
    const nutritionData = await fetchNutritionDataFixed(selectedItems);

    // STEP 5 & 6: Run in parallel - 7 Daily Restaurant Meal Plans + Home Recipes
    console.log('[Meal-Orchestrator] Step 5 & 6: Generating 7 daily restaurant meal plans and home recipes in parallel');

    const llmStartTime = Date.now();
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Generate 7 daily meal plans + home recipes in parallel
    const parallelPromises = [
      // 7 Daily restaurant meal plans
      ...days.map((day, index) =>
        callLLMAnalysisWithTimeout(
          buildDailyMealPlanPrompt(userContext, day, nutritionData),
          60000, // 1 minute timeout per day (much faster than 3 minutes for full week)
          `Restaurant Meal Plan - ${day.charAt(0).toUpperCase() + day.slice(1)}`
        )
      ),

      // Home recipe generation (8th parallel call)
      callLLMAnalysisWithTimeout(
        buildHomeRecipeGenerationPrompt(userContext, {
          targetBreakfastMeals: 7,
          targetLunchMeals: 7,
          targetDinnerMeals: 7,
          totalRecipesNeeded: 21
        }),
        120000, // 2 minute timeout for home recipes
        'Home Recipe Generation'
      )
    ];

    const results = await Promise.all(parallelPromises);

    // Split results: first 7 are daily meal plans, last one is home recipes
    const dailyMealPlans = results.slice(0, 7);
    const homeRecipes = results[7];

    const llmTotalTime = Date.now() - llmStartTime;
    console.log(`[Meal-Orchestrator] Steps 5 & 6 completed in ${llmTotalTime}ms (${Math.round(llmTotalTime/1000)}s)`);
    console.log('[Meal-Orchestrator] Generated daily meal plans:', dailyMealPlans.length);
    console.log('[Meal-Orchestrator] Home recipes keys:', Object.keys(homeRecipes || {}));

    // STEP 7: Combine daily meal plans and home options
    console.log('[Meal-Orchestrator] Step 7: Combining daily restaurant meal plans and home meal options');
    const combinedMealPlan = combineDailyMealPlansAndHomeOptions(dailyMealPlans, days, homeRecipes);

    const totalGenerationTime = Date.now() - orchestratorStartTime;
    console.log('[Meal-Orchestrator] 🚀 7-step DAILY BATCHING completed successfully');
    console.log(`[Meal-Orchestrator] ⚡ TOTAL GENERATION TIME: ${totalGenerationTime}ms (${Math.round(totalGenerationTime / 1000)}s)`);
    console.log(`[Meal-Orchestrator] 📊 Performance benefits from daily batching and parallel processing`);

    // Generate final audit summary
    spoonacularAuditor.generateSummaryReport();

    return {
      ...combinedMealPlan,
      performanceMetrics: {
        totalGenerationTimeMs: totalGenerationTime,
        totalGenerationTimeSeconds: Math.round(totalGenerationTime / 1000),
        dailyBatchingEnabled: true,
        parallelProcessingEnabled: true
      }
    };

  } catch (error) {
    console.error('[Meal-Orchestrator] Error:', error);
    throw error;
  }
}

async function callLLMWithFunctions(prompt: string, functions: any[], userContext: UserContext): Promise<any> {
  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Execute the workflow and return the response as json.' }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      tools: functions.map(func => ({ type: 'function', function: func })),
      tool_choice: 'auto',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  let completion = await response.json();
  let currentMessages = [...messages];
  let functionCallCount = 0;

  while (completion.choices[0].message.tool_calls && functionCallCount < 5) {
    const toolCalls = completion.choices[0].message.tool_calls;
    currentMessages.push(completion.choices[0].message);
    
    for (const toolCall of toolCalls) {
      const functionResult = await executeFunctionCall({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      }, userContext);

      currentMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: functionResult.content
      } as any);
    }

    const nextResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: currentMessages,
        tools: functions.map(func => ({ type: 'function', function: func })),
        tool_choice: 'auto',
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!nextResponse.ok) break;
    
    completion = await nextResponse.json();
    functionCallCount++;
  }

  const finalResponse = completion.choices[0].message.content || '{}';
  return JSON.parse(finalResponse);
}

// Timeout-protected LLM call with detailed logging
async function callLLMAnalysisWithTimeout(prompt: string, timeoutMs: number, stepName: string): Promise<any> {
  console.log(`[LLM-Timeout] Starting ${stepName} with ${Math.round(timeoutMs/1000)}s timeout`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[LLM-Timeout] ${stepName} timed out after ${Math.round(timeoutMs/1000)}s`);
    controller.abort();
  }, timeoutMs);

  try {
    const startTime = Date.now();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You must respond with valid JSON only. Your response should be a JSON object with the requested data structure. Do not include any text outside the JSON object.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 8000 // Reduced to prevent oversized responses
      })
    });

    clearTimeout(timeoutId);
    const fetchTime = Date.now() - startTime;

    if (!response.ok) {
      console.error(`[LLM-Timeout] ${stepName} API error: ${response.status} after ${fetchTime}ms`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    console.log(`[LLM-Timeout] ${stepName} fetch completed in ${fetchTime}ms, parsing JSON...`);

    const completion = await response.json();
    const responseContent = completion.choices[0].message.content || '{}';

    console.log(`[LLM-Timeout] ${stepName} received ${responseContent.length} chars response`);

    // With json_object mode, OpenAI guarantees valid JSON - no repair needed
    const parsed = JSON.parse(responseContent);
    console.log(`[LLM-Timeout] ${stepName} JSON parsing successful - COMPLETED`);
    return parsed;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[LLM-Timeout] ${stepName} was aborted due to timeout`);
      throw new Error(`${stepName} timed out after ${Math.round(timeoutMs/1000)} seconds`);
    }
    console.error(`[LLM-Timeout] ${stepName} failed:`, error);
    throw error;
  }
}

// Simplified LLM function using OpenAI's guaranteed JSON mode
async function callLLMAnalysis(prompt: string): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You must respond with valid JSON only. Your response should be a JSON object with the requested data structure. Do not include any text outside the JSON object.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 8000 // Reduced to prevent oversized responses
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const completion = await response.json();
  const responseContent = completion.choices[0].message.content || '{}';

  console.log(`[LLM-JSON] Received ${responseContent.length} chars response`);

  // With json_object mode, OpenAI guarantees valid JSON
  return JSON.parse(responseContent);
}

// JSON repair logic removed - OpenAI's json_object mode guarantees valid JSON

// OPTIMIZED: Parallel menu data fetching for all chains simultaneously
async function fetchMenuDataForChainsParallel(verifiedChains: any[]): Promise<any[]> {
  console.log(`[Menu-Fetcher-Parallel] Fetching menu data for ${verifiedChains.length} chains in parallel`);

  if (verifiedChains.length === 0) return [];

  // Execute all chain menu fetches in parallel using Promise.all
  const menuDataPromises = verifiedChains.map(async (chain, index) => {
    try {
      console.log(`[Menu-Fetcher-Parallel] [${index + 1}/${verifiedChains.length}] Starting fetch for ${chain.name}`);
      const startTime = Date.now();

      const menuItems = await spoonacularClient.searchMenuItems(
        chain.name,
        undefined,
        undefined,
        undefined,
        PROMPT_CONFIG.MAX_MENU_ITEMS_PER_CHAIN
      );

      const fetchTime = Date.now() - startTime;
      console.log(`[Menu-Fetcher-Parallel] [${index + 1}/${verifiedChains.length}] Completed ${chain.name} in ${fetchTime}ms (${menuItems.length} items)`);

      return {
        restaurantName: chain.name,
        totalItems: menuItems.length,
        fetchTimeMs: fetchTime,
        items: menuItems.map(item => ({
          id: item.id,
          title: item.title,
          restaurantChain: item.restaurantChain,
          servings: {
            size: item.calories ? Math.round(item.calories / 10) : 'N/A',
            unit: 'g'
          },
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat
        }))
      };
    } catch (error) {
      console.error(`[Menu-Fetcher-Parallel] [${index + 1}/${verifiedChains.length}] Failed for ${chain.name}:`, error);
      return {
        restaurantName: chain.name,
        totalItems: 0,
        fetchTimeMs: 0,
        items: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  const parallelStartTime = Date.now();
  const results = await Promise.all(menuDataPromises);
  const totalParallelTime = Date.now() - parallelStartTime;

  const validResults = results.filter(result => result.totalItems > 0);
  const totalItems = validResults.reduce((sum, result) => sum + result.totalItems, 0);

  console.log(`[Menu-Fetcher-Parallel] COMPLETED: ${validResults.length}/${verifiedChains.length} chains in ${totalParallelTime}ms total (${totalItems} items)`);
  console.log(`[Menu-Fetcher-Parallel] Performance: Average ${Math.round(totalParallelTime / verifiedChains.length)}ms per chain (parallel) vs ~${results.reduce((sum, r) => sum + (r.fetchTimeMs || 0), 0)}ms sequential`);

  return validResults;
}

// LEGACY: Keep original sequential function for fallback
async function fetchMenuDataForChains(verifiedChains: any[]): Promise<any[]> {
  console.log(`[Menu-Fetcher] Fetching menu data for ${verifiedChains.length} chains`);
  
  if (verifiedChains.length === 0) return [];

  const menuDataPromises = verifiedChains.map(async (chain) => {
    try {
      console.log(`[Menu-Fetcher] Fetching menu for ${chain.name}`);
      const menuItems = await spoonacularClient.searchMenuItems(
        chain.name, 
        undefined, 
        undefined, 
        undefined, 
        PROMPT_CONFIG.MAX_MENU_ITEMS_PER_CHAIN
      );
      
      return {
        restaurantName: chain.name,
        totalItems: menuItems.length,
        items: menuItems.map(item => ({
          id: item.id,
          title: item.title,
          restaurantChain: item.restaurantChain,
          servings: {
            size: item.calories ? Math.round(item.calories / 10) : 'N/A',
            unit: 'g'
          },
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat
        }))
      };
    } catch (error) {
      console.error(`[Menu-Fetcher] Failed for ${chain.name}:`, error);
      return {
        restaurantName: chain.name,
        totalItems: 0,
        items: []
      };
    }
  });

  const results = await Promise.all(menuDataPromises);
  const validResults = results.filter(result => result.totalItems > 0);
  
  console.log(`[Menu-Fetcher] Successfully fetched menu data for ${validResults.length}/${verifiedChains.length} chains`);
  return validResults;
}

// OPTIMIZED: Parallel nutrition data fetching for all items simultaneously
async function fetchNutritionDataFixed(selectedItems: any): Promise<any> {
  console.log('[Nutrition-Fetcher-Parallel] Fetching nutrition data for verified items in parallel');

  if (!selectedItems || !selectedItems.verifiedItems) {
    console.warn('[Nutrition-Fetcher-Parallel] No verified items found in selection');
    return { verifiedNutrition: { breakfast: [], lunch: [], dinner: [] } };
  }

  const verifiedItems = selectedItems.verifiedItems;
  const allItemsToVerify = [
    ...(verifiedItems.breakfast || []).map((item: any) => ({ ...item, mealType: 'breakfast' })),
    ...(verifiedItems.lunch || []).map((item: any) => ({ ...item, mealType: 'lunch' })),
    ...(verifiedItems.dinner || []).map((item: any) => ({ ...item, mealType: 'dinner' }))
  ];

  console.log(`[Nutrition-Fetcher-Parallel] Processing ${allItemsToVerify.length} items for nutrition verification in parallel`);

  const nutritionPromises = allItemsToVerify.map(async (item: any, index: number) => {
    try {
      if (!item.itemId) {
        console.warn(`[Nutrition-Fetcher-Parallel] [${index + 1}/${allItemsToVerify.length}] Missing itemId for ${item.itemTitle || 'unknown item'}`);
        return null;
      }

      console.log(`[Nutrition-Fetcher-Parallel] [${index + 1}/${allItemsToVerify.length}] Fetching nutrition for ${item.itemTitle} (ID: ${item.itemId})`);
      const startTime = Date.now();

      const nutrition = await spoonacularClient.getMenuItemDetails(item.itemId);
      const fetchTime = Date.now() - startTime;

      if (!nutrition) {
        console.warn(`[Nutrition-Fetcher-Parallel] [${index + 1}/${allItemsToVerify.length}] No nutrition data returned for item ${item.itemId} (${fetchTime}ms)`);
        return {
          ...item,
          verifiedNutrition: {
            calories: null,
            protein: null,
            carbs: null,
            fat: null,
            fiber: null,
            sodium: null
          },
          dataSource: 'API Failed - No Data Available',
          fetchTimeMs: fetchTime,
          spoonacularItemId: item.itemId
        };
      }

      console.log(`[Nutrition-Fetcher-Parallel] [${index + 1}/${allItemsToVerify.length}] Completed ${item.itemTitle} in ${fetchTime}ms`);
      console.log(`[Nutrition-Fetcher-Parallel] Raw nutrition data:`, nutrition.nutrition);

      return {
        ...item,
        verifiedNutrition: {
          calories: nutrition.nutrition?.calories || null,
          protein: nutrition.nutrition?.protein || null,
          carbs: nutrition.nutrition?.carbs || null,
          fat: nutrition.nutrition?.fat || null,
          fiber: nutrition.nutrition?.fiber || null,
          sodium: nutrition.nutrition?.sodium || null
        },
        dataSource: 'Raw Spoonacular Data',
        fetchTimeMs: fetchTime,
        spoonacularItemId: item.itemId,
        rawNutritionData: nutrition.nutrition
      };
    } catch (error) {
      console.error(`[Nutrition-Fetcher-Parallel] [${index + 1}/${allItemsToVerify.length}] Failed for item ${item.itemId}:`, error);
      return {
        ...item,
        verifiedNutrition: {
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
          fiber: null,
          sodium: null
        },
        dataSource: 'Error Occurred - No Data Available',
        fetchTimeMs: 0,
        spoonacularItemId: item.itemId,
        error: error.message
      };
    }
  });

  const parallelStartTime = Date.now();
  const nutritionResults = await Promise.all(nutritionPromises);
  const totalParallelTime = Date.now() - parallelStartTime;

  const validResults = nutritionResults.filter(result => result !== null);
  const verifiedCount = validResults.filter(item => item.dataSource === 'Verified by Spoonacular').length;
  const totalIndividualTime = validResults.reduce((sum, item) => sum + (item.fetchTimeMs || 0), 0);

  // Group by meal type for final step
  const groupedResults = {
    verifiedNutrition: {
      breakfast: validResults.filter(item => item.mealType === 'breakfast'),
      lunch: validResults.filter(item => item.mealType === 'lunch'),
      dinner: validResults.filter(item => item.mealType === 'dinner')
    }
  };

  console.log(`[Nutrition-Fetcher-Parallel] COMPLETED: ${validResults.length} items verified in ${totalParallelTime}ms total`);
  console.log(`[Nutrition-Fetcher-Parallel] Performance: ${verifiedCount}/${validResults.length} verified from Spoonacular`);
  console.log(`[Nutrition-Fetcher-Parallel] Speed gain: ${Math.round(totalIndividualTime)}ms sequential vs ${totalParallelTime}ms parallel (${Math.round((totalIndividualTime / totalParallelTime) * 100) / 100}x faster)`);

  return groupedResults;
}

// NEW: Combine 7 daily meal plans with home recipes to create 3 options per meal
function combineDailyMealPlansAndHomeOptions(dailyMealPlans: any[], days: string[], homeRecipes: any): any {
  console.log('[Meal-Combiner] Combining 7 daily restaurant meal plans with home recipes');

  const weeklyMealPlan: any = {};

  // Combine all daily meal plans into a single weekly structure
  dailyMealPlans.forEach((dailyPlan, index) => {
    const day = days[index];

    if (dailyPlan?.dailyMealPlan?.[day]) {
      weeklyMealPlan[day] = dailyPlan.dailyMealPlan[day];
      console.log(`[Meal-Combiner] Added ${day} meals:`, Object.keys(weeklyMealPlan[day]));
    } else {
      console.warn(`[Meal-Combiner] Missing daily meal plan for ${day}:`, dailyPlan);
      // Create fallback structure
      weeklyMealPlan[day] = {
        breakfast: { options: [] },
        lunch: { options: [] },
        dinner: { options: [] }
      };
    }
  });

  // Add home recipe options as the third option to each meal
  const mealTypes = ['breakfast', 'lunch', 'dinner'];

  days.forEach(day => {
    if (!weeklyMealPlan[day]) return;

    mealTypes.forEach(mealType => {
      if (!weeklyMealPlan[day][mealType]?.options) return;

      // Find appropriate home recipe for this meal type
      const homeRecipeOptions = homeRecipes?.homeRecipes?.[mealType] || [];

      if (homeRecipeOptions.length > 0) {
        // Rotate through available recipes to provide variety
        const dayIndex = days.indexOf(day);
        const recipeIndex = dayIndex % homeRecipeOptions.length;
        const selectedRecipe = homeRecipeOptions[recipeIndex];

        // Convert home recipe to meal option format
        const homeOption = {
          optionNumber: 3,
          optionType: "home",
          recipeName: selectedRecipe.recipeName,
          dishName: selectedRecipe.recipeName,
          description: selectedRecipe.description,
          goalReasoning: selectedRecipe.goalReasoning,
          ingredients: selectedRecipe.ingredients,
          instructions: selectedRecipe.instructions,
          cookingTime: selectedRecipe.cookingTime || selectedRecipe.totalTime,
          prepTime: selectedRecipe.prepTime,
          difficulty: selectedRecipe.difficulty,
          servings: selectedRecipe.servings || 1,
          verifiedNutrition: selectedRecipe.nutrition,
          priceEstimate: `$${(selectedRecipe.estimatedCost / 100).toFixed(2)}`,
          healthRating: "Excellent - homemade, fresh ingredients",
          dataSource: "Generated recipe with calculated nutrition"
        };

        // Add the home option as the third choice
        weeklyMealPlan[day][mealType].options.push(homeOption);

        console.log(`[Meal-Combiner] Added ${selectedRecipe.recipeName} to ${day} ${mealType}`);
      } else {
        console.warn(`[Meal-Combiner] No home recipes available for ${mealType}`);
      }
    });
  });

  return {
    weeklyMealPlan,
    weekSummary: {
      totalMeals: 21,
      totalMealOptions: 63, // 21 meals × 3 options each
      homeRecipesIncluded: 21,
      restaurantOptionsIncluded: 42,
      generationMethod: 'Daily batching for improved performance'
    },
    homeRecipeSummary: homeRecipes?.recipeSummary || {}
  };
}

// LEGACY: Combine restaurant meal plan with home recipes to create 3 options per meal
function combineRestaurantAndHomeOptions(restaurantMealPlan: any, homeRecipes: any): any {
  console.log('[Meal-Combiner] Combining restaurant meal plan with home recipes');

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner'];

  if (!restaurantMealPlan?.weeklyMealPlan) {
    console.error('[Meal-Combiner] Invalid restaurant meal plan structure');
    return restaurantMealPlan;
  }

  const combinedWeeklyPlan = { ...restaurantMealPlan.weeklyMealPlan };

  // Add home recipe option as the third option to each meal
  days.forEach(day => {
    if (!combinedWeeklyPlan[day]) return;

    mealTypes.forEach(mealType => {
      if (!combinedWeeklyPlan[day][mealType]?.options) return;

      // Find appropriate home recipe for this meal type
      const homeRecipeOptions = homeRecipes?.homeRecipes?.[mealType] || [];

      if (homeRecipeOptions.length > 0) {
        // Rotate through available recipes to provide variety
        const dayIndex = days.indexOf(day);
        const recipeIndex = dayIndex % homeRecipeOptions.length;
        const selectedRecipe = homeRecipeOptions[recipeIndex];

        // Convert home recipe to meal option format
        const homeOption = {
          optionNumber: 3,
          optionType: "home",
          recipeName: selectedRecipe.recipeName,
          dishName: selectedRecipe.recipeName,
          description: selectedRecipe.description,
          goalReasoning: selectedRecipe.goalReasoning,
          ingredients: selectedRecipe.ingredients,
          instructions: selectedRecipe.instructions,
          cookingTime: selectedRecipe.cookingTime || selectedRecipe.totalTime,
          prepTime: selectedRecipe.prepTime,
          difficulty: selectedRecipe.difficulty,
          servings: selectedRecipe.servings || 1,
          verifiedNutrition: selectedRecipe.nutrition,
          priceEstimate: `$${(selectedRecipe.estimatedCost / 100).toFixed(2)}`,
          healthRating: "Excellent - homemade, fresh ingredients",
          dataSource: "Generated recipe with calculated nutrition"
        };

        // Add the home option as the third choice
        combinedWeeklyPlan[day][mealType].options.push(homeOption);

        console.log(`[Meal-Combiner] Added ${selectedRecipe.recipeName} to ${day} ${mealType}`);
      } else {
        console.warn(`[Meal-Combiner] No home recipes available for ${mealType}`);
      }
    });
  });

  return {
    weeklyMealPlan: combinedWeeklyPlan,
    weekSummary: {
      ...restaurantMealPlan.weekSummary,
      totalMealOptions: 63, // 21 meals × 3 options each
      homeRecipesIncluded: 21,
      restaurantOptionsIncluded: 42
    },
    homeRecipeSummary: homeRecipes?.recipeSummary || {}
  };
}

// Function execution for Step 1 only
async function executeFunctionCall(call: any, userContext: UserContext): Promise<any> {
  let args;
  try {
    args = JSON.parse(call.arguments);
  } catch (error) {
    return { name: call.name, content: `Error: Invalid arguments for ${call.name}` };
  }
  
  try {
    switch (call.name) {
      case 'find_verified_healthy_chains':
        console.log(`[Function-Call] Finding verified healthy chains near ${args.zipcode}`);
        const healthyChains = await googlePlacesClient.findVerifiedHealthyChains(
          args.zipcode || userContext.surveyData.zipCode,
          args.radiusKm || 10,
          args.preferHealthier !== false
        );
        
        const selectedChains = healthyChains.slice(0, 4).map(chain => ({
          name: chain.name,
          cuisine: chain.cuisine || 'healthy',
          rating: chain.rating,
          priceLevel: chain.priceLevel,
          hasSpoonacularData: true,
          location: chain.address || 'Near user location'
        }));
        
        return {
          name: call.name,
          content: JSON.stringify({
            selectedRestaurants: {
              verifiedChains: selectedChains,
              localRestaurants: []
            },
            summary: {
              totalRestaurants: selectedChains.length,
              verifiedChains: selectedChains.length,
              localOptions: 0,
              areaHasLimitedChains: selectedChains.length < 3
            }
          })
        };

      case 'find_general_restaurants_fallback':
        console.log(`[Function-Call] Finding general restaurants near ${args.zipcode}`);
        const generalRestaurants = await googlePlacesClient.findNearbyRestaurants(
          args.zipcode || userContext.surveyData.zipCode,
          args.cuisineType,
          undefined,
          args.radiusKm || 10
        );
        
        const localOptions = generalRestaurants.slice(0, 4).map(restaurant => ({
          name: restaurant.name,
          hasSpoonacularData: false,
          cuisineMatch: restaurant.cuisine || args.cuisineType || 'general',
          reasoning: `Local ${restaurant.cuisine || 'restaurant'} with ${restaurant.rating}⭐ rating`,
          estimatedPriceRange: '$'.repeat(restaurant.priceLevel || 2),
          location: restaurant.address || 'Local area'
        }));

        return {
          name: call.name,
          content: JSON.stringify({
            localRestaurants: localOptions,
            summary: `Found ${localOptions.length} local restaurants for variety.`
          })
        };

      default:
        return { name: call.name, content: `Error: Unknown function ${call.name}` };
    }
  } catch (error) {
    console.error(`[Function-Call] Error executing ${call.name}:`, error);
    return { name: call.name, content: `Error executing ${call.name}: ${error}` };
  }
}