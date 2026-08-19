import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient, Restaurant } from '@/lib/external/places-client';
import { perplexityClient } from '@/lib/external/perplexity-client';
import { getAuthUserId } from '@/lib/auth';
import {
  createRestaurantMealGenerationPrompt,
  createRestaurantSelectionPrompt
} from '@/lib/ai/prompts';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import { buildNutritionTargets } from '@/lib/utils/nutrition-targets';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';
import { getStartOfWeek } from '@/lib/utils/date-utils';
import { validateRestrictions } from '@/lib/utils/restriction-validator';
import { MODELS } from '@/lib/ai/models';
import {
  RestaurantSelectionSchema,
  pinnedRestaurantMeals,
  toStrictJsonSchema,
} from '@/lib/ai/schemas';
import { parseChoice } from '@/lib/ai/validate';
import { logUsage } from '@/lib/ai/usage';

export const runtime = 'nodejs';

/**
 * Restaurant Meal Generation API Route
 * 
 * FIXES APPLIED:
 * - Fixed all console.log syntax errors
 * - GPT calls use response_format json_schema + strict:true (was json_object,
 *   which guaranteed valid JSON syntax and nothing at all about its shape)
 * - Added mapping logic to preserve full restaurant data after GPT selection
 * - Added filtering to remove restaurants without ordering links
 * - Improved validation and error handling
 */

// Convert new nutrition targets to legacy format for backward compatibility
function convertToLegacyTargets(weeklyTargets: any, day?: string): any {
  if (!weeklyTargets) {
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

  // If specific day requested, get that day's targets
  if (day && weeklyTargets.days[day.toLowerCase()]) {
    const dayTargets = weeklyTargets.days[day.toLowerCase()];
    return {
      dailyCalories: weeklyTargets.dailyCalories,
      dailyProtein: weeklyTargets.macros.protein,
      dailyCarbs: weeklyTargets.macros.carbs,
      dailyFat: weeklyTargets.macros.fat,
      mealTargets: {
        breakfast: dayTargets.breakfast || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        lunch: dayTargets.lunch || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        dinner: dayTargets.dinner || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        snack: { calories: 0, protein: 0, carbs: 0, fat: 0 } // No snack support in new system yet
      }
    };
  }

  // Default: return general targets with average meal distribution
  const avgDay = Object.values(weeklyTargets.days)[0] as any;
  return {
    dailyCalories: weeklyTargets.dailyCalories,
    dailyProtein: weeklyTargets.macros.protein,
    dailyCarbs: weeklyTargets.macros.carbs,
    dailyFat: weeklyTargets.macros.fat,
    mealTargets: {
      breakfast: avgDay?.breakfast || { calories: Math.round(weeklyTargets.dailyCalories * 0.25), protein: Math.round(weeklyTargets.macros.protein * 0.25), carbs: Math.round(weeklyTargets.macros.carbs * 0.25), fat: Math.round(weeklyTargets.macros.fat * 0.25) },
      lunch: avgDay?.lunch || { calories: Math.round(weeklyTargets.dailyCalories * 0.35), protein: Math.round(weeklyTargets.macros.protein * 0.35), carbs: Math.round(weeklyTargets.macros.carbs * 0.35), fat: Math.round(weeklyTargets.macros.fat * 0.35) },
      dinner: avgDay?.dinner || { calories: Math.round(weeklyTargets.dailyCalories * 0.40), protein: Math.round(weeklyTargets.macros.protein * 0.40), carbs: Math.round(weeklyTargets.macros.carbs * 0.40), fat: Math.round(weeklyTargets.macros.fat * 0.40) },
      snack: { calories: 0, protein: 0, carbs: 0, fat: 0 }
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
    console.log(`[RESTAURANT-SEARCH]   - Model: ${MODELS.PLANNING}`);

    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.PLANNING,
          messages: [{ role: 'user', content: selectionPrompt }],
          response_format: toStrictJsonSchema('restaurant_selection', RestaurantSelectionSchema),
          temperature: 0.3,
          // Selection returns <=8 rows of 6 short fields (~120 tok/row). 4000 is
          // ~4x the observed need. Previously unset, which meant the model's own
          // default ceiling applied and truncation was invisible.
          max_tokens: 4000
        }),
        signal: signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new HttpError(response.status, `GPT API error: ${response.status} - ${errorText}`);
      }
      return response.json();
    }, 'Restaurant selection');

    if (!gptResult.success) {
      console.warn('[RESTAURANT-SEARCH] ⚠️ Using fallback after retry failures');
      return uniqueRestaurants.slice(0, 8);
    }
    const data = gptResult.data;

    logUsage('restaurant-selection', 4000, data);

    // Refusal / truncation / invalid-JSON / schema-mismatch all collapse into one
    // check. The grammar guarantees shape when it succeeds, so the per-field
    // structural guards that used to live here are gone.
    const parsed = parseChoice(RestaurantSelectionSchema, data.choices?.[0], 'restaurant-selection');
    if (!parsed.ok) {
      console.warn(`[RESTAURANT-SEARCH] ⚠️ ${parsed.reason}: ${parsed.detail} — using first 8 restaurants`);
      return uniqueRestaurants.slice(0, 8);
    }

    // Map selected restaurants back to original data to preserve all fields
    let selectedRestaurants: Restaurant[] = [];

    console.log(`[RESTAURANT-SEARCH] 🤖 GPT selected ${parsed.data.selectedRestaurants.length} restaurants`);

    // Create a lookup map for original restaurants
    const restaurantLookup = new Map<string, Restaurant>();
    uniqueRestaurants.forEach(r => {
      if (r.placeId) restaurantLookup.set(r.placeId, r);
      if (r.name) restaurantLookup.set(r.name.toLowerCase(), r);
    });

    // Map GPT selections back to full restaurant objects
    for (const selected of parsed.data.selectedRestaurants) {
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
          selectionReason: selected.reason,
        } as Restaurant & { selectionReason?: string });
      } else if (selected.name && selected.address) {
        console.log(`[RESTAURANT-SEARCH] ⚠️ Using GPT-provided data for: ${selected.name}`);
        selectedRestaurants.push({
          ...selected,
          rating: selected.rating || 0 // Set rating from GPT or default to 0
        } as unknown as Restaurant);
      } else {
        console.warn(`[RESTAURANT-SEARCH] ⚠️ Could not match restaurant: ${JSON.stringify(selected).substring(0, 100)}`);
      }
    }

    // If mapping resulted in empty array, fall back to original restaurants
    if (selectedRestaurants.length === 0) {
      console.warn('[RESTAURANT-SEARCH] ⚠️ GPT selection mapping failed, using original restaurants');
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
  // One entry per scheduled eating-out slot, and the prompt names them all.
  const MealsSchema = pinnedRestaurantMeals(restaurantMealsSchedule.length);
  
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
    console.log(`[RESTAURANT-SELECTION]   - Model: ${MODELS.DETAIL}`);

    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.DETAIL,
          messages: [{ role: 'user', content: prompt }],
          response_format: toStrictJsonSchema('restaurant_meals', MealsSchema),
          temperature: 0.4,
          // Each row carries two full meal objects (13 fields each, incl. four
          // ordering URLs) at roughly 550 output tokens. The schedule is bounded
          // by eatingOutOccasions, so 12000 is several times the realistic need.
          // Previously unset: truncation here was silent.
          max_tokens: 12000
        }),
        signal: signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new HttpError(response.status, `GPT API error: ${response.status} - ${errorText}`);
      }
      return response.json();
    }, 'Restaurant meal selection');

    if (!gptResult.success) {
      console.error('[RESTAURANT-SELECTION] ❌ All retries failed');
      return [];
    }
    const data = gptResult.data;

    logUsage('restaurant-meals', 12000, data);

    const parsed = parseChoice(MealsSchema, data.choices?.[0], 'restaurant-meals');
    if (!parsed.ok) {
      console.error(`[RESTAURANT-SELECTION] ❌ ${parsed.reason}: ${parsed.detail}`);
      return [];
    }

    const selectedMeals = parsed.data.restaurantMeals;
    console.log(`[RESTAURANT-SELECTION] ✅ Selected ${selectedMeals.length}/${restaurantMealsSchedule.length} restaurant meals`);

    // Log each selected meal with its ordering links. Under the strict schema
    // all four orderingLinks keys are always present, so count the non-null ones.
    selectedMeals.forEach((meal, i: number) => {
      const primaryLinks = Object.values(meal.primary.orderingLinks).filter(Boolean);
      console.log(`[RESTAURANT-SELECTION]   ${i + 1}. ${meal.day} ${meal.mealType}: ${meal.primary.restaurant} (${primaryLinks.length} links)`);
    });

    return selectedMeals;
    
  } catch (error) {
    console.error('[RESTAURANT-SELECTION] ❌ Selection failed:', error);
    return [];
  }
}

// Validate restaurant meals against calorie targets
function validateRestaurantMeals(
  restaurantMeals: any[],
  nutritionTargets: any
) {
  let warningCount = 0;
  let errorCount = 0;

  const mealTargets = nutritionTargets?.mealTargets || {};
  const dailyTarget = nutritionTargets?.dailyCalories || 0;
  const mealsByDay: Record<string, number[]> = {};

  restaurantMeals.forEach((meal: any) => {
    const day = meal.day || 'unknown';
    const mealType = (meal.mealType || '').toLowerCase();
    const actualCalories = meal.primary?.estimatedCalories ?? meal.primary?.calories ?? meal.estimatedCalories ?? meal.calories;
    const targetCalories = mealTargets?.[mealType]?.calories || 0;

    if (!mealsByDay[day]) mealsByDay[day] = [];
    if (typeof actualCalories === 'number') mealsByDay[day].push(actualCalories);

    if (actualCalories === null || actualCalories === undefined || Number.isNaN(actualCalories)) {
      errorCount += 1;
      console.error(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: missing calories ❌ ERROR`);
      return;
    }

    if (actualCalories < 200 || actualCalories > 1500) {
      warningCount += 1;
      console.warn(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (suspicious) ⚠️ WARNING`);
    }

    if (targetCalories > 0) {
      const deviation = Math.abs(actualCalories - targetCalories) / targetCalories * 100;
      if (deviation > 30) {
        errorCount += 1;
        console.error(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (target: ${targetCalories}, ${deviation.toFixed(1)}%) ⚠️ ERROR`);
      } else if (deviation > 15) {
        warningCount += 1;
        console.warn(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (target: ${targetCalories}, ${deviation.toFixed(1)}%) ⚠️ WARNING`);
      } else {
        console.log(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (target: ${targetCalories}, ${deviation.toFixed(1)}%) ✓`);
      }
    }
  });

  Object.entries(mealsByDay).forEach(([day, calories]) => {
    const dailyTotal = calories.reduce((sum, value) => sum + value, 0);
    if (dailyTarget > 0 && dailyTotal / dailyTarget > 0.6) {
      warningCount += 1;
      console.warn(`[RESTAURANT-VALIDATOR] ${day}: restaurant meals use ${Math.round((dailyTotal / dailyTarget) * 100)}% of daily target ⚠️ WARNING`);
    }
  });

  console.log(`[RESTAURANT-VALIDATOR] Validation complete: ${restaurantMeals.length} meals, ${warningCount} warning(s), ${errorCount} error(s)`);
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
    const userId = await getAuthUserId();
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

    // Calculate nutrition targets using shared function
    const weeklyNutritionTargets = buildNutritionTargets(surveyData);
    const nutritionTargets = convertToLegacyTargets(weeklyNutritionTargets);
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

    // Validate restaurant meals (log only, do not block saving)
    if (selectedRestaurantMeals.length > 0) {
      validateRestaurantMeals(selectedRestaurantMeals, nutritionTargets);
    }

    const userRestrictions = {
      dietPrefs: surveyData.dietPrefs || [],
      strictExclusions: surveyData.strictExclusions || {},
      foodAllergies: surveyData.foodAllergies || [],
    };

    const restrictionMeals: any[] = [];
    selectedRestaurantMeals.forEach((meal: any) => {
      const day = meal.day || 'unknown';
      const mealType = meal.mealType || 'unknown';
      if (meal.primary) {
        restrictionMeals.push({
          ...meal.primary,
          name: meal.primary.dish || meal.primary.name || meal.primary.description,
          ingredients: meal.primary.ingredients || [],
          day,
          mealType,
          option: 'primary'
        });
      }
      if (meal.alternative) {
        restrictionMeals.push({
          ...meal.alternative,
          name: meal.alternative.dish || meal.alternative.name || meal.alternative.description,
          ingredients: meal.alternative.ingredients || [],
          day,
          mealType,
          option: 'alternative'
        });
      }
    });

    const restrictionValidation = validateRestrictions(restrictionMeals, userRestrictions);
    const restrictionViolations = restrictionValidation.violations;

    if (!restrictionValidation.valid) {
      restrictionValidation.violations.forEach(v => {
        console.error(`[RESTRICTION-VALIDATOR] ❌ ${v.day} ${v.mealType}: "${v.mealName}" violates ${v.restriction} (contains ${v.ingredient})`);
      });
      console.error(`[RESTRICTION-VALIDATOR] Found ${restrictionValidation.violations.length} restriction violations`);
    } else {
      console.log(`[RESTRICTION-VALIDATOR] ✅ All meals pass restriction checks`);
    }
    
    // Update existing meal plan with restaurant data
    const weekOfDate = getStartOfWeek();
    
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
          
          // Find restaurant meals for this day. The model's day/mealType casing
          // is not constrained by the schema, so compare and index normalised —
          // otherwise a "Monday"/"Lunch" response never matches and the
          // restaurant slot stays null with no error anywhere.
          const dayRestaurantMeals = selectedRestaurantMeals.filter(
            (meal: any) => String(meal?.day ?? '').toLowerCase() === String(dayData?.day ?? '').toLowerCase()
          );

          // Integrate restaurant meals into the day structure
          dayRestaurantMeals.forEach((meal: any) => {
            const mealType = String(meal?.mealType ?? '').toLowerCase();
            if (updatedDay.plannedMeals?.[mealType] === 'restaurant') {
              updatedDay.meals = updatedDay.meals || {};
              updatedDay.meals[mealType] = {
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
          restrictionViolations: [
            ...(existingContext.restrictionViolations || []),
            ...(restrictionViolations || [])
          ],
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
          restrictionViolations: restrictionViolations || [],
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
      console.error('[RESTAURANT-GENERATION] ❌ Full error details:', {
        name: (dbError as Error).name,
        message: (dbError as Error).message,
        stack: (dbError as Error).stack
      });
      return NextResponse.json(
        {
          error: 'Failed to save restaurant meals to database',
          details: (dbError as Error).message,
          restaurantMealsGenerated: true // Meals were generated but not saved
        },
        { status: 500 }
      );
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