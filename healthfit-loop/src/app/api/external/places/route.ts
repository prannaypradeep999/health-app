import { NextRequest, NextResponse } from 'next/server';
import { googlePlacesClient } from '@/lib/external/places-client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const zipcode = searchParams.get('zipcode');
    const cuisine = searchParams.get('cuisine');
    const priceLevel = searchParams.get('priceLevel');

    if (!zipcode) {
      return NextResponse.json(
        { error: 'zipcode parameter is required' },
        { status: 400 }
      );
    }

    console.log(`[PlacesAPI] Testing with zipcode: ${zipcode}, cuisine: ${cuisine}, priceLevel: ${priceLevel}`);

    const restaurants = await googlePlacesClient.findNearbyRestaurants(
      zipcode,
      cuisine || undefined,
      priceLevel ? parseInt(priceLevel) : undefined
    );

    return NextResponse.json({
      success: true,
      zipcode,
      restaurantCount: restaurants.length,
      restaurants: restaurants.slice(0, 10), // Return first 10 for testing
      message: `Found ${restaurants.length} restaurants near ${zipcode}`
    });

  } catch (error) {
    console.error('[PlacesAPI] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch restaurants',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}