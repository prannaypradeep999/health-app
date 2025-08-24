'use client';

import React from 'react';
import { Star, Check } from 'lucide-react';
import { colors } from './constants';

interface UpgradeCardProps {
  isGuest: boolean;
  onSignup: () => void;
}

export default function UpgradeCard({ isGuest, onSignup }: UpgradeCardProps) {
  return (
    <div className="rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 text-white overflow-hidden" 
         style={{ background: colors.gradient }}>
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Star className="w-8 h-8" />
          <h3 className="text-xl font-bold">
            {isGuest ? 'Save Your Progress' : 'Unlock More Features'}
          </h3>
        </div>
        <p className="mb-6 text-white opacity-80">
          {isGuest 
            ? 'Create an account to save your personalized plans permanently'
            : 'Get access to advanced tracking and restaurant recommendations'
          }
        </p>
        <ul className="space-y-2 mb-6 text-sm">
          {isGuest ? (
            <>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Save all your personalized plans</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Access from any device</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Track long-term progress</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Restaurant recommendations</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Delivery app integration</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Local gym finder</span>
              </li>
            </>
          )}
        </ul>
        <button 
          onClick={onSignup}
          className="w-full py-3 rounded-lg font-semibold hover:opacity-90 transition-all duration-200"
          style={{ backgroundColor: colors.white, color: colors.deepBlue }}
        >
          {isGuest ? 'Create Free Account' : 'Upgrade Now'}
        </button>
      </div>
    </div>
  );
}