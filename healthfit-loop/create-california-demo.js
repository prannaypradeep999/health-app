#!/usr/bin/env node

/**
 * Create a fresh demo for 1244 California St, San Francisco 94109
 * This will create new survey data and generate a fresh meal plan
 */

const baseUrl = 'http://localhost:3000';

function generateUniqueId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `demo_${timestamp}_${random}`;
}

async function createCaliforniaStDemo() {
  const surveyId = generateUniqueId();
  const sessionId = generateUniqueId();

  console.log('🏢 Creating demo for 1244 California St, San Francisco 94109');
  console.log('📋 Survey ID:', surveyId);
  console.log('🔐 Session ID:', sessionId);

  // Step 1: Create survey data
  const surveyData = {
    id: surveyId,
    email: 'demo@1244california.com',
    firstName: 'California',
    lastName: 'Demo',
    age: 30,
    sex: 'male',
    height: 72, // 6 feet
    weight: 180, // lbs
    streetAddress: '1244 California St', // Your specified address
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94109', // Nob Hill area
    country: 'United States',
    goal: 'MUSCLE_GAIN',
    activityLevel: 'MODERATELY_ACTIVE',
    budgetTier: '200_400', // Mid-tier budget
    dietPrefs: [],
    mealsOutPerWeek: 5,
    distancePreference: 'medium',
    preferredCuisines: ['mediterranean', 'italian', 'american', 'asian', 'mexican'],
    preferredFoods: ['chicken', 'salmon', 'quinoa', 'vegetables', 'lean_beef'],
    isGuest: true,
    sessionId: sessionId,
    source: 'demo'
  };

  console.log('\n1️⃣ Creating survey data...');
  try {
    const surveyResponse = await fetch(`${baseUrl}/api/survey`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(surveyData),
    });

    if (surveyResponse.ok) {
      console.log('✅ Survey data created successfully');
    } else {
      const errorText = await surveyResponse.text();
      console.log('❌ Survey creation failed:', errorText);
    }
  } catch (error) {
    console.log('❌ Error creating survey:', error.message);
  }

  console.log('\n2️⃣ Demo URL with fresh data:');
  const demoUrl = `${baseUrl}/demo-california?surveyId=${surveyId}&sessionId=${sessionId}`;
  console.log('🌐', demoUrl);

  console.log('\n3️⃣ Direct meal generation test URL:');
  const mealGenUrl = `${baseUrl}/api/ai/meals/generate`;
  console.log('🍽️ POST to:', mealGenUrl);
  console.log('📝 With cookies: guest_session=' + sessionId + '; survey_id=' + surveyId);

  console.log('\n4️⃣ Opening demo in browser...');
  const { exec } = require('child_process');
  exec(`open "${demoUrl}"`, (error) => {
    if (error) {
      console.log('❌ Could not open browser automatically');
      console.log('🔗 Please manually open:', demoUrl);
    } else {
      console.log('✅ Demo opened in browser');
    }
  });

  console.log('\n📊 What to watch for:');
  console.log('- Server logs should show "CACHING DISABLED" message');
  console.log('- New files in logs/ directory with current timestamp');
  console.log('- Restaurants near 1244 California St (Nob Hill area)');
  console.log('- Fresh meal plan generation (will take 1-2 minutes)');

  return { surveyId, sessionId, demoUrl };
}

// Run the demo creation
createCaliforniaStDemo().catch(console.error);