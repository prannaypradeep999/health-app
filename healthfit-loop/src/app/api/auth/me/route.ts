import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('auth_session')?.value;
    const userId = cookieStore.get('user_id')?.value;
    const guestSession = cookieStore.get('guest_session')?.value;

    // Check for authenticated user
    if (sessionId) {
      const session = await prisma.userSession.findUnique({
        where: { sessionId },
        include: {
          user: {
            include: {
              activeSurvey: true
            }
          }
        }
      });

      if (session && session.expiresAt > new Date()) {
        return NextResponse.json({
          authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
            firstName: session.user.firstName,
            lastName: session.user.lastName,
            activeSurveyId: session.user.activeSurveyId,
            activeSurvey: session.user.activeSurvey
          }
        });
      }
    }

    // Check for user_id cookie (legacy)
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });

      if (user) {
        return NextResponse.json({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            activeSurveyId: user.activeSurveyId,
            activeSurvey: user.activeSurvey
          }
        });
      }
    }

    // Check for guest session
    if (guestSession) {
      const survey = await prisma.surveyResponse.findFirst({
        where: { sessionId: guestSession }
      });

      if (survey) {
        return NextResponse.json({
          authenticated: false,
          guestSession: true,
          survey: {
            id: survey.id,
            firstName: survey.firstName,
            email: survey.email
          }
        });
      }
    }

    return NextResponse.json({
      authenticated: false,
      guestSession: false
    });

  } catch (error) {
    console.error('[AUTH/ME] Error:', error);
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
  }
}