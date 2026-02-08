'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Warning,
  CheckCircle,
  Circle,
  Spinner,
  Envelope,
  ArrowRight,
  Sparkle,
  Barbell,
  ForkKnife,
  MapPin,
  Target
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import Logo from '@/components/logo';

interface LoadingJourneyProps {
  surveyData: any;
  onComplete: () => void;
  onSkipToDashboard: () => void;
}

interface GenerationStage {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'pending' | 'active' | 'complete';
  duration: number; // estimated seconds
}

const initialStages: GenerationStage[] = [
  {
    id: 'analyzing',
    label: 'Analyzing your profile',
    description: 'Understanding your goals and preferences',
    icon: Target,
    status: 'active',
    duration: 15
  },
  {
    id: 'workouts',
    label: 'Creating workout plan',
    description: 'Building personalized exercise routines',
    icon: Barbell,
    status: 'pending',
    duration: 45
  },
  {
    id: 'meals',
    label: 'Generating meal recipes',
    description: 'Crafting nutritious home-cooked meals',
    icon: ForkKnife,
    status: 'pending',
    duration: 60
  },
  {
    id: 'restaurants',
    label: 'Finding local restaurants',
    description: 'Discovering healthy spots near you',
    icon: MapPin,
    status: 'pending',
    duration: 45
  }
];

// Friendly status messages that rotate during longer wait times
const friendlyMessages = [
  "Still working on your personalized plan...",
  "Making sure everything is perfect for you...",
  "Almost done! Creating something amazing...",
  "Your plan is taking shape nicely...",
  "Putting the finishing touches on your program...",
  "Great things take a little time...",
  "Customizing every detail for your success...",
  "Building something truly personalized...",
  "Your patience will be worth it...",
  "Creating your perfect fitness journey..."
];

// Timeout handling messages
const timeoutMessages = [
  "Taking a bit longer than usual, but we're still working...",
  "Your plan is complex and worth the wait...",
  "Sometimes the best things take extra time...",
  "We're making sure everything is just right...",
  "Still crafting your personalized experience..."
];

// Educational tips to cycle through
const nutritionTips = [
  {
    title: "Protein is your friend",
    content: "Protein keeps you full longer and preserves muscle during weight loss. Aim for 25-30g per meal."
  },
  {
    title: "Meal timing matters less than you think",
    content: "Total daily intake matters more than when you eat. Find a schedule that works for your lifestyle."
  },
  {
    title: "Hydration affects hunger",
    content: "Often what feels like hunger is actually thirst. Try drinking water before reaching for a snack."
  },
  {
    title: "Progress over perfection",
    content: "One off-plan meal won't derail your progress. Consistency over weeks matters more than daily perfection."
  },
  {
    title: "Sleep impacts weight loss",
    content: "Poor sleep increases hunger hormones. Aim for 7-9 hours to support your goals."
  }
];

// Custom easing for smooth animations
const smoothEase: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const GENERATION_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_POLL_ATTEMPTS = 60;
const MAX_CONSECUTIVE_FAILURES = 5;

export function LoadingJourney({ surveyData, onComplete, onSkipToDashboard }: LoadingJourneyProps) {
  const router = useRouter();
  const [stages, setStages] = useState<GenerationStage[]>(initialStages);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState(surveyData?.email || '');
  const [restaurantPreview, setRestaurantPreview] = useState<string[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [currentFriendlyMessage, setCurrentFriendlyMessage] = useState(0);
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);
  const [currentTimeoutMessage, setCurrentTimeoutMessage] = useState(0);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [pollError, setPollError] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [pollResetKey, setPollResetKey] = useState(0);
  const pollAttemptsRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const [nutritionTargets, setNutritionTargets] = useState<{
    dailyCalories: number;
    dailyProtein: number;
    dailyCarbs: number;
    dailyFat: number;
  } | null>(null);

  // Use meal plan nutrition targets from API (single source of truth)
  const displayTargets = React.useMemo(() => {
    if (!nutritionTargets) return null;
    return {
      calories: Math.round(nutritionTargets.dailyCalories / 10) * 10,
      protein: Math.round(nutritionTargets.dailyProtein / 10) * 10,
      carbs: Math.round(nutritionTargets.dailyCarbs / 10) * 10,
      fat: Math.round(nutritionTargets.dailyFat / 10) * 10
    };
  }, [nutritionTargets]);

  // Timer for elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Hard timeout for generation
  useEffect(() => {
    if (generationComplete) return;
    const timeout = setTimeout(() => {
      setHasTimedOut(true);
    }, GENERATION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [generationComplete]);

  // Show skip button after 30 seconds
  useEffect(() => {
    const skipTimer = setTimeout(() => {
      setShowSkipButton(true);
    }, 30000);
    return () => clearTimeout(skipTimer);
  }, []);

  // Cycle through friendly messages every 12 seconds after 45 seconds
  useEffect(() => {
    const friendlyTimer = setTimeout(() => {
      setCurrentFriendlyMessage(0);
      const interval = setInterval(() => {
        setCurrentFriendlyMessage(prev => (prev + 1) % friendlyMessages.length);
      }, 12000);
      return () => clearInterval(interval);
    }, 45000);
    return () => clearTimeout(friendlyTimer);
  }, []);

  // Show timeout messages after 2 minutes
  useEffect(() => {
    const timeoutTimer = setTimeout(() => {
      setShowTimeoutMessage(true);
      setCurrentTimeoutMessage(0);
      const interval = setInterval(() => {
        setCurrentTimeoutMessage(prev => (prev + 1) % timeoutMessages.length);
      }, 15000);
      return () => clearInterval(interval);
    }, 120000);
    return () => clearTimeout(timeoutTimer);
  }, []);

  // Cycle through tips every 8 seconds
  useEffect(() => {
    const tipTimer = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % nutritionTips.length);
    }, 8000);
    return () => clearInterval(tipTimer);
  }, []);

  // Poll for early restaurant data
  useEffect(() => {
    const pollRestaurants = async () => {
      try {
        const res = await fetch('/api/ai/meals/current');
        if (res.ok) {
          const data = await res.json();
          setNutritionTargets(data.mealPlan?.nutritionTargets || null);
          const restaurants = data.mealPlan?.planData?.restaurantMeals || [];
          if (restaurants.length > 0) {
            const names = Array.from(
              new Set(
                (restaurants.map((r: any) => r.primary?.restaurant || r.restaurant).filter(Boolean) as string[])
              )
            ).slice(0, 4);
            setRestaurantPreview(names);
          }
        }
      } catch (error) {
        console.log('Restaurant preview not ready yet');
      }
    };

    // Start polling after 30s (restaurants should be found by then)
    const timer = setTimeout(() => {
      pollRestaurants();
      const interval = setInterval(pollRestaurants, 10000);
      return () => clearInterval(interval);
    }, 30000);

    return () => clearTimeout(timer);
  }, []);

  // Poll for actual generation status
  useEffect(() => {
    if (generationComplete || pollError || hasTimedOut) return;
    const pollStatus = async () => {
      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setPollError(true);
        return;
      }
      pollAttemptsRef.current += 1;
      setPollAttempts(pollAttemptsRef.current);

      try {
        const [mealsRes, workoutsRes] = await Promise.all([
          fetch('/api/ai/meals/current'),
          fetch('/api/ai/workouts/current')
        ]);

        const mealsReady = mealsRes.ok;
        const workoutsReady = workoutsRes.ok;
        consecutiveFailuresRef.current = 0;
        setConsecutiveFailures(0);

        // Update stages based on actual status
        setStages(prev => prev.map(stage => {
          if (stage.id === 'analyzing') {
            return { ...stage, status: 'complete' };
          }
          if (stage.id === 'workouts' && workoutsReady) {
            return { ...stage, status: 'complete' };
          }
          if (stage.id === 'meals' && mealsReady) {
            return { ...stage, status: 'complete' };
          }
          // Check restaurant status from meals response
          if (stage.id === 'restaurants' && mealsReady) {
            // Note: We'll check restaurants status separately to avoid async issues
            return stage; // Keep current status for now
          }
          return stage;
        }));

        // Set nutrition targets from meals response if available
        if (mealsRes.ok) {
          const mealsData = await mealsRes.json();
          setNutritionTargets(mealsData.mealPlan?.nutritionTargets || null);
        }

        // Calculate overall progress
        const completedCount = stages.filter(s => s.status === 'complete').length;
        setOverallProgress((completedCount / stages.length) * 100);

        // Check if all done
        if (mealsReady && workoutsReady) {
          // Give a moment for restaurants, then complete
          setTimeout(() => {
            setGenerationComplete(true);
            onComplete();
          }, 2000);
        }
      } catch (error) {
        console.error('Error polling generation status:', error);
        consecutiveFailuresRef.current += 1;
        setConsecutiveFailures(consecutiveFailuresRef.current);
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setPollError(true);
        }
      }
    };

    // Poll every 5 seconds
    const pollInterval = setInterval(pollStatus, 5000);
    // Initial poll after 10 seconds
    const initialPoll = setTimeout(pollStatus, 10000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(initialPoll);
    };
  }, [onComplete, stages, generationComplete, pollError, hasTimedOut, pollResetKey]);

  // Simulate stage progression for visual feedback (even if actual status lags)
  useEffect(() => {
    const stageTimers = [
      setTimeout(() => {
        setStages(prev => prev.map(s =>
          s.id === 'analyzing' ? { ...s, status: 'complete' } :
          s.id === 'workouts' ? { ...s, status: 'active' } : s
        ));
        setOverallProgress(25);
      }, 15000),
      setTimeout(() => {
        setStages(prev => prev.map(s =>
          s.id === 'workouts' ? { ...s, status: 'complete' } :
          s.id === 'meals' ? { ...s, status: 'active' } : s
        ));
        setOverallProgress(50);
      }, 60000),
      setTimeout(() => {
        setStages(prev => prev.map(s =>
          s.id === 'meals' ? { ...s, status: 'complete' } :
          s.id === 'restaurants' ? { ...s, status: 'active' } : s
        ));
        setOverallProgress(75);
      }, 120000),
    ];

    return () => stageTimers.forEach(t => clearTimeout(t));
  }, []);

  const handleSendEmail = async () => {
    if (!email) return;

    // TODO: Implement actual email sending
    // For now, just show confirmation
    console.log('[LoadingJourney] Email backup requested:', email);
    setEmailSent(true);

    // In future: POST to /api/email/send-backup-link
    // with surveyId and email
  };

  const currentTip = nutritionTips[currentTipIndex];

  if (pollError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center px-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 w-full max-w-lg text-center">
          <div className="text-red-500 mb-4 flex justify-center">
            <Warning size={48} />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-6">
            We couldn't load your plan. This might be a temporary issue.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => {
                setPollError(false);
                setHasTimedOut(false);
                setPollAttempts(0);
                setConsecutiveFailures(0);
                pollAttemptsRef.current = 0;
                consecutiveFailuresRef.current = 0;
                setPollResetKey(prev => prev + 1);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push('/survey')}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hasTimedOut) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center px-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 w-full max-w-lg text-center">
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Taking longer than expected
          </h2>
          <p className="text-gray-600 mb-6">
            Your plan is still being created, but it's taking longer than usual.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Refresh Page
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              Go to Dashboard
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            If this keeps happening, please contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Header */}
      <div className="p-6">
        <Logo variant="full" width={120} height={30} href="" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 max-w-lg mx-auto w-full">

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: smoothEase }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Building Your Plan
          </h1>
          <p className="text-gray-600">
            Creating a personalized program just for you
          </p>
        </motion.div>

        {/* Generation Stages */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4, ease: smoothEase }}
          className="w-full bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <div className="space-y-4">
            {stages.map((stage, index) => {
              const IconComponent = stage.icon;
              return (
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.2 + (index * 0.06),
                    duration: 0.35,
                    ease: smoothEase
                  }}
                  className={`flex items-start gap-4 p-3 rounded-xl transition-colors duration-200 ${
                    stage.status === 'active' ? 'bg-red-50' : ''
                  }`}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {stage.status === 'complete' ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                      >
                        <CheckCircle size={24} weight="fill" className="text-green-500" />
                      </motion.div>
                    ) : stage.status === 'active' ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                      >
                        <Spinner size={24} className="text-red-600" />
                      </motion.div>
                    ) : (
                      <Circle size={24} className="text-gray-300" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <IconComponent
                        size={18}
                        className={stage.status === 'active' ? 'text-red-600' : 'text-gray-400'}
                      />
                      <span className={`font-medium ${
                        stage.status === 'complete' ? 'text-gray-900' :
                        stage.status === 'active' ? 'text-red-900' : 'text-gray-400'
                      }`}>
                        {stage.label}
                      </span>
                    </div>
                    <p className={`text-sm mt-0.5 ${
                      stage.status === 'active' ? 'text-red-700' : 'text-gray-500'
                    }`}>
                      {stage.id === 'restaurants' && restaurantPreview.length > 0 ? (
                        `Found: ${restaurantPreview.join(', ')}`
                      ) : stage.status === 'active' && elapsedTime > 45 ? (
                        showTimeoutMessage ? timeoutMessages[currentTimeoutMessage] : friendlyMessages[currentFriendlyMessage]
                      ) : (
                        stage.description
                      )}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <span>Progress</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
        </motion.div>

        {/* Quick Insights - Your Targets */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4, ease: smoothEase }}
          className="w-full bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} className="text-red-600" />
            <h3 className="font-semibold text-gray-900">Your Daily Targets</h3>
          </div>

          {displayTargets ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <div className="text-lg sm:text-xl font-bold text-gray-900">{displayTargets.calories.toLocaleString()}</div>
                <div className="text-xs text-gray-500">calories</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <div className="text-lg sm:text-xl font-bold text-blue-700">{displayTargets.protein}g</div>
                <div className="text-xs text-blue-600">protein</div>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-xl">
                <div className="text-lg sm:text-xl font-bold text-amber-700">{displayTargets.carbs}g</div>
                <div className="text-xs text-amber-600">carbs</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <div className="text-lg sm:text-xl font-bold text-green-700">{displayTargets.fat}g</div>
                <div className="text-xs text-green-600">fat</div>
              </div>
            </div>
          ) : (
            <div className="text-center p-4 bg-red-50 rounded-xl border border-red-200">
              <div className="text-red-600 font-medium">Survey data incomplete</div>
              <div className="text-red-500 text-sm mt-1">Please complete your profile to view nutrition targets</div>
            </div>
          )}
        </motion.div>

        {/* Nutrition Tip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4, ease: smoothEase }}
          className="w-full bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl p-5 border border-red-100 mb-6"
        >
          <div className="flex items-start gap-3">
            <Sparkle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTipIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: smoothEase }}
              >
                <h4 className="font-medium text-red-900 mb-1">{currentTip.title}</h4>
                <p className="text-sm text-red-800">{currentTip.content}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Email Backup */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4, ease: smoothEase }}
          className="w-full"
        >
          {!emailSent ? (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Envelope size={18} className="text-gray-600" />
                <span className="text-sm font-medium text-gray-700">
                  Save your progress
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Get a link to access your plan if you need to close this tab
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 h-10 text-sm"
                />
                <Button
                  onClick={handleSendEmail}
                  disabled={!email}
                  size="sm"
                  className="bg-gray-900 hover:bg-gray-800 text-white px-4 transition-colors duration-200"
                >
                  Send
                </Button>
              </div>
              <div className="mt-3 text-center">
                <a
                  href={`/login?mode=signup&email=${encodeURIComponent(surveyData?.email || email || '')}`}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Create account instead →
                </a>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-green-50 rounded-2xl p-4 border border-green-200 text-center"
            >
              <CheckCircle size={24} className="text-green-600 mx-auto mb-2" />
              <p className="text-sm text-green-800">
                We'll email you a link to <strong>{email}</strong>
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Skip to Dashboard Button */}
        <AnimatePresence>
          {showSkipButton && !generationComplete && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.35, ease: smoothEase }}
              className="w-full mt-6"
            >
              <Button
                onClick={onSkipToDashboard}
                variant="outline"
                className="w-full h-12 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
              >
                Go to Dashboard
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <p className="text-xs text-center text-gray-500 mt-2">
                Your plan will continue generating in the background
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Time Elapsed (subtle) */}
        <div className="mt-6 text-xs text-gray-400">
          {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')} elapsed
        </div>
      </div>
    </div>
  );
}

export default LoadingJourney;