'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Download, ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, Loader2, AlertTriangle, CheckCircle, Info, Target } from 'lucide-react';
import { colors } from '../constants';
// Removed data source tracker functionality
import { calculateDailyCalorieGoal, calculateMealProgress, getCalorieStatusColor, getCalorieStatusMessage, type CalorieGoal, type MealCalorieData } from '@/lib/utils/calorie-calculator';

interface MealPlanModalProps {
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
  goalReasoning?: string; // Added: Why this meal supports user's goals
  why_perfect_for_goal?: string; // Legacy field name for backward compatibility
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
  dataSource?: string;
  estimatedCost?: number;
  prepTime?: number;
  totalTime?: number;
}

interface Meal {
  id: string;
  day: string;
  mealType: string;
  options: MealOption[];
  selectedOptionId?: string;
}

interface MealPlan {
  id: string;
  weekOf: string;
  meals: Meal[];
  regenerationCount: number;
}

export default function MealPlanModal({ surveyData, isGuest, onClose }: MealPlanModalProps) {
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState<{[mealId: string]: string}>({});
  const [eatenMeals, setEatenMeals] = useState<{[mealId: string]: boolean}>({});
  const [expandedDays, setExpandedDays] = useState<{[day: string]: boolean}>({});

  // Calorie tracking
  const [calorieGoal, setCalorieGoal] = useState<CalorieGoal | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('monday');

  // Calculate calorie goal when component mounts
  useEffect(() => {
    if (surveyData) {
      const goal = calculateDailyCalorieGoal(surveyData);
      setCalorieGoal(goal);
    }
  }, [surveyData]);

  useEffect(() => {
    loadMealPlan();
  }, []);

  const loadMealPlan = async () => {
    try {
      const response = await fetch('/api/ai/meals/current');
      if (response.ok) {
        const data = await response.json();
        setMealPlan(data.mealPlan);
        
        // Initialize selected options
        const selections: {[mealId: string]: string} = {};
        data.mealPlan.meals.forEach((meal: Meal) => {
          if (meal.selectedOptionId) {
            selections[meal.id] = meal.selectedOptionId;
          } else {
            selections[meal.id] = meal.options[0]?.id;
          }
        });
        setSelectedOptions(selections);
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

      // Update selected day to the day of this meal to show updated calorie tracking
      const meal = mealPlan?.meals.find(m => m.id === mealId);
      if (meal) {
        setSelectedDay(meal.day);
      }
    } catch (error) {
      console.error('Failed to save meal selection:', error);
    }
  };

  const giveFeedback = async (optionId: string, feedbackType: string) => {
    try {
      await fetch('/api/ai/meals/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealOptionId: optionId, feedbackType })
      });
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }
  };

  const markMealAsEaten = async (mealId: string, eaten: boolean) => {
    setEatenMeals(prev => ({
      ...prev,
      [mealId]: eaten
    }));

    try {
      await fetch('/api/ai/meals/eaten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId, eaten })
      });
    } catch (error) {
      console.error('Failed to save meal status:', error);
    }
  };

  const toggleDay = (day: string) => {
    setExpandedDays(prev => ({
      ...prev,
      [day]: !prev[day]
    }));
  };

  const downloadGroceryList = () => {
    if (!mealPlan) return;

    const groceryData: {[ingredient: string]: {meals: string[], count: number}} = {};
    let totalEstimatedCost = 0;

    mealPlan.meals.forEach(meal => {
      const selectedOption = meal.options.find(opt => opt.id === selectedOptions[meal.id]);
      if (selectedOption?.optionType === 'home' && selectedOption.ingredients) {
        const mealLabel = `${formatDay(meal.day)} ${formatMealType(meal.mealType)}`;
        
        selectedOption.ingredients.forEach(ingredient => {
          if (!groceryData[ingredient]) {
            groceryData[ingredient] = { meals: [], count: 0 };
          }
          groceryData[ingredient].meals.push(mealLabel);
          groceryData[ingredient].count++;
        });

        if (selectedOption.estimatedCost) {
          totalEstimatedCost += selectedOption.estimatedCost;
        }
      }
    });

    const csvHeader = "Ingredient,Needed For Meals,Times Used,Notes\n";
    const csvRows = Object.entries(groceryData).map(([ingredient, data]) => {
      const mealsStr = data.meals.join('; ');
      const notesStr = data.count > 1 ? 'Buy in bulk' : 'Single use';
      return `"${ingredient}","${mealsStr}",${data.count},"${notesStr}"`;
    }).join('\n');

    const csvFooter = `\n\nSummary:\nTotal Home Meals: ${Object.keys(groceryData).length > 0 ? groceryData[Object.keys(groceryData)[0]].meals.length : 0}\nEstimated Total Cost: $${(totalEstimatedCost/100).toFixed(2)}\nGenerated: ${new Date().toLocaleDateString()}`;

    const csvContent = "data:text/csv;charset=utf-8," + csvHeader + csvRows + csvFooter;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fytr_grocery_list_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDay = (day: string) => day.charAt(0).toUpperCase() + day.slice(1);
  const formatMealType = (mealType: string) => mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const formatPrice = (priceInCents?: number) => {
    if (!priceInCents) return 'Price varies';
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  // Group meals by day
  const groupedMeals = mealPlan?.meals.reduce((acc, meal) => {
    if (!acc[meal.day]) {
      acc[meal.day] = [];
    }
    acc[meal.day].push(meal);
    return acc;
  }, {} as {[day: string]: Meal[]}) || {};

  // Sort meals within each day to ensure proper order: breakfast, lunch, dinner
  Object.keys(groupedMeals).forEach(day => {
    groupedMeals[day].sort((a, b) => {
      const mealOrder = { 'breakfast': 0, 'lunch': 1, 'dinner': 2 };
      const aMealType = a.mealType.toLowerCase() as keyof typeof mealOrder;
      const bMealType = b.mealType.toLowerCase() as keyof typeof mealOrder;
      return mealOrder[aMealType] - mealOrder[bMealType];
    });
  });

  // Calculate daily calorie progress for selected day
  const getDailyProgress = (day: string) => {
    if (!calorieGoal || !mealPlan) return null;

    const dayMeals = groupedMeals[day] || [];
    const mealsWithSelections = dayMeals.map(meal => ({
      ...meal,
      selectedOptionId: selectedOptions[meal.id]
    }));

    return calculateMealProgress(mealsWithSelections, calorieGoal);
  };

  const dailyProgress = getDailyProgress(selectedDay);

  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: colors.deepBlue }} />
          <p style={{ color: colors.nearBlack }}>Loading your meal plan...</p>
        </div>
      </div>
    );
  }

  if (!mealPlan) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <p className="mb-4" style={{ color: colors.nearBlack }}>No meal plan found. Please generate one first.</p>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-white"
            style={{ backgroundColor: colors.deepBlue }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col" style={{ backgroundColor: colors.white }}>
        {/* Minimalist Header */}
        <div className="flex-shrink-0 p-6 border-b" style={{ borderColor: colors.lightGray }}>
          <div className="flex justify-between items-center">
            <button onClick={onClose} className="flex items-center space-x-2 hover:bg-gray-50 rounded-lg p-2">
              <ArrowLeft className="w-5 h-5" style={{ color: colors.mediumGray }} />
              <span className="text-sm" style={{ color: colors.mediumGray }}>Back to Dashboard</span>
            </button>
            <div className="text-center flex-1">
              <h2 className="text-2xl font-bold" style={{ color: colors.nearBlack }}>Weekly Meal Plan</h2>
              <p className="text-sm" style={{ color: colors.mediumGray }}>
                Customized for {surveyData?.firstName} • Week of {new Date(mealPlan.weekOf).toLocaleDateString()}
              </p>

              {/* Daily Calorie Tracking */}
              {calorieGoal && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg max-w-md mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center">
                      <Target className="w-4 h-4 mr-2" />
                      Daily Calorie Goal
                    </h3>
                    {/* Day Selector */}
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {dayOrder.map(day => (
                        <option key={day} value={day}>
                          {formatDay(day)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="text-center">
                      <div className="font-medium text-gray-600">Daily Goal</div>
                      <div className="text-lg font-bold" style={{ color: colors.deepBlue }}>
                        {calorieGoal.dailyGoal}
                      </div>
                    </div>

                    {dailyProgress && (
                      <>
                        <div className="text-center">
                          <div className="font-medium text-gray-600">Consumed</div>
                          <div className={`text-lg font-bold ${getCalorieStatusColor(dailyProgress.dailyPercentage)}`}>
                            {dailyProgress.totalCalories}
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="font-medium text-gray-600">Progress</div>
                          <div className={`text-lg font-bold ${getCalorieStatusColor(dailyProgress.dailyPercentage)}`}>
                            {dailyProgress.dailyPercentage}%
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="font-medium text-gray-600">Status</div>
                          <div className={`text-sm font-medium ${getCalorieStatusColor(dailyProgress.dailyPercentage)}`}>
                            {getCalorieStatusMessage(dailyProgress.dailyPercentage)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {dailyProgress && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            dailyProgress.dailyPercentage > 110 ? 'bg-red-500' :
                            dailyProgress.dailyPercentage >= 70 ? 'bg-green-500' :
                            'bg-orange-500'
                          }`}
                          style={{ width: `${Math.min(dailyProgress.dailyPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={downloadGroceryList}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg hover:opacity-90"
              style={{ backgroundColor: colors.deepBlue, color: 'white' }}
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Grocery List</span>
            </button>
          </div>
        </div>
        
        {/* Main Content - Minimalist Expandable Design */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {dayOrder.map(day => {
              const dayMeals = groupedMeals[day] || [];
              if (dayMeals.length === 0) return null;

              const isExpanded = expandedDays[day];
              
              return (
                <div key={day} className="border rounded-xl overflow-hidden" style={{ borderColor: colors.lightGray }}>
                  {/* Day Header - Minimalist */}
                  <button
                    onClick={() => toggleDay(day)}
                    className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {isExpanded ? <ChevronDown className="w-5 h-5" style={{ color: colors.mediumGray }} /> : <ChevronRight className="w-5 h-5" style={{ color: colors.mediumGray }} />}
                      <h3 className="text-lg font-semibold" style={{ color: colors.nearBlack }}>
                        {formatDay(day)}
                      </h3>
                      <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: colors.paleGray, color: colors.deepBlue }}>
                        {dayMeals.length} meals
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-sm" style={{ color: colors.mediumGray }}>
                        {dayMeals.reduce((total, meal) => {
                          const selected = meal.options.find(opt => opt.id === selectedOptions[meal.id]);
                          return total + (selected?.calories || 0);
                        }, 0)} cal total
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t" style={{ borderColor: colors.lightGray }}>
                      {dayMeals.map(meal => {
                        const selectedOptionId = selectedOptions[meal.id];
                        const selectedOption = meal.options.find(opt => opt.id === selectedOptionId);
                        
                        return (
                          <div key={meal.id} className="p-6 border-b last:border-b-0" style={{ borderColor: colors.paleGray }}>
                            {/* Meal Header */}
                            <div className="flex justify-between items-center mb-4">
                              <div className="flex items-center space-x-3">
                                <h4 className="font-semibold text-lg" style={{ color: colors.nearBlack }}>
                                  {formatMealType(meal.mealType)}
                                </h4>
                                <button
                                  onClick={() => markMealAsEaten(meal.id, !eatenMeals[meal.id])}
                                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                    eatenMeals[meal.id] 
                                      ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {eatenMeals[meal.id] ? '✓ Eaten' : 'Mark as Eaten'}
                                </button>
                              </div>
                              {selectedOption && (
                                <div className="text-right">
                                  <span className="text-sm font-medium px-3 py-1 rounded-full" 
                                        style={{ backgroundColor: colors.paleGray, color: colors.deepBlue }}>
                                    {selectedOption.calories} cal
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Option Cards - With Data Source Indicators */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {meal.options.map(option => {
                                const isSelected = selectedOptionId === option.id;

                                // Enhance option with data source tracking
                                const trackedOption = option;

                                const indicators = { icon: '✓', color: 'text-green-600', bgColor: 'bg-green-50' };
                                const needsAttention = false;
                                const attentionMessage = null;

                                return (
                                  <div key={option.id} className="relative">
                                    {/* Data Quality Alert */}
                                    {needsAttention && (
                                      <div className="absolute -top-2 -right-2 z-10">
                                        <div className="bg-red-500 text-white rounded-full p-1">
                                          <AlertTriangle className="w-4 h-4" />
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      onClick={() => selectMealOption(meal.id, option.id)}
                                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                                        isSelected ? 'border-blue-500 bg-blue-50' : `${indicators.borderColor} hover:border-gray-400`
                                      }`}
                                      title="Meal data verified"
                                    >
                                      {/* Option Header with Data Source Badge */}
                                      <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center space-x-2 flex-wrap">
                                          <span className="font-medium text-gray-900">
                                            Option {option.optionNumber}
                                          </span>
                                          <span className={`text-xs px-2 py-1 rounded ${
                                            option.optionType === 'restaurant'
                                              ? 'bg-orange-100 text-orange-800'
                                              : 'bg-green-100 text-green-800'
                                          }`}>
                                            {option.optionType === 'restaurant' ? '🏪 Restaurant' : '🏠 Home'}
                                          </span>

                                          {/* Data Source Badge */}
                                          <span className={`text-xs px-2 py-1 rounded ${indicators.badgeColor}`}>
                                            {indicators.badgeText}
                                          </span>
                                        </div>

                                        {/* Confidence Indicator */}
                                        <div className={`text-xs ${indicators.confidenceColor} flex items-center space-x-1`}>
                                          {trackedOption.dataSource.confidence >= 80 ? (
                                            <CheckCircle className="w-3 h-3" />
                                          ) : trackedOption.dataSource.confidence >= 60 ? (
                                            <Info className="w-3 h-3" />
                                          ) : (
                                            <AlertTriangle className="w-3 h-3" />
                                          )}
                                          <span>{trackedOption.dataSource.confidence}%</span>
                                        </div>
                                      </div>

                                      {/* Attention Message */}
                                      {attentionMessage && (
                                        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                                          <AlertTriangle className="w-3 h-3 inline mr-1" />
                                          {attentionMessage}
                                        </div>
                                      )}

                                      {/* Validation Flags */}
                                      {trackedOption.validationFlags && trackedOption.validationFlags.length > 0 && (
                                        <div className="mb-3 space-y-1">
                                          {trackedOption.validationFlags.map((flag, idx) => (
                                            <div key={idx} className={`text-xs px-2 py-1 rounded ${
                                              flag.includes('Data Error') ? 'bg-red-100 text-red-800' :
                                              flag.includes('High Price') ? 'bg-orange-100 text-orange-800' :
                                              'bg-yellow-100 text-yellow-800'
                                            }`}>
                                              {flag}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    
                                      {/* Title */}
                                      <h5 className="font-semibold mb-2 text-gray-900">
                                        {option.optionType === 'restaurant'
                                          ? `${option.dishName} - ${option.restaurantName}`
                                          : option.recipeName}
                                      </h5>

                                      {/* Goal Justification - Clean Style */}
                                      {option.description && (
                                        <div className="mb-3 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
                                          <p className="text-sm font-medium text-blue-800 leading-relaxed">
                                            ✨ {option.description}
                                          </p>
                                        </div>
                                      )}

                                      {/* Goal-Based Reasoning */}
                                      {(option.goalReasoning || option.why_perfect_for_goal) && (
                                        <div className="mb-3 p-3 bg-green-50 border-l-4 border-green-500 rounded">
                                          <div className="flex items-start space-x-2">
                                            <Target className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                            <p className="text-sm font-medium text-green-800 leading-relaxed">
                                              {option.goalReasoning || option.why_perfect_for_goal}
                                            </p>
                                          </div>
                                        </div>
                                      )}

                                      {/* Details */}
                                      {option.optionType === 'restaurant' ? (
                                        <div className="space-y-2 text-sm">
                                          <div className="flex justify-between items-center">
                                            <span className="text-gray-600">
                                              {formatPrice(option.estimatedPrice)} • {option.deliveryTime}
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-2 text-sm">
                                          <div className="flex justify-between items-center">
                                            <span className="text-gray-600">
                                              {option.prepTime ? `${option.prepTime} min prep` : ''}
                                              {option.cookingTime ? ` • ${option.cookingTime} min cook` : ''}
                                              {option.difficulty ? ` • ${option.difficulty}` : ''}
                                            </span>
                                            <span className="text-blue-600">
                                              ~{formatPrice(option.estimatedCost)} ingredients
                                            </span>
                                          </div>
                                          <div className="text-gray-600">
                                            <strong>Key ingredients:</strong> {option.ingredients?.slice(0, 3).join(', ')}
                                            {(option.ingredients?.length || 0) > 3 && '...'}
                                          </div>
                                        </div>
                                      )}

                                      {/* Nutrition with Meal Goal Percentage */}
                                      <div className="mt-3 pt-3 border-t border-gray-200 text-xs">
                                        <div className="flex justify-between items-center">
                                          <div className="text-gray-700">
                                            <strong>{option.calories} cal</strong> • {option.protein}g protein • {option.carbs}g carbs • {option.fat}g fat
                                          </div>
                                          {calorieGoal && (
                                            <div className="text-right">
                                              {(() => {
                                                const mealTypeGoal = meal.mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner';
                                                const goalCalories = calorieGoal[mealTypeGoal];
                                                const percentage = goalCalories > 0 ? Math.round((option.calories / goalCalories) * 100) : 0;
                                                return (
                                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getCalorieStatusColor(percentage)} bg-gray-100`}>
                                                    {percentage}% of {meal.mealType.toLowerCase()} goal
                                                  </span>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Feedback Buttons */}
                            {selectedOption && (
                              <div className="flex justify-center space-x-2 mt-4">
                                <button
                                  onClick={() => giveFeedback(selectedOption.id, 'loved')}
                                  className="flex items-center space-x-1 px-3 py-1 rounded-full hover:bg-green-50 transition-colors"
                                  style={{ color: colors.mediumGray }}
                                >
                                  <ThumbsUp className="w-4 h-4" />
                                  <span className="text-sm">Love it</span>
                                </button>
                                <button
                                  onClick={() => giveFeedback(selectedOption.id, 'disliked')}
                                  className="flex items-center space-x-1 px-3 py-1 rounded-full hover:bg-red-50 transition-colors"
                                  style={{ color: colors.mediumGray }}
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                  <span className="text-sm">Not for me</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}