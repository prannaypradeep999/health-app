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

/**
 * The week that actually broke: seven eating-out slots.
 *
 * Every other schedule here yields three restaurant slots, so the restaurant
 * benchmark had only ever measured three. Restaurant-selection output scales
 * with the slot count — one primary and one alternative per slot — and the
 * 2026-08-26 production failure was a seven-slot week whose selection call ran
 * 26,694ms and was cut off 11ms short of the 53,000ms route budget, persisting
 * zero meals. Benchmarking three slots and reasoning about seven is how that
 * went unseen.
 */
export const restaurantHeavySchedule = {
  monday: { breakfast: 'home', lunch: 'restaurant', dinner: 'home' },
  tuesday: { breakfast: 'home', lunch: 'restaurant', dinner: 'restaurant' },
  wednesday: { breakfast: 'home', lunch: 'home', dinner: 'restaurant' },
  thursday: { breakfast: 'home', lunch: 'restaurant', dinner: 'home' },
  friday: { breakfast: 'home', lunch: 'home', dinner: 'restaurant' },
  saturday: { breakfast: 'home', lunch: 'restaurant', dinner: 'home' },
  sunday: { breakfast: 'home', lunch: 'home', dinner: 'home' },
};

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
    // Exists for one reason: seven eating-out slots, the load that failed in
    // production on 2026-08-26. No dietary restrictions, so the compliant-dish
    // pool is not the binding constraint and what this measures is the cost of
    // the slot count alone. See restaurantHeavySchedule.
    name: 'eats-out-often',
    surveyData: {
      ...base,
      firstName: 'Dana', lastName: 'Okafor',
      age: 36, sex: 'female', height: 67, weight: 158,
      goal: 'GENERAL_WELLNESS', primaryGoal: 'maintain',
      goalChallenge: 'client lunches most weekdays',
      additionalGoalsNotes: 'eats out constantly and wants the ordering to be decided for her',
      healthFocus: null, maintainFocus: 'energy',
      activityLevel: 'moderately_active',
      fitnessLevel: 'intermediate', fitnessTimeline: '6_months',
      preferredActivities: ['running'], sportsInterests: 'tennis',
      dietPrefs: [],
      foodAllergies: [],
      strictExclusions: null,
      preferredCuisines: ['japanese', 'mediterranean', 'mexican'],
      preferredFoods: ['salmon', 'chickpeas', 'rice'],
      preferredNutrients: ['protein'],
      customFoodInput: '',
      monthlyFoodBudget: 700, monthlyFitnessBudget: 60,
      eatingOutOccasions: '7', mealsOutPerWeek: 7,
      distancePreference: 'medium',
      weeklyMealSchedule: restaurantHeavySchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'intermediate', gymAccess: 'full_gym',
      workoutTypes: ['cardio', 'strength'], availableDays: ['monday', 'wednesday', 'saturday'],
      preferredDuration: 45, injuryConsiderations: [],
      timePreferences: ['morning'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 420, protein: 26, carbs: 45, fat: 14 },
      lunch: { calories: 620, protein: 40, carbs: 65, fat: 20 },
      dinner: { calories: 680, protein: 44, carbs: 70, fat: 22 },
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
  {
    // Exists to catch E1/E2: a cross-user recipe cache hit that ignores diet is
    // a medical problem for this person, not a quality problem.
    name: 'coeliac-nut-allergy',
    surveyData: {
      ...base,
      firstName: 'Nora', lastName: 'Whelan',
      age: 36, sex: 'female', height: 66, weight: 152,
      goal: 'GENERAL_WELLNESS', primaryGoal: 'maintain',
      goalChallenge: 'cross-contamination when eating out',
      additionalGoalsNotes: 'coeliac disease, diagnosed — not a preference',
      healthFocus: 'digestive', maintainFocus: 'energy',
      activityLevel: 'moderately_active',
      fitnessLevel: 'intermediate', fitnessTimeline: '6_months',
      preferredActivities: ['running', 'pilates'], sportsInterests: '',
      dietPrefs: ['Gluten-Free', 'Dairy-Free'],
      foodAllergies: ['tree nuts', 'peanuts'],
      strictExclusions: { meats: [], other: ['soy sauce', 'barley'] },
      preferredCuisines: ['mediterranean', 'mexican'],
      preferredFoods: ['rice', 'eggs', 'chicken', 'avocado'],
      preferredNutrients: ['iron', 'b12'],
      customFoodInput: 'coeliac — trace gluten is not acceptable',
      monthlyFoodBudget: 500, monthlyFitnessBudget: 60,
      eatingOutOccasions: '2', mealsOutPerWeek: 2,
      distancePreference: 'medium',
      weeklyMealSchedule: mixedSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'intermediate', gymAccess: 'full_gym',
      workoutTypes: ['strength', 'running'],
      availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      preferredDuration: 45,
      // Six available days against an unpinned weeklyPlan is the D1 probe.
      injuryConsiderations: ['left knee — no deep squats or jumping'],
      timePreferences: ['morning'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 420, protein: 26, carbs: 44, fat: 15 },
      lunch: { calories: 580, protein: 36, carbs: 60, fat: 20 },
      dinner: { calories: 640, protein: 40, carbs: 64, fat: 22 },
    } },
  },
  {
    // Exists to catch C7: pinnedGroceryStores(3) plus "Always provide 3 stores"
    // in a place that does not have three stores.
    name: 'rural-sparse',
    surveyData: {
      ...base,
      firstName: 'Dale', lastName: 'Ferris',
      streetAddress: '412 Main St', city: 'Eureka', state: 'NV', zipCode: '89316',
      age: 52, sex: 'male', height: 71, weight: 215,
      goal: 'WEIGHT_LOSS', primaryGoal: 'lose_weight',
      goalChallenge: 'nearest supermarket is 40 minutes away',
      additionalGoalsNotes: 'shops once a fortnight',
      healthFocus: 'cardiovascular', maintainFocus: null,
      activityLevel: 'lightly_active',
      fitnessLevel: 'beginner', fitnessTimeline: '12_months',
      preferredActivities: ['walking'], sportsInterests: '',
      dietPrefs: [],
      foodAllergies: [],
      strictExclusions: null,
      preferredCuisines: ['american'],
      preferredFoods: ['ground beef', 'potatoes', 'frozen vegetables'],
      preferredNutrients: ['fiber'],
      customFoodInput: 'nothing that spoils in three days',
      monthlyFoodBudget: 280, monthlyFitnessBudget: 0,
      eatingOutOccasions: '0', mealsOutPerWeek: 0,
      distancePreference: 'far',
      weeklyMealSchedule: allHomeSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'beginner', gymAccess: 'no_gym',
      workoutTypes: ['bodyweight', 'walking'], availableDays: ['saturday', 'sunday'],
      preferredDuration: 25, injuryConsiderations: [],
      timePreferences: ['morning'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 400, protein: 24, carbs: 42, fat: 14 },
      lunch: { calories: 560, protein: 34, carbs: 58, fat: 19 },
      dinner: { calories: 600, protein: 38, carbs: 60, fat: 21 },
    } },
  },
  {
    // Exists to catch C6: Math.max(15, ...) has a floor and no ceiling, so a
    // basket above ~90 items reproduces the 45s timeout chunking was meant to fix.
    name: 'large-household',
    surveyData: {
      ...base,
      firstName: 'Priya', lastName: 'Raghavan',
      age: 41, sex: 'female', height: 64, weight: 138,
      goal: 'GENERAL_WELLNESS', primaryGoal: 'maintain',
      goalChallenge: 'cooking for five with three different diets',
      additionalGoalsNotes: 'household of five, one vegetarian teenager',
      healthFocus: 'body_composition', maintainFocus: 'energy',
      activityLevel: 'moderately_active',
      fitnessLevel: 'intermediate', fitnessTimeline: '6_months',
      preferredActivities: ['swimming', 'strength'], sportsInterests: 'badminton',
      dietPrefs: ['Vegetarian'],
      foodAllergies: [],
      strictExclusions: { meats: ['all'], other: [] },
      preferredCuisines: ['indian', 'thai', 'italian', 'mediterranean', 'mexican'],
      preferredFoods: ['paneer', 'lentils', 'chickpeas', 'spinach', 'rice', 'tofu', 'yogurt'],
      preferredNutrients: ['protein', 'iron', 'calcium'],
      customFoodInput: 'batch cooking, big shops',
      monthlyFoodBudget: 1100, monthlyFitnessBudget: 90,
      eatingOutOccasions: '1', mealsOutPerWeek: 1,
      distancePreference: 'close',
      weeklyMealSchedule: allHomeSchedule,
      workoutPreferencesJson: null,
    },
    workoutPrefs: {
      fitnessExperience: 'intermediate', gymAccess: 'full_gym',
      workoutTypes: ['strength', 'swimming'],
      availableDays: ['monday', 'wednesday', 'friday'],
      preferredDuration: 50, injuryConsiderations: ['right wrist — no heavy pressing'],
      timePreferences: ['evening'],
    },
    nutritionTargets: { mealTargets: {
      breakfast: { calories: 430, protein: 25, carbs: 48, fat: 14 },
      lunch: { calories: 600, protein: 34, carbs: 66, fat: 20 },
      dinner: { calories: 650, protein: 38, carbs: 70, fat: 22 },
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
 * Six restaurants of eight dishes, because that is what production sends. It
 * held three of three until 2026-08-26, and the selection latency budget was
 * set from a p95 measured against that — 22.8s against 26.7s available, which
 * looked like a 15% margin and was really a measurement of a prompt a third the
 * size of the real one. A fixture that is cheap to run is not evidence about a
 * phase whose cost scales with the menu it is handed.
 *
 * The ordering links here are the ground truth: Sakura and Great China have
 * Grubhub and a direct site, Kiraku only Grubhub, Zaytoon and Angeline's only a
 * direct site, Comal nothing. A generated meal that produces a URL for a
 * platform marked null invented it — the prompt explicitly tells the model to
 * use null for platforms marked "not available". DoorDash and UberEats are null
 * throughout on purpose: both 403 datacenter IPs, so the prober strips them and
 * production never ships one.
 *
 * Ratings agree with `nearbyRestaurantsFixture` for the restaurants that appear
 * in both. They did not before — Sakura was 4.4 here and 4.5 there — which made
 * the selection site's `rating-mismatch` check gradeable only by luck.
 *
 * The dish list must be called `menuData`, not `menuItems`. `menuItems` is the
 * name the extraction *schema* uses for the model's own output; the route
 * immediately restores it under `menuData` (generate-restaurants route.ts, the
 * `menuData: menuItems` line), and that is the shape the selection prompt
 * reads. This fixture spelled it `menuItems`, so every restaurant in the
 * benched prompt printed "No menu items available" and the model echoed that
 * string back as a dish name with 0 calories. The bench had never once tested
 * dish grounding, and the resulting `invented-dish` findings were about the
 * harness rather than the generator.
 *
 * Each dish must also carry estimatedProtein/Carbs/Fat, which extraction has
 * required since B8 and the selection prompt prints. Without them the prompt
 * showed "? g protein" for every dish and the model answered 0, which scored as
 * `atwater-mismatch` against a generator that had been shown nothing.
 * `meal-generation.test.ts` parses these records against MenuExtractionSchema
 * so the next field to go missing breaks the bench instead of quietly draining
 * it of signal.
 *
 * That guard could not catch `rating`, which went missing anyway. These records
 * are a JOIN — menu extraction's output merged onto the chosen restaurant — and
 * `rating` comes from the selection half, so parsing against the extraction
 * schema alone passes without it forever. The selection prompt prints
 * `Rating: ${restaurant.rating || 'N/A'}`, so every restaurant read "N/A" and
 * the bench never once exercised the model's ability to prefer a
 * well-reviewed place. Production ratings come from Places and are populated.
 * The guard test now asserts the joined shape, not just the extraction half.
 */
export const restaurantMenuDataFixture = [
  {
    name: 'Sakura Ramen House', cuisine: 'japanese', address: '2100 Shattuck Ave, Berkeley',
    rating: 4.5,
    orderingLinks: {
      doordash: null, ubereats: null,
      grubhub: 'https://www.grubhub.com/restaurant/sakura-ramen-house-berkeley/1234567', direct: 'https://sakuraramenhouse.com',
    },
    menuData: [
      { name: 'Tonkotsu Ramen', price: 16.5, category: 'dinner', estimatedCalories: 778, estimatedProtein: 36, estimatedCarbs: 82, estimatedFat: 34, healthRating: 'fair', description: 'Pork bone broth with chashu and soft egg' },
      { name: 'Shoyu Chicken Ramen', price: 15.5, category: 'dinner', estimatedCalories: 646, estimatedProtein: 34, estimatedCarbs: 78, estimatedFat: 22, healthRating: 'good', description: 'Soy broth, grilled chicken, bamboo shoots' },
      { name: 'Vegetable Gyoza', price: 8.5, category: 'lunch', estimatedCalories: 316, estimatedProtein: 12, estimatedCarbs: 40, estimatedFat: 12, healthRating: 'good', description: 'Six pieces, pan fried' },
      { name: 'Salmon Poke Bowl', price: 18.25, category: 'lunch', estimatedCalories: 623, estimatedProtein: 40, estimatedCarbs: 64, estimatedFat: 23, healthRating: 'excellent', description: 'Over brown rice with edamame' },
      { name: 'Chicken Karaage', price: 11.0, category: 'snack', estimatedCalories: 432, estimatedProtein: 28, estimatedCarbs: 26, estimatedFat: 24, healthRating: 'fair', description: 'Japanese fried chicken, lemon' },
      { name: 'Spicy Miso Ramen', price: 17.0, category: 'dinner', estimatedCalories: 722, estimatedProtein: 33, estimatedCarbs: 80, estimatedFat: 30, healthRating: 'fair', description: 'Fermented chili miso, ground pork' },
      { name: 'Agedashi Tofu', price: 7.5, category: 'snack', estimatedCalories: 243, estimatedProtein: 14, estimatedCarbs: 22, estimatedFat: 11, healthRating: 'good', description: 'Fried tofu in dashi broth' },
      { name: 'Seaweed Salad', price: 6.0, category: 'lunch', estimatedCalories: 117, estimatedProtein: 4, estimatedCarbs: 14, estimatedFat: 5, healthRating: 'excellent', description: 'Wakame with sesame' },
    ],
  },
  {
    name: 'Zaytoon Mediterranean', cuisine: 'middle_eastern', address: '1133 Solano Ave, Berkeley',
    rating: 4.4,
    orderingLinks: {
      doordash: null, ubereats: null,
      grubhub: null, direct: 'https://zaytoonberkeley.com',
    },
    menuData: [
      { name: 'Chicken Shawarma Plate', price: 17.0, category: 'dinner', estimatedCalories: 722, estimatedProtein: 50, estimatedCarbs: 72, estimatedFat: 26, healthRating: 'good', description: 'With rice and salad' },
      { name: 'Falafel Wrap', price: 12.5, category: 'lunch', estimatedCalories: 539, estimatedProtein: 19, estimatedCarbs: 64, estimatedFat: 23, healthRating: 'good', description: 'Tahini and pickles' },
      { name: 'Lamb Kofta', price: 21.0, category: 'dinner', estimatedCalories: 810, estimatedProtein: 51, estimatedCarbs: 57, estimatedFat: 42, healthRating: 'fair', description: 'Grilled, with hummus' },
      { name: 'Chicken Kabob Bowl', price: 16.5, category: 'lunch', estimatedCalories: 586, estimatedProtein: 46, estimatedCarbs: 60, estimatedFat: 18, healthRating: 'excellent', description: 'Grilled breast over basmati' },
      { name: 'Hummus and Pita', price: 9.0, category: 'snack', estimatedCalories: 386, estimatedProtein: 13, estimatedCarbs: 52, estimatedFat: 14, healthRating: 'good', description: 'Chickpea, tahini, olive oil' },
      { name: 'Fattoush Salad', price: 11.0, category: 'lunch', estimatedCalories: 312, estimatedProtein: 8, estimatedCarbs: 34, estimatedFat: 16, healthRating: 'excellent', description: 'Romaine, sumac, crisp pita' },
      { name: 'Beef Shawarma Plate', price: 19.0, category: 'dinner', estimatedCalories: 758, estimatedProtein: 47, estimatedCarbs: 66, estimatedFat: 34, healthRating: 'fair', description: 'Shaved beef, garlic sauce' },
      { name: 'Stuffed Grape Leaves', price: 8.5, category: 'snack', estimatedCalories: 284, estimatedProtein: 6, estimatedCarbs: 38, estimatedFat: 12, healthRating: 'good', description: 'Rice and herbs, six pieces' },
    ],
  },
  {
    name: 'Comal Next Door', cuisine: 'mexican', address: '2020 Shattuck Ave, Berkeley',
    rating: 4.3,
    orderingLinks: {
      doordash: null, ubereats: null,
      grubhub: null, direct: null,
    },
    menuData: [
      { name: 'Carnitas Tacos', price: 14.0, category: 'lunch', estimatedCalories: 608, estimatedProtein: 34, estimatedCarbs: 55, estimatedFat: 28, healthRating: 'fair', description: 'Three tacos, salsa verde' },
      { name: 'Grilled Fish Bowl', price: 18.0, category: 'dinner', estimatedCalories: 645, estimatedProtein: 44, estimatedCarbs: 70, estimatedFat: 21, healthRating: 'excellent', description: 'Rice, beans, cabbage' },
      { name: 'Chicken Tinga Bowl', price: 16.0, category: 'lunch', estimatedCalories: 611, estimatedProtein: 42, estimatedCarbs: 68, estimatedFat: 19, healthRating: 'excellent', description: 'Chipotle chicken, black beans' },
      { name: 'Veggie Burrito', price: 13.0, category: 'lunch', estimatedCalories: 622, estimatedProtein: 20, estimatedCarbs: 86, estimatedFat: 22, healthRating: 'good', description: 'Rice, beans, roasted peppers' },
      { name: 'Carne Asada Plate', price: 21.0, category: 'dinner', estimatedCalories: 688, estimatedProtein: 48, estimatedCarbs: 52, estimatedFat: 32, healthRating: 'fair', description: 'Grilled steak, tortillas' },
      { name: 'Chips and Guacamole', price: 9.5, category: 'snack', estimatedCalories: 486, estimatedProtein: 8, estimatedCarbs: 46, estimatedFat: 30, healthRating: 'fair', description: 'Fresh avocado, lime' },
      { name: 'Shrimp Ceviche', price: 15.0, category: 'lunch', estimatedCalories: 272, estimatedProtein: 30, estimatedCarbs: 20, estimatedFat: 8, healthRating: 'excellent', description: 'Lime cured, cucumber' },
      { name: 'Black Bean Soup', price: 7.5, category: 'snack', estimatedCalories: 238, estimatedProtein: 12, estimatedCarbs: 34, estimatedFat: 6, healthRating: 'excellent', description: 'Cumin, epazote' },
    ],
  },
  {
    name: 'Great China', cuisine: 'chinese', address: '2190 Bancroft Way, Berkeley',
    rating: 4.2,
    orderingLinks: {
      doordash: null, ubereats: null,
      grubhub: 'https://www.grubhub.com/restaurant/great-china-berkeley/2345678', direct: 'https://greatchinaberkeley.com',
    },
    menuData: [
      { name: 'Steamed Fish Fillet', price: 22.0, category: 'dinner', estimatedCalories: 382, estimatedProtein: 46, estimatedCarbs: 18, estimatedFat: 14, healthRating: 'excellent', description: 'Ginger and scallion' },
      { name: 'Kung Pao Chicken', price: 17.5, category: 'dinner', estimatedCalories: 578, estimatedProtein: 38, estimatedCarbs: 48, estimatedFat: 26, healthRating: 'good', description: 'Peanuts, dried chili' },
      { name: 'Vegetable Chow Mein', price: 14.0, category: 'lunch', estimatedCalories: 588, estimatedProtein: 14, estimatedCarbs: 88, estimatedFat: 20, healthRating: 'good', description: 'Egg noodles, bok choy' },
      { name: 'Beijing Duck Bun', price: 12.0, category: 'snack', estimatedCalories: 344, estimatedProtein: 18, estimatedCarbs: 32, estimatedFat: 16, healthRating: 'fair', description: 'Two buns, hoisin' },
      { name: 'Mapo Tofu', price: 15.0, category: 'dinner', estimatedCalories: 456, estimatedProtein: 26, estimatedCarbs: 34, estimatedFat: 24, healthRating: 'good', description: 'Sichuan peppercorn, ground pork' },
      { name: 'Garlic Green Beans', price: 11.0, category: 'lunch', estimatedCalories: 206, estimatedProtein: 7, estimatedCarbs: 22, estimatedFat: 10, healthRating: 'excellent', description: 'Wok blistered' },
      { name: 'Hot and Sour Soup', price: 8.0, category: 'snack', estimatedCalories: 183, estimatedProtein: 10, estimatedCarbs: 20, estimatedFat: 7, healthRating: 'good', description: 'Tofu, bamboo, vinegar' },
      { name: 'Salt and Pepper Prawns', price: 23.0, category: 'dinner', estimatedCalories: 454, estimatedProtein: 40, estimatedCarbs: 24, estimatedFat: 22, healthRating: 'good', description: 'Shell on, jalapeno' },
    ],
  },
  {
    name: 'Angeline\'s Louisiana Kitchen', cuisine: 'cajun', address: '2261 Shattuck Ave, Berkeley',
    rating: 4.1,
    orderingLinks: {
      doordash: null, ubereats: null,
      grubhub: null, direct: 'https://angelineskitchen.com',
    },
    menuData: [
      { name: 'Blackened Catfish', price: 23.0, category: 'dinner', estimatedCalories: 500, estimatedProtein: 44, estimatedCarbs: 36, estimatedFat: 20, healthRating: 'good', description: 'Cajun spice, dirty rice' },
      { name: 'Shrimp Etouffee', price: 21.5, category: 'dinner', estimatedCalories: 618, estimatedProtein: 34, estimatedCarbs: 62, estimatedFat: 26, healthRating: 'fair', description: 'Roux gravy over rice' },
      { name: 'Jambalaya', price: 19.0, category: 'dinner', estimatedCalories: 640, estimatedProtein: 36, estimatedCarbs: 70, estimatedFat: 24, healthRating: 'fair', description: 'Andouille, chicken, trinity' },
      { name: 'Gumbo Cup', price: 10.0, category: 'snack', estimatedCalories: 294, estimatedProtein: 16, estimatedCarbs: 26, estimatedFat: 14, healthRating: 'good', description: 'Dark roux, okra' },
      { name: 'Red Beans and Rice', price: 14.0, category: 'lunch', estimatedCalories: 508, estimatedProtein: 22, estimatedCarbs: 78, estimatedFat: 12, healthRating: 'good', description: 'Slow simmered, smoked ham' },
      { name: 'Fried Green Tomatoes', price: 11.5, category: 'snack', estimatedCalories: 364, estimatedProtein: 8, estimatedCarbs: 38, estimatedFat: 20, healthRating: 'fair', description: 'Remoulade' },
      { name: 'Grilled Chicken Salad', price: 16.0, category: 'lunch', estimatedCalories: 358, estimatedProtein: 40, estimatedCarbs: 18, estimatedFat: 14, healthRating: 'excellent', description: 'Creole vinaigrette' },
      { name: 'Collard Greens', price: 7.0, category: 'lunch', estimatedCalories: 142, estimatedProtein: 6, estimatedCarbs: 16, estimatedFat: 6, healthRating: 'excellent', description: 'Braised with vinegar' },
    ],
  },
  {
    name: 'Kiraku Izakaya', cuisine: 'japanese', address: '2566 Telegraph Ave, Berkeley',
    rating: 4.4,
    orderingLinks: {
      doordash: null, ubereats: null,
      grubhub: 'https://www.grubhub.com/restaurant/kiraku-berkeley/3456789', direct: null,
    },
    menuData: [
      { name: 'Grilled Mackerel', price: 18.0, category: 'dinner', estimatedCalories: 418, estimatedProtein: 42, estimatedCarbs: 4, estimatedFat: 26, healthRating: 'excellent', description: 'Salt grilled, daikon' },
      { name: 'Chicken Yakitori', price: 13.0, category: 'snack', estimatedCalories: 294, estimatedProtein: 30, estimatedCarbs: 12, estimatedFat: 14, healthRating: 'good', description: 'Four skewers, tare glaze' },
      { name: 'Beef Tataki', price: 19.5, category: 'dinner', estimatedCalories: 372, estimatedProtein: 38, estimatedCarbs: 10, estimatedFat: 20, healthRating: 'good', description: 'Seared rare, ponzu' },
      { name: 'Vegetable Tempura', price: 12.5, category: 'lunch', estimatedCalories: 464, estimatedProtein: 8, estimatedCarbs: 54, estimatedFat: 24, healthRating: 'fair', description: 'Assorted, tentsuyu' },
      { name: 'Chirashi Bowl', price: 24.0, category: 'dinner', estimatedCalories: 608, estimatedProtein: 44, estimatedCarbs: 72, estimatedFat: 16, healthRating: 'excellent', description: 'Assorted sashimi over rice' },
      { name: 'Edamame', price: 6.5, category: 'snack', estimatedCalories: 158, estimatedProtein: 12, estimatedCarbs: 14, estimatedFat: 6, healthRating: 'excellent', description: 'Sea salt' },
      { name: 'Tofu Steak', price: 14.0, category: 'lunch', estimatedCalories: 322, estimatedProtein: 20, estimatedCarbs: 20, estimatedFat: 18, healthRating: 'good', description: 'Mushroom butter sauce' },
      { name: 'Chicken Nanban', price: 17.0, category: 'dinner', estimatedCalories: 564, estimatedProtein: 34, estimatedCarbs: 44, estimatedFat: 28, healthRating: 'fair', description: 'Sweet vinegar, tartar' },
    ],
  },
];
