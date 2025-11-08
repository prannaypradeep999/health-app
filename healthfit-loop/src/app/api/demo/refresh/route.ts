import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { surveyId, sessionId } = await request.json();

    // Create response with cookies
    const response = NextResponse.json({
      success: true,
      message: 'Demo session refreshed',
      surveyId,
      sessionId
    });

    // Set cookies in the response
    response.cookies.set('guest_session', sessionId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      httpOnly: false // Allow client-side access
    });

    response.cookies.set('survey_id', surveyId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      httpOnly: false // Allow client-side access
    });

    return response;
  } catch (error) {
    console.error('Failed to refresh demo session:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to refresh demo session'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const guestSession = cookieStore.get('guest_session');
    const surveyId = cookieStore.get('survey_id');

    return NextResponse.json({
      currentSession: {
        guest_session: guestSession?.value || null,
        survey_id: surveyId?.value || null
      }
    });
  } catch (error) {
    console.error('Failed to get demo session:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get demo session'
    }, { status: 500 });
  }
}