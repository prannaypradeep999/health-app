'use client';

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  ArrowLeft,
  Clock,
  Star,
  Heart,
  ArrowSquareOut,
  House,
  ChartLineUp,
  Target,
  ForkKnife,
  Barbell,
  UserCircle,
  MapPin,
  Plus,
  Calendar,
  ShoppingCart,
  X,
  CheckCircle,
} from "@phosphor-icons/react";
import { ArrowLeftRight } from "lucide-react";
import MealLogModal from "./modals/MealLogModal";
import { GroceryListSection } from './GroceryListSection';
import { RestaurantListSection } from './RestaurantListSection';
import { MealSwapDialog } from './MealSwapDialog';
import { collectAllMeals, CollectedMeal } from '@/lib/utils/meal-utils';
import Logo from '@/components/logo';
import { getPlanDayIndex, getCurrentMealPeriod, getPlanDays, getDayStatus, isPlanExpired, getBrowserTimezone, type MealPeriod } from '@/lib/utils/date-utils';

const getMealStorageKey = (mealPlanId?: string, surveyId?: string, weekNumber?: number) => {
  if (mealPlanId) return `eatenMeals:${mealPlanId}`;
  if (surveyId) return `eatenMeals:${surveyId}:${weekNumber || 1}`;
  return null;
};

const getLoggedMealsStorageKey = (mealPlanId?: string, surveyId?: string, weekNumber?: number) => {
  if (mealPlanId) return `loggedMeals:${mealPlanId}`;
  if (surveyId) return `loggedMeals:${surveyId}:${weekNumber || 1}`;
  return null;
};

interface MealPlanPageProps {
  onNavigate: (screen: string) => void;
  generationStatus: {
    mealsGenerated: boolean;
    workoutsGenerated: boolean;
    restaurantsDiscovered: boolean;
  };
  isGuest?: boolean;
  onShowAccountModal?: () => void;
  nutritionTargets?: {
    dailyCalories: number;
    dailyProtein: number;
    dailyCarbs: number;
    dailyFat: number;
  } | null;
}

export function MealPlanPage({ onNavigate, generationStatus, nutritionTargets: nutritionTargetsProp }: MealPlanPageProps) {
  const [selectedDay, setSelectedDay] = useState('');
  const [mealData, setMealData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nutritionTargets, setNutritionTargets] = useState<any>(null);
  const [eatenMeals, setEatenMeals] = useState<{[dayMealKey: string]: boolean}>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [loggedMeals, setLoggedMeals] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'meals' | 'grocery' | 'restaurants'>('meals');
  const [checkedGroceryItems, setCheckedGroceryItems] = useState<{[key: string]: boolean}>({});
  const [selectedMealOptions, setSelectedMealOptions] = useState<{[key: string]: any}>({});

  // Swap dialog state
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{
    day: string;
    mealType: string;
    name: string;
  } | null>(null);

  // Recipe modal state - lifted to parent to prevent reset on re-render
  const [activeRecipeModal, setActiveRecipeModal] = useState<{
    mealType: string;
    recipeData: any;
  } | null>(null);

  // Loading state for recipe generation - also lifted to parent
  const [loadingRecipeMeal, setLoadingRecipeMeal] = useState<string | null>(null);

  // ADD: Meal feedback state
  const [mealFeedback, setMealFeedback] = useState<{
    [mealOptionId: string]: 'loved' | 'disliked' | 'neutral' | null
  }>({});
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null);

  const [userTimezone] = useState(() => getBrowserTimezone());
  const planStartDate = mealData?.mealPlan?.startDate || mealData?.mealPlan?.generatedAt;
  const currentDayIndex = planStartDate ? getPlanDayIndex(planStartDate, userTimezone) : 0;
  const currentMealPeriod = getCurrentMealPeriod(userTimezone);
  const planExpired = planStartDate ? isPlanExpired(planStartDate, userTimezone) : false;
  const days = planStartDate ? getPlanDays(planStartDate) : [];

  // Extract IDs for database persistence
  const surveyId = mealData?.mealPlan?.surveyId;
  const mealPlanId = mealData?.mealPlan?.id;
  const weekNumber = mealData?.mealPlan?.weekNumber || 1;
  const mealStorageKey = getMealStorageKey(mealPlanId, surveyId, weekNumber);
  const loggedMealsStorageKey = getLoggedMealsStorageKey(mealPlanId, surveyId, weekNumber);

  // Get logged meals for a specific meal type and day
  const getLoggedMealsForType = (mealType: string, day: string) => {
    return loggedMeals.filter(
      meal => meal.mealType === mealType && meal.day === day
    );
  };

  // Render a logged meal card
  const renderLoggedMealCard = (meal: any) => (
    <div key={meal.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full">Logged</span>
            <h4 className="font-semibold text-gray-900">{meal.mealName}</h4>
          </div>
          {meal.description && (
            <p className="text-sm text-gray-600 mb-2">{meal.description}</p>
          )}
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span className="font-medium text-amber-700">{meal.calories} cal</span>
            <span>{meal.protein}g protein</span>
            <span>{meal.carbs}g carbs</span>
            <span>{meal.fat}g fat</span>
            <span>{meal.time}</span>
          </div>
          {meal.notes && (
            <p className="text-xs text-gray-500 mt-1 italic">{meal.notes}</p>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {meal.completed && (
            <span className="text-xs text-green-600 font-medium">✓ Eaten</span>
          )}
          <button
            onClick={() => deleteMeal(meal.id)}
            className="p-1 hover:bg-amber-100 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );

  // Get selected option for a specific meal
  const getSelectedOption = (day: string, mealType: string): 'primary' | 'alternative' => {
    const selection = selectedMealOptions[`${day}-${mealType}`];
    if (selection?.isCustomSwap) {
      return 'primary'; // Default for UI display, actual meal comes from getMealForSlot
    }
    return selection || 'primary';
  };

  // Get the meal to display for a given slot (handles both normal toggle and custom swaps)
  const getMealForSlot = (day: string, mealType: string) => {
    const key = `${day}-${mealType}`;
    const selection = selectedMealOptions[key];

    if (selection?.isCustomSwap) {
      // Find the swapped meal from source
      const sourceMeal = allMeals.find(m =>
        m.day === selection.sourceDay &&
        m.mealType === selection.sourceMealType &&
        m.option === selection.sourceOption
      );
      return sourceMeal?.originalData;
    }

    // Default: use primary or alternative based on simple toggle
    const dayData = mealData?.mealPlan?.planData?.days?.find((d: any) => d.day === day);
    const mealSlot = dayData?.meals?.[mealType];

    if (selection === 'alternative' && mealSlot?.alternative) {
      return mealSlot.alternative;
    }

    return mealSlot?.primary;
  };

  // Toggle selected option for a specific meal
  const toggleMealOption = (day: string, mealType: string) => {
    const key = `${day}-${mealType}`;
    setSelectedMealOptions(prev => ({
      ...prev,
      [key]: prev[key] === 'alternative' ? 'primary' : 'alternative'
    }));
  };

  // Collect all available meals for swap dialog
  const allMeals = useMemo(() => {
    if (!mealData?.mealPlan?.planData) return [];
    return collectAllMeals(mealData.mealPlan.planData);
  }, [mealData]);

  // Open swap dialog
  const openSwapDialog = (day: string, mealType: string, currentMealName: string) => {
    setSwapTarget({ day, mealType, name: currentMealName });
    setSwapDialogOpen(true);
  };

  // Handle swap
  const handleSwap = async (selectedMeal: CollectedMeal) => {
    if (!swapTarget) return;

    // Update local state
    const swapKey = `${swapTarget.day}-${swapTarget.mealType}`;
    const newSelectedOptions = {
      ...selectedMealOptions,
      [swapKey]: {
        sourceDay: selectedMeal.day,
        sourceMealType: selectedMeal.mealType,
        sourceOption: selectedMeal.option,
        // This indicates a cross-meal swap, not just primary/alternative
        isCustomSwap: true,
      }
    };
    setSelectedMealOptions(newSelectedOptions);

    // Persist to API
    await persistSwapSelection(newSelectedOptions);

    // Close dialog
    setSwapDialogOpen(false);
    setSwapTarget(null);
  };

  // Persist swaps to userContext
  const persistSwapSelection = async (selections: any) => {
    try {
      await fetch('/api/ai/meals/update-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealPlanId: mealData?.mealPlan?.id,
          selectedMealOptions: selections,
        }),
      });
    } catch (error) {
      console.error('Failed to persist swap selection:', error);
    }
  };

  useEffect(() => {
    if (generationStatus.mealsGenerated) {
      fetchMealData();
    } else {
      setLoading(false);
    }

    if (mealStorageKey) {
      setEatenMeals({});
      const savedEatenMeals = localStorage.getItem(mealStorageKey);
      if (savedEatenMeals) {
        const parsed = JSON.parse(savedEatenMeals);
        console.log('[MealPlan] Loaded eaten meals:', Object.keys(parsed).length);
        setEatenMeals(parsed);
      }
    }

    if (loggedMealsStorageKey) {
      setLoggedMeals([]);
      const savedLoggedMeals = localStorage.getItem(loggedMealsStorageKey);
      if (savedLoggedMeals) {
        const parsed = JSON.parse(savedLoggedMeals);
        console.log('[MealPlan] Loaded logged meals:', parsed.length);
        setLoggedMeals(parsed);
      }
    }

    setIsInitialized(true);

    // Listen for localStorage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (mealStorageKey && e.key === mealStorageKey && e.newValue) {
        console.log('[MealPlan] Updated from storage');
        setEatenMeals(JSON.parse(e.newValue));
      }
    };

    // Listen for custom events from same tab (dashboard)
    const handleEatenMealsUpdate = (e: CustomEvent) => {
      console.log('[MealPlan] Update event received');
      // Only update if the new state is different and has content
      if (e.detail?.storageKey === mealStorageKey && e.detail?.data) {
        if (Object.keys(e.detail.data).length > 0) {
          setEatenMeals(e.detail.data);
        }
      }
    };

    // Listen for logged meals updates from other components
    const handleLoggedMealsUpdate = (e: CustomEvent) => {
      console.log('[MealPlan] Logged meals update received');
      if (e.detail?.storageKey === loggedMealsStorageKey && e.detail?.data) {
        setLoggedMeals(e.detail.data);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('eatenMealsUpdate', handleEatenMealsUpdate as EventListener);
    window.addEventListener('loggedMealsUpdate', handleLoggedMealsUpdate as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('eatenMealsUpdate', handleEatenMealsUpdate as EventListener);
      window.removeEventListener('loggedMealsUpdate', handleLoggedMealsUpdate as EventListener);
    };
  }, [generationStatus.mealsGenerated, mealStorageKey, loggedMealsStorageKey]);

  // Load existing feedback for current week's meals
  useEffect(() => {
    const loadExistingFeedback = async () => {
      if (!mealData?.mealPlan?.planData?.days) return;

      try {
        // Get all meal option IDs from current plan
        const mealOptionIds: string[] = [];
        mealData.mealPlan.planData.days.forEach((day: any) => {
          if (day.meals) {
            Object.values(day.meals).forEach((meal: any) => {
              if (meal?.primary?.id) mealOptionIds.push(meal.primary.id);
              if (meal?.alternative?.id) mealOptionIds.push(meal.alternative.id);
            });
          }
        });

        if (mealOptionIds.length === 0) return;

        // Query feedback for these IDs
        const response = await fetch('/api/meals/feedback/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mealOptionIds })
        });

        if (response.ok) {
          const data = await response.json();
          setMealFeedback(data.feedback || {});
        }
      } catch (error) {
        console.error('[Feedback] Failed to load existing:', error);
      }
    };

    loadExistingFeedback();
  }, [mealData?.mealPlan?.planData?.days]);

  // Auto-select current day when meal data loads
  useEffect(() => {
    if (planStartDate && days.length > 0 && !selectedDay) {
      const currentDayIndex = getPlanDayIndex(planStartDate, userTimezone);

      // If plan is not expired and current day is valid, select it
      if (!planExpired && currentDayIndex >= 0 && currentDayIndex < days.length) {
        setSelectedDay(days[currentDayIndex].id);
        console.log(`[MealPlan] Auto-selected current day: ${days[currentDayIndex].id} (day ${currentDayIndex + 1})`);
      } else {
        // Fallback to first day for expired plans or out-of-range
        setSelectedDay(days[0].id);
        console.log(`[MealPlan] Auto-selected first day: ${days[0].id}`);
      }
    }
  }, [planStartDate, days, userTimezone, planExpired, selectedDay]);

  // Load meal consumption from database on mount
  useEffect(() => {
    const loadMealConsumption = async () => {
      if (!surveyId) return;

      try {
        const response = await fetch(`/api/meals/consume?surveyId=${surveyId}&weekNumber=${weekNumber}&mealPlanId=${mealPlanId || ''}`);
        if (response.ok) {
          const data = await response.json();

          // Build eatenMeals state from database records
          const dbEatenMeals: Record<string, boolean> = {};
          data.allMealLogs?.forEach((log: any) => {
            const key = `${log.day}-${log.mealType}-${log.optionType || 'primary'}-0`;
            dbEatenMeals[key] = log.wasEaten;
          });

          // Merge with localStorage (prefer DB state)
          const localEatenMeals = mealStorageKey
            ? JSON.parse(localStorage.getItem(mealStorageKey) || '{}')
            : {};
          const merged = { ...localEatenMeals, ...dbEatenMeals };

          setEatenMeals(merged);
          if (mealStorageKey) {
            localStorage.setItem(mealStorageKey, JSON.stringify(merged));
            localStorage.setItem('currentMealStorageKey', mealStorageKey);
          }

          console.log('[MEAL-PLAN] Loaded meal consumption from DB:', data.stats);
        }
      } catch (err) {
        console.error('[MEAL-PLAN] Failed to load consumption:', err);
      }
    };

    if (surveyId && mealData) {
      loadMealConsumption();
    }
  }, [surveyId, mealData, weekNumber]);

  // Save eaten meals to localStorage whenever it changes (same as dashboard)
  useEffect(() => {
    // Only save and dispatch if we're initialized and have some data
    if (isInitialized && mealStorageKey && Object.keys(eatenMeals).length > 0) {
      console.log('[MealPlan] Saving eaten meals:', Object.keys(eatenMeals).length);
      localStorage.setItem(mealStorageKey, JSON.stringify(eatenMeals));
      localStorage.setItem('currentMealStorageKey', mealStorageKey);

      const event = new CustomEvent('eatenMealsUpdate', {
        detail: { storageKey: mealStorageKey, data: eatenMeals }
      });
      window.dispatchEvent(event);
    }
  }, [eatenMeals, isInitialized, mealStorageKey]);

  const fetchMealData = async () => {
    try {
      const response = await fetch('/api/ai/meals/current');
      if (response.ok) {
        const data = await response.json();
        setMealData(data);
        setNutritionTargets(data.mealPlan?.nutritionTargets);
        console.log('[MealPlan] Fetched meal data for', data.mealPlan?.planData?.days?.length || 0, 'days');
      }
    } catch (error) {
      console.error('Failed to fetch meal data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load persisted swaps when meal data loads
  useEffect(() => {
    if (mealData?.mealPlan?.userContext?.selectedMealOptions) {
      setSelectedMealOptions(mealData.mealPlan.userContext.selectedMealOptions);
    }
  }, [mealData]);

  // Get current day's meals - 7-day structured format only
  const getCurrentMeals = () => {
    if (mealData && mealData.mealPlan && mealData.mealPlan.planData && mealData.mealPlan.planData.days) {
      // Use getMealForSlot to get the correct meal (handles swaps and selections)
      return {
        breakfast: {
          primary: getMealForSlot(selectedDay, 'breakfast', 'primary'),
          alternative: getMealForSlot(selectedDay, 'breakfast', 'alternative')
        },
        lunch: {
          primary: getMealForSlot(selectedDay, 'lunch', 'primary'),
          alternative: getMealForSlot(selectedDay, 'lunch', 'alternative')
        },
        dinner: {
          primary: getMealForSlot(selectedDay, 'dinner', 'primary'),
          alternative: getMealForSlot(selectedDay, 'dinner', 'alternative')
        }
      };
    }

    // No real meal data available
    return {
      breakfast: null,
      lunch: null,
      dinner: null
    };
  };

  // Handle grocery item toggle
  const handleGroceryItemToggle = (category: string, index: number) => {
    const itemKey = `${category}-${index}`;
    setCheckedGroceryItems(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  const currentMeals = getCurrentMeals();
  const resolvedTargets = nutritionTargetsProp || nutritionTargets;
  const mealTargets = (resolvedTargets as any)?.mealTargets || (mealData?.mealPlan?.planData as any)?.nutritionTargets?.mealTargets || null;
  const dailySummaries = mealData?.mealPlan?.dailySummaries || null;

  const getPlannedCaloriesForDay = (dayId: string) => {
    const dayData = mealData?.mealPlan?.planData?.days?.find((day: any) => day.day === dayId);
    if (!dayData?.meals) return 0;

    let total = 0;
    (['breakfast', 'lunch', 'dinner'] as const).forEach(mealType => {
      const meal = dayData.meals?.[mealType];
      if (!meal) return;
      const selected = getSelectedOption(dayId, mealType);
      const option = meal[selected] || meal.primary || meal.alternative;
      if (option) {
        total += option.calories ?? option.estimatedCalories ?? 0;
      }
    });

    return total;
  };

  const getDaySummary = (dayId: string) => {
    if (!Array.isArray(dailySummaries)) return null;
    return dailySummaries.find((summary: any) => summary.day === dayId) || null;
  };

  const getMealTargetCalories = (mealType: string) => {
    const target = mealTargets?.[mealType]?.calories;
    return typeof target === 'number' ? target : null;
  };

  const isMealSkippedForDay = (dayId: string, mealType: string) => {
    const dayData = mealData?.mealPlan?.planData?.days?.find((day: any) => day.day === dayId);
    return dayData?.plannedMeals?.[mealType] === 'no-meal';
  };

  // Calculate totals based on selected meals for current day
  const getTotalCalories = () => {
    let total = 0;

    // Try both data structures (weeklyPlan and days)
    let dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    // Also check days structure
    if (!dayData) {
      dayData = mealData?.mealPlan?.planData?.days?.find((day: any) => day.day === selectedDay);
    }

    if (dayData) {
      // Check all possible eaten meal options for each meal type
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType] || dayData.meals?.[mealType];

        // Check primary option
        if (isMealEaten(mealType, 0, 'primary')) {
          total += meal?.primary?.calories ?? meal?.primary?.estimatedCalories ?? 0;
        }

        // Check alternative option
        if (isMealEaten(mealType, 0, 'alternative')) {
          total += meal?.alternative?.calories ?? meal?.alternative?.estimatedCalories ?? 0;
        }
      });
    }

    // Add logged meals for the selected day
    loggedMeals
      .filter(meal => meal.day === selectedDay && meal.completed)
      .forEach(meal => {
        total += meal.calories ?? 0;
      });

    return total;
  };

  // Calculate total protein for the selected day
  const getTotalProtein = () => {
    let total = 0;

    // Try both data structures
    let dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    if (!dayData) {
      dayData = mealData?.mealPlan?.planData?.days?.find((day: any) => day.day === selectedDay);
    }

    if (dayData) {
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType] || dayData.meals?.[mealType];

        // Check primary option
        if (meal?.primary?.protein && isMealEaten(mealType, 0, 'primary')) {
          total += meal.primary.protein;
        }

        // Check alternative option
        if (meal?.alternative?.protein && isMealEaten(mealType, 0, 'alternative')) {
          total += meal.alternative.protein;
        }
      });
    }

    // Add logged meals for the selected day
    loggedMeals
      .filter(meal => meal.day === selectedDay && meal.completed)
      .forEach(meal => {
        total += meal.protein || 0;
      });

    return Math.round(total);
  };

  // Calculate total carbs for the selected day
  const getTotalCarbs = () => {
    let total = 0;

    const dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    if (dayData) {
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType];

        // Check primary option
        if (meal?.primary?.carbs && isMealEaten(mealType, 0, 'primary')) {
          total += meal.primary.carbs;
        }

        // Check alternative options
        meal?.alternatives?.forEach((alt: any, index: number) => {
          if (alt?.carbs && isMealEaten(mealType, index, 'alternative')) {
            total += alt.carbs;
          }
        });
      });
    }

    return Math.round(total);
  };

  // Calculate total fat for the selected day
  const getTotalFat = () => {
    let total = 0;

    const dayData = mealData?.mealPlan?.planData?.weeklyPlan?.find((day: any) => {
      const selectedDayInfo = days.find(d => d.id === selectedDay);
      return day.day === selectedDayInfo?.dayNumber;
    });

    if (dayData) {
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const meal = dayData[mealType];

        // Check primary option
        if (meal?.primary?.fat && isMealEaten(mealType, 0, 'primary')) {
          total += meal.primary.fat;
        }

        // Check alternative options
        meal?.alternatives?.forEach((alt: any, index: number) => {
          if (alt?.fat && isMealEaten(mealType, index, 'alternative')) {
            total += alt.fat;
          }
        });
      });
    }

    return Math.round(total);
  };

  // Toggle meal eaten status for specific meal option
  const toggleMealEaten = async (mealType: string, optionIndex: number = 0, optionType: 'primary' | 'alternative' = 'primary') => {
    const mealKey = `${selectedDay}-${mealType}-${optionType}-${optionIndex}`;
    const newEatenState = !eatenMeals[mealKey];

    // Update localStorage immediately for fast UI
    setEatenMeals(prev => {
      const newState = { ...prev, [mealKey]: newEatenState };
      if (mealStorageKey) {
        localStorage.setItem(mealStorageKey, JSON.stringify(newState));
        localStorage.setItem('currentMealStorageKey', mealStorageKey);
      }
      return newState;
    });

    // Get meal details for the API
    const dayData = mealData?.mealPlan?.planData?.days?.find((d: any) => d.day === selectedDay);
    const mealData_inner = dayData?.meals?.[mealType];
    const meal = optionType === 'primary' ? mealData_inner?.primary : mealData_inner?.alternative;

    // Save to database (fire and forget - don't block UI)
    if (surveyId) {
      fetch('/api/meals/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyId,
          mealPlanId,
          weekNumber,
          day: selectedDay,
          mealType,
          optionType,
          mealName: meal?.name || meal?.dish || `${mealType} meal`,
          calories: meal?.estimatedCalories || meal?.calories || 0,
          protein: meal?.protein || 0,
          carbs: meal?.carbs || 0,
          fat: meal?.fat || 0,
          source: meal?.source || (meal?.restaurant ? 'restaurant' : 'home'),
          restaurantName: meal?.restaurant || null,
          wasEaten: newEatenState
        })
      }).catch(err => console.error('[MEAL-CONSUME] API Error:', err));
    }

    // Dispatch event for other components
    const event = new CustomEvent('eatenMealsUpdate', {
      detail: {
        storageKey: mealStorageKey,
        data: { ...eatenMeals, [mealKey]: newEatenState }
      }
    });
    window.dispatchEvent(event);

    // Show feedback prompt after marking as eaten (not unmarking)
    if (newEatenState) {
      // Get the meal option ID for feedback
      const meals = getCurrentMeals();
      const mealOption = meals[mealType as keyof typeof meals];
      let mealOptionId = null;

      if (mealOption && mealOption[optionType]) {
        mealOptionId = mealOption[optionType].id;
      }

      if (mealOptionId) {
        setTimeout(() => {
          setShowFeedbackFor(mealOptionId);
        }, 300);
      }
    }
  };

  // Check if a specific meal option is eaten
  const isMealEaten = (mealType: string, optionIndex: number = 0, optionType: 'primary' | 'alternative' = 'primary') => {
    const mealKey = `${selectedDay}-${mealType}-${optionType}-${optionIndex}`;
    return eatenMeals[mealKey] || false;
  };

  // Handle meal logging
  const handleMealLog = (mealData: any) => {
    const newMeal = {
      ...mealData,
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      loggedAt: new Date().toISOString()
    };

    setLoggedMeals(prev => {
      const updated = [newMeal, ...prev];
      if (loggedMealsStorageKey) {
        localStorage.setItem(loggedMealsStorageKey, JSON.stringify(updated));
        localStorage.setItem('currentLoggedMealsStorageKey', loggedMealsStorageKey);
      }
      window.dispatchEvent(new CustomEvent('loggedMealsUpdate', {
        detail: { storageKey: loggedMealsStorageKey, data: updated }
      }));
      return updated;
    });
    setShowLogModal(false);
  };

  const deleteMeal = (mealId: string) => {
    setLoggedMeals(prev => {
      const updated = prev.filter(m => m.id !== mealId);
      if (loggedMealsStorageKey) {
        localStorage.setItem(loggedMealsStorageKey, JSON.stringify(updated));
        localStorage.setItem('currentLoggedMealsStorageKey', loggedMealsStorageKey);
      }
      window.dispatchEvent(new CustomEvent('loggedMealsUpdate', {
        detail: { storageKey: loggedMealsStorageKey, data: updated }
      }));
      return updated;
    });
  };

  // Handle meal feedback (Love it / Meh)
  const handleMealFeedback = async (
    mealOptionId: string,
    feedbackType: 'loved' | 'disliked',
    mealInfo: {
      dishName: string;
      restaurantName?: string;
      isHomemade: boolean;
      mealType: string;
      day: string;
    }
  ) => {
    console.log('[MEAL-PLAN] ❤️ Meal reaction:', {
      mealOptionId,
      feedbackType,
      mealType: mealInfo.mealType,
      dishName: mealInfo.dishName,
      restaurantName: mealInfo.restaurantName,
      isHomemade: mealInfo.isHomemade,
      timestamp: new Date().toISOString()
    });

    try {
      // Optimistic update
      setMealFeedback(prev => ({ ...prev, [mealOptionId]: feedbackType }));
      setShowFeedbackFor(null);

      const response = await fetch('/api/meals/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealOptionId,
          feedbackType,
          dishName: mealInfo.dishName,
          restaurantName: mealInfo.restaurantName,
          isHomemade: mealInfo.isHomemade,
          mealType: mealInfo.mealType,
          day: mealInfo.day,
          weekNumber: mealData?.mealPlan?.weekNumber || 1,
          weekOf: mealData?.mealPlan?.weekOf
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save feedback');
      }

      const data = await response.json();
      console.log('[Feedback]', data.message);
    } catch (error) {
      console.error('[Feedback] Error:', error);
      // Revert on error
      setMealFeedback(prev => ({ ...prev, [mealOptionId]: null }));
    }
  };

  const totalCalories = getTotalCalories();

  // Star Rating Component
  const StarRating = ({
    dishName,
    restaurantName,
    mealType,
    day,
    weekNumber: wn
  }: {
    dishName: string;
    restaurantName?: string;
    mealType: string;
    day: string;
    weekNumber?: number;
  }) => {
    const mealOptionId = `${day}-${mealType}-${dishName}`;

    // Load existing rating from mealFeedback state (populated on page load)
    const existingFeedback = mealFeedback[mealOptionId];
    const initialRating = existingFeedback === 'loved' ? 5
      : existingFeedback === 'disliked' ? 1
      : existingFeedback === 'neutral' ? 3
      : 0;

    const [rating, setRating] = useState(initialRating);
    const [hover, setHover] = useState(0);
    const [saving, setSaving] = useState(false);

    // Update rating if mealFeedback changes (e.g., loaded from API)
    useEffect(() => {
      if (existingFeedback) {
        const loadedRating = existingFeedback === 'loved' ? 5
          : existingFeedback === 'disliked' ? 1
          : existingFeedback === 'neutral' ? 3
          : 0;
        setRating(loadedRating);
      }
    }, [existingFeedback]);

    // Also check localStorage for ratings
    useEffect(() => {
      const savedRatings = localStorage.getItem('mealRatings');
      if (savedRatings) {
        try {
          const parsed = JSON.parse(savedRatings);
          if (parsed[mealOptionId]) {
            setRating(parsed[mealOptionId]);
          }
        } catch (e) {}
      }
    }, [mealOptionId]);

    const handleRate = async (value: number) => {
      if (saving) return;
      setSaving(true);
      setRating(value);

      try {
        await fetch('/api/meals/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mealOptionId,
            feedbackType: value >= 4 ? 'loved' : value <= 2 ? 'disliked' : 'neutral',
            rating: value,
            dishName,
            restaurantName: restaurantName || null,
            isHomemade: !restaurantName,
            mealType,
            day,
            weekNumber: wn || weekNumber || 1,
            weekOf: new Date().toISOString()
          })
        });

        // Update local mealFeedback state so it persists across renders
        setMealFeedback(prev => ({
          ...prev,
          [mealOptionId]: value >= 4 ? 'loved' : value <= 2 ? 'disliked' : 'neutral'
        }));

        // Save to localStorage as backup
        const savedRatings = JSON.parse(localStorage.getItem('mealRatings') || '{}');
        savedRatings[mealOptionId] = value;
        localStorage.setItem('mealRatings', JSON.stringify(savedRatings));

        console.log(`[RATING] ${dishName}: ${value} stars`);
      } catch (err) {
        console.error('[RATING] Error:', err);
        // Revert on error
        setRating(initialRating);
      }
      setSaving(false);
    };

    return (
      <div className="flex gap-0.5 items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={saving}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => handleRate(star)}
            className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
          >
            <Star
              size={14}
              weight={(hover || rating) >= star ? "fill" : "regular"}
              className={`transition-colors ${
                (hover || rating) >= star
                  ? 'text-yellow-400'
                  : 'text-gray-300 hover:text-yellow-200'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  // Favorite Restaurant Button Component
  const FavoriteButton = ({
    restaurantName,
    cuisine,
    mealOption
  }: {
    restaurantName: string;
    cuisine?: string;
    mealOption: any;
  }) => {
    const [isFavorite, setIsFavorite] = useState(false);

    const toggleFavorite = async () => {
      if (!surveyId) return;
      const newState = !isFavorite;
      setIsFavorite(newState);

      try {
        await fetch('/api/restaurants/favorite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            surveyId,
            restaurantName,
            cuisine,
            isFavorite: newState
          })
        });
      } catch (err) {
        console.error('[FAVORITE] Error:', err);
        setIsFavorite(!newState);
      }
    };

    return (
      <button
        onClick={toggleFavorite}
        className="p-1 rounded-full hover:bg-red-50 transition-colors"
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Heart
          size={16}
          weight={isFavorite ? "fill" : "regular"}
          className={isFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}
        />
      </button>
    );
  };

  const MealCard = ({ meal, type }: { meal: any, type: string }) => {
    const selectedOption = getSelectedOption(selectedDay, type);
    const [userRating, setUserRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);

    if (!meal || !meal.primary) return null;

    // Get the currently selected meal option (supports both toggle and custom swaps)
    const currentMeal = getMealForSlot(selectedDay, type) || (selectedOption === 'primary' ? meal.primary : meal.alternative);
    const hasAlternative = meal.alternative &&
      (meal.alternative.name || meal.alternative.dish) &&
      (meal.alternative.name !== "Alternative not available") &&
      (meal.alternative.dish !== "Alternative not available");

    // Check if this meal has any ordering links (same logic as RestaurantListSection)
    const hasOrderingLinks = (meal: any): boolean => {
      if (!meal) return false;
      const links = meal.orderingLinks || {};
      return !!(
        (links.doordash && links.doordash.trim() !== '') ||
        (links.ubereats && links.ubereats.trim() !== '') ||
        (links.grubhub && links.grubhub.trim() !== '') ||
        (links.direct && links.direct.trim() !== '') ||
        meal.orderingUrl ||
        meal.website ||
        meal.menu_url
      );
    };

    const handleRecipeClick = async (selectedMeal: any) => {
      console.log('🍳 [Recipe] Click started:', selectedMeal?.name || selectedMeal?.dish);

      const isRestaurant = selectedMeal.source === "restaurant";
      const mealName = isRestaurant ? selectedMeal.dish : selectedMeal.name;
      const description = isRestaurant ? selectedMeal.dish_description : selectedMeal.description;

      if (isRestaurant) {
        console.log('🍳 [Recipe] Restaurant meal - opening external link');

        // Check orderingLinks object (same structure used in RestaurantListSection)
        const links = selectedMeal.orderingLinks || {};
        const orderingUrl =
          links.doordash ||
          links.ubereats ||
          links.grubhub ||
          links.direct ||
          // Fallback to legacy fields
          selectedMeal.orderingUrl ||
          selectedMeal.website ||
          selectedMeal.menu_url;

        if (orderingUrl && orderingUrl.trim() !== '') {
          console.log('🍳 [Recipe] Opening ordering link:', orderingUrl);
          // Universal Links will automatically open the app if installed on mobile
          window.open(orderingUrl, '_blank');
        }
        // If no URL found, button shouldn't be shown anyway (see Change 2)
        return;
      }

      if (activeRecipeModal?.mealType === type && activeRecipeModal?.recipeData) {
        console.log('🍳 [Recipe] Using cached recipe');
        // Already showing this recipe
        return;
      }

      setLoadingRecipeMeal(type);
      console.log('🍳 [Recipe] Generating...');
      try {
        // Get grocery list from mealData (available in parent scope)
        const groceryList = mealData?.mealPlan?.groceryList || mealData?.mealPlan?.planData?.groceryList;
        const groceryItems = groceryList?.items?.map((item: any) => item.name || item.ingredient).filter(Boolean) || [];

        const response = await fetch('/api/ai/recipes/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dishName: mealName,
            description: description,
            mealType: type,
            // NEW: Pass nutrition targets from the meal
            nutritionTargets: {
              calories: selectedMeal.calories || 0,
              protein: selectedMeal.protein || 0,
              carbs: selectedMeal.carbs || 0,
              fat: selectedMeal.fat || 0
            },
            // NEW: Pass existing grocery items
            existingGroceryItems: groceryItems,
            // NEW: Pass dietary restrictions if available
            dietaryRestrictions: [] // TODO: Get from user survey if available
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Recipe generation failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.recipe) {
          console.log('🍳 [Recipe] Success! Opening modal');
          setActiveRecipeModal({
            mealType: type,
            recipeData: data.recipe
          });
        } else {
          throw new Error(data.error || 'Failed to generate recipe');
        }
      } catch (error) {
        console.error('🍳 [Recipe] ERROR:', error);
        // Show error to user instead of silent failure
        alert('Failed to generate recipe. Please try again.');
      } finally {
        setLoadingRecipeMeal(null);
        console.log('🍳 [Recipe] Done');
      }
    };

    const handleRating = async (rating: number, mealOption: any) => {
      setUserRating(rating);

      const isRestaurant = mealOption.source === "restaurant";
      const dishName = isRestaurant ? mealOption.dish : mealOption.name;

      try {
        await fetch('/api/meals/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mealOptionId: `${selectedDay}-${type}-${dishName}`,
            feedbackType: rating >= 4 ? 'loved' : rating <= 2 ? 'disliked' : 'neutral',
            dishName,
            restaurantName: isRestaurant ? mealOption.restaurant : null,
            isHomemade: !isRestaurant,
            mealType: type,
            day: selectedDay,
            weekNumber: weekNumber || 1,
            weekOf: new Date().toISOString(),
            rating: rating
          })
        });
      } catch (err) {
        console.error('[RATING] Error saving rating:', err);
      }
    };

    // NEW: Handle option toggle
    const toggleOption = () => {
      toggleMealOption(selectedDay, type);
      // Reset recipe data when switching options
      if (activeRecipeModal?.mealType === type) {
        setActiveRecipeModal(null);
      }
    };

    const SingleMealOption = ({
      mealOption,
      isAlternative = false,
      optionIndex = 0,
      optionType = 'primary'
    }: {
      mealOption: any,
      isAlternative?: boolean,
      optionIndex?: number,
      optionType?: 'primary' | 'alternative'
    }) => {
      const isRestaurant = mealOption.source === "restaurant";
      const mealName = isRestaurant ? mealOption.dish : mealOption.name;
      const description = isRestaurant ?
        (mealOption.dish_description || mealOption.description) :
        (mealOption.description || mealOption.dish_description);

      // Get goal reasoning and customer feedback from API
      const goalReasoning = mealOption.goalReasoning;
      const customerFeedback = isRestaurant ? mealOption.restaurant_description : null;

      return (
        <div className={`flex items-start space-x-4 p-4 bg-white border rounded-lg hover:shadow-sm transition-shadow ${isAlternative ? 'border-gray-200' : 'border-purple-200'}`}>
          {/* Image - Left aligned */}
          <div className="flex-shrink-0">
            <ImageWithFallback
              src={mealOption.imageUrl || mealOption.image || "https://images.unsplash.com/photo-1662993924949-2b2d68c08cee"}
              alt={mealName || `${type} meal`}
              className="w-16 h-16 object-cover rounded-lg"
            />
          </div>

          {/* Content - Right side */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-black text-sm leading-tight">
                  {mealName || `${type} option`}
                </h3>
                {isRestaurant && mealOption.restaurant && (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-600">
                      {mealOption.restaurant}
                      {mealOption.price && <span className="ml-2 text-purple-600 font-medium">${mealOption.price}</span>}
                    </p>
                    <FavoriteButton
                      restaurantName={mealOption.restaurant}
                      cuisine={mealOption.cuisine}
                      mealOption={mealOption}
                    />
                  </div>
                )}
                {/* Nutrition information */}
                {(mealOption.calories || mealOption.estimatedCalories) && (
                  <div className="text-xs text-green-600 font-medium mt-1 space-y-1">
                    <p>
                      {isRestaurant ? '~' : ''}{mealOption.calories ?? mealOption.estimatedCalories} calories
                      {isRestaurant && <span className="text-gray-500 font-normal"> (estimate)</span>}
                    </p>
                    {(() => {
                      const targetCalories = getMealTargetCalories(type);
                      const actualCalories = mealOption.calories ?? mealOption.estimatedCalories;
                      if (!targetCalories || typeof actualCalories !== 'number') return null;
                      const deviation = targetCalories > 0 ? Math.abs(actualCalories - targetCalories) / targetCalories * 100 : 0;
                      const status =
                        deviation <= 10 ? { label: 'On target', color: 'text-green-600' } :
                        deviation <= 15 ? { label: 'Slightly off', color: 'text-orange-600' } :
                        { label: 'Off target', color: 'text-red-600' };

                      return (
                        <p className={`${status.color}`}>
                          target: {Math.round(targetCalories)} • {status.label}
                        </p>
                      );
                    })()}
                    {(mealOption.protein || mealOption.carbs || mealOption.fat) && (
                      <p className="text-gray-600">
                        {mealOption.protein && `${Math.round(mealOption.protein)}g protein`}
                        {mealOption.protein && mealOption.carbs && ' • '}
                        {mealOption.carbs && `${Math.round(mealOption.carbs)}g carbs`}
                        {(mealOption.protein || mealOption.carbs) && mealOption.fat && ' • '}
                        {mealOption.fat && `${Math.round(mealOption.fat)}g fat`}
                      </p>
                    )}
                  </div>
                )}

                {/* Star Rating */}
                <div className="mt-2">
                  <StarRating
                    dishName={mealName || `${type} meal`}
                    restaurantName={isRestaurant ? mealOption.restaurant : undefined}
                    mealType={type}
                    day={selectedDay}
                    weekNumber={weekNumber}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end space-y-2">
                {/* Eaten Checkbox - show for all meal options */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={isMealEaten(type, optionIndex, optionType)}
                    onChange={() => toggleMealEaten(type, optionIndex, optionType)}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <span className="text-xs text-gray-600">Eaten</span>

                  {/* Show saved feedback icon */}
                  {mealFeedback[mealOption.id] === 'loved' && (
                    <span className="text-red-500 text-sm">❤️</span>
                  )}
                  {mealFeedback[mealOption.id] === 'disliked' && (
                    <span className="text-gray-400 text-sm">👎</span>
                  )}
                </div>

                {/* Feedback prompt - shows after marking eaten */}
                {showFeedbackFor === mealOption.id && isMealEaten(type, optionIndex, optionType) && (
                  <div className="mt-2 p-2 bg-gray-50 rounded-lg border animate-fadeIn w-full">
                    <p className="text-xs text-gray-500 mb-2">How was it?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMealFeedback(mealOption.id, 'loved', {
                          dishName: mealOption.dishName || mealOption.recipeName || 'Unknown Dish',
                          restaurantName: mealOption.restaurantName,
                          isHomemade: !mealOption.restaurantName,
                          mealType: type,
                          day: selectedDay
                        })}
                        className="flex-1 py-1.5 px-3 text-sm bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
                      >
                        <span>❤️</span> Love it
                      </button>
                      <button
                        onClick={() => handleMealFeedback(mealOption.id, 'disliked', {
                          dishName: mealOption.dishName || mealOption.recipeName || 'Unknown Dish',
                          restaurantName: mealOption.restaurantName,
                          isHomemade: !mealOption.restaurantName,
                          mealType: type,
                          day: selectedDay
                        })}
                        className="flex-1 py-1.5 px-3 text-sm bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-1"
                      >
                        <span>👎</span> Meh
                      </button>
                      <button
                        onClick={() => setShowFeedbackFor(null)}
                        className="px-2 text-gray-400 hover:text-gray-600"
                        title="Skip"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                <Badge
                  variant="secondary"
                  className="text-xs flex-shrink-0 bg-purple-50 text-purple-700 border-purple-200"
                >
                  {isRestaurant ? 'Restaurant' : 'Home'}
                </Badge>
                {/* Calorie badge for easier visibility */}
                {mealOption.calories && (
                  <Badge
                    variant="outline"
                    className="text-xs flex-shrink-0 bg-green-50 text-green-700 border-green-200"
                  >
                    {mealOption.calories} cal
                  </Badge>
                )}
              </div>
            </div>

            {/* Description */}
            {description ? (
              <p className="text-xs text-gray-600 mb-2 leading-relaxed">{description}</p>
            ) : (
              <p className="text-xs text-gray-500 mb-2 leading-relaxed italic">
                {isRestaurant ? 'Restaurant meal option' : 'Homemade meal option'}
              </p>
            )}

            {/* Goal Reasoning */}
            {goalReasoning && (
              <div className="mb-2 p-2 bg-purple-50 border border-purple-100 rounded text-xs">
                <p className="text-purple-700 italic">"{goalReasoning}"</p>
              </div>
            )}

            {/* Customer Feedback for Restaurants */}
            {customerFeedback && (
              <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
                <p className="text-gray-700 italic">"{customerFeedback}"</p>
                <p className="text-gray-500 text-xs mt-1">— Customer review via Google Places</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              {/* Interactive Star Rating */}
              <div className="flex space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRating(star, mealOption)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    className="transition-colors duration-150"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        star <= (hoveredStar || userRating)
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Recipe button for home meals, Order only if restaurant has links */}
              {isRestaurant ? (
                hasOrderingLinks(mealOption) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRecipeClick(mealOption)}
                    disabled={loadingRecipeMeal === type}
                    className="text-xs px-3 py-1 h-7 border-purple-300 text-purple-700 hover:bg-purple-50"
                  >
                    Order
                  </Button>
                )
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRecipeClick(mealOption)}
                  disabled={loadingRecipeMeal === type}
                  className="text-xs px-3 py-1 h-7 border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  {loadingRecipeMeal === type ? (
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Recipe"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    };



    return (
      <>
        {/* NEW: Toggle/Switch Design */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden mb-6">
          {/* Header with meal type */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-3 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 capitalize">{type}</h3>
          </div>

          {/* Current Selected Meal Display */}
          {currentMeal && (
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-4">
                {/* Large Image */}
                <div className="flex-shrink-0">
                  <ImageWithFallback
                    src={currentMeal.imageUrl || currentMeal.image || "https://images.unsplash.com/photo-1662993924949-2b2d68c08cee"}
                    alt={currentMeal.name || currentMeal.dish || `${type} meal`}
                    className="w-full sm:w-24 h-48 sm:h-24 object-cover rounded-xl shadow-md"
                  />
                </div>

                {/* Meal Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                        {currentMeal.source === 'restaurant' ? currentMeal.dish : currentMeal.name}
                      </h4>
                      <p className="text-sm text-gray-600 mb-2 leading-relaxed">
                        {currentMeal.source === 'restaurant'
                          ? (currentMeal.dish_description || currentMeal.description)
                          : (currentMeal.description || currentMeal.dish_description)
                        }
                      </p>

                      {/* Restaurant name for restaurant meals */}
                      {currentMeal.source === 'restaurant' && currentMeal.restaurant && (
                        <p className="text-sm font-medium text-purple-600 mb-2 flex items-center gap-1">
                          🏪 {currentMeal.restaurant}
                        </p>
                      )}

                      {/* Nutrition Info */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-600 mb-3">
                        <div className={`px-2 py-1 rounded-lg border ${
                          currentMeal.source === 'restaurant'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-green-50 border-green-200'
                        }`}>
                          <span className={`font-medium ${
                            currentMeal.source === 'restaurant' ? 'text-amber-700' : 'text-green-700'
                          }`}>
                            {currentMeal.source === 'restaurant' ? '~' : ''}
                            {currentMeal.estimatedCalories || currentMeal.calories || 0} cal
                            {currentMeal.source === 'restaurant' && (
                              <span className="text-amber-600 text-xs font-normal ml-1">(est.)</span>
                            )}
                          </span>
                        </div>
                        <div className="bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                          <span className="text-blue-700 font-medium">{currentMeal.protein || 0}g protein</span>
                        </div>
                        {currentMeal.source === 'restaurant' && currentMeal.price && (
                          <div className="bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-200">
                            <span className="text-yellow-700 font-medium">${currentMeal.price}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {/* Recipe button for home meals, Order Now only if restaurant has links */}
                        {currentMeal.source === 'restaurant' ? (
                          hasOrderingLinks(currentMeal) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRecipeClick(currentMeal)}
                              disabled={loadingRecipeMeal === type}
                              className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100 transition-colors"
                            >
                              <ArrowSquareOut className="w-4 h-4 mr-1" weight="regular" />
                              Order Now
                            </Button>
                          )
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRecipeClick(currentMeal)}
                            disabled={loadingRecipeMeal === type}
                            className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100 transition-colors"
                          >
                            {loadingRecipeMeal === type && (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                            )}
                            <Star className="w-4 h-4 mr-1" weight="regular" />
                            Recipe
                          </Button>
                        )}

                        {/* Mark as Eaten Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMealEaten(type, 0, selectedOption)}
                          className={`transition-colors ${
                            isMealEaten(type, 0, selectedOption)
                              ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {isMealEaten(type, 0, selectedOption) ? '✓ Eaten' : 'Mark Eaten'}
                        </Button>

                        {/* Star Rating */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Rate:</span>
                          <StarRating
                            dishName={currentMeal.source === 'restaurant' ? currentMeal.dish : currentMeal.name}
                            restaurantName={currentMeal.source === 'restaurant' ? currentMeal.restaurant : undefined}
                            mealType={type}
                            day={selectedDay}
                            weekNumber={weekNumber}
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Swap Indicator - show when meal is swapped from another slot */}
          {selectedMealOptions[`${selectedDay}-${type}`]?.isCustomSwap && (
            <div className="border-t border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 px-4 sm:px-6 py-3">
              <div className="flex items-center justify-center gap-2">
                <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-medium text-purple-700 capitalize">
                  {selectedMealOptions[`${selectedDay}-${type}`]?.sourceDay.slice(0, 3)} {selectedMealOptions[`${selectedDay}-${type}`]?.sourceMealType.slice(0, 1)}
                </span>
                <div className="w-1 h-1 bg-purple-400 rounded-full"></div>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                  SWAPPED
                </span>
              </div>
            </div>
          )}

          {/* Toggle Switch - Only show if alternative exists */}
          {hasAlternative && (
            <div className="border-t border-gray-200 bg-gray-50 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div className="text-sm text-gray-600">
                  Switch to: <span className="font-medium text-gray-900 block sm:inline">{selectedOption === 'primary' ? meal.alternative?.name || meal.alternative?.dish : meal.primary?.name || meal.primary?.dish}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={toggleOption}
                    className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-0 shadow-md transition-all duration-200 hover:scale-105 flex items-center gap-2"
                    size="sm"
                  >
                    <ArrowSquareOut className="w-4 h-4 mr-1" weight="regular" />
                    Switch Option
                  </Button>
                  <button
                    onClick={() => openSwapDialog(selectedDay, type, currentMeal?.name || currentMeal?.dish || 'Unnamed Meal')}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium hover:shadow-sm"
                    title="Swap with any meal from the week"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    Swap
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No Alternative Available Message */}
          {!hasAlternative && (
            <div className="border-t border-gray-200 bg-gray-50 px-4 sm:px-6 py-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-xs text-gray-500 italic text-center sm:text-left">
                  Only one option available for this meal
                </p>
                <button
                  onClick={() => openSwapDialog(selectedDay, type, currentMeal?.name || currentMeal?.dish || 'Unnamed Meal')}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-sm font-medium hover:shadow-sm"
                  title="Swap with any meal from the week"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Swap
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Recipe Modal - Clean & Professional */}
        {activeRecipeModal?.mealType === type && activeRecipeModal?.recipeData && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-lg max-w-3xl max-h-[90vh] overflow-y-auto w-full">
              {/* Header */}
              <div className="border-b border-gray-200 p-4 sm:p-6 bg-gradient-to-r from-purple-50 to-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{activeRecipeModal.recipeData.name}</h2>
                    <p className="text-gray-600 mt-1 text-xs sm:text-sm">{activeRecipeModal.recipeData.description}</p>
                  </div>
                  <button
                    onClick={() => setActiveRecipeModal(null)}
                    className="w-8 h-8 text-gray-400 hover:text-gray-600 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
                  >
                    <span className="text-lg">×</span>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                {/* Recipe Overview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.prepTime}</div>
                      <div className="text-xs text-gray-600">Prep Time</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.cookTime}</div>
                      <div className="text-xs text-gray-600">Cook Time</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.servings}</div>
                      <div className="text-xs text-gray-600">Servings</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-sm sm:text-base font-semibold text-purple-600">{activeRecipeModal.recipeData.difficulty}</div>
                      <div className="text-xs text-gray-600">Difficulty</div>
                    </div>
                  </div>
                </div>

                {/* Ingredients */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <div className="w-1 h-6 bg-purple-600 rounded-full mr-3"></div>
                    Ingredients
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeRecipeModal.recipeData.groceryList?.map((item: any, index: number) => (
                      <div key={index} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <span className="w-6 h-6 bg-purple-600 text-white rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-sm text-gray-900">{item.amount} {item.ingredient}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <div className="w-1 h-6 bg-purple-600 rounded-full mr-3"></div>
                    Instructions
                  </h3>
                  <div className="space-y-4">
                    {activeRecipeModal.recipeData.instructions?.map((step: string, index: number) => (
                      <div key={index} className="flex space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <span className="w-7 h-7 bg-purple-600 text-white rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </span>
                        <p className="text-sm text-gray-900 leading-relaxed flex-1">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nutrition - ALWAYS show meal's stored macros for consistency */}
                {currentMeal && (
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <div className="w-1 h-6 bg-green-600 rounded-full mr-3"></div>
                      Nutrition Facts
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                        <div className="text-lg font-semibold text-green-600">
                          {currentMeal.estimatedCalories || currentMeal.calories || 0}
                        </div>
                        <div className="text-xs text-gray-600">Calories</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-blue-200">
                        <div className="text-lg font-semibold text-blue-600">
                          {currentMeal.protein || 0}g
                        </div>
                        <div className="text-xs text-gray-600">Protein</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-orange-200">
                        <div className="text-lg font-semibold text-orange-600">
                          {currentMeal.carbs || 0}g
                        </div>
                        <div className="text-xs text-gray-600">Carbs</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-yellow-200">
                        <div className="text-lg font-semibold text-yellow-600">
                          {currentMeal.fat || 0}g
                        </div>
                        <div className="text-xs text-gray-600">Fat</div>
                      </div>
                    </div>
                    {/* Show fiber/sodium from recipe if available */}
                    {activeRecipeModal?.recipeData?.nutrition && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        {activeRecipeModal.recipeData.nutrition.fiber > 0 && (
                          <div className="bg-white rounded-lg p-2 text-center border border-gray-200">
                            <div className="text-sm font-semibold text-gray-600">
                              {activeRecipeModal.recipeData.nutrition.fiber}g
                            </div>
                            <div className="text-xs text-gray-500">Fiber</div>
                          </div>
                        )}
                        {activeRecipeModal.recipeData.nutrition.sodium > 0 && (
                          <div className="bg-white rounded-lg p-2 text-center border border-gray-200">
                            <div className="text-sm font-semibold text-gray-600">
                              {activeRecipeModal.recipeData.nutrition.sodium}mg
                            </div>
                            <div className="text-xs text-gray-500">Sodium</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const LoadingState = () => (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h3 className="text-xl font-medium text-neutral-900 mb-2">Generating Your Meal Plan</h3>
      <p className="text-neutral-600">
        Creating personalized meal options based on your preferences...
      </p>
    </div>
  );

  if (!generationStatus.mealsGenerated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10">
        {/* Header */}
        <div className="bg-white border-b border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("dashboard")}
                className="mr-3 text-neutral-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-medium text-neutral-900">Meals</h1>
                <p className="text-sm text-neutral-600">Your nutrition plan</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <Card className="border-0 shadow-subtle bg-white">
            <CardContent className="p-8">
              <LoadingState />
            </CardContent>
          </Card>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
          <div className="max-w-md mx-auto grid grid-cols-5 h-16">
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("dashboard")}
            >
              <img src="/fytr-icon.svg" alt="Home" className="w-5 h-5 mb-1" />
              <span className="text-xs">Home</span>
            </button>
            <button className="flex flex-col items-center justify-center text-primary">
              <ForkKnife className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Meals</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("workout-plan")}
            >
              <Barbell className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Workouts</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("progress")}
            >
              <ChartLineUp className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Progress</span>
            </button>
            <button
              className="flex flex-col items-center justify-center text-neutral-400"
              onClick={() => onNavigate("account")}
            >
              <UserCircle className="w-5 h-5 mb-1" weight="regular" />
              <span className="text-xs">Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while fetching data
  if (loading || !isInitialized) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
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
          <p className="text-sm text-gray-500 animate-pulse">Loading meal plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("dashboard")}
              className="mr-2 sm:mr-3 text-neutral-600 p-1 sm:p-2"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-medium text-neutral-900">Meals</h1>
              <p className="text-xs sm:text-sm text-neutral-600">Your nutrition plan</p>
            </div>
          </div>
          <div className="flex items-center">
            <Logo variant="icon" width={32} height={32} href="#" />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6">
        <div className="flex space-x-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('meals')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'meals'
                ? 'border-[#c1272d] text-[#c1272d] bg-red-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span className="whitespace-nowrap">Weekly Plan</span>
          </button>
          <button
            onClick={() => setActiveTab('grocery')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'grocery'
                ? 'border-green-500 text-green-600 bg-green-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="whitespace-nowrap">Grocery List</span>
          </button>
          <button
            onClick={() => setActiveTab('restaurants')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'restaurants'
                ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <ForkKnife className="w-4 h-4" />
            <span className="whitespace-nowrap">Restaurants</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Meals Tab Content */}
        {activeTab === 'meals' && (
          <>
            {/* Week Navigation */}
            <div className="mb-6">
          <div className="flex justify-center space-x-2 overflow-x-auto pb-2 px-2">
            {days.map((day) => {
              const dayStatus = getDayStatus(day.dayIndex, currentDayIndex);
              const isSelected = selectedDay === day.id;

              return (
                <Button
                  key={day.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedDay(day.id);
                  }}
                  className={`min-w-16 sm:min-w-20 flex flex-col p-2 sm:p-3 h-auto transition-all duration-200 flex-shrink-0 relative ${
                    isSelected
                      ? "bg-red-600 text-white shadow-lg"
                      : dayStatus === 'today'
                      ? "border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700"
                      : dayStatus === 'past'
                      ? "border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      : "border-neutral-200 hover:border-red-300 hover:bg-red-50 bg-white"
                  }`}
                >
                  <span className="font-medium text-xs sm:text-sm">{day.name}</span>
                  <span className="text-xs opacity-70">Day {day.dayNumber}</span>

                  {/* Today indicator */}
                  {dayStatus === 'today' && !isSelected && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                  )}

                  {/* Checkmark for past days */}
                  {dayStatus === 'past' && !isSelected && (
                    <CheckCircle className="absolute top-1 right-1 w-3 h-3 text-green-500" weight="fill" />
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Daily Overview - Compact */}
        <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base font-semibold capitalize text-black">{selectedDay}</span>
            <div className="flex items-center space-x-3 text-sm text-gray-600">
              <span>{currentMeals.breakfast ? 1 : 0}B</span>
              <span>{currentMeals.lunch ? 1 : 0}L</span>
              <span>{currentMeals.dinner ? 1 : 0}D</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">
                {(() => {
                  const daySummary = getDaySummary(selectedDay);
                  const planned = daySummary?.planned ?? getPlannedCaloriesForDay(selectedDay);
                  const target = typeof daySummary?.target === 'number' ? daySummary.target : resolvedTargets?.dailyCalories;
                  return `${planned} / ${typeof target === 'number' ? Math.round(target) : '—'} cal`;
                })()}
              </span>
              {(() => {
                const daySummary = getDaySummary(selectedDay);
                const planned = daySummary?.planned ?? getPlannedCaloriesForDay(selectedDay);
                const target = typeof daySummary?.target === 'number' ? daySummary.target : resolvedTargets?.dailyCalories;
                if (!target || target <= 0) return null;

                const deviation = Math.abs(planned - target) / target * 100;
                const status = daySummary?.status
                  ? daySummary.status === 'on-target'
                    ? { label: 'On track', color: 'text-green-600 bg-green-50 border-green-200' }
                    : daySummary.status === 'warning'
                      ? { label: 'Slightly off', color: 'text-orange-600 bg-orange-50 border-orange-200' }
                      : daySummary.status === 'under'
                        ? { label: 'Under target', color: 'text-orange-600 bg-orange-50 border-orange-200' }
                        : { label: 'Over target', color: 'text-red-600 bg-red-50 border-red-200' }
                  : deviation <= 10
                    ? { label: 'On track', color: 'text-green-600 bg-green-50 border-green-200' }
                    : deviation <= 15
                      ? { label: 'Slightly off', color: 'text-orange-600 bg-orange-50 border-orange-200' }
                      : { label: 'Off target', color: 'text-red-600 bg-red-50 border-red-200' };

                return (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${status.color}`}>
                    {status.label}
                  </span>
                );
              })()}
            </div>
            {(() => {
              const daySummary = getDaySummary(selectedDay);
              const target = typeof daySummary?.target === 'number' ? daySummary.target : resolvedTargets?.dailyCalories;
              if (typeof target !== 'number') return null;
              return (
                <span className="text-xs text-gray-500">
                  Target {Math.round(target)} cal
                </span>
              );
            })()}
          </div>

          {/* Enhanced Nutrition Tracking */}
          {resolvedTargets && (
            <div className="space-y-3">
              {/* Daily Progress Bars */}
              <div className="grid grid-cols-1 gap-3">
                {/* Calories Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600">Calories</span>
                    <span className="text-gray-800 font-medium">
                      {totalCalories}/{Math.round(resolvedTargets.dailyCalories/100)*100} cal
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        totalCalories > resolvedTargets.dailyCalories * 1.1 ? 'bg-red-500' :
                        totalCalories >= resolvedTargets.dailyCalories * 0.8 ? 'bg-green-500' :
                        'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min((totalCalories / resolvedTargets.dailyCalories) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Protein Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600">Protein</span>
                    <span className="text-gray-800 font-medium">
                      {getTotalProtein()}g/~{Math.round(resolvedTargets.dailyProtein/10)*10}g
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        getTotalProtein() >= resolvedTargets.dailyProtein * 0.8 ? 'bg-blue-500' : 'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min((getTotalProtein() / resolvedTargets.dailyProtein) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Meals */}
        <div className="space-y-6 pb-20 sm:pb-24">

          {/* Breakfast */}
          <div className="space-y-3">
            <h3 className={`text-lg font-semibold border-l-4 pl-3 flex items-center gap-2 ${
              getDayStatus(days.find(d => d.id === selectedDay)?.dayIndex || 0, currentDayIndex) === 'today' &&
              currentMealPeriod === 'breakfast'
                ? 'text-blue-600 border-blue-600'
                : 'text-purple-600 border-purple-600'
            }`}>
              Breakfast
              {getDayStatus(days.find(d => d.id === selectedDay)?.dayIndex || 0, currentDayIndex) === 'today' &&
               currentMealPeriod === 'breakfast' && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  Current meal
                </span>
              )}
            </h3>

            {/* Logged breakfast meals - show above planned meals */}
            {getLoggedMealsForType('breakfast', selectedDay).map(renderLoggedMealCard)}

            {/* Primary and Alternative options */}
            {currentMeals.breakfast ? (
              <MealCard meal={currentMeals.breakfast} type="breakfast" />
            ) : isMealSkippedForDay(selectedDay, 'breakfast') ? (
              <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <ForkKnife className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">No meal scheduled</p>
                <p className="text-gray-400 text-sm">Skipped per your weekly plan</p>
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <ForkKnife className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600 font-medium">No breakfast planned</p>
                <p className="text-gray-500 text-sm">Meals will appear here once generated</p>
              </div>
            )}
          </div>

          {/* Lunch */}
          <div className="space-y-3">
            <h3 className={`text-lg font-semibold border-l-4 pl-3 flex items-center gap-2 ${
              getDayStatus(days.find(d => d.id === selectedDay)?.dayIndex || 0, currentDayIndex) === 'today' &&
              currentMealPeriod === 'lunch'
                ? 'text-blue-600 border-blue-600'
                : 'text-purple-600 border-purple-600'
            }`}>
              Lunch
              {getDayStatus(days.find(d => d.id === selectedDay)?.dayIndex || 0, currentDayIndex) === 'today' &&
               currentMealPeriod === 'lunch' && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  Current meal
                </span>
              )}
            </h3>

            {/* Logged lunch meals - show above planned meals */}
            {getLoggedMealsForType('lunch', selectedDay).map(renderLoggedMealCard)}

            {/* Primary and Alternative options */}
            {currentMeals.lunch ? (
              <MealCard meal={currentMeals.lunch} type="lunch" />
            ) : isMealSkippedForDay(selectedDay, 'lunch') ? (
              <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <ForkKnife className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">No meal scheduled</p>
                <p className="text-gray-400 text-sm">Skipped per your weekly plan</p>
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <ForkKnife className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600 font-medium">No lunch planned</p>
                <p className="text-gray-500 text-sm">Meals will appear here once generated</p>
              </div>
            )}
          </div>

          {/* Dinner */}
          <div className="space-y-3">
            <h3 className={`text-lg font-semibold border-l-4 pl-3 flex items-center gap-2 ${
              getDayStatus(days.find(d => d.id === selectedDay)?.dayIndex || 0, currentDayIndex) === 'today' &&
              currentMealPeriod === 'dinner'
                ? 'text-blue-600 border-blue-600'
                : 'text-purple-600 border-purple-600'
            }`}>
              Dinner
              {getDayStatus(days.find(d => d.id === selectedDay)?.dayIndex || 0, currentDayIndex) === 'today' &&
               currentMealPeriod === 'dinner' && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  Current meal
                </span>
              )}
            </h3>

            {/* Logged dinner meals - show above planned meals */}
            {getLoggedMealsForType('dinner', selectedDay).map(renderLoggedMealCard)}

            {/* Primary and Alternative options */}
            {currentMeals.dinner ? (
              <MealCard meal={currentMeals.dinner} type="dinner" />
            ) : isMealSkippedForDay(selectedDay, 'dinner') ? (
              <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <ForkKnife className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">No meal scheduled</p>
                <p className="text-gray-400 text-sm">Skipped per your weekly plan</p>
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <ForkKnife className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600 font-medium">No dinner planned</p>
                <p className="text-gray-500 text-sm">Meals will appear here once generated</p>
              </div>
            )}
          </div>

          {/* Logged Meals from Other Days */}
          {loggedMeals.filter(m => m.day !== selectedDay).length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-500 border-l-4 border-gray-300 pl-3 mb-4">Logged Meals from Other Days</h3>
              <div className="space-y-3">
                {loggedMeals.filter(m => m.day !== selectedDay).map(renderLoggedMealCard)}
              </div>
            </div>
          )}

          {/* Log Alternative Meal Button */}
          <div className="mt-6">
            <Button
              onClick={() => setShowLogModal(true)}
              className="w-full bg-[#c1272d] hover:bg-red-700 text-white py-4 flex items-center justify-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Log Alternative Meal</span>
            </Button>
          </div>

          {!currentMeals.breakfast && !currentMeals.lunch && !currentMeals.dinner && (
            <div className="text-center py-12 bg-white border-2 border-dashed border-gray-300 rounded-xl">
              <ForkKnife className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">No meals planned for {selectedDay}</p>
              <p className="text-sm text-gray-500 mt-2">Meal recommendations will appear here once generated</p>
            </div>
          )}
        </div>
          </>
        )}

        {/* Grocery List Tab Content */}
        {activeTab === 'grocery' && (
          <GroceryListSection
            groceryList={
              mealData?.mealPlan?.groceryList ||
              mealData?.mealPlan?.planData?.groceryList ||
              { proteins: [], vegetables: [], grains: [], totalEstimatedCost: 0, weeklyBudgetUsed: '0%' }
            }
            onItemToggle={handleGroceryItemToggle}
            checkedItems={checkedGroceryItems}
          />
        )}

        {/* Restaurants Tab Content */}
        {activeTab === 'restaurants' && (
          <RestaurantListSection
            restaurants={(() => {
              const restaurantMeals = mealData?.mealPlan?.planData?.restaurantMeals || [];
              console.log('[RestaurantSection] Raw restaurant meals:', restaurantMeals.length);
              const restaurantMap = new Map();

              // Aggregate all restaurant data and ordering links
              restaurantMeals.forEach((meal: any) => {
                const primaryRestaurant = meal.primary?.restaurant;
                const altRestaurant = meal.alternative?.restaurant;


                // Process primary restaurant
                if (primaryRestaurant && meal.primary) {
                  if (!restaurantMap.has(primaryRestaurant)) {
                    restaurantMap.set(primaryRestaurant, {
                      name: primaryRestaurant,
                      cuisine: meal.primary.cuisine || 'Mixed',
                      rating: 4.2,
                      address: meal.primary.address || 'Address not available',
                      city: meal.primary.city || '',
                      orderingLinks: { ...meal.primary.orderingLinks },
                      estimatedOrderTime: '25-40 min',
                      sampleMenuItems: new Set([meal.primary.dish]),
                      distance: 2.5
                    });
                  } else {
                    // Merge ordering links and add menu items
                    const existing = restaurantMap.get(primaryRestaurant);
                    existing.orderingLinks = { ...existing.orderingLinks, ...meal.primary.orderingLinks };
                    existing.sampleMenuItems.add(meal.primary.dish);
                  }
                }

                // Process alternative restaurant (if different from primary)
                if (altRestaurant && meal.alternative && altRestaurant !== primaryRestaurant) {
                  if (!restaurantMap.has(altRestaurant)) {
                    restaurantMap.set(altRestaurant, {
                      name: altRestaurant,
                      cuisine: meal.alternative.cuisine || 'Mixed',
                      rating: 4.2,
                      address: meal.alternative.address || 'Address not available',
                      city: meal.alternative.city || '',
                      orderingLinks: { ...meal.alternative.orderingLinks },
                      estimatedOrderTime: '25-40 min',
                      sampleMenuItems: new Set([meal.alternative.dish]),
                      distance: 2.5
                    });
                  } else {
                    // Merge ordering links and add menu items
                    const existing = restaurantMap.get(altRestaurant);
                    existing.orderingLinks = { ...existing.orderingLinks, ...meal.alternative.orderingLinks };
                    existing.sampleMenuItems.add(meal.alternative.dish);
                  }
                }
              });

              // Helper to normalize ordering link keys to match what we can render
              const normalizeOrderingLinks = (links: any): Record<string, string | null> => {
                if (!links) return {};
                return {
                  doordash: links.doordash || links.doorDash || links.DoorDash || links.door_dash || null,
                  ubereats: links.ubereats || links.uberEats || links.UberEats || links.uber_eats || null,
                  grubhub: links.grubhub || links.grubHub || links.GrubHub || links.grub_hub || null,
                  direct: links.direct || links.website || links.order || links.orderUrl || links.order_url || links.menuUrl || links.menu_url || null,
                };
              };

              // Convert to array and normalize ordering links
              const restaurants = Array.from(restaurantMap.values()).map(restaurant => {
                // Normalize the ordering links
                const normalizedLinks = normalizeOrderingLinks(restaurant.orderingLinks);

                // Only count links that have values AND have a matching button (known platforms)
                const knownPlatforms = ['doordash', 'ubereats', 'grubhub', 'direct'] as const;
                const validLinksCount = knownPlatforms.filter(platform =>
                  normalizedLinks[platform] &&
                  String(normalizedLinks[platform]).trim() !== ''
                ).length;

                return {
                  ...restaurant,
                  orderingLinks: normalizedLinks,  // Use normalized links
                  sampleMenuItems: Array.from(restaurant.sampleMenuItems).filter(Boolean),
                  linksFound: validLinksCount
                };
              });

              console.log('[RestaurantSection] Transformed restaurants:', restaurants.length);
              return restaurants;
            })()}
            metadata={{
              generatedFor: 'User',
              location: mealData?.mealPlan?.planData?.metadata?.location || 'Your area',
              goal: mealData?.mealPlan?.planData?.metadata?.goal || 'wellness',
              cuisines: mealData?.mealPlan?.planData?.metadata?.cuisines || []
            }}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("dashboard")}
          >
            <img src="/fytr-icon.svg" alt="Home" className="w-5 h-5 mb-1" />
            <span className="text-xs">Home</span>
          </button>
          <button className="flex flex-col items-center justify-center text-primary">
            <ForkKnife className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("workout-plan")}
          >
            <Barbell className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Workouts</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("progress")}
          >
            <ChartLineUp className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Progress</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("account")}
          >
            <UserCircle className="w-5 h-5 mb-1" weight="regular" />
            <span className="text-xs">Account</span>
          </button>
        </div>
      </div>

      {/* Meal Log Modal */}
      {showLogModal && (
        <MealLogModal
          onClose={() => setShowLogModal(false)}
          onSave={handleMealLog}
          selectedDay={selectedDay}
        />
      )}

      {/* Swap Dialog */}
      <MealSwapDialog
        isOpen={swapDialogOpen}
        onClose={() => {
          setSwapDialogOpen(false);
          setSwapTarget(null);
        }}
        onSwap={handleSwap}
        currentMeal={swapTarget || { day: '', mealType: '', name: '' }}
        allMeals={allMeals}
      />
    </div>
  );
}