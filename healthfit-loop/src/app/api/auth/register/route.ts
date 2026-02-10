import { NextResponse } from 'next/server';
import { createUser, createSession, setAuthCookie, migrateGuestToUser, AuthError } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { email, password, firstName, lastName } = await request.json();

    // Validate input
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Create user
    const user = await createUser({
      email,
      password,
      firstName,
      lastName
    });

    // Create session
    const sessionId = await createSession(user.id);

    // Set auth cookie
    await setAuthCookie(sessionId);

    // ========== Always migrate guest data if it exists ==========
    const cookieStore = await cookies();
    const guestSessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    if (guestSessionId || surveyId) {
      console.log(`[AUTH] 🔗 Auto-migrating guest data for new user: ${user.email} (guestSession=${guestSessionId}, survey=${surveyId})`);
      await migrateGuestToUser(sessionId, user.id);

      cookieStore.delete('guest_session');
      cookieStore.delete('survey_id');
    }

    if (!user.id) {
      console.error(`[AUTH] ❌ CRITICAL: user.id is undefined/null for email: ${email}`);
      throw new Error('User ID is missing after registration');
    }
    cookieStore.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60
    });
    console.log(`[AUTH] 🍪 Set cookies: user_id=${user.id}, session_id=${sessionId} (maxAge: 30d)`);
    // ============================================================

    console.log(`[AUTH] 🔑 User registration successful: userId=${user.id}, email=${user.email}`);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });

  } catch (error) {
    console.error('[Auth] Registration error:', error);

    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'USER_EXISTS' ? 409 : 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}