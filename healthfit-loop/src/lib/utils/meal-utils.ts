export interface CollectedMeal {
  id: string;
  day: string;
  mealType: string;
  option: 'primary' | 'alternative';
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'home' | 'restaurant';
  restaurantName?: string;
  cuisine?: string;
  estimatedPrice?: string;
  ingredients?: string[];
  description?: string;
  originalData: any; // Keep reference to original meal data
}

export function collectAllMeals(planData: any): CollectedMeal[] {
  const meals: CollectedMeal[] = [];
  const days = planData?.days || [];

  days.forEach((dayData: any) => {
    const dayName = dayData.day;
    const dayMeals = dayData.meals || {};

    ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
      const mealSlot = dayMeals[mealType];
      if (!mealSlot) return;

      // Collect primary option
      if (mealSlot.primary) {
        meals.push(extractMealInfo(mealSlot.primary, dayName, mealType, 'primary'));
      }

      // Collect alternative option
      if (mealSlot.alternative) {
        meals.push(extractMealInfo(mealSlot.alternative, dayName, mealType, 'alternative'));
      }
    });
  });

  return meals;
}

function extractMealInfo(
  meal: any,
  day: string,
  mealType: string,
  option: 'primary' | 'alternative'
): CollectedMeal {
  const isRestaurant = meal.source === 'restaurant';

  return {
    id: `${day}-${mealType}-${option}`,
    day,
    mealType,
    option,
    name: meal.name || meal.dish || meal.description || 'Unnamed Meal',
    calories: meal.calories || meal.estimatedCalories || 0,
    protein: meal.protein || 0,
    carbs: meal.carbs || 0,
    fat: meal.fat || 0,
    source: isRestaurant ? 'restaurant' : 'home',
    restaurantName: meal.restaurantName || meal.restaurant,
    cuisine: meal.cuisine,
    estimatedPrice: meal.estimatedPrice || meal.price,
    ingredients: meal.ingredients,
    description: meal.description,
    originalData: meal,
  };
}