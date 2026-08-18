import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('auth_session')?.value;
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

    // The legacy `user_id` cookie branch was removed here. It looked a user up by
    // the raw, unsigned cookie value with no session validation, so supplying any
    // known user ID returned that user's full profile (email, address, body
    // metrics). Identity now comes only from a validated `auth_session`.

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