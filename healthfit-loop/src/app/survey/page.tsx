'use client';

import React, { useState, useMemo } from 'react';
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
  preferredCuisines: string[];
  preferredFoods: string[];
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
    preferredCuisines: [],
    preferredFoods: [],
    biomarkers: {},
    source: 'web_v2'
  });

  const ageOptions = Array.from({ length: 88 }, (_, i) => i + 13);
  const weightOptions = Array.from({ length: 321 }, (_, i) => i + 80);
  const mealsOutOptions = Array.from({ length: 15 }, (_, i) => i);
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

  // Cuisine data structure
  const cuisineData = {
    mediterranean: {
      label: 'Mediterranean',
      icon: '🫒',
      foods: ['gyros', 'hummus', 'falafel', 'pita_wraps', 'greek_salad', 'grilled_fish', 'kebabs', 'tabouli']
    },
    italian: {
      label: 'Italian',
      icon: '🍝',
      foods: ['pasta', 'pizza', 'lasagna', 'risotto', 'caprese', 'minestrone_soup', 'panini', 'antipasto']
    },
    mexican: {
      label: 'Mexican',
      icon: '🌮',
      foods: ['tacos', 'burritos', 'quesadillas', 'enchiladas', 'nachos', 'guacamole', 'fajitas', 'tortilla_soup']
    },
    indian: {
      label: 'Indian',
      icon: '🍛',
      foods: ['curry', 'biryani', 'tandoori', 'samosa', 'naan_bread', 'chutneys', 'dal_lentils', 'paneer_dishes']
    },
    japanese: {
      label: 'Japanese',
      icon: '🍣',
      foods: ['sushi', 'ramen', 'tempura', 'teriyaki', 'donburi_rice_bowls', 'udon_soba_noodles', 'miso_soup', 'bento_boxes']
    },
    thai: {
      label: 'Thai',
      icon: '🌶️',
      foods: ['pad_thai', 'green_curry', 'red_curry', 'tom_yum_soup', 'papaya_salad', 'spring_rolls', 'fried_rice', 'stir_fried_veggies']
    },
    middle_eastern: {
      label: 'Middle Eastern',
      icon: '🥙',
      foods: ['shawarma', 'falafel', 'hummus', 'baba_ganoush', 'lentil_soup', 'kebabs', 'pita_wraps', 'couscous']
    },
    american: {
      label: 'American',
      icon: '🍔',
      foods: ['burgers', 'sandwiches', 'bbq', 'fried_chicken', 'hot_dogs', 'salads', 'mac_and_cheese', 'pancakes']
    },
    chinese: {
      label: 'Chinese',
      icon: '🥢',
      foods: ['fried_rice', 'lo_mein', 'dumplings', 'sweet_sour_chicken', 'kung_pao_chicken', 'hot_pot', 'spring_rolls', 'mapo_tofu']
    },
    korean: {
      label: 'Korean',
      icon: '🥘',
      foods: ['bibimbap', 'korean_bbq', 'kimchi', 'bulgogi', 'japchae_glass_noodles', 'tteokbokki_rice_cakes', 'stews_kimchi_jjigae', 'kimbap']
    },
    french: {
      label: 'French',
      icon: '🥐',
      foods: ['baguette', 'croissants', 'quiche', 'ratatouille', 'crepes', 'onion_soup', 'beef_bourguignon', 'nicoise_salad']
    },
    african: {
      label: 'African',
      icon: '🍲',
      foods: ['tagine_moroccan', 'couscous', 'injera_with_stews_ethiopian', 'jollof_rice_west_african', 'grilled_meats', 'plantains', 'peanut_stew', 'lentil_dishes']
    }
  };

  // Generate readable food labels
  const foodLabels: { [key: string]: string } = {
    gyros: 'Gyros',
    hummus: 'Hummus',
    falafel: 'Falafel',
    pita_wraps: 'Pita & Wraps',
    greek_salad: 'Greek Salad',
    grilled_fish: 'Grilled Fish',
    kebabs: 'Kebabs',
    tabouli: 'Tabouli',
    pasta: 'Pasta',
    pizza: 'Pizza',
    lasagna: 'Lasagna',
    risotto: 'Risotto',
    caprese: 'Caprese',
    minestrone_soup: 'Minestrone Soup',
    panini: 'Panini',
    antipasto: 'Antipasto',
    tacos: 'Tacos',
    burritos: 'Burritos',
    quesadillas: 'Quesadillas',
    enchiladas: 'Enchiladas',
    nachos: 'Nachos',
    guacamole: 'Guacamole',
    fajitas: 'Fajitas',
    tortilla_soup: 'Tortilla Soup',
    curry: 'Curry',
    biryani: 'Biryani',
    tandoori: 'Tandoori',
    samosa: 'Samosa',
    naan_bread: 'Naan Bread',
    chutneys: 'Chutneys',
    dal_lentils: 'Dal (lentils)',
    paneer_dishes: 'Paneer Dishes',
    sushi: 'Sushi',
    ramen: 'Ramen',
    tempura: 'Tempura',
    teriyaki: 'Teriyaki',
    donburi_rice_bowls: 'Donburi (rice bowls)',
    udon_soba_noodles: 'Udon/Soba Noodles',
    miso_soup: 'Miso Soup',
    bento_boxes: 'Bento Boxes',
    pad_thai: 'Pad Thai',
    green_curry: 'Green Curry',
    red_curry: 'Red Curry',
    tom_yum_soup: 'Tom Yum Soup',
    papaya_salad: 'Papaya Salad',
    spring_rolls: 'Spring Rolls',
    fried_rice: 'Fried Rice',
    stir_fried_veggies: 'Stir-Fried Veggies',
    shawarma: 'Shawarma',
    baba_ganoush: 'Baba Ganoush',
    lentil_soup: 'Lentil Soup',
    couscous: 'Couscous',
    burgers: 'Burgers',
    sandwiches: 'Sandwiches',
    bbq: 'BBQ',
    fried_chicken: 'Fried Chicken',
    hot_dogs: 'Hot Dogs',
    salads: 'Salads',
    mac_and_cheese: 'Mac & Cheese',
    pancakes: 'Pancakes',
    lo_mein: 'Lo Mein',
    dumplings: 'Dumplings',
    sweet_sour_chicken: 'Sweet & Sour Chicken',
    kung_pao_chicken: 'Kung Pao Chicken',
    hot_pot: 'Hot Pot',
    mapo_tofu: 'Mapo Tofu',
    bibimbap: 'Bibimbap',
    korean_bbq: 'Korean BBQ',
    kimchi: 'Kimchi',
    bulgogi: 'Bulgogi',
    japchae_glass_noodles: 'Japchae (glass noodles)',
    tteokbokki_rice_cakes: 'Tteokbokki (rice cakes)',
    stews_kimchi_jjigae: 'Stews (Kimchi Jjigae)',
    kimbap: 'Kimbap',
    baguette: 'Baguette',
    croissants: 'Croissants',
    quiche: 'Quiche',
    ratatouille: 'Ratatouille',
    crepes: 'Crepes',
    onion_soup: 'Onion Soup',
    beef_bourguignon: 'Beef Bourguignon',
    nicoise_salad: 'Nicoise Salad',
    tagine_moroccan: 'Tagine (Moroccan)',
    injera_with_stews_ethiopian: 'Injera with Stews (Ethiopian)',
    jollof_rice_west_african: 'Jollof Rice (West African)',
    grilled_meats: 'Grilled Meats',
    plantains: 'Plantains',
    peanut_stew: 'Peanut Stew',
    lentil_dishes: 'Lentil Dishes'
  };

  // Get available foods based on selected cuisines
  const availableFoods = useMemo(() => {
    if (formData.preferredCuisines.length === 0) return [];
    
    const foods: string[] = [];
    formData.preferredCuisines.forEach(cuisine => {
      if (cuisineData[cuisine as keyof typeof cuisineData]) {
        foods.push(...cuisineData[cuisine as keyof typeof cuisineData].foods);
      }
    });
    return foods;
  }, [formData.preferredCuisines]);

  const totalSteps = 6; // Updated to 6 steps

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
          preferredCuisines: formData.preferredCuisines,
          preferredFoods: formData.preferredFoods,
          biomarkers,
          source: formData.source,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Server error');
      
      setMessage({ ok: true });
      
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

  const toggleCuisine = (cuisine: string) => {
    setFormData(prev => {
      const newCuisines = prev.preferredCuisines.includes(cuisine)
        ? prev.preferredCuisines.filter(c => c !== cuisine)
        : [...prev.preferredCuisines, cuisine];
      
      // Remove foods that are no longer available when cuisines are deselected
      const newAvailableFoods: string[] = [];
      newCuisines.forEach(c => {
        if (cuisineData[c as keyof typeof cuisineData]) {
          newAvailableFoods.push(...cuisineData[c as keyof typeof cuisineData].foods);
        }
      });
      
      const filteredFoods = prev.preferredFoods.filter(food => newAvailableFoods.includes(food));
      
      return {
        ...prev,
        preferredCuisines: newCuisines,
        preferredFoods: filteredFoods
      };
    });
  };

  const toggleFood = (food: string) => {
    setFormData(prev => ({
      ...prev,
      preferredFoods: prev.preferredFoods.includes(food)
        ? prev.preferredFoods.filter(f => f !== food)
        : [...prev.preferredFoods, food]
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
      case 3: return true; // Cuisine selection is optional
      case 4: return true; // Food selection is optional
      case 5: return true; // Biomarkers are optional
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F4F4F5] via-white to-[#FAFAFA] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <Image 
              src="/fytr-icon.svg" 
              alt="FYTR AI" 
              width={56} 
              height={56}
              priority
            />
          </div>
          
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

        <div className="mb-6">
          <div className="h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#4338CA] to-[#DC2626] transition-all duration-500 ease-out"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

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

          {/* Step 4: Cuisine Preferences */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-[#0A0A0B] mb-2">Choose Your Favorite Cuisines</h2>
                <p className="text-[#52525B]">Select the types of food you enjoy most (optional)</p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(cuisineData).map(([key, cuisine]) => (
                  <button
                    key={key}
                    onClick={() => toggleCuisine(key)}
                    className={`p-6 rounded-2xl border-2 transition-all duration-200 hover:scale-[1.02] ${
                      formData.preferredCuisines.includes(key)
                        ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA]/10 to-[#DC2626]/10 shadow-lg scale-[1.02]'
                        : 'border-[#A1A1AA] hover:border-[#4338CA]/50 hover:shadow-md'
                    }`}
                  >
                    <div className="text-4xl mb-3">{cuisine.icon}</div>
                    <div className="font-semibold text-[#0A0A0B] text-sm">{cuisine.label}</div>
                    {formData.preferredCuisines.includes(key) && (
                      <div className="mt-2">
                        <div className="w-6 h-6 mx-auto rounded-full bg-gradient-to-r from-[#4338CA] to-[#DC2626] flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              
              {formData.preferredCuisines.length > 0 && (
                <div className="mt-6 p-4 bg-gradient-to-r from-[#4338CA]/5 to-[#DC2626]/5 rounded-xl border border-[#4338CA]/20">
                  <p className="text-sm text-[#18181B]">
                    <span className="font-medium">{formData.preferredCuisines.length}</span> cuisine{formData.preferredCuisines.length !== 1 ? 's' : ''} selected. 
                    Next, we'll help you pick specific foods you love!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Specific Food Preferences */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-[#0A0A0B] mb-2">Pick Your Favorite Foods</h2>
                <p className="text-[#52525B]">
                  {formData.preferredCuisines.length > 0 
                    ? `Select specific dishes from your chosen cuisines`
                    : `Select any cuisines first to see food options, or skip this step`
                  }
                </p>
              </div>
              
              {availableFoods.length > 0 ? (
                <div className="space-y-8">
                  {formData.preferredCuisines.map((cuisineKey) => {
                    const cuisine = cuisineData[cuisineKey as keyof typeof cuisineData];
                    if (!cuisine) return null;
                    
                    return (
                      <div key={cuisineKey} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{cuisine.icon}</span>
                          <h3 className="text-lg font-semibold text-[#0A0A0B]">{cuisine.label}</h3>
                          <div className="flex-1 h-px bg-gradient-to-r from-[#4338CA]/20 to-transparent"></div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {cuisine.foods.map((food) => (
                            <button
                              key={food}
                              onClick={() => toggleFood(food)}
                              className={`p-4 rounded-xl border-2 transition-all duration-200 text-center relative ${
                                formData.preferredFoods.includes(food)
                                  ? 'border-[#4338CA] bg-gradient-to-r from-[#4338CA] to-[#DC2626] text-white shadow-md scale-[1.02]'
                                  : 'border-[#4338CA]/30 hover:border-[#4338CA]/60 hover:shadow-sm text-[#0A0A0B] bg-[#4338CA]/5'
                              }`}
                            >
                              <div className="font-medium text-sm">{foodLabels[food]}</div>
                              <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                                cuisineKey === 'mediterranean' ? 'bg-emerald-400' :
                                cuisineKey === 'italian' ? 'bg-red-400' :
                                cuisineKey === 'mexican' ? 'bg-orange-400' :
                                cuisineKey === 'indian' ? 'bg-yellow-400' :
                                cuisineKey === 'japanese' ? 'bg-pink-400' :
                                cuisineKey === 'thai' ? 'bg-purple-400' :
                                cuisineKey === 'middle_eastern' ? 'bg-amber-400' :
                                cuisineKey === 'american' ? 'bg-blue-400' :
                                cuisineKey === 'chinese' ? 'bg-red-500' :
                                cuisineKey === 'korean' ? 'bg-indigo-400' :
                                cuisineKey === 'french' ? 'bg-rose-400' :
                                'bg-teal-400'
                              }`}></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🍽️</div>
                  <h3 className="text-lg font-medium text-[#0A0A0B] mb-2">No cuisines selected yet</h3>
                  <p className="text-[#52525B] mb-6">Go back to select some cuisines, or skip to continue</p>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-3 rounded-lg border-2 border-[#4338CA] text-[#4338CA] font-medium hover:bg-[#4338CA]/5 transition-all"
                  >
                    Choose Cuisines
                  </button>
                </div>
              )}
              
              {formData.preferredFoods.length > 0 && (
                <div className="mt-6 p-4 bg-gradient-to-r from-[#4338CA]/5 to-[#DC2626]/5 rounded-xl border border-[#4338CA]/20">
                  <p className="text-sm text-[#18181B]">
                    <span className="font-medium">{formData.preferredFoods.length}</span> food{formData.preferredFoods.length !== 1 ? 's' : ''} selected. 
                    We'll prioritize these in your meal plans!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Optional Health Markers */}
          {currentStep === 5 && (
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

          {message && (
            <div className={`mt-6 p-4 rounded-xl ${
              message.ok 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.ok ? '✅ Success! Redirecting to your dashboard...' : `❌ ${message.error}`}
            </div>
          )}

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