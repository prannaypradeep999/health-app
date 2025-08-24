'use client';

import React from 'react';
import { Dumbbell, ChevronRight } from 'lucide-react';
import { colors } from './constants';

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
    <div className="rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden" 
         style={{ backgroundColor: colors.white }}>
      <div className="p-6" style={{ backgroundColor: colors.accentRed }}>
        <div className="flex items-center space-x-3">
          <Dumbbell className="w-8 h-8 text-white" />
          <h3 className="text-xl font-bold text-white">Workout Plan</h3>
        </div>
      </div>
      <div className="p-6">
        <p className="mb-4" style={{ color: colors.mediumGray }}>
          Custom fitness routine for {surveyData?.goal?.replace('_', ' ').toLowerCase()}
        </p>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between">
            <span style={{ color: colors.darkGray }}>Today's Focus</span>
            <span className="font-semibold" style={{ color: colors.nearBlack }}>
              {getWorkoutFocus()}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: colors.darkGray }}>Duration</span>
            <span className="font-semibold" style={{ color: colors.nearBlack }}>
              45 min
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: colors.darkGray }}>Difficulty</span>
            <span className="font-semibold" style={{ color: colors.nearBlack }}>
              {getWorkoutIntensity()}
            </span>
          </div>
        </div>
        <button 
          onClick={onViewPlan}
          className="w-full text-white py-3 rounded-lg hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
          style={{ backgroundColor: colors.accentRed }}
        >
          <span>View Full Plan</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}