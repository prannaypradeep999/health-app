'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Target, Heartbeat, CurrencyDollar, ForkKnife, ForkKnife as AppleIcon, Barbell, Flask, CaretLeft, CaretRight, Upload, Shield, Scales, Flame, Heart, Cookie, MapPin, Moon, Question, Plant, TrendUp, Lightning, Brain, Sparkle, Calendar, PersonSimpleRun, ArrowsClockwise, CheckCircle, House, Briefcase, Coffee, Faders, Check, CalendarCheck, CaretDown, Minus } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '@/components/logo';
import ProfileConfirmation from '@/components/dashboard/ProfileConfirmation';
import LoadingJourney from '@/components/dashboard/LoadingJourney';
import { checkPreferenceConflicts, type PreferenceConflict } from '@/lib/utils/preference-conflict-checker';

interface QuickProfileSummaryProps {
  surveyData: any;
  onContinue: () => void;
}

const normalizeDietPrefs = (prefs: string[] = []) =>
  prefs.filter(pref => pref !== 'none');

function QuickProfileSummary({ surveyData, onContinue }: QuickProfileSummaryProps) {
  const [nutritionTargets, setNutritionTargets] = useState<{
    dailyCalories: number;
    dailyProtein: number;
    dailyCarbs: number;
    dailyFat: number;
  } | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadTargets = async () => {
      try {
        const response = await fetch('/api/ai/meals/current');
        if (!response.ok) return;
        const data = await response.json();
        if (isActive) {
          setNutritionTargets(data.mealPlan?.nutritionTargets || null);
        }
      } catch {
        // Ignore - show fallback UI
      }
    };
    loadTargets();
    return () => {
      isActive = false;
    };
  }, []);

  const displayTargets = React.useMemo(() => {
    if (!nutritionTargets) return null;
    return {
      calories: Math.round(nutritionTargets.dailyCalories / 10) * 10,
      protein: Math.round(nutritionTargets.dailyProtein / 10) * 10,
      carbs: Math.round(nutritionTargets.dailyCarbs / 10) * 10,
      fat: Math.round(nutritionTargets.dailyFat / 10) * 10
    };
  }, [nutritionTargets]);

  const goalLabels: Record<string, string> = {
    'lose_weight': 'Lose Weight',
    'build_muscle': 'Build Muscle',
    'get_healthier': 'Get Healthier',
    'maintain': 'Maintain Progress',
    'WEIGHT_LOSS': 'Lose Weight',
    'MUSCLE_GAIN': 'Build Muscle',
    'GENERAL_WELLNESS': 'Get Healthier'
  };

  const challengeLabels: Record<string, string> = {
    'snacking': 'Managing snacking habits',
    'eating_out': 'Eating out frequently',
    'portions': 'Controlling portions',
    'late_night': 'Late night eating',
    'dont_know': 'Finding the right approach'
  };

  const focusLabels: Record<string, string> = {
    'energy': 'Boosting energy levels',
    'digestion': 'Improving digestion',
    'mental_clarity': 'Mental clarity & focus',
    'bloodwork': 'Better bloodwork markers',
    'general': 'Overall wellness',
    'consistency': 'Building consistency',
    'recomp': 'Body recomposition',
    'habits': 'Creating lasting habits',
    'intuitive': 'Intuitive eating/training'
  };

  const goal = surveyData.goal || surveyData.primaryGoal;
  const challenge = surveyData.goalChallenge;
  const focus = surveyData.healthFocus || surveyData.maintainFocus || surveyData.fitnessLevel;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md sm:max-w-lg bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">

        {/* Success Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} weight="fill" className="text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            You're all set, {surveyData.firstName || 'there'}!
          </h1>
          <p className="text-gray-600">Here's your personalized plan overview:</p>
        </div>

        {/* Daily Targets - from meal plan API */}
        <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-4 mb-4 border border-red-100">
          <div className="flex items-center gap-2 mb-3">
            <Flame size={18} weight="fill" className="text-red-600" />
            <span className="text-sm font-semibold text-red-800">Your Daily Targets</span>
          </div>
          {displayTargets ? (
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-900">{displayTargets.calories.toLocaleString()}</div>
                <div className="text-xs text-gray-500">calories</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-700">{displayTargets.protein}g</div>
                <div className="text-xs text-blue-600">protein</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-700">{displayTargets.carbs}g</div>
                <div className="text-xs text-amber-600">carbs</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-700">{displayTargets.fat}g</div>
                <div className="text-xs text-green-600">fat</div>
              </div>
            </div>
          ) : (
            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="text-red-600 font-medium text-sm">Profile incomplete</div>
              <div className="text-red-500 text-xs mt-1">Complete all required fields</div>
            </div>
          )}
        </div>

        {/* Summary Cards - All from survey data, INSTANT */}
        <div className="space-y-3 mb-6">

          {/* Goal */}
          <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Target size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Your Goal</p>
              <p className="text-gray-900 font-semibold">{goalLabels[goal] || 'Achieve Your Goals'}</p>
            </div>
          </div>

          {/* Challenge/Focus */}
          {(challenge || focus) && (
            <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Barbell size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Your Focus</p>
                <p className="text-gray-900 font-semibold">
                  {challengeLabels[challenge] || focusLabels[focus] || 'Personalized approach'}
                </p>
              </div>
            </div>
          )}

          {/* Diet Preferences */}
          {surveyData.dietPrefs?.length > 0 && (
            <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <ForkKnife size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Diet Preferences</p>
                <p className="text-gray-900 font-semibold">{surveyData.dietPrefs.join(', ')}</p>
              </div>
            </div>
          )}

          {/* Location */}
          {surveyData.city && (
            <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Finding Restaurants In</p>
                <p className="text-gray-900 font-semibold">{surveyData.city}, {surveyData.state}</p>
              </div>
            </div>
          )}

        </div>

        {/* Continue Button */}
        <Button
          onClick={onContinue}
          className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl"
        >
          Continue to Build My Plan
        </Button>

        <p className="text-xs text-center text-gray-400 mt-4">
          We'll now create your personalized meals and workouts
        </p>

      </div>
    </div>
  );
}

// Survey data interface from existing survey
interface SurveyData {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  age: number | '';
  sex: string;
  height: number | '';
  heightFeet: number | '';
  heightInches: number | '';
  weight: number | '';

  // Full address fields
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  goal: string;
  primaryGoal?: string;
  goalChallenge?: string;
  fitnessLevel?: string;
  healthFocus?: string;
  maintainFocus?: string;
  activityLevel: string;
  sportsInterests: string;
  fitnessTimeline: string;
  monthlyFoodBudget: number | '';
  monthlyFitnessBudget: number | '';
  weeklyMealSchedule: Record<string, { breakfast: string; lunch: string; dinner: string }>;
  distancePreference: string;
  dietPrefs: string[];
  preferredCuisines: string[];
  preferredFoods: string[];
  preferredActivities?: string[];
  customFoodInput: string;
  uploadedFiles: string[];
  preferredNutrients: string[];
  strictExclusions: {
    proteins: string[];
    dairy: string[];
    fruits: string[];
    vegetables: string[];
    other: string[];
  };
  biomarkers: {
    cholesterol?: number;
    vitaminD?: number;
    iron?: number;
  };
  workoutPreferences: {
    preferredDuration: number;
    availableDays: string[];
    workoutTypes: string[];
    gymAccess: string;
    fitnessExperience: string;
    injuryConsiderations: string[];
    timePreferences: string[];
  };
  additionalGoalsNotes?: string;
  fillerQuestions: {
    cookingFrequency: string;
    foodAllergies: string[];
    eatingOutOccasions: string;
    healthGoalPriority: string;
    motivationLevel: string;
  };
  source?: string;
}

// Meal schedule template types
type MealType = 'home' | 'restaurant' | 'no-meal';

interface DaySchedule {
  breakfast: MealType;
  lunch: MealType;
  dinner: MealType;
}

interface WeeklySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

interface MealScheduleTemplate {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  weekday: DaySchedule;
  weekend: DaySchedule;
}

// Meal schedule templates with mobile-optimized labels
const mealScheduleTemplates: MealScheduleTemplate[] = [
  {
    id: 'home_cook',
    label: 'I cook most meals at home',
    description: 'Restaurants only on weekends',
    icon: House,
    weekday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
    weekend: { breakfast: 'home', lunch: 'restaurant', dinner: 'restaurant' },
  },
  {
    id: 'office_lunch',
    label: 'I grab lunch near work',
    description: 'Home for breakfast and dinner',
    icon: Briefcase,
    weekday: { breakfast: 'home', lunch: 'restaurant', dinner: 'home' },
    weekend: { breakfast: 'home', lunch: 'home', dinner: 'restaurant' },
  },
  {
    id: 'breakfast_skipper',
    label: 'I skip breakfast',
    description: 'Lunch out on workdays',
    icon: Coffee,
    weekday: { breakfast: 'no-meal', lunch: 'restaurant', dinner: 'home' },
    weekend: { breakfast: 'home', lunch: 'home', dinner: 'restaurant' },
  },
  {
    id: 'always_on_the_go',
    label: 'I eat out most meals',
    description: 'Home just for quick breakfasts',
    icon: MapPin,
    weekday: { breakfast: 'home', lunch: 'restaurant', dinner: 'restaurant' },
    weekend: { breakfast: 'no-meal', lunch: 'restaurant', dinner: 'restaurant' },
  },
  {
    id: 'custom',
    label: "I'll set it myself",
    description: 'Customize each day',
    icon: Faders,
    weekday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
    weekend: { breakfast: 'home', lunch: 'home', dinner: 'home' },
  },
];

// Function to expand template to full week
const expandTemplate = (template: MealScheduleTemplate): WeeklySchedule => {
  return {
    monday: { ...template.weekday },
    tuesday: { ...template.weekday },
    wednesday: { ...template.weekday },
    thursday: { ...template.weekday },
    friday: { ...template.weekday },
    saturday: { ...template.weekend },
    sunday: { ...template.weekend },
  };
};

// Helper function to format day schedule for display
const formatDaySchedule = (day: DaySchedule) => {
  const formatMeal = (meal: MealType) => {
    switch(meal) {
      case 'home': return 'Home';
      case 'restaurant': return 'Out';
      case 'no-meal': return 'Skip';
    }
  };
  return `${formatMeal(day.breakfast)} → ${formatMeal(day.lunch)} → ${formatMeal(day.dinner)}`;
};

// Animation variants for smooth transitions
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

// MealPill component for compact summary
const MealPill = ({ type, label }: { type: MealType; label: string }) => {
  const config = {
    home: { bg: 'bg-green-100', text: 'text-green-700', icon: House },
    restaurant: { bg: 'bg-orange-100', text: 'text-orange-700', icon: MapPin },
    'no-meal': { bg: 'bg-gray-100', text: 'text-gray-400', icon: Minus },
  };
  const c = config[type];

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${c.bg}`}>
      <c.icon size={12} className={c.text} weight="bold" />
      <span className={`text-xs font-medium ${c.text}`}>{label}</span>
    </div>
  );
};

// MealDot component for collapsed day view
const MealDot = ({ type }: { type: MealType }) => {
  const colors = {
    home: 'bg-green-500',
    restaurant: 'bg-orange-500',
    'no-meal': 'bg-gray-300',
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[type]}`} />;
};

// QuickActionChip for bulk actions
const QuickActionChip = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100
               rounded-full whitespace-nowrap hover:bg-gray-200
               active:scale-95 transition-all"
  >
    {label}
  </button>
);

// MealRow component for segmented control
const MealRow = ({ label, value, onChange }: {
  label: string;
  value: MealType;
  onChange: (value: MealType) => void;
}) => {
  const options: { value: MealType; label: string; icon: any }[] = [
    { value: 'no-meal', label: 'Skip', icon: Minus },
    { value: 'home', label: 'Home', icon: House },
    { value: 'restaurant', label: 'Out', icon: MapPin },
  ];

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex bg-gray-100 rounded-lg p-1">
        {options.map((opt) => {
          const IconComponent = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                transition-all duration-150
                ${value === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <IconComponent size={14} weight={value === opt.value ? 'fill' : 'regular'} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// DayCard component for expandable day editing
const DayCard = ({
  day,
  schedule,
  onChange,
  isWeekend,
}: {
  day: string;
  schedule: DaySchedule;
  onChange: (meal: keyof DaySchedule, type: MealType) => void;
  isWeekend: boolean;
}) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <motion.div
      className={`
        rounded-xl border overflow-hidden
        ${isWeekend ? 'border-purple-100 bg-purple-50/30' : 'border-gray-100 bg-white'}
      `}
    >
      {/* Collapsed view - tap to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between active:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-900 w-24 text-left">{day}</span>
          <div className="flex gap-1.5">
            <MealDot type={schedule.breakfast} />
            <MealDot type={schedule.lunch} />
            <MealDot type={schedule.dinner} />
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <CaretDown size={18} className="text-gray-400" />
        </motion.div>
      </button>

      {/* Expanded view - edit meals */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-100"
          >
            <div className="p-4 space-y-3">
              <MealRow
                label="Breakfast"
                value={schedule.breakfast}
                onChange={(v) => onChange('breakfast', v)}
              />
              <MealRow
                label="Lunch"
                value={schedule.lunch}
                onChange={(v) => onChange('lunch', v)}
              />
              <MealRow
                label="Dinner"
                value={schedule.dinner}
                onChange={(v) => onChange('dinner', v)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Welcome screen component (from Figma UI)
interface OnboardingWelcomeProps {
  onStart: () => void;
}

function OnboardingWelcome({ onStart }: OnboardingWelcomeProps) {
  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8 flex flex-col">
      <div className="flex-1 flex flex-col justify-center max-w-md sm:max-w-lg md:max-w-xl mx-auto w-full">
        <div className="text-center mb-12">
          <div className="mx-auto mb-6 flex items-center justify-center">
            <Logo variant="full" width={200} height={50} href="" />
          </div>
          <p className="text-lg text-gray-600 leading-relaxed">
            AI-powered nutrition and fitness tailored to your lifestyle
          </p>
        </div>

        <Card className="p-8 mb-8 border border-gray-200 bg-white">
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center border border-red-200">
                <ForkKnife className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Smart Meal Planning</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Personalized nutrition that fits your schedule and preferences
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center border border-red-200">
                <Heartbeat className="w-6 h-6 text-red-600" weight="regular" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Adaptive Workouts</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Exercise routines that evolve with your progress
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center border border-red-200">
                <Barbell className="w-6 h-6 text-red-600" weight="regular" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Progress Insights</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Clear analytics to track your health journey
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Button
          onClick={onStart}
          className="w-full h-14 bg-red-600 hover:bg-red-700 text-white transition-all duration-200 transform hover:scale-[1.02]"
        >
          Get Started
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>

        <p className="text-center text-sm text-gray-500 mt-4">
          Setup takes less than 2 minutes
        </p>
      </div>
    </div>
  );
}

// Survey steps component
interface OnboardingStepsProps {
  onComplete: (data: SurveyData) => void;
  onBack: () => void;
}

function OnboardingSteps({ onComplete, onBack }: OnboardingStepsProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [showAllergyConfirmation, setShowAllergyConfirmation] = useState(false);
  const [preferenceConflicts, setPreferenceConflicts] = useState<PreferenceConflict[]>([]);
  const [otherDietType, setOtherDietType] = useState('');

  // Template selection state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);

  // Define all food options at the top
  const allFoodOptions = [
    'Fruits', 'Rice', 'Eggs', 'Vegetables', 'Nuts', 'Chicken', 'Fish', 'Beef',
    'Pork', 'Tofu', 'Beans', 'Pasta', 'Quinoa', 'Yogurt', 'Cheese', 'Salmon',
    'Tuna', 'Shrimp', 'Turkey', 'Lamb', 'Lentils', 'Chickpeas', 'Oats',
    'Potatoes', 'Sweet Potatoes', 'Avocado', 'Spinach', 'Broccoli', 'Kale',
    'Berries', 'Bananas', 'Apples', 'Oranges', 'Brown Rice', 'Whole Wheat Bread', 'Almonds'
  ];

  // Foods to avoid (preferences, not allergies)
  const exclusionCategories = {
    proteins: ['Chicken', 'Beef', 'Pork', 'Lamb', 'Fish', 'Shellfish', 'Tofu'],
    dairy: ['Milk', 'Cheese', 'Yogurt'],
    vegetables: ['Broccoli', 'Spinach', 'Mushrooms', 'Onions'],
    fruits: ['Apples', 'Bananas', 'Grapes', 'Mango'],
    other: ['Spicy food', 'Raw fish', 'Cilantro']
  };

  const [formData, setFormData] = useState<SurveyData>({
    email: '',
    firstName: '',
    lastName: '',
    age: '',
    sex: '',
    height: '',
    heightFeet: '',
    heightInches: '',
    weight: '',

    // Full address fields
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    goal: '',
    primaryGoal: '',
    goalChallenge: '',
    fitnessLevel: '',
    healthFocus: '',
    maintainFocus: '',
    activityLevel: '',
    sportsInterests: '',
    fitnessTimeline: '',
    preferredActivities: [],
    additionalGoalsNotes: '',
    monthlyFoodBudget: 200,
    monthlyFitnessBudget: 50,
    weeklyMealSchedule: {
      monday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
      tuesday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
      wednesday: { breakfast: 'home', lunch: 'restaurant', dinner: 'home' },
      thursday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
      friday: { breakfast: 'home', lunch: 'restaurant', dinner: 'restaurant' },
      saturday: { breakfast: 'home', lunch: 'home', dinner: 'restaurant' },
      sunday: { breakfast: 'home', lunch: 'home', dinner: 'home' }
    },
    distancePreference: 'medium',
    dietPrefs: [],
    preferredCuisines: [],
    preferredFoods: [], // Start with no foods selected
    customFoodInput: '',
    uploadedFiles: [],
    preferredNutrients: [],
    strictExclusions: {
      proteins: [],
      dairy: [],
      fruits: [],
      vegetables: [],
      other: []
    },
    biomarkers: {},
    workoutPreferences: {
      preferredDuration: 45,
      availableDays: [],
      workoutTypes: [],
      gymAccess: 'no_gym',
      fitnessExperience: 'intermediate',
      injuryConsiderations: [],
      timePreferences: []
    },
    fillerQuestions: {
      cookingFrequency: '',
      foodAllergies: [],
      eatingOutOccasions: '',
      healthGoalPriority: '',
      motivationLevel: ''
    },
    source: 'web_v2'
  });

  const totalSteps = 9;
  const progress = (currentStep / totalSteps) * 100;

  const stepIcons = [
    Target, Heartbeat, Scales, Barbell, CurrencyDollar, ForkKnife, AppleIcon, Barbell, Flask
  ];

  // Enhanced Goal Selection Data
  const primaryGoals = [
    { value: 'lose_weight', label: 'Lose weight', icon: Flame, description: 'Burn fat and slim down', color: 'text-orange-600' },
    { value: 'build_muscle', label: 'Build muscle', icon: Barbell, description: 'Get stronger and more defined', color: 'text-blue-600' },
    { value: 'get_healthier', label: 'Get healthier', icon: Heart, description: 'Improve overall wellness', color: 'text-red-600' },
    { value: 'maintain', label: 'Maintain weight', icon: Scales, description: 'Stay where you are', color: 'text-green-600' }
  ];

  const subOptions: Record<string, any> = {
    lose_weight: {
      question: "What's your biggest challenge?",
      field: 'goalChallenge',
      funFact: "People who plan meals lose 2x more weight than those who don't. You're already ahead.",
      options: [
        { value: 'snacking', label: 'I snack too much', icon: Cookie },
        { value: 'eating_out', label: 'I eat out a lot', icon: MapPin },
        { value: 'portions', label: 'Portions are hard', icon: Scales },
        { value: 'late_night', label: 'Late night eating', icon: Moon },
        { value: 'dont_know', label: "I don't know what to eat", icon: Question }
      ]
    },
    build_muscle: {
      question: "Where are you in your fitness journey?",
      field: 'fitnessLevel',
      funFact: "Muscle burns 3x more calories at rest than fat. You're building a faster metabolism.",
      options: [
        { value: 'beginner', label: 'Just getting started', icon: Plant },
        { value: 'intermediate', label: 'Some experience', icon: TrendUp },
        { value: 'advanced', label: 'I lift regularly', icon: Barbell }
      ]
    },
    get_healthier: {
      question: "What does 'healthier' mean to you?",
      field: 'healthFocus',
      funFact: "80% of your immune system lives in your gut. Good food = good defense.",
      options: [
        { value: 'energy', label: 'More energy', icon: Lightning },
        { value: 'digestion', label: 'Better digestion', icon: Heartbeat },
        { value: 'mental_clarity', label: 'Clearer mind', icon: Brain },
        { value: 'bloodwork', label: 'Improve bloodwork', icon: Heart },
        { value: 'general', label: 'Just feel better overall', icon: Sparkle }
      ]
    },
    maintain: {
      question: "What's your main goal right now?",
      field: 'maintainFocus',
      funFact: "Maintenance is the hardest phase - only 20% succeed long-term. Let's make it automatic.",
      options: [
        { value: 'consistency', label: 'Stay consistent', icon: Calendar },
        { value: 'recomp', label: 'Improve body composition', icon: PersonSimpleRun },
        { value: 'habits', label: 'Build better habits', icon: ArrowsClockwise },
        { value: 'intuitive', label: 'Eat without tracking', icon: CheckCircle }
      ]
    }
  };

  // Legacy goals (kept for backwards compatibility)
  const goals = [
    { value: 'WEIGHT_LOSS', label: 'Weight Loss' },
    { value: 'MUSCLE_GAIN', label: 'Muscle Gain' },
    { value: 'ENDURANCE', label: 'Endurance' },
    { value: 'GENERAL_WELLNESS', label: 'Wellness' }
  ];

  const activityLevels = [
    { value: 'SEDENTARY', label: 'Sedentary', desc: 'Little to no exercise' },
    { value: 'LIGHTLY_ACTIVE', label: 'Light', desc: '1-3 days per week' },
    { value: 'MODERATELY_ACTIVE', label: 'Moderate', desc: '3-5 days per week' },
    { value: 'VERY_ACTIVE', label: 'High', desc: '6-7 days per week' }
  ];

  const preferredActivitiesOptions = [
    'Cardio (Running, Cycling, Swimming)',
    'Strength Training (Weights, Bodyweight)',
    'Sports (Basketball, Tennis, Soccer)',
    'Mind-Body (Yoga, Pilates, Tai Chi)',
    'Outdoor Activities (Hiking, Rock Climbing)',
    'Group Fitness (Dance, Classes, CrossFit)',
    'Low Impact (Walking, Stretching)',
    'Martial Arts & Combat Sports'
  ];

  const budgetOptions = [
    { value: 'under_200', label: 'Under $200/mo' },
    { value: '200_400', label: '$200-400/mo' },
    { value: '400_600', label: '$400-600/mo' },
    { value: '600_plus', label: '$600+/mo' }
  ];

  const initialCuisineOptions = [
    'Mediterranean', 'Italian', 'Mexican', 'Chinese',
    'Japanese', 'Thai', 'Indian', 'Middle Eastern'
  ];

  const additionalCuisineOptions = [
    'American', 'Korean', 'Vietnamese', 'Greek',
    'French', 'Spanish', 'Caribbean', 'Brazilian',
    'Turkish', 'Ethiopian', 'Moroccan', 'German',
    'British', 'Fusion', 'Vegan'
  ];

  const commonAllergies = [
    { label: 'Peanuts', value: 'peanuts' },
    { label: 'Tree nuts', value: 'tree nuts' },
    { label: 'Dairy', value: 'dairy' },
    { label: 'Eggs', value: 'eggs' },
    { label: 'Wheat/Gluten', value: 'wheat/gluten' },
    { label: 'Soy', value: 'soy' },
    { label: 'Fish', value: 'fish' },
    { label: 'Shellfish', value: 'shellfish' },
    { label: 'Sesame', value: 'sesame' }
  ];


  const foodOptionsByCategory = {
    'Proteins': ['Chicken', 'Salmon', 'Tuna', 'Beef', 'Pork', 'Turkey', 'Eggs', 'Tofu', 'Tempeh', 'Beans', 'Lentils', 'Greek Yogurt'],
    'Grains & Starches': ['Rice', 'Quinoa', 'Pasta', 'Bread', 'Oats', 'Sweet Potato', 'Regular Potato', 'Couscous'],
    'Vegetables': ['Spinach', 'Broccoli', 'Kale', 'Bell Peppers', 'Carrots', 'Tomatoes', 'Avocado', 'Mushrooms', 'Onions', 'Zucchini'],
    'Fruits': ['Berries', 'Bananas', 'Apples', 'Oranges', 'Grapes', 'Mango', 'Pineapple', 'Watermelon'],
    'Healthy Fats': ['Nuts', 'Seeds', 'Olive Oil', 'Coconut Oil', 'Nut Butters', 'Cheese', 'Dark Chocolate']
  };


  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateFillerQuestions = (field: keyof SurveyData['fillerQuestions'], value: any) => {
    setFormData(prev => ({
      ...prev,
      fillerQuestions: {
        ...prev.fillerQuestions,
        [field]: value
      }
    }));
  };

  const toggleAllergy = (value: string) => {
    const current = formData.fillerQuestions?.foodAllergies || [];
    const normalized = value.toLowerCase();
    const updated = current.includes(normalized)
      ? current.filter(item => item !== normalized)
      : [...current, normalized];
    updateFillerQuestions('foodAllergies', updated);
  };

  const getNormalizedFillerQuestions = () => ({
    ...formData.fillerQuestions,
    cookingFrequency: formData.fillerQuestions?.cookingFrequency || 'few_times_week',
    foodAllergies: formData.fillerQuestions?.foodAllergies || []
  });

  // Template selection handler
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = mealScheduleTemplates.find(t => t.id === templateId);
    if (template) {
      const expandedSchedule = expandTemplate(template);
      // Convert WeeklySchedule format to the format expected by formData
      const formattedSchedule = Object.entries(expandedSchedule).reduce((acc, [day, schedule]) => {
        acc[day] = {
          breakfast: schedule.breakfast === 'no-meal' ? 'no-meal' : schedule.breakfast,
          lunch: schedule.lunch === 'no-meal' ? 'no-meal' : schedule.lunch,
          dinner: schedule.dinner === 'no-meal' ? 'no-meal' : schedule.dinner,
        };
        return acc;
      }, {} as Record<string, { breakfast: string; lunch: string; dinner: string }>);

      updateFormData('weeklyMealSchedule', formattedSchedule);
      // Auto-show customize view for "custom" template
      setShowCustomize(templateId === 'custom');
    }
  };

  // Bulk action helpers for customization
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const setAllMeals = (mealType: keyof DaySchedule, value: MealType) => {
    const newSchedule = { ...formData.weeklyMealSchedule };
    Object.keys(newSchedule).forEach(day => {
      newSchedule[day] = { ...newSchedule[day], [mealType]: value };
    });
    updateFormData('weeklyMealSchedule', newSchedule);
  };

  const setWeekdayMeal = (mealType: keyof DaySchedule, value: MealType) => {
    const newSchedule = { ...formData.weeklyMealSchedule };
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
      newSchedule[day] = { ...newSchedule[day], [mealType]: value };
    });
    updateFormData('weeklyMealSchedule', newSchedule);
  };

  const resetToTemplate = () => {
    if (selectedTemplate) {
      const template = mealScheduleTemplates.find(t => t.id === selectedTemplate);
      if (template) {
        handleTemplateSelect(selectedTemplate);
      }
    }
  };

  const updateDay = (day: string, meal: keyof DaySchedule, type: MealType) => {
    const newSchedule = {
      ...formData.weeklyMealSchedule,
      [day]: {
        ...formData.weeklyMealSchedule[day],
        [meal]: type
      }
    };
    updateFormData('weeklyMealSchedule', newSchedule);
  };

  // Helper functions for enhanced goal selection
  const handlePrimaryGoalChange = (value: string) => {
    // Clear sub-option fields when primary goal changes
    updateFormData('primaryGoal', value);
    updateFormData('goalChallenge', '');
    updateFormData('fitnessLevel', '');
    updateFormData('healthFocus', '');
    updateFormData('maintainFocus', '');

    // Map to legacy goal field for backwards compatibility
    const goalMapping: Record<string, string> = {
      'lose_weight': 'WEIGHT_LOSS',
      'build_muscle': 'MUSCLE_GAIN',
      'get_healthier': 'GENERAL_WELLNESS',
      'maintain': 'WEIGHT_LOSS'
    };
    updateFormData('goal', goalMapping[value] || '');
  };

  const getSubOptionValue = () => {
    const primaryGoal = formData.primaryGoal;
    switch (primaryGoal) {
      case 'lose_weight': return formData.goalChallenge;
      case 'build_muscle': return formData.fitnessLevel;
      case 'get_healthier': return formData.healthFocus;
      case 'maintain': return formData.maintainFocus;
      default: return null;
    }
  };

  const setSubOptionValue = (value: string) => {
    const primaryGoal = formData.primaryGoal;
    const field = primaryGoal ? subOptions[primaryGoal as keyof typeof subOptions]?.field : undefined;
    if (field) {
      updateFormData(field, value);
    }
  };

  const validateStep = (step: number): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    switch (step) {
      case 1: {
        // Email validation
        if (!formData.email || !formData.email.trim()) {
          errors.push("Please enter your email address");
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
          errors.push("Please enter a valid email address");
        }

        // Name validation
        if (!formData.firstName || !formData.firstName.trim()) {
          errors.push("Please enter your first name");
        }
        if (!formData.lastName || !formData.lastName.trim()) {
          errors.push("Please enter your last name");
        }

        // Age validation
        const age = Number(formData.age);
        if (!age || age < 13 || age > 120) {
          errors.push("Please enter a valid age (13-120)");
        }
        break;
      }
      case 2: {
        if (!formData.goal) {
          errors.push("Please select your primary goal");
        }
        break;
      }
      case 3: {
        const height = Number(formData.height);
        const weight = Number(formData.weight);
        if (!formData.sex) {
          errors.push("Please select your sex");
        }
        if (!height || height < 36 || height > 96) {
          errors.push("Please enter your height");
        }
        if (!weight || weight < 50 || weight > 700) {
          errors.push("Please enter your weight");
        }
        break;
      }
      case 4: {
        if (!formData.activityLevel) {
          errors.push("Please select your activity level");
        }
        break;
      }
      case 5: {
        if (!formData.weeklyMealSchedule || Object.keys(formData.weeklyMealSchedule).length === 0) {
          errors.push("Please set up your weekly meal schedule");
        }
        break;
      }
      case 6: {
        // Address validation
        if (!formData.city || !formData.city.trim()) {
          errors.push("Please enter your city");
        }
        if (!formData.state || !formData.state.trim()) {
          errors.push("Please enter your state");
        }
        if (!formData.zipCode || !formData.zipCode.trim()) {
          errors.push("Please enter your ZIP code");
        }
        break;
      }
      case 7: {
        if (preferenceConflicts.some(conflict => conflict.severity === 'error')) {
          errors.push('Please resolve the conflicting preferences shown above');
        }
        break;
      }
      case 8: {
        if (!formData.workoutPreferences?.preferredDuration) {
          errors.push("Please select your preferred workout duration");
        }
        if (!formData.workoutPreferences?.availableDays || formData.workoutPreferences.availableDays.length === 0) {
          errors.push("Please select at least one workout day");
        }
        break;
      }
      default:
        break;
    }

    return { valid: errors.length === 0, errors };
  };

  const getAllergySelectionCount = () => {
    const strictSelections = Object.values(formData.strictExclusions || {}).flat().length;
    const listedAllergies = formData.fillerQuestions?.foodAllergies?.length || 0;
    return strictSelections + listedAllergies;
  };

  useEffect(() => {
    const conflicts = checkPreferenceConflicts(
      formData.preferredFoods || [],
      formData.dietPrefs || [],
      formData.strictExclusions || {},
      formData.fillerQuestions?.foodAllergies || []
    );
    setPreferenceConflicts(conflicts);
  }, [
    formData.preferredFoods,
    formData.dietPrefs,
    formData.strictExclusions,
    formData.fillerQuestions?.foodAllergies
  ]);

  const proceedToNext = async () => {
    // Start meal generation after step 7 (food preferences completed)
    if (currentStep === 7) {

      try {
        // Start meal generation with current form data (including food preferences)
        const progressiveData = {
          email: formData.email || 'temp@example.com',
          firstName: formData.firstName || 'User',
          lastName: formData.lastName || '',
          age: Number(formData.age) || 25,
          sex: formData.sex || 'nonbinary',
          height: Number(formData.height) || 70,
          weight: Number(formData.weight) || 150,

          // Full address fields
          streetAddress: formData.streetAddress || '',
          city: formData.city || '',
          state: formData.state || '',
          zipCode: formData.zipCode || '10001',
          country: formData.country || 'United States',
          goal: formData.goal || 'GENERAL_WELLNESS',
          activityLevel: formData.activityLevel || 'MODERATELY_ACTIVE',
          sportsInterests: formData.sportsInterests || '',
          fitnessTimeline: formData.fitnessTimeline || '',
          monthlyFoodBudget: Number(formData.monthlyFoodBudget) || 200,
          monthlyFitnessBudget: Number(formData.monthlyFitnessBudget) || 50,
          dietPrefs: normalizeDietPrefs(formData.dietPrefs || []),
          weeklyMealSchedule: formData.weeklyMealSchedule,
          distancePreference: formData.distancePreference || 'medium',
          preferredCuisines: formData.preferredCuisines || [],
          preferredFoods: formData.preferredFoods,
          customFoodInput: formData.customFoodInput,
          uploadedFiles: formData.uploadedFiles,
          preferredNutrients: formData.preferredNutrients,
          fillerQuestions: getNormalizedFillerQuestions(),
          workoutPreferences: formData.workoutPreferences,
          biomarkers: formData.biomarkers,
          source: formData.source,
          currentStep: 7
        };

        // Actually trigger meal generation
        console.log('[Frontend] Triggering meal generation at step 7');
        const response = await fetch('/api/survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progressiveData)
        });

        if (!response.ok) {
          throw new Error(`Meal generation API error: ${response.status}`);
        }

        const result = await response.json();
        console.log('[Frontend] Meal generation triggered:', result);


      } catch (error) {
        console.error('[Progressive] Failed to start meal generation:', error);
      } finally {
        setCurrentStep(currentStep + 1);
      }
      return;
    }

    // Start workout generation after step 8 (workout preferences completed)
    if (currentStep === 8) {

      try {
        // Start workout generation with current form data
        const progressiveData = {
          email: formData.email || 'temp@example.com',
          firstName: formData.firstName || 'User',
          lastName: formData.lastName || '',
          age: Number(formData.age) || 25,
          sex: formData.sex || 'nonbinary',
          height: Number(formData.height) || 70,
          weight: Number(formData.weight) || 150,

          // Full address fields
          streetAddress: formData.streetAddress || '',
          city: formData.city || '',
          state: formData.state || '',
          zipCode: formData.zipCode || '10001',
          country: formData.country || 'United States',
          goal: formData.goal || 'GENERAL_WELLNESS',
          activityLevel: formData.activityLevel || 'MODERATELY_ACTIVE',
          sportsInterests: formData.sportsInterests || '',
          fitnessTimeline: formData.fitnessTimeline || '',
          monthlyFoodBudget: Number(formData.monthlyFoodBudget) || 200,
          monthlyFitnessBudget: Number(formData.monthlyFitnessBudget) || 50,
          dietPrefs: normalizeDietPrefs(formData.dietPrefs || []),
          weeklyMealSchedule: formData.weeklyMealSchedule,
          distancePreference: formData.distancePreference || 'medium',
          preferredCuisines: formData.preferredCuisines || [],
          preferredFoods: formData.preferredFoods,
          customFoodInput: formData.customFoodInput,
          uploadedFiles: formData.uploadedFiles,
          preferredNutrients: formData.preferredNutrients,
          fillerQuestions: getNormalizedFillerQuestions(),
          workoutPreferences: formData.workoutPreferences,
          biomarkers: formData.biomarkers,
          source: formData.source,
          currentStep: 8
        };

        // Actually trigger workout generation
        console.log('[Frontend] Triggering workout generation at step 8');
        const response = await fetch('/api/survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progressiveData)
        });

        if (!response.ok) {
          throw new Error(`Workout generation API error: ${response.status}`);
        }

        const result = await response.json();
        console.log('[Frontend] Workout generation triggered:', result);


      } catch (error) {
        console.error('[Progressive] Failed to start workout generation:', error);
      } finally {
        setCurrentStep(currentStep + 1);
      }
      return;
    }

    // Normal step progression
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(formData);
    }
  };

  const handleNext = async () => {
    const validation = validateStep(currentStep);
    if (!validation.valid) {
      setStepErrors(validation.errors);
      return;
    }

    if (currentStep === 7 && getAllergySelectionCount() === 0) {
      setStepErrors([]);
      setShowAllergyConfirmation(true);
      return;
    }

    setStepErrors([]);
    await proceedToNext();
  };

  const handlePrevious = () => {
    if (currentStep === 1) {
      onBack();
    } else {
      setCurrentStep(currentStep - 1);
      setStepErrors([]);
    }
  };

  const toggleArrayItem = (field: string, item: string) => {
    const currentArray = formData[field as keyof typeof formData] as string[];

    if (currentArray.includes(item)) {
      // Remove item if already selected
      const updated = currentArray.filter(i => i !== item);
      updateFormData(field, updated);
    } else {
      // Add item, but limit cuisines to 7 max
      if (field === 'preferredCuisines' && currentArray.length >= 7) {
        return; // Don't add if already at max
      }
      const updated = [...currentArray, item];
      updateFormData(field, updated);
    }
  };

  const toggleExclusion = (category: string, item: string) => {
    const currentExclusions = formData.strictExclusions[category as keyof typeof formData.strictExclusions] || [];
    const updated = currentExclusions.includes(item)
      ? currentExclusions.filter(i => i !== item)
      : [...currentExclusions, item];

    setFormData(prev => ({
      ...prev,
      strictExclusions: {
        ...prev.strictExclusions,
        [category]: updated
      }
    }));
  };

  const toggleDietPreference = (dietPref: string) => {
    const currentDietPrefs = formData.dietPrefs || [];
    if (dietPref === 'none') {
      updateFormData('dietPrefs', ['none']);
      return;
    }

    const updatedDietPrefs = currentDietPrefs.includes(dietPref)
      ? currentDietPrefs.filter(d => d !== dietPref && d !== 'none')
      : [...currentDietPrefs.filter(d => d !== 'none'), dietPref];

    updateFormData('dietPrefs', updatedDietPrefs);
  };

  const addOtherDietType = () => {
    const cleaned = otherDietType.trim();
    if (!cleaned) return;
    const entry = `other:${cleaned}`;
    const currentDietPrefs = formData.dietPrefs || [];
    if (!currentDietPrefs.includes(entry)) {
      updateFormData('dietPrefs', [...currentDietPrefs.filter(d => d !== 'none'), entry]);
    }
    setOtherDietType('');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Target className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Personal Information</h2>
              <p className="text-gray-600">Help us understand your starting point</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-700 mb-2 block">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateFormData("email", e.target.value)}
                  placeholder="your.email@example.com"
                  className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700 mb-2 block">First Name</Label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => updateFormData("firstName", e.target.value)}
                    placeholder="John"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 mb-2 block">Last Name</Label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) => updateFormData("lastName", e.target.value)}
                    placeholder="Doe"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </div>
              <div>
                <Label className="text-gray-700 mb-2 block">
                  Age <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  value={formData.age}
                  onChange={(e) => updateFormData("age", e.target.value ? Number(e.target.value) : '')}
                  placeholder="25"
                  className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                />
              </div>

            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Heartbeat className="w-12 h-12 text-red-600 mx-auto mb-4" weight="regular" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Health Goals</h2>
              <p className="text-gray-600">What would you like to achieve?</p>
            </div>
            <div>
              {/* Primary Goal Selection */}
              <div className="space-y-4">
                <Label className="text-neutral-700 mb-4 block text-lg font-medium">
                  Choose your primary goal <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {primaryGoals.map((goal) => (
                    <button
                      key={goal.value}
                      onClick={() => handlePrimaryGoalChange(goal.value)}
                      className={`p-6 rounded-xl border-2 transition-all duration-200 text-left ${
                        formData.primaryGoal === goal.value
                          ? 'border-red-500 bg-red-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <goal.icon
                          size={40}
                          weight="duotone"
                          className={`${goal.color} flex-shrink-0 mt-1`}
                        />
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">{goal.label}</h3>
                          <p className="text-sm text-gray-600">{goal.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-options (show when primaryGoal selected) */}
              {formData.primaryGoal && subOptions[formData.primaryGoal] && (
                <div className="space-y-6 mt-8 pt-6 border-t border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h3 className="text-lg font-medium text-gray-900">
                    {subOptions[formData.primaryGoal].question}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {subOptions[formData.primaryGoal].options.map((option: any) => (
                      <button
                        key={option.value}
                        onClick={() => setSubOptionValue(option.value)}
                        className={`p-4 rounded-lg border flex items-center gap-3 text-left transition-all duration-200 ${
                          getSubOptionValue() === option.value
                            ? 'border-red-500 bg-red-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-sm'
                        }`}
                      >
                        <option.icon
                          size={24}
                          className="text-gray-600 flex-shrink-0"
                        />
                        <span className="font-medium text-gray-900">{option.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Fun fact (show when sub-option selected) */}
                  {getSubOptionValue() && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 animate-in fade-in duration-300">
                      <Sparkle size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-blue-900 mb-1">Did you know?</p>
                        <p className="text-sm text-blue-800">{subOptions[formData.primaryGoal].funFact}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6 sm:mb-8">
              <Scales className="w-12 h-12 text-blue-600 mx-auto mb-4" weight="regular" />
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-medium text-gray-900 mb-3">Body Measurements</h2>
              <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">We need these details to personalize your meal plans and workout routines for optimal results</p>
            </div>

            <div className="space-y-6">
              <div>
                <Label className="text-gray-700 mb-3 block">
                  Sex <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 max-w-2xl">
                  <label className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="sex"
                      value="male"
                      checked={formData.sex === 'male'}
                      onChange={(e) => updateFormData("sex", e.target.value)}
                      className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                    />
                    <span className="ml-2 text-gray-700 font-medium">Male</span>
                  </label>
                  <label className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="sex"
                      value="female"
                      checked={formData.sex === 'female'}
                      onChange={(e) => updateFormData("sex", e.target.value)}
                      className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                    />
                    <span className="ml-2 text-gray-700 font-medium">Female</span>
                  </label>
                  <label className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="sex"
                      value="nonbinary"
                      checked={formData.sex === 'nonbinary'}
                      onChange={(e) => updateFormData("sex", e.target.value)}
                      className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                    />
                    <span className="ml-2 text-gray-700 font-medium">Non-binary</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg">
                <div>
                  <Label className="text-gray-700 mb-2 block">
                    Weight (lbs) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => updateFormData("weight", e.target.value ? Number(e.target.value) : '')}
                    placeholder="150"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 mb-2 block">
                    Height <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="3"
                      max="8"
                      placeholder="Feet"
                      value={formData.heightFeet}
                      onChange={(e) => {
                        const feet = e.target.value ? Number(e.target.value) : '';
                        updateFormData("heightFeet", feet);
                        // Calculate total inches and update height field
                        const totalInches = (feet ? Number(feet) : 0) * 12 + (formData.heightInches ? Number(formData.heightInches) : 0);
                        updateFormData("height", totalInches >= 36 ? totalInches : '');
                      }}
                      className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                    />
                    <div className="text-xs text-gray-500 mt-1 text-center">Feet</div>
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="11"
                      placeholder="Inches"
                      value={formData.heightInches}
                      onChange={(e) => {
                        const inches = e.target.value ? Number(e.target.value) : '';
                        updateFormData("heightInches", inches);
                        // Calculate total inches and update height field
                        const totalInches = (formData.heightFeet ? Number(formData.heightFeet) : 0) * 12 + (inches ? Number(inches) : 0);
                        updateFormData("height", totalInches >= 36 ? totalInches : '');
                      }}
                      className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                    />
                    <div className="text-xs text-gray-500 mt-1 text-center">Inches</div>
                  </div>
                </div>
                {formData.heightFeet && formData.heightInches !== '' && (
                  <div className="text-sm text-gray-600 mt-2 text-center">
                    Total: {((formData.heightFeet ? Number(formData.heightFeet) : 0) * 12 + (formData.heightInches ? Number(formData.heightInches) : 0))} inches
                  </div>
                )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Privacy Protected</p>
                    <p>Your measurements are used only to calculate personalized nutrition and fitness recommendations. This data is encrypted and never shared.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Barbell className="w-12 h-12 text-blue-600 mx-auto mb-4" weight="regular" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Activity Preferences</h2>
              <p className="text-gray-600">Tell us about your fitness lifestyle</p>
            </div>

            {/* Activity Level */}
            <div className="space-y-4">
              <Label className="text-neutral-700 mb-4 block text-lg font-medium">
                How active are you? <span className="text-red-500">*</span>
              </Label>
              <RadioGroup value={formData.activityLevel} onValueChange={(value) => updateFormData("activityLevel", value)}>
                <div className="space-y-3">
                  {activityLevels.map((option) => (
                    <div
                      key={option.value}
                      className={`flex items-center space-x-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                        formData.activityLevel === option.value
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
                      }`}
                      onClick={() => updateFormData("activityLevel", option.value)}
                    >
                      <RadioGroupItem value={option.value} id={option.value} />
                      <div>
                        <Label
                          htmlFor={option.value}
                          className={`font-medium cursor-pointer ${
                            formData.activityLevel === option.value
                              ? "text-blue-900"
                              : "text-gray-900"
                          }`}
                        >
                          {option.label}
                        </Label>
                        <p className={`text-sm ${
                          formData.activityLevel === option.value
                            ? "text-blue-700"
                            : "text-gray-600"
                        }`}>
                          {option.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>

            {/* Activity Preferences */}
            <div className="space-y-4 pt-6 border-t border-gray-200">
              <div>
                <Label className="text-neutral-700 mb-4 block text-lg font-medium">How do you like to stay active?</Label>
                <p className="text-sm text-gray-600 mb-4">Select all activity types you enjoy (we'll factor these into your fitness recommendations)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {preferredActivitiesOptions.map((activity) => (
                    <button
                      key={activity}
                      onClick={() => toggleArrayItem("preferredActivities", activity)}
                      className={`p-4 text-sm text-left rounded-lg border transition-all duration-200 ${
                        (formData.preferredActivities || []).includes(activity)
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {activity}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Additional Goals */}
            <div className="space-y-4 pt-6 border-t border-gray-200">
              <div>
                <Label className="text-neutral-700 mb-3 block text-lg font-medium">Anything else you want to log or let us know about your goals?</Label>
                <p className="text-sm text-gray-600 mb-4">Share any specific goals, preferences, or things we should know about your health journey</p>
                <textarea
                  value={formData.additionalGoalsNotes}
                  onChange={(e) => updateFormData("additionalGoalsNotes", e.target.value)}
                  placeholder="Ex. I want to improve my sleep, I have a knee injury, I prefer morning workouts, I'm training for a marathon..."
                  className="w-full h-32 p-4 border border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white text-gray-900 placeholder:text-gray-500 resize-none transition-all duration-200"
                />
                <div className="mt-2 text-xs text-gray-500">
                  This helps us personalize your meal plans and workout routines for your specific needs
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <CurrencyDollar className="w-12 h-12 text-red-600 mx-auto mb-4" weight="regular" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Budget Preferences</h2>
              <p className="text-gray-600">Help us recommend options within your range</p>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">Monthly food budget: ${Array.isArray(formData.monthlyFoodBudget) ? formData.monthlyFoodBudget[0] : formData.monthlyFoodBudget}{Array.isArray(formData.monthlyFoodBudget) ? (formData.monthlyFoodBudget[0] >= 1000 ? '+' : '') : (Number(formData.monthlyFoodBudget) >= 1000 ? '+' : '')}</Label>
              <Slider
                value={Array.isArray(formData.monthlyFoodBudget) ? formData.monthlyFoodBudget : [formData.monthlyFoodBudget as number]}
                onValueChange={(value) => updateFormData("monthlyFoodBudget", value[0])}
                max={1000}
                min={0}
                step={25}
                className="mb-6"
              />
              <div className="flex justify-between text-sm text-neutral-500">
                <span>$0</span>
                <span>$1000+</span>
              </div>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">Monthly fitness budget: ${Array.isArray(formData.monthlyFitnessBudget) ? formData.monthlyFitnessBudget[0] : formData.monthlyFitnessBudget}</Label>
              <Slider
                value={Array.isArray(formData.monthlyFitnessBudget) ? formData.monthlyFitnessBudget : [formData.monthlyFitnessBudget as number]}
                onValueChange={(value) => updateFormData("monthlyFitnessBudget", value[0])}
                max={500}
                min={0}
                step={10}
                className="mb-6"
              />
              <div className="flex justify-between text-sm text-neutral-500">
                <span>$0</span>
                <span>$500</span>
              </div>
            </div>
            <div>
              {!selectedTemplate ? (
                <>
                  <Label className="text-neutral-700 mb-4 block">
                    What does your typical week look like? <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-neutral-600 mb-4">Choose a template that matches your lifestyle, then customize if needed.</p>

                  {/* Template Selection Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {mealScheduleTemplates.filter(t => t.id !== 'custom').map((template) => {
                      const IconComponent = template.icon;
                      return (
                        <button
                          key={template.id}
                          onClick={() => handleTemplateSelect(template.id)}
                          className="p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-red-300 transition-colors text-left group"
                        >
                          <IconComponent className="w-8 h-8 text-red-600 mb-3 group-hover:scale-110 transition-transform" />
                          <h3 className="font-medium text-gray-900 mb-1">{template.label}</h3>
                          <p className="text-sm text-gray-600">{template.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Option - Full Width */}
                  <button
                    onClick={() => handleTemplateSelect('custom')}
                    className="w-full p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-red-300 transition-colors text-left group"
                  >
                    <div className="flex items-center">
                      <Faders className="w-8 h-8 text-red-600 mr-3 group-hover:scale-110 transition-transform" />
                      <div>
                        <h3 className="font-medium text-gray-900">Custom</h3>
                        <p className="text-sm text-gray-600">I'll set each meal myself</p>
                      </div>
                    </div>
                  </button>
                </>
              ) : !showCustomize ? (
                <>
                  {/* Template Selected - Summary View */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                        <span className="font-medium text-gray-900">
                          {mealScheduleTemplates.find(t => t.id === selectedTemplate)?.label}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTemplate(null);
                          setShowCustomize(false);
                        }}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Change
                      </button>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Weekdays (Mon-Fri)</p>
                        <p className="text-sm">
                          {formatDaySchedule(formData.weeklyMealSchedule.monday as DaySchedule)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Weekends (Sat-Sun)</p>
                        <p className="text-sm">
                          {formatDaySchedule(formData.weeklyMealSchedule.saturday as DaySchedule)}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowCustomize(true)}
                        className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Customize days
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Customize View - Show Full Calendar */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900">Customize your schedule</h3>
                      <button
                        onClick={() => setShowCustomize(false)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Done
                      </button>
                    </div>

                    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                      {/* Header */}
                      <div className="grid grid-cols-4 bg-neutral-50 border-b border-neutral-200">
                        <div className="p-3 font-medium text-sm text-neutral-700">Day</div>
                        <div className="p-3 font-medium text-sm text-neutral-700 text-center">Breakfast</div>
                        <div className="p-3 font-medium text-sm text-neutral-700 text-center">Lunch</div>
                        <div className="p-3 font-medium text-sm text-neutral-700 text-center">Dinner</div>
                      </div>

                      {/* Days */}
                      {Object.entries(formData.weeklyMealSchedule).map(([day, meals]) => (
                        <div key={day} className="grid grid-cols-4 border-b border-neutral-100 last:border-b-0">
                          <div className="p-3 font-medium text-sm text-neutral-800 capitalize bg-neutral-25 flex items-center">
                            {day}
                          </div>
                          {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
                            <div key={meal} className="p-2">
                              <select
                                value={meals[meal]}
                                onChange={(e) => {
                                  const newSchedule = {
                                    ...formData.weeklyMealSchedule,
                                    [day]: {
                                      ...formData.weeklyMealSchedule[day],
                                      [meal]: e.target.value
                                    }
                                  };
                                  updateFormData("weeklyMealSchedule", newSchedule);
                                }}
                                className="w-full p-2 text-xs border border-neutral-200 rounded focus:border-red-300 focus:outline-none bg-white"
                              >
                                <option value="no-meal">Skip</option>
                                <option value="home">Home</option>
                                <option value="restaurant">Restaurant</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="mt-3 text-xs text-neutral-500">
                Tip: We'll suggest home recipes for "Home" meals and find great local restaurants for "Restaurant" meals
              </div>
            </div>

          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <ForkKnife className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Cuisine Preferences</h2>
              <p className="text-gray-600">Select up to 7 cuisines you enjoy</p>
            </div>

            {/* Selected Cuisines Section */}
            {formData.preferredCuisines.length > 0 && (
              <div className="mb-6">
                <Label className="text-neutral-700 mb-3 block">Selected ({formData.preferredCuisines.length}):</Label>
                <div className="flex flex-wrap gap-2">
                  {formData.preferredCuisines.map((cuisine) => (
                    <button
                      key={`selected-${cuisine}`}
                      onClick={() => toggleArrayItem("preferredCuisines", cuisine)}
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all duration-200 transform hover:scale-105"
                    >
                      {cuisine}
                      <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Available Cuisines Section */}
            <div>
              <Label className="text-neutral-700 mb-3 block">Available cuisines:</Label>

              {/* Initial Options */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                {initialCuisineOptions
                  .filter(cuisine => !formData.preferredCuisines.includes(cuisine))
                  .map((cuisine) => (
                    <button
                      key={`initial-${cuisine}`}
                      onClick={() => toggleArrayItem("preferredCuisines", cuisine)}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-center min-h-[44px] flex items-center justify-center"
                    >
                      {cuisine}
                    </button>
                  ))}
              </div>

              {/* Show additional options when user has selected at least one cuisine */}
              {formData.preferredCuisines.length > 0 && (
                <div>
                  <Label className="text-neutral-700 mb-3 block text-sm">More options:</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {additionalCuisineOptions
                      .filter(cuisine => !formData.preferredCuisines.includes(cuisine))
                      .map((cuisine) => (
                        <button
                          key={`additional-${cuisine}`}
                          onClick={() => toggleArrayItem("preferredCuisines", cuisine)}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-center min-h-[44px] flex items-center justify-center"
                        >
                          {cuisine}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Address Section for Restaurant Recommendations */}
            <div className="space-y-4 border-t pt-6">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Your Location</h3>
                <p className="text-sm text-gray-600">Needed to give you recommendations around you</p>
              </div>

              <div>
                <Label className="text-gray-700 mb-2 block">Address</Label>
                <Input
                  value={formData.streetAddress}
                  onChange={(e) => updateFormData("streetAddress", e.target.value)}
                  placeholder="Enter your address"
                  className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700 mb-2 block">City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => updateFormData("city", e.target.value)}
                    placeholder="New York"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 mb-2 block">State</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => updateFormData("state", e.target.value)}
                    placeholder="NY"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700 mb-2 block">ZIP Code</Label>
                  <Input
                    value={formData.zipCode}
                    onChange={(e) => updateFormData("zipCode", e.target.value)}
                    placeholder="10001"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 mb-2 block">Country</Label>
                  <Input
                    value={formData.country}
                    onChange={(e) => updateFormData("country", e.target.value)}
                    placeholder="United States"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Label className="text-neutral-700 mb-4 block">How far are you willing to travel for restaurants?</Label>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { value: 'close', label: 'Close to me', description: 'Under 2 miles' },
                  { value: 'medium', label: 'Moderate distance', description: '2-5 miles' },
                  { value: 'far', label: 'Willing to travel', description: '5-10+ miles' }
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={formData.distancePreference === option.value ? "default" : "outline"}
                    className={`p-4 h-auto text-left transition-all duration-200 ${
                      formData.distancePreference === option.value
                        ? "bg-red-600 text-white"
                        : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                    }`}
                    onClick={() => updateFormData("distancePreference", option.value)}
                  >
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm opacity-80">{option.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case 7: {
        const selectedAllergies = formData.fillerQuestions?.foodAllergies || [];
        const commonAllergyValues = commonAllergies.map(allergy => allergy.value);
        const customAllergiesValue = selectedAllergies
          .filter(allergy => !commonAllergyValues.includes(allergy))
          .join(', ');
        const isNoRestrictionsSelected = formData.dietPrefs.length === 0 || formData.dietPrefs.includes('none');
        const hasBlockingConflicts = preferenceConflicts.some(conflict => conflict.severity === 'error');

        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <AppleIcon className="w-12 h-12 text-red-600 mx-auto mb-4" weight="regular" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Food Preferences</h2>
              <p className="text-gray-600">Select foods you enjoy - more options will appear as you choose</p>
            </div>
            {preferenceConflicts.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-800 mb-2">Conflicting Preferences</h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {preferenceConflicts.map((conflict, i) => (
                    <li key={i}>• {conflict.reason}</li>
                  ))}
                </ul>
                <p className="text-sm text-yellow-600 mt-2">
                  {hasBlockingConflicts
                    ? 'Please resolve the error conflicts before continuing.'
                    : 'These are warnings only. You can continue if this is intentional.'}
                </p>
              </div>
            )}

            {/* Selected Foods Section */}
            {formData.preferredFoods.length > 0 && (
              <div className="mb-6">
                <Label className="text-neutral-700 mb-3 block">Selected ({formData.preferredFoods.length}):</Label>
                <div className="flex flex-wrap gap-2">
                  {formData.preferredFoods.map((food) => (
                    <button
                      key={`selected-food-${food}`}
                      onClick={() => toggleArrayItem("preferredFoods", food)}
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all duration-200 transform hover:scale-105"
                    >
                      {food}
                      <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Available Foods Section */}
            <div>
              <Label className="text-neutral-700 mb-3 block">Available foods:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {allFoodOptions
                  .filter(food => !formData.preferredFoods.includes(food))
                  .map((food) => (
                    <button
                      key={`available-food-${food}`}
                      onClick={() => toggleArrayItem("preferredFoods", food)}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-center min-h-[44px] flex items-center justify-center"
                    >
                      {food}
                    </button>
                  ))}
              </div>
            </div>

            {/* Custom Food Input */}
            <div className="border-t pt-6">
              <Label className="text-neutral-700 mb-3 block">Don't see something you like? Add custom foods:</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.customFoodInput}
                  onChange={(e) => updateFormData("customFoodInput", e.target.value)}
                  placeholder="e.g., quinoa bowls, acai, tempeh..."
                  className="flex-1 border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && formData.customFoodInput.trim()) {
                      e.preventDefault();
                      const customFood = formData.customFoodInput.trim();
                      if (!formData.preferredFoods.includes(customFood)) {
                        updateFormData("preferredFoods", [...formData.preferredFoods, customFood]);
                        updateFormData("customFoodInput", "");
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={() => {
                    const customFood = formData.customFoodInput.trim();
                    if (customFood && !formData.preferredFoods.includes(customFood)) {
                      updateFormData("preferredFoods", [...formData.preferredFoods, customFood]);
                      updateFormData("customFoodInput", "");
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-4"
                  disabled={!formData.customFoodInput.trim()}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Press Enter or click Add to include your custom food</p>
            </div>

            {/* Cooking Frequency */}
            <div className="border-t pt-6">
              <Label className="text-gray-700 mb-2 block">
                How often do you cook at home?
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { value: 'daily', label: 'Daily', desc: 'I cook most meals' },
                  { value: 'few_times_week', label: 'A few times a week', desc: '3-5 meals per week' },
                  { value: 'weekly', label: 'Once or twice a week', desc: '1-2 meals per week' },
                  { value: 'rarely', label: 'Rarely', desc: 'I prefer quick/simple meals' },
                  { value: 'never', label: 'Never', desc: "I don't cook at home" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateFillerQuestions('cookingFrequency', option.value)}
                    className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                      formData.fillerQuestions?.cookingFrequency === option.value
                        ? 'bg-green-50 border-green-300'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-500">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* SECTION 1: Diet Type */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900">Your Diet Type</h3>
              <p className="text-sm text-gray-600 mt-1">
                Select any dietary patterns you follow. We will ensure all meals fit these requirements.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {[
                  { value: 'none', label: 'No restrictions', desc: 'I eat everything' },
                  { value: 'vegetarian', label: 'Vegetarian', desc: 'No meat or fish' },
                  { value: 'vegan', label: 'Vegan', desc: 'No animal products' },
                  { value: 'pescatarian', label: 'Pescatarian', desc: 'Fish but no meat' },
                  { value: 'keto', label: 'Keto / Low-carb', desc: 'High fat, low carb' },
                  { value: 'paleo', label: 'Paleo', desc: 'Whole foods, no grains' },
                  { value: 'mediterranean', label: 'Mediterranean', desc: 'Plant-based, healthy fats' },
                  { value: 'halal', label: 'Halal', desc: 'Islamic dietary laws' },
                  { value: 'kosher', label: 'Kosher', desc: 'Jewish dietary laws' }
                ].map((diet) => {
                  const isSelected = diet.value === 'none'
                    ? isNoRestrictionsSelected
                    : formData.dietPrefs.includes(diet.value);
                  return (
                    <button
                      key={diet.value}
                      type="button"
                      onClick={() => toggleDietPreference(diet.value)}
                      className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                        isSelected
                          ? 'bg-green-50 border-green-300'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-gray-900">{diet.label}</div>
                      <div className="text-xs text-gray-500">{diet.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4">
                <Label className="text-sm text-gray-600">Other diet type (optional)</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={otherDietType}
                    onChange={(e) => setOtherDietType(e.target.value)}
                    placeholder="e.g., low-sodium, Jain, dairy-free"
                    className="flex-1 border-gray-300 focus:border-green-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                  <Button
                    type="button"
                    onClick={addOtherDietType}
                    className="bg-green-600 hover:bg-green-700 text-white px-4"
                    disabled={!otherDietType.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* SECTION 2: Foods to Avoid */}
            <div className="space-y-6 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900">Foods to Avoid</h3>

              {/* Part A: Allergies */}
              <div className="bg-red-100 border-4 border-red-300 rounded-xl p-6 shadow-lg">
                <div className="bg-red-200 border-2 border-red-400 rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-red-900 text-lg flex items-center gap-3 mb-2">
                    CRITICAL FOOD ALLERGIES
                    <span className="text-xs font-medium bg-red-600 text-white px-2 py-1 rounded-full">SAFETY CRITICAL</span>
                  </h4>
                  <p className="text-red-800 font-semibold mb-1">
                    These foods will NEVER appear in your meal plan
                  </p>
                  <p className="text-red-700 text-sm">
                    Only select items that could cause serious health reactions. This is different from foods you simply don't like.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {commonAllergies.map((allergy) => {
                    const isSelected = selectedAllergies.includes(allergy.value);
                    return (
                      <button
                        key={allergy.value}
                        type="button"
                        onClick={() => toggleAllergy(allergy.value)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-all duration-200 ${
                          isSelected
                            ? 'bg-red-200 text-red-800 border-red-300'
                            : 'bg-white border-gray-200 text-gray-700'
                        }`}
                      >
                        {allergy.label}
                      </button>
                    );
                  })}
                </div>
                <Input
                  className="mt-3"
                  placeholder="Other allergies (comma-separated)"
                  value={customAllergiesValue}
                  onChange={(e) => {
                    const customAllergies = e.target.value
                      .split(',')
                      .map(a => a.trim().toLowerCase())
                      .filter(Boolean);
                    const commonSelected = selectedAllergies.filter(allergy => commonAllergyValues.includes(allergy));
                    updateFillerQuestions('foodAllergies', Array.from(new Set([...commonSelected, ...customAllergies])));
                  }}
                />
              </div>

              {/* Part B: Dislikes */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h4 className="font-medium text-gray-800 flex items-center gap-2">
                  Foods I'd Rather Avoid
                  <span className="text-xs font-normal text-gray-500">(Preferences only)</span>
                </h4>
                <div className="text-sm text-gray-600 mb-3 space-y-1">
                  <p>These foods will be minimized but may occasionally appear in your plan</p>
                  <p className="text-xs text-gray-500">This is NOT the same as food allergies - these are just personal preferences</p>
                </div>
                <div className="space-y-3">
                  {Object.entries(exclusionCategories).map(([category, items]) => (
                    <div key={category}>
                      <div className="text-sm font-medium text-gray-700 mb-1 capitalize">{category}</div>
                      <div className="flex flex-wrap gap-2">
                        {items.map((item) => {
                          const isSelected = formData.strictExclusions[category as keyof typeof formData.strictExclusions]?.includes(item);
                          return (
                            <button
                              key={item}
                              onClick={() => toggleExclusion(category, item)}
                              className={`px-2 py-1 rounded text-sm ${
                                isSelected
                                  ? 'bg-gray-300 text-gray-800'
                                  : 'bg-white border-gray-200 text-gray-600 border'
                              }`}
                            >
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Label className="text-sm text-gray-600">Other foods to avoid (comma-separated)</Label>
                  <Input
                    value={formData.strictExclusions.other?.join(', ') || ''}
                    onChange={(e) => {
                      const items = e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                      setFormData(prev => ({
                        ...prev,
                        strictExclusions: {
                          ...prev.strictExclusions,
                          other: items
                        }
                      }));
                    }}
                    placeholder="e.g., cilantro, olives, mushrooms..."
                    className="border-gray-300 focus:border-gray-400 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 8:
        return (
          <div className="space-y-6">
            {/* Meal/Diet Preferences Completion Indicator */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <polyline points="20,6 9,17 4,12"></polyline>
                  </svg>
                </div>
                <div className="text-sm font-semibold text-green-800">
                  Meal/Diet Preferences Submitted
                </div>
              </div>
            </div>

            <div className="text-center mb-8">
              <Barbell className="w-12 h-12 text-red-600 mx-auto mb-4" weight="regular" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Workout Preferences</h2>
              <p className="text-gray-600">Let's design your fitness routine</p>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">
                Workout duration: {formData.workoutPreferences.preferredDuration} minutes <span className="text-red-500">*</span>
              </Label>
              <Slider
                value={[formData.workoutPreferences.preferredDuration]}
                onValueChange={(value) => updateFormData("workoutPreferences", { ...formData.workoutPreferences, preferredDuration: value[0] })}
                max={90}
                min={15}
                step={15}
                className="mb-6"
              />
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">
                Preferred days for workouts <span className="text-red-500">*</span>
              </Label>

              {/* Flexible Options */}
              <div className="mb-4 space-y-3">
                <Button
                  variant={formData.workoutPreferences.availableDays.length === 7 ? "default" : "outline"}
                  className={`w-full h-12 transition-all duration-200 ${
                    formData.workoutPreferences.availableDays.length === 7
                      ? "bg-red-600 text-white"
                      : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                  }`}
                  onClick={() => {
                    const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                    const isFlexible = formData.workoutPreferences.availableDays.length === 7;
                    const updated = isFlexible ? [] : allDays;
                    updateFormData("workoutPreferences", { ...formData.workoutPreferences, availableDays: updated });
                  }}
                >
                  I'm flexible - any day works
                </Button>

                <Button
                  variant={JSON.stringify(formData.workoutPreferences.availableDays.sort()) === JSON.stringify(["Mon", "Tue", "Wed", "Thu", "Fri"]) ? "default" : "outline"}
                  className={`w-full h-12 transition-all duration-200 ${
                    JSON.stringify(formData.workoutPreferences.availableDays.sort()) === JSON.stringify(["Mon", "Tue", "Wed", "Thu", "Fri"])
                      ? "bg-red-600 text-white"
                      : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                  }`}
                  onClick={() => {
                    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
                    const isWeekdays = JSON.stringify(formData.workoutPreferences.availableDays.sort()) === JSON.stringify(weekdays);
                    const updated = isWeekdays ? [] : weekdays;
                    updateFormData("workoutPreferences", { ...formData.workoutPreferences, availableDays: updated });
                  }}
                >
                  Weekdays only (Mon-Fri)
                </Button>
              </div>

              {/* Individual Days */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <Button
                    key={day}
                    variant={formData.workoutPreferences.availableDays.includes(day) ? "default" : "outline"}
                    className={`h-12 transition-all duration-200 text-xs sm:text-sm ${
                      formData.workoutPreferences.availableDays.includes(day)
                        ? "bg-red-600 text-white"
                        : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      const currentDays = formData.workoutPreferences.availableDays;
                      const updated = currentDays.includes(day)
                        ? currentDays.filter(d => d !== day)
                        : [...currentDays, day];
                      updateFormData("workoutPreferences", { ...formData.workoutPreferences, availableDays: updated });
                    }}
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">What types of workouts do you enjoy? (select all that apply)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  'Cardio', 'Strength Training', 'HIIT', 'Walking',
                  'Running', 'Yoga', 'Pilates', 'Swimming',
                  'Cycling', 'Dancing', 'Sports', 'Outdoor Activities'
                ].map((workoutType) => (
                  <button
                    key={workoutType}
                    onClick={() => {
                      const currentTypes = formData.workoutPreferences.workoutTypes;
                      const updated = currentTypes.includes(workoutType)
                        ? currentTypes.filter(t => t !== workoutType)
                        : [...currentTypes, workoutType];
                      updateFormData("workoutPreferences", { ...formData.workoutPreferences, workoutTypes: updated });
                    }}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-center min-h-[44px] flex items-center justify-center ${
                      formData.workoutPreferences.workoutTypes.includes(workoutType)
                        ? "bg-red-600 text-white border-red-600"
                        : "border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    {workoutType}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">Do you have access to a full functional gym?</Label>
              <div className="space-y-3">
                {[
                  { value: 'full_gym', label: 'Yes', description: 'I have access to a full gym with all equipment' },
                  { value: 'no_gym', label: 'No', description: 'I want to do more cardio and workouts without a gym' },
                  { value: 'free_weights', label: 'I have free weights', description: 'I have dumbbells, barbells, or similar equipment' },
                  { value: 'calisthenics', label: 'I prefer to do Calisthenics', description: 'Bodyweight exercises only' },
                  { value: 'recommend_gym', label: 'Recommend a gym near me', description: 'Help me find a gym in my area' }
                ].map((option) => (
                  <button
                    key={option.value}
                    className={`w-full p-4 text-left transition-all duration-200 rounded-lg border focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                      formData.workoutPreferences.gymAccess === option.value
                        ? "bg-red-600 text-white border-red-600"
                        : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      updateFormData("workoutPreferences", { ...formData.workoutPreferences, gymAccess: option.value });
                    }}
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-sm sm:text-base">{option.label}</div>
                      <div className={`text-xs sm:text-sm leading-relaxed ${
                        formData.workoutPreferences.gymAccess === option.value ? "text-white/90" : "text-gray-600"
                      }`}>
                        {option.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 9:
        return (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <Flask className="w-12 h-12 text-purple-600 mx-auto mb-4" weight="regular" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Health Metrics</h2>
              <p className="text-gray-600">Optional data to enhance your plan (skip if unavailable)</p>
            </div>

            {/* HIPAA Compliance Disclaimer */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">Privacy & Health Information Notice</p>
                  <p className="text-blue-700 leading-relaxed">
                    This application is not HIPAA-compliant and should not be used for storing sensitive medical information.
                    Any health data you provide is for personalized fitness and nutrition recommendations only.
                    For medical advice, please consult with qualified healthcare professionals.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 1 - File Upload */}
            <div className="space-y-4">
              <div>
                <Label className="text-neutral-700 mb-2 block">Upload reports (optional)</Label>
                <p className="text-sm text-gray-500 mb-3">Upload bloodwork, biomarkers, or any health reports</p>

                <label className="block cursor-pointer">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-900">Click to upload or drag and drop</p>
                    <p className="text-xs text-gray-500 mt-1">PDF, JPG, JPEG or PNG</p>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        const fileNames = Array.from(e.target.files).map(file => file.name);
                        updateFormData("uploadedFiles", [...formData.uploadedFiles, ...fileNames]);
                      }
                    }}
                  />
                </label>

                {/* File Preview */}
                {formData.uploadedFiles.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-700 mb-2">Uploaded files:</p>
                    <div className="space-y-1">
                      {formData.uploadedFiles.map((fileName, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2 text-sm">
                          <span className="text-gray-700">{fileName}</span>
                          <button
                            onClick={() => {
                              const updated = formData.uploadedFiles.filter((_, i) => i !== index);
                              updateFormData("uploadedFiles", updated);
                            }}
                            className="text-red-500 hover:text-red-700 ml-2"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2 - Nutrient Selection */}
            <div className="space-y-4">
              <div>
                <Label className="text-neutral-700 mb-3 block">What kinds of foods nutrient-wise do you prefer?</Label>
                <p className="text-sm text-gray-500 mb-4">Select nutrients you'd like to prioritize in your meal recommendations</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    'Biotin-rich', 'Iron-rich', 'Vitamin B12', 'Vitamin D',
                    'Vitamin C', 'Calcium', 'Omega-3', 'Magnesium',
                    'Zinc', 'Folate', 'Vitamin A', 'Potassium',
                    'Fiber-rich', 'Antioxidant-rich', 'Protein-rich', 'Probiotic'
                  ].map((nutrient) => (
                    <button
                      key={nutrient}
                      onClick={() => toggleArrayItem("preferredNutrients", nutrient)}
                      className={`px-3 py-3 text-sm rounded-lg border transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 min-h-[52px] flex items-center justify-center text-center ${
                        formData.preferredNutrients.includes(nutrient)
                          ? "bg-red-600 text-white border-red-600"
                          : "border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                      }`}
                    >
                      {nutrient}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-medium text-gray-900">Setup</h1>
            <span className="text-sm text-gray-600">{currentStep} of {totalSteps}</span>
          </div>
          <Progress value={progress} className="h-3 bg-gray-200 [&>div]:bg-red-600" />
        </div>

        <Card className="p-4 sm:p-6 lg:p-8 mb-6 border border-gray-200 bg-white">
          <p className="text-sm text-gray-500 mb-4">
            <span className="text-red-500">*</span> Required fields
          </p>
          {stepErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <ul className="text-red-600 text-sm space-y-1">
                {stepErrors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
          {renderStep()}
        </Card>

        {showAllergyConfirmation && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm allergies</h3>
              <p className="text-sm text-gray-600 mb-4">
                You haven't listed any food allergies or strict exclusions. If you have allergies, please add them so we can keep your meals safe.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAllergyConfirmation(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Add Allergies
                </button>
                <button
                  onClick={async () => {
                    setShowAllergyConfirmation(false);
                    await proceedToNext();
                  }}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium"
                >
                  I have no allergies
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 sm:gap-4 pt-4 border-t border-gray-100">
          <Button
            variant="outline"
            onClick={handlePrevious}
            className="flex-1 h-12 sm:h-14 px-4 sm:px-6 border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50 text-sm sm:text-base"
          >
            <CaretLeft className="w-4 h-4 mr-2" weight="regular" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            className="flex-1 h-12 sm:h-14 px-6 sm:px-8 bg-red-600 hover:bg-red-700 text-white transition-all duration-200 text-sm sm:text-base font-medium"
          >
            {currentStep === totalSteps ? "Complete" : "Next"}
            {currentStep !== totalSteps && <CaretRight className="w-4 h-4 ml-2" weight="regular" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SurveyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showSteps, setShowSteps] = useState(false);
  const [showQuickSummary, setShowQuickSummary] = useState(false);
  const [showProfileConfirmation, setShowProfileConfirmation] = useState(false);
  const [showLoadingJourney, setShowLoadingJourney] = useState(false);
  const [completedSurveyData, setCompletedSurveyData] = useState<SurveyData | null>(null);
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok?: boolean; error?: string } | null>(null);

  const [existingPlanCheck, setExistingPlanCheck] = useState<{
    checking: boolean;
    hasExistingPlan: boolean;
    isLoggedIn: boolean;
    userName?: string;
  }>({ checking: true, hasExistingPlan: false, isLoggedIn: false });

  const [showExistingPlanModal, setShowExistingPlanModal] = useState(false);

  // ExistingPlanModal component
  const ExistingPlanModal = ({ userName, onViewDashboard, onStartFresh }: {
    userName?: string;
    onViewDashboard: () => void;
    onStartFresh: () => void;
  }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-xl">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back{userName ? `, ${userName}` : ''}!
          </h2>
          <p className="text-gray-600">
            You already have a personalized plan. What would you like to do?
          </p>
        </div>
        <div className="space-y-3">
          <button onClick={onViewDashboard} className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-xl font-semibold">
            View My Dashboard
          </button>
          <button onClick={onStartFresh} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-4 rounded-xl font-semibold">
            Start Fresh Survey
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-4">
          Starting fresh will replace your current plans.
        </p>
      </div>
    </div>
  );

  // Check for existing plans on component mount
  useEffect(() => {
    const checkForExistingPlan = async () => {
      try {
        const [surveyRes, mealsRes] = await Promise.all([
          fetch('/api/survey'),
          fetch('/api/ai/meals/current')
        ]);
        const surveyData = surveyRes.ok ? await surveyRes.json() : null;
        const mealsData = mealsRes.ok ? await mealsRes.json() : null;

        const hasExistingPlan = !!(surveyData?.survey && mealsData?.mealPlan);
        const isLoggedIn = !surveyData?.survey?.isGuest && !!surveyData?.survey?.userId;

        setExistingPlanCheck({
          checking: false,
          hasExistingPlan,
          isLoggedIn,
          userName: surveyData?.survey?.firstName
        });

        if (isLoggedIn && hasExistingPlan) {
          setShowExistingPlanModal(true);
        }
      } catch {
        setExistingPlanCheck({ checking: false, hasExistingPlan: false, isLoggedIn: false });
      }
    };
    checkForExistingPlan();
  }, []);

  // Clear stale auth cookies if redirected here due to invalid user
  useEffect(() => {
    const clearStaleAuth = searchParams.get('clearStaleAuth');
    if (clearStaleAuth === 'true') {
      fetch('/api/auth/clear-stale', { method: 'POST' })
        .then(() => console.log('Cleared stale auth cookies'))
        .catch(err => console.warn('Failed to clear stale cookies:', err));
    }
  }, [searchParams]);

  // Clear old session when starting new survey
  useEffect(() => {
    const checkAndResetSession = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const isNewSurvey = urlParams.get('new') === 'true' || urlParams.get('reset') === 'true';

      // If explicitly starting new survey, or if we're at step 1 with existing data
      if (isNewSurvey) {
        console.log('[Survey] Starting fresh survey, clearing old session...');
        try {
          const response = await fetch('/api/survey/reset', { method: 'POST' });
          if (response.ok) {
            console.log('[Survey] ✅ Successfully cleared old session data');
          } else {
            console.warn('[Survey] ⚠️ Failed to reset session:', response.status);
          }
          // Clean up URL
          window.history.replaceState({}, '', '/survey');
        } catch (error) {
          console.error('[Survey] ❌ Failed to reset session:', error);
        }
      }
    };

    checkAndResetSession();
  }, []); // Only run once on component mount

  const handleStart = () => {
    setShowSteps(true);
  };

  const handleBack = () => {
    setShowSteps(false);
  };

  const handleStartOver = async () => {
    console.log('[Survey] Manual start over triggered...');
    try {
      const response = await fetch('/api/survey/reset', { method: 'POST' });
      if (response.ok) {
        console.log('[Survey] ✅ Session reset successful');
        // Redirect with new=true to trigger session clearing
        window.location.href = '/survey?new=true';
      } else {
        console.warn('[Survey] ⚠️ Failed to reset session:', response.status);
      }
    } catch (error) {
      console.error('[Survey] ❌ Failed to reset session:', error);
    }
  };

  const handleSurveyComplete = async (data: SurveyData) => {
    // Submit survey data first to get survey ID, then show profile confirmation
    setMessage(null);
    setSubmitting(true);

    try {
      const normalizedFillerQuestions = {
        ...data.fillerQuestions,
        cookingFrequency: data.fillerQuestions?.cookingFrequency || 'few_times_week',
        foodAllergies: data.fillerQuestions?.foodAllergies || []
      };

      const biomarkers: Record<string, number> = {};
      if (data.biomarkers.cholesterol) biomarkers.cholesterol = data.biomarkers.cholesterol;
      if (data.biomarkers.vitaminD) biomarkers.vitaminD = data.biomarkers.vitaminD;
      if (data.biomarkers.iron) biomarkers.iron = data.biomarkers.iron;

      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          age: Number(data.age),
          sex: data.sex,
          height: Number(data.height),
          weight: Number(data.weight),
          streetAddress: data.streetAddress,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          country: data.country,
          goal: data.goal,
          activityLevel: data.activityLevel,
          sportsInterests: data.sportsInterests,
          fitnessTimeline: data.fitnessTimeline,
          monthlyFoodBudget: Number(data.monthlyFoodBudget),
          monthlyFitnessBudget: Number(data.monthlyFitnessBudget),
          weeklyMealSchedule: data.weeklyMealSchedule,
          distancePreference: data.distancePreference,
          dietPrefs: normalizeDietPrefs(data.dietPrefs || []),
          preferredCuisines: data.preferredCuisines,
          preferredFoods: data.preferredFoods,
          customFoodInput: data.customFoodInput,
          uploadedFiles: data.uploadedFiles,
          preferredNutrients: data.preferredNutrients,
          fillerQuestions: normalizedFillerQuestions,
          biomarkers,
          step: 'final'
        })
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      const result = await res.json();

      // Store survey data with the returned survey ID and show quick summary
      // Generation is already triggered by the API call above
      const completedData = { ...data, id: result.surveyId };
      setCompletedSurveyData(completedData);
      setSurveyData(completedData);
      setShowSteps(false);
      setShowQuickSummary(true);  // Shows INSTANTLY - no API calls needed

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit survey';
      setMessage({ error: errorMessage });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSummaryComplete = () => {
    setShowQuickSummary(false);
    setShowLoadingJourney(true);  // Then show loading journey
  };

  const handleProfileConfirmationComplete = async () => {
    if (!surveyData) return;

    // Survey is already submitted, navigate to dashboard with completion flag
    router.push('/dashboard?surveyCompleted=true');
  };

  const handleBackFromProfileConfirmation = () => {
    setShowProfileConfirmation(false);
    setShowSteps(true);
  };

  // LoadingJourney handlers
  const handleLoadingComplete = () => {
    // Generation complete, go directly to dashboard instead of ProfileConfirmation
    setShowLoadingJourney(false);
    router.push('/dashboard?justCompleted=true');
  };

  const handleSkipToDashboard = () => {
    // User wants to skip ahead to dashboard with early arrival flag
    router.push('/dashboard?earlyArrival=true');
  };

  // Show completion message if survey was submitted successfully
  if (message?.ok) {
    return (
      <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8 flex flex-col">
        <div className="flex-1 flex flex-col justify-center max-w-md sm:max-w-lg md:max-w-xl mx-auto w-full">
          <div className="text-center mb-12">
            <div className="mx-auto mb-6 flex items-center justify-center">
              <Logo variant="full" width={200} height={50} href="" />
            </div>
          </div>

          <Card className="p-8 mb-8 border border-gray-200 bg-white">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto border border-green-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">Survey Complete!</h3>
                <p className="text-gray-600 leading-relaxed">
                  Your survey has been completed successfully.
                </p>
              </div>
            </div>
          </Card>

          <Button
            onClick={() => router.push('/dashboard')}
            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white mb-4"
          >
            Go to Dashboard
          </Button>

          <p className="text-center text-sm text-gray-500">
            Your personalized plans will be available in your dashboard
          </p>
        </div>
      </div>
    );
  }

  // Show error message if there was an error
  if (message?.error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <div className="text-center mb-12">
            <div className="mx-auto mb-6 flex items-center justify-center">
              <Logo variant="full" width={200} height={50} href="" />
            </div>
          </div>

          <Card className="p-8 mb-8 border border-red-200 bg-white">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">Submission Error</h3>
                <p className="text-gray-600 leading-relaxed">
                  {message.error}
                </p>
              </div>
            </div>
          </Card>

          <Button
            onClick={() => setMessage(null)}
            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state while checking for existing plans
  if (existingPlanCheck.checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-b-2 border-red-600 rounded-full" />
      </div>
    );
  }

  // Show existing plan modal for logged-in users with plans
  if (showExistingPlanModal) {
    return (
      <ExistingPlanModal
        userName={existingPlanCheck.userName}
        onViewDashboard={() => router.push('/dashboard')}
        onStartFresh={async () => {
          setShowExistingPlanModal(false);
          await fetch('/api/survey/reset', { method: 'POST' });
        }}
      />
    );
  }

  // Show Quick Summary INSTANTLY after survey (no loading, no API calls)
  if (showQuickSummary && completedSurveyData) {
    return (
      <QuickProfileSummary
        surveyData={completedSurveyData}
        onContinue={handleSummaryComplete}
      />
    );
  }

  // Show LoadingJourney after user clicks Continue
  if (showLoadingJourney && completedSurveyData) {
    return (
      <LoadingJourney
        surveyData={completedSurveyData}
        onComplete={handleLoadingComplete}
        onSkipToDashboard={handleSkipToDashboard}
      />
    );
  }

  if (showProfileConfirmation && surveyData) {
    return (
      <ProfileConfirmation
        surveyData={surveyData}
        onComplete={handleProfileConfirmationComplete}
        onBack={handleBackFromProfileConfirmation}
      />
    );
  }

  if (showSteps) {
    return <OnboardingSteps onComplete={handleSurveyComplete} onBack={handleBack} />;
  }

  return <OnboardingWelcome onStart={handleStart} />;
}

export default function SurveyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>}>
      <SurveyContent />
    </Suspense>
  );
}