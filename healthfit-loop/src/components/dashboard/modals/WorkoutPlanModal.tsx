'use client';

import React from 'react';
import { X, ArrowLeft, Clock, MapPin, Lock } from 'lucide-react';
import { colors, sampleWorkoutPlan } from '../constants';

interface WorkoutPlanModalProps {
  surveyData: any;
  isGuest: boolean;
  onClose: () => void;
}

export default function WorkoutPlanModal({ surveyData, isGuest, onClose }: WorkoutPlanModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col" style={{ backgroundColor: colors.white }}>
        <div className="flex-shrink-0 p-6 flex justify-between items-center" style={{ backgroundColor: colors.accentRed }}>
          <div className="flex items-center space-x-4">
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2 flex items-center space-x-2">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back to Dashboard</span>
            </button>
            <h2 className="text-2xl font-bold text-white">Weekly Workout Plan</h2>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4" style={{ color: colors.nearBlack }}>
                This Week's Workouts - {surveyData?.goal?.replace('_', ' ')} Focus
              </h3>
              
              {sampleWorkoutPlan.map((day, index) => (
                <div key={index} className="mb-6 rounded-lg p-4" style={{ backgroundColor: colors.paleGray }}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-lg" style={{ color: colors.nearBlack }}>{day.day}</h4>
                      <p className="text-lg font-medium" style={{ color: colors.accentRed }}>{day.workout}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" style={{ color: colors.mediumGray }} />
                      <span style={{ color: colors.mediumGray }}>{day.duration}</span>
                    </div>
                  </div>
                  <p className="text-sm" style={{ color: colors.mediumGray }}>{day.focus}</p>
                </div>
              ))}
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-4" style={{ color: colors.nearBlack }}>Upgrade Benefits</h3>
              
              {isGuest ? (
                <div className="border rounded-lg p-4 mb-4" style={{ backgroundColor: colors.offWhite, borderColor: colors.lightGray }}>
                  <div className="flex items-center space-x-2 mb-2">
                    <Lock className="w-4 h-4" style={{ color: colors.accentRed }} />
                    <span className="font-medium" style={{ color: colors.accentRed }}>Create Account to Unlock</span>
                  </div>
                  <ul className="text-sm space-y-1" style={{ color: colors.mediumGray }}>
                    <li>• Save your workout progress</li>
                    <li>• Track weights and reps</li>
                    <li>• Get personalized adjustments</li>
                  </ul>
                </div>
              ) : (
                <div className="border rounded-lg p-4 mb-4" style={{ backgroundColor: colors.offWhite, borderColor: colors.lightGray }}>
                  <div className="flex items-center space-x-2 mb-2">
                    <MapPin className="w-4 h-4" style={{ color: colors.deepBlue }} />
                    <span className="font-medium" style={{ color: colors.deepBlue }}>Upgrade for Local Gyms</span>
                  </div>
                  <ul className="text-sm space-y-1" style={{ color: colors.mediumGray }}>
                    <li>• Nearby gym recommendations</li>
                    <li>• Running paths in your area</li>
                    <li>• Group fitness classes</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}