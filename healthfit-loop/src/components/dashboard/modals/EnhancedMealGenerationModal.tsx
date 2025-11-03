import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Clock, MapPin, Utensils, CheckCircle, Loader2, ChefHat, Sparkles } from 'lucide-react';
import { colors } from '../constants';
import { useGenerationProgress, GENERATION_STAGES } from '@/hooks/useGenerationProgress';
import SmartLoadingStates from '@/components/ui/SmartLoadingStates';

interface MealOption {
  id: string;
  type: 'restaurant' | 'home';
  title: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  price: number;
  imageUrl: string;
  restaurantName?: string;
  ingredients?: string[];
  instructions?: string[];
  cookTime?: number;
  prepTime?: number;
  difficulty?: string;
  servings?: number;
}

interface GeneratedMeal {
  day: string;
  mealType: string;
  options: MealOption[];
}

interface EnhancedMealGenerationModalProps {
  surveyData: any;
  isGuest: boolean;
  onClose: () => void;
  onComplete: (mealPlan: any) => void;
}

type GenerationStep = 'discovering' | 'analyzing' | 'creating' | 'complete';

export default function EnhancedMealGenerationModal({ surveyData, isGuest, onClose, onComplete }: EnhancedMealGenerationModalProps) {
  const [currentStep, setCurrentStep] = useState<GenerationStep>('discovering');
  const [oldProgress, setOldProgress] = useState(0); // Keep for backward compatibility
  const [generatedMeals, setGeneratedMeals] = useState<GeneratedMeal[]>([]);
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');

  // Initialize smart progress tracking
  const { progress, actions } = useGenerationProgress({
    stages: GENERATION_STAGES.PARALLEL_COMPLETE,
    enableRealTimeUpdates: true,
    updateInterval: 1000
  });

  const steps = [
    { key: 'discovering', label: 'Discovering Restaurants', description: 'Finding the best healthy options near you' },
    { key: 'analyzing', label: 'Analyzing Menus', description: 'Checking nutrition data and healthy choices' },
    { key: 'creating', label: 'Creating Complete Plan', description: 'Generating meals & workouts in parallel ⚡' },
    { key: 'complete', label: 'Complete', description: 'Your personalized meal & workout plan is ready!' }
  ];

  // Day colors for the week view
  const dayColors = {
    'Monday': 'bg-gradient-to-br from-red-400 to-red-600',
    'Tuesday': 'bg-gradient-to-br from-orange-400 to-orange-600', 
    'Wednesday': 'bg-gradient-to-br from-yellow-400 to-yellow-600',
    'Thursday': 'bg-gradient-to-br from-green-400 to-green-600',
    'Friday': 'bg-gradient-to-br from-blue-400 to-blue-600',
    'Saturday': 'bg-gradient-to-br from-purple-400 to-purple-600',
    'Sunday': 'bg-gradient-to-br from-pink-400 to-pink-600'
  };

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Generate AI image for meal using OpenAI DALL-E
  const generateMealImage = async (mealName: string, description: string): Promise<string> => {
    try {
      const prompt = `A professional food photography shot of ${mealName}, appetizing and well-plated, restaurant quality, natural lighting, high resolution`;
      
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt })
      });

      if (response.ok) {
        const data = await response.json();
        return data.imageUrl;
      }
    } catch (error) {
      console.error('Error generating meal image:', error);
    }
    
    // Fallback to curated images
    return getCuratedImageForMeal(mealName);
  };

  // Get curated image for meal (fallback)
  const getCuratedImageForMeal = (mealName: string): string => {
    const name = mealName.toLowerCase();
    
    // Specific Smoothie King items
    if (name.includes('hulk') || name.includes('slim-n-trim')) {
      return 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400&h=300&fit=crop';
    }
    
    // General smoothies
    if (name.includes('smoothie') || name.includes('tropical') || name.includes('plunge') || name.includes('breeze')) {
      return 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&h=300&fit=crop';
    }
    
    // QDOBA specific items
    if (name.includes('habanero') && name.includes('brisket')) {
      return 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=300&fit=crop'; // Burrito
    }
    
    // Mexican food images
    if (name.includes('taco') || name.includes('burrito') || name.includes('qdoba') || name.includes('mexican') || name.includes('brisket')) {
      return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop';
    }
    
    // Mediterranean/Middle Eastern specific
    if (name.includes('mediterranean') && name.includes('salad')) {
      return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=300&fit=crop'; // Mediterranean salad
    }
    
    if (name.includes('middle eastern') || name.includes('kebab') || name.includes('grilled protein')) {
      return 'https://images.unsplash.com/photo-1544510808-5e41a7c1e4c8?w=400&h=300&fit=crop';
    }
    
    // Chicken dishes
    if (name.includes('chicken') && name.includes('kebab')) {
      return 'https://images.unsplash.com/photo-1544510808-5e41a7c1e4c8?w=400&h=300&fit=crop'; // Kebabs
    }
    
    if (name.includes('chicken') || name.includes('poultry')) {
      return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop';
    }
    
    // Flatbread/sandwich
    if (name.includes('flatbread') || name.includes('club')) {
      return 'https://images.unsplash.com/photo-1619881589275-2d7d6dd77b2f?w=400&h=300&fit=crop';
    }
    
    // Toast specifically
    if (name.includes('toast') && name.includes('avocado')) {
      return 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=300&fit=crop';
    }
    
    // Quinoa bowls
    if (name.includes('quinoa') || name.includes('bowl')) {
      return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop';
    }
    
    // Salads
    if (name.includes('salad') || name.includes('greens')) {
      return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=300&fit=crop';
    }
    
    // Avocado dishes
    if (name.includes('avocado')) {
      return 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=300&fit=crop';
    }
    
    // Default healthy meal image
    return 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=300&fit=crop';
  };

  // Convert API meal data to frontend format with curated images (fast, synchronous)
  const convertApiMealsToFrontendFormatSync = (apiMeals: any[]): GeneratedMeal[] => {
    const convertedMeals: GeneratedMeal[] = [];
    
    // Group meals by day and meal type
    const mealsByDay: { [key: string]: { [key: string]: any[] } } = {};
    
    apiMeals.forEach(meal => {
      const day = meal.day.charAt(0).toUpperCase() + meal.day.slice(1);
      const mealType = meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1);
      
      if (!mealsByDay[day]) mealsByDay[day] = {};
      if (!mealsByDay[day][mealType]) mealsByDay[day][mealType] = [];
      
      mealsByDay[day][mealType] = meal.options;
    });
    
    // Convert to frontend format with curated images (fast)
    for (const day of Object.keys(mealsByDay)) {
      for (const mealType of Object.keys(mealsByDay[day])) {
        const options = mealsByDay[day][mealType];
        
        const processedOptions = options.map((option: any) => {
          const mealName = option.dishName || option.recipeName || 'Meal';
          
          return {
            id: option.id || Math.random().toString(),
            type: option.optionType as 'restaurant' | 'home',
            title: mealName,
            description: option.description || 'Delicious and nutritious meal option.',
            calories: option.calories || 0,
            protein: option.protein || 0,
            carbs: option.carbs || 0,
            fat: option.fat || 0,
            price: option.estimatedPrice || 0,
            imageUrl: getCuratedImageForMeal(mealName), // Use curated images initially
            restaurantName: option.restaurantName || undefined,
            ingredients: option.ingredients || [],
            instructions: option.instructions ? option.instructions.split('\n') : [],
            cookTime: option.cookingTime || 0,
            prepTime: 5,
            difficulty: option.difficulty || 'Easy',
            servings: 1
          };
        });
        
        convertedMeals.push({
          day,
          mealType,
          options: processedOptions
        });
      }
    }
    
    return convertedMeals;
  };

  // Generate AI images in background and update state
  const generateImagesInBackground = async (meals: GeneratedMeal[]) => {
    console.log('[DEBUG-Frontend] Starting background DALL-E image generation for', meals.length, 'meals');
    
    for (const meal of meals) {
      for (const option of meal.options) {
        try {
          const aiImageUrl = await generateMealImage(option.title, option.description);
          
          // Update the specific meal option with the new AI image
          setGeneratedMeals(prevMeals => 
            prevMeals.map(prevMeal => 
              prevMeal.day === meal.day && prevMeal.mealType === meal.mealType
                ? {
                    ...prevMeal,
                    options: prevMeal.options.map(prevOption =>
                      prevOption.id === option.id
                        ? { ...prevOption, imageUrl: aiImageUrl }
                        : prevOption
                    )
                  }
                : prevMeal
            )
          );
          
          console.log('[DEBUG-Frontend] Updated image for:', option.title);
        } catch (error) {
          console.error('[DEBUG-Frontend] Failed to generate image for:', option.title, error);
        }
      }
    }
    
    console.log('[DEBUG-Frontend] Background image generation complete');
  };

  // Convert API meal data to frontend format with AI-generated images (legacy, slow)
  const convertApiMealsToFrontendFormat = async (apiMeals: any[]): Promise<GeneratedMeal[]> => {
    const convertedMeals: GeneratedMeal[] = [];
    
    // Group meals by day and meal type
    const mealsByDay: { [key: string]: { [key: string]: any[] } } = {};
    
    apiMeals.forEach(meal => {
      const day = meal.day.charAt(0).toUpperCase() + meal.day.slice(1);
      const mealType = meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1);
      
      if (!mealsByDay[day]) mealsByDay[day] = {};
      if (!mealsByDay[day][mealType]) mealsByDay[day][mealType] = [];
      
      mealsByDay[day][mealType] = meal.options;
    });
    
    // Convert to frontend format with AI images
    for (const day of Object.keys(mealsByDay)) {
      for (const mealType of Object.keys(mealsByDay[day])) {
        const options = mealsByDay[day][mealType];
        
        const processedOptions = await Promise.all(
          options.map(async (option: any) => {
            const mealName = option.dishName || option.recipeName || 'Meal';
            const imageUrl = await generateMealImage(mealName, option.description || '');
            
            return {
              id: option.id || Math.random().toString(),
              type: option.optionType as 'restaurant' | 'home',
              title: mealName,
              description: option.description || 'Delicious and nutritious meal option.',
              calories: option.calories || 0,
              protein: option.protein || 0,
              carbs: option.carbs || 0,
              fat: option.fat || 0,
              price: option.estimatedPrice || 0,
              imageUrl,
              restaurantName: option.restaurantName || undefined,
              ingredients: option.ingredients || [],
              instructions: option.instructions ? option.instructions.split('\n') : [],
              cookTime: option.cookingTime || 0,
              prepTime: 5,
              difficulty: option.difficulty || 'Easy',
              servings: 1
            };
          })
        );
        
        convertedMeals.push({
          day,
          mealType,
          options: processedOptions
        });
      }
    }
    
    return convertedMeals;
  };

  const simulateMealCreation = async () => {
    setCurrentStep('creating');

    // Start smart progress tracking
    actions.start();

    try {
      console.log('[DEBUG-Frontend] Starting API call to /api/ai/generate-complete (parallel generation)');

      // Update progress to restaurant discovery stage
      actions.updateStageProgress('restaurant_discovery', 100);
      await new Promise(resolve => setTimeout(resolve, 1000));
      actions.nextStage();

      // Update progress to data prefetch stage
      actions.updateStageProgress('data_prefetch', 100);
      await new Promise(resolve => setTimeout(resolve, 800));
      actions.nextStage();

      // Call the new parallel generation API for both meal and workout plans
      const response = await fetch('/api/ai/generate-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          forceRegenerate: true,
          surveyData: surveyData
        })
      });

      console.log('[DEBUG-Frontend] Parallel API response status:', response.status);

      if (!response.ok) {
        actions.setError(`API failed with status ${response.status}`);
        throw new Error(`Parallel API failed with status ${response.status}`);
      }

      // Update parallel generation progress
      actions.updateStageProgress('parallel_generation', 50);
      await new Promise(resolve => setTimeout(resolve, 500));

      const data = await response.json();
      console.log('[DEBUG-Frontend] Parallel API response data:', data);

      // Update parallel generation progress
      actions.updateStageProgress('parallel_generation', 100);
      await new Promise(resolve => setTimeout(resolve, 500));
      actions.nextStage();
      
      if (data.success && data.mealPlan?.meals) {
        console.log('[DEBUG-Frontend] Converting meals to frontend format, count:', data.mealPlan.meals.length);

        // Update optimization stage
        actions.updateStageProgress('optimization', 30);

        // Convert API data to frontend format WITHOUT images first (super fast)
        const convertedMeals = convertApiMealsToFrontendFormatSync(data.mealPlan.meals);

        console.log('[DEBUG-Frontend] Converted meals:', convertedMeals.length, 'meals');
        console.log('[DEBUG-Frontend] Days covered:', convertedMeals.map(m => m.day));

        // Show meals immediately without waiting for images
        setGeneratedMeals(convertedMeals);

        // Complete optimization stage
        actions.updateStageProgress('optimization', 100);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Complete the entire process
        actions.complete();
        setCurrentStep('complete');

        // Skip AI image generation entirely - use curated images only
        console.log('[DEBUG-Frontend] Skipping AI image generation for faster loading');
        return;
      } else {
        console.log('[DEBUG-Frontend] API response missing expected data structure');
        actions.setError('Invalid API response structure');
        throw new Error('Invalid API response structure');
      }
    } catch (error) {
      console.error('[DEBUG-Frontend] Error generating meals:', error);
      actions.setError(error instanceof Error ? error.message : 'Generation failed');
      // Fall back to mock data if API fails
    }

    console.log('[DEBUG-Frontend] Using fallback mock data');
    
    // Create fallback mock data for full week
    const mockMeals: GeneratedMeal[] = [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const mealTypes = ['Breakfast', 'Lunch', 'Dinner'];
    
    for (const day of days) {
      for (const mealType of mealTypes) {
        mockMeals.push({
          day,
          mealType,
          options: [
            {
              id: `${day}-${mealType}-1`,
              type: 'home',
              title: `${day} ${mealType} Option`,
              description: `Delicious ${mealType.toLowerCase()} option for ${day}`,
              calories: 400 + Math.floor(Math.random() * 200),
              protein: 20 + Math.floor(Math.random() * 15),
              carbs: 30 + Math.floor(Math.random() * 20),
              fat: 10 + Math.floor(Math.random() * 10),
              price: 800 + Math.floor(Math.random() * 400),
              imageUrl: getCuratedImageForMeal(`${mealType} meal`),
              ingredients: ['Sample ingredient 1', 'Sample ingredient 2'],
              instructions: ['Step 1', 'Step 2'],
              cookTime: 15,
              prepTime: 5,
              difficulty: 'Easy',
              servings: 1
            }
          ]
        });
      }
    }

    setGeneratedMeals(mockMeals);
    setProgress(95);
    setCurrentStep('complete');
    setProgress(100);
  };

  const formatPrice = (price: number | string) => {
    // If already a string price tier, return as-is
    if (typeof price === 'string') return price;

    // Handle legacy numeric prices (in cents)
    if (typeof price === 'number') {
      if (price <= 0) return '$';
      const dollarAmount = price / 100;
      if (dollarAmount <= 8) return '$';
      if (dollarAmount <= 12) return '$$';
      if (dollarAmount <= 16) return '$$$';
      return '$$$$';
    }

    return '$$'; // Default fallback
  };

  const toggleMealExpansion = (optionId: string) => {
    setExpandedMeals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(optionId)) {
        newSet.delete(optionId);
      } else {
        newSet.add(optionId);
      }
      return newSet;
    });
  };

  // Group meals by day for easier rendering with proper meal type ordering
  const mealsByDay = generatedMeals.reduce((acc, meal) => {
    if (!acc[meal.day]) acc[meal.day] = [];
    acc[meal.day].push(meal);
    return acc;
  }, {} as { [key: string]: GeneratedMeal[] });

  // Sort meals within each day to ensure proper order: breakfast, lunch, dinner
  Object.keys(mealsByDay).forEach(day => {
    mealsByDay[day].sort((a, b) => {
      const mealOrder = { 'breakfast': 0, 'lunch': 1, 'dinner': 2 };
      const aMealType = a.mealType.toLowerCase() as keyof typeof mealOrder;
      const bMealType = b.mealType.toLowerCase() as keyof typeof mealOrder;
      return mealOrder[aMealType] - mealOrder[bMealType];
    });
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentStep === 'discovering') {
        // Start the smart progress tracking
        actions.start();
        actions.updateStageProgress('restaurant_discovery', 100);
        setCurrentStep('analyzing');

        setTimeout(() => {
          actions.nextStage();
          actions.updateStageProgress('data_prefetch', 100);
          simulateMealCreation();
        }, 2000);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentStep, actions]);

  const currentStepIndex = steps.findIndex(step => step.key === currentStep);

  // FYTR Logo Component
  const FYTRLogo = () => (
    <div className="flex items-center space-x-3">
      <img
        src="/fytr-icon.svg"
        alt="FYTR"
        className="w-12 h-12"
      />
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          FYTR
        </h1>
        <p className="text-sm text-gray-500">Meal Planning</p>
      </div>
    </div>
  );

  // Modern Loading Animation Component
  const LoadingAnimation = () => (
    <div className="flex flex-col items-center justify-center py-16">
      {/* FYTR Logo with pulse animation */}
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl border-4 border-blue-600 animate-pulse">
          <img
            src="/fytr-icon.svg"
            alt="FYTR"
            className="w-16 h-16"
          />
        </div>
        <div className="absolute -top-2 -right-2">
          <Sparkles className="w-6 h-6 text-yellow-500 animate-bounce" />
        </div>
      </div>

      {/* Progress Steps */}
      <div className="w-full max-w-md mb-8">
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            return (
              <div key={step.key} className="flex flex-col items-center flex-1 relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500 border-2 ${
                  isCompleted
                    ? 'bg-green-500 text-white border-green-600' :
                  isActive
                    ? 'bg-blue-500 text-white border-blue-600 animate-pulse' :
                  'bg-white text-gray-500 border-gray-300'
                }`}>
                  {isCompleted ? <CheckCircle className="w-5 h-5" /> : <span className="font-bold">{index + 1}</span>}
                </div>
                {index < steps.length - 1 && (
                  <div className={`absolute top-5 left-8 h-0.5 transition-all duration-500 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-200'
                  }`} style={{ width: 'calc(100% - 1rem)' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Current Step Info */}
        <div className="text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {steps[currentStepIndex]?.label}
          </h3>
          <p className="text-gray-600">
            {steps[currentStepIndex]?.description}
          </p>
        </div>
      </div>

      {/* Animated Progress Bar */}
      <div className="w-full max-w-md">
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden border-2 border-gray-300">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-500 mt-2">{Math.round(progress)}% Complete</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-7xl w-full h-[96vh] sm:h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
        {/* Enhanced Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <FYTRLogo />
            <button
              onClick={onClose}
              className="p-3 hover:bg-gray-100 rounded-full transition-all duration-200 hover:scale-105"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Smart Loading States - Show during generation */}
        {currentStep !== 'complete' && (
          <div className="flex-1 overflow-y-auto">
            <SmartLoadingStates
              progress={progress}
              showEstimatedTime={true}
              showDetailedProgress={true}
            />
          </div>
        )}

        {/* Results */}
        {currentStep === 'complete' && (
          <div className="flex-1 overflow-y-auto p-6">
            {viewMode === 'week' ? (
              /* Week View - Colored Day Boxes */
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Your 7-Day Meal Plan</h2>
                  <div className="text-sm text-gray-600">Click any day to see meal details</div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {daysOfWeek.map((day) => {
                    const dayMeals = mealsByDay[day] || [];
                    const totalMeals = dayMeals.length;
                    const totalCalories = dayMeals.reduce((sum, meal) => 
                      sum + meal.options.reduce((optSum, opt) => optSum + (opt.calories || 0), 0) / meal.options.length, 0
                    );
                    
                    return (
                      <div
                        key={day}
                        onClick={() => {
                          setSelectedDay(day);
                          setViewMode('day');
                        }}
                        className={`${dayColors[day as keyof typeof dayColors]} rounded-2xl p-6 text-white cursor-pointer transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl`}
                      >
                        <div className="flex flex-col h-full">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">{day}</h3>
                            <div className="bg-white/20 rounded-full px-3 py-1">
                              <span className="text-sm font-medium">{totalMeals} meals</span>
                            </div>
                          </div>
                          
                          <div className="flex-1">
                            <div className="space-y-2">
                              {dayMeals.slice(0, 3).map((meal, idx) => (
                                <div key={idx} className="bg-white/10 rounded-lg p-2">
                                  <div className="text-sm font-medium">{meal.mealType}</div>
                                  <div className="text-xs opacity-90">{meal.options[0]?.title || 'Meal option'}</div>
                                </div>
                              ))}
                              {dayMeals.length > 3 && (
                                <div className="text-xs opacity-75">+{dayMeals.length - 3} more meals</div>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-white/20">
                            <div className="text-sm">
                              <div className="flex justify-between">
                                <span>Total Calories:</span>
                                <span className="font-semibold">{Math.round(totalCalories)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Day View - Detailed Meal Cards */
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => setViewMode('week')}
                      className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      <ChevronDown className="w-5 h-5 rotate-90" />
                      <span>Back to Week View</span>
                    </button>
                    <div className={`${dayColors[selectedDay as keyof typeof dayColors]} text-white px-4 py-2 rounded-full`}>
                      <h2 className="text-xl font-bold">{selectedDay}</h2>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  {(mealsByDay[selectedDay!] || []).map((meal, mealIndex) => (
                    <div key={`${meal.day}-${meal.mealType}`} className="bg-gray-50 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{meal.mealType}</h3>
                          <p className="text-gray-600">Choose your preferred option</p>
                        </div>
                      </div>
                      
                      {/* Group restaurant options together */}
                      <div className="space-y-6">
                        {/* Restaurant Options Section */}
                        {meal.options.filter(option => option.type === 'restaurant').length > 0 && (
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                            <div className="flex items-center space-x-3 mb-6">
                              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                                <Utensils className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h4 className="text-lg font-semibold text-gray-900">Restaurant Options</h4>
                                <p className="text-sm text-gray-600">Fresh delivery to your location</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {meal.options.filter(option => option.type === 'restaurant').map((option, optionIndex) => {
                                const optionId = `${meal.day}-${meal.mealType}-restaurant-${optionIndex}`;
                                const isExpanded = expandedMeals.has(optionId);

                                return (
                                  <div key={optionId} className="bg-white rounded-xl border border-blue-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-300">
                              {/* Content with smaller image */}
                              <div className="p-4">
                                <div className="flex items-start space-x-4">
                                  {/* Smaller image */}
                                  <div className="relative w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0">
                                    <img
                                      src={option.imageUrl}
                                      alt={option.title}
                                      className="w-full h-full object-cover rounded-lg"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=300&fit=crop';
                                      }}
                                    />
                                    <div className="absolute -top-1 -right-1">
                                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                                        🏪 Restaurant
                                      </span>
                                    </div>
                                  </div>

                                  {/* Main content next to image */}
                                  <div className="flex-1">
                                    <div className="flex justify-between items-start mb-2">
                                      <h4 className="font-semibold text-gray-900 text-lg">{option.title}</h4>
                                      <span className="text-lg font-bold text-gray-900">{formatPrice(option.price)}</span>
                                    </div>

                                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{option.description}</p>

                                    {/* Restaurant Info */}
                                    {option.type === 'restaurant' && option.restaurantName && (
                                      <div className="mb-3">
                                        <h5 className="font-medium text-gray-800 text-sm">📍 {option.restaurantName}</h5>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Nutrition Info */}
                                <div className="grid grid-cols-4 gap-2 mb-4">
                                  <div className="text-center">
                                    <div className="text-sm font-semibold text-gray-900">{option.calories}</div>
                                    <div className="text-xs text-gray-500">cal</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-sm font-semibold text-gray-900">{option.protein}g</div>
                                    <div className="text-xs text-gray-500">protein</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-sm font-semibold text-gray-900">{option.carbs}g</div>
                                    <div className="text-xs text-gray-500">carbs</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-sm font-semibold text-gray-900">{option.fat}g</div>
                                    <div className="text-xs text-gray-500">fat</div>
                                  </div>
                                </div>

                                {/* Restaurant Info */}
                                {option.type === 'restaurant' && option.restaurantName && (
                                  <div className="mb-4">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <h5 className="font-semibold text-gray-900">Order from {option.restaurantName}</h5>
                                        <p className="text-sm text-gray-600">Fresh delivery to your location</p>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Expand/Collapse Button */}
                                <button
                                  onClick={() => toggleMealExpansion(optionId)}
                                  className="w-full flex items-center justify-center space-x-2 py-2 text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  <span>{isExpanded ? 'Show Less' : 'Show Recipe Details'}</span>
                                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Expanded Content */}
                                {isExpanded && option.type === 'home' && (
                                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                    {/* Ingredients */}
                                    {option.ingredients && option.ingredients.length > 0 && (
                                      <div>
                                        <h6 className="font-semibold text-gray-900 mb-2">Ingredients:</h6>
                                        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                          {option.ingredients.map((ingredient, idx) => (
                                            <li key={idx}>{ingredient}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Instructions */}
                                    {option.instructions && option.instructions.length > 0 && (
                                      <div>
                                        <h6 className="font-semibold text-gray-900 mb-2">Instructions:</h6>
                                        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
                                          {option.instructions.map((instruction, idx) => (
                                            <li key={idx}>{instruction}</li>
                                          ))}
                                        </ol>
                                      </div>
                                    )}

                                    {/* Cooking Info */}
                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                      {(option.cookTime || 0) > 0 && (
                                        <div className="flex items-center space-x-1">
                                          <Clock className="w-4 h-4" />
                                          <span>{option.cookTime} min cook</span>
                                        </div>
                                      )}
                                      {(option.prepTime || 0) > 0 && (
                                        <div className="flex items-center space-x-1">
                                          <Clock className="w-4 h-4" />
                                          <span>{option.prepTime} min prep</span>
                                        </div>
                                      )}
                                      <div className="flex items-center space-x-1">
                                        <span className="capitalize">{option.difficulty}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                            </div>
                          </div>
                        )}

                        {/* Home Recipe Section */}
                        {meal.options.filter(option => option.type === 'home').length > 0 && (
                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
                            <div className="flex items-center space-x-3 mb-6">
                              <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                                <ChefHat className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h4 className="text-lg font-semibold text-gray-900">Home Recipe</h4>
                                <p className="text-sm text-gray-600">Cook fresh at home</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                              {meal.options.filter(option => option.type === 'home').map((option, optionIndex) => {
                                const optionId = `${meal.day}-${meal.mealType}-home-${optionIndex}`;
                                const isExpanded = expandedMeals.has(optionId);

                                return (
                                  <div key={optionId} className="bg-white rounded-xl border border-green-200 overflow-hidden hover:shadow-lg hover:border-green-300 transition-all duration-300">
                                    {/* Condensed view by default */}
                                    <div className="p-6">
                                      <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                          <h5 className="text-xl font-semibold text-gray-900 mb-2">{option.title}</h5>
                                          <p className="text-gray-600 mb-4">{option.description}</p>

                                          {/* Quick nutrition info */}
                                          <div className="flex items-center space-x-6 text-sm text-gray-600">
                                            <div className="flex items-center space-x-1">
                                              <span className="font-semibold text-gray-900">{option.calories}</span>
                                              <span>cal</span>
                                            </div>
                                            <div className="flex items-center space-x-1">
                                              <Clock className="w-4 h-4" />
                                              <span>{(option.prepTime || 0) + (option.cookTime || 0)} min</span>
                                            </div>
                                            <div className="flex items-center space-x-1">
                                              <span className="capitalize">{option.difficulty || 'Medium'}</span>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="ml-4">
                                          <div className="relative w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0">
                                            <img
                                              src={option.imageUrl}
                                              alt={option.title}
                                              className="w-full h-full object-cover rounded-lg"
                                              onError={(e) => {
                                                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop';
                                              }}
                                            />
                                            <div className="absolute -top-1 -right-1">
                                              <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full text-xs font-medium">
                                                🏠
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* View Details Button */}
                                      <button
                                        onClick={() => toggleMealExpansion(optionId)}
                                        className="w-full flex items-center justify-center space-x-2 py-3 border border-green-200 rounded-lg text-green-700 hover:bg-green-50 font-medium transition-colors"
                                      >
                                        <span>{isExpanded ? 'Hide Details' : 'View Full Recipe'}</span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      </button>

                                      {/* Expanded Recipe Details */}
                                      {isExpanded && (
                                        <div className="mt-6 pt-6 border-t border-gray-200 space-y-6 animate-in slide-in-from-top duration-300">
                                          {/* Detailed nutrition */}
                                          <div>
                                            <h6 className="font-semibold text-gray-900 mb-3">Nutrition Information</h6>
                                            <div className="grid grid-cols-4 gap-4 text-center">
                                              <div className="bg-gray-50 rounded-lg p-3">
                                                <div className="text-lg font-semibold text-gray-900">{option.calories}</div>
                                                <div className="text-xs text-gray-500">Calories</div>
                                              </div>
                                              <div className="bg-gray-50 rounded-lg p-3">
                                                <div className="text-lg font-semibold text-gray-900">{option.protein}g</div>
                                                <div className="text-xs text-gray-500">Protein</div>
                                              </div>
                                              <div className="bg-gray-50 rounded-lg p-3">
                                                <div className="text-lg font-semibold text-gray-900">{option.carbs}g</div>
                                                <div className="text-xs text-gray-500">Carbs</div>
                                              </div>
                                              <div className="bg-gray-50 rounded-lg p-3">
                                                <div className="text-lg font-semibold text-gray-900">{option.fat}g</div>
                                                <div className="text-xs text-gray-500">Fat</div>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Ingredients */}
                                          {option.ingredients && option.ingredients.length > 0 && (
                                            <div>
                                              <h6 className="font-semibold text-gray-900 mb-3">Ingredients</h6>
                                              <ul className="list-disc list-inside text-sm text-gray-600 space-y-2 bg-gray-50 rounded-lg p-4">
                                                {option.ingredients.map((ingredient, idx) => (
                                                  <li key={idx}>{ingredient}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}

                                          {/* Instructions */}
                                          {option.instructions && option.instructions.length > 0 && (
                                            <div>
                                              <h6 className="font-semibold text-gray-900 mb-3">Cooking Instructions</h6>
                                              <ol className="list-decimal list-inside text-sm text-gray-600 space-y-3">
                                                {option.instructions.map((instruction, idx) => (
                                                  <li key={idx} className="leading-relaxed">{instruction}</li>
                                                ))}
                                              </ol>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enhanced Footer */}
        <div className="flex-shrink-0 p-6 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {isGuest ? (
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Sign up to save your personalized meal plan</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Your meal plan will be saved automatically</span>
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-6 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
              >
                Close
              </button>
              {currentStep === 'complete' && (
                <button
                  onClick={() => onComplete(generatedMeals)}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                >
                  Save Meal Plan
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}