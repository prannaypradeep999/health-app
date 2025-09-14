'use client';

import React from 'react';
import { Star, Check } from 'lucide-react';

interface UpgradeCardProps {
  isGuest: boolean;
  onSignup: () => void;
}

export default function UpgradeCard({ isGuest, onSignup }: UpgradeCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-all duration-200">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <Star className="w-6 h-6 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            {isGuest ? 'Save Your Progress' : 'Unlock More Features'}
          </h3>
        </div>
      </div>

      <div className="p-6">
        <p className="text-gray-600 mb-6">
          {isGuest
            ? 'Create an account to save your personalized plans permanently'
            : 'Get access to advanced tracking and restaurant recommendations'
          }
        </p>

        <ul className="space-y-3 mb-6">
          {isGuest ? (
            <>
              <li className="flex items-center space-x-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Save all your personalized plans</span>
              </li>
              <li className="flex items-center space-x-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Access from any device</span>
              </li>
              <li className="flex items-center space-x-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Track long-term progress</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-center space-x-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Restaurant recommendations</span>
              </li>
              <li className="flex items-center space-x-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Delivery app integration</span>
              </li>
              <li className="flex items-center space-x-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Local gym finder</span>
              </li>
            </>
          )}
        </ul>

        <button
          onClick={onSignup}
          className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-all duration-200 font-medium"
        >
          {isGuest ? 'Create Free Account' : 'Upgrade Now'}
        </button>
      </div>
    </div>
  );
}