'use client';

import React, { useState, useEffect } from 'react';
import { Utensils, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { colors } from './constants';

interface MealPlanCardProps {
  surveyData: any;
  onViewPlan: () => void;
}

interface MealPlanStatus {
  exists: boolean;
  regenerationCount: number;
  remainingRegenerations: number;
  isGenerating: boolean;
}

export default function MealPlanCard({ surveyData, onViewPlan }: MealPlanCardProps) {
  const [planStatus, setPlanStatus] = useState<MealPlanStatus>({
    exists: false,
    regenerationCount: 0,
    remainingRegenerations: 2,
    isGenerating: false
  });

  // Calculate calories based on user data
  const baseCalories = surveyData?.goal === 'WEIGHT_LOSS' ? 1500 : 2000;
  const activityMultiplier = surveyData?.activityLevel === 'VERY_ACTIVE' ? 1.3 : 1.0;
  const dailyCalories = Math.round(baseCalories * activityMultiplier);

  // Check if meal plan exists
  useEffect(() => {
    checkMealPlanStatus();
  }, []);

  const checkMealPlanStatus = async () => {
    try {
      const response = await fetch('/api/ai/meals/status');
      if (response.ok) {
        const data = await response.json();
        setPlanStatus(data);
      }
    } catch (error) {
      console.error('Failed to check meal plan status:', error);
    }
  };

  const generateMealPlan = async () => {
    setPlanStatus(prev => ({ ...prev, isGenerating: true }));
    
    try {
      const response = await fetch('/api/ai/meals/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ forceRegenerate: false })
      });

      const data = await response.json();
      
      if (response.ok) {
        setPlanStatus({
          exists: true,
          regenerationCount: data.regenerationCount,
          remainingRegenerations: data.remainingRegenerations,
          isGenerating: false
        });
        // Auto-open the meal plan modal
        setTimeout(() => onViewPlan(), 500);
      } else {
        alert(data.error || 'Failed to generate meal plan');
        setPlanStatus(prev => ({ ...prev, isGenerating: false }));
      }
    } catch (error) {
      console.error('Failed to generate meal plan:', error);
      alert('Failed to generate meal plan. Please try again.');
      setPlanStatus(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const regenerateMealPlan = async () => {
    if (planStatus.remainingRegenerations <= 0) {
      alert('Maximum regenerations reached for this week (2/2). Please wait until next week.');
      return;
    }

    setPlanStatus(prev => ({ ...prev, isGenerating: true }));
    
    try {
      const response = await fetch('/api/ai/meals/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ forceRegenerate: true })
      });

      const data = await response.json();
      
      if (response.ok) {
        setPlanStatus({
          exists: true,
          regenerationCount: data.regenerationCount,
          remainingRegenerations: data.remainingRegenerations,
          isGenerating: false
        });
        // Auto-open the updated meal plan modal
        setTimeout(() => onViewPlan(), 500);
      } else {
        alert(data.error || 'Failed to regenerate meal plan');
        setPlanStatus(prev => ({ ...prev, isGenerating: false }));
      }
    } catch (error) {
      console.error('Failed to regenerate meal plan:', error);
      alert('Failed to regenerate meal plan. Please try again.');
      setPlanStatus(prev => ({ ...prev, isGenerating: false }));
    }
  };

  return (
    <div className="rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden"
         style={{ backgroundColor: colors.white }}>
      <div className="p-6" style={{ backgroundColor: colors.deepBlue }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Utensils className="w-8 h-8 text-white" />
            <h3 className="text-xl font-bold text-white">Meal Plan</h3>
          </div>
          {planStatus.exists && (
            <div className="text-right">
              <div className="text-white text-xs opacity-80">
                Regenerations: {planStatus.regenerationCount}/2
              </div>
              <div className="text-white text-xs opacity-60">
                {planStatus.remainingRegenerations} remaining
              </div>
            </div>
          )}
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

        {/* Action Buttons */}
        <div className="space-y-3">
          {!planStatus.exists ? (
            // Generate Initial Plan
            <button
              onClick={generateMealPlan}
              disabled={planStatus.isGenerating}
              className="w-full text-white py-3 rounded-lg hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: colors.deepBlue }}
            >
              {planStatus.isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating Your Meal Plan...</span>
                </>
              ) : (
                <>
                  <Utensils className="w-4 h-4" />
                  <span>Generate My Meal Plan</span>
                </>
              )}
            </button>
          ) : (
            // Plan Exists - View and Regenerate Options
            <>
              <button
                onClick={onViewPlan}
                className="w-full text-white py-3 rounded-lg hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
                style={{ backgroundColor: colors.deepBlue }}
              >
                <span>View Full Plan</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <button
                onClick={regenerateMealPlan}
                disabled={planStatus.isGenerating || planStatus.remainingRegenerations <= 0}
                className="w-full border-2 py-2 rounded-lg hover:bg-gray-50 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: colors.deepBlue, color: colors.deepBlue }}
              >
                {planStatus.isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Regenerating...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>
                      Regenerate Plan ({planStatus.remainingRegenerations} left)
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Info Text */}
        <div className="mt-4 text-xs text-center" style={{ color: colors.mediumGray }}>
          {!planStatus.exists 
            ? "AI will find real restaurants and recipes based on your preferences"
            : `Each meal has 2 options to choose from • Weekly plan with real DoorDash links`
          }
        </div>
      </div>
    </div>
  );
}