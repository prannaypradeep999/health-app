'use client';

import { useEffect, useState } from 'react';

interface MealPlan {
  restaurants?: Array<{
    name: string;
    dish: string;
    price?: string;
    orderLink?: string;
    menuLink?: string;
  }>;
  meals?: Array<{
    name: string;
    description: string;
    restaurant?: string;
    orderLink?: string;
  }>;
}

interface WorkoutPlan {
  exercises?: Array<{
    name: string;
    description: string;
    sets?: number;
    reps?: number;
    duration?: string;
  }>;
}

export default function SimpleViewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/view-data?userId=prannay_test&surveyId=cmhqf60yj00019ksg5fynzcr8', {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-lg font-medium text-gray-900">Loading Prannay's Data...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-medium text-red-600 mb-4">Error Loading Data</h2>
          <p className="text-sm text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const mealPlan = data?.currentMealPlan as MealPlan;
  const workoutPlan = data?.currentWorkoutPlan as WorkoutPlan;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Prannay's Health Plan Dashboard</h1>

        {/* User Profile */}
        {data?.userProfile && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Profile</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><strong>Name:</strong> {data.userProfile.first_name} {data.userProfile.last_name}</div>
              <div><strong>Goal:</strong> {data.userProfile.fitness_goal}</div>
              <div><strong>Location:</strong> {data.userProfile.location}</div>
              <div><strong>Created:</strong> {new Date(data.userProfile.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        )}

        {/* Current Meal Plan */}
        {mealPlan && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Current Meal Plan - Restaurant Search Results</h2>

            {mealPlan.restaurants && mealPlan.restaurants.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-700 mb-3">Found Restaurants:</h3>
                <div className="space-y-4">
                  {mealPlan.restaurants.map((restaurant, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800">{restaurant.dish}</h4>
                      <p className="text-gray-600">from {restaurant.name}</p>
                      {restaurant.price && <p className="text-green-600 font-medium">{restaurant.price}</p>}
                      <div className="mt-2 space-x-2">
                        {restaurant.orderLink && (
                          <a
                            href={restaurant.orderLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                          >
                            Order Now
                          </a>
                        )}
                        {restaurant.menuLink && (
                          <a
                            href={restaurant.menuLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            View Menu
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mealPlan.meals && mealPlan.meals.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-700 mb-3">Meal Recommendations:</h3>
                <div className="space-y-3">
                  {mealPlan.meals.map((meal, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-800">{meal.name}</h4>
                      <p className="text-gray-600 text-sm">{meal.description}</p>
                      {meal.restaurant && <p className="text-blue-600 text-sm">Available at: {meal.restaurant}</p>}
                      {meal.orderLink && (
                        <a
                          href={meal.orderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Order
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Workout Plan */}
        {workoutPlan && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Current Workout Plan</h2>

            {workoutPlan.exercises && workoutPlan.exercises.length > 0 && (
              <div className="space-y-3">
                {workoutPlan.exercises.map((exercise, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3">
                    <h4 className="font-semibold text-gray-800">{exercise.name}</h4>
                    <p className="text-gray-600 text-sm">{exercise.description}</p>
                    <div className="mt-2 text-sm text-gray-500">
                      {exercise.sets && <span className="mr-4">Sets: {exercise.sets}</span>}
                      {exercise.reps && <span className="mr-4">Reps: {exercise.reps}</span>}
                      {exercise.duration && <span>Duration: {exercise.duration}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Raw Data for Debugging */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Raw Data (for debugging)</h2>
          <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}