'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  Circle,
  ShoppingCart,
  Target,
  DollarSign,
  Beef,
  Carrot,
  Wheat,
  Milk,
  Package,
  Cookie,
  Copy,
  FileText
} from 'lucide-react';

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

interface GroceryListSectionProps {
  groceryList: GroceryList;
  onItemToggle?: (category: string, index: number) => void;
  checkedItems?: { [key: string]: boolean };
}

export function GroceryListSection({
  groceryList,
  onItemToggle = () => {},
  checkedItems = {}
}: GroceryListSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!groceryList || groceryList.error) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
        <div className="p-8 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Grocery List Unavailable</h3>
          <p className="text-gray-600">
            {groceryList?.error || 'Your grocery list is being generated. Please check back soon.'}
          </p>
        </div>
      </div>
    );
  }

  // Category configurations with Lucide icons and colors
  const categoryConfigs = {
    proteins: { icon: Beef, color: 'from-red-500 to-pink-600', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700' },
    vegetables: { icon: Carrot, color: 'from-green-500 to-emerald-600', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700' },
    grains: { icon: Wheat, color: 'from-amber-500 to-orange-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-700' },
    dairy: { icon: Milk, color: 'from-blue-500 to-cyan-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-700' },
    pantryStaples: { icon: Package, color: 'from-purple-500 to-violet-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', textColor: 'text-purple-700' },
    snacks: { icon: Cookie, color: 'from-pink-500 to-rose-600', bgColor: 'bg-pink-50', borderColor: 'border-pink-200', textColor: 'text-pink-700' }
  };

  // Get all categories with items
  const availableCategories = Object.keys(groceryList).filter(
    key => Array.isArray(groceryList[key as keyof GroceryList]) && (groceryList[key as keyof GroceryList] as GroceryItem[]).length > 0
  );

  // Get total item count
  const totalItems = availableCategories.reduce((total, category) => {
    return total + (groceryList[category as keyof GroceryList] as GroceryItem[]).length;
  }, 0);

  // Get checked items count
  const checkedItemsCount = Object.values(checkedItems).filter(Boolean).length;

  // Filter items based on selected category
  const getFilteredItems = () => {
    if (selectedCategory === 'all') {
      return availableCategories.flatMap(category =>
        (groceryList[category as keyof GroceryList] as GroceryItem[]).map(item => ({
          ...item,
          category
        }))
      );
    }

    return (groceryList[selectedCategory as keyof GroceryList] as GroceryItem[])?.map(item => ({
      ...item,
      category: selectedCategory
    })) || [];
  };

  const filteredItems = getFilteredItems();

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Smart Grocery List</h3>
              <p className="text-sm text-gray-600 flex items-center gap-2">
                <Target className="w-4 h-4 text-green-600" />
                {totalItems} items across {availableCategories.length} categories
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">
              ${groceryList.totalEstimatedCost?.toFixed(2) || '0.00'}
            </div>
            <Badge className="bg-green-100 text-green-700 border border-green-300 text-xs font-medium">
              {groceryList.weeklyBudgetUsed} of budget
            </Badge>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="px-6 py-3 border-b border-gray-100 overflow-x-auto">
        <div className="flex space-x-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <ShoppingCart className="w-4 h-4 mr-1" />
            All Items ({totalItems})
          </button>

          {availableCategories.map(category => {
            const config = categoryConfigs[category as keyof typeof categoryConfigs];
            const items = groceryList[category as keyof GroceryList] as GroceryItem[];

            if (!config || !items) return null;

            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? `${config.bgColor} ${config.textColor} ${config.borderColor} border`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <config.icon className="w-4 h-4 mr-1" />
                {category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1')} ({items.length})
              </button>
            );
          })}
        </div>
      </div>

      {/* Items List */}
      <div className="p-6 space-y-3 max-h-96 overflow-y-auto">
        {filteredItems.length > 0 ? (
          filteredItems.map((item, index) => {
            const itemKey = `${item.category}-${index}`;
            const isChecked = checkedItems[itemKey] || false;
            const config = categoryConfigs[item.category as keyof typeof categoryConfigs];

            return (
              <div
                key={itemKey}
                className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 hover:shadow-sm ${
                  isChecked
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => onItemToggle(item.category, index)}
                    className="transition-transform duration-200 hover:scale-110"
                  >
                    {isChecked ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {config && (
                        <config.icon className="w-4 h-4 text-gray-500" />
                      )}
                      <p className={`font-medium ${isChecked ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                        {item.name}
                      </p>
                    </div>
                    <p className={`text-sm ${isChecked ? 'text-green-600' : 'text-gray-500'}`}>
                      {item.quantity}
                    </p>
                    <p className={`text-xs italic ${isChecked ? 'text-green-600' : 'text-gray-500'}`}>
                      {item.uses}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`font-bold ${isChecked ? 'text-green-600 line-through' : 'text-gray-900'}`}>
                    ${item.estimatedCost?.toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No items in this category</p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium text-green-600">{checkedItemsCount}</span> of{' '}
            <span className="font-medium">{totalItems}</span> items checked off
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Export to clipboard
                const list = filteredItems.map(item =>
                  `${item.name} - ${item.quantity}`
                ).join('\n');
                navigator.clipboard.writeText(list);
              }}
              className="text-gray-600 border-gray-300 hover:bg-gray-100"
            >
              <Copy className="w-4 h-4 mr-1" />
              Copy List
            </Button>
            <Button
              size="sm"
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md hover:shadow-lg transition-all duration-200"
            >
              <FileText className="w-4 h-4 mr-1" />
              Export to Notes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}