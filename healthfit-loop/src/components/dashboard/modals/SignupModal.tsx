'use client';

import React, { useState } from 'react';
import { X, Star, Check, ArrowLeft } from 'lucide-react';
import { colors, subscriptionPlans } from '../constants';

interface SignupModalProps {
  onClose: () => void;
  selectedPlan: number | null;
  setSelectedPlan: (id: number | null) => void;
}

export default function SignupModal({ onClose, selectedPlan, setSelectedPlan }: SignupModalProps) {
  const handleCheckout = () => {
    const plan = subscriptionPlans.find(p => p.id === selectedPlan);
    if (plan) {
      alert(`Redirecting to Stripe for ${plan.name} plan ($${plan.price}/month)...`);
      // Here you would integrate with Stripe
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] flex flex-col border border-gray-200">
        <div className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Choose Your Plan</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {subscriptionPlans.map((plan) => (
              <div
                key={plan.id}
                className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${plan.popular ? 'relative' : ''} ${
                  selectedPlan === plan.id
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </div>
                )}

                <div className="w-12 h-12 rounded-lg mb-4 flex items-center justify-center bg-gray-100">
                  <Star className="w-6 h-6 text-gray-600" />
                </div>

                <h3 className="text-xl font-semibold mb-2 text-gray-900">{plan.name}</h3>
                <div className="text-3xl font-bold mb-4 text-gray-900">
                  ${plan.price}
                  <span className="text-lg font-normal text-gray-500">/month</span>
                </div>

                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start space-x-3">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {selectedPlan && (
            <button
              onClick={handleCheckout}
              className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Continue to Payment (Stripe)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}