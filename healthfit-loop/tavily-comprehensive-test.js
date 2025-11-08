#!/usr/bin/env node

/**
 * Comprehensive Tavily Restaurant Menu Test Script
 *
 * This script implements the full flow:
 * 1. Tavily search for restaurant + zipcode + menu PDF
 * 2. Tavily search for restaurant + zip + DoorDash/UberEats
 * 3. Use Google Places API for additional restaurant website links
 * 4. Use Tavily extract to get full raw menu content
 * 5. Log raw content to text files for analysis
 * 6. Use GPT to extract real prices and dish names
 */

const { TavilyClient } = require('tavily');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Tavily client
const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

// Test restaurants with full data including zip codes
const TEST_RESTAURANTS = [
  {
    name: "Bottega",
    city: "San Francisco",
    address: "1132 Valencia St",
    zipCode: "94110",
    cuisine: "italian"
  },
  {
    name: "The Bite",
    city: "San Francisco",
    address: "996 Mission St",
    zipCode: "94103",
    cuisine: "mediterranean"
  },
  {
    name: "Kitava",
    city: "San Francisco",
    address: "1700 Fillmore St",
    zipCode: "94115",
    cuisine: "healthy"
  }
];

// Create logs directory if it doesn't exist
const LOGS_DIR = './logs';
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

/**
 * STEP 1: Tavily search strategies
 */
const TAVILY_STRATEGIES = {
  // Strategy 1: DoorDash with EXACT address for location precision
  doordash_precise: (restaurant) => ({
    query: `"${restaurant.name}" "${restaurant.address}" "${restaurant.city}" site:doordash.com/store -graveyard -dnu -not-available`,
    description: "Find exact DoorDash store page with address"
  }),

  // Strategy 2: UberEats with EXACT address
  ubereats_precise: (restaurant) => ({
    query: `"${restaurant.name}" "${restaurant.address}" "${restaurant.city}" site:ubereats.com/store -not-available`,
    description: "Find exact UberEats store page with address"
  }),

  // Strategy 3: GrubHub with EXACT address
  grubhub_precise: (restaurant) => ({
    query: `"${restaurant.name}" "${restaurant.address}" "${restaurant.city}" site:grubhub.com/restaurant -not-available`,
    description: "Find exact GrubHub restaurant page with address"
  }),

  // Strategy 4: Menu content with address (most reliable)
  menu_with_address: (restaurant) => ({
    query: `"${restaurant.name}" "${restaurant.address}" menu prices dishes`,
    description: "Find menu content using exact address"
  }),

  // Strategy 5: Restaurant website menu
  restaurant_website: (restaurant) => ({
    query: `"${restaurant.name}" "${restaurant.city}" inurl:menu OR "our menu" -doordash -ubereats -grubhub`,
    description: "Find restaurant's own website menu"
  }),

  // Strategy 6: Backup zipcode search (fallback)
  zipcode_fallback: (restaurant) => ({
    query: `"${restaurant.name}" "${restaurant.zipCode}" "San Francisco" menu OR ordering OR delivery`,
    description: "Fallback search with zipcode"
  })
};

/**
 * Execute a single Tavily search strategy
 */
async function executeTavilySearch(restaurant, strategyName, strategy) {
  try {
    console.log(`\n🔍 ${strategy.description} for ${restaurant.name}:`);
    console.log(`   Query: ${strategy.query}`);

    const response = await tavilyClient.search({
      query: strategy.query,
      maxResults: 5,
      includeContent: true,
      search_depth: "advanced"
    });

    if (!response.results || response.results.length === 0) {
      console.log(`   ❌ No results found`);
      return {
        restaurant: restaurant.name,
        strategy: strategyName,
        success: false,
        results: [],
        urls: []
      };
    }

    console.log(`   ✅ Found ${response.results.length} results`);

    const urls = [];
    let hasMenuContent = false;

    response.results.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.title}`);
      console.log(`      URL: ${result.url}`);

      urls.push(result.url);

      // Check for menu indicators
      const content = result.content?.toLowerCase() || '';
      if (content.includes('menu') || content.includes('pizza') || content.includes('pasta') ||
          content.includes('salad') || content.includes('$') || content.includes('entree')) {
        hasMenuContent = true;
        console.log(`      📋 Contains menu content`);
      }
    });

    return {
      restaurant: restaurant.name,
      strategy: strategyName,
      success: true,
      hasMenuContent,
      results: response.results,
      urls: urls
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      restaurant: restaurant.name,
      strategy: strategyName,
      success: false,
      error: error.message,
      results: [],
      urls: []
    };
  }
}

/**
 * STEP 2: Analyze content from search results (no extract needed)
 */
function analyzeSearchContent(allSearchResults, restaurant) {
  console.log(`\n📄 Analyzing search content for ${restaurant.name}...`);

  const analyzedContent = [];

  allSearchResults.forEach(searchResult => {
    if (searchResult.success && searchResult.results) {
      searchResult.results.forEach(result => {
        if (result.content) {
          console.log(`   📋 Analyzing: ${result.url}`);

          const content = result.content.toLowerCase();
          const menuItems = [];
          const prices = [];

          // Look for Italian dishes (since most test restaurants are Italian)
          const foodMatches = content.match(/\b(pizza|pasta|salad|chicken|beef|soup|risotto|gnocchi|ravioli|lasagna|caesar|margherita|carbonara|bolognese|penne|linguine|fettuccine|antipasto|bruschetta|tiramisu|gelato|arancini)\b/g);
          if (foodMatches) {
            menuItems.push(...new Set(foodMatches));
          }

          // Look for specific dish names (capitalized)
          const dishMatches = content.match(/[A-Z][a-z]+\s+(Pizza|Pasta|Salad|Bowl|Sandwich|Wrap)/g);
          if (dishMatches) {
            menuItems.push(...new Set(dishMatches));
          }

          // Look for prices
          const priceMatches = content.match(/\$\d+\.?\d*/g);
          if (priceMatches) {
            prices.push(...new Set(priceMatches));
          }

          if (menuItems.length > 0 || prices.length > 0) {
            console.log(`   🍽️ Found items: ${menuItems.slice(0, 5).join(', ')}`);
            console.log(`   💰 Found prices: ${prices.slice(0, 3).join(', ')}`);

            analyzedContent.push({
              url: result.url,
              title: result.title || 'Unknown',
              content: result.content,
              menuItems: [...new Set(menuItems)],
              prices: [...new Set(priceMatches || [])],
              strategy: searchResult.strategy
            });
          }
        }
      });
    }
  });

  console.log(`   ✅ Analyzed ${analyzedContent.length} sources with menu content`);
  return analyzedContent;
}

/**
 * STEP 3: Log raw content to files
 */
function logRawContent(restaurant, allSearchResults, analyzedContent) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${restaurant.name.replace(/\s+/g, '_')}_${timestamp}.txt`;
  const filepath = path.join(LOGS_DIR, filename);

  let logContent = `RESTAURANT: ${restaurant.name}\n`;
  logContent += `ADDRESS: ${restaurant.address}, ${restaurant.city} ${restaurant.zipCode}\n`;
  logContent += `CUISINE: ${restaurant.cuisine}\n`;
  logContent += `TIMESTAMP: ${new Date().toISOString()}\n`;
  logContent += `${'='.repeat(80)}\n\n`;

  // Log search results summary
  logContent += `SEARCH RESULTS SUMMARY:\n`;
  logContent += `========================\n`;
  allSearchResults.forEach(result => {
    logContent += `Strategy: ${result.strategy}\n`;
    logContent += `Success: ${result.success}\n`;
    logContent += `URLs Found: ${result.urls.length}\n`;
    logContent += `Has Menu Content: ${result.hasMenuContent || false}\n`;
    result.urls.forEach(url => {
      logContent += `  - ${url}\n`;
    });
    logContent += `\n`;
  });

  // Log analyzed content
  logContent += `\nANALYZED CONTENT:\n`;
  logContent += `=================\n\n`;

  analyzedContent.forEach((content, i) => {
    logContent += `SOURCE ${i + 1}: ${content.url}\n`;
    logContent += `TITLE: ${content.title}\n`;
    logContent += `STRATEGY: ${content.strategy}\n`;
    logContent += `CONTENT LENGTH: ${content.content.length} characters\n`;
    logContent += `MENU ITEMS FOUND: ${content.menuItems.join(', ')}\n`;
    logContent += `PRICES FOUND: ${content.prices.join(', ')}\n`;
    logContent += `${'='.repeat(60)}\n`;
    logContent += `FULL CONTENT:\n${content.content}\n\n`;
    logContent += `${'='.repeat(60)}\n\n`;
  });

  fs.writeFileSync(filepath, logContent);
  console.log(`📝 Raw content logged to: ${filepath}`);

  return filepath;
}

/**
 * STEP 4: GPT extraction of prices and dish names
 */
async function extractMenuWithGPT(restaurant, analyzedContent) {
  console.log(`\n🤖 Using GPT to extract menu items for ${restaurant.name}...`);

  const combinedContent = analyzedContent.map(content =>
    `URL: ${content.url}\nTITLE: ${content.title}\nSTRATEGY: ${content.strategy}\nPREVIOW ITEMS: ${content.menuItems.join(', ')}\nPREVIEW PRICES: ${content.prices.join(', ')}\nCONTENT: ${content.content}`
  ).join('\n\n---\n\n');

  const prompt = `You are analyzing real restaurant content to extract EXACT menu items and prices.

RESTAURANT: ${restaurant.name}
CUISINE: ${restaurant.cuisine}
LOCATION: ${restaurant.address}, ${restaurant.city}

RAW CONTENT TO ANALYZE:
${combinedContent}

EXTRACTION TASK:
Extract EVERY specific dish name and price you can find in the content above.

RULES:
1. Use EXACT dish names as they appear (e.g., "Truffle Risotto", "Caesar Salad with Grilled Chicken")
2. Extract EXACT prices when found (e.g., "$18.95", "$12.00")
3. If no exact price, estimate based on context and restaurant type
4. NEVER create generic names - only use what you actually see
5. Include appetizers, mains, desserts, drinks if found
6. Note the source URL where each item was found

CRITICAL: Respond with VALID JSON ONLY. Use ASCII characters only.

{
  "restaurant": "${restaurant.name}",
  "totalItemsFound": 0,
  "menuItems": [
    {
      "dishName": "EXACT name from content",
      "price": "$XX.XX or null if not found",
      "estimatedPrice": "$XX.XX if estimated",
      "category": "appetizer/main/dessert/drink",
      "description": "brief description if available",
      "sourceUrl": "URL where found"
    }
  ],
  "priceAnalysis": {
    "exactPrices": 0,
    "estimatedPrices": 0,
    "noPrices": 0,
    "averagePrice": "$XX.XX"
  }
}`;

  try {
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
            content: 'You are an expert menu analyst. Extract ONLY what you can see in the provided content. Respond with valid JSON only.'
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

    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0]?.message?.content);

    console.log(`✅ GPT extracted ${result.totalItemsFound || 0} menu items`);
    console.log(`   Exact prices: ${result.priceAnalysis?.exactPrices || 0}`);
    console.log(`   Estimated prices: ${result.priceAnalysis?.estimatedPrices || 0}`);

    return result;

  } catch (error) {
    console.log(`❌ GPT extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * MAIN TEST FUNCTION: Full flow for one restaurant
 */
async function testRestaurantFlow(restaurant) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏪 TESTING FULL FLOW: ${restaurant.name.toUpperCase()}`);
  console.log(`📍 ${restaurant.address}, ${restaurant.city} ${restaurant.zipCode}`);
  console.log(`🍽️ Cuisine: ${restaurant.cuisine}`);
  console.log(`${'='.repeat(80)}`);

  // Step 1: Execute all Tavily searches
  console.log(`\n📊 STEP 1: Tavily Search Strategies`);
  const allSearchResults = [];

  for (const [strategyName, strategy] of Object.entries(TAVILY_STRATEGIES)) {
    const result = await executeTavilySearch(restaurant, strategyName, strategy(restaurant));
    allSearchResults.push(result);

    // Small delay between searches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Collect all URLs for extraction
  const allUrls = [];
  allSearchResults.forEach(result => {
    if (result.success) {
      allUrls.push(...result.urls);
    }
  });

  // Remove duplicates
  const uniqueUrls = [...new Set(allUrls)];
  console.log(`\n📋 Found ${uniqueUrls.length} unique URLs total`);

  if (uniqueUrls.length === 0) {
    console.log(`❌ No URLs found for ${restaurant.name}, skipping extraction`);
    return null;
  }

  // Step 2: Analyze content from searches
  console.log(`\n📊 STEP 2: Content Analysis`);
  const analyzedContent = analyzeSearchContent(allSearchResults, restaurant);

  if (analyzedContent.length === 0) {
    console.log(`❌ No menu content found for ${restaurant.name}`);
    return null;
  }

  // Step 3: Log raw content
  console.log(`\n📊 STEP 3: Logging Raw Content`);
  const logFile = logRawContent(restaurant, allSearchResults, analyzedContent);

  // Step 4: GPT extraction
  console.log(`\n📊 STEP 4: GPT Menu Extraction`);
  const gptResult = await extractMenuWithGPT(restaurant, analyzedContent);

  // Summary
  console.log(`\n📊 SUMMARY FOR ${restaurant.name}:`);
  console.log(`   Search strategies tested: ${allSearchResults.length}`);
  console.log(`   Successful searches: ${allSearchResults.filter(r => r.success).length}`);
  console.log(`   Unique URLs found: ${uniqueUrls.length}`);
  console.log(`   Content sources analyzed: ${analyzedContent.length}`);
  console.log(`   Menu items found: ${gptResult?.totalItemsFound || 0}`);
  console.log(`   Raw content logged to: ${logFile}`);

  return {
    restaurant: restaurant.name,
    searchResults: allSearchResults,
    analyzedContent,
    gptResult,
    logFile
  };
}

/**
 * MAIN FUNCTION: Test all restaurants
 */
async function runFullTest() {
  console.log('🧪 COMPREHENSIVE TAVILY RESTAURANT MENU TEST');
  console.log('==============================================\n');
  console.log(`Testing ${TEST_RESTAURANTS.length} restaurants with full extraction flow...\n`);

  const allResults = [];

  for (const restaurant of TEST_RESTAURANTS) {
    const result = await testRestaurantFlow(restaurant);
    if (result) {
      allResults.push(result);
    }

    // Longer delay between restaurants
    console.log(`\n⏱️ Waiting before next restaurant...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Final summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 FINAL SUMMARY`);
  console.log(`${'='.repeat(80)}`);

  allResults.forEach(result => {
    const successfulSearches = result.searchResults.filter(r => r.success).length;
    console.log(`\n🏪 ${result.restaurant}:`);
    console.log(`   ✅ Successful searches: ${successfulSearches}/${result.searchResults.length}`);
    console.log(`   📄 Content sources: ${result.analyzedContent.length}`);
    console.log(`   🍽️ Menu items extracted: ${result.gptResult?.totalItemsFound || 0}`);
    console.log(`   📝 Log file: ${result.logFile}`);
  });

  console.log(`\n📁 All raw content logged to: ${LOGS_DIR}/`);
  console.log(`✅ Test complete! Check log files for detailed menu content.`);
}

// Export for require() use
module.exports = {
  testRestaurantFlow,
  executeTavilySearch,
  analyzeSearchContent,
  extractMenuWithGPT,
  TAVILY_STRATEGIES,
  TEST_RESTAURANTS
};

// Run if called directly
if (require.main === module) {
  runFullTest().catch(console.error);
}