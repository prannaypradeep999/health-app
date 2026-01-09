'use client';

import { useState } from "react";
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
  Lightning
} from "@phosphor-icons/react";

interface ProgressPageProps {
  onNavigate: (screen: string) => void;
}

export function ProgressPage({ onNavigate }: ProgressPageProps) {
  const [appleWatchConnected, setAppleWatchConnected] = useState(false);
  const [renphoConnected, setRenphoConnected] = useState(false);
  const [ouraConnected, setOuraConnected] = useState(false);

  // Get real progress data from localStorage or show empty states
  const getProgressData = () => {
    try {
      const mealLogs = JSON.parse(localStorage.getItem('mealConsumptionLogs') || '{}');
      const workoutLogs = JSON.parse(localStorage.getItem('workoutLogs') || '{}');

      // Calculate basic stats from real user activity
      const totalMealsLogged = Object.keys(mealLogs).length;
      const totalWorkoutsLogged = Object.keys(workoutLogs).length;

      return {
        hasData: totalMealsLogged > 0 || totalWorkoutsLogged > 0,
        mealsLogged: totalMealsLogged,
        workoutsLogged: totalWorkoutsLogged
      };
    } catch (error) {
      return { hasData: false, mealsLogged: 0, workoutsLogged: 0 };
    }
  };

  const progressData = getProgressData();

  // Empty state for when user hasn't started tracking yet
  if (!progressData.hasData) {
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
                <h1 className="text-2xl font-medium text-neutral-900">Progress</h1>
                <p className="text-sm text-neutral-600">Track your health journey</p>
              </div>
            </div>
          </div>
        </div>

        {/* Empty State */}
        <div className="max-w-lg mx-auto px-6 py-16 text-center">
          <ChartBar className="w-16 h-16 text-gray-400 mx-auto mb-6" weight="regular" />
          <h2 className="text-xl font-medium text-gray-900 mb-4">Start Tracking Your Progress</h2>
          <p className="text-gray-600 mb-8">
            Complete workouts and log meals to see your progress charts and achievements here.
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => onNavigate("meal-plan")}
              className="w-full bg-[#c1272d] hover:bg-red-700 text-white"
            >
              View Meal Plan
            </Button>
            <Button
              onClick={() => onNavigate("workout-plan")}
              variant="outline"
              className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              View Workout Plan
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const totalDays = 90;
  const weightLost = 3;
  const weightGoal = 10;

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
            <p className="text-sm text-gray-600">Lost {weightLost} out of {weightGoal} pounds</p>
            <p className="text-sm font-medium text-[#8b5cf6]">{Math.round((weightLost/weightGoal)*100)}% achieved</p>
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
            <div className="p-4 bg-gradient-to-br from-[#8b5cf6]/10 to-[#8b5cf6]/5 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <Barbell className="w-5 h-5 text-[#8b5cf6]" weight="regular" />
                <Badge className="bg-white/50 text-[#8b5cf6] text-xs">
                  {weeklyStats.workoutsCompleted}/{weeklyStats.workoutsPlanned}
                </Badge>
              </div>
              <div className="text-2xl font-semibold text-gray-900">{weeklyStats.workoutsCompleted}</div>
              <div className="text-sm text-gray-600">Workouts</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-[#c1272d]/10 to-[#c1272d]/5 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <ForkKnife className="w-5 h-5 text-[#c1272d]" weight="regular" />
                <Badge className="bg-white/50 text-[#c1272d] text-xs">
                  {weeklyStats.mealPlanAdherence}%
                </Badge>
              </div>
              <div className="text-2xl font-semibold text-gray-900">{weeklyStats.avgCalories}</div>
              <div className="text-sm text-gray-600">Avg calories per day</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-orange-100 to-orange-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <Heartbeat className="w-5 h-5 text-orange-600" weight="regular" />
              </div>
              <div className="text-2xl font-semibold text-gray-900">{weeklyStats.avgCaloriesBurned}</div>
              <div className="text-sm text-gray-600">Avg calories burned per day</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <ChartBar className="w-5 h-5 text-blue-600" weight="regular" />
              </div>
              <div className="text-2xl font-semibold text-gray-900">{weeklyStats.avgActiveMinutes}</div>
              <div className="text-sm text-gray-600">Avg active time per day (min)</div>
            </div>
          </div>
        </div>

        {/* Device Integrations */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Device Integrations</h3>
          <div className="space-y-4">
            {/* Apple Watch */}
            <div className={`p-4 rounded-xl border-2 transition-all duration-200 ${
              appleWatchConnected ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    appleWatchConnected ? 'bg-green-500' : 'bg-gray-200'
                  }`}>
                    <Watch className={`w-5 h-5 ${appleWatchConnected ? 'text-white' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Apple Watch</h4>
                    <p className="text-sm text-gray-600">Track steps, heart rate, and activity</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setAppleWatchConnected(!appleWatchConnected)}
                  className={appleWatchConnected
                    ? "bg-green-500 hover:bg-green-600 text-white"
                    : "bg-[#8b5cf6] hover:bg-purple-700 text-white"
                  }
                >
                  {appleWatchConnected ? 'Connected' : 'Connect'}
                </Button>
              </div>
              {appleWatchConnected && (
                <div className="flex items-center gap-4 pt-3 border-t border-green-200">
                  <div className="flex items-center gap-2">
                    <Footprints className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-900">{weeklyStats.steps.toLocaleString()} steps today</span>
                  </div>
                </div>
              )}
            </div>

            {/* Renpho Scale */}
            <div className={`p-4 rounded-xl border-2 transition-all duration-200 ${
              renphoConnected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    renphoConnected ? 'bg-blue-500' : 'bg-gray-200'
                  }`}>
                    <Scales className={`w-5 h-5 ${renphoConnected ? 'text-white' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Renpho Scale</h4>
                    <p className="text-sm text-gray-600">Track weight, body fat, and muscle mass</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setRenphoConnected(!renphoConnected)}
                  className={renphoConnected
                    ? "bg-blue-500 hover:bg-blue-600 text-white"
                    : "bg-[#8b5cf6] hover:bg-purple-700 text-white"
                  }
                >
                  {renphoConnected ? 'Connected' : 'Connect'}
                </Button>
              </div>
            </div>

            {/* OURA Ring */}
            <div className={`p-4 rounded-xl border-2 transition-all duration-200 ${
              ouraConnected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    ouraConnected ? 'bg-purple-500' : 'bg-gray-200'
                  }`}>
                    <Moon className={`w-5 h-5 ${ouraConnected ? 'text-white' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">OURA Ring</h4>
                    <p className="text-sm text-gray-600">Track sleep, recovery, and readiness</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setOuraConnected(!ouraConnected)}
                  className={ouraConnected
                    ? "bg-purple-500 hover:bg-purple-600 text-white"
                    : "bg-[#8b5cf6] hover:bg-purple-700 text-white"
                  }
                >
                  {ouraConnected ? 'Connected' : 'Connect'}
                </Button>
              </div>
              {ouraConnected && (
                <div className="pt-3 border-t border-purple-200">
                  <p className="text-sm text-purple-900 font-medium">
                    AI will optimize your meals and workouts based on your sleep and recovery data
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Weight Progress Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Weight Progress</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyWeight}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" domain={[160, 166]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#c1272d"
                strokeWidth={3}
                dot={{ fill: '#8b5cf6', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Activity Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Weekly Activity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Bar dataKey="workouts" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Achievements */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <Award className="w-6 h-6 mr-3 text-[#8b5cf6]" />
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
            <Apple className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("workout-plan")}
          >
            <Dumbbell className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Workouts</span>
          </button>
          <button className="flex flex-col items-center justify-center text-[#c1272d]">
            <TrendingUp className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Progress</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
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