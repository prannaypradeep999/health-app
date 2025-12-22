'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  X,
  MapPin,
  Star,
  ExternalLink,
  Phone,
  Clock,
  CheckCircle,
  Circle,
  Truck,
  Home,
  DollarSign,
  ShoppingCart,
  UtensilsCrossed,
  Minimize2,
  Maximize2,
  Sparkles,
  ChefHat,
  Target,
  Heart
} from 'lucide-react';

interface Restaurant {
  name: string;
  cuisine: string;
  rating: number;
  address: string;
  city: string;
  phone?: string;
  website?: string;
  orderingLinks: {
    doordash?: string;
    ubereats?: string;
    grubhub?: string;
    direct?: string;
  };
  distance?: number;
  estimatedOrderTime: string;
  sampleMenuItems: string[];
  linksFound: number;
  error?: string;
}

interface GroceryItem {
  name: string;
  quantity: string;
  estimatedCost: number;
  uses: string;
}

interface GroceryList {
  proteins: GroceryItem[];
  vegetables: GroceryItem[];
  grains: GroceryItem[];
  dairy?: GroceryItem[];
  pantryStaples?: GroceryItem[];
  snacks?: GroceryItem[];
  totalEstimatedCost: number;
  weeklyBudgetUsed: string;
  error?: string;
}

interface PreviewData {
  restaurants: Restaurant[];
  groceryList: GroceryList;
  metadata: {
    generatedFor: string;
    location: string;
    goal: string;
    cuisines: string[];
    generatedAt: string;
    totalGenerationTime: number;
  };
  explanations?: {
    restaurantChoices: string;
    groceryChoices: string;
    nutritionStrategy: string;
  };
}

interface MealPlanningPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  data: PreviewData | null;
  loading: boolean;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  showGenerationProgress?: boolean;
  generationStep?: 'restaurants' | 'meals' | 'complete';
}

export function MealPlanningPreview({
  isOpen,
  onClose,
  onApprove,
  data,
  loading,
  isMinimized = false,
  onMinimize,
  onMaximize,
  showGenerationProgress = false,
  generationStep = 'restaurants'
}: MealPlanningPreviewProps) {
  const [activeTab, setActiveTab] = useState<'restaurants' | 'grocery'>('restaurants');
  const [checkedGroceryItems, setCheckedGroceryItems] = useState<Set<string>>(new Set());

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('restaurants');
      setCheckedGroceryItems(new Set());
    }
  }, [isOpen]);

  const toggleGroceryItem = (category: string, index: number) => {
    const itemKey = `${category}-${index}`;
    setCheckedGroceryItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  };

  const isGroceryItemChecked = (category: string, index: number) => {
    return checkedGroceryItems.has(`${category}-${index}`);
  };

  const openOrderingLink = (url: string, platform: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  if (!isOpen) return null;

  // Minimized state - show as floating badge
  if (isMinimized) {
    return (
      <div className="fixed bottom-20 right-6 z-50">
        <button
          onClick={onMaximize}
          className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 hover:shadow-2xl transition-all duration-300 group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900">Planning Preview</p>
              <p className="text-xs text-gray-600">Tap to view</p>
            </div>
            <Maximize2 className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden border border-gray-100 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 bg-gradient-to-r from-white to-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  🍽️ Your Meal Planning Preview
                </h2>
                {data && (
                  <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#c1272d]" />
                    For {data.metadata.generatedFor} • {data.metadata.location}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  title="Minimize"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mt-4">
            <button
              onClick={() => setActiveTab('restaurants')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'restaurants'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              Restaurants ({data?.restaurants?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('grocery')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'grocery'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Grocery List (${data?.groceryList?.totalEstimatedCost?.toFixed(2) || '0.00'})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading || showGenerationProgress ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 bg-gradient-to-r from-red-50 to-purple-50 rounded-full flex items-center justify-center mb-6 shadow-lg">
                <div className="w-10 h-10 border-4 border-[#c1272d] border-t-transparent rounded-full animate-spin"></div>
              </div>

              {showGenerationProgress ? (
                <div className="text-center space-y-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {generationStep === 'restaurants' && '🏪 Generating Restaurant Dishes...'}
                    {generationStep === 'meals' && '🍳 Creating Your Meal Plan...'}
                    {generationStep === 'complete' && '✅ Almost Ready!'}
                  </h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className={`flex items-center justify-center space-x-2 ${generationStep === 'restaurants' ? 'text-[#c1272d] font-medium' : ''}`}>
                      <div className={`w-2 h-2 rounded-full ${generationStep === 'restaurants' ? 'bg-[#c1272d] animate-pulse' : 'bg-green-500'}`}></div>
                      <span>Finding the perfect restaurants for your goals</span>
                    </div>
                    <div className={`flex items-center justify-center space-x-2 ${generationStep === 'meals' ? 'text-[#c1272d] font-medium' : ''}`}>
                      <div className={`w-2 h-2 rounded-full ${generationStep === 'meals' ? 'bg-[#c1272d] animate-pulse' : generationStep === 'complete' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <span>Creating meals with these ingredients</span>
                    </div>
                    <div className={`flex items-center justify-center space-x-2 ${generationStep === 'complete' ? 'text-green-600 font-medium' : ''}`}>
                      <div className={`w-2 h-2 rounded-full ${generationStep === 'complete' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                      <span>Finalizing your personalized plan</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Analyzing Your Preferences</h3>
                  <p className="text-gray-600 mb-4">
                    Finding restaurants and planning your grocery list...
                  </p>
                  <div className="flex justify-center space-x-1">
                    <div className="w-2 h-2 bg-[#c1272d] rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-[#c1272d] rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-[#c1272d] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              )}
            </div>
          ) : !data ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Failed to load preview data. Please try again.</p>
            </div>
          ) : (
            <>
              {/* Explanations Section - Only show if we have explanations */}
              {data.explanations && (
                <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Heart className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900 text-sm mb-2">Why We Chose This For You</h4>
                      <div className="text-sm text-gray-700 space-y-2">
                        {activeTab === 'restaurants' && data.explanations.restaurantChoices && (
                          <p>{data.explanations.restaurantChoices}</p>
                        )}
                        {activeTab === 'grocery' && data.explanations.groceryChoices && (
                          <p>{data.explanations.groceryChoices}</p>
                        )}
                        {data.explanations.nutritionStrategy && (
                          <p className="text-xs text-blue-600 font-medium">
                            <ChefHat className="w-3 h-3 inline mr-1" />
                            {data.explanations.nutritionStrategy}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Restaurants Tab */}
              {activeTab === 'restaurants' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-[#c1272d] to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                        <UtensilsCrossed className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          Curated Restaurants ({data.restaurants.length})
                        </h3>
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Target className="w-4 h-4 text-[#c1272d]" />
                          Handpicked for your {data.metadata.goal?.toLowerCase()} journey
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-gradient-to-r from-[#c1272d] to-red-600 text-white border-0 shadow-md">
                        {data.metadata.cuisines.join(' • ')} cuisines
                      </Badge>
                    </div>
                  </div>

                  {data.restaurants.length === 0 ? (
                    <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-red-50 rounded-2xl border border-gray-200">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <Home className="w-8 h-8 text-gray-400" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">No restaurants found nearby</h4>
                      <p className="text-gray-600">Don't worry! We'll focus on amazing home-cooked meals instead.</p>
                    </div>
                  ) : (
                    <div className="grid gap-6">
                      {data.restaurants.map((restaurant, index) => (
                        <div key={index} className="group relative bg-white border border-gray-200 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
                          {/* Gradient accent bar */}
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6]"></div>

                          <div className="p-6">
                            <div className="flex items-start space-x-4">
                              {/* Restaurant icon/avatar */}
                              <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm border border-gray-200">
                                <UtensilsCrossed className="w-8 h-8 text-gray-600" />
                              </div>

                              <div className="flex-1 min-w-0">
                                {/* Restaurant header */}
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <h4 className="text-lg font-bold text-gray-900 mb-1">{restaurant.name}</h4>
                                    <div className="flex items-center gap-3 text-sm mb-2">
                                      <Badge variant="outline" className="bg-[#c1272d]/10 text-[#c1272d] border-[#c1272d]/20 font-medium">
                                        {restaurant.cuisine}
                                      </Badge>
                                      <div className="flex items-center gap-1 text-amber-600">
                                        <Star className="w-4 h-4 fill-current" />
                                        <span className="font-semibold">{restaurant.rating}</span>
                                      </div>
                                      {restaurant.distance && (
                                        <div className="flex items-center gap-1 text-gray-600">
                                          <MapPin className="w-4 h-4" />
                                          <span>{restaurant.distance}mi away</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                                    <Clock className="w-4 h-4 text-green-600" />
                                    <span className="text-sm font-medium text-green-700">{restaurant.estimatedOrderTime}</span>
                                  </div>
                                </div>

                                {/* Address with enhanced styling */}
                                <div className="bg-gray-50 rounded-lg p-3 mb-4 border border-gray-200">
                                  <p className="text-sm text-gray-700 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-gray-500" />
                                    {restaurant.address}, {restaurant.city}
                                  </p>
                                </div>

                                {/* Sample menu items */}
                                {restaurant.sampleMenuItems && restaurant.sampleMenuItems.length > 0 && (
                                  <div className="mb-4">
                                    <h5 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                                      <ChefHat className="w-4 h-4 text-[#8b5cf6]" />
                                      Popular dishes
                                    </h5>
                                    <div className="flex flex-wrap gap-2">
                                      {restaurant.sampleMenuItems.slice(0, 3).map((item, idx) => (
                                        <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">
                                          {item}
                                        </span>
                                      ))}
                                      {restaurant.sampleMenuItems.length > 3 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                                          +{restaurant.sampleMenuItems.length - 3} more
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Enhanced Ordering Links */}
                                <div className="space-y-3">
                                  <h5 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                    <Truck className="w-4 h-4 text-[#c1272d]" />
                                    Order from ({restaurant.linksFound} platforms found)
                                  </h5>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {restaurant.orderingLinks.doordash && (
                                      <Button
                                        size="sm"
                                        onClick={() => openOrderingLink(restaurant.orderingLinks.doordash!, 'DoorDash')}
                                        className="bg-red-500 hover:bg-red-600 text-white border-0 shadow-md transition-all duration-200 hover:scale-105"
                                      >
                                        <Truck className="w-4 h-4 mr-2" />
                                        DoorDash
                                      </Button>
                                    )}
                                    {restaurant.orderingLinks.ubereats && (
                                      <Button
                                        size="sm"
                                        onClick={() => openOrderingLink(restaurant.orderingLinks.ubereats!, 'Uber Eats')}
                                        className="bg-green-600 hover:bg-green-700 text-white border-0 shadow-md transition-all duration-200 hover:scale-105"
                                      >
                                        <Truck className="w-4 h-4 mr-2" />
                                        Uber Eats
                                      </Button>
                                    )}
                                    {restaurant.orderingLinks.grubhub && (
                                      <Button
                                        size="sm"
                                        onClick={() => openOrderingLink(restaurant.orderingLinks.grubhub!, 'GrubHub')}
                                        className="bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-md transition-all duration-200 hover:scale-105"
                                      >
                                        <Truck className="w-4 h-4 mr-2" />
                                        GrubHub
                                      </Button>
                                    )}
                                    {restaurant.orderingLinks.direct && (
                                      <Button
                                        size="sm"
                                        onClick={() => openOrderingLink(restaurant.orderingLinks.direct!, 'Direct')}
                                        className="bg-[#8b5cf6] hover:bg-purple-700 text-white border-0 shadow-md transition-all duration-200 hover:scale-105"
                                      >
                                        <Home className="w-4 h-4 mr-2" />
                                        Direct
                                      </Button>
                                    )}
                                    {restaurant.phone && (
                                      <Button
                                        size="sm"
                                        onClick={() => window.open(`tel:${restaurant.phone}`, '_blank')}
                                        className="bg-gray-600 hover:bg-gray-700 text-white border-0 shadow-md transition-all duration-200 hover:scale-105"
                                      >
                                        <Phone className="w-4 h-4 mr-2" />
                                        Call
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                {restaurant.error && (
                                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-sm text-amber-800 flex items-center gap-2">
                                      <span className="text-amber-600">⚠️</span>
                                      {restaurant.error}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Grocery List Tab */}
              {activeTab === 'grocery' && (
                <div className="space-y-6">
                  {/* Enhanced Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                        <ShoppingCart className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          Smart Grocery List
                        </h3>
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Target className="w-4 h-4 text-green-600" />
                          AI-optimized ingredients for your {data.metadata.goal?.toLowerCase()} goals
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Budget Overview Card */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 shadow-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                          <DollarSign className="w-5 h-5 text-green-600" />
                          Weekly Budget Breakdown
                        </h4>
                        <p className="text-sm text-gray-600">Estimated costs for this week's groceries</p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-green-600 mb-1">
                          ${data.groceryList.totalEstimatedCost?.toFixed(2)}
                        </div>
                        <Badge className="bg-green-100 text-green-700 border border-green-300 text-sm font-medium">
                          {data.groceryList.weeklyBudgetUsed} of budget
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Category Cards Grid */}
                  <div className="grid gap-6">
                    {Object.entries(data.groceryList).map(([category, items]) => {
                      if (!Array.isArray(items) || category === 'totalEstimatedCost' || category === 'weeklyBudgetUsed') return null;

                      const categoryIcons = {
                        proteins: { emoji: '🥩', color: 'from-red-500 to-pink-600', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700' },
                        vegetables: { emoji: '🥬', color: 'from-green-500 to-emerald-600', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700' },
                        grains: { emoji: '🌾', color: 'from-amber-500 to-orange-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-700' },
                        dairy: { emoji: '🥛', color: 'from-blue-500 to-cyan-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-700' },
                        pantryStaples: { emoji: '🧂', color: 'from-purple-500 to-violet-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', textColor: 'text-purple-700' },
                        snacks: { emoji: '🥜', color: 'from-pink-500 to-rose-600', bgColor: 'bg-pink-50', borderColor: 'border-pink-200', textColor: 'text-pink-700' }
                      };

                      const categoryInfo = categoryIcons[category] || categoryIcons.pantryStaples;
                      const categoryTotal = items.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);

                      return (
                        <div key={category} className={`bg-white border-2 ${categoryInfo.borderColor} rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group`}>
                          {/* Category header */}
                          <div className={`${categoryInfo.bgColor} border-b ${categoryInfo.borderColor} px-6 py-4`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className={`w-10 h-10 bg-gradient-to-r ${categoryInfo.color} rounded-xl flex items-center justify-center shadow-md`}>
                                  <span className="text-lg">{categoryInfo.emoji}</span>
                                </div>
                                <div>
                                  <h4 className={`text-lg font-bold ${categoryInfo.textColor} capitalize`}>
                                    {category.replace(/([A-Z])/g, ' $1')}
                                  </h4>
                                  <p className="text-sm text-gray-600">{items.length} essential items</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-xl font-bold ${categoryInfo.textColor}`}>
                                  ${categoryTotal.toFixed(2)}
                                </div>
                                <p className="text-xs text-gray-500">category total</p>
                              </div>
                            </div>
                          </div>

                          {/* Items list */}
                          <div className="p-6">
                            <div className="space-y-4">
                              {items.map((item: GroceryItem, index: number) => (
                                <div
                                  key={index}
                                  className={`group/item relative bg-white border-2 rounded-xl p-4 transition-all duration-300 hover:shadow-md ${
                                    isGroceryItemChecked(category, index)
                                      ? 'border-green-200 bg-green-50'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-start gap-4">
                                    {/* Checkbox */}
                                    <button
                                      onClick={() => toggleGroceryItem(category, index)}
                                      className="flex-shrink-0 mt-1 transition-transform duration-200 hover:scale-110"
                                    >
                                      {isGroceryItemChecked(category, index) ? (
                                        <CheckCircle className="w-6 h-6 text-green-600 drop-shadow-sm" />
                                      ) : (
                                        <Circle className="w-6 h-6 text-gray-400 group-hover/item:text-gray-600" />
                                      )}
                                    </button>

                                    <div className={`flex-1 transition-all duration-300 ${
                                      isGroceryItemChecked(category, index) ? 'opacity-60' : ''
                                    }`}>
                                      {/* Item header */}
                                      <div className="flex items-start justify-between mb-2">
                                        <h5 className={`font-bold text-gray-900 ${
                                          isGroceryItemChecked(category, index) ? 'line-through' : ''
                                        }`}>
                                          {item.name}
                                        </h5>
                                        <div className="text-right">
                                          <span className={`text-lg font-bold ${
                                            isGroceryItemChecked(category, index) ? 'text-green-600 line-through' : 'text-gray-900'
                                          }`}>
                                            ${item.estimatedCost?.toFixed(2)}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Quantity */}
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                                          categoryInfo.bgColor
                                        } ${categoryInfo.textColor} border ${categoryInfo.borderColor}`}>
                                          <span className="mr-1">📎</span>
                                          {item.quantity}
                                        </div>
                                      </div>

                                      {/* Uses */}
                                      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-3 ${
                                        isGroceryItemChecked(category, index) ? 'opacity-60' : ''
                                      }`}>
                                        <p className="text-sm text-gray-700 leading-relaxed flex items-start gap-2">
                                          <span className="text-[#8b5cf6] text-xs">✨</span>
                                          <span className="italic">"{item.uses}"</span>
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Checked overlay indicator */}
                                  {isGroceryItemChecked(category, index) && (
                                    <div className="absolute top-2 right-2">
                                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                                        <CheckCircle className="w-4 h-4 text-white" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Error handling */}
                  {data.groceryList.error && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-6 shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-amber-600">⚠️</span>
                        </div>
                        <div>
                          <h4 className="font-semibold text-amber-900 mb-1">Planning Note</h4>
                          <p className="text-amber-800 text-sm leading-relaxed">
                            {data.groceryList.error}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !showGenerationProgress && data && (
          <div className="border-t border-gray-200 p-6 bg-gradient-to-r from-white to-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 space-y-1">
                <p className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Generated in {(data.metadata.totalGenerationTime / 1000).toFixed(1)}s
                </p>
                <p className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Goal: {data.metadata.goal?.replace('_', ' ').toLowerCase()}
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="border-gray-300 hover:border-gray-400"
                >
                  Review Later
                </Button>
                <Button
                  onClick={onApprove}
                  className="bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] hover:from-[#a1232a] hover:to-[#7c3aed] text-white font-bold shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Perfect! Generate My Plan
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}