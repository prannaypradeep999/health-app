'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface SurveyData {
  email: string;
  firstName: string;
  lastName: string;
  age: number | '';
  sex: string;
  height: string;
  weight: number | '';
  zipCode: string;
  goal: string;
  activityLevel: string;
  budgetTier: string;
  mealsOutPerWeek: number | '';
  dietPrefs: string[];
  biomarkers: {
    cholesterol?: number;
    vitaminD?: number;
    iron?: number;
  };
  source?: string;
}

const SurveyPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok?: boolean; error?: string } | null>(null);
  
  const [formData, setFormData] = useState<SurveyData>({
    email: '',
    firstName: '',
    lastName: '',
    age: '',
    sex: '',
    height: '',
    weight: '',
    zipCode: '',
    goal: '',
    activityLevel: '',
    budgetTier: '',
    mealsOutPerWeek: 7,
    dietPrefs: [],
    biomarkers: {},
    source: 'web_v2'
  });

  // Dropdown option helpers
  const ageOptions = Array.from({ length: 88 }, (_, i) => i + 13); // 13 - 100
  const weightOptions = Array.from({ length: 321 }, (_, i) => i + 80); // 80 - 400 lbs
  const mealsOutOptions = Array.from({ length: 15 }, (_, i) => i); // 0 - 14 meals
  const [heightFeet, setHeightFeet] = useState<number | ''>('');
  const [heightInches, setHeightInches] = useState<number | ''>('');

  const goals = [
    { value: 'WEIGHT_LOSS', label: 'Lose Weight', icon: '🎯', description: 'Achieve your ideal weight' },
    { value: 'MUSCLE_GAIN', label: 'Build Muscle', icon: '💪', description: 'Build strength and mass' },
    { value: 'ENDURANCE', label: 'Improve Endurance', icon: '🏃', description: 'Boost stamina and energy' },
    { value: 'GENERAL_WELLNESS', label: 'General Wellness', icon: '✨', description: 'Overall health improvement' }
  ];

  const activityLevels = [
    { value: 'SEDENTARY', label: 'Sedentary', desc: 'Little to no exercise' },
    { value: 'LIGHTLY_ACTIVE', label: 'Lightly Active', desc: '1-2 days/week' },
    { value: 'MODERATELY_ACTIVE', label: 'Moderately Active', desc: '3-4 days/week' },
    { value: 'VERY_ACTIVE', label: 'Very Active', desc: '5-6 days/week' },
    { value: 'ATHLETE', label: 'Athlete', desc: '2x per day' },
  ];

  const budgetOptions = [
    { value: 'under_200', label: 'Under $200/mo', desc: '~$6-7/day' },
    { value: '200_400', label: '$200-400/mo', desc: '~$7-13/day' },
    { value: '400_600', label: '$400-600/mo', desc: '~$13-20/day' },
    { value: '600_plus', label: '$600+/mo', desc: '$20+/day' },
  ];

  const dietOptions = [
    { value: 'vegetarian', label: 'Vegetarian', icon: '🥬' },
    { value: 'vegan', label: 'Vegan', icon: '🌱' },
    { value: 'gluten_free', label: 'Gluten Free', icon: '🌾' },
    { value: 'dairy_free', label: 'Dairy Free', icon: '🥛' },
    { value: 'keto', label: 'Keto', icon: '🥑' },
    { value: 'paleo', label: 'Paleo', icon: '🥩' },
  ];

  const totalSteps = 4; // Condensed to 4 pages as requested

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setMessage(null);
    setSubmitting(true);
    
    try {
      const biomarkers: Record<string, number> = {};
      if (formData.biomarkers.cholesterol) biomarkers.cholesterol = formData.biomarkers.cholesterol;
      if (formData.biomarkers.vitaminD) biomarkers.vitaminD = formData.biomarkers.vitaminD;
      if (formData.biomarkers.iron) biomarkers.iron = formData.biomarkers.iron;

      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          age: Number(formData.age),
          sex: formData.sex,
          height: formData.height,
          weight: Number(formData.weight),
          zipCode: formData.zipCode,
          goal: formData.goal,
          activityLevel: formData.activityLevel,
          budgetTier: formData.budgetTier,
          mealsOutPerWeek: Number(formData.mealsOutPerWeek),
          dietPrefs: formData.dietPrefs,
          biomarkers,
          source: formData.source,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Server error');
      
      setMessage({ ok: true });
      
      // Redirect to dashboard after success
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit';
      setMessage({ error: errorMessage });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDietPref = (pref: string) => {
    setFormData(prev => ({
      ...prev,
      dietPrefs: prev.dietPrefs.includes(pref)
        ? prev.dietPrefs.filter(p => p !== pref)
        : [...prev.dietPrefs, pref]
    }));
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 0: 
        return formData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
               formData.firstName && formData.lastName &&
               formData.age && formData.sex && formData.height && formData.weight && formData.zipCode;
      case 1: return formData.goal && formData.activityLevel;
      case 2: return formData.budgetTier && formData.mealsOutPerWeek !== '';
      case 3: return true; // Biomarkers are optional
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F4F4F5] via-white to-[#FAFAFA] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Logo and Title */}
        <div className="text-center mb-6">
          {/* FYTR AI Logo Icon */}
          <div className="flex justify-center mb-4">
            <Image 
              src="/fytr-icon.svg" 
              alt="FYTR AI" 
              width={56} 
              height={56}
              priority
            />
          </div>
          
          {/* FYTR AI Text Logo */}
          <div className="flex justify-center mb-3">
            <Image 
              src="/fytr-text-gradient.svg" 
              alt="FYTR AI" 
              width={140} 
              height={40}
              priority
            />
          </div>
          
          <h1 className="text-2xl font-bold text-[#0A0A0B] mb-1">Personalize Your Fitness Journey</h1>
          <p className="text-[#52525B]">Step {currentStep + 1} of {totalSteps}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#4338CA] to-[#DC2626] transition-all duration-500 ease-out"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Survey Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-[#F4F4F5]">
          {/* Step 1: Basic Information */}
          {currentStep === 0 && (
            <div className="space-y-5 animate-fadeIn">
              <h2 className="text-2xl font-bold text-[#0A0A0B] mb-6">Basic Information</h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent transition-all"
                    placeholder="John"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent transition-all"
                    placeholder="Doe"
                  />
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent transition-all"
                    placeholder="you@example.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Age *</label>
                  <select
                    value={formData.age === '' ? '' : Number(formData.age)}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value ? Number(e.target.value) : '' })}
                    className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent transition-all bg-white"
                  >
                    <option value="">Select age</option>
                    {ageOptions.map((age) => (
                      <option key={age} value={age}>{age}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#18181B] mb-2">Sex *</label>
                <div className="grid grid-cols-3 gap-3">
                  {['male', 'female', 'other'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFormData({ ...formData, sex: option })}
                      className={`py-3 rounded-lg border-2 font-medium capitalize transition-all ${
                        formData.sex === option
                          ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA]/10 to-[#DC2626]/10 text-[#4338CA]'
                          : 'border-[#A1A1AA] hover:border-[#4338CA]/50 text-[#52525B]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Height *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={heightFeet === '' ? '' : Number(heightFeet)}
                      onChange={(e) => {
                        const newFeet = e.target.value ? Number(e.target.value) : '';
                        setHeightFeet(newFeet);
                        setFormData({
                          ...formData,
                          height: newFeet !== '' && heightInches !== '' ? `${newFeet}'${heightInches}"` : ''
                        });
                      }}
                      className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent bg-white"
                    >
                      <option value="">Feet</option>
                      {[4,5,6,7].map((ft) => (
                        <option key={ft} value={ft}>{ft} ft</option>
                      ))}
                    </select>
                    <select
                      value={heightInches === '' ? '' : Number(heightInches)}
                      onChange={(e) => {
                        const newInches = e.target.value ? Number(e.target.value) : '';
                        setHeightInches(newInches);
                        setFormData({
                          ...formData,
                          height: heightFeet !== '' && newInches !== '' ? `${heightFeet}'${newInches}"` : ''
                        });
                      }}
                      className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent bg-white"
                    >
                      <option value="">Inches</option>
                      {Array.from({ length: 12 }, (_, i) => i).map((inch) => (
                        <option key={inch} value={inch}>{inch} in</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Weight *</label>
                  <div className="relative">
                    <select
                      value={formData.weight === '' ? '' : Number(formData.weight)}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full pr-12 px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent transition-all bg-white appearance-none"
                    >
                      <option value="">Select weight</option>
                      {weightOptions.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#52525B] text-sm">lb</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#18181B] mb-2">Zip Code *</label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent transition-all"
                  placeholder="94107"
                />
                <p className="text-xs text-[#52525B] mt-1">
                  We&apos;ll find gyms and healthy restaurants near you
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Goals & Activity */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className="text-2xl font-bold text-[#0A0A0B] mb-6">Fitness Goals & Activity</h2>
              
              <div>
                <label className="block text-sm font-medium text-[#18181B] mb-3">What&apos;s your primary goal? *</label>
                <div className="grid md:grid-cols-2 gap-3">
                  {goals.map((goal) => (
                    <button
                      key={goal.value}
                      onClick={() => setFormData({ ...formData, goal: goal.value })}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] ${
                        formData.goal === goal.value
                          ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA]/5 to-[#DC2626]/5 shadow-md'
                          : 'border-[#A1A1AA] hover:border-[#4338CA]/50 hover:shadow-sm'
                      }`}
                    >
                      <div className="text-3xl mb-2">{goal.icon}</div>
                      <div className="font-semibold text-[#0A0A0B]">{goal.label}</div>
                      <div className="text-xs text-[#52525B] mt-1">{goal.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#18181B] mb-3">How active are you? *</label>
                <div className="space-y-2">
                  {activityLevels.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => setFormData({ ...formData, activityLevel: level.value })}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        formData.activityLevel === level.value
                          ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA]/5 to-[#DC2626]/5 shadow-md'
                          : 'border-[#A1A1AA] hover:border-[#4338CA]/50 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-[#0A0A0B]">{level.label}</p>
                          <p className="text-sm text-[#52525B]">{level.desc}</p>
                        </div>
                        {formData.activityLevel === level.value && (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#4338CA] to-[#DC2626] flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Diet, Budget & Eating Preferences */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className="text-2xl font-bold text-[#0A0A0B] mb-6">Nutrition & Budget</h2>
              
              {/* Budget */}
              <div>
                <label className="block text-sm font-medium text-[#18181B] mb-3">Monthly Food Budget *</label>
                <div className="grid md:grid-cols-2 gap-3">
                  {budgetOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({ ...formData, budgetTier: option.value })}
                      className={`p-5 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02] ${
                        formData.budgetTier === option.value
                          ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA]/5 to-[#DC2626]/5 shadow-md'
                          : 'border-[#A1A1AA] hover:border-[#4338CA]/50 hover:shadow-sm'
                      }`}
                    >
                      <p className="font-semibold text-[#0A0A0B]">{option.label}</p>
                      <p className="text-sm text-[#52525B] mt-1">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Dietary Preferences */}
              <div>
                <label className="block text-sm font-medium text-[#18181B] mb-3">Dietary Preferences (optional)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {dietOptions.map((diet) => (
                    <button
                      key={diet.value}
                      onClick={() => toggleDietPref(diet.value)}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                        formData.dietPrefs.includes(diet.value)
                          ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA] to-[#DC2626] text-white shadow-md'
                          : 'border-[#A1A1AA] hover:border-[#4338CA]/50 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xl">{diet.icon}</span>
                        <span className="font-medium">{diet.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Meals Out Per Week */}
              <div>
                <label className="block text-sm font-medium text-[#18181B] mb-3">How many meals per week would you like to eat out or order in? *</label>
                <select
                  value={formData.mealsOutPerWeek === '' ? '' : Number(formData.mealsOutPerWeek)}
                  onChange={(e) => setFormData({ ...formData, mealsOutPerWeek: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent transition-all bg-white"
                >
                  {mealsOutOptions.map((num) => (
                    <option key={num} value={num}>{num} {num === 1 ? 'meal' : 'meals'} out of 14 total meals</option>
                  ))}
                </select>
                <p className="text-xs text-[#52525B] mt-2">
                  We'll suggest dining options or delivery services based on your preferences
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Optional Health Markers */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className="text-2xl font-bold text-[#0A0A0B] mb-6">Optional Health Markers</h2>
              <p className="text-[#52525B] -mt-4 mb-6">
                If you have recent lab results, we can personalize your nutrition even further
              </p>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Cholesterol (mg/dL)</label>
                  <input
                    type="number"
                    value={formData.biomarkers.cholesterol || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      biomarkers: { ...formData.biomarkers, cholesterol: Number(e.target.value) }
                    })}
                    className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent"
                    placeholder="e.g. 180"
                    min="0"
                    max="500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Vitamin D (ng/mL)</label>
                  <input
                    type="number"
                    value={formData.biomarkers.vitaminD || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      biomarkers: { ...formData.biomarkers, vitaminD: Number(e.target.value) }
                    })}
                    className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent"
                    placeholder="e.g. 30"
                    min="0"
                    max="200"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#18181B] mb-2">Iron (μg/dL)</label>
                  <input
                    type="number"
                    value={formData.biomarkers.iron || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      biomarkers: { ...formData.biomarkers, iron: Number(e.target.value) }
                    })}
                    className="w-full px-4 py-3 border border-[#A1A1AA] rounded-lg focus:ring-2 focus:ring-[#4338CA] focus:border-transparent"
                    placeholder="e.g. 70"
                    min="0"
                    max="300"
                  />
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-[#4338CA]/5 to-[#DC2626]/5 rounded-xl border border-[#4338CA]/20">
                <p className="text-sm text-[#18181B]">
                  💡 <strong>Tip:</strong> You can skip this for now and add lab results later from your dashboard.
                </p>
              </div>
              
              <div className="p-4 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                <h3 className="font-medium text-[#0A0A0B] mb-2">What happens next?</h3>
                <p className="text-sm text-[#52525B]">
                  Once you submit, our AI will create a personalized plan including:
                </p>
                <ul className="text-sm text-[#52525B] mt-2 space-y-1">
                  <li>• Custom meal plans based on your nutrition needs</li>
                  <li>• Workout recommendations that fit your goals</li>
                  <li>• Local gym & restaurant options in your area</li>
                  <li>• One-tap ordering for meals and class bookings</li>
                </ul>
              </div>
            </div>
          )}

          {/* Messages */}
          {message && (
            <div className={`mt-6 p-4 rounded-xl ${
              message.ok 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.ok ? '✅ Success! Redirecting to your dashboard...' : `❌ ${message.error}`}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center px-6 py-3 rounded-lg border-2 border-[#A1A1AA] font-medium hover:bg-[#F4F4F5] transition-all text-[#52525B]"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Back
              </button>
            )}

            <div className={currentStep === 0 ? 'ml-auto' : ''}>
              {currentStep < totalSteps - 1 ? (
                <button
                  onClick={handleNext}
                  disabled={!isStepValid()}
                  className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    isStepValid()
                      ? 'bg-gradient-to-r from-[#4338CA] to-[#DC2626] text-white hover:shadow-lg transform hover:-translate-y-0.5'
                      : 'bg-[#A1A1AA] text-[#F4F4F5] cursor-not-allowed'
                  }`}
                >
                  Continue
                  <ChevronRight className="w-5 h-5 ml-2" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center px-8 py-3 rounded-lg bg-gradient-to-r from-[#4338CA] to-[#DC2626] text-white font-medium hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Creating your plan...
                    </>
                  ) : (
                    <>
                      Create My Plan 🚀
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Skip Link */}
        <div className="text-center mt-6">
          <a href="/dashboard" className="text-sm text-[#52525B] hover:text-[#4338CA] transition-colors">
            Skip for now →
          </a>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>
    </div>
  );
};

export default SurveyPage;