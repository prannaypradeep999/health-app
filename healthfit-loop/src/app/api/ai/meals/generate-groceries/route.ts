import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { perplexityClient } from '@/lib/external/perplexity-client';
import { normalizeGroceryKey } from '@/lib/utils/grocery-list';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for price lookups

/**
 * Grocery Price Generation API Route
 *
 * Takes grocery items from meal plan and enriches with real local store prices.
 * Called as background task after home meal generation completes.
 */

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('[GROCERY-PRICES] 🛒 Starting grocery price lookup...');

  try {
    const cookieStore = await cookies();
    const surveyId = cookieStore.get('survey_id')?.value;

    if (!surveyId) {
      console.error('[GROCERY-PRICES] ❌ No survey_id cookie found');
      return NextResponse.json({ error: 'No survey found' }, { status: 400 });
    }

    console.log(`[GROCERY-PRICES] 📋 Survey ID: ${surveyId}`);

    // Get survey data for location
    const survey = await prisma.surveyResponse.findUnique({
      where: { id: surveyId }
    });

    if (!survey) {
      console.error('[GROCERY-PRICES] ❌ Survey not found in database');
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const surveyData = survey;
    const streetAddress = surveyData.streetAddress || '';
    const city = surveyData.city || '';
    const state = surveyData.state || '';
    const zipcode = surveyData.zipCode || '';
    const userGoal = surveyData.goal || 'GENERAL_WELLNESS';

    if (!zipcode || !city) {
      console.error('[GROCERY-PRICES] ❌ Missing location data');
      return NextResponse.json({ error: 'Missing location data in survey' }, { status: 400 });
    }

    console.log(`[GROCERY-PRICES] 📍 Location: ${streetAddress}, ${city}, ${state} ${zipcode}`);
    console.log(`[GROCERY-PRICES] 🎯 User goal: ${userGoal}`);

    // Get the current meal plan with grocery items
    const mealPlan = await prisma.mealPlan.findFirst({
      where: { surveyId },
      orderBy: { createdAt: 'desc' }
    });

    if (!mealPlan) {
      console.error('[GROCERY-PRICES] ❌ No meal plan found');
      return NextResponse.json({ error: 'No meal plan found' }, { status: 404 });
    }

    console.log(`[GROCERY-PRICES] 📦 Meal plan ID: ${mealPlan.id}`);

    // Get grocery list from userContext
    const userContext = mealPlan.userContext as any;
    const groceryList = userContext?.groceryList;

    if (!groceryList) {
      console.error('[GROCERY-PRICES] ❌ No grocery list in meal plan');
      return NextResponse.json({ error: 'No grocery list in meal plan' }, { status: 404 });
    }

    // Step 1: Find local grocery stores via Perplexity
    console.log('[GROCERY-PRICES] Step 1/3: Finding local stores...');
    // getLocalGroceryStores already retries internally. Wrapping it in a second
    // withPerplexityRetry bought nothing and cost a lot: the client catches its
    // own errors and resolves with {stores: []}, so the outer loop never saw a
    // rejection and never retried — but its own timeout still aborted the inner
    // call mid-flight. Slow-but-fine searches died early and the user got a 404.
    //
    // The two calls below share this route's 60s ceiling and each carries its
    // own 52s sequence budget, so the budgets do not compose: a slow store
    // search leaves the price lookup less time than its own preset thinks it
    // has. The platform, not the preset, is the real limit here.
    const storeResponse = await perplexityClient.getLocalGroceryStores(
      streetAddress, city, state, zipcode
    );

    if (!storeResponse.stores?.length) {
      console.error('[GROCERY-PRICES] ❌ Could not find stores after retries');
      return NextResponse.json({
        success: false,
        error: 'Taking longer to find stores in your area. Please try again.',
        location: `${city}, ${zipcode}`
      }, { status: 404 });
    }
    console.log(`[GROCERY-PRICES] ✅ Found ${storeResponse.stores.length} stores: ${storeResponse.stores.map(s => s.name).join(', ')}`);

    // Step 2: Flatten grocery items from all categories
    console.log('[GROCERY-PRICES] Step 2/3: Collecting grocery items...');
    const allItems: Array<{ name: string; quantity: string; uses: string; category: string }> = [];

    const categories = ['proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'snacks'];
    for (const category of categories) {
      const items = groceryList[category] || [];
      for (const item of items) {
        allItems.push({
          name: item.name,
          quantity: item.quantity,
          uses: item.uses || '',
          category
        });
      }
    }

    console.log(`[GROCERY-PRICES] 📦 Found ${allItems.length} grocery items across ${categories.length} categories`);

    if (allItems.length === 0) {
      console.warn('[GROCERY-PRICES] ⚠️ No items to price');
      return NextResponse.json({
        success: true,
        message: 'No grocery items to price',
        groceryList
      });
    }

    // Step 3: Get prices for all items via Perplexity
    console.log('[GROCERY-PRICES] Step 3/3: Getting prices from Perplexity...');
    // Same as above — getGroceryPrices owns its own retry loop.
    const priceResponse = await perplexityClient.getGroceryPrices(
      allItems, storeResponse.stores, city, userGoal
    );

    // If price lookup failed after retries, save stores but note prices unavailable
    if (!priceResponse.items?.length) {
      console.warn('[GROCERY-PRICES] ⚠️ Price lookup taking longer than expected');

      const partialGroceryList = {
        ...groceryList,
        stores: storeResponse.stores,
        location: storeResponse.location,
        pricesUpdatedAt: new Date().toISOString(),
        priceSearchSuccess: false,
        priceError: priceResponse.error || 'Could not retrieve prices'
      };

      await prisma.mealPlan.update({
        where: { id: mealPlan.id },
        data: {
          userContext: {
            ...(userContext || {}),
            groceryList: partialGroceryList
          }
        }
      });

      return NextResponse.json({
        success: true,
        partial: true,
        message: 'Found stores but could not get prices',
        groceryList: partialGroceryList,
        stores: storeResponse.stores
      });
    }

    // Step 4: Reorganize items back into categories
    const groceryListWithPrices: Record<string, any[]> = {
      proteins: [],
      vegetables: [],
      grains: [],
      dairy: [],
      pantryStaples: [],
      snacks: []
    };

    // Keyed by category:name for the exact match, and by name alone as a
    // fallback: the model echoes a category back and occasionally echoes one we
    // have no bucket for, which used to drop the item on the floor.
    const originalItemMap = new Map<string, any>();
    const originalCategoryByKey = new Map<string, string>();
    for (const category of categories) {
      const items = groceryList[category] || [];
      for (const item of items) {
        const key = normalizeGroceryKey(item.name || item.item || '');
        if (key) {
          originalItemMap.set(`${category}:${key}`, item);
          if (!originalCategoryByKey.has(key)) originalCategoryByKey.set(key, category);
        }
      }
    }

    const pricedKeys = new Set<string>();

    for (const item of priceResponse.items) {
      const key = normalizeGroceryKey(item.item || '');
      const category = groceryListWithPrices[item.category]
        ? item.category
        : originalCategoryByKey.get(key);

      if (!category) {
        console.warn(`[GROCERY-PRICES] ⚠️ Priced item "${item.item}" has unknown category "${item.category}" and no original match — skipping`);
        continue;
      }

      const original = originalItemMap.get(`${category}:${key}`);
      groceryListWithPrices[category].push({
        ...original,
        ...item
      });
      if (key) pricedKeys.add(`${category}:${key}`);
    }

    // Items the model skipped used to vanish from the list entirely: ask for 40
    // things, get prices for 25, and the other 15 are gone from the UI. The
    // schema guarantees a well-formed response, not a complete one, so carry
    // the unpriced originals through untouched. They render the same way they
    // do on the price-lookup-failed path above.
    let unpricedCount = 0;
    for (const category of categories) {
      for (const item of groceryList[category] || []) {
        const key = normalizeGroceryKey(item.name || item.item || '');
        if (!key || pricedKeys.has(`${category}:${key}`)) continue;
        groceryListWithPrices[category].push(item);
        unpricedCount++;
      }
    }
    if (unpricedCount > 0) {
      console.warn(`[GROCERY-PRICES] ⚠️ ${unpricedCount} of ${allItems.length} items came back without prices — kept them unpriced rather than dropping them`);
    }

    // Step 5: Build enriched grocery list
    const enrichedGroceryList = {
      ...groceryListWithPrices,
      stores: storeResponse.stores,
      storeTotals: priceResponse.storeTotals,
      recommendedStore: priceResponse.recommendedStore,
      savings: priceResponse.savings,
      location: storeResponse.location,
      pricesUpdatedAt: new Date().toISOString(),
      priceSearchSuccess: true
    };

    // Step 6: Update the meal plan with enriched grocery data
    console.log('[GROCERY-PRICES] 💾 Saving enriched grocery list to database...');
    await prisma.mealPlan.update({
      where: { id: mealPlan.id },
      data: {
        userContext: {
          ...(userContext || {}),
          groceryList: enrichedGroceryList
        }
      }
    });

    const duration = Date.now() - startTime;
    console.log(`[GROCERY-PRICES] ✅ Complete in ${duration}ms`);
    console.log(`[GROCERY-PRICES] 💡 Best store: ${priceResponse.recommendedStore}`);
    console.log(`[GROCERY-PRICES] 💰 ${priceResponse.savings}`);

    return NextResponse.json({
      success: true,
      groceryList: enrichedGroceryList,
      stores: storeResponse.stores,
      recommendedStore: priceResponse.recommendedStore,
      savings: priceResponse.savings,
      itemCount: allItems.length,
      duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[GROCERY-PRICES] ❌ Error after ${duration}ms:`, error);
    return NextResponse.json(
      {
        error: 'Failed to get grocery prices',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}