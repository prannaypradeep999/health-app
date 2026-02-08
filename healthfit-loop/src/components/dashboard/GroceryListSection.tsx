'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  Circle,
  ShoppingCart,
  MapPin,
  Star,
  Fish,
  Carrot,
  Bread,
  Drop,
  Package,
  Cookie,
  Copy,
  FileText,
  Warning
} from '@phosphor-icons/react';

// Type definitions
interface StoreOption {
  store: string;
  displayName: string;
  price: number;
  isRecommended: boolean;
  reason?: string;
  storeAddress?: string;  // Street address only (e.g., "123 Main St")
  priceConfidence?: 'exact' | 'estimate';  // Whether this is an exact price or estimate
}

interface GroceryItemWithPrices {
  item?: string;
  name?: string;  // Legacy field
  quantity: string;
  uses?: string;
  category?: string;
  storeOptions?: StoreOption[];
  estimatedCost?: number;  // Legacy field
  usedInMeals?: { day: string; meal: string; dishName: string }[];
  firstUseDay?: string;
  perishability?: 'high' | 'medium' | 'low';
}

interface GroceryStore {
  name: string;
  address: string;
  distance?: string;
  type: 'budget' | 'mid-range' | 'premium';
}

interface GroceryList {
  proteins?: GroceryItemWithPrices[];
  vegetables?: GroceryItemWithPrices[];
  grains?: GroceryItemWithPrices[];
  dairy?: GroceryItemWithPrices[];
  pantryStaples?: GroceryItemWithPrices[];
  snacks?: GroceryItemWithPrices[];
  stores?: GroceryStore[];
  storeTotals?: { store: string; total: number }[];
  recommendedStore?: string;
  savings?: string;
  location?: string;
  pricesUpdatedAt?: string;
  priceSearchSuccess?: boolean;
  priceError?: string;
  totalEstimatedCost?: number;   // Legacy
  weeklyBudgetUsed?: string;     // Legacy
  error?: string;
}

interface GroceryListSectionProps {
  groceryList: GroceryList;
  onItemToggle?: (category: string, index: number) => void;
  checkedItems?: { [key: string]: boolean };
}

// Category configuration
const categoryConfigs = {
  proteins: {
    icon: Fish,
    label: 'Proteins',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700'
  },
  vegetables: {
    icon: Carrot,
    label: 'Vegetables',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700'
  },
  grains: {
    icon: Bread,
    label: 'Grains',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700'
  },
  dairy: {
    icon: Drop,
    label: 'Dairy',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700'
  },
  pantryStaples: {
    icon: Package,
    label: 'Pantry',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700'
  },
  snacks: {
    icon: Cookie,
    label: 'Snacks',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    textColor: 'text-pink-700'
  }
};

export function GroceryListSection({
  groceryList,
  onItemToggle = () => {},
  checkedItems = {}
}: GroceryListSectionProps) {

  // Debug logging
  console.log('[GROCERY-SECTION] 📦 Received groceryList:', {
    hasGroceryList: !!groceryList,
    hasStores: !!groceryList?.stores,
    storesCount: groceryList?.stores?.length || 0,
    storeNames: groceryList?.stores?.map(s => s.name) || [],
    priceSearchSuccess: groceryList?.priceSearchSuccess,
    priceError: groceryList?.priceError,
    hasStoreTotals: !!groceryList?.storeTotals,
    storeTotalsCount: groceryList?.storeTotals?.length || 0,
    totalEstimatedCost: groceryList?.totalEstimatedCost,
    recommendedStore: groceryList?.recommendedStore,
    location: groceryList?.location,
    error: groceryList?.error
  });

  // Log category items
  ['proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'snacks'].forEach(cat => {
    const items = groceryList?.[cat as keyof GroceryList];
    if (Array.isArray(items) && items.length > 0) {
      console.log(`[GROCERY-SECTION] 📋 ${cat}:`, items.length, 'items');
    }
  });

  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'all' | 'next3days' | 'perishable'>('all');
  const [sortBy, setSortBy] = useState<'category' | 'day' | 'perishability'>('category');

  // Check if we have real prices (stores + successful price lookup)
  const hasRealPrices = !!(
    groceryList?.stores &&
    groceryList.stores.length > 0 &&
    groceryList.priceSearchSuccess === true &&
    groceryList.storeTotals &&
    groceryList.storeTotals.length > 0
  );

  console.log('[GROCERY-SECTION] 💰 Price availability check:', {
    hasRealPrices,
    hasStores: !!groceryList?.stores && groceryList.stores.length > 0,
    priceSearchSuccess: groceryList?.priceSearchSuccess,
    hasStoreTotals: !!groceryList?.storeTotals && groceryList.storeTotals.length > 0
  });

  // Check if we have stores but prices failed
  const hasStoresNoPrices = !!(
    groceryList?.stores &&
    groceryList.stores.length > 0 &&
    groceryList.priceSearchSuccess === false
  );

  // Loading/Error state
  if (!groceryList || groceryList.error) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
        <div className="p-8 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" weight="regular" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Grocery List Unavailable</h3>
          <p className="text-gray-600">
            {groceryList?.error || 'Your grocery list is being generated. Please check back soon.'}
          </p>
        </div>
      </div>
    );
  }

  // Get all categories with items
  const availableCategories = Object.keys(categoryConfigs).filter(key => {
    const items = groceryList[key as keyof typeof categoryConfigs];
    return Array.isArray(items) && items.length > 0;
  });

  // Get total item count
  const totalItems = availableCategories.reduce((total, category) => {
    const items = groceryList[category as keyof GroceryList] as GroceryItemWithPrices[];
    return total + (items?.length || 0);
  }, 0);

  // Get checked items count
  const checkedItemsCount = Object.values(checkedItems).filter(Boolean).length;

  // Get all items flattened with category info
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const formatDayLabel = (day?: string) => {
    if (!day) return '';
    return `${day.charAt(0).toUpperCase()}${day.slice(1)}`;
  };
  const getDayIndex = (day?: string) => {
    if (!day) return 999;
    const index = dayOrder.indexOf(day.toLowerCase());
    return index === -1 ? 999 : index;
  };

  const allItems = useMemo((): (GroceryItemWithPrices & { category: string; index: number })[] => {
    const items: (GroceryItemWithPrices & { category: string; index: number })[] = [];
    availableCategories.forEach(category => {
      const categoryItems = groceryList[category as keyof GroceryList] as GroceryItemWithPrices[];
      categoryItems?.forEach((item, index) => {
        items.push({ ...item, category, index });
      });
    });
    return items;
  }, [availableCategories, groceryList]);

  const next3Days = useMemo(() => {
    const today = new Date();
    const todayIndex = (today.getDay() + 6) % 7; // Monday = 0
    return Array.from({ length: 3 }, (_, i) => dayOrder[(todayIndex + i) % 7]);
  }, [dayOrder]);

  const filteredItems = useMemo(() => {
    let items = selectedCategory === 'all'
      ? [...allItems]
      : allItems.filter(item => item.category === selectedCategory);

    if (viewMode === 'next3days') {
      items = items.filter(item => item.firstUseDay && next3Days.includes(item.firstUseDay));
    } else if (viewMode === 'perishable') {
      items = items.filter(item => item.perishability === 'high');
    }

    if (sortBy === 'day') {
      items.sort((a, b) => getDayIndex(a.firstUseDay) - getDayIndex(b.firstUseDay));
    } else if (sortBy === 'perishability') {
      const perishOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      items.sort((a, b) => (perishOrder[a.perishability || 'low'] ?? 3) - (perishOrder[b.perishability || 'low'] ?? 3));
    }

    return items;
  }, [allItems, selectedCategory, viewMode, sortBy, next3Days]);

  // Get recommended store total
  const recommendedTotal = hasRealPrices && groceryList.storeTotals
    ? groceryList.storeTotals.find(s => s.store === groceryList.recommendedStore)?.total
    : undefined;

  // Copy list to clipboard
  const copyList = () => {
    let text = `Grocery List`;
    if (groceryList.location) text += ` - ${groceryList.location}`;
    if (groceryList.recommendedStore) text += `\nBest Store: ${groceryList.recommendedStore}`;
    text += '\n\n';

    filteredItems.forEach(item => {
      const itemName = item.item || item.name || 'Unknown item';
      const bestOption = item.storeOptions?.find(o => o.isRecommended);
      const firstUse = item.firstUseDay && item.firstUseDay !== 'unknown'
        ? ` | first used: ${formatDayLabel(item.firstUseDay)}`
        : '';
      const perish = item.perishability ? ` | ${item.perishability} perishability` : '';
      text += `• ${itemName} (${item.quantity})${firstUse}${perish}`;
      if (bestOption) {
        text += ` - $${bestOption.price.toFixed(2)} at ${bestOption.store}`;
      }
      text += '\n';
    });

    if (recommendedTotal) {
      text += `\nTotal: $${recommendedTotal.toFixed(2)}`;
    }

    navigator.clipboard.writeText(text);
  };

  const shoppingSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    const highPerishables = allItems.filter(item => item.perishability === 'high');
    const lateHighPerishables = highPerishables.filter(item => {
      const index = getDayIndex(item.firstUseDay);
      return index >= dayOrder.indexOf('thursday') && index <= dayOrder.indexOf('sunday');
    });

    if (lateHighPerishables.length > 0) {
      const names = lateHighPerishables
        .map(item => item.item || item.name || 'item')
        .filter(Boolean);
      suggestions.push(
        `💡 Consider a mid-week shopping trip for: ${names.join(', ')}`
      );
    }

    return suggestions;
  }, [allItems, dayOrder]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
              <ShoppingCart className="w-5 h-5 text-white" weight="regular" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Smart Grocery List</h3>
              {groceryList.location ? (
                <p className="text-sm text-gray-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {groceryList.location}
                </p>
              ) : (
                <p className="text-sm text-gray-600">{totalItems} items to buy</p>
              )}
            </div>
          </div>

          {/* Total - only show if we have real prices */}
          {hasRealPrices && recommendedTotal && (
            <div className="text-left sm:text-right">
              <div className="text-xl sm:text-2xl font-bold text-green-600">
                ${recommendedTotal.toFixed(2)}
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <Star className="w-4 h-4 text-yellow-500" weight="fill" />
                <span>at {groceryList.recommendedStore}</span>
              </div>
              {groceryList.savings && (
                <Badge className="bg-green-100 text-green-700 border border-green-300 text-xs font-medium mt-1">
                  {groceryList.savings}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Store selector pills - only show if we have real prices */}
        {hasRealPrices && groceryList.stores && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => setSelectedStore('all')}
              className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                selectedStore === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              Compare All
            </button>
            {groceryList.stores.map(store => {
              const storeTotal = groceryList.storeTotals?.find(s => s.store === store.name);
              const isRecommended = store.name === groceryList.recommendedStore;
              return (
                <button
                  key={store.name}
                  onClick={() => setSelectedStore(store.name)}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 ${
                    selectedStore === store.name
                      ? 'bg-green-600 text-white'
                      : isRecommended
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {isRecommended && <Star className="w-3 h-3" weight="fill" />}
                  <span className="truncate max-w-[100px]">{store.name}</span>
                  {storeTotal && <span>${storeTotal.total.toFixed(0)}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Message when stores found but prices failed */}
        {hasStoresNoPrices && groceryList.stores && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <Warning className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" weight="fill" />
            <div>
              <p className="text-sm text-amber-800">
                <span className="font-medium">Stores near you:</span>{' '}
                {groceryList.stores.map(s => s.name).join(', ')}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Price comparison temporarily unavailable. Your shopping list is below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Category Filter Pills */}
      <div className="px-4 sm:px-6 py-3 border-b border-gray-100 overflow-x-auto">
        <div className="flex space-x-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center ${
              selectedCategory === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <ShoppingCart className="w-4 h-4 mr-1" weight="regular" />
            All ({totalItems})
          </button>

          {availableCategories.map(category => {
            const config = categoryConfigs[category as keyof typeof categoryConfigs];
            const items = groceryList[category as keyof GroceryList] as GroceryItemWithPrices[];
            if (!config || !items) return null;

            const IconComponent = config.icon;
            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center ${
                  selectedCategory === category
                    ? `${config.bgColor} ${config.textColor} ${config.borderColor} border`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <IconComponent className="w-4 h-4 mr-1" weight="regular" />
                {config.label} ({items.length})
              </button>
            );
          })}
        </div>
      </div>

      {/* View + Sort Controls */}
      <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
              viewMode === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => setViewMode('next3days')}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
              viewMode === 'next3days' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Next 3 Days
          </button>
          <button
            onClick={() => setViewMode('perishable')}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
              viewMode === 'perishable' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🥩 Perishables First
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort by</span>
          <button
            onClick={() => setSortBy('category')}
            className={`px-2 py-1 rounded text-xs ${sortBy === 'category' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Category
          </button>
          <button
            onClick={() => setSortBy('day')}
            className={`px-2 py-1 rounded text-xs ${sortBy === 'day' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Day
          </button>
          <button
            onClick={() => setSortBy('perishability')}
            className={`px-2 py-1 rounded text-xs ${sortBy === 'perishability' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Perishability
          </button>
        </div>
      </div>

      {shoppingSuggestions.length > 0 && (
        <div className="px-4 sm:px-6 py-3 border-b border-amber-100 bg-amber-50">
          {shoppingSuggestions.map((suggestion, index) => (
            <p key={index} className="text-sm text-amber-800">{suggestion}</p>
          ))}
        </div>
      )}

      {/* Items List */}
      <div className="p-4 sm:p-6 space-y-4 max-h-[500px] overflow-y-auto">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const itemKey = `${item.category}-${item.index}`;
            const isChecked = checkedItems[itemKey] || false;
            const config = categoryConfigs[item.category as keyof typeof categoryConfigs];
            const itemName = item.item || item.name || 'Unknown item';
            const usageLabel = item.uses || (
              item.usedInMeals && item.usedInMeals.length > 0
                ? item.usedInMeals
                    .slice(0, 3)
                    .map(usage => `${formatDayLabel(usage.day)} ${usage.meal}`)
                    .join(', ')
                : ''
            );

            // Get store options if available
            const storeOptions: StoreOption[] = item.storeOptions || [];

            // Filter by selected store if not "all"
            const displayOptions = selectedStore === 'all'
              ? storeOptions
              : storeOptions.filter(o => o.store === selectedStore);

            const IconComponent = config?.icon || ShoppingCart;

            return (
              <div
                key={itemKey}
                className={`rounded-xl transition-all duration-200 overflow-hidden ${
                  isChecked
                    ? 'bg-green-50 border-2 border-green-200'
                    : 'bg-gray-50 hover:bg-gray-100 border-2 border-gray-200'
                }`}
              >
                {/* Item Header */}
                <div className="flex items-center justify-between p-3 sm:p-4">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <button
                      onClick={() => onItemToggle(item.category, item.index)}
                      className="transition-transform duration-200 hover:scale-110 flex-shrink-0"
                    >
                      {isChecked ? (
                        <CheckCircle className="w-6 h-6 text-green-600" weight="fill" />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-400 hover:text-gray-600" weight="regular" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <IconComponent className="w-4 h-4 text-gray-500 flex-shrink-0" weight="regular" />
                        <p className={`font-semibold ${isChecked ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                          {itemName}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {item.quantity}
                        </Badge>
                      {item.perishability === 'high' && (
                        <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200">
                          Use within 2-3 days
                        </Badge>
                      )}
                      {item.perishability === 'medium' && (
                        <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border border-yellow-200">
                          Use within 5-7 days
                        </Badge>
                      )}
                      </div>
                    {usageLabel && (
                        <p className={`text-xs mt-1 ${isChecked ? 'text-green-600' : 'text-gray-500'}`}>
                        Used in: {usageLabel}
                        </p>
                      )}
                    {item.firstUseDay && item.firstUseDay !== 'unknown' && (
                      <p className={`text-xs mt-1 ${isChecked ? 'text-green-600' : 'text-gray-500'}`}>
                        First used: {formatDayLabel(item.firstUseDay)}
                      </p>
                    )}
                    </div>
                  </div>
                </div>

                {/* Store Price Comparison - Desktop Table */}
                {hasRealPrices && selectedStore === 'all' && storeOptions.length > 1 && (
                  <div className="hidden sm:block border-t border-gray-200 bg-white">
                    <div className="grid grid-cols-3 divide-x divide-gray-200">
                      {storeOptions.slice(0, 3).map((option, optIdx) => (
                        <div
                          key={optIdx}
                          className={`p-3 text-center ${option.isRecommended ? 'bg-green-50' : ''}`}
                        >
                          <p className="text-xs text-gray-500 mb-1 truncate">{option.store}</p>
                          {option.storeAddress && (
                            <p className="text-[10px] text-gray-400 mb-1 truncate">{option.storeAddress}</p>
                          )}
                          <div className="flex items-center justify-center gap-1">
                            <p className={`font-bold ${option.isRecommended ? 'text-green-600' : 'text-gray-900'}`}>
                              {option.priceConfidence === 'estimate' ? '~' : ''}${option.price.toFixed(2)}
                              {option.isRecommended && <Star className="w-3 h-3 inline ml-1 text-yellow-500" weight="fill" />}
                            </p>
                          </div>
                          <p className="text-xs text-gray-600 truncate" title={option.displayName}>
                            {option.displayName}
                          </p>
                          <div className="flex flex-col gap-1 mt-1">
                            {option.priceConfidence && (
                              <Badge variant="outline" className={`text-[9px] h-4 ${
                                option.priceConfidence === 'exact'
                                  ? 'text-green-600 border-green-300'
                                  : 'text-amber-600 border-amber-300'
                              }`}>
                                {option.priceConfidence}
                              </Badge>
                            )}
                            {option.reason && (
                              <Badge className="text-[10px] bg-green-100 text-green-700 border-0">
                                {option.reason}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Store Price Comparison - Mobile Stacked */}
                {hasRealPrices && selectedStore === 'all' && storeOptions.length > 1 && (
                  <div className="sm:hidden border-t border-gray-200 bg-white p-3 space-y-2">
                    {storeOptions.slice(0, 3).map((option, optIdx) => (
                      <div
                        key={optIdx}
                        className={`flex items-center justify-between p-2 rounded-lg ${
                          option.isRecommended ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {option.isRecommended && <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" weight="fill" />}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{option.store}</p>
                            {option.storeAddress && (
                              <p className="text-xs text-gray-400 truncate">{option.storeAddress}</p>
                            )}
                            <p className="text-xs text-gray-500 truncate">{option.displayName}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="flex items-center gap-1">
                            <p className={`font-bold ${option.isRecommended ? 'text-green-600' : 'text-gray-900'}`}>
                              {option.priceConfidence === 'estimate' ? '~' : ''}${option.price.toFixed(2)}
                            </p>
                            {option.priceConfidence && (
                              <Badge variant="outline" className={`text-[9px] h-4 ml-1 ${
                                option.priceConfidence === 'exact'
                                  ? 'text-green-600 border-green-300'
                                  : 'text-amber-600 border-amber-300'
                              }`}>
                                {option.priceConfidence}
                              </Badge>
                            )}
                          </div>
                          {option.reason && (
                            <p className="text-[10px] text-green-600 mt-1">{option.reason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Single store selected view */}
                {hasRealPrices && selectedStore !== 'all' && displayOptions.length > 0 && (
                  <div className="border-t border-gray-200 bg-white px-4 py-2 flex items-center justify-between">
                    <div className="flex-1 mr-2">
                      <p className="text-sm text-gray-600 truncate">{displayOptions[0].displayName}</p>
                      {displayOptions[0].storeAddress && (
                        <p className="text-xs text-gray-400 truncate">{displayOptions[0].storeAddress}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`font-bold ${
                        displayOptions[0].isRecommended ? 'text-green-600' : 'text-gray-900'
                      }`}>
                        {displayOptions[0].priceConfidence === 'estimate' ? '~' : ''}${displayOptions[0].price.toFixed(2)}
                      </span>
                      {displayOptions[0].priceConfidence && (
                        <Badge variant="outline" className={`text-[9px] h-4 ${
                          displayOptions[0].priceConfidence === 'exact'
                            ? 'text-green-600 border-green-300'
                            : 'text-amber-600 border-amber-300'
                        }`}>
                          {displayOptions[0].priceConfidence}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" weight="regular" />
            <p>No items in this category</p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-200 px-4 sm:px-6 py-4 bg-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-gray-600 text-center sm:text-left">
            <span className="font-medium text-green-600">{checkedItemsCount}</span> of{' '}
            <span className="font-medium">{totalItems}</span> items checked
            {hasRealPrices && recommendedTotal && (
              <span className="ml-2">
                • Total: <span className="font-bold text-green-600">${recommendedTotal.toFixed(2)}</span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-center sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyList}
              className="text-gray-600 border-gray-300 hover:bg-gray-100 text-xs sm:text-sm"
            >
              <Copy className="w-4 h-4 mr-1" weight="regular" />
              <span className="hidden sm:inline">Copy List</span>
              <span className="sm:hidden">Copy</span>
            </Button>
            <Button
              size="sm"
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md hover:shadow-lg transition-all duration-200 text-xs sm:text-sm"
            >
              <FileText className="w-4 h-4 mr-1" weight="regular" />
              <span className="hidden sm:inline">Export to Notes</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}