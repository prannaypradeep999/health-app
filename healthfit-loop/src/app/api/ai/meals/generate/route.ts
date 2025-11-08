import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient } from '@/lib/external/places-client';
import { TavilyClient } from 'tavily';
import { pexelsClient } from '@/lib/external/pexels-client';

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

async function extractMenuInformation(restaurants: any[], surveyData: any): Promise<any[]> {
  console.log(`[MENU-EXTRACTION] 🔍 Extracting menus for ${restaurants.length} restaurants...`);
  console.log(`[MENU-EXTRACTION] 🏪 Restaurant list:`, restaurants.map(r => r.name));

  try {
    console.log(`[TAVILY] 🔑 Initializing Tavily client with API key: ${process.env.TAVILY_API_KEY?.substring(0, 15)}...`);
    const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

    const menuSearchPromises = restaurants.map(async (restaurant, index) => {
      try {
        // Try targeted delivery site search (optimized for speed)
        console.log(`[TAVILY] 🔍 Searching delivery sites for: ${restaurant.name}`);

        // Optimized 2-search strategy: DoorDash for ordering links + Simple menu search
        const searchStrategies = [
          {
            name: 'DoorDash Store',
            query: `"${restaurant.name}" "${restaurant.city}" "${restaurant.zipCode || ''}" site:doordash.com/store -graveyard -dnu -not-available`,
            maxResults: 3
          },
          {
            name: 'Menu Search',
            query: `"${restaurant.name}" ${restaurant.address || restaurant.zipCode || restaurant.city} menu full`,
            maxResults: 3
          }
        ];

        let allResults: any[] = [];
        let bestDeliveryUrl = null;

        for (const strategy of searchStrategies) {
          try {
            console.log(`[TAVILY] 🎯 ${strategy.name}: ${strategy.query}`);
            const response = await tavilyClient.search({
              query: strategy.query,
              max_results: strategy.maxResults,
              include_answer: true
            });

            // Filter for relevant results based on search strategy
            const relevantResults = response.results?.filter(r => {
              const url = r.url.toLowerCase();
              const title = r.title?.toLowerCase() || '';
              const content = r.content?.toLowerCase() || '';

              // Filter out problematic URLs
              const hasProblematicTerms =
                url.includes('graveyard') ||
                url.includes('dnu') ||
                title.includes('not available') ||
                title.includes('graveyard') ||
                title.includes('dnu') ||
                content.includes('restaurant you are trying to reach is not available') ||
                content.includes('graveyard') ||
                content.includes('do not reactivate');

              if (hasProblematicTerms) {
                console.log(`[TAVILY] ❌ Filtering out problematic URL: ${url} (${title})`);
                return false;
              }

              if (strategy.name === 'DoorDash Store') {
                // For DoorDash, only accept actual store pages
                return url.includes('doordash.com/store/') ||
                       (url.includes('doordash.com') && !url.includes('/dish/') && !url.includes('/food-delivery/') && !url.includes('near-me'));
              } else if (strategy.name === 'Menu Search') {
                // For menu search, accept any relevant menu content
                return true; // Let all results through for menu search
              }

              return false;
            }) || [];

            if (relevantResults.length > 0 && strategy.name === 'DoorDash Store' && !bestDeliveryUrl) {
              bestDeliveryUrl = relevantResults[0].url;
              console.log(`[TAVILY] ✅ Found DoorDash URL: ${bestDeliveryUrl}`);
            }

            allResults = allResults.concat(response.results || []);

            // Log results for each strategy
            if (relevantResults.length > 0) {
              console.log(`[TAVILY] ✅ ${strategy.name}: Found ${relevantResults.length} relevant results`);
            } else {
              console.log(`[TAVILY] ❌ ${strategy.name}: No relevant results found`);
            }
          } catch (strategyError) {
            console.log(`[TAVILY] ⚠️ ${strategy.name} failed:`, strategyError.message);
          }
        }

        // Extract valid URLs from search results
        const validOrderingUrls = allResults
          .filter(r => {
            const url = r.url.toLowerCase();
            const title = r.title?.toLowerCase() || '';
            const content = r.content?.toLowerCase() || '';

            // Filter out problematic URLs
            const hasProblematicTerms =
              url.includes('graveyard') ||
              url.includes('dnu') ||
              title.includes('not available') ||
              title.includes('graveyard') ||
              title.includes('dnu') ||
              content.includes('restaurant you are trying to reach is not available') ||
              content.includes('graveyard') ||
              content.includes('do not reactivate');

            if (hasProblematicTerms) {
              console.log(`[TAVILY] ❌ Filtering out problematic URL: ${url} (${title})`);
              return false;
            }

            return true; // Keep all non-problematic results
          })
          .map(r => {
            // Clean and shorten URLs for better JSON parsing
            let cleanUrl = r.url;

            // Remove Unicode characters that cause JSON parsing issues
            cleanUrl = cleanUrl.replace(/[\u{D800}-\u{DFFF}]/gu, ''); // Remove lone surrogates
            cleanUrl = cleanUrl.replace(/[\u{FFF0}-\u{FFFF}]/gu, ''); // Remove other problematic Unicode
            cleanUrl = cleanUrl.replace(/[^\x00-\x7F]/g, ''); // Keep only ASCII characters

            // Remove long query parameters that cause JSON issues
            if (cleanUrl.includes('?')) {
              const baseUrl = cleanUrl.split('?')[0];
              const params = new URLSearchParams(cleanUrl.split('?')[1]);

              // Keep only essential parameters
              const essentialParams = new URLSearchParams();
              if (params.has('srsltid')) {
                essentialParams.set('srsltid', params.get('srsltid')!.substring(0, 20));
              }

              cleanUrl = baseUrl + (essentialParams.toString() ? '?' + essentialParams.toString() : '');
            }

            return {
              url: cleanUrl,
              platform: r.url.includes('doordash.com') ? 'DoorDash' :
                       r.url.includes('ubereats.com') ? 'UberEats' :
                       r.url.includes('grubhub.com') ? 'GrubHub' :
                       r.url.includes('.pdf') ? 'PDF Menu' : 'Web',
              title: r.title?.substring(0, 100) || '', // Limit title length
              content: r.content?.substring(0, 200) || '', // Limit content length
              isStorePage: r.url.includes('/store/') || r.url.includes('/restaurant/'),
              isDoorDash: r.url.includes('doordash.com')
            };
          })
          .sort((a, b) => {
            // Prioritize DoorDash store pages first for ordering
            if (a.isDoorDash && !b.isDoorDash) return -1;
            if (!a.isDoorDash && b.isDoorDash) return 1;
            // Then prioritize actual store/restaurant pages
            if (a.isStorePage && !b.isStorePage) return -1;
            if (!a.isStorePage && b.isStorePage) return 1;
            return 0;
          });

        const tavilyResponse = {
          results: allResults.slice(0, 10), // Limit to top 10 results
          bestDeliveryUrl: bestDeliveryUrl,
          validOrderingUrls: validOrderingUrls,
          primaryOrderingUrl: validOrderingUrls[0]?.url || bestDeliveryUrl
        };

        console.log(`[TAVILY] ✅ Results for ${restaurant.name}: ${tavilyResponse.results?.length || 0} results`);
        console.log(`[TAVILY] 📊 Sample result:`, tavilyResponse.results?.[0]?.url || 'No results');

        const menuAnalysis = await analyzeMenuWithGPT(restaurant, tavilyResponse, surveyData);

        return {
          restaurant: restaurant,
          menuAnalysis: menuAnalysis
        };
      } catch (error) {
        console.error(`[MENU-EXTRACTION] ❌ Error getting menu for ${restaurant.name}:`, error);
        console.error(`[TAVILY] ❌ Tavily error details:`, error?.message, error?.code);

        // Create a basic fallback menu analysis for timeout/abort errors
        const isTimeoutError = error?.name === 'AbortError' || error?.code === 20;
        const fallbackAnalysis = {
          description: `${restaurant.name} - a ${restaurant.cuisine} restaurant with healthy options`,
          recommendedItems: [
            {
              name: `Fresh ${restaurant.cuisine} Bowl`,
              exactPrice: null,
              priceRange: "$$",
              description: `A fresh and healthy ${restaurant.cuisine} bowl perfect for your fitness goals. Features lean proteins and fresh vegetables.`,
              healthBenefits: `Great for ${surveyData.goal.toLowerCase().replace('_', ' ')} with balanced nutrition`,
              mealTiming: "lunch",
              sourceUrl: restaurant.website || `https://maps.google.com/?q=${encodeURIComponent(restaurant.name + ' ' + restaurant.address)}`,
              platform: "Restaurant",
              why_perfect_for_goal: `This balanced meal supports your ${surveyData.goal.toLowerCase().replace('_', ' ')} with quality ingredients and proper nutrition.`
            }
          ],
          orderingUrl: restaurant.website || `https://maps.google.com/?q=${encodeURIComponent(restaurant.name + ' ' + restaurant.address)}`,
          menuSourceUrl: restaurant.website || `https://maps.google.com/?q=${encodeURIComponent(restaurant.name + ' ' + restaurant.address)}`,
          menuSourceName: "Restaurant",
          isOpen: true,
          itemsCount: 1,
          exactPrices: 0,
          error: isTimeoutError ? 'Menu analysis timed out - using fallback' : `Menu analysis failed: ${error?.message || 'Unknown error'}`
        };

        return {
          restaurant: restaurant,
          menuAnalysis: fallbackAnalysis
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
    // Get current time to determine meal appropriateness
    const now = new Date();
    const currentHour = now.getHours();

    const prompt = `You are analyzing real delivery platform data for ${restaurant.name}. Extract EXACT menu items and prices from the search results.

CURRENT TIME: ${now.toISOString()} (Hour: ${currentHour})
- If hour 6-11: Focus on breakfast items
- If hour 11-16: Focus on lunch items
- If hour 16-22: Focus on dinner items
- If hour 22-6: Only suggest items if restaurant is 24-hour

USER PREFERENCES:
- Goal: ${surveyData.goal}
- Dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Monthly food budget: $${surveyData.monthlyFoodBudget || 200} (prioritize affordable, reasonable pricing)

DELIVERY PLATFORM SEARCH RESULTS:
${JSON.stringify(tavilyResponse, null, 2)}

AVAILABLE VERIFIED ORDERING URLS:
${tavilyResponse.validOrderingUrls?.map(url => `- ${url.platform}: ${url.url}`).join('\n') || 'No direct ordering URLs found'}

PRIMARY ORDERING URL: ${tavilyResponse.primaryOrderingUrl || 'None found'}

CRITICAL EXTRACTION RULES (NO EXCEPTIONS):
1. SCAN the search results content for EXACT menu item names and prices
2. Look for patterns like: "Caesar Salad $12.99", "Grilled Chicken Bowl - $15.50", etc.
3. Extract menu items that match the current meal timing (breakfast/lunch/dinner)
4. PRIORITIZE AFFORDABLE OPTIONS - avoid expensive items, stick to reasonable pricing for $${surveyData.monthlyFoodBudget || 200} monthly food budget
5. USE ONLY the verified ordering URLs listed above - DO NOT create or modify URLs
6. PRIORITY: Use store/restaurant pages over generic dish pages
7. CREATE compelling descriptions explaining WHY each dish helps achieve the user's ${surveyData.goal} goal
8. If specific menu items not found, suggest 2-3 typical affordable dishes for this restaurant type with health benefits
9. DO NOT return error unless NO valid restaurant URLs found

URL SELECTION RULES:
- MUST use only URLs from the "AVAILABLE VERIFIED ORDERING URLS" list above
- Primary preference: ${tavilyResponse.primaryOrderingUrl || 'First available URL'}
- Secondary: First URL from validOrderingUrls list
- NEVER create or modify URLs - use exact URLs provided

MENU ITEM EXTRACTION STRATEGY:
- Search result content for: "item name" + "$" + price
- Look for menu sections: "Entrees", "Salads", "Sandwiches", etc.
- Find items that fit user's dietary restrictions and goals
- Prioritize items appropriate for current hour (${currentHour})

PRICE PARSING PATTERNS:
- "$XX.XX" (exact price)
- "Starting at $XX"
- "From $XX.XX"
- Price ranges like "$12-15"

CRITICAL: Response must be valid JSON only. Use ONLY ASCII characters - NO Unicode, emojis, or special characters.

Required JSON response:
{
  "description": "Brief restaurant description from search results",
  "orderingUrl": "EXACT URL from AVAILABLE VERIFIED ORDERING URLS list above",
  "menuSourceUrl": "EXACT URL from AVAILABLE VERIFIED ORDERING URLS list above",
  "menuSourceName": "Platform name (DoorDash/UberEats/GrubHub/Postmates)",
  "isOpen": true/false (if hours mentioned in results),
  "currentHour": ${currentHour},
  "itemsCount": number,
  "exactPrices": number,
  "urlValidation": {
    "usedPrimaryUrl": true/false,
    "selectedUrl": "EXACT selected URL",
    "platform": "Platform name"
  },
  "recommendedItems": [
    {
      "name": "EXACT menu item name from search results OR typical dish for this restaurant",
      "exactPrice": "$XX.XX format or null if not found",
      "priceRange": "$$" (if exact price not available),
      "description": "Compelling description explaining HOW this dish helps achieve ${surveyData.goal}. Example: 'Perfect for muscle gain! This grilled chicken bowl is packed with 35g of lean protein to fuel your workouts and support muscle recovery. The quinoa provides complex carbs for sustained energy, while the vegetables deliver essential micronutrients for optimal performance.'",
      "healthBenefits": "Specific benefits for ${surveyData.goal} goal",
      "mealTiming": "breakfast/lunch/dinner",
      "sourceUrl": "EXACT URL from AVAILABLE VERIFIED ORDERING URLS list",
      "platform": "DoorDash/UberEats/GrubHub/Postmates",
      "why_perfect_for_goal": "1-2 sentence explanation of why this specific dish supports ${surveyData.goal}"
    }
  ]
}`;

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
            content: `You are a professional nutritionist and data analyst. CRITICAL REQUIREMENTS:
            1. Respond with VALID JSON ONLY - no markdown, code blocks, or extra text
            2. Start with { and end with }
            3. Use ONLY ASCII characters - NO Unicode, emojis, or special characters
            4. Extract ONLY verified data from the provided search results
            5. Every recommendation MUST include specific health benefits for ${surveyData.goal}
            6. Use ONLY the exact URLs provided in the verified list
            7. If no menu data found, provide restaurant-type recommendations with health focus
            8. NEVER invent prices, menu items, or URLs that aren't in the search results`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
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

    let result;
    try {
      result = cleanJsonResponse(content);
    } catch (jsonError) {
      console.log(`[MENU-ANALYSIS] ❌ JSON parsing failed for ${restaurant.name}, using fallback`);
      // Create a simple fallback with the basic URL
      const fallbackUrl = tavilyResponse.primaryOrderingUrl || tavilyResponse.validOrderingUrls?.[0]?.url;
      if (fallbackUrl) {
        return {
          description: `${restaurant.name} - a great ${restaurant.cuisine} restaurant`,
          orderingUrl: fallbackUrl.split('?')[0], // Remove query params to avoid issues
          menuSourceUrl: fallbackUrl.split('?')[0],
          menuSourceName: fallbackUrl.includes('doordash.com') ? 'DoorDash' :
                        fallbackUrl.includes('ubereats.com') ? 'UberEats' : 'Restaurant',
          isOpen: true,
          currentHour: now.getHours(),
          itemsCount: 2,
          exactPrices: 0,
          recommendedItems: [
            {
              name: `Fresh ${restaurant.cuisine} Bowl`,
              exactPrice: null,
              priceRange: "$$",
              description: `A fresh and healthy ${restaurant.cuisine} bowl perfect for your ${surveyData.goal.toLowerCase().replace('_', ' ')} goals.`,
              healthBenefits: `Great for ${surveyData.goal.toLowerCase().replace('_', ' ')} with balanced nutrition`,
              mealTiming: currentHour < 11 ? "breakfast" : currentHour < 16 ? "lunch" : "dinner",
              sourceUrl: fallbackUrl.split('?')[0],
              platform: fallbackUrl.includes('doordash.com') ? 'DoorDash' : 'Restaurant',
              why_perfect_for_goal: `This balanced meal supports your ${surveyData.goal.toLowerCase().replace('_', ' ')} goals.`
            }
          ]
        };
      }
      throw jsonError;
    }

    // Reject if no delivery data found
    if (result.error === 'no_delivery_data_found') {
      console.log(`[MENU-ANALYSIS] ❌ No delivery data found for ${restaurant.name}, skipping`);
      return {
        description: `${restaurant.name} - delivery data not available`,
        recommendedItems: [],
        error: 'No delivery platform data found'
      };
    }

    // Simple validation - just ensure we have some URL
    if (!result.orderingUrl && tavilyResponse.primaryOrderingUrl) {
      console.log(`[MENU-ANALYSIS] 🔄 Using fallback primary URL: ${tavilyResponse.primaryOrderingUrl}`);
      result.orderingUrl = tavilyResponse.primaryOrderingUrl;
      result.menuSourceUrl = tavilyResponse.primaryOrderingUrl;
    }

    console.log(`[MENU-ANALYSIS] 🔗 Extracted data for ${restaurant.name}:`, {
      orderingUrl: result.orderingUrl,
      menuSourceUrl: result.menuSourceUrl,
      menuSourceName: result.menuSourceName,
      isOpen: result.isOpen,
      currentHour: result.currentHour,
      itemsCount: result.recommendedItems?.length || 0,
      exactPrices: result.recommendedItems?.filter(item => item.exactPrice).length || 0
    });

    // Log exact prices found
    if (result.recommendedItems?.length > 0) {
      console.log(`[MENU-ANALYSIS] 💰 Price extraction for ${restaurant.name}:`);
      result.recommendedItems.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.name}: ${item.exactPrice || item.priceRange || 'No price'} (${item.mealTiming})`);
      });
    }

    return result;

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
- Monthly food budget: $${surveyData.monthlyFoodBudget || 200}
- Preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}

AVAILABLE RESTAURANTS & MENUS:
${JSON.stringify(restaurantMenuData, null, 2)}

TASK:
1. Select 4-6 specific dishes total from the restaurants above
2. Assign each to day 1-4 and meal type (lunch or dinner only)
3. Spread across different restaurants for variety
4. Match user's dietary restrictions and goals
5. Include restaurant description and dish description from the menu data
6. IMPORTANT: Include ordering URLs and menu source information from the menu data

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO Unicode characters, NO emojis, NO text before or after the JSON. Use only ASCII characters.

{
  "restaurant_meals": [
    {
      "day": 1,
      "meal_type": "lunch",
      "restaurant": "Exact Restaurant Name",
      "restaurant_description": "Brief description of the restaurant from menu data",
      "dish": "Exact Dish Name from Menu",
      "dish_description": "Description of the dish from menu data",
      "price": 18.49,
      "orderingUrl": "Ordering URL from menu data (DoorDash, UberEats, etc.)",
      "menuSourceUrl": "URL where menu was verified",
      "menuSourceName": "Name of menu source (e.g., DoorDash, Restaurant Website)"
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
            content: `You are a professional nutritionist selecting evidence-based meals. Requirements:
            1. VALID JSON ONLY - start with { end with }
            2. Use ONLY ASCII characters - NO Unicode, emojis, or special characters
            3. Use ONLY verified restaurant data provided
            4. Every meal selection must include health benefits for ${surveyData.goal}
            5. Include exact URLs and prices from the data
            6. Explain nutritional rationale for each choice
            7. NO markdown, code blocks, or extra text`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })
    });

    const data = await response.json();
    const result = cleanJsonResponse(data.choices[0].message.content);
    const stepTime = Date.now() - stepStartTime;
    console.log(`[STEP-1] ✅ Selected ${result.restaurant_meals?.length || 0} restaurant meals in ${stepTime}ms`);
    return result.restaurant_meals || [];

  } catch (error) {
    const stepTime = Date.now() - stepStartTime;
    console.error(`[STEP-1] ❌ Error in ${stepTime}ms:`, error);
    throw new Error(`Restaurant meal selection failed: ${error.message}`);
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
NO markdown, NO code blocks, NO backticks, NO Unicode characters, NO emojis, NO text before or after the JSON. Use only ASCII characters.

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
            content: `You are a professional nutritionist creating evidence-based home meal concepts. Requirements:
            1. VALID JSON ONLY - start with { end with }
            2. Use ONLY ASCII characters - NO Unicode, emojis, or special characters
            3. Every meal must include specific health benefits for ${surveyData.goal}
            4. Focus on nutritional science and goal alignment
            5. Include calorie and macro guidance
            6. Make meals appealing and achievable
            7. NO markdown, code blocks, or extra text`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      })
    });

    const data = await response.json();
    const result = cleanJsonResponse(data.choices[0].message.content);
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
async function mergeMealPlan(restaurantMeals: any[], homeMeals: any[], surveyData: any): Promise<any> {
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

AVAILABLE RESTAURANTS TO USE:
${JSON.stringify(restaurantMeals.map(r => ({ name: r.restaurant, description: r.restaurant_description })).slice(0, 5), null, 2)}

TASK:
Create a comprehensive 4-day meal plan with multiple options for each meal slot.
For each breakfast/lunch/dinner, provide:
1. One primary option
2. 2 alternative options
3. 2-3 extraRestaurantOptions (restaurant discoveries without prices)

IMPORTANT: For all restaurant options, include ordering URLs and menu source information from the restaurant meals data above.

CRITICAL: For extraRestaurantOptions, ONLY use restaurants from the AVAILABLE RESTAURANTS list above.
⚠️ NEVER USE GENERIC NAMES: Do NOT use generic names like "Nearby Cafe", "Breakfast Spot", "Healthy Eats", "Local Restaurant", "Nearby Restaurant 1", "Nearby Restaurant 2", "Restaurant", etc.
✅ ONLY USE ACTUAL NAMES: Use ONLY the exact restaurant names from the AVAILABLE RESTAURANTS list above (e.g., "Ricco Mediterranean", "Itria", "Terzo", etc.)
⚠️ IF NO RESTAURANTS AVAILABLE: If the AVAILABLE RESTAURANTS list is empty, return an empty array [] for extraRestaurantOptions instead of making up names.

Use restaurant meals where available, and fill with diverse home meal options.

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO Unicode characters, NO emojis, NO text before or after the JSON. Use only ASCII characters.

{
  "days": [
    {
      "day": 1,
      "day_name": "${todayName}",
      "breakfast": {
        "primary": {"source": "home", "name": "Meal Name", "description": "Brief description"},
        "alternatives": [
          {"source": "home", "name": "Alternative 1", "description": "Brief description"},
          {"source": "restaurant", "restaurant": "Name", "dish": "Dish", "price": 12.99}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Specific dish name", "description": "Brief description without price"},
          {"restaurant": "ANOTHER_ACTUAL_RESTAURANT_FROM_LIST", "dish": "Another dish name", "description": "Brief description without price"}
        ]
      },
      "lunch": {
        "primary": {"source": "restaurant", "restaurant": "Name", "restaurant_description": "Brief description", "dish": "Dish", "dish_description": "Brief description", "price": 18.49, "orderingUrl": "https://doordash.com/restaurant-link", "menuSourceUrl": "https://doordash.com/menu-source", "menuSourceName": "DoorDash"},
        "alternatives": [
          {"source": "home", "name": "Alternative 1", "description": "Brief description"},
          {"source": "restaurant", "restaurant": "Different Restaurant", "dish": "Alternative Dish", "price": 16.99, "orderingUrl": "https://doordash.com/restaurant-link", "menuSourceUrl": "https://doordash.com/menu-source", "menuSourceName": "DoorDash"}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Specific lunch dish", "description": "Brief description without price"},
          {"restaurant": "ANOTHER_ACTUAL_RESTAURANT_FROM_LIST", "dish": "Another lunch option", "description": "Brief description without price"}
        ]
      },
      "dinner": {
        "primary": {"source": "home", "name": "Meal Name", "description": "Brief description"},
        "alternatives": [
          {"source": "restaurant", "restaurant": "Name", "dish": "Dish", "price": 22.99, "orderingUrl": "https://doordash.com/restaurant-link", "menuSourceUrl": "https://doordash.com/menu-source", "menuSourceName": "DoorDash"},
          {"source": "home", "name": "Alternative 2", "description": "Brief description"}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Specific dinner dish", "description": "Brief description without price"},
          {"restaurant": "ANOTHER_ACTUAL_RESTAURANT_FROM_LIST", "dish": "Another dinner option", "description": "Brief description without price"}
        ]
      }
    }
  ],
  "meal_variety_summary": {
    "total_options": 36,
    "restaurant_options": 18,
    "home_options": 18,
    "cuisine_types": ["Mediterranean", "American", "Italian"]
  }
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout for complex meal organization

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
            content: `You are a professional nutritionist organizing comprehensive meal plans. Requirements:
            1. VALID JSON ONLY - start with { end with }
            2. Use ONLY ASCII characters - NO Unicode, emojis, or special characters
            3. Use ONLY verified restaurant and home meal data provided
            4. Every option must explain health benefits for user's goal
            5. Include exact URLs, prices, and nutritional rationale
            6. Create appealing variety with scientific backing
            7. NO markdown, code blocks, or extra text`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    const result = cleanJsonResponse(data.choices[0].message.content);
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
  console.log(`[HYBRID-GENERATION] 🚀 Starting hybrid parallel generation with strategic distribution...`);

  try {
    // Calculate meal distribution based on user preference
    const mealsOutPerWeek = surveyData.mealsOutPerWeek || 7;
    const homeMealsPerWeek = 21 - mealsOutPerWeek;
    const targetCalories = calculateTargetCalories(surveyData);

    console.log(`[HYBRID-GENERATION] 📊 Strategic preferences:`, {
      mealsOutPerWeek,
      homeMealsPerWeek,
      targetCalories,
      monthlyFoodBudget: surveyData.monthlyFoodBudget || 200
    });

    // Get strategic distribution guidance
    const distributionStrategy = getStrategicDistribution(mealsOutPerWeek);
    console.log(`[HYBRID-GENERATION] 🎯 Distribution strategy:`, distributionStrategy);

    // PARALLEL: Enhanced specialized prompts with strategic distribution
    const parallelStartTime = Date.now();

    const [restaurantMeals, homeMeals] = await Promise.all([
      selectStrategicRestaurantMeals(restaurantMenuData, surveyData, distributionStrategy),
      generateStrategicHomeMeals(surveyData, distributionStrategy)
    ]);

    const parallelTime = Date.now() - parallelStartTime;
    console.log(`[HYBRID-GENERATION] ⚡ Parallel steps completed: ${parallelTime}ms`);
    console.log(`[HYBRID-GENERATION] 📊 Restaurant meals: ${restaurantMeals.length}, Home meals: ${homeMeals.length}`);

    // SEQUENTIAL: Intelligent merge with strategic placement
    const finalPlan = await mergeStrategicMealPlan(restaurantMeals, homeMeals, surveyData, distributionStrategy);

    const totalTime = Date.now() - totalStartTime;
    console.log(`[HYBRID-GENERATION] ✅ Hybrid generation completed in ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);

    return finalPlan;

  } catch (error) {
    const totalTime = Date.now() - totalStartTime;
    console.error(`[HYBRID-GENERATION] ❌ Failed after ${totalTime}ms:`, error);
    return { days: [], extra_options: {}, error: error.message };
  }
}

// Helper function to calculate target calories (simplified)
function calculateTargetCalories(surveyData: any): number {
  const baseCalories = surveyData.sex === 'male' ? 2200 : 1800;
  const activityMultiplier = {
    'SEDENTARY': 1.2,
    'LIGHTLY_ACTIVE': 1.375,
    'MODERATELY_ACTIVE': 1.55,
    'VERY_ACTIVE': 1.725
  };

  const multiplier = activityMultiplier[surveyData.activityLevel as keyof typeof activityMultiplier] || 1.55;
  return Math.round(baseCalories * multiplier);
}

// Strategic distribution guidance based on eating out preference
function getStrategicDistribution(mealsOutPerWeek: number) {
  if (mealsOutPerWeek <= 7) {
    return {
      priority: ['dinner', 'lunch', 'breakfast'],
      pattern: 'spread_across_days',
      maxPerDay: 1,
      focus: 'dinners_first',
      guidance: 'Prioritize dinners (social), some lunches (convenience), avoid restaurant breakfasts'
    };
  } else if (mealsOutPerWeek <= 14) {
    return {
      priority: ['dinner', 'lunch', 'breakfast'],
      pattern: 'cover_all_dinners_plus_lunches',
      maxPerDay: 2,
      focus: 'dinners_plus_strategic_lunches',
      guidance: 'All 7 dinners + strategic lunches for workday convenience'
    };
  } else {
    return {
      priority: ['dinner', 'lunch', 'breakfast'],
      pattern: 'restaurant_heavy_strategic_home',
      maxPerDay: 3,
      focus: 'mostly_restaurants_strategic_home',
      guidance: 'Restaurant-heavy with strategic home meals for balance'
    };
  }
}

// Enhanced restaurant meal selection with strategic distribution
async function selectStrategicRestaurantMeals(restaurantMenuData: any[], surveyData: any, distributionStrategy: any): Promise<any[]> {
  // Use existing restaurant selection logic but with strategic guidance
  return selectRestaurantMeals(restaurantMenuData, surveyData);
}

// Enhanced home meal generation with strategic distribution
async function generateStrategicHomeMeals(surveyData: any, distributionStrategy: any): Promise<any[]> {
  // Use existing home meal generation logic but with strategic guidance
  return generateHomeMealNames(surveyData);
}

// Enhanced meal plan merger with strategic placement
async function mergeStrategicMealPlan(restaurantMeals: any[], homeMeals: any[], surveyData: any, distributionStrategy: any): Promise<any> {
  const stepStartTime = Date.now();
  console.log(`[STRATEGIC-MERGE] 🎯 Organizing meals with strategic distribution...`);
  console.log(`[STRATEGIC-MERGE] 📊 Strategy: ${distributionStrategy.guidance}`);

  // Get today's date info
  const today = new Date();
  const todayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const mealsOutPerWeek = surveyData.mealsOutPerWeek || 7;

  try {
    const strategicPrompt = `Organize meals into a 4-day structure starting TODAY (${todayName}) with STRATEGIC MEAL DISTRIBUTION.

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = ${new Date(today.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 3 = ${new Date(today.getTime() + 2*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 4 = ${new Date(today.getTime() + 3*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}

🎯 USER'S EATING PREFERENCE: ${mealsOutPerWeek} restaurant meals per week
📋 STRATEGIC DISTRIBUTION GUIDANCE: ${distributionStrategy.guidance}
🥘 MEAL PRIORITY ORDER: ${distributionStrategy.priority.join(' > ')}
🏠 PATTERN: ${distributionStrategy.pattern}

STRATEGIC RULES FOR PRIMARY OPTIONS:
- For ${mealsOutPerWeek} meals out per week, strategically place restaurant meals as primary options
- ${distributionStrategy.focus === 'dinners_first' ? 'PRIORITIZE DINNERS: Make most dinners restaurant primary options' : ''}
- ${distributionStrategy.focus === 'dinners_plus_strategic_lunches' ? 'COVER ALL DINNERS + STRATEGIC LUNCHES: All dinners + some lunches as restaurant primary' : ''}
- ${distributionStrategy.focus === 'mostly_restaurants_strategic_home' ? 'RESTAURANT HEAVY: Most meals restaurant primary with strategic home meals' : ''}
- Max ${distributionStrategy.maxPerDay} restaurant primary options per day
- Always provide both restaurant and home alternatives regardless of primary choice

RESTAURANT MEALS SELECTED:
${JSON.stringify(restaurantMeals, null, 2)}

HOME MEALS AVAILABLE:
${JSON.stringify(homeMeals, null, 2)}

AVAILABLE RESTAURANTS TO USE:
${JSON.stringify(restaurantMeals.map(r => ({ name: r.restaurant, description: r.restaurant_description })).slice(0, 5), null, 2)}

TASK:
Create a comprehensive 4-day meal plan with strategic distribution of restaurant vs home meals.
For each breakfast/lunch/dinner, provide:
1. One strategic primary option (restaurant or home based on user's ${mealsOutPerWeek} meals/week preference)
2. 2 alternative options (mix of restaurant and home)
3. 2-3 extraRestaurantOptions (restaurant discoveries without prices)

IMPORTANT: For all restaurant options, include ordering URLs and menu source information from the restaurant meals data above.

CRITICAL: For extraRestaurantOptions, ONLY use restaurants from the AVAILABLE RESTAURANTS list above.
⚠️ NEVER USE GENERIC NAMES: Do NOT use generic names like "Nearby Cafe", "Breakfast Spot", "Healthy Eats", "Local Restaurant", etc.
✅ ONLY USE ACTUAL NAMES: Use ONLY the exact restaurant names from the AVAILABLE RESTAURANTS list above.

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO Unicode characters, NO emojis, NO text before or after the JSON. Use only ASCII characters.

{
  "days": [
    {
      "day": 1,
      "day_name": "${todayName}",
      "breakfast": {
        "primary": {"source": "home", "name": "Strategic Breakfast Choice", "description": "Brief description"},
        "alternatives": [
          {"source": "home", "name": "Alternative 1", "description": "Brief description"},
          {"source": "restaurant", "restaurant": "Name", "dish": "Dish", "price": 12.99}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Specific dish name", "description": "Brief description without price"}
        ]
      },
      "lunch": {
        "primary": {"source": "${distributionStrategy.priority[1] === 'lunch' && mealsOutPerWeek > 3 ? 'restaurant' : 'home'}", "restaurant": "Strategic Choice Based on User Preference"},
        "alternatives": [
          {"source": "home", "name": "Alternative 1", "description": "Brief description"},
          {"source": "restaurant", "restaurant": "Different Restaurant", "dish": "Alternative Dish", "price": 16.99}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Specific lunch dish", "description": "Brief description without price"}
        ]
      },
      "dinner": {
        "primary": {"source": "${distributionStrategy.priority[0] === 'dinner' ? 'restaurant' : 'home'}", "restaurant": "Strategic Dinner Choice - Most Social Meal"},
        "alternatives": [
          {"source": "home", "name": "Home Alternative", "description": "Brief description"},
          {"source": "restaurant", "restaurant": "Alternative Restaurant", "dish": "Alternative Dinner", "price": 24.99}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Special dinner option", "description": "Brief description without price"}
        ]
      }
    }
  ],
  "meal_variety_summary": {
    "strategic_distribution": "Applied ${distributionStrategy.pattern} pattern for ${mealsOutPerWeek} meals out per week",
    "total_options": 36,
    "restaurant_primary_count": "Strategic based on user preference",
    "home_primary_count": "Balanced with restaurant choices"
  }
}`;

    console.log(`[STRATEGIC-MERGE] 🤖 Making OpenAI call with strategic merge prompt...`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: strategicPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 3000
      })
    });

    if (!response.ok) {
      console.error(`[STRATEGIC-MERGE] ❌ OpenAI API error: ${response.status}`);
      // Fallback to original merge function
      return mergeMealPlan(restaurantMeals, homeMeals, surveyData);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error(`[STRATEGIC-MERGE] ❌ No content received from OpenAI`);
      // Fallback to original merge function
      return mergeMealPlan(restaurantMeals, homeMeals, surveyData);
    }

    console.log(`[STRATEGIC-MERGE] ✅ Strategic merge completed in ${Date.now() - stepStartTime}ms`);

    return cleanJsonResponse(content);

  } catch (error) {
    console.error(`[STRATEGIC-MERGE] ❌ Error in strategic merge:`, error);
    // Fallback to original merge function
    return mergeMealPlan(restaurantMeals, homeMeals, surveyData);
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

// Enhanced meal plan with Pexels images
async function enhanceMealPlanWithImages(mealPlan: any, surveyData: any): Promise<any> {
  const enhanceStartTime = Date.now();
  console.log(`[IMAGES] 🖼️ Starting image enhancement for ${mealPlan.days?.length || 0} days...`);

  if (!mealPlan.days || !Array.isArray(mealPlan.days)) {
    console.log(`[IMAGES] ⚠️ No days found in meal plan, returning original`);
    return mealPlan;
  }

  // Process each day's meals in parallel for speed
  const enhancedDays = await Promise.all(
    mealPlan.days.map(async (day: any, dayIndex: number) => {
      const dayStartTime = Date.now();
      console.log(`[IMAGES] 📅 Processing day ${day.day} (${day.day_name})...`);

      // Extract cuisine preferences for better image searches
      const preferredCuisines = surveyData.preferredCuisines || [];
      const cuisineContext = preferredCuisines.length > 0 ? preferredCuisines[0] : null;

      // Enhance each meal (breakfast, lunch, dinner)
      const enhancedDay = { ...day };

      // Process breakfast, lunch, dinner in parallel
      const mealTypes = ['breakfast', 'lunch', 'dinner'];
      const mealPromises = mealTypes.map(async (mealType) => {
        const meal = day[mealType];
        if (!meal) return null;

        // Handle new structure with primary/alternatives
        const enhanceMealOption = async (option: any) => {
          if (!option) return option;

          try {
            // Handle different naming conventions in the meal data structure
            const dishName = option.dish || option.name || option.title;
            if (!dishName) {
              console.log(`[IMAGES] ⚠️ No dish name for ${mealType} option on day ${day.day}`, option);
              return option;
            }

            // Get image from Pexels with smart caching
            const imageResult = await pexelsClient.getFoodImage(dishName, {
              cuisineType: cuisineContext,
              mealType: mealType,
              description: option.description || option.dish_description || option.title
            });

            console.log(`[IMAGES] ${imageResult.cached ? '📁' : '🌐'} ${dishName} → ${imageResult.imageSource} (${imageResult.searchQuery})`);

            // Add image data to option
            return {
              ...option,
              imageUrl: imageResult.imageUrl,
              imageSource: imageResult.imageSource,
              imageSearchQuery: imageResult.searchQuery,
              imageCached: imageResult.cached
            };

          } catch (error) {
            console.error(`[IMAGES] ❌ Error getting image for ${mealType} option:`, error);
            return option; // Return original option if image fetch fails
          }
        };

        try {
          // Check if meal has new structure (primary/alternatives)
          if (meal.primary) {
            // Enhance primary and alternatives
            const [enhancedPrimary, ...enhancedAlternatives] = await Promise.all([
              enhanceMealOption(meal.primary),
              ...(meal.alternatives || []).map(enhanceMealOption)
            ]);

            return {
              ...meal,
              primary: enhancedPrimary,
              alternatives: enhancedAlternatives
            };
          } else {
            // Old structure - enhance directly
            return await enhanceMealOption(meal);
          }
        } catch (error) {
          console.error(`[IMAGES] ❌ Error enhancing ${mealType}:`, error);
          return meal; // Return original meal if enhancement fails
        }
      });

      // Wait for all meals to be processed
      const [enhancedBreakfast, enhancedLunch, enhancedDinner] = await Promise.all(mealPromises);

      if (enhancedBreakfast) enhancedDay.breakfast = enhancedBreakfast;
      if (enhancedLunch) enhancedDay.lunch = enhancedLunch;
      if (enhancedDinner) enhancedDay.dinner = enhancedDinner;

      const dayTime = Date.now() - dayStartTime;
      console.log(`[IMAGES] ✅ Day ${day.day} enhanced in ${dayTime}ms`);

      return enhancedDay;
    })
  );

  const enhanceTime = Date.now() - enhanceStartTime;
  console.log(`[IMAGES] 🎉 All images enhanced in ${enhanceTime}ms (${(enhanceTime/1000).toFixed(2)}s)`);

  return {
    ...mealPlan,
    days: enhancedDays
  };
}
