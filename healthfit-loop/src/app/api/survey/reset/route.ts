import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * Survey Reset API Route
 *
 * CHANGES MADE:
 * - Added support for guest session reset
 * - Clear all related data including meal plans and generated content
 * - Comprehensive cookie cleanup
 */

export async function POST() {
  try {
    const cookieStore = await cookies();
    const user = await getCurrentUser();
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    console.log('[Survey Reset] Starting reset process...', {
      hasUser: !!user,
      hasSession: !!sessionId,
      hasSurveyId: !!surveyId
    });

    // Handle authenticated user reset
    if (user) {
      console.log(`[Survey Reset] Resetting for authenticated user ${user.id}`);

      // Find user's current survey to clean up related data
      const currentSurvey = await prisma.user.findUnique({
        where: { id: user.id },
        include: { activeSurvey: true }
      });

      if (currentSurvey?.activeSurvey) {
        // Delete related meal plans and generated content
        await prisma.mealPlan.deleteMany({
          where: { surveyId: currentSurvey.activeSurvey.id }
        });
        console.log(`[Survey Reset] Deleted meal plans for survey ${currentSurvey.activeSurvey.id}`);
      }

      // Clear active survey reference
      await prisma.user.update({
        where: { id: user.id },
        data: { activeSurveyId: null }
      });

      console.log(`[Survey Reset] ✅ Cleared active survey for user ${user.id}`);
    }

    // Handle guest session reset
    if (sessionId) {
      console.log(`[Survey Reset] Resetting for guest session ${sessionId}`);

      // Find and delete guest surveys and related data
      const guestSurveys = await prisma.surveyResponse.findMany({
        where: {
          sessionId: sessionId,
          isGuest: true
        }
      });

      for (const survey of guestSurveys) {
        // Delete related meal plans
        await prisma.mealPlan.deleteMany({
          where: { surveyId: survey.id }
        });
      }

      // Delete the guest surveys themselves
      await prisma.surveyResponse.deleteMany({
        where: {
          sessionId: sessionId,
          isGuest: true
        }
      });

      console.log(`[Survey Reset] ✅ Deleted ${guestSurveys.length} guest surveys and related data`);
    }

    // Handle orphaned survey by ID
    if (surveyId && !user && !sessionId) {
      console.log(`[Survey Reset] Cleaning up orphaned survey ${surveyId}`);

      // Delete related meal plans
      await prisma.mealPlan.deleteMany({
        where: { surveyId: surveyId }
      });

      // Delete the survey if it's a guest survey
      await prisma.surveyResponse.deleteMany({
        where: {
          id: surveyId,
          isGuest: true
        }
      });

      console.log(`[Survey Reset] ✅ Cleaned up orphaned survey ${surveyId}`);
    }

    // Comprehensive cookie cleanup
    const cookiesToClear = [
      'survey_id',
      'guest_session',
      'user_id',
      'meal_plan_id',
      'dashboard_data',
      'grocery_list'
    ];

    cookiesToClear.forEach(cookieName => {
      cookieStore.delete(cookieName);
    });

    console.log(`[Survey Reset] ✅ Cleared ${cookiesToClear.length} cookies`);

    return NextResponse.json({
      success: true,
      message: 'Survey and all related data have been reset successfully'
    });

  } catch (error) {
    console.error('[Survey Reset] ❌ Error:', error);
    return NextResponse.json({
      error: 'Failed to reset survey',
      details: (error as Error).message
    }, { status: 500 });
  }
}