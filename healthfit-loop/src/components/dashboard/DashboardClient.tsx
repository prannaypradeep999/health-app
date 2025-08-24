'use client';

import React, { useState } from 'react';
import { 
  User, 
  Utensils, 
  Dumbbell, 
  Star, 
  Share2,
  LogOut,
  UserPlus
} from 'lucide-react';
import MealPlanCard from './MealPlanCard';
import WorkoutPlanCard from './WorkoutPlanCard';
import UpgradeCard from './UpgradeCard';
import MealPlanModal from './modals/MealPlanModal';
import WorkoutPlanModal from './modals/WorkoutPlanModal';
import SignupModal from './modals/SignupModal';
import ShareModal from './modals/ShareModal';
import CreateAccountModal from './modals/CreateAccountModal';
import { colors } from './constants';

interface DashboardClientProps {
  userData: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  surveyData: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    age: number;
    sex: string;
    height: string;
    weight: number;
    zipCode: string;
    goal: string;
    activityLevel: string;
    budgetTier: string;
    dietPrefs: string[];
    mealsOutPerWeek: number;
  } | null;
  isGuest: boolean;
}

export default function DashboardClient({ userData, surveyData, isGuest }: DashboardClientProps) {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  
  // Use survey data for display (guest or user)
  const displayName = surveyData?.firstName || 'Guest';
  const userEmail = surveyData?.email || '';
  
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/survey';
  };
  
  const handleCreateAccount = () => {
    setActiveModal('createAccount');
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.offWhite }}>
      {/* Header with User Info */}
      <header className="shadow-lg border-b" style={{ backgroundColor: colors.white, borderColor: colors.paleGray }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              {/* FYTR AI Logo */}
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: colors.gradient }}>
                <svg width="24" height="24" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 3 L34 11 L34 29 L20 37 L6 29 L6 11 Z" fill="white" opacity="0.9"/>
                  <circle cx="20" cy="20" r="2" fill={colors.deepBlue}/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold" style={{ 
                background: colors.gradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                FYTR AI Dashboard
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* User Status Badge */}
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full" 
                   style={{ backgroundColor: isGuest ? '#FEF3C7' : '#D1FAE5' }}>
                <User className="w-4 h-4" style={{ color: isGuest ? '#D97706' : '#059669' }} />
                <span className="text-sm font-medium" style={{ color: isGuest ? '#D97706' : '#059669' }}>
                  {isGuest ? 'Guest Mode' : `${displayName}`}
                </span>
              </div>
              
              {/* Action Buttons */}
              {isGuest ? (
                <button 
                  onClick={handleCreateAccount}
                  className="flex items-center space-x-2 px-4 py-2 text-white rounded-full hover:shadow-lg transition-all duration-200"
                  style={{ background: colors.gradient }}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create Account</span>
                </button>
              ) : (
                <>
                  <button 
                    onClick={() => setActiveModal('share')}
                    className="flex items-center space-x-2 px-4 py-2 text-white rounded-full hover:shadow-lg transition-all duration-200"
                    style={{ background: colors.gradient }}
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Share</span>
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-4 py-2 border rounded-full hover:bg-gray-50 transition-all duration-200"
                    style={{ borderColor: colors.lightGray }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Guest Warning Banner */}
          {isGuest && (
            <div className="mt-4 p-3 rounded-lg flex items-center justify-between" 
                 style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D' }}>
              <div className="flex items-center space-x-2">
                <span className="text-yellow-800">⚠️</span>
                <span className="text-sm text-yellow-800">
                  Your data is only saved temporarily. Create an account to save your personalized plans permanently!
                </span>
              </div>
              <button 
                onClick={handleCreateAccount}
                className="text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
              >
                Save My Data
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Progress Overview with User Data */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="rounded-2xl shadow-xl p-8 text-white mb-8" style={{ background: colors.gradient }}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold mb-2">
                Welcome back, {displayName}!
              </h2>
              <p className="text-white opacity-80 text-lg">
                Your personalized {surveyData?.goal?.replace('_', ' ').toLowerCase()} journey
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">0/7</div>
              <p className="text-white opacity-80">Days Completed</p>
            </div>
          </div>
          
          <div className="mt-6 bg-white/20 rounded-full h-3">
            <div className="bg-white rounded-full h-3 w-0 transition-all duration-300"></div>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <MealPlanCard 
            surveyData={surveyData}
            onViewPlan={() => setActiveModal('mealPlan')} 
          />
          <WorkoutPlanCard 
            surveyData={surveyData}
            onViewPlan={() => setActiveModal('workoutPlan')} 
          />
          <UpgradeCard 
            isGuest={isGuest}
            onSignup={() => isGuest ? handleCreateAccount() : setActiveModal('signup')} 
          />
        </div>
      </div>

      {/* Modals */}
      {activeModal === 'mealPlan' && (
        <MealPlanModal 
          surveyData={surveyData}
          isGuest={isGuest}
          onClose={() => setActiveModal(null)} 
        />
      )}
      
      {activeModal === 'workoutPlan' && (
        <WorkoutPlanModal 
          surveyData={surveyData}
          isGuest={isGuest}
          onClose={() => setActiveModal(null)} 
        />
      )}
      
      {activeModal === 'signup' && (
        <SignupModal 
          onClose={() => setActiveModal(null)}
          selectedPlan={selectedPlan}
          setSelectedPlan={setSelectedPlan}
        />
      )}
      
      {activeModal === 'share' && (
        <ShareModal onClose={() => setActiveModal(null)} />
      )}
      
      {activeModal === 'createAccount' && (
        <CreateAccountModal 
          email={userEmail}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            window.location.reload(); // Reload to show logged-in state
          }}
        />
      )}
    </div>
  );
}