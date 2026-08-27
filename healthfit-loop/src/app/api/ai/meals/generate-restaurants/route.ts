import { NextRequest, NextResponse, after } from 'next/server';
// No reservingBudget / MEAL_SELECTION_RESERVE_MS: selection no longer shares
// this invocation with extraction, so there is nothing to reserve it from.
// handoff.test.ts fails if they come back.
import { withRouteBudget } from '@/lib/utils/route-budget';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { googlePlacesClient, Restaurant } from '@/lib/external/places-client';
import { perplexityClient } from '@/lib/external/perplexity-client';
import { verifyLinks, verifyLinksDetailed, isUsableLink, suppressUndisplayablePlatforms } from '@/lib/external/link-check';
import { radiusMilesFor, milesBetween } from '@/lib/utils/distance';
import { buildRestaurantFacts, uniqueSelectedCuisines } from '@/lib/utils/restaurant-facts';
import { runVerification, verifyRestaurantPayload } from '@/lib/verification';
import { getAuthUserId } from '@/lib/auth';
import {
  createRestaurantMealGenerationPrompt,
  createRestaurantSelectionPrompt
} from '@/lib/ai/prompts';
import { calculateMacroTargets, UserProfile } from '@/lib/utils/nutrition';
import { buildNutritionTargets } from '@/lib/utils/nutrition-targets';
import { withGPTRetry, HttpError } from '@/lib/utils/retry';
import { mapWithLimit } from '@/lib/utils/concurrency';
import { getStartOfWeek } from '@/lib/utils/date-utils';
import { validateRestrictions } from '@/lib/utils/restriction-validator';
import { MODELS, tuning } from '@/lib/ai/models';
import {
  RestaurantSelectionSchema,
  pinnedRestaurantMealChoices,
  toStrictJsonSchema,
} from '@/lib/ai/schemas';
import { joinRestaurantMealSlots } from '@/lib/utils/restaurant-join';
import { parseChoice } from '@/lib/ai/validate';
import { logUsage } from '@/lib/ai/usage';
import { trace } from '@/lib/utils/run-trace';
import { internalFetch } from '@/lib/utils/internal-fetch';

export const runtime = 'nodejs';
// 60s is the Hobby ceiling and is valid on every Vercel plan. Without this
// line the route silently inherits the platform default of 10-15s, well
// under what a model call needs. RetryPresets budgets the inner calls to fit.
export const maxDuration = 60;

/**
 * Restaurant Meal Generation API Route
 * 
 * FIXES APPLIED:
 * - Fixed all console.log syntax errors
 * - GPT calls use response_format json_schema + strict:true (was json_object,
 *   which guaranteed valid JSON syntax and nothing at all about its shape)
 * - Added mapping logic to preserve full restaurant data after GPT selection
 * - Added filtering to remove restaurants without ordering links
 * - Improved validation and error handling
 */

// Convert new nutrition targets to legacy format for backward compatibility
function convertToLegacyTargets(weeklyTargets: any, day?: string): any {
  if (!weeklyTargets) {
    // Provide defaults for missing data
    return {
      dailyCalories: 2000,
      dailyProtein: 120,
      dailyCarbs: 250,
      dailyFat: 67,
      mealTargets: {
        breakfast: { calories: 500, protein: 25, carbs: 60, fat: 17 },
        lunch: { calories: 650, protein: 35, carbs: 85, fat: 22 },
        dinner: { calories: 750, protein: 45, carbs: 90, fat: 25 },
        snack: { calories: 100, protein: 15, carbs: 15, fat: 3 }
      }
    };
  }

  // If specific day requested, get that day's targets
  if (day && weeklyTargets.days[day.toLowerCase()]) {
    const dayTargets = weeklyTargets.days[day.toLowerCase()];
    return {
      dailyCalories: weeklyTargets.dailyCalories,
      dailyProtein: weeklyTargets.macros.protein,
      dailyCarbs: weeklyTargets.macros.carbs,
      dailyFat: weeklyTargets.macros.fat,
      mealTargets: {
        breakfast: dayTargets.breakfast || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        lunch: dayTargets.lunch || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        dinner: dayTargets.dinner || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        snack: { calories: 0, protein: 0, carbs: 0, fat: 0 } // No snack support in new system yet
      }
    };
  }

  // Default: return general targets with average meal distribution
  const avgDay = Object.values(weeklyTargets.days)[0] as any;
  return {
    dailyCalories: weeklyTargets.dailyCalories,
    dailyProtein: weeklyTargets.macros.protein,
    dailyCarbs: weeklyTargets.macros.carbs,
    dailyFat: weeklyTargets.macros.fat,
    mealTargets: {
      breakfast: avgDay?.breakfast || { calories: Math.round(weeklyTargets.dailyCalories * 0.25), protein: Math.round(weeklyTargets.macros.protein * 0.25), carbs: Math.round(weeklyTargets.macros.carbs * 0.25), fat: Math.round(weeklyTargets.macros.fat * 0.25) },
      lunch: avgDay?.lunch || { calories: Math.round(weeklyTargets.dailyCalories * 0.35), protein: Math.round(weeklyTargets.macros.protein * 0.35), carbs: Math.round(weeklyTargets.macros.carbs * 0.35), fat: Math.round(weeklyTargets.macros.fat * 0.35) },
      dinner: avgDay?.dinner || { calories: Math.round(weeklyTargets.dailyCalories * 0.40), protein: Math.round(weeklyTargets.macros.protein * 0.40), carbs: Math.round(weeklyTargets.macros.carbs * 0.40), fat: Math.round(weeklyTargets.macros.fat * 0.40) },
      snack: { calories: 0, protein: 0, carbs: 0, fat: 0 }
    }
  };
}

// Helper function to extract restaurant meals from weekly schedule
function extractRestaurantMealsFromSchedule(weeklyMealSchedule: any): Array<{day: string, mealType: string}> {
  const restaurantMeals: Array<{day: string, mealType: string}> = [];
  
  if (!weeklyMealSchedule || typeof weeklyMealSchedule !== 'object') {
    return restaurantMeals;
  }
  
  Object.entries(weeklyMealSchedule).forEach(([day, meals]: [string, any]) => {
    if (meals?.breakfast === 'restaurant') restaurantMeals.push({ day, mealType: 'breakfast' });
    if (meals?.lunch === 'restaurant') restaurantMeals.push({ day, mealType: 'lunch' });
    if (meals?.dinner === 'restaurant') restaurantMeals.push({ day, mealType: 'dinner' });
  });
  
  return restaurantMeals;
}

// Find and select best restaurants
async function findAndSelectBestRestaurants(surveyData: any): Promise<Restaurant[]> {
  const startTime = Date.now();
  console.log('[RESTAURANT-SEARCH] 🔍 Starting restaurant discovery...');
  
  try {
    const location = `${surveyData.streetAddress || ''} ${surveyData.city || ''}, ${surveyData.state || ''} ${surveyData.zipCode || ''}`.trim();
    const cuisines = surveyData.preferredCuisines || [];
    const dietaryRestrictions = surveyData.dietPrefs || [];
    
    console.log(`[RESTAURANT-SEARCH] 📍 Location: ${location}`);
    console.log(`[RESTAURANT-SEARCH] 🍽️ Cuisines: ${cuisines.join(', ')}`);
    
    // Convert distance preference to miles (strict enforcement)
    const radiusMiles = radiusMilesFor(surveyData.distancePreference);

    console.log(`[RESTAURANT-SEARCH] 📏 Distance preference: ${surveyData.distancePreference} → ${radiusMiles} miles radius (STRICT)`);

    // Search for each cuisine (limit to 6 for performance).
    //
    // These were awaited one at a time despite being fully independent — six
    // Places round trips in series, 2.4-4.8s of the user's wait for work that
    // takes as long as its slowest single call. Order is preserved by mapping
    // rather than pushing: the dedup below is a last-wins Map and the survivors
    // feed the selection prompt, so a racing append order would quietly change
    // which restaurants the model sees.
    const searchList: string[] = cuisines.slice(0, 6);
    const perCuisine = await Promise.all(
      searchList.map(async (cuisine: string) => {
        try {
          const restaurants = await googlePlacesClient.searchRestaurantsByCuisine(
            location,
            cuisine,
            dietaryRestrictions,
            12,
            radiusMiles
          );
          console.log(`[RESTAURANT-SEARCH] Found ${restaurants.length} ${cuisine} restaurants`);
          return restaurants;
        } catch (error) {
          // One dead cuisine must not sink the other five, same as before.
          console.error(`[RESTAURANT-SEARCH] Error searching ${cuisine}:`, error);
          return [] as Restaurant[];
        }
      })
    );
    const allRestaurants: Restaurant[] = perCuisine.flat();

    // Remove duplicates by placeId
    const uniqueRestaurants = Array.from(
      new Map(allRestaurants.map(r => [r.placeId, r])).values()
    );
    
    console.log(`[RESTAURANT-SEARCH] 📊 Found ${uniqueRestaurants.length} unique restaurants total`);

    // A search radius biases results; it does not bound them. Places returns by
    // prominence within the radius, and the fallback search uses its own. This
    // is the only place a restaurant's actual distance is ever checked.
    const origin = await googlePlacesClient.geocodeAddress(location);
    const withDistance = uniqueRestaurants.map(r => ({
      ...r,
      distanceMiles:
        origin && typeof r.lat === 'number' && typeof r.lng === 'number'
          ? milesBetween(origin, { lat: r.lat, lng: r.lng })
          : undefined,
    }));

    const inRange = withDistance.filter(
      // Unknown distance is kept: a missing coordinate is our gap, not the
      // restaurant's fault, and dropping it would silently shrink the pool.
      r => r.distanceMiles === undefined || r.distanceMiles <= radiusMiles
    );

    const droppedFar = withDistance.length - inRange.length;
    if (droppedFar > 0) {
      console.log(`[RESTAURANT-SEARCH] 📏 Dropped ${droppedFar} restaurant(s) beyond ${radiusMiles} miles`);
    }

    // If we have 8 or fewer restaurants, just return them all
    if (inRange.length <= 8) {
      console.log(`[RESTAURANT-SEARCH] ✅ Returning all ${inRange.length} restaurants (no AI selection needed)`);
      return inRange;
    }

    // Use AI to select the best 8-10 restaurants (more to account for filtering)
    const selectionPrompt = createRestaurantSelectionPrompt(inRange, surveyData);

    // Calculate estimated tokens (rough estimate: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(selectionPrompt.length / 4);
    console.log(`[RESTAURANT-SEARCH] 📤 Sending GPT restaurant selection request:`);
    console.log(`[RESTAURANT-SEARCH]   - Prompt length: ${selectionPrompt.length} chars`);
    console.log(`[RESTAURANT-SEARCH]   - Estimated tokens: ${estimatedTokens}`);
    console.log(`[RESTAURANT-SEARCH]   - Restaurants to choose from: ${inRange.length}`);
    console.log(`[RESTAURANT-SEARCH]   - Model: ${MODELS.PLANNING}`);

    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.PLANNING,
          messages: [{ role: 'user', content: selectionPrompt }],
          response_format: toStrictJsonSchema('restaurant_selection', RestaurantSelectionSchema),
          // Selection returns <=8 rows of 6 short fields (~120 tok/row). 4000 is
          // ~4x the observed need. Previously unset, which meant the model's own
          // default ceiling applied and truncation was invisible.
          ...tuning(MODELS.PLANNING, { maxTokens: 4000, temperature: 0.3 })
        }),
        signal: signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new HttpError(response.status, `GPT API error: ${response.status} - ${errorText}`);
      }
      return response.json();
    }, 'Restaurant selection');

    if (!gptResult.success) {
      console.warn('[RESTAURANT-SEARCH] ⚠️ Using fallback after retry failures');
      return inRange.slice(0, 8);
    }
    const data = gptResult.data;

    logUsage('restaurant-selection', 4000, data);

    // Refusal / truncation / invalid-JSON / schema-mismatch all collapse into one
    // check. The grammar guarantees shape when it succeeds, so the per-field
    // structural guards that used to live here are gone.
    const parsed = parseChoice(RestaurantSelectionSchema, data.choices?.[0], 'restaurant-selection');
    if (!parsed.ok) {
      console.warn(`[RESTAURANT-SEARCH] ⚠️ ${parsed.reason}: ${parsed.detail} — using first 8 restaurants`);
      return inRange.slice(0, 8);
    }

    // Map selected restaurants back to original data to preserve all fields
    let selectedRestaurants: Restaurant[] = [];

    console.log(`[RESTAURANT-SEARCH] 🤖 GPT selected ${parsed.data.selectedRestaurants.length} restaurants`);

    // Create a lookup map for original restaurants
    const restaurantLookup = new Map<string, Restaurant>();
    inRange.forEach(r => {
      if (r.placeId) restaurantLookup.set(r.placeId, r);
      if (r.name) restaurantLookup.set(r.name.toLowerCase(), r);
    });

    // Map GPT selections back to full restaurant objects
    for (const selected of parsed.data.selectedRestaurants) {
      let fullRestaurant: Restaurant | undefined;

      // Try to match by placeId first
      if (selected.placeId) {
        fullRestaurant = restaurantLookup.get(selected.placeId);
      }

      // Try to match by name if placeId didn't work
      if (!fullRestaurant && selected.name) {
        fullRestaurant = restaurantLookup.get(selected.name.toLowerCase());
      }

      if (fullRestaurant) {
        console.log(`[RESTAURANT-SEARCH] Rating for ${fullRestaurant.name}: ${fullRestaurant.rating}`);
        selectedRestaurants.push({
          ...fullRestaurant,
          rating: fullRestaurant.rating, // Explicitly preserve rating from original Google Places data
          selectionReason: selected.reason,
        } as Restaurant & { selectionReason?: string });
      } else {
        // A selection we cannot match is a name the model produced, not a place
        // Google returned. Passing it through shipped invented restaurants —
        // with invented addresses — straight to the user.
        console.warn(`[RESTAURANT-SEARCH] ⚠️ Dropping unmatched selection (not in the Places result set): ${selected.name}`);
      }
    }

    // If mapping resulted in empty array, fall back to original restaurants
    if (selectedRestaurants.length === 0) {
      console.warn('[RESTAURANT-SEARCH] ⚠️ GPT selection mapping failed, using original restaurants');
      selectedRestaurants = inRange.slice(0, 8);
    }

    const totalSearchTime = Date.now() - startTime;
    console.log(`[RESTAURANT-SEARCH] ✅ Selected ${selectedRestaurants.length} restaurants in ${totalSearchTime}ms`);
    
    // Log selected restaurants for debugging
    selectedRestaurants.forEach((r, i) => {
      console.log(`[RESTAURANT-SEARCH]   ${i + 1}. ${r.name || 'UNDEFINED'} - Rating: ${r.rating || 'N/A'} - ${r.cuisine || 'NO CUISINE'}`);
    });
    
    return selectedRestaurants;
    
  } catch (error) {
    console.error('[RESTAURANT-SEARCH] ❌ Restaurant search failed:', error);
    return [];
  }
}

// Extract menu information using Perplexity API
async function extractMenuInformation(restaurants: Restaurant[], surveyData: any): Promise<any[]> {
  console.log(`[MENU-EXTRACTION] 🔍 Extracting menus for ${restaurants.length} restaurants using Perplexity...`);
  
  if (!process.env.PERPLEXITY_API_KEY) {
    console.error('[MENU-EXTRACTION] Missing PERPLEXITY_API_KEY');
    return restaurants.map(r => ({ ...r, menuData: [], orderingLinks: {}, linksFound: 0, lookupFailed: true, error: 'Missing Perplexity API key' }));
  }
  
  // Capped rather than a bare Promise.all. The 2026-08-18 run fanned out eight
  // menu lookups at once, Perplexity 429'd, and the retry loop re-fired the
  // failures into the same eight-wide burst — six restaurants exhausted all
  // three attempts and lost their menus entirely. Retrying a rate limit while
  // still saturating it cannot converge; the concurrency is the thing to fix.
  //
  // The cap and the concurrency are deliberately the SAME number, because the
  // phase has room for exactly one wave and no more.
  //
  // Measured on the 2026-08-19 run: a Perplexity menu lookup takes 10-25s, and
  // this phase gets roughly 22s of the route's 53s once Places (~3s), restaurant
  // selection (~9s) and meal selection (~18s) have taken theirs. Anything that
  // does not start in the first few seconds cannot finish. That run attempted
  // all 10 restaurants four-wide and kept 2 — the second wave opened with
  // "route budget leaves -1422ms" and every restaurant in it was dropped for
  // having no menu, which is why the user saw a week of meals from 2 places.
  //
  // A restaurant whose lookup fails is REMOVED from the pool, so a failed
  // lookup is not a missing menu, it is a missing restaurant. Six that resolve
  // beat ten that mostly do not. findAndSelectBestRestaurants has already
  // ordered by fit, so the four dropped here are the weakest.
  //
  // Six-wide keeps the module-level 1200ms spacing that the rate limit actually
  // measures (start rate, not concurrency), so the last request still opens
  // ~6s in and has ~16s to answer.
  const MAX_MENU_LOOKUPS = 6;
  const toEnrich = restaurants.slice(0, MAX_MENU_LOOKUPS);
  if (restaurants.length > toEnrich.length) {
    console.log(`[MENU-EXTRACTION] Limiting to the top ${toEnrich.length} of ${restaurants.length} restaurants — one wave is all the phase budget allows`);
  }

  const results = await mapWithLimit(toEnrich, MAX_MENU_LOOKUPS, async (restaurant) => {
    try {
      // Validate before calling Perplexity
      if (!restaurant.name || restaurant.name === 'undefined') {
        console.warn(`[MENU-EXTRACTION] ⚠️ Skipping restaurant with undefined name`);
        return { ...restaurant, menuData: [], orderingLinks: {}, linksFound: 0, lookupFailed: false, error: 'Restaurant name is undefined' };
      }
      
      console.log(`[MENU-EXTRACTION] Processing ${restaurant.name} with Perplexity...`);
      
      // Ensure restaurant has required fields for Perplexity
      const restaurantWithDefaults = {
        ...restaurant,
        name: restaurant.name || 'Unknown Restaurant',
        address: restaurant.address || surveyData.streetAddress || 'Address not available',
        city: (restaurant as any).city || surveyData.city || 'Unknown City',
        cuisine: restaurant.cuisine || 'Mixed'
      };
      
      const menuResponse = await perplexityClient.getRestaurantMenu(restaurantWithDefaults, surveyData);

      // Count valid ordering links. `!== ''` used to be the test, which counted
      // the literal string "null" as a link — the same value that reaches the UI
      // as an order button leading nowhere. Same URL test as
      // normalizeOrderingLinks so the count and the rendered buttons agree;
      // verifyLinks then removes the ones that do not answer.
      const orderingLinks = menuResponse.orderingLinks || {};
      const menuItems = menuResponse.menuItems || [];

      // B4. Places already told us this restaurant's website; asking the model
      // to guess `direct` and then believing the guess is strictly worse than
      // using the answer we were handed. Places wins when it has one — it is
      // the only source here that looked the business up rather than recalled
      // it. The model's value survives only as the fallback.
      const placesWebsite = (restaurant as { website?: string }).website;
      const directFromPlaces = isUsableLink(placesWebsite);
      // Suppressed before probing, not after: a platform we will not display is
      // not worth an HTTP request from inside the tightest phase of the route
      // budget. This removes two probes per restaurant.
      const candidateLinks = suppressUndisplayablePlatforms({
        ...orderingLinks,
        direct: directFromPlaces ? placesWebsite : orderingLinks.direct ?? null,
      });

      // B1. Nothing had ever requested one of these URLs. A 404 doordash link
      // renders as an order button that leads nowhere, which is worse than no
      // button — the user drives somewhere on the strength of it. 6s rather
      // than the 8s default: this phase owns ~22s of the route budget and a
      // link check must not be what spends it.
      //
      // `direct` is probed leniently *only* when Google Places supplied it. A
      // 403 from a small restaurant's bot wall is not evidence that the
      // restaurant's website is wrong — Places looked the business up. In the
      // observed run this exact case deleted La Oaxaqueña's only link, after
      // which the plan still sent the user there three times with no way to
      // order. A model-guessed `direct` gets no such benefit of the doubt.
      const { links: resolvedLinks, outcomes } = await verifyLinksDetailed(candidateLinks, {
        timeoutMs: 6000,
        lenientPlatforms: directFromPlaces ? ['direct'] : [],
      });
      const rejected = Object.entries(outcomes).filter(([, o]) => !o.kept);
      if (rejected.length > 0) {
        // The reason is logged because the old line said only "unreachable",
        // which conflated a 404 with a bot wall and made the two impossible to
        // tell apart from production logs.
        console.log(
          `[MENU-EXTRACTION] ${restaurant.name}: dropped links: ` +
          rejected.map(([platform, o]) => `${platform} (${o.reason})`).join(', ')
        );
      }

      const linksFound = Object.values(resolvedLinks).filter(isUsableLink).length;

      console.log(`[MENU-EXTRACTION] ${restaurant.name}: ${menuItems.length} menu items, ${linksFound} ordering links`);

      // Log each found link
      Object.entries(resolvedLinks).forEach(([platform, url]) => {
        if (isUsableLink(url)) {
          console.log(`[MENU-EXTRACTION]   ✅ ${platform}: ${url.substring(0, 60)}...`);
        }
      });

      return {
        ...restaurant,
        menuData: menuItems,
        menuUrl: resolvedLinks.doordash || resolvedLinks.ubereats || resolvedLinks.grubhub || resolvedLinks.direct,
        orderingLinks: resolvedLinks,
        menuSource: 'Perplexity',
        sources: menuResponse.sources,
        extractionSuccess: menuResponse.extractionSuccess,
        linksFound: linksFound,
        lookupFailed: false
      };
    } catch (error) {
      console.error(`[MENU-EXTRACTION] Error processing ${restaurant.name}:`, error);
      // `lookupFailed` separates "we could not find out" from "there is nothing
      // here" — see the filter below, which used to treat them identically.
      return { ...restaurant, menuData: [], orderingLinks: {}, linksFound: 0, lookupFailed: true, error: (error as Error).message };
    }
  });

  // A restaurant is usable if we know at least one dish it serves. Ordering
  // links are a bonus on top of that, not the entry requirement.
  //
  // This filter used to keep `linksFound > 0` and drop everything else, which
  // was wrong in both directions and produced exactly what the 2026-08-18 run
  // showed. Six restaurants whose Perplexity lookup was killed by a 429 storm
  // reported zero links — not because they have no delivery, but because we
  // never got an answer — and were discarded as though we had checked. Nine
  // restaurants became two. Meanwhile SF Grill came back with two links and
  // *no menu items*, passed the filter, and had nothing to serve, so the plan
  // rendered the dish "No menu item available".
  //
  // A restaurant with a menu but no link is still a real recommendation: the
  // user can walk in or call, and the schema already allows all four link
  // values to be null. A restaurant with no menu cannot fill a slot at all.
  const withMenu = results.filter(r => (r.menuData?.length ?? 0) > 0);
  const noMenu = results.filter(r => (r.menuData?.length ?? 0) === 0);

  // Orderable restaurants go first.
  //
  // Selection ranks on nutrition and cuisine and is told nothing about links —
  // deliberately, since a link-less restaurant is still a real recommendation.
  // But the model reads this list in order, and in the observed run that let it
  // pick La Oaxaqueña (0 links) three times while never once choosing
  // Falafelland, which had both a GrubHub link and a working website. Ordering
  // the candidates costs nothing, adds no prompt tokens, and removes no option:
  // a restaurant with no link is still in the list, just further down.
  //
  // Sort is stable, so the upstream ranking survives within each group.
  const usable = [...withMenu].sort((a, b) => (b.linksFound ?? 0) - (a.linksFound ?? 0));
  const failed = noMenu.filter(r => r.lookupFailed);
  const genuinelyEmpty = noMenu.filter(r => !r.lookupFailed);

  console.log(`[MENU-EXTRACTION] ✅ Menu extraction completed:`);
  console.log(`[MENU-EXTRACTION]   - ${usable.length} restaurants with a menu (keeping, ${usable.filter(r => r.linksFound > 0).length} of them with ordering links)`);
  if (genuinelyEmpty.length > 0) {
    console.log(`[MENU-EXTRACTION]   - ${genuinelyEmpty.length} with no menu found (removing): ${genuinelyEmpty.map(r => r.name).join(', ')}`);
  }
  if (failed.length > 0) {
    // Distinct from the line above on purpose: this one is our problem, not the
    // restaurant's, and a spike here means the upstream call is being throttled.
    console.warn(`[MENU-EXTRACTION]   ⚠️ ${failed.length} lookups failed outright (removing): ${failed.map(r => r.name).join(', ')}`);
  }

  return usable;
}

// Select specific restaurant meals for the schedule
async function selectRestaurantMealsForSchedule(
  restaurantMenuData: any[],
  restaurantMealsSchedule: Array<{day: string, mealType: string}>,
  surveyData: any,
  nutritionTargets: any
): Promise<any[]> {
  console.log(`[RESTAURANT-SELECTION] 🍽️ Selecting ${restaurantMealsSchedule.length} restaurant meals from ${restaurantMenuData.length} restaurants with links...`);
  // One entry per scheduled eating-out slot, and the prompt names them all.
  //
  // The *choices* variant: address, cuisine, ordering links and `source` are
  // joined on below from restaurantMenuData rather than emitted by the model.
  // That was 47.7% of the output on plan cmt9jxhs30003l504dl202k46, and this
  // call is the one that ran out of route budget at 26691ms on 2026-08-26 and
  // saved nothing.
  const MealsSchema = pinnedRestaurantMealChoices(restaurantMealsSchedule.length);
  
  // If no restaurants with ordering links, return empty
  if (restaurantMenuData.length === 0) {
    console.warn('[RESTAURANT-SELECTION] ⚠️ No restaurants with ordering links available');
    return [];
  }
  
  try {
    const prompt = createRestaurantMealGenerationPrompt({
      restaurantMealsSchedule,
      restaurantMenuData,
      surveyData,
      nutritionTargets
    });
    
    // Calculate estimated tokens (rough estimate: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(prompt.length / 4);
    console.log(`[RESTAURANT-SELECTION] 📤 Sending GPT request:`);
    console.log(`[RESTAURANT-SELECTION]   - Prompt length: ${prompt.length} chars`);
    console.log(`[RESTAURANT-SELECTION]   - Estimated tokens: ${estimatedTokens}`);
    console.log(`[RESTAURANT-SELECTION]   - Model: ${MODELS.DETAIL}`);

    const gptResult = await withGPTRetry(async (signal) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GPT_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS.DETAIL,
          messages: [{ role: 'user', content: prompt }],
          response_format: toStrictJsonSchema('restaurant_meals', MealsSchema),
          // Each row carries two full meal objects (13 fields each, incl. four
          // ordering URLs) at roughly 550 output tokens. The schedule is bounded
          // by eatingOutOccasions, so 12000 is several times the realistic need.
          // Previously unset: truncation here was silent.
          ...tuning(MODELS.DETAIL, { maxTokens: 12000, temperature: 0.4 })
        }),
        signal: signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new HttpError(response.status, `GPT API error: ${response.status} - ${errorText}`);
      }
      return response.json();
    }, 'Restaurant meal selection');

    if (!gptResult.success) {
      console.error('[RESTAURANT-SELECTION] ❌ All retries failed');
      return [];
    }
    const data = gptResult.data;

    logUsage('restaurant-meals', 12000, data);

    const parsed = parseChoice(MealsSchema, data.choices?.[0], 'restaurant-meals');
    if (!parsed.ok) {
      console.error(`[RESTAURANT-SELECTION] ❌ ${parsed.reason}: ${parsed.detail}`);
      return [];
    }

    // Put back the fields the model no longer has to retype. The result has
    // exactly the shape the rest of the app already consumes, with the links
    // and address taken from Places/Perplexity instead of from the model's
    // transcription of them.
    const { slots: selectedMeals, unmatched } = joinRestaurantMealSlots(
      parsed.data.restaurantMeals,
      restaurantMenuData
    );

    if (unmatched.length > 0) {
      // Not fatal — the meal still renders, without an order button. Worth a
      // loud line because it means the model named a restaurant that was not on
      // the list, which is the one failure this join cannot repair.
      console.warn(
        `[RESTAURANT-SELECTION] ⚠️ ${unmatched.length} option(s) named a restaurant not in the menu data: ${[...new Set(unmatched)].join(', ')}`
      );
    }

    console.log(`[RESTAURANT-SELECTION] ✅ Selected ${selectedMeals.length}/${restaurantMealsSchedule.length} restaurant meals`);

    // Log each selected meal with its ordering links. Under the strict schema
    // all four orderingLinks keys are always present, so count the non-null ones.
    selectedMeals.forEach((meal, i: number) => {
      const primaryLinks = Object.values(meal.primary.orderingLinks).filter(Boolean);
      console.log(`[RESTAURANT-SELECTION]   ${i + 1}. ${meal.day} ${meal.mealType}: ${meal.primary.restaurant} (${primaryLinks.length} links)`);
    });

    return selectedMeals;
    
  } catch (error) {
    console.error('[RESTAURANT-SELECTION] ❌ Selection failed:', error);
    return [];
  }
}

// Validate restaurant meals against calorie targets
function validateRestaurantMeals(
  restaurantMeals: any[],
  nutritionTargets: any,
  availableRestaurantCount: number
) {
  let warningCount = 0;
  let errorCount = 0;

  const mealTargets = nutritionTargets?.mealTargets || {};
  const dailyTarget = nutritionTargets?.dailyCalories || 0;
  const mealsByDay: Record<string, number[]> = {};

  restaurantMeals.forEach((meal: any) => {
    const day = meal.day || 'unknown';
    const mealType = (meal.mealType || '').toLowerCase();
    const actualCalories = meal.primary?.estimatedCalories ?? meal.primary?.calories ?? meal.estimatedCalories ?? meal.calories;
    const targetCalories = mealTargets?.[mealType]?.calories || 0;

    if (!mealsByDay[day]) mealsByDay[day] = [];
    if (typeof actualCalories === 'number') mealsByDay[day].push(actualCalories);

    if (actualCalories === null || actualCalories === undefined || Number.isNaN(actualCalories)) {
      errorCount += 1;
      console.error(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: missing calories ❌ ERROR`);
      return;
    }

    if (actualCalories < 200 || actualCalories > 1500) {
      warningCount += 1;
      console.warn(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (suspicious) ⚠️ WARNING`);
    }

    if (targetCalories > 0) {
      const deviation = Math.abs(actualCalories - targetCalories) / targetCalories * 100;
      if (deviation > 30) {
        errorCount += 1;
        console.error(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (target: ${targetCalories}, ${deviation.toFixed(1)}%) ⚠️ ERROR`);
      } else if (deviation > 15) {
        warningCount += 1;
        console.warn(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (target: ${targetCalories}, ${deviation.toFixed(1)}%) ⚠️ WARNING`);
      } else {
        console.log(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualCalories} cal (target: ${targetCalories}, ${deviation.toFixed(1)}%) ✓`);
      }
    }

    // Protein was unvalidated until 2026-08-19, which is why a meal at 42g
    // against an 85g target passed review looking healthy: it was within the
    // calorie window, and the calorie window was the only thing measured.
    //
    // Only a shortfall is reported. Overshooting protein is not a defect for
    // any goal this app supports, whereas falling short defeats the point of
    // the target — so a symmetric deviation check would spend attention on the
    // harmless direction.
    const targetProtein = mealTargets?.[mealType]?.protein || 0;
    const actualProtein = meal.primary?.protein ?? meal.protein;
    if (targetProtein > 0 && typeof actualProtein === 'number') {
      const shortfall = (targetProtein - actualProtein) / targetProtein * 100;
      if (shortfall > 30) {
        errorCount += 1;
        console.error(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualProtein}g protein (target: ${targetProtein}g, ${shortfall.toFixed(1)}% short) ⚠️ ERROR`);
      } else if (shortfall > 15) {
        warningCount += 1;
        console.warn(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualProtein}g protein (target: ${targetProtein}g, ${shortfall.toFixed(1)}% short) ⚠️ WARNING`);
      } else {
        console.log(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: ${actualProtein}g protein (target: ${targetProtein}g) ✓`);
      }
    } else if (targetProtein > 0) {
      warningCount += 1;
      console.warn(`[RESTAURANT-VALIDATOR] ${day} ${mealType}: protein missing (target: ${targetProtein}g) ⚠️ WARNING`);
    }
  });

  // Variety, checked rather than merely requested. The prompt has asked for
  // distribution across restaurants since the beginning; nothing ever confirmed
  // it happened, so a plan that sent the user to one place all week would have
  // looked identical in the logs to one that did not.
  const primaryCounts: Record<string, number> = {};
  restaurantMeals.forEach((meal: any) => {
    const name = meal.primary?.restaurant;
    if (name) primaryCounts[name] = (primaryCounts[name] || 0) + 1;
  });
  const distinct = Object.keys(primaryCounts).length;
  // The cap must be derived from the restaurants that were AVAILABLE, not the
  // ones the model happened to use. Dividing by `distinct` lets the output
  // define its own limit: pick one restaurant for all 7 meals and the cap
  // computes to 7, so the check passes with a tick. Measured 2026-08-19 —
  // "The Bite x4 of 7 across 2 restaurants" reported ✓ under the old formula.
  const pool = Math.max(1, availableRestaurantCount || distinct);
  const cap = Math.max(1, Math.ceil(restaurantMeals.length / pool));
  const overused = Object.entries(primaryCounts).filter(([, n]) => n > cap);
  if (overused.length > 0) {
    warningCount += 1;
    console.warn(`[RESTAURANT-VALIDATOR] Variety: ${overused.map(([n, c]) => `${n} x${c}`).join(', ')} exceeds the cap of ${cap} per restaurant (${restaurantMeals.length} meals, ${pool} available, ${distinct} used) ⚠️ WARNING`);
  } else {
    console.log(`[RESTAURANT-VALIDATOR] Variety: ${distinct} of ${pool} available restaurant(s) across ${restaurantMeals.length} meals, max ${Math.max(0, ...Object.values(primaryCounts))}/${cap} ✓`);
  }

  // Dish repetition, which the restaurant check above cannot see. Plan
  // cmtb3l1j10001l504ho0x51g3 stayed inside the restaurant cap and still served
  // "Super Burrito + Kale Salad" on three separate days: two slots at the same
  // restaurant are allowed, ordering the identical plate at them is what the
  // user actually notices. Prompt rule 8b asks for this; this measures it.
  const dishCounts: Record<string, number> = {};
  restaurantMeals.forEach((meal: any) => {
    const dish = meal.primary?.dish;
    if (typeof dish === 'string' && dish.trim()) {
      const key = dish.trim().toLowerCase();
      dishCounts[key] = (dishCounts[key] || 0) + 1;
    }
  });
  const repeatedDishes = Object.entries(dishCounts).filter(([, n]) => n > 1);
  if (repeatedDishes.length > 0) {
    warningCount += 1;
    console.warn(
      `[RESTAURANT-VALIDATOR] Dish variety: ${repeatedDishes
        .map(([d, c]) => `"${d}" x${c}`)
        .join(', ')} repeated across the week ⚠️ WARNING`
    );
  } else {
    console.log(
      `[RESTAURANT-VALIDATOR] Dish variety: ${Object.keys(dishCounts).length} distinct dishes across ${restaurantMeals.length} meals ✓`
    );
  }

  Object.entries(mealsByDay).forEach(([day, calories]) => {
    const dailyTotal = calories.reduce((sum, value) => sum + value, 0);
    if (dailyTarget > 0 && dailyTotal / dailyTarget > 0.6) {
      warningCount += 1;
      console.warn(`[RESTAURANT-VALIDATOR] ${day}: restaurant meals use ${Math.round((dailyTotal / dailyTarget) * 100)}% of daily target ⚠️ WARNING`);
    }
  });

  console.log(`[RESTAURANT-VALIDATOR] Validation complete: ${restaurantMeals.length} meals, ${warningCount} warning(s), ${errorCount} error(s)`);
}

/**
 * Hands menu extraction's output to a second invocation of THIS route, which
 * runs selection onwards with a fresh 53s budget.
 *
 * Why the route re-enters itself rather than calling a new endpoint: both phases
 * need identical setup — the same cookies, the same survey row, the same
 * `buildNutritionTargets`, the same schedule extraction. A separate route would
 * have to duplicate all of it and then drift from it. The phases differ only in
 * which half of the body they run, so the body branches and the setup is shared
 * by construction.
 *
 * The recursion terminates because phase 2 is entered only when
 * `restaurantMenuData` is present in the body, and phase 2 never calls this
 * function — it falls through to the home-meals hop instead.
 *
 * The payload is the enriched restaurants: ~6 restaurants of ~8 dishes, low tens
 * of KB of JSON. Re-sending it costs one HTTP body; re-deriving it costs six
 * Perplexity searches and the 26s that caused this whole problem.
 */
async function triggerSelectionPhase(
  surveyId: string,
  sessionId: string,
  mealPlanId: string | undefined,
  restaurantMenuData: any[],
  restaurantsSearched: number,
  restaurantDiscoveryTime: number,
  menuExtractionTime: number
): Promise<void> {
  console.log(
    `[RESTAURANT-GENERATION] 🎬 Handing off to the selection phase with ${restaurantMenuData.length} restaurant(s)...`
  );

  try {
    const res = await internalFetch('/api/ai/meals/generate-restaurants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`,
      },
      body: JSON.stringify({
        backgroundGeneration: true,
        mealPlanId,
        restaurantMenuData,
        restaurantsSearched,
        // Phase 2 writes restaurantTimings but did not run either of these
        // phases. Carried, not recomputed — same reason as restaurantsSearched.
        restaurantDiscoveryTime,
        menuExtractionTime,
      }),
    });

    trace(mealPlanId, 'restaurants', res.ok ? 'ok' : 'fail', {
      step: 'handoff-to-selection',
      httpStatus: res.status,
      restaurantsHandedOver: restaurantMenuData.length,
    });

    if (res.ok) {
      console.log('[RESTAURANT-GENERATION] ✅ Selection phase accepted the handoff');
    } else {
      // Nothing downstream runs if this fails: no restaurant meals, and no home
      // meals either, because the home hop lives on the far side of selection.
      console.error('[RESTAURANT-GENERATION] ❌ Selection handoff rejected:', res.status);
    }
  } catch (error) {
    trace(mealPlanId, 'restaurants', 'fail', {
      step: 'handoff-to-selection',
      error: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    console.error('[RESTAURANT-GENERATION] ❌ Selection handoff threw:', error);
  }
}

/**
 * Second hop of the generation relay.
 *
 * Home meals need the restaurant calories to size the remaining daily budget,
 * so this hop cannot start until restaurant generation finishes. It used to be
 * awaited inside the survey route, which meant one 60s function had to cover
 * both ~53s phases. It never did — the survey handler returned first and the
 * promise was reclaimed, so home meals and groceries were never generated at
 * all. Triggering from here gives the hop its own full 60s.
 *
 * generate-home triggers groceries itself, so the relay completes from here.
 */
async function triggerHomeMeals(
  surveyId: string,
  sessionId: string,
  mealPlanId: string | undefined,
  restaurantCalories: Array<{ day: string; mealType: string; calories: number }>
): Promise<void> {
  console.log('[RESTAURANT-GENERATION] 🏠 Handing off to home meal generation...', {
    mealPlanId: mealPlanId ?? 'none',
    restaurantMealsCounted: restaurantCalories.length,
  });

  try {
    // `internalFetch` resolves the base URL and attaches the Deployment
    // Protection bypass header. Without the header this hop is answered 401 at
    // the edge and generate-home never runs — the observed failure on
    // 2026-08-26. See internal-fetch.ts.
    const res = await internalFetch('/api/ai/meals/generate-home', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `survey_id=${surveyId}; guest_session=${sessionId}`,
      },
      body: JSON.stringify({ backgroundGeneration: true, mealPlanId, restaurantCalories }),
    });

    // The handoff is the single most important thing to be able to confirm
    // after a run: if it does not appear, home meals and groceries never ran.
    trace(mealPlanId, 'restaurants', res.ok ? 'ok' : 'fail', {
      step: 'handoff-to-home',
      httpStatus: res.status,
      restaurantMealsCounted: restaurantCalories.length,
    });

    if (res.ok) {
      console.log('[RESTAURANT-GENERATION] ✅ Home meal generation accepted the handoff');
    } else {
      console.error('[RESTAURANT-GENERATION] ❌ Home meal handoff rejected:', res.status);
    }
  } catch (error) {
    trace(mealPlanId, 'restaurants', 'fail', {
      step: 'handoff-to-home',
      error: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    console.error('[RESTAURANT-GENERATION] ❌ Home meal handoff threw:', error);
  }
}

export async function POST(req: NextRequest) {
  return withRouteBudget(() => handleGenerate_restaurants(req));
}

async function handleGenerate_restaurants(req: NextRequest) {
  const startTime = Date.now();
  console.log(`[RESTAURANT-GENERATION] 🚀 Starting restaurant meal generation at ${new Date().toISOString()}`);

  try {
    // Parse request data for coordinated meal plan ID
    //
    // `restaurantMenuData` is the phase marker. This route is re-entrant: see
    // triggerSelectionPhase. Absent = phase 1 (discovery + menu extraction),
    // present = phase 2 (selection onwards, with the menus phase 1 found).
    let requestData: {
      backgroundGeneration?: boolean;
      mealPlanId?: string;
      restaurantMenuData?: any[];
      restaurantsSearched?: number;
      restaurantDiscoveryTime?: number;
      menuExtractionTime?: number;
    } = {};
    try {
      requestData = await req.json();
    } catch {
      console.log(`[RESTAURANT-GENERATION] 📄 Empty request body, using defaults`);
    }

    const isSelectionPhase = Array.isArray(requestData.restaurantMenuData);

    trace(requestData.mealPlanId, 'restaurants', 'start', {
      background: requestData.backgroundGeneration ?? false,
    });

    console.log(`[RESTAURANT-GENERATION] 📋 Request data:`, {
      backgroundGeneration: requestData.backgroundGeneration,
      mealPlanId: requestData.mealPlanId || 'none - will find existing'
    });

    const cookieStore = await cookies();
    const userId = await getAuthUserId();
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;
    
    console.log('[RESTAURANT-GENERATION] 🍪 Cookies found:', {
      userId: userId || 'null',
      sessionId: sessionId || 'null',
      surveyId: surveyId || 'null'
    });
    
    // Get survey data
    let surveyData = null;
    
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    } else if (surveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: surveyId }
      });
    } else if (sessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: sessionId }
      });
    }
    
    if (!surveyData) {
      console.log('[RESTAURANT-GENERATION] ❌ No survey data found');
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }
    
    console.log(`[RESTAURANT-GENERATION] ✅ Survey data found for ${surveyData.firstName}`);

    // Calculate nutrition targets using shared function
    const weeklyNutritionTargets = buildNutritionTargets(surveyData);
    const nutritionTargets = convertToLegacyTargets(weeklyNutritionTargets);
    console.log(`[RESTAURANT-GENERATION] 📊 Calculated nutrition targets: ${nutritionTargets.dailyCalories} calories/day`);

    // Extract restaurant meals from schedule
    const restaurantMealsSchedule = extractRestaurantMealsFromSchedule(surveyData.weeklyMealSchedule);
    console.log(`[RESTAURANT-GENERATION] 🏪 Found ${restaurantMealsSchedule.length} restaurant meals in schedule`);
    
    if (restaurantMealsSchedule.length === 0) {
      console.log('[RESTAURANT-GENERATION] ℹ️ No restaurant meals in schedule, skipping generation');
      return NextResponse.json({
        success: true,
        restaurantMeals: [],
        message: 'No restaurant meals in user schedule'
      });
    }
    
    let restaurantDiscoveryTime = 0;
    let menuExtractionTime = 0;
    let restaurantMenuData: any[];
    // Carried across the hop rather than recomputed: phase 2 never runs
    // discovery, so "how many did we search" is only knowable from phase 1. It
    // is reporting metadata, not a decision input.
    let restaurantsSearched = 0;

    if (isSelectionPhase) {
      // ---- PHASE 2 ----------------------------------------------------------
      // A fresh invocation with a fresh 53s budget, carrying the menus phase 1
      // already paid for. Discovery and extraction are skipped entirely; this
      // hop exists so that selection — which is all-or-nothing — never competes
      // with them for time.
      restaurantMenuData = requestData.restaurantMenuData!;
      restaurantsSearched = requestData.restaurantsSearched ?? restaurantMenuData.length;
      restaurantDiscoveryTime = requestData.restaurantDiscoveryTime ?? 0;
      menuExtractionTime = requestData.menuExtractionTime ?? 0;
      console.log(
        `[RESTAURANT-GENERATION] 🎯 Selection phase: ${restaurantMenuData.length} enriched restaurant(s) handed over from extraction`
      );
      trace(requestData.mealPlanId, 'restaurants', 'start', {
        step: 'selection-phase',
        restaurantsReceived: restaurantMenuData.length,
      });
    } else {
      // ---- PHASE 1 ----------------------------------------------------------
      // Phase 1: Find restaurants
      const restaurantDiscoveryStart = Date.now();
      const selectedRestaurants = await findAndSelectBestRestaurants(surveyData);
      restaurantDiscoveryTime = Date.now() - restaurantDiscoveryStart;
      restaurantsSearched = selectedRestaurants.length;

      // Validate we have restaurants before proceeding
      if (selectedRestaurants.length === 0) {
        console.warn('[RESTAURANT-GENERATION] ⚠️ No restaurants found, returning empty result');
        return NextResponse.json({
          success: true,
          restaurantMeals: [],
          message: 'No restaurants found in your area'
        });
      }

      // Phase 2: Extract menus.
      //
      // NOT wrapped in reservingBudget any more, and that is the fix. It used to
      // hold back MEAL_SELECTION_RESERVE_MS for a selection call that ran later
      // in this same function. Extraction issues six Perplexity lookups 1200ms
      // apart and each clamps to what the route has left when it opens, so the
      // reserve came out of the TAIL of the wave: windows of 9716, 8516, 7314,
      // 6116, 4916, 3716ms against a search observed needing ~8516ms. Exactly one
      // returned a menu, nine discovered restaurants became one, and all 14 meals
      // came from it.
      //
      // No reserve value fixed that, because three phases did not fit in one 60s
      // function at all — discovery 9.5s + extraction's 9s floor + selection's
      // 34.8s p95 is 53.2s against a 53s budget. Vercel Hobby caps each
      // INVOCATION at 60s, not a chain of them, so selection was moved to its own
      // hop (see triggerSelectionPhase) and extraction got its 26s back. The wave
      // now opens with 34.5s and its last member still has 28.5s.
      //
      // route-budget.test.ts pins that arithmetic; handoff.test.ts pins the fact
      // that the reserve did not creep back in here.
      const menuExtractionStart = Date.now();
      restaurantMenuData = await extractMenuInformation(selectedRestaurants, surveyData);
      menuExtractionTime = Date.now() - menuExtractionStart;

      if (restaurantMenuData.length === 0) {
        console.warn('[RESTAURANT-GENERATION] ⚠️ No restaurants with menus found');
        return NextResponse.json({
          success: true,
          restaurantMeals: [],
          restaurantData: [],
          message: 'No restaurants with online ordering found in your area. Your meal plan will focus on home-cooked meals.'
        });
      }

      console.log(
        `[RESTAURANT-GENERATION] 🔀 Extraction done in ${menuExtractionTime}ms with ${restaurantMenuData.length} restaurant(s) — handing selection to its own invocation`
      );

      // after() keeps this instance alive past the response so the hop is
      // actually issued. Awaiting the hop inline would defeat the split: this
      // function would still be holding the 60s that selection needs.
      after(async () => {
        await triggerSelectionPhase(
          surveyId ?? '',
          sessionId ?? '',
          requestData.mealPlanId,
          restaurantMenuData,
          restaurantsSearched,
          restaurantDiscoveryTime,
          menuExtractionTime
        );
      });

      return NextResponse.json({
        success: true,
        phase: 'extraction',
        restaurantsEnriched: restaurantMenuData.length,
        message: 'Menus extracted; meal selection continues in a follow-on invocation',
      });
    }

    // Phase 3: Select specific meals for schedule.
    //
    // Reached only in the selection phase, where it owns the whole 53s budget
    // rather than the 26s it used to be promised. Selection does not degrade —
    // it either returns a week of meals or returns [] — which is precisely why
    // it is the phase that got its own invocation.
    const mealSelectionStart = Date.now();
    const selectedRestaurantMeals = await selectRestaurantMealsForSchedule(restaurantMenuData, restaurantMealsSchedule, surveyData, nutritionTargets);
    const mealSelectionTime = Date.now() - mealSelectionStart;

    // "completed" has to mean meals exist, not merely that the code reached
    // the end. On 2026-08-26 selection timed out after 26.7s of a 53s route
    // budget and returned zero meals, and the phase still recorded ok/completed
    // — so the plan read as healthy with the whole restaurant half of the week
    // empty, the dashboard believed restaurant meals had arrived, and nothing
    // downstream had cause to warn.
    const restaurantPhaseStatus =
      (selectedRestaurantMeals || []).length > 0 ? 'completed' : 'failed';

    // Validate restaurant meals (log only, do not block saving)
    if (selectedRestaurantMeals.length > 0) {
      validateRestaurantMeals(selectedRestaurantMeals, nutritionTargets, restaurantMenuData.length);
    }

    const userRestrictions = {
      dietPrefs: surveyData.dietPrefs || [],
      strictExclusions: surveyData.strictExclusions || {},
      foodAllergies: surveyData.foodAllergies || [],
    };

    const restrictionMeals: any[] = [];
    selectedRestaurantMeals.forEach((meal: any) => {
      const day = meal.day || 'unknown';
      const mealType = meal.mealType || 'unknown';
      if (meal.primary) {
        restrictionMeals.push({
          ...meal.primary,
          name: meal.primary.dish || meal.primary.name || meal.primary.description,
          ingredients: meal.primary.ingredients || [],
          day,
          mealType,
          option: 'primary'
        });
      }
      if (meal.alternative) {
        restrictionMeals.push({
          ...meal.alternative,
          name: meal.alternative.dish || meal.alternative.name || meal.alternative.description,
          ingredients: meal.alternative.ingredients || [],
          day,
          mealType,
          option: 'alternative'
        });
      }
    });

    const restrictionValidation = validateRestrictions(restrictionMeals, userRestrictions);
    const restrictionViolations = restrictionValidation.violations;

    if (!restrictionValidation.valid) {
      restrictionValidation.violations.forEach(v => {
        console.error(`[RESTRICTION-VALIDATOR] ❌ ${v.day} ${v.mealType}: "${v.mealName}" violates ${v.restriction} (contains ${v.ingredient})`);
      });
      console.error(`[RESTRICTION-VALIDATOR] Found ${restrictionValidation.violations.length} restriction violations`);
    } else {
      console.log(`[RESTRICTION-VALIDATOR] ✅ All meals pass restriction checks`);
    }
    
    // Grounding: compare the meals the user will see against hop 1's own answer.
    //
    // Three model calls produced these meals and only the first looked at the
    // internet. `searchItems` and `sourceHosts` are that first call's payload,
    // which extractMenuData used to hand to hop 2 as a string and drop. Every
    // comparison below runs on data already in memory, so this costs nothing
    // against ROUTE_TOTAL_BUDGET_MS — there is no headroom left to spend.
    //
    // Computed once here rather than inside each persistence branch, because
    // both branches store the same report.
    // Built from the enriched list rather than the raw discovery list. Both work
    // — this is a name-keyed lookup and enrichment spreads the original record —
    // but only these restaurants can appear in the plan, so only these can be
    // looked up.
    const restaurantFactsForPlan = buildRestaurantFacts(restaurantMenuData);
    const menuEvidence: Record<string, { searchItems?: any[]; sourceHosts?: string[] }> = {};
    // `?? []` guards the one statement in this block that sits outside
    // runVerification's catch. Verification must not be able to fail a
    // generation the user is waiting on, and a bare for-of over a nullish value
    // would do exactly that.
    for (const m of restaurantMenuData ?? []) {
      const key = String(m?.restaurant ?? '').toLowerCase().trim();
      if (key) menuEvidence[key] = { searchItems: m?.searchItems, sourceHosts: m?.sourceHosts };
    }
    const verification = runVerification(
      () => verifyRestaurantPayload(selectedRestaurantMeals, menuEvidence, restaurantFactsForPlan),
      'restaurants'
    );
    console.log(`[VERIFY] restaurants: ${JSON.stringify(verification.counts)}`);

    // Update existing meal plan with restaurant data
    const weekOfDate = getStartOfWeek();
    
    try {
      console.log('[RESTAURANT-GENERATION] 💾 Updating meal plan with restaurant data...');
      
      // Find the meal plan (coordinated ID or fallback to most recent partial)
      let existingMealPlan;

      if (requestData.mealPlanId) {
        // Use coordinated meal plan ID
        console.log(`[RESTAURANT-GENERATION] 🔗 Looking for coordinated meal plan ${requestData.mealPlanId}`);
        existingMealPlan = await prisma.mealPlan.findUnique({
          where: { id: requestData.mealPlanId }
        });
        if (!existingMealPlan) {
          throw new Error(`Coordinated meal plan ${requestData.mealPlanId} not found`);
        }
      } else {
        // Fallback to legacy behavior - find most recent partial meal plan
        console.log(`[RESTAURANT-GENERATION] 🔍 Looking for most recent partial meal plan (legacy mode)`);
        existingMealPlan = await prisma.mealPlan.findFirst({
          where: {
            OR: [
              { userId: userId || undefined },
              { surveyId: surveyData.id }
            ],
            status: 'partial'
          },
          orderBy: { createdAt: 'desc' }
        });
      }
      
      if (existingMealPlan) {
        // Update existing plan with restaurant data
        const existingContext = existingMealPlan.userContext as any;
        const existingDays = existingContext.days || [];
        
        // Update the days structure to include restaurant meals
        const updatedDays = existingDays.map((dayData: any) => {
          const updatedDay = { ...dayData };
          
          // Find restaurant meals for this day. The model's day/mealType casing
          // is not constrained by the schema, so compare and index normalised —
          // otherwise a "Monday"/"Lunch" response never matches and the
          // restaurant slot stays null with no error anywhere.
          const dayRestaurantMeals = selectedRestaurantMeals.filter(
            (meal: any) => String(meal?.day ?? '').toLowerCase() === String(dayData?.day ?? '').toLowerCase()
          );

          // Integrate restaurant meals into the day structure
          dayRestaurantMeals.forEach((meal: any) => {
            const mealType = String(meal?.mealType ?? '').toLowerCase();
            if (updatedDay.plannedMeals?.[mealType] === 'restaurant') {
              updatedDay.meals = updatedDay.meals || {};
              updatedDay.meals[mealType] = {
                primary: { ...meal.primary, source: 'restaurant' },
                alternative: { ...meal.alternative, source: 'restaurant' },
                source: 'restaurant'
              };
            }
          });
          
          return updatedDay;
        });
        
        // Places facts travel beside the model-authored meal objects, not on
        // them: a rating on a model output is a rating the model would invent.
        const restaurantFacts = restaurantFactsForPlan;

        const updatedContext = {
          ...existingContext,
          days: updatedDays,
          restaurantMeals: selectedRestaurantMeals,
          restaurantFacts,
          // Sidecar, like restaurantFacts above: verdicts about the model's
          // output, never fields on it. Keyed by generator because home meals
          // write their own report into this same object — a bare `verification`
          // key would have whichever route finished last erase the other.
          verification: { ...(existingContext.verification ?? {}), restaurants: verification },
          restrictionViolations: [
            ...(existingContext.restrictionViolations || []),
            ...(restrictionViolations || [])
          ],
          generators: {
            ...existingContext.generators,
            restaurants: restaurantPhaseStatus
          },
          metadata: {
            ...existingContext.metadata,
            // `goal` and `cuisines` are read by the dashboard but were never
            // written here, so the client masked the absence with `|| 'wellness'`
            // and `|| []` — and an empty array is truthy, which rendered the
            // cuisines badge as the bare word "cuisines". Derive cuisines from
            // the restaurants actually selected rather than from the survey's
            // preferences, so the badge can only name a cuisine that is on screen.
            goal: surveyData.goal,
            cuisines: uniqueSelectedCuisines(selectedRestaurantMeals),
            restaurantsStatus: restaurantPhaseStatus,
            restaurantsWithLinks: restaurantMenuData.length,
            totalRestaurantsSearched: restaurantsSearched,
            restaurantTimings: {
              discovery: `${restaurantDiscoveryTime}ms`,
              menuExtraction: `${menuExtractionTime}ms`,
              mealSelection: `${mealSelectionTime}ms`
            }
          }
        };
        
        await prisma.mealPlan.update({
          where: { id: existingMealPlan.id },
          data: {
            userContext: updatedContext as any,
            status: 'complete'
          }
        });
        
        console.log(`[RESTAURANT-GENERATION] ✅ Updated meal plan ${existingMealPlan.id} with restaurant data`);
        
      } else {
        console.log('[RESTAURANT-GENERATION] ⚠️ No existing partial meal plan found, creating new complete plan');
        
        const completePlan = {
          restaurantMeals: selectedRestaurantMeals,
          restaurantFacts: restaurantFactsForPlan,
          verification: { restaurants: verification },
          weeklySchedule: surveyData.weeklyMealSchedule,
          restrictionViolations: restrictionViolations || [],
          metadata: {
            type: 'restaurant_meals_only',
            generationMethod: 'split_pipeline_phase2',
            // Same two fields as the update branch above. This literal is the
            // path taken when no partial plan exists, and it drifted from the
            // other one — keep them together.
            goal: surveyData.goal,
            cuisines: uniqueSelectedCuisines(selectedRestaurantMeals),
            restaurantsStatus: restaurantPhaseStatus,
            restaurantsWithLinks: restaurantMenuData.length,
            totalRestaurantsSearched: restaurantsSearched
          }
        };
        
        await prisma.mealPlan.create({
          data: {
            surveyId: surveyData.id,
            userId: userId || null,
            weekOf: weekOfDate,
            userContext: completePlan as any,
            status: 'complete',
            regenerationCount: 1
          }
        });
      }
      
    } catch (dbError) {
      console.error('[RESTAURANT-GENERATION] ❌ Failed to update meal plan:', dbError);
      console.error('[RESTAURANT-GENERATION] ❌ Full error details:', {
        name: (dbError as Error).name,
        message: (dbError as Error).message,
        stack: (dbError as Error).stack
      });
      return NextResponse.json(
        {
          error: 'Failed to save restaurant meals to database',
          details: (dbError as Error).message,
          restaurantMealsGenerated: true // Meals were generated but not saved
        },
        { status: 500 }
      );
    }
    
    // Recorded before the handoff so a run that dies during the handoff still
    // shows what the restaurant phase actually produced. mealsSelected=0 here
    // is the exact failure that emptied a plan on 2026-08-26.
    trace(requestData.mealPlanId, 'restaurants', restaurantPhaseStatus === 'completed' ? 'ok' : 'fail', {
      ms: Date.now() - startTime,
      searched: restaurantsSearched,
      withLinks: restaurantMenuData.length,
      mealsSelected: (selectedRestaurantMeals || []).length,
    });

    // The relay's second hop. after() keeps this instance alive past the
    // response so the fetch is actually dispatched — the survey route's
    // equivalent call was orphaned exactly like this and silently dropped.
    // Placed after persistence so home meals read a saved plan, not a partial.
    after(
      triggerHomeMeals(
        surveyData.id,
        sessionId || '',
        requestData.mealPlanId,
        (selectedRestaurantMeals || []).map((meal: any) => ({
          day: meal.day,
          mealType: meal.mealType,
          calories: meal.primary?.estimatedCalories || meal.estimatedCalories || 0,
        }))
      )
    );

    const totalTime = Date.now() - startTime;
    console.log(`[RESTAURANT-GENERATION] 🏁 Restaurant generation completed in ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
    console.log(`[RESTAURANT-GENERATION] 📊 Summary:`);
    console.log(`[RESTAURANT-GENERATION]   - Restaurants searched: ${restaurantsSearched}`);
    console.log(`[RESTAURANT-GENERATION]   - Restaurants with ordering links: ${restaurantMenuData.length}`);
    console.log(`[RESTAURANT-GENERATION]   - Restaurant meals selected: ${selectedRestaurantMeals.length}`);
    
    return NextResponse.json({
      success: true,
      restaurantMeals: selectedRestaurantMeals,
      restaurantData: restaurantMenuData,
      summary: {
        totalSearched: restaurantsSearched,
        withOrderingLinks: restaurantMenuData.length,
        mealsSelected: selectedRestaurantMeals.length
      },
      timings: {
        restaurantDiscovery: `${restaurantDiscoveryTime}ms`,
        menuExtraction: `${menuExtractionTime}ms`,
        mealSelection: `${mealSelectionTime}ms`,
        totalTime: `${totalTime}ms`
      }
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[RESTAURANT-GENERATION] Error:', error);
    return NextResponse.json({
      error: 'Failed to generate restaurant meals',
      details: (error as Error).message
    }, { status: 500 });
  }
}