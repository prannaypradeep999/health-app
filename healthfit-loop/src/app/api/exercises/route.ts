import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const muscleGroup = searchParams.get('muscleGroup');
  const equipmentType = searchParams.get('equipmentType');
  const difficulty = searchParams.get('difficulty');
  const search = searchParams.get('search');

  const exercises = await prisma.exerciseLibrary.findMany({
    where: {
      ...(muscleGroup && { muscleGroup }),
      ...(equipmentType && { equipmentType }),
      ...(difficulty && { difficulty }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { muscleGroup: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ exercises });
}
