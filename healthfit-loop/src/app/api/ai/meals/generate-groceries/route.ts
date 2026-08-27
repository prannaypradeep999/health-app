import { NextRequest, NextResponse, after } from 'next/server';
import { withRouteBudget, reservingBudget } from '@/lib/utils/route-budget';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { perplexityClient } from '@/lib/external/perplexity-client';
import { normalizeGroceryKey, enhanceGroceryListWithUsage } from '@/lib/utils/grocery-list';
import { mergePricedItem } from '@/lib/utils/grocery-merge';
import { consolidateGroceryList } from '@/lib/ai/grocery-consolidation';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for price lookups

/**
 * Grocery Price Generation API Route
 *
 * Takes grocery items from meal plan and enriches with real local store prices.
 * Called as background task after home meal generation completes.
 */

type GroceryGenerationRequest = {
  backgroundGeneration?: boolean;
  mealPlanId?: string;
};

/**
 * The relay's last hop.
 *
 * Same shape as generate-home's POST and for the same reason: the caller
 * reaches this route inside its own `after()`, having already spent most of its
 * `maxDuration`. Awaiting the full price lookup there freezes the caller and
 * loses the grocery prices. A 202 lets the caller finish and gives this work a
 * fresh invocation with a full budget.
 */
export async function POST(req: NextRequest) {
  let body: GroceryGenerationRequest = {};
  try {
    body = await req.json();
  } catch {
    // Legal: the handler falls back to the newest plan for the survey cookie
    // when no mealPlanId is supplied.
  }

  if (body.backgroundGeneration) {
    after(withRouteBudget(() => handleGenerate_groceries(body)));
    return NextResponse.json({ accepted: true }, { status: 202 });
  }

  return withRouteBudget(() => handleGenerate_groceries(body));
}

async function handleGenerate_groceries(requestData: GroceryGenerationRequest) {
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

    // Get the current meal plan with grocery items.
    //
    // Prefer the id the caller hands us. Re-deriving it with findFirst picks
    // whatever plan is newest at the moment this route runs, which is not
    // necessarily the plan whose grocery list the caller just wrote — a
    // regeneration started in the meantime would win the ordering and get
    // priced instead.
    const mealPlan = requestData.mealPlanId
      ? await prisma.mealPlan.findUnique({ where: { id: requestData.mealPlanId } })
      : await prisma.mealPlan.findFirst({
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
    const placeholderList = userContext?.groceryList;

    if (!placeholderList) {
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
    //
    // The route budget now composes them, but a shared deadline alone is
    // first-come-first-served and this is the same shape that returned 0
    // restaurant meals: the greedy phase is not the one that matters. Stores
    // without prices is a degraded result the UI still renders (see the
    // `priceSearchSuccess: false` branch below); prices are the deliverable.
    // So the store search gets everything except what step 3 needs.
    //
    // 28s for prices because that call carries every grocery item across six
    // categories in one prompt, against a store search that is a single
    // location query. If the search cannot finish in the remaining ~25s it was
    // not going to finish in 53s either.
    // Consolidation rides alongside the store search rather than after it.
    //
    // It used to run at the end of generate-home, on whatever budget the meal
    // phases left — 1208ms on the 2026-08-27 run against a p95 cost of ~17.7s,
    // so it never fired and this route priced raw ingredient lines ("ground
    // turkey oz sauted in a nonstick pan") instead of shopping items. That is
    // an over-subscribed route, not a scheduling accident: no reserve fixes it
    // without starving the meals instead.
    //
    // The two calls below are independent — stores depend only on the address,
    // consolidation only on the meals — so running them together costs the
    // slower of the two rather than the sum, and consolidation's ~17.7s fits
    // inside the ~25s the store search already had. Prices keep the same 28s
    // guarantee they had before, so nothing downstream is squeezed to pay for
    // this.
    const allMeals: any[] = Array.isArray(userContext?.homeMeals) ? userContext.homeMeals : [];

    const [storeResponse, consolidated] = await reservingBudget(28_000, () =>
      Promise.all([
        perplexityClient.getLocalGroceryStores(streetAddress, city, state, zipcode),
        consolidateGroceryList(allMeals, surveyData, '[GROCERY-PRICES]').catch(e => {
          // Never fatal: the placeholder list from generate-home is worse, not
          // absent, so a consolidation failure costs quality and not the run.
          console.error('[GROCERY-PRICES] ❌ Consolidation threw:', e);
          return null;
        }),
      ])
    );

    // Keep the categories the consolidation produced, but keep every other
    // field the placeholder carried (stores, location, and anything a previous
    // pricing run left behind).
    //
    // Then put the usage fields back. The spread above replaces the six category
    // arrays wholesale, and `consolidateGroceryList` returns bare rows — name,
    // quantity, uses — so `usedInMeals`, `firstUseDay` and `perishability` left
    // with the placeholder's arrays. Nothing threw and the list still rendered,
    // which is why this survived a deploy: production plan cmtayzto2 had 0 of 40
    // items with a usage entry, GroceryListSection's "Next 3 days" tab filters on
    // `firstUseDay` and so showed nothing to anyone, and sorting by day or by
    // perishability was a no-op.
    //
    // Pure and local — no model call, no network, no budget. It matches shopping
    // names back to recipe ingredient lines by substring, which is why it runs
    // on the merged list rather than on the placeholder it replaced.
    const groceryList = enhanceGroceryListWithUsage(
      consolidated ? { ...placeholderList, ...consolidated } : placeholderList,
      allMeals
    );

    if (consolidated) {
      console.log('[GROCERY-PRICES] ✅ Using consolidated list; the placeholder from generate-home is replaced');
    } else {
      console.warn('[GROCERY-PRICES] ⚠️ Consolidation unavailable — pricing the ingredient-backfill placeholder instead');
    }

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

      let original = originalItemMap.get(`${category}:${key}`);
      let matchedKey = key;

      // A rename produces a different key, which used to look exactly like a
      // skip: the merge lost the original's fields and the carry-through loop
      // below then re-added the original unpriced, so one ingredient rendered
      // as two rows. Fall back to a containment match on the normalised names.
      if (!original) {
        for (const [candidateKey, candidate] of originalItemMap) {
          if (!candidateKey.startsWith(`${category}:`)) continue;
          const bare = candidateKey.slice(category.length + 1);
          if (!bare || pricedKeys.has(candidateKey)) continue;
          if (key.includes(bare) || bare.includes(key)) {
            original = candidate;
            matchedKey = bare;
            console.log(`[GROCERY-PRICES] 🔤 Matched renamed item "${item.item}" to "${candidate.name || candidate.item}"`);
            break;
          }
        }
      }

      groceryListWithPrices[category].push(mergePricedItem(original, item));
      if (matchedKey) pricedKeys.add(`${category}:${matchedKey}`);
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

    // What the week's shop costs, and how much of the budget that is.
    //
    // Both fields existed and both were dead. `totalEstimatedCost` was only ever
    // written as the literal 0 and `weeklyBudgetUsed` as the literal "0%", so
    // the dashboard reported a week of groceries as free and used none of the
    // budget. The number now comes from estimatedBasketTotal, which sums the
    // whole list at the recommended store — deliberately NOT storeTotals, which
    // sums only the items every store priced and is a comparison figure rather
    // than a bill.
    //
    // The budget is monthly in the survey and this list is one week, so it is
    // quartered — the same conversion the meal prompts already do. Reported as
    // a percentage of a quarter-month rather than of the month, because a week's
    // shop against a monthly budget always looks affordable and tells the user
    // nothing.
    const weeklyBudget = Math.round((surveyData.monthlyFoodBudget || 200) / 4);
    const basketTotal = priceResponse.basketTotal ?? 0;
    const weeklyBudgetUsed =
      weeklyBudget > 0 ? `${Math.round((basketTotal / weeklyBudget) * 100)}%` : '0%';
    console.log(
      `[GROCERY-PRICES] 🧾 Basket $${basketTotal.toFixed(2)} vs $${weeklyBudget}/week budget = ${weeklyBudgetUsed}` +
        (priceResponse.basketItemsUnknown ? ` (${priceResponse.basketItemsUnknown} item(s) had no number and are not in the total)` : '')
    );

    // Step 5: Build enriched grocery list
    const enrichedGroceryList = {
      ...groceryListWithPrices,
      stores: storeResponse.stores,
      storeTotals: priceResponse.storeTotals,
      recommendedStore: priceResponse.recommendedStore,
      savings: priceResponse.savings,
      location: storeResponse.location,
      pricesUpdatedAt: new Date().toISOString(),
      priceSearchSuccess: priceResponse.priceSearchSuccess,
      pricedItemCount: priceResponse.pricedItemCount,
      requestedItemCount: priceResponse.requestedItemCount,
      totalEstimatedCost: basketTotal,
      weeklyBudgetUsed,
      weeklyBudget,
      // How many items the total actually covers. A total over 38 of 40 items is
      // a different claim from a total over 40, and the card can say so.
      totalCoversItemCount: priceResponse.basketItemsCounted ?? 0,
      totalMissingItemCount: priceResponse.basketItemsUnknown ?? 0
    };

    // Step 6: Update the meal plan with enriched grocery data
    console.log('[GROCERY-PRICES] 💾 Saving enriched grocery list to database...');
    await prisma.mealPlan.update({
      where: { id: mealPlan.id },
      data: {
        userContext: {
          ...(userContext || {}),
          groceryList: enrichedGroceryList,
          // Also at the top level because /api/ai/meals/current reads
          // `userContext.totalEstimatedCost` for the dashboard's grocery
          // preview, and nothing has ever written it — which is why that
          // preview has always said "Ready to shop" instead of a number.
          totalEstimatedCost: basketTotal,
          weeklyBudgetUsed
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