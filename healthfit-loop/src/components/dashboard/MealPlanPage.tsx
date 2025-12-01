'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  ArrowLeft,
  Clock,
  Star,
  ExternalLink,
  Home,
  TrendingUp,
  Target,
  Apple,
  Dumbbell,
  User,
  MapPin,
  Plus
} from "lucide-react";
import MealLogModal from "./modals/MealLogModal";

interface MealPlanPageProps {
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
  };
}

export function MealPlanPage({ onNavigate, generationStatus }: MealPlanPageProps) {
  // Generate dynamic days starting from today (4-day plan like original)
  const getDaysStartingFromToday = () => {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayDisplayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = today.getDay();

    const orderedDays = [];
    for (let i = 0; i < 4; i++) { // 4-day plan
      const dayIndex = (todayIndex + i) % 7;
      orderedDays.push({
        id: dayNames[dayIndex],
        name: dayDisplayNames[dayIndex],
        dayNumber: i + 1 // This is the key for matching data
      });
    }
    return orderedDays;
  };

  const getCurrentDay = () => {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return dayNames[today.getDay()];
  };

  const [selectedDay, setSelectedDay] = useState(getCurrentDay());
  const [mealData, setMealData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nutritionTargets, setNutritionTargets] = useState<any>(null);
  const [eatenMeals, setEatenMeals] = useState<{[dayMealKey: string]: boolean}>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [loggedMeals, setLoggedMeals] = useState<any[]>([]);

  const days = getDaysStartingFromToday();

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    } else {
      setLoading(false);
    }

    // Load persisted eaten meals from localStorage (same key as dashboard)
    const savedEatenMeals = localStorage.getItem('eatenMeals');
    console.log('MealPlanPage useEffect - Loading from localStorage:', savedEatenMeals);
    if (savedEatenMeals) {
      const parsed = JSON.parse(savedEatenMeals);
      console.log('MealPlanPage useEffect - Parsed eatenMeals:', parsed);
      setEatenMeals(parsed);
    }
    setIsInitialized(true);

    // Listen for localStorage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'eatenMeals' && e.newValue) {
        console.log('MealPlanPage - localStorage changed in another tab:', e.newValue);
        setEatenMeals(JSON.parse(e.newValue));
      }
    };

    // Listen for custom events from same tab (dashboard)
    const handleEatenMealsUpdate = (e: CustomEvent) => {
      console.log('MealPlanPage - received eatenMealsUpdate event:', e.detail);
      // Only update if the new state is different and has content
      if (e.detail && Object.keys(e.detail).length > 0) {
        setEatenMeals(e.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('eatenMealsUpdate', handleEatenMealsUpdate as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('eatenMealsUpdate', handleEatenMealsUpdate as EventListener);
    };
  }, [generationStatus.mealsGenerated]);

  // Save eaten meals to localStorage whenever it changes (same as dashboard)
  useEffect(() => {
    // Only save and dispatch if we're initialized and have some data
    if (isInitialized && Object.keys(eatenMeals).length > 0) {
      console.log('MealPlanPage - Saving to localStorage:', eatenMeals);
      localStorage.setItem('eatenMeals', JSON.stringify(eatenMeals));
      console.log('MealPlanPage - Saved to localStorage, checking:', localStorage.getItem('eatenMeals'));

      // Dispatch custom event to notify other components in the same tab (like dashboard)
      const event = new CustomEvent('eatenMealsUpdate', { detail: eatenMeals });
      window.dispatchEvent(event);
    }
  }, [eatenMeals, isInitialized]);

  const fetchMealData = async () => {
    try {
      const response = await fetch('/api/ai/meals/current');
      if (response.ok) {
        const data = await response.json();
        setMealData(data);
        setNutritionTargets(data.mealPlan?.nutritionTargets);
        console.log('Fetched meal data:', data);
        console.log('Nutrition targets:', data.mealPlan?.nutritionTargets);
      }
    } catch (error) {
      console.error('Failed to fetch meal data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get current day's meals - simplified like workouts
  const getCurrentMeals = () => {
    if (mealData && mealData.mealPlan && mealData.mealPlan.planData && mealData.mealPlan.planData.weeklyPlan) {
      console.log('Looking for meals for day:', selectedDay, 'in data:', mealData.mealPlan.planData.weeklyPlan);

      // Find which day number corresponds to our selected day
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      const dayNumber = selectedDayInfo?.dayNumber || 1;

      // Find the meal data for this day
      const dayMeals = mealData.mealPlan.planData.weeklyPlan.find((day: any) => {
        console.log('Checking day:', day.day, 'against dayNumber:', dayNumber);
        return day.day === dayNumber;
      });

      if (dayMeals) {
        console.log('Found meals for day:', dayMeals);
        console.log('dayMeals.breakfast structure:', dayMeals.breakfast);
        console.log('dayMeals.lunch structure:', dayMeals.lunch);
        console.log('dayMeals.dinner structure:', dayMeals.dinner);
        return {
          breakfast: dayMeals.breakfast,
          lunch: dayMeals.lunch,
          dinner: dayMeals.dinner
        };
      }
    }

    // No real meal data available
    console.log('No real meal data found - showing empty state');
    return {
      breakfast: null,
      lunch: null,
      dinner: null
    };
  };

  const currentMeals = getCurrentMeals();

  // Calculate totals based on selected meals for current day
  const getTotalCalories = () => {
    let total = 0;

    // Get the selected meals for the current day
    const dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    if (dayData) {
      // Check all possible eaten meal options for each meal type
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType];

        // Check primary option
        if (meal?.primary?.calories && isMealEaten(mealType, 0, 'primary')) {
          total += meal.primary.calories;
        }

        // Check alternative options
        meal?.alternatives?.forEach((alt: any, index: number) => {
          if (alt?.calories && isMealEaten(mealType, index, 'alternative')) {
            total += alt.calories;
          }
        });
      });
    }

    return total;
  };

  // Calculate total protein for the selected day
  const getTotalProtein = () => {
    let total = 0;

    const dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    if (dayData) {
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType];

        // Check primary option
        if (meal?.primary?.protein && isMealEaten(mealType, 0, 'primary')) {
          total += meal.primary.protein;
        }

        // Check alternative options
        meal?.alternatives?.forEach((alt: any, index: number) => {
          if (alt?.protein && isMealEaten(mealType, index, 'alternative')) {
            total += alt.protein;
          }
        });
      });
    }

    return Math.round(total);
  };

  // Calculate total carbs for the selected day
  const getTotalCarbs = () => {
    let total = 0;

    const dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    if (dayData) {
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType];

        // Check primary option
        if (meal?.primary?.carbs && isMealEaten(mealType, 0, 'primary')) {
          total += meal.primary.carbs;
        }

        // Check alternative options
        meal?.alternatives?.forEach((alt: any, index: number) => {
          if (alt?.carbs && isMealEaten(mealType, index, 'alternative')) {
            total += alt.carbs;
          }
        });
      });
    }

    return Math.round(total);
  };

  // Calculate total fat for the selected day
  const getTotalFat = () => {
    let total = 0;

    const dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    if (dayData) {
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType];

        // Check primary option
        if (meal?.primary?.fat && isMealEaten(mealType, 0, 'primary')) {
          total += meal.primary.fat;
        }

        // Check alternative options
        meal?.alternatives?.forEach((alt: any, index: number) => {
          if (alt?.fat && isMealEaten(mealType, index, 'alternative')) {
            total += alt.fat;
          }
        });
      });
    }

    return Math.round(total);
  };

  // Toggle meal eaten status for specific meal option
  const toggleMealEaten = (mealType: string, optionIndex: number = 0, optionType: 'primary' | 'alternative' = 'primary') => {
    const mealKey = `${selectedDay}-${mealType}-${optionType}-${optionIndex}`;
    console.log('MealPlanPage - toggleMealEaten called');
    console.log('MealPlanPage - selectedDay:', selectedDay);
    console.log('MealPlanPage - mealKey:', mealKey);
    console.log('MealPlanPage - current eatenMeals:', eatenMeals);

    setEatenMeals(prev => {
      const newState = {
        ...prev,
        [mealKey]: !prev[mealKey]
      };
      console.log('MealPlanPage - new eatenMeals state:', newState);
      return newState;
    });
  };

  // Check if a specific meal option is eaten
  const isMealEaten = (mealType: string, optionIndex: number = 0, optionType: 'primary' | 'alternative' = 'primary') => {
    const mealKey = `${selectedDay}-${mealType}-${optionType}-${optionIndex}`;
    return eatenMeals[mealKey] || false;
  };

  // Handle meal logging
  const handleMealLog = (mealData: any) => {
    const newMeal = {
      ...mealData,
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setLoggedMeals(prev => [newMeal, ...prev]);
    setShowLogModal(false);
  };

  const deleteMeal = (mealId: string) => {
    setLoggedMeals(prev => prev.filter(m => m.id !== mealId));
  };

  const totalCalories = getTotalCalories();

  const MealCard = ({ meal, type }: { meal: any, type: string }) => {
    const [showRecipe, setShowRecipe] = useState(false);
    const [recipeData, setRecipeData] = useState<any>(null);
    const [loadingRecipe, setLoadingRecipe] = useState(false);
    const [showAlternatives, setShowAlternatives] = useState(false);
    const [userRating, setUserRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);

    if (!meal || !meal.primary) return null;

    const allOptions = [meal.primary, ...(meal.alternatives || [])];

    const handleRecipeClick = async (selectedMeal: any) => {
      const isRestaurant = selectedMeal.source === "restaurant";
      const mealName = isRestaurant ? selectedMeal.dish : selectedMeal.name;
      const description = isRestaurant ? selectedMeal.dish_description : selectedMeal.description;

      if (isRestaurant) {
        const orderingUrl = selectedMeal.orderingUrl || selectedMeal.website || selectedMeal.menu_url;
        if (orderingUrl) {
          window.open(orderingUrl, '_blank');
        } else {
          // Create a more comprehensive search query with location
          const searchTerm = `${selectedMeal.restaurant || selectedMeal.name} order online menu delivery`;
          const searchQuery = encodeURIComponent(searchTerm);
          window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
        }
        return;
      }

      if (recipeData) {
        setShowRecipe(true);
        return;
      }

      setLoadingRecipe(true);
      try {
        const response = await fetch('/api/ai/recipes/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dishName: mealName,
            description: description,
            mealType: type
          })
        });

        if (response.ok) {
          const data = await response.json();
          setRecipeData(data.recipe);
          setShowRecipe(true);
        }
      } catch (error) {
        console.error('Failed to generate recipe:', error);
      } finally {
        setLoadingRecipe(false);
      }
    };

    const handleRating = (rating: number) => {
      setUserRating(rating);
    };

    const SingleMealOption = ({
      mealOption,
      isAlternative = false,
      optionIndex = 0,
      optionType = 'primary'
    }: {
      mealOption: any,
      isAlternative?: boolean,
      optionIndex?: number,
      optionType?: 'primary' | 'alternative'
    }) => {
      const isRestaurant = mealOption.source === "restaurant";
      const mealName = isRestaurant ? mealOption.dish : mealOption.name;
      const description = isRestaurant ?
        (mealOption.dish_description || mealOption.description) :
        (mealOption.description || mealOption.dish_description);

      // Get goal reasoning and customer feedback from API
      const goalReasoning = mealOption.goalReasoning;
      const customerFeedback = isRestaurant ? mealOption.restaurant_description : null;

      return (
        <div className={`flex items-start space-x-4 p-4 bg-white border rounded-lg hover:shadow-sm transition-shadow ${isAlternative ? 'border-gray-200' : 'border-purple-200'}`}>
          {/* Image - Left aligned */}
          <div className="flex-shrink-0">
            <ImageWithFallback
              src={mealOption.imageUrl || mealOption.image || "https://images.unsplash.com/photo-1662993924949-2b2d68c08cee"}
              alt={mealName || `${type} meal`}
              className="w-16 h-16 object-cover rounded-lg"
            />
          </div>

          {/* Content - Right side */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-black text-sm leading-tight">
                  {mealName || `${type} option`}
                </h3>
                {isRestaurant && mealOption.restaurant && (
                  <p className="text-xs text-gray-600 mt-1">
                    {mealOption.restaurant}
                    {mealOption.price && <span className="ml-2 text-purple-600 font-medium">${mealOption.price}</span>}
                  </p>
                )}
                {/* Nutrition information */}
                {mealOption.calories && (
                  <div className="text-xs text-green-600 font-medium mt-1 space-y-1">
                    <p>{mealOption.calories} calories</p>
                    {(mealOption.protein || mealOption.carbs || mealOption.fat) && (
                      <p className="text-gray-600">
                        {mealOption.protein && `${Math.round(mealOption.protein)}g protein`}
                        {mealOption.protein && mealOption.carbs && ' • '}
                        {mealOption.carbs && `${Math.round(mealOption.carbs)}g carbs`}
                        {(mealOption.protein || mealOption.carbs) && mealOption.fat && ' • '}
                        {mealOption.fat && `${Math.round(mealOption.fat)}g fat`}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end space-y-2">
                {/* Eaten Checkbox - show for all meal options */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={isMealEaten(type, optionIndex, optionType)}
                    onChange={() => toggleMealEaten(type, optionIndex, optionType)}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <span className="text-xs text-gray-600">Eaten</span>
                </div>

                <Badge
                  variant="secondary"
                  className="text-xs flex-shrink-0 bg-purple-50 text-purple-700 border-purple-200"
                >
                  {isRestaurant ? 'Restaurant' : 'Home'}
                </Badge>
                {/* Calorie badge for easier visibility */}
                {mealOption.calories && (
                  <Badge
                    variant="outline"
                    className="text-xs flex-shrink-0 bg-green-50 text-green-700 border-green-200"
                  >
                    {mealOption.calories} cal
                  </Badge>
                )}
              </div>
            </div>

            {/* Description */}
            {description ? (
              <p className="text-xs text-gray-600 mb-2 leading-relaxed">{description}</p>
            ) : (
              <p className="text-xs text-gray-500 mb-2 leading-relaxed italic">
                {isRestaurant ? 'Restaurant meal option' : 'Homemade meal option'}
              </p>
            )}

            {/* Goal Reasoning */}
            {goalReasoning && (
              <div className="mb-2 p-2 bg-purple-50 border border-purple-100 rounded text-xs">
                <p className="text-purple-700 italic">"{goalReasoning}"</p>
              </div>
            )}

            {/* Customer Feedback for Restaurants */}
            {customerFeedback && (
              <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
                <p className="text-gray-700 italic">"{customerFeedback}"</p>
                <p className="text-gray-500 text-xs mt-1">— Customer review via Google Places</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              {/* Interactive Star Rating */}
              <div className="flex space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRating(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    className="transition-colors duration-150"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        star <= (hoveredStar || userRating)
                          ? 'text-purple-500 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRecipeClick(mealOption)}
                disabled={loadingRecipe}
                className="text-xs px-3 py-1 h-7 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                {loadingRecipe ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isRestaurant ? (
                  "Order"
                ) : (
                  "Recipe"
                )}
              </Button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <>
        <div className="space-y-3 mb-6">
          {/* Primary Option */}
          <SingleMealOption
            mealOption={meal.primary}
            optionIndex={0}
            optionType="primary"
          />

          {/* Show first alternative if exists */}
          {meal.alternatives && meal.alternatives.length > 0 && (
            <SingleMealOption
              mealOption={meal.alternatives[0]}
              isAlternative={true}
              optionIndex={0}
              optionType="alternative"
            />
          )}

          {/* Show more alternatives toggle */}
          {meal.alternatives && meal.alternatives.length > 1 && (
            <>
              <button
                onClick={() => setShowAlternatives(!showAlternatives)}
                className="w-full p-2 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                {showAlternatives ? 'Hide' : 'Show'} {meal.alternatives.length - 1} more option{meal.alternatives.length > 2 ? 's' : ''}
              </button>

              {/* Additional alternatives */}
              {showAlternatives && (
                <div className="space-y-3">
                  {meal.alternatives.slice(1).map((alt: any, index: number) => (
                    <SingleMealOption
                      key={index}
                      mealOption={alt}
                      isAlternative={true}
                      optionIndex={index + 1}
                      optionType="alternative"
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Recipe Modal - Clean & Professional */}
        {showRecipe && recipeData && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-lg max-w-3xl max-h-[90vh] overflow-y-auto w-full">
              {/* Header */}
              <div className="border-b border-gray-200 p-4 sm:p-6 bg-gradient-to-r from-purple-50 to-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{recipeData.name}</h2>
                    <p className="text-gray-600 mt-1 text-xs sm:text-sm">{recipeData.description}</p>
                  </div>
                  <button
                    onClick={() => setShowRecipe(false)}
                    className="w-8 h-8 text-gray-400 hover:text-gray-600 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
                  >
                    <span className="text-lg">×</span>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                {/* Recipe Overview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{recipeData.prepTime}</div>
                      <div className="text-xs text-gray-600">Prep Time</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{recipeData.cookTime}</div>
                      <div className="text-xs text-gray-600">Cook Time</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{recipeData.servings}</div>
                      <div className="text-xs text-gray-600">Servings</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{recipeData.difficulty}</div>
                      <div className="text-xs text-gray-600">Difficulty</div>
                    </div>
                  </div>
                </div>

                {/* Ingredients */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <div className="w-1 h-6 bg-purple-600 rounded-full mr-3"></div>
                    Ingredients
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recipeData.groceryList?.map((item: any, index: number) => (
                      <div key={index} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <span className="w-6 h-6 bg-purple-600 text-white rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm text-gray-900">{item.amount} {item.ingredient}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <div className="w-1 h-6 bg-purple-600 rounded-full mr-3"></div>
                    Instructions
                  </h3>
                  <div className="space-y-4">
                    {recipeData.instructions?.map((step: string, index: number) => (
                      <div key={index} className="flex space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <span className="w-7 h-7 bg-purple-600 text-white rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </span>
                        <p className="text-sm text-gray-900 leading-relaxed flex-1">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nutrition */}
                {recipeData.nutrition && (
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-green-600 rounded-full mr-3"></div>
                      Nutrition Facts
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                        <div className="text-lg font-semibold text-green-600">{recipeData.nutrition.calories}</div>
                        <div className="text-xs text-gray-600">Calories</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-blue-200">
                        <div className="text-lg font-semibold text-blue-600">{recipeData.nutrition.protein}g</div>
                        <div className="text-xs text-gray-600">Protein</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-orange-200">
                        <div className="text-lg font-semibold text-orange-600">{recipeData.nutrition.carbs}g</div>
                        <div className="text-xs text-gray-600">Carbs</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-yellow-200">
                        <div className="text-lg font-semibold text-yellow-600">{recipeData.nutrition.fat}g</div>
                        <div className="text-xs text-gray-600">Fat</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const LoadingState = () => (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h3 className="text-xl font-medium text-neutral-900 mb-2">Generating Your Meal Plan</h3>
      <p className="text-neutral-600">
        Creating personalized meal options based on your preferences...
      </p>
    </div>
  );

  if (!generationStatus.mealsGenerated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10">
        {/* Header */}
        <div className="bg-white border-b border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("dashboard")}
                className="mr-3 text-neutral-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-medium text-neutral-900">Meals</h1>
                <p className="text-sm text-neutral-600">Your nutrition plan</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <Card className="border-0 shadow-subtle bg-white">
            <CardContent className="p-8">
              <LoadingState />
            </CardContent>
          </Card>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
          <div className="max-w-md mx-auto grid grid-cols-5 h-16">
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("dashboard")}
            >
              <img src="/fytr-icon.svg" alt="Home" className="w-5 h-5 mb-1" />
              <span className="text-xs">Home</span>
            </button>
            <button className="flex flex-col items-center justify-center text-primary">
              <Apple className="w-5 h-5 mb-1" />
              <span className="text-xs">Meals</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("workout-plan")}
            >
              <Dumbbell className="w-5 h-5 mb-1" />
              <span className="text-xs">Workouts</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("progress")}
            >
              <TrendingUp className="w-5 h-5 mb-1" />
              <span className="text-xs">Progress</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("account")}
            >
              <User className="w-5 h-5 mb-1" />
              <span className="text-xs">Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("dashboard")}
              className="mr-2 sm:mr-3 text-neutral-600 p-1 sm:p-2"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-medium text-neutral-900">Meals</h1>
              <p className="text-xs sm:text-sm text-neutral-600">Your nutrition plan</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-primary border-primary hover:bg-primary/5 text-xs sm:text-sm px-2 sm:px-4"
          >
            <span className="hidden sm:inline">Generate New</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Week Navigation */}
        <div className="mb-6">
          <div className="flex justify-center space-x-2 overflow-x-auto pb-2 px-2">
            {days.map((day) => (
              <Button
                key={day.id}
                variant={selectedDay === day.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log('Meal day clicked:', day.id, 'Current selectedDay:', selectedDay);
                  setSelectedDay(day.id);
                }}
                className={`min-w-16 sm:min-w-20 flex flex-col p-2 sm:p-3 h-auto transition-all duration-200 flex-shrink-0 ${
                  selectedDay === day.id
                    ? "bg-red-600 text-white shadow-lg"
                    : "border-neutral-200 hover:border-red-300 hover:bg-red-50 bg-white"
                }`}
              >
                <span className="font-medium text-xs sm:text-sm">{day.name}</span>
                <span className="text-xs opacity-70">Day {day.dayNumber}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Daily Overview - Compact */}
        <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base font-semibold capitalize text-black">{selectedDay}</span>
            <div className="flex items-center space-x-3 text-sm text-gray-600">
              <span>{currentMeals.breakfast ? 1 : 0}B</span>
              <span>{currentMeals.lunch ? 1 : 0}L</span>
              <span>{currentMeals.dinner ? 1 : 0}D</span>
            </div>
          </div>

          {/* Enhanced Nutrition Tracking */}
          {nutritionTargets && (
            <div className="space-y-3">
              {/* Daily Progress Bars */}
              <div className="grid grid-cols-1 gap-3">
                {/* Calories Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600">Calories</span>
                    <span className="text-gray-800 font-medium">
                      {totalCalories}/{Math.round(nutritionTargets.dailyCalories/100)*100} cal
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        totalCalories > nutritionTargets.dailyCalories * 1.1 ? 'bg-red-500' :
                        totalCalories >= nutritionTargets.dailyCalories * 0.8 ? 'bg-green-500' :
                        'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min((totalCalories / nutritionTargets.dailyCalories) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Protein Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600">Protein</span>
                    <span className="text-gray-800 font-medium">
                      {getTotalProtein()}g/~{Math.round(nutritionTargets.dailyProtein/10)*10}g
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        getTotalProtein() >= nutritionTargets.dailyProtein * 0.8 ? 'bg-blue-500' : 'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min((getTotalProtein() / nutritionTargets.dailyProtein) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Meals */}
        <div className="space-y-6 pb-20 sm:pb-24">

          {currentMeals.breakfast ? (
            <>
              <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3 mb-3">Breakfast</h3>
              <MealCard meal={currentMeals.breakfast} type="breakfast" />
            </>
          ) : (
            <div className="text-center py-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-600 text-sm">No breakfast data available for {selectedDay}</p>
            </div>
          )}

          {currentMeals.lunch ? (
            <>
              <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3 mb-3">Lunch</h3>
              <MealCard meal={currentMeals.lunch} type="lunch" />
            </>
          ) : (
            <div className="text-center py-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-600 text-sm">No lunch data available for {selectedDay}</p>
            </div>
          )}

          {currentMeals.dinner ? (
            <>
              <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3 mb-3">Dinner</h3>
              <MealCard meal={currentMeals.dinner} type="dinner" />
            </>
          ) : (
            <div className="text-center py-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-600 text-sm">No dinner data available for {selectedDay}</p>
            </div>
          )}

          {/* Logged Meals History */}
          {loggedMeals.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-[#c1272d] border-l-4 border-[#c1272d] pl-3 mb-4">Logged Alternative Meals</h3>
              <div className="space-y-3">
                {loggedMeals.map((meal) => (
                  <div key={meal.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-semibold text-gray-900">{meal.mealName}</h4>
                          <span className="text-xs bg-[#c1272d] text-white px-2 py-1 rounded-full">{meal.mealType}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{meal.description}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>{meal.calories} cal</span>
                          <span>{meal.protein}g protein</span>
                          <span>{meal.carbs}g carbs</span>
                          <span>{meal.fat}g fat</span>
                          <span>{meal.time}</span>
                        </div>
                        {meal.notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">{meal.notes}</p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteMeal(meal.id)}
                        className="text-gray-400 hover:text-red-500 ml-4"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Log Alternative Meal Button */}
          <div className="mt-6">
            <Button
              onClick={() => setShowLogModal(true)}
              className="w-full bg-[#c1272d] hover:bg-red-700 text-white py-4 flex items-center justify-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Log Alternative Meal</span>
            </Button>
          </div>

          {!currentMeals.breakfast && !currentMeals.lunch && !currentMeals.dinner && (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
              <p className="text-gray-600 text-lg font-medium">No meal data available for {selectedDay}</p>
              <p className="text-sm text-gray-500 mt-2">Meal recommendations will appear here once generated</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("dashboard")}
          >
            <img src="/fytr-icon.svg" alt="Home" className="w-5 h-5 mb-1" />
            <span className="text-xs">Home</span>
          </button>
          <button className="flex flex-col items-center justify-center text-primary">
            <Apple className="w-5 h-5 mb-1" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("workout-plan")}
          >
            <Dumbbell className="w-5 h-5 mb-1" />
            <span className="text-xs">Workouts</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("progress")}
          >
            <TrendingUp className="w-5 h-5 mb-1" />
            <span className="text-xs">Progress</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("account")}
          >
            <User className="w-5 h-5 mb-1" />
            <span className="text-xs">Account</span>
          </button>
        </div>
      </div>

      {/* Meal Log Modal */}
      {showLogModal && (
        <MealLogModal
          onClose={() => setShowLogModal(false)}
          onSave={handleMealLog}
          selectedDay={selectedDay}
        />
      )}
    </div>
  );
}