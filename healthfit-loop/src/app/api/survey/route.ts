import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SurveySchema } from '@/lib/schemas';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const parsed = SurveySchema.safeParse(payload);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Generate or get session ID for guest tracking
    const cookieStore = await cookies();  // ✅ ADD AWAIT
    let sessionId = cookieStore.get('guest_session')?.value;
    
    if (!sessionId) {
      sessionId = nanoid();
    }

    const {
      email,
      firstName,
      lastName,
      age,
      sex,
      height,
      weight,
      zipCode,
      goal,
      activityLevel,
      budgetTier,
      dietPrefs,
      mealsOutPerWeek,
      biomarkers,
      source,
    } = parsed.data;

    // Create guest survey response (not linked to user yet)
    const survey = await prisma.surveyResponse.create({
      data: {
        email: email || '',  // ✅ Provide default
        firstName: firstName || '',  // ✅ Provide default
        lastName: lastName || '',  // ✅ Provide default
        age: age || 0,  // ✅ Provide default
        sex: sex || '',  // ✅ Provide default
        height: height || '',  // ✅ Provide default
        weight: weight || 0,  // ✅ Provide default
        zipCode: zipCode || '',  // ✅ Provide default
        goal,
        activityLevel: activityLevel || '',  // ✅ Provide default
        budgetTier: budgetTier || '',  // ✅ Provide default
        dietPrefs: dietPrefs || [],
        mealsOutPerWeek: mealsOutPerWeek || 0,  // ✅ Provide default
        biomarkerJson: biomarkers || undefined,
        source: source || 'web',
        isGuest: true,
        sessionId,
        userId: null // Explicitly a guest survey
      }
    });

    // Set session cookie for 7 days
    cookieStore.set('guest_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    // Also store survey ID for quick access
    cookieStore.set('survey_id', survey.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    return NextResponse.json({ 
      ok: true, 
      surveyId: survey.id,
      sessionId 
    });
  } catch (err) {
    console.error('[POST /api/survey] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// GET method to fetch survey data
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();  // ✅ ADD AWAIT
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const userId = cookieStore.get('user_id')?.value;

    let survey = null;

    // First check if user is logged in
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      survey = user?.activeSurvey;
    } 
    // Then check for guest survey
    else if (surveyId) {
      survey = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    } 
    // Fallback to session ID
    else if (sessionId) {
      survey = await prisma.surveyResponse.findFirst({
        where: { 
          sessionId,
          isGuest: true 
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!survey) {
      return NextResponse.json({ error: 'No survey found' }, { status: 404 });
    }

    return NextResponse.json({ survey });
  } catch (err) {
    console.error('[GET /api/survey] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}