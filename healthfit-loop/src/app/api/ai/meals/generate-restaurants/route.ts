import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient } from '@/lib/external/places-client';
import { TavilyClient } from 'tavily';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import {
  createRestaurantSelectionPrompt,
  createExtractionUrlSelectionPrompt,
  createMenuAnalysisPrompt,
  createRestaurantMealSelectionPrompt,
  type Restaurant,
} from '@/lib/ai/prompts';

export const runtime = 'nodejs';

// Helper function to extract restaurant meals from weekly schedule
function extractRestaurantMealsFromSchedule(weeklyMealSchedule: any): Array<{day: string, mealType: string}> {
  const restaurantMeals: Array<{day: string, mealType: string}> = [];

  if (!weeklyMealSchedule || typeof weeklyMealSchedule !== 'object') {
    return restaurantMeals; // Return empty if no schedule
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
    console.error('JSON parse failed even after cleaning:', parseError);
    return null;
  }
}

// Find and select best restaurants (from original code)
async function findAndSelectBestRestaurants(surveyData: any): Promise<any[]> {
  const startTime = Date.now();
  console.log(`[RESTAURANT-SEARCH] 🔍 Starting restaurant discovery...`);

  try {
    const location = `${surveyData.streetAddress || ''} ${surveyData.city || ''}, ${surveyData.state || ''} ${surveyData.zipCode || ''}`.trim();
    const cuisines = surveyData.preferredCuisines || [];

    console.log(`[RESTAURANT-SEARCH] 📍 Location: ${location}`);
    console.log(`[RESTAURANT-SEARCH] 🍽️ Cuisines: ${cuisines.join(', ')}`);

    const allRestaurants: Restaurant[] = [];
    const radius = surveyData.distancePreference === 'close' ? 3000 :
                   surveyData.distancePreference === 'far' ? 15000 : 8000;

    // Search for each cuisine
    for (const cuisine of cuisines.slice(0, 6)) { // Limit to 6 cuisines for performance
      try {
        const restaurants = await googlePlacesClient.findRestaurantsByCuisine(
          location,
          cuisine,
          { radius, limit: 8 }
        );

        console.log(`[RESTAURANT-SEARCH] Found ${restaurants.length} ${cuisine} restaurants`);
        allRestaurants.push(...restaurants);
      } catch (error) {
        console.error(`[RESTAURANT-SEARCH] Error searching ${cuisine}:`, error);
      }
    }

    // Remove duplicates and select best ones using AI
    const uniqueRestaurants = Array.from(
      new Map(allRestaurants.map(r => [r.place_id, r])).values()
    );

    console.log(`[RESTAURANT-SEARCH] 📊 Found ${uniqueRestaurants.length} unique restaurants total`);

    // Use AI to select the best 6-8 restaurants
    const selectionPrompt = createRestaurantSelectionPrompt(uniqueRestaurants, surveyData);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: selectionPrompt }],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const result = cleanJsonResponse(content);

    const selectedRestaurants = result?.selectedRestaurants || uniqueRestaurants.slice(0, 6);
    const totalSearchTime = Date.now() - startTime;

    console.log(`[RESTAURANT-SEARCH] ✅ Selected ${selectedRestaurants.length} restaurants in ${totalSearchTime}ms`);

    return selectedRestaurants;

  } catch (error) {
    console.error(`[RESTAURANT-SEARCH] ❌ Restaurant search failed:`, error);
    return [];
  }
}

// Extract menu information (simplified version of original)
async function extractMenuInformation(restaurants: any[], surveyData: any): Promise<any[]> {
  console.log(`[MENU-EXTRACTION] 🔍 Extracting menus for ${restaurants.length} restaurants...`);

  if (!process.env.TAVILY_API_KEY) {
    console.error('[MENU-EXTRACTION] Missing TAVILY_API_KEY');
    return restaurants.map(r => ({ ...r, menuData: [], error: 'Missing Tavily API key' }));
  }

  const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });
  const menuPromises = restaurants.map(async (restaurant, index) => {
    try {
      console.log(`[MENU-EXTRACTION] Processing ${restaurant.name}...`);

      // Search for DoorDash store page
      const searchQuery = `"${restaurant.name}" "${restaurant.city}" site:doordash.com/store -graveyard -dnu`;
      const searchResponse = await tavilyClient.search({
        query: searchQuery,
        max_results: 2,
        include_answer: true
      });

      const relevantResults = searchResponse.results?.filter(r => {
        const url = r.url.toLowerCase();
        return url.includes('doordash.com/store/') &&
               url.includes(restaurant.name.toLowerCase().split(' ')[0]);
      }) || [];

      if (relevantResults.length === 0) {
        console.log(`[MENU-EXTRACTION] No DoorDash page found for ${restaurant.name}`);
        return { ...restaurant, menuData: [], error: 'No menu found' };
      }

      const bestResult = relevantResults[0];

      // Analyze menu content with GPT-4
      const menuAnalysisPrompt = createMenuAnalysisPrompt(bestResult, restaurant, surveyData);

      const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: menuAnalysisPrompt }],
          temperature: 0.2,
          timeout: 30000
        })
      });

      const analysisData = await analysisResponse.json();
      const menuContent = analysisData.choices?.[0]?.message?.content || '{}';
      const menuAnalysis = cleanJsonResponse(menuContent);

      console.log(`[MENU-EXTRACTION] ✅ Extracted ${menuAnalysis?.menuItems?.length || 0} items from ${restaurant.name}`);

      return {
        ...restaurant,
        menuData: menuAnalysis?.menuItems || [],
        menuUrl: bestResult.url,
        menuSource: 'DoorDash',
        extractionSuccess: true
      };

    } catch (error) {
      console.error(`[MENU-EXTRACTION] Error processing ${restaurant.name}:`, error);
      return { ...restaurant, menuData: [], error: error.message };
    }
  });

  const results = await Promise.all(menuPromises);
  console.log(`[MENU-EXTRACTION] ✅ Menu extraction completed for ${results.length} restaurants`);

  return results;
}

// Select specific restaurant meals for the schedule
async function selectRestaurantMealsForSchedule(restaurantMenuData: any[], restaurantMealsSchedule: Array<{day: string, mealType: string}>, surveyData: any): Promise<any[]> {
  console.log(`[RESTAURANT-SELECTION] 🍽️ Selecting ${restaurantMealsSchedule.length} restaurant meals...`);

  try {
    const prompt = `Select specific restaurant meals for this user's weekly schedule.

RESTAURANT MEALS NEEDED:
${restaurantMealsSchedule.map(meal => `${meal.day} ${meal.mealType}`).join(', ')}

AVAILABLE RESTAURANTS AND MENUS:
${restaurantMenuData.map(restaurant => `
Restaurant: ${restaurant.name} (${restaurant.cuisine_type || 'Mixed'})
Location: ${restaurant.address}
Menu Items: ${restaurant.menuData?.slice(0, 5).map(item => `${item.name} ($${item.price})`).join(', ') || 'Limited menu data'}
`).join('\n')}

USER PREFERENCES:
- Goal: ${surveyData.goal || 'General Wellness'}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

REQUIREMENTS:
1. Select EXACTLY ${restaurantMealsSchedule.length} meals matching the schedule
2. Distribute across different restaurants for variety
3. Consider meal timing (lighter lunches, heartier dinners)
4. Stay within budget and dietary preferences
5. Include ordering information

Return ONLY this JSON:
{
  "restaurantMeals": [
    {
      "day": "friday",
      "mealType": "dinner",
      "restaurant": "Restaurant Name",
      "dish": "Dish Name",
      "description": "Brief description",
      "price": 18.99,
      "estimatedCalories": 650,
      "protein": 35,
      "carbs": 45,
      "fat": 28,
      "cuisine": "Italian",
      "orderingUrl": "https://doordash.com/restaurant-link",
      "source": "restaurant",
      "tags": ["dinner", "italian", "protein-rich"]
    }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.4
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const result = cleanJsonResponse(content);

    const selectedMeals = result?.restaurantMeals || [];
    console.log(`[RESTAURANT-SELECTION] ✅ Selected ${selectedMeals.length} restaurant meals`);

    return selectedMeals;

  } catch (error) {
    console.error(`[RESTAURANT-SELECTION] ❌ Selection failed:`, error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[RESTAURANT-GENERATION] 🚀 Starting restaurant meal generation at ${new Date().toISOString()}`);

  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    console.log(`[RESTAURANT-GENERATION] 🍪 Cookies found:`, {
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
      console.log(`[RESTAURANT-GENERATION] ❌ No survey data found`);
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[RESTAURANT-GENERATION] ✅ Survey data found for ${surveyData.firstName}`);

    // Extract restaurant meals from schedule
    const restaurantMealsSchedule = extractRestaurantMealsFromSchedule(surveyData.weeklyMealSchedule);
    console.log(`[RESTAURANT-GENERATION] 🏪 Found ${restaurantMealsSchedule.length} restaurant meals in schedule`);

    if (restaurantMealsSchedule.length === 0) {
      console.log(`[RESTAURANT-GENERATION] ℹ️ No restaurant meals in schedule, skipping generation`);
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

    // Phase 2: Extract menus (this is the slow part)
    const menuExtractionStart = Date.now();
    const restaurantMenuData = await extractMenuInformation(selectedRestaurants, surveyData);
    const menuExtractionTime = Date.now() - menuExtractionStart;

    // Phase 3: Select specific meals for schedule
    const mealSelectionStart = Date.now();
    const selectedRestaurantMeals = await selectRestaurantMealsForSchedule(restaurantMenuData, restaurantMealsSchedule, surveyData);
    const mealSelectionTime = Date.now() - mealSelectionStart;

    // Update existing meal plan with restaurant data
    const weekOfDate = new Date();
    weekOfDate.setHours(0, 0, 0, 0);

    try {
      console.log(`[RESTAURANT-GENERATION] 💾 Updating meal plan with restaurant data...`);

      // Find the most recent meal plan for this user/survey
      const existingMealPlan = await prisma.mealPlan.findFirst({
        where: {
          OR: [
            { userId: userId || undefined },
            { surveyId: surveyData.id }
          ],
          status: 'partial' // Look for the partial plan with home meals
        },
        orderBy: { createdAt: 'desc' }
      });

      if (existingMealPlan) {
        // Update existing plan with restaurant data - integrate into 7-day structure
        const existingContext = existingMealPlan.userContext;
        const existingDays = existingContext.days || [];

        // Update the days structure to include restaurant meals
        const updatedDays = existingDays.map(dayData => {
          const updatedDay = { ...dayData };

          // Find restaurant meals for this day
          const dayRestaurantMeals = selectedRestaurantMeals.filter(meal => meal.day === dayData.day);

          // Integrate restaurant meals into the day structure
          dayRestaurantMeals.forEach(meal => {
            if (updatedDay.plannedMeals[meal.mealType] === 'restaurant') {
              updatedDay.meals[meal.mealType] = {
                ...meal,
                source: 'restaurant'
              };
            }
          });

          return updatedDay;
        });

        const updatedContext = {
          ...existingContext,
          days: updatedDays, // Updated 7-day structure
          restaurantMeals: selectedRestaurantMeals, // Keep flat array for compatibility
          metadata: {
            ...existingContext.metadata,
            restaurantsStatus: 'completed',
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
            status: 'active' // Mark as complete
          }
        });

        console.log(`[RESTAURANT-GENERATION] ✅ Updated meal plan ${existingMealPlan.id} with restaurant data`);
      } else {
        console.log(`[RESTAURANT-GENERATION] ⚠️ No existing partial meal plan found, creating new complete plan`);
        // Create new complete plan (fallback)
        const completePlan = {
          restaurantMeals: selectedRestaurantMeals,
          weeklySchedule: surveyData.weeklyMealSchedule,
          metadata: {
            type: 'restaurant_meals_only',
            generationMethod: 'split_pipeline_phase2',
            restaurantsStatus: 'completed'
          }
        };

        await prisma.mealPlan.create({
          data: {
            surveyId: surveyData.id,
            userId: userId || null,
            weekOf: weekOfDate,
            userContext: completePlan as any,
            status: 'active',
            regenerationCount: 1
          }
        });
      }

    } catch (dbError) {
      console.error(`[RESTAURANT-GENERATION] ❌ Failed to update meal plan:`, dbError);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[RESTAURANT-GENERATION] 🏁 Restaurant generation completed in ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    return NextResponse.json({
      success: true,
      restaurantMeals: selectedRestaurantMeals,
      restaurantData: restaurantMenuData,
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