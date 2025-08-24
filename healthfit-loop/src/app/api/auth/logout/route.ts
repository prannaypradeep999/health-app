import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth';

export async function POST() {
  try {
    clearAuthCookies();
    
    return NextResponse.json({ 
      ok: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    console.error('[POST /api/auth/logout] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}