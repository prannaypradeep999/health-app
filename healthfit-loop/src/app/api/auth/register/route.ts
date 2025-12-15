import { NextResponse } from 'next/server';
import { createUser, createSession, setAuthCookie, migrateGuestToUser, AuthError } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password, firstName, lastName, preserveGuestData } = await request.json();

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

    // Migrate any guest data if requested
    if (preserveGuestData) {
      await migrateGuestToUser(sessionId, user.id);
      console.log(`[Auth] Guest data migrated for user: ${user.email}`);
    }

    console.log(`[Auth] User registered successfully: ${user.email}`);

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