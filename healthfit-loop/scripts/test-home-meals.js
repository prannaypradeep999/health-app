#!/usr/bin/env node
/**
 * Test script for home meal generation API
 * Usage: node scripts/test-home-meals.js
 */

const fetch = require('node-fetch');

async function testHomeMealGeneration() {
  console.log('🧪 Testing home meal generation API...');

  const url = 'http://localhost:3000/api/ai/meals/generate-home';

  const testBody = {
    backgroundGeneration: true,
    mealPlanId: "cmlga2d7q00039kfawb3y4rod",
    restaurantCalories: [
      { "day": "friday", "mealType": "lunch", "calories": 700 },
      { "day": "monday", "mealType": "lunch", "calories": 700 },
      { "day": "sunday", "mealType": "dinner", "calories": 700 },
      { "day": "tuesday", "mealType": "lunch", "calories": 350 },
      { "day": "saturday", "mealType": "dinner", "calories": 600 },
      { "day": "thursday", "mealType": "lunch", "calories": 350 },
      { "day": "wednesday", "mealType": "lunch", "calories": 480 }
    ]
  };

  const testHeaders = {
    'Content-Type': 'application/json',
    'Cookie': 'session_id=oQKmiaRmDkZYGA6sBTxaH; survey_id=cmlga261q00019kfaw3s8t9ie; meal_plan_id=cmlga2d7q00039kfawb3y4rod'
  };

  try {
    console.log('📤 Sending request to:', url);
    console.log('📋 Request body:', JSON.stringify(testBody, null, 2));

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify(testBody)
    });
    const elapsed = Date.now() - startTime;

    console.log(`📊 Response status: ${response.status} (${elapsed}ms)`);
    console.log('📊 Response headers:', Object.fromEntries(response.headers));

    const responseText = await response.text();
    console.log('📝 Response length:', responseText.length, 'characters');

    try {
      const responseJson = JSON.parse(responseText);
      console.log('✅ Response parsed as JSON');
      console.log('📋 Response structure:', Object.keys(responseJson));

      if (responseJson.success) {
        console.log('✅ SUCCESS!');
        console.log(`📊 Generated ${responseJson.workoutPlan?.homeMeals?.length || 0} home meals`);
        console.log(`🛒 Grocery categories: ${Object.keys(responseJson.workoutPlan?.groceryList || {}).join(', ')}`);
      } else {
        console.log('❌ FAILED:', responseJson.error);
        console.log('📋 Details:', responseJson.details);
      }

    } catch (parseError) {
      console.log('❌ Response is not valid JSON');
      console.log('📝 Raw response (first 1000 chars):', responseText.substring(0, 1000));
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('📋 Error details:', error);
  }
}

// Run the test
testHomeMealGeneration().catch(console.error);