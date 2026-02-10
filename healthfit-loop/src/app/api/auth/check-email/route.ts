import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email exists in User table
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    });

    if (existingUser) {
      return NextResponse.json({ exists: true });
    }

    // Check if email exists in SurveyResponse table
    const existingSurveyResponse = await prisma.surveyResponse.findFirst({
      where: { email: normalizedEmail },
      select: { id: true }
    });

    if (existingSurveyResponse) {
      return NextResponse.json({ exists: true });
    }

    // Email doesn't exist
    return NextResponse.json({ exists: false });

  } catch (error) {
    console.error('Email check error:', error);
    // Graceful degradation - if DB check fails, allow them to proceed
    return NextResponse.json({ exists: false });
  }
}