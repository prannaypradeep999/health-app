import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient } from '@/lib/external/places-client';
import { TavilyClient } from 'tavily';

interface MealOption {
  optionNumber: number;
  optionType: 'restaurant' | 'home';
  title: string;
  description?: string;
  restaurantName?: string;
  estimatedPrice: number;
  orderingInfo?: string;
  deliveryTime?: string;
  ingredients?: string[];
  cookingTime?: number;
  instructions?: string;
  difficulty?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  imageUrl?: string;
}

interface Meal {
  day: string;
  mealType: string;
  options: MealOption[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[TIMING] 🚀 Meal generation started at ${new Date().toISOString()}`);

  try {
    console.log(`[DEBUG] 📥 Request received, parsing JSON...`);
    let requestData = {};
    try {
      requestData = await req.json();
    } catch (error) {
      console.log(`[DEBUG] 📄 Empty request body, using defaults`);
    }
    const { forceRegenerate, backgroundGeneration, partialSurveyData } = requestData;
    console.log(`[DEBUG] 📊 Request data parsed, checking cookies...`);
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    let surveyData = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });

      if (user) {
        surveyData = user?.activeSurvey;
      } else {
        const response = NextResponse.json({
          error: 'Authentication expired. Please refresh the page and try again.'
        }, { status: 401 });
        response.cookies.delete('user_id');
        return response;
      }
    }

    if (!surveyData && surveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    }

    // Check for guest session survey
    if (!surveyData && sessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
    }

    if (!surveyData && partialSurveyData) {
      surveyData = partialSurveyData;
    }

    if (!surveyData) {
      console.log(`[DEBUG] ❌ No survey data found`);
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    console.log(`[DEBUG] ✅ Survey data found, checking for cached restaurant data...`);
    console.log(`[DEBUG] 📍 Address: ${surveyData.streetAddress}, ${surveyData.city}`);
    console.log(`[DEBUG] 🍽️ Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}`);

    const restaurantStartTime = Date.now();

    // Check if restaurants were already discovered in background
    let selectedRestaurants = await checkForCachedRestaurants(surveyData.id);

    if (selectedRestaurants && selectedRestaurants.length > 0) {
      console.log(`[PROGRESSIVE] ✅ Using ${selectedRestaurants.length} cached restaurants from background discovery`);
    } else {
      console.log(`[DEBUG] 🔍 No cached restaurants found, starting fresh restaurant search...`);
      selectedRestaurants = await findAndSelectBestRestaurants(surveyData);
    }

    const restaurantTime = Date.now() - restaurantStartTime;
    console.log(`[TIMING] ✅ Restaurant selection completed in ${restaurantTime}ms (${(restaurantTime/1000).toFixed(2)}s)`);

    console.log(`[DEBUG] 🔍 Starting menu extraction for ${selectedRestaurants.length} restaurants...`);

    // Extract menu information for each restaurant
    const menuStartTime = Date.now();
    const restaurantMenuData = await extractMenuInformation(selectedRestaurants, surveyData);
    const menuTime = Date.now() - menuStartTime;
    console.log(`[TIMING] ✅ Menu extraction completed in ${menuTime}ms (${(menuTime/1000).toFixed(2)}s)`);

    console.log(`[DEBUG] 📋 Restaurant menu extraction completed, generating full weekly meal plan...`);

    // Generate fast 4-day meal plan with 3 prompts
    const mealPlanStartTime = Date.now();
    const weeklyMealPlan = await generateFast4DayMealPlan(restaurantMenuData, surveyData);
    const mealPlanTime = Date.now() - mealPlanStartTime;
    console.log(`[TIMING] ✅ Fast 4-day meal plan generation completed in ${mealPlanTime}ms (${(mealPlanTime/1000).toFixed(2)}s)`);

    const totalTime = Date.now() - startTime;
    console.log(`[TIMING] 🏁 Total generation time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    // Console log the final meal plan
    console.log('\n🍽️ ===== 4-DAY MEAL PLAN ===== 🍽️');
    console.log(JSON.stringify(weeklyMealPlan, null, 2));
    console.log('🍽️ ============= END 4-DAY MEAL PLAN ============= 🍽️\n');

    // Save to database
    try {
      console.log(`[DATABASE] 💾 Saving meal plan to database for survey: ${surveyData.id}`);
      const weekOfDate = new Date();
      weekOfDate.setHours(0, 0, 0, 0);

      await prisma.mealPlan.create({
        data: {
          surveyId: surveyData.id,
          userId: userId || null,
          weekOf: weekOfDate,
          userContext: weeklyMealPlan,
          status: 'active',
          regenerationCount: 1
        }
      });
      console.log(`[DATABASE] ✅ Meal plan saved successfully`);
    } catch (dbError) {
      console.error(`[DATABASE] ❌ Failed to save meal plan:`, dbError);
      // Continue anyway since we have the data
    }

    return NextResponse.json({
      success: true,
      message: 'Weekly meal plan generated successfully',
      selectedRestaurants: selectedRestaurants,
      weeklyMealPlan: weeklyMealPlan,
      timings: {
        totalTime,
        restaurantTime,
        menuTime,
        mealPlanTime
      }
    });

  } catch (error) {
    console.error('Restaurant selection failed:', error);

    return NextResponse.json({
      error: 'Restaurant selection failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}


async function findAndSelectBestRestaurants(surveyData: any): Promise<any[]> {
  const searchStartTime = Date.now();
  console.log(`[RESTAURANT-SEARCH] 🔍 Starting restaurant search...`);

  try {
    const fullAddress = `${surveyData.streetAddress}, ${surveyData.city}, ${surveyData.state} ${surveyData.zipCode}`;
    const dietaryRestrictions = surveyData.dietPrefs || [];
    const selectedCuisines = (surveyData.preferredCuisines || []).slice(0, 5);

    console.log(`[RESTAURANT-SEARCH] 📍 Address: ${fullAddress}`);
    console.log(`[RESTAURANT-SEARCH] 🍽️ Cuisines: ${selectedCuisines.join(', ')}`);
    console.log(`[RESTAURANT-SEARCH] 🚫 Diet restrictions: ${dietaryRestrictions.join(', ') || 'None'}`);

    const distanceToRadius = {
      'close': 2,
      'medium': 5,
      'far': 10
    };
    const radiusMiles = distanceToRadius[surveyData.distancePreference as keyof typeof distanceToRadius] || 5;
    console.log(`[RESTAURANT-SEARCH] 📏 Using ${radiusMiles} mile radius (${surveyData.distancePreference})`);

    console.log(`[RESTAURANT-SEARCH] ⏱️ Starting 2 optimized Google Places searches...`);
    const placesStartTime = Date.now();

    // Search 1: General healthy restaurants (no cuisine filter)
    console.log(`[RESTAURANT-SEARCH] 🔍 Search 1: General healthy restaurants`);
    const generalSearchPromise = googlePlacesClient.searchRestaurantsByCuisine(
      fullAddress,
      '', // no specific cuisine
      dietaryRestrictions,
      5, // more results for general search
      radiusMiles
    );

    // Search 2: Cuisine-specific healthy restaurants
    console.log(`[RESTAURANT-SEARCH] 🔍 Search 2: Cuisine-specific (${selectedCuisines.join(', ')})`);
    const cuisineSearchPromise = selectedCuisines.length > 0
      ? googlePlacesClient.searchRestaurantsByCuisine(
          fullAddress,
          selectedCuisines.join(' '), // combined cuisines
          dietaryRestrictions,
          5,
          radiusMiles
        )
      : Promise.resolve([]);

    // Run both searches in parallel
    const [generalRestaurants, cuisineRestaurants] = await Promise.all([
      generalSearchPromise,
      cuisineSearchPromise
    ]);

    const placesTime = Date.now() - placesStartTime;
    console.log(`[RESTAURANT-SEARCH] ✅ Both searches completed in ${placesTime}ms`);

    // Combine and deduplicate results
    const allRestaurants = [...generalRestaurants, ...cuisineRestaurants].filter(
      (restaurant, index, self) =>
        index === self.findIndex(r => r.placeId === restaurant.placeId)
    );
    console.log(`[RESTAURANT-SEARCH] 📊 Found ${allRestaurants.length} total restaurants`);

    if (allRestaurants.length === 0) {
      console.log(`[RESTAURANT-SEARCH] ❌ No restaurants found, returning empty array`);
      return [];
    }

    console.log(`[RESTAURANT-SEARCH] 🤖 Starting GPT restaurant selection...`);
    const gptStartTime = Date.now();
    const selectedRestaurants = await selectBestRestaurantsWithGPT(allRestaurants, surveyData);
    const gptTime = Date.now() - gptStartTime;
    console.log(`[RESTAURANT-SEARCH] ✅ GPT selection completed in ${gptTime}ms`);

    const totalSearchTime = Date.now() - searchStartTime;
    console.log(`[RESTAURANT-SEARCH] 🏁 Total restaurant search time: ${totalSearchTime}ms`);
    console.log(`[RESTAURANT-SEARCH] 📋 Selected ${selectedRestaurants.length} restaurants`);

    return selectedRestaurants;

  } catch (error) {
    console.error('[RESTAURANT-SEARCH] ❌ Error finding restaurants:', error);
    return [];
  }
}

async function selectBestRestaurantsWithGPT(restaurants: any[], surveyData: any): Promise<any[]> {
  try {

    const prompt = `You are a health-focused meal planning assistant. Analyze the following restaurants and select the best 5 that match the user's health goals and dietary preferences.

USER PROFILE:
- Goal: ${surveyData.goal}
- Dietary Preferences: ${(surveyData.dietPrefs || []).join(', ') || 'None specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Budget Tier: ${surveyData.budgetTier}
- Distance Preference: ${surveyData.distancePreference}

RESTAURANTS TO CHOOSE FROM:
${restaurants.map((r, i) => {
  return `${i + 1}. ${r.name} (${r.cuisine}) - Rating: ${r.rating}/5, Price Level: ${r.priceLevel}/4
     Address: ${r.address}
     ${r.description ? `Description: ${r.description}` : ''}`;
}).join('\n\n')}

**SELECTION CRITERIA (CRITICAL - FOLLOW EXACTLY):**
1. **MUST** align with user's health goal (${surveyData.goal})
2. **MUST** respect dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
3. **SHOULD** include variety of cuisines from user's preferences
4. **CONSIDER** rating and price level appropriateness
5. **PRIORITIZE** restaurants known for healthier options

CRITICAL: Your response must be PURE JSON ONLY. Do not include any markdown formatting, code blocks, backticks, or text before/after the JSON. Start your response with [ and end with ]. No code blocks, no explanations, no additional text.

Please respond with ONLY a JSON array containing exactly 5 restaurant objects with these fields: name, cuisine, rating, priceLevel, address, placeId, city, zipCode. Extract the city and zipCode from the address field.

REMINDER: Response must start with [ and end with ] - pure JSON array only.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from GPT');
    }

    const selectedRestaurants = JSON.parse(content);
    return selectedRestaurants;

  } catch (error) {
    console.error('Error in GPT restaurant selection:', error);

    const fallbackRestaurants = restaurants
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 5);

    return fallbackRestaurants;
  }
}

async function extractMenuInformation(restaurants: any[], surveyData: any): Promise<any[]> {
  console.log(`[MENU-EXTRACTION] 🔍 Extracting menus for ${restaurants.length} restaurants...`);

  try {
    const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

    const menuSearchPromises = restaurants.map(async (restaurant, index) => {
      try {
        const query = `"${restaurant.name}" ${restaurant.city || restaurant.address} menu (site:doordash.com OR site:ubereats.com OR site:grubhub.com)`;

        const tavilyResponse = await tavilyClient.search({
          query: query,
          maxResults: 5
        });

        const menuAnalysis = await analyzeMenuWithGPT(restaurant, tavilyResponse, surveyData);

        return {
          restaurant: restaurant,
          menuAnalysis: menuAnalysis
        };
      } catch (error) {
        console.error(`[MENU-EXTRACTION] ❌ Error getting menu for ${restaurant.name}:`, error);
        return {
          restaurant: restaurant,
          menuAnalysis: {
            description: `${restaurant.name} - a ${restaurant.cuisine} restaurant`,
            recommendedItems: [],
            error: 'Menu analysis timeout - no items available'
          }
        };
      }
    });

    const menuResults = await Promise.all(menuSearchPromises);
    console.log(`[MENU-EXTRACTION] ✅ Menu extraction completed for ${menuResults.length} restaurants`);

    return menuResults;

  } catch (error) {
    console.error('[MENU-EXTRACTION] ❌ Error extracting menu information:', error);
    return [];
  }
}

async function analyzeMenuWithGPT(restaurant: any, tavilyResponse: any, surveyData: any): Promise<any> {
  try {
    const prompt = `Based on the following search results for ${restaurant.name}, please analyze the menu and give me your best estimate of 3-5 healthy menu items that fit these criteria:

USER PREFERENCES:
- Goal: ${surveyData.goal}
- Dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}

SEARCH RESULTS:
${JSON.stringify(tavilyResponse, null, 2)}

CRITICAL INSTRUCTIONS:
- PRIORITIZE information from DoorDash, UberEats, GrubHub, or the restaurant's official website
- Look for URLs containing: doordash.com, ubereats.com, grubhub.com, or the restaurant's official domain
- Extract EXACT menu item names directly from these delivery sites or official menus
- DO NOT hallucinate or create menu items - only use what you find in the search results
- If you see actual menu items listed in the content, use those exact names
- Focus on items that clearly match the user's dietary restrictions and goals

Please extract information ONLY from these search results and do not hallucinate. Give me:
1. A 1-sentence description of the restaurant
2. 3-5 recommended healthy menu items with EXACT names from the search results

Return your response as valid JSON starting with { and ending with }:
{
  "description": "One sentence about the restaurant",
  "recommendedItems": [
    {
      "name": "EXACT Item name from search results",
      "description": "Brief description based on user preferences and search data",
      "price": "Price from search results or range like $12.99 or $$",
      "calories": "Calorie estimate from search results or range like 450-550 cal"
    }
  ]
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // Keep 15s timeout

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 800
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from GPT');
    }

    return JSON.parse(content);

  } catch (error) {
    console.error(`Error analyzing menu for ${restaurant.name}:`, error);
    return {
      description: `${restaurant.name} - a ${restaurant.cuisine} restaurant`,
      recommendedItems: [],
      error: 'Menu analysis failed'
    };
  }
}

// STEP 1: Restaurant Selection
async function selectRestaurantMeals(restaurantMenuData: any[], surveyData: any): Promise<any> {
  const stepStartTime = Date.now();
  console.log(`[STEP-1] 🍽️ Selecting 4-6 restaurant meals for 4-day period starting today...`);

  // Get today's date info
  const today = new Date();
  const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });

  try {
    const prompt = `Select 4-6 restaurant meals for a 4-day period starting TODAY (${todayName}).

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = ${new Date(today.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 3 = ${new Date(today.getTime() + 2*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 4 = ${new Date(today.getTime() + 3*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}

USER PREFERENCES:
- Goal: ${surveyData.goal}
- Dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Budget tier: ${surveyData.budgetTier}
- Preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}

AVAILABLE RESTAURANTS & MENUS:
${JSON.stringify(restaurantMenuData, null, 2)}

TASK:
1. Select 4-6 specific dishes total from the restaurants above
2. Assign each to day 1-4 and meal type (lunch or dinner only)
3. Spread across different restaurants for variety
4. Match user's dietary restrictions and goals
5. Include restaurant description and dish description from the menu data

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO text before or after the JSON.

{
  "restaurant_meals": [
    {
      "day": 1,
      "meal_type": "lunch",
      "restaurant": "Exact Restaurant Name",
      "restaurant_description": "Brief description of the restaurant from menu data",
      "dish": "Exact Dish Name from Menu",
      "dish_description": "Description of the dish from menu data",
      "price": 18.49
    }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You must respond with valid JSON only. Start with { and end with }. No markdown, no code blocks, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 800
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    const stepTime = Date.now() - stepStartTime;
    console.log(`[STEP-1] ✅ Selected ${result.restaurant_meals?.length || 0} restaurant meals in ${stepTime}ms`);
    return result.restaurant_meals || [];

  } catch (error) {
    const stepTime = Date.now() - stepStartTime;
    console.error(`[STEP-1] ❌ Error in ${stepTime}ms:`, error);
    return [];
  }
}

// STEP 2: Home Meal Names & Descriptions
async function generateHomeMealNames(surveyData: any): Promise<any> {
  const stepStartTime = Date.now();
  console.log(`[STEP-2] 🏠 Generating 10 home-cooked meal names with descriptions starting today...`);

  // Get today's date info
  const today = new Date();
  const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });

  try {
    const prompt = `Generate 10 home-cooked meal names with descriptions for a 4-day period starting TODAY (${todayName}).

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = ${new Date(today.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 3 = ${new Date(today.getTime() + 2*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 4 = ${new Date(today.getTime() + 3*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}

USER PREFERENCES:
- Goal: ${surveyData.goal}
- Dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}

TASK:
Generate 10 simple home meal names with 1-2 sentence descriptions.
Cover breakfast, lunch, and dinner options across 4 days.
NO recipes, NO ingredients, NO costs - just names and brief descriptions.

REQUIREMENTS:
1. Match dietary restrictions
2. Vary cuisines from user preferences
3. Quick breakfasts, heartier lunches/dinners
4. Appealing and achievable for home cooking

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO text before or after the JSON.

{
  "home_meals": [
    {
      "name": "Mediterranean Quinoa Bowl",
      "description": "Fresh quinoa with cherry tomatoes, cucumber, feta, and olive oil dressing. Perfect for a light yet satisfying lunch."
    },
    {
      "name": "Protein Smoothie Bowl",
      "description": "Thick smoothie base topped with granola, berries, and nuts. Quick energizing breakfast."
    }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You must respond with valid JSON only. Start with { and end with }. No markdown, no code blocks, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 1000
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    const stepTime = Date.now() - stepStartTime;
    console.log(`[STEP-2] ✅ Generated ${result.home_meals?.length || 0} home meal names in ${stepTime}ms`);
    return result.home_meals || [];

  } catch (error) {
    const stepTime = Date.now() - stepStartTime;
    console.error(`[STEP-2] ❌ Error in ${stepTime}ms:`, error);
    return [];
  }
}

// STEP 3: Merge Into 4-Day Structure
async function mergeMealPlan(restaurantMeals: any[], homeMeals: any[]): Promise<any> {
  const stepStartTime = Date.now();
  console.log(`[STEP-3] 🔄 Organizing into 4-day structure starting today...`);

  // Get today's date info
  const today = new Date();
  const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });

  try {
    const prompt = `Organize meals into a 4-day structure starting TODAY (${todayName}).

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = ${new Date(today.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 3 = ${new Date(today.getTime() + 2*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 4 = ${new Date(today.getTime() + 3*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}

RESTAURANT MEALS SELECTED:
${JSON.stringify(restaurantMeals, null, 2)}

HOME MEALS AVAILABLE:
${JSON.stringify(homeMeals, null, 2)}

TASK:
Create a 4-day meal plan filling all breakfast/lunch/dinner slots.
Use restaurant meals where specified, fill remaining slots with home meals.
Include 1-2 extra options for variety.

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO text before or after the JSON.

{
  "days": [
    {
      "day": 1,
      "day_name": "${todayName}",
      "breakfast": {"source": "home", "name": "Meal Name", "description": "Brief description"},
      "lunch": {"source": "restaurant", "restaurant": "Name", "restaurant_description": "Brief description", "dish": "Dish", "dish_description": "Brief description", "price": 18.49},
      "dinner": {"source": "home", "name": "Meal Name", "description": "Brief description"}
    }
  ],
  "extra_options": {
    "home_meals": [
      {"name": "Extra Home Option", "description": "Description"}
    ],
    "restaurant_meals": [
      {"restaurant": "Name", "restaurant_description": "Brief description", "dish": "Dish", "dish_description": "Brief description", "price": 15.99}
    ]
  }
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You must respond with valid JSON only. Start with { and end with }. No markdown, no code blocks, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    const stepTime = Date.now() - stepStartTime;
    console.log(`[STEP-3] ✅ Created 4-day structure in ${stepTime}ms`);
    return result;

  } catch (error) {
    const stepTime = Date.now() - stepStartTime;
    console.error(`[STEP-3] ❌ Error in ${stepTime}ms:`, error);
    return { days: [], extra_options: {} };
  }
}

// MAIN: Fast 3-Step Generation with Parallel Steps 1 & 2
async function generateFast4DayMealPlan(restaurantMenuData: any[], surveyData: any): Promise<any> {
  const totalStartTime = Date.now();
  console.log(`[FAST-GENERATION] 🚀 Starting 3-step parallel meal plan generation...`);

  try {
    // PARALLEL: Steps 1 & 2 simultaneously
    const parallelStartTime = Date.now();
    const [restaurantMeals, homeMeals] = await Promise.all([
      selectRestaurantMeals(restaurantMenuData, surveyData),
      generateHomeMealNames(surveyData)
    ]);
    const parallelTime = Date.now() - parallelStartTime;
    console.log(`[FAST-GENERATION] ⚡ Steps 1 & 2 completed in parallel: ${parallelTime}ms`);

    // SEQUENTIAL: Step 3 (needs results from 1 & 2)
    const finalPlan = await mergeMealPlan(restaurantMeals, homeMeals);

    const totalTime = Date.now() - totalStartTime;
    console.log(`[FAST-GENERATION] ✅ All 3 steps completed in ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    return finalPlan;

  } catch (error) {
    const totalTime = Date.now() - totalStartTime;
    console.error(`[FAST-GENERATION] ❌ Failed after ${totalTime}ms:`, error);
    return { days: [], extra_options: {}, error: error.message };
  }
}

// In-memory cache for restaurant data (can be improved with Redis/DB later)
const restaurantCache = new Map<string, any[]>();

async function checkForCachedRestaurants(surveyId: string): Promise<any[] | null> {
  try {
    console.log(`[PROGRESSIVE] 🔍 Checking cache for survey: ${surveyId}`);

    // Check in-memory cache first
    if (restaurantCache.has(surveyId)) {
      const cached = restaurantCache.get(surveyId);
      console.log(`[PROGRESSIVE] ✅ Found ${cached?.length || 0} cached restaurants`);
      return cached || null;
    }

    // Could add database check here in the future
    console.log(`[PROGRESSIVE] ❌ No cached restaurants found for survey: ${surveyId}`);
    return null;
  } catch (error) {
    console.error(`[PROGRESSIVE] ❌ Error checking cached restaurants:`, error);
    return null;
  }
}

// Store discovered restaurants in cache
export function cacheDiscoveredRestaurants(surveyId: string, restaurants: any[]) {
  try {
    console.log(`[PROGRESSIVE] 💾 Caching ${restaurants.length} restaurants for survey: ${surveyId}`);
    restaurantCache.set(surveyId, restaurants);

    // Clean up cache after 30 minutes to prevent memory leaks
    setTimeout(() => {
      if (restaurantCache.has(surveyId)) {
        restaurantCache.delete(surveyId);
        console.log(`[PROGRESSIVE] 🗑️ Cleaned up cache for survey: ${surveyId}`);
      }
    }, 30 * 60 * 1000);
  } catch (error) {
    console.error(`[PROGRESSIVE] ❌ Error caching restaurants:`, error);
  }
}

function getNutritionGuidance(goal: string): string {
  const guidance = {
    'WEIGHT_LOSS': 'Prioritize high protein, high fiber, moderate calories. Focus on lean proteins, vegetables, whole grains. Avoid high-calorie density foods.',
    'MUSCLE_GAIN': 'High protein (1.6-2.2g per kg body weight), adequate carbs for energy, healthy fats. Include protein at every meal.',
    'ENDURANCE': 'Balanced macros with emphasis on complex carbs for sustained energy. Include electrolytes and anti-inflammatory foods.',
    'GENERAL_WELLNESS': 'Balanced nutrition with variety. Focus on whole foods, adequate protein, healthy fats, and plenty of vegetables.'
  };
  return guidance[goal as keyof typeof guidance] || guidance['GENERAL_WELLNESS'];
}
