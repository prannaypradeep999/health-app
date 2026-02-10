const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Get the meal plan with planData
    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: 'cmlfa135a00039kkhr94uy5we' },
      select: {
        id: true,
        status: true,
        planData: true,
        userContext: true
      }
    });

    if (!mealPlan) {
      console.log('❌ Meal plan not found');
      return;
    }

    console.log(`📊 Meal Plan: ${mealPlan.id}`);
    console.log(`Status: ${mealPlan.status}`);

    // Check if planData exists and has structure
    if (mealPlan.planData) {
      console.log('\n📋 Plan Data Structure:');
      const planData = mealPlan.planData;

      console.log('Top level keys:', Object.keys(planData));

      // Check for days structure
      if (planData.days) {
        console.log('\n📅 Days structure found');
        console.log('Days keys:', Object.keys(planData.days));

        // Check Tuesday specifically
        if (planData.days.tuesday) {
          console.log('\n🔍 TUESDAY in planData:');
          console.log('Tuesday structure:', Object.keys(planData.days.tuesday));

          const tuesday = planData.days.tuesday;

          if (tuesday.breakfast) {
            console.log(`Breakfast options: ${Array.isArray(tuesday.breakfast) ? tuesday.breakfast.length : 'Not array'}`);
          } else {
            console.log('❌ No breakfast in Tuesday planData');
          }

          if (tuesday.lunch) {
            console.log(`Lunch options: ${Array.isArray(tuesday.lunch) ? tuesday.lunch.length : 'Not array'}`);
          } else {
            console.log('❌ No lunch in Tuesday planData');
          }

          if (tuesday.dinner) {
            console.log(`Dinner options: ${Array.isArray(tuesday.dinner) ? tuesday.dinner.length : 'Not array'}`);
          } else {
            console.log('❌ No dinner in Tuesday planData');
          }
        } else {
          console.log('❌ No tuesday found in planData.days');
        }

        // Count all meals in planData
        let totalMealsInPlan = 0;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const mealTypes = ['breakfast', 'lunch', 'dinner'];

        console.log('\n📊 All days meal counts:');
        days.forEach(day => {
          if (planData.days[day]) {
            const dayData = planData.days[day];
            let dayTotal = 0;

            mealTypes.forEach(mealType => {
              const count = Array.isArray(dayData[mealType]) ? dayData[mealType].length : 0;
              dayTotal += count;
            });

            console.log(`${day}: ${dayTotal} total meals`);
            totalMealsInPlan += dayTotal;

            // Show details for days with missing meals
            if (dayTotal < 3) {
              console.log(`  ⚠️  ${day} is missing meals:`);
              mealTypes.forEach(mealType => {
                const count = Array.isArray(dayData[mealType]) ? dayData[mealType].length : 0;
                if (count === 0) {
                  console.log(`    - Missing ${mealType}`);
                }
              });
            }
          } else {
            console.log(`${day}: ❌ Day not found in planData`);
          }
        });

        console.log(`\nTotal meals in planData: ${totalMealsInPlan}`);

      } else {
        console.log('❌ No days structure in planData');
        console.log('planData content:', JSON.stringify(planData, null, 2).substring(0, 500) + '...');
      }

    } else {
      console.log('❌ No planData found');
    }

    // Also check userContext
    if (mealPlan.userContext) {
      console.log('\n👤 User Context keys:', Object.keys(mealPlan.userContext));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();