import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient } from '@/lib/external/places-client';
import { TavilyClient } from 'tavily';
import { pexelsClient } from '@/lib/external/pexels-client';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import {
  createRestaurantSelectionPrompt,
  createExtractionUrlSelectionPrompt,
  createMenuAnalysisPrompt,
  createDeliveryPlatformAnalysisPrompt,
  createRestaurantMealSelectionPrompt,
  createHomeMealGenerationPrompt,
  createMealPlanOrganizationPrompt,
  createNutritionTargetRefinementPrompt,
  createRestaurantNutritionAnalysisPrompt,
  createHomeRecipeGenerationPrompt,
  createMealPlanValidationPrompt,
  type Restaurant,
  type MenuExtractionContext
} from '@/lib/ai/prompts';

// Helper function to count restaurant meals from weekly schedule
function countRestaurantMeals(weeklyMealSchedule: any): number {
  if (!weeklyMealSchedule || typeof weeklyMealSchedule !== 'object') {
    return 7; // Default fallback
  }

  let count = 0;
  Object.values(weeklyMealSchedule).forEach((dayMeals: any) => {
    if (dayMeals?.breakfast === 'restaurant') count++;
    if (dayMeals?.lunch === 'restaurant') count++;
    if (dayMeals?.dinner === 'restaurant') count++;
  });

  return count;
}

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
      console.log(`[DATABASE] 💾 Saving meal plan to database for survey: ${surveyData.id}, userId: ${userId || 'null'}`);
      console.log(`[DATABASE] 🔍 Using identifiers - surveyId: ${surveyData.id}, userId: ${userId || 'null'}`);
      const weekOfDate = new Date();
      weekOfDate.setHours(0, 0, 0, 0);

      const createdMealPlan = await prisma.mealPlan.create({
        data: {
          surveyId: surveyData.id,
          userId: userId || null,
          weekOf: weekOfDate,
          userContext: enhancedMealPlan,
          status: 'active',
          regenerationCount: 1
        }
      });
      console.log(`[DATABASE] ✅ Meal plan saved successfully with ID: ${createdMealPlan.id}, surveyId: ${createdMealPlan.surveyId}`);
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

    const prompt = createRestaurantSelectionPrompt(restaurants, surveyData);

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

// Enhanced dual URL selection: extraction URL + ordering URL
async function selectDualUrls(searchResults: any[], restaurant: any): Promise<{extractionUrl: string | null, orderingUrl: string | null}> {
  try {
    if (!searchResults || searchResults.length === 0) {
      return { extractionUrl: null, orderingUrl: null };
    }

    // Separate URLs by type
    const extractionUrls = searchResults
      .filter(r => {
        const url = r.url?.toLowerCase() || '';
        return !url.includes('doordash.com') &&
               !url.includes('ubereats.com') &&
               !url.includes('grubhub.com') &&
               !url.includes('postmates.com');
      })
      .slice(0, 6);

    const orderingUrls = searchResults
      .filter(r => {
        const url = r.url?.toLowerCase() || '';
        return url.includes('doordash.com') ||
               url.includes('ubereats.com') ||
               url.includes('grubhub.com');
      })
      .slice(0, 4);

    // Get best extraction URL (restaurant website)
    let extractionUrl = null;
    if (extractionUrls.length > 0) {
      extractionUrl = await selectBestExtractionUrl(extractionUrls, restaurant);
    }

    // Get best ordering URL (DoorDash with location verification)
    let orderingUrl = null;
    if (orderingUrls.length > 0) {
      orderingUrl = await selectBestOrderingUrl(orderingUrls, restaurant);
    }

    // If no ordering URL found, use extraction URL as fallback
    if (!orderingUrl && extractionUrl) {
      orderingUrl = extractionUrl;
    }

    return { extractionUrl, orderingUrl };

  } catch (error) {
    console.error('[DUAL-URL] Error in dual URL selection:', error);
    return { extractionUrl: null, orderingUrl: null };
  }
}

// Select best URL for menu extraction
async function selectBestExtractionUrl(extractionUrls: any[], restaurant: any): Promise<string | null> {
  if (extractionUrls.length === 0) return null;
  if (extractionUrls.length === 1) return extractionUrls[0].url;

  const prompt = createExtractionUrlSelectionPrompt(extractionUrls, restaurant);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: 'You are an expert at identifying menu extraction URLs. Return only a number.'
        }, {
          role: 'user',
          content: prompt
        }],
        temperature: 0.1,
        max_tokens: 5
      })
    });

    if (!response.ok) {
      return extractionUrls[0].url;
    }

    const data = await response.json();
    const choice = parseInt(data.choices[0]?.message?.content?.trim()) - 1;

    if (choice >= 0 && choice < extractionUrls.length) {
      return extractionUrls[choice].url;
    }

    return extractionUrls[0].url;

  } catch (error) {
    console.error('[EXTRACTION-URL] Error:', error);
    return extractionUrls[0].url;
  }
}

// Select best ordering URL with location verification
async function selectBestOrderingUrl(orderingUrls: any[], restaurant: any): Promise<string | null> {
  if (orderingUrls.length === 0) return null;

  // Simple location verification - check if restaurant name and city match
  const verifiedUrls = orderingUrls.filter(r => {
    const title = r.title?.toLowerCase() || '';
    const content = r.content?.toLowerCase() || '';
    const url = r.url?.toLowerCase() || '';

    const restaurantName = restaurant.name.toLowerCase();
    const city = restaurant.city.toLowerCase();

    // Check if restaurant name appears in title/content
    const hasRestaurantName = title.includes(restaurantName) || content.includes(restaurantName);
    // Check if city appears (more flexible)
    const hasLocation = title.includes(city) || content.includes(city) || url.includes(city);

    return hasRestaurantName && (hasLocation || url.includes('doordash.com/store/'));
  });

  if (verifiedUrls.length > 0) {
    console.log(`[ORDERING-URL] ✅ Found ${verifiedUrls.length} verified ordering URLs`);
    return verifiedUrls[0].url;
  }

  // Fallback to first ordering URL if verification fails
  console.log(`[ORDERING-URL] ⚠️ Using unverified ordering URL`);
  return orderingUrls[0].url;
}

// Extract menu content using Tavily
async function extractMenuContent(url: string): Promise<string | null> {
  try {
    console.log(`[TAVILY-EXTRACT] Extracting content from: ${url}`);

    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        urls: [url]
      })
    });

    if (!response.ok) {
      console.log(`[TAVILY-EXTRACT] ❌ API error ${response.status}: ${response.statusText}`);
      return null;
    }

    const extractResponse = await response.json();
    console.log(`[TAVILY-EXTRACT] 📋 API response structure:`, Object.keys(extractResponse));

    if (extractResponse && extractResponse.results && extractResponse.results.length > 0) {
      const content = extractResponse.results[0].content || extractResponse.results[0].raw_content;
      console.log(`[TAVILY-EXTRACT] ✅ Extracted ${content?.length || 0} characters`);
      return content || null;
    }

    console.log(`[TAVILY-EXTRACT] ❌ No content extracted from response`);
    return null;

  } catch (error) {
    console.error('[TAVILY-EXTRACT] Error extracting content:', error);
    return null;
  }
}

// Try extract-based analysis with fallback
async function tryExtractAnalysis(restaurant: any, tavilyResponse: any, surveyData: any): Promise<any> {
  try {
    console.log(`[EXTRACT-ANALYSIS] 🔍 Trying extract-based analysis for ${restaurant.name}`);

    // Get dual URLs (extraction vs ordering)
    const { extractionUrl, orderingUrl } = await selectDualUrls(tavilyResponse.results || [], restaurant);

    if (!extractionUrl) {
      console.log(`[EXTRACT-ANALYSIS] ❌ No extraction URL found for ${restaurant.name}`);
      return null;
    }

    console.log(`[EXTRACT-ANALYSIS] 📋 Using extraction URL: ${extractionUrl}`);
    console.log(`[EXTRACT-ANALYSIS] 🛒 Using ordering URL: ${orderingUrl}`);

    // Extract full page content using Tavily
    const menuContent = await extractMenuContent(extractionUrl);

    if (!menuContent || menuContent.length < 100) {
      console.log(`[EXTRACT-ANALYSIS] ❌ Insufficient content extracted (${menuContent?.length || 0} chars)`);
      return null;
    }

    console.log(`[EXTRACT-ANALYSIS] ✅ Extracted ${menuContent.length} characters of content`);

    // Create enhanced tavily response with extracted content
    const enhancedTavilyResponse = {
      ...tavilyResponse,
      menuContent: menuContent,
      extractionUrl: extractionUrl,
      orderingUrl: orderingUrl || extractionUrl
    };

    // Analyze the extracted content
    const analysis = await analyzeExtractedMenuWithGPT(restaurant, enhancedTavilyResponse, surveyData);

    if (analysis && analysis.recommendedItems && analysis.recommendedItems.length > 0) {
      // Enhance the output to match expected structure
      const enhancedAnalysis = {
        ...analysis,
        menuSourceName: extractionUrl.includes('doordash.com') ? 'DoorDash' :
                        extractionUrl.includes('ubereats.com') ? 'UberEats' :
                        extractionUrl.includes('grubhub.com') ? 'GrubHub' : 'Web',
        isOpen: true, // Assume open if we got content
        currentHour: new Date().getHours(),
        itemsCount: analysis.recommendedItems.length,
        exactPrices: analysis.recommendedItems.filter(item => item.exactPrice && item.exactPrice !== null).length,
        urlValidation: {
          usedPrimaryUrl: true,
          selectedUrl: extractionUrl,
          platform: extractionUrl.includes('doordash.com') ? 'DoorDash' : 'Web'
        }
      };

      console.log(`[EXTRACT-ANALYSIS] ✅ Successfully extracted ${enhancedAnalysis.itemsCount} items for ${restaurant.name}`);
      return enhancedAnalysis;
    }

    console.log(`[EXTRACT-ANALYSIS] ❌ No valid analysis from extracted content`);
    return null;

  } catch (error) {
    console.log(`[EXTRACT-ANALYSIS] ❌ Extract analysis failed for ${restaurant.name}:`, error.message);
    return null;
  }
}

// Enhanced menu analysis using extracted content
async function analyzeExtractedMenuWithGPT(restaurant: any, tavilyResponse: any, surveyData: any): Promise<any> {
  try {
    if (!tavilyResponse.menuContent) {
      console.log(`[MENU-ANALYSIS] ❌ No menu content for ${restaurant.name}`);
      return null;
    }

    // Get current time and prepare data safely
    const now = new Date();
    const currentHour = now.getHours();
    const restaurantName = restaurant.name || 'Restaurant';
    const restaurantCuisine = restaurant.cuisine || 'Various';
    const restaurantCity = restaurant.city || 'Unknown';
    const userGoal = surveyData.goal || 'GENERAL_WELLNESS';
    const menuContent = tavilyResponse.menuContent; // No limit - use full content
    const extractionUrl = tavilyResponse.extractionUrl || '';
    const orderingUrl = tavilyResponse.orderingUrl || extractionUrl;

    const menuContext = {
      restaurantName,
      restaurantCuisine,
      restaurantCity,
      content: menuContent,
      currentHour,
      now
    };
    const prompt = createMenuAnalysisPrompt(menuContext);

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
            content: 'You are a nutritionist analyzing menu content. Extract specific menu items with calories. Return ONLY valid JSON.'
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

    let result;
    try {
      result = JSON.parse(content);
    } catch (jsonError) {
      console.log(`[MENU-ANALYSIS] ❌ JSON parsing failed for ${restaurantName}`);
      return null;
    }

    // Validate that we got actual menu items
    if (!result.recommendedItems || result.recommendedItems.length === 0) {
      console.log(`[MENU-ANALYSIS] ❌ No menu items extracted for ${restaurantName}`);
      return null;
    }

    console.log(`[MENU-ANALYSIS] ✅ Extracted ${result.recommendedItems.length} items for ${restaurantName}`);
    result.recommendedItems.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name}: ${item.exactPrice || 'No price'} (${item.estimatedCalories || '?'} cal)`);
    });

    return result;

  } catch (error) {
    console.error(`[MENU-ANALYSIS] ❌ Error analyzing menu:`, error);
    return null;
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

        // Try extract-based analysis first, fallback to search-based
        const menuAnalysis = await tryExtractAnalysis(restaurant, tavilyResponse, surveyData) ||
                             await analyzeMenuWithGPT(restaurant, tavilyResponse, surveyData);

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

    const prompt = createDeliveryPlatformAnalysisPrompt(restaurant, tavilyResponse, currentHour, now);

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
            8. NEVER invent prices, menu items, or URLs that aren't in the search results
            9. CRITICAL: Write all descriptions and benefits as DIRECT STATEMENTS without quotes
            10. Use natural language about nutrition - say "plenty of protein", "high protein", "good calories", not exact numbers
            11. VARY your language - avoid repetitive phrases like "to help with endurance now" or "perfect for your goals"
            12. Include diverse reasoning using phrases like "helps hit your protein goals", "nutrient-dense", "great for muscle building"`
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
    // Create nutrition targets object - we'll need to get this from context
    const nutritionTargets = { dailyTargets: { calories: 2000 }, mealTargets: { breakfast: { calories: 400 }, lunch: { calories: 600 }, dinner: { calories: 800 } } };
    const prompt = createRestaurantMealSelectionPrompt(todayName, surveyData, restaurantMenuData, nutritionTargets);

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
    const prompt = `Generate 12-15 diverse home-cooked meal names with descriptions for a 4-day period starting TODAY (${todayName}).

TODAY IS: ${todayName} (this is day 1)
Day 1 = ${todayName}
Day 2 = ${new Date(today.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 3 = ${new Date(today.getTime() + 2*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}
Day 4 = ${new Date(today.getTime() + 3*24*60*60*1000).toLocaleDateString('en-US', { weekday: 'long' })}

USER PREFERENCES:
- Goal: ${surveyData.goal}
- Dietary restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}

STRICT VARIETY REQUIREMENTS:
1. ZERO DUPLICATE CUISINES: Use completely different cuisine types (Mediterranean, Asian, Mexican, American, Italian, Indian, Thai, etc.)
2. ZERO DUPLICATE PROTEIN SOURCES: Vary proteins (chicken, fish, beef, pork, eggs, tofu, beans, turkey, etc.)
3. ZERO DUPLICATE COOKING METHODS: Mix grilled, baked, stir-fried, roasted, steamed, sauteed, etc.
4. ZERO SIMILAR INGREDIENTS: Avoid repeating main ingredients across meals

TASK:
Generate 12-15 completely unique home meal names with detailed descriptions.
Cover breakfast, lunch, and dinner options across 4 days.
Include estimated calories, protein content, and cuisine type for each.

REQUIREMENTS:
1. Match dietary restrictions perfectly
2. Extreme cuisine diversity (no two meals from same cuisine)
3. Mix of cooking complexities (quick breakfasts, moderate lunches/dinners)
4. Appealing and achievable for home cooking
5. Include calorie estimates for each meal

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO Unicode characters, NO emojis, NO text before or after the JSON. Use only ASCII characters.

{
  "home_meals": [
    {
      "name": "Mediterranean Quinoa Bowl",
      "description": "Fresh quinoa with cherry tomatoes, cucumber, feta, and olive oil dressing. Perfect for a light yet satisfying lunch.",
      "calories": 485,
      "protein": 18,
      "carbs": 52,
      "fat": 22,
      "cuisine_type": "Mediterranean",
      "protein_source": "quinoa",
      "cooking_method": "assembly"
    },
    {
      "name": "Thai Coconut Curry Chicken",
      "description": "Fragrant Thai green curry with chicken, vegetables, and coconut milk over jasmine rice.",
      "calories": 620,
      "protein": 35,
      "carbs": 45,
      "fat": 28,
      "cuisine_type": "Thai",
      "protein_source": "chicken",
      "cooking_method": "simmered"
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

STRICT VARIETY ENFORCEMENT ACROSS ALL 4 DAYS:
1. ZERO DUPLICATE CUISINES: Every meal must be from a completely different cuisine type
2. ZERO DUPLICATE PROTEINS: Every meal must use a different protein source
3. ZERO DUPLICATE COOKING METHODS: Every meal must use different cooking techniques
4. ZERO SIMILAR DISHES: No two meals can be similar (no pasta + noodles, no burgers + sandwiches)
5. MANDATORY CALORIE DATA: Every single meal option must include accurate calories, protein, carbs, and fat

TASK:
Create a comprehensive 4-day meal plan with MAXIMUM VARIETY across all 36 total meal options.
For each breakfast/lunch/dinner, provide:
1. One primary option with full nutrition data
2. 2 alternative options with full nutrition data
3. 2-3 extraRestaurantOptions (restaurant discoveries without prices but with estimated calories)

MANDATORY NUTRITION REQUIREMENTS (NO EXCEPTIONS):
- Every single meal option MUST include: calories (number), protein (number), carbs (number), fat (number)
- ALL nutrition values must be realistic numbers, never null, never missing
- Breakfast: 300-500 cal (rounded to nearest 25), 15-30g protein, 30-60g carbs, 10-25g fat
- Lunch: 450-700 cal (rounded to nearest 25), 25-40g protein, 40-80g carbs, 15-35g fat
- Dinner: 550-850 cal (rounded to nearest 25), 30-50g protein, 50-100g carbs, 20-40g fat
- If nutrition data unavailable, estimate based on typical values for that dish type
- REJECT any meal option that lacks complete nutrition data

IMPORTANT: For all restaurant options, include ordering URLs and menu source information from the restaurant meals data above.

CRITICAL: For extraRestaurantOptions, ONLY use restaurants from the AVAILABLE RESTAURANTS list above.
⚠️ NEVER USE GENERIC NAMES: Do NOT use generic names like "Nearby Cafe", "Breakfast Spot", "Healthy Eats", "Local Restaurant", "Nearby Restaurant 1", "Nearby Restaurant 2", "Restaurant", etc.
✅ ONLY USE ACTUAL NAMES: Use ONLY the exact restaurant names from the AVAILABLE RESTAURANTS list above (e.g., "Ricco Mediterranean", "Itria", "Terzo", etc.)
⚠️ IF NO RESTAURANTS AVAILABLE: If the AVAILABLE RESTAURANTS list is empty, return an empty array [] for extraRestaurantOptions instead of making up names.

Use restaurant meals where available, and fill with diverse home meal options. ENSURE NO TWO MEALS ARE SIMILAR ACROSS THE ENTIRE 4-DAY PLAN.

CRITICAL: Your response must be PURE JSON starting with { and ending with }.
NO markdown, NO code blocks, NO backticks, NO Unicode characters, NO emojis, NO text before or after the JSON. Use only ASCII characters.

{
  "days": [
    {
      "day": 1,
      "day_name": "${todayName}",
      "breakfast": {
        "primary": {"source": "home", "name": "Meal Name", "description": "Brief description", "calories": 380, "protein": 25, "carbs": 35, "fat": 15},
        "alternatives": [
          {"source": "home", "name": "Alternative 1", "description": "Brief description", "calories": 350, "protein": 20, "carbs": 40, "fat": 12},
          {"source": "restaurant", "restaurant": "Name", "dish": "Dish", "price": 12.99, "calories": 420, "protein": 22, "carbs": 38, "fat": 18}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Specific dish name", "description": "Brief description without price"},
          {"restaurant": "ANOTHER_ACTUAL_RESTAURANT_FROM_LIST", "dish": "Another dish name", "description": "Brief description without price"}
        ]
      },
      "lunch": {
        "primary": {"source": "restaurant", "restaurant": "Name", "restaurant_description": "Brief description", "dish": "Dish", "dish_description": "Brief description", "price": 18.49, "calories": 650, "protein": 35, "carbs": 45, "fat": 28, "orderingUrl": "https://doordash.com/restaurant-link", "menuSourceUrl": "https://doordash.com/menu-source", "menuSourceName": "DoorDash"},
        "alternatives": [
          {"source": "home", "name": "Alternative 1", "description": "Brief description", "calories": 580, "protein": 30, "carbs": 50, "fat": 25},
          {"source": "restaurant", "restaurant": "Different Restaurant", "dish": "Alternative Dish", "price": 16.99, "calories": 720, "protein": 40, "carbs": 52, "fat": 32, "orderingUrl": "https://doordash.com/restaurant-link", "menuSourceUrl": "https://doordash.com/menu-source", "menuSourceName": "DoorDash"}
        ],
        "extraRestaurantOptions": [
          {"restaurant": "ACTUAL_RESTAURANT_NAME_FROM_LIST", "dish": "Specific lunch dish", "description": "Brief description without price"},
          {"restaurant": "ANOTHER_ACTUAL_RESTAURANT_FROM_LIST", "dish": "Another lunch option", "description": "Brief description without price"}
        ]
      },
      "dinner": {
        "primary": {"source": "home", "name": "Meal Name", "description": "Brief description", "calories": 720, "protein": 42, "carbs": 55, "fat": 30},
        "alternatives": [
          {"source": "restaurant", "restaurant": "Name", "dish": "Dish", "price": 22.99, "calories": 850, "protein": 45, "carbs": 60, "fat": 38, "orderingUrl": "https://doordash.com/restaurant-link", "menuSourceUrl": "https://doordash.com/menu-source", "menuSourceName": "DoorDash"},
          {"source": "home", "name": "Alternative 2", "description": "Brief description", "calories": 680, "protein": 38, "carbs": 50, "fat": 28}
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
            content: `You are a professional nutritionist organizing comprehensive meal plans with accurate calorie data. Requirements:
            1. VALID JSON ONLY - start with { end with }
            2. MANDATORY CALORIES: Every meal option MUST include calories, protein, carbs, fat
            3. EXTREME VARIETY: Zero duplicate cuisines, proteins, or cooking methods across all 36 meal options
            2. Use ONLY ASCII characters - NO Unicode, emojis, or special characters
            3. Use ONLY verified restaurant and home meal data provided
            4. Every option must explain health benefits for user's goal
            5. Include exact URLs, prices, and nutritional rationale
            6. Create appealing variety with scientific backing
            7. NO markdown, code blocks, or extra text
            8. CRITICAL: Write goalReasoning as DIRECT STATEMENTS without quotes
            9. Use natural language about nutrition - say "plenty of protein", "high protein", "good calories", not exact numbers
            10. VARY language to avoid repetitive phrases - use diverse, natural descriptions
            11. Use phrases like "helps hit your protein goals", "nutrient-dense", "great for muscle building", "supports your energy needs"`
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

// SPECIALIZED NUTRITION FUNCTIONS

// 1. Dedicated Nutrition Calculator Prompt (GPT-4)
async function calculatePreciseNutritionTargets(surveyData: any): Promise<any> {
  const startTime = Date.now();
  console.log(`[NUTRITION-CALC] 🧮 Calculating precise nutrition targets...`);

  try {
    // Calculate base targets using our utility functions
    let macroTargets = null;
    let targetCalories = 2000;

    if (surveyData.age && surveyData.sex && surveyData.height && surveyData.weight) {
      const userProfile: UserProfile = {
        age: surveyData.age,
        sex: surveyData.sex,
        height: surveyData.height,
        weight: surveyData.weight,
        activityLevel: surveyData.activityLevel || 'MODERATELY_ACTIVE',
        goal: surveyData.goal || 'GENERAL_WELLNESS'
      };
      macroTargets = calculateMacroTargets(userProfile);
      targetCalories = macroTargets.calories;
    }

    // Use GPT-4 to refine targets based on user's specific situation
    const prompt = `You are a certified nutritionist with expertise in metabolic science. Refine these calculated nutrition targets based on the user's complete profile.

CALCULATED BASE TARGETS:
- Daily Calories: ${targetCalories}
- Protein: ${macroTargets?.protein || 'N/A'}g
- Carbs: ${macroTargets?.carbs || 'N/A'}g
- Fat: ${macroTargets?.fat || 'N/A'}g

USER PROFILE:
${JSON.stringify({
  age: surveyData.age,
  sex: surveyData.sex,
  goal: surveyData.goal,
  activityLevel: surveyData.activityLevel,
  fitnessTimeline: surveyData.fitnessTimeline,
  monthlyFoodBudget: surveyData.monthlyFoodBudget,
  weeklyMealSchedule: surveyData.weeklyMealSchedule,
  dietPrefs: surveyData.dietPrefs
}, null, 2)}

TASK: Provide refined daily and per-meal calorie targets with 10% buffer zones for realistic adherence.

Return ONLY this JSON:
{
  "dailyCalories": ${targetCalories},
  "dailyProtein": ${macroTargets?.protein || Math.round((macroTargets?.calories || 2000) * 0.25 / 4)},
  "dailyCarbs": ${macroTargets?.carbs || 200},
  "dailyFat": ${macroTargets?.fat || 65},
  "mealTargets": {
    "breakfast": {
      "calories": ${Math.round(targetCalories * 0.25 / 25) * 25},
      "calorieRange": [${Math.round(targetCalories * 0.22 / 25) * 25}, ${Math.round(targetCalories * 0.28 / 25) * 25}],
      "protein": ${Math.round((macroTargets?.protein || Math.round((targetCalories || 2000) * 0.25 / 4)) * 0.25)}
    },
    "lunch": {
      "calories": ${Math.round(targetCalories * 0.35 / 25) * 25},
      "calorieRange": [${Math.round(targetCalories * 0.32 / 25) * 25}, ${Math.round(targetCalories * 0.38 / 25) * 25}],
      "protein": ${Math.round((macroTargets?.protein || Math.round((targetCalories || 2000) * 0.25 / 4)) * 0.35)}
    },
    "dinner": {
      "calories": ${Math.round(targetCalories * 0.40 / 25) * 25},
      "calorieRange": [${Math.round(targetCalories * 0.37 / 25) * 25}, ${Math.round(targetCalories * 0.43 / 25) * 25}],
      "protein": ${Math.round((macroTargets?.protein || Math.round((targetCalories || 2000) * 0.25 / 4)) * 0.40)}
    }
  },
  "weeklyGuidance": "Brief guidance for weekly meal planning approach based on user's ${countRestaurantMeals(surveyData.weeklyMealSchedule)} meals out per week"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'system',
          content: 'You are a certified nutritionist. Return ONLY valid JSON with precise nutrition calculations. No markdown, no explanations.'
        }, {
          role: 'user',
          content: prompt
        }],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`Nutrition calculation failed: ${response.status}`);
    }

    const data = await response.json();
    const nutritionTargets = cleanJsonResponse(data.choices[0].message.content);

    const calcTime = Date.now() - startTime;
    console.log(`[NUTRITION-CALC] ✅ Precise targets calculated in ${calcTime}ms`);
    console.log(`[NUTRITION-CALC] 📊 Daily: ${nutritionTargets.dailyCalories}cal, Meals: ${nutritionTargets.mealTargets.breakfast.calories}/${nutritionTargets.mealTargets.lunch.calories}/${nutritionTargets.mealTargets.dinner.calories}`);

    return nutritionTargets;

  } catch (error) {
    console.error('[NUTRITION-CALC] ❌ Error:', error);
    // Return fallback targets
    return {
      dailyCalories: targetCalories,
      dailyProtein: macroTargets?.protein || Math.round((targetCalories || 2000) * 0.25 / 4),
      dailyCarbs: macroTargets?.carbs || 200,
      dailyFat: macroTargets?.fat || 65,
      mealTargets: {
        breakfast: { calories: Math.round(targetCalories * 0.25 / 25) * 25, calorieRange: [Math.round(targetCalories * 0.22 / 25) * 25, Math.round(targetCalories * 0.28 / 25) * 25], protein: Math.round((macroTargets?.protein || Math.round((targetCalories || 2000) * 0.25 / 4)) * 0.25) },
        lunch: { calories: Math.round(targetCalories * 0.35 / 25) * 25, calorieRange: [Math.round(targetCalories * 0.32 / 25) * 25, Math.round(targetCalories * 0.38 / 25) * 25], protein: Math.round((macroTargets?.protein || Math.round((targetCalories || 2000) * 0.25 / 4)) * 0.35) },
        dinner: { calories: Math.round(targetCalories * 0.40 / 25) * 25, calorieRange: [Math.round(targetCalories * 0.37 / 25) * 25, Math.round(targetCalories * 0.43 / 25) * 25], protein: Math.round((macroTargets?.protein || Math.round((targetCalories || 2000) * 0.25 / 4)) * 0.40) }
      },
      weeklyGuidance: `Follow your planned weekly schedule with ${countRestaurantMeals(surveyData.weeklyMealSchedule)} restaurant meals balanced with home cooking for optimal nutrition`
    };
  }
}

// 2. Restaurant Nutrition Analyzer (GPT-4)
async function analyzeRestaurantNutrition(restaurantMenuData: any[], nutritionTargets: any, surveyData: any): Promise<any[]> {
  const startTime = Date.now();
  console.log(`[RESTAURANT-NUTRITION] 🍽️ Analyzing nutrition for ${restaurantMenuData.length} restaurants...`);

  try {
    const enhancedRestaurants = await Promise.all(
      restaurantMenuData.map(async (restaurantData) => {
        const restaurant = restaurantData.restaurant;
        const menuAnalysis = restaurantData.menuAnalysis;

        if (!menuAnalysis?.recommendedItems?.length) {
          return restaurantData; // Return original if no menu items
        }

        const prompt = `You are a registered dietitian with expertise in restaurant nutrition analysis. Provide accurate calorie and macro estimates for these menu items.

NUTRITION TARGETS:
${JSON.stringify(nutritionTargets.mealTargets, null, 2)}

RESTAURANT: ${restaurant.name} (${restaurant.cuisine})
MENU ITEMS TO ANALYZE:
${JSON.stringify(menuAnalysis.recommendedItems, null, 2)}

USE YOUR NUTRITIONAL DATABASE KNOWLEDGE:
- Consider portion sizes typical for this restaurant type
- Account for cooking methods (grilled vs fried, etc.)
- Include hidden calories from sauces, oils, dressings
- Base estimates on USDA nutritional data for similar dishes

Return ONLY this JSON with enhanced nutrition data:
{
  "enhancedItems": [
    {
      "name": "exact menu item name",
      "originalPrice": "price from menu",
      "estimatedCalories": 450,
      "calorieConfidence": "high/medium/low",
      "protein": 35,
      "carbs": 25,
      "fat": 20,
      "fiber": 5,
      "sodium": 800,
      "bestMealTiming": "breakfast/lunch/dinner",
      "nutritionReasoning": "Brief explanation of calorie estimate based on ingredients and preparation",
      "goalAlignment": "How this fits user's ${surveyData.goal} goal"
    }
  ]
}`;

        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.GPT_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [{
                role: 'system',
                content: 'You are a registered dietitian. Use your nutritional database knowledge to provide accurate calorie estimates. Return ONLY valid JSON.'
              }, {
                role: 'user',
                content: prompt
              }],
              response_format: { type: 'json_object' },
              temperature: 0.2
            })
          });

          if (!response.ok) {
            throw new Error(`Restaurant nutrition analysis failed: ${response.status}`);
          }

          const data = await response.json();
          const enhanced = cleanJsonResponse(data.choices[0].message.content);

          console.log(`[RESTAURANT-NUTRITION] ✅ Enhanced ${restaurant.name}: ${enhanced.enhancedItems?.length || 0} items`);

          return {
            ...restaurantData,
            menuAnalysis: {
              ...menuAnalysis,
              recommendedItems: enhanced.enhancedItems || menuAnalysis.recommendedItems
            }
          };

        } catch (error) {
          console.error(`[RESTAURANT-NUTRITION] ❌ Error analyzing ${restaurant.name}:`, error);
          return restaurantData; // Return original on error
        }
      })
    );

    const totalTime = Date.now() - startTime;
    console.log(`[RESTAURANT-NUTRITION] ✅ Analysis completed in ${totalTime}ms`);

    return enhancedRestaurants;

  } catch (error) {
    console.error('[RESTAURANT-NUTRITION] ❌ Error:', error);
    return restaurantMenuData; // Return original data on error
  }
}

// 3. Home Meal Recipe Generator with Calorie Targets (GPT-4o-mini)
async function generateTargetedHomeMeals(nutritionTargets: any, surveyData: any): Promise<any[]> {
  const startTime = Date.now();
  console.log(`[HOME-MEALS] 🏠 Generating calorie-targeted home meals...`);

  try {
    const prompt = `Generate 12 home-cooked meals with SPECIFIC calorie targets for a 4-day meal plan.

CALORIE TARGETS PER MEAL:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.calories} calories (range: ${nutritionTargets.mealTargets.breakfast.calorieRange[0]}-${nutritionTargets.mealTargets.breakfast.calorieRange[1]})
- Lunch: ${nutritionTargets.mealTargets.lunch.calories} calories (range: ${nutritionTargets.mealTargets.lunch.calorieRange[0]}-${nutritionTargets.mealTargets.lunch.calorieRange[1]})
- Dinner: ${nutritionTargets.mealTargets.dinner.calories} calories (range: ${nutritionTargets.mealTargets.dinner.calorieRange[0]}-${nutritionTargets.mealTargets.dinner.calorieRange[1]})

PROTEIN TARGETS:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.protein}g
- Lunch: ${nutritionTargets.mealTargets.lunch.protein}g
- Dinner: ${nutritionTargets.mealTargets.dinner.protein}g

USER PREFERENCES:
- Goal: ${surveyData.goal}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

REQUIREMENTS:
1. Each meal MUST hit its calorie target (±50 calories)
2. Focus on whole foods and balanced nutrition
3. ENSURE MAXIMUM VARIETY - no repeated ingredients or similar dishes across all 4 days
4. Use diverse cuisines (Italian, Mexican, Asian, Mediterranean, American, etc.)
5. Vary cooking methods (grilled, baked, stir-fried, roasted, steamed, etc.)
6. Include different protein sources for each day (chicken, fish, beef, plant-based, eggs, etc.)
7. Provide realistic home cooking recipes with varied complexity
8. Consider prep time and difficulty - mix easy and moderate recipes

Return ONLY this JSON:
{
  "targetedMeals": [
    {
      "name": "Protein-Packed Breakfast Bowl",
      "mealType": "breakfast",
      "targetCalories": ${nutritionTargets.mealTargets.breakfast.calories},
      "estimatedCalories": 380,
      "protein": ${nutritionTargets.mealTargets.breakfast.protein},
      "description": "Description emphasizing how it hits calorie/protein targets",
      "prepTime": "15 min",
      "difficulty": "Easy",
      "ingredients": ["key ingredients with portions"],
      "goalAlignment": "Why this supports ${surveyData.goal} goal"
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
        messages: [{
          role: 'system',
          content: 'You are a nutritionist creating calorie-targeted recipes. Every meal must hit its specific calorie target. Return ONLY valid JSON.'
        }, {
          role: 'user',
          content: prompt
        }],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    });

    if (!response.ok) {
      throw new Error(`Home meal generation failed: ${response.status}`);
    }

    const data = await response.json();
    const homeMeals = cleanJsonResponse(data.choices[0].message.content);

    const genTime = Date.now() - startTime;
    console.log(`[HOME-MEALS] ✅ Generated ${homeMeals.targetedMeals?.length || 0} targeted meals in ${genTime}ms`);

    return homeMeals.targetedMeals || [];

  } catch (error) {
    console.error('[HOME-MEALS] ❌ Error:', error);
    return []; // Return empty array on error
  }
}

// 4. Weekly Balance Validator (GPT-4)
async function validateWeeklyBalance(selectedMeals: any, nutritionTargets: any, surveyData: any): Promise<any> {
  const startTime = Date.now();
  console.log(`[BALANCE-VALIDATOR] ⚖️ Validating weekly nutritional balance...`);

  try {
    const prompt = `Validate and optimize this 4-day meal selection for nutritional balance.

NUTRITION TARGETS:
${JSON.stringify(nutritionTargets, null, 2)}

SELECTED MEALS:
${JSON.stringify(selectedMeals, null, 2)}

USER GOAL: ${surveyData.goal}
WEEKLY MEAL SCHEDULE: ${JSON.stringify(surveyData.weeklyMealSchedule, null, 2)}
RESTAURANT MEALS COUNT: ${countRestaurantMeals(surveyData.weeklyMealSchedule)}

VALIDATION TASKS:
1. Check if daily calorie targets are being met (±10%)
2. Ensure protein targets are achieved
3. Validate meal timing appropriateness
4. Assess weekly balance for ${surveyData.goal} goal
5. Suggest adjustments if needed

Return ONLY this JSON:
{
  "validationResults": {
    "dailyCalorieAccuracy": "within 10% of targets",
    "proteinAdequacy": "meeting/exceeding targets",
    "weeklyBalance": "excellent/good/needs adjustment",
    "missingSuggestions": ["specific adjustments needed"]
  },
  "optimizedSelection": {
    "adjustments": "brief description of any changes made",
    "finalCalorieDistribution": {
      "day1Total": 2000,
      "day2Total": 1950,
      "day3Total": 2050,
      "day4Total": 2000
    }
  },
  "weeklyGuidance": "Final guidance for user on sticking to this plan"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'system',
          content: 'You are a nutritionist validating meal plans for optimal nutrition balance. Return ONLY valid JSON with validation results.'
        }, {
          role: 'user',
          content: prompt
        }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`Balance validation failed: ${response.status}`);
    }

    const data = await response.json();
    const validation = cleanJsonResponse(data.choices[0].message.content);

    const valTime = Date.now() - startTime;
    console.log(`[BALANCE-VALIDATOR] ✅ Validation completed in ${valTime}ms`);
    console.log(`[BALANCE-VALIDATOR] 📊 Weekly balance: ${validation.validationResults?.weeklyBalance || 'unknown'}`);

    return validation;

  } catch (error) {
    console.error('[BALANCE-VALIDATOR] ❌ Error:', error);
    return {
      validationResults: {
        dailyCalorieAccuracy: "unable to validate",
        proteinAdequacy: "unable to validate",
        weeklyBalance: "unable to validate",
        missingSuggestions: []
      },
      optimizedSelection: {
        adjustments: "validation failed - using original selection",
        finalCalorieDistribution: {}
      },
      weeklyGuidance: "Focus on balanced nutrition and enjoy your meals"
    };
  }
}

// MAIN: Enhanced 5-Step Split Prompt Generation
async function generateFast4DayMealPlan(restaurantMenuData: any[], surveyData: any): Promise<any> {
  const totalStartTime = Date.now();
  console.log(`[SPLIT-GENERATION] 🚀 Starting enhanced 5-step split prompt generation...`);

  try {
    // STEP 1: Calculate Precise Nutrition Targets (GPT-4)
    const step1Start = Date.now();
    const nutritionTargets = await calculatePreciseNutritionTargets(surveyData);
    const step1Time = Date.now() - step1Start;

    // STEP 2: Analyze Restaurant Nutrition (GPT-4)
    const step2Start = Date.now();
    const enhancedRestaurants = await analyzeRestaurantNutrition(restaurantMenuData, nutritionTargets, surveyData);
    const step2Time = Date.now() - step2Start;

    // STEP 3: Generate Targeted Home Meals (GPT-4o-mini)
    const step3Start = Date.now();
    const targetedHomeMeals = await generateTargetedHomeMeals(nutritionTargets, surveyData);
    const step3Time = Date.now() - step3Start;

    // STEP 4: Use existing meal selection and merging logic with enhanced data
    const step4Start = Date.now();
    const restaurantMeals = await selectRestaurantMeals(enhancedRestaurants, surveyData);
    const mealPlan = await mergeMealPlan(restaurantMeals, targetedHomeMeals, surveyData);
    const step4Time = Date.now() - step4Start;

    // STEP 5: Validate Weekly Balance (GPT-4)
    const step5Start = Date.now();
    const validation = await validateWeeklyBalance(mealPlan, nutritionTargets, surveyData);
    const step5Time = Date.now() - step5Start;

    const totalTime = Date.now() - totalStartTime;
    console.log(`[SPLIT-GENERATION] ✅ Enhanced generation completed in ${totalTime}ms`);
    console.log(`[SPLIT-GENERATION] 📊 Timings: Nutrition:${step1Time}ms, Restaurants:${step2Time}ms, Home:${step3Time}ms, Assembly:${step4Time}ms, Validation:${step5Time}ms`);

    // Combine everything into final enhanced meal plan
    return {
      ...mealPlan,
      nutritionTargets,
      validation,
      metadata: {
        generationMethod: 'enhanced_split_prompts',
        timings: {
          nutritionCalculation: step1Time,
          restaurantAnalysis: step2Time,
          homeMealGeneration: step3Time,
          mealPlanAssembly: step4Time,
          balanceValidation: step5Time,
          total: totalTime
        }
      }
    };

  } catch (error) {
    const totalTime = Date.now() - totalStartTime;
    console.error(`[SPLIT-GENERATION] ❌ Failed after ${totalTime}ms:`, error);
    return { days: [], extra_options: {}, error: (error as Error).message };
  }
}


// Strategic distribution guidance based on eating out preference
function getStrategicDistribution(restaurantMealsCount: number) {
  if (restaurantMealsCount <= 7) {
    return {
      priority: ['dinner', 'lunch', 'breakfast'],
      pattern: 'spread_across_days',
      maxPerDay: 1,
      focus: 'dinners_first',
      guidance: 'Prioritize dinners (social), some lunches (convenience), avoid restaurant breakfasts'
    };
  } else if (restaurantMealsCount <= 14) {
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

// Generate personalized nutrition profile based on survey data
async function generateNutritionProfile(surveyData: any): Promise<string> {
  const startTime = Date.now();
  console.log(`[NUTRITION-PROFILE] 🧠 Generating personalized nutrition profile...`);

  try {
    const profilePrompt = `You are a world-class nutritionist and meal planning expert. Create a comprehensive nutrition profile for this user.

SURVEY DATA:
${JSON.stringify({
  name: `${surveyData.firstName} ${surveyData.lastName}`,
  age: surveyData.age,
  sex: surveyData.sex,
  goal: surveyData.goal,
  activityLevel: surveyData.activityLevel,
  monthlyFoodBudget: surveyData.monthlyFoodBudget,
  weeklyMealSchedule: surveyData.weeklyMealSchedule,
  dietPrefs: surveyData.dietPrefs,
  preferredCuisines: surveyData.preferredCuisines,
  preferredFoods: surveyData.preferredFoods,
  sportsInterests: surveyData.sportsInterests,
  fitnessTimeline: surveyData.fitnessTimeline
}, null, 2)}

TASK: Create a comprehensive nutrition profile that captures this user's personality, goals, and needs. Write as if you're their personal nutritionist who knows them well.

FORMAT: Write in 2nd person ("you") as if speaking directly to the user. Be specific, actionable, and motivating.

INCLUDE:
1. NUTRITION PHILOSOPHY: Based on their goal (${surveyData.goal}) and activity level
2. BUDGET STRATEGY: How to maximize $${surveyData.monthlyFoodBudget}/month effectively
3. WEEKLY SCHEDULE: Strategic approach to your planned ${countRestaurantMeals(surveyData.weeklyMealSchedule)} restaurant meals based on your weekly schedule
4. CUISINE & FOOD PREFERENCES: How to leverage their favorite foods
5. DIETARY CONSIDERATIONS: Any restrictions and how to work with them
6. DAILY NUTRITION PRIORITIES: What to focus on each day
7. SUCCESS MINDSET: Motivational approach tailored to their timeline and interests

Keep it concise but comprehensive (300-500 words). Write like a knowledgeable trainer who understands their specific situation.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: profilePrompt }],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Profile generation failed: ${response.status}`);
    }

    const data = await response.json();
    const profile = data.choices?.[0]?.message?.content || '';

    console.log(`[NUTRITION-PROFILE] ✅ Generated in ${Date.now() - startTime}ms`);
    console.log(`[NUTRITION-PROFILE] 📋 Profile:\n${profile}`);

    return profile;

  } catch (error) {
    console.error(`[NUTRITION-PROFILE] ❌ Generation failed:`, error);
    return ''; // Return empty string if failed
  }
}

// Generate personalized fitness profile based on survey data
async function generateFitnessProfile(surveyData: any): Promise<string> {
  const startTime = Date.now();
  console.log(`[FITNESS-PROFILE] 🏋️ Generating personalized fitness profile...`);

  try {
    const profilePrompt = `You are an elite personal trainer and fitness coach. Create a comprehensive fitness profile for this user.

SURVEY DATA:
${JSON.stringify({
  name: `${surveyData.firstName} ${surveyData.lastName}`,
  age: surveyData.age,
  sex: surveyData.sex,
  goal: surveyData.goal,
  activityLevel: surveyData.activityLevel,
  sportsInterests: surveyData.sportsInterests,
  fitnessTimeline: surveyData.fitnessTimeline,
  workoutPreferences: surveyData.workoutPreferencesJson,
  monthlyFitnessBudget: surveyData.monthlyFitnessBudget
}, null, 2)}

TASK: Create a comprehensive fitness profile that captures this user's personality, goals, and training needs. Write as if you're their personal trainer who knows them well.

FORMAT: Write in 2nd person ("you") as if speaking directly to the user. Be specific, actionable, and motivating.

INCLUDE:
1. TRAINING PHILOSOPHY: Based on their goal (${surveyData.goal}) and current activity level
2. WORKOUT STRATEGY: How to structure training for their lifestyle and preferences
3. PROGRESSION APPROACH: Realistic timeline based on their fitness timeline expectations
4. MOTIVATION STYLE: What drives them based on sports interests and personality
5. EQUIPMENT & BUDGET: How to optimize their $${surveyData.monthlyFitnessBudget}/month budget
6. LIFESTYLE INTEGRATION: How workouts fit into their current activity patterns
7. SUCCESS METRICS: What progress looks like for their specific goals

Keep it concise but comprehensive (300-500 words). Write like a knowledgeable trainer who understands their specific situation.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: profilePrompt }],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Fitness profile generation failed: ${response.status}`);
    }

    const data = await response.json();
    const profile = data.choices?.[0]?.message?.content || '';

    console.log(`[FITNESS-PROFILE] ✅ Generated in ${Date.now() - startTime}ms`);
    console.log(`[FITNESS-PROFILE] 🏋️ Profile:\n${profile}`);

    return profile;

  } catch (error) {
    console.error(`[FITNESS-PROFILE] ❌ Generation failed:`, error);
    return ''; // Return empty string if failed
  }
}

// Legacy function stubs for compatibility (these are now replaced by the enhanced split prompts above)
async function selectStrategicRestaurantMeals(restaurantMenuData: any[], surveyData: any, distributionStrategy: any, nutritionProfile: string = ''): Promise<any[]> {
  console.log('[LEGACY] Using legacy restaurant selection - consider updating to enhanced version');
  return selectRestaurantMeals(restaurantMenuData, surveyData);
}

async function generateStrategicHomeMeals(surveyData: any, distributionStrategy: any, nutritionProfile: string = ''): Promise<any[]> {
  console.log('[LEGACY] Using legacy home meal generation - consider updating to enhanced version');
  return generateHomeMealNames(surveyData);
}

async function mergeStrategicMealPlan(restaurantMeals: any[], homeMeals: any[], surveyData: any, distributionStrategy: any, nutritionProfile: string = ''): Promise<any> {
  console.log('[LEGACY] Using legacy meal plan merge - consider updating to enhanced version');
  return mergeMealPlan(restaurantMeals, homeMeals, surveyData);
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
