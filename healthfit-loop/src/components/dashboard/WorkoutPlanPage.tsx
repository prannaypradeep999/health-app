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
import Logo from '@/components/logo';
import { getPlanDayIndex, getCurrentMealPeriod, getPlanDays, getDayStatus, isPlanExpired, getBrowserTimezone } from '@/lib/utils/date-utils';

interface WorkoutPlanPageProps {
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
  };
}

export function WorkoutPlanPage({ onNavigate, generationStatus }: WorkoutPlanPageProps) {
  const [selectedDay, setSelectedDay] = useState('');
  const [completedExercises, setCompletedExercises] = useState<Record<string, Set<string>>>({});
  const [workoutData, setWorkoutData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [loggedWorkouts, setLoggedWorkouts] = useState<any[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<string>('');
  const [workoutDetails, setWorkoutDetails] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const [userTimezone] = useState(() => getBrowserTimezone());
  const planStartDate = workoutData?.workoutPlan?.startDate || workoutData?.workoutPlan?.generatedAt;
  const currentDayIndex = planStartDate ? getPlanDayIndex(planStartDate, userTimezone) : 0;
  const planExpired = planStartDate ? isPlanExpired(planStartDate, userTimezone) : false;
  const days = planStartDate ? getPlanDays(planStartDate) : [];

  // Extract workout plan IDs for database persistence
  const surveyId = workoutData?.workoutPlan?.surveyId;
  const workoutPlanId = workoutData?.workoutPlan?.id;
  const weekNumber = workoutData?.workoutPlan?.weekNumber || 1;

  // Get available workout days from the actual data
  const getDaysWithWorkoutData = () => {
    if (workoutData && workoutData.workoutPlan && workoutData.workoutPlan.planData && workoutData.workoutPlan.planData.weeklyPlan) {
      return days.map((dayInfo) => {
        const workoutDay = workoutData.workoutPlan.planData.weeklyPlan.find((wd: any) => wd.day === dayInfo.id);
        const focusText = workoutDay ? (workoutDay.restDay ? "Rest" : workoutDay.focus) : "No workout";
        // Shorten focus text for navigation
        const shortFocus = focusText.length > 10 ?
          focusText.split(' ')[0] + (focusText.includes('Day') ? '' : '') :
          focusText;

        return {
          ...dayInfo,
          focus: shortFocus,
          fullFocus: focusText
        };
      });
    }
    return days;
  };

  const daysWithWorkoutData = getDaysWithWorkoutData();

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

  // Auto-select current day when workout data loads
  useEffect(() => {
    if (planStartDate && days.length > 0 && !selectedDay) {
      const currentDayIndex = getPlanDayIndex(planStartDate, userTimezone);

      // If plan is not expired and current day is valid, select it
      if (!planExpired && currentDayIndex >= 0 && currentDayIndex < days.length) {
        setSelectedDay(days[currentDayIndex].id);
        console.log(`[WorkoutPlan] Auto-selected current day: ${days[currentDayIndex].id} (day ${currentDayIndex + 1})`);
      } else {
        // Fallback to first day for expired plans or out-of-range
        setSelectedDay(days[0].id);
        console.log(`[WorkoutPlan] Auto-selected first day: ${days[0].id}`);
      }
    }
  }, [planStartDate, days, userTimezone, planExpired, selectedDay]);

  // Load exercise completion from database
  useEffect(() => {
    const loadWorkoutCompletion = async () => {
      if (!workoutPlanId) return;

      try {
        const response = await fetch(`/api/workouts/log-exercise?workoutPlanId=${workoutPlanId}`);
        if (response.ok) {
          const data = await response.json();

          if (data.completedByDay) {
            // Convert to Set format
            const completed: Record<string, Set<string>> = {};
            Object.entries(data.completedByDay).forEach(([day, exercises]) => {
              completed[day] = new Set(exercises as string[]);
            });

            setCompletedExercises(prev => ({ ...prev, ...completed }));
            console.log('[WORKOUT-PLAN] Loaded completion from DB');
          }
        }
      } catch (err) {
        console.error('[WORKOUT-PLAN] Failed to load completion:', err);
      }
    };

    if (workoutPlanId && workoutData) {
      loadWorkoutCompletion();
    }
  }, [workoutPlanId, workoutData]);

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

  const toggleExerciseComplete = async (exerciseId: string) => {
    const isCurrentlyCompleted = completedExercises[selectedDay]?.has(exerciseId);
    const newCompletedState = !isCurrentlyCompleted;

    // Update local state immediately
    setCompletedExercises(prev => {
      const dayExercises = new Set(prev[selectedDay] || []);
      if (newCompletedState) {
        dayExercises.add(exerciseId);
      } else {
        dayExercises.delete(exerciseId);
      }
      const newState = { ...prev, [selectedDay]: dayExercises };

      // Save to localStorage
      const serializable: Record<string, string[]> = {};
      Object.entries(newState).forEach(([day, exercises]) => {
        serializable[day] = Array.from(exercises);
      });
      localStorage.setItem('completedExercises', JSON.stringify(serializable));

      return newState;
    });

    // Get exercise details
    const todaysWorkoutData = getCurrentWorkout();
    const exercise = todaysWorkoutData?.exercises?.find((e: any) => e.name === exerciseId);

    // Save to database
    if (workoutPlanId) {
      fetch('/api/workouts/log-exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyId,
          workoutPlanId,
          weekNumber,
          day: selectedDay,
          exerciseName: exerciseId,
          focus: todaysWorkoutData?.focus || 'General',
          completed: newCompletedState,
          estimatedCalories: exercise?.calories || 0,
          duration: exercise?.duration || null
        })
      }).catch(err => console.error('[WORKOUT-LOG] API Error:', err));
    }

    // Dispatch event for dashboard
    const serializable: Record<string, string[]> = {};
    Object.entries(completedExercises).forEach(([day, exercises]) => {
      serializable[day] = Array.from(exercises);
    });
    if (newCompletedState) {
      serializable[selectedDay] = [...(serializable[selectedDay] || []), exerciseId];
    } else {
      serializable[selectedDay] = (serializable[selectedDay] || []).filter(e => e !== exerciseId);
    }
    window.dispatchEvent(new CustomEvent('completedExercisesUpdate', { detail: serializable }));
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
          description: workoutDay.description,
          warmup: workoutDay.warmup || [],
          cooldown: workoutDay.cooldown || [],
          activeRecovery: workoutDay.activeRecovery || null
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
      description: "Please generate your workout plan to see exercises here.",
      warmup: [],
      cooldown: [],
      activeRecovery: null
    };
  };

  const currentWorkout = getCurrentWorkout();

  // Get completion for current day only
  const currentDayCompleted = completedExercises[selectedDay] || new Set();
  const completionPercentage = currentWorkout.exercises.length > 0
    ? (currentDayCompleted.size / currentWorkout.exercises.length) * 100
    : 0;

  const ExerciseCard = ({ exercise }: { exercise: any }) => {
    const exerciseId = exercise.name;
    const isCompleted = currentDayCompleted.has(exerciseId);
    const [showDetails, setShowDetails] = useState(false);

    return (
      <div className={`p-4 bg-white border rounded-lg hover:shadow-sm transition-shadow ${
        isCompleted ? 'border-green-200 bg-green-50' : 'border-gray-200'
      }`}>
        {/* Main Row */}
        <div className="flex items-start space-x-4">
          {/* Exercise Image */}
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

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-black text-sm leading-tight">
                  {exercise.name}
                </h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(exercise.muscleTargets || []).slice(0, 3).map((muscle: string) => (
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

            {/* Exercise Stats Row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
              <div className="flex items-center">
                <span className="font-bold text-purple-600">{exercise.sets} sets</span>
              </div>
              <div className="flex items-center">
                <span className="font-bold text-purple-600">{exercise.reps} reps</span>
              </div>
              <div className="flex items-center">
                <TimerIcon className="w-3 h-3 mr-1 text-purple-600" weight="regular" />
                <span className="font-bold text-purple-600">{exercise.restTime}</span>
              </div>
              {exercise.tempo && (
                <div className="flex items-center">
                  <span className="text-gray-500">Tempo: </span>
                  <span className="font-bold text-purple-600 ml-1">{exercise.tempo}</span>
                </div>
              )}
            </div>

            {/* Weight Guidance - Prominent */}
            {exercise.weightGuidance && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2">
                <div className="flex items-start space-x-2">
                  <Target className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-blue-800">Weight: </span>
                    <span className="text-blue-700">{exercise.weightGuidance.suggestion}</span>
                    {exercise.weightGuidance.rpeTarget && (
                      <span className="text-blue-600 ml-2">(RPE {exercise.weightGuidance.rpeTarget}/10)</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Breathing Cue */}
            {exercise.breathingCue && (
              <p className="text-xs text-gray-600 mb-2 italic">
                💨 {exercise.breathingCue}
              </p>
            )}

            {/* Description */}
            {exercise.description && (
              <p className="text-xs text-gray-600 mb-2 leading-relaxed">{exercise.description}</p>
            )}

            {/* Expandable Details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center"
            >
              {showDetails ? 'Hide details' : 'Show form tips & modifications'}
              <svg className={`w-3 h-3 ml-1 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showDetails && (
              <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                {/* Instructions */}
                {exercise.instructions && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 mb-1">How to perform:</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">{exercise.instructions}</p>
                  </div>
                )}

                {/* Form Tips */}
                {exercise.formTips && exercise.formTips.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-green-700 mb-1">✓ Form Tips:</h4>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {exercise.formTips.map((tip: string, i: number) => (
                        <li key={i} className="flex items-start">
                          <span className="text-green-500 mr-1">•</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Common Mistakes */}
                {exercise.commonMistakes && exercise.commonMistakes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-red-700 mb-1">✗ Avoid these mistakes:</h4>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {exercise.commonMistakes.map((mistake: string, i: number) => (
                        <li key={i} className="flex items-start">
                          <span className="text-red-500 mr-1">•</span>
                          {mistake}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Modifications */}
                {exercise.modifications && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 mb-1">Modifications:</h4>
                    <div className="space-y-1 text-xs">
                      <p><span className="font-medium text-green-600">Beginner:</span> {exercise.modifications.beginner}</p>
                      <p><span className="font-medium text-blue-600">Intermediate:</span> {exercise.modifications.intermediate}</p>
                      <p><span className="font-medium text-purple-600">Advanced:</span> {exercise.modifications.advanced}</p>
                    </div>
                  </div>
                )}

                {/* Warmup Sets */}
                {exercise.weightGuidance?.warmupSets && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                    <p className="text-xs text-yellow-800">
                      <span className="font-semibold">Warmup:</span> {exercise.weightGuidance.warmupSets}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
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

  const RestDay = ({ description, activeRecovery }: { description: string; activeRecovery?: any }) => (
    <Card className="mb-6 border-0 shadow-subtle bg-gradient-to-br from-green-50 to-blue-50">
      <CardContent className="p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserCircle className="w-8 h-8 text-green-600" weight="regular" />
          </div>
          <h3 className="text-xl font-medium text-neutral-900 mb-2">Rest & Recovery Day</h3>
          <p className="text-neutral-600">{description}</p>
        </div>

        {/* Personalized Active Recovery */}
        {activeRecovery && (
          <div className="bg-white rounded-lg p-4 mb-6 border border-green-200">
            <h4 className="font-semibold text-green-800 mb-2 flex items-center">
              <span className="mr-2">🎯</span> Suggested for You
            </h4>
            <div className="mb-3">
              <p className="text-lg font-medium text-gray-900">{activeRecovery.suggestedActivity}</p>
              <p className="text-sm text-gray-600">{activeRecovery.duration}</p>
            </div>
            <p className="text-sm text-gray-600 mb-4">{activeRecovery.description}</p>

            {activeRecovery.alternatives && activeRecovery.alternatives.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Other options:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {activeRecovery.alternatives.map((alt: string, i: number) => (
                    <li key={i} className="flex items-center">
                      <span className="text-green-500 mr-2">•</span>
                      {alt}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Recovery Tips */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-green-600 mb-1">💧 Hydration</div>
            <div className="text-neutral-600">Drink plenty of water throughout the day</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-blue-600 mb-1">😴 Sleep</div>
            <div className="text-neutral-600">Aim for 7-9 hours of quality sleep</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="font-medium text-purple-600 mb-1">🥗 Nutrition</div>
            <div className="text-neutral-600">Focus on protein and nutrients for recovery</div>
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
          <div className="flex items-center">
            <Logo variant="icon" width={32} height={32} href="#" />
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Week Navigation */}
        <div className="mb-6">
          <div className="flex justify-center space-x-1 overflow-x-auto pb-2 px-2">
            {daysWithWorkoutData.map((day) => {
              const dayStatus = getDayStatus(day.dayIndex, currentDayIndex);
              const isSelected = selectedDay === day.id;

              return (
                <Button
                  key={day.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    console.log('Workout day clicked:', day.id, 'Current selectedDay:', selectedDay);
                    setSelectedDay(day.id);
                  }}
                  className={`min-w-12 sm:min-w-16 flex flex-col p-2 h-auto transition-all duration-200 flex-shrink-0 relative ${
                    isSelected
                      ? "bg-red-600 text-white shadow-lg"
                      : dayStatus === 'today'
                      ? "border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700"
                      : dayStatus === 'past'
                      ? "border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      : "border-neutral-200 hover:border-red-300 hover:bg-red-50 bg-white"
                  }`}
                >
                  <span className="font-medium text-xs sm:text-sm">
                    <span className="sm:hidden">{day.name}</span>
                    <span className="hidden sm:inline">{day.fullName}</span>
                  </span>
                  <span className="text-xs opacity-70 truncate max-w-full">{day.focus}</span>

                  {/* Today indicator */}
                  {dayStatus === 'today' && !isSelected && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                  )}

                  {/* Checkmark for past days */}
                  {dayStatus === 'past' && !isSelected && (
                    <CheckCircle className="absolute top-1 right-1 w-3 h-3 text-green-500" weight="fill" />
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Daily Overview - Compact */}
        <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col">
              <span className="text-base font-semibold text-black">
                {selectedDay && selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)}
              </span>
              <span className="text-sm text-gray-600">{daysWithWorkoutData.find(d => d.id === selectedDay)?.fullFocus || 'Workout'}</span>
            </div>
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
            <RestDay
              description={currentWorkout.description}
              activeRecovery={currentWorkout.activeRecovery}
            />
          ) : (
            <>
              {currentWorkout.exercises.length > 0 ? (
                <div className="space-y-6">
                  {/* Warmup Section */}
                  {currentWorkout.warmup && currentWorkout.warmup.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-orange-600 border-l-4 border-orange-600 pl-3">
                        Warmup (5 min)
                      </h3>
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
                        {currentWorkout.warmup.map((warmupEx: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div>
                              <span className="font-medium text-orange-800">{warmupEx.name}</span>
                              <span className="text-orange-600 ml-2">- {warmupEx.duration}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Main Exercises */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-purple-600 border-l-4 border-purple-600 pl-3">
                      Main Workout
                    </h3>
                    {currentWorkout.exercises.map((exercise: any) => (
                      <ExerciseCard key={exercise.id || exercise.name} exercise={exercise} />
                    ))}
                  </div>

                  {/* Cooldown Section */}
                  {currentWorkout.cooldown && currentWorkout.cooldown.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-blue-600 border-l-4 border-blue-600 pl-3">
                        Cooldown Stretches (5 min)
                      </h3>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                        {currentWorkout.cooldown.map((cooldownEx: any, i: number) => (
                          <div key={i} className="text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-blue-800">{cooldownEx.name}</span>
                              <span className="text-blue-600">{cooldownEx.duration}</span>
                            </div>
                            {cooldownEx.instructions && (
                              <p className="text-xs text-blue-600 mt-1">{cooldownEx.instructions}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 bg-white border-2 border-dashed border-gray-300 rounded-xl">
                  <Barbell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 text-lg font-medium">No workout planned for {selectedDay}</p>
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