'use client';

import React from 'react';
import { Loader2, ChefHat, Utensils, Clock, Sparkles } from 'lucide-react';

interface SmartLoadingStatesProps {
  stage?: string;
  message?: string;
  className?: string;
}

const SmartLoadingStates: React.FC<SmartLoadingStatesProps> = ({
  stage = 'default',
  message = 'Loading...',
  className = ''
}) => {
  const getLoadingContent = () => {
    switch (stage) {
      case 'analyzing':
        return {
          icon: <Sparkles className="w-6 h-6 text-blue-500 animate-pulse" />,
          title: 'Analyzing your preferences',
          subtitle: 'Understanding your dietary needs and goals...'
        };
      case 'generating':
        return {
          icon: <ChefHat className="w-6 h-6 text-green-500 animate-bounce" />,
          title: 'Creating your meal plan',
          subtitle: 'Crafting personalized meals just for you...'
        };
      case 'finalizing':
        return {
          icon: <Utensils className="w-6 h-6 text-purple-500 animate-pulse" />,
          title: 'Finalizing details',
          subtitle: 'Adding nutritional information and recipes...'
        };
      case 'saving':
        return {
          icon: <Clock className="w-6 h-6 text-orange-500 animate-spin" />,
          title: 'Saving your plan',
          subtitle: 'Almost ready to serve...'
        };
      default:
        return {
          icon: <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />,
          title: 'Loading',
          subtitle: message
        };
    }
  };

  const content = getLoadingContent();

  return (
    <div className={`flex flex-col items-center justify-center p-6 ${className}`}>
      <div className="mb-4">
        {content.icon}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2 text-center">
        {content.title}
      </h3>
      <p className="text-sm text-gray-600 text-center max-w-xs">
        {content.subtitle}
      </p>
    </div>
  );
};

export default SmartLoadingStates;