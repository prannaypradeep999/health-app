import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

    // Check if this survey is linked to a user and set user_id cookie if so
    const surveyWithUser = await prisma.surveyResponse.findUnique({
      where: { id: survey.id },
      select: { userId: true }
    });

    if (surveyWithUser?.userId) {
      if (!surveyWithUser.userId) {
        console.error(`[Magic Link API] ❌ CRITICAL: surveyWithUser.userId is undefined/null for survey: ${survey.id}`);
      } else {
        response.cookies.set('user_id', surveyWithUser.userId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60, // 30 days
          path: '/'
        });
        console.log(`[Magic Link API] 🍪 Set user_id cookie: ${surveyWithUser.userId}`);
      }
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