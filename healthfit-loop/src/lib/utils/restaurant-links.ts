/**
 * What a user can actually do with a restaurant option, given the links that
 * survived verification.
 *
 * Three filters stand between a restaurant and a rendered Order button, and two
 * of them are doing their job:
 *
 *   1. `suppressUndisplayablePlatforms` nulls DoorDash and Uber Eats before
 *      they are probed, because both answer 403 to datacenter IPs and we
 *      cannot tell a live link from a dead one we are not allowed to see.
 *   2. `verifyLinks` drops anything that does not answer, and anything whose
 *      deep path 302s to the site root — a live-but-useless link is worse than
 *      none, because the user acts on it.
 *   3. `extractMenuInformation` keeps a restaurant when it knows a dish, not
 *      when it has a link, because a walk-in place with a known menu is a real
 *      recommendation.
 *
 * The residue is genuine: 14 of 140 benched options, and worse in production,
 * end up with no orderable link at all. The defect was never that we dropped
 * those links. It was that having dropped them we left the user holding a dish
 * name and no way to act on it — `availableOrderLinks` returned `[]` and the
 * meal card rendered no button whatsoever.
 *
 * So every option gets a destination that is DERIVED, never invented: a Google
 * Maps *search* for the restaurant's name and address, both of which came from
 * Google Places and are already on the meal object.
 *
 * A search rather than a place deep link, deliberately. A search cannot land on
 * the wrong restaurant, which is exactly the failure `isHomepageRedirect` exists
 * to catch. It needs no probe, so it costs nothing against the route budget.
 * And the listing it opens carries the phone number, the hours, directions, and
 * frequently an order link of its own.
 *
 * It is labelled `kind: 'locate'` rather than `'order'` because it is not an
 * order button and must not be dressed as one.
 */

export type OrderOptionKind = 'order' | 'locate';

export interface OrderOption {
  key: string;
  label: string;
  url: string;
  kind: OrderOptionKind;
}

/**
 * Order matters: it is the order the buttons render in, and the first entry is
 * what a single-destination caller opens.
 */
export const ORDER_PLATFORMS: readonly { key: string; label: string }[] = [
  { key: 'doordash', label: 'DoorDash' },
  { key: 'ubereats', label: 'Uber Eats' },
  { key: 'grubhub', label: 'GrubHub' },
  { key: 'direct', label: 'Direct' },
];

/**
 * The model is told to write null for a platform it could not find, but the
 * literal string "null" has come back before — see the link-resolution tests —
 * so it is rejected here alongside blanks and non-strings.
 */
function usableUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
    return null;
  }
  return trimmed;
}

/** Trimmed, or null. Guards against the string "undefined" reaching a URL. */
function usableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return null;
  }
  return trimmed;
}

/**
 * The documented Google Maps URL API. `api=1` is what makes it a stable
 * contract rather than a scraped URL shape.
 *
 * Returns null without a name — a search for an address alone would open some
 * other business at that address, which is worse than no button.
 *
 * The address is appended when we have one and is not one of the placeholder
 * strings the restaurant route substitutes when Places gave it nothing.
 */
const ADDRESS_PLACEHOLDERS = new Set([
  'address not available',
  'unknown city',
  'n/a',
  'none',
]);

export function mapsSearchUrl(name: unknown, address?: unknown): string | null {
  const restaurantName = usableText(name);
  if (!restaurantName) return null;

  const addr = usableText(address);
  const useAddress = addr && !ADDRESS_PLACEHOLDERS.has(addr.toLowerCase());

  const query = useAddress ? `${restaurantName}, ${addr}` : restaurantName;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Every destination this option can offer, best first.
 *
 * Platform links come back as `kind: 'order'`. When none survived, the single
 * Maps search comes back as `kind: 'locate'`. When there is not even a
 * restaurant name, this returns `[]` — and that is now the ONLY case that
 * deserves the eval harness's `no-usable-link` error, which previously fired
 * for every option whose platform links had merely been filtered.
 *
 * `source` names where the option came from so a caller can log it; the legacy
 * single-field shapes are plans written before `orderingLinks` existed.
 */
export function orderOptionsFor(meal: unknown): OrderOption[] {
  const m = (meal ?? {}) as Record<string, any>;
  const links = (m.orderingLinks ?? {}) as Record<string, unknown>;

  const platform: OrderOption[] = [];
  for (const { key, label } of ORDER_PLATFORMS) {
    const url = usableUrl(links[key]);
    if (url) platform.push({ key, label, url, kind: 'order' });
  }

  // The legacy single-field shapes, and ONLY when `orderingLinks` is absent
  // altogether — which is what a plan written before the field existed looks
  // like.
  //
  // Not when `orderingLinks` is present and empty. That shape means the links
  // were considered and filtered, and `website` is the very field the route
  // seeds `direct` from (see generate-restaurants, "Places already told us this
  // restaurant's website"). Reading it back after `verifyLinks` nulled `direct`
  // would reinstate the exact link verification rejected, and dress a
  // 302-to-homepage as an order button.
  if (platform.length === 0 && m.orderingLinks == null) {
    const legacy = usableUrl(m.orderingUrl) ?? usableUrl(m.website) ?? usableUrl(m.menu_url) ?? usableUrl(m.menuUrl);
    if (legacy) platform.push({ key: 'direct', label: 'Order', url: legacy, kind: 'order' });
  }

  if (platform.length > 0) return platform;

  const maps = mapsSearchUrl(m.restaurant ?? m.name, m.address);
  if (!maps) return [];
  return [{ key: 'maps', label: 'Find it', url: maps, kind: 'locate' }];
}

/** True when the only thing on offer is directions, not ordering. */
export function isLocateOnly(options: OrderOption[]): boolean {
  return options.length > 0 && options.every(o => o.kind === 'locate');
}

/**
 * How far down the list a restaurant belongs.
 *
 *   0 — orderable through GrubHub.
 *   1 — orderable, but only through the restaurant's own site.
 *   2 — nothing to order through: a menu and directions.
 *
 * The tiers exist because the card's usefulness varies so much. DoorDash and
 * Uber Eats are suppressed before probing — they 403 datacenter IPs, so their
 * links cannot be verified and are not shown — which leaves GrubHub as the one
 * platform that reliably survives into a working Order button. A restaurant is
 * selected on the strength of its menu, not its links, so a perfectly good
 * match can arrive with nothing but an address. Those are worth showing; they
 * are not worth showing first.
 */
export function orderabilityRank(meal: unknown): number {
  const options = orderOptionsFor(meal);
  if (options.some(o => o.kind === 'order' && o.key === 'grubhub')) return 0;
  if (options.some(o => o.kind === 'order')) return 1;
  return 2;
}

/**
 * Group restaurants by how you can actually order from them, best first.
 *
 * Stable within a tier: the incoming order carries meaning the ranking knows
 * nothing about — relevance, cuisine spread, which day a meal was matched to —
 * and reordering inside a tier would discard it for no gain. The explicit index
 * tiebreak says so rather than relying on the engine's sort being stable.
 */
export function sortByOrderability<T>(restaurants: readonly T[]): T[] {
  return restaurants
    .map((restaurant, index) => ({ restaurant, index, rank: orderabilityRank(restaurant) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ restaurant }) => restaurant);
}

/**
 * The one-line location shown under a restaurant name.
 *
 * The card rendered `{address}, {city}` unconditionally. Both halves were
 * wrong at once: nothing wrote `city` onto a joined meal, so every card in
 * production plan cmtayzto2 ended in a bare trailing comma — and now that the
 * join does carry `city`, appending it blindly would be worse, because Places
 * returns `formatted_address` with the city already in it. That reads
 * "3105 Shattuck Ave., Berkeley, CA 94705, USA, Berkeley".
 *
 * So: the address is the line whenever it already names the city, which for a
 * Places-sourced restaurant is always. `city` is a supplement for the case the
 * field exists to cover — a bare street address from a source that did not
 * spell out the rest.
 */
export function formatRestaurantLocation(
  address: unknown,
  city: unknown
): string {
  const a = typeof address === 'string' ? address.trim() : '';
  const c = typeof city === 'string' ? city.trim() : '';
  if (!a) return c;
  if (!c) return a;
  // Case-insensitive so "berkeley" from one source and "Berkeley" from another
  // are not treated as different places.
  return a.toLowerCase().includes(c.toLowerCase()) ? a : `${a}, ${c}`;
}
