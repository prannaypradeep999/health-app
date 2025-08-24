import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createToken, setAuthCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { email, password, linkSurvey } = await req.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Get guest survey if exists
    const cookieStore = await cookies();  // ✅ ADD AWAIT
    const surveyId = cookieStore.get('survey_id')?.value;
    let guestSurvey = null;

    if (linkSurvey && surveyId) {
      guestSurvey = await prisma.surveyResponse.findUnique({
        where: { 
          id: surveyId,
          isGuest: true 
        }
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user and link survey if exists
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: guestSurvey?.firstName || email.split('@')[0],
        lastName: guestSurvey?.lastName || '',
        activeSurveyId: guestSurvey?.id
      }
    });

    // Update survey to link it to user
    if (guestSurvey) {
      await prisma.surveyResponse.update({
        where: { id: guestSurvey.id },
        data: {
          userId: user.id,
          isGuest: false
        }
      });
    }

    // Create JWT token
    const token = await createToken(user.id);
    
    // Set auth cookie
    await setAuthCookie(token);  // ✅ ADD AWAIT if setAuthCookie uses cookies()
    
    // Set user_id cookie for quick access
    cookieStore.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    // Clear guest cookies
    cookieStore.delete('guest_session');
    cookieStore.delete('survey_id');

    return NextResponse.json({ 
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (err) {
    console.error('[POST /api/auth/register] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}