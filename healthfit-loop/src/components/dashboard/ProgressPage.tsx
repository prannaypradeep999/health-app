'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  ArrowLeft,
  TrendingUp,
  Target,
  Calendar,
  Award,
  BarChart3,
  Apple,
  Dumbbell,
  User
} from "lucide-react";

interface ProgressPageProps {
  onNavigate: (screen: string) => void;
}

export function ProgressPage({ onNavigate }: ProgressPageProps) {
  // Mock data for charts - MVP placeholder data
  const weeklyData = [
    { day: 'Mon', workouts: 1, calories: 2100 },
    { day: 'Tue', workouts: 0, calories: 0 },
    { day: 'Wed', workouts: 0, calories: 0 },
    { day: 'Thu', workouts: 0, calories: 0 },
    { day: 'Fri', workouts: 0, calories: 0 },
    { day: 'Sat', workouts: 0, calories: 0 },
    { day: 'Sun', workouts: 0, calories: 0 }
  ];

  const achievements = [
    { id: 1, title: "Survey Complete", description: "Completed your health assessment", earned: true, progress: 100 },
    { id: 2, title: "Plan Generated", description: "Your personalized plans are ready", earned: true, progress: 100 },
    { id: 3, title: "First Week", description: "Complete your first week", earned: false, progress: 14 },
    { id: 4, title: "Consistency Champion", description: "30 days of tracking", earned: false, progress: 3 }
  ];

  const weeklyStats = {
    workoutsCompleted: 0,
    workoutsPlanned: 4,
    mealPlanAdherence: 0,
    avgCalories: 0,
    streakDays: 1,
    totalActiveMinutes: 0
  };

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
              <p className="text-sm text-neutral-600">Track your fitness journey</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-primary border-primary hover:bg-primary/5"
          >
            <Calendar className="w-4 h-4 mr-2" />
            This Week
          </Button>
        </div>
      </div>

      <div className="p-6">
        {/* Weekly Overview */}
        <Card className="mb-6 border-0 shadow-subtle bg-white">
          <CardHeader>
            <CardTitle className="flex items-center text-lg font-medium">
              <BarChart3 className="w-5 h-5 mr-2 text-primary" />
              This Week's Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-600">Workouts</span>
                  <span className="text-sm font-medium text-neutral-900">
                    {weeklyStats.workoutsCompleted}/{weeklyStats.workoutsPlanned}
                  </span>
                </div>
                <ProgressBar
                  value={(weeklyStats.workoutsCompleted / weeklyStats.workoutsPlanned) * 100}
                  className="h-2 bg-neutral-100"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-600">Nutrition</span>
                  <span className="text-sm font-medium text-neutral-900">
                    {weeklyStats.mealPlanAdherence}%
                  </span>
                </div>
                <ProgressBar
                  value={weeklyStats.mealPlanAdherence}
                  className="h-2 bg-neutral-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-neutral-100">
              <div>
                <div className="text-2xl font-medium text-accent-green mb-1">{weeklyStats.streakDays}</div>
                <div className="text-sm text-neutral-600">Day streak</div>
              </div>
              <div>
                <div className="text-2xl font-medium text-accent-blue mb-1">{weeklyStats.avgCalories || "N/A"}</div>
                <div className="text-sm text-neutral-600">Avg calories</div>
              </div>
              <div>
                <div className="text-2xl font-medium text-neutral-800 mb-1">{weeklyStats.totalActiveMinutes}min</div>
                <div className="text-sm text-neutral-600">Active time</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Charts and Details */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-neutral-100">
            <TabsTrigger value="activity" className="data-[state=active]:bg-white">Activity</TabsTrigger>
            <TabsTrigger value="achievements" className="data-[state=active]:bg-white">Goals</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="space-y-6 pb-24">
            <Card className="border-0 shadow-subtle bg-white">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Weekly Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="font-medium text-neutral-900 mb-2">Start Tracking Your Progress</h3>
                  <p className="text-sm text-neutral-600 mb-4">
                    Complete workouts and log meals to see your progress here.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => onNavigate("workout-plan")}
                    className="bg-primary hover:bg-primary/90"
                  >
                    Start First Workout
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="border-0 shadow-subtle bg-white">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-medium text-accent-green mb-1">0</div>
                  <div className="text-sm text-neutral-600 mb-2">Workouts done</div>
                  <div className="text-xs text-neutral-500">Get started!</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-subtle bg-white">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-medium text-accent-blue mb-1">0</div>
                  <div className="text-sm text-neutral-600">Meals tracked</div>
                  <div className="text-xs text-neutral-500">Coming soon</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="achievements" className="space-y-4 pb-24">
            <div className="grid gap-4">
              {achievements.map((achievement) => (
                <Card
                  key={achievement.id}
                  className={`border-0 shadow-subtle transition-all duration-200 ${
                    achievement.earned
                      ? 'bg-gradient-to-r from-yellow-50 to-orange-50'
                      : 'bg-white'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        achievement.earned ? 'bg-yellow-100' : 'bg-neutral-100'
                      }`}>
                        <Award className={`w-6 h-6 ${
                          achievement.earned ? 'text-yellow-600' : 'text-neutral-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-neutral-900">{achievement.title}</h3>
                          {achievement.earned && (
                            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                              Earned
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mb-3">{achievement.description}</p>
                        <div className="flex items-center space-x-3">
                          <ProgressBar
                            value={achievement.progress}
                            className="flex-1 h-2 bg-neutral-100"
                          />
                          <span className="text-xs text-neutral-500">{achievement.progress}%</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("meal-plan")}
          >
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
          <button className="flex flex-col items-center justify-center text-primary">
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