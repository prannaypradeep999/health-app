// Nutrition calculation utilities
export interface UserProfile {
  age: number;
  sex: string;
  height: number; // inches
  weight: number; // pounds
  activityLevel: string;
  goal: string;
}

// Calculate BMR using Mifflin-St Jeor equation
export function calculateBMR(profile: UserProfile): number {
  const { age, sex, height, weight } = profile;

  // Convert height from inches to cm and weight from lbs to kg
  const heightCm = height * 2.54;
  const weightKg = weight * 0.453592;

  let bmr: number;

  if (sex.toLowerCase() === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  return Math.round(bmr);
}

// Activity level multipliers
const ACTIVITY_MULTIPLIERS = {
  'SEDENTARY': 1.2,
  'LIGHTLY_ACTIVE': 1.375,
  'MODERATELY_ACTIVE': 1.55,
  'VERY_ACTIVE': 1.725,
  'EXTREMELY_ACTIVE': 1.9
};

// Calculate TDEE (Total Daily Energy Expenditure)
export function calculateTDEE(profile: UserProfile): number {
  const bmr = calculateBMR(profile);
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel as keyof typeof ACTIVITY_MULTIPLIERS] || 1.55;

  return Math.round(bmr * multiplier);
}

// Adjust calories based on goal
export function calculateTargetCalories(profile: UserProfile): number {
  const tdee = calculateTDEE(profile);

  switch (profile.goal) {
    case 'WEIGHT_LOSS':
      return Math.round(tdee * 0.8); // 20% deficit
    case 'MUSCLE_GAIN':
      return Math.round(tdee * 1.15); // 15% surplus
    case 'ENDURANCE':
      return Math.round(tdee * 1.1); // 10% surplus
    case 'GENERAL_WELLNESS':
    default:
      return tdee; // Maintenance
  }
}

// Calculate macronutrient targets based on goal
export interface MacroTargets {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
}

export function calculateMacroTargets(profile: UserProfile): MacroTargets {
  const calories = calculateTargetCalories(profile);
  const weightKg = profile.weight * 0.453592;

  let proteinRatio: number;
  let fatRatio: number;

  switch (profile.goal) {
    case 'WEIGHT_LOSS':
      proteinRatio = 0.35; // 35% protein for satiety and muscle preservation
      fatRatio = 0.25; // 25% fat
      break;
    case 'MUSCLE_GAIN':
      proteinRatio = 0.30; // 30% protein for muscle building
      fatRatio = 0.25; // 25% fat
      break;
    case 'ENDURANCE':
      proteinRatio = 0.20; // 20% protein
      fatRatio = 0.25; // 25% fat
      break;
    case 'GENERAL_WELLNESS':
    default:
      proteinRatio = 0.25; // 25% protein
      fatRatio = 0.30; // 30% fat
      break;
  }

  const carbRatio = 1 - proteinRatio - fatRatio;

  return {
    calories,
    protein: Math.round((calories * proteinRatio) / 4), // 4 cal/g protein
    carbs: Math.round((calories * carbRatio) / 4), // 4 cal/g carbs
    fat: Math.round((calories * fatRatio) / 9) // 9 cal/g fat
  };
}

// Meal distribution (breakfast, lunch, dinner percentages)
export function getMealCalorieDistribution(targetCalories: number) {
  return {
    breakfast: Math.round(targetCalories * 0.25), // 25%
    lunch: Math.round(targetCalories * 0.35), // 35%
    dinner: Math.round(targetCalories * 0.40) // 40%
  };
}