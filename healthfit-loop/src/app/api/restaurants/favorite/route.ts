import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { surveyId, restaurantName, cuisine, address, isFavorite } = await req.json();

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;

    if (!surveyId || !restaurantName) {
      return NextResponse.json({ error: 'surveyId and restaurantName required' }, { status: 400 });
    }

    if (isFavorite) {
      // Add to favorites (upsert)
      const favorite = await prisma.favoriteRestaurant.upsert({
        where: {
          surveyId_restaurantName: { surveyId, restaurantName }
        },
        update: { cuisine, address },
        create: {
          userId: userId || null,
          surveyId,
          restaurantName,
          cuisine,
          address
        }
      });
      console.log(`[FAVORITE] Added: ${restaurantName}`);
      return NextResponse.json({ success: true, favorite });
    } else {
      // Remove from favorites
      await prisma.favoriteRestaurant.deleteMany({
        where: { surveyId, restaurantName }
      });
      console.log(`[FAVORITE] Removed: ${restaurantName}`);
      return NextResponse.json({ success: true, removed: true });
    }

  } catch (error) {
    console.error('[FAVORITE] Error:', error);
    return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const surveyId = searchParams.get('surveyId');

    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId required' }, { status: 400 });
    }

    const favorites = await prisma.favoriteRestaurant.findMany({
      where: { surveyId },
      orderBy: { addedAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      favorites,
      restaurantNames: favorites.map(f => f.restaurantName)
    });

  } catch (error) {
    console.error('[FAVORITE] GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}