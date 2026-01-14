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
}

export interface RestaurantMealContext {
  restaurantMealsSchedule: Array<{day: string, mealType: string}>;
  restaurantMenuData: any[];
  surveyData: any;
  nutritionTargets?: any;
}

// Home meal generation prompt for 7-day system (NOW INCLUDES GROCERY LIST)
export function createHomeMealGenerationPrompt(context: MealGenerationContext): string {
  const { homeMeals, nutritionTargets, scheduleText, surveyData } = context;

  return `Generate home-cooked meal recipes for a 7-day meal plan WITH a consolidated grocery list.

USER WEEKLY SCHEDULE:
${scheduleText}

TOTAL HOME MEALS TO GENERATE: ${homeMeals.length}

NUTRITION TARGETS PER MEAL:
- Breakfast: ${nutritionTargets.mealTargets.breakfast.calories} calories, ${nutritionTargets.mealTargets.breakfast.protein}g protein
- Lunch: ${nutritionTargets.mealTargets.lunch.calories} calories, ${nutritionTargets.mealTargets.lunch.protein}g protein
- Dinner: ${nutritionTargets.mealTargets.dinner.calories} calories, ${nutritionTargets.mealTargets.dinner.protein}g protein

USER PREFERENCES & GOALS:
- Name: ${surveyData.firstName || 'User'}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Weight: ${surveyData.weight} lbs, Height: ${surveyData.height} inches
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Activity Level: ${surveyData.activityLevel || 'MODERATELY_ACTIVE'}
- Sports/Activities: ${surveyData.sportsInterests || surveyData.preferredActivities?.join(', ') || 'General fitness'}
- Budget: ${surveyData.monthlyFoodBudget || 200}/month (approximately ${Math.round((surveyData.monthlyFoodBudget || 200) / 4)}/week)

⚠️ DIETARY RESTRICTIONS (STRICTLY ENFORCE - NO EXCEPTIONS):
${(() => {
  const restrictions = surveyData.dietPrefs || [];
  if (restrictions.length === 0) return '- No dietary restrictions - full ingredient selection available';

  let rules = '';
  restrictions.forEach(pref => {
    if (pref === 'Vegetarian') {
      rules += `- VEGETARIAN: Absolutely NO meat, poultry, or fish. Eggs and dairy ARE allowed.\n`;
    }
    if (pref === 'Vegan') {
      rules += `- VEGAN: Absolutely NO animal products whatsoever. No meat, fish, eggs, dairy, honey, or gelatin.\n`;
    }
    if (pref === 'Gluten-Free') {
      rules += `- GLUTEN-FREE: NO wheat, barley, rye, or gluten-containing grains. Use rice, quinoa, certified GF oats.\n`;
    }
    if (pref === 'Dairy-Free') {
      rules += `- DAIRY-FREE: NO milk, cheese, yogurt, butter, or cream. Use plant-based alternatives.\n`;
    }
    if (pref === 'Keto') {
      rules += `- KETO: Maximum 20-30g net carbs per day. High fat, moderate protein. No grains, sugar, most fruits.\n`;
    }
    if (pref === 'Paleo') {
      rules += `- PALEO: No grains, legumes, dairy, refined sugar, or processed foods. Focus on whole foods.\n`;
    }
    if (pref === 'Low-Carb') {
      rules += `- LOW-CARB: Keep total carbs under 100g/day. Prioritize protein and healthy fats.\n`;
    }
    if (pref === 'Pescatarian') {
      rules += `- PESCATARIAN: No meat or poultry. Fish and seafood ARE allowed, plus eggs and dairy.\n`;
    }
    if (pref === 'Halal') {
      rules += `- HALAL: No pork or pork products. Meat must be halal-certified. No alcohol in cooking.\n`;
    }
    if (pref === 'Low-Sodium') {
      rules += `- LOW-SODIUM: Keep sodium under 1500mg/day. Avoid processed foods, use herbs/spices for flavor.\n`;
    }
  });
  return rules || '- Standard dietary guidelines apply';
})()}

🥗 PREFERRED FOODS (PRIORITIZE THESE INGREDIENTS):
${(() => {
  const foods = surveyData.preferredFoods || [];
  if (foods.length === 0) return '- No specific preferences - use varied healthy ingredients';

  return `The user specifically selected these foods as favorites - USE THEM FREQUENTLY:
${foods.map(food => `- ${food}`).join('\n')}

⚠️ Build meals around these preferred ingredients. If user selected "Salmon", include salmon dishes 2-3x/week.
If user selected "Rice" and "Chicken", make rice bowls with chicken a staple.`;
})()}

🍳 PREFERRED CUISINES (MATCH COOKING STYLES):
${(() => {
  const cuisines = surveyData.preferredCuisines || [];
  if (cuisines.length === 0) return '- Varied cuisines - mix different cooking styles';

  return `User enjoys these cuisines - incorporate their cooking styles and flavor profiles:
${cuisines.map(cuisine => `- ${cuisine}`).join('\n')}

Design meals that feel like these cuisines. For Mediterranean, use olive oil, herbs, lemon.
For Mexican, use cumin, lime, cilantro. For Asian cuisines, use ginger, soy sauce, sesame.`;
})()}

💊 NUTRIENT PRIORITIES (INCLUDE THESE IN MEALS):
${(() => {
  const nutrients = surveyData.preferredNutrients || [];
  if (nutrients.length === 0) return '- Standard balanced nutrition';

  let nutrientGuide = `User wants meals rich in these nutrients - actively include foods that provide them:\n`;

  nutrients.forEach(nutrient => {
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
  function getGoalSpecificGuidance(surveyData) {
    const { primaryGoal, goalChallenge, fitnessLevel, healthFocus, maintainFocus } = surveyData;

    let guidance = '';

    // Goal Challenge guidance (lose_weight)
    if (primaryGoal === 'lose_weight' && goalChallenge) {
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
      guidance += challengeGuidance[goalChallenge] || '';
    }

    // Fitness Level guidance (build_muscle)
    if (primaryGoal === 'build_muscle' && fitnessLevel) {
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
      guidance += levelGuidance[fitnessLevel] || '';
    }

    // Health Focus guidance (get_healthier)
    if (primaryGoal === 'get_healthier' && healthFocus) {
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
      guidance += healthGuidance[healthFocus] || '';
    }

    // Maintain Focus guidance
    if (primaryGoal === 'maintain' && maintainFocus) {
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
      guidance += maintainGuidance[maintainFocus] || '';
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
- Egg (large): 72 cal, 6g protein, 0.4g carbs, 5g fat
- Egg white (1 large): 17 cal, 4g protein, 0g carbs, 0g fat
- Chicken breast (4oz/113g): 165 cal, 31g protein, 0g carbs, 3.6g fat
- Chicken thigh (4oz): 210 cal, 26g protein, 0g carbs, 11g fat
- Chicken drumstick (1): 130 cal, 14g protein, 0g carbs, 8g fat
- Ground chicken (4oz): 150 cal, 20g protein, 0g carbs, 8g fat
- Turkey breast (4oz): 135 cal, 30g protein, 0g carbs, 1g fat
- Ground turkey 93% (4oz): 170 cal, 21g protein, 0g carbs, 9g fat
- Salmon (4oz/113g): 208 cal, 23g protein, 0g carbs, 12g fat
- Tuna (4oz canned, drained): 120 cal, 26g protein, 0g carbs, 1g fat
- Cod (4oz): 93 cal, 20g protein, 0g carbs, 1g fat
- Tilapia (4oz): 110 cal, 23g protein, 0g carbs, 2g fat
- Shrimp (4oz): 120 cal, 23g protein, 1g carbs, 2g fat
- Scallops (4oz): 100 cal, 20g protein, 3g carbs, 1g fat
- Ground beef 90% lean (4oz): 200 cal, 23g protein, 0g carbs, 11g fat
- Ground beef 85% lean (4oz): 240 cal, 21g protein, 0g carbs, 17g fat
- Beef sirloin (4oz): 207 cal, 26g protein, 0g carbs, 11g fat
- Beef tenderloin (4oz): 180 cal, 26g protein, 0g carbs, 8g fat
- Pork tenderloin (4oz): 136 cal, 24g protein, 0g carbs, 4g fat
- Pork chop (4oz): 187 cal, 26g protein, 0g carbs, 9g fat
- Bacon (2 slices): 86 cal, 6g protein, 0g carbs, 7g fat
- Ham (4oz): 120 cal, 20g protein, 2g carbs, 4g fat
- Lamb (4oz): 225 cal, 23g protein, 0g carbs, 14g fat
- Tofu firm (4oz): 94 cal, 10g protein, 2g carbs, 5g fat
- Tofu silken (4oz): 55 cal, 5g protein, 2g carbs, 2g fat
- Tempeh (4oz): 220 cal, 21g protein, 9g carbs, 13g fat
- Seitan (4oz): 150 cal, 30g protein, 4g carbs, 2g fat
- Greek yogurt plain nonfat (1 cup): 130 cal, 17g protein, 8g carbs, 0.7g fat
- Greek yogurt plain 2% (1 cup): 150 cal, 17g protein, 8g carbs, 4g fat
- Cottage cheese lowfat (1 cup): 163 cal, 28g protein, 6g carbs, 2g fat
- Cottage cheese 4% (1 cup): 206 cal, 28g protein, 6g carbs, 9g fat
- Black beans (1 cup cooked): 227 cal, 15g protein, 41g carbs, 1g fat
- Kidney beans (1 cup cooked): 225 cal, 15g protein, 40g carbs, 1g fat
- Pinto beans (1 cup cooked): 245 cal, 15g protein, 45g carbs, 1g fat
- Lentils (1 cup cooked): 230 cal, 18g protein, 40g carbs, 1g fat
- Chickpeas (1 cup cooked): 269 cal, 15g protein, 45g carbs, 4g fat
- Edamame (1 cup shelled): 188 cal, 18g protein, 14g carbs, 8g fat

GRAINS & STARCHES (per serving):
- Rice white (1 cup cooked): 206 cal, 4g protein, 45g carbs, 0.4g fat
- Rice brown (1 cup cooked): 216 cal, 5g protein, 45g carbs, 1.8g fat
- Rice jasmine (1 cup cooked): 205 cal, 4g protein, 45g carbs, 0.4g fat
- Quinoa (1 cup cooked): 222 cal, 8g protein, 39g carbs, 4g fat
- Couscous (1 cup cooked): 176 cal, 6g protein, 36g carbs, 0.3g fat
- Bulgur (1 cup cooked): 151 cal, 6g protein, 34g carbs, 0.4g fat
- Farro (1 cup cooked): 200 cal, 8g protein, 40g carbs, 2g fat
- Oats rolled (1/2 cup dry): 154 cal, 5g protein, 27g carbs, 2.5g fat
- Oats rolled (1 cup dry): 307 cal, 11g protein, 55g carbs, 5g fat
- Oatmeal instant (1 packet): 100 cal, 4g protein, 19g carbs, 2g fat
- Pasta (2oz dry = ~1 cup cooked): 200 cal, 7g protein, 42g carbs, 1g fat
- Pasta whole wheat (2oz dry): 180 cal, 8g protein, 37g carbs, 1.5g fat
- Bread white (1 slice): 75 cal, 2g protein, 14g carbs, 1g fat
- Bread whole wheat (1 slice): 81 cal, 4g protein, 14g carbs, 1g fat
- Bread sourdough (1 slice): 90 cal, 4g protein, 18g carbs, 0.5g fat
- English muffin (1 whole): 134 cal, 5g protein, 26g carbs, 1g fat
- Bagel (1 medium): 277 cal, 11g protein, 54g carbs, 1.4g fat
- Tortilla flour (1 medium 8"): 140 cal, 4g protein, 24g carbs, 3g fat
- Tortilla corn (1 medium 6"): 60 cal, 1g protein, 12g carbs, 1g fat
- Tortilla whole wheat (1 medium): 120 cal, 4g protein, 20g carbs, 3g fat
- Pita bread (1 whole 6.5"): 165 cal, 5g protein, 33g carbs, 1g fat
- Naan bread (1 piece): 260 cal, 9g protein, 45g carbs, 5g fat
- Sweet potato (1 medium/150g): 103 cal, 2g protein, 24g carbs, 0g fat
- Potato russet (1 medium/150g): 163 cal, 4g protein, 37g carbs, 0g fat
- Potato red (1 medium/150g): 154 cal, 4g protein, 34g carbs, 0g fat
- Corn (1 cup kernels): 132 cal, 5g protein, 29g carbs, 2g fat
- Corn on cob (1 medium ear): 90 cal, 3g protein, 19g carbs, 1g fat

VEGETABLES (per serving):
- Spinach raw (1 cup): 7 cal, 1g protein, 1g carbs, 0g fat
- Spinach cooked (1 cup): 41 cal, 5g protein, 7g carbs, 0g fat
- Kale raw (1 cup chopped): 33 cal, 3g protein, 6g carbs, 0.5g fat
- Kale cooked (1 cup): 36 cal, 2g protein, 7g carbs, 0.5g fat
- Arugula (1 cup): 5 cal, 0.5g protein, 1g carbs, 0g fat
- Lettuce romaine (1 cup): 8 cal, 1g protein, 2g carbs, 0g fat
- Mixed greens (1 cup): 10 cal, 1g protein, 2g carbs, 0g fat
- Broccoli (1 cup chopped): 55 cal, 4g protein, 11g carbs, 0.5g fat
- Broccoli (1 cup steamed): 55 cal, 4g protein, 11g carbs, 0.5g fat
- Cauliflower (1 cup): 27 cal, 2g protein, 5g carbs, 0.3g fat
- Brussels sprouts (1 cup): 56 cal, 4g protein, 11g carbs, 0.5g fat
- Asparagus (6 spears): 20 cal, 2g protein, 4g carbs, 0g fat
- Green beans (1 cup): 31 cal, 2g protein, 7g carbs, 0g fat
- Bell pepper red (1 medium): 37 cal, 1g protein, 7g carbs, 0g fat
- Bell pepper green (1 medium): 24 cal, 1g protein, 6g carbs, 0g fat
- Bell pepper yellow (1 medium): 50 cal, 2g protein, 12g carbs, 0g fat
- Jalapeño (1 pepper): 4 cal, 0g protein, 1g carbs, 0g fat
- Tomato (1 medium): 22 cal, 1g protein, 5g carbs, 0g fat
- Cherry tomatoes (1 cup): 27 cal, 1g protein, 6g carbs, 0g fat
- Tomato sauce (1/2 cup): 29 cal, 1g protein, 7g carbs, 0g fat
- Onion (1 medium): 44 cal, 1g protein, 10g carbs, 0g fat
- Onion (1/2 cup chopped): 32 cal, 1g protein, 7g carbs, 0g fat
- Green onion (1 stalk): 5 cal, 0g protein, 1g carbs, 0g fat
- Shallot (1 tbsp minced): 7 cal, 0g protein, 2g carbs, 0g fat
- Garlic (1 clove): 4 cal, 0g protein, 1g carbs, 0g fat
- Garlic (1 tbsp minced): 13 cal, 1g protein, 3g carbs, 0g fat
- Ginger (1 tbsp fresh): 5 cal, 0g protein, 1g carbs, 0g fat
- Mushrooms white (1 cup sliced): 15 cal, 2g protein, 2g carbs, 0g fat
- Mushrooms cremini (1 cup): 19 cal, 2g protein, 3g carbs, 0g fat
- Mushrooms portobello (1 cap): 18 cal, 2g protein, 3g carbs, 0g fat
- Zucchini (1 medium): 33 cal, 2g protein, 6g carbs, 0.5g fat
- Zucchini (1 cup sliced): 19 cal, 1g protein, 4g carbs, 0g fat
- Yellow squash (1 cup): 18 cal, 1g protein, 4g carbs, 0g fat
- Eggplant (1 cup cubed): 21 cal, 1g protein, 5g carbs, 0g fat
- Cucumber (1 cup sliced): 16 cal, 1g protein, 4g carbs, 0g fat
- Celery (1 cup chopped): 14 cal, 1g protein, 3g carbs, 0g fat
- Carrots (1 medium): 25 cal, 1g protein, 6g carbs, 0g fat
- Carrots (1 cup chopped): 52 cal, 1g protein, 12g carbs, 0g fat
- Beets (1 cup): 58 cal, 2g protein, 13g carbs, 0g fat
- Cabbage green (1 cup shredded): 18 cal, 1g protein, 4g carbs, 0g fat
- Cabbage red (1 cup shredded): 22 cal, 1g protein, 5g carbs, 0g fat
- Bok choy (1 cup): 9 cal, 1g protein, 2g carbs, 0g fat
- Avocado (half): 161 cal, 2g protein, 9g carbs, 15g fat
- Avocado (1/4): 80 cal, 1g protein, 4g carbs, 7g fat
- Peas green (1 cup): 118 cal, 8g protein, 21g carbs, 1g fat
- Snow peas (1 cup): 26 cal, 2g protein, 5g carbs, 0g fat
- Sugar snap peas (1 cup): 41 cal, 3g protein, 7g carbs, 0g fat

FATS & OILS (per serving):
- Olive oil (1 tbsp): 119 cal, 0g protein, 0g carbs, 13.5g fat
- Olive oil (1 tsp): 40 cal, 0g protein, 0g carbs, 4.5g fat
- Coconut oil (1 tbsp): 121 cal, 0g protein, 0g carbs, 13.5g fat
- Avocado oil (1 tbsp): 124 cal, 0g protein, 0g carbs, 14g fat
- Sesame oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Vegetable oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Butter (1 tbsp): 102 cal, 0g protein, 0g carbs, 12g fat
- Butter (1 tsp): 34 cal, 0g protein, 0g carbs, 4g fat
- Ghee (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Almonds (1oz / 23 nuts): 164 cal, 6g protein, 6g carbs, 14g fat
- Almonds sliced (1/4 cup): 132 cal, 5g protein, 5g carbs, 11g fat
- Walnuts (1oz / 14 halves): 185 cal, 4g protein, 4g carbs, 18g fat
- Walnuts chopped (1/4 cup): 196 cal, 5g protein, 4g carbs, 20g fat
- Cashews (1oz): 157 cal, 5g protein, 9g carbs, 12g fat
- Pecans (1oz): 196 cal, 3g protein, 4g carbs, 20g fat
- Pine nuts (1 tbsp): 57 cal, 1g protein, 1g carbs, 6g fat
- Pistachios (1oz): 159 cal, 6g protein, 8g carbs, 13g fat
- Peanuts (1oz): 161 cal, 7g protein, 5g carbs, 14g fat
- Macadamia nuts (1oz): 204 cal, 2g protein, 4g carbs, 21g fat
- Peanut butter (2 tbsp): 188 cal, 8g protein, 6g carbs, 16g fat
- Peanut butter (1 tbsp): 94 cal, 4g protein, 3g carbs, 8g fat
- Almond butter (2 tbsp): 196 cal, 7g protein, 6g carbs, 18g fat
- Almond butter (1 tbsp): 98 cal, 3g protein, 3g carbs, 9g fat
- Tahini (1 tbsp): 89 cal, 3g protein, 3g carbs, 8g fat
- Sunflower seeds (1oz): 165 cal, 5g protein, 7g carbs, 14g fat
- Pumpkin seeds (1oz): 158 cal, 9g protein, 3g carbs, 14g fat
- Chia seeds (1 tbsp): 58 cal, 2g protein, 5g carbs, 4g fat
- Chia seeds (2 tbsp): 116 cal, 4g protein, 10g carbs, 7g fat
- Flaxseed (1 tbsp): 37 cal, 1g protein, 2g carbs, 3g fat
- Hemp seeds (1 tbsp): 57 cal, 3g protein, 1g carbs, 4g fat

DAIRY & ALTERNATIVES:
- Milk whole (1 cup): 149 cal, 8g protein, 12g carbs, 8g fat
- Milk 2% (1 cup): 122 cal, 8g protein, 12g carbs, 5g fat
- Milk 1% (1 cup): 102 cal, 8g protein, 12g carbs, 2g fat
- Milk skim (1 cup): 83 cal, 8g protein, 12g carbs, 0g fat
- Almond milk unsweetened (1 cup): 30 cal, 1g protein, 1g carbs, 2.5g fat
- Oat milk (1 cup): 120 cal, 3g protein, 16g carbs, 5g fat
- Soy milk unsweetened (1 cup): 80 cal, 7g protein, 4g carbs, 4g fat
- Coconut milk canned (1/4 cup): 111 cal, 1g protein, 2g carbs, 12g fat
- Coconut milk carton (1 cup): 45 cal, 0g protein, 2g carbs, 4g fat
- Heavy cream (1 tbsp): 51 cal, 0g protein, 0g carbs, 5g fat
- Half and half (1 tbsp): 20 cal, 0g protein, 1g carbs, 2g fat
- Sour cream (2 tbsp): 60 cal, 1g protein, 1g carbs, 6g fat
- Cream cheese (1 tbsp): 51 cal, 1g protein, 1g carbs, 5g fat
- Cheese cheddar (1oz): 113 cal, 7g protein, 0.4g carbs, 9g fat
- Cheese mozzarella (1oz): 85 cal, 6g protein, 1g carbs, 6g fat
- Cheese mozzarella fresh (1oz): 70 cal, 5g protein, 1g carbs, 5g fat
- Cheese parmesan (1 tbsp grated): 22 cal, 2g protein, 0g carbs, 1.5g fat
- Cheese parmesan (1oz): 110 cal, 10g protein, 1g carbs, 7g fat
- Cheese feta (1oz): 75 cal, 4g protein, 1g carbs, 6g fat
- Cheese goat (1oz): 75 cal, 5g protein, 0g carbs, 6g fat
- Cheese ricotta part-skim (1/4 cup): 85 cal, 7g protein, 3g carbs, 5g fat
- Cheese Swiss (1oz): 108 cal, 8g protein, 2g carbs, 8g fat
- Cheese provolone (1oz): 98 cal, 7g protein, 1g carbs, 7g fat
- Cheese blue (1oz): 100 cal, 6g protein, 1g carbs, 8g fat

FRUITS:
- Banana (1 medium): 105 cal, 1g protein, 27g carbs, 0.4g fat
- Banana (1/2 medium): 53 cal, 0.5g protein, 14g carbs, 0.2g fat
- Apple (1 medium): 95 cal, 0.5g protein, 25g carbs, 0.3g fat
- Orange (1 medium): 62 cal, 1g protein, 15g carbs, 0g fat
- Grapefruit (1/2): 52 cal, 1g protein, 13g carbs, 0g fat
- Lemon juice (1 tbsp): 4 cal, 0g protein, 1g carbs, 0g fat
- Lime juice (1 tbsp): 4 cal, 0g protein, 1g carbs, 0g fat
- Blueberries (1 cup): 84 cal, 1g protein, 21g carbs, 0.5g fat
- Blueberries (1/2 cup): 42 cal, 0.5g protein, 11g carbs, 0.2g fat
- Strawberries (1 cup sliced): 49 cal, 1g protein, 12g carbs, 0.5g fat
- Raspberries (1 cup): 64 cal, 1g protein, 15g carbs, 0.8g fat
- Blackberries (1 cup): 62 cal, 2g protein, 14g carbs, 0.7g fat
- Mango (1 cup cubed): 99 cal, 1g protein, 25g carbs, 0.6g fat
- Pineapple (1 cup chunks): 82 cal, 1g protein, 22g carbs, 0.2g fat
- Grapes (1 cup): 104 cal, 1g protein, 27g carbs, 0.2g fat
- Watermelon (1 cup cubed): 46 cal, 1g protein, 12g carbs, 0.2g fat
- Cantaloupe (1 cup cubed): 54 cal, 1g protein, 13g carbs, 0.3g fat
- Peach (1 medium): 59 cal, 1g protein, 14g carbs, 0.4g fat
- Pear (1 medium): 102 cal, 1g protein, 27g carbs, 0.2g fat
- Cherries (1 cup): 97 cal, 2g protein, 25g carbs, 0.3g fat
- Kiwi (1 medium): 42 cal, 1g protein, 10g carbs, 0.4g fat
- Dried cranberries (1/4 cup): 123 cal, 0g protein, 33g carbs, 0.5g fat
- Raisins (1/4 cup): 123 cal, 1g protein, 33g carbs, 0.2g fat
- Dates medjool (1): 66 cal, 0g protein, 18g carbs, 0g fat
- Dried apricots (1/4 cup): 78 cal, 1g protein, 20g carbs, 0.1g fat

CONDIMENTS, SAUCES & EXTRAS:
- Honey (1 tbsp): 64 cal, 0g protein, 17g carbs, 0g fat
- Honey (1 tsp): 21 cal, 0g protein, 6g carbs, 0g fat
- Maple syrup (1 tbsp): 52 cal, 0g protein, 13g carbs, 0g fat
- Agave nectar (1 tbsp): 60 cal, 0g protein, 16g carbs, 0g fat
- Brown sugar (1 tbsp): 52 cal, 0g protein, 13g carbs, 0g fat
- White sugar (1 tbsp): 49 cal, 0g protein, 13g carbs, 0g fat
- Soy sauce (1 tbsp): 9 cal, 1g protein, 1g carbs, 0g fat
- Tamari (1 tbsp): 10 cal, 2g protein, 1g carbs, 0g fat
- Fish sauce (1 tbsp): 6 cal, 1g protein, 1g carbs, 0g fat
- Worcestershire sauce (1 tsp): 4 cal, 0g protein, 1g carbs, 0g fat
- Hot sauce (1 tsp): 0 cal, 0g protein, 0g carbs, 0g fat
- Sriracha (1 tsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Salsa (2 tbsp): 10 cal, 0g protein, 2g carbs, 0g fat
- Pico de gallo (2 tbsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Guacamole (2 tbsp): 50 cal, 1g protein, 3g carbs, 4g fat
- Hummus (2 tbsp): 70 cal, 2g protein, 4g carbs, 5g fat
- Tzatziki (2 tbsp): 30 cal, 1g protein, 2g carbs, 2g fat
- Mustard (1 tsp): 3 cal, 0g protein, 0g carbs, 0g fat
- Dijon mustard (1 tsp): 5 cal, 0g protein, 0g carbs, 0g fat
- Ketchup (1 tbsp): 20 cal, 0g protein, 5g carbs, 0g fat
- Mayonnaise (1 tbsp): 94 cal, 0g protein, 0g carbs, 10g fat
- Mayo light (1 tbsp): 35 cal, 0g protein, 1g carbs, 3g fat
- Greek yogurt (as sauce, 2 tbsp): 18 cal, 2g protein, 1g carbs, 0g fat
- Ranch dressing (2 tbsp): 140 cal, 0g protein, 2g carbs, 14g fat
- Vinaigrette (2 tbsp): 90 cal, 0g protein, 2g carbs, 9g fat
- Balsamic vinegar (1 tbsp): 14 cal, 0g protein, 3g carbs, 0g fat
- Red wine vinegar (1 tbsp): 3 cal, 0g protein, 0g carbs, 0g fat
- Apple cider vinegar (1 tbsp): 3 cal, 0g protein, 0g carbs, 0g fat
- Rice vinegar (1 tbsp): 0 cal, 0g protein, 0g carbs, 0g fat
- Marinara sauce (1/2 cup): 70 cal, 2g protein, 10g carbs, 3g fat
- Pesto (1 tbsp): 80 cal, 2g protein, 1g carbs, 8g fat
- Teriyaki sauce (1 tbsp): 16 cal, 1g protein, 3g carbs, 0g fat
- BBQ sauce (2 tbsp): 70 cal, 0g protein, 17g carbs, 0g fat
- Hoisin sauce (1 tbsp): 35 cal, 1g protein, 7g carbs, 0.5g fat
- Oyster sauce (1 tbsp): 9 cal, 0g protein, 2g carbs, 0g fat
- Miso paste (1 tbsp): 34 cal, 2g protein, 4g carbs, 1g fat
- Coconut cream (2 tbsp): 100 cal, 1g protein, 2g carbs, 10g fat
- Nutritional yeast (2 tbsp): 45 cal, 8g protein, 5g carbs, 0.5g fat
- Flour all-purpose (1 tbsp): 28 cal, 1g protein, 6g carbs, 0g fat
- Flour whole wheat (1 tbsp): 25 cal, 1g protein, 5g carbs, 0g fat
- Cornstarch (1 tbsp): 30 cal, 0g protein, 7g carbs, 0g fat
- Breadcrumbs (1/4 cup): 110 cal, 4g protein, 20g carbs, 1.5g fat
- Panko breadcrumbs (1/4 cup): 55 cal, 2g protein, 11g carbs, 0.5g fat

⚠️ FOR INGREDIENTS NOT LISTED ABOVE:
Use your nutritional knowledge to look up accurate calorie and macro values.
Do not guess - provide accurate nutritional data based on standard serving sizes.

COOKING METHOD ADJUSTMENTS (affects both calories AND fat):
Account for how ingredients are cooked:

- Deep fried: Add +75 cal, +8g fat per 4oz protein
- Pan fried / Sautéed: Add calories from oil used (119 cal, 13.5g fat per tbsp olive oil)
- Stir-fried: Add calories from oil used (typically 1-2 tbsp)
- Baked/Roasted with oil: Add +20 cal, +2g fat if oil brushed on
- Grilled: No addition (fat drips off, may slightly reduce fat)
- Steamed / Boiled / Poached: No addition
- Air fried: Add +5-10 cal (minimal oil)
- Breaded & fried: Add +100 cal, +10g fat, +15g carbs (breading + oil)

Examples:
- "Pan-fried salmon (4oz) in 1 tbsp olive oil" = 208+119=327 cal, 12+13.5=25.5g fat
- "Grilled salmon (4oz)" = 208 cal, 12g fat
- "Breaded fried chicken (4oz)" = 165+100=265 cal, 3.6+10=13.6g fat, 0+15=15g carbs

Always specify cooking method and account for it in ALL macro calculations.

⚠️ CALCULATION REQUIREMENT FOR ALL MACROS:
For each meal, sum ALL macros from ingredients (not just calories):

1. CALORIES: Sum all ingredient calories, then round to nearest 5
   Example: 487 → 485, 523 → 525, 612 → 610

2. PROTEIN: Sum all ingredient protein, then round to nearest 1g
   Example: 47.3g → 47g, 32.8g → 33g

3. CARBS: Sum all ingredient carbs, then round to nearest 5g
   Example: 67.4g → 65g, 43.2g → 45g

4. FAT: Sum all ingredient fat, then round to nearest 1g
   Example: 23.7g → 24g, 15.2g → 15g

The final meal object MUST have all fields calculated from ingredients:
- estimatedCalories: rounded sum of ingredient calories
- protein: rounded sum of ingredient protein
- carbs: rounded sum of ingredient carbs
- fat: rounded sum of ingredient fat

Do NOT estimate these values - CALCULATE by summing ingredients from the reference table.

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
10. ⚠️ DIETARY RESTRICTIONS ARE NON-NEGOTIABLE - never include forbidden ingredients
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
8. The "uses" field should list which meals use this ingredient`;
}

// Restaurant meal generation prompt for 7-day system
export function createRestaurantMealGenerationPrompt(context: RestaurantMealContext): string {
  const { restaurantMealsSchedule, restaurantMenuData, surveyData, nutritionTargets } = context;

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
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Fitness Level: ${surveyData.fitnessLevel || 'Not specified'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Varied'}
- Budget: ${surveyData.monthlyFoodBudget || 200}/month

⚠️ DIETARY RESTRICTIONS (MUST FILTER MENU ITEMS):
${(() => {
  const restrictions = surveyData.dietPrefs || [];
  if (restrictions.length === 0) return '- No restrictions - any menu items allowed';

  return restrictions.map(pref => {
    if (pref === 'Vegetarian') return '- VEGETARIAN: Only select dishes without meat, poultry, or fish';
    if (pref === 'Vegan') return '- VEGAN: Only select dishes with no animal products (no meat, dairy, eggs)';
    if (pref === 'Gluten-Free') return '- GLUTEN-FREE: Avoid bread, pasta, breaded items unless marked GF';
    if (pref === 'Dairy-Free') return '- DAIRY-FREE: Avoid dishes with cheese, cream sauces, butter';
    if (pref === 'Keto') return '- KETO: Select high-fat, low-carb options. Skip rice, bread, pasta sides';
    if (pref === 'Halal') return '- HALAL: Skip pork dishes and non-halal meats';
    return `- ${pref}: Apply appropriate restrictions`;
  }).join('\n');
})()}

🥗 PREFERRED FOODS (SELECT DISHES FEATURING THESE):
${(surveyData.preferredFoods || []).length > 0
  ? `Prioritize menu items containing: ${surveyData.preferredFoods.slice(0, 10).join(', ')}`
  : '- No specific ingredient preferences'}

⚠️ CRITICAL REQUIREMENTS:
1. Select EXACTLY ${restaurantMealsSchedule.length} meals matching the schedule
2. ⚠️ CALORIE TARGETS: Each meal MUST be within ±100 calories of the target above
3. For EACH meal, provide BOTH a primary AND alternative option from DIFFERENT restaurants
4. ⚠️ ORDERING LINKS ARE REQUIRED: Copy the EXACT orderingLinks from the restaurant data above
5. Distribute across different restaurants for variety
6. Consider meal timing (lighter lunches, heartier dinners)
7. Stay within budget and dietary preferences
8. Use ONLY restaurants and menu items from the data provided above
9. NEVER leave orderingLinks empty - copy them directly from the restaurant data
10. ⚠️ DIETARY RESTRICTIONS ARE ABSOLUTE - never select forbidden menu items
11. ⚠️ PREFERRED FOODS: When available, prioritize dishes featuring user's preferred ingredients

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
  return `Select the 6-8 best restaurants from this list for a weekly meal plan.

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
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal || 'General Wellness'}
- Main Challenge: ${surveyData.goalChallenge || 'None specified'}
- Health Focus: ${surveyData.healthFocus || 'General wellness'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ')}
- Budget: $${surveyData.monthlyFoodBudget || 200}/month

SELECTION CRITERIA:
1. Choose 6-8 restaurants maximum
2. Prioritize variety in cuisine types
3. Balance high-rated options with budget constraints
4. Consider location convenience
5. Ensure good mix for different meal types (lunch/dinner)

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