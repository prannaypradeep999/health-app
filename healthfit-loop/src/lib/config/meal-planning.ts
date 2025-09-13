// Dynamic configuration for meal planning calculations
export const NUTRITION_CONFIG = {
    // Basal Metabolic Rate calculation (Mifflin-St Jeor Equation)
    BMR_MALE: (weight: number, height: number, age: number) => 
      10 * weight + 6.25 * height - 5 * age + 5,
    BMR_FEMALE: (weight: number, height: number, age: number) => 
      10 * weight + 6.25 * height - 5 * age - 161,
    
    // Activity level multipliers
    ACTIVITY_MULTIPLIERS: {
      'sedentary': 1.2,
      'lightly_active': 1.375,
      'moderately_active': 1.55,
      'very_active': 1.725,
      'extra_active': 1.9
    },
    
    // Goal adjustments (calories)
    GOAL_ADJUSTMENTS: {
      'WEIGHT_LOSS': -500,
      'MUSCLE_GAIN': 300,
      'ENDURANCE': 200,
      'GENERAL_WELLNESS': 0
    },
    
    // Macro targets (percentage of calories)
    MACRO_TARGETS: {
      'WEIGHT_LOSS': { protein: 0.30, carbs: 0.35, fat: 0.35 },
      'MUSCLE_GAIN': { protein: 0.35, carbs: 0.40, fat: 0.25 },
      'ENDURANCE': { protein: 0.20, carbs: 0.55, fat: 0.25 },
      'GENERAL_WELLNESS': { protein: 0.25, carbs: 0.45, fat: 0.30 }
    }
  };
  
  export const BUDGET_CONFIG = {
    // Weekly budget tiers (in cents)
    TIERS: {
      'low': { base: 4000, multiplier: 1.0 },      // $40/week base
      'medium': { base: 7000, multiplier: 1.2 },   // $70/week base  
      'high': { base: 10000, multiplier: 1.5 },    // $100/week base
      'premium': { base: 15000, multiplier: 2.0 }  // $150/week base
    },
    
    // Regional cost adjustments by state/area
    REGIONAL_MULTIPLIERS: {
      'CA': 1.3, // California
      'NY': 1.25, // New York
      'MA': 1.2, // Massachusetts
      'HI': 1.4, // Hawaii
      'default': 1.0
    } as Record<string, number>,
    
    // Delivery/service fees
    DELIVERY_FEE_PERCENT: 0.25 // 25% markup for delivery, tax, tip
  };
  
  export const PRICE_ESTIMATES = {
    // Restaurant price estimates by type and region
    RESTAURANT_RANGES: {
      'fast_food': { min: 800, max: 1500 },    // $8-15
      'fast_casual': { min: 1200, max: 2000 }, // $12-20
      'casual_dining': { min: 1800, max: 3500 }, // $18-35
      'upscale': { min: 3000, max: 6000 }      // $30-60
    },
    
    // Home meal estimates per serving
    HOME_MEAL_BASE: {
      'breakfast': 400, // $4
      'lunch': 600,     // $6  
      'dinner': 800     // $8
    }
  };
  
  // Calculate target calories using proper BMR formula
  export function calculateTargetCalories(
    age: number,
    sex: string,
    weight: number, // kg
    height: number, // cm
    activityLevel: string,
    goal: string
  ): number {
    const bmr = sex.toLowerCase() === 'male' 
      ? NUTRITION_CONFIG.BMR_MALE(weight, height, age)
      : NUTRITION_CONFIG.BMR_FEMALE(weight, height, age);
    
    const activityMultiplier = NUTRITION_CONFIG.ACTIVITY_MULTIPLIERS[activityLevel as keyof typeof NUTRITION_CONFIG.ACTIVITY_MULTIPLIERS] || 1.2;
    const goalAdjustment = NUTRITION_CONFIG.GOAL_ADJUSTMENTS[goal as keyof typeof NUTRITION_CONFIG.GOAL_ADJUSTMENTS] || 0;
    
    return Math.round(bmr * activityMultiplier + goalAdjustment);
  }
  
  // Calculate weekly budget with regional adjustment
  export function calculateWeeklyBudget(budgetTier: string, zipCode: string): number {
    const tierConfig = BUDGET_CONFIG.TIERS[budgetTier as keyof typeof BUDGET_CONFIG.TIERS] || BUDGET_CONFIG.TIERS.medium;
    
    // Extract state from zipcode (simplified - could use proper zipcode lookup)
    const state = getStateFromZipCode(zipCode);
    const regionalMultiplier = BUDGET_CONFIG.REGIONAL_MULTIPLIERS[state] || BUDGET_CONFIG.REGIONAL_MULTIPLIERS.default;
    
    return Math.round(tierConfig.base * tierConfig.multiplier * regionalMultiplier);
  }
  
  // Estimate meal price by restaurant type and region
  export function estimateMealPrice(restaurantType: string, mealType: string, zipCode: string): number {
    const baseRange = PRICE_ESTIMATES.RESTAURANT_RANGES[restaurantType as keyof typeof PRICE_ESTIMATES.RESTAURANT_RANGES] || PRICE_ESTIMATES.RESTAURANT_RANGES.fast_casual;
    const state = getStateFromZipCode(zipCode);
    const regionalMultiplier = BUDGET_CONFIG.REGIONAL_MULTIPLIERS[state] || 1.0;
    
    // Random price within range, adjusted for region
    const basePrice = Math.floor(Math.random() * (baseRange.max - baseRange.min)) + baseRange.min;
    return Math.round(basePrice * regionalMultiplier);
  }
  
  // Estimate home meal cost
  export function estimateHomeMealPrice(mealType: string, zipCode: string): number {
    const basePrice = PRICE_ESTIMATES.HOME_MEAL_BASE[mealType as keyof typeof PRICE_ESTIMATES.HOME_MEAL_BASE] || 600;
    const state = getStateFromZipCode(zipCode);
    const regionalMultiplier = BUDGET_CONFIG.REGIONAL_MULTIPLIERS[state] || 1.0;
    
    return Math.round(basePrice * regionalMultiplier);
  }
  
  // Simple state extraction from zipcode (basic implementation)
  function getStateFromZipCode(zipCode: string): string {
    const zip = parseInt(zipCode.substring(0, 3));
    
    if (zip >= 900 && zip <= 961) return 'CA';
    if (zip >= 100 && zip <= 149) return 'NY';
    if (zip >= 10 && zip <= 27) return 'MA';
    if (zip >= 967 && zip <= 968) return 'HI';
    
    return 'default';
  }
