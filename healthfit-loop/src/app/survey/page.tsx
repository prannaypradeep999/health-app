'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Target, Activity, DollarSign, Utensils, Apple, Dumbbell, FlaskConical, ChevronLeft, ChevronRight } from 'lucide-react';
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
  budgetTier: string;
  mealsOutPerWeek: number | '';
  distancePreference: string;
  dietPrefs: string[];
  preferredCuisines: string[];
  preferredFoods: string[];
  biomarkers: {
    cholesterol?: number;
    vitaminD?: number;
    iron?: number;
  };
  workoutPreferences: {
    preferredDuration: number;
    availableDays: string[];
    workoutTypes: string[];
    equipmentAccess: string[];
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
    budgetTier: '',
    mealsOutPerWeek: 7,
    distancePreference: 'medium',
    dietPrefs: [],
    preferredCuisines: [],
    preferredFoods: [],
    biomarkers: {},
    workoutPreferences: {
      preferredDuration: 45,
      availableDays: [],
      workoutTypes: [],
      equipmentAccess: ['bodyweight'],
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

  const cuisineOptions = [
    'Mediterranean', 'Italian', 'Mexican', 'Chinese',
    'Japanese', 'Thai', 'Indian', 'Middle Eastern',
    'American', 'Korean', 'French', 'Greek'
  ];

  const foodOptionsByCategory = {
    'Proteins': ['Chicken', 'Salmon', 'Tuna', 'Beef', 'Pork', 'Turkey', 'Eggs', 'Tofu', 'Tempeh', 'Beans', 'Lentils', 'Greek Yogurt'],
    'Grains & Starches': ['Rice', 'Quinoa', 'Pasta', 'Bread', 'Oats', 'Sweet Potato', 'Regular Potato', 'Couscous'],
    'Vegetables': ['Spinach', 'Broccoli', 'Kale', 'Bell Peppers', 'Carrots', 'Tomatoes', 'Avocado', 'Mushrooms', 'Onions', 'Zucchini'],
    'Fruits': ['Berries', 'Bananas', 'Apples', 'Oranges', 'Grapes', 'Mango', 'Pineapple', 'Watermelon'],
    'Healthy Fats': ['Nuts', 'Seeds', 'Olive Oil', 'Coconut Oil', 'Nut Butters', 'Cheese', 'Dark Chocolate']
  };

  const equipmentOptions = [
    'Dumbbells', 'Resistance Bands', 'Yoga Mat', 'Pull-up Bar', 'Kettlebell', 'None'
  ];

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
          budgetTier: formData.budgetTier || 'under_200',
          dietPrefs: [],
          mealsOutPerWeek: formData.mealsOutPerWeek || 7,
          distancePreference: formData.distancePreference || 'medium',
          preferredCuisines: formData.preferredCuisines || [],
          preferredFoods: formData.preferredFoods || []
        };

        // Start meal generation with Google Places API in background
        fetch('/api/ai/meals/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backgroundGeneration: true,
            partialSurveyData: progressiveData
          })
        }).catch(error => {
          console.error('Meal generation failed:', error);
        });

        // Show loading animation for 5 seconds, then continue
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
      // Add item, but limit cuisines to 5 max
      if (field === 'preferredCuisines' && currentArray.length >= 5) {
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

              {/* Full Address Section */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700">Address</h3>
                <div>
                  <Label className="text-gray-700 mb-2 block">Street Address</Label>
                  <Input
                    value={formData.streetAddress}
                    onChange={(e) => updateFormData("streetAddress", e.target.value)}
                    placeholder="123 Main Street"
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
              <div className="grid grid-cols-2 gap-3">
                {goals.map((goal) => (
                  <Button
                    key={goal.value}
                    variant={formData.goal === goal.value ? "default" : "outline"}
                    className={`h-auto p-4 text-left transition-all duration-200 ${
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
                    <div key={option.value} className="flex items-center space-x-3 p-3 rounded-lg border border-gray-300 bg-white">
                      <RadioGroupItem value={option.value} id={option.value} />
                      <div>
                        <Label htmlFor={option.value} className="font-medium text-gray-900">{option.label}</Label>
                        <p className="text-sm text-gray-600">{option.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </RadioGroup>
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
              <Label className="text-neutral-700 mb-4 block">Monthly food budget</Label>
              <div className="grid grid-cols-2 gap-3">
                {budgetOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={formData.budgetTier === option.value ? "default" : "outline"}
                    className={`p-4 transition-all duration-200 ${
                      formData.budgetTier === option.value
                        ? "bg-red-600 text-white"
                        : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                    }`}
                    onClick={() => updateFormData("budgetTier", option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
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
            <div>
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

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Utensils className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Cuisine Preferences</h2>
              <p className="text-gray-600">Select up to 5 cuisines you enjoy ({formData.preferredCuisines.length}/5)</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {cuisineOptions.map((cuisine) => (
                <Button
                  key={cuisine}
                  variant={formData.preferredCuisines.includes(cuisine) ? "default" : "outline"}
                  className={`h-12 transition-all duration-200 ${
                    formData.preferredCuisines.includes(cuisine)
                      ? "bg-red-600 text-white"
                      : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                  }`}
                  onClick={() => toggleArrayItem("preferredCuisines", cuisine)}
                >
                  {cuisine}
                </Button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Apple className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Food Preferences</h2>
              <p className="text-gray-600">Select foods you enjoy from each category</p>
            </div>
            <div className="space-y-6">
              {Object.entries(foodOptionsByCategory).map(([category, foods]) => (
                <div key={category} className="space-y-3">
                  <h3 className="font-medium text-gray-800 text-sm">{category}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {foods.map((food) => (
                      <Button
                        key={food}
                        variant={formData.preferredFoods.includes(food) ? "default" : "outline"}
                        className={`h-10 text-xs transition-all duration-200 ${
                          formData.preferredFoods.includes(food)
                            ? "bg-red-600 text-white"
                            : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                        }`}
                        onClick={() => toggleArrayItem("preferredFoods", food)}
                      >
                        {food}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
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
              <Label className="text-neutral-700 mb-4 block">Available days</Label>
              <div className="grid grid-cols-4 gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <Button
                    key={day}
                    variant={formData.workoutPreferences.availableDays.includes(day) ? "default" : "outline"}
                    className={`h-12 transition-all duration-200 ${
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
              <Label className="text-neutral-700 mb-4 block">Available equipment</Label>
              <div className="grid grid-cols-2 gap-3">
                {equipmentOptions.map((equipment) => (
                  <Button
                    key={equipment}
                    variant={formData.workoutPreferences.equipmentAccess.includes(equipment) ? "default" : "outline"}
                    className={`h-12 transition-all duration-200 ${
                      formData.workoutPreferences.equipmentAccess.includes(equipment)
                        ? "bg-red-600 text-white"
                        : "border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      const currentEquipment = formData.workoutPreferences.equipmentAccess;
                      const updated = currentEquipment.includes(equipment)
                        ? currentEquipment.filter(e => e !== equipment)
                        : [...currentEquipment, equipment];
                      updateFormData("workoutPreferences", { ...formData.workoutPreferences, equipmentAccess: updated });
                    }}
                  >
                    {equipment}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <FlaskConical className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h2 className="text-2xl font-medium text-gray-900 mb-2">Health Metrics</h2>
              <p className="text-gray-600">Optional data to enhance your plan (skip if unavailable)</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-700 mb-2 block">Cholesterol (mg/dL)</Label>
                <Input
                  type="number"
                  value={formData.biomarkers.cholesterol || ''}
                  onChange={(e) => updateFormData("biomarkers", { ...formData.biomarkers, cholesterol: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 180"
                  className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                />
              </div>
              <div>
                <Label className="text-gray-700 mb-2 block">Vitamin D (ng/mL)</Label>
                <Input
                  type="number"
                  value={formData.biomarkers.vitaminD || ''}
                  onChange={(e) => updateFormData("biomarkers", { ...formData.biomarkers, vitaminD: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 30"
                  className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                />
              </div>
              <div>
                <Label className="text-gray-700 mb-2 block">Iron levels (μg/dL)</Label>
                <Input
                  type="number"
                  value={formData.biomarkers.iron || ''}
                  onChange={(e) => updateFormData("biomarkers", { ...formData.biomarkers, iron: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 100"
                  className="border-gray-300 focus:border-red-500 bg-white text-gray-900 placeholder:text-gray-500"
                />
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
          zipCode: surveyData.zipCode,
          goal: surveyData.goal,
          activityLevel: surveyData.activityLevel,
          budgetTier: surveyData.budgetTier,
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