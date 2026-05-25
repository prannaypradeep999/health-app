import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

async function getIdentifiers() {
  const cookieStore = await cookies();
  return {
    userId: cookieStore.get('user_id')?.value || null,
    surveyId: cookieStore.get('survey_id')?.value || null,
  };
}

export async function GET() {
  const { userId, surveyId } = await getIdentifiers();
  const customs = await prisma.userCustomWorkout.findMany({
    where: {
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(surveyId ? [{ surveyId }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ customs });
}

export async function POST(req: NextRequest) {
  const { userId, surveyId } = await getIdentifiers();
  const { name, notes, exercises } = await req.json();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const custom = await prisma.userCustomWorkout.create({
    data: { userId, surveyId, name, notes: notes || null, exercises: exercises || [] },
  });
  return NextResponse.json({ success: true, custom });
}

export async function PUT(req: NextRequest) {
  const { id, name, notes, exercises } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  const custom = await prisma.userCustomWorkout.update({
    where: { id },
    data: { name, notes, exercises },
  });
  return NextResponse.json({ success: true, custom });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.userCustomWorkout.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
