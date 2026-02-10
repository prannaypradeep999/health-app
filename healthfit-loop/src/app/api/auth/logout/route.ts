import { NextResponse } from 'next/server';
import { getCurrentUser, deleteSession, clearAuthCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('auth_session')?.value;

    if (sessionId) {
      // Delete session from database
      await deleteSession(sessionId);
    }

    // Clear ALL cookies using both delete() and set() with maxAge: 0 for maximum reliability
    const cookiesToClear = [
      'auth_session',
      'user_id',
      'guest_session',
      'survey_id',
      'meal_plan_id',
      'workout_plan_id'
    ];

    for (const cookieName of cookiesToClear) {
      // Method 1: Delete the cookie
      cookieStore.delete(cookieName);

      // Method 2: Set empty value with maxAge: 0 as backup
      cookieStore.set(cookieName, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0 // Expire immediately
      });
    }

    console.log('[Auth] 🚪 User logged out successfully - cleared all cookies');

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 });
  }
}