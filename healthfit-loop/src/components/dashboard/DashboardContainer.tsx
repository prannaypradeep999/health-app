'use client';

import { useState, useEffect } from 'react';
import { DashboardHome } from './DashboardHome';
import { MealPlanPage } from './MealPlanPage';
import { WorkoutPlanPage } from './WorkoutPlanPage';
import { ProgressPage } from './ProgressPage';
import { AccountPage } from './AccountPage';
import { LoadingPage } from './LoadingPage';
import { calculateMacroTargets } from '@/lib/utils/nutrition';
import AccountCreationModal from './modals/AccountCreationModal';

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
  isGuest?: boolean;
  userId?: string | null;
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
  const [showAccountModal, setShowAccountModal] = useState(false);

  useEffect(() => {
    fetchSurveyData();
    checkGenerationStatus();
  }, []);

  // Removed auto-modal - keep banner only for less intrusive UX

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

  // Don't render dashboard without survey data - redirect to survey instead
  if (!surveyData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-medium text-gray-900 mb-4">No Survey Data Found</h2>
          <p className="text-gray-600 mb-6">Please complete the survey to access your dashboard.</p>
          <button
            onClick={() => window.location.href = '/survey'}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Complete Survey
          </button>
        </div>
      </div>
    );
  }

  // Calculate nutrition targets from real survey data
  const nutritionTargets = calculateMacroTargets({
    age: surveyData.age,
    sex: surveyData.sex,
    height: surveyData.height,
    weight: surveyData.weight,
    activityLevel: surveyData.activityLevel,
    goal: surveyData.goal
  });

  const userData = {
    name: `${surveyData.firstName} ${surveyData.lastName}`,
    email: surveyData.email,
    location: `${surveyData.city}, ${surveyData.state}`,
    zipCode: surveyData.zipCode,
    goal: surveyData.goal,
    activityLevel: surveyData.activityLevel,
    calorieTarget: nutritionTargets.calories,
    macroTargets: nutritionTargets
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return (
          <DashboardHome
            user={userData}
            onNavigate={handleNavigate}
            generationStatus={generationStatus}
            isGuest={surveyData?.isGuest}
            onShowAccountModal={() => setShowAccountModal(true)}
          />
        );
      case 'meal-plan':
        return (
          <MealPlanPage
            onNavigate={handleNavigate}
            generationStatus={generationStatus}
            isGuest={surveyData?.isGuest}
            onShowAccountModal={() => setShowAccountModal(true)}
          />
        );
      case 'workout-plan':
        return (
          <WorkoutPlanPage
            onNavigate={handleNavigate}
            generationStatus={generationStatus}
            isGuest={surveyData?.isGuest}
            onShowAccountModal={() => setShowAccountModal(true)}
          />
        );
      case 'progress':
        return (
          <ProgressPage
            onNavigate={handleNavigate}
            isGuest={surveyData?.isGuest}
            onShowAccountModal={() => setShowAccountModal(true)}
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
            isGuest={surveyData?.isGuest}
            onShowAccountModal={() => setShowAccountModal(true)}
          />
        );
    }
  };

  return (
    <>
      {renderScreen()}
      <AccountCreationModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        guestData={{
          email: surveyData?.email,
          firstName: surveyData?.firstName,
          lastName: surveyData?.lastName
        }}
      />
    </>
  );
}