const fetch = require('node-fetch');

async function testGoalReasoning() {
  try {
    console.log('🧪 Testing meal generation with goalReasoning...');

    const response = await fetch('http://localhost:3000/api/ai/meals/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'surveyId=demo_test; sessionId=test_session_goal_reasoning'
      },
      body: JSON.stringify({
        surveyData: {
          firstName: 'TestUser',
          goal: 'lose weight',
          age: 30,
          gender: 'female',
          height: 165,
          weight: 70,
          activityLevel: 'moderately active',
          mealsOutPerWeek: 2,
          zipCode: '90210'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    console.log('\n✅ Response received. Checking for goalReasoning fields...');

    // Check if the meal plan has goalReasoning in the options
    if (result.mealPlan && result.mealPlan.meals) {
      let goalReasoningFound = 0;
      let totalOptions = 0;

      result.mealPlan.meals.forEach(meal => {
        meal.options.forEach(option => {
          totalOptions++;
          if (option.goalReasoning) {
            goalReasoningFound++;
            console.log(`\n🎯 Found goalReasoning for ${meal.mealType} option ${option.optionNumber}:`);
            console.log(`   "${option.goalReasoning}"`);
          }
        });
      });

      console.log(`\n📊 Results:`);
      console.log(`   Total meal options: ${totalOptions}`);
      console.log(`   Options with goalReasoning: ${goalReasoningFound}`);
      console.log(`   Coverage: ${Math.round((goalReasoningFound / totalOptions) * 100)}%`);

      if (goalReasoningFound === totalOptions) {
        console.log('   ✅ All options have goalReasoning!');
      } else if (goalReasoningFound > 0) {
        console.log('   ⚠️  Some options missing goalReasoning');
      } else {
        console.log('   ❌ No goalReasoning found');
      }

    } else {
      console.log('❌ No meal plan found in response');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testGoalReasoning();