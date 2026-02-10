const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugTuesdayMeals() {
  console.log('🔍 Debugging Tuesday Meal Issue...\n');

  // Find the most recent meal plan
  const recentMealPlan = await prisma.mealPlan.findFirst({
    orderBy: { generatedAt: 'desc' },
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

  if (!recentMealPlan) {
    console.log('❌ No meal plans found');
    return;
  }

  console.log(`📋 Most Recent Meal Plan: ${recentMealPlan.id}`);
  console.log(`📅 Week of: ${recentMealPlan.weekOf.toDateString()}`);
  console.log(`🔢 Total meals in DB: ${recentMealPlan.meals.length}\n`);

  // Group meals by day
  const mealsByDay = {};
  recentMealPlan.meals.forEach(meal => {
    if (!mealsByDay[meal.day]) {
      mealsByDay[meal.day] = {};
    }
    mealsByDay[meal.day][meal.mealType] = meal;
  });

  // Check each day's structure
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner'];

  let totalExpectedMeals = 0;
  let totalActualMeals = 0;

  days.forEach(day => {
    console.log(`\n📅 ${day.toUpperCase()}:`);
    mealTypes.forEach(mealType => {
      totalExpectedMeals++;
      if (mealsByDay[day] && mealsByDay[day][mealType]) {
        totalActualMeals++;
        const meal = mealsByDay[day][mealType];
        console.log(`  ✅ ${mealType}: ${meal.options.length} options`);
      } else {
        console.log(`  ❌ ${mealType}: MISSING`);
      }
    });
  });

  console.log(`\n📊 Summary:`);
  console.log(`Expected meals: ${totalExpectedMeals} (7 days × 3 meals)`);
  console.log(`Actual meals: ${totalActualMeals}`);
  console.log(`Missing meals: ${totalExpectedMeals - totalActualMeals}`);

  // Focus on Tuesday
  console.log(`\n🎯 TUESDAY DEEP DIVE:`);
  const tuesdayMeals = mealsByDay['tuesday'];
  if (tuesdayMeals) {
    mealTypes.forEach(mealType => {
      if (tuesdayMeals[mealType]) {
        const meal = tuesdayMeals[mealType];
        console.log(`\n  📝 ${mealType.toUpperCase()}:`);
        console.log(`    Meal ID: ${meal.id}`);
        console.log(`    Options: ${meal.options.length}`);
        console.log(`    Selected: ${meal.selectedOption ? 'Yes' : 'No'}`);

        meal.options.forEach((option, idx) => {
          console.log(`    Option ${idx + 1}: ${option.optionType} - ${option.recipeName || option.dishName || 'Unknown'}`);
        });
      } else {
        console.log(`\n  ❌ ${mealType.toUpperCase()}: NOT FOUND IN DATABASE`);
      }
    });
  } else {
    console.log(`❌ NO TUESDAY DATA FOUND IN DATABASE`);
  }

  // Check restaurant meal counts
  const restaurantMeals = recentMealPlan.meals.filter(meal =>
    meal.options.some(opt => opt.optionType === 'restaurant')
  );
  console.log(`\n🍽️ Restaurant meals in plan: ${restaurantMeals.length}`);

  const homeMeals = recentMealPlan.meals.filter(meal =>
    meal.options.some(opt => opt.optionType === 'home')
  );
  console.log(`🏠 Home meals in plan: ${homeMeals.length}`);
}

debugTuesdayMeals()
  .catch(console.error)
  .finally(() => prisma.$disconnect());