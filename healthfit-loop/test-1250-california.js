#!/usr/bin/env node

const surveyId = 'demo_1250_1762592488';
const sessionId = 'session_1250_1762592488';

console.log('🧪 Testing meal generation for 1250 California St');
console.log('📋 Survey ID:', surveyId);
console.log('🔐 Session ID:', sessionId);

// First, create the survey data directly
async function createSurveyData() {
  const surveyData = {
    id: surveyId,
    email: 'demo@1250california.com',
    firstName: 'California',
    lastName: 'Demo',
    age: 30,
    sex: 'male',
    height: 72,
    weight: 180,
    streetAddress: '1250 California St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94109',
    country: 'United States',
    goal: 'MUSCLE_GAIN',
    activityLevel: 'MODERATELY_ACTIVE',
    budgetTier: '200_400',
    dietPrefs: [],
    mealsOutPerWeek: 5,
    distancePreference: 'medium',
    preferredCuisines: ['mediterranean', 'italian', 'american', 'asian'],
    preferredFoods: ['chicken', 'salmon', 'quinoa', 'vegetables'],
    isGuest: true,
    sessionId: sessionId,
    source: 'demo'
  };

  console.log('\n📝 Creating survey data...');
  try {
    const response = await fetch('http://localhost:3000/api/survey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(surveyData)
    });

    if (response.ok) {
      console.log('✅ Survey created successfully');
      return true;
    } else {
      const error = await response.text();
      console.log('❌ Survey creation failed:', error);
      return false;
    }
  } catch (error) {
    console.log('❌ Survey creation error:', error.message);
    return false;
  }
}

// Then trigger meal generation
async function triggerMealGeneration() {
  console.log('\n🍽️ Starting meal generation...');
  console.log('⏱️  This should take 1-3 minutes. Watch for these steps:');
  console.log('   1. Restaurant search (30-60 seconds)');
  console.log('   2. Menu extraction via Tavily (1-2 minutes)');
  console.log('   3. Meal plan generation (30 seconds)');
  console.log('   4. Image enhancement (30 seconds)');

  const startTime = Date.now();

  try {
    const response = await fetch('http://localhost:3000/api/ai/meals/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `guest_session=${sessionId}; survey_id=${surveyId}`
      },
      body: JSON.stringify({ forceRegenerate: true })
    });

    const duration = (Date.now() - startTime) / 1000;

    if (response.ok) {
      const result = await response.json();
      console.log(`\n✅ Meal generation completed in ${duration.toFixed(1)} seconds`);
      console.log('📊 Results:', {
        restaurants: result.selectedRestaurants?.length || 0,
        days: result.weeklyMealPlan?.days?.length || 0,
        totalTime: result.timings?.totalTime + 'ms' || 'unknown'
      });
      return result;
    } else {
      console.log(`\n❌ Meal generation failed after ${duration.toFixed(1)} seconds`);
      const error = await response.text();
      console.log('Error:', error);
      return null;
    }
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n❌ Meal generation error after ${duration.toFixed(1)} seconds:`, error.message);
    return null;
  }
}

// Run the test
async function runTest() {
  const surveyCreated = await createSurveyData();
  if (surveyCreated) {
    await triggerMealGeneration();
  }

  console.log('\n🌐 View results at: http://localhost:3000/dashboard');
  console.log('🍪 Cookies should be set automatically');
}

runTest().catch(console.error);