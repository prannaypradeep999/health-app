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
      <div className="rounded-2xl max-w-5xl w-full h-[90vh] flex flex-col" style={{ backgroundColor: colors.white }}>
        <div className="flex-shrink-0 p-6 flex justify-between items-center" style={{ background: colors.gradient }}>
          <div className="flex items-center space-x-4">
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2 flex items-center space-x-2">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back to Dashboard</span>
            </button>
            <h2 className="text-2xl font-bold text-white">Choose Your Plan</h2>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {subscriptionPlans.map((plan) => (
              <div 
                key={plan.id}
                className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${plan.popular ? 'relative' : ''}`}
                style={{ 
                  borderColor: selectedPlan === plan.id ? colors.deepBlue : colors.lightGray,
                  backgroundColor: selectedPlan === plan.id ? colors.offWhite : colors.white
                }}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 text-white px-4 py-1 rounded-full text-sm font-medium" 
                       style={{ backgroundColor: colors.deepBlue }}>
                    Most Popular
                  </div>
                )}
                
                <div className="w-12 h-12 rounded-lg mb-4 flex items-center justify-center" 
                     style={{ background: plan.bgColor }}>
                  <Star className="w-6 h-6 text-white" />
                </div>
                
                <h3 className="text-xl font-bold mb-2" style={{ color: colors.nearBlack }}>{plan.name}</h3>
                <div className="text-3xl font-bold mb-4" style={{ color: colors.nearBlack }}>
                  ${plan.price}
                  <span className="text-lg font-normal" style={{ color: colors.mediumGray }}>/month</span>
                </div>
                
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center space-x-2">
                      <Check className="w-4 h-4" style={{ color: colors.deepBlue }} />
                      <span className="text-sm" style={{ color: colors.darkGray }}>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {selectedPlan && (
            <button
              onClick={handleCheckout}
              className="w-full text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
              style={{ background: colors.gradient }}
            >
              Continue to Payment (Stripe)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}