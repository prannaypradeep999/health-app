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
import { ArrowRight, Target, Activity, DollarSign, Utensils, Apple, Dumbbell, FlaskConical, ChevronLeft, ChevronRight, Upload, Shield } from 'lucide-react';
import Logo from '@/components/logo';

// Survey data interface from existing survey
interface SurveyData {
  email: string;
  firstName: string;
  lastName: string;
  age: number | '';
  sex: string;
  height: number | '';
  weight: number | '';

  // Full address fields
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  goal: string;
  activityLevel: string;
  sportsInterests: string;
  fitnessTimeline: string;
  monthlyFoodBudget: number | '';
  monthlyFitnessBudget: number | '';
  mealsOutPerWeek: number | '';
  distancePreference: string;
  dietPrefs: string[];
  preferredCuisines: string[];
  preferredFoods: string[];
  customFoodInput: string;
  uploadedFiles: string[];
  preferredNutrients: string[];
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
  fillerQuestions: {
    cookingFrequency: string;
    foodAllergies: string[];
    eatingOutOccasions: string[];
    healthGoalPriority: string;
    motivationLevel: string;
  };
  source?: string;
}

// Welcome screen component (from Figma UI)
interface OnboardingWelcomeProps {
  onStart: () => void;
}

function OnboardingWelcome({ onStart }: OnboardingWelcomeProps) {
  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
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
                <Utensils className="w-6 h-6 text-red-600" />
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
                <Activity className="w-6 h-6 text-red-600" />
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
                <Dumbbell className="w-6 h-6 text-red-600" />
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
  const [isGeneratingMeals, setIsGeneratingMeals] = useState(false);

  // Define all food options at the top
  const allFoodOptions = [
    'Fruits', 'Rice', 'Eggs', 'Vegetables', 'Nuts', 'Chicken', 'Fish', 'Beef',
    'Pork', 'Tofu', 'Beans', 'Pasta', 'Quinoa', 'Yogurt', 'Cheese', 'Salmon',
    'Tuna', 'Shrimp', 'Turkey', 'Lamb', 'Lentils', 'Chickpeas', 'Oats',
    'Potatoes', 'Sweet Potatoes', 'Avocado', 'Spinach', 'Broccoli', 'Kale',
    'Berries', 'Bananas', 'Apples', 'Oranges', 'Brown Rice', 'Whole Wheat Bread', 'Almonds'
  ];

  const [formData, setFormData] = useState<SurveyData>({
    email: '',
    firstName: '',
    lastName: '',
    age: '',
    sex: '',
    height: '',
    weight: '',

    // Full address fields
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    goal: '',
    activityLevel: '',
    sportsInterests: '',
    fitnessTimeline: '',
    monthlyFoodBudget: 200,
    monthlyFitnessBudget: 50,
    mealsOutPerWeek: 7,
    distancePreference: 'medium',
    dietPrefs: [],
    preferredCuisines: [],
    preferredFoods: [], // Start with no foods selected
    customFoodInput: '',
    uploadedFiles: [],
    preferredNutrients: [],
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
      eatingOutOccasions: [],
      healthGoalPriority: '',
      motivationLevel: ''
    },
    source: 'web_v2'
  });

  const totalSteps = 7;
  const progress = (currentStep / totalSteps) * 100;

  const stepIcons = [
    Target, Activity, DollarSign, Utensils, Apple, Dumbbell, FlaskConical
  ];

  // Data options from existing survey
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

  const handleNext = async () => {
    // Show loading after step 5 (food preferences completed)
    if (currentStep === 5) {
      setIsGeneratingMeals(true);

      try {
        // Start meal generation with current form data (including food preferences)
        const progressiveData = {
          email: formData.email || 'temp@example.com',
          firstName: formData.firstName || 'User',
          lastName: formData.lastName || '',
          age: Number(formData.age) || 25,
          sex: formData.sex || 'other',
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
          dietPrefs: [],
          mealsOutPerWeek: formData.mealsOutPerWeek || 7,
          distancePreference: formData.distancePreference || 'medium',
          preferredCuisines: formData.preferredCuisines || [],
          preferredFoods: formData.preferredFoods,
          uploadedFiles: formData.uploadedFiles,
          preferredNutrients: formData.preferredNutrients
        };

        // Show loading animation for 5 seconds to simulate meal generation
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (error) {
        console.error('[Progressive] Failed to start meal generation:', error);
      } finally {
        setIsGeneratingMeals(false);
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

  const handlePrevious = () => {
    if (currentStep === 1) {
      onBack();
    } else {
      setCurrentStep(currentStep - 1);
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-700 mb-2 block">Age</Label>
                  <Input
                    type="number"
                    value={formData.age}
                    onChange={(e) => updateFormData("age", e.target.value ? Number(e.target.value) : '')}
                    placeholder="25"
                    className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <Label className="text-gray-700 mb-2 block">Sex</Label>
                  <Select value={formData.sex} onValueChange={(value) => updateFormData("sex", value)}>
                    <SelectTrigger className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-700 mb-2 block">Height</Label>
                  <Select value={formData.height?.toString() || ''} onValueChange={(value) => updateFormData("height", value ? Number(value) : '')}>
                    <SelectTrigger className="border-gray-300 focus:border-red-500 bg-white text-gray-900">
                      <SelectValue placeholder="Select height" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => i + 36).map((inches) => {
                        const feet = Math.floor(inches / 12);
                        const remainingInches = inches % 12;
                        const displayText = `${feet}'${remainingInches}" (${inches}")`;
                        return (
                          <SelectItem key={inches} value={inches.toString()}>
                            {displayText}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-gray-700 mb-2 block">Weight (lbs)</Label>
                <Input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => updateFormData("weight", e.target.value ? Number(e.target.value) : '')}
                  placeholder="150"
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
              <Activity className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Health Goals</h2>
              <p className="text-gray-600">What would you like to achieve?</p>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">Primary goals (select all that apply)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {goals.map((goal) => (
                  <Button
                    key={goal.value}
                    variant={formData.goal === goal.value ? "default" : "outline"}
                    className={`h-auto p-4 text-center transition-all duration-200 ${
                      formData.goal === goal.value
                        ? "bg-red-600 text-white"
                        : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                    }`}
                    onClick={() => updateFormData("goal", goal.value)}
                  >
                    <div className="font-medium">{goal.label}</div>
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">Current activity level</Label>
              <RadioGroup value={formData.activityLevel} onValueChange={(value) => updateFormData("activityLevel", value)}>
                <div className="space-y-3">
                  {activityLevels.map((option) => (
                    <div
                      key={option.value}
                      className={`flex items-center space-x-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                        formData.activityLevel === option.value
                          ? "border-red-500 bg-red-50 shadow-sm"
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
                              ? "text-red-900"
                              : "text-gray-900"
                          }`}
                        >
                          {option.label}
                        </Label>
                        <p className={`text-sm ${
                          formData.activityLevel === option.value
                            ? "text-red-700"
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
            <div>
              <Label className="text-neutral-700 mb-2 block">Do you regularly play or want to incorporate sports in your fitness plan?</Label>
              <Input
                value={formData.sportsInterests}
                onChange={(e) => updateFormData("sportsInterests", e.target.value)}
                placeholder="Ex. basketball, running, tennis, etc."
                className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
              />
            </div>
            <div>
              <Label className="text-neutral-700 mb-2 block">Additional fitness goals or timelines</Label>
              <Input
                value={formData.fitnessTimeline}
                onChange={(e) => updateFormData("fitnessTimeline", e.target.value)}
                placeholder="Ex. Lose 20 lbs in 6 months, run a 5K, etc."
                className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <DollarSign className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Budget Preferences</h2>
              <p className="text-gray-600">Help us recommend options within your range</p>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">Monthly food budget: ${Array.isArray(formData.monthlyFoodBudget) ? formData.monthlyFoodBudget[0] : formData.monthlyFoodBudget}{Array.isArray(formData.monthlyFoodBudget) ? (formData.monthlyFoodBudget[0] >= 1000 ? '+' : '') : (formData.monthlyFoodBudget >= 1000 ? '+' : '')}</Label>
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
              <Label className="text-neutral-700 mb-4 block">Meals out per week: {Array.isArray(formData.mealsOutPerWeek) ? formData.mealsOutPerWeek[0] : formData.mealsOutPerWeek}</Label>
              <Slider
                value={Array.isArray(formData.mealsOutPerWeek) ? formData.mealsOutPerWeek : [formData.mealsOutPerWeek as number]}
                onValueChange={(value) => updateFormData("mealsOutPerWeek", value[0])}
                max={21}
                min={0}
                step={1}
                className="mb-6"
              />
              <div className="flex justify-between text-sm text-neutral-500">
                <span>0</span>
                <span>21</span>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Utensils className="w-12 h-12 text-red-600 mx-auto mb-4" />
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

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Apple className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Food Preferences</h2>
              <p className="text-gray-600">Select foods you enjoy - more options will appear as you choose</p>
            </div>

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

            {/* Diet Preferences */}
            <div className="border-t pt-6">
              <Label className="text-neutral-700 mb-3 block">Any dietary preferences or restrictions?</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
                  'Keto', 'Paleo', 'Low-Carb', 'Mediterranean',
                  'Intermittent Fasting', 'Low-Sodium', 'Pescatarian', 'Halal'
                ].map((dietPref) => (
                  <button
                    key={dietPref}
                    onClick={() => toggleArrayItem("dietPrefs", dietPref)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-center min-h-[44px] flex items-center justify-center ${
                      formData.dietPrefs.includes(dietPref)
                        ? "bg-red-600 text-white border-red-600"
                        : "border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    {dietPref}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 6:
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
              <Dumbbell className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Workout Preferences</h2>
              <p className="text-gray-600">Let's design your fitness routine</p>
            </div>
            <div>
              <Label className="text-neutral-700 mb-4 block">Workout duration: {formData.workoutPreferences.preferredDuration} minutes</Label>
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
              <Label className="text-neutral-700 mb-4 block">Preferred days for workouts</Label>

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

      case 7:
        return (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <FlaskConical className="w-12 h-12 text-purple-600 mx-auto mb-4" />
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-md mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-medium text-gray-900">Setup</h1>
            <span className="text-sm text-gray-600">{currentStep} of {totalSteps}</span>
          </div>
          <Progress value={progress} className="h-3 bg-gray-200 [&>div]:bg-red-600" />
        </div>

        <Card className="p-8 mb-6 border border-gray-200 bg-white">
          {isGeneratingMeals ? (
            <div className="text-center py-12">
              <div className="mb-6">
                <div className="text-lg font-medium text-gray-900 mb-2">
                  Thanks for the info, generating your meal plan
                </div>
                <p className="text-sm text-gray-600">
                  We're analyzing your cuisine and food preferences to find perfect options
                </p>
              </div>
              <div className="flex justify-center">
                <div className="loading-dots"></div>
              </div>
            </div>
          ) : (
            renderStep()
          )}
        </Card>

        {!isGeneratingMeals && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handlePrevious}
              className="flex-1 h-12 border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white transition-all duration-200"
            >
              {currentStep === totalSteps ? "Complete" : "Next"}
              {currentStep !== totalSteps && <ChevronRight className="w-4 h-4 ml-2" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SurveyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showSteps, setShowSteps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok?: boolean; error?: string } | null>(null);

  // Clear stale auth cookies if redirected here due to invalid user
  useEffect(() => {
    const clearStaleAuth = searchParams.get('clearStaleAuth');
    if (clearStaleAuth === 'true') {
      fetch('/api/auth/clear-stale', { method: 'POST' })
        .then(() => console.log('Cleared stale auth cookies'))
        .catch(err => console.warn('Failed to clear stale cookies:', err));
    }
  }, [searchParams]);

  const handleStart = () => {
    setShowSteps(true);
  };

  const handleBack = () => {
    setShowSteps(false);
  };

  const handleComplete = async (surveyData: SurveyData) => {
    setMessage(null);
    setSubmitting(true);

    try {
      const biomarkers: Record<string, number> = {};
      if (surveyData.biomarkers.cholesterol) biomarkers.cholesterol = surveyData.biomarkers.cholesterol;
      if (surveyData.biomarkers.vitaminD) biomarkers.vitaminD = surveyData.biomarkers.vitaminD;
      if (surveyData.biomarkers.iron) biomarkers.iron = surveyData.biomarkers.iron;

      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: surveyData.email,
          firstName: surveyData.firstName,
          lastName: surveyData.lastName,
          age: Number(surveyData.age),
          sex: surveyData.sex,
          height: Number(surveyData.height),
          weight: Number(surveyData.weight),

          // Full address fields
          streetAddress: surveyData.streetAddress,
          city: surveyData.city,
          state: surveyData.state,
          zipCode: surveyData.zipCode,
          country: surveyData.country,

          goal: surveyData.goal,
          activityLevel: surveyData.activityLevel,
          sportsInterests: surveyData.sportsInterests,
          fitnessTimeline: surveyData.fitnessTimeline,
          monthlyFoodBudget: Number(surveyData.monthlyFoodBudget),
          monthlyFitnessBudget: Number(surveyData.monthlyFitnessBudget),
          mealsOutPerWeek: Number(surveyData.mealsOutPerWeek),
          distancePreference: surveyData.distancePreference,
          dietPrefs: surveyData.dietPrefs,
          preferredCuisines: surveyData.preferredCuisines,
          preferredFoods: surveyData.preferredFoods,
          workoutPreferences: surveyData.workoutPreferences,
          biomarkers,
          source: surveyData.source,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Server error');

      console.log('[Survey] Survey completed successfully!');
      setMessage({ ok: true });

      // Don't redirect anywhere - show completion message
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit';
      setMessage({ error: errorMessage });
    } finally {
      setSubmitting(false);
    }
  };

  // Show completion message if survey was submitted successfully
  if (message?.ok) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
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
                  Thank you for providing your information. Your personalized health and fitness plan is being generated in the background.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  🚀 Your meal and workout plans are being created using AI and will be ready soon.
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

  if (showSteps) {
    return <OnboardingSteps onComplete={handleComplete} onBack={handleBack} />;
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