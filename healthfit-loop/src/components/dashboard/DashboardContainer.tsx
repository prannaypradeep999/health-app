'use client';

import { useState, useEffect } from 'react';
import { DashboardHome } from './DashboardHome';
import { MealPlanPage } from './MealPlanPage';
import { WorkoutPlanPage } from './WorkoutPlanPage';
import { ProgressPage } from './ProgressPage';
import { AccountPage } from './AccountPage';
import { LoadingPage } from './LoadingPage';
import { MealPlanningPreview } from './MealPlanningPreview';
import { calculateMacroTargets } from '@/lib/utils/nutrition';
import AccountCreationModal from './modals/AccountCreationModal';
import { UtensilsCrossed } from 'lucide-react';

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
  homeMealsGenerated: boolean;
  restaurantMealsGenerated: boolean;
}

export function DashboardContainer({ initialScreen = 'dashboard' }: DashboardContainerProps) {
  const [currentScreen, setCurrentScreen] = useState<Screen>(initialScreen);
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    mealsGenerated: false,
    workoutsGenerated: false,
    restaurantsDiscovered: false,
    homeMealsGenerated: false,
    restaurantMealsGenerated: false
  });
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showPlanningPreview, setShowPlanningPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [shouldShowInitialPreview, setShouldShowInitialPreview] = useState(false);

  useEffect(() => {
    fetchSurveyData();
    checkGenerationStatus();

    // Check if user just completed survey (should show initial preview)
    const urlParams = new URLSearchParams(window.location.search);
    const justCompleted = urlParams.get('surveyCompleted');
    console.log('[DashboardContainer] URL params check:', { justCompleted, href: window.location.href });
    if (justCompleted === 'true') {
      console.log('[DashboardContainer] Survey just completed, will show initial preview');
      setShouldShowInitialPreview(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      console.log('[DashboardContainer] No surveyCompleted flag found');
    }
  }, []);

  // Removed auto-modal - keep banner only for less intrusive UX

  useEffect(() => {
    // Poll for generation status updates - different intervals based on what's still pending
    const shouldPoll = !generationStatus.mealsGenerated ||
                      !generationStatus.workoutsGenerated ||
                      (generationStatus.homeMealsGenerated && !generationStatus.restaurantMealsGenerated);

    if (shouldPoll) {
      // More frequent polling if restaurants are still being discovered
      const pollFrequency = generationStatus.homeMealsGenerated && !generationStatus.restaurantMealsGenerated ? 3000 : 5000;

      const pollInterval = setInterval(() => {
        console.log('Polling for generation status...', {
          meals: generationStatus.mealsGenerated,
          workouts: generationStatus.workoutsGenerated,
          home: generationStatus.homeMealsGenerated,
          restaurants: generationStatus.restaurantMealsGenerated
        });
        checkGenerationStatus();
      }, pollFrequency);

      return () => clearInterval(pollInterval);
    }
  }, [generationStatus.mealsGenerated, generationStatus.workoutsGenerated, generationStatus.homeMealsGenerated, generationStatus.restaurantMealsGenerated]);

  const fetchSurveyData = async () => {
    try {
      const response = await fetch('/api/survey');
      if (response.ok) {
        const data = await response.json();
        setSurveyData(data.survey);

        // If we should show initial preview and we have survey data, show it
        console.log('[DashboardContainer] Preview trigger check:', { shouldShowInitialPreview, hasSurvey: !!data.survey });
        if (shouldShowInitialPreview && data.survey) {
          console.log('[DashboardContainer] Triggering initial preview for new user');
          setTimeout(() => {
            handleShowPlanningPreview(true);
          }, 1000); // Small delay for smooth UX
        } else {
          console.log('[DashboardContainer] Preview trigger conditions not met:', { shouldShowInitialPreview, hasSurvey: !!data.survey });
        }
      }
    } catch (error) {
      console.error('Failed to fetch survey data:', error);
    }
  };

  const checkGenerationStatus = async () => {
    try {
      // Check if APIs return data and analyze meal plan structure
      const [mealsResponse, workoutsResponse] = await Promise.all([
        fetch('/api/ai/meals/current'),
        fetch('/api/ai/workouts/current')
      ]);

      const mealsGenerated = mealsResponse.ok;
      const workoutsGenerated = workoutsResponse.ok;

      let homeMealsGenerated = false;
      let restaurantMealsGenerated = false;
      let restaurantsDiscovered = false;

      // If meals exist, check if it's a split pipeline result
      if (mealsGenerated) {
        try {
          const mealsData = await mealsResponse.json();
          const mealPlan = mealsData.mealPlan?.planData;

          // Check for 7-day structured format first
          if (mealPlan?.days && Array.isArray(mealPlan.days)) {
            console.log(`[DashboardContainer] Detected 7-day structured meal plan with ${mealPlan.days.length} days`);

            // Check each day for home and restaurant meals
            let homeCount = 0;
            let restaurantCount = 0;

            mealPlan.days.forEach(day => {
              Object.values(day.meals || {}).forEach(meal => {
                if (meal) {
                  if (meal.source === 'home') homeCount++;
                  if (meal.source === 'restaurant') restaurantCount++;
                }
              });
            });

            homeMealsGenerated = homeCount > 0;
            restaurantMealsGenerated = restaurantCount > 0;

            console.log(`[DashboardContainer] 7-day plan analysis: ${homeCount} home meals, ${restaurantCount} restaurant meals`);

          } else if (mealPlan?.weeklyPlan && Array.isArray(mealPlan.weeklyPlan)) {
            // Legacy format - check for home meals in the weekly plan
            const homeMeals = mealPlan.weeklyPlan.filter(meal => meal.source === 'home');
            homeMealsGenerated = homeMeals.length > 0;

            // Check for restaurant meals in legacy format
            const restaurantMeals = mealPlan.weeklyPlan.filter(meal => meal.source === 'restaurant');
            restaurantMealsGenerated = restaurantMeals.length > 0;
          }

          // Check for restaurant meals
          if (mealPlan?.restaurantMeals && Array.isArray(mealPlan.restaurantMeals)) {
            restaurantMealsGenerated = mealPlan.restaurantMeals.length > 0;
            restaurantsDiscovered = restaurantMealsGenerated;
          } else {
            // Check meal plan metadata for restaurant status
            const metadata = mealPlan?.metadata || mealsData.mealPlan?.userContext?.metadata;
            if (metadata?.restaurantsStatus === 'pending') {
              restaurantsDiscovered = false;
              restaurantMealsGenerated = false;
            } else if (metadata?.restaurantsStatus === 'completed') {
              restaurantsDiscovered = true;
              restaurantMealsGenerated = true;
            } else {
              // Legacy check - assume complete if meals exist
              restaurantsDiscovered = mealsGenerated;
              restaurantMealsGenerated = mealsGenerated;
            }
          }
        } catch (parseError) {
          console.error('Failed to parse meals data:', parseError);
          // Fallback to legacy behavior
          restaurantsDiscovered = mealsGenerated;
          homeMealsGenerated = mealsGenerated;
          restaurantMealsGenerated = mealsGenerated;
        }
      }

      console.log(`Generation status: meals=${mealsGenerated}, workouts=${workoutsGenerated}, home=${homeMealsGenerated}, restaurants=${restaurantMealsGenerated}`);

      setGenerationStatus({
        mealsGenerated,
        workoutsGenerated,
        restaurantsDiscovered,
        homeMealsGenerated,
        restaurantMealsGenerated
      });
    } catch (error) {
      console.error('Failed to check generation status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = async (screen: Screen) => {
    // Don't navigate if already on the same screen
    if (currentScreen === screen) return;

    setNavigating(true);

    // Small delay to show loading state, then switch
    setTimeout(() => {
      setCurrentScreen(screen);
      setNavigating(false);
    }, 100);
  };

  const handleShowPlanningPreview = async (isInitial = false) => {
    setLoadingPreview(true);
    setShowPlanningPreview(true);

    try {
      const response = await fetch('/api/ai/meals/planning-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const result = await response.json();
        setPreviewData(result.data);
        console.log('[DashboardContainer] Preview data loaded:', result.data);
      } else {
        console.error('Failed to generate preview');
        setPreviewData(null);
      }
    } catch (error) {
      console.error('Preview generation failed:', error);
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePreviewClose = () => {
    setShowPlanningPreview(false);
  };

  const handlePreviewApprove = async () => {
    console.log('[DashboardContainer] User approved preview, using existing 7-day meal plan...');

    try {
      setShowPlanningPreview(false);
      await checkGenerationStatus();
      console.log('[DashboardContainer] Using existing 7-day meal plan successfully');
    } catch (error) {
      console.error('[DashboardContainer] Failed to refresh meal plan data:', error);
      setShowPlanningPreview(false);
    }
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
    // Show loading during navigation
    if (navigating) {
      return <LoadingPage />;
    }

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

      {/* Floating Preview Button */}
      {!showPlanningPreview && (
        <button
          onClick={() => handleShowPlanningPreview()}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] hover:from-[#a1232a] hover:to-[#7c3aed] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-40 group"
          title="Quick Preview"
        >
          <UtensilsCrossed className="w-6 h-6" />
        </button>
      )}

      {/* Account Creation Modal */}
      <AccountCreationModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        guestData={{
          email: surveyData?.email,
          firstName: surveyData?.firstName,
          lastName: surveyData?.lastName
        }}
      />

      {/* Meal Planning Preview Modal */}
      <MealPlanningPreview
        isOpen={showPlanningPreview}
        onClose={handlePreviewClose}
        onApprove={handlePreviewApprove}
        data={previewData}
        loading={loadingPreview}
      />
    </>
  );
}