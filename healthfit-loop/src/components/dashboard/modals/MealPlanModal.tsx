'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Download, Lock, ThumbsUp, ThumbsDown, ExternalLink, Loader2 } from 'lucide-react';
import { colors } from '../constants';

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
  estimatedPrice?: number;
  orderingUrl?: string;
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
  wasEaten: boolean;
  userRating?: number;
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
            // Default to first option if none selected
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

    // Save selection to backend
    try {
      await fetch('/api/ai/meals/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mealId,
          selectedOptionId: optionId
        })
      });
    } catch (error) {
      console.error('Failed to save meal selection:', error);
    }
  };

  const giveFeedback = async (optionId: string, feedbackType: string) => {
    try {
      await fetch('/api/ai/meals/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mealOptionId: optionId,
          feedbackType
        })
      });
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }
  };

  const downloadGroceryList = () => {
    if (!mealPlan) return;

    const ingredients = new Set<string>();
    mealPlan.meals.forEach(meal => {
      const selectedOption = meal.options.find(opt => opt.id === selectedOptions[meal.id]);
      if (selectedOption?.optionType === 'home' && selectedOption.ingredients) {
        selectedOption.ingredients.forEach(ingredient => ingredients.add(ingredient));
      }
    });

    const csvContent = "data:text/csv;charset=utf-8," + 
      "Ingredient\n" +
      Array.from(ingredients).join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "grocery_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDay = (day: string) => {
    return day.charAt(0).toUpperCase() + day.slice(1);
  };

  const formatMealType = (mealType: string) => {
    return mealType.charAt(0).toUpperCase() + mealType.slice(1);
  };

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
      <div className="rounded-2xl max-w-7xl w-full h-[90vh] flex flex-col" style={{ backgroundColor: colors.white }}>
        {/* Header */}
        <div className="flex-shrink-0 p-6 flex justify-between items-center" style={{ backgroundColor: colors.deepBlue }}>
          <div className="flex items-center space-x-4">
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2 flex items-center space-x-2">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back to Dashboard</span>
            </button>
            <div>
              <h2 className="text-2xl font-bold text-white">Weekly Meal Plan</h2>
              <p className="text-white/80 text-sm">
                Customized for {surveyData?.firstName} • Week of {new Date(mealPlan.weekOf).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right text-white/80 text-sm">
              <div>Regenerations: {mealPlan.regenerationCount}/2</div>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Main meal plan */}
            <div className="xl:col-span-3">
              {dayOrder.map(day => {
                const dayMeals = groupedMeals[day] || [];
                if (dayMeals.length === 0) return null;

                return (
                  <div key={day} className="mb-8">
                    <h3 className="text-xl font-bold mb-4" style={{ color: colors.nearBlack }}>
                      {formatDay(day)}
                    </h3>
                    
                    <div className="grid gap-4">
                      {dayMeals.map(meal => {
                        const selectedOptionId = selectedOptions[meal.id];
                        const selectedOption = meal.options.find(opt => opt.id === selectedOptionId);
                        
                        return (
                          <div key={meal.id} className="border rounded-lg p-4" style={{ borderColor: colors.lightGray }}>
                            <div className="flex justify-between items-start mb-3">
                              <h4 className="font-semibold text-lg" style={{ color: colors.nearBlack }}>
                                {formatMealType(meal.mealType)}
                              </h4>
                              {selectedOption && (
                                <span className="text-sm font-medium px-2 py-1 rounded" 
                                      style={{ 
                                        backgroundColor: colors.paleGray, 
                                        color: colors.deepBlue 
                                      }}>
                                  {selectedOption.calories} cal
                                </span>
                              )}
                            </div>

                            {/* Option Selector */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                              {meal.options.map(option => {
                                const isSelected = selectedOptionId === option.id;
                                
                                return (
                                  <button
                                    key={option.id}
                                    onClick={() => selectMealOption(meal.id, option.id)}
                                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div>
                                        <span className="font-medium" style={{ color: colors.nearBlack }}>
                                          Option {option.optionNumber}
                                        </span>
                                        <span className={`ml-2 text-xs px-2 py-1 rounded ${
                                          option.optionType === 'restaurant' 
                                            ? 'bg-orange-100 text-orange-800' 
                                            : 'bg-green-100 text-green-800'
                                        }`}>
                                          {option.optionType === 'restaurant' ? '🏪 Restaurant' : '🏠 Home'}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <h5 className="font-semibold mb-2" style={{ color: colors.nearBlack }}>
                                      {option.optionType === 'restaurant' 
                                        ? `${option.dishName} - ${option.restaurantName}` 
                                        : option.recipeName}
                                    </h5>
                                    
                                    {option.optionType === 'restaurant' ? (
                                      <div className="space-y-1 text-sm">
                                        <div style={{ color: colors.mediumGray }}>
                                          {formatPrice(option.estimatedPrice)} • {option.deliveryTime}
                                        </div>
                                        {option.orderingUrl && (
                                          <div className="flex items-center space-x-1 text-blue-600">
                                            <ExternalLink className="w-3 h-3" />
                                            <span>Order on DoorDash</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="space-y-1 text-sm">
                                        <div style={{ color: colors.mediumGray }}>
                                          {option.cookingTime} min • {option.difficulty}
                                        </div>
                                        <div style={{ color: colors.mediumGray }}>
                                          {option.ingredients?.slice(0, 3).join(', ')}
                                          {(option.ingredients?.length || 0) > 3 && '...'}
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div className="mt-2 text-xs" style={{ color: colors.darkGray }}>
                                      {option.protein}g protein • {option.carbs}g carbs • {option.fat}g fat
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Feedback and Actions */}
                            {selectedOption && (
                              <div className="flex justify-between items-center">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => giveFeedback(selectedOption.id, 'loved')}
                                    className="flex items-center space-x-1 px-3 py-1 rounded-full hover:bg-green-50"
                                    style={{ color: colors.mediumGray }}
                                  >
                                    <ThumbsUp className="w-4 h-4" />
                                    <span className="text-sm">Love it</span>
                                  </button>
                                  <button
                                    onClick={() => giveFeedback(selectedOption.id, 'disliked')}
                                    className="flex items-center space-x-1 px-3 py-1 rounded-full hover:bg-red-50"
                                    style={{ color: colors.mediumGray }}
                                  >
                                    <ThumbsDown className="w-4 h-4" />
                                    <span className="text-sm">Not for me</span>
                                  </button>
                                </div>
                                
                                {selectedOption.optionType === 'restaurant' && selectedOption.orderingUrl && !isGuest && (
                                  <a
                                    href={selectedOption.orderingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90"
                                    style={{ backgroundColor: colors.deepBlue }}
                                  >
                                    Order Now
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Sidebar */}
            <div className="xl:col-span-1">
              <h3 className="text-xl font-semibold mb-4" style={{ color: colors.nearBlack }}>Quick Actions</h3>
              
              <button 
                onClick={downloadGroceryList}
                className="w-full text-white py-3 rounded-lg hover:opacity-90 flex items-center justify-center space-x-2 mb-4"
                style={{ backgroundColor: colors.deepBlue }}
              >
                <Download className="w-4 h-4" />
                <span>Download Grocery List</span>
              </button>
              
              {isGuest && (
                <div className="border rounded-lg p-4" style={{ backgroundColor: colors.offWhite, borderColor: colors.lightGray }}>
                  <div className="flex items-center space-x-2 mb-2">
                    <Lock className="w-4 h-4" style={{ color: colors.mediumGray }} />
                    <span className="font-medium" style={{ color: colors.nearBlack }}>Guest Limitations</span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: colors.mediumGray }}>
                    Create an account to unlock direct ordering links and save your preferences!
                  </p>
                </div>
              )}

              {/* Week Summary */}
              <div className="mt-6 border rounded-lg p-4" style={{ borderColor: colors.lightGray }}>
                <h4 className="font-semibold mb-3" style={{ color: colors.nearBlack }}>Week Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: colors.darkGray }}>Total Meals</span>
                    <span style={{ color: colors.nearBlack }}>{mealPlan.meals.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: colors.darkGray }}>Restaurant Meals</span>
                    <span style={{ color: colors.nearBlack }}>
                      {mealPlan.meals.filter(m => {
                        const selected = m.options.find(opt => opt.id === selectedOptions[m.id]);
                        return selected?.optionType === 'restaurant';
                      }).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: colors.darkGray }}>Home Meals</span>
                    <span style={{ color: colors.nearBlack }}>
                      {mealPlan.meals.filter(m => {
                        const selected = m.options.find(opt => opt.id === selectedOptions[m.id]);
                        return selected?.optionType === 'home';
                      }).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}