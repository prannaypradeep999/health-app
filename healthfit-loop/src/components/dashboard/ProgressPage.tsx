'use client';

// Utility function to round nutrition values to nearest 10
const roundToNearest10 = (value: number) => Math.round(value / 10) * 10;

import React, { useState, useEffect } from "react";
import { ChatSearchBar } from "@/components/chat/ChatSearchBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  ArrowLeft,
  ChartLineUp,
  Target,
  Medal,
  ChartBar,
  ForkKnife,
  Barbell,
  UserCircle,
  Watch,
  Heartbeat,
  Scales,
  Moon,
  Heart,
  Footprints,
  Lightning,
  // ADD THESE (they're used in bottom nav and achievements):
  Trophy,  // Use Trophy instead of Award (Award doesn't exist in Phosphor)
  User,
  CaretUp,
  CaretDown
} from "@phosphor-icons/react";

interface ProgressPageProps {
  onNavigate: (screen: string) => void;
  user?: any;
  isGuest?: boolean;
  onShowAccountModal?: () => void;
}

export function ProgressPage({ onNavigate, user }: ProgressPageProps) {

  // Weight logging state
  const [weightInput, setWeightInput] = useState('');
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [loadingWeight, setLoadingWeight] = useState(false);
  const [savingWeight, setSavingWeight] = useState(false);
  const [mealPlanData, setMealPlanData] = useState<any>(null);
  const [nutritionTargets, setNutritionTargets] = useState<{
    dailyCalories: number;
    dailyProtein: number;
    dailyCarbs: number;
    dailyFat: number;
  } | null>(null);

  // Get surveyId from user's active survey
  // activeSurvey contains the full survey object with id
  const surveyId = user?.activeSurvey?.id;

  const getMealStorageKey = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('currentMealStorageKey') || 'eatenMeals';
  };

  const getWorkoutStorageKey = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('currentWorkoutStorageKey') || 'completedExercises';
  };

  // Get real progress data from localStorage or show empty states
  const getProgressData = () => {
    try {
      const mealKey = getMealStorageKey();
      const workoutKey = getWorkoutStorageKey();
      const eatenMeals = mealKey ? JSON.parse(localStorage.getItem(mealKey) || '{}') : {};
      const completedExercises = workoutKey ? JSON.parse(localStorage.getItem(workoutKey) || '{}') : {};

      // Count meals marked as eaten (eatenMeals is { "day-mealType-optionType-index": true })
      const totalMealsLogged = Object.values(eatenMeals).filter(v => v === true).length;

      // Count exercises completed across all days
      let totalExercisesCompleted = 0;
      let workoutDaysCompleted = 0;

      Object.values(completedExercises).forEach((exercises: any) => {
        let count = 0;
        if (Array.isArray(exercises)) {
          count = exercises.length;
        } else if (exercises && typeof exercises === 'object') {
          // Handle Set-like objects
          count = Object.keys(exercises).length;
        }
        if (count > 0) {
          totalExercisesCompleted += count;
          workoutDaysCompleted += 1;
        }
      });

      return {
        hasData: totalMealsLogged > 0 || totalExercisesCompleted > 0,
        mealsLogged: totalMealsLogged,
        workoutsLogged: workoutDaysCompleted,  // Days with completed exercises
        exercisesCompleted: totalExercisesCompleted
      };
    } catch (error) {
      console.error('[PROGRESS] Error reading localStorage:', error);
      return { hasData: false, mealsLogged: 0, workoutsLogged: 0, exercisesCompleted: 0 };
    }
  };

  const [progressData, setProgressData] = useState(getProgressData());

  useEffect(() => {
    const loadMealPlan = async () => {
      try {
        const response = await fetch('/api/ai/meals/current');
        if (!response.ok) return;
        const data = await response.json();
        setMealPlanData(data.mealPlan || null);
        setNutritionTargets(data.mealPlan?.nutritionTargets || null);
      } catch (error) {
        console.error('[PROGRESS] Failed to load meal plan:', error);
      }
    };

    loadMealPlan();
  }, []);

  // Update progressData when localStorage changes
  useEffect(() => {
    const updateProgress = () => setProgressData(getProgressData());

    // Listen for storage events (other tabs)
    const handleStorage = (e: StorageEvent) => {
      const mealKey = getMealStorageKey();
      const workoutKey = getWorkoutStorageKey();
      if (
        e.key === mealKey ||
        e.key === workoutKey ||
        e.key === 'currentMealStorageKey' ||
        e.key === 'currentWorkoutStorageKey'
      ) {
        updateProgress();
      }
    };

    // Listen for custom events (same tab)
    window.addEventListener('storage', handleStorage);
    window.addEventListener('eatenMealsUpdate', updateProgress);
    window.addEventListener('completedExercisesUpdate', updateProgress);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('eatenMealsUpdate', updateProgress);
      window.removeEventListener('completedExercisesUpdate', updateProgress);
    };
  }, []);

  // Goal tracking - derive from user's survey data
  const goalType = user?.activeSurvey?.goal === 'WEIGHT_LOSS' ? 'Weight Loss Journey' :
                   user?.activeSurvey?.goal === 'MUSCLE_GAIN' ? 'Muscle Building Journey' :
                   user?.activeSurvey?.goal === 'ENDURANCE' ? 'Endurance Training' :
                   'Wellness Journey';

  // Calculate days since user started (from survey creation)
  const surveyCreatedAt = user?.activeSurvey?.createdAt
    ? new Date(user.activeSurvey.createdAt)
    : new Date();
  const currentDay = Math.max(1, Math.floor((Date.now() - surveyCreatedAt.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const totalDays = 90; // 90-day program

  // Weight progress - calculate from weight logs
  const startWeight = user?.activeSurvey?.weight || 0;
  const currentWeight = weightLogs.length > 0 ? weightLogs[0].weight : startWeight;
  const weightLost = startWeight > 0 ? Math.round((startWeight - currentWeight) * 10) / 10 : 0;
  const weightGoal = user?.activeSurvey?.goal === 'WEIGHT_LOSS' ? 10 :
                     user?.activeSurvey?.goal === 'MUSCLE_GAIN' ? -5 : 0; // negative = gain

  const weeklyCalorieBreakdown = React.useMemo(() => {
    const summaries = mealPlanData?.dailySummaries;
    if (Array.isArray(summaries) && summaries.length > 0) {
      return summaries.map((summary: any) => ({
        day: summary.day || 'Day',
        plannedCalories: summary.planned ?? 0,
        targetCalories: summary.target ?? nutritionTargets?.dailyCalories ?? 0,
        deviation: summary.deviation,
        status: summary.status
      }));
    }

    const days = mealPlanData?.planData?.days;
    if (!days || !Array.isArray(days)) return [];

    // Get eaten meals from localStorage to filter only consumed calories
    const mealKey = getMealStorageKey();
    const eatenMeals = mealKey ? JSON.parse(localStorage.getItem(mealKey) || '{}') : {};

    return days.map((day: any) => {
      const dayName = day.day || day.dayName || day.date || 'Day';
      const meals = day.meals || {};

      // Only count calories for meals that are actually marked as eaten
      const consumedCalories = ['breakfast', 'lunch', 'dinner'].reduce((sum, mealType) => {
        const meal = meals[mealType];
        if (!meal) return sum;

        let calories = 0;

        // Check primary option
        const primaryKey = `${dayName.toLowerCase()}-${mealType}-primary-0`;
        if (eatenMeals[primaryKey]) {
          const primaryOption = meal.primary || meal;
          calories += primaryOption?.calories ?? primaryOption?.estimatedCalories ?? 0;
        }

        // Check alternative option
        const alternativeKey = `${dayName.toLowerCase()}-${mealType}-alternative-0`;
        if (eatenMeals[alternativeKey]) {
          const alternativeOption = meal.alternative;
          if (alternativeOption) {
            calories += alternativeOption?.calories ?? alternativeOption?.estimatedCalories ?? 0;
          }
        }

        return sum + calories;
      }, 0);

      return {
        day: dayName,
        plannedCalories: consumedCalories, // Now this represents CONSUMED calories, not planned
        targetCalories: nutritionTargets?.dailyCalories ?? 0
      };
    });
  }, [mealPlanData, nutritionTargets, progressData]);

  const weeklyCaloriesSummary = React.useMemo(() => {
    if (!weeklyCalorieBreakdown.length) {
      return {
        total: 0,
        average: 0,
        avgDeviationPercent: 0
      };
    }

    const total = weeklyCalorieBreakdown.reduce((sum, day) => sum + day.plannedCalories, 0);
    const daysWithData = weeklyCalorieBreakdown.filter(day => day.plannedCalories > 0).length || 1;
    const average = Math.round(total / daysWithData);
    const avgDeviationPercent = Math.round(
      weeklyCalorieBreakdown.reduce((sum, day: any) => {
        if (typeof day.deviation === 'number') {
          return sum + Math.abs(day.deviation);
        }
        const target = day.targetCalories ?? nutritionTargets?.dailyCalories ?? 0;
        const deviation = target > 0 ? Math.abs(day.plannedCalories - target) / target * 100 : 0;
        return sum + deviation;
      }, 0) / weeklyCalorieBreakdown.length
    );

    return {
      total,
      average,
      avgDeviationPercent
    };
  }, [weeklyCalorieBreakdown, nutritionTargets]);

  // Weekly stats - derive from localStorage progress data
  const weeklyStats = {
    workoutsCompleted: progressData.workoutsLogged || 0,
    workoutsPlanned: 5,
    mealPlanAdherence: progressData.mealsLogged > 0
      ? Math.min(100, Math.round((progressData.mealsLogged / 21) * 100))
      : 0,
    avgCalories: weeklyCaloriesSummary.average,
    weeklyTotalCalories: weeklyCaloriesSummary.total,
    avgDeviationPercent: weeklyCaloriesSummary.avgDeviationPercent,
    avgCaloriesBurned: 300, // Placeholder - would need workout data
    avgActiveMinutes: 45, // Placeholder - would need workout data
    steps: 8500 // Placeholder - would need device integration
  };

  // Monthly weight data for chart - use actual weight logs or generate placeholder
  const monthlyWeight = weightLogs.length >= 2
    ? weightLogs.slice(0, 4).reverse().map((log, i) => ({
        week: `Week ${i + 1}`,
        weight: log.weight
      }))
    : [
        { week: 'Week 1', weight: startWeight || 165 },
        { week: 'Week 2', weight: startWeight ? startWeight - 0.5 : 164.5 },
        { week: 'Week 3', weight: startWeight ? startWeight - 1 : 164 },
        { week: 'Week 4', weight: currentWeight || 163 }
      ];

  // Weekly activity data for bar chart
  const weeklyData = [
    { day: 'Mon', workouts: progressData.workoutsLogged > 0 ? 1 : 0 },
    { day: 'Tue', workouts: progressData.workoutsLogged > 1 ? 1 : 0 },
    { day: 'Wed', workouts: progressData.workoutsLogged > 2 ? 1 : 0 },
    { day: 'Thu', workouts: progressData.workoutsLogged > 3 ? 1 : 0 },
    { day: 'Fri', workouts: progressData.workoutsLogged > 4 ? 1 : 0 },
    { day: 'Sat', workouts: 0 },
    { day: 'Sun', workouts: 0 }
  ];

  // Achievements based on actual progress
  const achievements = [
    {
      id: '1',
      title: 'First Week Complete',
      description: 'Complete your first 7 days on FYTR',
      progress: Math.min(100, Math.round((currentDay / 7) * 100)),
      earned: currentDay >= 7
    },
    {
      id: '2',
      title: 'Meal Logger',
      description: 'Log 10 meals as eaten',
      progress: Math.min(100, Math.round((progressData.mealsLogged / 10) * 100)),
      earned: progressData.mealsLogged >= 10
    },
    {
      id: '3',
      title: 'Workout Warrior',
      description: 'Complete 5 workouts',
      progress: Math.min(100, Math.round((progressData.workoutsLogged / 5) * 100)),
      earned: progressData.workoutsLogged >= 5
    },
    {
      id: '4',
      title: 'Weight Tracker',
      description: 'Log your weight 7 times',
      progress: Math.min(100, Math.round((weightLogs.length / 7) * 100)),
      earned: weightLogs.length >= 7
    },
    {
      id: '5',
      title: 'Month One',
      description: 'Stay consistent for 30 days',
      progress: Math.min(100, Math.round((currentDay / 30) * 100)),
      earned: currentDay >= 30
    }
  ];

  // Load weight history
  useEffect(() => {
    const loadWeightHistory = async () => {
      if (!surveyId) return;
      setLoadingWeight(true);
      try {
        const response = await fetch(`/api/tracking/weight?surveyId=${surveyId}&limit=30`);
        if (response.ok) {
          const data = await response.json();
          setWeightLogs(data.weightLogs || []);
        }
      } catch (err) {
        console.error('[PROGRESS] Failed to load weight:', err);
      }
      setLoadingWeight(false);
    };

    loadWeightHistory();
  }, [surveyId]);

  // Log weight function
  const logWeight = async () => {
    if (!weightInput || !surveyId || savingWeight) return;

    setSavingWeight(true);
    try {
      const response = await fetch('/api/tracking/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyId,
          weight: parseFloat(weightInput)
        })
      });

      if (response.ok) {
        const data = await response.json();
        setWeightLogs(prev => [data.weightLog, ...prev]);
        setWeightInput('');
      }
    } catch (err) {
      console.error('[PROGRESS] Failed to log weight:', err);
    }
    setSavingWeight(false);
  };

  // Delete weight log
  const deleteWeightLog = async (id: string) => {
    try {
      await fetch(`/api/tracking/weight?id=${id}`, { method: 'DELETE' });
      setWeightLogs(prev => prev.filter(log => log.id !== id));
    } catch (err) {
      console.error('[PROGRESS] Failed to delete:', err);
    }
  };


  // Motivational quotes
  const motivationalQuotes = [
    "The only bad workout is the one that didn't happen.",
    "You're stronger than you think. Keep pushing!",
    "Small progress is still progress.",
    "Your body can stand almost anything. It's your mind you have to convince.",
    "Success is the sum of small efforts repeated day in and day out."
  ];
  const todaysQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

  return (
    <div className="min-h-screen bg-[#fafafa] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 px-8 py-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <img src="/fytr-icon.svg" alt="FYTR" className="w-10 h-10" />
              <span className="text-xl font-bold text-[#c1272d]">FYTR</span>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <button className="text-sm font-medium text-[#c1272d] border-b-2 border-[#c1272d] pb-3">Progress</button>
            </nav>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("dashboard")}
            className="text-gray-600 hover:text-[#c1272d]"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>

      {/* Chat Search Bar */}
      <ChatSearchBar />

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Long-term Goal Progress */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#8b5cf6]" />
              <h3 className="font-medium text-gray-900">{goalType}</h3>
            </div>
            <Badge className="bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/20">
              Day {currentDay}/{totalDays}
            </Badge>
          </div>
          <ProgressBar
            value={(currentDay/totalDays)*100}
            className="h-3 mb-2 bg-gray-200 [&>div]:bg-gradient-to-r [&>div]:from-[#8b5cf6] [&>div]:to-[#c1272d]"
          />
          <div className="flex items-center justify-between">
            {weightLogs.length > 0 && startWeight > 0 ? (
              <>
                <p className="text-sm text-gray-600">
                  {weightLost > 0 ? `Lost ${weightLost} lbs` : weightLost < 0 ? `Gained ${Math.abs(weightLost)} lbs` : 'No change yet'}
                  {weightGoal !== 0 && ` of ${Math.abs(weightGoal)} lb goal`}
                </p>
                {weightGoal !== 0 && (
                  <p className="text-sm font-medium text-[#8b5cf6]">
                    {Math.min(100, Math.round((Math.abs(weightLost) / Math.abs(weightGoal)) * 100))}% achieved
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Log your weight to track progress toward your goal</p>
            )}
          </div>
        </div>

        {/* Motivational Quote */}
        <div className="bg-gradient-to-r from-[#8b5cf6]/5 to-[#c1272d]/5 border border-gray-200 rounded-2xl p-6 shadow-md">
          <div className="flex items-start gap-3">
            <Lightning className="w-5 h-5 text-[#8b5cf6] mt-1 flex-shrink-0" weight="regular" />
            <div>
              <p className="text-sm font-medium text-gray-900 italic">"{todaysQuote}"</p>
              <p className="text-xs text-gray-600 mt-2">Your daily motivation</p>
            </div>
          </div>
        </div>

        {/* Weekly Stats Overview */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6">This Week</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Workouts - Real data from localStorage */}
            <div className="p-4 bg-gradient-to-br from-[#8b5cf6]/10 to-[#8b5cf6]/5 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <Barbell className="w-5 h-5 text-[#8b5cf6]" weight="regular" />
                <Badge className="bg-white/50 text-[#8b5cf6] text-xs">
                  {progressData.workoutsLogged}/5
                </Badge>
              </div>
              <div className="text-2xl font-semibold text-gray-900">{progressData.workoutsLogged}</div>
              <div className="text-sm text-gray-600">Workouts completed</div>
            </div>

            {/* Meals logged - Real data from localStorage */}
            <div className="p-4 bg-gradient-to-br from-[#c1272d]/10 to-[#c1272d]/5 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <ForkKnife className="w-5 h-5 text-[#c1272d]" weight="regular" />
                <Badge className="bg-white/50 text-[#c1272d] text-xs">
                  {progressData.mealsLogged}/21
                </Badge>
              </div>
              <div className="text-2xl font-semibold text-gray-900">{progressData.mealsLogged}</div>
              <div className="text-sm text-gray-600">Meals logged</div>
            </div>

            {/* Average Calories */}
            <div className="p-4 bg-gradient-to-br from-orange-100 to-orange-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <Heartbeat className="w-5 h-5 text-orange-400" weight="regular" />
                <Badge className="bg-white/50 text-orange-700 text-xs">
                  avg/day
                </Badge>
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {weeklyStats.avgCalories > 0 ? Math.round(weeklyStats.avgCalories) : '--'}
              </div>
              <div className="text-sm text-gray-600">Average calories</div>
            </div>

            {/* Weekly Total Calories */}
            <div className="p-4 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <ChartBar className="w-5 h-5 text-blue-400" weight="regular" />
                <Badge className="bg-white/50 text-blue-700 text-xs">
                  total
                </Badge>
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {weeklyStats.weeklyTotalCalories > 0 ? roundToNearest10(weeklyStats.weeklyTotalCalories) : '--'}
              </div>
              <div className="text-sm text-gray-600">Weekly calories</div>
            </div>
          </div>
        </div>

        {/* Weekly Calorie Breakdown */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Weekly Calories</h3>
          {weeklyCalorieBreakdown.length > 0 ? (
            <div className="space-y-3">
              {weeklyCalorieBreakdown.map((day) => {
                const target = (day as any).targetCalories ?? nutritionTargets?.dailyCalories ?? 0;
                const actual = day.plannedCalories;
                const deviation = typeof (day as any).deviation === 'number'
                  ? Math.abs((day as any).deviation)
                  : target > 0 ? Math.abs(actual - target) / target * 100 : 0;
                const statusColor = (day as any).status
                  ? (day as any).status === 'on-target'
                    ? 'text-green-600'
                    : (day as any).status === 'warning' || (day as any).status === 'under'
                      ? 'text-orange-600'
                      : 'text-red-600'
                  : deviation <= 10
                    ? 'text-green-600'
                    : deviation <= 15
                      ? 'text-orange-600'
                      : 'text-red-600';
                const statusIcon = (day as any).status
                  ? ((day as any).status === 'on-target' ? '✓' : '⚠')
                  : (deviation <= 10 ? '✓' : '⚠');

                return (
                  <div key={day.day} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-gray-700">{day.day}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">{Math.round(actual)} / {target > 0 ? roundToNearest10(target) : '—'} cal</span>
                      <span className={`text-xs font-medium ${statusColor}`}>
                        {statusIcon}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Total this week</span>
                  <span className="font-medium text-gray-800">{roundToNearest10(weeklyCaloriesSummary.total)} cal</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average per day</span>
                  <span className="font-medium text-gray-800">{roundToNearest10(weeklyCaloriesSummary.average)} cal</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Avg deviation</span>
                  <span className="font-medium text-gray-800">{weeklyCaloriesSummary.avgDeviationPercent}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-gray-600 font-medium">No calorie data yet</div>
              <div className="text-gray-500 text-sm">Your plan is still loading or not generated.</div>
            </div>
          )}
        </div>


        {/* Weight Progress Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Weight Progress</h3>
          {weightLogs.length >= 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightLogs.slice(0, 8).reverse().map((log) => ({
                date: new Date(log.loggedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                weight: log.weight
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#9CA3AF"
                  domain={[
                    Math.floor(Math.min(...weightLogs.map(l => l.weight)) - 5),
                    Math.ceil(Math.max(...weightLogs.map(l => l.weight)) + 5)
                  ]}
                />
                <Tooltip formatter={(value) => [`${value} lbs`, 'Weight']} />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#c1272d"
                  strokeWidth={3}
                  dot={{ fill: '#8b5cf6', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center bg-gray-50 rounded-xl">
              <div className="text-center">
                <Scales className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Log your weight below to see your progress chart</p>
              </div>
            </div>
          )}
        </div>

        {/* Weekly Activity Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Weekly Activity</h3>
          {progressData.workoutsLogged > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip />
                <Bar dataKey="workouts" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center bg-gray-50 rounded-xl">
              <div className="text-center">
                <Barbell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Complete workouts to see your activity chart</p>
                <Button
                  onClick={() => onNavigate("workout-plan")}
                  variant="outline"
                  size="sm"
                  className="mt-3"
                >
                  View Workouts
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Achievements */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <Trophy className="w-6 h-6 mr-3 text-[#8b5cf6]" weight="duotone" />
            Achievements
          </h3>
          <div className="space-y-4">
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                  achievement.earned
                    ? 'border-[#8b5cf6] bg-gradient-to-r from-purple-50 to-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{achievement.title}</h4>
                    <p className="text-sm text-gray-600">{achievement.description}</p>
                  </div>
                  {achievement.earned && (
                    <Badge className="bg-[#8b5cf6] text-white">
                      Earned
                    </Badge>
                  )}
                </div>
                <ProgressBar
                  value={achievement.progress}
                  className="h-2 bg-gray-200 [&>div]:bg-gradient-to-r [&>div]:from-[#8b5cf6] [&>div]:to-[#c1272d]"
                />
                <p className="text-xs text-gray-600 mt-1">{achievement.progress}% complete</p>
              </div>
            ))}
          </div>
        </div>

        {/* Weight Logging Section */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <Scales className="w-6 h-6 text-[#c1272d]" weight="duotone" />
            <h3 className="text-lg font-bold text-gray-900">Weight Tracking</h3>
          </div>

          {/* Input Form */}
          <div className="flex gap-3 mb-6">
            <div className="flex-1 relative">
              <input
                type="number"
                step="0.1"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="Enter weight"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                onKeyDown={(e) => e.key === 'Enter' && logWeight()}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">lbs</span>
            </div>
            <Button
              onClick={logWeight}
              disabled={!weightInput || savingWeight}
              className="bg-[#c1272d] hover:bg-red-700 text-white px-6"
            >
              {savingWeight ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Log'
              )}
            </Button>
          </div>

          {/* Weight History */}
          {loadingWeight ? (
            <div className="text-center py-4">
              <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : weightLogs.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600 mb-3">Recent Entries</h4>
              {weightLogs.slice(0, 7).map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-semibold text-gray-900">{log.weight} lbs</span>
                    <span className="text-sm text-gray-500 ml-3">
                      {new Date(log.loggedAt).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteWeightLog(log.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Weight Change Summary */}
              {weightLogs.length >= 2 && (
                <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-red-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Change from first entry:</span>
                    <span className={`font-bold ${
                      weightLogs[0].weight < weightLogs[weightLogs.length - 1].weight
                        ? 'text-green-600'
                        : weightLogs[0].weight > weightLogs[weightLogs.length - 1].weight
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}>
                      {(weightLogs[0].weight - weightLogs[weightLogs.length - 1].weight).toFixed(1)} lbs
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">No weight entries yet. Start tracking above!</p>
          )}
        </div>

        {/* Device Integrations - Coming Soon */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900">Device Integrations</h3>
            <Badge className="bg-purple-100 text-purple-700">Coming Soon</Badge>
          </div>
          <p className="text-gray-600 mb-6">Connect your devices to automatically sync your health data.</p>
          <div className="space-y-4 opacity-60">
            {/* Apple Watch */}
            <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200">
                    <Watch className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Apple Watch</h4>
                    <p className="text-sm text-gray-600">Track steps, heart rate, and activity</p>
                  </div>
                </div>
                <Button size="sm" disabled className="bg-gray-300 text-gray-500 cursor-not-allowed">
                  Coming Soon
                </Button>
              </div>
            </div>

            {/* Renpho Scale */}
            <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200">
                    <Scales className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Renpho Scale</h4>
                    <p className="text-sm text-gray-600">Track weight, body fat, and muscle mass</p>
                  </div>
                </div>
                <Button size="sm" disabled className="bg-gray-300 text-gray-500 cursor-not-allowed">
                  Coming Soon
                </Button>
              </div>
            </div>

            {/* OURA Ring */}
            <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200">
                    <Moon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">OURA Ring</h4>
                    <p className="text-sm text-gray-600">Track sleep, recovery, and readiness</p>
                  </div>
                </div>
                <Button size="sm" disabled className="bg-gray-300 text-gray-500 cursor-not-allowed">
                  Coming Soon
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("dashboard")}
          >
            <img src="/fytr-icon.svg" alt="Home" className="w-5 h-5 mb-1" />
            <span className="text-xs">Home</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("meal-plan")}
          >
            <ForkKnife className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("workout-plan")}
          >
            <Barbell className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Workouts</span>
          </button>
          <button className="flex flex-col items-center justify-center text-[#c1272d]">
            <ChartLineUp className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Progress</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
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