/*
Validates the incoming JSON with your Zod schema
Upserts a User by email (temporary “auth” for Stage 1)
Inserts a new SurveyResponse row
Returns { ok: true, surveyId } on success
*/

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SurveySchema } from '@/lib/schemas';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // Validate input
    const parsed = SurveySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, goal, budgetTier, dietPrefs, biomarkers, source } = parsed.data;

    // Upsert user by email (we’ll replace this with real auth later)
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, profile: { create: {} } },
      update: {},
      select: { id: true },
    });

    // Create survey response
    const survey = await prisma.surveyResponse.create({
      data: {
        userId: user.id,
        goal,
        budgetTier,
        dietPrefs,
        biomarkerJson: biomarkers ?? undefined,
        source: source ?? 'web_v1',
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, surveyId: survey.id });
  } catch (err) {
    console.error('[POST /api/survey] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
