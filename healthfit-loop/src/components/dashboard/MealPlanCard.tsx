'use client';

import React from 'react';
import { Utensils, ChevronRight } from 'lucide-react';
import { colors } from './constants';

interface MealPlanCardProps {
  surveyData: any;
  onViewPlan: () => void;
}

export default function MealPlanCard({ surveyData, onViewPlan }: MealPlanCardProps) {
  // Calculate calories based on user data (simplified)
  const baseCalories = surveyData?.goal === 'WEIGHT_LOSS' ? 1500 : 2000;
  const activityMultiplier = surveyData?.activityLevel === 'VERY_ACTIVE' ? 1.3 : 1.0;
  const dailyCalories = Math.round(baseCalories * activityMultiplier);

  return (
    <div className="rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden" 
         style={{ backgroundColor: colors.white }}>
      <div className="p-6" style={{ backgroundColor: colors.deepBlue }}>
        <div className="flex items-center space-x-3">
          <Utensils className="w-8 h-8 text-white" />
          <h3 className="text-xl font-bold text-white">Meal Plan</h3>
        </div>
      </div>
      <div className="p-6">
        <p className="mb-4" style={{ color: colors.mediumGray }}>
          Personalized nutrition for {surveyData?.goal?.replace('_', ' ').toLowerCase()}
        </p>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between">
            <span style={{ color: colors.darkGray }}>Daily Calories</span>
            <span className="font-semibold" style={{ color: colors.nearBlack }}>
              {dailyCalories}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: colors.darkGray }}>Meals Out/Week</span>
            <span className="font-semibold" style={{ color: colors.nearBlack }}>
              {surveyData?.mealsOutPerWeek || 0}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: colors.darkGray }}>Diet Type</span>
            <span className="font-semibold" style={{ color: colors.nearBlack }}>
              {surveyData?.dietPrefs?.length > 0 ? surveyData.dietPrefs[0] : 'Standard'}
            </span>
          </div>
        </div>
        <button 
          onClick={onViewPlan}
          className="w-full text-white py-3 rounded-lg hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
          style={{ backgroundColor: colors.deepBlue }}
        >
          <span>View Full Plan</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}