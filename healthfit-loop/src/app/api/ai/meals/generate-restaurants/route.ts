import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient, Restaurant } from '@/lib/external/places-client';
import { perplexityClient } from '@/lib/external/perplexity-client';
import {
  createRestaurantMealGenerationPrompt,
  createRestaurantSelectionPrompt
} from '@/lib/ai/prompts';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';

export const runtime = 'nodejs';

/**
 * Restaurant Meal Generation API Route
 * 
 * FIXES APPLIED:
 * - Fixed all console.log syntax errors
 * - Added response_format: { type: "json_object" } to GPT calls
 * - Added mapping logic to preserve full restaurant data after GPT selection
 * - Added filtering to remove restaurants without ordering links
 * - Improved validation and error handling
 */

// Generate nutrition targets based on survey data
function calculateNutritionTargets(surveyData: any): any {
  if (!surveyData.age || !surveyData.sex || !surveyData.height || !surveyData.weight) {
    // Provide defaults for missing data
    return {
      dailyCalories: 2000,
      dailyProtein: 120,
      dailyCarbs: 250,
      dailyFat: 67,
      mealTargets: {
        breakfast: { calories: 500, protein: 25, carbs: 60, fat: 17 },
        lunch: { calories: 650, protein: 35, carbs: 85, fat: 22 },
        dinner: { calories: 750, protein: 45, carbs: 90, fat: 25 },
        snack: { calories: 100, protein: 15, carbs: 15, fat: 3 }
      }
    };
  }

  const userProfile: UserProfile = {
    age: surveyData.age,
    sex: surveyData.sex,
    height: surveyData.height,
    weight: surveyData.weight,
    activityLevel: surveyData.activityLevel || 'MODERATELY_ACTIVE',
    goal: surveyData.goal || 'GENERAL_WELLNESS'
  };

  const macroTargets = calculateMacroTargets(userProfile);

  // Calculate meal targets (approximate distribution)
  const breakfastPercent = 0.25;
  const lunchPercent = 0.32;
  const dinnerPercent = 0.38;
  const snackPercent = 0.05;

  return {
    dailyCalories: macroTargets.calories,
    dailyProtein: macroTargets.protein,
    dailyCarbs: macroTargets.carbs,
    dailyFat: macroTargets.fat,
    mealTargets: {
      breakfast: {
        calories: Math.round(macroTargets.calories * breakfastPercent),
        protein: Math.round(macroTargets.protein * breakfastPercent),
        carbs: Math.round(macroTargets.carbs * breakfastPercent),
        fat: Math.round(macroTargets.fat * breakfastPercent)
      },
      lunch: {
        calories: Math.round(macroTargets.calories * lunchPercent),
        protein: Math.round(macroTargets.protein * lunchPercent),
        carbs: Math.round(macroTargets.carbs * lunchPercent),
        fat: Math.round(macroTargets.fat * lunchPercent)
      },
      dinner: {
        calories: Math.round(macroTargets.calories * dinnerPercent),
        protein: Math.round(macroTargets.protein * dinnerPercent),
        carbs: Math.round(macroTargets.carbs * dinnerPercent),
        fat: Math.round(macroTargets.fat * dinnerPercent)
      },
      snack: {
        calories: Math.round(macroTargets.calories * snackPercent),
        protein: Math.round(macroTargets.protein * snackPercent),
        carbs: Math.round(macroTargets.carbs * snackPercent),
        fat: Math.round(macroTargets.fat * snackPercent)
      }
    }
  };
}

// Helper function to extract restaurant meals from weekly schedule
function extractRestaurantMealsFromSchedule(weeklyMealSchedule: any): Array<{day: string, mealType: string}> {
  const restaurantMeals: Array<{day: string, mealType: string}> = [];
  
  if (!weeklyMealSchedule || typeof weeklyMealSchedule !== 'object') {
    return restaurantMeals;
  }
  
  Object.entries(weeklyMealSchedule).forEach(([day, meals]: [string, any]) => {
    if (meals?.breakfast === 'restaurant') restaurantMeals.push({ day, mealType: 'breakfast' });
    if (meals?.lunch === 'restaurant') restaurantMeals.push({ day, mealType: 'lunch' });
    if (meals?.dinner === 'restaurant') restaurantMeals.push({ day, mealType: 'dinner' });
  });
  
  return restaurantMeals;
}

// Clean and repair JSON responses from GPT
function cleanJsonResponse(content: string): any {
  let cleanContent = content.trim();
  
  // Remove markdown code blocks
  if (cleanContent.startsWith('```json')) {
    cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  }
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  // Fix common JSON issues
  cleanContent = cleanContent.replace(/,\s*}/g, '}');
  cleanContent = cleanContent.replace(/,\s*]/g, ']');
  
  // Fix Unicode issues
  cleanContent = cleanContent.replace(/[\u{D800}-\u{DFFF}]/gu, '');
  cleanContent = cleanContent.replace(/[\u{FFF0}-\u{FFFF}]/gu, '');
  
  // Shorten extremely long URLs
  cleanContent = cleanContent.replace(
    /(https:\/\/www\.doordash\.com\/store\/[^"&?]+)[^"]*/g,
    '$1'
  );
  
  try {
    return JSON.parse(cleanContent);
  } catch (parseError) {
    console.error('[JSON-CLEAN] JSON parse failed even after cleaning:', parseError);
    return null;
  }
}

// Find and select best restaurants
async function findAndSelectBestRestaurants(surveyData: any): Promise<Restaurant[]> {
  const startTime = Date.now();
  console.log('[RESTAURANT-SEARCH] 🔍 Starting restaurant discovery...');
  
  try {
    const location = `${surveyData.streetAddress || ''} ${surveyData.city || ''}, ${surveyData.state || ''} ${surveyData.zipCode || ''}`.trim();
    const cuisines = surveyData.preferredCuisines || [];
    const dietaryRestrictions = surveyData.dietPrefs || [];
    
    console.log(`[RESTAURANT-SEARCH] 📍 Location: ${location}`);
    console.log(`[RESTAURANT-SEARCH] 🍽️ Cuisines: ${cuisines.join(', ')}`);
    
    const allRestaurants: Restaurant[] = [];
    
    // Convert distance preference to miles (strict enforcement)
    const radiusMiles = surveyData.distancePreference === 'close' ? 1.0 :
                        surveyData.distancePreference === 'far' ? 8.0 : 3.0;

    console.log(`[RESTAURANT-SEARCH] 📏 Distance preference: ${surveyData.distancePreference} → ${radiusMiles} miles radius (STRICT)`);
    
    // Search for each cuisine (limit to 6 for performance)
    for (const cuisine of cuisines.slice(0, 6)) {
      try {
        const restaurants = await googlePlacesClient.searchRestaurantsByCuisine(
          location,
          cuisine,
          dietaryRestrictions,
          12,
          radiusMiles
        );
        console.log(`[RESTAURANT-SEARCH] Found ${restaurants.length} ${cuisine} restaurants`);
        allRestaurants.push(...restaurants);
      } catch (error) {
        console.error(`[RESTAURANT-SEARCH] Error searching ${cuisine}:`, error);
      }
    }
    
    // Remove duplicates by placeId
    const uniqueRestaurants = Array.from(
      new Map(allRestaurants.map(r => [r.placeId, r])).values()
    );
    
    console.log(`[RESTAURANT-SEARCH] 📊 Found ${uniqueRestaurants.length} unique restaurants total`);
    
    // If we have 8 or fewer restaurants, just return them all
    if (uniqueRestaurants.length <= 8) {
      console.log(`[RESTAURANT-SEARCH] ✅ Returning all ${uniqueRestaurants.length} restaurants (no AI selection needed)`);
      return uniqueRestaurants;
    }

    // Use AI to select the best 8-10 restaurants (more to account for filtering)
    const selectionPrompt = createRestaurantSelectionPrompt(uniqueRestaurants, surveyData);

    // Calculate estimated tokens (rough estimate: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(selectionPrompt.length / 4);
    console.log(`[RESTAURANT-SEARCH] 📤 Sending GPT restaurant selection request:`);
    console.log(`[RESTAURANT-SEARCH]   - Prompt length: ${selectionPrompt.length} chars`);
    console.log(`[RESTAURANT-SEARCH]   - Estimated tokens: ${estimatedTokens}`);
    console.log(`[RESTAURANT-SEARCH]   - Restaurants to choose from: ${uniqueRestaurants.length}`);
    console.log(`[RESTAURANT-SEARCH]   - Model: gpt-4o`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: selectionPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.3
      })
    });

    console.log(`[RESTAURANT-SEARCH] 📥 GPT Response received:`);
    console.log(`[RESTAURANT-SEARCH]   - Status: ${response.status} ${response.statusText}`);
    console.log(`[RESTAURANT-SEARCH]   - Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RESTAURANT-SEARCH] ❌ GPT API Error: ${response.status} ${response.statusText}`);
      console.error(`[RESTAURANT-SEARCH] ❌ Error details: ${errorText}`);
      // Fall back to first 8 restaurants instead of crashing
      console.warn('[RESTAURANT-SEARCH] ⚠️ GPT selection failed, using first 8 restaurants');
      return uniqueRestaurants.slice(0, 8);
    }

    const data = await response.json();
    console.log(`[RESTAURANT-SEARCH] 📊 GPT Response data:`);
    console.log(`[RESTAURANT-SEARCH]   - Has choices: ${!!data.choices}`);
    console.log(`[RESTAURANT-SEARCH]   - Choices length: ${data.choices?.length || 0}`);
    console.log(`[RESTAURANT-SEARCH]   - Usage: ${JSON.stringify(data.usage)}`);
    console.log(`[RESTAURANT-SEARCH]   - Error: ${data.error ? JSON.stringify(data.error) : 'none'}`);

    if (data.error) {
      console.error(`[RESTAURANT-SEARCH] ❌ GPT returned error: ${JSON.stringify(data.error)}`);
      console.warn('[RESTAURANT-SEARCH] ⚠️ GPT selection failed, using first 8 restaurants');
      return uniqueRestaurants.slice(0, 8);
    }

    const content = data.choices?.[0]?.message?.content || '{}';
    console.log(`[RESTAURANT-SEARCH] 📝 Raw content preview (first 500 chars): ${content.substring(0, 500)}...`);

    const result = cleanJsonResponse(content);
    
    // Map selected restaurants back to original data to preserve all fields
    let selectedRestaurants: Restaurant[] = [];
    
    if (result?.selectedRestaurants && Array.isArray(result.selectedRestaurants)) {
      console.log(`[RESTAURANT-SEARCH] 🤖 GPT selected ${result.selectedRestaurants.length} restaurants`);
      
      // Create a lookup map for original restaurants
      const restaurantLookup = new Map<string, Restaurant>();
      uniqueRestaurants.forEach(r => {
        if (r.placeId) restaurantLookup.set(r.placeId, r);
        if (r.name) restaurantLookup.set(r.name.toLowerCase(), r);
      });
      
      // Map GPT selections back to full restaurant objects
      for (const selected of result.selectedRestaurants) {
        let fullRestaurant: Restaurant | undefined;
        
        // Try to match by placeId first
        if (selected.placeId) {
          fullRestaurant = restaurantLookup.get(selected.placeId);
        }
        
        // Try to match by name if placeId didn't work
        if (!fullRestaurant && selected.name) {
          fullRestaurant = restaurantLookup.get(selected.name.toLowerCase());
        }
        
        if (fullRestaurant) {
          console.log(`[RESTAURANT-SEARCH] Rating for ${fullRestaurant.name}: ${fullRestaurant.rating}`);
          selectedRestaurants.push({
            ...fullRestaurant,
            rating: fullRestaurant.rating, // Explicitly preserve rating from original Google Places data
            selectionReason: selected.reason || selected.selectionReason,
          } as Restaurant & { selectionReason?: string });
        } else if (selected.name && selected.address) {
          console.log(`[RESTAURANT-SEARCH] ⚠️ Using GPT-provided data for: ${selected.name}`);
          selectedRestaurants.push({
            ...selected,
            rating: selected.rating || 0 // Set rating from GPT or default to 0
          } as Restaurant);
        } else {
          console.warn(`[RESTAURANT-SEARCH] ⚠️ Could not match restaurant: ${JSON.stringify(selected).substring(0, 100)}`);
        }
      }
      
      // If mapping resulted in empty array, fall back to original restaurants
      if (selectedRestaurants.length === 0) {
        console.warn('[RESTAURANT-SEARCH] ⚠️ GPT selection mapping failed, using original restaurants');
        selectedRestaurants = uniqueRestaurants.slice(0, 8);
      }
    } else {
      // Fallback if GPT didn't return valid selection
      console.warn('[RESTAURANT-SEARCH] ⚠️ GPT selection invalid, using first 8 restaurants');
      selectedRestaurants = uniqueRestaurants.slice(0, 8);
    }
    
    const totalSearchTime = Date.now() - startTime;
    console.log(`[RESTAURANT-SEARCH] ✅ Selected ${selectedRestaurants.length} restaurants in ${totalSearchTime}ms`);
    
    // Log selected restaurants for debugging
    selectedRestaurants.forEach((r, i) => {
      console.log(`[RESTAURANT-SEARCH]   ${i + 1}. ${r.name || 'UNDEFINED'} - Rating: ${r.rating || 'N/A'} - ${r.cuisine || 'NO CUISINE'}`);
    });
    
    return selectedRestaurants;
    
  } catch (error) {
    console.error('[RESTAURANT-SEARCH] ❌ Restaurant search failed:', error);
    return [];
  }
}

// Extract menu information using Perplexity API
async function extractMenuInformation(restaurants: Restaurant[], surveyData: any): Promise<any[]> {
  console.log(`[MENU-EXTRACTION] 🔍 Extracting menus for ${restaurants.length} restaurants using Perplexity...`);
  
  if (!process.env.PERPLEXITY_API_KEY) {
    console.error('[MENU-EXTRACTION] Missing PERPLEXITY_API_KEY');
    return restaurants.map(r => ({ ...r, menuData: [], orderingLinks: {}, linksFound: 0, error: 'Missing Perplexity API key' }));
  }
  
  const menuPromises = restaurants.map(async (restaurant) => {
    try {
      // Validate before calling Perplexity
      if (!restaurant.name || restaurant.name === 'undefined') {
        console.warn(`[MENU-EXTRACTION] ⚠️ Skipping restaurant with undefined name`);
        return { ...restaurant, menuData: [], orderingLinks: {}, linksFound: 0, error: 'Restaurant name is undefined' };
      }
      
      console.log(`[MENU-EXTRACTION] Processing ${restaurant.name} with Perplexity...`);
      
      // Ensure restaurant has required fields for Perplexity
      const restaurantWithDefaults = {
        ...restaurant,
        name: restaurant.name || 'Unknown Restaurant',
        address: restaurant.address || surveyData.streetAddress || 'Address not available',
        city: (restaurant as any).city || surveyData.city || 'Unknown City',
        cuisine: restaurant.cuisine || 'Mixed'
      };
      
      const menuResponse = await perplexityClient.getRestaurantMenu(restaurantWithDefaults, surveyData);
      
      // Count valid ordering links
      const orderingLinks = menuResponse.orderingLinks || {};
      const linksFound = Object.values(orderingLinks).filter(
        (link): link is string => typeof link === 'string' && link.trim() !== ''
      ).length;
      
      console.log(`[MENU-EXTRACTION] ${restaurant.name}: ${menuResponse.menuItems?.length || 0} menu items, ${linksFound} ordering links`);
      
      // Log each found link
      Object.entries(orderingLinks).forEach(([platform, url]) => {
        if (url && typeof url === 'string' && url.trim() !== '') {
          console.log(`[MENU-EXTRACTION]   ✅ ${platform}: ${url.substring(0, 60)}...`);
        }
      });
      
      return {
        ...restaurant,
        menuData: menuResponse.menuItems || [],
        menuUrl: orderingLinks.doordash || orderingLinks.ubereats || orderingLinks.grubhub || orderingLinks.direct,
        orderingLinks: orderingLinks,
        menuSource: 'Perplexity',
        sources: menuResponse.sources,
        extractionSuccess: menuResponse.extractionSuccess,
        linksFound: linksFound
      };
    } catch (error) {
      console.error(`[MENU-EXTRACTION] Error processing ${restaurant.name}:`, error);
      return { ...restaurant, menuData: [], orderingLinks: {}, linksFound: 0, error: (error as Error).message };
    }
  });
  
  const results = await Promise.all(menuPromises);
  
  // Filter out restaurants with no ordering links
  const restaurantsWithLinks = results.filter(r => r.linksFound > 0);
  const restaurantsWithoutLinks = results.filter(r => r.linksFound === 0);
  
  console.log(`[MENU-EXTRACTION] ✅ Menu extraction completed:`);
  console.log(`[MENU-EXTRACTION]   - ${restaurantsWithLinks.length} restaurants WITH ordering links (keeping)`);
  console.log(`[MENU-EXTRACTION]   - ${restaurantsWithoutLinks.length} restaurants WITHOUT ordering links (removing)`);
  
  if (restaurantsWithoutLinks.length > 0) {
    console.log(`[MENU-EXTRACTION]   Removed restaurants: ${restaurantsWithoutLinks.map(r => r.name).join(', ')}`);
  }
  
  // Return only restaurants that have at least one ordering link
  return restaurantsWithLinks;
}

// Select specific restaurant meals for the schedule
async function selectRestaurantMealsForSchedule(
  restaurantMenuData: any[],
  restaurantMealsSchedule: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any
): Promise<any[]> {
  console.log(`[RESTAURANT-SELECTION] 🍽️ Selecting ${restaurantMealsSchedule.length} restaurant meals from ${restaurantMenuData.length} restaurants with links...`);
  
  // If no restaurants with ordering links, return empty
  if (restaurantMenuData.length === 0) {
    console.warn('[RESTAURANT-SELECTION] ⚠️ No restaurants with ordering links available');
    return [];
  }
  
  try {
    const prompt = createRestaurantMealGenerationPrompt({
      restaurantMealsSchedule,
      restaurantMenuData,
      surveyData,
      nutritionTargets
    });
    
    // Calculate estimated tokens (rough estimate: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(prompt.length / 4);
    console.log(`[RESTAURANT-SELECTION] 📤 Sending GPT request:`);
    console.log(`[RESTAURANT-SELECTION]   - Prompt length: ${prompt.length} chars`);
    console.log(`[RESTAURANT-SELECTION]   - Estimated tokens: ${estimatedTokens}`);
    console.log(`[RESTAURANT-SELECTION]   - Model: gpt-4o`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.4
      })
    });

    console.log(`[RESTAURANT-SELECTION] 📥 GPT Response received:`);
    console.log(`[RESTAURANT-SELECTION]   - Status: ${response.status} ${response.statusText}`);
    console.log(`[RESTAURANT-SELECTION]   - Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RESTAURANT-SELECTION] ❌ GPT API Error: ${response.status} ${response.statusText}`);
      console.error(`[RESTAURANT-SELECTION] ❌ Error details: ${errorText}`);
      throw new Error(`GPT API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[RESTAURANT-SELECTION] 📊 GPT Response data:`);
    console.log(`[RESTAURANT-SELECTION]   - Has choices: ${!!data.choices}`);
    console.log(`[RESTAURANT-SELECTION]   - Choices length: ${data.choices?.length || 0}`);
    console.log(`[RESTAURANT-SELECTION]   - Usage: ${JSON.stringify(data.usage)}`);
    console.log(`[RESTAURANT-SELECTION]   - Error: ${data.error ? JSON.stringify(data.error) : 'none'}`);

    if (data.error) {
      console.error(`[RESTAURANT-SELECTION] ❌ GPT returned error: ${JSON.stringify(data.error)}`);
      throw new Error(`GPT API error: ${data.error.message || data.error}`);
    }

    const content = data.choices?.[0]?.message?.content || '{}';
    console.log(`[RESTAURANT-SELECTION] 📝 Raw content preview (first 500 chars): ${content.substring(0, 500)}...`);

    const result = cleanJsonResponse(content);
    
    const selectedMeals = result?.restaurantMeals || [];
    console.log(`[RESTAURANT-SELECTION] ✅ Selected ${selectedMeals.length} restaurant meals`);
    
    // Log each selected meal with its ordering links
    selectedMeals.forEach((meal: any, i: number) => {
      const primaryLinks = Object.keys(meal.primary?.orderingLinks || {}).filter(
        k => meal.primary?.orderingLinks[k]
      );
      console.log(`[RESTAURANT-SELECTION]   ${i + 1}. ${meal.day} ${meal.mealType}: ${meal.primary?.restaurant} (${primaryLinks.length} links)`);
    });
    
    return selectedMeals;
    
  } catch (error) {
    console.error('[RESTAURANT-SELECTION] ❌ Selection failed:', error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[RESTAURANT-GENERATION] 🚀 Starting restaurant meal generation at ${new Date().toISOString()}`);

  try {
    // Parse request data for coordinated meal plan ID
    let requestData: { backgroundGeneration?: boolean; mealPlanId?: string } = {};
    try {
      requestData = await req.json();
    } catch {
      console.log(`[RESTAURANT-GENERATION] 📄 Empty request body, using defaults`);
    }

    console.log(`[RESTAURANT-GENERATION] 📋 Request data:`, {
      backgroundGeneration: requestData.backgroundGeneration,
      mealPlanId: requestData.mealPlanId || 'none - will find existing'
    });

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    
    console.log('[RESTAURANT-GENERATION] 🍪 Cookies found:', {
      userId: userId || 'null',
      sessionId: sessionId || 'null',
      surveyId: surveyId || 'null'
    });
    
    // Get survey data
    let surveyData = null;
    
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    } else if (surveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    } else if (sessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
    }
    
    if (!surveyData) {
      console.log('[RESTAURANT-GENERATION] ❌ No survey data found');
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }
    
    console.log(`[RESTAURANT-GENERATION] ✅ Survey data found for ${surveyData.firstName}`);

    // Calculate nutrition targets
    const nutritionTargets = calculateNutritionTargets(surveyData);
    console.log(`[RESTAURANT-GENERATION] 📊 Calculated nutrition targets: ${nutritionTargets.dailyCalories} calories/day`);

    // Extract restaurant meals from schedule
    const restaurantMealsSchedule = extractRestaurantMealsFromSchedule(surveyData.weeklyMealSchedule);
    console.log(`[RESTAURANT-GENERATION] 🏪 Found ${restaurantMealsSchedule.length} restaurant meals in schedule`);
    
    if (restaurantMealsSchedule.length === 0) {
      console.log('[RESTAURANT-GENERATION] ℹ️ No restaurant meals in schedule, skipping generation');
      return NextResponse.json({
        success: true,
        restaurantMeals: [],
        message: 'No restaurant meals in user schedule'
      });
    }
    
    // Phase 1: Find restaurants
    const restaurantDiscoveryStart = Date.now();
    const selectedRestaurants = await findAndSelectBestRestaurants(surveyData);
    const restaurantDiscoveryTime = Date.now() - restaurantDiscoveryStart;
    
    // Validate we have restaurants before proceeding
    if (selectedRestaurants.length === 0) {
      console.warn('[RESTAURANT-GENERATION] ⚠️ No restaurants found, returning empty result');
      return NextResponse.json({
        success: true,
        restaurantMeals: [],
        message: 'No restaurants found in your area'
      });
    }
    
    // Phase 2: Extract menus (filters out restaurants without ordering links)
    const menuExtractionStart = Date.now();
    const restaurantMenuData = await extractMenuInformation(selectedRestaurants, surveyData);
    const menuExtractionTime = Date.now() - menuExtractionStart;
    
    // Check if we have any restaurants with ordering links
    if (restaurantMenuData.length === 0) {
      console.warn('[RESTAURANT-GENERATION] ⚠️ No restaurants with ordering links found');
      return NextResponse.json({
        success: true,
        restaurantMeals: [],
        restaurantData: [],
        message: 'No restaurants with online ordering found in your area. Your meal plan will focus on home-cooked meals.'
      });
    }
    
    // Phase 3: Select specific meals for schedule
    const mealSelectionStart = Date.now();
    const selectedRestaurantMeals = await selectRestaurantMealsForSchedule(restaurantMenuData, restaurantMealsSchedule, surveyData, nutritionTargets);
    const mealSelectionTime = Date.now() - mealSelectionStart;
    
    // Update existing meal plan with restaurant data
    const weekOfDate = new Date();
    weekOfDate.setHours(0, 0, 0, 0);
    
    try {
      console.log('[RESTAURANT-GENERATION] 💾 Updating meal plan with restaurant data...');
      
      // Find the meal plan (coordinated ID or fallback to most recent partial)
      let existingMealPlan;

      if (requestData.mealPlanId) {
        // Use coordinated meal plan ID
        console.log(`[RESTAURANT-GENERATION] 🔗 Looking for coordinated meal plan ${requestData.mealPlanId}`);
        existingMealPlan = await prisma.mealPlan.findUnique({
          where: { id: requestData.mealPlanId }
        });
        if (!existingMealPlan) {
          throw new Error(`Coordinated meal plan ${requestData.mealPlanId} not found`);
        }
      } else {
        // Fallback to legacy behavior - find most recent partial meal plan
        console.log(`[RESTAURANT-GENERATION] 🔍 Looking for most recent partial meal plan (legacy mode)`);
        existingMealPlan = await prisma.mealPlan.findFirst({
          where: {
            OR: [
              { userId: userId || undefined },
              { surveyId: surveyData.id }
            ],
            status: 'partial'
          },
          orderBy: { createdAt: 'desc' }
        });
      }
      
      if (existingMealPlan) {
        // Update existing plan with restaurant data
        const existingContext = existingMealPlan.userContext as any;
        const existingDays = existingContext.days || [];
        
        // Update the days structure to include restaurant meals
        const updatedDays = existingDays.map((dayData: any) => {
          const updatedDay = { ...dayData };
          
          // Find restaurant meals for this day
          const dayRestaurantMeals = selectedRestaurantMeals.filter(
            (meal: any) => meal.day === dayData.day
          );
          
          // Integrate restaurant meals into the day structure
          dayRestaurantMeals.forEach((meal: any) => {
            if (updatedDay.plannedMeals?.[meal.mealType] === 'restaurant') {
              updatedDay.meals = updatedDay.meals || {};
              updatedDay.meals[meal.mealType] = {
                primary: { ...meal.primary, source: 'restaurant' },
                alternative: { ...meal.alternative, source: 'restaurant' },
                source: 'restaurant'
              };
            }
          });
          
          return updatedDay;
        });
        
        const updatedContext = {
          ...existingContext,
          days: updatedDays,
          restaurantMeals: selectedRestaurantMeals,
          generators: {
            ...existingContext.generators,
            restaurants: 'completed'
          },
          metadata: {
            ...existingContext.metadata,
            restaurantsStatus: 'completed',
            restaurantsWithLinks: restaurantMenuData.length,
            totalRestaurantsSearched: selectedRestaurants.length,
            restaurantTimings: {
              discovery: `${restaurantDiscoveryTime}ms`,
              menuExtraction: `${menuExtractionTime}ms`,
              mealSelection: `${mealSelectionTime}ms`
            }
          }
        };
        
        await prisma.mealPlan.update({
          where: { id: existingMealPlan.id },
          data: {
            userContext: updatedContext as any,
            status: 'complete'
          }
        });
        
        console.log(`[RESTAURANT-GENERATION] ✅ Updated meal plan ${existingMealPlan.id} with restaurant data`);
        
      } else {
        console.log('[RESTAURANT-GENERATION] ⚠️ No existing partial meal plan found, creating new complete plan');
        
        const completePlan = {
          restaurantMeals: selectedRestaurantMeals,
          weeklySchedule: surveyData.weeklyMealSchedule,
          metadata: {
            type: 'restaurant_meals_only',
            generationMethod: 'split_pipeline_phase2',
            restaurantsStatus: 'completed',
            restaurantsWithLinks: restaurantMenuData.length,
            totalRestaurantsSearched: selectedRestaurants.length
          }
        };
        
        await prisma.mealPlan.create({
          data: {
            surveyId: surveyData.id,
            userId: userId || null,
            weekOf: weekOfDate,
            userContext: completePlan as any,
            status: 'complete',
            regenerationCount: 1
          }
        });
      }
      
    } catch (dbError) {
      console.error('[RESTAURANT-GENERATION] ❌ Failed to update meal plan:', dbError);
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`[RESTAURANT-GENERATION] 🏁 Restaurant generation completed in ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
    console.log(`[RESTAURANT-GENERATION] 📊 Summary:`);
    console.log(`[RESTAURANT-GENERATION]   - Restaurants searched: ${selectedRestaurants.length}`);
    console.log(`[RESTAURANT-GENERATION]   - Restaurants with ordering links: ${restaurantMenuData.length}`);
    console.log(`[RESTAURANT-GENERATION]   - Restaurant meals selected: ${selectedRestaurantMeals.length}`);
    
    return NextResponse.json({
      success: true,
      restaurantMeals: selectedRestaurantMeals,
      restaurantData: restaurantMenuData,
      summary: {
        totalSearched: selectedRestaurants.length,
        withOrderingLinks: restaurantMenuData.length,
        mealsSelected: selectedRestaurantMeals.length
      },
      timings: {
        restaurantDiscovery: `${restaurantDiscoveryTime}ms`,
        menuExtraction: `${menuExtractionTime}ms`,
        mealSelection: `${mealSelectionTime}ms`,
        totalTime: `${totalTime}ms`
      }
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[RESTAURANT-GENERATION] Error:', error);
    return NextResponse.json({
      error: 'Failed to generate restaurant meals',
      details: (error as Error).message
    }, { status: 500 });
  }
}