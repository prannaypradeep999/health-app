'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Download, Dumbbell, Clock, Target, Play, CheckCircle, Calendar, Users, Zap, Shield, ChefHat, Sparkles, Loader2 } from 'lucide-react';
import { colors } from '../constants';

interface WorkoutPlanModalProps {
  surveyData: any;
  isGuest: boolean;
  onClose: () => void;
}

interface WorkoutDay {
  day: string;
  restDay: boolean;
  focus: string;
  estimatedTime: string;
  targetMuscles: string[];
  warmup: Array<{
    exercise: string;
    duration: string;
    purpose: string;
  }>;
  mainWorkout: Array<{
    exercise: string;
    sets?: number;
    reps?: string;
    duration?: string;
    restBetweenSets?: string;
    instructions: string;
    formCues: string[];
    modifications: {
      beginner: string;
      intermediate: string;
      advanced: string;
    };
    safetyNotes: string;
  }>;
  cooldown: Array<{
    exercise: string;
    duration: string;
    instructions: string;
  }>;
}

interface WorkoutPlan {
  weeklyPlan: WorkoutDay[];
  weeklyNotes: string;
  progressionTips: string[];
  safetyReminders: string[];
  equipmentNeeded: string[];
  estimatedCaloriesBurn: number;
}

export default function WorkoutPlanModal({ surveyData, isGuest, onClose }: WorkoutPlanModalProps) {
  const [currentDay, setCurrentDay] = useState(0);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');

  // FYTR Logo Component
  const FYTRLogo = () => (
    <div className="flex items-center space-x-3">
      <img
        src="/fytr-icon.svg"
        alt="FYTR"
        className="w-12 h-12"
      />
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          FYTR
        </h1>
        <p className="text-sm text-gray-500">Workout Planning</p>
      </div>
    </div>
  );

  // Modern Loading Animation
  const WorkoutLoadingAnimation = () => (
    <div className="flex flex-col items-center justify-center py-16">
      {/* FYTR Logo with pulse animation */}
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl border-4 border-blue-600 animate-pulse">
          <img
            src="/fytr-icon.svg"
            alt="FYTR"
            className="w-16 h-16"
          />
        </div>
        <div className="absolute -top-2 -right-2">
          <Dumbbell className="w-6 h-6 text-blue-600 animate-bounce" />
        </div>
      </div>

      {/* Loading Message */}
      <div className="text-center max-w-md">
        <h3 className="text-2xl font-semibold text-gray-900 mb-4">
          {generating ? 'Creating Your Workout Plan...' : 'Loading Your Workouts...'}
        </h3>
        <p className="text-gray-600 mb-8">
          Personalizing exercises based on your {surveyData?.goal?.toLowerCase().replace('_', ' ')} goal
        </p>

        {/* Animated Progress Dots */}
        <div className="flex justify-center space-x-2">
          <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-bounce border border-blue-600" style={{ animationDelay: '0ms' }}></div>
          <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-bounce border border-blue-600" style={{ animationDelay: '150ms' }}></div>
          <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-bounce border border-blue-600" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    generateWorkoutPlan();
  }, []);

  const generateWorkoutPlan = async () => {
    setGenerating(true);
    setLoading(true);
    
    try {
      const response = await fetch('/api/ai/workouts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRegenerate: true })
      });

      if (response.ok) {
        const data = await response.json();
        setWorkoutPlan(data.workoutPlan.plan);
      } else {
        console.error('Failed to generate workout plan');
        // Fallback to sample data
        setWorkoutPlan(sampleWorkoutPlan);
      }
    } catch (error) {
      console.error('Error generating workout plan:', error);
      setWorkoutPlan(sampleWorkoutPlan);
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Sample workout plan for fallback
  const sampleWorkoutPlan: WorkoutPlan = {
    weeklyPlan: daysOfWeek.map((day, index) => ({
      day,
      restDay: index === 2 || index === 6,
      focus: index === 2 || index === 6 ? 'Rest & Recovery' : `${['Upper Body', 'Lower Body', 'Core', 'Full Body', 'Cardio'][index % 5]} Focus`,
      estimatedTime: index === 2 || index === 6 ? '15 minutes' : '35 minutes',
      targetMuscles: index === 2 || index === 6 ? ['recovery'] : ['full body'],
      warmup: [
        { exercise: 'Light movement', duration: '5 minutes', purpose: 'Activation' },
        { exercise: 'Dynamic stretching', duration: '3 minutes', purpose: 'Preparation' }
      ],
      mainWorkout: index === 2 || index === 6 ? [
        {
          exercise: 'Gentle stretching',
          duration: '10 minutes',
          instructions: 'Focus on tight areas and breathe deeply',
          formCues: ['Move slowly', 'Never force', 'Breathe deeply'],
          modifications: {
            beginner: 'Chair stretches',
            intermediate: 'Standing stretches', 
            advanced: 'Floor stretches'
          },
          safetyNotes: 'This is recovery time - listen to your body'
        }
      ] : [
        {
          exercise: `${['Push-ups', 'Squats', 'Plank', 'Burpees', 'Mountain climbers'][index % 5]}`,
          sets: 3,
          reps: '8-12',
          restBetweenSets: '60 seconds',
          instructions: 'Maintain proper form throughout the movement',
          formCues: ['Keep core engaged', 'Control the movement', 'Full range of motion'],
          modifications: {
            beginner: 'Modified version with reduced intensity',
            intermediate: 'Standard form',
            advanced: 'Add complexity or resistance'
          },
          safetyNotes: 'Stop if form breaks down'
        }
      ],
      cooldown: [
        { exercise: 'Static stretching', duration: '5 minutes', instructions: 'Hold each stretch for 30 seconds' }
      ]
    })),
    weeklyNotes: 'Consistency is key! Start at your level and progress gradually.',
    progressionTips: [
      'Week 1-2: Focus on form and building habits',
      'Week 3-4: Gradually increase intensity',
      'Month 2+: Add complexity when ready'
    ],
    safetyReminders: [
      'Always warm up before exercising',
      'Listen to your body and rest when needed',
      'Stay hydrated throughout your workout'
    ],
    equipmentNeeded: ['None - all bodyweight exercises'],
    estimatedCaloriesBurn: 250
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full h-[96vh] sm:h-[90vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
          {/* Enhanced Header */}
          <div className="flex-shrink-0 p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex justify-between items-center">
              <FYTRLogo />
              <button
                onClick={onClose}
                className="p-3 hover:bg-gray-100 rounded-full transition-all duration-200 hover:scale-105"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <WorkoutLoadingAnimation />
          </div>
        </div>
      </div>
    );
  }

  const currentWorkout = workoutPlan?.weeklyPlan?.[currentDay];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-7xl w-full h-[96vh] sm:h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
        {/* Enhanced Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <FYTRLogo />
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">Weekly Goal</div>
                <div className="font-bold text-gray-900">{workoutPlan?.estimatedCaloriesBurn || 250} cal/session</div>
              </div>
              <button
                onClick={onClose}
                className="p-3 hover:bg-gray-100 rounded-full transition-all duration-200 hover:scale-105"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Subheader with goal info */}
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Your Personalized Plan</h3>
                <p className="text-sm text-gray-600">Optimized for {surveyData?.goal?.toLowerCase().replace('_', ' ')} goal</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden flex">
          {/* Modern Week Overview Sidebar */}
          <div className="w-80 border-r border-gray-200 bg-gray-50 p-6 overflow-y-auto">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Week Overview</h3>
            </div>
            
            {/* Week Calendar */}
            <div className="space-y-3 mb-6">
              {workoutPlan?.weeklyPlan?.map((day, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentDay(index)}
                  className={`w-full p-4 rounded-xl text-left transition-all duration-200 ${
                    currentDay === index
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg transform scale-[1.02] border-transparent'
                      : 'bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm capitalize">{day.day}</div>
                      <div className={`text-xs mt-1 ${currentDay === index ? 'text-white/80' : 'text-gray-500'}`}>
                        {day.restDay ? (
                          <span className="flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Rest & Recovery
                          </span>
                        ) : (
                          <span className="flex items-center">
                            <Dumbbell className="w-3 h-3 mr-1" />
                            {day.estimatedTime}
                          </span>
                        )}
                      </div>
                      <div className={`text-xs mt-1 font-medium ${currentDay === index ? 'text-white/90' : 'text-gray-600'}`}>
                        {day.focus}
                      </div>
                    </div>
                    {!day.restDay && (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        currentDay === index ? 'bg-white/20' : 'bg-gray-100'
                      }`}>
                        <Play className={`w-4 h-4 ${currentDay === index ? 'text-white' : 'text-gray-600'}`} />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-3 text-sm">Weekly Summary</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center text-gray-600">
                    <Calendar className="w-4 h-4 mr-2 text-indigo-600" />
                    Active Days
                  </span>
                  <span className="font-semibold text-gray-900">{workoutPlan?.weeklyPlan?.filter(d => !d.restDay).length || 5}/7</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center">
                  <Zap className="w-4 h-4 mr-2" style={{ color: colors.accentRed }} />
                  Weekly Burn
                </span>
                <span className="font-semibold">{((workoutPlan?.estimatedCaloriesBurn || 250) * (workoutPlan?.weeklyPlan?.filter(d => !d.restDay).length || 5)).toLocaleString()} cal</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center">
                  <Users className="w-4 h-4 mr-2" style={{ color: colors.deepBlue }} />
                  Equipment
                </span>
                <span className="font-semibold text-xs">Bodyweight</span>
              </div>
            </div>
          </div>

          {/* Main Workout Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {currentWorkout && (
              <div className="max-w-4xl">
                {/* Day Header */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-2xl font-bold capitalize" style={{ color: colors.nearBlack }}>
                        {currentWorkout.day}
                        {currentWorkout.restDay && <span className="text-lg font-normal ml-2">(Rest Day)</span>}
                      </h4>
                      <p className="text-lg mt-1" style={{ color: colors.mediumGray }}>
                        {currentWorkout.focus}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center space-x-4 text-sm" style={{ color: colors.mediumGray }}>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{currentWorkout.estimatedTime}</span>
                        </div>
                        {!currentWorkout.restDay && (
                          <div className="flex items-center space-x-1">
                            <Target className="w-4 h-4" />
                            <span>{currentWorkout.targetMuscles.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Difficulty Selector */}
                  {!currentWorkout.restDay && (
                    <div className="flex items-center space-x-3 mb-6">
                      <span className="text-sm font-medium" style={{ color: colors.darkGray }}>Difficulty:</span>
                      {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                        <button
                          key={level}
                          onClick={() => setSelectedDifficulty(level)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            selectedDifficulty === level 
                              ? 'text-white shadow-md' 
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                          style={{ 
                            backgroundColor: selectedDifficulty === level ? colors.deepBlue : colors.offWhite 
                          }}
                        >
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Workout Sections */}
                <div className="space-y-6">
                  {/* Warmup */}
                  {currentWorkout.warmup && currentWorkout.warmup.length > 0 && (
                    <div className="bg-orange-50 rounded-xl p-6 border border-orange-200">
                      <h5 className="font-semibold text-orange-800 mb-4 flex items-center">
                        <Zap className="w-5 h-5 mr-2" />
                        Warm-up
                      </h5>
                      <div className="grid md:grid-cols-2 gap-4">
                        {currentWorkout.warmup.map((exercise, index) => (
                          <div key={index} className="bg-white p-4 rounded-lg border border-orange-100">
                            <div className="font-medium text-gray-800">{exercise.exercise}</div>
                            <div className="text-sm text-orange-600 mt-1">{exercise.duration}</div>
                            <div className="text-xs text-gray-600 mt-2">{exercise.purpose}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Main Workout */}
                  {currentWorkout.mainWorkout && currentWorkout.mainWorkout.length > 0 ? (
                    <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                      <h5 className="font-semibold text-blue-800 mb-4 flex items-center">
                        <Dumbbell className="w-5 h-5 mr-2" />
                        Main Workout
                      </h5>
                      <div className="space-y-4">
                        {currentWorkout.mainWorkout.map((exercise, index) => (
                        <div key={index} className="bg-white p-6 rounded-lg border border-blue-100">
                          <div className="flex justify-between items-start mb-3">
                            <h6 className="font-semibold text-lg text-gray-800">{exercise.exercise}</h6>
                            <div className="text-right text-sm text-gray-600">
                              {exercise.sets && <div>{exercise.sets} sets</div>}
                              {exercise.reps && <div>{exercise.reps} reps</div>}
                              {exercise.duration && <div>{exercise.duration}</div>}
                              {exercise.restBetweenSets && (
                                <div className="text-xs text-blue-600 mt-1">Rest: {exercise.restBetweenSets}</div>
                              )}
                            </div>
                          </div>
                          
                          <p className="text-gray-700 mb-3">{exercise.instructions}</p>
                          
                          {/* Form Cues */}
                          <div className="mb-3">
                            <div className="font-medium text-sm text-gray-700 mb-2">Form Cues:</div>
                            <ul className="text-sm text-gray-600 space-y-1">
                              {exercise.formCues.map((cue, cueIndex) => (
                                <li key={cueIndex} className="flex items-center">
                                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2"></div>
                                  {cue}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Difficulty Modification */}
                          <div className="bg-gray-50 p-3 rounded-lg mb-3">
                            <div className="font-medium text-sm text-gray-700 mb-1">
                              {selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)} Version:
                            </div>
                            <p className="text-sm text-gray-600">
                              {exercise.modifications[selectedDifficulty]}
                            </p>
                          </div>

                          {/* Safety Notes */}
                          <div className="flex items-start bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                            <Shield className="w-4 h-4 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-yellow-800">{exercise.safetyNotes}</p>
                          </div>
                        </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // Rest Day Activities
                    currentWorkout.restDay && (
                      <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
                        <h5 className="font-semibold text-purple-800 mb-4 flex items-center">
                          <CheckCircle className="w-5 h-5 mr-2" />
                          Rest Day Activities
                        </h5>
                        <div className="space-y-3">
                          {currentWorkout.restDayActivities && currentWorkout.restDayActivities.map((activity, index) => (
                            <div key={index} className="bg-white p-4 rounded-lg border border-purple-100">
                              <div className="text-gray-800 flex items-start">
                                <div className="w-2 h-2 bg-purple-400 rounded-full mr-3 mt-2 flex-shrink-0"></div>
                                {activity}
                              </div>
                            </div>
                          ))}
                          {currentWorkout.preparationTips && (
                            <div className="mt-4">
                              <h6 className="font-medium text-purple-800 mb-2">Preparation Tips:</h6>
                              {currentWorkout.preparationTips.map((tip, index) => (
                                <div key={index} className="text-sm text-purple-700 flex items-start mb-1">
                                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mr-2 mt-2 flex-shrink-0"></div>
                                  {tip}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}

                  {/* Cooldown */}
                  {currentWorkout.cooldown && currentWorkout.cooldown.length > 0 && (
                    <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                      <h5 className="font-semibold text-green-800 mb-4 flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Cool-down
                      </h5>
                      <div className="grid md:grid-cols-2 gap-4">
                        {currentWorkout.cooldown.map((exercise, index) => (
                          <div key={index} className="bg-white p-4 rounded-lg border border-green-100">
                            <div className="font-medium text-gray-800">{exercise.exercise}</div>
                            <div className="text-sm text-green-600 mt-1">{exercise.duration}</div>
                            <div className="text-xs text-gray-600 mt-2">{exercise.instructions}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Weekly Notes & Tips */}
                {currentDay === 6 && workoutPlan && (
                  <div className="mt-8 space-y-4">
                    <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
                      <h5 className="font-semibold text-purple-800 mb-3">Weekly Notes</h5>
                      <p className="text-purple-700">{workoutPlan.weeklyNotes}</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                        <h5 className="font-semibold text-blue-800 mb-3">Progression Tips</h5>
                        <ul className="space-y-2">
                          {workoutPlan.progressionTips.map((tip, index) => (
                            <li key={index} className="text-sm text-blue-700 flex items-start">
                              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2 mt-2 flex-shrink-0"></div>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-red-50 rounded-xl p-6 border border-red-200">
                        <h5 className="font-semibold text-red-800 mb-3">Safety Reminders</h5>
                        <ul className="space-y-2">
                          {workoutPlan.safetyReminders.map((reminder, index) => (
                            <li key={index} className="text-sm text-red-700 flex items-start">
                              <Shield className="w-3 h-3 text-red-500 mr-2 mt-1 flex-shrink-0" />
                              {reminder}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-6 border-t flex justify-between items-center" style={{ borderColor: colors.paleGray }}>
          <div className="text-sm" style={{ color: colors.mediumGray }}>
            Week of {new Date().toLocaleDateString()} • Generated for {surveyData?.firstName}
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={generateWorkoutPlan}
              disabled={generating}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: colors.deepBlue }}
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Dumbbell className="w-4 h-4" />
                  <span>New Plan</span>
                </>
              )}
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 rounded-lg border hover:bg-gray-50 transition-all" style={{ borderColor: colors.lightGray }}>
              <Download className="w-4 h-4" />
              <span>Export Plan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}