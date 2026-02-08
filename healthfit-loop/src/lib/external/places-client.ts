// src/lib/external/places-client.ts
import { withPlacesRetry } from '@/lib/utils/retry';

export interface Restaurant {
  name: string;
  address: string;
  city?: string;           // FIX: Added city field
  zipCode?: string;        // FIX: Added zipCode field
  rating: number;
  priceLevel: number;
  cuisine: string;
  phoneNumber?: string;
  isOpen?: boolean;
  placeId: string;
  chainCategory?: 'healthier' | 'moderate' | 'unhealthy';
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'UNKNOWN';
  isPermClosed?: boolean;
  isTempClosed?: boolean;
  website?: string;        // FIX: Added website field
  description?: string;    // FIX: Added description field
  types?: string[];        // FIX: Added types field
  userRatingsTotal?: number; // FIX: Added userRatingsTotal field
  editorialSummary?: string; // FIX: Added editorialSummary field
  needsMenuAnalysis?: boolean; // FIX: Added needsMenuAnalysis field
}

export class GooglePlacesClient {
  private apiKey: string;
  private placesBaseUrl = 'https://maps.googleapis.com/maps/api/place';
  private geocodeBaseUrl = 'https://maps.googleapis.com/maps/api/geocode';

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES || '';
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES API key not found in environment variables');
    }
  }

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    const geocodeResult = await withPlacesRetry(async () => {
      const url = `${this.geocodeBaseUrl}/json?` + new URLSearchParams({
        address: address,
        key: this.apiKey,
      });

      console.log(`[GooglePlaces] 📍 Geocoding address: "${address}"`);

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
        const { lat, lng } = data.results[0].geometry.location;
        console.log(`[GooglePlaces] ✅ Geocoded to: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        return { lat, lng };
      }

      if (data.status === 'ZERO_RESULTS') {
        console.log(`[GooglePlaces] 📍 No results for address: "${address}"`);
        return null;
      }

      throw new Error(`Geocoding failed: ${data.status} ${data.error_message || ''}`);
    }, `Geocoding address: "${address}"`);

    if (!geocodeResult.success) {
      console.error('[GooglePlaces] ❌ Geocoding error after retries:', geocodeResult.error);
      return null;
    }

    return geocodeResult.data || null;
  }

  async getRestaurantDetails(placeId: string): Promise<any> {
    const detailsResult = await withPlacesRetry(async () => {
      const detailsUrl = `${this.placesBaseUrl}/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,opening_hours,price_level,rating,reviews,website,business_status,editorial_summary,types,user_ratings_total&key=${this.apiKey}`;

      const response = await fetch(detailsUrl);
      const data = await response.json();

      if (data.status !== 'OK') {
        if (data.status === 'NOT_FOUND') {
          console.warn(`[GooglePlaces] Place not found: ${placeId}`);
          return null;
        }
        throw new Error(`Place details failed: ${data.status} ${data.error_message || ''}`);
      }

      return data.result;
    }, `Place details for ${placeId}`);

    if (!detailsResult.success) {
      console.warn(`[GooglePlaces] Details failed for ${placeId} after retries:`, detailsResult.error);
      return null;
    }

    return detailsResult.data;
  }

  async filterOpenRestaurants(restaurants: Restaurant[]): Promise<Restaurant[]> {
    return restaurants.filter(restaurant => {
      if (restaurant.businessStatus === 'CLOSED_PERMANENTLY') {
        console.log(`[GooglePlaces] Filtering out permanently closed: ${restaurant.name}`);
        return false;
      }

      if (restaurant.rating < 3.5) {
        console.log(`[GooglePlaces] Filtering out low-rated restaurant: ${restaurant.name} (${restaurant.rating})`);
        return false;
      }

      if (restaurant.priceLevel >= 4) {
        console.log(`[GooglePlaces] Filtering out expensive restaurant: ${restaurant.name} (price level ${restaurant.priceLevel})`);
        return false;
      }

      return true;
    });
  }

  async searchRestaurantsByCuisine(
    fullAddress: string,
    cuisine: string,
    dietaryRestrictions: string[] = [],
    maxResults: number = 7,
    radiusMiles: number = 10
  ): Promise<Restaurant[]> {
    try {
      const location = await this.geocodeAddress(fullAddress);

      if (!location) {
        console.error(`[GooglePlaces] ❌ Could not geocode address: ${fullAddress}`);
        return [];
      }

      const { lat, lng } = location;
      const radiusMeters = Math.round(radiusMiles * 1609.34);

      const dietaryString = dietaryRestrictions.length > 0
        ? dietaryRestrictions.join(' ') + ' '
        : '';
      const keyword = `healthy ${dietaryString}${cuisine}`.trim();

      const searchUrl = `${this.placesBaseUrl}/nearbysearch/json?` + new URLSearchParams({
        location: `${lat},${lng}`,
        radius: radiusMeters.toString(),
        keyword: keyword,
        type: 'restaurant',
        key: this.apiKey,
      });

      console.log(`[GooglePlaces] 🔍 Nearby search: "${keyword}" within ${radiusMiles} miles (${radiusMeters}m) of (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

      const searchResult = await withPlacesRetry(async () => {
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.status === 'ZERO_RESULTS') {
          console.log(`[GooglePlaces] ⚠️ No results for "${keyword}"`);
          return { results: [] };
        }

        if (data.status !== 'OK') {
          throw new Error(`Places search failed: ${data.status} ${data.error_message || ''}`);
        }

        return data;
      }, `Places search: "${keyword}"`);

      if (!searchResult.success) {
        console.error(`[GooglePlaces] ❌ Search failed after retries:`, searchResult.error);
        return [];
      }

      const data = searchResult.data;

      if (!data.results?.length) {
        console.log(`[GooglePlaces] ⚠️ No results for "${keyword}" - trying broader search`);
        return this.searchNearbyFallback(lat, lng, radiusMeters, cuisine, maxResults);
      }

      const places = data.results
        .filter((place: any) =>
          place.types?.includes('restaurant') ||
          place.types?.includes('meal_delivery') ||
          place.types?.includes('meal_takeaway')
        )
        .slice(0, maxResults);

      const restaurants = await Promise.all(
        places.map((place: any) => this.enrichPlaceDetails(place, cuisine))
      );

      const filteredRestaurants = await this.filterOpenRestaurants(restaurants);

      console.log(`[GooglePlaces] ✅ Found ${restaurants.length} restaurants, filtered to ${filteredRestaurants.length} for "${cuisine}" within ${radiusMiles} miles`);
      return filteredRestaurants;

    } catch (error) {
      console.error('[GooglePlaces] ❌ Error in searchRestaurantsByCuisine:', error);
      return [];
    }
  }

  private async searchNearbyFallback(
    lat: number,
    lng: number,
    radiusMeters: number,
    cuisine: string,
    maxResults: number
  ): Promise<Restaurant[]> {
    try {
      const keyword = cuisine || 'restaurant';

      const searchUrl = `${this.placesBaseUrl}/nearbysearch/json?` + new URLSearchParams({
        location: `${lat},${lng}`,
        radius: radiusMeters.toString(),
        keyword: keyword,
        type: 'restaurant',
        key: this.apiKey,
      });

      console.log(`[GooglePlaces] 🔄 Fallback search: "${keyword}"`);

      const fallbackResult = await withPlacesRetry(async () => {
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.status === 'ZERO_RESULTS') {
          console.log(`[GooglePlaces] ⚠️ Fallback search returned no results`);
          return { results: [] };
        }

        if (data.status !== 'OK') {
          throw new Error(`Fallback search failed: ${data.status} ${data.error_message || ''}`);
        }

        return data;
      }, `Fallback search: "${keyword}"`);

      if (!fallbackResult.success || !fallbackResult.data.results?.length) {
        console.log(`[GooglePlaces] ❌ Fallback search failed or returned no results`);
        return [];
      }

      const data = fallbackResult.data;

      const places = data.results.slice(0, maxResults);
      const restaurants = await Promise.all(
        places.map((place: any) => this.enrichPlaceDetails(place, cuisine))
      );

      const filtered = await this.filterOpenRestaurants(restaurants);
      console.log(`[GooglePlaces] ✅ Fallback found ${filtered.length} restaurants`);
      return filtered;

    } catch (error) {
      console.error('[GooglePlaces] ❌ Fallback search error:', error);
      return [];
    }
  }

  private async enrichPlaceDetails(place: any, cuisine: string): Promise<Restaurant> {
    try {
      const details = await this.getRestaurantDetails(place.place_id);
      const description = this.extractRestaurantDescription(details);

      const address = place.formatted_address || details?.formatted_address || 'Address not available';
      const { city, zipCode } = this.extractCityAndZip(address);

      return {
        name: place.name,
        address: address,
        city: city,
        zipCode: zipCode,
        rating: place.rating || 0,
        priceLevel: place.price_level || details?.price_level || 2,
        cuisine: cuisine.toLowerCase() || this.extractCuisineFromTypes(place.types || []),
        types: place.types || details?.types || [],
        placeId: place.place_id,
        phoneNumber: details?.formatted_phone_number,
        isOpen: place.opening_hours?.open_now ?? details?.opening_hours?.open_now,
        businessStatus: details?.business_status || 'UNKNOWN',
        website: details?.website,
        description: description || undefined,
        userRatingsTotal: details?.user_ratings_total || 0,
        editorialSummary: details?.editorial_summary?.overview,
        needsMenuAnalysis: true
      };

    } catch (error) {
      console.warn(`[GooglePlaces] Error enriching ${place.name}:`, error);

      const address = place.formatted_address || 'Address not available';
      const { city, zipCode } = this.extractCityAndZip(address);

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
  }

  private extractCityAndZip(address: string): { city: string; zipCode: string } {
    // FIX: Improved city/zip extraction
    const addressParts = address.split(', ');
    
    // Try to find city (usually the 2nd or 3rd part, before state)
    let city = 'Unknown';
    let zipCode = '00000';
    
    // Look for zip code pattern
    const zipMatch = address.match(/\b\d{5}(-\d{4})?\b/);
    if (zipMatch) {
      zipCode = zipMatch[0].substring(0, 5); // Just first 5 digits
    }
    
    // City is usually before the state abbreviation
    // Pattern: "City, ST 12345" or "City, State 12345"
    for (let i = 0; i < addressParts.length; i++) {
      const part = addressParts[i].trim();
      
      // Skip if it's the street address (contains numbers at start or common street words)
      if (/^\d/.test(part) || /\b(St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Pl)\b/i.test(part)) {
        continue;
      }
      
      // Skip if it contains the zip code
      if (/\d{5}/.test(part)) {
        continue;
      }
      
      // Skip if it's just a state abbreviation or "USA"
      if (/^[A-Z]{2}$/.test(part) || part === 'USA' || part === 'United States') {
        continue;
      }
      
      // This is likely the city
      city = part;
      break;
    }

    return { city, zipCode };
  }

  private extractRestaurantDescription(details: any): string | null {
    if (details?.editorial_summary?.overview) {
      return details.editorial_summary.overview;
    }

    if (details?.reviews?.[0]?.text) {
      const review = details.reviews[0].text;
      const firstSentence = review.split('.')[0];
      if (firstSentence.length > 20 && firstSentence.length < 200) {
        return firstSentence + '.';
      }
    }

    return null;
  }

  private extractCuisineFromTypes(types: string[]): string {
    const cuisineTypes = types.filter(type =>
      !['restaurant', 'establishment', 'food', 'point_of_interest'].includes(type)
    );

    if (cuisineTypes.length > 0) {
      return cuisineTypes[0].replace(/_/g, ' ');
    }

    return 'restaurant';
  }
}

export const googlePlacesClient = new GooglePlacesClient();