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
  User
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
  const [selectedDay, setSelectedDay] = useState("sunday");
  const [ratings, setRatings] = useState<{[key: string]: number}>({});
  const [mealData, setMealData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 4-day plan matching the API data structure
  const days = [
    { id: "sunday", name: "Sun", date: "Nov 3", dayNumber: 1 },
    { id: "monday", name: "Mon", date: "Nov 4", dayNumber: 2 },
    { id: "tuesday", name: "Tue", date: "Nov 5", dayNumber: 3 },
    { id: "wednesday", name: "Wed", date: "Nov 6", dayNumber: 4 }
  ];

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    } else {
      setLoading(false);
    }
  }, [generationStatus.mealsGenerated]);

  useEffect(() => {
    // Default to first day (Sunday) when component loads
    setSelectedDay("sunday");
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

  const MealCard = ({ meal, type }: { meal: any, type: string }) => {
    if (!meal) return null;

    const isRestaurant = meal.source === "restaurant";
    const mealName = isRestaurant ? meal.dish : meal.name;
    const description = isRestaurant ? meal.dish_description : meal.description;

    return (
      <Card className="mb-4 border-0 shadow-subtle bg-white transition-all duration-200 hover:shadow-medium">
        <CardContent className="p-4">
          <div className="flex space-x-4">
            <ImageWithFallback
              src={meal.image || "https://images.unsplash.com/photo-1662993924949-2b2d68c08cee?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwZm9vZCUyMGZpdG5lc3MlMjBudXRyaXRpb258ZW58MXx8fHwxNzU5Njc4OTYwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"}
              alt={mealName || `${type} meal`}
              className="w-20 h-20 object-cover rounded-lg"
            />
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-neutral-900">{mealName || `${type} option`}</h3>
                  {isRestaurant && meal.restaurant && (
                    <p className="text-sm text-neutral-600">{meal.restaurant}</p>
                  )}
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <Badge
                    variant={isRestaurant ? "outline" : "secondary"}
                    className={isRestaurant
                      ? "border-green-200 text-green-700 bg-green-50"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                    }
                  >
                    {isRestaurant ? (
                      <><ExternalLink className="w-3 h-3 mr-1" />Restaurant</>
                    ) : (
                      <><Home className="w-3 h-3 mr-1" />Home</>
                    )}
                  </Badge>
                  {isRestaurant && meal.price && (
                    <span className="text-sm font-medium text-green-600">${meal.price}</span>
                  )}
                </div>
              </div>

              {description && (
                <p className="text-sm text-neutral-600 mb-3 line-clamp-2">{description}</p>
              )}

              {isRestaurant && meal.restaurant_description && (
                <p className="text-xs text-neutral-500 mb-3 italic">{meal.restaurant_description}</p>
              )}

              <div className="flex items-center justify-between">
                <StarRating mealId={`${selectedDay}-${type}-${mealName || Math.random()}`} />
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-neutral-200 hover:border-neutral-300"
                >
                  {isRestaurant ? "Order" : "Recipe"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
    if (mealData && mealData.mealPlan && mealData.mealPlan.meals) {
      console.log('Looking for meals for day:', selectedDay, 'in data:', mealData.mealPlan.meals);

      // Map day names to day numbers
      const dayMap = {
        'monday': 1,
        'tuesday': 2,
        'wednesday': 3,
        'thursday': 4,
        'friday': 5,
        'saturday': 6,
        'sunday': 0
      };

      const selectedDayNumber = dayMap[selectedDay] || 1;

      // Find today's meals or first day's meals
      const todaysMeals = mealData.mealPlan.meals.find((day: any) =>
        day.day === selectedDayNumber || day.day === 1
      ) || mealData.mealPlan.meals[0]; // Fallback to first day

      if (todaysMeals) {
        console.log('Found meals for day:', todaysMeals);
        return {
          breakfast: todaysMeals.breakfast ? [todaysMeals.breakfast] : [],
          lunch: todaysMeals.lunch ? [todaysMeals.lunch] : [],
          dinner: todaysMeals.dinner ? [todaysMeals.dinner] : []
        };
      }
    }

    // Fallback to mock data
    return {
      breakfast: [
        {
          id: "b1",
          name: "Greek Yogurt with Berries",
          type: "home",
          calories: 320,
          protein: "18g",
          prepTime: "5 min"
        }
      ],
      lunch: [
        {
          id: "l1",
          name: "Mediterranean Quinoa Salad",
          type: "home",
          calories: 450,
          protein: "16g",
          prepTime: "15 min"
        }
      ],
      dinner: [
        {
          id: "d1",
          name: "Grilled Salmon with Vegetables",
          type: "home",
          calories: 480,
          protein: "35g",
          prepTime: "25 min"
        }
      ]
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
          <Button
            variant="outline"
            size="sm"
            className="text-primary border-primary hover:bg-primary/5"
            onClick={generateNewMeals}
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerate
          </Button>
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
            {currentMeals.breakfast.map((meal: any, index: number) => (
              <MealCard key={`breakfast-${index}-${meal.name || meal.dish || index}`} meal={meal} type="breakfast" />
            ))}
          </TabsContent>

          <TabsContent value="lunch" className="space-y-4 pb-24">
            <h2 className="text-xl font-medium text-neutral-900 mb-4">Lunch Options</h2>
            {currentMeals.lunch.map((meal: any, index: number) => (
              <MealCard key={`lunch-${index}-${meal.name || meal.dish || index}`} meal={meal} type="lunch" />
            ))}
          </TabsContent>

          <TabsContent value="dinner" className="space-y-4 pb-24">
            <h2 className="text-xl font-medium text-neutral-900 mb-4">Dinner Options</h2>
            {currentMeals.dinner.map((meal: any, index: number) => (
              <MealCard key={`dinner-${index}-${meal.name || meal.dish || index}`} meal={meal} type="dinner" />
            ))}
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