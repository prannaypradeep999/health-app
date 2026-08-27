import { normalizeRestriction } from '@/lib/utils/restriction-validator';

/** The survey fields the two restaurant-menu prompts read. */
export interface MenuPromptSurvey {
  dietPrefs?: string[];
  foodAllergies?: string[];
  preferredCuisines?: string[];
  goal?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  distancePreference?: string;
}

/**
 * B11: this block did not exist, and `foodAllergies` reached neither prompt.
 * The survey collected it, the route read it, and the only consumer was a
 * post-hoc validator whose output nothing renders — so an allergy influenced
 * nothing a user could see.
 *
 * Worded harder than the dietary rules on purpose. A diet is a preference the
 * model may trade off against calories or price; an allergen is not.
 */
export function buildAllergyBlock(surveyData: MenuPromptSurvey): string {
  const allergies = (surveyData.foodAllergies || []).map(a => String(a).trim()).filter(Boolean);
  if (allergies.length === 0) return '';
  return `
🚨 ALLERGIES — HARD EXCLUSION, NOT A PREFERENCE:
The user is allergic to: ${allergies.join(', ')}.
NEVER select a dish containing any of these, and never select a dish whose
description makes it unclear. If a dish might contain one, skip it and choose
another. A missing option is acceptable; an allergen is not.
`;
}

/**
 * Extracted verbatim from the IIFE that used to sit inline in processWithGPT4.
 * The lowercase keys are the values the survey actually persists — see the note
 * in restriction-validator.ts. `normalizeRestriction` is applied first so that
 * "Gluten-Free" and "gluten free" reach the same rule.
 */
export function buildDietaryRulesBlock(surveyData: MenuPromptSurvey): string {
  const restrictions = surveyData.dietPrefs || [];
  if (restrictions.length === 0) return '   - No dietary restrictions to apply';

  const RULES: Record<string, string> = {
    vegetarian:    'VEGETARIAN: Exclude dishes with meat, poultry, fish, or gelatin',
    vegan:         'VEGAN: Exclude dishes with any animal products (meat, dairy, eggs, honey)',
    pescatarian:   'PESCATARIAN: Exclude meat and poultry dishes, but fish/seafood is allowed',
    keto:          'KETO: Exclude high-carb dishes like rice bowls, pasta, or bread-heavy items',
    paleo:         'PALEO: Exclude grains, legumes, dairy, and processed/refined foods',
    mediterranean: 'MEDITERRANEAN: Prefer fish, vegetables, legumes and olive oil; exclude heavily processed or deep-fried dishes',
    halal:         'HALAL: Exclude pork dishes and non-halal meat options',
    kosher:        'KOSHER: Exclude pork and shellfish, and any dish mixing meat with dairy',
    gluten:        'GLUTEN-FREE: Exclude bread-based, pasta, or wheat dishes unless marked gluten-free',
    dairy:         'DAIRY-FREE: Exclude dishes with cheese, cream sauces, or dairy ingredients',
  };

  let rules = '';
  restrictions.forEach((pref: string) => {
    const key = normalizeRestriction(pref);
    // Unknown values must still produce a hard exclusion. Falling through
    // silently is what made this bug invisible the first time.
    rules += `   - ${RULES[key] ?? `${String(pref).toUpperCase()}: Strictly exclude any dish that violates a "${pref}" diet`}\n`;
  });
  return rules;
}

export function createMenuSearchPrompt(restaurant: any, surveyData: MenuPromptSurvey): string {
  const dietaryRestrictions = (surveyData.dietPrefs || []).join(', ');
  const preferredCuisines = (surveyData.preferredCuisines || []).join(', ');

  // Add null checks and fallbacks for all restaurant properties
  const restaurantName = restaurant?.name || 'Unknown Restaurant';
  const restaurantAddress = restaurant?.address || surveyData?.streetAddress || 'Address not available';
  const restaurantCity = restaurant?.city || surveyData?.city || 'Unknown City';
  const restaurantCuisine = restaurant?.cuisine || 'Mixed';

  // Distance is decided on coordinates before this prompt runs. Asking the model
  // to re-verify it invited a refusal, which under a min(1) schema is a parse
  // failure rather than a graceful skip.

  return `Find the current menu with prices AND online ordering links for "${restaurantName}" restaurant located at ${restaurantAddress}, ${restaurantCity}.

RESTAURANT DETAILS:
- Name: ${restaurantName}
- Address: ${restaurantAddress}
- City: ${restaurantCity}
- Cuisine Type: ${restaurantCuisine}

CRITICAL - ORDERING LINKS SEARCH:
Only two of these are ever shown to the user, so spend your search effort there.

1. GrubHub — THE PRIORITY. Search grubhub.com for "${restaurantName}" in
   ${restaurantCity}. Do this search FIRST and do not skip it. Look for the
   restaurant's own ordering page, whose URL looks like
   https://www.grubhub.com/restaurant/<restaurant-slug>/<numeric-id>
   A city or cuisine listing page (a /delivery/ URL) is NOT the restaurant's
   page — do not return one as the GrubHub link.
2. Restaurant's own website for direct ordering.

Then, only if you happen to see them, doordash and ubereats. Do NOT run separate
searches for those two: they are suppressed before display, so a search spent on
them is a search not spent on GrubHub.

For each platform, provide the ACTUAL URL if the restaurant is listed there.
Set a platform to null if you did not find the restaurant on it. Every platform
key must be present.
NEVER make up or guess URLs - only include links you actually find. A guessed
GrubHub URL is worse than a null one: we cannot detect one by fetching it,
because grubhub.com answers 200 with an identical page for every /restaurant/
path, including ones that do not exist.

MENU SEARCH REQUIREMENTS:
1. Find 8-12 specific menu items with current prices
2. Include dish names, prices, and brief descriptions
3. Focus on healthier options when possible
4. Look for recent/current menu information (2024-2025)

REPORT WHAT THE MENU SAYS, DO NOT ESTIMATE:
- price: the listed price, or null if the menu does not publish one.
- statedCalories: only a calorie count the menu itself publishes. Null otherwise.
  Do not estimate. A later step estimates, and labels its estimates as estimates.
- sourceUrl: the page you read the item from, or null.

USER PREFERENCES (prioritize when selecting items):
- Dietary Restrictions: ${dietaryRestrictions || 'None'}
- Preferred Cuisines: ${preferredCuisines || 'Any'}
- Goal: ${surveyData.goal || 'General wellness'}
${buildAllergyBlock(surveyData)}
Please provide comprehensive menu information with VERIFIED ordering links only.`;
}

export function createMenuStructuringPrompt(args: {
  content: string;
  citations: any[];
  restaurant: any;
  surveyData: MenuPromptSurvey;
}): string {
  const { content, citations, restaurant, surveyData } = args;
  const restaurantName = restaurant?.name || 'Unknown Restaurant';
  const restaurantCity = restaurant?.city || surveyData?.city || 'Unknown City';

  return `Convert this restaurant menu information into structured JSON format.

CRITICAL RULES FOR ORDERING LINKS:
1. ONLY include ordering links that are ACTUALLY mentioned in the source data
2. Links must be real URLs to the restaurant's page on that platform
3. If a platform link is not found in the data, leave it as an empty string ""
4. NEVER make up, guess, or construct URLs
5. Verify the link appears to be for the correct restaurant "${restaurantName}" in ${restaurantCity}

PERPLEXITY MENU DATA:
${content}

CITATIONS/SOURCES:
${citations.map((c, i) => `${i + 1}. ${typeof c === 'string' ? c : c.url || JSON.stringify(c)}`).join('\n')}

RESTAURANT: ${restaurantName}
CITY: ${restaurantCity}

USER PREFERENCES:
- Goal: ${surveyData.goal || 'General wellness'}
- Diet Restrictions: ${(surveyData.dietPrefs || []).join(', ') || 'None'}
- Preferred Cuisines: ${(surveyData.preferredCuisines || []).join(', ') || 'Any'}

EXTRACTION RULES FOR MENU ITEMS:
1. Extract ONLY menu items that have clear prices mentioned
2. Focus on healthier options when multiple choices available
3. Categorize by meal type (breakfast, lunch, dinner, snack)
4. Estimate calories based on typical dish composition
5. Rate healthiness (excellent/good/fair/poor) based on ingredients

6. Apply dietary restrictions when extracting menu items:
${buildDietaryRulesBlock(surveyData)}
7. Apply allergy exclusions before anything else:
${buildAllergyBlock(surveyData) || '   - No allergies reported'}

REQUIRED JSON FORMAT:
{
  "menuItems": [
    {
      "name": "Exact dish name from menu",
      "price": 12.99,
      "description": "Brief description from menu",
      "category": "lunch",
      "estimatedCalories": 520,
      "estimatedProtein": 38,
      "estimatedCarbs": 44,
      "estimatedFat": 19,
      "healthRating": "good"
    }
  ],
  "orderingLinks": {
    "doordash": "https://www.doordash.com/store/...",
    "ubereats": null,
    "grubhub": null,
    "direct": "https://restaurant-own-website.com"
  }
}

IMPORTANT: orderingLinks must carry all four keys. A value is either a complete
URL beginning with https:// or the JSON literal null — as shown above, where
ubereats and grubhub were not found. Never write the word "null" as a string,
never use an empty string, and never invent or guess a URL: a link that does not
resolve is worse than no link at all.

estimatedCalories, estimatedProtein, estimatedCarbs and estimatedFat are per
portion as served, for the whole dish. Estimate them from the ingredients and portion size in the description —
a grilled chicken plate is not the same as a chicken wrap. These two numbers are
what the meal selection step chooses against, so a dish whose protein you set to
a filler value will be picked for the wrong reason. Give your honest estimate,
including a low one: 6g for a side salad is a useful answer.
Carbs and fat are estimated the same way as the other two, from the ingredients
and portion size — a katsu curry is mostly rice and fried batter, a sashimi
plate is neither. These four numbers are what the meal-selection step sums.
Extract 6-12 menu items maximum. Return ONLY valid JSON.`;
}
