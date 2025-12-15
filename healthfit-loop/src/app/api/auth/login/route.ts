import { NextResponse } from 'next/server';
import { authenticateUser, createSession, setAuthCookie, AuthError } from '@/lib/auth';
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
    cookieStore.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    // Clear any guest cookies
    cookieStore.delete('guest_session');
    cookieStore.delete('survey_id');

    console.log(`[Auth] User logged in successfully: ${user.email}`);

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