const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugSpecificPlan() {
  console.log('🔍 Debugging Specific Meal Plan from Logs...\n');

  // Check the specific meal plan from the logs: cmlfb0b73000y9kkh3y3fmb8x
  const mealPlan = await prisma.mealPlan.findUnique({
    where: { id: 'cmlfb0b73000y9kkh3y3fmb8x' },
    include: {
      meals: {
        include: {
          options: true,
          selectedOption: true
        },
        orderBy: [
          { day: 'asc' },
          { mealType: 'asc' }
        ]
      }
    }
  });

  if (!mealPlan) {
    console.log('❌ Meal plan cmlfb0b73000y9kkh3y3fmb8x not found');
    return;
  }

  console.log(`📋 Meal Plan: ${mealPlan.id}`);
  console.log(`📅 Week of: ${mealPlan.weekOf.toDateString()}`);
  console.log(`⚡ Status: ${mealPlan.status}`);
  console.log(`🔢 Total meals in DB: ${mealPlan.meals.length}`);
  console.log(`📝 User Context Keys: ${Object.keys(mealPlan.userContext || {})}`);

  console.log('\n🕒 Generation Timeline:');
  console.log(`Started: ${mealPlan.generationStarted}`);
  console.log(`Completed: ${mealPlan.generationEnded || 'Still running?'}`);

  // Check if generation is still in progress
  if (mealPlan.status === 'partial' && !mealPlan.generationEnded) {
    console.log('\n⚠️  ISSUE IDENTIFIED: Generation appears to be stuck in "partial" status');
    console.log('This explains why meals are empty - the generation never completed!');
  }

  // Group meals by day
  const mealsByDay = {};
  mealPlan.meals.forEach(meal => {
    if (!mealsByDay[meal.day]) {
      mealsByDay[meal.day] = {};
    }
    mealsByDay[meal.day][meal.mealType] = meal;
  });

  console.log('\n📅 Days Analysis:');
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner'];

  days.forEach(day => {
    console.log(`\n${day.toUpperCase()}:`);
    mealTypes.forEach(mealType => {
      if (mealsByDay[day] && mealsByDay[day][mealType]) {
        const meal = mealsByDay[day][mealType];
        console.log(`  ✅ ${mealType}: ${meal.options.length} options`);
      } else {
        console.log(`  ❌ ${mealType}: MISSING`);
      }
    });
  });

  // Look for any other meal plans for the same survey
  const allPlans = await prisma.mealPlan.findMany({
    where: { surveyId: 'cmlfb04tb000w9kkhnn2ckcbe' },
    orderBy: { generatedAt: 'desc' },
    take: 5
  });

  console.log(`\n📊 All meal plans for this survey:`);
  allPlans.forEach((plan, idx) => {
    console.log(`  ${idx + 1}. ${plan.id} - Status: ${plan.status} - Generated: ${plan.generatedAt.toISOString()}`);
  });
}

debugSpecificPlan()
  .catch(console.error)
  .finally(() => prisma.$disconnect());