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
  ArrowSquareOut,
  House,
  ChartLineUp,
  Target,
  ForkKnife,
  Barbell,
  UserCircle,
  MapPin,
  Plus,
  Calendar,
  ShoppingCart,
} from "@phosphor-icons/react";
import MealLogModal from "./modals/MealLogModal";
import { GroceryListSection } from './GroceryListSection';
import { RestaurantListSection } from './RestaurantListSection';

interface MealPlanPageProps {
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
  };
}

export function MealPlanPage({ onNavigate, generationStatus }: MealPlanPageProps) {
  // Generate dynamic days starting from today (7-day plan)
  const getDaysStartingFromToday = () => {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayDisplayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = today.getDay();

    const orderedDays = [];
    for (let i = 0; i < 7; i++) { // 7-day plan
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
  const [activeTab, setActiveTab] = useState<'meals' | 'grocery' | 'restaurants'>('meals');
  const [checkedGroceryItems, setCheckedGroceryItems] = useState<{[key: string]: boolean}>({});
  const [selectedMealOptions, setSelectedMealOptions] = useState<{[key: string]: 'primary' | 'alternative'}>({});

  // Recipe modal state - lifted to parent to prevent reset on re-render
  const [activeRecipeModal, setActiveRecipeModal] = useState<{
    mealType: string;
    recipeData: any;
  } | null>(null);

  // Loading state for recipe generation - also lifted to parent
  const [loadingRecipeMeal, setLoadingRecipeMeal] = useState<string | null>(null);

  // ADD: Meal feedback state
  const [mealFeedback, setMealFeedback] = useState<{
    [mealOptionId: string]: 'loved' | 'disliked' | 'neutral' | null
  }>({});
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null);

  const days = getDaysStartingFromToday();

  // Get selected option for a specific meal
  const getSelectedOption = (day: string, mealType: string): 'primary' | 'alternative' => {
    return selectedMealOptions[`${day}-${mealType}`] || 'primary';
  };

  // Toggle selected option for a specific meal
  const toggleMealOption = (day: string, mealType: string) => {
    const key = `${day}-${mealType}`;
    setSelectedMealOptions(prev => ({
      ...prev,
      [key]: prev[key] === 'alternative' ? 'primary' : 'alternative'
    }));
  };

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    } else {
      setLoading(false);
    }

    // Load persisted eaten meals from localStorage (same key as dashboard)
    const savedEatenMeals = localStorage.getItem('eatenMeals');
    if (savedEatenMeals) {
      const parsed = JSON.parse(savedEatenMeals);
      console.log('[MealPlan] Loaded eaten meals:', Object.keys(parsed).length);
      setEatenMeals(parsed);
    }
    setIsInitialized(true);

    // Listen for localStorage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'eatenMeals' && e.newValue) {
        console.log('[MealPlan] Updated from storage');
        setEatenMeals(JSON.parse(e.newValue));
      }
    };

    // Listen for custom events from same tab (dashboard)
    const handleEatenMealsUpdate = (e: CustomEvent) => {
      console.log('[MealPlan] Update event received');
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

  // Load existing feedback for current week's meals
  useEffect(() => {
    const loadExistingFeedback = async () => {
      if (!mealData?.mealPlan?.planData?.days) return;

      try {
        // Get all meal option IDs from current plan
        const mealOptionIds: string[] = [];
        mealData.mealPlan.planData.days.forEach((day: any) => {
          if (day.meals) {
            Object.values(day.meals).forEach((meal: any) => {
              if (meal?.primary?.id) mealOptionIds.push(meal.primary.id);
              if (meal?.alternative?.id) mealOptionIds.push(meal.alternative.id);
            });
          }
        });

        if (mealOptionIds.length === 0) return;

        // Query feedback for these IDs
        const response = await fetch('/api/meals/feedback/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mealOptionIds })
        });

        if (response.ok) {
          const data = await response.json();
          setMealFeedback(data.feedback || {});
        }
      } catch (error) {
        console.error('[Feedback] Failed to load existing:', error);
      }
    };

    loadExistingFeedback();
  }, [mealData?.mealPlan?.planData?.days]);

  // Save eaten meals to localStorage whenever it changes (same as dashboard)
  useEffect(() => {
    // Only save and dispatch if we're initialized and have some data
    if (isInitialized && Object.keys(eatenMeals).length > 0) {
      console.log('[MealPlan] Saving eaten meals:', Object.keys(eatenMeals).length);
      localStorage.setItem('eatenMeals', JSON.stringify(eatenMeals));

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
        console.log('[MealPlan] Fetched meal data for', data.mealPlan?.planData?.days?.length || 0, 'days');
      }
    } catch (error) {
      console.error('Failed to fetch meal data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get current day's meals - 7-day structured format only
  const getCurrentMeals = () => {
    if (mealData && mealData.mealPlan && mealData.mealPlan.planData && mealData.mealPlan.planData.days) {
      // Find the day object that matches our selected day
      const dayData = mealData.mealPlan.planData.days.find((day: any) => day.day === selectedDay);

      if (dayData && dayData.meals) {
        return {
          breakfast: dayData.meals.breakfast,
          lunch: dayData.meals.lunch,
          dinner: dayData.meals.dinner
        };
      }
    }

    // No real meal data available
    return {
      breakfast: null,
      lunch: null,
      dinner: null
    };
  };

  // Handle grocery item toggle
  const handleGroceryItemToggle = (category: string, index: number) => {
    const itemKey = `${category}-${index}`;
    setCheckedGroceryItems(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
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
    console.log('[MealPlan] Toggle eaten:', mealKey);

    const wasEaten = isMealEaten(mealType, optionIndex, optionType);

    setEatenMeals(prev => {
      const newState = {
        ...prev,
        [mealKey]: !prev[mealKey]
      };
      return newState;
    });

    // Show feedback prompt after marking as eaten (not unmarking)
    if (!wasEaten) {
      // Get the meal option ID for feedback
      const meals = getCurrentMeals();
      const meal = meals[mealType as keyof typeof meals];
      let mealOptionId = null;

      if (meal && meal[optionType]) {
        mealOptionId = meal[optionType].id;
      }

      if (mealOptionId) {
        setTimeout(() => {
          setShowFeedbackFor(mealOptionId);
        }, 300);
      }
    }
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

  // Handle meal feedback (Love it / Meh)
  const handleMealFeedback = async (
    mealOptionId: string,
    feedbackType: 'loved' | 'disliked',
    mealInfo: {
      dishName: string;
      restaurantName?: string;
      isHomemade: boolean;
      mealType: string;
      day: string;
    }
  ) => {
    console.log('[MEAL-PLAN] ❤️ Meal reaction:', {
      mealOptionId,
      feedbackType,
      mealType: mealInfo.mealType,
      dishName: mealInfo.dishName,
      restaurantName: mealInfo.restaurantName,
      isHomemade: mealInfo.isHomemade,
      timestamp: new Date().toISOString()
    });

    try {
      // Optimistic update
      setMealFeedback(prev => ({ ...prev, [mealOptionId]: feedbackType }));
      setShowFeedbackFor(null);

      const response = await fetch('/api/meals/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealOptionId,
          feedbackType,
          dishName: mealInfo.dishName,
          restaurantName: mealInfo.restaurantName,
          isHomemade: mealInfo.isHomemade,
          mealType: mealInfo.mealType,
          day: mealInfo.day,
          weekNumber: mealData?.mealPlan?.weekNumber || 1,
          weekOf: mealData?.mealPlan?.weekOf
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save feedback');
      }

      const data = await response.json();
      console.log('[Feedback]', data.message);
    } catch (error) {
      console.error('[Feedback] Error:', error);
      // Revert on error
      setMealFeedback(prev => ({ ...prev, [mealOptionId]: null }));
    }
  };

  const totalCalories = getTotalCalories();

  const MealCard = ({ meal, type }: { meal: any, type: string }) => {
    const selectedOption = getSelectedOption(selectedDay, type);
    const [userRating, setUserRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);

    if (!meal || !meal.primary) return null;

    // Get the currently selected meal option
    const currentMeal = selectedOption === 'primary' ? meal.primary : meal.alternative;
    const hasAlternative = meal.alternative && meal.alternative.name && meal.alternative.name !== "Alternative not available";

    const handleRecipeClick = async (selectedMeal: any) => {
      console.log('🍳 [Recipe] Click started:', selectedMeal?.name || selectedMeal?.dish);

      const isRestaurant = selectedMeal.source === "restaurant";
      const mealName = isRestaurant ? selectedMeal.dish : selectedMeal.name;
      const description = isRestaurant ? selectedMeal.dish_description : selectedMeal.description;

      if (isRestaurant) {
        console.log('🍳 [Recipe] Restaurant meal - opening external link');
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

      if (activeRecipeModal?.mealType === type && activeRecipeModal?.recipeData) {
        console.log('🍳 [Recipe] Using cached recipe');
        // Already showing this recipe
        return;
      }

      setLoadingRecipeMeal(type);
      console.log('🍳 [Recipe] Generating...');
      try {
        // Get grocery list from mealData (available in parent scope)
        const groceryList = mealData?.mealPlan?.groceryList || mealData?.mealPlan?.planData?.groceryList;
        const groceryItems = groceryList?.items?.map((item: any) => item.name || item.ingredient).filter(Boolean) || [];

        const response = await fetch('/api/ai/recipes/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dishName: mealName,
            description: description,
            mealType: type,
            // NEW: Pass nutrition targets from the meal
            nutritionTargets: {
              calories: selectedMeal.calories || 0,
              protein: selectedMeal.protein || 0,
              carbs: selectedMeal.carbs || 0,
              fat: selectedMeal.fat || 0
            },
            // NEW: Pass existing grocery items
            existingGroceryItems: groceryItems,
            // NEW: Pass dietary restrictions if available
            dietaryRestrictions: [] // TODO: Get from user survey if available
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Recipe generation failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.recipe) {
          console.log('🍳 [Recipe] Success! Opening modal');
          setActiveRecipeModal({
            mealType: type,
            recipeData: data.recipe
          });
        } else {
          throw new Error(data.error || 'Failed to generate recipe');
        }
      } catch (error) {
        console.error('🍳 [Recipe] ERROR:', error);
        // Show error to user instead of silent failure
        alert('Failed to generate recipe. Please try again.');
      } finally {
        setLoadingRecipeMeal(null);
        console.log('🍳 [Recipe] Done');
      }
    };

    const handleRating = (rating: number) => {
      setUserRating(rating);
    };

    // NEW: Handle option toggle
    const toggleOption = () => {
      toggleMealOption(selectedDay, type);
      // Reset recipe data when switching options
      if (activeRecipeModal?.mealType === type) {
        setActiveRecipeModal(null);
      }
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

                  {/* Show saved feedback icon */}
                  {mealFeedback[mealOption.id] === 'loved' && (
                    <span className="text-red-500 text-sm">❤️</span>
                  )}
                  {mealFeedback[mealOption.id] === 'disliked' && (
                    <span className="text-gray-400 text-sm">👎</span>
                  )}
                </div>

                {/* Feedback prompt - shows after marking eaten */}
                {showFeedbackFor === mealOption.id && isMealEaten(type, optionIndex, optionType) && (
                  <div className="mt-2 p-2 bg-gray-50 rounded-lg border animate-fadeIn w-full">
                    <p className="text-xs text-gray-500 mb-2">How was it?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMealFeedback(mealOption.id, 'loved', {
                          dishName: mealOption.dishName || mealOption.recipeName || 'Unknown Dish',
                          restaurantName: mealOption.restaurantName,
                          isHomemade: !mealOption.restaurantName,
                          mealType: type,
                          day: selectedDay
                        })}
                        className="flex-1 py-1.5 px-3 text-sm bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
                      >
                        <span>❤️</span> Love it
                      </button>
                      <button
                        onClick={() => handleMealFeedback(mealOption.id, 'disliked', {
                          dishName: mealOption.dishName || mealOption.recipeName || 'Unknown Dish',
                          restaurantName: mealOption.restaurantName,
                          isHomemade: !mealOption.restaurantName,
                          mealType: type,
                          day: selectedDay
                        })}
                        className="flex-1 py-1.5 px-3 text-sm bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-1"
                      >
                        <span>👎</span> Meh
                      </button>
                      <button
                        onClick={() => setShowFeedbackFor(null)}
                        className="px-2 text-gray-400 hover:text-gray-600"
                        title="Skip"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

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
                disabled={loadingRecipeMeal === type}
                className="text-xs px-3 py-1 h-7 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                {loadingRecipeMeal === type ? (
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
        {/* NEW: Toggle/Switch Design */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden mb-6">
          {/* Header with meal type */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-3 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 capitalize">{type}</h3>
          </div>

          {/* Current Selected Meal Display */}
          {currentMeal && (
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-4">
                {/* Large Image */}
                <div className="flex-shrink-0">
                  <ImageWithFallback
                    src={currentMeal.imageUrl || currentMeal.image || "https://images.unsplash.com/photo-1662993924949-2b2d68c08cee"}
                    alt={currentMeal.name || currentMeal.dish || `${type} meal`}
                    className="w-full sm:w-24 h-48 sm:h-24 object-cover rounded-xl shadow-md"
                  />
                </div>

                {/* Meal Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                        {currentMeal.source === 'restaurant' ? currentMeal.dish : currentMeal.name}
                      </h4>
                      <p className="text-sm text-gray-600 mb-2 leading-relaxed">
                        {currentMeal.source === 'restaurant'
                          ? (currentMeal.dish_description || currentMeal.description)
                          : (currentMeal.description || currentMeal.dish_description)
                        }
                      </p>

                      {/* Restaurant name for restaurant meals */}
                      {currentMeal.source === 'restaurant' && currentMeal.restaurant && (
                        <p className="text-sm font-medium text-purple-600 mb-2 flex items-center gap-1">
                          🏪 {currentMeal.restaurant}
                        </p>
                      )}

                      {/* Nutrition Info */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-600 mb-3">
                        <div className="bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                          <span className="text-green-700 font-medium">{currentMeal.estimatedCalories || currentMeal.calories || 0} cal</span>
                        </div>
                        <div className="bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                          <span className="text-blue-700 font-medium">{currentMeal.protein || 0}g protein</span>
                        </div>
                        {currentMeal.source === 'restaurant' && currentMeal.price && (
                          <div className="bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-200">
                            <span className="text-yellow-700 font-medium">${currentMeal.price}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRecipeClick(currentMeal)}
                          disabled={loadingRecipeMeal === type}
                          className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100 transition-colors"
                        >
                          {loadingRecipeMeal === type ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                          ) : null}
                          {currentMeal.source === 'restaurant' ?
                            <><ArrowSquareOut className="w-4 h-4 mr-1" weight="regular" />Order Now</> :
                            <><Star className="w-4 h-4 mr-1" weight="regular" />Recipe</>
                          }
                        </Button>

                        {/* Mark as Eaten Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMealEaten(type, 0, selectedOption)}
                          className={`transition-colors ${
                            isMealEaten(type, 0, selectedOption)
                              ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {isMealEaten(type, 0, selectedOption) ? '✓ Eaten' : 'Mark Eaten'}
                        </Button>
                      </div>
                    </div>

                    {/* Selection Indicator */}
                    <div className="flex items-center gap-2 ml-0 sm:ml-4 mt-2 sm:mt-0">
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        selectedOption === 'primary'
                          ? 'bg-purple-100 text-purple-700 border border-purple-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-300'
                      }`}>
                        {selectedOption === 'primary' ?
                          <><Star className="w-3 h-3 mr-1" weight="bold" />Selected</> :
                          'Option'
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Toggle Switch - Only show if alternative exists */}
          {hasAlternative && (
            <div className="border-t border-gray-200 bg-gray-50 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div className="text-sm text-gray-600">
                  Switch to: <span className="font-medium text-gray-900 block sm:inline">{selectedOption === 'primary' ? meal.alternative?.name || meal.alternative?.dish : meal.primary?.name || meal.primary?.dish}</span>
                </div>
                <Button
                  onClick={toggleOption}
                  className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-0 shadow-md transition-all duration-200 hover:scale-105 flex items-center gap-2"
                  size="sm"
                >
                  <ArrowSquareOut className="w-4 h-4 mr-1" weight="regular" />
                  Switch Option
                </Button>
              </div>
            </div>
          )}

          {/* No Alternative Available Message */}
          {!hasAlternative && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">
              <p className="text-xs text-gray-500 italic text-center">
                Only one option available for this meal
              </p>
            </div>
          )}
        </div>

        {/* Recipe Modal - Clean & Professional */}
        {activeRecipeModal?.mealType === type && activeRecipeModal?.recipeData && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-lg max-w-3xl max-h-[90vh] overflow-y-auto w-full">
              {/* Header */}
              <div className="border-b border-gray-200 p-4 sm:p-6 bg-gradient-to-r from-purple-50 to-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{activeRecipeModal.recipeData.name}</h2>
                    <p className="text-gray-600 mt-1 text-xs sm:text-sm">{activeRecipeModal.recipeData.description}</p>
                  </div>
                  <button
                    onClick={() => setActiveRecipeModal(null)}
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
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.prepTime}</div>
                      <div className="text-xs text-gray-600">Prep Time</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.cookTime}</div>
                      <div className="text-xs text-gray-600">Cook Time</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.servings}</div>
                      <div className="text-xs text-gray-600">Servings</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.difficulty}</div>
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
                    {activeRecipeModal.recipeData.groceryList?.map((item: any, index: number) => (
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
                    {activeRecipeModal.recipeData.instructions?.map((step: string, index: number) => (
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
                {activeRecipeModal.recipeData.nutrition && (
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-green-600 rounded-full mr-3"></div>
                      Nutrition Facts
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                        <div className="text-lg font-semibold text-green-600">{activeRecipeModal.recipeData.nutrition.calories}</div>
                        <div className="text-xs text-gray-600">Calories</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-blue-200">
                        <div className="text-lg font-semibold text-blue-600">{activeRecipeModal.recipeData.nutrition.protein}g</div>
                        <div className="text-xs text-gray-600">Protein</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-orange-200">
                        <div className="text-lg font-semibold text-orange-600">{activeRecipeModal.recipeData.nutrition.carbs}g</div>
                        <div className="text-xs text-gray-600">Carbs</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-yellow-200">
                        <div className="text-lg font-semibold text-yellow-600">{activeRecipeModal.recipeData.nutrition.fat}g</div>
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
              <ForkKnife className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Meals</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("workout-plan")}
            >
              <Barbell className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Workouts</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("progress")}
            >
              <ChartLineUp className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Progress</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("account")}
            >
              <UserCircle className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while fetching data
  if (loading || !isInitialized) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-2">
            <div
              className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            ></div>
            <div
              className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            ></div>
            <div
              className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            ></div>
          </div>
          <p className="text-sm text-gray-500 animate-pulse">Loading meal plan...</p>
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

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6">
        <div className="flex space-x-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('meals')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'meals'
                ? 'border-[#c1272d] text-[#c1272d] bg-red-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span className="whitespace-nowrap">Weekly Plan</span>
          </button>
          <button
            onClick={() => setActiveTab('grocery')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'grocery'
                ? 'border-green-500 text-green-600 bg-green-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="whitespace-nowrap">Grocery List</span>
          </button>
          <button
            onClick={() => setActiveTab('restaurants')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'restaurants'
                ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <ForkKnife className="w-4 h-4" />
            <span className="whitespace-nowrap">Restaurants</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Meals Tab Content */}
        {activeTab === 'meals' && (
          <>
            {/* Week Navigation */}
            <div className="mb-6">
          <div className="flex justify-center space-x-2 overflow-x-auto pb-2 px-2">
            {days.map((day) => (
              <Button
                key={day.id}
                variant={selectedDay === day.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
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
            <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
              <ForkKnife className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600 font-medium">No breakfast planned</p>
              <p className="text-gray-500 text-sm">Meals will appear here once generated</p>
            </div>
          )}

          {currentMeals.lunch ? (
            <>
              <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3 mb-3">Lunch</h3>
              <MealCard meal={currentMeals.lunch} type="lunch" />
            </>
          ) : (
            <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
              <ForkKnife className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600 font-medium">No lunch planned</p>
              <p className="text-gray-500 text-sm">Meals will appear here once generated</p>
            </div>
          )}

          {currentMeals.dinner ? (
            <>
              <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3 mb-3">Dinner</h3>
              <MealCard meal={currentMeals.dinner} type="dinner" />
            </>
          ) : (
            <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
              <ForkKnife className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600 font-medium">No dinner planned</p>
              <p className="text-gray-500 text-sm">Meals will appear here once generated</p>
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
            <div className="text-center py-12 bg-white border-2 border-dashed border-gray-300 rounded-xl">
              <ForkKnife className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">No meals planned for {selectedDay}</p>
              <p className="text-sm text-gray-500 mt-2">Meal recommendations will appear here once generated</p>
            </div>
          )}
        </div>
          </>
        )}

        {/* Grocery List Tab Content */}
        {activeTab === 'grocery' && (
          <GroceryListSection
            groceryList={
              mealData?.mealPlan?.groceryList ||
              mealData?.mealPlan?.planData?.groceryList ||
              { proteins: [], vegetables: [], grains: [], totalEstimatedCost: 0, weeklyBudgetUsed: '0%' }
            }
            onItemToggle={handleGroceryItemToggle}
            checkedItems={checkedGroceryItems}
          />
        )}

        {/* Restaurants Tab Content */}
        {activeTab === 'restaurants' && (
          <RestaurantListSection
            restaurants={(() => {
              const restaurantMeals = mealData?.mealPlan?.planData?.restaurantMeals || [];
              console.log('[RestaurantSection] Raw restaurant meals:', restaurantMeals.length);
              const restaurantMap = new Map();

              // Aggregate all restaurant data and ordering links
              restaurantMeals.forEach((meal: any) => {
                const primaryRestaurant = meal.primary?.restaurant;
                const altRestaurant = meal.alternative?.restaurant;


                // Process primary restaurant
                if (primaryRestaurant && meal.primary) {
                  if (!restaurantMap.has(primaryRestaurant)) {
                    restaurantMap.set(primaryRestaurant, {
                      name: primaryRestaurant,
                      cuisine: meal.primary.cuisine || 'Mixed',
                      rating: 4.2,
                      address: meal.primary.address || 'Address not available',
                      city: meal.primary.city || '',
                      orderingLinks: { ...meal.primary.orderingLinks },
                      estimatedOrderTime: '25-40 min',
                      sampleMenuItems: new Set([meal.primary.dish]),
                      distance: 2.5
                    });
                  } else {
                    // Merge ordering links and add menu items
                    const existing = restaurantMap.get(primaryRestaurant);
                    existing.orderingLinks = { ...existing.orderingLinks, ...meal.primary.orderingLinks };
                    existing.sampleMenuItems.add(meal.primary.dish);
                  }
                }

                // Process alternative restaurant (if different from primary)
                if (altRestaurant && meal.alternative && altRestaurant !== primaryRestaurant) {
                  if (!restaurantMap.has(altRestaurant)) {
                    restaurantMap.set(altRestaurant, {
                      name: altRestaurant,
                      cuisine: meal.alternative.cuisine || 'Mixed',
                      rating: 4.2,
                      address: meal.alternative.address || 'Address not available',
                      city: meal.alternative.city || '',
                      orderingLinks: { ...meal.alternative.orderingLinks },
                      estimatedOrderTime: '25-40 min',
                      sampleMenuItems: new Set([meal.alternative.dish]),
                      distance: 2.5
                    });
                  } else {
                    // Merge ordering links and add menu items
                    const existing = restaurantMap.get(altRestaurant);
                    existing.orderingLinks = { ...existing.orderingLinks, ...meal.alternative.orderingLinks };
                    existing.sampleMenuItems.add(meal.alternative.dish);
                  }
                }
              });

              // Helper to normalize ordering link keys to match what we can render
              const normalizeOrderingLinks = (links: any) => {
                if (!links) return {};
                return {
                  doordash: links.doordash || links.doorDash || links.DoorDash || links.door_dash || null,
                  ubereats: links.ubereats || links.uberEats || links.UberEats || links.uber_eats || null,
                  grubhub: links.grubhub || links.grubHub || links.GrubHub || links.grub_hub || null,
                  direct: links.direct || links.website || links.order || links.orderUrl || links.order_url || links.menuUrl || links.menu_url || null,
                };
              };

              // Convert to array and normalize ordering links
              const restaurants = Array.from(restaurantMap.values()).map(restaurant => {
                // Normalize the ordering links
                const normalizedLinks = normalizeOrderingLinks(restaurant.orderingLinks);

                // Only count links that have values AND have a matching button (known platforms)
                const knownPlatforms = ['doordash', 'ubereats', 'grubhub', 'direct'];
                const validLinksCount = knownPlatforms.filter(platform =>
                  normalizedLinks[platform] &&
                  String(normalizedLinks[platform]).trim() !== ''
                ).length;

                return {
                  ...restaurant,
                  orderingLinks: normalizedLinks,  // Use normalized links
                  sampleMenuItems: Array.from(restaurant.sampleMenuItems).filter(Boolean),
                  linksFound: validLinksCount
                };
              });

              console.log('[RestaurantSection] Transformed restaurants:', restaurants.length);
              return restaurants;
            })()}
            metadata={{
              generatedFor: 'User',
              location: mealData?.mealPlan?.planData?.metadata?.location || 'Your area',
              goal: mealData?.mealPlan?.planData?.metadata?.goal || 'wellness',
              cuisines: mealData?.mealPlan?.planData?.metadata?.cuisines || []
            }}
          />
        )}
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
            <ForkKnife className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("workout-plan")}
          >
            <Barbell className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Workouts</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("progress")}
          >
            <ChartLineUp className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Progress</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("account")}
          >
            <UserCircle className="w-5 h-5 mb-1" weight="regular" />
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