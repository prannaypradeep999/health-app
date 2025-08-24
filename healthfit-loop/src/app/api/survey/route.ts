import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SurveySchema } from '@/lib/schemas';

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

    // Upsert user by email
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, firstName, lastName, profile: { create: {} } },
      update: {
        // keep names synced if provided
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
      },
      select: { id: true },
    });

    // Create survey response with ALL fields
    const survey = await prisma.surveyResponse.create({
      data: {
        userId: user.id,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        age: typeof age === 'number' ? age : null,
        sex: sex ?? null,
        height: height ?? null,
        weight: typeof weight === 'number' ? weight : null,
        zipCode: zipCode ?? null,
        goal, // enum HealthGoal
        activityLevel: activityLevel ?? null,
        budgetTier, // non-null string in schema
        dietPrefs: dietPrefs ?? [],
        mealsOutPerWeek:
          typeof mealsOutPerWeek === 'number' ? mealsOutPerWeek : null,
        biomarkerJson: biomarkers ?? undefined,
        source: source ?? 'web_v2',
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, surveyId: survey.id });
  } catch (err) {
    console.error('[POST /api/survey] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
