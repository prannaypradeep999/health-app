import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

async function getIdentifiers() {
  const cookieStore = await cookies();
  return {
    userId: cookieStore.get('user_id')?.value ?? null,
    surveyId: cookieStore.get('survey_id')?.value ?? null,
  };
}

export async function GET() {
  try {
    const { userId, surveyId } = await getIdentifiers();
    const userFilter = [
      ...(userId ? [{ userId }] : []),
      ...(surveyId ? [{ surveyId }] : []),
    ];
    if (userFilter.length === 0) return NextResponse.json({ favoriteIds: [] });

    const favorites = await prisma.userExerciseFavorite.findMany({
      where: { OR: userFilter },
      select: { exerciseLibraryId: true },
    });

    return NextResponse.json({ favoriteIds: favorites.map(f => f.exerciseLibraryId) });
  } catch (error) {
    console.error('[FAVORITES GET] Error:', error);
    return NextResponse.json({ favoriteIds: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, surveyId } = await getIdentifiers();
    if (!userId && !surveyId) {
      return NextResponse.json({ error: 'Not identified' }, { status: 401 });
    }

    const { exerciseLibraryId } = await req.json();
    if (!exerciseLibraryId) {
      return NextResponse.json({ error: 'Missing exerciseLibraryId' }, { status: 400 });
    }

    const favorite = await prisma.userExerciseFavorite.upsert({
      where: userId
        ? { userId_exerciseLibraryId: { userId, exerciseLibraryId } }
        : { surveyId_exerciseLibraryId: { surveyId: surveyId!, exerciseLibraryId } },
      create: {
        userId: userId ?? null,
        surveyId: surveyId ?? null,
        exerciseLibraryId,
      },
      update: {},
    });

    return NextResponse.json({ success: true, favorite });
  } catch (error) {
    console.error('[FAVORITES POST] Error:', error);
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, surveyId } = await getIdentifiers();
    if (!userId && !surveyId) {
      return NextResponse.json({ error: 'Not identified' }, { status: 401 });
    }

    const { exerciseLibraryId } = await req.json();
    if (!exerciseLibraryId) {
      return NextResponse.json({ error: 'Missing exerciseLibraryId' }, { status: 400 });
    }

    await prisma.userExerciseFavorite.deleteMany({
      where: {
        exerciseLibraryId,
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(surveyId ? [{ surveyId }] : []),
        ],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FAVORITES DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
