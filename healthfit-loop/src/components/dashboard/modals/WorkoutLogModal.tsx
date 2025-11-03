'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, Clock, Zap, Heart, Star } from 'lucide-react';

interface WorkoutLogModalProps {
  onClose: () => void;
  onSave: (workoutData: any) => void;
  surveyData: any;
}

interface ExerciseLog {
  exerciseName: string;
  setsCompleted: number;
  repsCompleted: number[];
  weightUsed: number[];
  duration?: number;
  formRating?: number;
  difficultyRating?: number;
  notes?: string;
}

interface WorkoutLogData {
  day: string;
  date: string;
  duration: number;
  completed: boolean;
  exercises: ExerciseLog[];
  totalCaloriesBurned?: number;
  averageHeartRate?: number;
  perceivedExertion?: number;
  notes?: string;
}

export default function WorkoutLogModal({ onClose, onSave, surveyData }: WorkoutLogModalProps) {
  const [workoutData, setWorkoutData] = useState<WorkoutLogData>({
    day: new Date().toLocaleDateString('en', { weekday: 'long' }).toLowerCase(),
    date: new Date().toISOString().split('T')[0],
    duration: 0,
    completed: false,
    exercises: []
  });

  const [newExercise, setNewExercise] = useState<ExerciseLog>({
    exerciseName: '',
    setsCompleted: 0,
    repsCompleted: [],
    weightUsed: []
  });

  const [showExerciseForm, setShowExerciseForm] = useState(false);

  const commonExercises = [
    'Push-ups', 'Squats', 'Lunges', 'Plank', 'Burpees', 'Mountain Climbers',
    'Pull-ups', 'Deadlifts', 'Bench Press', 'Rows', 'Shoulder Press', 'Tricep Dips'
  ];

  const addExercise = () => {
    if (newExercise.exerciseName && newExercise.setsCompleted > 0) {
      setWorkoutData(prev => ({
        ...prev,
        exercises: [...prev.exercises, { ...newExercise }]
      }));
      setNewExercise({
        exerciseName: '',
        setsCompleted: 0,
        repsCompleted: [],
        weightUsed: []
      });
      setShowExerciseForm(false);
    }
  };

  const removeExercise = (index: number) => {
    setWorkoutData(prev => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== index)
    }));
  };

  const addSet = () => {
    setNewExercise(prev => ({
      ...prev,
      setsCompleted: prev.setsCompleted + 1,
      repsCompleted: [...prev.repsCompleted, 0],
      weightUsed: [...prev.weightUsed, 0]
    }));
  };

  const removeSet = (setIndex: number) => {
    setNewExercise(prev => ({
      ...prev,
      setsCompleted: prev.setsCompleted - 1,
      repsCompleted: prev.repsCompleted.filter((_, i) => i !== setIndex),
      weightUsed: prev.weightUsed.filter((_, i) => i !== setIndex)
    }));
  };

  const updateSetReps = (setIndex: number, reps: number) => {
    setNewExercise(prev => ({
      ...prev,
      repsCompleted: prev.repsCompleted.map((rep, i) => i === setIndex ? reps : rep)
    }));
  };

  const updateSetWeight = (setIndex: number, weight: number) => {
    setNewExercise(prev => ({
      ...prev,
      weightUsed: prev.weightUsed.map((w, i) => i === setIndex ? weight : w)
    }));
  };

  const handleSave = () => {
    if (workoutData.exercises.length > 0 || workoutData.completed) {
      onSave(workoutData);
      onClose();
    }
  };

  const RatingStars = ({ rating, onRate, label }: { rating: number; onRate: (rating: number) => void; label: string }) => (
    <div className="flex items-center space-x-2">
      <span className="text-sm font-medium text-gray-700">{label}:</span>
      <div className="flex space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onRate(star)}
            className={`w-6 h-6 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition-colors`}
          >
            <Star className="w-4 h-4 fill-current" />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Log Workout</h2>
              <p className="text-gray-600 mt-1">Track your progress and performance</p>
            </div>
            <button
              onClick={onClose}
              className="p-3 hover:bg-gray-100 rounded-full transition-all duration-200"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Workout Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Duration (minutes)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="number"
                  value={workoutData.duration}
                  onChange={(e) => setWorkoutData(prev => ({ ...prev, duration: Number(e.target.value) }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="45"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Calories Burned</label>
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="number"
                  value={workoutData.totalCaloriesBurned || ''}
                  onChange={(e) => setWorkoutData(prev => ({ ...prev, totalCaloriesBurned: Number(e.target.value) }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="300"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Average Heart Rate</label>
              <div className="relative">
                <Heart className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="number"
                  value={workoutData.averageHeartRate || ''}
                  onChange={(e) => setWorkoutData(prev => ({ ...prev, averageHeartRate: Number(e.target.value) }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="140"
                />
              </div>
            </div>
          </div>

          {/* Perceived Exertion */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Perceived Exertion (1-10)</label>
            <div className="flex space-x-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => setWorkoutData(prev => ({ ...prev, perceivedExertion: level }))}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    workoutData.perceivedExertion === level
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">1 = Very easy, 10 = Maximum effort</p>
          </div>

          {/* Exercises */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Exercises</h3>
              <button
                onClick={() => setShowExerciseForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                <span>Add Exercise</span>
              </button>
            </div>

            {/* Exercise List */}
            {workoutData.exercises.length > 0 ? (
              <div className="space-y-3">
                {workoutData.exercises.map((exercise, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{exercise.exerciseName}</h4>
                        <p className="text-sm text-gray-600">
                          {exercise.setsCompleted} sets • {exercise.repsCompleted.join(', ')} reps
                          {exercise.weightUsed.some(w => w > 0) && ` • ${exercise.weightUsed.join(', ')} lbs`}
                        </p>
                      </div>
                      <button
                        onClick={() => removeExercise(index)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No exercises logged yet. Add some exercises to track your workout.</p>
              </div>
            )}
          </div>

          {/* Exercise Form Modal */}
          {showExerciseForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl max-w-md w-full mx-4 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Add Exercise</h3>
                  <button
                    onClick={() => setShowExerciseForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Exercise Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Exercise Name</label>
                    <input
                      type="text"
                      value={newExercise.exerciseName}
                      onChange={(e) => setNewExercise(prev => ({ ...prev, exerciseName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Push-ups"
                      list="common-exercises"
                    />
                    <datalist id="common-exercises">
                      {commonExercises.map((exercise) => (
                        <option key={exercise} value={exercise} />
                      ))}
                    </datalist>
                  </div>

                  {/* Sets */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Sets</label>
                      <button
                        onClick={addSet}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        + Add Set
                      </button>
                    </div>
                    {newExercise.repsCompleted.map((_, setIndex) => (
                      <div key={setIndex} className="flex items-center space-x-2 mb-2">
                        <span className="text-sm font-medium text-gray-600 w-12">Set {setIndex + 1}:</span>
                        <input
                          type="number"
                          value={newExercise.repsCompleted[setIndex]}
                          onChange={(e) => updateSetReps(setIndex, Number(e.target.value))}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Reps"
                        />
                        <input
                          type="number"
                          value={newExercise.weightUsed[setIndex]}
                          onChange={(e) => updateSetWeight(setIndex, Number(e.target.value))}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Weight (lbs)"
                        />
                        <button
                          onClick={() => removeSet(setIndex)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Rating */}
                  <div className="grid grid-cols-2 gap-4">
                    <RatingStars
                      rating={newExercise.formRating || 0}
                      onRate={(rating) => setNewExercise(prev => ({ ...prev, formRating: rating }))}
                      label="Form"
                    />
                    <RatingStars
                      rating={newExercise.difficultyRating || 0}
                      onRate={(rating) => setNewExercise(prev => ({ ...prev, difficultyRating: rating }))}
                      label="Difficulty"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
                    <textarea
                      value={newExercise.notes || ''}
                      onChange={(e) => setNewExercise(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="How did this exercise feel?"
                    />
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowExerciseForm(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addExercise}
                      disabled={!newExercise.exerciseName || newExercise.setsCompleted === 0}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      Add Exercise
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Workout Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Workout Notes (optional)</label>
            <textarea
              value={workoutData.notes || ''}
              onChange={(e) => setWorkoutData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="How did this workout feel? Any observations or improvements for next time?"
            />
          </div>

          {/* Completed Checkbox */}
          <div className="flex items-center space-x-3 mb-6">
            <input
              type="checkbox"
              id="completed"
              checked={workoutData.completed}
              onChange={(e) => setWorkoutData(prev => ({ ...prev, completed: e.target.checked }))}
              className="w-5 h-5 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="completed" className="text-sm font-medium text-gray-700">
              Mark workout as completed
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-6 border-t border-gray-100 bg-gray-50">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={workoutData.exercises.length === 0 && !workoutData.completed}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Log Workout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}