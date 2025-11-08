'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  TrendingUp,
  Target,
  Clock,
  Flame,
  ChevronRight,
  Plus,
  BarChart3,
  Apple,
  Dumbbell
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
  const [consumedMeals, setConsumedMeals] = useState<any>(null);
  const [workoutProgress, setWorkoutProgress] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    }
    fetchConsumptionData();
    fetchWorkoutProgress();
  }, [generationStatus.mealsGenerated]);

  const fetchConsumptionData = async () => {
    try {
      const response = await fetch('/api/meals/consume');
      if (response.ok) {
        const data = await response.json();
        setConsumedMeals(data);
      }
    } catch (error) {
      console.error('Failed to fetch consumption data:', error);
    }
  };

  const fetchWorkoutProgress = async () => {
    try {
      const response = await fetch('/api/workouts/complete');
      if (response.ok) {
        const data = await response.json();
        setWorkoutProgress(data);
      }
    } catch (error) {
      console.error('Failed to fetch workout progress:', error);
    }
  };

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
      // Get today's meals (day 1 in our 4-day plan) - handling new JSON structure
      const todaysMeals = mealData.mealPlan.meals.find((day: any) => day.day === 1) || mealData.mealPlan.meals[0];

      const formatMeal = (meal) => {
        if (!meal) return "No data available";
        if (meal.source === "restaurant") {
          return `${meal.dish} from ${meal.restaurant} ($${meal.price})`;
        } else {
          return meal.name || "Home-cooked meal";
        }
      };

      // Estimate calories based on meal type if not provided
      const estimateCalories = (meal: any, mealType: string) => {
        if (meal?.calories) return meal.calories;

        // Fallback calorie estimates based on meal type and source
        const mealCalorieEstimates = {
          breakfast: { home: 350, restaurant: 400 },
          lunch: { home: 450, restaurant: 550 },
          dinner: { home: 500, restaurant: 650 }
        };

        const source = meal?.source || 'home';
        return mealCalorieEstimates[mealType as keyof typeof mealCalorieEstimates]?.[source as 'home' | 'restaurant'] || 400;
      };

      const breakfastCals = estimateCalories(todaysMeals.breakfast, 'breakfast');
      const lunchCals = estimateCalories(todaysMeals.lunch, 'lunch');
      const dinnerCals = estimateCalories(todaysMeals.dinner, 'dinner');

      return {
        breakfast: formatMeal(todaysMeals.breakfast),
        lunch: formatMeal(todaysMeals.lunch),
        dinner: formatMeal(todaysMeals.dinner),
        totalCalories: breakfastCals + lunchCals + dinnerCals,
        dayName: todaysMeals.day_name || "Today"
      };
    }
    return {
      breakfast: "No meal data available",
      lunch: "No meal data available",
      dinner: "No meal data available",
      totalCalories: 0,
      dayName: "Today"
    };
  };

  const todaysMeals = getTodaysMeals();

  const caloriesTarget = user?.calorieTarget || 2200;
  const caloriesConsumed = consumedMeals?.totalCaloriesConsumed || 0; // Real consumed calories from tracking
  const estimatedMealCalories = todaysMeals.totalCalories; // Estimated if no consumption logged
  const displayCalories = caloriesConsumed > 0 ? caloriesConsumed : estimatedMealCalories;

  const workoutsCompleted = workoutProgress?.completedWorkouts || 0;
  const workoutsPlanned = workoutProgress?.totalWorkouts || 4;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e3e8ef] px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <img src="/fytr-icon.svg" alt="FYTR" className="w-8 h-8" />
              <span className="text-lg font-semibold text-[#0a2540]">FYTR</span>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <button className="text-sm font-medium text-[#c1272d] border-b-2 border-[#c1272d] pb-3">Dashboard</button>
            </nav>
          </div>

          <div className="flex items-center space-x-3 pl-4 border-l border-[#e3e8ef]">
            <div className="w-8 h-8 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-white">{user?.name?.charAt(0) || "U"}</span>
            </div>
            <div>
              <div className="text-sm font-medium text-[#0a2540]">{user?.name?.split(' ')[0] || "User"}</div>
              <div className="text-xs text-[#697386]">{user?.zipCode || user?.location || "Location"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] bg-clip-text text-transparent mb-3">
            Good morning, {user?.name?.split(' ')[0] || "User"}!
          </h1>
          <p className="text-lg text-[#697386]">Ready to achieve your health goals today?</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-[#e3e8ef] rounded-xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-xl flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <Badge className="bg-[#fafafa] text-[#697386] border-[#e3e8ef] text-xs">Workouts</Badge>
            </div>
            <div className="text-3xl font-bold text-[#0a2540] mb-1">{workoutsCompleted}/{workoutsPlanned}</div>
            <div className="text-sm font-medium text-[#697386]">Workouts completed</div>
            <div className="text-xs text-[#697386] mt-2">{workoutsPlanned - workoutsCompleted} remaining</div>
          </div>

          <div className="bg-white border border-[#e3e8ef] rounded-xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <Badge className="bg-[#fafafa] text-[#697386] border-[#e3e8ef] text-xs">Nutrition</Badge>
            </div>
            <div className="text-3xl font-bold text-[#0a2540] mb-1">{displayCalories > 0 ? Math.round((displayCalories/caloriesTarget)*100) : 0}%</div>
            <div className="text-sm font-medium text-[#697386]">Nutrition goal</div>
            <div className="text-xs text-[#697386] mt-2">{displayCalories} / {caloriesTarget} calories</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div
            className="bg-white border border-[#e3e8ef] rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)] cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300"
            onClick={() => onNavigate("meal-plan")}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-2xl flex items-center justify-center">
                  <Apple className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#0a2540] mb-2">Meal Plans</h3>
                  <p className="text-sm text-[#697386] font-medium">AI-crafted nutrition plans</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-[#697386]" />
            </div>
            <div className="flex items-center justify-between">
              <Badge className={`text-sm px-4 py-2 ${
                generationStatus.mealsGenerated
                  ? "bg-[#fafafa] text-[#697386] border-[#e3e8ef]"
                  : "bg-[#fafafa] text-[#697386] border-[#e3e8ef]"
              }`}>
                {generationStatus.mealsGenerated ? "Ready" : "Generating..."}
              </Badge>
              <span className="text-sm text-[#697386]">4 days planned</span>
            </div>
          </div>

          <div
            className="bg-white border border-[#e3e8ef] rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)] cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300"
            onClick={() => onNavigate("workout-plan")}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-2xl flex items-center justify-center">
                  <Dumbbell className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#0a2540] mb-2">Workouts</h3>
                  <p className="text-sm text-[#697386] font-medium">{user?.goal || 'Weight loss'} training plan</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-[#697386]" />
            </div>
            <div className="flex items-center justify-between">
              <Badge className={`text-sm px-4 py-2 ${
                generationStatus.workoutsGenerated
                  ? "bg-[#fafafa] text-[#697386] border-[#e3e8ef]"
                  : "bg-[#fafafa] text-[#697386] border-[#e3e8ef]"
              }`}>
                {generationStatus.workoutsGenerated ? "Ready" : "Generating..."}
              </Badge>
              <span className="text-sm text-[#697386]">4 days scheduled</span>
            </div>
          </div>
        </div>

        {/* Today's Meal Plan */}
        <div className="bg-white border border-[#e3e8ef] rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)] mb-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-[#0a2540] mb-2">
                {todaysMeals.dayName}'s Meal Plan
              </h2>
              <p className="text-lg text-[#697386]">Your personalized nutrition for today</p>
            </div>
            <Button
              variant="outline"
              size="lg"
              className="border-[#c1272d] text-[#c1272d] hover:bg-[#c1272d] hover:text-white transition-all duration-300"
              onClick={() => onNavigate("meal-plan")}
            >
              View Full Plan
            </Button>
          </div>

          {generationStatus.mealsGenerated ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#fafafa] rounded-xl p-6 border border-[#e3e8ef]">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-lg flex items-center justify-center">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-lg font-bold text-[#0a2540]">Breakfast</span>
                  </div>
                  <p className="text-sm text-[#697386] leading-relaxed">{todaysMeals.breakfast}</p>
                </div>

                <div className="bg-[#fafafa] rounded-xl p-6 border border-[#e3e8ef]">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-lg flex items-center justify-center">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-lg font-bold text-[#0a2540]">Lunch</span>
                  </div>
                  <p className="text-sm text-[#697386] leading-relaxed">{todaysMeals.lunch}</p>
                </div>

                <div className="bg-[#fafafa] rounded-xl p-6 border border-[#e3e8ef]">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-lg flex items-center justify-center">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-lg font-bold text-[#0a2540]">Dinner</span>
                  </div>
                  <p className="text-sm text-[#697386] leading-relaxed">{todaysMeals.dinner}</p>
                </div>
              </div>

              <div className="bg-[#fafafa] rounded-xl p-6 border border-[#e3e8ef]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-xl flex items-center justify-center">
                      <Target className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="text-lg font-bold text-[#0a2540]">Daily Progress</span>
                      <div className="text-sm text-[#697386]">{displayCalories} / {caloriesTarget} calories consumed</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-[#0a2540]">
                    {Math.round((displayCalories/caloriesTarget)*100)}%
                  </div>
                </div>
                <div className="w-full bg-white rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] h-3 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min((displayCalories/caloriesTarget)*100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gradient-to-r from-[#c1272d]/20 to-[#8b5cf6]/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="w-10 h-10 border-4 border-[#c1272d] border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h3 className="text-2xl font-bold text-[#0a2540] mb-4">
                Generating Your Meal Plan
              </h3>
              <p className="text-lg text-[#697386]">Creating personalized nutrition recommendations...</p>
            </div>
          )}
        </div>

        {/* Quick Action Button */}
        <div className="text-center">
          <Button
            className="bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] hover:from-[#c1272d]/90 hover:to-[#8b5cf6]/90 text-white px-8 py-3 rounded-lg shadow-[0_4px_12px_rgba(193,39,45,0.3)] hover:shadow-[0_8px_24px_rgba(193,39,45,0.4)] transition-all duration-200"
            onClick={() => onNavigate("meal-plan")}
          >
            <Plus className="w-4 h-4 mr-2" />
            Get Started
          </Button>
          <p className="text-sm text-[#697386] mt-4">Start your personalized health plan</p>
        </div>
      </div>
    </div>
  );
}