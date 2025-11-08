'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  ArrowLeft,
  Clock,
  Star,
  RefreshCw,
  ExternalLink,
  Home,
  TrendingUp,
  Target,
  Apple,
  Dumbbell,
  User,
  ChevronDown,
  MapPin
} from "lucide-react";

interface MealPlanPageProps {
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
  };
}

export function MealPlanPage({ onNavigate, generationStatus }: MealPlanPageProps) {
  // Generate dynamic days starting from today
  const getDaysStartingFromToday = () => {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayDisplayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = today.getDay();

    const orderedDays = [];
    for (let i = 0; i < 4; i++) { // 4-day plan
      const dayIndex = (todayIndex + i) % 7;
      const currentDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      orderedDays.push({
        id: dayNames[dayIndex],
        name: dayDisplayNames[dayIndex],
        date: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dayNumber: i + 1
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
  const [ratings, setRatings] = useState<{[key: string]: number}>({});
  const [mealData, setMealData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 4-day plan starting from today
  const days = getDaysStartingFromToday();

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    } else {
      setLoading(false);
    }
  }, [generationStatus.mealsGenerated]);

  useEffect(() => {
    // Default to today when component loads
    setSelectedDay(getCurrentDay());
  }, []);

  const fetchMealData = async () => {
    try {
      const response = await fetch('/api/ai/meals/current');
      if (response.ok) {
        const data = await response.json();
        setMealData(data);
        console.log('Fetched meal data:', data);
      }
    } catch (error) {
      console.error('Failed to fetch meal data:', error);
    } finally {
      setLoading(false);
    }
  };

  const rateMeal = (mealId: string, rating: number) => {
    setRatings(prev => ({ ...prev, [mealId]: rating }));
  };

  const generateNewMeals = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/meals/generate', {
        method: 'POST'
      });
      if (response.ok) {
        await fetchMealData();
      }
    } catch (error) {
      console.error('Failed to generate new meals:', error);
    } finally {
      setLoading(false);
    }
  };

  const StarRating = ({ mealId, currentRating }: { mealId: string, currentRating?: number }) => {
    const rating = currentRating || ratings[mealId] || 0;
    return (
      <div className="flex space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => rateMeal(mealId, star)}
            className={`w-4 h-4 transition-colors duration-200 ${
              star <= rating ? 'text-yellow-400' : 'text-neutral-300'
            }`}
          >
            <Star className="w-full h-full fill-current" />
          </button>
        ))}
      </div>
    );
  };

  const MealCard = ({ meal, type, extraRestaurantOptions }: { meal: any, type: string, extraRestaurantOptions?: any[] }) => {
    const [selectedOption, setSelectedOption] = useState(0);
    const [showExtraOptions, setShowExtraOptions] = useState(false);
    const [showRecipe, setShowRecipe] = useState(false);
    const [recipeData, setRecipeData] = useState<any>(null);
    const [loadingRecipe, setLoadingRecipe] = useState(false);

    if (!meal) return null;

    // Handle new structure with primary/alternatives
    const hasPrimary = meal.primary;
    const options = hasPrimary
      ? [meal.primary, ...(meal.alternatives || [])]
      : [meal]; // Fallback for old structure

    const currentMeal = options[selectedOption];
    const isRestaurant = currentMeal.source === "restaurant";
    const mealName = isRestaurant ? currentMeal.dish : currentMeal.name;
    const description = isRestaurant ? currentMeal.dish_description : currentMeal.description;

    const handleRecipeClick = async () => {
      if (isRestaurant) {
        // For restaurant meals, open ordering link
        const orderingUrl = currentMeal.orderingUrl || currentMeal.website;
        if (orderingUrl) {
          window.open(orderingUrl, '_blank');
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

    return (
      <>
        <Card className={`mb-4 border-0 transition-all duration-300 hover:scale-[1.02] ${
          isRestaurant
            ? 'bg-gradient-to-br from-emerald-50 via-white to-green-50 shadow-lg hover:shadow-xl ring-1 ring-emerald-100'
            : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50 shadow-md hover:shadow-lg ring-1 ring-blue-100'
        }`}>
          <CardContent className="p-5">
            {options.length > 1 && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <h4 className="text-sm font-semibold text-neutral-800 capitalize">{type} Options</h4>
                  <div className="flex items-center space-x-2 bg-white/60 rounded-full px-3 py-1">
                    <span className="text-xs font-medium text-neutral-600">
                      {selectedOption + 1} of {options.length}
                    </span>
                    <div className="flex space-x-1">
                      {options.map((option, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedOption(index)}
                          className={`w-2 h-2 rounded-full transition-all duration-200 ${
                            index === selectedOption
                              ? (isRestaurant ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-blue-500 ring-2 ring-blue-200')
                              : 'bg-neutral-300 hover:bg-neutral-400'
                          }`}
                          title={`Switch to ${option.source === 'restaurant' ? 'restaurant' : 'home'} option`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-xs font-medium ${
                    isRestaurant
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-blue-100 text-blue-700 border-blue-200'
                  }`}
                >
                  {isRestaurant ? '🍽️ Restaurant' : '🏠 Home Made'}
                </Badge>
              </div>
            )}

            <div className="flex space-x-5">
              <div className="relative">
                <ImageWithFallback
                  src={currentMeal.imageUrl || currentMeal.image || "https://images.unsplash.com/photo-1662993924949-2b2d68c08cee?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwZm9vZCUyMGZpdG5lc3MlMjBudXRyaXRpb258ZW58MXx8fHwxNzU5Njc4OTYwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"}
                  alt={mealName || `${type} meal`}
                  className={`w-24 h-24 object-cover rounded-xl shadow-md transition-transform duration-200 hover:scale-105 ${
                    isRestaurant ? 'ring-2 ring-emerald-200' : 'ring-2 ring-blue-200'
                  }`}
                />
                {isRestaurant && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
                    <ExternalLink className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-neutral-900 leading-tight mb-1">
                      {mealName || `${type} option`}
                    </h3>
                    {isRestaurant && currentMeal.restaurant && (
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="flex items-center text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                          <MapPin className="w-3 h-3 mr-1" />
                          <span className="text-xs font-medium">{currentMeal.restaurant}</span>
                        </div>
                        {currentMeal.price && (
                          <div className="flex items-center text-green-700 bg-green-100 px-2 py-1 rounded-full">
                            <span className="text-sm font-bold">~${currentMeal.price}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {description && (
                  <p className="text-sm text-neutral-700 mb-3 leading-relaxed">{description}</p>
                )}

                {isRestaurant && currentMeal.restaurant_description && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
                    <p className="text-xs text-emerald-700 italic font-medium">"{currentMeal.restaurant_description}"</p>
                    <p className="text-xs text-emerald-600 mt-1 font-medium">— Customer review via Google Places</p>
                    {currentMeal.menuSourceUrl && (
                      <div className="mt-2 pt-2 border-t border-emerald-200">
                        <a
                          href={currentMeal.menuSourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:text-emerald-800 underline flex items-center"
                        >
                          📋 Menu verified via {currentMeal.menuSourceName || 'delivery platform'}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <StarRating mealId={`${selectedDay}-${type}-${mealName || Math.random()}`} />
                  <div className="flex space-x-2">
                    {options.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedOption((prev) => (prev + 1) % options.length)}
                        className={`text-xs px-3 py-2 rounded-full transition-all duration-200 ${
                          isRestaurant
                            ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100'
                            : 'text-blue-600 hover:text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Switch Option
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isRestaurant ? "default" : "outline"}
                      onClick={handleRecipeClick}
                      disabled={loadingRecipe}
                      className={`text-xs px-4 py-2 rounded-full font-semibold transition-all duration-200 ${
                        isRestaurant
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg'
                          : 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400'
                      }`}
                    >
                      {loadingRecipe ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                      ) : isRestaurant ? (
                        <ExternalLink className="w-3 h-3 mr-1" />
                      ) : (
                        <Home className="w-3 h-3 mr-1" />
                      )}
                      {loadingRecipe ? 'Generating...' : isRestaurant ? "Order Now" : "Get Recipe"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

          {/* Extra Restaurant Options - Collapsible */}
          {extraRestaurantOptions && extraRestaurantOptions.length > 0 && (
            <div className="mt-5 pt-4 border-t border-emerald-100">
              <button
                onClick={() => setShowExtraOptions(!showExtraOptions)}
                className="flex items-center justify-between w-full p-3 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg border border-emerald-200 hover:from-emerald-100 hover:to-green-100 transition-all duration-200"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-emerald-800">More restaurant options nearby</span>
                  <Badge className="bg-emerald-200 text-emerald-700 text-xs">{extraRestaurantOptions.length}</Badge>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-emerald-600 transition-transform duration-200 ${showExtraOptions ? 'rotate-180' : ''}`}
                />
              </button>

              {showExtraOptions && (
                <div className="mt-3 space-y-3">
                  {extraRestaurantOptions.slice(0, 3).map((option, index) => (
                    <div
                      key={index}
                      className="bg-gradient-to-br from-emerald-25 via-white to-green-25 rounded-xl border border-emerald-200 p-4 hover:shadow-md transition-all duration-200 hover:scale-[1.01]"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                          <ExternalLink className="w-6 h-6 text-white" />
                        </div>

                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-bold text-emerald-900 text-sm leading-tight">
                                {option.dish || option.name || 'Restaurant Recommendation'}
                              </h4>
                              <div className="flex items-center text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full mt-1 w-fit">
                                <MapPin className="w-3 h-3 mr-1" />
                                <span className="text-xs font-medium">{option.restaurant || option.restaurantName || 'Local Restaurant'}</span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => {
                                // Try to open restaurant menu URL if available
                                if (option.menuUrl || option.orderingUrl) {
                                  window.open(option.menuUrl || option.orderingUrl, '_blank');
                                } else {
                                  // Fallback to Google search for the restaurant
                                  const searchQuery = encodeURIComponent(`${option.restaurant || option.restaurantName} menu online order`);
                                  window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded-full shadow-sm"
                            >
                              View Menu
                            </Button>
                          </div>

                          {option.description && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 mt-2">
                              <p className="text-xs text-emerald-700 italic line-clamp-2">"{option.description}"</p>
                              <p className="text-xs text-emerald-600 mt-1 font-medium">— Customer review via Google Places</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {extraRestaurantOptions.length === 0 && (
                    <div className="p-4 bg-gradient-to-br from-neutral-50 to-gray-50 rounded-xl border border-neutral-200 text-center">
                      <p className="text-xs text-neutral-500">No additional restaurant options found</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </CardContent>
        </Card>

        {/* Recipe Display Modal */}
        {showRecipe && recipeData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl max-h-[90vh] overflow-y-auto w-full">
              <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{recipeData.name}</h2>
                    <p className="text-blue-100 mt-1">{recipeData.description}</p>
                  </div>
                  <button
                    onClick={() => setShowRecipe(false)}
                    className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Recipe Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600">{recipeData.prepTime}</div>
                    <div className="text-xs text-blue-700 font-medium">Prep Time</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{recipeData.cookTime}</div>
                    <div className="text-xs text-green-700 font-medium">Cook Time</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">{recipeData.servings}</div>
                    <div className="text-xs text-orange-700 font-medium">Servings</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-600">{recipeData.difficulty}</div>
                    <div className="text-xs text-purple-700 font-medium">Difficulty</div>
                  </div>
                </div>

                {/* Grocery List */}
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-5 border border-emerald-200">
                  <h3 className="text-lg font-bold text-emerald-800 mb-4 flex items-center">
                    🛒 Grocery List
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recipeData.groceryList?.map((item: any, index: number) => (
                      <div key={index} className="flex items-center space-x-3 bg-white/60 rounded-lg p-3">
                        <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-emerald-900">{item.amount} {item.ingredient}</div>
                          {item.note && <div className="text-xs text-emerald-600 italic">{item.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
                  <h3 className="text-lg font-bold text-blue-800 mb-4 flex items-center">
                    👨‍🍳 Cooking Instructions
                  </h3>
                  <div className="space-y-4">
                    {recipeData.instructions?.map((step: string, index: number) => (
                      <div key={index} className="flex space-x-4">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 mt-1">
                          {index + 1}
                        </div>
                        <div className="flex-1 bg-white/60 rounded-lg p-4">
                          <p className="text-blue-900 leading-relaxed">{step}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nutrition Info */}
                {recipeData.nutrition && (
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-200">
                    <h3 className="text-lg font-bold text-purple-800 mb-4 flex items-center">
                      📊 Nutrition Information
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-purple-700">{recipeData.nutrition.calories}</div>
                        <div className="text-xs text-purple-600 font-medium">Calories</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-purple-700">{recipeData.nutrition.protein}g</div>
                        <div className="text-xs text-purple-600 font-medium">Protein</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-purple-700">{recipeData.nutrition.carbs}g</div>
                        <div className="text-xs text-purple-600 font-medium">Carbs</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-purple-700">{recipeData.nutrition.fat}g</div>
                        <div className="text-xs text-purple-600 font-medium">Fat</div>
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
        <div className="bg-white/90 backdrop-blur-sm border-b border-neutral-200/50 p-6">
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
                <h1 className="text-2xl font-medium text-neutral-900">Meal Plan</h1>
                <p className="text-sm text-neutral-600">Your personalized nutrition guide</p>
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
              <Target className="w-5 h-5 mb-1" />
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

  // Use real meal data if available, otherwise use mock data
  const getCurrentMeals = () => {
    // Handle new structure where meals array is directly in mealPlan
    if (mealData && mealData.mealPlan && Array.isArray(mealData.mealPlan.meals) && mealData.mealPlan.meals.length > 0) {
      console.log('Looking for meals for day:', selectedDay, 'in direct mealPlan structure:', mealData.mealPlan.meals);

      const today = new Date();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayIndex = today.getDay();

      // Calculate which day number this selected day corresponds to in our 4-day plan
      const selectedDayIndex = dayNames.indexOf(selectedDay);
      let dayNumber = 1; // Default to day 1

      if (selectedDayIndex >= 0) {
        // Calculate how many days from today this selected day is
        let daysFromToday = selectedDayIndex - todayIndex;
        if (daysFromToday < 0) daysFromToday += 7; // Handle wrap around
        dayNumber = Math.min(daysFromToday + 1, 4); // Limit to our 4-day plan
      }

      // Find the specific day's meals - the meals array IS the days array
      console.log('Looking for day number:', dayNumber, 'for selected day:', selectedDay);
      const todaysMeals = mealData.mealPlan.meals.find((day: any) => {
        console.log('Checking day:', day.day, 'day_name:', day.day_name, 'against:', dayNumber);
        return day.day === dayNumber;
      }) || mealData.mealPlan.meals[0]; // Fallback to first day

      if (todaysMeals) {
        console.log('Found meals for day:', todaysMeals);
        return {
          breakfast: todaysMeals.breakfast ? [todaysMeals.breakfast] : [],
          lunch: todaysMeals.lunch ? [todaysMeals.lunch] : [],
          dinner: todaysMeals.dinner ? [todaysMeals.dinner] : []
        };
      }
    }

    // Handle new weeklyMealPlan structure
    if (mealData && mealData.weeklyMealPlan && mealData.weeklyMealPlan.days) {
      console.log('Looking for meals for day:', selectedDay, 'in new data structure:', mealData.weeklyMealPlan.days);

      // Map selected day to the corresponding day in our 4-day plan
      const today = new Date();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayIndex = today.getDay();

      // Calculate which day number this selected day corresponds to in our 4-day plan
      const selectedDayIndex = dayNames.indexOf(selectedDay);
      let dayNumber = 1; // Default to day 1

      if (selectedDayIndex >= 0) {
        // Calculate how many days from today this selected day is
        let daysFromToday = selectedDayIndex - todayIndex;
        if (daysFromToday < 0) daysFromToday += 7; // Handle wrap around
        dayNumber = Math.min(daysFromToday + 1, 4); // Limit to our 4-day plan
      }

      // Find the specific day's meals
      console.log('Looking for day number:', dayNumber, 'for selected day:', selectedDay);
      const todaysMeals = mealData.weeklyMealPlan.days.find((day: any) => {
        console.log('Checking day:', day.day, 'day_name:', day.day_name, 'against:', dayNumber);
        return day.day === dayNumber;
      }) || mealData.weeklyMealPlan.days[0]; // Fallback to first day

      if (todaysMeals) {
        console.log('Found meals for day:', todaysMeals);
        return {
          breakfast: todaysMeals.breakfast ? [todaysMeals.breakfast] : [],
          lunch: todaysMeals.lunch ? [todaysMeals.lunch] : [],
          dinner: todaysMeals.dinner ? [todaysMeals.dinner] : []
        };
      }
    }

    // Fallback to old structure for backwards compatibility
    if (mealData && mealData.mealPlan && mealData.mealPlan.meals) {
      console.log('Looking for meals for day:', selectedDay, 'in old data structure:', mealData.mealPlan.meals);

      // Map selected day to the corresponding day in our 4-day plan
      const today = new Date();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayIndex = today.getDay();

      // Calculate which day number this selected day corresponds to in our 4-day plan
      const selectedDayIndex = dayNames.indexOf(selectedDay);
      let dayNumber = 1; // Default to day 1

      if (selectedDayIndex >= 0) {
        // Calculate how many days from today this selected day is
        let daysFromToday = selectedDayIndex - todayIndex;
        if (daysFromToday < 0) daysFromToday += 7; // Handle wrap around
        dayNumber = Math.min(daysFromToday + 1, 4); // Limit to our 4-day plan
      }

      // Find the specific day's meals
      console.log('Looking for day number:', dayNumber, 'for selected day:', selectedDay);
      const todaysMeals = mealData.mealPlan.meals.find((day: any) => {
        console.log('Checking day:', day.day, 'day_name:', day.day_name, 'against:', dayNumber);
        return day.day === dayNumber;
      }) || mealData.mealPlan.meals[0]; // Fallback to first day

      if (todaysMeals) {
        console.log('Found meals for day:', todaysMeals);
        return {
          breakfast: todaysMeals.breakfast ? [todaysMeals.breakfast] : [],
          lunch: todaysMeals.lunch ? [todaysMeals.lunch] : [],
          dinner: todaysMeals.dinner ? [todaysMeals.dinner] : []
        };
      }
    }

    // No real data available
    console.log('No real meal data found - showing empty state');
    return {
      breakfast: [],
      lunch: [],
      dinner: []
    };
  };

  const currentMeals = getCurrentMeals();

  const totalCalories = (currentMeals.breakfast[0]?.calories || 0) + (currentMeals.lunch[0]?.calories || 0) + (currentMeals.dinner[0]?.calories || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm border-b border-neutral-200/50 p-6">
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
              <h1 className="text-2xl font-medium text-neutral-900">Meal Plan</h1>
              <p className="text-sm text-neutral-600">Your personalized nutrition guide</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Week Navigation - 4 days instead of 7 */}
        <div className="mb-6">
          <div className="flex justify-center space-x-2 overflow-x-auto pb-2">
            {days.map((day) => (
              <Button
                key={day.id}
                variant={selectedDay === day.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log('Day clicked:', day.id, 'Current selectedDay:', selectedDay);
                  setSelectedDay(day.id);
                }}
                className={`min-w-20 flex flex-col p-3 h-auto transition-all duration-200 ${
                  selectedDay === day.id
                    ? "bg-red-600 text-white shadow-lg"
                    : "border-neutral-200 hover:border-red-300 hover:bg-red-50 bg-white"
                }`}
              >
                <span className="font-medium">{day.name}</span>
                <span className="text-xs opacity-70">{day.date}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Daily Overview */}
        <Card className="mb-6 border-0 shadow-subtle bg-white">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="capitalize text-lg font-medium">{selectedDay}</span>
              <div className="text-sm text-neutral-600">
                Total: {totalCalories} cal
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-medium text-accent-green">
                  {currentMeals.breakfast.length}
                </div>
                <div className="text-sm text-neutral-600">Breakfast</div>
              </div>
              <div>
                <div className="text-lg font-medium text-accent-blue">
                  {currentMeals.lunch.length}
                </div>
                <div className="text-sm text-neutral-600">Lunch</div>
              </div>
              <div>
                <div className="text-lg font-medium text-primary">
                  {currentMeals.dinner.length}
                </div>
                <div className="text-sm text-neutral-600">Dinner</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Meals */}
        <Tabs defaultValue="breakfast" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-neutral-100">
            <TabsTrigger value="breakfast" className="data-[state=active]:bg-white">Breakfast</TabsTrigger>
            <TabsTrigger value="lunch" className="data-[state=active]:bg-white">Lunch</TabsTrigger>
            <TabsTrigger value="dinner" className="data-[state=active]:bg-white">Dinner</TabsTrigger>
          </TabsList>

          <TabsContent value="breakfast" className="space-y-4 pb-24">
            <h2 className="text-xl font-medium text-neutral-900 mb-4">Breakfast Options</h2>
            {currentMeals.breakfast.length > 0 ? (
              currentMeals.breakfast.map((meal: any, index: number) => (
                <MealCard
                  key={`breakfast-${index}-${meal.name || meal.dish || index}`}
                  meal={meal}
                  type="breakfast"
                  extraRestaurantOptions={meal.extraRestaurantOptions || []}
                />
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-neutral-600">No breakfast data available for {selectedDay}</p>
                <p className="text-sm text-neutral-500 mt-2">Real meal data will appear here once generated</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="lunch" className="space-y-4 pb-24">
            <h2 className="text-xl font-medium text-neutral-900 mb-4">Lunch Options</h2>
            {currentMeals.lunch.length > 0 ? (
              currentMeals.lunch.map((meal: any, index: number) => (
                <MealCard
                  key={`lunch-${index}-${meal.name || meal.dish || index}`}
                  meal={meal}
                  type="lunch"
                  extraRestaurantOptions={meal.extraRestaurantOptions || []}
                />
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-neutral-600">No lunch data available for {selectedDay}</p>
                <p className="text-sm text-neutral-500 mt-2">Real meal data will appear here once generated</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="dinner" className="space-y-4 pb-24">
            <h2 className="text-xl font-medium text-neutral-900 mb-4">Dinner Options</h2>
            {currentMeals.dinner.length > 0 ? (
              currentMeals.dinner.map((meal: any, index: number) => (
                <MealCard
                  key={`dinner-${index}-${meal.name || meal.dish || index}`}
                  meal={meal}
                  type="dinner"
                  extraRestaurantOptions={meal.extraRestaurantOptions || []}
                />
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-neutral-600">No dinner data available for {selectedDay}</p>
                <p className="text-sm text-neutral-500 mt-2">Real meal data will appear here once generated</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("dashboard")}
          >
            <Target className="w-5 h-5 mb-1" />
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