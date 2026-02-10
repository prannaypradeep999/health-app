const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Get the specific meal plan that's having issues
    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: 'cmlfa135a00039kkhr94uy5we' },
      include: {
        meals: {
          include: {
            options: {
              select: {
                id: true,
                optionNumber: true,
                optionType: true,
                dishName: true,
                restaurantName: true,
                calories: true
              }
            }
          },
          orderBy: [
            { day: 'asc' },
            { mealType: 'asc' }
          ]
        }
      }
    });

    if (!mealPlan) {
      console.log('❌ Meal plan not found');
      return;
    }

    console.log(`📊 Meal Plan: ${mealPlan.id}`);
    console.log(`Status: ${mealPlan.status}`);
    console.log(`Week of: ${mealPlan.weekOf}`);
    console.log(`Total meals in DB: ${mealPlan.meals.length}`);

    // Group meals by day and meal type
    const dayStructure = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const mealTypes = ['breakfast', 'lunch', 'dinner'];

    // Initialize structure
    days.forEach(day => {
      dayStructure[day] = {};
      mealTypes.forEach(mealType => {
        dayStructure[day][mealType] = [];
      });
    });

    // Populate with actual data
    mealPlan.meals.forEach(meal => {
      if (dayStructure[meal.day] && dayStructure[meal.day][meal.mealType] !== undefined) {
        dayStructure[meal.day][meal.mealType] = meal.options;
      }
    });

    // Analyze each day
    console.log('\n📅 Day-by-day analysis:');
    days.forEach(day => {
      const dayData = dayStructure[day];
      const breakfastCount = dayData.breakfast.length;
      const lunchCount = dayData.lunch.length;
      const dinnerCount = dayData.dinner.length;

      console.log(`\n${day.toUpperCase()}:`);
      console.log(`  Breakfast: ${breakfastCount} options`);
      console.log(`  Lunch: ${lunchCount} options`);
      console.log(`  Dinner: ${dinnerCount} options`);

      // Show details for Tuesday specifically
      if (day === 'tuesday') {
        console.log('\n🔍 TUESDAY DETAILED ANALYSIS:');

        if (breakfastCount === 0) {
          console.log('  ❌ BREAKFAST MISSING');
        } else {
          console.log('  ✅ Breakfast options:');
          dayData.breakfast.forEach(opt => {
            console.log(`    - ${opt.dishName || opt.restaurantName || 'Unknown'} (${opt.optionType})`);
          });
        }

        if (lunchCount === 0) {
          console.log('  ❌ LUNCH MISSING');
        } else {
          console.log('  ✅ Lunch options:');
          dayData.lunch.forEach(opt => {
            console.log(`    - ${opt.dishName || opt.restaurantName || 'Unknown'} (${opt.optionType})`);
          });
        }

        if (dinnerCount === 0) {
          console.log('  ❌ DINNER MISSING');
        } else {
          console.log('  ✅ Dinner options:');
          dayData.dinner.forEach(opt => {
            console.log(`    - ${opt.dishName || opt.restaurantName || 'Unknown'} (${opt.optionType})`);
          });
        }
      }

      // Check for missing meals
      if (breakfastCount === 0 || lunchCount === 0 || dinnerCount === 0) {
        console.log(`  ⚠️  MISSING MEALS DETECTED!`);
      }
    });

    // Count totals
    let totalMeals = 0;
    let restaurantMeals = 0;
    let homeMeals = 0;

    days.forEach(day => {
      mealTypes.forEach(mealType => {
        const options = dayStructure[day][mealType];
        totalMeals += options.length;

        options.forEach(opt => {
          if (opt.optionType === 'restaurant') {
            restaurantMeals++;
          } else if (opt.optionType === 'home') {
            homeMeals++;
          }
        });
      });
    });

    console.log(`\n📊 TOTALS:`);
    console.log(`Total meal options: ${totalMeals}`);
    console.log(`Restaurant meals: ${restaurantMeals}`);
    console.log(`Home meals: ${homeMeals}`);
    console.log(`Expected total: 21 (7 days × 3 meals)`);
    console.log(`Missing: ${21 - totalMeals} meal slots`);

    // Check the planData JSON for additional context
    if (mealPlan.planData) {
      console.log('\n📋 Plan Data Keys:', Object.keys(mealPlan.planData));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();