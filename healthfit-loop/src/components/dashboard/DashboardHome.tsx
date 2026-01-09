'use client';

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  ChartLineUp,
  Target,
  Clock,
  Fire,
  CaretRight,
  Plus,
  ChartBar,
  ForkKnife,
  Barbell,
  User,
  MapPin,
  Star,
  ArrowSquareOut,
  X,
  Spinner,
  CheckCircle,
  Circle,
  ShoppingCart
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';

interface DashboardHomeProps {
  user: any;
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
    homeMealsGenerated: boolean;
    restaurantMealsGenerated: boolean;
  };
  isGuest?: boolean;
  onShowAccountModal?: () => void;
}

// Skeleton Components
const MealSkeleton = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.3 }}
    className="animate-pulse"
  >
    <div className="h-32 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer rounded-xl mb-3" />
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
    <div className="h-3 bg-gray-100 rounded w-1/2" />
  </motion.div>
);

const WorkoutSkeleton = () => (
  <div className="space-y-3">
    <div className="h-5 bg-gray-200 rounded w-1/3 animate-pulse" />
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.08, duration: 0.3 }}
          className="flex gap-3 p-3 bg-gray-50 rounded-lg"
        >
          <div className="w-12 h-12 bg-gray-200 rounded animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2 animate-pulse" />
            <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

// Section reveal animation when data arrives
const SectionReveal = ({ children, isReady }: { children: React.ReactNode; isReady: boolean }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: isReady ? 1 : 0.6 }}
    transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
  >
    {children}
  </motion.div>
);

// Building progress item component with optional preview
interface BuildingItemProps {
  icon: React.ComponentType<any>;
  label: string;
  isComplete: boolean;
  isLoading: boolean;
  detail?: string;
  preview?: string; // e.g., "Sweetgreen, Chipotle, Tender Greens"
}

const BuildingItem = ({ icon: Icon, label, isComplete, isLoading, detail, preview }: BuildingItemProps) => (
  <div className="flex items-start gap-3 py-2">
    <div className="flex-shrink-0 mt-0.5">
      {isComplete ? (
        <CheckCircle size={20} weight="fill" className="text-green-500" />
      ) : isLoading ? (
        <Spinner size={20} className="text-red-600 animate-spin" />
      ) : (
        <Circle size={20} className="text-gray-300" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center flex-wrap gap-x-2">
        <span className={`text-sm ${isComplete ? 'text-gray-900' : isLoading ? 'text-gray-700' : 'text-gray-400'}`}>
          {label}
        </span>
        {detail && isComplete && (
          <span className="text-xs text-green-600 font-medium">{detail}</span>
        )}
      </div>
      {/* Preview text - shows restaurant names, grocery cost, etc */}
      {preview && isComplete && (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{preview}</p>
      )}
    </div>
    <Icon size={16} className={`flex-shrink-0 ${isComplete ? 'text-gray-600' : 'text-gray-300'}`} />
  </div>
);

export function DashboardHome({ user, onNavigate, generationStatus, isGuest, onShowAccountModal }: DashboardHomeProps) {
  const [mealData, setMealData] = useState<any>(null);
  const [consumedMeals, setConsumedMeals] = useState<any>(null);
  const [workoutProgress, setWorkoutProgress] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [eatenMeals, setEatenMeals] = useState<{[key: string]: boolean}>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [completedExercises, setCompletedExercises] = useState<Record<string, Set<string>>>({});
  const [workoutData, setWorkoutData] = useState<any>(null);
  const [selectedMealOptions, setSelectedMealOptions] = useState<{
    breakfast: 'primary' | 'alternative',
    lunch: 'primary' | 'alternative',
    dinner: 'primary' | 'alternative'
  }>({ breakfast: 'primary', lunch: 'primary', dinner: 'primary' });

  // Preview data for the "Building" section - derived from actual API data
  const [restaurantPreview, setRestaurantPreview] = useState<{ count: number; names: string }>({
    count: 0,
    names: ''
  });
  const [groceryPreview, setGroceryPreview] = useState<string>('');
  const [homeMealsCount, setHomeMealsCount] = useState<number>(0);
  const [workoutDaysCount, setWorkoutDaysCount] = useState<number>(0);

  // Helper functions for the new design
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getUserLocation = () => {
    if (user?.activeSurvey?.city && user?.activeSurvey?.state) {
      return `${user.activeSurvey.city}, ${user.activeSurvey.state}`;
    }
    return "Location not set";
  };

  // Calculate macro targets instantly from survey data (no API needed)
  // Round all values to nearest 10 for cleaner display
  const macroTargets = React.useMemo(() => {
    const survey = user?.activeSurvey;
    if (!survey?.age || !survey?.weight || !survey?.height) {
      return { calories: 2000, protein: 150, carbs: 200, fat: 70 };
    }

    const userProfile: UserProfile = {
      age: survey.age,
      sex: survey.sex || 'male',
      height: survey.height,
      weight: survey.weight,
      activityLevel: survey.activityLevel || 'MODERATELY_ACTIVE',
      goal: survey.goal || 'GENERAL_WELLNESS'
    };

    const calculated = calculateMacroTargets(userProfile);

    // Round to nearest 10 for cleaner display
    return {
      calories: Math.round(calculated.calories / 10) * 10,
      protein: Math.round(calculated.protein / 10) * 10,
      carbs: Math.round(calculated.carbs / 10) * 10,
      fat: Math.round(calculated.fat / 10) * 10
    };
  }, [user?.activeSurvey]);

  const getGoalText = () => {
    const goal = user?.activeSurvey?.goal || "GENERAL_WELLNESS";
    const goalMap = {
      'WEIGHT_LOSS': 'Lose weight & feel great',
      'MUSCLE_GAIN': 'Build muscle & strength',
      'ENDURANCE': 'Improve endurance',
      'GENERAL_WELLNESS': 'Stay healthy & active'
    };
    return goalMap[goal] || goalMap['GENERAL_WELLNESS'];
  };

  const getDayCount = () => {
    // Calculate days since plan creation (you can adjust this logic)
    if (mealData?.mealPlan?.weekOf) {
      const startDate = new Date(mealData.mealPlan.weekOf);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.min(diffDays, 90); // Cap at 90 days
    }
    return 1;
  };

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    }
    if (generationStatus.workoutsGenerated) {
      fetchWorkoutData();
    }
    fetchConsumptionData();
    fetchWorkoutProgress();

    // Load persisted eaten meals from localStorage
    const savedEatenMeals = localStorage.getItem('eatenMeals');
    console.log('Dashboard useEffect - Loading from localStorage:', savedEatenMeals);
    if (savedEatenMeals) {
      const parsed = JSON.parse(savedEatenMeals);
      console.log('Dashboard useEffect - Parsed eatenMeals:', parsed);
      setEatenMeals(parsed);
    }
    setIsInitialized(true);

    // Load persisted completed exercises from localStorage
    const savedCompletedExercises = localStorage.getItem('completedExercises');
    console.log('Dashboard useEffect - Loading completedExercises from localStorage:', savedCompletedExercises);
    if (savedCompletedExercises) {
      try {
        const parsed = JSON.parse(savedCompletedExercises);
        console.log('Dashboard useEffect - Parsed completedExercises:', parsed);
        // Convert Sets back from arrays (localStorage can't store Sets)
        const restoredState: Record<string, Set<string>> = {};
        Object.keys(parsed).forEach(day => {
          restoredState[day] = new Set(parsed[day]);
        });
        setCompletedExercises(restoredState);
      } catch (error) {
        console.error('Error parsing completed exercises from localStorage:', error);
      }
    }
  }, [generationStatus.mealsGenerated]);

  // Refresh data when dashboard comes into focus (user switches back from other tabs)
  useEffect(() => {
    const handleFocus = () => {
      console.log('Dashboard focused - refreshing data');
      fetchWorkoutProgress();
      fetchConsumptionData();

      // Also reload eaten meals from localStorage in case they changed in other tabs
      const savedEatenMeals = localStorage.getItem('eatenMeals');
      if (savedEatenMeals) {
        setEatenMeals(JSON.parse(savedEatenMeals));
      }
    };

    // Listen for localStorage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'eatenMeals' && e.newValue) {
        console.log('Dashboard - localStorage changed in another tab:', e.newValue);
        setEatenMeals(JSON.parse(e.newValue));
      }
    };

    // Listen for custom events from same tab (meal plan page)
    const handleEatenMealsUpdate = (e: CustomEvent) => {
      console.log('Dashboard - received eatenMealsUpdate event:', e.detail);
      // Only update if the new state is different and has content
      if (e.detail && Object.keys(e.detail).length > 0) {
        setEatenMeals(e.detail);
      }
    };

    // Listen for custom events from same tab (workout plan page)
    const handleCompletedExercisesUpdate = (e: CustomEvent) => {
      console.log('Dashboard - received completedExercisesUpdate event:', e.detail);
      setCompletedExercises(e.detail);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('eatenMealsUpdate', handleEatenMealsUpdate as EventListener);
    window.addEventListener('completedExercisesUpdate', handleCompletedExercisesUpdate as EventListener);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('eatenMealsUpdate', handleEatenMealsUpdate as EventListener);
      window.removeEventListener('completedExercisesUpdate', handleCompletedExercisesUpdate as EventListener);
    };
  }, []);

  // Save eaten meals to localStorage whenever it changes (but skip initial empty state)
  useEffect(() => {
    // Only save if we're initialized and have some data
    if (isInitialized && Object.keys(eatenMeals).length > 0) {
      console.log('Dashboard - Saving to localStorage:', eatenMeals);
      localStorage.setItem('eatenMeals', JSON.stringify(eatenMeals));
      console.log('Dashboard - Saved to localStorage, checking:', localStorage.getItem('eatenMeals'));

      // Dispatch custom event to notify other components in the same tab (like meal plan page)
      const event = new CustomEvent('eatenMealsUpdate', { detail: eatenMeals });
      window.dispatchEvent(event);
    }
  }, [eatenMeals, isInitialized]);

  // Extract restaurant preview when meal data arrives
  useEffect(() => {
    if (mealData?.mealPlan && generationStatus.restaurantMealsGenerated) {
      // Get restaurant meals from planData
      const restaurantMeals = mealData.mealPlan.planData?.restaurantMeals || [];
      const count = restaurantMeals.length || mealData.mealPlan.restaurantMealsCount || 0;

      // Extract unique restaurant names (first 3)
      const uniqueNames = [...new Set(
        restaurantMeals
          .map((r: any) => r.restaurant?.name || r.restaurantName || r.name)
          .filter(Boolean)
      )].slice(0, 3);

      const names = uniqueNames.join(', ') || '';
      setRestaurantPreview({ count, names });
    }
  }, [mealData, generationStatus.restaurantMealsGenerated]);

  // Extract grocery preview when meal data arrives
  useEffect(() => {
    if (mealData?.mealPlan && generationStatus.homeMealsGenerated) {
      // Get grocery data from mealPlan (after API fix, this is now available)
      const groceryList = mealData.mealPlan.groceryList;
      const totalCost = mealData.mealPlan.totalEstimatedCost;

      if (totalCost && totalCost > 0) {
        setGroceryPreview(`~$${Math.round(totalCost)} estimated`);
      } else if (groceryList?.totalEstimatedCost) {
        setGroceryPreview(`~$${Math.round(groceryList.totalEstimatedCost)} estimated`);
      } else {
        setGroceryPreview('Ready to shop');
      }

      // Count home meals from days or use API count
      const homeMealCount = mealData.mealPlan.homeMealsCount;
      if (homeMealCount) {
        setHomeMealsCount(homeMealCount);
      } else {
        // Fallback: count from days data
        const days = mealData.mealPlan.planData?.days || [];
        let homeCount = 0;
        days.forEach((day: any) => {
          Object.values(day.meals || {}).forEach((meal: any) => {
            if (meal && meal.source !== 'restaurant') {
              homeCount++;
            }
          });
        });
        setHomeMealsCount(homeCount);
      }
    }
  }, [mealData, generationStatus.homeMealsGenerated]);

  // Extract workout days count
  useEffect(() => {
    if (workoutData?.workoutPlan && generationStatus.workoutsGenerated) {
      const weeklyPlan = workoutData.workoutPlan.planData?.weeklyPlan || [];
      // Count non-rest days
      const activeDays = weeklyPlan.filter((day: any) => !day.restDay).length;
      setWorkoutDaysCount(activeDays || weeklyPlan.length);
    }
  }, [workoutData, generationStatus.workoutsGenerated]);

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
        console.log('Dashboard meal data:', data);
        console.log('Day 1 meals:', data?.mealPlan?.planData?.weeklyPlan?.find(d => d.day === 1));
        setMealData(data);
      }
    } catch (error) {
      console.error('Failed to fetch meal data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkoutData = async () => {
    try {
      const response = await fetch('/api/ai/workouts/current');
      if (response.ok) {
        const data = await response.json();
        console.log('Dashboard workout data:', data);
        setWorkoutData(data);
      }
    } catch (error) {
      console.error('Failed to fetch workout data:', error);
    }
  };

  // Get today's meals from real data - using same structure as MealPlanPage
  const getTodaysMeals = () => {
    if (mealData && mealData.mealPlan && mealData.mealPlan.planData) {
      // Try to get from days array (7-day structured format) or weeklyPlan (legacy format)
      let todaysMeals = null;

      if (mealData.mealPlan.planData.days && Array.isArray(mealData.mealPlan.planData.days)) {
        // Get today's day from 7-day structured format
        const todayDayName = getTodayDayName();
        todaysMeals = mealData.mealPlan.planData.days.find((day: any) => day.day === todayDayName);
      } else if (mealData.mealPlan.planData.weeklyPlan && Array.isArray(mealData.mealPlan.planData.weeklyPlan)) {
        // Fallback to legacy format (day 1)
        todaysMeals = mealData.mealPlan.planData.weeklyPlan.find((day: any) => day.day === 1) || mealData.mealPlan.planData.weeklyPlan[0];
      }

      // Add null check for todaysMeals
      if (!todaysMeals) {
        return {
          breakfast: {
            primary: { name: "Meal being generated...", image: null, calories: 0, isLoading: true },
            alternative: { name: "Alternative being generated...", image: null, calories: 0, isLoading: true }
          },
          lunch: {
            primary: { name: "Meal being generated...", image: null, calories: 0, isLoading: true },
            alternative: { name: "Alternative being generated...", image: null, calories: 0, isLoading: true }
          },
          dinner: {
            primary: { name: "Meal being generated...", image: null, calories: 0, isLoading: true },
            alternative: { name: "Alternative being generated...", image: null, calories: 0, isLoading: true }
          }
        };
      }

      const formatMeal = (meal: any, mealType: string, optionType: 'primary' | 'alternative' = 'primary') => {
        // Check if meal is skipped according to planned schedule
        const plannedMeals = todaysMeals.plannedMeals || {};
        if (plannedMeals[mealType] === 'no-meal') {
          return {
            name: "Meal skipped as per your schedule",
            image: null,
            calories: 0,
            isSkipped: true
          };
        }

        // Check if meal is still loading (no meal data but should have one)
        if (!meal || meal === null) {
          const isHome = plannedMeals[mealType] === 'home';
          const isRestaurant = plannedMeals[mealType] === 'restaurant';

          if (isRestaurant && !generationStatus.restaurantMealsGenerated) {
            return {
              name: "Finding restaurant options...",
              image: null,
              calories: 0,
              isLoading: true
            };
          } else if (isHome && !generationStatus.homeMealsGenerated) {
            return {
              name: "Creating home meal...",
              image: null,
              calories: 0,
              isLoading: true
            };
          } else {
            return {
              name: "No data available",
              image: null,
              calories: 0
            };
          }
        }

        // Handle primary/alternatives structure
        let actualMeal;
        if (optionType === 'alternative' && meal.alternatives && meal.alternatives.length > 0) {
          actualMeal = meal.alternatives[0]; // First alternative
        } else {
          actualMeal = meal.primary || meal;
        }

        // If still no actual meal data, check if it's loading
        if (!actualMeal) {
          const isRestaurant = plannedMeals[mealType] === 'restaurant';
          if (isRestaurant && !generationStatus.restaurantMealsGenerated) {
            return {
              name: optionType === 'alternative' ? "Finding alternative restaurant..." : "Finding restaurant options...",
              image: null,
              calories: 0,
              isLoading: true
            };
          }
          return {
            name: optionType === 'alternative' ? "Alternative not available" : "No meal data",
            image: null,
            calories: 0
          };
        }

        if (actualMeal.source === "restaurant") {
          return {
            name: `${actualMeal.dish} from ${actualMeal.restaurant}`,
            image: actualMeal.imageUrl || actualMeal.image,
            calories: actualMeal.calories || 0,
            restaurant: actualMeal.restaurant,
            price: actualMeal.price
          };
        } else {
          return {
            name: actualMeal.name || actualMeal.dish || "Home-cooked meal",
            image: actualMeal.imageUrl || actualMeal.image,
            calories: actualMeal.calories || 0
          };
        }
      };

      // Handle the {primary, alternatives} structure - show both options
      const breakfastPrimary = formatMeal(todaysMeals.meals?.breakfast, 'breakfast', 'primary');
      const breakfastAlternative = formatMeal(todaysMeals.meals?.breakfast, 'breakfast', 'alternative');
      const lunchPrimary = formatMeal(todaysMeals.meals?.lunch, 'lunch', 'primary');
      const lunchAlternative = formatMeal(todaysMeals.meals?.lunch, 'lunch', 'alternative');
      const dinnerPrimary = formatMeal(todaysMeals.meals?.dinner, 'dinner', 'primary');
      const dinnerAlternative = formatMeal(todaysMeals.meals?.dinner, 'dinner', 'alternative');

      return {
        breakfast: {
          primary: breakfastPrimary,
          alternative: breakfastAlternative
        },
        lunch: {
          primary: lunchPrimary,
          alternative: lunchAlternative
        },
        dinner: {
          primary: dinnerPrimary,
          alternative: dinnerAlternative
        },
        totalCalories: Math.round((breakfastPrimary.calories + lunchPrimary.calories + dinnerPrimary.calories) / 50) * 50,
        dayName: todaysMeals.day_name || "Today"
      };
    }

    return {
      breakfast: {
        primary: { name: "Generating your personalized meal plan...", image: null, calories: 0, isLoading: true },
        alternative: { name: "Creating alternative options...", image: null, calories: 0, isLoading: true }
      },
      lunch: {
        primary: { name: "Generating your personalized meal plan...", image: null, calories: 0, isLoading: true },
        alternative: { name: "Creating alternative options...", image: null, calories: 0, isLoading: true }
      },
      dinner: {
        primary: { name: "Generating your personalized meal plan...", image: null, calories: 0, isLoading: true },
        alternative: { name: "Creating alternative options...", image: null, calories: 0, isLoading: true }
      },
      totalCalories: 0,
      dayName: "Today"
    };
  };

  // Get today's workout from real data - using same structure as WorkoutPlanPage
  const getTodaysWorkout = () => {
    if (workoutData && workoutData.workoutPlan && workoutData.workoutPlan.planData && workoutData.workoutPlan.planData.weeklyPlan) {
      const todayDayName = getTodayDayName();
      console.log('Dashboard - Looking for workout for:', todayDayName);

      const workoutDay = workoutData.workoutPlan.planData.weeklyPlan.find((day: any) => {
        console.log('Dashboard - Checking workout day:', day.day, 'focus:', day.focus);
        return day.day === todayDayName;
      });

      if (workoutDay) {
        console.log('Dashboard - Found workout for today:', workoutDay);
        return {
          focus: workoutDay.restDay ? "Rest Day" : workoutDay.focus,
          duration: parseInt(workoutDay.estimatedTime) || 0,
          calories: workoutDay.restDay ? 0 : workoutDay.estimatedCalories || 0,
          exercises: workoutDay.exercises || [],
          restDay: workoutDay.restDay || false,
          description: workoutDay.description || "",
          totalExercises: (workoutDay.exercises || []).length
        };
      }
    }

    return {
      focus: "Generating your workout plan...",
      duration: 0,
      calories: 0,
      exercises: [],
      restDay: false,
      description: "Creating personalized workouts based on your preferences",
      totalExercises: 0
    };
  };

  // Helper function to get today's day name (same format as MealPlanPage)
  const getTodayDayName = () => {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return dayNames[today.getDay()];
  };

  // Helper functions for meal consumption tracking (same as MealPlanPage)
  const isMealEaten = (mealType: string, optionIndex: number = 0, optionType: 'primary' | 'alternative' = 'primary') => {
    const selectedDay = getTodayDayName(); // Always use TODAY for dashboard
    const mealKey = `${selectedDay}-${mealType}-${optionType}-${optionIndex}`;
    console.log('Dashboard isMealEaten - selectedDay:', selectedDay, 'mealKey:', mealKey, 'eatenMeals:', eatenMeals);
    return eatenMeals[mealKey] || false;
  };

  // Helper function to toggle meal eaten status from dashboard
  const toggleMealEatenFromDashboard = (mealType: string, optionIndex: number = 0, optionType: 'primary' | 'alternative' = 'primary') => {
    const selectedDay = getTodayDayName();
    const mealKey = `${selectedDay}-${mealType}-${optionType}-${optionIndex}`;
    console.log('Dashboard - toggleMealEatenFromDashboard called');
    console.log('Dashboard - selectedDay:', selectedDay);
    console.log('Dashboard - mealKey:', mealKey);
    console.log('Dashboard - current eatenMeals:', eatenMeals);

    setEatenMeals(prev => {
      const newState = {
        ...prev,
        [mealKey]: !prev[mealKey]
      };
      console.log('Dashboard - new eatenMeals state:', newState);
      return newState;
    });
  };

  // NEW: Toggle meal option selection
  const toggleMealOption = (mealType: 'breakfast' | 'lunch' | 'dinner') => {
    setSelectedMealOptions(prev => ({
      ...prev,
      [mealType]: prev[mealType] === 'primary' ? 'alternative' : 'primary'
    }));
  };

  // Calculate real consumed macros for today
  const getTotalCaloriesEaten = () => {
    let total = 0;
    const meals = getTodaysMeals();

    // Check primary and alternative options for all meals
    if (isMealEaten('breakfast', 0, 'primary')) {
      total += meals.breakfast?.primary?.calories || 0;
    }
    if (isMealEaten('breakfast', 0, 'alternative')) {
      total += meals.breakfast?.alternative?.calories || 0;
    }
    if (isMealEaten('lunch', 0, 'primary')) {
      total += meals.lunch?.primary?.calories || 0;
    }
    if (isMealEaten('lunch', 0, 'alternative')) {
      total += meals.lunch?.alternative?.calories || 0;
    }
    if (isMealEaten('dinner', 0, 'primary')) {
      total += meals.dinner?.primary?.calories || 0;
    }
    if (isMealEaten('dinner', 0, 'alternative')) {
      total += meals.dinner?.alternative?.calories || 0;
    }

    console.log('Real calories eaten - total:', total);
    return total;
  };

  const getTotalProteinEaten = () => {
    let total = 0;
    const meals = getTodaysMeals();

    // Get protein from actual meal data for checked items
    if (isMealEaten('breakfast', 0, 'primary')) {
      total += getMealMacro(meals.breakfast?.primary, 'protein') || 0;
    }
    if (isMealEaten('breakfast', 0, 'alternative')) {
      total += getMealMacro(meals.breakfast?.alternative, 'protein') || 0;
    }
    if (isMealEaten('lunch', 0, 'primary')) {
      total += getMealMacro(meals.lunch?.primary, 'protein') || 0;
    }
    if (isMealEaten('lunch', 0, 'alternative')) {
      total += getMealMacro(meals.lunch?.alternative, 'protein') || 0;
    }
    if (isMealEaten('dinner', 0, 'primary')) {
      total += getMealMacro(meals.dinner?.primary, 'protein') || 0;
    }
    if (isMealEaten('dinner', 0, 'alternative')) {
      total += getMealMacro(meals.dinner?.alternative, 'protein') || 0;
    }

    console.log('Real protein eaten - total:', total);
    return Math.round(total);
  };

  const getTotalCarbsEaten = () => {
    let total = 0;
    const meals = getTodaysMeals();

    // Get carbs from actual meal data for checked items
    if (isMealEaten('breakfast', 0, 'primary')) {
      total += getMealMacro(meals.breakfast?.primary, 'carbs') || 0;
    }
    if (isMealEaten('breakfast', 0, 'alternative')) {
      total += getMealMacro(meals.breakfast?.alternative, 'carbs') || 0;
    }
    if (isMealEaten('lunch', 0, 'primary')) {
      total += getMealMacro(meals.lunch?.primary, 'carbs') || 0;
    }
    if (isMealEaten('lunch', 0, 'alternative')) {
      total += getMealMacro(meals.lunch?.alternative, 'carbs') || 0;
    }
    if (isMealEaten('dinner', 0, 'primary')) {
      total += getMealMacro(meals.dinner?.primary, 'carbs') || 0;
    }
    if (isMealEaten('dinner', 0, 'alternative')) {
      total += getMealMacro(meals.dinner?.alternative, 'carbs') || 0;
    }

    return Math.round(total);
  };

  const getTotalFatEaten = () => {
    let total = 0;
    const meals = getTodaysMeals();

    // Get fat from actual meal data for checked items
    if (isMealEaten('breakfast', 0, 'primary')) {
      total += getMealMacro(meals.breakfast?.primary, 'fat') || 0;
    }
    if (isMealEaten('breakfast', 0, 'alternative')) {
      total += getMealMacro(meals.breakfast?.alternative, 'fat') || 0;
    }
    if (isMealEaten('lunch', 0, 'primary')) {
      total += getMealMacro(meals.lunch?.primary, 'fat') || 0;
    }
    if (isMealEaten('lunch', 0, 'alternative')) {
      total += getMealMacro(meals.lunch?.alternative, 'fat') || 0;
    }
    if (isMealEaten('dinner', 0, 'primary')) {
      total += getMealMacro(meals.dinner?.primary, 'fat') || 0;
    }
    if (isMealEaten('dinner', 0, 'alternative')) {
      total += getMealMacro(meals.dinner?.alternative, 'fat') || 0;
    }

    return Math.round(total);
  };

  // Helper function to extract macro values from meal data
  const getMealMacro = (meal: any, macroType: string): number => {
    if (!meal) return 0;

    // Try to get macro data from the meal object
    const macroValue = meal[macroType];
    if (typeof macroValue === 'number') {
      return macroValue;
    }

    // Fallback to estimated values based on calories for basic calculation
    if (meal.calories && typeof meal.calories === 'number') {
      const estimatedMacros = {
        protein: Math.round(meal.calories * 0.25 / 4), // 25% calories from protein
        carbs: Math.round(meal.calories * 0.45 / 4), // 45% calories from carbs
        fat: Math.round(meal.calories * 0.30 / 9) // 30% calories from fat
      };
      return estimatedMacros[macroType] || 0;
    }

    return 0;
  };

  const todaysMeals = getTodaysMeals();
  const todaysWorkout = getTodaysWorkout();

  // Get nutrition targets from meal plan data or user data (no fallbacks - user must have survey data)
  const nutritionTargets = mealData?.mealPlan?.nutritionTargets || user?.macroTargets || {
    dailyCalories: user?.calorieTarget || 0,
    dailyProtein: 0,
    dailyCarbs: 0,
    dailyFat: 0
  };

  // Use real eaten calories from checkbox tracking
  const caloriesEaten = getTotalCaloriesEaten();
  const proteinEaten = getTotalProteinEaten();
  const carbsEaten = getTotalCarbsEaten();
  const fatEaten = getTotalFatEaten();

  // Calculate today's workout completion from localStorage data
  const calculateTodayWorkoutCompletion = () => {
    const todayDayName = getTodayDayName();
    const todayCompleted = completedExercises[todayDayName] || new Set();
    const todaysWorkoutData = getTodaysWorkout();

    const totalExercisesToday = todaysWorkoutData.totalExercises || 0;
    const completedToday = todayCompleted.size;

    return {
      completed: completedToday,
      planned: totalExercisesToday,
      percentage: totalExercisesToday > 0 ? Math.round((completedToday / totalExercisesToday) * 100) : 0
    };
  };

  const todayWorkoutCompletion = calculateTodayWorkoutCompletion();

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Guest User Banner */}
      {isGuest && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-900">
                  You're browsing as a guest
                </p>
                <p className="text-xs text-blue-700">
                  Create an account to save your progress and access all features
                </p>
              </div>
            </div>
            <Button
              onClick={onShowAccountModal}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5"
            >
              Create Account
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4 sm:space-x-8">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <img src="/fytr-icon.svg" alt="FYTR" className="w-8 h-8 sm:w-10 sm:h-10" />
              <span className="text-lg sm:text-xl font-bold text-[#c1272d]">FYTR</span>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <button className="text-sm font-medium text-[#c1272d] border-b-2 border-[#c1272d] pb-3">Dashboard</button>
            </nav>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4 bg-white rounded-xl px-2 sm:px-4 py-2 sm:py-3 shadow-md border border-gray-100">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-sm sm:text-lg font-bold text-white">{user?.name?.charAt(0) || "U"}</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm sm:text-base font-bold text-gray-900">Hey, {user?.name?.split(' ')[0] || "User"}!</div>
              <div className="flex items-center text-xs sm:text-sm text-[#8b5cf6] font-medium">
                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                {user?.zipCode || user?.location || "Location"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
        {/* Welcome Section */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#c1272d] mb-2">
            {getGreeting()}, {user?.name?.split(' ')[0] || "User"}!
          </h1>
          <p className="text-sm sm:text-base text-gray-600">Ready to crush your health goals today? Let's make it happen!</p>
        </div>

        {/* ============ INSTANT VALUE SECTIONS ============ */}

        {/* Daily Targets - Always visible instantly */}
        {/* Mobile: 2x2 grid, Desktop: 4 columns */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} weight="duotone" className="text-red-600" />
            <h3 className="font-semibold text-gray-900">Your Daily Targets</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <div className="text-lg sm:text-xl font-bold text-gray-900">{macroTargets.calories.toLocaleString()}</div>
              <div className="text-xs text-gray-500">calories</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-xl">
              <div className="text-lg sm:text-xl font-bold text-blue-700">{macroTargets.protein}g</div>
              <div className="text-xs text-blue-600">protein</div>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-xl">
              <div className="text-lg sm:text-xl font-bold text-amber-700">{macroTargets.carbs}g</div>
              <div className="text-xs text-amber-600">carbs</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <div className="text-lg sm:text-xl font-bold text-green-700">{macroTargets.fat}g</div>
              <div className="text-xs text-green-600">fat</div>
            </div>
          </div>
        </div>

        {/* What We're Building - Shows progress with REAL preview data, hides when all complete */}
        {(!generationStatus.mealsGenerated || !generationStatus.workoutsGenerated || !generationStatus.restaurantMealsGenerated) && (
          <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-2xl p-4 sm:p-5 border border-gray-100 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Spinner size={18} className="text-red-600 animate-spin" />
              <h3 className="font-medium text-gray-900 text-sm sm:text-base">Building your personalized plan</h3>
            </div>

            <div className="space-y-1">
              <BuildingItem
                icon={ForkKnife}
                label="Creating personalized meals"
                isComplete={generationStatus.homeMealsGenerated}
                isLoading={!generationStatus.homeMealsGenerated}
                detail={generationStatus.homeMealsGenerated && homeMealsCount > 0 ? `${homeMealsCount} meals ready` : undefined}
              />
              <BuildingItem
                icon={Barbell}
                label="Building workout plan"
                isComplete={generationStatus.workoutsGenerated}
                isLoading={!generationStatus.workoutsGenerated && generationStatus.homeMealsGenerated}
                detail={generationStatus.workoutsGenerated && workoutDaysCount > 0 ? `${workoutDaysCount}-day plan created` : undefined}
              />
              <BuildingItem
                icon={MapPin}
                label="Finding local restaurants"
                isComplete={generationStatus.restaurantMealsGenerated}
                isLoading={!generationStatus.restaurantMealsGenerated && generationStatus.homeMealsGenerated}
                detail={generationStatus.restaurantMealsGenerated ? `${restaurantPreview.count} spots found` : undefined}
                preview={generationStatus.restaurantMealsGenerated ? restaurantPreview.names : undefined}
              />
              <BuildingItem
                icon={ShoppingCart}
                label="Preparing grocery list"
                isComplete={generationStatus.homeMealsGenerated}
                isLoading={!generationStatus.homeMealsGenerated}
                detail={generationStatus.homeMealsGenerated ? groceryPreview : undefined}
              />
            </div>
          </div>
        )}

        {/* ============ END INSTANT VALUE SECTIONS ============ */}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Box 1: Nutrition Goal */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <ChartBar className="w-8 h-8 text-[#c1272d]" weight="regular" />
              <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">
                Nutrition
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[#c1272d] mb-1">{caloriesEaten > 0 ? Math.round((caloriesEaten/nutritionTargets.dailyCalories)*100) : 0}%</div>
            <div className="text-lg font-bold text-[#8b5cf6] mb-1">Daily goal</div>
            <div className="text-sm text-gray-600">{caloriesEaten} / {nutritionTargets.dailyCalories} calories</div>
          </div>

          {/* Box 2: Today's Workouts */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <Target className="w-8 h-8 text-[#c1272d]" weight="regular" />
              <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">
                Today
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[#c1272d] mb-1">{todayWorkoutCompletion.completed}/{todayWorkoutCompletion.planned}</div>
            <div className="text-lg font-bold text-[#8b5cf6] mb-1">Exercises today</div>
            <div className="text-sm text-gray-600">{todayWorkoutCompletion.planned - todayWorkoutCompletion.completed} remaining today</div>
          </div>

          {/* Box 3: Macros from Today's Meals */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <ForkKnife className="w-8 h-8 text-[#c1272d]" weight="regular" />
              <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">
                Macros
              </span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-[#c1272d] mb-1">{proteinEaten}g | {carbsEaten}g | {fatEaten}g</div>
            <div className="text-lg font-bold text-[#8b5cf6] mb-1">Protein | Carbs | Fat eaten</div>
            <div className="text-sm text-gray-600">From selected meals today</div>
          </div>
        </div>

        {/* Quick Actions - Single Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-md cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-300"
            onClick={() => onNavigate("meal-plan")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <ForkKnife className="w-7 h-7 text-[#c1272d]" weight="regular" />
                <div>
                  <h3 className="text-lg font-bold text-[#c1272d]">Meal Plans</h3>
                  <p className="text-xs text-[#8b5cf6]">AI-powered nutrition</p>
                </div>
              </div>
              <CaretRight className="w-5 h-5 text-[#c1272d]" weight="regular" />
            </div>
          </div>

          <div
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-md cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-300"
            onClick={() => onNavigate("workout-plan")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Barbell className="w-7 h-7 text-[#c1272d]" weight="regular" />
                <div>
                  <h3 className="text-lg font-bold text-[#c1272d]">Workouts</h3>
                  <p className="text-xs text-[#8b5cf6]">Custom training plans</p>
                </div>
              </div>
              <CaretRight className="w-5 h-5 text-[#c1272d]" weight="regular" />
            </div>
          </div>
        </div>

        {/* Today's Workout Section */}
        {!generationStatus.workoutsGenerated ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-md mb-6 sm:mb-8">
            <div className="flex items-center gap-2 text-gray-500 mb-4">
              <Spinner size={16} className="animate-spin" />
              <span className="text-sm">Generating your personalized workouts...</span>
            </div>
            <WorkoutSkeleton />
          </div>
        ) : generationStatus.workoutsGenerated && todaysWorkout.focus !== "No workout data available" ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-md mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Barbell className="w-7 h-7 text-[#c1272d]" weight="regular" />
                <div>
                  <h3 className="text-lg font-bold text-[#c1272d]">Today's Workout</h3>
                  <p className="text-xs text-[#8b5cf6] font-medium">{todaysWorkout.focus}</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate("workout-plan")}
                className="text-sm text-[#c1272d] font-bold hover:underline hover:scale-105 transition-transform bg-gray-50 px-3 py-1 rounded-full"
              >
                Start →
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <Barbell className="w-6 h-6 text-[#c1272d]" weight="regular" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 text-sm sm:text-base">{todaysWorkout.focus}</h4>
                  <div className="flex items-center space-x-2 sm:space-x-4 text-xs sm:text-sm text-gray-600 mt-1">
                    {!todaysWorkout.restDay && (
                      <>
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1 text-[#8b5cf6]" weight="regular" />
                          {todaysWorkout.duration}min
                        </span>
                        <span className="flex items-center">
                          <Fire className="w-4 h-4 mr-1 text-[#8b5cf6]" weight="regular" />
                          ~{todaysWorkout.calories} cal
                        </span>
                        <span className="flex items-center">
                          <Target className="w-4 h-4 mr-1 text-[#8b5cf6]" weight="regular" />
                          {todaysWorkout.totalExercises} exercises
                        </span>
                      </>
                    )}
                    {todaysWorkout.restDay && (
                      <span className="text-[#8b5cf6] font-medium">Recovery & Rest Day</span>
                    )}
                  </div>
                  {todaysWorkout.description && (
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{todaysWorkout.description}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Today's Meals Section */}
        {!generationStatus.mealsGenerated ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-md mb-6 sm:mb-8">
            <div className="flex items-center gap-2 text-gray-500 mb-4">
              <Spinner size={16} className="animate-spin" />
              <span className="text-sm">Generating your personalized meals...</span>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <MealSkeleton />
              <MealSkeleton />
              <MealSkeleton />
            </div>
          </div>
        ) : generationStatus.mealsGenerated && todaysMeals.breakfast ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-md mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <ForkKnife className="w-7 h-7 text-[#c1272d]" weight="regular" />
                <div>
                  <h3 className="text-lg font-bold text-[#c1272d]">Today's Meals</h3>
                  <p className="text-xs text-[#8b5cf6] font-medium">Check off as you eat</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate("meal-plan")}
                className="text-sm text-[#c1272d] font-bold hover:underline hover:scale-105 transition-transform bg-gray-50 px-3 py-1 rounded-full"
              >
                View all →
              </button>
            </div>

            <div className="grid gap-3">
              {/* NEW: Breakfast Toggle Design */}
              {todaysMeals.breakfast && (
                <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-orange-50 to-yellow-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                      <ForkKnife className="w-4 h-4 mr-1" weight="regular" />
                      Breakfast
                    </h4>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      selectedMealOptions.breakfast === 'primary'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {selectedMealOptions.breakfast === 'primary' ? (
                        <>
                          <Star className="w-3 h-3 mr-1" weight="bold" />
                          Primary
                        </>
                      ) : (
                        <>
                          <ArrowSquareOut className="w-3 h-3 mr-1" weight="regular" />
                          Alternative
                        </>
                      )}
                    </div>
                  </div>

                  {/* Current Selected Option */}
                  <div className="p-4">
                    {(() => {
                      const currentOption = selectedMealOptions.breakfast === 'primary'
                        ? todaysMeals.breakfast.primary
                        : todaysMeals.breakfast.alternative;

                      return (
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            {currentOption.isLoading ? (
                              <div className="w-16 h-16 bg-gray-200 rounded-xl flex items-center justify-center">
                                <div className="w-5 h-5 border-2 border-[#c1272d] border-t-transparent rounded-full animate-spin"></div>
                              </div>
                            ) : currentOption.isSkipped ? (
                              <div className="w-16 h-16 bg-gray-300 rounded-xl flex items-center justify-center">
                                <span className="text-gray-500 text-xl">🚫</span>
                              </div>
                            ) : (
                              <ImageWithFallback
                                src={currentOption.image || "https://images.unsplash.com/photo-1506084868230-bb9d95c24759"}
                                alt={currentOption.name}
                                className="w-16 h-16 object-cover rounded-xl shadow-md"
                              />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h5 className={`font-semibold text-gray-900 mb-1 ${
                              currentOption.isSkipped ? 'text-gray-500 italic' : ''
                            }`}>
                              {currentOption.name}
                            </h5>
                            <p className="text-sm text-[#8b5cf6] font-medium mb-2">
                              {currentOption.isSkipped ? 'Skipped' : `${currentOption.calories} cal`}
                            </p>

                            <div className="flex items-center gap-3">
                              {!currentOption.isSkipped && !currentOption.isLoading && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isMealEaten('breakfast', 0, selectedMealOptions.breakfast)}
                                    onChange={() => toggleMealEatenFromDashboard('breakfast', 0, selectedMealOptions.breakfast)}
                                    className="h-4 w-4 text-[#c1272d] focus:ring-[#c1272d] border-gray-300 rounded"
                                  />
                                  <span className="text-sm text-gray-600">Mark as eaten</span>
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Toggle Switch */}
                  {todaysMeals.breakfast.alternative.name !== "Alternative not available" && (
                    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          Switch to: <span className="font-medium text-gray-900">
                            {selectedMealOptions.breakfast === 'primary'
                              ? todaysMeals.breakfast.alternative.name
                              : todaysMeals.breakfast.primary.name
                            }
                          </span>
                        </div>
                        <Button
                          onClick={() => toggleMealOption('breakfast')}
                          size="sm"
                          className="bg-gradient-to-r from-orange-400 to-yellow-400 hover:from-orange-500 hover:to-yellow-500 text-white border-0 shadow-sm transition-all duration-200 hover:scale-105 text-xs px-3 py-1"
                        >
                          <ArrowSquareOut className="w-3 h-3 mr-1" weight="regular" />
                          Switch
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lunch */}
              {todaysMeals.lunch && (
                <div className="space-y-2">
                  <h4 className="font-bold text-gray-900 text-base">Lunch Options</h4>
                  {/* Primary Option */}
                  <div className={`flex items-center space-x-3 sm:space-x-4 p-2 sm:p-3 border rounded-lg transition-shadow ${
                    todaysMeals.lunch.primary.isSkipped
                      ? 'bg-gray-100 border-gray-300'
                      : 'bg-gray-50 border-gray-200 hover:shadow-md'
                  }`}>
                    <div className="flex-shrink-0">
                      {todaysMeals.lunch.primary.isLoading ? (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-lg flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-[#c1272d] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : todaysMeals.lunch.primary.isSkipped ? (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-300 rounded-lg flex items-center justify-center">
                          <X className="w-5 h-5 text-gray-500" />
                        </div>
                      ) : (
                        <ImageWithFallback
                          src={todaysMeals.lunch.primary.image || "https://images.unsplash.com/photo-1546793665-c74683f339c1"}
                          alt={todaysMeals.lunch.primary.name}
                          className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg shadow-sm"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${
                        todaysMeals.lunch.primary.isSkipped ? 'text-gray-500 italic' : 'text-gray-700'
                      }`}>
                        {todaysMeals.lunch.primary.name}
                      </p>
                      <p className="text-xs text-[#8b5cf6] font-medium">
                        {todaysMeals.lunch.primary.isSkipped ? '' : `${todaysMeals.lunch.primary.calories} cal`}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!todaysMeals.lunch.primary.isSkipped && !todaysMeals.lunch.primary.isLoading && (
                        <input
                          type="checkbox"
                          checked={isMealEaten('lunch', 0, 'primary')}
                          onChange={() => toggleMealEatenFromDashboard('lunch', 0, 'primary')}
                          className="h-4 w-4 text-[#c1272d] focus:ring-[#c1272d] border-gray-300 rounded"
                        />
                      )}
                    </div>
                  </div>
                  {/* Alternative Option */}
                  {!todaysMeals.lunch.primary.isSkipped && todaysMeals.lunch.alternative.name !== "Alternative not available" && (
                    <div className="flex items-center space-x-3 sm:space-x-4 p-2 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex-shrink-0">
                        {todaysMeals.lunch.alternative.isLoading ? (
                          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-lg flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-[#c1272d] border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        ) : (
                          <ImageWithFallback
                            src={todaysMeals.lunch.alternative.image || "https://images.unsplash.com/photo-1546793665-c74683f339c1"}
                            alt={todaysMeals.lunch.alternative.name}
                            className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg shadow-sm"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{todaysMeals.lunch.alternative.name}</p>
                        <p className="text-xs text-[#8b5cf6] font-medium">{todaysMeals.lunch.alternative.calories} cal</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!todaysMeals.lunch.alternative.isLoading && (
                          <input
                            type="checkbox"
                            checked={isMealEaten('lunch', 0, 'alternative')}
                            onChange={() => toggleMealEatenFromDashboard('lunch', 0, 'alternative')}
                            className="h-4 w-4 text-[#c1272d] focus:ring-[#c1272d] border-gray-300 rounded"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dinner */}
              {todaysMeals.dinner && (
                <div className="space-y-2">
                  <h4 className="font-bold text-gray-900 text-base">Dinner Options</h4>
                  {/* Primary Option */}
                  <div className={`flex items-center space-x-3 sm:space-x-4 p-2 sm:p-3 border rounded-lg transition-shadow ${
                    todaysMeals.dinner.primary.isSkipped
                      ? 'bg-gray-100 border-gray-300'
                      : 'bg-gray-50 border-gray-200 hover:shadow-md'
                  }`}>
                    <div className="flex-shrink-0">
                      {todaysMeals.dinner.primary.isLoading ? (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-lg flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-[#c1272d] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : todaysMeals.dinner.primary.isSkipped ? (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-300 rounded-lg flex items-center justify-center">
                          <X className="w-5 h-5 text-gray-500" />
                        </div>
                      ) : (
                        <ImageWithFallback
                          src={todaysMeals.dinner.primary.image || "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b"}
                          alt={todaysMeals.dinner.primary.name}
                          className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg shadow-sm"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${
                        todaysMeals.dinner.primary.isSkipped ? 'text-gray-500 italic' : 'text-gray-700'
                      }`}>
                        {todaysMeals.dinner.primary.name}
                      </p>
                      <p className="text-xs text-[#8b5cf6] font-medium">
                        {todaysMeals.dinner.primary.isSkipped ? '' : `${todaysMeals.dinner.primary.calories} cal`}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!todaysMeals.dinner.primary.isSkipped && !todaysMeals.dinner.primary.isLoading && (
                        <input
                          type="checkbox"
                          checked={isMealEaten('dinner', 0, 'primary')}
                          onChange={() => toggleMealEatenFromDashboard('dinner', 0, 'primary')}
                          className="h-4 w-4 text-[#c1272d] focus:ring-[#c1272d] border-gray-300 rounded"
                        />
                      )}
                    </div>
                  </div>
                  {/* Alternative Option */}
                  {!todaysMeals.dinner.primary.isSkipped && todaysMeals.dinner.alternative.name !== "Alternative not available" && (
                    <div className="flex items-center space-x-3 sm:space-x-4 p-2 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex-shrink-0">
                        {todaysMeals.dinner.alternative.isLoading ? (
                          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-lg flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-[#c1272d] border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        ) : (
                          <ImageWithFallback
                            src={todaysMeals.dinner.alternative.image || "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b"}
                            alt={todaysMeals.dinner.alternative.name}
                            className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg shadow-sm"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{todaysMeals.dinner.alternative.name}</p>
                        <p className="text-xs text-[#8b5cf6] font-medium">{todaysMeals.dinner.alternative.calories} cal</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!todaysMeals.dinner.alternative.isLoading && (
                          <input
                            type="checkbox"
                            checked={isMealEaten('dinner', 0, 'alternative')}
                            onChange={() => toggleMealEatenFromDashboard('dinner', 0, 'alternative')}
                            className="h-4 w-4 text-[#c1272d] focus:ring-[#c1272d] border-gray-300 rounded"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Daily Macro Progress - Compact */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-md mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <ChartBar className="w-7 h-7 text-[#c1272d]" weight="regular" />
              <div>
                <h3 className="text-lg font-bold text-[#c1272d]">Today's Nutrition</h3>
                <p className="text-xs text-[#8b5cf6] font-medium">Track your macro intake</p>
              </div>
            </div>
            <div className="text-xl font-bold text-[#c1272d] bg-gray-50 px-3 py-1 rounded-full">
              {Math.round((caloriesEaten/nutritionTargets.dailyCalories)*100)}%
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Calories Progress */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-[#c1272d] font-bold">Calories</span>
                <span className="text-gray-700 font-bold">
                  {caloriesEaten}/{nutritionTargets.dailyCalories}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-500 bg-gradient-to-r from-[#c1272d] to-red-500"
                  style={{ width: `${Math.min((caloriesEaten / nutritionTargets.dailyCalories) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Protein Progress */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-[#8b5cf6] font-bold">Protein</span>
                <span className="text-gray-700 font-bold">
                  {proteinEaten}g/{Math.round(nutritionTargets.dailyProtein)}g
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-500 bg-gradient-to-r from-[#8b5cf6] to-purple-600"
                  style={{ width: `${Math.min((proteinEaten / nutritionTargets.dailyProtein) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Carbs Progress */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-[#c1272d] font-bold">Carbs</span>
                <span className="text-gray-700 font-bold">
                  {carbsEaten}g/{Math.round(nutritionTargets.dailyCarbs)}g
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-500 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6]"
                  style={{ width: `${Math.min((carbsEaten / nutritionTargets.dailyCarbs) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Fat Progress */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-[#8b5cf6] font-bold">Fat</span>
                <span className="text-gray-700 font-bold">
                  {fatEaten}g/{Math.round(nutritionTargets.dailyFat)}g
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-500 bg-gradient-to-r from-[#8b5cf6] to-purple-600"
                  style={{ width: `${Math.min((fatEaten / nutritionTargets.dailyFat) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button className="flex flex-col items-center justify-center text-primary">
            <img src="/fytr-icon.svg" alt="Home" className="w-5 h-5 mb-1" />
            <span className="text-xs">Home</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("meal-plan")}
          >
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
            <User className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Account</span>
          </button>
        </div>
      </div>

    </div>
  );
}