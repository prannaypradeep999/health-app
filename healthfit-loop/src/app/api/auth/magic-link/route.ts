import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    console.log(`[Magic Link API] Processing token: ${token}`);

    // Look up survey by ID
    const survey = await prisma.surveyResponse.findUnique({
      where: { id: token },
      select: {
        id: true,
        sessionId: true,
        firstName: true,
        email: true
      }
    });

    if (!survey) {
      console.log(`[Magic Link API] ❌ Survey not found for token: ${token}`);
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    console.log(`[Magic Link API] ✅ Survey found: ${survey.firstName} (${survey.email})`);

    // Create response with cookies set
    const response = NextResponse.json({
      success: true,
      message: 'Magic link processed successfully',
      surveyId: survey.id
    });

    // Set survey_id cookie
    response.cookies.set('survey_id', survey.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    });

    // Set guest_session cookie if survey has sessionId
    if (survey.sessionId) {
      response.cookies.set('guest_session', survey.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/'
      });
    }

    // If this survey belongs to a registered user, issue a real session.
    // Previously this set an unsigned `user_id` cookie with no session row, which
    // meant identity could be forged by supplying any known user ID. Sessions are
    // validated against the database and expire, so they cannot be forged.
    const surveyWithUser = await prisma.surveyResponse.findUnique({
      where: { id: survey.id },
      select: { userId: true }
    });

    if (surveyWithUser?.userId) {
      const sessionId = await createSession(surveyWithUser.userId);

      response.cookies.set('auth_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/'
      });
      console.log(`[Magic Link API] 🔐 Created session for user: ${surveyWithUser.userId}`);
    }

    console.log(`[Magic Link API] ✅ Cookies set for survey: ${survey.id}`);

    return response;

  } catch (error) {
    console.error('[Magic Link API] ❌ Error processing magic link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}