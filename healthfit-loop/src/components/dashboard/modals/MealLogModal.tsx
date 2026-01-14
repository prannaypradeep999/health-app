'use client';

import React, { useState } from 'react';
import { X, Plus, Clock, Zap, Apple } from 'lucide-react';

interface MealLogModalProps {
  onClose: () => void;
  onSave: (mealData: any) => void;
  selectedDay: string;
}

interface MealLogData {
  day: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  mealName: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes?: string;
  completed: boolean;
}

export default function MealLogModal({ onClose, onSave, selectedDay }: MealLogModalProps) {
  const [mealData, setMealData] = useState<MealLogData>({
    day: selectedDay,
    date: new Date().toISOString().split('T')[0],
    mealType: 'breakfast',
    mealName: '',
    description: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    completed: false
  });

  const mealTypes = [
    { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
    { id: 'lunch', label: 'Lunch', icon: '☀️' },
    { id: 'dinner', label: 'Dinner', icon: '🌆' },
    { id: 'snack', label: 'Snack', icon: '🍎' }
  ];

  const handleSave = () => {
    if (mealData.mealName && mealData.calories > 0) {
      onSave(mealData);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Log Alternative Meal</h2>
              <p className="text-gray-600 mt-1">Track what you actually ate</p>
            </div>
            <button
              onClick={onClose}
              className="p-3 hover:bg-gray-100 rounded-full transition-all duration-200"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Meal Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Meal Type</label>
            <div className="grid grid-cols-3 gap-3">
              {mealTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setMealData(prev => ({ ...prev, mealType: type.id as any }))}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                    mealData.mealType === type.id
                      ? 'border-[#c1272d] bg-red-50 text-[#c1272d]'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-1">{type.icon}</div>
                    <div className="text-sm font-medium">{type.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Meal Details */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Meal Name</label>
              <div className="relative">
                <Apple className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={mealData.mealName}
                  onChange={(e) => setMealData(prev => ({ ...prev, mealName: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c1272d] focus:border-transparent"
                  placeholder="e.g., Grilled Chicken Salad"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={mealData.description}
                onChange={(e) => setMealData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c1272d] focus:border-transparent"
                rows={2}
                placeholder="Brief description of the meal..."
              />
            </div>
          </div>

          {/* Nutrition Information */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Nutrition Information</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Calories</label>
                <div className="relative">
                  <Zap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    value={mealData.calories || ''}
                    onChange={(e) => setMealData(prev => ({ ...prev, calories: Number(e.target.value) }))}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c1272d] focus:border-transparent text-sm"
                    placeholder="400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Protein (g)</label>
                <input
                  type="number"
                  value={mealData.protein || ''}
                  onChange={(e) => setMealData(prev => ({ ...prev, protein: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c1272d] focus:border-transparent text-sm"
                  placeholder="25"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Carbs (g)</label>
                <input
                  type="number"
                  value={mealData.carbs || ''}
                  onChange={(e) => setMealData(prev => ({ ...prev, carbs: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c1272d] focus:border-transparent text-sm"
                  placeholder="30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fat (g)</label>
                <input
                  type="number"
                  value={mealData.fat || ''}
                  onChange={(e) => setMealData(prev => ({ ...prev, fat: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c1272d] focus:border-transparent text-sm"
                  placeholder="12"
                />
              </div>
            </div>
          </div>

          {/* Meal Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
            <textarea
              value={mealData.notes || ''}
              onChange={(e) => setMealData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c1272d] focus:border-transparent"
              rows={3}
              placeholder="How did this meal taste? Any observations about portion size or satisfaction?"
            />
          </div>

          {/* Completed Checkbox */}
          <div className="flex items-center space-x-3 mb-6">
            <input
              type="checkbox"
              id="completed"
              checked={mealData.completed}
              onChange={(e) => setMealData(prev => ({ ...prev, completed: e.target.checked }))}
              className="w-5 h-5 text-[#c1272d] border-2 border-gray-300 rounded focus:ring-[#c1272d]"
            />
            <label htmlFor="completed" className="text-sm font-medium text-gray-700">
              Mark meal as eaten
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-6 border-t border-gray-100 bg-gray-50">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!mealData.mealName || mealData.calories <= 0}
              className="flex-1 px-6 py-3 bg-[#c1272d] text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Log Meal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}