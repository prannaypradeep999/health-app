import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // Clear stale auth cookies
    cookieStore.delete('user_id');
    
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/auth/clear-stale] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
