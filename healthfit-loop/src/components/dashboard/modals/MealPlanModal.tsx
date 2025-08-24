'use client';

import React from 'react';
import { X, ArrowLeft, Download, Lock } from 'lucide-react';
import { colors, sampleMealPlan } from '../constants';

interface MealPlanModalProps {
  surveyData: any;
  isGuest: boolean;
  onClose: () => void;
}

export default function MealPlanModal({ surveyData, isGuest, onClose }: MealPlanModalProps) {
  const downloadGroceryList = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Day,Meal,Calories,Recipe\n" +
      "Monday,Greek Yogurt Bowl,320,1 cup Greek yogurt + berries\n";
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "grocery_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col" style={{ backgroundColor: colors.white }}>
        <div className="flex-shrink-0 p-6 flex justify-between items-center" style={{ backgroundColor: colors.deepBlue }}>
          <div className="flex items-center space-x-4">
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2 flex items-center space-x-2">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back to Dashboard</span>
            </button>
            <h2 className="text-2xl font-bold text-white">Weekly Meal Plan</h2>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-2">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4" style={{ color: colors.nearBlack }}>
                This Week's Meals - Customized for {surveyData?.firstName}
              </h3>
              
              {sampleMealPlan.map((day, index) => (
                <div key={index} className="mb-6 rounded-lg p-4" style={{ backgroundColor: colors.paleGray }}>
                  <h4 className="font-semibold text-lg mb-3" style={{ color: colors.nearBlack }}>{day.day}</h4>
                  {day.meals.map((meal, mealIndex) => (
                    <div key={mealIndex} className="mb-4 rounded p-4" style={{ backgroundColor: colors.white }}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium text-lg" style={{ color: colors.nearBlack }}>{meal.name}</span>
                          <span className="text-sm ml-2" style={{ color: colors.mediumGray }}>({meal.type})</span>
                        </div>
                        <span className="text-sm font-medium" style={{ color: colors.deepBlue }}>{meal.calories} cal</span>
                      </div>
                      <p className="text-xs mb-3" style={{ color: colors.mediumGray }}>{meal.nutrients}</p>
                      
                      <div className="flex space-x-2">
                        <button 
                          onClick={downloadGroceryList}
                          className="flex-1 text-white py-2 px-3 rounded text-xs font-medium hover:opacity-90"
                          style={{ backgroundColor: colors.deepBlue }}
                        >
                          🛒 Add to Grocery List
                        </button>
                        {isGuest && (
                          <button 
                            className="flex-1 border py-2 px-3 rounded text-xs font-medium opacity-50 cursor-not-allowed flex items-center justify-center space-x-1"
                            style={{ borderColor: colors.lightGray, color: colors.mediumGray }}
                          >
                            <Lock className="w-3 h-3" />
                            <span>Sign up for restaurants</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-4" style={{ color: colors.nearBlack }}>Quick Actions</h3>
              
              <button 
                onClick={downloadGroceryList}
                className="w-full text-white py-3 rounded-lg hover:opacity-90 flex items-center justify-center space-x-2 mb-4"
                style={{ backgroundColor: colors.deepBlue }}
              >
                <Download className="w-4 h-4" />
                <span>Download Full Grocery List (CSV)</span>
              </button>
              
              {isGuest && (
                <div className="border rounded-lg p-4" style={{ backgroundColor: colors.offWhite, borderColor: colors.lightGray }}>
                  <p className="text-sm mb-3" style={{ color: colors.mediumGray }}>
                    Create an account to unlock restaurant recommendations!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}