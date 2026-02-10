import { NextResponse } from 'next/server';
import { authenticateUser, createSession, setAuthCookie, migrateGuestToUser, AuthError } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Authenticate user
    const user = await authenticateUser(email, password);

    // Create session
    const sessionId = await createSession(user.id);

    // Set auth cookie
    await setAuthCookie(sessionId);

    // Set user_id cookie for backward compatibility
    const cookieStore = await cookies();
    if (!user.id) {
      console.error(`[AUTH] ❌ CRITICAL: user.id is undefined/null for email: ${email}`);
      throw new Error('User ID is missing after authentication');
    }
    cookieStore.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });
    console.log(`[AUTH] 🍪 Set cookies: user_id=${user.id}, session_id=${sessionId} (maxAge: 30d)`);

    // ========== Migrate guest data BEFORE clearing cookies ==========
    const guestSessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    if (guestSessionId || surveyId) {
      console.log(`[AUTH] 🔗 Migrating guest data for user: ${user.email} (guestSession=${guestSessionId}, survey=${surveyId})`);
      await migrateGuestToUser(sessionId, user.id);
    }
    // =================================================================

    // Clear guest cookies AFTER migration
    cookieStore.delete('guest_session');
    cookieStore.delete('survey_id');

    console.log(`[AUTH] 🔑 User login successful: userId=${user.id}, email=${user.email}`);

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
    console.error('[Auth] Login error:', error);

    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to sign in' },
      { status: 500 }
    );
  }
}