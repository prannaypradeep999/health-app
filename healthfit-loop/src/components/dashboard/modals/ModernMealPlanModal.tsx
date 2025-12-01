'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ArrowLeft,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Heart,
  Star,
  Clock,
  MapPin,
  Home,
  Utensils,
  Dumbbell,
  BarChart3,
  User,
  Target,
  Plus
} from 'lucide-react';

interface ModernMealPlanModalProps {
  surveyData: any;
  isGuest: boolean;
  onClose: () => void;
}

interface MealOption {
  id: string;
  optionNumber: number;
  optionType: 'restaurant' | 'home';
  restaurantName?: string;
  dishName?: string;
  description?: string;
  goalReasoning?: string;
  why_perfect_for_goal?: string;
  estimatedPrice?: number;
  deliveryTime?: string;
  recipeName?: string;
  ingredients?: string[];
  cookingTime?: number;
  instructions?: string;
  difficulty?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  wasEaten: boolean;
  userRating?: number;
  estimatedCost?: number;
  prepTime?: number;
  totalTime?: number;
  imageUrl?: string;
}

interface Meal {
  id: string;
  day: string;
  mealType: string;
  options: MealOption[];
  selectedOptionId?: string;
  extraRestaurantOptions?: Array<{
    restaurant: string;
    dish: string;
    description?: string;
    goalReasoning?: string;
    orderingUrl?: string;
    menuSourceUrl?: string;
  }>;
}

interface MealPlan {
  id: string;
  weekOf: string;
  meals: Meal[];
  regenerationCount: number;
}

const getDayDate = (dayName: string, weekOf: string) => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayIndex = days.indexOf(dayName.toLowerCase());
  const weekStart = new Date(weekOf);
  const targetDate = new Date(weekStart);
  targetDate.setDate(weekStart.getDate() + dayIndex);
  return targetDate;
};

const formatDay = (day: string | number) => {
  const dayStr = String(day || '');
  return dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
};

const MealCard: React.FC<{
  option: MealOption;
  isSelected: boolean;
  onSelect: () => void;
  showGoalReasoning?: boolean;
}> = ({ option, isSelected, onSelect, showGoalReasoning = true }) => {
  const [isFavorited, setIsFavorited] = useState(false);

  // Safety checks
  if (!option) return null;

  const displayName = option.optionType === 'restaurant'
    ? (option.dishName || 'Restaurant Meal')
    : (option.recipeName || 'Home Meal');

  const prepTime = option.prepTime || option.cookingTime || 0;
  const totalTime = option.totalTime || prepTime;

  // Default food image for now
  const imageUrl = option.imageUrl || '/api/placeholder/100/100';

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border-2 transition-all duration-200 hover:shadow-md ${
        isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:border-gray-200'
      }`}
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="flex items-start space-x-3">
          {/* Food Image */}
          <div className="flex-shrink-0">
            <img
              src={imageUrl}
              alt={displayName}
              className="w-20 h-20 rounded-lg object-cover bg-gray-100"
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik00MCA1NkM0OC44MzY2IDU2IDU2IDQ4LjgzNjYgNTYgNDBDNTYgMzEuMTYzNCA0OC44MzY2IDI0IDQwIDI0QzMxLjE2MzQgMjQgMjQgMzEuMTYzNCAyNCA0MEMyNCA0OC44MzY2IDMxLjE2MzQgNTYgNDAgNTZaIiBzdHJva2U9IiM5Q0E0QUYiIHN0cm9rZS13aWR0aD0iMiIvPgo8cGF0aCBkPSJNNDAgNDBIMzIiIHN0cm9rZT0iIzlDQTRBRiIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik00MCA0MEw0OCAzMiIgc3Ryb2tlPSIjOUNBNEFGIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+';
              }}
            />
          </div>

          {/* Meal Info */}
          <div className="flex-1 min-w-0">
            {/* Header with badges */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2">
                  {displayName}
                </h4>
                <div className="flex items-center space-x-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    option.optionType === 'restaurant'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {option.optionType === 'restaurant' ? (
                      <>
                        <MapPin className="w-3 h-3 mr-1" />
                        {option.restaurantName || 'Restaurant'}
                      </>
                    ) : (
                      <>
                        <Home className="w-3 h-3 mr-1" />
                        Home Made
                      </>
                    )}
                  </span>
                  {totalTime > 0 && (
                    <span className="flex items-center text-xs text-gray-500">
                      <Clock className="w-3 h-3 mr-1" />
                      {totalTime}min
                    </span>
                  )}
                </div>
              </div>

              {/* Favorite Heart */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFavorited(!isFavorited);
                }}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
              </button>
            </div>

            {/* Calories and Macros */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                <span className="text-lg font-bold text-red-600">{option.calories}</span>
                <span className="text-xs text-gray-500">cal</span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-gray-600">
                <span>P: {option.protein}g</span>
                <span>C: {option.carbs}g</span>
                <span>F: {option.fat}g</span>
              </div>
            </div>

            {/* Goal Reasoning */}
            {showGoalReasoning && (option.goalReasoning || option.why_perfect_for_goal) && (
              <div className="mb-3 p-2 bg-green-50 border-l-2 border-green-400 rounded-r">
                <div className="flex items-start space-x-1">
                  <Target className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-green-800 leading-relaxed">
                    {option.goalReasoning || option.why_perfect_for_goal}
                  </p>
                </div>
              </div>
            )}

            {/* Star Rating & Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="w-3 h-3 text-gray-300" />
                ))}
              </div>

              <div className="flex items-center space-x-2">
                {option.optionType === 'restaurant' ? (
                  <button className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full font-medium hover:bg-purple-700 transition-colors">
                    Order
                  </button>
                ) : (
                  <button className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full font-medium hover:bg-purple-700 transition-colors">
                    Recipe
                  </button>
                )}
              </div>
            </div>

            {/* Price/Cost */}
            {(option.estimatedPrice || option.estimatedCost) && (
              <div className="mt-2 text-right">
                <span className="text-sm font-semibold text-purple-600">
                  ${option.optionType === 'restaurant'
                    ? (option.estimatedPrice! / 100).toFixed(2)
                    : (option.estimatedCost! / 100).toFixed(2)
                  }
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ModernMealPlanModal({ surveyData, isGuest, onClose }: ModernMealPlanModalProps) {
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState<{[mealId: string]: string}>({});
  const [selectedDay, setSelectedDay] = useState<string>('monday');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  useEffect(() => {
    loadMealPlan();
  }, []);

  const loadMealPlan = async () => {
    try {
      const response = await fetch('/api/ai/meals/current');
      if (response.ok) {
        const data = await response.json();
        console.log('📋 Full API response:', data);
        console.log('📋 Meal plan data:', data.mealPlan);
        if (data.mealPlan?.meals) {
          console.log('📋 First meal structure:', data.mealPlan.meals[0]);
        }
        if (data.mealPlan?.weeklyMealPlan?.days) {
          console.log('📋 Weekly meal plan structure:', data.mealPlan.weeklyMealPlan.days[0]);
        }
        setMealPlan(data.mealPlan);

        // Initialize selected options - will be set after grouping meals
        setSelectedOptions({});
      } else {
        console.log('📋 No meal plan found, API returned:', response.status);
        // If no meal plan exists, try to generate one automatically
        if (response.status === 404 || response.status === 500) {
          console.log('📋 Attempting to generate meal plan automatically...');
          await regenerateMealPlan();
        }
      }
    } catch (error) {
      console.error('Failed to load meal plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectMealOption = async (mealId: string, optionId: string) => {
    setSelectedOptions(prev => ({
      ...prev,
      [mealId]: optionId
    }));

    try {
      await fetch('/api/ai/meals/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId, selectedOptionId: optionId })
      });
    } catch (error) {
      console.error('Failed to save meal selection:', error);
    }
  };

  const regenerateMealPlan = async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/ai/meals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        // Reload the meal plan after generation
        await loadMealPlan();
      }
    } catch (error) {
      console.error('Failed to regenerate meal plan:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Handle different meal plan structures - memoized to prevent re-creation
  const groupedMeals = useMemo(() => {
    console.log('📋 Computing groupedMeals with mealPlan:', mealPlan);
    if (!mealPlan) {
      console.log('📋 No meal plan data');
      return {};
    }

    // Handle new structure: weeklyMealPlan.days
    if (mealPlan.weeklyMealPlan?.days) {
      console.log('📋 Processing weeklyMealPlan structure with days:', mealPlan.weeklyMealPlan.days);
      const grouped: {[day: string]: {[mealType: string]: any[]}} = {};
      mealPlan.weeklyMealPlan.days.forEach((dayData: any) => {
        const dayName = dayData.day_name?.toLowerCase() || 'monday';
        grouped[dayName] = {};

        // Convert each meal type
        ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
          if (dayData[mealType]) {
            // Convert primary + alternatives to options array
            const options = [];
            if (dayData[mealType].primary) {
              options.push({
                id: `${dayName}-${mealType}-primary`,
                optionNumber: 1,
                optionType: dayData[mealType].primary.source === 'home' ? 'home' : 'restaurant',
                recipeName: dayData[mealType].primary.name,
                dishName: dayData[mealType].primary.dish || dayData[mealType].primary.name,
                restaurantName: dayData[mealType].primary.restaurant,
                description: dayData[mealType].primary.description,
                goalReasoning: dayData[mealType].primary.goalReasoning,
                why_perfect_for_goal: dayData[mealType].primary.why_perfect_for_goal,
                calories: dayData[mealType].primary.calories || 0,
                protein: dayData[mealType].primary.protein || 0,
                carbs: dayData[mealType].primary.carbs || 0,
                fat: dayData[mealType].primary.fat || 0,
                estimatedPrice: dayData[mealType].primary.price ? dayData[mealType].primary.price * 100 : undefined,
                imageUrl: dayData[mealType].primary.imageUrl
              });
            }

            // Add alternatives
            if (dayData[mealType].alternatives) {
              dayData[mealType].alternatives.forEach((alt: any, index: number) => {
                options.push({
                  id: `${dayName}-${mealType}-alt-${index}`,
                  optionNumber: index + 2,
                  optionType: alt.source === 'home' ? 'home' : 'restaurant',
                  recipeName: alt.name,
                  dishName: alt.dish || alt.name,
                  restaurantName: alt.restaurant,
                  description: alt.description,
                  goalReasoning: alt.goalReasoning,
                  why_perfect_for_goal: alt.why_perfect_for_goal,
                  calories: alt.calories || 0,
                  protein: alt.protein || 0,
                  carbs: alt.carbs || 0,
                  fat: alt.fat || 0,
                  estimatedPrice: alt.price ? alt.price * 100 : undefined,
                  imageUrl: alt.imageUrl
                });
              });
            }

            grouped[dayName][mealType] = [{
              id: `${dayName}-${mealType}`,
              day: dayName,
              mealType: mealType,
              options: options,
              extraRestaurantOptions: dayData[mealType].extraRestaurantOptions || []
            }];
          }
        });
      });
      console.log('📋 Grouped meals result:', grouped);
      return grouped;
    }

    // Handle old structure: meals array
    if (mealPlan.meals) {
      console.log('📋 Processing old meals array structure:', mealPlan.meals);
      const result = mealPlan.meals.reduce((acc: any, meal: any) => {
        if (!acc[meal.day]) {
          acc[meal.day] = {};
        }
        if (!acc[meal.day][meal.mealType]) {
          acc[meal.day][meal.mealType] = [];
        }
        acc[meal.day][meal.mealType].push(meal);
        return acc;
      }, {});
      console.log('📋 Old structure result:', result);
      return result;
    }

    console.log('📋 No recognized meal plan structure found');
    return {};
  }, [mealPlan]);

  // Calculate daily calories for selected day
  const getDailyCalories = (day: string) => {
    const dayMeals = groupedMeals[day] || {};
    let total = 0;
    Object.values(dayMeals).flat().forEach(meal => {
      if (meal && meal.options && Array.isArray(meal.options)) {
        const selectedOption = meal.options.find(opt => opt && opt.id === selectedOptions[meal.id]);
        if (selectedOption && selectedOption.calories) {
          total += selectedOption.calories;
        }
      }
    });
    return total;
  };

  const selectedDayMeals = groupedMeals[selectedDay] || {};
  const dailyCalories = getDailyCalories(selectedDay);

  console.log('📋 Selected day:', selectedDay);
  console.log('📋 Selected day meals:', selectedDayMeals);
  console.log('📋 Available days:', Object.keys(groupedMeals));

  // Initialize selected options when meal plan is first loaded
  useEffect(() => {
    if (mealPlan && Object.keys(selectedOptions).length === 0) {
      const selections: {[mealId: string]: string} = {};

      // Handle different data structures
      if (mealPlan.weeklyMealPlan?.days) {
        mealPlan.weeklyMealPlan.days.forEach((dayData: any) => {
          const dayName = dayData.day_name?.toLowerCase() || 'monday';
          ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
            if (dayData[mealType]) {
              const mealId = `${dayName}-${mealType}`;
              // Just select the primary option by default
              selections[mealId] = `${dayName}-${mealType}-primary`;
            }
          });
        });

        // Set first day as selected
        const firstDay = mealPlan.weeklyMealPlan.days[0]?.day_name?.toLowerCase();
        if (firstDay) {
          setSelectedDay(firstDay);
        }
      } else if (mealPlan.meals) {
        // Handle old structure
        mealPlan.meals.forEach((meal: any) => {
          if (meal.options && meal.options.length > 0) {
            selections[meal.id] = meal.options[0].id;
          }
        });
        if (mealPlan.meals.length > 0) {
          setSelectedDay(mealPlan.meals[0].day);
        }
      }

      setSelectedOptions(selections);
    }
  }, [mealPlan]); // Only depend on mealPlan, not the computed groupedMeals

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-700">Loading your meal plan...</p>
        </div>
      </div>
    );
  }

  if (!mealPlan) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <p className="mb-4 text-gray-700">No meal plan found. Please generate one first.</p>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-white bg-purple-600 hover:bg-purple-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex">
      {/* Main Modal Container - Mobile First */}
      <div className="w-full max-w-md mx-auto bg-white flex flex-col h-full md:h-[90vh] md:my-auto md:rounded-2xl md:max-w-2xl lg:max-w-4xl">

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-4 border-b border-gray-200 bg-white md:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Meal Plan</h1>
            <button
              onClick={regenerateMealPlan}
              disabled={isRegenerating}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 text-purple-600 ${isRegenerating ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Day Navigation */}
        <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex space-x-2 overflow-x-auto scrollbar-hide">
            {Object.keys(groupedMeals || {}).filter(Boolean).map((day, index) => {
              if (!day) return null;
              const isSelected = selectedDay === day;
              const dayNumber = index + 1;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-semibold">{formatDay(day)}</div>
                    <div className="text-xs opacity-90">Day {dayNumber}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Daily Calories Summary */}
        <div className="flex-shrink-0 px-4 py-3 bg-purple-50 border-b border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-purple-900">
                {formatDay(selectedDay || 'Day')}
              </h2>
              <p className="text-sm text-purple-700">
                {Object.keys(selectedDayMeals || {}).length} meals planned
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-red-600">{dailyCalories || 0}</div>
              <div className="text-sm text-purple-700">total calories</div>
            </div>
          </div>
        </div>

        {/* Meals Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* No meals message */}
            {Object.keys(groupedMeals).length === 0 && !loading && (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-2">No meal plan found</div>
                <button
                  onClick={regenerateMealPlan}
                  disabled={isRegenerating}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  {isRegenerating ? 'Generating...' : 'Generate Meal Plan'}
                </button>
              </div>
            )}

            {/* No meals for selected day */}
            {Object.keys(groupedMeals).length > 0 && Object.keys(selectedDayMeals).length === 0 && (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-2">No meals planned for {formatDay(selectedDay)} yet</div>
                <button
                  onClick={regenerateMealPlan}
                  disabled={isRegenerating}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  {isRegenerating ? 'Generating...' : 'Add Meals for This Day'}
                </button>
              </div>
            )}

            {/* Meal Sections */}
            {['breakfast', 'lunch', 'dinner'].map((mealType) => {
              const meals = (selectedDayMeals && selectedDayMeals[mealType]) ? selectedDayMeals[mealType] : [];
              if (!meals || meals.length === 0) return null;

              const totalOptions = meals.reduce((sum, meal) => {
                if (!meal || !meal.options) return sum;
                return sum + (Array.isArray(meal.options) ? meal.options.length : 0);
              }, 0);

              return (
                <div key={mealType} className="space-y-4">
                  {/* Meal Type Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 capitalize">
                      {mealType}
                    </h3>
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
                      {totalOptions} Options
                    </span>
                  </div>

                  {/* Meal Cards */}
                  {meals.filter(meal => meal && meal.id).map((meal) => (
                    <div key={meal.id} className="space-y-3">
                      {/* Primary + Alternative Options */}
                      <div className="space-y-3">
                        {meal.options && Array.isArray(meal.options) && meal.options.length > 0 && meal.options.filter(option => option && option.id).map((option) => (
                          <MealCard
                            key={option.id}
                            option={option}
                            isSelected={selectedOptions[meal.id] === option.id}
                            onSelect={() => selectMealOption(meal.id, option.id)}
                          />
                        ))}
                      </div>

                      {/* Additional Restaurant Options Section */}
                      {meal.extraRestaurantOptions && Array.isArray(meal.extraRestaurantOptions) && meal.extraRestaurantOptions.length > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <h4 className="text-sm font-medium text-gray-600">More Restaurant Options</h4>
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                              +{meal.extraRestaurantOptions.length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {meal.extraRestaurantOptions.filter(Boolean).map((extraOption: any, index: number) => {
                              if (!extraOption) return null;
                              return (
                              <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h5 className="font-medium text-gray-900 text-sm">
                                      {extraOption.dish || 'Dish'} - {extraOption.restaurant || 'Restaurant'}
                                    </h5>
                                    {extraOption.description && (
                                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                        {extraOption.description}
                                      </p>
                                    )}
                                    {extraOption.goalReasoning && (
                                      <div className="mt-2 p-2 bg-green-50 border-l-2 border-green-400 rounded-r">
                                        <div className="flex items-start space-x-1">
                                          <Target className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                                          <p className="text-xs text-green-800">
                                            {extraOption.goalReasoning}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <button className="ml-3 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded font-medium hover:bg-orange-200 transition-colors">
                                    View
                                  </button>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Log External Meal Option */}
            <div className="border-t pt-4">
              <button className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-center hover:border-purple-400 hover:bg-purple-50 transition-colors">
                <Plus className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">Log a meal outside our recommendations</p>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="flex-shrink-0 bg-white border-t border-gray-200 md:rounded-b-2xl">
          <div className="flex items-center justify-around py-2">
            {[
              { icon: Home, label: 'Home', active: false },
              { icon: Utensils, label: 'Meals', active: true },
              { icon: Dumbbell, label: 'Workouts', active: false },
              { icon: BarChart3, label: 'Progress', active: false },
              { icon: User, label: 'Account', active: false },
            ].map(({ icon: Icon, label, active }) => (
              <button
                key={label}
                className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
                  active ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}