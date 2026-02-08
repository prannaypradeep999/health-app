// Recipe Generation Prompts

export interface RecipeContext {
  dishName: string;
  description?: string;
  mealType: string;
  // NEW: Add nutrition targets
  nutritionTargets?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  // NEW: Add existing grocery list items to use
  existingGroceryItems?: string[];
  // NEW: User dietary restrictions
  dietaryRestrictions?: string[];
}

export interface Recipe {
  name: string;
  description: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  servings: number;
  difficulty: string;
  cuisine: string;
  tags: string[];
  groceryList: Array<{
    ingredient: string;
    amount: string;
    category: string;
    note?: string;
  }>;
  ingredientsWithNutrition?: Array<{
    item: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  ingredients: string[];
  instructions: string[];
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium: number;
  };
  tips: string[];
  storage: string;
  reheatInstructions: string;
}

// Main Recipe Generation Prompt
export const createRecipeGenerationPrompt = (context: RecipeContext): string => {
  const nutritionSection = context.nutritionTargets ? `
⚠️ CRITICAL - EXACT NUTRITION REQUIREMENTS (NON-NEGOTIABLE):
These macros are ALREADY displayed to the user in their meal plan.
Your recipe MUST produce these EXACT values:

- Calories: ${context.nutritionTargets.calories} cal
- Protein: ${context.nutritionTargets.protein}g
- Carbs: ${context.nutritionTargets.carbs}g
- Fat: ${context.nutritionTargets.fat}g

REQUIREMENTS:
1. Adjust ingredient quantities to hit these exact targets
2. Scale portions up or down as needed
3. In your JSON response, the "nutrition" object MUST contain these EXACT numbers:
   "nutrition": {
     "calories": ${context.nutritionTargets.calories},
     "protein": ${context.nutritionTargets.protein},
     "carbs": ${context.nutritionTargets.carbs},
     "fat": ${context.nutritionTargets.fat},
     "fiber": <your calculation>,
     "sodium": <your calculation>
   }

DO NOT return different nutrition values - use exactly these numbers.
The recipe instructions should guide the user to produce a meal matching these macros.` : '';

  const roundingSection = `
⚠️ ROUNDING RULES (REQUIRED):
- Round all CALORIES to the nearest 5 or 10
- Round all MACROS (protein, carbs, fat) to the nearest whole number
- Per-ingredient values should also be rounded
- Final nutrition totals should be clean, round numbers`;

  const sumVerificationSection = `
⚠️ CRITICAL - INGREDIENT SUM VERIFICATION:
1. List EVERY ingredient in "ingredientsWithNutrition" with its nutrition values
2. The SUM of all ingredient values MUST EQUAL the nutrition totals:
   - Sum of ingredient calories = nutrition.calories
   - Sum of ingredient protein = nutrition.protein
   - Sum of ingredient carbs = nutrition.carbs
   - Sum of ingredient fat = nutrition.fat
3. VERIFY your math before finalizing the recipe.`;

  const grocerySection = context.existingGroceryItems?.length ? `
PREFERRED INGREDIENTS (prioritize using these from user's grocery list):
${context.existingGroceryItems.map(item => `- ${item}`).join('\n')}

Try to use ingredients from this list when possible to minimize waste.` : '';

  const dietarySection = context.dietaryRestrictions?.length ? `
DIETARY RESTRICTIONS (must follow):
${context.dietaryRestrictions.map(r => `- ${r}`).join('\n')}` : '';

  const ingredientReference = `
INGREDIENT REFERENCE TABLE (use for accurate portion scaling):
Use this reference table for common ingredients. For ingredients NOT listed,
use accurate nutritional knowledge (USDA values).

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
- Egg (large): 70 cal, 6g protein, 0.5g carbs, 5g fat
- Egg white (1 large): 15 cal, 4g protein, 0g carbs, 0g fat
- Greek yogurt plain 2% (1 cup): 150 cal, 17g protein, 8g carbs, 4g fat
- Greek yogurt plain nonfat (1 cup): 130 cal, 17g protein, 8g carbs, 0.5g fat
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
- Almond milk unsweetened (1 cup): 30 cal, 1g protein, 1g carbs, 2.5g fat
- Cheddar cheese (1 oz): 115 cal, 7g protein, 0g carbs, 9g fat
- Cheese blue (1 oz): 100 cal, 6g protein, 1g carbs, 8g fat
- Cheese feta (1 oz): 75 cal, 4g protein, 1g carbs, 6g fat
- Cheese goat (1 oz): 75 cal, 5g protein, 0g carbs, 6g fat
- Cheese mozzarella fresh (1 oz): 70 cal, 5g protein, 1g carbs, 5g fat
- Cheese parmesan (1 oz): 110 cal, 10g protein, 1g carbs, 7g fat
- Cheese parmesan (1 tbsp grated): 20 cal, 2g protein, 0g carbs, 1.5g fat
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
- Bagel (1 medium): 275 cal, 11g protein, 54g carbs, 1.5g fat
- Bread sourdough (1 slice): 90 cal, 4g protein, 18g carbs, 0.5g fat
- Bread white (1 slice): 75 cal, 2g protein, 14g carbs, 1g fat
- Bulgur (1 cup cooked): 150 cal, 6g protein, 34g carbs, 0.5g fat
- Corn (1 cup kernels): 130 cal, 5g protein, 29g carbs, 2g fat
- Corn on cob (1 medium ear): 90 cal, 3g protein, 19g carbs, 1g fat
- Couscous (1 cup cooked): 175 cal, 6g protein, 36g carbs, 0.5g fat
- English muffin (1 whole): 135 cal, 5g protein, 26g carbs, 1g fat
- Farro (1 cup cooked): 200 cal, 8g protein, 40g carbs, 2g fat
- Naan bread (1 piece): 260 cal, 9g protein, 45g carbs, 5g fat
- Oatmeal instant (1 packet): 100 cal, 4g protein, 19g carbs, 2g fat
- Oats rolled (1 cup dry): 305 cal, 11g protein, 55g carbs, 5g fat
- Oats rolled (1/2 cup dry): 155 cal, 5g protein, 27g carbs, 2.5g fat
- Pasta (2 oz dry = ~1 cup cooked): 200 cal, 7g protein, 42g carbs, 1g fat
- Pasta whole wheat (2 oz dry): 180 cal, 8g protein, 37g carbs, 1.5g fat
- Pita bread (1 whole 6.5"): 165 cal, 5g protein, 33g carbs, 1g fat
- Potato red (1 medium/150g): 155 cal, 4g protein, 34g carbs, 0g fat
- Potato russet (1 medium/150g): 165 cal, 4g protein, 37g carbs, 0g fat
- Quinoa (1 cup cooked): 220 cal, 8g protein, 40g carbs, 4g fat
- Rice brown (1 cup cooked): 215 cal, 5g protein, 45g carbs, 2g fat
- Rice jasmine (1 cup cooked): 205 cal, 4g protein, 45g carbs, 0.5g fat
- Rice white (1 cup cooked): 205 cal, 4g protein, 45g carbs, 0.5g fat
- Sweet potato (1 medium): 100 cal, 2g protein, 24g carbs, 0g fat
- Tortilla whole wheat (1 medium): 120 cal, 4g protein, 20g carbs, 3g fat
- Tortilla, corn (1 medium): 60 cal, 1g protein, 12g carbs, 1g fat
- Tortilla, flour (1 medium): 140 cal, 4g protein, 24g carbs, 3g fat
- Whole wheat bread (1 slice): 80 cal, 4g protein, 15g carbs, 1g fat

VEGETABLES (per serving):
- Arugula (1 cup): 5 cal, 0.5g protein, 1g carbs, 0g fat
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
- Broccoli (1 cup chopped): 55 cal, 4g protein, 11g carbs, 0.5g fat
- Broccoli (1 cup steamed): 55 cal, 4g protein, 11g carbs, 0.5g fat
- Brussels sprouts (1 cup): 55 cal, 4g protein, 11g carbs, 0.5g fat
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
- Kale cooked (1 cup): 35 cal, 2g protein, 7g carbs, 0.5g fat
- Kale raw (1 cup chopped): 35 cal, 3g protein, 6g carbs, 0.5g fat
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
- Zucchini (1 medium): 35 cal, 2g protein, 6g carbs, 0.5g fat

FRUITS (per serving):
- Apple (1 medium): 95 cal, 0.5g protein, 25g carbs, 0.5g fat
- Banana (1 medium): 105 cal, 1g protein, 27g carbs, 0.5g fat
- Banana (1/2 medium): 55 cal, 0.5g protein, 14g carbs, 0g fat
- Blackberries (1 cup): 60 cal, 2g protein, 14g carbs, 0.5g fat
- Blueberries (1 cup): 85 cal, 1g protein, 21g carbs, 0.5g fat
- Blueberries (1/2 cup): 40 cal, 0.5g protein, 11g carbs, 0g fat
- Cantaloupe (1 cup cubed): 55 cal, 1g protein, 13g carbs, 0.5g fat
- Cherries (1 cup): 95 cal, 2g protein, 25g carbs, 0.5g fat
- Dates medjool (1): 65 cal, 0g protein, 18g carbs, 0g fat
- Dried apricots (1/4 cup): 80 cal, 1g protein, 20g carbs, 0g fat
- Dried cranberries (1/4 cup): 125 cal, 0g protein, 33g carbs, 0.5g fat
- Grapefruit (1/2): 50 cal, 1g protein, 13g carbs, 0g fat
- Grapes (1 cup): 105 cal, 1g protein, 27g carbs, 0g fat
- Kiwi (1 medium): 40 cal, 1g protein, 10g carbs, 0.5g fat
- Lemon juice (1 tbsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Lime juice (1 tbsp): 5 cal, 0g protein, 1g carbs, 0g fat
- Mango (1 cup cubed): 100 cal, 1g protein, 25g carbs, 0.5g fat
- Orange (1 medium): 60 cal, 1g protein, 15g carbs, 0g fat
- Peach (1 medium): 60 cal, 1g protein, 14g carbs, 0.5g fat
- Pear (1 medium): 100 cal, 1g protein, 27g carbs, 0g fat
- Pineapple (1 cup chunks): 80 cal, 1g protein, 22g carbs, 0g fat
- Raisins (1/4 cup): 125 cal, 1g protein, 33g carbs, 0g fat
- Raspberries (1 cup): 65 cal, 1g protein, 15g carbs, 1g fat
- Strawberries (1 cup sliced): 50 cal, 1g protein, 12g carbs, 0.5g fat
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
- Coconut oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 13.5g fat
- Ghee (1 tbsp): 120 cal, 0g protein, 0g carbs, 14g fat
- Olive oil (1 tbsp): 120 cal, 0g protein, 0g carbs, 13.5g fat
- Olive oil (1 tsp): 40 cal, 0g protein, 0g carbs, 4.5g fat
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
- Breadcrumbs (1/4 cup): 110 cal, 4g protein, 20g carbs, 1.5g fat
- Brown sugar (1 tbsp): 50 cal, 0g protein, 13g carbs, 0g fat
- Coconut cream (2 tbsp): 100 cal, 1g protein, 2g carbs, 10g fat
- Cornstarch (1 tbsp): 30 cal, 0g protein, 7g carbs, 0g fat
- Dijon mustard (1 tsp): 5 cal, 0g protein, 0g carbs, 0g fat
- Fish sauce (1 tbsp): 5 cal, 1g protein, 1g carbs, 0g fat
- Flour all-purpose (1 tbsp): 30 cal, 1g protein, 6g carbs, 0g fat
- Flour whole wheat (1 tbsp): 25 cal, 1g protein, 5g carbs, 0g fat
- Greek yogurt (as sauce, 2 tbsp): 20 cal, 2g protein, 1g carbs, 0g fat
- Guacamole (2 tbsp): 50 cal, 1g protein, 3g carbs, 4g fat
- Hoisin sauce (1 tbsp): 35 cal, 1g protein, 7g carbs, 0.5g fat
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
- Nutritional yeast (2 tbsp): 45 cal, 8g protein, 5g carbs, 0.5g fat
- Oyster sauce (1 tbsp): 10 cal, 0g protein, 2g carbs, 0g fat
- Panko breadcrumbs (1/4 cup): 55 cal, 2g protein, 11g carbs, 0.5g fat
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
- Worcestershire sauce (1 tsp): 5 cal, 0g protein, 1g carbs, 0g fat

For ingredients not listed, use standard nutritional knowledge.`;

  return `You are a professional chef and nutritionist. Generate a comprehensive, detailed recipe for "${context.dishName}".
${ingredientReference}

DISH DETAILS:
- Name: ${context.dishName}
- Description: ${context.description || 'No description provided'}
- Meal Type: ${context.mealType}
${nutritionSection}
${roundingSection}
${sumVerificationSection}
${grocerySection}
${dietarySection}

REQUIREMENTS:
1. Create a complete recipe with detailed ingredients and step-by-step instructions
2. ${context.nutritionTargets ? 'CRITICAL: Match the nutrition targets above as closely as possible' : 'Include accurate nutritional information'}
3. ${context.existingGroceryItems?.length ? 'Prioritize ingredients from the user\'s existing grocery list' : 'Provide a comprehensive grocery list with specific quantities'}
4. Make it practical and achievable for home cooking
5. Focus on fresh, healthy ingredients

RESPONSE FORMAT - Return ONLY valid JSON:
{
  "name": "${context.dishName}",
  "description": "Brief appetizing description of the dish",
  "prepTime": "15 min",
  "cookTime": "25 min",
  "totalTime": "40 min",
  "servings": 2,
  "difficulty": "Easy|Medium|Hard",
  "cuisine": "Type of cuisine",
  "tags": ["healthy", "protein-rich", "quick"],
  "groceryList": [
    {
      "ingredient": "Chicken breast",
      "amount": "1 lb",
      "category": "Meat",
      "note": "boneless, skinless"
    },
    {
      "ingredient": "Olive oil",
      "amount": "2 tbsp",
      "category": "Pantry",
      "note": "extra virgin"
    }
  ],
  "ingredientsWithNutrition": [
    { "item": "1 lb chicken breast", "calories": 760, "protein": 140, "carbs": 0, "fat": 16 },
    { "item": "2 tbsp olive oil", "calories": 240, "protein": 0, "carbs": 0, "fat": 28 },
    { "item": "1 tsp salt", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
    { "item": "1/2 tsp black pepper", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
  ],
  "ingredients": [
    "1 lb chicken breast, boneless and skinless",
    "2 tbsp extra virgin olive oil",
    "1 tsp salt",
    "1/2 tsp black pepper"
  ],
  "instructions": [
    "Preheat oven to 375°F (190°C).",
    "Season chicken breast with salt and pepper on both sides.",
    "Heat olive oil in an oven-safe skillet over medium-high heat.",
    "Sear chicken breast for 3-4 minutes per side until golden brown.",
    "Transfer skillet to preheated oven and bake for 15-20 minutes until internal temperature reaches 165°F (74°C).",
    "Let rest for 5 minutes before slicing and serving."
  ],
  "nutrition": {
    "calories": ${context.nutritionTargets?.calories || 320},
    "protein": ${context.nutritionTargets?.protein || 45},
    "carbs": ${context.nutritionTargets?.carbs || 2},
    "fat": ${context.nutritionTargets?.fat || 14},
    "fiber": 0,
    "sodium": 580
  },
  "tips": [
    "Use a meat thermometer to ensure chicken is cooked through",
    "Let chicken rest to retain juices"
  ],
  "storage": "Store leftovers in refrigerator for up to 3 days",
  "reheatInstructions": "Reheat in 350°F oven for 10-12 minutes or microwave for 1-2 minutes"
}

CRITICAL: Response must be pure JSON starting with { and ending with }. No markdown, no explanations, no extra text.`;
};