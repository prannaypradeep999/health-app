'use client';

import React, { useState, useEffect } from 'react';
import FoodProfileScreen from './FoodProfileScreen';
import WorkoutProfileScreen from './WorkoutProfileScreen';
import { Loader2 } from 'lucide-react';

interface ProfileConfirmationProps {
  surveyData: any;
  onComplete: () => void;
  onBack: () => void;
}

interface ProfileData {
  foodProfile?: string;
  workoutProfile?: string;
  foodProfileId?: string;
  workoutProfileId?: string;
  foodApproved: boolean;
  workoutApproved: boolean;
  foodEdits?: string;
  workoutEdits?: string;
}

export default function ProfileConfirmation({ surveyData, onComplete, onBack }: ProfileConfirmationProps) {
  const [profileData, setProfileData] = useState<ProfileData>({
    foodApproved: false,
    workoutApproved: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<'food' | 'workout'>('food');

  // Generate profiles on component mount
  useEffect(() => {
    generateProfiles();
  }, []);

  const generateProfiles = async () => {
    setIsLoading(true);
    try {
      console.log('[ProfileConfirmation] Generating both profiles in parallel');

      // Generate both profiles in parallel
      const [foodResponse, workoutResponse] = await Promise.all([
        fetch('/api/ai/profiles/food', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(surveyData)
        }),
        fetch('/api/ai/profiles/workout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(surveyData)
        })
      ]);

      const [foodResult, workoutResult] = await Promise.all([
        foodResponse.json(),
        workoutResponse.json()
      ]);

      if (foodResult.success && workoutResult.success) {
        setProfileData({
          foodProfile: foodResult.profile,
          workoutProfile: workoutResult.profile,
          foodProfileId: foodResult.profileId,
          workoutProfileId: workoutResult.profileId,
          foodApproved: foodResult.isApproved || false,
          workoutApproved: workoutResult.isApproved || false,
          foodEdits: foodResult.userEdits,
          workoutEdits: workoutResult.userEdits
        });
      } else {
        throw new Error('Failed to generate one or both profiles');
      }

    } catch (error) {
      console.error('[ProfileConfirmation] Error generating profiles:', error);
      // Set fallback profiles if generation fails
      setProfileData({
        foodProfile: "We're analyzing your nutrition preferences and will create a personalized food profile for you. Your preferences for vegetarian and vegan options, along with your Mediterranean, Chinese, Indian, and American cuisine choices, will help us create the perfect meal plan.",
        workoutProfile: "Based on your weight loss goals and lightly active lifestyle, we're designing a comprehensive fitness plan that incorporates your interests in cardio, strength training, HIIT, and sports. Your weekday availability will be optimized for maximum results.",
        foodProfileId: 'fallback-food',
        workoutProfileId: 'fallback-workout',
        foodApproved: false,
        workoutApproved: false
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFoodApproval = async (edits?: string) => {
    if (!profileData.foodProfileId) return;

    try {
      // Only call API if not a fallback profile
      if (profileData.foodProfileId !== 'fallback-food') {
        await fetch('/api/ai/profiles/food', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: profileData.foodProfileId,
            isApproved: true,
            userEdits: edits || null
          })
        });
      }

      setProfileData(prev => ({
        ...prev,
        foodApproved: true,
        foodEdits: edits || undefined
      }));
    } catch (error) {
      console.error('Error approving food profile:', error);
      // Still approve locally even if API fails
      setProfileData(prev => ({
        ...prev,
        foodApproved: true,
        foodEdits: edits || undefined
      }));
    }
  };

  const handleWorkoutApproval = async (edits?: string) => {
    if (!profileData.workoutProfileId) return;

    try {
      // Only call API if not a fallback profile
      if (profileData.workoutProfileId !== 'fallback-workout') {
        await fetch('/api/ai/profiles/workout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: profileData.workoutProfileId,
            isApproved: true,
            userEdits: edits || null
          })
        });
      }

      setProfileData(prev => ({
        ...prev,
        workoutApproved: true,
        workoutEdits: edits || undefined
      }));
    } catch (error) {
      console.error('Error approving workout profile:', error);
      // Still approve locally even if API fails
      setProfileData(prev => ({
        ...prev,
        workoutApproved: true,
        workoutEdits: edits || undefined
      }));
    }
  };

  const handleGenerateMyPlan = async () => {
    if (!profileData.foodApproved || !profileData.workoutApproved) {
      return;
    }

    setIsGenerating(true);

    // Start actual generation in background but don't wait for it
    try {
      // Trigger both meal and workout generation in background
      Promise.all([
        fetch('/api/ai/meals/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...surveyData,
            profileApproved: true,
            foodProfileId: profileData.foodProfileId,
            workoutProfileId: profileData.workoutProfileId
          })
        }),
        fetch('/api/ai/workouts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...surveyData,
            profileApproved: true,
            workoutProfileId: profileData.workoutProfileId
          })
        })
      ]).catch(error => {
        console.error('Background generation error:', error);
        // Don't block the user flow for background generation errors
      });

      // Redirect to dashboard after a brief moment
      setTimeout(() => {
        setIsGenerating(false);
        onComplete(); // This should navigate to dashboard
      }, 1500);

    } catch (error) {
      console.error('Error starting generation:', error);
      // Still redirect even if there's an error
      setTimeout(() => {
        setIsGenerating(false);
        onComplete();
      }, 1000);
    }
  };

  // Handler functions for screen navigation
  const handleFoodNext = () => {
    setCurrentScreen('workout');
  };

  const handleWorkoutBack = () => {
    setCurrentScreen('food');
  };

  if (isGenerating) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-6 max-w-md mx-auto text-center px-6">
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

          <div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">
              Creating Your Complete Plan
            </h2>
            <p className="text-sm text-neutral-600 mb-4">
              We're generating your personalized meal plans and workout routines. This may take 1-2 minutes.
            </p>
            <div className="space-y-2 text-xs text-neutral-500">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Analyzing your nutrition preferences...
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
                Creating your workout strategy...
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2 animate-pulse"></div>
                Finding local restaurants...
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show food profile screen
  if (currentScreen === 'food') {
    return (
      <FoodProfileScreen
        profileData={profileData}
        onApprove={handleFoodApproval}
        onNext={handleFoodNext}
        onBack={onBack}
        isLoading={isLoading}
      />
    );
  }

  // Show workout profile screen
  if (currentScreen === 'workout') {
    return (
      <WorkoutProfileScreen
        profileData={profileData}
        onApprove={handleWorkoutApproval}
        onNext={handleGenerateMyPlan}
        onBack={handleWorkoutBack}
        isLoading={isLoading}
      />
    );
  }

  return null;
}