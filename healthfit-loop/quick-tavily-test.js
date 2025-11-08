#!/usr/bin/env node

const { TavilyClient } = require('tavily');
require('dotenv').config();

const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

// Test with just 2 restaurants
const TEST_RESTAURANTS = [
  { name: "Bottega", city: "San Francisco", address: "1132 Valencia St", zipCode: "94110" },
  { name: "Kitava", city: "San Francisco", address: "1700 Fillmore St", zipCode: "94115" }
];

// Test the updated queries including menu PDFs
const QUERY_STRATEGIES = {
  "doordash_ordering": (restaurant) => `"${restaurant.name}" "${restaurant.address}" site:doordash.com/store -graveyard -dnu -not-available`,
  "menu_pdf_search": (restaurant) => `"${restaurant.name}" "${restaurant.address}" menu pdf OR "food menu" OR "dinner menu" dishes prices`,
  "restaurant_website_menu": (restaurant) => `"${restaurant.name}" "${restaurant.address}" site:${restaurant.name.toLowerCase().replace(/\s+/g, '')}.com menu`,
  "comprehensive_menu": (restaurant) => `"${restaurant.name}" "${restaurant.address}" menu dishes prices`
};

async function testQuery(restaurant, queryName, queryFunction) {
  try {
    const query = queryFunction(restaurant);
    console.log(`\n🔍 Testing "${queryName}" for ${restaurant.name}:`);
    console.log(`   Query: ${query}`);

    const response = await tavilyClient.search({
      query: query,
      maxResults: 3,
      includeContent: true
    });

    if (!response.results || response.results.length === 0) {
      console.log(`   ❌ No results found`);
      return { restaurant: restaurant.name, queryName, hasMenuContent: false, menuItems: [] };
    }

    console.log(`   ✅ Found ${response.results.length} results:`);

    let menuItems = [];
    let hasRealMenuContent = false;
    let doorDashUrl = null;

    response.results.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.title}`);
      console.log(`      URL: ${result.url}`);

      // Check for DoorDash URL
      if (result.url.includes('doordash.com')) {
        doorDashUrl = result.url;
        console.log(`      🚪 DoorDash URL found!`);
      }

      const content = result.content?.toLowerCase() || '';
      const dishMatches = content.match(/\b(pizza|pasta|salad|sandwich|burger|soup|steak|chicken|fish|bowl|wrap|taco|burrito|rice|noodles)\b/g);
      const priceMatches = content.match(/\$\d+\.?\d*/g);

      if (dishMatches && dishMatches.length > 0) {
        hasRealMenuContent = true;
        menuItems.push(...dishMatches);
        console.log(`      🍽️ Found food items: ${dishMatches.slice(0, 5).join(', ')}`);
      }

      if (priceMatches && priceMatches.length > 0) {
        console.log(`      💰 Found prices: ${priceMatches.slice(0, 3).join(', ')}`);
      }
    });

    return {
      restaurant: restaurant.name,
      queryName,
      hasMenuContent: hasRealMenuContent,
      menuItems: [...new Set(menuItems)],
      doorDashUrl,
      resultCount: response.results.length
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { restaurant: restaurant.name, queryName, hasMenuContent: false, menuItems: [], error: error.message };
  }
}

async function runQuickTest() {
  console.log('🧪 QUICK TAVILY TEST FOR RESTAURANT MENUS');
  console.log('=========================================\n');

  const allResults = [];

  for (const restaurant of TEST_RESTAURANTS) {
    console.log(`\n🏪 TESTING: ${restaurant.name} (${restaurant.address})`);
    console.log('='.repeat(50));

    for (const [queryName, queryFunction] of Object.entries(QUERY_STRATEGIES)) {
      const result = await testQuery(restaurant, queryName, queryFunction);
      allResults.push(result);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Quick summary
  console.log('\n📊 QUICK SUMMARY');
  console.log('================\n');

  const summaryByQuery = {};
  allResults.forEach(result => {
    if (!summaryByQuery[result.queryName]) {
      summaryByQuery[result.queryName] = { total: 0, withMenu: 0, totalMenuItems: 0 };
    }

    summaryByQuery[result.queryName].total++;
    if (result.hasMenuContent) {
      summaryByQuery[result.queryName].withMenu++;
      summaryByQuery[result.queryName].totalMenuItems += result.menuItems.length;
    }
  });

  Object.entries(summaryByQuery)
    .sort(([,a], [,b]) => (b.withMenu/b.total) - (a.withMenu/a.total))
    .forEach(([queryName, stats]) => {
      console.log(`${queryName}: ${stats.withMenu}/${stats.total} success (${stats.totalMenuItems} menu items)`);
    });

  // Show best DoorDash URLs found
  console.log('\n🚪 DOORDASH URLS FOUND:');
  allResults.filter(r => r.doorDashUrl).forEach(r => {
    console.log(`${r.restaurant}: ${r.doorDashUrl}`);
  });
}

runQuickTest().catch(console.error);