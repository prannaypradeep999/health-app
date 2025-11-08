'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  ArrowLeft,
  Clock,
  Target,
  Play,
  CheckCircle,
  Timer,
  TrendingUp,
  Apple,
  Dumbbell,
  User
} from "lucide-react";

interface WorkoutPlanPageProps {
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
  };
}

export function WorkoutPlanPage({ onNavigate, generationStatus }: WorkoutPlanPageProps) {
  // Generate dynamic days starting from today
  const getDaysStartingFromToday = () => {
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayDisplayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = today.getDay();

    const orderedDays = [];
    for (let i = 0; i < 7; i++) { // 7-day workout plan
      const dayIndex = (todayIndex + i) % 7;
      orderedDays.push({
        id: dayNames[dayIndex],
        name: dayDisplayNames[dayIndex],
        focus: "Loading..." // Will be updated with real data
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
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());
  const [workoutData, setWorkoutData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Get available workout days from the actual data or fallback to dynamic days
  const getDays = () => {
    if (workoutData && workoutData.workoutPlan && workoutData.workoutPlan.planData && workoutData.workoutPlan.planData.weeklyPlan) {
      // Map workout data to our dynamic day structure
      const dynamicDays = getDaysStartingFromToday();
      return dynamicDays.map((dayInfo) => {
        const workoutDay = workoutData.workoutPlan.planData.weeklyPlan.find((wd: any) => wd.day === dayInfo.id);
        return {
          id: dayInfo.id,
          name: dayInfo.name,
          focus: workoutDay ? (workoutDay.restDay ? "Rest Day" : (workoutDay.focus || "Workout")) : "No workout"
        };
      });
    }
    // Fallback to dynamic days starting from today
    return getDaysStartingFromToday();
  };

  const days = getDays();

  useEffect(() => {
    if (generationStatus.workoutsGenerated) {
      fetchWorkoutData();
    } else {
      setLoading(false);
    }
  }, [generationStatus.workoutsGenerated]);

  const fetchWorkoutData = async () => {
    try {
      const response = await fetch('/api/ai/workouts/current');
      if (response.ok) {
        const data = await response.json();
        setWorkoutData(data);
      }
    } catch (error) {
      console.error('Failed to fetch workout data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExerciseComplete = (exerciseId: string) => {
    const newCompleted = new Set(completedExercises);
    if (newCompleted.has(exerciseId)) {
      newCompleted.delete(exerciseId);
    } else {
      newCompleted.add(exerciseId);
    }
    setCompletedExercises(newCompleted);
  };

  // Get current workout based on selected day
  const getCurrentWorkout = () => {
    if (workoutData && workoutData.workoutPlan && workoutData.workoutPlan.planData && workoutData.workoutPlan.planData.weeklyPlan) {
      console.log('Looking for workout for day:', selectedDay, 'in data:', workoutData.workoutPlan.planData.weeklyPlan);

      const workoutDay = workoutData.workoutPlan.planData.weeklyPlan.find((day: any) => {
        console.log('Checking workout day:', day.day, 'focus:', day.focus, 'against:', selectedDay);
        return day.day === selectedDay;
      });

      if (workoutDay) {
        console.log('Found workout for day:', workoutDay);
        return {
          focus: workoutDay.restDay ? "Rest Day" : (workoutDay.focus || "Workout"),
          duration: parseInt(workoutDay.estimatedTime) || 60,
          calories: workoutDay.restDay ? 0 : 350, // No calories burned on rest days
          exercises: workoutDay.exercises || [],
          restDay: workoutDay.restDay || false,
          description: workoutDay.description || ""
        };
      }
    }

    // No real workout data available
    console.log('No real workout data found - showing empty state');
    return {
      focus: "No workout data available",
      duration: 0,
      calories: 0,
      exercises: [],
      restDay: false,
      description: ""
    };
  };

  const currentWorkout = getCurrentWorkout();

  const completionPercentage = (completedExercises.size / currentWorkout.exercises.length) * 100;

  const ExerciseCard = ({ exercise }: { exercise: any }) => {
    const exerciseId = exercise.name; // Use name as ID since no id field
    const isCompleted = completedExercises.has(exerciseId);

    return (
      <Card className={`mb-4 border-0 shadow-subtle transition-all duration-200 hover:shadow-medium ${
        isCompleted ? 'bg-accent-green/5 border-l-4 border-l-accent-green' : 'bg-white'
      }`}>
        <CardContent className="p-4">
          <div className="flex space-x-4">
            <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
              {exercise.imageUrl ? (
                <ImageWithFallback
                  src={exercise.imageUrl}
                  alt={exercise.name}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover rounded-lg"
                  fallback={<Dumbbell className="w-8 h-8 text-gray-500" />}
                />
              ) : (
                <Dumbbell className="w-8 h-8 text-gray-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-neutral-900">{exercise.name}</h3>
                <Button
                  variant={isCompleted ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleExerciseComplete(exerciseId)}
                  className={isCompleted ? "bg-accent-green hover:bg-accent-green/90 text-white" : "border-neutral-200"}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {(exercise.muscleTargets || []).map((muscle: string) => (
                  <Badge key={muscle} variant="secondary" className="text-xs bg-neutral-100 text-neutral-700">
                    {muscle}
                  </Badge>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm text-neutral-600 mb-2">
                <div>
                  <span className="font-medium">{exercise.sets}</span> sets
                </div>
                <div>
                  <span className="font-medium">{exercise.reps}</span> reps
                </div>
                <div className="flex items-center">
                  <Timer className="w-3 h-3 mr-1" />
                  <span className="font-medium">{exercise.restTime}</span>
                </div>
              </div>

              {exercise.description && (
                <div className="text-sm text-accent-blue mb-1">
                  {exercise.description}
                </div>
              )}

              {exercise.instructions && (
                <p className="text-xs text-neutral-500 mt-2">{exercise.instructions}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const LoadingState = () => (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h3 className="text-xl font-medium text-neutral-900 mb-2">Generating Your Workout Plan</h3>
      <p className="text-neutral-600">
        Creating personalized exercises based on your fitness goals...
      </p>
    </div>
  );

  const RestDay = ({ description }: { description: string }) => (
    <Card className="mb-6 border-0 shadow-subtle bg-gradient-to-br from-green-50 to-blue-50">
      <CardContent className="p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🧘‍♂️</span>
        </div>
        <h3 className="text-xl font-medium text-neutral-900 mb-3">Rest & Recovery Day</h3>
        <p className="text-neutral-600 mb-6">{description}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-green-600 mb-1">💧 Hydration</div>
            <div className="text-neutral-600">Drink plenty of water throughout the day</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-blue-600 mb-1">🧘 Recovery</div>
            <div className="text-neutral-600">Light stretching or yoga</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-purple-600 mb-1">🍎 Nutrition</div>
            <div className="text-neutral-600">Focus on protein and nutrients</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!generationStatus.workoutsGenerated) {
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
                <h1 className="text-2xl font-medium text-neutral-900">Workouts</h1>
                <p className="text-sm text-neutral-600">Your training schedule</p>
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
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("meal-plan")}
            >
              <Apple className="w-5 h-5 mb-1" />
              <span className="text-xs">Meals</span>
            </button>
            <button className="flex flex-col items-center justify-center text-primary">
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
              <h1 className="text-2xl font-medium text-neutral-900">Workouts</h1>
              <p className="text-sm text-neutral-600">Your training schedule</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-primary border-primary hover:bg-primary/5"
          >
            Start Workout
          </Button>
        </div>
      </div>

      <div className="p-6">
        {/* Week Navigation */}
        <div className="mb-6">
          <div className="flex justify-center space-x-2 overflow-x-auto pb-2">
            {days.map((day) => (
              <Button
                key={day.id}
                variant={selectedDay === day.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log('Workout day clicked:', day.id, 'Current selectedDay:', selectedDay);
                  setSelectedDay(day.id);
                }}
                className={`min-w-20 flex flex-col p-3 h-auto transition-all duration-200 ${
                  selectedDay === day.id
                    ? "bg-red-600 text-white shadow-lg"
                    : "border-neutral-200 hover:border-red-300 hover:bg-red-50 bg-white"
                }`}
              >
                <span className="font-medium">{day.name}</span>
                <span className="text-xs opacity-70">{day.focus}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Workout Overview */}
        <Card className="mb-6 border-0 shadow-subtle bg-white">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg font-medium">{currentWorkout.focus}</span>
              <Badge className="bg-accent-blue text-white">
                Intermediate
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <div>
                <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-5 h-5 text-accent-blue" />
                </div>
                <div className="text-lg font-medium text-accent-blue">
                  {currentWorkout.duration}min
                </div>
                <div className="text-sm text-neutral-600">Duration</div>
              </div>
              <div>
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <span className="text-orange-600 text-lg">🔥</span>
                </div>
                <div className="text-lg font-medium text-orange-600">
                  {currentWorkout.calories}
                </div>
                <div className="text-sm text-neutral-600">Calories</div>
              </div>
              <div>
                <div className="w-10 h-10 bg-accent-green/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Target className="w-5 h-5 text-accent-green" />
                </div>
                <div className="text-lg font-medium text-accent-green">
                  {currentWorkout.exercises.length}
                </div>
                <div className="text-sm text-neutral-600">Exercises</div>
              </div>
            </div>

            {completedExercises.size > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-600">Progress</span>
                  <span className="text-sm font-medium text-accent-green">
                    {completedExercises.size}/{currentWorkout.exercises.length} completed
                  </span>
                </div>
                <Progress value={completionPercentage} className="h-2 bg-neutral-100" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exercises or Rest Day */}
        <div className="space-y-4 pb-24">
          {currentWorkout.restDay ? (
            <RestDay description={currentWorkout.description} />
          ) : (
            <>
              <h2 className="text-xl font-medium text-neutral-900">Today's Exercises</h2>
              {currentWorkout.exercises.length > 0 ? (
                currentWorkout.exercises.map((exercise: any) => (
                  <ExerciseCard key={exercise.id || exercise.name} exercise={exercise} />
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-neutral-600">No workout data available for {selectedDay}</p>
                  <p className="text-sm text-neutral-500 mt-2">Real workout data will appear here once generated</p>
                </div>
              )}
            </>
          )}
        </div>
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
          <button className="flex flex-col items-center justify-center text-primary">
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