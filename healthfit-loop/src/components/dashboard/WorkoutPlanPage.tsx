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
  Timer as TimerIcon,
  ChartLineUp,
  ForkKnife,
  Barbell,
  UserCircle,
  Plus,
  X,
  Calendar,
  PencilSimple,
  Trash
} from "@phosphor-icons/react";

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
    const dayDisplayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Single letters for mobile
    const todayIndex = today.getDay();

    const orderedDays = [];
    for (let i = 0; i < 7; i++) { // 7-day workout plan
      const dayIndex = (todayIndex + i) % 7;
      orderedDays.push({
        id: dayNames[dayIndex],
        name: dayDisplayNames[dayIndex],
        fullName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex], // Keep short names too
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
  const [completedExercises, setCompletedExercises] = useState<Record<string, Set<string>>>({});
  const [workoutData, setWorkoutData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [loggedWorkouts, setLoggedWorkouts] = useState<any[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<string>('');
  const [workoutDetails, setWorkoutDetails] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Get available workout days from the actual data or fallback to dynamic days
  const getDays = () => {
    if (workoutData && workoutData.workoutPlan && workoutData.workoutPlan.planData && workoutData.workoutPlan.planData.weeklyPlan) {
      // Map workout data to our dynamic day structure
      const dynamicDays = getDaysStartingFromToday();
      return dynamicDays.map((dayInfo) => {
        const workoutDay = workoutData.workoutPlan.planData.weeklyPlan.find((wd: any) => wd.day === dayInfo.id);
        const focusText = workoutDay ? (workoutDay.restDay ? "Rest" : workoutDay.focus) : "No workout";
        // Shorten focus text for navigation
        const shortFocus = focusText.length > 10 ?
          focusText.split(' ')[0] + (focusText.includes('Day') ? '' : '') :
          focusText;

        return {
          id: dayInfo.id,
          name: dayInfo.name,
          fullName: dayInfo.fullName,
          focus: shortFocus,
          fullFocus: focusText
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

    // Load persisted completed exercises from localStorage
    const savedCompletedExercises = localStorage.getItem('completedExercises');
    console.log('WorkoutPlanPage useEffect - Loading from localStorage:', savedCompletedExercises);
    if (savedCompletedExercises) {
      try {
        const parsed = JSON.parse(savedCompletedExercises);
        console.log('WorkoutPlanPage useEffect - Parsed completedExercises:', parsed);
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

    // Listen for localStorage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'completedExercises' && e.newValue) {
        console.log('WorkoutPlanPage - localStorage changed in another tab:', e.newValue);
        try {
          const parsed = JSON.parse(e.newValue);
          const restoredState: Record<string, Set<string>> = {};
          Object.keys(parsed).forEach(day => {
            restoredState[day] = new Set(parsed[day]);
          });
          setCompletedExercises(restoredState);
        } catch (error) {
          console.error('Error parsing completed exercises from storage event:', error);
        }
      }
    };

    // Listen for custom events from same tab (dashboard)
    const handleCompletedExercisesUpdate = (e: CustomEvent) => {
      console.log('WorkoutPlanPage - received completedExercisesUpdate event:', e.detail);
      setCompletedExercises(e.detail);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('completedExercisesUpdate', handleCompletedExercisesUpdate as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('completedExercisesUpdate', handleCompletedExercisesUpdate as EventListener);
    };
  }, [generationStatus.workoutsGenerated]);

  // Save completed exercises to localStorage whenever it changes
  useEffect(() => {
    console.log('WorkoutPlanPage - Saving to localStorage:', completedExercises);
    // Convert Sets to arrays for localStorage (JSON.stringify can't handle Sets)
    const serializable: Record<string, string[]> = {};
    Object.keys(completedExercises).forEach(day => {
      serializable[day] = Array.from(completedExercises[day]);
    });
    localStorage.setItem('completedExercises', JSON.stringify(serializable));
    console.log('WorkoutPlanPage - Saved to localStorage, checking:', localStorage.getItem('completedExercises'));

    // Dispatch custom event to notify other components in the same tab (like dashboard)
    const event = new CustomEvent('completedExercisesUpdate', { detail: completedExercises });
    window.dispatchEvent(event);
  }, [completedExercises]);

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
    setCompletedExercises(prev => {
      const dayCompleted = prev[selectedDay] || new Set();
      const newDayCompleted = new Set(dayCompleted);

      if (newDayCompleted.has(exerciseId)) {
        newDayCompleted.delete(exerciseId);
      } else {
        newDayCompleted.add(exerciseId);
      }

      return {
        ...prev,
        [selectedDay]: newDayCompleted
      };
    });
  };

  const activities = [
    { id: 'class', label: 'Class', caloriesPerMin: 8 },
    { id: 'run', label: 'Run', caloriesPerMin: 12 },
    { id: 'swim', label: 'Swim', caloriesPerMin: 10 },
    { id: 'bike', label: 'Bike', caloriesPerMin: 9 },
    { id: 'yoga', label: 'Yoga', caloriesPerMin: 3 },
    { id: 'other', label: 'Other', caloriesPerMin: 6 }
  ];

  const analyzeWorkoutWithLLM = async (activity: string, details: string): Promise<{calories: number, tips: string}> => {
    try {
      const response = await fetch('/api/ai/analyze-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity, details })
      });

      if (response.ok) {
        const data = await response.json();
        return { calories: data.calories, tips: data.tips };
      }
    } catch (error) {
      console.error('LLM workout analysis failed:', error);
    }

    // Fallback to simple estimation
    const selectedActivityData = activities.find(a => a.id === activity);
    const baseRate = selectedActivityData?.caloriesPerMin || 6;
    const estimatedCalories = Math.round(30 * baseRate); // 30min default

    return {
      calories: estimatedCalories,
      tips: `Great ${activity} workout! Keep up the consistent effort to reach your fitness goals.`
    };
  };

  const [workoutTips, setWorkoutTips] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const logWorkout = async () => {
    if (!selectedActivity || !workoutDetails.trim()) return;

    setIsAnalyzing(true);

    // Use LLM to analyze the workout
    const analysis = await analyzeWorkoutWithLLM(selectedActivity, workoutDetails);

    const newWorkout = {
      id: Date.now().toString(),
      activity: selectedActivity,
      activityLabel: activities.find(a => a.id === selectedActivity)?.label || 'Other',
      details: workoutDetails,
      calories: analysis.calories,
      tips: analysis.tips,
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setLoggedWorkouts(prev => [newWorkout, ...prev]);
    setWorkoutTips(analysis.tips);
    setShowLogModal(false);
    setSelectedActivity('');
    setWorkoutDetails('');
    setIsAnalyzing(false);

    // Show success message with tips
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 5000);
  };

  const deleteWorkout = (workoutId: string) => {
    setLoggedWorkouts(prev => prev.filter(w => w.id !== workoutId));
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
          focus: workoutDay.restDay ? "Rest Day" : workoutDay.focus,
          duration: parseInt(workoutDay.estimatedTime),
          calories: workoutDay.restDay ? 0 : workoutDay.estimatedCalories,
          exercises: workoutDay.exercises || [],
          restDay: workoutDay.restDay,
          description: workoutDay.description
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
      description: "Please generate your workout plan to see exercises here."
    };
  };

  const currentWorkout = getCurrentWorkout();

  // Get completion for current day only
  const currentDayCompleted = completedExercises[selectedDay] || new Set();
  const completionPercentage = currentWorkout.exercises.length > 0
    ? (currentDayCompleted.size / currentWorkout.exercises.length) * 100
    : 0;

  const ExerciseCard = ({ exercise }: { exercise: any }) => {
    const exerciseId = exercise.name; // Use name as ID since no id field
    const isCompleted = currentDayCompleted.has(exerciseId);

    return (
      <div className={`flex items-start space-x-4 p-4 bg-white border rounded-lg hover:shadow-sm transition-shadow ${
        isCompleted ? 'border-green-200 bg-green-50' : 'border-gray-200'
      }`}>
        {/* Exercise Image - Left aligned */}
        <div className="flex-shrink-0">
          <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
            {exercise.imageUrl ? (
              <ImageWithFallback
                src={exercise.imageUrl}
                alt={exercise.name}
                className="w-16 h-16 object-cover rounded-lg"
                fallback={<Barbell className="w-6 h-6 text-gray-500" weight="regular" />}
              />
            ) : (
              <Barbell className="w-6 h-6 text-gray-500" weight="regular" />
            )}
          </div>
        </div>

        {/* Content - Right side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="font-semibold text-black text-sm leading-tight">
                {exercise.name}
              </h3>
              <div className="flex flex-wrap gap-1 mt-1">
                {(exercise.muscleTargets || []).slice(0, 2).map((muscle: string) => (
                  <Badge key={muscle} variant="secondary" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    {muscle}
                  </Badge>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              variant={isCompleted ? "default" : "outline"}
              onClick={() => toggleExerciseComplete(exerciseId)}
              className={`text-xs px-3 py-1 h-7 ml-2 flex-shrink-0 ${
                isCompleted
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "border-purple-300 text-purple-700 hover:bg-purple-50"
              }`}
            >
              {isCompleted ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
            </Button>
          </div>

          {/* Exercise Details */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2 sm:grid sm:grid-cols-3 sm:gap-2">
            <div className="flex items-center">
              <span className="font-bold text-purple-600">{exercise.sets} sets</span>
            </div>
            <div className="flex items-center">
              <span className="font-bold text-purple-600">{exercise.reps} reps</span>
            </div>
            <div className="flex items-center">
              <TimerIcon className="w-3 h-3 mr-1 text-purple-600" weight="regular" />
              <span className="font-bold text-purple-600">{exercise.restTime} rest</span>
            </div>
          </div>

          {exercise.description && (
            <p className="text-xs text-gray-600 mb-2 leading-relaxed">{exercise.description}</p>
          )}

          {exercise.instructions && (
            <p className="text-xs text-gray-500 leading-relaxed">{exercise.instructions}</p>
          )}
        </div>
      </div>
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

  const WorkoutLogModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-black">Log Alternative Workout</h2>
              <p className="text-gray-600 text-sm mt-1">What did you do?</p>
            </div>
            <button
              onClick={() => setShowLogModal(false)}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Activity Selector */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Activity Type</p>
            <div className="grid grid-cols-3 gap-2">
              {activities.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => setSelectedActivity(activity.id)}
                  className={`p-3 rounded-full text-sm font-medium transition-all ${
                    selectedActivity === activity.id
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {activity.label}
                </button>
              ))}
            </div>
          </div>

          {/* Details Field */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Details</p>
            <textarea
              value={workoutDetails}
              onChange={(e) => setWorkoutDetails(e.target.value)}
              placeholder="Duration, intensity, notes... (e.g., '45 min high intensity spin class')"
              className="w-full p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={4}
            />
          </div>

          {/* Action Button */}
          <Button
            onClick={logWorkout}
            disabled={!selectedActivity || !workoutDetails.trim() || isAnalyzing}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Analyzing workout...</span>
              </div>
            ) : (
              'Log Workout'
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  const RestDay = ({ description }: { description: string }) => (
    <Card className="mb-6 border-0 shadow-subtle bg-gradient-to-br from-green-50 to-blue-50">
      <CardContent className="p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <UserCircle className="w-8 h-8 text-green-600" weight="regular" />
        </div>
        <h3 className="text-xl font-medium text-neutral-900 mb-3">Rest & Recovery Day</h3>
        <p className="text-neutral-600 mb-6">{description}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-green-600 mb-1">Hydration</div>
            <div className="text-neutral-600">Drink plenty of water throughout the day</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-blue-600 mb-1">Recovery</div>
            <div className="text-neutral-600">Light stretching or yoga</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-purple-600 mb-1">Nutrition</div>
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
        <div className="bg-white border-b border-neutral-200 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("dashboard")}
                className="mr-2 sm:mr-3 text-neutral-600 p-1 sm:p-2"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl font-medium text-neutral-900">Workouts</h1>
                <p className="text-xs sm:text-sm text-neutral-600">Your training schedule</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <Card className="border-0 shadow-subtle bg-white">
            <CardContent className="p-6 sm:p-8">
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
            <button className="flex flex-col items-center justify-center text-primary">
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
              <UserCircle className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while fetching data
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-2">
            <div
              className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            ></div>
            <div
              className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            ></div>
            <div
              className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            ></div>
          </div>
          <p className="text-sm text-gray-500 animate-pulse">Loading workout plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("dashboard")}
              className="mr-2 sm:mr-3 text-neutral-600 p-1 sm:p-2"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-medium text-neutral-900">Workouts</h1>
              <p className="text-xs sm:text-sm text-neutral-600">Your training schedule</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-primary border-primary hover:bg-primary/5 text-xs sm:text-sm px-2 sm:px-4"
          >
            <span className="hidden sm:inline">Start Workout</span>
            <span className="sm:hidden">Start</span>
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Week Navigation */}
        <div className="mb-6">
          <div className="flex justify-center space-x-1 overflow-x-auto pb-2 px-2">
            {days.map((day) => (
              <Button
                key={day.id}
                variant={selectedDay === day.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log('Workout day clicked:', day.id, 'Current selectedDay:', selectedDay);
                  setSelectedDay(day.id);
                }}
                className={`min-w-12 sm:min-w-16 flex flex-col p-2 h-auto transition-all duration-200 flex-shrink-0 ${
                  selectedDay === day.id
                    ? "bg-red-600 text-white shadow-lg"
                    : "border-neutral-200 hover:border-red-300 hover:bg-red-50 bg-white"
                }`}
              >
                <span className="font-medium text-xs sm:text-sm">
                  <span className="sm:hidden">{day.name}</span>
                  <span className="hidden sm:inline">{day.fullName}</span>
                </span>
                <span className="text-xs opacity-70 truncate max-w-full">{day.focus}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Daily Overview - Compact */}
        <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base font-semibold capitalize text-black">
              {days.find(d => d.id === selectedDay)?.fullFocus || selectedDay}
            </span>
            <div className="flex items-center space-x-3 text-sm text-gray-600">
              <span>{currentWorkout.exercises.length} exercises</span>
              <span className="text-purple-600 font-medium">{currentWorkout.duration}min</span>
            </div>
          </div>

          {/* Progress if any exercises completed */}
          {currentDayCompleted.size > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span className="text-green-600 font-medium">
                Progress: {currentDayCompleted.size}/{currentWorkout.exercises.length} completed
              </span>
              <span className="text-orange-600 font-medium">
                ~{currentWorkout.calories} calories
              </span>
            </div>
          )}
        </div>

        {/* Workout Focus */}
        <div className="mb-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between p-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3">
                {currentWorkout.focus}
              </h3>
            </div>
            <Badge className="bg-purple-600 text-white ml-3">
              {currentWorkout.restDay ? "Rest" : "Active"}
            </Badge>
          </div>

          {currentWorkout.description && (
            <div className="px-4 pb-3">
              <details className="group">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center">
                  <span className="mr-2">Workout Details</span>
                  <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </summary>
                <div className="mt-3 ml-4">
                  <p className="text-sm text-gray-600 leading-relaxed">{currentWorkout.description}</p>
                </div>
              </details>
            </div>
          )}

          {currentDayCompleted.size > 0 && !currentWorkout.restDay && (
            <div className="px-4 pb-4">
              <Progress value={completionPercentage} className="h-2 bg-gray-100" />
            </div>
          )}
        </div>

        {/* Logged Workouts History */}
        {loggedWorkouts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3">
                Recent Workouts
              </h3>
            </div>
            <div className="space-y-3">
              {loggedWorkouts.map((workout) => (
                <div key={workout.id} className="flex items-start space-x-4 p-4 bg-white border rounded-lg">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-purple-600 font-semibold text-xs">
                        {workout.activityLabel.slice(0, 3).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h4 className="font-medium text-black text-sm">{workout.activityLabel}</h4>
                        <div className="flex items-center text-xs text-gray-500 mt-1">
                          <Calendar className="w-3 h-3 mr-1" />
                          <span>{workout.date} at {workout.time}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-2">
                        <span className="text-orange-600 font-medium text-sm">
                          ~{workout.calories} cal
                        </span>
                        <button
                          onClick={() => deleteWorkout(workout.id)}
                          className="p-1 hover:bg-red-100 rounded text-red-500"
                        >
                          <Trash className="w-4 h-4" weight="regular" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                      {workout.details}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exercises or Rest Day */}
        <div className="space-y-6 pb-20 sm:pb-24">
          {currentWorkout.restDay ? (
            <RestDay description={currentWorkout.description} />
          ) : (
            <>
              {currentWorkout.exercises.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3 mb-3">
                    Today's Exercises
                  </h3>
                  {currentWorkout.exercises.map((exercise: any) => (
                    <ExerciseCard key={exercise.id || exercise.name} exercise={exercise} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
                  <p className="text-gray-600 text-lg font-medium">No workout data available for {selectedDay}</p>
                  <p className="text-sm text-gray-500 mt-2">Exercise recommendations will appear here once generated</p>
                </div>
              )}
            </>
          )}

          {/* Log Workout Button */}
          <div className="mt-6">
            <Button
              onClick={() => setShowLogModal(true)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 flex items-center justify-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Log Alternative Workout</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {showSuccessMessage && (
        <div className="fixed top-4 left-4 right-4 z-50">
          <div className="bg-green-500 text-white p-4 rounded-lg shadow-lg mx-auto max-w-md">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Workout Logged Successfully!</p>
                <p className="text-xs opacity-90 mt-1">
                  {workoutTips || 'Great job staying active! Your estimated calorie burn has been added to your daily totals.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workout Log Modal */}
      {showLogModal && <WorkoutLogModal />}

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
            <ForkKnife className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Meals</span>
          </button>
          <button className="flex flex-col items-center justify-center text-primary">
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
            <UserCircle className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}