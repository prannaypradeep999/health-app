// Spoonacular API client with exact restaurant matching and comprehensive auditing
import { prisma } from '@/lib/db';
import { spoonacularAuditor } from '@/lib/utils/spoonacular-audit';

export interface SpoonacularMenuItem {
  id: number;
  title: string;
  restaurantChain: string;
  calories?: number;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
  sodium?: string;
  image?: string;
}

export interface MenuItemDetails {
  id: number;
  title: string;
  restaurantChain: string;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sodium?: number;
  };
  image?: string;
}

export class SpoonacularClient {
  private apiKey: string;
  private baseUrl = 'https://api.spoonacular.com';

  constructor() {
    this.apiKey = process.env.SPOONACULAR_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('SPOONACULAR_API_KEY not found in environment variables');
    }
  }

  async checkQuota(): Promise<{ remainingRequests: number; isValid: boolean }> {
    try {
      // Simple API call to check quota status
      const response = await fetch(`${this.baseUrl}/food/menuItems/search?query=test&number=1&apiKey=${this.apiKey}`);
      
      const remainingRequests = parseInt(response.headers.get('X-API-Quota-Left') || '0');
      const isValid = response.status === 200;
      
      console.log(`[Spoonacular] API Status: ${response.status}, Remaining: ${remainingRequests}`);
      
      return {
        remainingRequests,
        isValid
      };
    } catch (error) {
      console.error('[Spoonacular] Quota check failed:', error);
      return { remainingRequests: 0, isValid: false };
    }
  }

  async searchMenuItems(
    restaurantChain: string,
    maxCalories?: number,
    minProtein?: number,
    maxCarbs?: number,
    number: number = 10
  ): Promise<SpoonacularMenuItem[]> {
    console.log(`[DEBUG-Spoonacular] Searching ${restaurantChain} items, maxCal: ${maxCalories}, minProt: ${minProtein}`);
    
    try {
      const cacheKey = `${restaurantChain.toLowerCase().replace(/\s+/g, '-')}`;
      const cached = await prisma.menuCache.findUnique({
        where: {
          restaurantName_location: {
            restaurantName: cacheKey,
            location: 'menu-search'
          }
        }
      });

      if (cached && cached.expiresAt > new Date()) {
        console.log(`[DEBUG-Spoonacular] Cache hit for ${restaurantChain}`);
        const cachedItems = cached.menuData as any;
        const exactMatches = this.filterExactRestaurantMatches(cachedItems.menuItems || [], restaurantChain);
        return this.filterCachedItems(exactMatches, maxCalories, minProtein, maxCarbs);
      }

      // OPTIMIZATION: Limit results based on filtering to reduce API usage
      const targetNumber = maxCalories || minProtein || maxCarbs ? '25' : '15'; // Fewer items when filtering
      
      const params = new URLSearchParams({
        apiKey: this.apiKey,
        query: restaurantChain,
        number: targetNumber,
      });

      if (maxCalories) params.append('maxCalories', maxCalories.toString());
      if (minProtein) params.append('minProtein', minProtein.toString());
      if (maxCarbs) params.append('maxCarbs', maxCarbs.toString());

      const url = `${this.baseUrl}/food/menuItems/search?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[DEBUG-Spoonacular] API error: ${response.status}`);
        // Audit failed API calls
        spoonacularAuditor.auditApiResponse(
          'menuItems/search',
          { restaurantChain, maxCalories, minProtein, maxCarbs, number: targetNumber },
          { error: `API error ${response.status}`, status: response.status },
          null,
          null
        );
        return [];
      }

      const data = await response.json();

      // AUDIT: Log raw Spoonacular API response
      spoonacularAuditor.auditApiResponse(
        'menuItems/search',
        { restaurantChain, maxCalories, minProtein, maxCarbs, number: targetNumber },
        data,
        null, // No processing yet
        null  // No display data yet
      );

      // Filter to exact restaurant matches only
      const exactMatches = this.filterExactRestaurantMatches(data.menuItems || [], restaurantChain);
      console.log(`[DEBUG-Spoonacular] Found ${exactMatches.length} exact matches for ${restaurantChain} (${data.menuItems?.length || 0} total results)`);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await prisma.menuCache.upsert({
        where: {
          restaurantName_location: {
            restaurantName: cacheKey,
            location: 'menu-search'
          }
        },
        update: {
          menuData: data,
          expiresAt
        },
        create: {
          restaurantName: cacheKey,
          location: 'menu-search',
          menuData: data,
          expiresAt
        }
      });

      return exactMatches;

    } catch (error) {
      console.error(`[DEBUG-Spoonacular] Search error for ${restaurantChain}:`, error);
      return [];
    }
  }

  async getMenuItemDetails(itemId: number): Promise<MenuItemDetails | null> {
    console.log(`[DEBUG-Spoonacular] Getting details for item ${itemId}`);
    
    try {
      const url = `${this.baseUrl}/food/menuItems/${itemId}?apiKey=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[DEBUG-Spoonacular] Details API error: ${response.status}`);
        // Audit failed API calls
        spoonacularAuditor.auditApiResponse(
          'menuItems/details',
          { itemId },
          { error: `API error ${response.status}`, status: response.status },
          null,
          null
        );
        return null;
      }

      const data = await response.json();
      console.log(`[DEBUG-Spoonacular] Got details for ${data.title} from ${data.restaurantChain}`);

      // Parse nutrition data from the nutrients array format
      const parseNutritionFromArray = (nutrients: any[]) => {
        const nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 };

        if (!nutrients || !Array.isArray(nutrients)) return nutrition;

        for (const nutrient of nutrients) {
          switch (nutrient.name) {
            case 'Calories':
              nutrition.calories = nutrient.amount || 0;
              break;
            case 'Protein':
              nutrition.protein = nutrient.amount || 0;
              break;
            case 'Carbohydrates':
              nutrition.carbs = nutrient.amount || 0;
              break;
            case 'Fat':
              nutrition.fat = nutrient.amount || 0;
              break;
            case 'Fiber':
              nutrition.fiber = nutrient.amount || 0;
              break;
            case 'Sodium':
              nutrition.sodium = nutrient.amount || 0;
              break;
          }
        }

        return nutrition;
      };

      const processedDetails = {
        id: data.id,
        title: data.title,
        restaurantChain: data.restaurantChain || 'Unknown',
        nutrition: parseNutritionFromArray(data.nutrition?.nutrients),
        image: data.image
      };

      // AUDIT: Log raw response and processed data
      spoonacularAuditor.auditApiResponse(
        'menuItems/details',
        { itemId },
        data,
        processedDetails,
        null // No display data yet
      );

      return processedDetails;

    } catch (error) {
      console.error(`[DEBUG-Spoonacular] Details error for ${itemId}:`, error);
      return null;
    }
  }

  // Exact restaurant data verification with proper matching
  async hasRestaurantData(restaurantName: string): Promise<boolean> {
    console.log(`[DEBUG-Spoonacular] Testing exact data availability for ${restaurantName}`);
    
    try {
      const testResults = await this.searchMenuItems(restaurantName, undefined, undefined, undefined, 1);
      const hasExactData = testResults.length > 0;
      console.log(`[DEBUG-Spoonacular] ${restaurantName} has exact match data: ${hasExactData}`);
      return hasExactData;
    } catch (error) {
      console.log(`[DEBUG-Spoonacular] ${restaurantName} test failed: ${error}`);
      return false;
    }
  }

  // Filter results to only exact restaurant chain matches
  private filterExactRestaurantMatches(items: any[], targetRestaurant: string): SpoonacularMenuItem[] {
    const normalizedTarget = targetRestaurant.toLowerCase().trim();
    
    return items.filter(item => {
      const restaurantChain = (item.restaurantChain || '').toLowerCase().trim();
      
      // Exact match or very close match
      const isExactMatch = restaurantChain === normalizedTarget;
      const isCloseMatch = restaurantChain.includes(normalizedTarget) || normalizedTarget.includes(restaurantChain);
      
      // Only accept if it's a clear match to avoid false positives
      const isValidMatch = isExactMatch || (isCloseMatch && restaurantChain.length > 3);
      
      if (isValidMatch) {
        console.log(`[DEBUG-Spoonacular] Matched "${targetRestaurant}" to "${item.restaurantChain}"`);
      }
      
      return isValidMatch;
    });
  }

  private filterCachedItems(
    items: any[], 
    maxCalories?: number, 
    minProtein?: number, 
    maxCarbs?: number
  ): SpoonacularMenuItem[] {
    return items.filter(item => {
      if (maxCalories && item.calories > maxCalories) return false;
      if (minProtein && parseFloat(item.protein?.replace('g', '') || '0') < minProtein) return false;
      if (maxCarbs && parseFloat(item.carbs?.replace('g', '') || '0') > maxCarbs) return false;
      return true;
    });
  }
}

export const spoonacularClient = new SpoonacularClient();