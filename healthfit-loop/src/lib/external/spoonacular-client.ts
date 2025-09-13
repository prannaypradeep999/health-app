// Spoonacular API client with exact restaurant matching
import { prisma } from '@/lib/db';

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

      const params = new URLSearchParams({
        apiKey: this.apiKey,
        query: restaurantChain,
        number: '50',
      });

      if (maxCalories) params.append('maxCalories', maxCalories.toString());
      if (minProtein) params.append('minProtein', minProtein.toString());
      if (maxCarbs) params.append('maxCarbs', maxCarbs.toString());

      const url = `${this.baseUrl}/food/menuItems/search?${params}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`[DEBUG-Spoonacular] API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      
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
        return null;
      }

      const data = await response.json();
      console.log(`[DEBUG-Spoonacular] Got details for ${data.title} from ${data.restaurantChain}`);

      return {
        id: data.id,
        title: data.title,
        restaurantChain: data.restaurantChain || 'Unknown',
        nutrition: {
          calories: data.nutrition?.calories || 0,
          protein: parseFloat(data.nutrition?.protein?.replace('g', '') || '0'),
          carbs: parseFloat(data.nutrition?.carbs?.replace('g', '') || '0'),
          fat: parseFloat(data.nutrition?.fat?.replace('g', '') || '0'),
          fiber: parseFloat(data.nutrition?.fiber?.replace('g', '') || '0'),
          sodium: parseFloat(data.nutrition?.sodium?.replace('mg', '') || '0'),
        },
        image: data.image
      };

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