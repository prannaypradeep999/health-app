#!/usr/bin/env node

/**
 * GPT Menu Extraction Testing Script
 *
 * Tests different GPT prompts for extracting menu items from Tavily content
 * to find the best prompt that extracts EXACT dish names instead of generic ones.
 */

require('dotenv').config();

// Sample multi-restaurant data for testing diverse meal selection
const SAMPLE_MULTI_RESTAURANT_DATA = [
  {
    restaurant: { name: "The Bite", cuisine: "mediterranean", city: "San Francisco" },
    menuItems: [
      { dishName: "Grilled Chicken Breast Rice Bowl", price: "$14.95", category: "entree" },
      { dishName: "Lamb & Beef Gyro Rice Bowl", price: "$15.95", category: "entree" },
      { dishName: "Chicken Gyro Rice Bowl", price: "$14.95", category: "entree" },
      { dishName: "Mediterranean Hummus Wrap", price: "$12.95", category: "wrap" }
    ]
  },
  {
    restaurant: { name: "Bottega", cuisine: "italian", city: "San Francisco" },
    menuItems: [
      { dishName: "Lasagne Al Forno", price: "$22.00", category: "pasta" },
      { dishName: "Antipasto Bottega for Two", price: "$28.00", category: "appetizer" },
      { dishName: "Carpaccio Tonno", price: "$18.00", category: "appetizer" },
      { dishName: "Polpette", price: "$16.00", category: "entree" }
    ]
  },
  {
    restaurant: { name: "Piccolo Forno", cuisine: "italian", city: "San Francisco" },
    menuItems: [
      { dishName: "Crab Ravioli", price: "$26.00", category: "pasta" },
      { dishName: "Margherita Pizza", price: "$18.00", category: "pizza" },
      { dishName: "Wild Mushroom Risotto", price: "$24.00", category: "entree" }
    ]
  },
  {
    restaurant: { name: "Kitava", cuisine: "healthy", city: "San Francisco" },
    menuItems: [
      { dishName: "Wild Rice Bowl", price: "$16.00", category: "bowl" },
      { dishName: "Grass Fed Beef Bowl", price: "$19.00", category: "bowl" },
      { dishName: "Seasonal Vegetable Soup", price: "$12.00", category: "soup" }
    ]
  }
];

// Sample Tavily data that we know has specific dish names
const SAMPLE_TAVILY_DATA = {
  "the_bite_real_data": {
    restaurant: { name: "The Bite", cuisine: "mediterranean italian", city: "San Francisco" },
    hasMenuContent: true,
    menuSources: [
      {
        url: "https://www.doordash.com/store/the-bite-san-francisco-2096733/",
        title: "Order The Bite - San Francisco, CA Menu Delivery",
        content: "$0 delivery fee, first order Grilled Chicken Breast Rice Bowl Lamb & Beef Gyro Rice Bowl Chicken Gyro Rice Bowl DoorDash order First time ordering - so far so good! DoorDash order I ordered the beef kebab bowl, it was a great portion and well seasoned. The hummus was also very good."
      },
      {
        url: "https://www.thebitesf.com/",
        title: "The Bite | Mediterranean Restaurant, San Francisco",
        content: "top of page 996 Mission St, San Francisco, CA 94103 Tel 415-757-0414 # The Bite # The Best Mediterranean Restaurant In San Francisco MEnu Phone ## SPECIALS OF THE BITE Appetizers Soup Salads Pita Wraps Rice Bowls #### Fresh food and Good moods AT THE BITE Looking for a good restaurant in the hottest area in San Francisco? We are all about salad bowls, rice bowls, wraps, and delicious drinks? We are a small local restaurant with healthy bites ready to serve you."
      }
    ]
  },

  "bottega_real_data": {
    restaurant: { name: "Bottega", cuisine: "mediterranean italian", city: "San Francisco" },
    hasMenuContent: true,
    menuSources: [
      {
        url: "https://labottegala.com/pages/menu-2025-test",
        title: "Menu Page - La Bottega",
        content: "Our menu. LA BOTTEGA. ORDER ONLINE. Insalate · Quick add · Tuscan Cobb Salad. $26.00 ... La Bottega Chopped. $26.00. Quick add. Caesar Piccante. $20.00. Piatti"
      },
      {
        url: "https://www.bottega90menu.com/",
        title: "Bottega 90 - San Francisco, CA - 1132 Valencia St - Hours",
        content: "Homemade spaghetti pasta served with our famous meatballs in the most simple but authentic san Marzano tomato sauce. San Marzano tomato sauce, melted mozzarella, fresh basil. Grilled chicken breast, arugula, cherry tomatoes, shaved parmesan"
      },
      {
        url: "https://www.doordash.com/business/bottega-13673613/menu",
        title: "Bottega's Menu: Prices and Deliver",
        content: "Specialties · Antipasto Bottega for Two · Carpaccio Tonno · Polpette · Lasagne Al Forno · Cannelloni Al Forno · Insalata Rucola · Olive Miste"
      }
    ]
  }
};

// Different GPT prompts to test
const GPT_PROMPTS = {

  "current_prompt": (restaurant, tavilyData) => `You are analyzing search results for ${restaurant.name} to extract a COMPREHENSIVE menu with exact dish names and price ranges.

RESTAURANT: ${restaurant.name}
CUISINE: ${restaurant.cuisine}

MENU CONTENT SOURCES FOUND:
${JSON.stringify(tavilyData.menuSources.map(source => ({
  url: source.url,
  title: source.title,
  content: source.content
})), null, 2)}

TASK: Extract a COMPREHENSIVE menu (8-15+ items) with exact dish names and approximate pricing.

CRITICAL EXTRACTION RULES:
1. EXTRACT THE COMPLETE MENU - aim for 8-15+ menu items, not just 2-3
2. Use EXACT dish names as they appear (e.g., "Truffle Pasta", "Vodka Rigatoni", "Caesar Salad")
3. For prices: If exact price found → use it. If no exact price → use ranges like "$12-15", "~$18", "$20+"
4. Include ALL food categories: appetizers, salads, pasta, pizza, entrees, desserts, etc.
5. NEVER use generic names like "Pizza", "Pasta", "Salad" - use the specific names
6. Source each dish with the URL where you found it

CRITICAL: Response must be valid JSON only. Use ONLY ASCII characters.

Required JSON response:
{
  "menuItems": [
    {
      "dishName": "EXACT dish name (e.g., Grilled Chicken Breast Rice Bowl)",
      "price": "Exact price like $18.95 or range like $14-16 or ~$18",
      "category": "appetizer/salad/pasta/pizza/entree/dessert",
      "description": "Brief description",
      "sourceUrl": "URL where this dish was found"
    }
  ]
}`,

  "aggressive_extraction": (restaurant, tavilyData) => `You are a menu extraction expert. Your job is to find EVERY SINGLE specific dish name mentioned in the content below.

RESTAURANT: ${restaurant.name}

CONTENT TO SCAN:
${tavilyData.menuSources.map((source, i) => `
SOURCE ${i+1}: ${source.url}
CONTENT: ${source.content}
`).join('\n')}

EXTRACTION TASK:
Scan the content word by word and extract EVERY specific dish name you see.

EXAMPLES of what to extract:
- "Grilled Chicken Breast Rice Bowl" → extract exactly as "Grilled Chicken Breast Rice Bowl"
- "Lamb & Beef Gyro Rice Bowl" → extract exactly as "Lamb & Beef Gyro Rice Bowl"
- "Tuscan Cobb Salad" → extract exactly as "Tuscan Cobb Salad"
- "Caesar Piccante" → extract exactly as "Caesar Piccante"
- "Lasagne Al Forno" → extract exactly as "Lasagne Al Forno"
- "Antipasto Bottega for Two" → extract exactly as "Antipasto Bottega for Two"

NEVER create generic names like "Rice Bowl", "Salad", "Pasta" - only use the EXACT names found in content.

IF you see a price like "$26.00" next to a dish, extract that exact price.
IF no price, estimate based on restaurant type: ~$12 (casual), ~$18 (mid-range), ~$25 (upscale)

JSON Response:
{
  "extractedDishes": [
    {
      "dishName": "EXACT name from content",
      "price": "$XX.XX or ~$XX",
      "foundInSource": "URL where found",
      "contentSnippet": "exact text where found"
    }
  ]
}`,

  "zero_hallucination": (restaurant, tavilyData) => `CRITICAL: You are a STRICT menu extractor. You can ONLY extract dish names that are EXPLICITLY mentioned in the provided content. You are FORBIDDEN from creating or inferring dish names.

RESTAURANT: ${restaurant.name}

RAW CONTENT TO SCAN:
${tavilyData.menuSources.map(source => source.content).join('\n\n---\n\n')}

RULES:
1. ONLY extract dish names that are LITERALLY written in the content above
2. If you see "Grilled Chicken Breast Rice Bowl" → extract it exactly
3. If you see "Tuscan Cobb Salad. $26.00" → extract "Tuscan Cobb Salad" with price $26.00
4. If content only says "salad bowls, rice bowls" without specific names → extract nothing
5. NEVER create names like "Mediterranean Salad" if not explicitly mentioned
6. If no specific dish names found → return empty array

Extract ONLY what you can see with your eyes in the text.

{
  "dishesFound": [
    {
      "exactName": "dish name as written in content",
      "price": "$XX.XX if found, otherwise null",
      "sourceText": "exact quote where you found it"
    }
  ],
  "totalFound": "number of dishes found"
}`,

  // NEW PROMPT: Test diverse meal selection logic (2-3 dishes PER restaurant)
  "diverse_meal_selection": (restaurantMenus) => `You are selecting meals for a 4-day meal plan. You have menu data from multiple restaurants.

CRITICAL REQUIREMENT: Select 2-3 specific dishes from EACH restaurant that has menu data to create 10-15 total diverse dishes across the week.

RESTAURANT MENUS:
${JSON.stringify(restaurantMenus, null, 2)}

SELECTION RULES:
1. Pick 2-3 dishes from EACH restaurant (not 4-6 total across all restaurants)
2. Prioritize variety: different cuisines, preparations, and ingredients
3. Include different meal types: light lunches, hearty dinners, etc.
4. NO repetition - each dish should be unique
5. Use EXACT dish names from the menu data provided

TARGET RESULT: 10-15 diverse dishes total (2-3 from each restaurant)

JSON Response:
{
  "selectedMeals": [
    {
      "restaurant": "exact restaurant name",
      "dishName": "exact dish name from menu",
      "price": "price from menu",
      "mealType": "lunch/dinner",
      "reason": "why this dish was selected for variety"
    }
  ],
  "totalSelected": "number of dishes selected",
  "diversityScore": "1-10 rating of variety across selection"
}`

};

async function testGPTExtraction(restaurant, tavilyData, promptName, promptFunction) {
  try {
    const prompt = promptFunction(restaurant, tavilyData);

    console.log(`\n🧪 Testing "${promptName}" for ${restaurant.name}:`);
    console.log(`📝 Prompt length: ${prompt.length} characters`);

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
            content: 'You are an expert menu analyst. Respond with VALID JSON ONLY. No markdown, no extra text. Extract exactly what you see in the content.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1000
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

    console.log(`✅ GPT Response:`);
    console.log(JSON.stringify(result, null, 2));

    // Analyze what was extracted
    let extractedDishes = [];
    if (result.menuItems) {
      extractedDishes = result.menuItems.map(item => item.dishName);
    } else if (result.extractedDishes) {
      extractedDishes = result.extractedDishes.map(item => item.dishName);
    } else if (result.dishesFound) {
      extractedDishes = result.dishesFound.map(item => item.exactName);
    }

    console.log(`📊 Analysis:`);
    console.log(`   Dishes extracted: ${extractedDishes.length}`);
    console.log(`   Specific dishes: ${extractedDishes.join(', ')}`);

    // Check for generic vs specific names
    const genericTerms = ['bowl', 'salad', 'wrap', 'pasta', 'pizza'];
    const hasGeneric = extractedDishes.some(dish =>
      genericTerms.some(term => dish.toLowerCase().includes(term) && dish.split(' ').length <= 3)
    );

    if (hasGeneric) {
      console.log(`   ⚠️  Contains generic names (bad)`);
    } else {
      console.log(`   ✅ All specific names (good)`);
    }

    return {
      promptName,
      restaurant: restaurant.name,
      dishCount: extractedDishes.length,
      dishes: extractedDishes,
      hasGenericNames: hasGeneric,
      rawResponse: result
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      promptName,
      restaurant: restaurant.name,
      error: error.message,
      dishCount: 0,
      dishes: []
    };
  }
}

async function testDiverseMealSelection() {
  console.log('\n🍽️ TESTING DIVERSE MEAL SELECTION LOGIC');
  console.log('==========================================\n');

  try {
    const prompt = GPT_PROMPTS.diverse_meal_selection(SAMPLE_MULTI_RESTAURANT_DATA);

    console.log(`📝 Testing diverse meal selection with ${SAMPLE_MULTI_RESTAURANT_DATA.length} restaurants`);
    console.log(`📊 Total dishes available: ${SAMPLE_MULTI_RESTAURANT_DATA.reduce((total, rest) => total + rest.menuItems.length, 0)}`);

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
            content: 'You are an expert meal planner. Respond with VALID JSON ONLY. Select 2-3 dishes from EACH restaurant for maximum variety.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      throw new Error(`GPT API error: ${response.status}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0]?.message?.content);

    console.log(`✅ GPT Response:`);
    console.log(JSON.stringify(result, null, 2));

    // Analyze selection
    const selectionByRestaurant = {};
    result.selectedMeals?.forEach(meal => {
      if (!selectionByRestaurant[meal.restaurant]) {
        selectionByRestaurant[meal.restaurant] = [];
      }
      selectionByRestaurant[meal.restaurant].push(meal.dishName);
    });

    console.log(`\n📊 Selection Analysis:`);
    console.log(`   Total dishes selected: ${result.totalSelected || result.selectedMeals?.length || 0}`);
    console.log(`   Dishes per restaurant:`);
    Object.entries(selectionByRestaurant).forEach(([restaurant, dishes]) => {
      console.log(`     ${restaurant}: ${dishes.length} dishes (${dishes.join(', ')})`);
    });

    const expectedRange = SAMPLE_MULTI_RESTAURANT_DATA.length * 2; // 2-3 per restaurant
    const actualCount = result.selectedMeals?.length || 0;

    if (actualCount >= expectedRange && actualCount <= expectedRange + SAMPLE_MULTI_RESTAURANT_DATA.length) {
      console.log(`   ✅ Good diversity: ${actualCount} dishes selected (target: ${expectedRange}-${expectedRange + SAMPLE_MULTI_RESTAURANT_DATA.length})`);
    } else {
      console.log(`   ⚠️  Poor diversity: ${actualCount} dishes selected (target: ${expectedRange}-${expectedRange + SAMPLE_MULTI_RESTAURANT_DATA.length})`);
    }

    return result;

  } catch (error) {
    console.log(`   ❌ Error testing diverse meal selection: ${error.message}`);
    return null;
  }
}

async function runGPTTests() {
  console.log('🧪 GPT MENU EXTRACTION TESTING');
  console.log('=================================\n');

  const results = [];

  // Test diverse meal selection first
  await testDiverseMealSelection();

  for (const [dataName, tavilyData] of Object.entries(SAMPLE_TAVILY_DATA)) {
    console.log(`\n🏪 TESTING DATA: ${dataName.toUpperCase()}`);
    console.log('='.repeat(60));

    console.log(`📥 Input Content Preview:`);
    tavilyData.menuSources.forEach((source, i) => {
      console.log(`   ${i+1}. ${source.url}`);
      console.log(`      "${source.content.substring(0, 100)}..."`);
    });

    for (const [promptName, promptFunction] of Object.entries(GPT_PROMPTS)) {
      // Skip the diverse_meal_selection prompt for individual restaurant testing
      if (promptName === 'diverse_meal_selection') continue;

      const result = await testGPTExtraction(tavilyData.restaurant, tavilyData, promptName, promptFunction);
      results.push(result);

      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary analysis
  console.log('\n📊 PROMPT EFFECTIVENESS SUMMARY');
  console.log('================================\n');

  const promptStats = {};
  results.forEach(result => {
    if (!promptStats[result.promptName]) {
      promptStats[result.promptName] = {
        totalTests: 0,
        totalDishes: 0,
        testsWithGenericNames: 0,
        avgDishesPerTest: 0
      };
    }

    const stats = promptStats[result.promptName];
    stats.totalTests++;
    stats.totalDishes += result.dishCount || 0;

    if (result.hasGenericNames) {
      stats.testsWithGenericNames++;
    }
  });

  // Calculate averages and rank
  Object.keys(promptStats).forEach(promptName => {
    const stats = promptStats[promptName];
    stats.avgDishesPerTest = stats.totalDishes / stats.totalTests;
    stats.genericRate = (stats.testsWithGenericNames / stats.totalTests) * 100;
    stats.score = stats.avgDishesPerTest * (1 - stats.genericRate/100); // Penalize generic names
  });

  const rankedPrompts = Object.entries(promptStats)
    .sort(([,a], [,b]) => b.score - a.score);

  rankedPrompts.forEach(([promptName, stats], i) => {
    console.log(`${i + 1}. ${promptName}`);
    console.log(`   Score: ${stats.score.toFixed(2)} (higher = better)`);
    console.log(`   Avg dishes per test: ${stats.avgDishesPerTest.toFixed(1)}`);
    console.log(`   Generic name rate: ${stats.genericRate.toFixed(1)}%`);
    console.log(`   Total dishes extracted: ${stats.totalDishes}\n`);
  });

  console.log('🏆 BEST PROMPT:', rankedPrompts[0][0]);

  return results;
}

// Run if called directly
if (require.main === module) {
  runGPTTests().catch(console.error);
}

module.exports = { runGPTTests, testGPTExtraction, GPT_PROMPTS, SAMPLE_TAVILY_DATA };