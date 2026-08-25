export interface StoreTotal {
  store: string;
  total: number;
  itemCount: number;
  comparable: boolean;
}

interface PricedItemLike {
  item?: string;
  storeOptions: Array<{ store: string; price?: number | null }>;
}

export function canonicalStoreKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A store priced for less than this share of the priced items is not being
// compared, it is being sampled. Excluded from the ranking rather than allowed
// to win it on a short basket.
const MIN_COVERAGE = 0.6;

/**
 * Totals over the intersection of items every comparable store priced.
 *
 * Summing each store over whatever it happened to be priced for made the
 * cheapest-store recommendation a coverage ranking in disguise: a store priced
 * for 12 of 40 items totalled 12 items' worth and won.
 */
export function computeStoreTotals(items: PricedItemLike[]): {
  totals: StoreTotal[];
  comparableItemCount: number;
  skippedStores: string[];
} {
  if (items.length === 0) return { totals: [], comparableItemCount: 0, skippedStores: [] };

  // canonical key -> display name (first spelling wins) and the set of item
  // indexes that store priced.
  const displayName = new Map<string, string>();
  const pricedIndexes = new Map<string, Set<number>>();
  const priceAt = new Map<string, Map<number, number>>();

  items.forEach((item, index) => {
    item.storeOptions?.forEach(option => {
      const key = canonicalStoreKey(option.store);
      if (!key) return;
      // A null price means the store was not priced for this item, not that the
      // item is free. Counting it as 0 would put it in the intersection and
      // drag the store's total down, which is how it would win the comparison.
      if (typeof option.price !== 'number' || option.price <= 0) return;
      if (!displayName.has(key)) displayName.set(key, option.store);
      if (!pricedIndexes.has(key)) pricedIndexes.set(key, new Set());
      if (!priceAt.has(key)) priceAt.set(key, new Map());
      pricedIndexes.get(key)!.add(index);
      // A store listed twice for the same item keeps its first price rather
      // than double-counting it into the total.
      if (!priceAt.get(key)!.has(index)) {
        priceAt.get(key)!.set(index, option.price || 0);
      }
    });
  });

  const keys = [...pricedIndexes.keys()];
  if (keys.length === 0) return { totals: [], comparableItemCount: 0, skippedStores: [] };

  const maxCoverage = Math.max(...keys.map(k => pricedIndexes.get(k)!.size));

  const comparableKeys = keys.filter(
    k => pricedIndexes.get(k)!.size >= maxCoverage * MIN_COVERAGE
  );
  const skippedStores = keys
    .filter(k => !comparableKeys.includes(k))
    .map(k => displayName.get(k)!);

  // The intersection across comparable stores only.
  const intersection: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (comparableKeys.every(k => pricedIndexes.get(k)!.has(i))) intersection.push(i);
  }

  const totals: StoreTotal[] = keys.map(k => {
    const comparable = comparableKeys.includes(k);
    const indexes = comparable ? intersection : [...pricedIndexes.get(k)!];
    const total = indexes.reduce((sum, i) => sum + (priceAt.get(k)!.get(i) || 0), 0);
    return {
      store: displayName.get(k)!,
      total: Math.round(total * 100) / 100,
      itemCount: indexes.length,
      comparable,
    };
  });

  // Comparable stores first, then by price. A non-comparable store can never
  // be totals[0] and therefore can never be recommended.
  totals.sort((a, b) => {
    if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
    return a.total - b.total;
  });

  return { totals, comparableItemCount: intersection.length, skippedStores };
}

// Below this, chunking costs more in round trips than it saves.
const MIN_CHUNK = 15;
// Above this, one request carries too many items across too many stores and
// reconstructs the timeout the chunking was introduced to avoid. Past this
// point the list gets more chunks, not bigger ones — they queue past the
// concurrency limit, which is slower than three requests but finishes.
const MAX_CHUNK = 40;

export function planPriceChunks(
  itemCount: number,
  maxConcurrent = 3
): { chunkSize: number; chunkCount: number } {
  const even = Math.ceil(itemCount / maxConcurrent);
  const chunkSize = Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, even));
  return { chunkSize, chunkCount: Math.max(1, Math.ceil(itemCount / chunkSize)) };
}
