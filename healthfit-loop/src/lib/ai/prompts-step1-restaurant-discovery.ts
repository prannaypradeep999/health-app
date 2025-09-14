// Step 1: Restaurant Discovery with Google Places + Spoonacular Chain Verification
import { UserContext } from './prompts';
import { HEALTHIER_CHAINS, MODERATE_CHAINS, ALL_VERIFIED_CHAINS, PROMPT_CONFIG } from '../config/meal-planning';

export function buildRestaurantDiscoveryPrompt(userContext: UserContext): string {
  const { surveyData } = userContext;
  const distancePreference = (surveyData as any).distancePreference || 'medium';
  const radiusKm = PROMPT_CONFIG.DISTANCE_MAP[distancePreference as keyof typeof PROMPT_CONFIG.DISTANCE_MAP] || PROMPT_CONFIG.DEFAULT_RADIUS;

  return `You are FYTR AI's restaurant discovery specialist. Your job is to find 4-5 restaurants near the user that exist in our verified Spoonacular database for detailed nutrition data.

USER PROFILE:
- Location: ${surveyData.zipCode} (search within ${radiusKm}km)
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Preferred Cuisines: ${surveyData.preferredCuisines?.join(', ') || 'Open to all'}
- Diet Restrictions: ${surveyData.dietPrefs.join(', ') || 'No restrictions'}
- Budget Tier: ${surveyData.budgetTier}

VERIFIED SPOONACULAR CHAINS (These have confirmed menu + nutrition data):

HEALTHIER TIER (${HEALTHIER_CHAINS.length} chains):
${HEALTHIER_CHAINS.map(chain => `- ${chain}`).join('\n')}

MODERATE TIER (${MODERATE_CHAINS.length} chains):
${MODERATE_CHAINS.map(chain => `- ${chain}`).join('\n')}

TOTAL VERIFIED CHAINS: ${ALL_VERIFIED_CHAINS.length}

DISCOVERY WORKFLOW:

PHASE 1: FIND VERIFIED CHAINS NEARBY
1. Call find_verified_healthy_chains(zipcode="${surveyData.zipCode}", radiusKm=${radiusKm}, preferHealthier=true)
2. This will return actual Google Places restaurants that match our verified chains above
3. Prioritize chains that match user's preferred cuisines: ${surveyData.preferredCuisines?.join(', ') || 'any cuisine'}

PHASE 2: LOCAL RESTAURANT DISCOVERY (for variety)
4. If needed for variety, call find_general_restaurants_fallback(zipcode="${surveyData.zipCode}", cuisineType="${surveyData.preferredCuisines?.[0] || 'healthy'}", radiusKm=${radiusKm})
5. This finds local restaurants that might offer healthy options even without verified nutrition data

SELECTION CRITERIA:
- Target ${PROMPT_CONFIG.TARGET_TOTAL_RESTAURANTS} restaurants total
- IF 3+ verified Spoonacular chains found: Use 3-${PROMPT_CONFIG.MAX_VERIFIED_CHAINS} verified chains + 2-3 local restaurants
- IF <3 verified Spoonacular chains found: Use ALL available verified chains + up to ${PROMPT_CONFIG.MAX_LOCAL_RESTAURANTS} local restaurants
- Match user's cuisine preferences: ${surveyData.preferredCuisines?.join(', ') || 'balanced variety'}
- Consider user's goal: ${surveyData.goal} (prioritize chains known for relevant options)
- ALWAYS include local restaurants for variety and coverage

RESPONSE FORMAT:
{{
  "selectedRestaurants": {{
    "verifiedChains": [
      {{
        "name": "Sweetgreen",
        "hasSpoonacularData": true,
        "cuisineMatch": "healthy/mediterranean",
        "reasoning": "Excellent for ${surveyData.goal} goal - known for nutrient-dense salads and bowls with lean proteins",
        "estimatedPriceRange": "$$",
        "location": "123 Main St, within 2 miles"
      }}
    ],
    "localRestaurants": [
      {{
        "name": "Local Mediterranean Grill",
        "hasSpoonacularData": false,
        "cuisineMatch": "${surveyData.preferredCuisines?.[0] || 'mediterranean'}",
        "reasoning": "${surveyData.preferredCuisines?.[0] || 'Mediterranean'} cuisine aligns with ${surveyData.goal} goals - typically features grilled proteins, vegetables, and healthy fats",
        "estimatedPriceRange": "${surveyData.budgetTier === 'low' ? '$' : surveyData.budgetTier === 'high' ? '$$$' : '$$'}",
        "location": "456 Oak Ave, within ${radiusKm < 10 ? '1' : '2'} miles"
      }}
    ]
  }},
  "summary": {{
    "totalRestaurants": 6,
    "verifiedChains": 2,
    "localOptions": 4,
    "areaHasLimitedChains": true,
    "nextStep": "Fetch menu data for verified chains + create general descriptions for local restaurants"
  }}
}}

CRITICAL REQUIREMENTS:
- Only select restaurants that actually exist near the user (from Google Places results)
- Prioritize verified Spoonacular chains for nutrition accuracy
- Provide clear reasoning for each selection based on user's goals and preferences
- Include realistic price estimates and location information
- Mark which restaurants have verified nutrition data vs general recommendations

EXECUTION: Start with verified chain discovery, then add local variety if needed to reach 4-5 total restaurants.`;
}

export const RESTAURANT_DISCOVERY_FUNCTIONS = [
  {
    name: "find_verified_healthy_chains",
    description: "Find verified healthy restaurant chains near user with confirmed Spoonacular menu data",
    parameters: {
      type: "object",
      properties: {
        zipcode: {
          type: "string",
          description: "User's ZIP code for location search"
        },
        radiusKm: {
          type: "number",
          description: "Search radius in kilometers (5, 10, or 20 based on user preference)"
        },
        preferHealthier: {
          type: "boolean",
          description: "Whether to prioritize healthier chains over moderate ones",
          default: true
        }
      },
      required: ["zipcode"]
    }
  },
  {
    name: "find_general_restaurants_fallback",
    description: "Find general restaurants near user for variety when verified chains are limited",
    parameters: {
      type: "object",
      properties: {
        zipcode: {
          type: "string",
          description: "User's ZIP code for location search"
        },
        cuisineType: {
          type: "string", 
          description: "Preferred cuisine type from user's survey data"
        },
        radiusKm: {
          type: "number",
          description: "Search radius based on user's distance preference"
        }
      },
      required: ["zipcode"]
    }
  }
];
