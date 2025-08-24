import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createToken, setAuthCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { activeSurvey: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create JWT token
    const token = await createToken(user.id);
    
    // Set auth cookie
    await setAuthCookie(token);  // ✅ ADD AWAIT
    
    // Set user_id cookie for quick access
    const cookieStore = await cookies();  // ✅ ADD AWAIT
    cookieStore.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    // Clear any guest cookies
    cookieStore.delete('guest_session');
    cookieStore.delete('survey_id');

    return NextResponse.json({ 
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        hasSurvey: !!user.activeSurvey
      }
    });
  } catch (err) {
    console.error('[POST /api/auth/login] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}