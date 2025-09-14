import { prisma } from '@/lib/db';
import { getMatchingChain, HEALTHIER_CHAINS, MODERATE_CHAINS } from '@/lib/config/meal-planning';

export interface Restaurant {
  name: string;
  address: string;
  rating: number;
  priceLevel: number; // 1-4
  cuisine: string;
  phoneNumber?: string;
  isOpen?: boolean;
  placeId: string;
  // New fields for chain filtering
  chainCategory?: 'healthier' | 'moderate';
  spoonacularVerified?: boolean;
}

export class GooglePlacesClient {
  private apiKey: string;
  private baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES || '';
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES API key not found in environment variables');
    }
  }

  async findNearbyRestaurants(
    zipcode: string,
    cuisineType?: string,
    priceLevel?: number,
    radiusKm?: number
  ): Promise<Restaurant[]> {
    try {
      // Check cache first (7 day expiration) - include radius in cache key
      const radius = radiusKm ? radiusKm * 1000 : 8000; // Convert km to meters, default 8km
      const cacheKey = `${zipcode}-${cuisineType || 'all'}-${radius}m`;
      const cached = await prisma.restaurantCache.findUnique({
        where: {
          zipcode_cuisineType: {
            zipcode,
            cuisineType: cacheKey
          }
        }
      });

      if (cached && cached.expiresAt > new Date()) {
        console.log(`[GooglePlaces] Using cached restaurants for ${zipcode}`);
        return cached.restaurants as unknown as Restaurant[];
      }

      // Geocode zipcode to lat/lng
      const geocodeUrl = `${this.baseUrl}/textsearch/json?query=${zipcode}&key=${this.apiKey}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (!geocodeData.results?.[0]?.geometry?.location) {
        throw new Error(`Could not geocode zipcode: ${zipcode}`);
      }

      const { lat, lng } = geocodeData.results[0].geometry.location;

      // Search for restaurants
      let query = 'restaurant';
      if (cuisineType) {
        query = `${cuisineType} restaurant`;
      }

      const searchUrl = `${this.baseUrl}/textsearch/json?query=${query}&location=${lat},${lng}&radius=${radius}&key=${this.apiKey}`;
      
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      if (searchData.status !== 'OK') {
        throw new Error(`Google Places API error: ${searchData.status}`);
      }

      // Process results
      const restaurants: Restaurant[] = searchData.results
        .filter((place: any) => 
          place.types?.includes('restaurant') || 
          place.types?.includes('meal_delivery') ||
          place.types?.includes('meal_takeaway')
        )
        .map((place: any) => ({
          name: place.name,
          address: place.formatted_address || 'Address not available',
          rating: place.rating || 0,
          priceLevel: place.price_level || 2,
          cuisine: this.extractCuisine(place.name, place.types),
          phoneNumber: place.formatted_phone_number,
          isOpen: place.opening_hours?.open_now,
          placeId: place.place_id
        }))
        .filter((restaurant: Restaurant) => {
          // Filter by price level if specified
          if (priceLevel && restaurant.priceLevel !== priceLevel) {
            return false;
          }
          return true;
        })
        .slice(0, 20); // Limit to top 20 results

      // Cache results for 7 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.restaurantCache.upsert({
        where: {
          zipcode_cuisineType: {
            zipcode,
            cuisineType: cacheKey
          }
        },
        update: {
          restaurants: restaurants as any,
          expiresAt
        },
        create: {
          zipcode,
          cuisineType: cacheKey,
          restaurants: restaurants as any,
          expiresAt
        }
      });

      console.log(`[GooglePlaces] Found ${restaurants.length} restaurants near ${zipcode}`);
      return restaurants;

    } catch (error) {
      console.error('[GooglePlaces] Error finding restaurants:', error);
      throw error;
    }
  }

  async getRestaurantDetails(placeId: string): Promise<any> {
    try {
      const detailsUrl = `${this.baseUrl}/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,opening_hours,price_level,rating,reviews,website&key=${this.apiKey}`;
      
      const response = await fetch(detailsUrl);
      const data = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Google Places Details API error: ${data.status}`);
      }

      return data.result;
    } catch (error) {
      console.error('[GooglePlaces] Error getting restaurant details:', error);
      throw error;
    }
  }

  // New method: Find verified healthy chains near user
  async findVerifiedHealthyChains(
    zipcode: string,
    radiusKm?: number,
    preferHealthier: boolean = true
  ): Promise<Restaurant[]> {
    try {
      console.log(`[GooglePlaces] Finding verified healthy chains near ${zipcode}, radius: ${radiusKm}km`);
      
      const radius = radiusKm ? radiusKm * 1000 : 8000;
      const cacheKey = `${zipcode}-healthy-chains-${radius}m`;
      
      // Check cache first
      const cached = await prisma.restaurantCache.findUnique({
        where: {
          zipcode_cuisineType: {
            zipcode,
            cuisineType: cacheKey
          }
        }
      });

      if (cached && cached.expiresAt > new Date()) {
        console.log(`[GooglePlaces] Using cached healthy chains for ${zipcode}`);
        return cached.restaurants as unknown as Restaurant[];
      }

      // Get location coordinates
      const { lat, lng } = await this.geocodeZipcode(zipcode);
      
      // Search for each verified chain specifically
      const chainPromises = [...HEALTHIER_CHAINS, ...MODERATE_CHAINS].map(async (chainName) => {
        return this.searchSpecificChain(lat, lng, radius, chainName);
      });

      const chainResults = await Promise.all(chainPromises);
      const allHealthyRestaurants = chainResults.flat();

      // Sort by priority: healthier chains first, then by rating
      const sortedRestaurants = allHealthyRestaurants.sort((a, b) => {
        if (a.chainCategory !== b.chainCategory) {
          if (a.chainCategory === 'healthier') return -1;
          if (b.chainCategory === 'healthier') return 1;
        }
        return (b.rating || 0) - (a.rating || 0);
      });

      // Filter based on preference
      const filteredRestaurants = preferHealthier 
        ? sortedRestaurants.filter(r => r.chainCategory === 'healthier').slice(0, 15)
          .concat(sortedRestaurants.filter(r => r.chainCategory === 'moderate').slice(0, 5))
        : sortedRestaurants.slice(0, 20);

      // Cache results for 24 hours (shorter than regular cache for freshness)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await prisma.restaurantCache.upsert({
        where: {
          zipcode_cuisineType: {
            zipcode,
            cuisineType: cacheKey
          }
        },
        update: {
          restaurants: filteredRestaurants as any,
          expiresAt
        },
        create: {
          zipcode,
          cuisineType: cacheKey,
          restaurants: filteredRestaurants as any,
          expiresAt
        }
      });

      console.log(`[GooglePlaces] Found ${filteredRestaurants.length} verified healthy chains near ${zipcode}`);
      return filteredRestaurants;

    } catch (error) {
      console.error('[GooglePlaces] Error finding verified healthy chains:', error);
      throw error;
    }
  }

  // Search for a specific chain near coordinates
  private async searchSpecificChain(lat: number, lng: number, radius: number, chainName: string): Promise<Restaurant[]> {
    try {
      const query = `${chainName} restaurant`;
      const searchUrl = `${this.baseUrl}/textsearch/json?query=${query}&location=${lat},${lng}&radius=${radius}&key=${this.apiKey}`;
      
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.status !== 'OK') {
        console.log(`[GooglePlaces] No results for ${chainName}: ${data.status}`);
        return [];
      }

      const restaurants: Restaurant[] = data.results
        .filter((place: any) => {
          // STRICT chain matching - only exact matches to verified chains
          const placeName = place.name.toLowerCase().trim();
          const targetChain = chainName.toLowerCase().trim();
          
          // Exact match or very close match (accounting for variations like "Panera Bread" vs "Panera")
          const isExactMatch = placeName === targetChain;
          const isCloseMatch = placeName.startsWith(targetChain) || targetChain.startsWith(placeName);
          const hasMinimumLength = Math.min(placeName.length, targetChain.length) >= 4; // Avoid false positives
          
          const isValidChainMatch = isExactMatch || (isCloseMatch && hasMinimumLength);
          
          // Double-check against our verified chain list
          const verifiedMatch = getMatchingChain(place.name);
          
          console.log(`[Chain-Filter] "${place.name}" vs "${chainName}": valid=${isValidChainMatch}, verified=${!!verifiedMatch}`);
          
          return isValidChainMatch && verifiedMatch;
        })
        .slice(0, 3) // Limit per chain to avoid spam
        .map((place: any) => {
          const matchResult = getMatchingChain(place.name);
          return {
            name: place.name,
            address: place.formatted_address || 'Address not available',
            rating: place.rating || 0,
            priceLevel: place.price_level || 2,
            cuisine: this.extractCuisine(place.name, place.types),
            phoneNumber: place.formatted_phone_number,
            isOpen: place.opening_hours?.open_now,
            placeId: place.place_id,
            chainCategory: matchResult?.category,
            spoonacularVerified: true
          };
        });

      if (restaurants.length > 0) {
        console.log(`[GooglePlaces] Found ${restaurants.length} ${chainName} locations`);
      }

      return restaurants;

    } catch (error) {
      console.error(`[GooglePlaces] Error searching for ${chainName}:`, error);
      return [];
    }
  }

  // Helper method to geocode zipcode
  private async geocodeZipcode(zipcode: string): Promise<{ lat: number; lng: number }> {
    const geocodeUrl = `${this.baseUrl}/textsearch/json?query=${zipcode}&key=${this.apiKey}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.results?.[0]?.geometry?.location) {
      throw new Error(`Could not geocode zipcode: ${zipcode}`);
    }

    return geocodeData.results[0].geometry.location;
  }

  private extractCuisine(name: string, types: string[]): string {
    const cuisineKeywords = {
      'italian': ['pizza', 'pasta', 'italian'],
      'chinese': ['chinese', 'asian'],
      'mexican': ['mexican', 'taco', 'burrito'],
      'american': ['burger', 'bbq', 'american', 'diner'],
      'indian': ['indian', 'curry'],
      'thai': ['thai'],
      'japanese': ['sushi', 'japanese', 'ramen'],
      'mediterranean': ['mediterranean', 'greek'],
      'fast_food': ['mcdonald', 'burger king', 'subway', 'kfc']
    };

    const lowerName = name.toLowerCase();
    
    for (const [cuisine, keywords] of Object.entries(cuisineKeywords)) {
      if (keywords.some(keyword => lowerName.includes(keyword))) {
        return cuisine;
      }
    }

    // Fallback to Google Place types
    if (types.includes('meal_delivery')) return 'delivery';
    if (types.includes('meal_takeaway')) return 'takeout';
    
    return 'general';
  }
}

export const googlePlacesClient = new GooglePlacesClient();