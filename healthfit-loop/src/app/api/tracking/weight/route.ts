import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { surveyId, weight, unit = 'lbs', notes } = await req.json();

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;

    if (!surveyId || !weight) {
      return NextResponse.json({ error: 'surveyId and weight required' }, { status: 400 });
    }

    const weightLog = await prisma.weightLog.create({
      data: {
        userId: userId || null,
        surveyId,
        weight: parseFloat(weight),
        unit,
        notes
      }
    });

    console.log(`[WEIGHT-LOG] Logged ${weight} ${unit}`);

    return NextResponse.json({ success: true, weightLog });

  } catch (error) {
    console.error('[WEIGHT-LOG] Error:', error);
    return NextResponse.json({ error: 'Failed to log weight' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const surveyId = searchParams.get('surveyId');
    const limit = parseInt(searchParams.get('limit') || '30');

    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId required' }, { status: 400 });
    }

    const weightLogs = await prisma.weightLog.findMany({
      where: { surveyId },
      orderBy: { loggedAt: 'desc' },
      take: limit
    });

    return NextResponse.json({
      success: true,
      weightLogs,
      latest: weightLogs[0] || null,
      oldest: weightLogs[weightLogs.length - 1] || null
    });

  } catch (error) {
    console.error('[WEIGHT-LOG] GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    await prisma.weightLog.delete({ where: { id } });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[WEIGHT-LOG] DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}