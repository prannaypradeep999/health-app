'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHome } from './DashboardHome';
import { MealPlanPage } from './MealPlanPage';
import { WorkoutPlanPage } from './WorkoutPlanPage';
import { ProgressPage } from './ProgressPage';
import { AccountPage } from './AccountPage';
import { LoadingPage } from './LoadingPage';
import AccountCreationModal from './modals/AccountCreationModal';
import { ForkKnife, Spinner } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { DashboardChat } from '@/components/chat/DashboardChat';

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
  const MAX_DASHBOARD_POLL_ATTEMPTS = 60;
  const router = useRouter();

  // Initialize tab from URL param on client side
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
  const [isEarlyArrival, setIsEarlyArrival] = useState(false);
  const [isWaitingForFreshData, setIsWaitingForFreshData] = useState(false);
  const [mealData, setMealData] = useState<any>(null);
  const [mealPlanTargets, setMealPlanTargets] = useState<any>(null);
  const [mealWeekStatus, setMealWeekStatus] = useState<{ isCurrentWeek: boolean; weekOf?: string; currentWeek?: string } | null>(null);
  const [workoutWeekStatus, setWorkoutWeekStatus] = useState<{ isCurrentWeek: boolean; weekOf?: string; currentWeek?: string } | null>(null);
  const [pollErrorDashboard, setPollErrorDashboard] = useState(false);
  const generationPollAttemptsRef = useRef(0);
  const freshPollAttemptsRef = useRef(0);

  useEffect(() => {
    fetchSurveyData();
    checkGenerationStatus();

    // Check URL params for survey completion or early arrival
    const urlParams = new URLSearchParams(window.location.search);
    const justCompleted = urlParams.get('surveyCompleted');
    const earlyArrival = urlParams.get('earlyArrival');

    console.log('[DashboardContainer] URL params check:', { justCompleted, earlyArrival, href: window.location.href });

    if (justCompleted === 'true') {
      console.log('[DashboardContainer] Survey just completed, waiting for fresh meal plan...');
      setShouldShowInitialPreview(true);
      setIsWaitingForFreshData(true);

      // Don't clean up URL yet - we need to know we're waiting
      // Start aggressive polling for fresh data
      const pollForFreshData = async () => {
        if (freshPollAttemptsRef.current >= MAX_DASHBOARD_POLL_ATTEMPTS) {
          setPollErrorDashboard(true);
          setIsWaitingForFreshData(false);
          return;
        }
        freshPollAttemptsRef.current += 1;
        console.log('[DashboardContainer] Polling for fresh meal plan data...');

        try {
          const response = await fetch('/api/ai/meals/current');
          const data = await response.json();

          if (data.mealPlan) {
            // Check if this is the NEW meal plan (created in last 2 minutes)
            const mealPlanCreatedAt = new Date(data.mealPlan?.planData?.metadata?.createdAt || 0);
            const isRecent = (Date.now() - mealPlanCreatedAt.getTime()) < 120000; // Within last 2 minutes

            console.log('[DashboardContainer] Meal plan check:', {
              found: true,
              createdAt: mealPlanCreatedAt.toISOString(),
              isRecent,
              ageSeconds: (Date.now() - mealPlanCreatedAt.getTime()) / 1000
            });

            if (isRecent) {
              console.log('[DashboardContainer] ✅ Fresh meal plan received!');
              setIsWaitingForFreshData(false);
              setMealData(data);
              setMealPlanTargets(data.mealPlan?.nutritionTargets || null);
              freshPollAttemptsRef.current = 0;
              if (typeof data.isCurrentWeek === 'boolean') {
                setMealWeekStatus({
                  isCurrentWeek: data.isCurrentWeek,
                  weekOf: data.weekOf,
                  currentWeek: data.currentWeek
                });
              }
              // Now clean up URL
              window.history.replaceState({}, '', window.location.pathname);
              return;
            }
          }

          console.log('[DashboardContainer] Still waiting for fresh data...');
          // Keep polling more frequently for fresh data
          setTimeout(pollForFreshData, 2000);

        } catch (error) {
          console.error('[DashboardContainer] Error polling for fresh data:', error);
          // Keep trying
          setTimeout(pollForFreshData, 3000);
        }
      };

      // Start polling immediately
      pollForFreshData();
    } else if (earlyArrival === 'true') {
      console.log('[DashboardContainer] Early arrival - generation still in progress');
      setIsEarlyArrival(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      console.log('[DashboardContainer] No special flags found');
    }
  }, []);

  // Removed auto-modal - keep banner only for less intrusive UX

  useEffect(() => {
    // Poll for generation status updates - different intervals based on what's still pending
    const shouldPoll = !generationStatus.mealsGenerated ||
                      !generationStatus.workoutsGenerated ||
                      (generationStatus.homeMealsGenerated && !generationStatus.restaurantMealsGenerated);

    if (shouldPoll && !pollErrorDashboard) {
      // More frequent polling if restaurants are still being discovered
      const pollFrequency = generationStatus.homeMealsGenerated && !generationStatus.restaurantMealsGenerated ? 3000 : 5000;

      const pollInterval = setInterval(() => {
        if (generationPollAttemptsRef.current >= MAX_DASHBOARD_POLL_ATTEMPTS) {
          setPollErrorDashboard(true);
          clearInterval(pollInterval);
          return;
        }
        generationPollAttemptsRef.current += 1;
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
  }, [generationStatus.mealsGenerated, generationStatus.workoutsGenerated, generationStatus.homeMealsGenerated, generationStatus.restaurantMealsGenerated, pollErrorDashboard]);

  useEffect(() => {
    if (generationStatus.mealsGenerated && generationStatus.workoutsGenerated) {
      generationPollAttemptsRef.current = 0;
    }
  }, [generationStatus.mealsGenerated, generationStatus.workoutsGenerated]);

  // Read tab param from URL on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      const validTabs: Screen[] = ['dashboard', 'meal-plan', 'workout-plan', 'progress', 'account'];

      if (tabParam && validTabs.includes(tabParam as Screen)) {
        setCurrentScreen(tabParam as Screen);
      }
    }
  }, []);

  const fetchSurveyData = async () => {
    try {
      console.log('[DASHBOARD-CONTAINER] 🔍 Fetching survey data...');
      const response = await fetch('/api/survey');
      console.log('[DASHBOARD-CONTAINER] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[DASHBOARD-CONTAINER] 📋 Survey data received:', {
          hasData: !!data.survey,
          surveyId: data.survey?.id,
          firstName: data.survey?.firstName,
          age: data.survey?.age,
          weight: data.survey?.weight,
          height: data.survey?.height,
          sex: data.survey?.sex,
          goal: data.survey?.goal,
          activityLevel: data.survey?.activityLevel,
          isGuest: data.survey?.isGuest
        });

        // Check for missing critical fields
        const missingFields = [];
        if (!data.survey?.age) missingFields.push('age');
        if (!data.survey?.weight) missingFields.push('weight');
        if (!data.survey?.height) missingFields.push('height');
        if (!data.survey?.sex) missingFields.push('sex');

        if (missingFields.length > 0) {
          console.error('[DASHBOARD-CONTAINER] ⚠️ MISSING CRITICAL FIELDS:', missingFields);
        }

        setSurveyData(data.survey);

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
          setMealPlanTargets(mealsData.mealPlan?.nutritionTargets || null);
          if (typeof mealsData.isCurrentWeek === 'boolean') {
            setMealWeekStatus({
              isCurrentWeek: mealsData.isCurrentWeek,
              weekOf: mealsData.weekOf,
              currentWeek: mealsData.currentWeek
            });
          }
          const mealPlan = mealsData.mealPlan?.planData;

          // Check for 7-day structured format first
          if (mealPlan?.days && Array.isArray(mealPlan.days)) {
            console.log(`[DashboardContainer] Detected 7-day structured meal plan with ${mealPlan.days.length} days`);

            // Check each day for home and restaurant meals
            let homeCount = 0;
            let restaurantCount = 0;

            mealPlan.days.forEach((day: any) => {
              Object.values(day.meals || {}).forEach((meal: any) => {
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
            const homeMeals = mealPlan.weeklyPlan.filter((meal: any) => meal.source === 'home');
            homeMealsGenerated = homeMeals.length > 0;

            // Check for restaurant meals in legacy format
            const restaurantMeals = mealPlan.weeklyPlan.filter((meal: any) => meal.source === 'restaurant');
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

      if (workoutsGenerated) {
        try {
          const workoutsData = await workoutsResponse.json();
          if (typeof workoutsData.isCurrentWeek === 'boolean') {
            setWorkoutWeekStatus({
              isCurrentWeek: workoutsData.isCurrentWeek,
              weekOf: workoutsData.weekOf,
              currentWeek: workoutsData.currentWeek
            });
          }
        } catch (parseError) {
          console.error('Failed to parse workouts data:', parseError);
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

  const handleNavigate = (screen: string) => {
    if (!['dashboard', 'meal-plan', 'workout-plan', 'progress', 'account'].includes(screen)) {
      return;
    }
    const nextScreen = screen as Screen;
    // Don't navigate if already on the same screen
    if (currentScreen === nextScreen) return;

    setNavigating(true);

    // Update URL with tab parameter (dashboard home uses clean URL)
    const newUrl = nextScreen === 'dashboard'
      ? '/dashboard'
      : `/dashboard?tab=${nextScreen}`;
    router.replace(newUrl);

    // Small delay to show loading state, then switch
    setTimeout(() => {
      setCurrentScreen(nextScreen);
      setNavigating(false);
    }, 100);
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

  const userData = {
    name: `${surveyData.firstName} ${surveyData.lastName}`,
    email: surveyData.email,
    location: `${surveyData.city}, ${surveyData.state}`,
    zipCode: surveyData.zipCode,
    goal: surveyData.goal,
    activityLevel: surveyData.activityLevel,
    calorieTarget: mealPlanTargets?.dailyCalories ?? null,
    macroTargets: mealPlanTargets ? {
      calories: mealPlanTargets.dailyCalories,
      protein: mealPlanTargets.dailyProtein,
      carbs: mealPlanTargets.dailyCarbs,
      fat: mealPlanTargets.dailyFat
    } : null,
    activeSurvey: surveyData
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
            nutritionTargets={mealPlanTargets}
            isGuest={surveyData?.isGuest}
            onShowAccountModal={() => setShowAccountModal(true)}
          />
        );
      case 'meal-plan':
        return (
          <MealPlanPage
            onNavigate={handleNavigate}
            generationStatus={generationStatus}
            nutritionTargets={mealPlanTargets}
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
            user={userData}
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
    <DashboardChat userName={surveyData?.firstName}>
      <div className="min-h-screen bg-gray-50">
        {/* Status Banners */}
        {pollErrorDashboard && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="bg-red-50 border-b border-red-100 px-4 py-3"
          >
            <div className="flex items-center justify-center gap-2 text-red-800 text-sm">
              Having trouble loading your plan. Please refresh or check back soon.
            </div>
          </motion.div>
        )}
        {(() => {
          const hasStaleMeal = mealWeekStatus && mealWeekStatus.isCurrentWeek === false;
          const hasStaleWorkout = workoutWeekStatus && workoutWeekStatus.isCurrentWeek === false;
          if (!hasStaleMeal && !hasStaleWorkout) return null;
          const weekOfLabel = mealWeekStatus?.weekOf || workoutWeekStatus?.weekOf || 'a previous week';
          return (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="bg-blue-50 border-b border-blue-100 px-4 py-3"
            >
              <div className="flex items-center justify-center gap-2 text-blue-800 text-sm">
                Your plan is from week of {weekOfLabel}. New plans coming soon.
              </div>
            </motion.div>
          );
        })()}
        {/* Early Arrival Progress Banner */}
        {isEarlyArrival && (!generationStatus.mealsGenerated || !generationStatus.workoutsGenerated) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="bg-amber-50 border-b border-amber-100 px-4 py-3"
          >
            <div className="flex items-center justify-center gap-2 text-amber-800">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              >
                <Spinner size={14} />
              </motion.div>
              <span className="text-sm font-medium">
                Still generating your personalized plan...
              </span>
            </div>
          </motion.div>
        )}

        {/* Main Dashboard Content */}
        <div className="bg-gray-50">
          {renderScreen()}
        </div>


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

      </div>
    </DashboardChat>
  );
}