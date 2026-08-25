/**
 * Benchmark fixtures.
 *
 * These are shaped like `SurveyResponse` rows, not like `SurveySchema` input.
 * The plan said to reuse SurveySchema, but the prompt builders never see that
 * shape — the routes read the survey straight out of Prisma, so the enums are
 * already lowercased and the JSON columns are already objects. Benchmarking
 * against SurveySchema would have measured a code path that does not exist.
 *
 * Three fixtures spanning the range the generators have to cope with: a
 * low-calorie vegetarian goal, a high-protein goal with full gym access, and
 * one carrying real exclusions (allergy plus religious plus a texture dislike).
 */

import type { WorkoutPreferences } from '../../src/lib/ai/prompts/workout-generation';

export interface Fixture {
  name: string;
  /** Loose on purpose — this mirrors the `surveyData: any` the routes pass. */
  surveyData: any;
  workoutPrefs: WorkoutPreferences;
  nutritionTargets: {
    mealTargets: Record<string, { calories: number; protein: number; carbs: number; fat: number }>;
  };
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Every slot at home: the 21-meal worst case that broke the legacy path. */
export const allHomeSchedule = Object.fromEntries(
  DAYS.map(d => [d, { breakfast: 'home', lunch: 'home', dinner: 'home' }])
);

/** A realistic mixed week — some restaurant slots, some skipped meals. */
export const mixedSchedule = {
  monday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
  tuesday: { breakfast: 'home', lunch: 'restaurant', dinner: 'home' },
  wednesday: { breakfast: 'no-meal', lunch: 'home', dinner: 'home' },
  thursday: { breakfast: 'home', lunch: 'home', dinner: 'restaurant' },
  friday: { breakfast: 'home', lunch: 'home', dinner: 'restaurant' },
  saturday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
  sunday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
};

const base = {
  email: 'bench@example.com',
  streetAddress: '2000 Center St',
  city: 'Berkeley',
  state: 'CA',
  zipCode: '94704',
  country: 'United States',
  source: 'web',
  isGuest: false,
  uploadedFiles: [],
  biomarkerJson: null,
  biomarkers: null,
  healthGoalPriority: null,
  motivationLevel: null,
  dashboardEmailSent: false,
};

export const fixtures: Fixture[] = [
  {
    name: 'vegetarian-cut',
    surveyData: {
      ...base,
      firstName: 'Maya', lastName: 'Chen',
      age: 29, sex: 'female', height: 65, weight: 141,
      goal: 'WEIGHT_LOSS', primaryGoal: 'lose_weight',
      goalChallenge: 'evening snacking',
      additionalGoalsNotes: 'wants to stay full on fewer calories',
      healthFocus: 'body_composition', maintainFocus: null,
      activityLevel: 'lightly_active',
      fitnessLevel: 'beginner', fitnessTimeline: '3_months',
      preferredActivities: ['yoga', 'walking'], sportsInterests: '',
      dietPrefs: ['Vegetarian', 'high_fiber'],
      foodAllergies: [],
      strictExclusions: { meats: ['all'], other: [] },
      preferredCuisines: ['mediterranean', 'indian', 'thai'],
      preferredFoods: ['lentils', 'tofu', 'greek yogurt', 'sweet potato'],
      preferredNutrients: ['fiber', 'iron'],
      customFoodInput: 'no mushrooms, texture thing',
      monthlyFoodBudget: 320, monthlyFitnessBudget: 30,
      eatingOutOccasions: '2', mealsOutPerWeek: 2,
      distancePreference: 'close',
      weeklyMealSchedule: mixedSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'beginner', gymAccess: 'no_gym',
      workoutTypes: ['yoga', 'bodyweight'], availableDays: ['monday', 'wednesday', 'friday', 'saturday'],
      preferredDuration: 30, injuryConsiderations: ['lower back sensitivity'],
      timePreferences: ['morning'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 350, protein: 22, carbs: 40, fat: 11 },
      lunch: { calories: 480, protein: 30, carbs: 55, fat: 15 },
      dinner: { calories: 520, protein: 34, carbs: 55, fat: 18 },
    } },
  },
  {
    name: 'high-protein-gym',
    surveyData: {
      ...base,
      firstName: 'Alex', lastName: 'Rivera',
      age: 31, sex: 'male', height: 70, weight: 174,
      goal: 'MUSCLE_GAIN', primaryGoal: 'gain_muscle',
      goalChallenge: 'consistency on weeknights',
      additionalGoalsNotes: 'wants higher protein without more cooking time',
      healthFocus: 'strength', maintainFocus: null,
      activityLevel: 'moderately_active',
      fitnessLevel: 'intermediate', fitnessTimeline: '6_months',
      preferredActivities: ['weightlifting', 'cycling'], sportsInterests: 'climbing',
      dietPrefs: ['high_protein'],
      foodAllergies: [],
      strictExclusions: null,
      preferredCuisines: ['mexican', 'japanese', 'mediterranean'],
      preferredFoods: ['chicken', 'salmon', 'black beans', 'greek yogurt'],
      preferredNutrients: ['protein'],
      customFoodInput: 'loves a good burrito bowl',
      monthlyFoodBudget: 600, monthlyFitnessBudget: 80,
      eatingOutOccasions: '3', mealsOutPerWeek: 3,
      distancePreference: 'medium',
      weeklyMealSchedule: allHomeSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'intermediate', gymAccess: 'full_gym',
      workoutTypes: ['strength', 'hiit'],
      availableDays: ['monday', 'tuesday', 'thursday', 'friday', 'saturday'],
      preferredDuration: 60, injuryConsiderations: [],
      timePreferences: ['evening'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 550, protein: 40, carbs: 55, fat: 18 },
      lunch: { calories: 750, protein: 55, carbs: 75, fat: 24 },
      dinner: { calories: 850, protein: 60, carbs: 85, fat: 28 },
    } },
  },
  {
    name: 'restricted',
    surveyData: {
      ...base,
      firstName: 'Yusuf', lastName: 'Karim',
      age: 44, sex: 'male', height: 68, weight: 198,
      goal: 'GENERAL_WELLNESS', primaryGoal: 'maintain',
      goalChallenge: 'travels for work three weeks a month',
      additionalGoalsNotes: 'needs meals that survive a hotel microwave',
      healthFocus: null, maintainFocus: 'energy',
      activityLevel: 'sedentary',
      fitnessLevel: 'beginner', fitnessTimeline: '12_months',
      preferredActivities: ['swimming'], sportsInterests: '',
      dietPrefs: ['Halal', 'Gluten-Free', 'Dairy-Free'],
      foodAllergies: ['shellfish', 'tree nuts'],
      strictExclusions: { meats: ['pork'], other: ['cilantro', 'alcohol'] },
      preferredCuisines: ['middle_eastern', 'turkish'],
      preferredFoods: ['lamb', 'chickpeas', 'rice', 'eggplant'],
      preferredNutrients: ['fiber'],
      customFoodInput: 'strictly no pork or alcohol in cooking',
      monthlyFoodBudget: 450, monthlyFitnessBudget: 20,
      eatingOutOccasions: '5', mealsOutPerWeek: 5,
      distancePreference: 'far',
      weeklyMealSchedule: mixedSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'beginner', gymAccess: 'free_weights',
      workoutTypes: ['swimming', 'mobility'], availableDays: ['tuesday', 'thursday', 'sunday'],
      preferredDuration: 40, injuryConsiderations: ['right shoulder impingement'],
      timePreferences: ['morning', 'evening'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 450, protein: 28, carbs: 45, fat: 16 },
      lunch: { calories: 620, protein: 38, carbs: 62, fat: 22 },
      dinner: { calories: 680, protein: 42, carbs: 68, fat: 24 },
    } },
  },
];

/** Flatten a weeklyMealSchedule into the {day, mealType}[] the meal prompts take. */
export function homeMealsFrom(schedule: Record<string, Record<string, string>>) {
  return DAYS.flatMap(day =>
    ['breakfast', 'lunch', 'dinner']
      .filter(slot => schedule[day]?.[slot] === 'home')
      .map(mealType => ({ day, mealType }))
  );
}

export function scheduleTextFrom(homeMeals: Array<{ day: string; mealType: string }>) {
  const byType = homeMeals.reduce((acc, m) => {
    (acc[m.mealType] ||= []).push(m.day);
    return acc;
  }, {} as Record<string, string[]>);
  return Object.entries(byType)
    .map(([t, days]) => `${t.charAt(0).toUpperCase() + t.slice(1)}: ${days.join(', ')}`)
    .join('\n');
}

/** Stands in for Sonar prose in the menu-extraction site. */
export const menuProseFixture = `
Sakura Ramen House in Berkeley is known for its tonkotsu. Popular dishes include the
Tonkotsu Ramen ($16.50), a rich pork-bone broth with chashu; the Shoyu Ramen ($15.00);
a Chicken Karaage plate ($11.75); Vegetable Gyoza, six pieces ($8.50); a Salmon Poke Bowl
($18.25) served over brown rice; the Spicy Miso Ramen ($17.00); and for the morning menu
a Tamago Sando ($7.25) and Miso Soup with rice ($6.00). They also do a Pork Belly Bun
($9.50) and a Seaweed Salad ($6.75). Ordering is available through DoorDash at
https://www.doordash.com/store/sakura-ramen-house-berkeley-12345/ and their own site is
https://sakuraramenhouse.com. No Uber Eats or Grubhub listing was found.
`;

/** Flatten a weeklyMealSchedule into the eating-out slots the restaurant prompts take. */
export function restaurantSlotsFrom(schedule: Record<string, Record<string, string>>) {
  return DAYS.flatMap(day =>
    ['breakfast', 'lunch', 'dinner']
      .filter(slot => schedule[day]?.[slot] === 'restaurant')
      .map(mealType => ({ day, mealType }))
  );
}

/**
 * Stands in for a Google Places nearbysearch result.
 *
 * Deliberately includes one restaurant whose cuisine matches no fixture
 * preference: the selection prompt is supposed to work from this list only, and
 * a model that invents a restaurant or alters a placeId is exactly the failure
 * worth catching.
 */
export const nearbyRestaurantsFixture = [
  { name: 'Sakura Ramen House', placeId: 'place_sakura_1', cuisine: 'japanese', rating: 4.5, priceLevel: 2, address: '2100 Shattuck Ave', city: 'Berkeley' },
  { name: 'Zaytoon Mediterranean', placeId: 'place_zaytoon_2', cuisine: 'middle_eastern', rating: 4.4, priceLevel: 2, address: '1133 Solano Ave', city: 'Berkeley' },
  { name: 'Comal Next Door', placeId: 'place_comal_3', cuisine: 'mexican', rating: 4.3, priceLevel: 2, address: '2020 Shattuck Ave', city: 'Berkeley' },
  { name: 'Great China', placeId: 'place_greatchina_4', cuisine: 'chinese', rating: 4.2, priceLevel: 2, address: '2190 Bancroft Way', city: 'Berkeley' },
  { name: 'Cheese Board Pizza', placeId: 'place_cheeseboard_5', cuisine: 'pizza', rating: 4.7, priceLevel: 1, address: '1512 Shattuck Ave', city: 'Berkeley' },
  { name: 'Angeline\'s Louisiana Kitchen', placeId: 'place_angelines_6', cuisine: 'cajun', rating: 4.1, priceLevel: 2, address: '2261 Shattuck Ave', city: 'Berkeley' },
  { name: 'Kiraku Izakaya', placeId: 'place_kiraku_7', cuisine: 'japanese', rating: 4.4, priceLevel: 2, address: '2566 Telegraph Ave', city: 'Berkeley' },
  { name: 'Tacos Sinaloa', placeId: 'place_tacos_8', cuisine: 'mexican', rating: 4.3, priceLevel: 1, address: '2384 Telegraph Ave', city: 'Berkeley' },
  { name: 'La Note Provencale', placeId: 'place_lanote_9', cuisine: 'french', rating: 4.2, priceLevel: 2, address: '2377 Shattuck Ave', city: 'Berkeley' },
  { name: 'Ippuku', placeId: 'place_ippuku_10', cuisine: 'japanese', rating: 4.5, priceLevel: 3, address: '2130 Center St', city: 'Berkeley' },
  { name: 'Berkeley Social Club', placeId: 'place_bsc_11', cuisine: 'american', rating: 3.9, priceLevel: 2, address: '2050 University Ave', city: 'Berkeley' },
];

/**
 * Stands in for the menu data the restaurant-meal prompt receives.
 *
 * The ordering links here are the ground truth: Sakura has DoorDash and a
 * direct site, Zaytoon has only a direct site, Comal has nothing. A generated
 * meal that produces a Grubhub URL for any of them invented it — the prompt
 * explicitly tells the model to use null for platforms marked "not available".
 */
export const restaurantMenuDataFixture = [
  {
    name: 'Sakura Ramen House', cuisine: 'japanese', address: '2100 Shattuck Ave, Berkeley',
    orderingLinks: {
      doordash: 'https://www.doordash.com/store/sakura-ramen-house-berkeley-12345/',
      ubereats: null, grubhub: null, direct: 'https://sakuraramenhouse.com',
    },
    menuItems: [
      { name: 'Tonkotsu Ramen', price: 16.5, category: 'dinner', estimatedCalories: 780, description: 'Pork bone broth with chashu' },
      { name: 'Vegetable Gyoza', price: 8.5, category: 'lunch', estimatedCalories: 320, description: 'Six pieces, pan fried' },
      { name: 'Salmon Poke Bowl', price: 18.25, category: 'lunch', estimatedCalories: 620, description: 'Over brown rice' },
    ],
  },
  {
    name: 'Zaytoon Mediterranean', cuisine: 'middle_eastern', address: '1133 Solano Ave, Berkeley',
    orderingLinks: { doordash: null, ubereats: null, grubhub: null, direct: 'https://zaytoonberkeley.com' },
    menuItems: [
      { name: 'Chicken Shawarma Plate', price: 17.0, category: 'dinner', estimatedCalories: 720, description: 'With rice and salad' },
      { name: 'Falafel Wrap', price: 12.5, category: 'lunch', estimatedCalories: 540, description: 'Tahini and pickles' },
      { name: 'Lamb Kofta', price: 21.0, category: 'dinner', estimatedCalories: 810, description: 'Grilled, with hummus' },
    ],
  },
  {
    name: 'Comal Next Door', cuisine: 'mexican', address: '2020 Shattuck Ave, Berkeley',
    orderingLinks: { doordash: null, ubereats: null, grubhub: null, direct: null },
    menuItems: [
      { name: 'Carnitas Tacos', price: 14.0, category: 'lunch', estimatedCalories: 610, description: 'Three tacos, salsa verde' },
      { name: 'Grilled Fish Bowl', price: 18.0, category: 'dinner', estimatedCalories: 650, description: 'Rice, beans, cabbage' },
    ],
  },
];
