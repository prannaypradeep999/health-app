#!/usr/bin/env node

/**
 * Check what survey and meal plan data exists in the database
 */

const { PrismaClient } = require('@prisma/client');

async function checkDemoData() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking existing demo data in database...\n');

    // Check surveys
    const surveys = await prisma.surveyResponse.findMany({
      select: {
        id: true,
        firstName: true,
        streetAddress: true,
        city: true,
        state: true,
        sessionId: true,
        source: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('📋 Recent Survey Responses:');
    surveys.forEach((survey, i) => {
      console.log(`${i + 1}. ${survey.id}`);
      console.log(`   Name: ${survey.firstName}`);
      console.log(`   Address: ${survey.streetAddress}, ${survey.city}, ${survey.state}`);
      console.log(`   Session: ${survey.sessionId}`);
      console.log(`   Source: ${survey.source}`);
      console.log(`   Created: ${survey.createdAt.toISOString()}`);
      console.log('');
    });

    // Check meal plans
    const mealPlans = await prisma.mealPlan.findMany({
      select: {
        id: true,
        surveyId: true,
        userId: true,
        weekOf: true,
        status: true,
        regenerationCount: true,
        createdAt: true,
        _count: {
          select: {
            meals: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('🍽️ Recent Meal Plans:');
    mealPlans.forEach((plan, i) => {
      console.log(`${i + 1}. ${plan.id}`);
      console.log(`   Survey: ${plan.surveyId}`);
      console.log(`   User: ${plan.userId}`);
      console.log(`   Week: ${plan.weekOf.toISOString().split('T')[0]}`);
      console.log(`   Status: ${plan.status}`);
      console.log(`   Meals: ${plan._count.meals}`);
      console.log(`   Regenerated: ${plan.regenerationCount} times`);
      console.log(`   Created: ${plan.createdAt.toISOString()}`);
      console.log('');
    });

    // Check for the specific working survey
    const workingSurvey = await prisma.surveyResponse.findUnique({
      where: { id: 'cmhqch4no000p9kx07xefzpr6' }
    });

    console.log('🎯 Working Survey (cmhqch4no000p9kx07xefzpr6):');
    if (workingSurvey) {
      console.log(`   ✅ Found! Session: ${workingSurvey.sessionId}`);
      console.log(`   Address: ${workingSurvey.streetAddress}, ${workingSurvey.city}`);

      // Check meal plans for this survey
      const relatedMealPlans = await prisma.mealPlan.findMany({
        where: { surveyId: 'cmhqch4no000p9kx07xefzpr6' },
        select: {
          id: true,
          status: true,
          userContext: true,
          _count: {
            select: { meals: true }
          }
        }
      });

      console.log(`   Meal Plans: ${relatedMealPlans.length}`);
      relatedMealPlans.forEach((plan, i) => {
        const hasUserContext = plan.userContext ? 'YES' : 'NO';
        console.log(`   Plan ${i + 1}: ${plan.id} (${plan.status}, ${plan._count.meals} meals, userContext: ${hasUserContext})`);
      });
    } else {
      console.log('   ❌ Not found in database');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDemoData().catch(console.error);