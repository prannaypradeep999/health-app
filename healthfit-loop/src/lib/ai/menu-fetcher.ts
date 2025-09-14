// Enhanced menu fetching with nutrition data and threading
import { spoonacularClient } from '@/lib/external/spoonacular-client';
import { UserContext } from '@/lib/ai/prompts';

interface MenuItemWithNutrition {
  id: number;
  title: string;
  restaurantChain: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  image?: string;
  verified: boolean;
  priceEstimate?: string;
}

interface RestaurantMenuData {
  restaurantChain: string;
  totalItems: number;
  verifiedItems: MenuItemWithNutrition[];
  filteredItems: MenuItemWithNutrition[];
  cacheHit: boolean;
}

export async function fetchMenusWithNutrition(
  restaurantChains: string[],
  userContext: UserContext,
  maxConcurrent: number = 4
): Promise<RestaurantMenuData[]> {
  console.log(`[Menu-Fetcher] Fetching menus for ${restaurantChains.length} chains with nutrition data`);
  
  // Process restaurants in batches to avoid overwhelming APIs
  const results: RestaurantMenuData[] = [];
  
  for (let i = 0; i < restaurantChains.length; i += maxConcurrent) {
    const batch = restaurantChains.slice(i, i + maxConcurrent);
    console.log(`[Menu-Fetcher] Processing batch ${Math.floor(i/maxConcurrent) + 1}: ${batch.join(', ')}`);
    
    const batchPromises = batch.map(async (chain) => {
      return await fetchSingleRestaurantMenu(chain, userContext);
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Process results and handle failures gracefully
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      } else {
        console.error(`[Menu-Fetcher] Failed to fetch menu for ${batch[index]}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
      }
    });
    
    // Small delay between batches to be API-friendly
    if (i + maxConcurrent < restaurantChains.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

async function fetchSingleRestaurantMenu(
  restaurantChain: string,
  userContext: UserContext
): Promise<RestaurantMenuData> {
  
  const startTime = Date.now();
  
  // Step 1: Get all menu items for this restaurant (cached for 24 hours)
  const allItems = await spoonacularClient.searchMenuItems(restaurantChain, undefined, undefined, undefined, 50);
  
  console.log(`[Menu-Fetcher] ${restaurantChain}: Found ${allItems.length} menu items`);
  
  if (allItems.length === 0) {
    return {
      restaurantChain,
      totalItems: 0,
      verifiedItems: [],
      filteredItems: [],
      cacheHit: false
    };
  }
  
  // Step 2: Get detailed nutrition for items (with smart filtering)
  const itemsNeedingNutrition = selectItemsForNutritionCheck(allItems, userContext);
  console.log(`[Menu-Fetcher] ${restaurantChain}: Checking nutrition for ${itemsNeedingNutrition.length}/${allItems.length} items`);
  
  const nutritionPromises = itemsNeedingNutrition.map(async (item) => {
    try {
      const details = await spoonacularClient.getMenuItemDetails(item.id);
      if (details && details.nutrition.calories > 0) {
        return {
          id: details.id,
          title: details.title,
          restaurantChain: details.restaurantChain,
          calories: details.nutrition.calories,
          protein: details.nutrition.protein,
          carbs: details.nutrition.carbs,
          fat: details.nutrition.fat,
          fiber: details.nutrition.fiber,
          sodium: details.nutrition.sodium,
          image: details.image,
          verified: true,
          priceEstimate: estimateItemPrice(details.title, userContext.surveyData.zipCode)
        } as MenuItemWithNutrition;
      }
      return null;
    } catch (error) {
      console.error(`[Menu-Fetcher] Error getting nutrition for ${item.title}:`, error);
      return null;
    }
  });
  
  const nutritionResults = await Promise.allSettled(nutritionPromises);
  const verifiedItems = nutritionResults
    .filter(result => result.status === 'fulfilled' && result.value !== null)
    .map(result => (result as PromiseFulfilledResult<MenuItemWithNutrition>).value);
  
  // Step 3: Filter items based on user's dietary goals and preferences
  const filteredItems = filterItemsByUserGoals(verifiedItems, userContext);
  
  const duration = Date.now() - startTime;
  console.log(`[Menu-Fetcher] ${restaurantChain}: Completed in ${duration}ms - ${verifiedItems.length} verified, ${filteredItems.length} filtered`);
  
  return {
    restaurantChain,
    totalItems: allItems.length,
    verifiedItems,
    filteredItems,
    cacheHit: false // TODO: Implement cache detection
  };
}

function selectItemsForNutritionCheck(items: any[], userContext: UserContext): any[] {
  // Smart selection to avoid checking nutrition for obviously irrelevant items
  const { surveyData } = userContext;
  
  return items.filter(item => {
    const title = item.title.toLowerCase();
    
    // Skip obvious single ingredients/condiments
    if (title.length < 8 || ['sauce', 'dressing', 'oil', 'vinegar', 'salt', 'pepper'].some(word => title.includes(word))) {
      return false;
    }
    
    // Skip items that don't match dietary restrictions
    if (surveyData.dietPrefs.includes('vegetarian') && ['chicken', 'beef', 'pork', 'bacon', 'meat'].some(word => title.includes(word))) {
      return false;
    }
    
    if (surveyData.dietPrefs.includes('vegan') && ['cheese', 'milk', 'egg', 'cream', 'yogurt', 'chicken', 'beef'].some(word => title.includes(word))) {
      return false;
    }
    
    // Prioritize bowl/salad/main dish items
    const isMainDish = ['bowl', 'salad', 'sandwich', 'wrap', 'burger', 'pizza', 'pasta', 'plate'].some(word => title.includes(word));
    
    return isMainDish || Math.random() > 0.6; // Include some random items for variety
  }).slice(0, 15); // Limit to 15 items per restaurant for API efficiency
}

function filterItemsByUserGoals(items: MenuItemWithNutrition[], userContext: UserContext): MenuItemWithNutrition[] {
  const { surveyData, targetCalories } = userContext;
  
  // Calculate meal-specific calorie targets
  const breakfastTarget = Math.round(targetCalories * 0.25);
  const lunchTarget = Math.round(targetCalories * 0.35);
  const dinnerTarget = Math.round(targetCalories * 0.40);
  
  return items.filter(item => {
    // Basic calorie filtering (flexible ranges)
    const isReasonableCalories = item.calories >= 200 && item.calories <= Math.max(dinnerTarget + 200, 800);
    
    // Protein requirements based on goals
    let minProtein = 15; // Base minimum
    if (surveyData.goal === 'MUSCLE_GAIN') minProtein = 25;
    if (surveyData.goal === 'WEIGHT_LOSS') minProtein = 20;
    
    const meetsProteinGoals = item.protein >= minProtein;
    
    // Dietary restrictions (already partially filtered above)
    const title = item.title.toLowerCase();
    let meetsDietaryReqs = true;
    
    if (surveyData.dietPrefs.includes('low_carb') && item.carbs > 40) {
      meetsDietaryReqs = false;
    }
    
    if (surveyData.dietPrefs.includes('keto') && item.carbs > 20) {
      meetsDietaryReqs = false;
    }
    
    return isReasonableCalories && meetsProteinGoals && meetsDietaryReqs;
  });
}

function estimateItemPrice(itemTitle: string, zipCode: string): string {
  // Return simple price tiers instead of dollar amounts
  const title = itemTitle.toLowerCase();

  // Base tiers by item type
  if (title.includes('smoothie') || title.includes('juice')) return '$';
  if (title.includes('soup')) return '$';
  if (title.includes('sandwich') || title.includes('wrap')) return '$$';
  if (title.includes('salad') || title.includes('bowl')) return '$$$';

  // Regional adjustment for higher cost areas
  const zip = parseInt(zipCode.substring(0, 3));
  let isHighCostArea = false;

  if (zip >= 900 && zip <= 961) isHighCostArea = true; // CA
  if (zip >= 100 && zip <= 149) isHighCostArea = true; // NY
  if (zip >= 10 && zip <= 27) isHighCostArea = true; // MA

  // Add extra $ for high cost areas
  if (isHighCostArea) {
    if (title.includes('smoothie') || title.includes('juice')) return '$$';
    if (title.includes('soup')) return '$$';
    if (title.includes('sandwich') || title.includes('wrap')) return '$$$';
    if (title.includes('salad') || title.includes('bowl')) return '$$$$';
    return '$$$';
  }

  return '$$'; // Default tier
}

export function formatMenuDataForLLM(menuData: RestaurantMenuData[]): string {
  let output = `VERIFIED MENU DATA (${menuData.length} restaurants):\n\n`;
  
  menuData.forEach(restaurant => {
    output += `🏪 ${restaurant.restaurantChain} (${restaurant.filteredItems.length} suitable items):\n`;
    
    restaurant.filteredItems.slice(0, 8).forEach(item => {
      output += `  • ${item.title}: ${item.calories} cal, ${item.protein}g protein, ${item.carbs}g carbs, ${item.fat}g fat`;
      if (item.priceEstimate) output += `, ${item.priceEstimate}`;
      output += ` [VERIFIED]\n`;
    });
    
    if (restaurant.filteredItems.length > 8) {
      output += `  ... and ${restaurant.filteredItems.length - 8} more verified items\n`;
    }
    
    output += '\n';
  });
  
  return output;
}
