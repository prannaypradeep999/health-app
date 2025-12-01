import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient } from '@/lib/external/places-client';
import { TavilyClient } from 'tavily';
import { pexelsClient } from '@/lib/external/pexels-client';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';

// Helper function to clean and repair JSON responses from GPT
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
  // Fix unterminated strings by finding incomplete quotes
  cleanContent = cleanContent.replace(/,\s*}/g, '}'); // Remove trailing commas
  cleanContent = cleanContent.replace(/,\s*]/g, ']'); // Remove trailing commas in arrays

  // Fix Unicode issues that cause "no low surrogate" errors
  cleanContent = cleanContent.replace(/[\u{D800}-\u{DFFF}]/gu, ''); // Remove lone surrogates
  cleanContent = cleanContent.replace(/[\u{FFF0}-\u{FFFF}]/gu, ''); // Remove other problematic Unicode

  // Shorten extremely long URLs that cause JSON parsing issues
  cleanContent = cleanContent.replace(
    /(https:\/\/www\.doordash\.com\/store\/[^"&?]+)[^"]*/g,
    '$1'
  );

  // Fix truncated JSON by ensuring proper closing
  if (!cleanContent.endsWith('}') && !cleanContent.endsWith(']')) {
    // Try to find the last complete object/array
    let lastBrace = cleanContent.lastIndexOf('}');
    let lastBracket = cleanContent.lastIndexOf(']');
    let lastValid = Math.max(lastBrace, lastBracket);

    if (lastValid > 0) {
      cleanContent = cleanContent.substring(0, lastValid + 1);
    }
  }

  // Attempt to fix unterminated strings by adding missing quotes
  const lines = cleanContent.split('\n');
  const fixedLines = lines.map(line => {
    // If line has odd number of quotes, it's likely unterminated
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0 && line.includes(':')) {
      // Add missing quote at end of line
      line = line.trim();
      if (!line.endsWith('"') && !line.endsWith(',') && !line.endsWith('}') && !line.endsWith(']')) {
        line += '"';
      }
    }
    return line;
  });
  cleanContent = fixedLines.join('\n');

  try {
    return JSON.parse(cleanContent);
  } catch (parseError) {
    console.error('JSON parse failed even after cleaning:', parseError);
    console.error('Cleaned content:', cleanContent);

    // Last resort: try to extract valid JSON from the beginning
    try {
      const firstBrace = cleanContent.indexOf('{');
      const firstBracket = cleanContent.indexOf('[');
      const startIndex = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket) ? firstBrace : firstBracket;

      if (startIndex !== -1) {
        const truncated = cleanContent.substring(startIndex, startIndex + 3000); // Limit to 3000 chars
        let braceCount = 0;
        let inString = false;
        let escape = false;
        let endIndex = -1;

        for (let i = 0; i < truncated.length; i++) {
          const char = truncated[i];

          if (escape) {
            escape = false;
            continue;
          }

          if (char === '\\') {
            escape = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '{' || char === '[') {
              braceCount++;
            } else if (char === '}' || char === ']') {
              braceCount--;
              if (braceCount === 0) {
                endIndex = i + 1;
                break;
              }
            }
          }
        }

        if (endIndex > 0) {
          const extractedJson = truncated.substring(0, endIndex);
          return JSON.parse(extractedJson);
        }
      }
    } catch (extractError) {
      console.error('JSON extraction failed:', extractError);
    }

    throw parseError;
  }
}

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
    const { forceRegenerate, backgroundGeneration, partialSurveyData } = requestData as {
      forceRegenerate?: boolean;
      backgroundGeneration?: boolean;
      partialSurveyData?: any;
    };
    console.log(`[DEBUG] 📊 Request data parsed, checking cookies...`);
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    console.log(`[DEBUG] 🍪 Cookies found:`, {
      userId: userId || 'null',
      sessionId: sessionId || 'null',
      surveyId: surveyId || 'null'
    });

    // Early exit if no session data available
    if (!userId && !surveyId && !sessionId) {
      console.error(`[DEBUG] ❌ No session data found - aborting meal generation`);
      return NextResponse.json({
        error: 'No session data found. Please complete the survey first.'
      }, { status: 400 });
    }

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
      console.log(`[DEBUG] 🔍 Looking up survey by ID: ${surveyId}`);
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
      console.log(`[DEBUG] 📋 Survey lookup result:`, surveyData ? `Found survey for ${surveyData.firstName}` : 'No survey found');
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
    console.log(`[DEBUG] 🏪 Selected restaurants for menu extraction:`, selectedRestaurants.map(r => ({ name: r.name, city: r.city, address: r.address })));

    // Extract menu information for each restaurant
    const menuStartTime = Date.now();
    console.log(`[DEBUG] 🍽️ About to call extractMenuInformation...`);
    const restaurantMenuData = await extractMenuInformation(selectedRestaurants, surveyData);
    const menuTime = Date.now() - menuStartTime;
    console.log(`[TIMING] ✅ Menu extraction completed in ${menuTime}ms (${(menuTime/1000).toFixed(2)}s)`);

    console.log(`[DEBUG] 📋 Restaurant menu extraction completed, generating full weekly meal plan...`);

    // Generate fast 4-day meal plan with 3 prompts
    const mealPlanStartTime = Date.now();
    const weeklyMealPlan = await generateFast4DayMealPlan(restaurantMenuData, surveyData);
    const mealPlanTime = Date.now() - mealPlanStartTime;
    console.log(`[TIMING] ✅ Fast 4-day meal plan generation completed in ${mealPlanTime}ms (${(mealPlanTime/1000).toFixed(2)}s)`);

    // Enhance meal plan with images from Pexels
    const imageStartTime = Date.now();
    const enhancedMealPlan = await enhanceMealPlanWithImages(weeklyMealPlan, surveyData);
    const imageTime = Date.now() - imageStartTime;
    console.log(`[TIMING] ✅ Image enhancement completed in ${imageTime}ms (${(imageTime/1000).toFixed(2)}s)`);

    const totalTime = Date.now() - startTime;
    console.log(`[TIMING] 🏁 Total generation time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    // Console log the final meal plan
    console.log('\n🍽️ ===== 4-DAY MEAL PLAN WITH IMAGES ===== 🍽️');
    console.log(JSON.stringify(enhancedMealPlan, null, 2));
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
          userContext: enhancedMealPlan,
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
      weeklyMealPlan: enhancedMealPlan,
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
- Monthly Food Budget: $${surveyData.monthlyFoodBudget || 200}
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
3. **MUST** be reasonably priced for monthly food budget: $${surveyData.monthlyFoodBudget || 200} (avoid expensive fine dining, focus on affordable options)
4. **MUST** be well-known, established restaurants that actually exist and are operational
5. **SHOULD** include variety of cuisines from user's preferences
6. **SHOULD** have good ratings (4.0+ preferred) and reasonable price level (1-3, avoid 4)
7. **PRIORITIZE** restaurants known for healthier options and affordable pricing

CRITICAL: Your response must be PURE JSON ONLY. Do not include any markdown formatting, code blocks, backticks, or text before/after the JSON. Start your response with [ and end with ]. No code blocks, no explanations, no additional text.

Please respond with ONLY a JSON array containing exactly 5 restaurant objects with these fields: name, cuisine, rating, priceLevel, address, placeId, city, zipCode. Extract the city and zipCode from the address field.

REMINDER: Response must start with [ and end with ] - pure JSON array only.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

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
            content: 'You MUST respond with valid JSON only. NO markdown, NO explanations, NO Unicode characters. Use only ASCII characters. Return a JSON array of restaurant objects.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
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

    const parsedResponse = cleanJsonResponse(content);
    console.log(`[RESTAURANT-SELECTION] 🔍 GPT response type:`, typeof parsedResponse);
    console.log(`[RESTAURANT-SELECTION] 🔍 GPT response:`, JSON.stringify(parsedResponse, null, 2));

    // Handle both array and object responses
    const selectedRestaurants = Array.isArray(parsedResponse) ? parsedResponse : parsedResponse.restaurants || parsedResponse;

    if (!Array.isArray(selectedRestaurants)) {
      throw new Error(`Expected array but got ${typeof selectedRestaurants}: ${JSON.stringify(selectedRestaurants)}`);
    }

    return selectedRestaurants;

  } catch (error) {
    console.error('Error in GPT restaurant selection:', error);
    throw new Error(`Restaurant selection failed: ${(error as Error).message}`);
  }
}

// Fixed functions to append to route.ts

async function extractMenuInformation(restaurants: any[], surveyData: any): Promise<any[]> {
  console.log(`[MENU-EXTRACTION] 🔍 Extracting menus for ${restaurants.length} restaurants...`);
  console.log(`[MENU-EXTRACTION] 🏪 Restaurant list:`, restaurants.map(r => r.name));

  try {
    console.log(`[TAVILY] 🔑 Initializing Tavily client with API key: ${process.env.TAVILY_API_KEY?.substring(0, 15)}...`);
    const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

    const menuSearchPromises = restaurants.map(async (restaurant, index) => {
      try {
        console.log(`[TAVILY] 🔍 Searching for: ${restaurant.name}`);

        // Search for restaurant menu information
        const response = await tavilyClient.search({
          query: `"${restaurant.name}" "${restaurant.city}" menu`,
          max_results: 5,
          include_answer: true
        });

        // Extract menu content (simplified version for now)
        const tavilyResponse = {
          extractionUrl: response.results?.[0]?.url || null,
          orderingUrl: response.results?.[0]?.url || null,
          menuContent: response.results?.[0]?.content || '',
          extractedSuccessfully: true
        };

        console.log(`[MENU-EXTRACTION] ✅ Menu extracted for ${restaurant.name}`);

        const menuAnalysis = await analyzeExtractedMenuWithGPT(restaurant, tavilyResponse, surveyData);

        if (menuAnalysis && menuAnalysis.recommendedItems && menuAnalysis.recommendedItems.length > 0) {
          return {
            restaurant: restaurant,
            menuAnalysis: menuAnalysis
          };
        } else {
          console.log(`[MENU-EXTRACTION] ❌ Skipping ${restaurant.name} - no menu items found`);
          return null;
        }
      } catch (error) {
        console.error(`[MENU-EXTRACTION] ❌ Error getting menu for ${restaurant.name}:`, error);
        return null;
      }
    });

    const menuResults = await Promise.all(menuSearchPromises);
    return menuResults.filter(result => result !== null);

  } catch (error) {
    console.error('[MENU-EXTRACTION] ❌ Error extracting menu information:', error);
    return [];
  }
}

// Continue with rest of existing working code...
async function analyzeMenuWithGPT(restaurant: any, tavilyResponse: any, surveyData: any): Promise<any> {
  try {
    const now = new Date();
    const currentHour = now.getHours();

    const prompt = `Analyze restaurant data for ${restaurant.name}. Create menu items.

RESTAURANT: ${restaurant.name} (${restaurant.cuisine})
LOCATION: ${restaurant.city}
USER GOAL: ${surveyData.goal}
CURRENT TIME: ${now.toISOString()} (Hour: ${currentHour})

Return JSON with recommended items:
{
  "description": "Restaurant description",
  "recommendedItems": [
    {
      "name": "Menu item name",
      "exactPrice": "$12.99",
      "description": "Why this helps with goal",
      "estimatedCalories": 450,
      "estimatedProtein": 35,
      "estimatedCarbs": 25,
      "estimatedFat": 20
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
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a nutritionist. Create menu recommendations. Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from GPT');
    }

    const result = JSON.parse(content);
    return result;

  } catch (error) {
    console.error(`[MENU-ANALYSIS] ❌ Error:`, error);
    return null;
  }
}