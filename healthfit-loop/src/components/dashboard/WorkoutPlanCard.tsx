'use client';

import React from 'react';
import { Dumbbell, ChevronRight } from 'lucide-react';

interface WorkoutPlanCardProps {
  surveyData: any;
  onViewPlan: () => void;
}

export default function WorkoutPlanCard({ surveyData, onViewPlan }: WorkoutPlanCardProps) {
  const getWorkoutIntensity = () => {
    if (surveyData?.activityLevel === 'SEDENTARY') return 'Beginner';
    if (surveyData?.activityLevel === 'VERY_ACTIVE') return 'Advanced';
    return 'Intermediate';
  };

  const getWorkoutFocus = () => {
    switch(surveyData?.goal) {
      case 'WEIGHT_LOSS': return 'Cardio & HIIT';
      case 'MUSCLE_GAIN': return 'Strength Training';
      case 'ENDURANCE': return 'Cardio & Stamina';
      default: return 'Full Body';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-all duration-200">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <Dumbbell className="w-6 h-6 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Workout Plan</h3>
        </div>
      </div>

      <div className="p-6">
        <p className="text-gray-600 mb-6">
          Custom fitness routine for {surveyData?.goal?.replace('_', ' ').toLowerCase()}
        </p>

        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Today's Focus</span>
            <span className="font-medium text-gray-900">
              {getWorkoutFocus()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Duration</span>
            <span className="font-medium text-gray-900">
              45 min
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Difficulty</span>
            <span className="font-medium text-gray-900">
              {getWorkoutIntensity()}
            </span>
          </div>
        </div>

        <button
          onClick={onViewPlan}
          className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-all duration-200 flex items-center justify-center space-x-2"
        >
          <span>View Full Plan</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}