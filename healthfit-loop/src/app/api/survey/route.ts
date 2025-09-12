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

    const cookieStore = await cookies();
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
      preferredCuisines,
      preferredFoods,
      biomarkers,
      source,
    } = parsed.data;

    const survey = await prisma.surveyResponse.create({
      data: {
        email: email || '',
        firstName: firstName || '',
        lastName: lastName || '',
        age: age || 0,
        sex: sex || '',
        height: height || '',
        weight: weight || 0,
        zipCode: zipCode || '',
        goal,
        activityLevel: activityLevel || '',
        budgetTier: budgetTier || '',
        dietPrefs: dietPrefs || [],
        mealsOutPerWeek: mealsOutPerWeek || 0,
        preferredCuisines: preferredCuisines || [],
        preferredFoods: preferredFoods || [],
        biomarkerJson: biomarkers || undefined,
        source: source || 'web',
        isGuest: true,
        sessionId,
        userId: null
      }
    });

    cookieStore.set('guest_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

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

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    const userId = cookieStore.get('user_id')?.value;

    let survey = null;

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      survey = user?.activeSurvey;
    } 
    else if (surveyId) {
      survey = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    } 
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