export interface Restaurant {
  name: string;
  address: string;
  rating: number;
  priceLevel: number; // 1-4
  cuisine: string;
  phoneNumber?: string;
  isOpen?: boolean;
  placeId: string;
  chainCategory?: 'healthier' | 'moderate' | 'unhealthy';
  // Business status tracking
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'UNKNOWN';
  isPermClosed?: boolean;
  isTempClosed?: boolean;
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

  async getRestaurantDetails(placeId: string): Promise<any> {
    try {
      const detailsUrl = `${this.baseUrl}/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,opening_hours,price_level,rating,reviews,website,business_status,editorial_summary,types,user_ratings_total&key=${this.apiKey}`;

      const response = await fetch(detailsUrl);∏
      const data = await response.json();

      if (data.status !== 'OK') {
        console.warn(`[GooglePlaces] Details failed for ${placeId}: ${data.status}`);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error(`[GooglePlaces] Error getting details for ${placeId}:`, error);
      return null;
    }
  }

  async filterOpenRestaurants(restaurants: Restaurant[]): Promise<Restaurant[]> {
    // Enhanced filter to ensure restaurants are operational and have good ratings
    return restaurants.filter(restaurant => {
      // Must be operational
      if (restaurant.businessStatus === 'CLOSED_PERMANENTLY') {
        console.log(`[GooglePlaces] Filtering out permanently closed: ${restaurant.name}`);
        return false;
      }

      // Must have reasonable rating (at least 3.5 out of 5)
      if (restaurant.rating < 3.5) {
        console.log(`[GooglePlaces] Filtering out low-rated restaurant: ${restaurant.name} (${restaurant.rating})`);
        return false;
      }

      // Avoid very expensive restaurants (price level 4)
      if (restaurant.priceLevel >= 4) {
        console.log(`[GooglePlaces] Filtering out expensive restaurant: ${restaurant.name} (price level ${restaurant.priceLevel})`);
        return false;
      }

      return true;
    });
  }

  private async geocodeZipcode(zipcode: string): Promise<{ lat: number; lng: number }> {
    const geocodeUrl = `${this.baseUrl}/textsearch/json?query=${zipcode}&key=${this.apiKey}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.results?.[0]?.geometry?.location) {
      throw new Error(`Could not geocode zipcode: ${zipcode}`);
    }

    return geocodeData.results[0].geometry.location;
  }

  // Main method used by meal generation
  async searchRestaurantsByCuisine(
    fullAddress: string,
    cuisine: string,
    dietaryRestrictions: string[] = [],
    maxResults: number = 7,
    radiusMiles?: number
  ): Promise<Restaurant[]> {
    try {
      // Build search query with distance preference - include both local and chain restaurants
      const dietaryString = dietaryRestrictions.length > 0 ? dietaryRestrictions.join(' ') + ' ' : '';
      const distanceString = radiusMiles ? `within ${radiusMiles} miles ` : '';

      // Use simple, inclusive search that finds both local and chain restaurants
      const query = `healthy ${dietaryString}${cuisine} restaurant ${distanceString}near ${fullAddress}`;

      console.log(`[GooglePlaces] Searching for restaurants: "${query}" (radius: ${radiusMiles || 'default'} miles)`);

      // Convert miles to meters for Google Places API (1 mile = 1609.34 meters)
      const radiusMeters = radiusMiles ? Math.round(radiusMiles * 1609.34) : undefined;
      let searchUrl = `${this.baseUrl}/textsearch/json?query=${encodeURIComponent(query)}&key=${this.apiKey}`;

      // Add radius parameter if specified
      if (radiusMeters) {
        // Get lat/lng for the address to use with radius
        try {
          const geocodeUrl = `${this.baseUrl}/textsearch/json?query=${encodeURIComponent(fullAddress)}&key=${this.apiKey}`;
          const geocodeResponse = await fetch(geocodeUrl);
          const geocodeData = await geocodeResponse.json();

          if (geocodeData.results?.[0]?.geometry?.location) {
            const { lat, lng } = geocodeData.results[0].geometry.location;
            searchUrl = `${this.baseUrl}/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(`healthy ${dietaryString}${cuisine}`)}&type=restaurant&key=${this.apiKey}`;
            console.log(`[GooglePlaces] Using nearby search with ${radiusMiles} mile radius (${radiusMeters}m)`);
          }
        } catch (geocodeError) {
          console.warn(`[GooglePlaces] Geocoding failed, using text search without radius:`, geocodeError);
        }
      }

      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.status !== 'OK') {
        console.log(`[GooglePlaces] Search failed for "${query}": ${data.status}`);
        return [];
      }

      // Return enhanced results with additional details for LLM to process
      const places = data.results
        .filter((place: any) =>
          place.types?.includes('restaurant') ||
          place.types?.includes('meal_delivery') ||
          place.types?.includes('meal_takeaway')
        )
        .slice(0, maxResults); // Limit to max results per search

      // Fetch additional details for each restaurant
      const restaurants = await Promise.all(
        places.map(async (place: any) => {
          try {
            // Get detailed information including reviews and descriptions
            const details = await this.getRestaurantDetails(place.place_id);

            // Extract useful description from reviews
            const description = this.extractRestaurantDescription(details);

            // Extract city and zipCode from address
            const address = place.formatted_address || details?.formatted_address || 'Address not available';
            const addressParts = address.split(', ');
            const city = addressParts.find(part => !part.match(/^\d/) && !part.includes('St') && !part.includes('Ave') && !part.includes('Blvd')) || 'San Francisco';
            const zipMatch = address.match(/\b\d{5}\b/);
            const zipCode = zipMatch ? zipMatch[0] : '94109';

            return {
              // Keep minimal structure but include all Google Places data
              name: place.name,
              address: address,
              city: city,
              zipCode: zipCode,
              rating: place.rating || 0,
              priceLevel: place.price_level || details?.price_level || 2,
              cuisine: cuisine.toLowerCase(),
              types: place.types || details?.types || [],
              placeId: place.place_id,
              // Enhanced data for better LLM analysis
              phoneNumber: details?.formatted_phone_number,
              isOpen: place.opening_hours?.open_now || details?.opening_hours?.open_now,
              businessStatus: details?.business_status || 'UNKNOWN',
              website: details?.website,
              description: description,
              userRatingsTotal: details?.user_ratings_total || 0,
              editorialSummary: details?.editorial_summary?.overview,
              // Mark restaurant as requiring menu analysis
              needsMenuAnalysis: true
            };
          } catch (error) {
            console.warn(`[GooglePlaces] Error getting details for ${place.name}:`, error);
            const address = place.formatted_address || 'Address not available';
            const addressParts = address.split(', ');
            const city = addressParts.find(part => !part.match(/^\d/) && !part.includes('St') && !part.includes('Ave') && !part.includes('Blvd')) || 'San Francisco';
            const zipMatch = address.match(/\b\d{5}\b/);
            const zipCode = zipMatch ? zipMatch[0] : '94109';

            return {
              name: place.name,
              address: address,
              city: city,
              zipCode: zipCode,
              rating: place.rating || 0,
              priceLevel: place.price_level || 2,
              cuisine: cuisine.toLowerCase(),
              placeId: place.place_id,
              needsMenuAnalysis: true
            };
          }
        })
      );

      // Apply additional filtering to ensure quality and operational status
      const filteredRestaurants = await this.filterOpenRestaurants(restaurants);

      console.log(`[GooglePlaces] Found ${restaurants.length} restaurants, filtered to ${filteredRestaurants.length} operational restaurants for "${cuisine}" cuisine`);
      return filteredRestaurants;

    } catch (error) {
      console.error('[GooglePlaces] Error in searchRestaurantsByCuisine:', error);
      return [];
    }
  }

  private extractRestaurantDescription(details: any): string {
    if (details?.editorial_summary?.overview) {
      return details.editorial_summary.overview;
    }

    // Try to get useful info from top review
    if (details?.reviews?.[0]?.text) {
      const review = details.reviews[0].text;
      // Take first sentence that's not too long
      const firstSentence = review.split('.')[0];
      if (firstSentence.length > 20 && firstSentence.length < 200) {
        return firstSentence + '.';
      }
    }

    return null; // Let LLM handle description generation
  }

  private extractCuisine(name: string, types: string[]): string {
    // Simple cuisine extraction from types
    const cuisineTypes = types.filter(type =>
      !['restaurant', 'establishment', 'food', 'point_of_interest'].includes(type)
    );

    if (cuisineTypes.length > 0) {
      return cuisineTypes[0].replace(/_/g, ' ');
    }

    // Use the restaurant name if no type info available
    return name.toLowerCase();
  }
}

export const googlePlacesClient = new GooglePlacesClient();