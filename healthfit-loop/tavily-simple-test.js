#!/usr/bin/env node

/**
 * Simple Tavily Query Test Script
 *
 * Quick script to test specific Tavily queries and see exactly what content is returned.
 * Use this to rapidly iterate on query strategies before running the full flow.
 */

const { TavilyClient } = require('tavily');
require('dotenv').config();

const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

// Quick test restaurant
const TEST_RESTAURANT = {
  name: "Bottega",
  city: "San Francisco",
  address: "1132 Valencia St",
  zipCode: "94110",
  cuisine: "italian"
};

/**
 * Test a single query and show detailed results
 */
async function testSingleQuery(query, description) {
  console.log(`\n🔍 ${description}`);
  console.log(`📝 Query: ${query}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Regular search
    const searchResponse = await tavilyClient.search({
      query: query,
      maxResults: 3,
      includeContent: true,
      search_depth: "advanced"
    });

    if (!searchResponse.results || searchResponse.results.length === 0) {
      console.log(`❌ No results found`);
      return;
    }

    console.log(`✅ Found ${searchResponse.results.length} results:\n`);

    searchResponse.results.forEach((result, i) => {
      console.log(`${i + 1}. ${result.title}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Content preview: "${result.content?.substring(0, 200)}..."`);

      // Analyze content for menu indicators
      const content = result.content?.toLowerCase() || '';
      const menuIndicators = [];

      if (content.includes('menu')) menuIndicators.push('menu');
      if (content.includes('$')) menuIndicators.push('prices');
      if (content.match(/\b(pizza|pasta|salad|chicken|beef|soup)\b/)) menuIndicators.push('food-items');
      if (content.includes('order') || content.includes('delivery')) menuIndicators.push('ordering');

      if (menuIndicators.length > 0) {
        console.log(`   📋 Menu indicators: ${menuIndicators.join(', ')}`);
      }
      console.log('');
    });

    // Analyze the most promising result for menu content
    const firstResult = searchResponse.results[0];
    if (firstResult && firstResult.content) {
      console.log(`📋 Analyzing content from: ${firstResult.url}`);

      const content = firstResult.content.toLowerCase();
      const menuItems = [];
      const prices = [];

      // Look for specific food items
      const foodMatches = content.match(/\b(pizza|pasta|salad|chicken|beef|soup|risotto|gnocchi|ravioli|lasagna|caesar|margherita|carbonara|bolognese|penne|linguine|fettuccine)\b/g);
      if (foodMatches) {
        menuItems.push(...new Set(foodMatches));
      }

      // Look for prices
      const priceMatches = content.match(/\$\d+\.?\d*/g);
      if (priceMatches) {
        prices.push(...new Set(priceMatches));
      }

      if (menuItems.length > 0) {
        console.log(`🍽️ Found food items: ${menuItems.slice(0, 8).join(', ')}`);
      }
      if (prices.length > 0) {
        console.log(`💰 Found prices: ${prices.slice(0, 5).join(', ')}`);
      }
    }

  } catch (error) {
    console.log(`❌ Search failed: ${error.message}`);
  }
}

/**
 * Quick test of key query strategies
 */
async function runQuickTest() {
  console.log('🧪 QUICK TAVILY QUERY TEST');
  console.log(`🏪 Restaurant: ${TEST_RESTAURANT.name}`);
  console.log(`📍 Location: ${TEST_RESTAURANT.address}, ${TEST_RESTAURANT.zipCode}`);
  console.log(`${'='.repeat(80)}`);

  const queries = [
    {
      query: `"${TEST_RESTAURANT.name}" "${TEST_RESTAURANT.address}" "${TEST_RESTAURANT.city}" site:doordash.com/store -graveyard -dnu -not-available`,
      description: "DoorDash Store Search (Precise Address)"
    },
    {
      query: `"${TEST_RESTAURANT.name}" "${TEST_RESTAURANT.address}" menu prices dishes`,
      description: "Menu Content Search with Exact Address"
    },
    {
      query: `"${TEST_RESTAURANT.name}" "${TEST_RESTAURANT.address}" "${TEST_RESTAURANT.city}" site:ubereats.com/store -not-available`,
      description: "UberEats Store Search (Precise Address)"
    },
    {
      query: `"${TEST_RESTAURANT.name}" "${TEST_RESTAURANT.address}" "${TEST_RESTAURANT.city}" site:grubhub.com/restaurant -not-available`,
      description: "GrubHub Search (Precise Address)"
    },
    {
      query: `"${TEST_RESTAURANT.name}" "${TEST_RESTAURANT.city}" inurl:menu OR "our menu" -doordash -ubereats -grubhub`,
      description: "Restaurant Website Menu"
    }
  ];

  for (const { query, description } of queries) {
    await testSingleQuery(query, description);

    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n✅ Quick test complete!`);
  console.log(`💡 Use the full script (tavily-comprehensive-test.js) to run the complete flow.`);
}

/**
 * Test custom query (for interactive testing)
 */
async function testCustomQuery(customQuery) {
  if (!customQuery) {
    console.log('Usage: testCustomQuery("your search query here")');
    return;
  }

  await testSingleQuery(customQuery, "Custom Query Test");
}

// Export for interactive use
module.exports = {
  testSingleQuery,
  testCustomQuery,
  TEST_RESTAURANT
};

// Run if called directly
if (require.main === module) {
  runQuickTest().catch(console.error);
}