'use client';

// Utility function to round nutrition values to nearest 10
const roundToNearest10 = (value: number) => Math.round(value / 10) * 10;

import { useState, useMemo } from 'react';
import { X, Home, UtensilsCrossed, Filter, ArrowLeftRight } from 'lucide-react';

interface MealOption {
  id: string;
  day: string;
  mealType: string;
  option: 'primary' | 'alternative';
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'home' | 'restaurant';
  restaurantName?: string;
  cuisine?: string;
  estimatedPrice?: string;
  ingredients?: string[];
  description?: string;
}

interface MealSwapDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSwap: (selectedMeal: MealOption) => void;
  currentMeal: {
    day: string;
    mealType: string;
    name: string;
  };
  allMeals: MealOption[];
}

export function MealSwapDialog({
  isOpen,
  onClose,
  onSwap,
  currentMeal,
  allMeals,
}: MealSwapDialogProps) {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'home' | 'restaurant'>('all');
  const [restaurantFilter, setRestaurantFilter] = useState<string>('all');
  const [selectedMeal, setSelectedMeal] = useState<MealOption | null>(null);

  // Get unique restaurant names for filter dropdown
  const restaurantNames = useMemo(() => {
    const names = new Set<string>();
    allMeals.forEach(meal => {
      if (meal.restaurantName) {
        names.add(meal.restaurantName);
      }
    });
    return Array.from(names).sort();
  }, [allMeals]);

  // Filter meals based on current filters
  const filteredMeals = useMemo(() => {
    return allMeals.filter(meal => {
      // Source filter
      if (sourceFilter !== 'all' && meal.source !== sourceFilter) {
        return false;
      }

      // Restaurant filter (only applies when viewing restaurants)
      if (restaurantFilter !== 'all' && meal.restaurantName !== restaurantFilter) {
        return false;
      }

      return true;
    });
  }, [allMeals, sourceFilter, restaurantFilter]);

  // Group meals by day for better organization
  const mealsByDay = useMemo(() => {
    const grouped: Record<string, MealOption[]> = {};
    filteredMeals.forEach(meal => {
      if (!grouped[meal.day]) {
        grouped[meal.day] = [];
      }
      grouped[meal.day].push(meal);
    });
    return grouped;
  }, [filteredMeals]);

  const handleSwap = () => {
    if (selectedMeal) {
      onSwap(selectedMeal);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <ArrowLeftRight className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-gray-900 capitalize">
                  {currentMeal.day} {currentMeal.mealType}
                </h2>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                  SWAP
                </span>
              </div>
              <p className="text-sm text-gray-600 truncate max-w-md">
                {currentMeal.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Source Filter Pills */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setSourceFilter('all')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    sourceFilter === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSourceFilter('home')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                    sourceFilter === 'home'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  Home
                </button>
                <button
                  onClick={() => setSourceFilter('restaurant')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                    sourceFilter === 'restaurant'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                  Restaurant
                </button>
              </div>

              {/* Restaurant Dropdown */}
              {(sourceFilter === 'all' || sourceFilter === 'restaurant') && restaurantNames.length > 0 && (
                <select
                  value={restaurantFilter}
                  onChange={(e) => setRestaurantFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white hover:bg-gray-50 transition-colors"
                >
                  <option value="all">All Restaurants</option>
                  {restaurantNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Results count with icon */}
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              {filteredMeals.length} meals
            </div>
          </div>
        </div>

        {/* Meals Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredMeals.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No meals match your filters
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMeals.map(meal => (
                <MealPreviewCard
                  key={meal.id}
                  meal={meal}
                  isSelected={selectedMeal?.id === meal.id}
                  onSelect={() => setSelectedMeal(meal)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-white">
          <div className="flex items-center justify-between">
            {selectedMeal ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate max-w-48">
                    {selectedMeal.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {roundToNearest10(selectedMeal.calories)} cal • {selectedMeal.source === 'restaurant' ? selectedMeal.restaurantName : 'Home'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-dashed rounded-full"></div>
                <span className="text-sm">Select a meal to swap</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSwap}
                disabled={!selectedMeal}
                className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  selectedMeal
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                Swap
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Meal Preview Card Component (inline for now, can extract later)
function MealPreviewCard({
  meal,
  isSelected,
  onSelect,
}: {
  meal: MealOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative overflow-hidden rounded-xl border-2 text-left transition-all transform hover:scale-[1.02] ${
        isSelected
          ? 'border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg scale-[1.02]'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md'
      }`}
    >
      {/* Selection indicator overlay */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}

      <div className="p-4">
        {/* Header with source badge and meal info */}
        <div className="flex items-start justify-between mb-3">
          <div className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
            meal.source === 'restaurant'
              ? 'bg-orange-500 text-white'
              : 'bg-blue-500 text-white'
          }`}>
            {meal.source === 'restaurant' ? (
              <>
                <UtensilsCrossed className="w-3 h-3" />
                <span className="truncate max-w-20">{meal.restaurantName || 'Restaurant'}</span>
              </>
            ) : (
              <>
                <Home className="w-3 h-3" />
                Home
              </>
            )}
          </div>
          <span className="text-xs text-gray-500 capitalize bg-gray-100 px-2 py-1 rounded">
            {meal.day.slice(0, 3)} • {meal.mealType.slice(0, 1).toUpperCase()}
          </span>
        </div>

        {/* Meal Name */}
        <h4 className="font-semibold text-gray-900 mb-3 line-clamp-2 leading-tight">
          {meal.name}
        </h4>

        {/* Calories prominently displayed */}
        <div className="flex items-center justify-between mb-2">
          <div className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg">
            <span className="text-sm font-bold">{roundToNearest10(meal.calories)}</span>
            <span className="text-xs ml-1">cal</span>
          </div>

          {/* Price for restaurant meals */}
          {meal.source === 'restaurant' && meal.estimatedPrice && (
            <div className="text-orange-600 font-semibold text-sm">
              {meal.estimatedPrice}
            </div>
          )}
        </div>

        {/* Compact Macros */}
        <div className="flex gap-1">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
            P {roundToNearest10(meal.protein)}g
          </span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
            C {roundToNearest10(meal.carbs)}g
          </span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
            F {roundToNearest10(meal.fat)}g
          </span>
        </div>
      </div>
    </button>
  );
}