// Shared utilities and types for AI prompts
import { SurveyResponse } from '@prisma/client';

// User context interface used across multiple prompt functions
export interface UserContext {
  surveyData: SurveyResponse;
  weekOf: string;
  weekNumber?: number;
  targetCalories: number;
  weeklyBudgetCents: number;
  mealsOutPerWeek: number;
  homeMealsPerWeek: number;
  learnedPreferences?: {
    preferredCuisines: string[];
    avoidedFoods: string[];
    portionSizeMultiplier: number;
  };
}

// Helper function to get days starting from current day
export function getDaysStartingFromToday(): string[] {
  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayIndex = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Create array starting from today
  const orderedDays = [
    ...dayNames.slice(todayIndex),    // Days from today to end of week
    ...dayNames.slice(0, todayIndex)  // Days from start of week to yesterday
  ];

  return orderedDays;
}

export function getCurrentDayInfo() {
  const today = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDay = dayNames[today.getDay()];
  const orderedDays = getDaysStartingFromToday();

  return {
    currentDay,
    orderedDays,
    dayIndex: today.getDay()
  };
}

// Smart meal distribution based on user's eating out preference
export function getMealDistributionStrategy(mealsOutPerWeek: number, homeMealsPerWeek: number): string {
  const totalMeals = 21; // 7 days × 3 meals

  if (mealsOutPerWeek <= 0) {
    return "FULL HOME COOKING MODE: Generate all 21 meals as home recipes with variety across breakfast, lunch, and dinner.";
  }

  if (mealsOutPerWeek >= 21) {
    return "FULL RESTAURANT MODE: Generate all 21 meals as restaurant options. Focus on variety across different cuisines and price points.";
  }

  // Strategic distribution for partial eating out
  let strategy = `STRATEGIC DISTRIBUTION (${mealsOutPerWeek} restaurant, ${homeMealsPerWeek} home):
`;

  // Low restaurant meals (1-7): Focus on dinner primarily, some lunches
  if (mealsOutPerWeek <= 7) {
    strategy += `• PRIORITY: Dinners first (most social meal type)
• SECONDARY: Lunches (convenience during work)
• AVOID: Restaurant breakfasts (usually rushed/simple)
• PATTERN: Spread across ${Math.min(mealsOutPerWeek, 7)} different days
• GOAL: One restaurant meal per day max, prioritize weekends for special dinners`;
  }
  // Medium restaurant meals (8-14): Cover most dinners + some lunches
  else if (mealsOutPerWeek <= 14) {
    strategy += `• PRIORITY: All 7 dinners as restaurant options (social + variety)
• SECONDARY: ${mealsOutPerWeek - 7} lunches for workday convenience
• PATTERN: 2 meals on ${Math.ceil((mealsOutPerWeek - 7) / 1)} days (lunch + dinner)
• GOAL: Balanced mix with dinners always covered, strategic lunch coverage`;
  }
  // High restaurant meals (15-20): Nearly full coverage except strategic home meals
  else {
    const homeBreakfasts = Math.max(7 - Math.floor((mealsOutPerWeek - 14) / 3), 0);
    const homeLunches = Math.max(7 - Math.floor((mealsOutPerWeek - 14) / 3), 0);

    strategy += `• PATTERN: Restaurant-heavy with strategic home cooking
• BREAKFASTS: Mix of ${7 - homeBreakfasts} restaurant + ${homeBreakfasts} home (quick/healthy starts)
• LUNCHES: Mostly restaurant for convenience
• DINNERS: Mostly restaurant for variety + social
• HOME FOCUS: Keep ${homeMealsPerWeek} easiest/healthiest home meals for balance`;
  }

  strategy += `

EXECUTION RULES:
• Ensure EXACTLY ${mealsOutPerWeek} restaurant options (option 1) across the week
• Ensure EXACTLY ${homeMealsPerWeek} home recipes (option 2) across the week
• When a meal has restaurant option 1, make option 2 a complementary home recipe
• When a meal has home option 1, make option 2 a restaurant alternative
• Distribute restaurant meals across different days when possible (avoid 3 restaurant meals on same day)`;

  return strategy;
}