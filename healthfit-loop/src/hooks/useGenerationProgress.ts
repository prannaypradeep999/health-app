import { useState, useEffect, useCallback } from 'react';

export interface GenerationStage {
  id: string;
  name: string;
  description: string;
  progress: number;
  status: 'pending' | 'active' | 'completed' | 'error';
  estimatedTime: number; // in seconds
  actualTime?: number;
}

export interface GenerationProgress {
  stages: GenerationStage[];
  currentStageIndex: number;
  overallProgress: number;
  isComplete: boolean;
  hasError: boolean;
  errorMessage?: string;
  estimatedRemainingTime: number;
  actualElapsedTime: number;
}

interface UseGenerationProgressConfig {
  stages: Omit<GenerationStage, 'progress' | 'status' | 'actualTime'>[];
  enableRealTimeUpdates?: boolean;
  updateInterval?: number; // in ms
}

export function useGenerationProgress(config: UseGenerationProgressConfig) {
  const [progress, setProgress] = useState<GenerationProgress>(() => ({
    stages: config.stages.map(stage => ({
      ...stage,
      progress: 0,
      status: 'pending' as const
    })),
    currentStageIndex: 0,
    overallProgress: 0,
    isComplete: false,
    hasError: false,
    estimatedRemainingTime: config.stages.reduce((sum, stage) => sum + stage.estimatedTime, 0),
    actualElapsedTime: 0
  }));

  const [startTime, setStartTime] = useState<number | null>(null);

  // Start generation progress tracking
  const start = useCallback(() => {
    setStartTime(Date.now());
    setProgress(prev => ({
      ...prev,
      stages: prev.stages.map((stage, index) => ({
        ...stage,
        status: index === 0 ? 'active' : 'pending'
      })),
      currentStageIndex: 0,
      overallProgress: 0,
      isComplete: false,
      hasError: false,
      actualElapsedTime: 0
    }));
  }, []);

  // Move to next stage
  const nextStage = useCallback(() => {
    setProgress(prev => {
      const currentStage = prev.stages[prev.currentStageIndex];
      const nextIndex = prev.currentStageIndex + 1;
      const isComplete = nextIndex >= prev.stages.length;

      const updatedStages = prev.stages.map((stage, index) => {
        if (index === prev.currentStageIndex) {
          return {
            ...stage,
            progress: 100,
            status: 'completed' as const,
            actualTime: startTime ? (Date.now() - startTime) / 1000 : stage.estimatedTime
          };
        }
        if (index === nextIndex && !isComplete) {
          return {
            ...stage,
            status: 'active' as const
          };
        }
        return stage;
      });

      const completedStages = updatedStages.filter(s => s.status === 'completed').length;
      const newOverallProgress = (completedStages / updatedStages.length) * 100;

      // Calculate remaining time based on completed stages
      const remainingStages = updatedStages.slice(nextIndex);
      const estimatedRemainingTime = remainingStages.reduce((sum, stage) => sum + stage.estimatedTime, 0);

      return {
        ...prev,
        stages: updatedStages,
        currentStageIndex: isComplete ? prev.currentStageIndex : nextIndex,
        overallProgress: newOverallProgress,
        isComplete,
        estimatedRemainingTime
      };
    });
  }, [startTime]);

  // Update current stage progress
  const updateStageProgress = useCallback((stageId: string, progress: number) => {
    setProgress(prev => ({
      ...prev,
      stages: prev.stages.map(stage =>
        stage.id === stageId ? { ...stage, progress: Math.min(100, Math.max(0, progress)) } : stage
      )
    }));
  }, []);

  // Mark current stage as error
  const setError = useCallback((errorMessage: string) => {
    setProgress(prev => ({
      ...prev,
      stages: prev.stages.map((stage, index) =>
        index === prev.currentStageIndex ? { ...stage, status: 'error' } : stage
      ),
      hasError: true,
      errorMessage
    }));
  }, []);

  // Complete generation
  const complete = useCallback(() => {
    setProgress(prev => ({
      ...prev,
      stages: prev.stages.map(stage => ({
        ...stage,
        progress: 100,
        status: 'completed' as const
      })),
      overallProgress: 100,
      isComplete: true,
      estimatedRemainingTime: 0
    }));
  }, []);

  // Real-time updates for elapsed time
  useEffect(() => {
    if (!startTime || progress.isComplete) return;

    const interval = setInterval(() => {
      setProgress(prev => ({
        ...prev,
        actualElapsedTime: (Date.now() - startTime) / 1000
      }));
    }, config.updateInterval || 1000);

    return () => clearInterval(interval);
  }, [startTime, progress.isComplete, config.updateInterval]);

  // Auto-progress simulation for demo purposes
  const simulateProgress = useCallback(async (enableAutoProgress = false) => {
    if (!enableAutoProgress) return;

    start();

    for (let stageIndex = 0; stageIndex < config.stages.length; stageIndex++) {
      const stage = config.stages[stageIndex];

      // Simulate progressive updates within the stage
      for (let i = 0; i <= 100; i += 10) {
        updateStageProgress(stage.id, i);
        await new Promise(resolve => setTimeout(resolve, (stage.estimatedTime * 1000) / 10));
      }

      if (stageIndex < config.stages.length - 1) {
        nextStage();
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause between stages
      }
    }

    complete();
  }, [config.stages, start, updateStageProgress, nextStage, complete]);

  return {
    progress,
    actions: {
      start,
      nextStage,
      updateStageProgress,
      setError,
      complete,
      simulateProgress
    }
  };
}

// Predefined stage configurations for common generation types
export const GENERATION_STAGES = {
  MEAL_ONLY: [
    {
      id: 'restaurant_discovery',
      name: 'Discovering Restaurants',
      description: 'Finding healthy options in your area',
      estimatedTime: 8
    },
    {
      id: 'menu_analysis',
      name: 'Analyzing Menus',
      description: 'Checking nutrition data and ingredients',
      estimatedTime: 12
    },
    {
      id: 'meal_generation',
      name: 'Creating Meal Plan',
      description: 'Personalizing meals for your goals',
      estimatedTime: 15
    }
  ],
  PARALLEL_COMPLETE: [
    {
      id: 'restaurant_discovery',
      name: 'Discovering Restaurants',
      description: 'Finding healthy options in your area',
      estimatedTime: 8
    },
    {
      id: 'data_prefetch',
      name: 'Prefetching Data',
      description: 'Loading menus and nutrition info',
      estimatedTime: 10
    },
    {
      id: 'parallel_generation',
      name: 'Generating Plans',
      description: 'Creating meals & workouts in parallel ⚡',
      estimatedTime: 20
    },
    {
      id: 'optimization',
      name: 'Optimizing Results',
      description: 'Fine-tuning your personalized plans',
      estimatedTime: 7
    }
  ],
  FAST_CACHED: [
    {
      id: 'cache_check',
      name: 'Checking Cache',
      description: 'Looking for pre-loaded data',
      estimatedTime: 2
    },
    {
      id: 'fast_generation',
      name: 'Fast Generation',
      description: 'Using cached data for instant results',
      estimatedTime: 8
    }
  ]
};