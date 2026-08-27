// src/lib/external/perplexity-client.ts
import { withPerplexityRetry, withGPTRetry, HttpError } from '@/lib/utils/retry';
import { MODELS, tuning } from '@/lib/ai/models';
import {
  MenuExtractionSchema,
  MenuSearchSchema,
  GroceryPricesSchema,
  GroceryStoreSearchSchema,
  toStrictJsonSchema
} from '@/lib/ai/schemas';
import { createGroceryPricePrompt } from '@/lib/ai/prompts/grocery-prices';
import { createMenuSearchPrompt, createMenuStructuringPrompt } from '@/lib/ai/prompts/restaurant-menu';
import { parseChoice } from '@/lib/ai/validate';
import { logUsage } from '@/lib/ai/usage';
import { createLimiter } from '@/lib/utils/concurrency';
import { corroborate } from '@/lib/external/link-check';
import { parseReceipt, sourceHostsFrom, type SearchItem } from '@/lib/verification/receipt';
import { computeStoreTotals, planPriceChunks, snapStoreNames } from '@/lib/utils/store-totals';
import { fillMissingPriceEstimates, unpricedReason } from '@/lib/utils/grocery-price-estimates';
import { reservingBudget, MENU_STRUCTURING_RESERVE_MS } from '@/lib/utils/route-budget';

/**
 * Process-wide gate on every Perplexity request.
 *
 * The 2026-08-18 run fired 8 menu lookups at once and 21 of them came back
 * `429 request_rate_limit_exceeded` (`retry-after: null`, no rate headers),
 * which cost 7 of 9 restaurant menus and left the selection prompt with 2
 * restaurants to fill 7 slots.
 *
 * Measured against this account on 2026-08-19, 9 requests unless noted:
 *
 *   concurrency=8 gap=0ms      8/9  failed
 *   concurrency=3 gap=0ms      8/9  failed
 *   concurrency=3 gap=500ms    5/9  failed
 *   concurrency=1 gap=0ms      1/9  failed
 *   concurrency=3 gap=1200ms   1/9  failed
 *   concurrency=4 gap=1200ms   0/12 failed
 *   concurrency=3 gap=1200ms   1/40 failed  (47s sustained — no per-minute cap)
 *   concurrency=1 gap=1000ms   0/9  failed
 *   concurrency=2 gap=1500ms   0/9  failed
 *   concurrency=1 gap=2000ms   0/9  failed
 *
 * The shape of that table is the finding: 4-wide at 1200ms passes while 1-wide
 * at 0ms fails. The account is limited on how often a request may *start*,
 * roughly once a second, and not on how many are in flight. So this gates
 * primarily on rate; the concurrency cap is only there to bound how much of the
 * route's 52s budget is committed at once.
 *
 * It must be module-level. A per-call-site limiter lets menu lookups, the
 * grocery-store search and the price lookup each believe they are alone and
 * collide anyway — they share one account-wide budget, so they need one gate.
 *
 * Pacing applies to first attempts only, since the limiter wraps *outside*
 * `withPerplexityRetry` (putting it inside would start the attempt timeout
 * while the request is still queued — see concurrency.ts). Retries are spaced
 * by the jittered backoff in retry.ts instead.
 */
/**
 * Set to the fastest configuration the table above actually measured passing
 * (4-wide / 1200ms, 12/12) rather than the conservative step below it.
 *
 * The margin was not free. On the 2026-08-19 run, menu extraction at 3/1500ms
 * enriched only 2 of 10 restaurants before the phase ran out of time — the
 * other 8 died with "Retry budget exhausted", and the meal selection then had a
 * two-restaurant menu to choose from, which is the real reason its macros came
 * out far below target. Throughput here is plan quality, not just latency.
 */
/**
 * Raised 4 -> 6 on 2026-08-19 so menu extraction can issue its whole wave.
 *
 * This is safe for the reason the table above already establishes: Perplexity
 * limits the rate at which requests START, not how many are open at once
 * (concurrency 3 at a 1200ms gap ran 47s with 1/40 failures and showed no
 * per-minute cap). Six-wide at an unchanged 1200ms interval issues requests at
 * exactly the same rate as four-wide; it only allows more of them to be in
 * flight while they wait on a slow live search, which is the actual shape of a
 * menu lookup.
 *
 * It has to move in step with MAX_MENU_LOOKUPS in generate-restaurants. A
 * module gate below the call site's fan-out silently becomes the binding
 * constraint, splits the wave in two, and the second half dies on budget —
 * which is precisely the failure that left the user with 2 restaurants.
 */
const PERPLEXITY_MAX_CONCURRENT = 6;
const PERPLEXITY_MIN_INTERVAL_MS = 1200;
const perplexityLimit = createLimiter(PERPLEXITY_MAX_CONCURRENT, PERPLEXITY_MIN_INTERVAL_MS);

export interface PerplexityMenuResponse {
  menuItems: Array<{
    name: string;
    price: number;
    description?: string;
    category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    estimatedCalories?: number;
    estimatedProtein?: number;
    estimatedCarbs: number;
    estimatedFat: number;
    healthRating?: 'excellent' | 'good' | 'fair' | 'poor';
    orderingUrl?: string;
    source?: string;
  }>;
  orderingLinks: {
    doordash?: string;
    ubereats?: string;
    grubhub?: string;
    direct?: string;
    website?: string;
  };
  sources: string[];
  restaurant: string;
  extractionSuccess: boolean;
  linksFound: number;
  linkCorroboration?: Record<string, 'cited' | 'uncited'>;
  /**
   * Hop 1's own answer, kept so downstream can check hop 2 and hop 3 against
   * it. Undefined means the hop-1 payload did not parse — which is distinct
   * from an empty menu, and the difference decides whether an unmatched dish is
   * a fabrication or simply unknowable.
   */
  searchItems?: SearchItem[];
  /** Hosts hop 1 actually retrieved from. Evidence for link corroboration. */
  sourceHosts?: string[];
  error?: string;
}

// Grocery store interfaces
export interface GroceryStore {
  name: string;
  address: string;
  distance?: string;
  type: 'budget' | 'mid-range' | 'premium';
}

export interface GroceryStoreSearchResponse {
  stores: GroceryStore[];
  location: string;
  searchSuccess: boolean;
  error?: string;
}

export interface StoreOption {
  store: string;
  displayName: string;  // Item name with brand if relevant (e.g., "TJ's Free Range Chicken Breast")
  price: number | null;  // null when no price could be established — never 0
  isRecommended: boolean;
  reason?: string;  // "Best value", "Lowest price", "Best quality"
  storeAddress: string;  // Street address only (e.g., "123 Main St")
  priceConfidence: 'exact' | 'estimate';  // Whether this is an exact price or estimate
}

export interface GroceryItemWithPrices {
  item: string;
  quantity: string;
  uses: string;
  category: string;
  storeOptions: StoreOption[];
  // The pages the search returned for this item's chunk. Our annotation, not a
  // model output — it is deliberately absent from the Zod schema, because
  // asking a model for URLs is how the ordering links got invented.
  sources?: string[];
}

export interface GroceryPriceResponse {
  items: GroceryItemWithPrices[];
  stores: GroceryStore[];
  storeTotals: { store: string; total: number; itemCount: number; comparable: boolean }[];
  comparableItemCount?: number;
  recommendedStore: string;
  savings: string;  // "Save $16.50 on 24 shared items vs Store X"
  priceSearchSuccess: boolean;
  pricedItemCount?: number;
  requestedItemCount?: number;
  chunksFailed?: number;
  chunksTotal?: number;
  error?: string;
}

/**
 * DECISION 2026-08-18 — stay on Sonar chat/completions for now. Measured, not assumed.
 *
 * ⏳ THIS HAS AN EXPIRY DATE. Perplexity retires the Sonar tiers and the
 * `/chat/completions` surface on **2026-09-27**. After that these three calls
 * stop working — not degrade, stop. If you are reading this on or after that
 * date and restaurant/grocery search is broken, this comment is the reason.
 *   https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview
 *
 * Why we did not migrate today:
 *
 * 1. The endpoint is healthy. Probed 2026-08-18: HTTP 200, no Deprecation or
 *    Sunset headers, `citations` and `search_results` both populated and fresh.
 * 2. The replacement is not a drop-in. `POST /v1/agent` takes `input` (a string)
 *    instead of `messages`, chooses a model via `preset`, and returns an `output`
 *    array of steps rather than `choices[]`. All three call sites and both
 *    response parsers change. That is Phase 2 work, not a constant swap.
 * 3. Its structured-output mode is measurably weaker under a tight schema.
 *    With `minItems: 5` against a prompt naming only two items:
 *      - Sonar    → clean, e.g. ["apple","banana","cherry","orange","mango"]
 *      - Agent API→ corrupted: chain-of-thought leaked into string values,
 *                   multilingual junk tokens, and 1 of 3 trials returned no
 *                   message at all.
 *    On realistic, loosely-constrained prompts the Agent API was fine (3/3 valid
 *    menus). The failure is specific to schemas that constrain harder than the
 *    prompt supports — which is exactly the regime Phase 0's count-pinning uses.
 *
 * Cost is close enough not to decide this, but the shape differs — Sonar bills a
 * flat `request_cost` ($0.005 of a $0.0053 call, ~94%), the Agent API bills
 * per-tool-call plus cache creation ($0.00594 for the same query).
 *
 * ⚠️ Non-obvious, and it reverses what the Phase 2 plan assumed: Sonar
 * `/chat/completions` DOES accept `response_format: {type:'json_schema',
 * json_schema:{..., strict:true}}` today, and it is genuinely grammar-enforced —
 * `minItems` is honoured, and citations survive (15 citations / 15 search_results
 * on a schema'd menu query, ~5.5s). So the two-hop
 * Sonar-writes-prose → gpt-4o-reshapes-it design in `processWithGPT4` is not
 * required by any vendor limitation. See Amendment A1 in
 * docs/superpowers/plans/2026-08-17-phase2-structured-perplexity.md before
 * acting on that, though: collapsing the hop also has to carry the dietary
 * exclusion logic, and the surface it would be built on retires on 2026-09-27.
 *
 * What would change this decision: the demo slipping past mid-September, or
 * Perplexity fixing Agent API structured output (re-run the minItems probe above).
 */
export class PerplexityClient {
  private apiKey: string;
  // Retires 2026-09-27 — see the DECISION block above before changing this.
  private baseUrl = 'https://api.perplexity.ai/chat/completions';

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    if (!this.apiKey) {
      console.error('[PERPLEXITY] ❌ PERPLEXITY_API_KEY not found in environment variables');
      throw new Error('PERPLEXITY_API_KEY not found in environment variables');
    }
    console.log(`[PERPLEXITY] 🔑 API Key loaded: ${this.apiKey.substring(0, 10)}...`);
  }

  async getRestaurantMenu(restaurant: any, surveyData: any): Promise<PerplexityMenuResponse> {
    const startTime = Date.now();
    
    // Validate restaurant object
    const restaurantName = restaurant?.name || 'Unknown Restaurant';
    const restaurantAddress = restaurant?.address || surveyData?.streetAddress || 'Address not available';
    const restaurantCity = restaurant?.city || surveyData?.city || 'Unknown City';
    
    // Skip if we don't have valid restaurant info
    if (restaurantName === 'Unknown Restaurant' || restaurantName === 'undefined') {
      console.warn(`[PERPLEXITY] ⚠️ Skipping menu extraction - invalid restaurant name`);
      return {
        menuItems: [],
        orderingLinks: {},
        sources: [],
        restaurant: restaurantName,
        extractionSuccess: false,
        linksFound: 0,
        error: 'Invalid restaurant name'
      };
    }
    
    console.log(`[PERPLEXITY] 🔍 Getting menu for ${restaurantName}...`);

    try {
      const query = createMenuSearchPrompt(restaurant, surveyData);
      console.log(`[PERPLEXITY] 📝 Query: ${query.substring(0, 200)}...`);

      const requestBody = {
        model: MODELS.SEARCH,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides accurate restaurant menu information with current prices. You MUST verify restaurant distances and only process restaurants within the specified distance limit. You MUST search for and provide actual ordering links from DoorDash, Uber Eats, and GrubHub when they exist. Only include links you actually find - never make up or guess URLs. If a restaurant is too far from the user location, skip menu extraction and note the distance issue.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.2,
        top_p: 0.9,
        // Sonar's /chat/completions is grammar-enforcing here, same as the two
        // grocery calls below. Without it this returned prose that a second
        // model reshaped, so every link was two hops from any HTTP response.
        response_format: toStrictJsonSchema('menu_search', MenuSearchSchema)
      };

      console.log(`[PERPLEXITY] 🚀 Making API request to ${this.baseUrl}`);

      // The search is the greedy phase and the structuring call below is the
      // deliverable. Left to a plain shared deadline the search takes whatever
      // it wants and structuring gets the remainder, which was sometimes 5.5s
      // against an 8s need — and a structuring timeout costs the whole
      // restaurant, not just its prose.
      const perplexityResult = await reservingBudget(MENU_STRUCTURING_RESERVE_MS, () =>
        perplexityLimit(() => withPerplexityRetry(async (signal) => {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[PERPLEXITY] ❌ API Error Details:`, {
            status: response.status,
            statusText: response.statusText,
            response: errorText
          });
          // Must be an HttpError, not a bare Error. `isRetryableError` reads
          // `.status`; with a plain Error it sees `undefined` and retries
          // everything, so a bad key or a malformed body burned all three
          // attempts here while the other two call sites gave up at once.
          throw new HttpError(
            response.status,
            `Perplexity API failed: ${response.status} ${response.statusText} - ${errorText.slice(0, 500)}`
          );
        }

        return response.json();
      }, `Restaurant menu for ${restaurantName}`)));

      if (!perplexityResult.success) {
        throw new Error(`Perplexity API failed after retries: ${perplexityResult.error}`);
      }

      const data = perplexityResult.data;
      const content = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];

      // Hop 1 is the only hop that looked at the internet. Its answer used to be
      // handed to hop 2 as a string and dropped on the floor. Parsing it here is
      // what makes every downstream grounding check possible.
      const receipt = parseReceipt(content);
      if (!receipt) {
        console.warn(`[PERPLEXITY] ⚠️ Hop-1 payload did not parse as MenuSearchSchema; grounding checks will report unchecked`);
      }

      console.log(`[PERPLEXITY] ✅ Raw response received in ${Date.now() - startTime}ms`);
      console.log(`[PERPLEXITY] 📄 Content length: ${content.length} characters`);
      console.log(`[PERPLEXITY] 🔗 Citations found: ${citations.length}`);

      // Process the Perplexity response with GPT-4 for structured extraction
      const structuredData = await this.processWithGPT4(content, citations, restaurant, surveyData);

      // Count actual links found (non-empty strings only)
      const orderingLinks = structuredData.orderingLinks || {};
      const linksFound = Object.values(orderingLinks).filter(
        (link): link is string => typeof link === 'string' && link.trim() !== ''
      ).length;

      console.log(`[PERPLEXITY] 🎯 Extracted ${structuredData.menuItems?.length || 0} menu items`);
      console.log(`[PERPLEXITY] 🔗 Ordering links found: ${linksFound}`);
      
      // Log each link for debugging
      Object.entries(orderingLinks).forEach(([platform, url]) => {
        if (url && typeof url === 'string' && url.trim() !== '') {
          console.log(`[PERPLEXITY]   ✅ ${platform}: ${url.substring(0, 50)}...`);
        }
      });

      // `c.url || c` used to push a whole citation object into sources when it
      // had no url key, which rendered downstream as [object Object].
      const citationUrls: string[] = citations
        .map((c: any) => (typeof c === 'string' ? c : c?.url))
        .filter((u: any): u is string => typeof u === 'string' && u.length > 0);

      const corroboration = corroborate(orderingLinks, citationUrls);
      const uncited = Object.entries(corroboration)
        .filter(([, v]) => v === 'uncited')
        .map(([k]) => k);
      if (uncited.length > 0) {
        console.log(`[PERPLEXITY] 📎 Uncited links (host not in search results): ${uncited.join(', ')}`);
      }

      return {
        menuItems: structuredData.menuItems || [],
        orderingLinks: orderingLinks,
        restaurant: restaurantName,
        sources: citationUrls.slice(0, 5),
        extractionSuccess: (structuredData.menuItems?.length || 0) > 0,
        linksFound: linksFound,
        linkCorroboration: corroboration,
        searchItems: receipt?.items,
        sourceHosts: receipt ? sourceHostsFrom(receipt, citationUrls) : undefined
      };

    } catch (error) {
      const time = Date.now() - startTime;
      console.error(`[PERPLEXITY] ❌ Error after ${time}ms:`, error);

      return {
        menuItems: [],
        orderingLinks: {},
        sources: [],
        restaurant: restaurantName,
        extractionSuccess: false,
        linksFound: 0,
        error: (error as Error).message
      };
    }
  }

  /**
   * Find top 3 grocery stores near user's location
   */
  async getLocalGroceryStores(
    streetAddress: string,
    city: string,
    state: string,
    zipcode: string,
    outerSignal?: AbortSignal
  ): Promise<GroceryStoreSearchResponse> {
    console.log(`[PERPLEXITY-GROCERY] 🏪 Finding grocery stores near ${streetAddress}, ${city}...`);

    try {
      const fullAddress = `${streetAddress}, ${city}, ${state} ${zipcode}`;
      const query = `Find up to 3 of the closest grocery stores to this exact address: ${fullAddress}

CRITICAL REQUIREMENTS:
1. PRIORITIZE BY DISTANCE - list stores from CLOSEST to FARTHEST
2. Include actual distance from the address (e.g., "0.3 mi", "1.2 mi")
3. Prefer stores within 3 miles when possible
4. Include a mix of store types if available nearby: budget-friendly, mid-range, premium
5. Return only stores you can actually place near this address. Fewer real stores is the correct answer; do not pad the list.

For each store provide:
- Store name (actual chain name, e.g., "Trader Joe's", "Safeway", "Whole Foods")
- Full street address
- Distance from ${streetAddress} (be as accurate as possible)
- Type: "budget", "mid-range", or "premium"

Return as JSON only, no other text:
{
  "stores": [
    {"name": "Store Name", "address": "123 Main St", "distance": "0.3 mi", "type": "mid-range"},
    {"name": "Store Name 2", "address": "456 Oak Ave", "distance": "0.8 mi", "type": "budget"},
    {"name": "Store Name 3", "address": "789 Elm Blvd", "distance": "1.5 mi", "type": "premium"}
  ]
}`;

      const StoreSchema = GroceryStoreSearchSchema;

      const storeResult = await perplexityLimit(() => withPerplexityRetry(async (signal) => {
        const fetchSignal = outerSignal ? AbortSignal.any([signal, outerSignal]) : signal;
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: MODELS.SEARCH,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that finds local grocery stores. Return accurate, real store information in JSON format only. No markdown, no explanation, just the JSON object. Return up to 3 stores. Return only stores that actually exist near the address — if you can find just one or two, return one or two. Never invent a store or an address to reach three.'
              },
              { role: 'user', content: query }
            ],
            // Sonar enforces this with a grammar rather than treating it as a
            // hint — the prompt's "JSON only, no other text" is now structural.
            // First call with a new schema pays a one-off compile penalty on
            // Perplexity's side; subsequent calls do not.
            response_format: toStrictJsonSchema('grocery_stores', StoreSchema),
            temperature: 0.1
          }),
          signal: fetchSignal
        });

        if (!response.ok) {
          throw new HttpError(response.status, `Perplexity API error: ${response.status}`);
        }

        return response.json();
      }, `Grocery stores near ${city}`));

      if (!storeResult.success) {
        throw new Error(`Grocery store search failed after retries: ${storeResult.error}`);
      }

      // Replaces `content.match(/\{[\s\S]*\}/)` + a bare JSON.parse. That pair
      // could not tell a refusal from a truncation from a wrong shape: all
      // three arrived as "No JSON found in response". parseChoice separates
      // them and, unlike the regex, actually checks the fields.
      const parsed = parseChoice(StoreSchema, storeResult.data?.choices?.[0], 'perplexity-grocery-stores');
      if (!parsed.ok) {
        throw new Error(`Store search returned an unusable response (${parsed.reason}): ${parsed.detail}`);
      }

      // `distance` is optional on GroceryStore but strict mode has no optionals,
      // so the schema makes it nullable. Mapping null back to undefined keeps
      // the serialised object identical to what the UI has always received.
      const stores: GroceryStore[] = parsed.data.stores.map(s => ({
        name: s.name,
        address: s.address,
        distance: s.distance ?? undefined,
        type: s.type
      }));

      console.log(`[PERPLEXITY-GROCERY] ✅ Found ${stores.length} stores`);

      return {
        stores,
        location: `${streetAddress}, ${city}, ${state} ${zipcode}`,
        searchSuccess: stores.length > 0
      };

    } catch (error) {
      console.error('[PERPLEXITY-GROCERY] ❌ Store search error:', error);
      return {
        stores: [],
        location: `${streetAddress}, ${city}, ${state} ${zipcode}`,
        searchSuccess: false,
        error: error instanceof Error ? error.message : 'Failed to find stores'
      };
    }
  }

  /**
   * Get real prices for grocery items at specified stores
   */
  /**
   * Prices every item, splitting the work when there is too much of it for one
   * request.
   *
   * Measured 2026-08-19: 83 items across 3 stores in a single call exceeded the
   * 45s attempt timeout, and because the whole list rode on that one request
   * the timeout cost all 83 — the route returned `priceSearchSuccess: false`
   * and the user saw a grocery list with no prices at all. The list length is
   * driven by the meal plan, so this is the normal case for a full week, not an
   * outlier.
   *
   * One wave up to 240 items — the chunk count stays at or below
   * PERPLEXITY_MAX_CONCURRENT, so the requests issue together rather than
   * queueing behind each other. Past that the list gets more chunks rather than
   * bigger ones and they queue: slower than one wave, but a request that
   * finishes beats a request that times out. The 15-item floor keeps short
   * lists as the single request they already were.
   */
  async getGroceryPrices(
    items: Array<{ name: string; quantity: string; uses: string; category: string }>,
    stores: GroceryStore[],
    city: string,
    userGoal: string,
    outerSignal?: AbortSignal
  ): Promise<GroceryPriceResponse> {
    const { chunkSize } = planPriceChunks(items.length, PERPLEXITY_MAX_CONCURRENT);
    const chunks: typeof items[] = [];
    for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));

    console.log(`[PERPLEXITY-GROCERY] 💰 Getting prices for ${items.length} items at ${stores.length} stores (${chunks.length} request${chunks.length === 1 ? '' : 's'} of up to ${chunkSize})...`);

    const settled = await Promise.all(chunks.map(chunk =>
      this.fetchPriceChunk(chunk, stores, city, userGoal, outerSignal)
        .then(priced => ({ ok: true as const, priced }))
        .catch(error => ({ ok: false as const, error: error as Error }))
    ));

    // Partial results are kept on purpose. Previously one timeout discarded
    // every item; two chunks out of three is a grocery list with most of its
    // prices, which is plainly worth more to the user than none of them.
    // Snapped back onto the store list we asked about before anything reads the
    // names. Each chunk above names the stores independently, and on the
    // 2026-08-27 production run 6 chunks produced FOUR names for three shops
    // ("Target Berkeley" on some items, "Target in Berkeley" on others). That is
    // not cosmetic: computeStoreTotals ranks over the intersection of items
    // every store priced, no item was priced under both spellings, so the
    // intersection was empty and all four totals rendered $0.00. The UI's
    // per-store filter matches on this same string, so it matched nothing
    // either. Snapping first means totals, estimates and the rows we persist
    // all agree on what a store is called.
    const pricedItems = snapStoreNames(
      settled.flatMap(r => r.ok ? r.priced : []),
      stores.map(s => s.name)
    );
    const failures = settled.filter(r => !r.ok);

    if (pricedItems.length === 0) {
      const firstError = failures.find(f => !f.ok) as { ok: false; error: Error } | undefined;
      console.error('[PERPLEXITY-GROCERY] ❌ Price search error:', firstError?.error);
      return {
        items: [], stores, storeTotals: [], recommendedStore: '', savings: '',
        priceSearchSuccess: false,
        error: firstError?.error?.message || 'Failed to get prices',
      };
    }

    if (failures.length > 0) {
      console.warn(`[PERPLEXITY-GROCERY] ⚠️ ${failures.length}/${chunks.length} chunk(s) failed — pricing ${pricedItems.length}/${items.length} items`);
    }

    // Totals are summed here rather than taken from the model. They have to be,
    // now that no single request sees the whole list — but it is also the
    // better answer regardless: an arithmetic result should come from
    // arithmetic, and the model was previously free to return a total that did
    // not match the prices printed beside it.
    const { totals: storeTotals, comparableItemCount, skippedStores } =
      computeStoreTotals(pricedItems);

    if (skippedStores.length > 0) {
      console.warn(`[PERPLEXITY-GROCERY] ⚠️ Excluded from price comparison (too few items priced): ${skippedStores.join(', ')}`);
    }
    console.log(`[PERPLEXITY-GROCERY] ⚖️ Comparing ${storeTotals.filter(t => t.comparable).length} store(s) over ${comparableItemCount} shared item(s)`);

    const comparable = storeTotals.filter(t => t.comparable);
    const cheapest = comparable[0];
    const dearest = comparable[comparable.length - 1];
    const savings = cheapest && dearest && comparable.length > 1 && dearest.total > cheapest.total
      ? `Save $${(dearest.total - cheapest.total).toFixed(2)} on ${comparableItemCount} shared items vs ${dearest.store}`
      : '';

    console.log(`[PERPLEXITY-GROCERY] ✅ Got prices for ${pricedItems.length} items`);
    console.log(`[PERPLEXITY-GROCERY] 💡 Recommended store: ${cheapest?.store || 'none'}`);

    // Estimates are filled in AFTER the totals above, and deliberately so.
    // computeStoreTotals ranks stores on real prices over the intersection of
    // items they all priced; feeding it inferred numbers would turn the
    // cheapest-store recommendation back into the coverage ranking it used to
    // be. fillMissingPriceEstimates never writes `price` — it only adds
    // `estimatedPrice` — so this ordering is belt and braces rather than the
    // only thing keeping the two apart.
    //
    // What it buys: an item priced at two of its three stores used to render
    // "no price" at the third, as though we knew nothing about it. Now it
    // renders "~$6.49", marked as an estimate, taken from the dearest store
    // that did answer.
    const itemsForDisplay = fillMissingPriceEstimates(pricedItems);
    const stillUnpriced = itemsForDisplay.filter(i => unpricedReason(i) !== null).length;
    if (stillUnpriced > 0) {
      // These are the ones no store priced at all. They keep a null price and
      // carry a reason instead, which the UI shows in place of a number.
      console.log(`[PERPLEXITY-GROCERY] 🏷️ ${stillUnpriced}/${itemsForDisplay.length} item(s) had no price at any store — showing the reason rather than a guess`);
    }

    const chunksFailed = failures.length;
    return {
      items: itemsForDisplay,
      stores,
      storeTotals,
      comparableItemCount,
      recommendedStore: cheapest?.store || '',
      savings,
      // True only when nothing failed. A run that lost two of three chunks is
      // two thirds unpriced, and it used to be indistinguishable from a
      // complete one.
      priceSearchSuccess: chunksFailed === 0,
      pricedItemCount: pricedItems.length,
      requestedItemCount: items.length,
      chunksFailed,
      chunksTotal: chunks.length,
    };
  }

  /**
   * One pricing request. Throws on failure so the caller can decide whether a
   * partial result is still worth returning.
   */
  private async fetchPriceChunk(
    items: Array<{ name: string; quantity: string; uses: string; category: string }>,
    stores: GroceryStore[],
    city: string,
    userGoal: string,
    outerSignal?: AbortSignal
  ): Promise<GroceryItemWithPrices[]> {
    const storeNames = stores.map(s => s.name).join(', ');
    const addressByStore = new Map(
      stores.map(s => [s.name.trim().toLowerCase(), s.address])
    );

    {
      const query = createGroceryPricePrompt({ items, storeNames, city, userGoal });

      const priceResult = await perplexityLimit(() => withPerplexityRetry(async (signal) => {
        const fetchSignal = outerSignal ? AbortSignal.any([signal, outerSignal]) : signal;
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: MODELS.SEARCH,
            messages: [
              {
                role: 'system',
                // This used to read "Provide accurate, current grocery prices
                // based on typical prices in the specified city" and "Include
                // brand descriptors only when they matter". Every item then
                // came back as priceConfidence "estimate" with displayName
                // "Bananas" — which was the prompt working exactly as written.
                // The complaint that results looked generic was a complaint
                // about this sentence. Sonar is a live-search model; it was
                // being told not to search.
                content: 'You are a grocery pricing researcher with live web search. Look up what products actually cost at the specific named stores before answering, and name products the way those stores name them on the shelf. Distinguish honestly between a price you found and a price you inferred. Always return valid JSON only, no markdown or explanation.'
              },
              { role: 'user', content: query }
            ],
            // Same grammar enforcement as the store search. Not count-pinned —
            // see the note on GroceryPricesSchema; a long list pinned to an
            // exact count risks truncation, which strict decoding cannot
            // salvage. Missing items are recovered by the caller instead.
            response_format: toStrictJsonSchema('grocery_prices', GroceryPricesSchema),
            temperature: 0.2
          }),
          signal: fetchSignal
        });

        if (!response.ok) {
          throw new HttpError(response.status, `Perplexity API error: ${response.status}`);
        }

        return response.json();
      }, `Grocery prices in ${city}`));

      if (!priceResult.success) {
        throw new Error(`Grocery price lookup failed after retries: ${priceResult.error}`);
      }

      const parsed = parseChoice(GroceryPricesSchema, priceResult.data?.choices?.[0], 'perplexity-grocery-prices');
      if (!parsed.ok) {
        throw new Error(`Price lookup returned an unusable response (${parsed.reason}): ${parsed.detail}`);
      }

      // Sonar cites per response, not per item, so this is what the search
      // retrieved for the whole chunk. The UI must not present it as proof of
      // any one item's price.
      const chunkCitations: string[] = (priceResult.data?.citations || [])
        .map((c: any) => (typeof c === 'string' ? c : c?.url))
        .filter((u: any): u is string => typeof u === 'string' && u.length > 0);

      // `reason` is optional on StoreOption; nullable in the schema for the same
      // strict-mode reason as `distance` above, and mapped back so the key
      // disappears from the JSON rather than serialising as null.
      const pricedItems: GroceryItemWithPrices[] = parsed.data.items.map(i => ({
        item: i.item,
        quantity: i.quantity,
        uses: i.uses,
        category: i.category,
        sources: chunkCitations.slice(0, 3),
        storeOptions: i.storeOptions.map(o => ({
          store: o.store,
          displayName: o.displayName,
          price: o.price,
          isRecommended: o.isRecommended,
          reason: o.reason ?? undefined,
          // Joined from the Google Places result rather than asked of the
          // model. Matched case-insensitively because the model echoes the
          // store name back in whatever casing it likes, and an exact-match
          // lookup here would silently reproduce the empty-address bug this
          // change exists to fix.
          storeAddress: addressByStore.get(o.store.trim().toLowerCase()) ?? '',
          priceConfidence: o.priceConfidence
        }))
      }));

      return pricedItems;
    }
  }

  private async processWithGPT4(content: string, citations: any[], restaurant: any, surveyData: any): Promise<Partial<PerplexityMenuResponse>> {
    try {
      console.log(`[PERPLEXITY-GPT4] 🤖 Processing menu data with GPT-4...`);

      const gptPrompt = createMenuStructuringPrompt({ content, citations, restaurant, surveyData });

      const gptResult = await withGPTRetry(async (signal) => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GPT_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODELS.DETAIL,
            messages: [{ role: 'user', content: gptPrompt }],
            // Not count-pinned: the prompt asks for "6-12 items maximum", a range,
            // and a restaurant page may genuinely yield fewer. Pinning a count the
            // prompt does not enumerate makes the model invent menu items.
            response_format: toStrictJsonSchema('menu_extraction', MenuExtractionSchema),
            ...tuning(MODELS.DETAIL, { maxTokens: 4000, temperature: 0.1 })
          }),
          signal
        });

        if (!response.ok) {
          throw new HttpError(response.status, `GPT-4 processing failed: ${response.status}`);
        }

        return response.json();
      }, 'Menu data structuring');

      if (!gptResult.success) {
        throw new Error(`GPT-4 processing failed after retries: ${gptResult.error}`);
      }

      logUsage('perplexity-menu-extraction', 4000, gptResult.data);

      // The markdown-fence salvage is gone: under grammar-constrained decoding
      // the model cannot emit a fence, and a response that fails to parse is a
      // real failure rather than something to clean up and hope about.
      const parsed = parseChoice(MenuExtractionSchema, gptResult.data.choices?.[0], 'perplexity-menu-extraction');
      if (!parsed.ok) {
        console.error(`[PERPLEXITY-GPT4] ❌ ${parsed.reason}: ${parsed.detail}`);
        return { menuItems: [], orderingLinks: {} };
      }

      // The schema guarantees all four keys are present and are either a string
      // or null. It cannot guarantee the string is a URL — observed: the model
      // returns "" for a missing platform despite the prompt asking for null,
      // because "" satisfies the grammar, and elsewhere it has emitted the
      // literal four-character string "null". The http(s) test is what actually
      // filters those out, and is the only reason this loop remains.
      //
      // Keys for rejected platforms are dropped rather than set to null: callers
      // downstream count `Object.keys(orderingLinks).length`, and the failure
      // path below already returns `{}`, so a sparse object is the established
      // shape here.
      const cleanedLinks: Record<string, string> = {};
      for (const [platform, url] of Object.entries(parsed.data.orderingLinks)) {
        if (typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim())) {
          cleanedLinks[platform] = url.trim();
        }
      }

      console.log(`[PERPLEXITY-GPT4] ✅ Structured ${parsed.data.menuItems.length} menu items`);
      // "Well-formed", not "verified": this is a syntax check on the URL, never
      // a request. A 404 storefront looks identical to a live one from here.
      console.log(`[PERPLEXITY-GPT4] 🔗 Well-formed links: ${Object.keys(cleanedLinks).join(', ') || 'none'}`);

      return {
        menuItems: parsed.data.menuItems,
        orderingLinks: cleanedLinks
      };

    } catch (error) {
      console.error(`[PERPLEXITY-GPT4] ❌ Structuring failed:`, error);
      return {
        menuItems: [],
        orderingLinks: {}
      };
    }
  }
}

export const perplexityClient = new PerplexityClient();