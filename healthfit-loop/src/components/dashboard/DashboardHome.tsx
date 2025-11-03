'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  Calendar,
  TrendingUp,
  Target,
  Clock,
  Flame,
  Award,
  ChevronRight,
  MapPin,
  Plus,
  BarChart3,
  Apple,
  Dumbbell,
  User
} from "lucide-react";

interface DashboardHomeProps {
  user: any;
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
  };
}

export function DashboardHome({ user, onNavigate, generationStatus }: DashboardHomeProps) {
  const [mealData, setMealData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    }
  }, [generationStatus.mealsGenerated]);

  const fetchMealData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ai/meals/current');
      if (response.ok) {
        const data = await response.json();
        setMealData(data);
      }
    } catch (error) {
      console.error('Failed to fetch meal data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get today's meals from real data
  const getTodaysMeals = () => {
    if (mealData && mealData.mealPlan && mealData.mealPlan.meals && mealData.mealPlan.meals.length > 0) {
      // Get first day's meals (today) - handling new JSON structure
      const todaysMeals = mealData.mealPlan.meals[0];

      const formatMeal = (meal) => {
        if (!meal) return "Coming soon";
        if (meal.source === "restaurant") {
          return `${meal.dish} from ${meal.restaurant} ($${meal.price})`;
        } else {
          return meal.name || "Home-cooked meal";
        }
      };

      return {
        breakfast: formatMeal(todaysMeals.breakfast),
        lunch: formatMeal(todaysMeals.lunch),
        dinner: formatMeal(todaysMeals.dinner),
        totalCalories: (todaysMeals.breakfast?.calories || 0) + (todaysMeals.lunch?.calories || 0) + (todaysMeals.dinner?.calories || 0),
        dayName: todaysMeals.day_name || "Today"
      };
    }
    return {
      breakfast: "Coming soon",
      lunch: "Coming soon",
      dinner: "Coming soon",
      totalCalories: 0,
      dayName: "Today"
    };
  };

  const todaysMeals = getTodaysMeals();

  // Mock data for dashboard - will be replaced with real data
  const weeklyProgress = 68;
  const streakDays = 3; // Based on days since survey completion
  const caloriesTarget = 2200;
  const caloriesConsumed = todaysMeals.totalCalories; // Now uses real data when available
  const workoutsCompleted = 0;
  const workoutsPlanned = 4; // Based on 4-day plan

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-gray-900">
              Good morning, {user?.name?.split(' ')[0] || "User"}
            </h1>
            <div className="flex items-center text-gray-600 mt-1">
              <MapPin className="w-4 h-4 mr-1" />
              <span className="text-sm">{user?.location || "New York, NY"}</span>
            </div>
          </div>
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600" />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Weekly Progress Overview */}
        <Card className="border border-gray-200 bg-white">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium text-gray-900">Weekly Progress</CardTitle>
              <Badge variant="secondary" className="bg-red-50 text-red-600 border border-red-200">
                {weeklyProgress}% complete
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={weeklyProgress} className="h-3 mb-6 bg-gray-200 [&>div]:bg-red-600" />
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-red-200">
                  <Flame className="w-7 h-7 text-red-600" />
                </div>
                <div className="text-2xl font-semibold text-gray-900">{streakDays}</div>
                <div className="text-sm text-gray-600">Day streak</div>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-red-200">
                  <Target className="w-7 h-7 text-red-600" />
                </div>
                <div className="text-2xl font-semibold text-gray-900">{workoutsCompleted}/{workoutsPlanned}</div>
                <div className="text-sm text-gray-600">Workouts</div>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-red-200">
                  <BarChart3 className="w-7 h-7 text-red-600" />
                </div>
                <div className="text-2xl font-semibold text-gray-900">{caloriesConsumed > 0 ? Math.round((caloriesConsumed/caloriesTarget)*100) : 0}%</div>
                <div className="text-sm text-gray-600">Nutrition</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Card
            className="border border-gray-200 bg-white cursor-pointer transition-all duration-200 hover:border-red-300 hover:shadow-md group"
            onClick={() => onNavigate("meal-plan")}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center group-hover:bg-red-100 transition-all duration-200 border border-red-200">
                  <Apple className="w-6 h-6 text-red-600" />
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-red-600 transition-colors duration-200" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Meal Plan</h3>
              <p className="text-sm text-gray-600">4-day nutrition guide</p>
              <div className="mt-3">
                <Badge variant="secondary" className={`${
                  generationStatus.mealsGenerated
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-orange-50 text-orange-600 border border-orange-200"
                }`}>
                  {generationStatus.mealsGenerated ? "Ready" : "Generating..."}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card
            className="border border-gray-200 bg-white cursor-pointer transition-all duration-200 hover:border-red-300 hover:shadow-md group"
            onClick={() => onNavigate("workout-plan")}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center group-hover:bg-red-100 transition-all duration-200 border border-red-200">
                  <Dumbbell className="w-6 h-6 text-red-600" />
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-red-600 transition-colors duration-200" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Workout Plan</h3>
              <p className="text-sm text-gray-600">{user?.goal || 'Fitness'} focused</p>
              <div className="mt-3">
                <Badge variant="secondary" className={`${
                  generationStatus.workoutsGenerated
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-orange-50 text-orange-600 border border-orange-200"
                }`}>
                  {generationStatus.workoutsGenerated ? "Ready" : "Generating..."}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Meal Plan */}
        <Card className="border border-gray-200 bg-white">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium text-gray-900">{todaysMeals.dayName}'s Meals</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => onNavigate("meal-plan")}
              >
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {generationStatus.mealsGenerated ? (
              <>
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1662993924949-2b2d68c08cee?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwZm9vZCUyMGZpdG5lc3MlMjBudXRyaXRpb258ZW58MXx8fHwxNzU5Njc4OTYwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                  alt="Healthy meal plan"
                  className="w-full h-32 object-cover rounded-lg mb-4"
                />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Breakfast</span>
                    <span className="text-sm font-medium text-neutral-900">{todaysMeals.breakfast}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Lunch</span>
                    <span className="text-sm font-medium text-neutral-900">{todaysMeals.lunch}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Dinner</span>
                    <span className="text-sm font-medium text-neutral-900">{todaysMeals.dinner}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Daily calories</span>
                    <span className="text-sm font-medium text-gray-900">{caloriesConsumed} / {caloriesTarget}</span>
                  </div>
                  <Progress value={(caloriesConsumed/caloriesTarget)*100} className="h-3 mt-2 bg-gray-200 [&>div]:bg-red-600" />
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h3 className="font-medium text-neutral-900 mb-2">Generating Your Meal Plan</h3>
                <p className="text-sm text-neutral-600">This may take a moment...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border border-gray-200 bg-white">
            <CardContent className="p-5 text-center">
              <div className="text-2xl font-semibold text-gray-900 mb-1">{caloriesConsumed}</div>
              <div className="text-sm text-gray-600">Calories today</div>
              <div className="text-xs text-gray-500 mt-1">of {caloriesTarget} goal</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 bg-white">
            <CardContent className="p-5 text-center">
              <div className="text-2xl font-semibold text-gray-900 mb-1">{workoutsCompleted}</div>
              <div className="text-sm text-gray-600">Workouts</div>
              <div className="text-xs text-gray-500 mt-1">this week</div>
            </CardContent>
          </Card>
        </div>

        {/* Floating Action Button */}
        <div className="fixed bottom-24 right-6">
          <Button
            size="lg"
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-110 group"
            onClick={() => onNavigate("meal-plan")}
          >
            <Plus className="w-7 h-7 group-hover:rotate-90 transition-transform duration-200" />
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button
            className="flex flex-col items-center justify-center text-red-600"
            onClick={() => onNavigate("dashboard")}
          >
            <Target className="w-5 h-5 mb-1" />
            <span className="text-xs">Home</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400"
            onClick={() => onNavigate("meal-plan")}
          >
            <Apple className="w-5 h-5 mb-1" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400"
            onClick={() => onNavigate("workout-plan")}
          >
            <Dumbbell className="w-5 h-5 mb-1" />
            <span className="text-xs">Workouts</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400"
            onClick={() => onNavigate("progress")}
          >
            <TrendingUp className="w-5 h-5 mb-1" />
            <span className="text-xs">Progress</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400"
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