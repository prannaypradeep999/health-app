// src/lib/external/perplexity-client.ts

export interface PerplexityMenuResponse {
  menuItems: Array<{
    name: string;
    price: number;
    description?: string;
    category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    estimatedCalories?: number;
    healthRating?: 'excellent' | 'good' | 'fair' | 'poor';
    orderingUrl?: string;
    source?: string;
  }>;
  orderingLinks: {
    doordash?: string;
    ubereats?: string;
    grubhub?: string;
    direct?: string;
    website?: string;
  };
  sources: string[];
  restaurant: string;
  extractionSuccess: boolean;
  linksFound: number;
  error?: string;
}

// Grocery store interfaces
export interface GroceryStore {
  name: string;
  address: string;
  distance?: string;
  type: 'budget' | 'mid-range' | 'premium';
}

export interface GroceryStoreSearchResponse {
  stores: GroceryStore[];
  location: string;
  searchSuccess: boolean;
  error?: string;
}

export interface StoreOption {
  store: string;
  displayName: string;  // Item name with brand if relevant (e.g., "TJ's Free Range Chicken Breast")
  price: number;
  isRecommended: boolean;
  reason?: string;  // "Best value", "Lowest price", "Best quality"
  storeAddress: string;  // Street address only (e.g., "123 Main St")
  priceConfidence: 'exact' | 'estimate';  // Whether this is an exact price or estimate
}

export interface GroceryItemWithPrices {
  item: string;
  quantity: string;
  uses: string;
  category: string;
  storeOptions: StoreOption[];
}

export interface GroceryPriceResponse {
  items: GroceryItemWithPrices[];
  stores: GroceryStore[];
  storeTotals: { store: string; total: number }[];
  recommendedStore: string;
  savings: string;  // "Save $16.50 vs Store X"
  priceSearchSuccess: boolean;
  error?: string;
}

export class PerplexityClient {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai/chat/completions';

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    if (!this.apiKey) {
      console.error('[PERPLEXITY] ❌ PERPLEXITY_API_KEY not found in environment variables');
      throw new Error('PERPLEXITY_API_KEY not found in environment variables');
    }
    console.log(`[PERPLEXITY] 🔑 API Key loaded: ${this.apiKey.substring(0, 10)}...`);
  }

  async getRestaurantMenu(restaurant: any, surveyData: any): Promise<PerplexityMenuResponse> {
    const startTime = Date.now();
    
    // Validate restaurant object
    const restaurantName = restaurant?.name || 'Unknown Restaurant';
    const restaurantAddress = restaurant?.address || surveyData?.streetAddress || 'Address not available';
    const restaurantCity = restaurant?.city || surveyData?.city || 'Unknown City';
    
    // Skip if we don't have valid restaurant info
    if (restaurantName === 'Unknown Restaurant' || restaurantName === 'undefined') {
      console.warn(`[PERPLEXITY] ⚠️ Skipping menu extraction - invalid restaurant name`);
      return {
        menuItems: [],
        orderingLinks: {},
        sources: [],
        restaurant: restaurantName,
        extractionSuccess: false,
        linksFound: 0,
        error: 'Invalid restaurant name'
      };
    }
    
    console.log(`[PERPLEXITY] 🔍 Getting menu for ${restaurantName}...`);

    try {
      const query = this.buildMenuQuery(restaurant, surveyData);
      console.log(`[PERPLEXITY] 📝 Query: ${query.substring(0, 200)}...`);

      const requestBody = {
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides accurate restaurant menu information with current prices. You MUST search for and provide actual ordering links from DoorDash, Uber Eats, and GrubHub when they exist. Only include links you actually find - never make up or guess URLs.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.2,
        top_p: 0.9
      };

      console.log(`[PERPLEXITY] 🚀 Making API request to ${this.baseUrl}`);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PERPLEXITY] ❌ API Error Details:`, {
          status: response.status,
          statusText: response.statusText,
          response: errorText
        });
        throw new Error(`Perplexity API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];

      console.log(`[PERPLEXITY] ✅ Raw response received in ${Date.now() - startTime}ms`);
      console.log(`[PERPLEXITY] 📄 Content length: ${content.length} characters`);
      console.log(`[PERPLEXITY] 🔗 Citations found: ${citations.length}`);

      // Process the Perplexity response with GPT-4 for structured extraction
      const structuredData = await this.processWithGPT4(content, citations, restaurant, surveyData);

      // Count actual links found (non-empty strings only)
      const orderingLinks = structuredData.orderingLinks || {};
      const linksFound = Object.values(orderingLinks).filter(
        (link): link is string => typeof link === 'string' && link.trim() !== ''
      ).length;

      console.log(`[PERPLEXITY] 🎯 Extracted ${structuredData.menuItems?.length || 0} menu items`);
      console.log(`[PERPLEXITY] 🔗 Ordering links found: ${linksFound}`);
      
      // Log each link for debugging
      Object.entries(orderingLinks).forEach(([platform, url]) => {
        if (url && typeof url === 'string' && url.trim() !== '') {
          console.log(`[PERPLEXITY]   ✅ ${platform}: ${url.substring(0, 50)}...`);
        }
      });

      return {
        menuItems: structuredData.menuItems || [],
        orderingLinks: orderingLinks,
        restaurant: restaurantName,
        sources: citations.map((c: any) => c.url || c).slice(0, 5),
        extractionSuccess: (structuredData.menuItems?.length || 0) > 0,
        linksFound: linksFound
      };

    } catch (error) {
      const time = Date.now() - startTime;
      console.error(`[PERPLEXITY] ❌ Error after ${time}ms:`, error);

      return {
        menuItems: [],
        orderingLinks: {},
        sources: [],
        restaurant: restaurantName,
        extractionSuccess: false,
        linksFound: 0,
        error: (error as Error).message
      };
    }
  }

  /**
   * Find top 3 grocery stores near user's location
   */
  async getLocalGroceryStores(
    streetAddress: string,
    city: string,
    state: string,
    zipcode: string
  ): Promise<GroceryStoreSearchResponse> {
    console.log(`[PERPLEXITY-GROCERY] 🏪 Finding grocery stores near ${streetAddress}, ${city}...`);

    try {
      const fullAddress = `${streetAddress}, ${city}, ${state} ${zipcode}`;
      const query = `Find the 3 closest grocery stores to this exact address: ${fullAddress}

CRITICAL REQUIREMENTS:
1. PRIORITIZE BY DISTANCE - list stores from CLOSEST to FARTHEST
2. Include actual distance from the address (e.g., "0.3 mi", "1.2 mi")
3. Prefer stores within 3 miles when possible
4. Include a mix of store types if available nearby: budget-friendly, mid-range, premium

For each store provide:
- Store name (actual chain name, e.g., "Trader Joe's", "Safeway", "Whole Foods")
- Full street address
- Distance from ${streetAddress} (be as accurate as possible)
- Type: "budget", "mid-range", or "premium"

Return as JSON only, no other text:
{
  "stores": [
    {"name": "Store Name", "address": "123 Main St", "distance": "0.3 mi", "type": "mid-range"},
    {"name": "Store Name 2", "address": "456 Oak Ave", "distance": "0.8 mi", "type": "budget"},
    {"name": "Store Name 3", "address": "789 Elm Blvd", "distance": "1.5 mi", "type": "premium"}
  ]
}`;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that finds local grocery stores. Return accurate, real store information in JSON format only. No markdown, no explanation, just the JSON object. Always provide 3 stores - use common regional chains if exact location data is unavailable.'
            },
            { role: 'user', content: query }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[PERPLEXITY-GROCERY] ✅ Found ${parsed.stores?.length || 0} stores`);

      return {
        stores: parsed.stores || [],
        location: `${streetAddress}, ${city}, ${state} ${zipcode}`,
        searchSuccess: parsed.stores?.length > 0
      };

    } catch (error) {
      console.error('[PERPLEXITY-GROCERY] ❌ Store search error:', error);
      return {
        stores: [],
        location: `${streetAddress}, ${city}, ${state} ${zipcode}`,
        searchSuccess: false,
        error: error instanceof Error ? error.message : 'Failed to find stores'
      };
    }
  }

  /**
   * Get real prices for grocery items at specified stores
   */
  async getGroceryPrices(
    items: Array<{ name: string; quantity: string; uses: string; category: string }>,
    stores: GroceryStore[],
    city: string,
    userGoal: string
  ): Promise<GroceryPriceResponse> {
    console.log(`[PERPLEXITY-GROCERY] 💰 Getting prices for ${items.length} items at ${stores.length} stores...`);

    const storeNames = stores.map(s => s.name).join(', ');

    try {
      // Build item list for query
      const itemList = items.map(i => `- ${i.name} (${i.quantity})`).join('\n');

      const query = `Find current grocery prices for these items at ${storeNames} in ${city}:

${itemList}

For each item at each store:
1. displayName: Include brand name ONLY if it matters for health/quality (e.g., "Organic Chicken Breast", "Cage-Free Eggs"). Generic items like milk, bananas, rice should NOT have brand names - just use the item name.
2. price: Current approximate price for the quantity specified based on typical ${city} grocery prices.
3. storeAddress: The store's street address only (e.g., "123 Main St") - NO city, state, or zip
4. priceConfidence: Set to "exact" if you found actual store data/website prices, "estimate" if using typical market pricing
5. isRecommended: Mark ONE option per item as recommended (best value for a "${userGoal}" health goal)
6. reason: Brief reason if recommended (e.g., "Best value", "Best quality")

User's health goal: ${userGoal}
Prioritize: Quality ingredients that support their goals, balanced with good value

Calculate storeTotals by summing all item prices for each store.
Identify recommendedStore (best overall value with good quality).
Calculate savings vs the most expensive store option.

Return as JSON only:
{
  "items": [
    {
      "item": "Chicken Breast",
      "quantity": "2 lbs",
      "uses": "Grilled chicken salad",
      "category": "proteins",
      "storeOptions": [
        {
          "store": "Store1",
          "displayName": "Organic Chicken Breast",
          "price": 7.49,
          "storeAddress": "123 Main St",
          "priceConfidence": "exact",
          "isRecommended": true,
          "reason": "Best value"
        },
        {
          "store": "Store2",
          "displayName": "Chicken Breast",
          "price": 8.99,
          "storeAddress": "456 Oak Ave",
          "priceConfidence": "estimate",
          "isRecommended": false
        }
      ]
    }
  ],
  "storeTotals": [
    {"store": "Store1", "total": 52.40},
    {"store": "Store2", "total": 61.20}
  ],
  "recommendedStore": "Store1",
  "savings": "Save $8.80 vs Store2"
}`;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a grocery price expert. Provide accurate, current grocery prices based on typical prices in the specified city. Include brand descriptors only when they matter for health/quality. Always return valid JSON only, no markdown or explanation.'
            },
            { role: 'user', content: query }
          ],
          temperature: 0.2
        })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      console.log(`[PERPLEXITY-GROCERY] ✅ Got prices for ${parsed.items?.length || 0} items`);
      console.log(`[PERPLEXITY-GROCERY] 💡 Recommended store: ${parsed.recommendedStore}`);

      return {
        items: parsed.items || [],
        stores: stores,
        storeTotals: parsed.storeTotals || [],
        recommendedStore: parsed.recommendedStore || '',
        savings: parsed.savings || '',
        priceSearchSuccess: parsed.items?.length > 0
      };

    } catch (error) {
      console.error('[PERPLEXITY-GROCERY] ❌ Price search error:', error);

      // Return empty - UI will show grocery list without price comparison
      return {
        items: [],
        stores: stores,
        storeTotals: [],
        recommendedStore: '',
        savings: '',
        priceSearchSuccess: false,
        error: error instanceof Error ? error.message : 'Failed to get prices'
      };
    }
  }

  private buildMenuQuery(restaurant: any, surveyData: any): string {
    const dietaryRestrictions = (surveyData.dietPrefs || []).join(', ');
    const preferredCuisines = (surveyData.preferredCuisines || []).join(', ');

    // Add null checks and fallbacks for all restaurant properties
    const restaurantName = restaurant?.name || 'Unknown Restaurant';
    const restaurantAddress = restaurant?.address || surveyData?.streetAddress || 'Address not available';
    const restaurantCity = restaurant?.city || surveyData?.city || 'Unknown City';
    const restaurantCuisine = restaurant?.cuisine || 'Mixed';

    return `Find the current menu with prices AND online ordering links for "${restaurantName}" restaurant located at ${restaurantAddress}, ${restaurantCity}.

RESTAURANT DETAILS:
- Name: ${restaurantName}
- Address: ${restaurantAddress}
- City: ${restaurantCity}
- Cuisine Type: ${restaurantCuisine}

CRITICAL - ORDERING LINKS SEARCH:
You MUST specifically search for this restaurant on these delivery platforms:
1. DoorDash - Search doordash.com for "${restaurantName}" in ${restaurantCity}
2. Uber Eats - Search ubereats.com for "${restaurantName}" in ${restaurantCity}
3. GrubHub - Search grubhub.com for "${restaurantName}" in ${restaurantCity}
4. Restaurant's own website for direct ordering

For each platform, provide the ACTUAL URL if the restaurant is listed there.
If you cannot find the restaurant on a platform, DO NOT include that platform.
NEVER make up or guess URLs - only include links you actually find.

MENU SEARCH REQUIREMENTS:
1. Find 8-12 specific menu items with current prices
2. Include dish names, prices, and brief descriptions
3. Focus on healthier options when possible
4. Look for recent/current menu information (2024-2025)

USER PREFERENCES (prioritize when selecting items):
- Dietary Restrictions: ${dietaryRestrictions || 'None'}
- Preferred Cuisines: ${preferredCuisines || 'Any'}
- Goal: ${surveyData.goal || 'General wellness'}

INFORMATION TO INCLUDE:
- Exact dish names and prices
- Brief descriptions of items
- Any nutritional info if available
- VERIFIED ordering/delivery links (DoorDash, Uber Eats, GrubHub, direct website)
- Menu categories (breakfast, lunch, dinner)

Please provide comprehensive menu information with VERIFIED ordering links only.`;
  }

  private async processWithGPT4(content: string, citations: any[], restaurant: any, surveyData: any): Promise<Partial<PerplexityMenuResponse>> {
    try {
      console.log(`[PERPLEXITY-GPT4] 🤖 Processing menu data with GPT-4...`);

      const restaurantName = restaurant?.name || 'Unknown Restaurant';
      const restaurantCity = restaurant?.city || surveyData?.city || 'Unknown City';

      const gptPrompt = `Convert this restaurant menu information into structured JSON format. 

CRITICAL RULES FOR ORDERING LINKS:
1. ONLY include ordering links that are ACTUALLY mentioned in the source data
2. Links must be real URLs to the restaurant's page on that platform
3. If a platform link is not found in the data, leave it as an empty string ""
4. NEVER make up, guess, or construct URLs
5. Verify the link appears to be for the correct restaurant "${restaurantName}" in ${restaurantCity}

PERPLEXITY MENU DATA:
${content}

CITATIONS/SOURCES:
${citations.map((c, i) => `${i + 1}. ${typeof c === 'string' ? c : c.url || JSON.stringify(c)}`).join('\n')}

RESTAURANT: ${restaurantName}
CITY: ${restaurantCity}

USER PREFERENCES:
- Goal: ${surveyData.goal || 'General wellness'}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Any'}

EXTRACTION RULES FOR MENU ITEMS:
1. Extract ONLY menu items that have clear prices mentioned
2. Focus on healthier options when multiple choices available
3. Categorize by meal type (breakfast, lunch, dinner, snack)
4. Estimate calories based on typical dish composition
5. Rate healthiness (excellent/good/fair/poor) based on ingredients

REQUIRED JSON FORMAT:
{
  "menuItems": [
    {
      "name": "Exact dish name from menu",
      "price": 12.99,
      "description": "Brief description from menu",
      "category": "lunch",
      "estimatedCalories": 520,
      "healthRating": "good"
    }
  ],
  "orderingLinks": {
    "doordash": "ACTUAL_URL_IF_FOUND_OR_EMPTY_STRING",
    "ubereats": "ACTUAL_URL_IF_FOUND_OR_EMPTY_STRING",
    "grubhub": "ACTUAL_URL_IF_FOUND_OR_EMPTY_STRING",
    "direct": "RESTAURANT_WEBSITE_IF_FOUND_OR_EMPTY_STRING"
  }
}

IMPORTANT: For orderingLinks, use "" (empty string) if not found. Do not use null, undefined, or made-up URLs.
Extract 6-12 menu items maximum. Return ONLY valid JSON.`;

      const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: gptPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });

      if (!gptResponse.ok) {
        throw new Error(`GPT-4 processing failed: ${gptResponse.status}`);
      }

      const gptData = await gptResponse.json();
      const gptContent = gptData.choices?.[0]?.message?.content || '{}';

      // Parse JSON response
      let structuredData;
      try {
        structuredData = JSON.parse(gptContent);
      } catch (parseError) {
        // Try cleaning if direct parse fails
        let cleanContent = gptContent.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        }
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        structuredData = JSON.parse(cleanContent);
      }

      // Clean up ordering links - remove empty strings, nulls, undefined
      const cleanedLinks: Record<string, string> = {};
      if (structuredData.orderingLinks) {
        for (const [platform, url] of Object.entries(structuredData.orderingLinks)) {
          if (typeof url === 'string' && url.trim() !== '' && url !== 'null' && url !== 'undefined') {
            // Basic URL validation
            if (url.startsWith('http://') || url.startsWith('https://')) {
              cleanedLinks[platform] = url.trim();
            }
          }
        }
      }

      console.log(`[PERPLEXITY-GPT4] ✅ Structured ${structuredData.menuItems?.length || 0} menu items`);
      console.log(`[PERPLEXITY-GPT4] 🔗 Verified links: ${Object.keys(cleanedLinks).join(', ') || 'none'}`);

      return {
        menuItems: structuredData.menuItems || [],
        orderingLinks: cleanedLinks
      };

    } catch (error) {
      console.error(`[PERPLEXITY-GPT4] ❌ Structuring failed:`, error);
      return {
        menuItems: [],
        orderingLinks: {}
      };
    }
  }
}

export const perplexityClient = new PerplexityClient();