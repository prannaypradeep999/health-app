// API endpoint for Spoonacular menu data access
import { NextRequest, NextResponse } from 'next/server';
import { spoonacularClient } from '@/lib/external/spoonacular-client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    
    if (action === 'search') {
      const restaurantChain = searchParams.get('restaurant');
      const maxCalories = searchParams.get('maxCalories');
      const minProtein = searchParams.get('minProtein');
      
      if (!restaurantChain) {
        return NextResponse.json({ error: 'restaurant parameter required' }, { status: 400 });
      }

      console.log(`[DEBUG-Spoonacular] API search for ${restaurantChain}`);
      
      const items = await spoonacularClient.searchMenuItems(
        restaurantChain,
        maxCalories ? parseInt(maxCalories) : undefined,
        minProtein ? parseInt(minProtein) : undefined
      );

      return NextResponse.json({
        success: true,
        restaurant: restaurantChain,
        itemCount: items.length,
        items: items.slice(0, 10)
      });
    }
    
    if (action === 'details') {
      const itemId = searchParams.get('itemId');
      
      if (!itemId) {
        return NextResponse.json({ error: 'itemId parameter required' }, { status: 400 });
      }

      console.log(`[DEBUG-Spoonacular] API details for item ${itemId}`);
      
      const details = await spoonacularClient.getMenuItemDetails(parseInt(itemId));
      
      if (!details) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        item: details
      });
    }

    return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 });

  } catch (error) {
    console.error('[DEBUG-Spoonacular] API error:', error);
    return NextResponse.json(
      { error: 'Spoonacular API error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}