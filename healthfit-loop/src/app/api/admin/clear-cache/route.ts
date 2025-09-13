// Cache management endpoint for debugging and maintenance
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { cacheType } = await req.json();

    if (cacheType === 'restaurants' || cacheType === 'all') {
      const deletedRestaurants = await prisma.restaurantCache.deleteMany({});
      console.log(`[DEBUG-Cache] Cleared ${deletedRestaurants.count} restaurant cache entries`);
    }

    if (cacheType === 'menus' || cacheType === 'all') {
      const deletedMenus = await prisma.menuCache.deleteMany({});
      console.log(`[DEBUG-Cache] Cleared ${deletedMenus.count} menu cache entries`);
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${cacheType} cache`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[DEBUG-Cache] Clear cache error:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const restaurantCount = await prisma.restaurantCache.count();
    const menuCount = await prisma.menuCache.count();
    
    const expiredRestaurants = await prisma.restaurantCache.count({
      where: { expiresAt: { lt: new Date() } }
    });
    
    const expiredMenus = await prisma.menuCache.count({
      where: { expiresAt: { lt: new Date() } }
    });

    return NextResponse.json({
      restaurants: {
        total: restaurantCount,
        expired: expiredRestaurants,
        active: restaurantCount - expiredRestaurants
      },
      menus: {
        total: menuCount,
        expired: expiredMenus,
        active: menuCount - expiredMenus
      }
    });

  } catch (error) {
    console.error('[DEBUG-Cache] Cache status error:', error);
    return NextResponse.json(
      { error: 'Failed to get cache status' },
      { status: 500 }
    );
  }
}