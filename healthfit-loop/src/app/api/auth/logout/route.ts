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

    // Clear auth cookies
    await clearAuthCookie();
    cookieStore.delete('user_id');

    console.log('[Auth] User logged out successfully');

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 });
  }
}