'use client';

import { useState, useEffect } from 'react';
import { DashboardHome } from './DashboardHome';
import { MealPlanPage } from './MealPlanPage';
import { WorkoutPlanPage } from './WorkoutPlanPage';
import { ProgressPage } from './ProgressPage';
import { AccountPage } from './AccountPage';
import { LoadingPage } from './LoadingPage';

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
  goal: string;
  city: string;
  state: string;
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
      // Check if meals are generated
      const mealsResponse = await fetch('/api/ai/meals/current');
      const mealsGenerated = mealsResponse.ok;

      // Check if workouts are generated
      const workoutsResponse = await fetch('/api/ai/workouts/current');
      const workoutsGenerated = workoutsResponse.ok;

      // For now, assume restaurants are discovered if meals are generated
      const restaurantsDiscovered = mealsGenerated;

      setGenerationStatus({
        mealsGenerated,
        workoutsGenerated,
        restaurantsDiscovered
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

  const userData = {
    name: surveyData ? `${surveyData.firstName} ${surveyData.lastName}` : 'User',
    email: surveyData?.email || 'user@example.com',
    location: surveyData ? `${surveyData.city}, ${surveyData.state}` : 'Location',
    goal: surveyData?.goal || 'fitness',
    activityLevel: surveyData?.activityLevel || 'moderate'
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