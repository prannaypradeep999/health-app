#!/usr/bin/env node

/**
 * Tavily Query Testing Script
 *
 * Tests different Tavily search queries for restaurants to find the best
 * queries that return actual menu content with specific dish names and prices.
 */

const { TavilyClient } = require('tavily');
require('dotenv').config();

// Initialize Tavily client
const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

// Test restaurants (you can modify these)
const TEST_RESTAURANTS = [
  { name: "Bottega", city: "San Francisco", address: "1132 Valencia St", zipCode: "94110" },
  { name: "Piccolo Forno", city: "San Francisco", address: "725 Columbus Ave", zipCode: "94133" },
  { name: "The Bite", city: "San Francisco", address: "996 Mission St", zipCode: "94103" },
  { name: "Pearl 6101", city: "San Francisco", address: "6101 California St", zipCode: "94121" },
  { name: "Kitava", city: "San Francisco", address: "1700 Fillmore St", zipCode: "94115" }
];

// Different query strategies to test
const QUERY_STRATEGIES = {
  // Current queries
  "current_doordash": (restaurant) => `"${restaurant.name}" "${restaurant.city}" site:doordash.com/store -graveyard -dnu -not-available`,
  "current_menu": (restaurant) => `"${restaurant.name}" "${restaurant.city}" menu prices dishes`,

  // NEW FIXED QUERIES: Add address/zip for specificity
  "fixed_doordash_address": (restaurant) => `"${restaurant.name}" "${restaurant.address}" site:doordash.com/store -graveyard -dnu -not-available`,
  "fixed_menu_address": (restaurant) => `"${restaurant.name}" "${restaurant.address}" menu prices dishes`,
  "fixed_doordash_zip": (restaurant) => `"${restaurant.name}" "${restaurant.zipCode}" site:doordash.com/store -graveyard -dnu -not-available`,
  "fixed_menu_zip": (restaurant) => `"${restaurant.name}" "${restaurant.zipCode}" menu prices dishes`,
  "fixed_comprehensive_address": (restaurant) => `"${restaurant.name}" "${restaurant.address}" menu OR "food menu" OR "dinner menu" OR "lunch menu"`,

  // Proposed new queries (you can add more here)
  "your_suggested_query": (restaurant) => `"${restaurant.name}" "${restaurant.city}" site:menu site:doordash`,
  "yelp_menu": (restaurant) => `"${restaurant.name}" "${restaurant.city}" site:yelp.com menu`,
  "website_menu": (restaurant) => `"${restaurant.name}" "${restaurant.city}" site:menu OR inurl:menu OR "our menu"`,
  "comprehensive": (restaurant) => `"${restaurant.name}" "${restaurant.city}" menu OR "food menu" OR "dinner menu" OR "lunch menu"`,
  "opentable": (restaurant) => `"${restaurant.name}" "${restaurant.city}" site:opentable.com menu`,
  "grubhub": (restaurant) => `"${restaurant.name}" "${restaurant.city}" site:grubhub.com menu`,
};

async function testQuery(restaurant, queryName, queryFunction, maxResults = 3) {
  try {
    const query = queryFunction(restaurant);
    console.log(`\n🔍 Testing "${queryName}" for ${restaurant.name}:`);
    console.log(`   Query: ${query}`);

    const response = await tavilyClient.search({
      query: query,
      maxResults: maxResults,
      includeContent: true
    });

    if (!response.results || response.results.length === 0) {
      console.log(`   ❌ No results found`);
      return {
        restaurant: restaurant.name,
        queryName,
        query,
        resultCount: 0,
        hasMenuContent: false,
        menuItems: [],
        error: "No results"
      };
    }

    console.log(`   ✅ Found ${response.results.length} results:`);

    let menuItems = [];
    let hasRealMenuContent = false;

    response.results.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.title}`);
      console.log(`      URL: ${result.url}`);
      console.log(`      Content: ${result.content?.substring(0, 150)}...`);

      // Look for specific dish names and prices in content
      const content = result.content?.toLowerCase() || '';
      const dishMatches = content.match(/\b(pizza|pasta|salad|sandwich|burger|soup|steak|chicken|fish|bowl|wrap|taco|burrito)\b/g);
      const priceMatches = content.match(/\$\d+\.?\d*/g);

      if (dishMatches && dishMatches.length > 0) {
        hasRealMenuContent = true;
        menuItems.push(...dishMatches);
        console.log(`      🍽️ Found food items: ${dishMatches.slice(0, 5).join(', ')}`);
      }

      if (priceMatches && priceMatches.length > 0) {
        console.log(`      💰 Found prices: ${priceMatches.slice(0, 3).join(', ')}`);
      }

      console.log('');
    });

    return {
      restaurant: restaurant.name,
      queryName,
      query,
      resultCount: response.results.length,
      hasMenuContent: hasRealMenuContent,
      menuItems: [...new Set(menuItems)], // Remove duplicates
      results: response.results.map(r => ({
        title: r.title,
        url: r.url,
        contentPreview: r.content?.substring(0, 200)
      }))
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      restaurant: restaurant.name,
      queryName,
      query: queryFunction(restaurant),
      resultCount: 0,
      hasMenuContent: false,
      menuItems: [],
      error: error.message
    };
  }
}

async function runAllTests() {
  console.log('🧪 TAVILY QUERY TESTING SCRIPT');
  console.log('===============================\n');

  const allResults = [];

  for (const restaurant of TEST_RESTAURANTS) {
    console.log(`\n🏪 TESTING RESTAURANT: ${restaurant.name} (${restaurant.city})`);
    console.log('='.repeat(60));

    for (const [queryName, queryFunction] of Object.entries(QUERY_STRATEGIES)) {
      const result = await testQuery(restaurant, queryName, queryFunction);
      allResults.push(result);

      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary analysis
  console.log('\n📊 SUMMARY ANALYSIS');
  console.log('===================\n');

  const summaryByQuery = {};
  allResults.forEach(result => {
    if (!summaryByQuery[result.queryName]) {
      summaryByQuery[result.queryName] = {
        totalRestaurants: 0,
        successfulRestaurants: 0,
        totalResults: 0,
        restaurantsWithMenuContent: 0,
        totalMenuItems: 0
      };
    }

    const summary = summaryByQuery[result.queryName];
    summary.totalRestaurants++;
    summary.totalResults += result.resultCount;

    if (result.resultCount > 0) {
      summary.successfulRestaurants++;
    }

    if (result.hasMenuContent) {
      summary.restaurantsWithMenuContent++;
      summary.totalMenuItems += result.menuItems.length;
    }
  });

  // Rank queries by effectiveness
  console.log('🏆 QUERY EFFECTIVENESS RANKING:\n');
  const rankedQueries = Object.entries(summaryByQuery)
    .map(([queryName, stats]) => ({
      queryName,
      ...stats,
      score: (stats.restaurantsWithMenuContent / stats.totalRestaurants) * 100
    }))
    .sort((a, b) => b.score - a.score);

  rankedQueries.forEach((query, i) => {
    console.log(`${i + 1}. ${query.queryName}`);
    console.log(`   Success Rate: ${query.score.toFixed(1)}% (${query.restaurantsWithMenuContent}/${query.totalRestaurants} restaurants)`);
    console.log(`   Avg Results: ${(query.totalResults / query.totalRestaurants).toFixed(1)} per restaurant`);
    console.log(`   Menu Items Found: ${query.totalMenuItems} total\n`);
  });

  // Best performing restaurants
  console.log('🍽️ BEST RESTAURANTS FOR MENU EXTRACTION:\n');
  const restaurantSuccess = {};
  allResults.forEach(result => {
    if (!restaurantSuccess[result.restaurant]) {
      restaurantSuccess[result.restaurant] = { successCount: 0, totalQueries: 0 };
    }
    restaurantSuccess[result.restaurant].totalQueries++;
    if (result.hasMenuContent) {
      restaurantSuccess[result.restaurant].successCount++;
    }
  });

  Object.entries(restaurantSuccess)
    .map(([restaurant, stats]) => ({
      restaurant,
      successRate: (stats.successCount / stats.totalQueries) * 100
    }))
    .sort((a, b) => b.successRate - a.successRate)
    .forEach((restaurant, i) => {
      console.log(`${i + 1}. ${restaurant.restaurant}: ${restaurant.successRate.toFixed(1)}% success rate`);
    });
}

// Add custom query testing function
function addCustomQuery(name, queryFunction) {
  QUERY_STRATEGIES[name] = queryFunction;
  console.log(`✅ Added custom query: ${name}`);
}

// Export for potential module use
if (require.main === module) {
  // Run if called directly
  runAllTests().catch(console.error);
} else {
  // Export for require()
  module.exports = {
    testQuery,
    addCustomQuery,
    TEST_RESTAURANTS,
    QUERY_STRATEGIES,
    runAllTests
  };
}