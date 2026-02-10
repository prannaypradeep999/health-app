// 7-Day Meal Generation Prompts
// These prompts support the complete 7-day meal planning system

/**
 * CHANGES MADE:
 * - Added grocery list generation to createHomeMealGenerationPrompt()
 * - Grocery list is categorized by: produce, protein, dairy, grains, pantry, frozen
 * - Added estimatedGroceryCost to help with budget tracking
 * - Enhanced restaurant meal prompt to preserve ordering links
 */

export interface MealGenerationContext {
  homeMeals: Array<{day: string, mealType: string}>;
  surveyData: any;
  nutritionTargets: any;
  scheduleText: string;
  weeklyNutritionTargets?: any; // NEW: Optional detailed weekly targets
}

export interface RestaurantMealContext {
  restaurantMealsSchedule: Array<{day: string, mealType: string}>;
  restaurantMenuData: any[];
  surveyData: any;
  nutritionTargets?: any;
}

// Helper function to format nutrition targets (uniform vs per-day)
function formatNutritionTargets(context: MealGenerationContext): string {
  const { nutritionTargets, weeklyNutritionTargets, homeMeals } = context;

  // Check if we have detailed weekly targets and they vary per day
  if (weeklyNutritionTargets?.days) {
    const days = Object.keys(weeklyNutritionTargets.days);
    const firstDayTargets = weeklyNutritionTargets.days[days[0]];

    // Check if targets vary significantly across days
    const hasVariation = days.some(day => {
      const dayTargets = weeklyNutritionTargets.days[day];
      return (
        Math.abs((dayTargets.breakfast?.calories || 0) - (firstDayTargets.breakfast?.calories || 0)) > 50 ||
        Math.abs((dayTargets.lunch?.calories || 0) - (firstDayTargets.lunch?.calories || 0)) > 50 ||
        Math.abs((dayTargets.dinner?.calories || 0) - (firstDayTargets.dinner?.calories || 0)) > 50
      );
    });

    if (hasVariation) {
      // Use per-day format
      let perDayText = 'NUTRITION TARGETS PER DAY (adjusted for restaurant meals):\n';

      // Group home meals by day
      const homeMealsByDay: Record<string, string[]> = {};
      homeMeals.forEach(meal => {
        const dayKey = meal.day.toLowerCase();
        if (!homeMealsByDay[dayKey]) homeMealsByDay[dayKey] = [];
        homeMealsByDay[dayKey].push(meal.mealType);
      });

      Object.entries(homeMealsByDay).forEach(([day, mealTypes]) => {
        const dayTargets = weeklyNutritionTargets.days[day];
        if (!dayTargets) return;

        const dayName = day.toUpperCase();
        const mealTexts: string[] = [];

        mealTypes.forEach(mealType => {
          const mealTarget = dayTargets[mealType.toLowerCase()];
          if (mealTarget && mealTarget.calories > 0) {
            mealTexts.push(`${mealType} ${mealTarget.calories} cal/${mealTarget.protein}g protein`);
          }
        });

        if (mealTexts.length > 0) {
          perDayText += `${dayName}: ${mealTexts.join(', ')}`;

          // Note skipped meals
          const restaurantMeals = ['breakfast', 'lunch', 'dinner'].filter(meal =>
            !mealTypes.includes(meal) && dayTargets[meal]?.source === 'restaurant'
          );
          if (restaurantMeals.length > 0) {
            perDayText += ` (${restaurantMeals.join(', ')} handled by restaurants)`;
          }

          perDayText += '\n';
        }
      });

      return perDayText;
    }
  }

  // Use uniform format (backward compatible)
  return `NUTRITION TARGETS PER MEAL:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.calories} calories, ${nutritionTargets.mealTargets.breakfast.protein}g protein
- Lunch: ${nutritionTargets.mealTargets.lunch.calories} calories, ${nutritionTargets.mealTargets.lunch.protein}g protein
- Dinner: ${nutritionTargets.mealTargets.dinner.calories} calories, ${nutritionTargets.mealTargets.dinner.protein}g protein
`;
}

// Helper function to format dislikes as soft exclusions
function formatStrictExclusions(surveyData: any): string {
  const exclusions = surveyData.strictExclusions;
  if (!exclusions) return '';

  const allExclusions: string[] = [];

  Object.entries(exclusions).forEach(([category, items]) => {
    if (Array.isArray(items) && items.length > 0) {
      items.forEach(item => {
        allExclusions.push(`${item} (${category})`);
      });
    }
  });

  if (allExclusions.length === 0) return '';

  return `
FOODS TO AVOID (PREFERENCES, NOT ALLERGIES):
We should minimize or substitute these when possible, but they are NOT safety-critical.
If unavoidable, use the smallest amount and offer alternatives.
${allExclusions.map(item => `  - ${item}`).join('\n')}

`;
}

// Home meal generation prompt for 7-day system (NOW INCLUDES GROCERY LIST)
export function createHomeMealGenerationPrompt(context: MealGenerationContext): string {
  const { homeMeals, nutritionTargets, scheduleText, surveyData } = context;

  // Get strict exclusions warning
  const strictExclusionsWarning = formatStrictExclusions(surveyData);

  return `Generate home-cooked meal recipes for a 7-day meal plan WITH a consolidated grocery list.

USER WEEKLY SCHEDULE:
${scheduleText}

TOTAL HOME MEALS TO GENERATE: ${homeMeals.length}

${formatNutritionTargets(context)}
USER PREFERENCES & GOALS:
- Name: ${surveyData.firstName || 'User'}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Weight: ${surveyData.weight} lbs, Height: ${surveyData.height} inches
- Primary Goal: ${surveyData.goal || 'General Wellness'}
- Secondary Goal Detail: ${surveyData.primaryGoal || 'none provided'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Activity Level: ${surveyData.activityLevel || 'MODERATELY_ACTIVE'}
- Sports/Activities: ${surveyData.sportsInterests || surveyData.preferredActivities?.join(', ') || 'General fitness'}
- Budget: ${surveyData.monthlyFoodBudget || 200}/month (approximately ${Math.round((surveyData.monthlyFoodBudget || 200) / 4)}/week)

⚠️ DIET TYPE (Strict Compliance Required):
${(() => {
  const restrictions = (surveyData.dietPrefs || []).filter((pref: string) => pref && pref.toLowerCase() !== 'none');
  if (restrictions.length === 0) return '- No dietary restrictions - full ingredient selection available';

  let rules = '';
  restrictions.forEach((pref: string) => {
    const prefLower = pref.toLowerCase();
    if (prefLower === 'vegetarian') {
      rules += `- VEGETARIAN: Exclude all meat, poultry, and fish. Eggs and dairy are allowed.\n`;
    }
    if (prefLower === 'vegan') {
      rules += `- VEGAN: Exclude all animal products including meat, fish, eggs, dairy, honey, and gelatin.\n`;
    }
    if (prefLower === 'keto' || prefLower === 'low-carb') {
      rules += `- KETO: Maximum 20-30g net carbs per day. High fat, moderate protein. Exclude grains, sugar, most fruits.\n`;
    }
    if (prefLower === 'paleo') {
      rules += `- PALEO: Exclude grains, legumes, dairy, refined sugar, and processed foods. Focus on whole foods.\n`;
    }
    if (prefLower === 'pescatarian') {
      rules += `- PESCATARIAN: Exclude meat and poultry. Fish, seafood, eggs, and dairy are allowed.\n`;
    }
    if (prefLower === 'mediterranean') {
      rules += `- MEDITERRANEAN: Emphasize vegetables, legumes, whole grains, olive oil, and fish; limit red meat and processed foods.\n`;
    }
    if (prefLower === 'halal') {
      rules += `- HALAL: Exclude pork and non-halal meat. Use only halal-certified proteins. No alcohol in cooking.\n`;
    }
    if (prefLower === 'kosher') {
      rules += `- KOSHER: Exclude pork and shellfish. Do not mix meat and dairy in the same meal.\n`;
    }
    if (prefLower.startsWith('other:')) {
      const custom = pref.replace(/^other:/i, '').trim();
      rules += `- OTHER DIET TYPE: ${custom || 'custom diet'} - follow this pattern strictly.\n`;
    }
  });
  return rules || '- Standard dietary guidelines apply';
})()}

🚫 CRITICAL SAFETY — ALLERGIES (NON-NEGOTIABLE):
${surveyData.foodAllergies?.length > 0
  ? `User has allergies to: ${surveyData.foodAllergies.join(', ')}.
NEVER include these ingredients or dishes containing them.`
  : 'No known allergies.'}

${strictExclusionsWarning}

🧾 USER'S CUSTOM FOOD NOTES:
${surveyData.customFoodInput
  ? `${surveyData.customFoodInput}
Incorporate these preferences directly into meal planning.`
  : 'No custom food notes provided.'}

🍳 COOKING CONTEXT:
- Based on meal schedule: ${(() => {
  const schedule = surveyData.weeklyMealSchedule;
  if (!schedule) return 'Mixed cooking and dining out';

  const allMeals = Object.values(schedule).flatMap(day => [day.breakfast, day.lunch, day.dinner]);
  const homeMeals = allMeals.filter(meal => meal === 'home').length;
  const totalMeals = allMeals.filter(meal => meal !== 'no-meal').length;
  const homeRatio = totalMeals > 0 ? homeMeals / totalMeals : 0;

  if (homeRatio >= 0.8) return 'User cooks most meals at home — can handle varied recipes and cooking techniques.';
  if (homeRatio >= 0.5) return 'User cooks about half their meals — balance simple home recipes with dining out.';
  if (homeRatio >= 0.2) return 'User cooks occasionally — prefer simple, quick recipes when cooking at home.';
  return 'User rarely cooks — focus on simple, minimal-prep recipes when they do cook.';
})()}

⏱️ TIMELINE CONTEXT:
- Goal timeline: ${surveyData.fitnessTimeline || 'flexible'}

🥗 PREFERRED FOODS (PRIORITIZE THESE INGREDIENTS):
${(() => {
  const foods = surveyData.preferredFoods || [];
  if (foods.length === 0) return '- No specific preferences - use varied healthy ingredients';

  return `The user specifically selected these foods as favorites - USE THEM FREQUENTLY:
${foods.map((food: string) => `- ${food}`).join('\n')}

⚠️ Build meals around these preferred ingredients. If user selected "Salmon", include salmon dishes 2-3x/week.
If user selected "Rice" and "Chicken", make rice bowls with chicken a staple.`;
})()}

🍳 PREFERRED CUISINES (MATCH COOKING STYLES):
${(() => {
  const cuisines = surveyData.preferredCuisines || [];
  if (cuisines.length === 0) return '- Varied cuisines - mix different cooking styles';

  return `User enjoys these cuisines - incorporate their cooking styles and flavor profiles:
${cuisines.map((cuisine: string) => `- ${cuisine}`).join('\n')}

Design meals that feel like these cuisines. For Mediterranean, use olive oil, herbs, lemon.
For Mexican, use cumin, lime, cilantro. For Asian cuisines, use ginger, soy sauce, sesame.`;
})()}

💊 NUTRIENT PRIORITIES (INCLUDE THESE IN MEALS):
${(() => {
  const nutrients = surveyData.preferredNutrients || [];
  if (nutrients.length === 0) return '- Standard balanced nutrition';

  let nutrientGuide = `User wants meals rich in these nutrients - actively include foods that provide them:\n`;

  nutrients.forEach((nutrient: string) => {
    if (nutrient.includes('Iron')) {
      nutrientGuide += `- IRON-RICH: Include spinach, red meat (if allowed), lentils, fortified cereals, pumpkin seeds\n`;
    }
    if (nutrient.includes('Vitamin D')) {
      nutrientGuide += `- VITAMIN D: Include fatty fish (salmon, mackerel), egg yolks, fortified milk/alternatives, mushrooms\n`;
    }
    if (nutrient.includes('B12')) {
      nutrientGuide += `- VITAMIN B12: Include meat, fish, eggs, dairy, or fortified plant milks (critical for vegans)\n`;
    }
    if (nutrient.includes('Omega-3')) {
      nutrientGuide += `- OMEGA-3: Include salmon, sardines, walnuts, flaxseed, chia seeds - aim for fatty fish 2-3x/week\n`;
    }
    if (nutrient.includes('Calcium')) {
      nutrientGuide += `- CALCIUM: Include dairy, fortified plant milk, leafy greens (kale, bok choy), almonds, sardines with bones\n`;
    }
    if (nutrient.includes('Magnesium')) {
      nutrientGuide += `- MAGNESIUM: Include dark chocolate, avocado, nuts, seeds, legumes, whole grains\n`;
    }
    if (nutrient.includes('Zinc')) {
      nutrientGuide += `- ZINC: Include oysters, beef, pumpkin seeds, chickpeas, cashews, yogurt\n`;
    }
    if (nutrient.includes('Fiber')) {
      nutrientGuide += `- FIBER-RICH: Include beans, lentils, whole grains, vegetables, berries - aim for 25-35g/day\n`;
    }
    if (nutrient.includes('Protein')) {
      nutrientGuide += `- PROTEIN-RICH: Prioritize protein at every meal - eggs, Greek yogurt, lean meats, legumes, tofu\n`;
    }
    if (nutrient.includes('Probiotic')) {
      nutrientGuide += `- PROBIOTIC: Include yogurt, kefir, kimchi, sauerkraut, miso, kombucha in the meal plan\n`;
    }
    if (nutrient.includes('Antioxidant')) {
      nutrientGuide += `- ANTIOXIDANT-RICH: Include berries, dark leafy greens, dark chocolate, pecans, artichokes, red cabbage\n`;
    }
    if (nutrient.includes('Vitamin C')) {
      nutrientGuide += `- VITAMIN C: Include citrus, bell peppers, strawberries, broccoli, Brussels sprouts\n`;
    }
    if (nutrient.includes('Vitamin A')) {
      nutrientGuide += `- VITAMIN A: Include sweet potato, carrots, spinach, kale, eggs, liver (if allowed)\n`;
    }
    if (nutrient.includes('Folate')) {
      nutrientGuide += `- FOLATE: Include leafy greens, legumes, asparagus, eggs, fortified grains\n`;
    }
    if (nutrient.includes('Potassium')) {
      nutrientGuide += `- POTASSIUM: Include bananas, potatoes, beans, spinach, avocado, coconut water\n`;
    }
    if (nutrient.includes('Biotin')) {
      nutrientGuide += `- BIOTIN: Include eggs (especially yolks), nuts, seeds, salmon, avocado, sweet potato\n`;
    }
  });

  return nutrientGuide;
})()}

🩺 BIOMARKER CONSIDERATIONS:
${(() => {
  const biomarkers = surveyData.biomarkerJson || surveyData.biomarkers || {};
  if (Object.keys(biomarkers).length === 0) return '- No biomarker data provided';

  let advice = '';
  if (biomarkers.cholesterol && biomarkers.cholesterol > 200) {
    advice += `- HIGH CHOLESTEROL (${biomarkers.cholesterol}): Reduce saturated fats, increase fiber, include oats, nuts, fatty fish. Limit red meat to 1-2x/week.\n`;
  }
  if (biomarkers.vitaminD && biomarkers.vitaminD < 30) {
    advice += `- LOW VITAMIN D (${biomarkers.vitaminD}): Prioritize vitamin D foods: fatty fish, fortified milk, egg yolks, mushrooms exposed to UV.\n`;
  }
  if (biomarkers.iron && biomarkers.iron < 60) {
    advice += `- LOW IRON (${biomarkers.iron}): Include iron-rich foods with vitamin C to boost absorption. Red meat, spinach, lentils + citrus.\n`;
  }

  return advice || '- Biomarker values within normal range';
})()}

📝 USER'S ADDITIONAL NOTES:
${surveyData.additionalGoalsNotes
  ? `"${surveyData.additionalGoalsNotes}"

Consider any food-related preferences or restrictions mentioned here.`
  : '- No additional notes'}

${(() => {
  // Comprehensive goal-specific guidance
  function getGoalSpecificGuidance(surveyData: any) {
    const { goal, primaryGoal, goalChallenge, fitnessLevel, healthFocus, maintainFocus } = surveyData;
    const getGuidanceGoalKey = (goalValue?: string, fallback?: string): string | null => {
      if (typeof goalValue === 'string') {
        const lowerGoal = goalValue.toLowerCase();
        if (['lose_weight', 'build_muscle', 'get_healthier', 'maintain'].includes(lowerGoal)) {
          return lowerGoal;
        }
        switch (goalValue) {
          case 'WEIGHT_LOSS':
            return 'lose_weight';
          case 'MUSCLE_GAIN':
            return 'build_muscle';
          case 'ENDURANCE':
            return 'get_healthier';
          case 'GENERAL_WELLNESS':
            return null;
          default:
            return null;
        }
      }
      return fallback || null;
    };
    const goalKey = getGuidanceGoalKey(goal, primaryGoal);

    let guidance = '';

    // Goal Challenge guidance (lose_weight)
    if (goalKey === 'lose_weight' && goalChallenge) {
      const challengeGuidance = {
        'snacking': `USER STRUGGLES WITH SNACKING: Include 2 satisfying high-protein snacks per day.
                     Make meals filling with fiber and protein to reduce between-meal hunger.
                     Suggest healthy snack swaps. Avoid recipes that create leftovers prone to snacking.`,
        'eating_out': `USER EATS OUT FREQUENTLY: Keep home recipes simple since cooking isn't their main habit.
                       Focus on quick 15-20 min meals. Prep-friendly recipes for busy days.
                       Include meals that compete with restaurant appeal.`,
        'portions': `USER STRUGGLES WITH PORTIONS: Include specific portion sizes in grams/oz for everything.
                     Suggest using smaller plates. Pre-portioned meal prep recipes preferred.
                     Visual portion guides in recipe instructions.`,
        'late_night': `USER TENDS TO EAT LATE AT NIGHT: Front-load calories earlier in the day.
                       Make dinner very satisfying with protein + fiber + volume.
                       Include a planned 150-200 cal evening snack (casein-rich: Greek yogurt, cottage cheese).
                       Avoid simple carbs at dinner that spike then crash blood sugar.`,
        'dont_know': `USER UNSURE WHAT TO EAT: Provide extra variety and educational notes.
                      Explain WHY each meal supports weight loss in the description.
                      Keep choices simple and approachable. No exotic ingredients.`
      };
      guidance += (challengeGuidance as Record<string, string>)[goalChallenge] || '';
    }

    // Fitness Level guidance (build_muscle)
    if (goalKey === 'build_muscle' && fitnessLevel) {
      const levelGuidance = {
        'beginner': `BEGINNER LIFTER: Focus on protein basics (0.8-1g per lb bodyweight).
                     Simpler recipes with clear protein counts. Meal timing less critical.
                     Emphasize whole food protein sources over supplements.`,
        'intermediate': `INTERMEDIATE LIFTER: Higher protein targets (1-1.2g per lb).
                         Include pre/post workout meal suggestions.
                         Strategic carb timing around training windows.`,
        'advanced': `ADVANCED LIFTER: Performance nutrition focus (1.2-1.5g protein per lb).
                     Precise macro breakdowns. Meal timing for optimal recovery.
                     Include intra-workout nutrition suggestions if training >90min.`
      };
      guidance += (levelGuidance as Record<string, string>)[fitnessLevel] || '';
    }

    // Health Focus guidance (get_healthier)
    if (goalKey === 'get_healthier' && healthFocus) {
      const healthGuidance = {
        'energy': `USER WANTS MORE ENERGY: Focus on complex carbohydrates for sustained energy.
                   Iron-rich foods (spinach, lean red meat, legumes). B-vitamin foods.
                   Avoid sugar spikes - always pair carbs with protein/fat.
                   Strategic meal timing: bigger breakfast, moderate lunch, lighter dinner.`,
        'digestion': `USER WANTS BETTER DIGESTION: High fiber focus (25-35g daily).
                      Include fermented foods (yogurt, kimchi, sauerkraut, miso).
                      Probiotic-rich options. Adequate hydration reminders.
                      Avoid common irritants in recipes (excess dairy, fried foods, artificial sweeteners).`,
        'mental_clarity': `USER WANTS MENTAL CLARITY: Omega-3 rich foods (salmon, walnuts, flaxseed).
                           Fatty fish 2-3x per week. Antioxidant-rich berries and leafy greens.
                           Blood sugar stability crucial - no simple carb meals.
                           Include brain foods: eggs, avocado, dark chocolate, blueberries.`,
        'bloodwork': `USER WANTS TO IMPROVE BLOODWORK: Heart-healthy fats (olive oil, avocado, nuts).
                      Lower sodium options (<1500mg daily). High fiber for cholesterol.
                      Lean proteins. Whole foods over processed. Limit red meat to 1-2x/week.
                      Include foods that lower LDL: oats, beans, almonds, fatty fish.`,
        'general': `USER WANTS GENERAL WELLNESS: Balanced, whole-food focused meals.
                    Rainbow of vegetables for micronutrient variety.
                    Anti-inflammatory foods. Moderate portions. Sustainable and enjoyable.`
      };
      guidance += (healthGuidance as Record<string, string>)[healthFocus] || '';
    }

    // Maintain Focus guidance
    if (goalKey === 'maintain' && maintainFocus) {
      const maintainGuidance = {
        'consistency': `USER WANTS CONSISTENCY: Repeatable, sustainable meal patterns.
                        Use similar structures each week (e.g., "Taco Tuesday", "Stir-fry Friday").
                        Batch-cooking friendly recipes. Simple ingredients always available.
                        Predictable grocery lists week to week.`,
        'recomp': `USER WANTS BODY RECOMPOSITION: High protein priority (1g+ per lb bodyweight).
                   Maintenance calories with strategic distribution.
                   Higher carbs on training days, lower on rest days.
                   Prioritize lean proteins and time carbs around workouts.`,
        'habits': `USER WANTS TO BUILD BETTER HABITS: Include habit-building tips with recipes.
                   Suggest habit stacking ("prep tomorrow's lunch while dinner cooks").
                   Small, achievable daily goals. Consistency over perfection messaging.
                   Weekly review suggestions for what worked/didn't.`,
        'intuitive': `USER WANTS INTUITIVE EATING: Include portion guidance using hand measures:
                      - Palm-sized protein (4-6oz)
                      - Fist-sized carbs (1 cup)
                      - Thumb-sized fats (1-2 tbsp)
                      No strict calorie counting in descriptions. Focus on balanced plates.
                      Hunger/fullness awareness cues. Flexibility in portions.`
      };
      guidance += (maintainGuidance as Record<string, string>)[maintainFocus] || '';
    }

    return guidance;
  }

  const guidance = getGoalSpecificGuidance(surveyData);
  return guidance ? `PERSONALIZED GUIDANCE BASED ON USER'S SPECIFIC SITUATION:
${guidance}

` : '';
})()}

NUTRITION CALCULATION METHOD:
⚠️ CRITICAL: Do NOT estimate calories. CALCULATE them by summing ingredients.

Use this reference table for common ingredients. For ingredients NOT listed below,
use your nutritional knowledge to look up accurate values - do not guess.

PROTEINS (per serving):
- Bacon (2 slices): 85 cal, 6g protein, 0g carbs, 7g fat
- Beef sirloin (4 oz): 205 cal, 26g protein, 0g carbs, 11g fat
- Beef tenderloin (4 oz): 180 cal, 26g protein, 0g carbs, 8g fat
- Chicken breast (4 oz): 190 cal, 35g protein, 0g carbs, 4g fat
- Chicken drumstick (1): 130 cal, 14g protein, 0g carbs, 8g fat
- Chicken thigh (4 oz): 210 cal, 26g protein, 0g carbs, 11g fat
- Cod (4 oz): 95 cal, 20g protein, 0g carbs, 1g fat
- Cottage cheese (1/2 cup): 110 cal, 14g protein, 5g carbs, 2g fat
- Cottage cheese 4% (1 cup): 205 cal, 28g protein, 6g carbs, 9g fat
- Cottage cheese lowfat (1 cup): 165 cal, 28g protein, 6g carbs, 2g fat
- Egg (large): 70 cal, 6g protein, 1g carbs, 5g fat
- Egg white (1 large): 15 cal, 4g protein, 0g carbs, 0g fat
- Greek yogurt plain 2% (1 cup): 150 cal, 17g protein, 8g carbs, 4g fat
- Greek yogurt plain nonfat (1 cup): 130 cal, 17g protein, 8g carbs, 1g fat
- Ground beef (4 oz, 93% lean): 170 cal, 23g protein, 0g carbs, 8g fat
- Ground beef 85% lean (4 oz): 240 cal, 21g protein, 0g carbs, 17g fat
- Ground beef 90% lean (4 oz): 200 cal, 23g protein, 0g carbs, 11g fat
- Ground chicken (4 oz): 150 cal, 20g protein, 0g carbs, 8g fat
- Ground turkey (4 oz): 170 cal, 21g protein, 0g carbs, 9g fat
- Ground turkey 93% (4 oz): 170 cal, 21g protein, 0g carbs, 9g fat
- Ham (4 oz): 120 cal, 20g protein, 2g carbs, 4g fat
- Lamb (4 oz): 225 cal, 23g protein, 0g carbs, 14g fat
- Pork chop (4 oz): 190 cal, 26g protein, 0g carbs, 9g fat
- Pork tenderloin (4 oz): 135 cal, 24g protein, 0g carbs, 4g fat
- Salmon (4 oz): 210 cal, 23g protein, 0g carbs, 12g fat
- Scallops (4 oz): 100 cal, 20g protein, 3g carbs, 1g fat
- Seitan (4 oz): 150 cal, 30g protein, 4g carbs, 2g fat
- Shrimp (4 oz): 120 cal, 23g protein, 1g carbs, 2g fat
- Tempeh (4 oz): 220 cal, 21g protein, 9g carbs, 13g fat
- Tilapia (4 oz): 110 cal, 23g protein, 0g carbs, 2g fat
- Tofu firm (4 oz): 95 cal, 10g protein, 2g carbs, 5g fat
- Tofu silken (4 oz): 55 cal, 5g protein, 2g carbs, 2g fat
- Tuna (4 oz canned, drained): 120 cal, 26g protein, 0g carbs, 1g fat
- Turkey breast (4 oz): 120 cal, 26g protein, 0g carbs, 1g fat

DAIRY (per serving):
- Almond milk unsweetened (1 cup): 30 cal, 1g protein, 1g carbs, 3g fat
- Cheddar cheese (1 oz): 115 cal, 7g protein, 0g carbs, 9g fat
- Cheese blue (1 oz): 100 cal, 6g protein, 1g carbs, 8g fat
- Cheese feta (1 oz): 75 cal, 4g protein, 1g carbs, 6g fat
- Cheese goat (1 oz): 75 cal, 5g protein, 0g carbs, 6g fat
- Cheese mozzarella fresh (1 oz): 70 cal, 5g protein, 1g carbs, 5g fat
- Cheese parmesan (1 oz): 110 cal, 10g protein, 1g carbs, 7g fat
- Cheese parmesan (1 tbsp grated): 20 cal, 2g protein, 0g carbs, 2g fat
- Cheese provolone (1 oz): 100 cal, 7g protein, 1g carbs, 7g fat
- Cheese ricotta part-skim (1/4 cup): 85 cal, 7g protein, 3g carbs, 5g fat
- Cheese Swiss (1 oz): 110 cal, 8g protein, 2g carbs, 8g fat
- Coconut milk canned (1/4 cup): 110 cal, 1g protein, 2g carbs, 12g fat
- Coconut milk carton (1 cup): 45 cal, 0g protein, 2g carbs, 4g fat
- Cream cheese (1 oz): 100 cal, 2g protein, 1g carbs, 10g fat
- Cream cheese (1 tbsp): 50 cal, 1g protein, 1g carbs, 5g fat
- Half and half (1 tbsp): 20 cal, 0g protein, 1g carbs, 2g fat
- Heavy cream (1 tbsp): 50 cal, 0g protein, 0g carbs, 5g fat
- Milk 1% (1 cup): 100 cal, 8g protein, 12g carbs, 2g fat
- Milk 2% (1 cup): 120 cal, 8g protein, 12g carbs, 5g fat
- Milk skim (1 cup): 85 cal, 8g protein, 12g carbs, 0g fat
- Milk whole (1 cup): 150 cal, 8g protein, 12g carbs, 8g fat
- Mozzarella (1 oz): 85 cal, 6g protein, 1g carbs, 6g fat
- Oat milk (1 cup): 120 cal, 3g protein, 16g carbs, 5g fat
- Parmesan (2 tbsp): 45 cal, 4g protein, 0g carbs, 3g fat
- Sour cream (2 tbsp): 60 cal, 1g protein, 1g carbs, 6g fat
- Soy milk unsweetened (1 cup): 80 cal, 7g protein, 4g carbs, 4g fat

GRAINS & CARBS (per serving):
- Bagel (1 medium): 275 cal, 11g protein, 54g carbs, 2g fat
- Bread sourdough (1 slice): 90 cal, 4g protein, 18g carbs, 1g fat
- Bread white (1 slice): 75 cal, 2g protein, 14g carbs, 1g fat
- Bulgur (1 cup cooked): 150 cal, 6g protein, 34g carbs, 1g fat
- Corn (1 cup kernels): 130 cal, 5g protein, 29g carbs, 2g fat
- Corn on cob (1 medium ear): 90 cal, 3g protein, 19g carbs, 1g fat
- Couscous (1 cup cooked): 175 cal, 6g protein, 36g carbs, 1g fat
- English muffin (1 whole): 135 cal, 5g protein, 26g carbs, 1g fat
- Farro (1 cup cooked): 200 cal, 8g protein, 40g carbs, 2g fat
- Naan bread (1 piece): 260 cal, 9g protein, 45g carbs, 5g fat
- Oatmeal instant (1 packet): 100 cal, 4g protein, 19g carbs, 2g fat
- Oats rolled (1 cup dry): 305 cal, 11g protein, 55g carbs, 5g fat
- Oats rolled (1/2 cup dry): 155 cal, 5g protein, 27g carbs, 3g fat
- Pasta (2 oz dry = ~1 cup cooked): 200 cal, 7g protein, 42g carbs, 1g fat
- Pasta whole wheat (2 oz dry): 180 cal, 8g protein, 37g carbs, 2g fat
- Pita bread (1 whole 6.5"): 165 cal, 5g protein, 33g carbs, 1g fat
- Potato red (1 medium/150g): 155 cal, 4g protein, 34g carbs, 0g fat
- Potato russet (1 medium/150g): 165 cal, 4g protein, 37g carbs, 0g fat
- Quinoa (1 cup cooked): 220 cal, 8g protein, 40g carbs, 4g fat
- Rice brown (1 cup cooked): 215 cal, 5g protein, 45g carbs, 2g fat
- Rice jasmine (1 cup cooked): 205 cal, 4g protein, 45g carbs, 1g fat
- Rice white (1 cup cooked): 205 cal, 4g protein, 45g carbs, 1g fat
- Sweet potato (1 medium): 100 cal, 2g protein, 24g carbs, 0g fat
- Tortilla whole wheat (1 medium): 120 cal, 4g protein, 20g carbs, 3g fat
- Tortilla, corn (1 medium): 60 cal, 1g protein, 12g carbs, 1g fat
- Tortilla, flour (1 medium): 140 cal, 4g protein, 24g carbs, 3g fat
- Whole wheat bread (1 slice): 80 cal, 4g protein, 15g carbs, 1g fat

VEGETABLES (per serving):
- Arugula (1 cup): 5 cal, 1g protein, 1g carbs, 0g fat
- Asparagus (1 cup): 25 cal, 3g protein, 5g carbs, 0g fat
- Asparagus (6 spears): 20 cal, 2g protein, 4g carbs, 0g fat
- Avocado (1/4): 80 cal, 1g protein, 4g carbs, 7g fat
- Avocado (half): 160 cal, 2g protein, 9g carbs, 15g fat
- Beets (1 cup): 60 cal, 2g protein, 13g carbs, 0g fat
- Bell pepper (1 medium): 30 cal, 1g protein, 6g carbs, 0g fat
- Bell pepper green (1 medium): 25 cal, 1g protein, 6g carbs, 0g fat
- Bell pepper red (1 medium): 35 cal, 1g protein, 7g carbs, 0g fat
- Bell pepper yellow (1 medium): 50 cal, 2g protein, 12g carbs, 0g fat
- Bok choy (1 cup): 10 cal, 1g protein, 2g carbs, 0g fat
- Broccoli (1 cup chopped): 55 cal, 4g protein, 11g carbs, 1g fat
- Broccoli (1 cup steamed): 55 cal, 4g protein, 11g carbs, 1g fat
- Brussels sprouts (1 cup): 55 cal, 4g protein, 11g carbs, 1g fat
- Cabbage green (1 cup shredded): 20 cal, 1g protein, 4g carbs, 0g fat
- Cabbage red (1 cup shredded): 20 cal, 1g protein, 5g carbs, 0g fat
- Carrots (1 cup chopped): 50 cal, 1g protein, 12g carbs, 0g fat
- Carrots (1 cup): 50 cal, 1g protein, 12g carbs, 0g fat
- Carrots (1 medium): 25 cal, 1g protein, 6g carbs, 0g fat
- Cauliflower (1 cup): 25 cal, 2g protein, 5g carbs, 0g fat
- Celery (1 cup chopped): 15 cal, 1g protein, 3g carbs, 0g fat
- Cherry tomatoes (1 cup): 25 cal, 1g protein, 6g carbs, 0g fat
- Cucumber (1 cup sliced): 15 cal, 1g protein, 4g carbs, 0g fat
- Cucumber (1 cup): 15 cal, 1g protein, 4g carbs, 0g fat
- Eggplant (1 cup cubed): 20 cal, 1g protein, 5g carbs, 0g fat
- Garlic (1 clove): 5 cal, 0g protein, 1g carbs, 0g fat
- Garlic (1 tbsp minced): 15 cal, 1g protein, 3g carbs, 0g fat
- Ginger (1 tbsp fresh): 5 cal, 0g protein, 1g carbs, 0g fat
- Green beans (1 cup): 30 cal, 2g protein, 7g carbs, 0g fat
- Green onion (1 stalk): 5 cal, 0g protein, 1g carbs, 0g fat
- Jalapeño (1 pepper): 5 cal, 0g protein, 1g carbs, 0g fat
- Kale cooked (1 cup): 35 cal, 2g protein, 7g carbs, 1g fat
- Kale raw (1 cup chopped): 35 cal, 3g protein, 6g carbs, 1g fat
- Lettuce romaine (1 cup): 10 cal, 1g protein, 2g carbs, 0g fat
- Mixed greens (1 cup): 10 cal, 1g protein, 2g carbs, 0g fat
- Mushrooms (1 cup): 20 cal, 3g protein, 3g carbs, 0g fat
- Mushrooms cremini (1 cup): 20 cal, 2g protein, 3g carbs, 0g fat
- Mushrooms portobello (1 cap): 20 cal, 2g protein, 3g carbs, 0g fat
- Mushrooms white (1 cup sliced): 15 cal, 2g protein, 2g carbs, 0g fat
- Onion (1 medium): 45 cal, 1g protein, 10g carbs, 0g fat
- Onion (1/2 cup chopped): 30 cal, 1g protein, 7g carbs, 0g fat
- Peas green (1 cup): 120 cal, 8g protein, 21g carbs, 1g fat
- Shallot (1 tbsp minced): 5 cal, 0g protein, 2g carbs, 0g fat
- Snow peas (1 cup): 25 cal, 2g protein, 5g carbs, 0g fat
- Spinach cooked (1 cup): 40 cal, 5g protein, 7g carbs, 0g fat
- Spinach raw (1 cup): 5 cal, 1g protein, 1g carbs, 0g fat
- Sugar snap peas (1 cup): 40 cal, 3g protein, 7g carbs, 0g fat
- Tomato (1 medium): 20 cal, 1g protein, 5g carbs, 0g fat
- Tomato sauce (1/2 cup): 30 cal, 1g protein, 7g carbs, 0g fat
- Yellow squash (1 cup): 20 cal, 1g protein, 4g carbs, 0g fat
- Zucchini (1 cup sliced): 20 cal, 1g protein, 4g carbs, 0g fat
- Zucchini (1 cup): 20 cal, 1g protein, 4g carbs, 0g fat
- Zucchini (1 medium): 35 cal, 2g protein, 6g carbs, 1g fat

FRUITS (per serving):
- Apple (1 medium): 95 cal, 1g protein, 25g carbs, 1g fat
- Banana (1 medium): 105 cal, 1g protein, 27g carbs, 1g fat
- Banana (1/2 medium): 55 cal, 1g protein, 14g carbs, 0g fat
- Blackberries (1 cup): 60 cal, 2g protein, 14g carbs, 1g fat
- Blueberries (1 cup): 85 cal, 1g protein, 21g carbs, 1g fat
- Blueberries (1/2 cup): 40 cal, 1g protein, 11g carbs, 0g fat
- Cantaloupe (1 cup cubed): 55 cal, 1g protein, 13g carbs, 1g fat
- Cherries (1 cup): 95 cal, 2g protein, 25g carbs, 1g fat
- Dates medjool (1): 65 cal, 0g protein, 18g carbs, 0g fat
- Dried apricots (1/4 cup): 80 cal, 1g protein, 20g carbs, 0g fat
- Dried cranberries (1/4 cup): 125 cal, 0g protein, 33g carbs, 1g fat
- Grapefruit (1/2): 50 cal, 1g protein, 13g carbs, 0g fat
- Grapes (1 cup): 105 cal, 1g protein, 27g carbs, 0g fat
- Kiwi (1 medium): 40 cal, 1g protein, 10g carbs, 1g fat
- Lemon juice (1 tbsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Lime juice (1 tbsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Mango (1 cup cubed): 100 cal, 1g protein, 25g carbs, 1g fat
- Orange (1 medium): 60 cal, 1g protein, 15g carbs, 0g fat
- Peach (1 medium): 60 cal, 1g protein, 14g carbs, 1g fat
- Pear (1 medium): 100 cal, 1g protein, 27g carbs, 0g fat
- Pineapple (1 cup chunks): 80 cal, 1g protein, 22g carbs, 0g fat
- Raisins (1/4 cup): 125 cal, 1g protein, 33g carbs, 0g fat
- Raspberries (1 cup): 65 cal, 1g protein, 15g carbs, 1g fat
- Strawberries (1 cup sliced): 50 cal, 1g protein, 12g carbs, 1g fat
- Watermelon (1 cup cubed): 45 cal, 1g protein, 12g carbs, 0g fat

LEGUMES (per serving):
- Black beans (1 cup cooked): 225 cal, 15g protein, 41g carbs, 1g fat
- Chickpeas (1 cup cooked): 270 cal, 15g protein, 45g carbs, 4g fat
- Edamame (1 cup shelled): 190 cal, 18g protein, 14g carbs, 8g fat
- Kidney beans (1 cup cooked): 225 cal, 15g protein, 40g carbs, 1g fat
- Lentils (1 cup cooked): 230 cal, 18g protein, 40g carbs, 1g fat
- Pinto beans (1 cup cooked): 245 cal, 15g protein, 45g carbs, 1g fat

FATS & OILS (per serving):
- Avocado oil (1 tbsp): 125 cal, 0g protein, 0g carbs, 14g fat
- Butter (1 tbsp): 100 cal, 0g protein, 0g carbs, 12g fat
- Butter (1 tsp): 35 cal, 0g protein, 0g carbs, 4g fat
- Coconut oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Ghee (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Olive oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Olive oil (1 tsp): 40 cal, 0g protein, 0g carbs, 5g fat
- Sesame oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Vegetable oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat

NUTS & SEEDS (per serving):
- Almond butter (1 tbsp): 100 cal, 3g protein, 3g carbs, 9g fat
- Almond butter (2 tbsp): 200 cal, 7g protein, 6g carbs, 18g fat
- Almonds (1 oz, ~23 nuts): 160 cal, 6g protein, 6g carbs, 14g fat
- Almonds sliced (1/4 cup): 130 cal, 5g protein, 5g carbs, 11g fat
- Cashews (1 oz): 155 cal, 5g protein, 9g carbs, 12g fat
- Chia seeds (1 tbsp): 60 cal, 2g protein, 5g carbs, 4g fat
- Chia seeds (2 tbsp): 115 cal, 4g protein, 10g carbs, 7g fat
- Flax seeds (1 tbsp): 55 cal, 2g protein, 3g carbs, 4g fat
- Hemp seeds (1 tbsp): 55 cal, 3g protein, 1g carbs, 4g fat
- Macadamia nuts (1 oz): 205 cal, 2g protein, 4g carbs, 21g fat
- Peanut butter (1 tbsp): 95 cal, 4g protein, 3g carbs, 8g fat
- Peanut butter (2 tbsp): 190 cal, 8g protein, 6g carbs, 16g fat
- Peanuts (1 oz): 160 cal, 7g protein, 5g carbs, 14g fat
- Pecans (1 oz): 195 cal, 3g protein, 4g carbs, 20g fat
- Pine nuts (1 tbsp): 55 cal, 1g protein, 1g carbs, 6g fat
- Pistachios (1 oz): 160 cal, 6g protein, 8g carbs, 13g fat
- Pumpkin seeds (1 oz): 160 cal, 9g protein, 3g carbs, 14g fat
- Sunflower seeds (1 oz): 165 cal, 5g protein, 7g carbs, 14g fat
- Tahini (1 tbsp): 90 cal, 3g protein, 3g carbs, 8g fat
- Walnuts (1 oz): 185 cal, 4g protein, 4g carbs, 18g fat
- Walnuts chopped (1/4 cup): 195 cal, 5g protein, 4g carbs, 20g fat

CONDIMENTS & SAUCES (per serving):
- Agave nectar (1 tbsp): 60 cal, 0g protein, 16g carbs, 0g fat
- Apple cider vinegar (1 tbsp): 5 cal, 0g protein, 0g carbs, 0g fat
- Balsamic vinegar (1 tbsp): 15 cal, 0g protein, 3g carbs, 0g fat
- BBQ sauce (2 tbsp): 70 cal, 0g protein, 17g carbs, 0g fat
- Breadcrumbs (1/4 cup): 110 cal, 4g protein, 20g carbs, 2g fat
- Brown sugar (1 tbsp): 50 cal, 0g protein, 13g carbs, 0g fat
- Coconut cream (2 tbsp): 100 cal, 1g protein, 2g carbs, 10g fat
- Cornstarch (1 tbsp): 30 cal, 0g protein, 7g carbs, 0g fat
- Dijon mustard (1 tsp): 5 cal, 0g protein, 0g carbs, 0g fat
- Fish sauce (1 tbsp): 5 cal, 1g protein, 1g carbs, 0g fat
- Flour all-purpose (1 tbsp): 30 cal, 1g protein, 6g carbs, 0g fat
- Flour whole wheat (1 tbsp): 25 cal, 1g protein, 5g carbs, 0g fat
- Greek yogurt (as sauce, 2 tbsp): 20 cal, 2g protein, 1g carbs, 0g fat
- Guacamole (2 tbsp): 50 cal, 1g protein, 3g carbs, 4g fat
- Hoisin sauce (1 tbsp): 35 cal, 1g protein, 7g carbs, 1g fat
- Honey (1 tbsp): 65 cal, 0g protein, 17g carbs, 0g fat
- Honey (1 tsp): 20 cal, 0g protein, 6g carbs, 0g fat
- Hot sauce (1 tsp): 0 cal, 0g protein, 0g carbs, 0g fat
- Hummus (2 tbsp): 70 cal, 2g protein, 4g carbs, 5g fat
- Ketchup (1 tbsp): 20 cal, 0g protein, 5g carbs, 0g fat
- Maple syrup (1 tbsp): 50 cal, 0g protein, 13g carbs, 0g fat
- Marinara sauce (1/2 cup): 70 cal, 2g protein, 10g carbs, 3g fat
- Mayo light (1 tbsp): 35 cal, 0g protein, 1g carbs, 3g fat
- Mayonnaise (1 tbsp): 100 cal, 0g protein, 0g carbs, 11g fat
- Miso paste (1 tbsp): 35 cal, 2g protein, 4g carbs, 1g fat
- Mustard (1 tbsp): 10 cal, 1g protein, 1g carbs, 0g fat
- Mustard (1 tsp): 5 cal, 0g protein, 0g carbs, 0g fat
- Nutritional yeast (2 tbsp): 45 cal, 8g protein, 5g carbs, 1g fat
- Oyster sauce (1 tbsp): 10 cal, 0g protein, 2g carbs, 0g fat
- Panko breadcrumbs (1/4 cup): 55 cal, 2g protein, 11g carbs, 1g fat
- Pesto (1 tbsp): 80 cal, 2g protein, 1g carbs, 8g fat
- Pico de gallo (2 tbsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Ranch dressing (2 tbsp): 140 cal, 0g protein, 2g carbs, 14g fat
- Red wine vinegar (1 tbsp): 5 cal, 0g protein, 0g carbs, 0g fat
- Rice vinegar (1 tbsp): 0 cal, 0g protein, 0g carbs, 0g fat
- Salsa (2 tbsp): 10 cal, 0g protein, 2g carbs, 0g fat
- Soy sauce (1 tbsp): 10 cal, 1g protein, 1g carbs, 0g fat
- Sriracha (1 tsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Tamari (1 tbsp): 10 cal, 2g protein, 1g carbs, 0g fat
- Teriyaki sauce (1 tbsp): 15 cal, 1g protein, 3g carbs, 0g fat
- Tzatziki (2 tbsp): 30 cal, 1g protein, 2g carbs, 2g fat
- Vinaigrette (2 tbsp): 90 cal, 0g protein, 2g carbs, 9g fat
- White sugar (1 tbsp): 50 cal, 0g protein, 13g carbs, 0g fat
- Worcestershire sauce (1 tsp): 5 cal, 0g protein, 1g carbs, 0g fat⚠️ FOR INGREDIENTS NOT LISTED ABOVE:
Use your nutritional knowledge to look up accurate calorie and macro values.
Do not guess - provide accurate nutritional data based on standard serving sizes.

COOKING METHOD ADJUSTMENTS (affects both calories AND fat):
Account for how ingredients are cooked:

- Deep fried: Add +75 cal, +8g fat per 4 oz protein
- Pan fried / Sautéed: Add calories from oil used (119 cal, 13.5g fat per tbsp olive oil)
- Stir-fried: Add calories from oil used (typically 1-2 tbsp)
- Baked/Roasted with oil: Add +20 cal, +2g fat if oil brushed on
- Grilled: No addition (fat drips off, may slightly reduce fat)
- Steamed / Boiled / Poached: No addition
- Air fried: Add +5-10 cal (minimal oil)
- Breaded & fried: Add +100 cal, +10g fat, +15g carbs (breading + oil)

Examples:
- "Pan-fried salmon (4 oz) in 1 tbsp olive oil" = 210+120=330 cal, 12+14=26g fat
- "Grilled salmon (4 oz)" = 210 cal, 12g fat
- "Breaded fried chicken (4 oz)" = 190+100=290 cal, 4+10=14g fat, 0+15=15g carbs

Always specify cooking method and account for it in ALL macro calculations.

⚠️ CRITICAL NUTRITION REQUIREMENTS:
1. For EACH ingredient, provide exact nutrition values in "ingredientsWithNutrition"
2. Use the reference table above for listed ingredients
3. For ingredients NOT in the table, use accurate nutritional knowledge (USDA values)
4. The sum of ingredientsWithNutrition MUST equal the meal totals:
   - Sum of ingredient calories = estimatedCalories
   - Sum of ingredient protein = protein
   - Sum of ingredient carbs = carbs
   - Sum of ingredient fat = fat
5. Do NOT estimate these values - CALCULATE by summing ingredients from the reference table.

⚠️ ROUNDING RULES (REQUIRED):
- Round all CALORIES to the nearest 5 or 10 (e.g., 72 → 70, 187 → 190)
- Round all MACROS (protein, carbs, fat) to the nearest whole number (e.g., 6.3g → 6g)
- Per-ingredient values should also be rounded
- Final meal totals should be clean, round numbers

EXAMPLES of correct rounding:
- 3 large eggs: 215 cal (not 216), 18g protein (not 18.6), 2g carbs, 15g fat
- 4 oz chicken breast: 190 cal (not 187), 35g protein, 0g carbs, 4g fat
- 1 tbsp olive oil: 120 cal (not 119), 0g protein, 0g carbs, 14g fat

⚠️ CRITICAL - INGREDIENT SUM VERIFICATION:
1. List EVERY ingredient in "ingredientsWithNutrition" with its nutrition values
2. The SUM of all ingredient values MUST EQUAL the meal totals:
   - Sum of ingredient calories = estimatedCalories
   - Sum of ingredient protein = protein
   - Sum of ingredient carbs = carbs
   - Sum of ingredient fat = fat
3. BEFORE finalizing each meal, verify your math:
   - Chicken breast: 190 cal, 35g protein, 0g carbs, 4g fat
   - Brown rice: 220 cal, 5g protein, 45g carbs, 2g fat
   - Broccoli: 30 cal, 3g protein, 6g carbs, 0g fat
   - Olive oil: 120 cal, 0g protein, 0g carbs, 14g fat
   ─────────────────────────────────────────────────
   TOTAL: 560 cal, 43g protein, 51g carbs, 20g fat
   Meal totals MUST match these sums exactly.
4. If your ingredient sum doesn't match the target, adjust portions until it does.

REQUIREMENTS:
1. Generate EXACTLY ${homeMeals.length} recipes - one for each meal in the schedule above
2. Each meal MUST hit its nutrition targets (±50 calories)
3. MAXIMUM VARIETY - no repeated main ingredients across the week
4. Use diverse cuisines matching user's preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'varied'}
5. Mix easy (15-20 min) and moderate (30-45 min) prep times
6. Include complete ingredient lists and basic instructions
7. Consider batch cooking possibilities for similar meals
8. Generate a CONSOLIDATED GROCERY LIST from all ingredients
9. ⚠️ CRITICAL: Provide BOTH primary AND alternative for EVERY meal
10. ⚠️ DIET TYPE + ALLERGIES ARE NON-NEGOTIABLE - never include forbidden ingredients; dislikes should be minimized
11. ⚠️ PRIORITIZE user's preferred foods: ${(surveyData.preferredFoods || []).slice(0, 15).join(', ') || 'varied ingredients'}
12. ⚠️ Include nutrient-rich foods based on user's preferences: ${(surveyData.preferredNutrients || []).join(', ') || 'balanced nutrition'}
13. DIVERSITY: No repeated cuisine on consecutive days (not Mexican Monday AND Mexican Tuesday)
14. DIVERSITY: Use at least 5 different primary proteins across the week (e.g., chicken, salmon, beef, tofu, eggs)
15. DIVERSITY: Mix cooking methods - include grilled, baked, sautéed, raw (salads), and one-pot meals
16. DIVERSITY: Vary meal formats - not all bowls, not all sandwiches - include plates, wraps, salads, soups, stir-fries
17. DIVERSITY: Prep time variety - 40% quick (≤20 min), 40% medium (20-35 min), 20% involved (35+ min)
18. DIVERSITY: If generating alternatives, they must be MEANINGFULLY different from primary (different protein or different cuisine)
19. Stay within weekly budget of ~${Math.round((surveyData.monthlyFoodBudget || 200) / 4)}

Return a JSON object with this EXACT structure:

{
  "homeMeals": [
    {
      "day": "monday",
      "mealType": "breakfast",
      "primary": {
        "name": "Recipe Name 1",
        "description": "Brief description",
        "estimatedCalories": 540,
        "protein": 47,
        "carbs": 54,
        "fat": 15,
        "prepTime": "15 min",
        "cookTime": "10 min",
        "difficulty": "Easy",
        "cuisine": "Mediterranean",
        "ingredientsWithNutrition": [
          { "item": "3 large eggs", "calories": 215, "protein": 18, "carbs": 2, "fat": 15 },
          { "item": "2 cups spinach", "calories": 10, "protein": 2, "carbs": 2, "fat": 0 },
          { "item": "1 tbsp olive oil", "calories": 120, "protein": 0, "carbs": 0, "fat": 14 }
        ],
        "ingredients": ["3 large eggs", "2 cups spinach", "1 tbsp olive oil"],
        "instructions": ["step1", "step2"],
        "tags": ["high-protein", "quick"],
        "source": "home"
      },
      "alternative": {
        "name": "Recipe Name 2 (different from primary)",
        "description": "Different description",
        "estimatedCalories": 530,
        "protein": 45,
        "carbs": 52,
        "fat": 17,
        "prepTime": "10 min",
        "cookTime": "15 min",
        "difficulty": "Easy",
        "cuisine": "American",
        "ingredientsWithNutrition": [
          { "item": "1 cup oats", "calories": 305, "protein": 11, "carbs": 55, "fat": 5 },
          { "item": "1 medium banana", "calories": 105, "protein": 1, "carbs": 27, "fat": 0 },
          { "item": "1 tbsp honey", "calories": 65, "protein": 0, "carbs": 17, "fat": 0 }
        ],
        "ingredients": ["1 cup oats", "1 medium banana", "1 tbsp honey"],
        "instructions": ["different steps"],
        "tags": ["fiber-rich", "easy"],
        "source": "home"
      }
    }
  ],
  "groceryList": {
    "proteins": [
      {"name": "Chicken breast", "quantity": "2 lbs", "uses": "Multiple protein-rich meals"},
      {"name": "Eggs", "quantity": "1 dozen", "uses": "Breakfast, baking"},
      {"name": "Salmon fillet", "quantity": "1 lb", "uses": "Dinner entrees"}
    ],
    "vegetables": [
      {"name": "Spinach", "quantity": "2 bags (10oz each)", "uses": "Salads, smoothies, cooking"},
      {"name": "Broccoli", "quantity": "2 heads", "uses": "Side dishes, stir-fries"},
      {"name": "Bell peppers", "quantity": "3 mixed colors", "uses": "Salads, stir-fries, snacking"}
    ],
    "grains": [
      {"name": "Brown rice", "quantity": "2 lb bag", "uses": "Base for bowls and sides"},
      {"name": "Oats", "quantity": "42oz container", "uses": "Breakfast, baking"},
      {"name": "Whole wheat bread", "quantity": "1 loaf", "uses": "Toast, sandwiches"}
    ],
    "dairy": [
      {"name": "Greek yogurt", "quantity": "32oz container", "uses": "Breakfast, snacks, cooking"},
      {"name": "Milk", "quantity": "1 gallon", "uses": "Cereal, smoothies, cooking"}
    ],
    "pantryStaples": [
      {"name": "Olive oil", "quantity": "500ml bottle", "uses": "Cooking, dressings"},
      {"name": "Honey", "quantity": "12oz bottle", "uses": "Sweetening, marinades"}
    ],
    "snacks": [
      {"name": "Mixed nuts", "quantity": "1 lb bag", "uses": "Healthy snacking"},
      {"name": "Dark chocolate", "quantity": "3.5oz bar (85% cacao)", "uses": "Healthy treat"}
    ]
  }
}

GROCERY LIST RULES:
1. Consolidate duplicate ingredients across all meals (combine amounts)
2. Round up quantities for practical shopping (e.g., can't buy 1.5 eggs)
3. Do NOT include prices - real prices will be added from local stores later
4. Use these EXACT categories: proteins, vegetables, grains, dairy, pantryStaples, snacks
5. Each item MUST have exactly 3 fields: name, quantity, uses
6. Include ONLY ingredients from the primary recipes (not alternatives)
7. Be SPECIFIC with quantities - include package sizes when relevant:
   - Good: "2 lb bag", "32oz container", "1 dozen", "3 medium"
   - Bad: "some", "a few", "as needed"
8. The "uses" field should list which meals use this ingredient

9. Ensure all grocery items comply with the dietary restrictions specified above.`;
}

// Restaurant meal generation prompt for 7-day system
export function createRestaurantMealGenerationPrompt(context: RestaurantMealContext): string {
  const { restaurantMealsSchedule, restaurantMenuData, surveyData, nutritionTargets } = context;

  // Get strict exclusions warning
  const strictExclusionsWarning = formatStrictExclusions(surveyData);

  // Build detailed restaurant info with ordering links prominently displayed
  const restaurantDetails = restaurantMenuData.map(restaurant => {
    const links = restaurant.orderingLinks || {};
    const availableLinks = Object.entries(links)
      .filter(([_, url]) => url && typeof url === 'string' && url.trim() !== '')
      .map(([platform, url]) => `${platform}: ${url}`)
      .join('\n    ');
    
    return `
RESTAURANT: ${restaurant.name}
  Cuisine: ${restaurant.cuisine || 'Mixed'}
  Address: ${restaurant.address}
  Rating: ${restaurant.rating || 'N/A'}
  
  ORDERING LINKS (MUST USE THESE EXACT URLs):
    ${availableLinks || 'No links available'}
  
  MENU ITEMS:
${(restaurant.menuData || []).slice(0, 8).map((item: any) => 
    `    - ${item.name}: $${item.price} (${item.category || 'meal'}) - ${item.estimatedCalories || '~500'} cal`
  ).join('\n') || '    No menu items available'}
`;
  }).join('\n---\n');

  return `Select specific restaurant meals for this user's weekly schedule.

RESTAURANT MEALS NEEDED:
${restaurantMealsSchedule.map(meal => `- ${meal.day} ${meal.mealType}`).join('\n')}

AVAILABLE RESTAURANTS WITH VERIFIED ORDERING LINKS:
${restaurantDetails}

NUTRITION TARGETS PER MEAL (IMPORTANT - meals should be within ±100 calories):
${nutritionTargets ? `- Breakfast: ${nutritionTargets.mealTargets?.breakfast?.calories || 500} calories, ${nutritionTargets.mealTargets?.breakfast?.protein || 30}g protein
- Lunch: ${nutritionTargets.mealTargets?.lunch?.calories || 600} calories, ${nutritionTargets.mealTargets?.lunch?.protein || 40}g protein
- Dinner: ${nutritionTargets.mealTargets?.dinner?.calories || 700} calories, ${nutritionTargets.mealTargets?.dinner?.protein || 45}g protein` : `- Breakfast: 500 calories, 30g protein
- Lunch: 600 calories, 40g protein
- Dinner: 700 calories, 45g protein`}

USER PREFERENCES & GOALS:
- Primary Goal: ${surveyData.goal || 'General Wellness'}
- Secondary Goal Detail: ${surveyData.primaryGoal || 'none provided'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Varied'}
- Budget: ${surveyData.monthlyFoodBudget || 200}/month

⚠️ DIET TYPE (Mandatory Compliance):
${(() => {
  const restrictions = (surveyData.dietPrefs || []).filter((pref: string) => pref && pref.toLowerCase() !== 'none');
  if (restrictions.length === 0) return '- No restrictions - any menu items allowed';

  let rules = 'Each selected dish must comply with all dietary restrictions below:\n';
  restrictions.forEach((pref: string) => {
    const prefLower = pref.toLowerCase();
    if (prefLower === 'vegetarian') {
      rules += `- VEGETARIAN: Exclude dishes with meat, poultry, fish, or gelatin. Eggs and dairy are allowed.\n`;
    }
    if (prefLower === 'vegan') {
      rules += `- VEGAN: Exclude dishes with any animal products including meat, fish, dairy, eggs, honey, or gelatin.\n`;
    }
    if (prefLower === 'keto' || prefLower === 'low-carb') {
      rules += `- KETO: Exclude high-carb items like rice, bread, pasta, potatoes, and sugary dishes.\n`;
    }
    if (prefLower === 'paleo') {
      rules += `- PALEO: Exclude dishes with grains, legumes, dairy, and processed foods.\n`;
    }
    if (prefLower === 'pescatarian') {
      rules += `- PESCATARIAN: Exclude dishes with meat or poultry. Fish, seafood, eggs, and dairy are allowed.\n`;
    }
    if (prefLower === 'mediterranean') {
      rules += `- MEDITERRANEAN: Favor vegetables, legumes, whole grains, olive oil, and fish; limit red meat and processed foods.\n`;
    }
    if (prefLower === 'halal') {
      rules += `- HALAL: Exclude pork dishes and non-halal meat. Use only halal-certified proteins.\n`;
    }
    if (prefLower === 'kosher') {
      rules += `- KOSHER: Exclude pork and shellfish. Do not mix meat and dairy in the same meal.\n`;
    }
    if (prefLower.startsWith('other:')) {
      const custom = pref.replace(/^other:/i, '').trim();
      rules += `- OTHER DIET TYPE: ${custom || 'custom diet'} - follow this pattern strictly.\n`;
    }
  });

  rules += `\nVerify each dish complies with restrictions before selection. If a dish violates any restriction, select a compliant alternative.`;

  return rules;
})()}

🚫 CRITICAL SAFETY — ALLERGIES (NON-NEGOTIABLE):
${surveyData.foodAllergies?.length > 0
  ? `User has allergies to: ${surveyData.foodAllergies.join(', ')}.
NEVER include these ingredients or dishes containing them.`
  : 'No known allergies.'}

${strictExclusionsWarning}

🧾 USER'S CUSTOM FOOD NOTES:
${surveyData.customFoodInput
  ? `${surveyData.customFoodInput}
Incorporate these preferences when selecting dishes.`
  : 'No custom food notes provided.'}

🍽️ RESTAURANT FREQUENCY:
- User eats out: ${surveyData.eatingOutOccasions || 'occasionally'}
- ${surveyData.eatingOutOccasions === 'daily'
  ? 'User eats out frequently — prioritize variety and value.'
  : surveyData.eatingOutOccasions === 'rarely'
    ? 'User eats out rarely — make these meals special/memorable.'
    : 'Balance familiar favorites with new discoveries.'}

⏱️ TIMELINE CONTEXT:
- Goal timeline: ${surveyData.fitnessTimeline || 'flexible'}

🥗 PREFERRED FOODS (SELECT DISHES FEATURING THESE):
${(surveyData.preferredFoods || []).length > 0
  ? `Prioritize menu items containing: ${surveyData.preferredFoods.slice(0, 10).join(', ')}`
  : '- No specific ingredient preferences'}

⚠️ CRITICAL REQUIREMENTS:
1. Select EXACTLY ${restaurantMealsSchedule.length} meals matching the schedule
2. ⚠️ CUISINE PREFERENCES: STRONGLY prioritize restaurants matching user's preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
3. ⚠️ CALORIE TARGETS: Each meal MUST be within ±100 calories of the target above
4. For EACH meal, provide BOTH a primary AND alternative option from DIFFERENT restaurants
5. ⚠️ ORDERING LINKS ARE REQUIRED: Copy the EXACT orderingLinks from the restaurant data above
6. Distribute across different restaurants for variety
7. Consider meal timing (lighter lunches, heartier dinners)
8. Stay within budget and dietary preferences
9. Use ONLY restaurants and menu items from the data provided above
10. NEVER leave orderingLinks empty - copy them directly from the restaurant data
11. ⚠️ DIET TYPE + ALLERGIES ARE ABSOLUTE - never select forbidden items; dislikes should be minimized
12. ⚠️ PREFERRED FOODS: When available, prioritize dishes featuring user's preferred ingredients

Return ONLY this JSON structure:
{
  "restaurantMeals": [
    {
      "day": "friday",
      "mealType": "dinner",
      "primary": {
        "restaurant": "Exact Restaurant Name from data",
        "dish": "Exact Dish Name from menu",
        "description": "Brief description",
        "price": 18.99,
        "estimatedCalories": 650,
        "protein": 35,
        "carbs": 45,
        "fat": 28,
        "cuisine": "Italian",
        "address": "Restaurant address from data",
        "orderingLinks": {
          "doordash": "COPY EXACT URL FROM RESTAURANT DATA",
          "ubereats": "COPY EXACT URL FROM RESTAURANT DATA",
          "grubhub": "COPY EXACT URL FROM RESTAURANT DATA",
          "direct": "COPY EXACT URL FROM RESTAURANT DATA"
        },
        "source": "restaurant",
        "tags": ["dinner", "italian", "protein-rich"]
      },
      "alternative": {
        "restaurant": "Different Restaurant Name",
        "dish": "Different Dish Name",
        "description": "Different description",
        "price": 16.99,
        "estimatedCalories": 620,
        "protein": 32,
        "carbs": 42,
        "fat": 25,
        "cuisine": "Different cuisine",
        "address": "Different restaurant address",
        "orderingLinks": {
          "doordash": "COPY EXACT URL FROM DIFFERENT RESTAURANT",
          "ubereats": "COPY EXACT URL FROM DIFFERENT RESTAURANT",
          "grubhub": "COPY EXACT URL FROM DIFFERENT RESTAURANT",
          "direct": "COPY EXACT URL FROM DIFFERENT RESTAURANT"
        },
        "source": "restaurant",
        "tags": ["dinner", "different-cuisine"]
      }
    }
  ]
}

⚠️ IMPORTANT: Only include platforms in orderingLinks that have actual URLs in the restaurant data. If a restaurant doesn't have a GrubHub link, don't include grubhub in that meal's orderingLinks.`;
}

// Restaurant selection prompt (for choosing best restaurants from search results)
export function createRestaurantSelectionPrompt(restaurants: any[], surveyData: any): string {
  const strictExclusionsWarning = formatStrictExclusions(surveyData);
  return `${strictExclusionsWarning}Select the 8-10 best restaurants from this list for a weekly meal plan.

AVAILABLE RESTAURANTS:
${restaurants.map((r, i) => `
${i + 1}. Name: ${r.name}
   PlaceId: ${r.placeId}
   Cuisine: ${r.cuisine || 'Mixed'}
   Rating: ${r.rating}/5
   Price Level: ${r.priceLevel || 'Unknown'}
   Address: ${r.address || r.formatted_address || r.vicinity}
   City: ${r.city || 'Unknown'}
`).join('\n')}

USER PREFERENCES & GOALS:
- Primary Goal: ${surveyData.goal || surveyData.primaryGoal || 'General Wellness'}
- Secondary Goal Detail: ${surveyData.goal ? (surveyData.primaryGoal || 'none provided') : 'none provided'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- ⚠️ PREFERRED CUISINES (CRITICAL): ${(surveyData.preferredCuisines || []).join(', ')}
- Distance Preference: ${surveyData.distancePreference || 'moderate'} (${surveyData.distancePreference === 'close' ? 'within 2 miles' : surveyData.distancePreference === 'far' ? 'within 10 miles' : 'within 5 miles'})
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

⚠️ CRITICAL SELECTION CRITERIA (ABSOLUTE REQUIREMENTS):
1. ⚠️ CUISINE MATCH: ONLY select restaurants that match the user's preferred cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
2. ⚠️ DISTANCE COMPLIANCE: The user chose "${surveyData.distancePreference || 'moderate'}" distance preference - DO NOT select restaurants that are too far
3. Choose 8-10 restaurants maximum (extra buffer for filtering)
4. Prioritize exact cuisine matches over "variety"
5. Balance high-rated options with budget constraints
6. Location must be convenient within the specified distance range
7. Ensure good mix for different meal types (lunch/dinner)

⚠️ IMPORTANT: If user selected specific cuisines, do NOT include restaurants outside those cuisines even if highly rated

Return JSON with this EXACT structure - include placeId for matching:
{
  "selectedRestaurants": [
    {
      "name": "Restaurant Name",
      "placeId": "COPY THE EXACT placeId FROM ABOVE",
      "cuisine": "Cuisine type",
      "rating": 4.5,
      "address": "Full address",
      "reason": "Why this restaurant was selected"
    }
  ]
}`;
}

// PHASE 2: PLAN+PARALLEL ARCHITECTURE PROMPTS

// Planning prompt for high-level meal structure (Phase 1 of 3)
export function createPlanningPrompt(context: MealGenerationContext): string {
  const { homeMeals, nutritionTargets, scheduleText, surveyData } = context;

  return `Plan a high-level 7-day home meal structure for ${homeMeals.length} meals.

USER WEEKLY SCHEDULE:
${scheduleText}

TOTAL HOME MEALS TO GENERATE: ${homeMeals.length}

${formatNutritionTargets(context)}

USER PROFILE:
- Goal: ${surveyData.goal || 'General Wellness'} (${surveyData.primaryGoal || 'none provided'})
- Challenge: ${surveyData.goalChallenge || 'None specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'varied'}
- Preferred Foods: ${(surveyData.preferredFoods || []).slice(0, 10).join(', ') || 'varied ingredients'}
- Diet Type: ${(surveyData.dietPrefs || []).join(', ') || 'none'}
- Allergies: ${(surveyData.foodAllergies || []).join(', ') || 'none'}
- Budget: $${Math.round((surveyData.monthlyFoodBudget || 200) / 4)}/week

REQUIREMENTS:
1. Create a diverse meal plan with NO repeated main proteins across consecutive days
2. Use at least 4-5 different primary proteins across the week
3. Balance cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Mediterranean, Asian, American, Mexican'}
4. Mix prep times: 40% quick (≤20min), 40% medium (20-35min), 20% involved (35+min)
5. Variety in meal formats: bowls, plates, salads, wraps, soups, stir-fries
6. Each meal should hit calorie targets ±50 calories
7. Consider batch cooking opportunities

Return JSON with this EXACT structure:
{
  "mealPlan": [
    {
      "day": "monday",
      "mealType": "breakfast",
      "plannedName": "Mediterranean Veggie Scramble",
      "primaryProtein": "eggs",
      "cuisine": "Mediterranean",
      "targetCalories": 420,
      "targetProtein": 25,
      "targetCarbs": 30,
      "targetFat": 22,
      "prepTime": "15 min",
      "mealFormat": "plate",
      "keyIngredients": ["eggs", "spinach", "tomatoes", "feta"],
      "batchCookingNotes": "Can prep vegetables night before"
    }
  ]
}`;
}

// Detail prompt for specific recipe generation (Phase 2 of 3)
export function createDetailPrompt(plannedMealsChunk: any[], context: MealGenerationContext): string {
  const { surveyData } = context;

  const strictExclusionsWarning = formatStrictExclusions(surveyData);

  // Format all planned meals in the chunk
  const plannedMealsList = plannedMealsChunk.map(meal =>
    `${meal.day} ${meal.mealType}: ${meal.plannedName} (${meal.primaryProtein}, target: ${meal.targetCalories} cal, ${meal.targetProtein}g protein, ${meal.targetCarbs}g carbs, ${meal.targetFat}g fat)`
  ).join('\n');

  return `Generate detailed recipes for these SPECIFIC planned meals. Do NOT change the meal names or primary proteins — follow the plan exactly:

PLANNED MEALS TO GENERATE:
${plannedMealsList}

USER CONSTRAINTS:
- Diet Type: ${(surveyData.dietPrefs || []).join(', ') || 'none'}
- Allergies: ${(surveyData.foodAllergies || []).join(', ') || 'none'}
- Preferred Foods: ${(surveyData.preferredFoods || []).slice(0, 10).join(', ') || 'varied'}

${strictExclusionsWarning}

NUTRITION REFERENCE TABLE (use exact values):
[Include the same nutrition table from createHomeMealGenerationPrompt - abbreviated here for brevity]
PROTEINS (per serving):
- Chicken breast (4 oz): 190 cal, 35g protein, 0g carbs, 4g fat
- Eggs (large): 70 cal, 6g protein, 1g carbs, 5g fat
- Salmon (4 oz): 210 cal, 23g protein, 0g carbs, 12g fat
- Greek yogurt plain 2% (1 cup): 150 cal, 17g protein, 8g carbs, 4g fat

VEGETABLES (per serving):
- Spinach raw (1 cup): 5 cal, 1g protein, 1g carbs, 0g fat
- Broccoli (1 cup): 55 cal, 4g protein, 11g carbs, 1g fat
- Bell pepper (1 medium): 30 cal, 1g protein, 6g carbs, 0g fat

GRAINS & CARBS (per serving):
- Rice brown (1 cup cooked): 215 cal, 5g protein, 45g carbs, 2g fat
- Oats rolled (1/2 cup dry): 155 cal, 5g protein, 27g carbs, 3g fat
- Whole wheat bread (1 slice): 80 cal, 4g protein, 15g carbs, 1g fat

FATS & OILS (per serving):
- Olive oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Avocado (1/4): 80 cal, 1g protein, 4g carbs, 7g fat

REQUIREMENTS:
1. Generate detailed recipes for ALL planned meals listed above
2. Use EXACT nutrition values from the reference table
3. Calculate by summing all ingredients - verify math
4. Include both primary AND alternative recipes for each meal
5. Alternative must be meaningfully different (different protein OR cuisine)
6. Both recipes must hit their specific nutrition targets (±25 calories)
7. Do NOT change the meal names - use the exact planned names provided
8. Do NOT change the primary proteins - use the exact proteins specified

Return JSON with ALL meals:
{
  "meals": [
    {
      "day": "monday",
      "mealType": "breakfast",
      "primary": {
        "name": "EXACT NAME FROM PLANNED MEALS ABOVE",
        "description": "Brief description",
        "estimatedCalories": 420,
        "protein": 25,
        "carbs": 30,
        "fat": 22,
        "prepTime": "15 min",
        "cookTime": "10 min",
        "difficulty": "Easy",
        "cuisine": "Mediterranean",
        "ingredientsWithNutrition": [
          { "item": "3 large eggs", "calories": 210, "protein": 18, "carbs": 3, "fat": 15 },
          { "item": "2 cups spinach", "calories": 10, "protein": 2, "carbs": 2, "fat": 0 }
        ],
        "ingredients": ["3 large eggs", "2 cups spinach"],
        "instructions": ["Step 1", "Step 2"],
        "tags": ["high-protein", "quick"],
        "source": "home"
      },
      "alternative": {
        "name": "Different Recipe Name (but for same meal slot)",
        "description": "Different description",
        "estimatedCalories": 415,
        "protein": 24,
        "carbs": 32,
        "fat": 21,
        "prepTime": "20 min",
        "cookTime": "15 min",
        "difficulty": "Easy",
        "cuisine": "American",
        "ingredientsWithNutrition": [
          { "item": "1/2 cup oats", "calories": 155, "protein": 5, "carbs": 27, "fat": 3 },
          { "item": "1 cup Greek yogurt", "calories": 150, "protein": 17, "carbs": 8, "fat": 4 }
        ],
        "ingredients": ["1/2 cup oats", "1 cup Greek yogurt"],
        "instructions": ["Different step 1", "Different step 2"],
        "tags": ["fiber-rich", "protein-rich"],
        "source": "home"
      }
    }
  ]
}`;
}

// Grocery consolidation prompt (Phase 3 of 3)
export function createGroceryPrompt(allMeals: any[], surveyData: any): string {
  const ingredientsList = allMeals.map(meal => {
    const primary = meal.primary?.ingredientsWithNutrition || [];
    return primary.map((ing: any) => ing.item);
  }).flat();

  return `Generate a consolidated grocery list from these recipe ingredients.

ALL INGREDIENTS FROM RECIPES:
${ingredientsList.join('\n')}

USER BUDGET: $${Math.round((surveyData.monthlyFoodBudget || 200) / 4)}/week
DIET RESTRICTIONS: ${(surveyData.dietPrefs || []).join(', ') || 'none'}
ALLERGIES: ${(surveyData.foodAllergies || []).join(', ') || 'none'}

REQUIREMENTS:
1. Consolidate duplicate ingredients (combine quantities)
2. Round up to practical shopping amounts
3. Use these EXACT categories: proteins, vegetables, grains, dairy, pantryStaples, snacks
4. Each item needs: name, quantity, uses
5. Include ONLY primary recipe ingredients
6. Be specific with quantities (package sizes)

Return JSON:
{
  "groceryList": {
    "proteins": [
      {"name": "Chicken breast", "quantity": "2 lbs", "uses": "Multiple protein-rich meals"},
      {"name": "Eggs", "quantity": "1 dozen", "uses": "Breakfast, baking"}
    ],
    "vegetables": [
      {"name": "Spinach", "quantity": "2 bags (5oz each)", "uses": "Salads, cooking"},
      {"name": "Bell peppers", "quantity": "3 mixed colors", "uses": "Stir-fries, salads"}
    ],
    "grains": [
      {"name": "Brown rice", "quantity": "2 lb bag", "uses": "Base for bowls"},
      {"name": "Oats", "quantity": "42oz container", "uses": "Breakfast"}
    ],
    "dairy": [
      {"name": "Greek yogurt", "quantity": "32oz container", "uses": "Breakfast, snacks"},
      {"name": "Milk", "quantity": "1/2 gallon", "uses": "Cereal, smoothies"}
    ],
    "pantryStaples": [
      {"name": "Olive oil", "quantity": "500ml bottle", "uses": "Cooking, dressings"},
      {"name": "Salt", "quantity": "26oz container", "uses": "Seasoning"}
    ],
    "snacks": [
      {"name": "Mixed nuts", "quantity": "1 lb bag", "uses": "Healthy snacking"}
    ]
  }
}`;
}