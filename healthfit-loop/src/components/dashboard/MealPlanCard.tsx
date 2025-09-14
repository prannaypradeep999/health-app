'use client';

import React, { useState, useEffect } from 'react';
import { Utensils, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import EnhancedMealGenerationModal from './modals/EnhancedMealGenerationModal';

interface MealPlanCardProps {
  surveyData: any;
  onViewPlan: () => void;
  isGuest?: boolean;
}

interface MealPlanStatus {
  exists: boolean;
  regenerationCount: number;
  remainingRegenerations: number;
  isGenerating: boolean;
}

export default function MealPlanCard({ surveyData, onViewPlan, isGuest = false }: MealPlanCardProps) {
  const [planStatus, setPlanStatus] = useState<MealPlanStatus>({
    exists: false,
    regenerationCount: 0,
    remainingRegenerations: 100,
    isGenerating: false
  });
  const [showGenerationModal, setShowGenerationModal] = useState(false);

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
    // Open the new generation modal instead of making API call directly
    setShowGenerationModal(true);
  };

  const handleGenerationComplete = (mealPlan: any) => {
    // Update plan status and close generation modal
    setPlanStatus({
      exists: true,
      regenerationCount: 0,
      remainingRegenerations: 100,
      isGenerating: false
    });
    setShowGenerationModal(false);
    // Auto-open the meal plan view modal
    setTimeout(() => onViewPlan(), 300);
  };

  const regenerateMealPlan = async () => {
    if (planStatus.remainingRegenerations <= 0) {
      alert('Maximum regenerations reached for this week (2/2). Please wait until next week.');
      return;
    }

    // Open the new generation modal for regeneration
    setShowGenerationModal(true);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-all duration-200">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Utensils className="w-6 h-6 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Meal Plan</h3>
          </div>
          {planStatus.exists && (
            <div className="text-right">
              <div className="text-xs text-gray-500">
                Regenerations: {planStatus.regenerationCount}/100
              </div>
              <div className="text-xs text-gray-400">
                {planStatus.remainingRegenerations} remaining
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <p className="text-gray-600 mb-6">
          Personalized nutrition for {surveyData?.goal?.replace('_', ' ').toLowerCase()}
        </p>

        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Daily Calories</span>
            <span className="font-medium text-gray-900">
              {dailyCalories}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Meals Out/Week</span>
            <span className="font-medium text-gray-900">
              {surveyData?.mealsOutPerWeek || 0}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Diet Type</span>
            <span className="font-medium text-gray-900">
              {surveyData?.dietPrefs?.length > 0 ? surveyData.dietPrefs[0] : 'Standard'}
            </span>
          </div>
        </div>

        {/* Action Buttons - Outline style */}
        <div className="space-y-3">
          {!planStatus.exists ? (
            // Generate Initial Plan - Solid CTA button
            <button
              onClick={generateMealPlan}
              disabled={planStatus.isGenerating}
              className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-all duration-200 flex items-center justify-center space-x-2"
              >
                <span>View Full Plan</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={regenerateMealPlan}
                disabled={planStatus.isGenerating || planStatus.remainingRegenerations <= 0}
                className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="mt-4 text-xs text-center text-gray-500">
          {!planStatus.exists
            ? "AI will find real restaurants and recipes based on your preferences"
            : "Each meal has 2 options to choose from • Weekly plan with real DoorDash links"
          }
        </div>
      </div>

      {/* Enhanced Generation Modal */}
      {showGenerationModal && (
        <EnhancedMealGenerationModal
          surveyData={surveyData}
          isGuest={isGuest}
          onClose={() => setShowGenerationModal(false)}
          onComplete={handleGenerationComplete}
        />
      )}
    </div>
  );
}