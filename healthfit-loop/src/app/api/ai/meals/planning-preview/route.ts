import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient, Restaurant } from '@/lib/external/places-client';
import { perplexityClient } from '@/lib/external/perplexity-client';

export const runtime = 'nodejs';

/**
 * Meal Planning Preview API Route
 * 
 * FIXES APPLIED:
 * - Improved grocery cost extraction with multiple fallback paths
 * - Added detailed logging for debugging grocery list data
 * - Better handling of nested grocery list structures
 */

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[PLANNING-PREVIEW] 🚀 Starting meal planning preview from existing data...`);

  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    // Clean up undefined/null strings from cookies
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null' || userId === null) ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null' || surveyId === null) ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null' || sessionId === null) ? undefined : sessionId;

    console.log(`[PLANNING-PREVIEW] 🍪 Session info - userId: ${cleanUserId}, surveyId: ${cleanSurveyId}, sessionId: ${cleanSessionId}`);

    // Get survey data using clean values
    let surveyData = null;
    if (cleanUserId) {
      const user = await prisma.user.findUnique({
        where: { id: cleanUserId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    }

    if (!surveyData && cleanSurveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: cleanSurveyId }
      });
    }

    if (!surveyData && cleanSessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId }
      });
    }

    if (!surveyData) {
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[PLANNING-PREVIEW] 👤 Loading existing data for: ${surveyData.firstName} ${surveyData.lastName}`);

    // Get EXISTING meal plan instead of generating new data
    const existingMealPlan = await prisma.mealPlan.findFirst({
      where: {
        surveyId: cleanSurveyId || surveyData.id,
        status: { in: ['active', 'complete', 'partial'] }
      },
      orderBy: [
        { status: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    if (!existingMealPlan) {
      console.log(`[PLANNING-PREVIEW] ❌ No existing meal plan found, falling back to quick preview`);

      // Fallback: Generate minimal preview data
      const fallbackData = {
        restaurants: [],
        groceryList: {
          proteins: [],
          vegetables: [],
          grains: [],
          dairy: [],
          pantryStaples: [],
          snacks: [],
          totalEstimatedCost: 0,
          weeklyBudgetUsed: "0%",
          error: "Meal plan is still being generated. Please wait a moment and try again."
        },
        explanations: {
          restaurantChoices: "Your personalized restaurants are being discovered...",
          groceryChoices: "Your grocery list is being calculated based on your meal preferences...",
          nutritionStrategy: `We're creating a plan focused on your ${surveyData.goal?.toLowerCase().replace('_', ' ')} goals.`
        },
        metadata: {
          generatedFor: `${surveyData.firstName} ${surveyData.lastName}`,
          location: `${surveyData.city}, ${surveyData.state}`,
          goal: surveyData.goal,
          cuisines: surveyData.preferredCuisines || [],
          generatedAt: new Date().toISOString(),
          totalGenerationTime: Date.now() - startTime
        }
      };

      return NextResponse.json({
        success: true,
        data: fallbackData
      });
    }

    const mealPlanData = existingMealPlan.userContext as any;
    console.log(`[PLANNING-PREVIEW] ✅ Found existing meal plan: ${existingMealPlan.id}`);
    console.log(`[PLANNING-PREVIEW] 📊 Meal plan status: ${existingMealPlan.status}`);
    
    // FIX: Debug log the structure of the meal plan data
    console.log(`[PLANNING-PREVIEW] 🔍 MealPlanData keys: ${Object.keys(mealPlanData || {}).join(', ')}`);

    // Extract restaurants from the existing meal plan
    let restaurants: any[] = [];
    if (mealPlanData.restaurantMeals && mealPlanData.restaurantMeals.length > 0) {
      // Convert restaurant meals to preview format
      const uniqueRestaurants = new Map();

      mealPlanData.restaurantMeals.forEach((meal: any) => {
        const restaurantName = meal.primary?.restaurant || meal.restaurant;
        if (restaurantName && !uniqueRestaurants.has(restaurantName)) {
          const orderingLinks = meal.primary?.orderingLinks || meal.orderingLinks || {};
          const restaurant = {
            name: restaurantName,
            cuisine: meal.primary?.cuisine || meal.cuisine || 'Mixed',
            rating: 4.2, // Default rating since we don't store this in meal data
            address: meal.primary?.address || 'Address not available',
            city: surveyData.city,
            zipCode: surveyData.zipCode,
            website: meal.primary?.website || orderingLinks.direct,
            orderingLinks: orderingLinks,
            estimatedOrderTime: "25-40 min",
            sampleMenuItems: [meal.primary?.dish, meal.alternative?.dish].filter(Boolean),
            linksFound: Object.keys(orderingLinks).length,
            distance: 2.5 // Default distance
          };
          uniqueRestaurants.set(restaurantName, restaurant);
        }
      });

      restaurants = Array.from(uniqueRestaurants.values());
      console.log(`[PLANNING-PREVIEW] 🏪 Extracted ${restaurants.length} restaurants from meal plan`);
    } else {
      console.log(`[PLANNING-PREVIEW] ℹ️ No restaurant meals found in meal plan`);
    }

    // FIX: Extract grocery list with multiple fallback paths and better debugging
    let groceryList: any = null;
    let groceryCostSource = 'unknown';
    
    // Try multiple paths to find grocery list
    if (mealPlanData.groceryList) {
      groceryList = mealPlanData.groceryList;
      groceryCostSource = 'mealPlanData.groceryList';
      console.log(`[PLANNING-PREVIEW] 🛒 Found groceryList at root level`);
    } else if (mealPlanData.metadata?.groceryList) {
      groceryList = mealPlanData.metadata.groceryList;
      groceryCostSource = 'mealPlanData.metadata.groceryList';
      console.log(`[PLANNING-PREVIEW] 🛒 Found groceryList in metadata`);
    } else if (mealPlanData.weeklyGroceryList) {
      groceryList = mealPlanData.weeklyGroceryList;
      groceryCostSource = 'mealPlanData.weeklyGroceryList';
      console.log(`[PLANNING-PREVIEW] 🛒 Found weeklyGroceryList`);
    }
    
    // FIX: Debug log the grocery list structure
    if (groceryList) {
      console.log(`[PLANNING-PREVIEW] 🔍 GroceryList keys: ${Object.keys(groceryList).join(', ')}`);
      console.log(`[PLANNING-PREVIEW] 💰 Raw totalEstimatedCost: ${groceryList.totalEstimatedCost}`);
      console.log(`[PLANNING-PREVIEW] 💰 Raw estimatedCost: ${groceryList.estimatedCost}`);
      console.log(`[PLANNING-PREVIEW] 💰 Raw weeklyBudgetUsed: ${groceryList.weeklyBudgetUsed}`);
    } else {
      console.log(`[PLANNING-PREVIEW] ⚠️ No grocery list found in any location`);
    }
    
    // Build grocery list with proper cost extraction
    const finalGroceryList = groceryList ? {
      proteins: groceryList.proteins || [],
      vegetables: groceryList.vegetables || [],
      grains: groceryList.grains || [],
      dairy: groceryList.dairy || [],
      pantryStaples: groceryList.pantryStaples || groceryList.pantry || [],
      snacks: groceryList.snacks || [],
      fruits: groceryList.fruits || [],
      beverages: groceryList.beverages || [],
      condiments: groceryList.condiments || [],
      frozen: groceryList.frozen || [],
      // FIX: Try multiple property names for cost
      totalEstimatedCost: groceryList.totalEstimatedCost || 
                          groceryList.estimatedCost || 
                          groceryList.totalCost || 
                          groceryList.cost ||
                          calculateEstimatedCost(groceryList) ||
                          0,
      weeklyBudgetUsed: groceryList.weeklyBudgetUsed || 
                        groceryList.budgetUsed || 
                        calculateBudgetUsed(groceryList, surveyData.monthlyFoodBudget) ||
                        "0%"
    } : {
      proteins: [],
      vegetables: [],
      grains: [],
      dairy: [],
      pantryStaples: [],
      snacks: [],
      totalEstimatedCost: 0,
      weeklyBudgetUsed: "0%",
      error: "Grocery list not yet generated"
    };

    const categoryCount = Object.keys(finalGroceryList).filter(k => 
      Array.isArray(finalGroceryList[k]) && finalGroceryList[k].length > 0
    ).length;
    
    console.log(`[PLANNING-PREVIEW] 🛒 Grocery list source: ${groceryCostSource}`);
    console.log(`[PLANNING-PREVIEW] 🛒 Categories with items: ${categoryCount}`);
    console.log(`[PLANNING-PREVIEW] 💰 Final estimated cost: $${finalGroceryList.totalEstimatedCost}`);

    // Generate explanations based on existing data
    const explanations = {
      restaurantChoices: restaurants.length > 0
        ? `We selected ${restaurants.length} restaurants that align with your ${surveyData.goal?.toLowerCase().replace('_', ' ')} goals and preferred ${(surveyData.preferredCuisines || []).join('/')} cuisines.`
        : "Your meal plan focuses on home-cooked meals to give you maximum control over ingredients and nutrition.",
      groceryChoices: finalGroceryList.totalEstimatedCost > 0
        ? `These ingredients are chosen to support your ${surveyData.goal?.toLowerCase().replace('_', ' ')} goals while staying within your budget of $${surveyData.monthlyFoodBudget || 200}/month.`
        : "These smart ingredient choices support your nutrition goals with versatile items that work across multiple meals.",
      nutritionStrategy: `Our approach focuses on ${surveyData.goal?.toLowerCase().replace('_', ' ')} through balanced, sustainable nutrition choices tailored to your preferences.`
    };

    const previewData = {
      restaurants,
      groceryList: finalGroceryList,
      explanations,
      metadata: {
        generatedFor: `${surveyData.firstName} ${surveyData.lastName}`,
        location: `${surveyData.city}, ${surveyData.state}`,
        goal: surveyData.goal,
        cuisines: surveyData.preferredCuisines || [],
        generatedAt: new Date().toISOString(),
        totalGenerationTime: Date.now() - startTime,
        dataSource: 'existing_meal_plan',
        mealPlanId: existingMealPlan.id,
        groceryCostSource: groceryCostSource
      }
    };

    const totalTime = Date.now() - startTime;
    console.log(`[PLANNING-PREVIEW] ✅ Preview from existing data completed in ${totalTime}ms`);
    console.log(`[PLANNING-PREVIEW] 🏪 Restaurants: ${restaurants.length}`);
    console.log(`[PLANNING-PREVIEW] 🛒 Grocery categories with items: ${categoryCount}`);
    console.log(`[PLANNING-PREVIEW] 💰 Final grocery cost: $${finalGroceryList.totalEstimatedCost}`);

    return NextResponse.json({
      success: true,
      data: previewData
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[PLANNING-PREVIEW] ❌ Error after ${totalTime}ms:`, error);
    return NextResponse.json({
      error: 'Failed to generate planning preview',
      details: (error as Error).message
    }, { status: 500 });
  }
}

// Helper function to calculate estimated cost from grocery items
function calculateEstimatedCost(groceryList: any): number {
  if (!groceryList) return 0;
  
  let totalCost = 0;
  const categories = ['proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'pantry', 'snacks', 'fruits', 'beverages', 'condiments', 'frozen'];
  
  categories.forEach(category => {
    const items = groceryList[category];
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        // Try to extract cost from item
        const itemCost = item.estimatedCost || item.cost || item.price || 0;
        totalCost += typeof itemCost === 'number' ? itemCost : parseFloat(itemCost) || 0;
      });
    }
  });
  
  return Math.round(totalCost * 100) / 100; // Round to 2 decimal places
}

// Helper function to calculate budget usage percentage
function calculateBudgetUsed(groceryList: any, monthlyBudget: number | undefined): string {
  const estimatedCost = calculateEstimatedCost(groceryList);
  if (!estimatedCost || !monthlyBudget) return "0%";
  
  const weeklyBudget = monthlyBudget / 4;
  const percentUsed = Math.round((estimatedCost / weeklyBudget) * 100);
  
  return `${Math.min(percentUsed, 100)}%`;
}