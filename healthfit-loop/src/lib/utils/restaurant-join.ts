/**
 * Attach the facts we already hold to the choices the model actually makes.
 *
 * Meal selection used to ask the model to emit thirteen fields per option, and
 * five of them — `restaurant`'s address, its cuisine, its four ordering URLs,
 * and the literal string `"restaurant"` — were not decisions at all. They were
 * transcription: values printed into the prompt from Places and Perplexity and
 * copied back out one token at a time.
 *
 * That cost two things.
 *
 * Latency. Measured on plan cmt9jxhs30003l504dl202k46 (7 slots, 14 options):
 * the persisted JSON is 6245 chars, and 2978 of those — 47.7% — are the
 * transcribed fields. On the 2026-08-26 run the selection call was cut off by
 * the route deadline at 26691ms having produced nothing, and the phase saved
 * zero restaurant meals for the week. Halving the token count it has to emit is
 * the difference between finishing inside the budget and not.
 *
 * Correctness. Anything the model retypes, it can retype wrongly:
 *
 *   - `orderingLinks` came back containing the *string* `"null"`, which is
 *     truthy, and reached the UI as an enabled order button pointing nowhere.
 *     Four prompt rules and a `normalizeOrderingLinks` pass existed to defend
 *     against a value the model never needed to produce.
 *   - `source` is the discriminator the entire dashboard branches on
 *     (`meal.source === 'restaurant'` appears in three components). A single
 *     mistyped character there renders a restaurant meal as a home recipe.
 *   - `address` and `cuisine` could drift from the restaurant record they were
 *     copied from, so a card could name a real restaurant at a wrong address.
 *
 * So the model now returns only what requires judgement — which restaurant,
 * which dish, what it costs and what is in it — and this module puts the rest
 * back. The object handed downstream keeps exactly the shape it had before.
 *
 * Pure, so it is tested without OpenAI, Prisma or a route budget.
 */

/** The four platforms a meal card can offer, always all present. */
export interface OrderingLinks {
  doordash: string | null;
  ubereats: string | null;
  grubhub: string | null;
  direct: string | null;
}

const PLATFORMS = ['doordash', 'ubereats', 'grubhub', 'direct'] as const;

/** What the model decides. Everything else is looked up. */
export interface RestaurantMealChoice {
  restaurant: string;
  dish: string;
  description: string;
  price: number;
  estimatedCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  tags: string[];
}

/** An entry of `restaurantMenuData` — the enriched record we already have. */
export interface RestaurantRecord {
  name?: string | null;
  address?: string | null;
  cuisine?: string | null;
  orderingLinks?: Record<string, unknown> | null;
}

/** The 13-field object the rest of the app consumes. Shape unchanged. */
export interface JoinedRestaurantMeal extends RestaurantMealChoice {
  cuisine: string;
  address: string;
  orderingLinks: OrderingLinks;
  source: 'restaurant';
}

/**
 * Compare restaurant names the way a human would rather than byte-for-byte.
 *
 * Places writes "EJ BBQ & Sushi"; a model asked to repeat it will sometimes
 * write "EJ BBQ and Sushi" or drop the ampersand. Neither is a different
 * restaurant, and treating them as one would throw away a good pick.
 */
export function normalizeRestaurantName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Find the record a chosen restaurant name refers to.
 *
 * Three passes, narrowest first: exact, normalized, then containment either
 * way — "Fanoos" against "Fanoos Persian Grill" is the same place, and a model
 * that shortens a long name should not cost the user their meal. Containment
 * requires four characters so that a stray short token cannot match everything.
 */
export function findRestaurantRecord(
  name: string,
  records: RestaurantRecord[]
): RestaurantRecord | null {
  const exact = records.find((r) => r.name === name);
  if (exact) return exact;

  const target = normalizeRestaurantName(name);
  if (!target) return null;

  const normalized = records.find((r) => normalizeRestaurantName(r.name) === target);
  if (normalized) return normalized;

  if (target.length < 4) return null;
  return (
    records.find((r) => {
      const candidate = normalizeRestaurantName(r.name);
      if (candidate.length < 4) return false;
      return candidate.includes(target) || target.includes(candidate);
    }) ?? null
  );
}

/**
 * Keep only values that are usable as an order button's href.
 *
 * Same test the prompt used to describe: an `http(s)` URL with no whitespace.
 * Everything else — including the string "null" and the empty string — becomes
 * a real null, so a missing platform renders as a missing button.
 */
export function toOrderingLinks(raw: unknown): OrderingLinks {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as OrderingLinks;
  for (const platform of PLATFORMS) {
    const value = source[platform];
    const usable = typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
    out[platform] = usable ? (value as string).trim() : null;
  }
  return out;
}

/**
 * Put the looked-up fields back onto one choice.
 *
 * An unmatched name still yields a meal. The model was told to pick from the
 * listed restaurants, so a name that matches nothing means it invented one, and
 * the honest rendering of that is a dish with no address and no order button —
 * not a silently dropped slot, which would leave the user a hole in their week
 * with no indication why. `matched` is returned so the caller can say so in the
 * log rather than the user discovering it on the card.
 */
export function joinRestaurantDetails(
  choice: RestaurantMealChoice,
  records: RestaurantRecord[]
): { meal: JoinedRestaurantMeal; matched: boolean } {
  const record = findRestaurantRecord(choice.restaurant, records);
  return {
    matched: record !== null,
    meal: {
      ...choice,
      // The record's own name wins over the model's spelling of it, so the card
      // and the order link always name the same restaurant.
      restaurant: record?.name || choice.restaurant,
      cuisine: record?.cuisine || '',
      address: record?.address || '',
      orderingLinks: toOrderingLinks(record?.orderingLinks),
      source: 'restaurant',
    },
  };
}

export interface ChoiceSlot {
  day: string;
  mealType: string;
  primary: RestaurantMealChoice;
  alternative: RestaurantMealChoice;
}

export interface JoinedSlot {
  day: string;
  mealType: string;
  primary: JoinedRestaurantMeal;
  alternative: JoinedRestaurantMeal;
}

/** Join every option in every slot. Returns the count that matched nothing. */
export function joinRestaurantMealSlots(
  slots: ChoiceSlot[],
  records: RestaurantRecord[]
): { slots: JoinedSlot[]; unmatched: string[] } {
  const unmatched: string[] = [];
  const joined = slots.map((slot) => {
    const primary = joinRestaurantDetails(slot.primary, records);
    const alternative = joinRestaurantDetails(slot.alternative, records);
    if (!primary.matched) unmatched.push(slot.primary.restaurant);
    if (!alternative.matched) unmatched.push(slot.alternative.restaurant);
    return {
      day: slot.day,
      mealType: slot.mealType,
      primary: primary.meal,
      alternative: alternative.meal,
    };
  });
  return { slots: joined, unmatched };
}
