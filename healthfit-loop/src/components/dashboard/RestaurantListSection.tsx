'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Star,
  ArrowSquareOut,
  Phone,
  Clock,
  Truck,
  House,
  ForkKnife,
  ChefHat,
  Target
} from '@phosphor-icons/react';

interface Restaurant {
  name: string;
  cuisine: string;
  rating?: number;
  address: string;
  city?: string;
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

interface RestaurantListSectionProps {
  restaurants: Restaurant[];
  metadata?: {
    generatedFor: string;
    location: string;
    goal: string;
    cuisines: string[];
  };
}

export function RestaurantListSection({ restaurants, metadata }: RestaurantListSectionProps) {
  console.log('[RESTAURANT-SECTION] 🍽️ Component mounted with:', {
    hasRestaurants: !!restaurants,
    restaurantsCount: restaurants?.length || 0,
    restaurantNames: restaurants?.map(r => r.name) || [],
    metadata: metadata
  });

  if (restaurants && restaurants.length > 0) {
    restaurants.forEach((restaurant, idx) => {
      console.log(`[RESTAURANT-SECTION] Restaurant ${idx + 1}:`, {
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        address: restaurant.address,
        hasOrderingLinks: !!restaurant.orderingLinks,
        orderingLinksKeys: Object.keys(restaurant.orderingLinks || {}),
        linksFound: restaurant.linksFound,
        doordash: restaurant.orderingLinks?.doordash ? 'YES' : 'NO',
        ubereats: restaurant.orderingLinks?.ubereats ? 'YES' : 'NO',
        grubhub: restaurant.orderingLinks?.grubhub ? 'YES' : 'NO',
        direct: restaurant.orderingLinks?.direct ? 'YES' : 'NO',
        error: restaurant.error
      });
    });
  }

  const openOrderingLink = (url: string, platform: string) => {
    window.open(url, '_blank');
  };

  if (!restaurants || restaurants.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
        <div className="p-8 text-center">
          <ForkKnife className="w-12 h-12 text-gray-400 mx-auto mb-4" weight="regular" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Restaurants Found</h3>
          <p className="text-gray-600">
            We couldn't find restaurants in your area, but don't worry! Your meal plan focuses on amazing home-cooked meals.
          </p>
        </div>
      </div>
    );
  }

  const totalOrderingLinks = restaurants.reduce((total, restaurant) => total + restaurant.linksFound, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-[#c1272d] to-red-600 rounded-xl flex items-center justify-center shadow-md">
              <ForkKnife className="w-5 h-5 text-white" weight="regular" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Curated Restaurants</h3>
              <p className="text-sm text-gray-600 flex items-center gap-2">
                <Target className="w-4 h-4 text-[#c1272d]" weight="regular" />
                {restaurants.length} places matched to your {metadata?.goal?.toLowerCase()} goals
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {metadata?.cuisines && (
              <Badge className="bg-gradient-to-r from-[#c1272d] to-red-600 text-white border-0 shadow-md">
                {metadata.cuisines.slice(0, 2).join(' • ')} cuisines
              </Badge>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3 text-xs sm:text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Truck className="w-4 h-4 text-[#c1272d]" weight="regular" />
            <span className="font-medium">{totalOrderingLinks} ordering links</span>
          </div>
          {metadata?.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4 text-[#c1272d]" weight="regular" />
              <span>{metadata.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal scroll restaurant cards */}
      <div className="p-4 sm:p-6">
        <div className="overflow-x-auto">
          <div className="flex space-x-4 pb-2" style={{ minWidth: 'max-content' }}>
            {restaurants.map((restaurant, index) => (
              <div
                key={index}
                className="w-72 sm:w-80 flex-shrink-0 bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-[#c1272d]/20 transition-all duration-300 group"
              >
                {/* Restaurant header */}
                <div className="p-4 border-b border-gray-200 bg-white">
                  <div className="flex items-start space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center shadow-sm border border-gray-200 group-hover:border-[#c1272d]/30 transition-colors">
                      <ForkKnife className="w-6 h-6 text-gray-600 group-hover:text-[#c1272d] transition-colors" weight="regular" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 truncate group-hover:text-[#c1272d] transition-colors">
                        {restaurant.name}
                      </h4>
                      <div className="flex items-center gap-3 text-sm mb-1">
                        <Badge variant="outline" className="bg-[#c1272d]/10 text-[#c1272d] border-[#c1272d]/20 font-medium">
                          {restaurant.cuisine}
                        </Badge>
                        {restaurant.rating && restaurant.rating > 0 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <Star className="w-4 h-4 fill-current" />
                            <span className="font-semibold">{restaurant.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {restaurant.distance && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{restaurant.distance}mi away</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{restaurant.estimatedOrderTime}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="px-4 py-2 bg-gray-50">
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    {restaurant.address}, {restaurant.city}
                  </p>
                </div>

                {/* Sample menu items */}
                {restaurant.sampleMenuItems && restaurant.sampleMenuItems.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h5 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                      <ChefHat className="w-3 h-3 text-[#8b5cf6]" />
                      Popular dishes
                    </h5>
                    <div className="flex flex-wrap gap-1">
                      {restaurant.sampleMenuItems.slice(0, 3).map((item, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-2 py-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full"
                        >
                          {item}
                        </span>
                      ))}
                      {restaurant.sampleMenuItems.length > 3 && (
                        <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                          +{restaurant.sampleMenuItems.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Ordering buttons */}
                <div className="p-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                      <Truck className="w-3 h-3 text-[#c1272d]" />
                      Order from ({restaurant.linksFound} platforms found)
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {restaurant.orderingLinks.doordash && restaurant.orderingLinks.doordash.trim() !== '' && (
                        <Button
                          size="sm"
                          onClick={() => openOrderingLink(restaurant.orderingLinks.doordash!, 'DoorDash')}
                          className="bg-red-500 hover:bg-red-600 text-white border-0 shadow-sm transition-all duration-200 hover:scale-105 text-xs h-8"
                        >
                          <Truck className="w-3 h-3 mr-1" />
                          DoorDash
                        </Button>
                      )}

                      {restaurant.orderingLinks.ubereats && restaurant.orderingLinks.ubereats.trim() !== '' && (
                        <Button
                          size="sm"
                          onClick={() => openOrderingLink(restaurant.orderingLinks.ubereats!, 'Uber Eats')}
                          className="bg-green-600 hover:bg-green-700 text-white border-0 shadow-sm transition-all duration-200 hover:scale-105 text-xs h-8"
                        >
                          <Truck className="w-3 h-3 mr-1" />
                          Uber Eats
                        </Button>
                      )}

                      {restaurant.orderingLinks.grubhub && restaurant.orderingLinks.grubhub.trim() !== '' && (
                        <Button
                          size="sm"
                          onClick={() => openOrderingLink(restaurant.orderingLinks.grubhub!, 'GrubHub')}
                          className="bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-sm transition-all duration-200 hover:scale-105 text-xs h-8"
                        >
                          <Truck className="w-3 h-3 mr-1" />
                          GrubHub
                        </Button>
                      )}

                      {restaurant.orderingLinks.direct && restaurant.orderingLinks.direct.trim() !== '' && (
                        <Button
                          size="sm"
                          onClick={() => openOrderingLink(restaurant.orderingLinks.direct!, 'Direct')}
                          className="bg-[#8b5cf6] hover:bg-purple-700 text-white border-0 shadow-sm transition-all duration-200 hover:scale-105 text-xs h-8"
                        >
                          <House className="w-3 h-3 mr-1" weight="regular" />
                          Direct
                        </Button>
                      )}

                      {restaurant.phone && (
                        <Button
                          size="sm"
                          onClick={() => window.open(`tel:${restaurant.phone}`, '_blank')}
                          className="bg-gray-600 hover:bg-gray-700 text-white border-0 shadow-sm transition-all duration-200 hover:scale-105 text-xs h-8"
                        >
                          <Phone className="w-3 h-3 mr-1" />
                          Call
                        </Button>
                      )}
                    </div>

                    {/* Show error if any */}
                    {restaurant.error && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <p className="text-xs text-amber-800 flex items-center gap-1">
                          <ArrowSquareOut className="w-3 h-3 text-amber-600" weight="regular" />
                          {restaurant.error}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <span>
              <span className="font-medium text-[#c1272d]">{restaurants.length}</span> restaurants selected
            </span>
            <span>
              <span className="font-medium text-[#c1272d]">{totalOrderingLinks}</span> ordering platforms available
            </span>
          </div>
          <div className="text-xs text-gray-500">
            Based on your {metadata?.cuisines?.join(', ')} preferences
          </div>
        </div>
      </div>
    </div>
  );
}