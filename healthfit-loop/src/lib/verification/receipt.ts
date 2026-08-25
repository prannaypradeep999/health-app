import { MenuSearchSchema } from '@/lib/ai/schemas/menu-search';

export interface SearchItem {
  name: string;
  price: number | null;
  description: string;
  statedCalories: number | null;
  sourceUrl: string | null;
}

export interface Receipt {
  items: SearchItem[];
  orderingLinks: Record<string, string | null>;
}

/**
 * Hop 1 (Perplexity Sonar) returns grammar-constrained MenuSearchSchema JSON,
 * and perplexity-client.ts hands it to hop 2 as a string without ever parsing
 * it. This recovers it.
 *
 * Returns null — not an empty Receipt — on anything unparseable. An empty menu
 * and an unreadable one lead to opposite conclusions: with an empty menu every
 * generated dish is fabricated, with an unreadable one we know nothing. Callers
 * must be able to tell those apart.
 */
export function parseReceipt(content: string): Receipt | null {
  if (!content || !content.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = MenuSearchSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    items: parsed.data.menuItems.map(i => ({
      name: i.name,
      price: i.price,
      description: i.description,
      statedCalories: i.statedCalories,
      sourceUrl: i.sourceUrl,
    })),
    orderingLinks: parsed.data.orderingLinks as Record<string, string | null>,
  };
}

/** Hosts Sonar actually retrieved from. Evidence for link corroboration. */
export function sourceHostsFrom(receipt: Receipt | null, citationUrls: string[]): string[] {
  const hosts = new Set<string>();
  const add = (u: string | null) => {
    if (!u) return;
    try { hosts.add(new URL(u).hostname.toLowerCase().replace(/^www\./, '')); } catch { /* not a URL */ }
  };
  citationUrls.forEach(add);
  receipt?.items.forEach(i => add(i.sourceUrl));
  Object.values(receipt?.orderingLinks ?? {}).forEach(add);
  return [...hosts];
}
