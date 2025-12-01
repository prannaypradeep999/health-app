'use client';

import { useState, useEffect } from 'react';
import { DashboardHome } from './DashboardHome';
import { MealPlanPage } from './MealPlanPage';
import { WorkoutPlanPage } from './WorkoutPlanPage';
import { ProgressPage } from './ProgressPage';
import { AccountPage } from './AccountPage';
import { LoadingPage } from './LoadingPage';
import { calculateTargetCalories, calculateMacroTargets } from '@/lib/utils/nutrition';

type Screen = 'dashboard' | 'meal-plan' | 'workout-plan' | 'progress' | 'account';

interface DashboardContainerProps {
  initialScreen?: Screen;
}

interface SurveyData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  age: number;
  sex: string;
  height: number;
  weight: number;
  goal: string;
  city: string;
  state: string;
  zipCode: string;
  activityLevel: string;
  createdAt: string;
}

interface GenerationStatus {
  mealsGenerated: boolean;
  workoutsGenerated: boolean;
  restaurantsDiscovered: boolean;
}

export function DashboardContainer({ initialScreen = 'dashboard' }: DashboardContainerProps) {
  const [currentScreen, setCurrentScreen] = useState<Screen>(initialScreen);
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    mealsGenerated: false,
    workoutsGenerated: false,
    restaurantsDiscovered: false
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSurveyData();
    checkGenerationStatus();
  }, []);

  useEffect(() => {
    // Poll for generation status updates every 5 seconds if meals aren't generated yet
    if (!generationStatus.mealsGenerated) {
      const pollInterval = setInterval(() => {
        console.log('Polling for meal generation status...');
        checkGenerationStatus();
      }, 5000);

      return () => clearInterval(pollInterval);
    }
  }, [generationStatus.mealsGenerated]);

  const fetchSurveyData = async () => {
    try {
      const response = await fetch('/api/survey');
      if (response.ok) {
        const data = await response.json();
        setSurveyData(data.survey);
      }
    } catch (error) {
      console.error('Failed to fetch survey data:', error);
    }
  };

  const checkGenerationStatus = async () => {
    try {
      // Simple check - just see if APIs return data
      const [mealsResponse, workoutsResponse] = await Promise.all([
        fetch('/api/ai/meals/current'),
        fetch('/api/ai/workouts/current')
      ]);

      const mealsGenerated = mealsResponse.ok;
      const workoutsGenerated = workoutsResponse.ok;

      console.log(`Generation status: meals=${mealsGenerated}, workouts=${workoutsGenerated}`);

      setGenerationStatus({
        mealsGenerated,
        workoutsGenerated,
        restaurantsDiscovered: mealsGenerated
      });
    } catch (error) {
      console.error('Failed to check generation status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  if (loading) {
    return <LoadingPage />;
  }

  // Calculate nutrition targets
  const nutritionTargets = surveyData ? calculateMacroTargets({
    age: surveyData.age,
    sex: surveyData.sex,
    height: surveyData.height,
    weight: surveyData.weight,
    activityLevel: surveyData.activityLevel,
    goal: surveyData.goal
  }) : { calories: 2200, protein: 0, carbs: 0, fat: 0 };

  const userData = {
    name: surveyData ? `${surveyData.firstName} ${surveyData.lastName}` : 'User',
    email: surveyData?.email || 'user@example.com',
    location: surveyData ? `${surveyData.city}, ${surveyData.state}` : 'Location',
    zipCode: surveyData?.zipCode || '',
    goal: surveyData?.goal || 'fitness',
    activityLevel: surveyData?.activityLevel || 'moderate',
    calorieTarget: nutritionTargets.calories,
    macroTargets: nutritionTargets
  };

  switch (currentScreen) {
    case 'dashboard':
      return (
        <DashboardHome
          user={userData}
          onNavigate={handleNavigate}
          generationStatus={generationStatus}
        />
      );
    case 'meal-plan':
      return (
        <MealPlanPage
          onNavigate={handleNavigate}
          generationStatus={generationStatus}
        />
      );
    case 'workout-plan':
      return (
        <WorkoutPlanPage
          onNavigate={handleNavigate}
          generationStatus={generationStatus}
        />
      );
    case 'progress':
      return (
        <ProgressPage
          onNavigate={handleNavigate}
        />
      );
    case 'account':
      return (
        <AccountPage
          user={userData}
          onNavigate={handleNavigate}
        />
      );
    default:
      return (
        <DashboardHome
          user={userData}
          onNavigate={handleNavigate}
          generationStatus={generationStatus}
        />
      );
  }
}