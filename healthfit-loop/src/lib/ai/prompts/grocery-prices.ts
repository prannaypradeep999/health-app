/**
 * The grocery price query, extracted from fetchPriceChunk so the bench harness
 * can build it without a network call or a private-method escape hatch.
 *
 * Pure: same arguments in, same string out. fetchPriceChunk calls this instead
 * of inlining the literal.
 *
 * It lives here rather than in perplexity-client.ts because that module
 * constructs a PerplexityClient at import time and the constructor throws when
 * PERPLEXITY_API_KEY is unset — importing the builder from there makes the bench
 * harness's keyless `--dry` mode crash for every site, not just this one.
 */
export function createGroceryPricePrompt(args: {
  items: Array<{ name: string; quantity: string; uses: string; category: string }>;
  storeNames: string;
  city: string;
  userGoal: string;
}): string {
  const { items, storeNames, city, userGoal } = args;
  const itemList = items.map(i => `- ${i.name} (${i.quantity})`).join('\n');
  return `Search the web for what these products actually cost right now at ${storeNames} in ${city}:

${itemList}

Search each store's own listings before answering. These are real chains with published prices and named house brands; prefer what you can find over what you can assume.

For each item at each store:
1. displayName: The product as that store actually sells it, using the store's own house brand where that is what a shopper would find on the shelf — "365 Organic Whole Milk" at Whole Foods, "Trader Joe's Organic Bananas" at Trader Joe's. A shopper should be able to read this name and recognise the product in the aisle. Do not flatten every option to the same generic word; if two stores sell it under different names, say so.
2. price: What the item costs at THAT store for the quantity listed. Prices for the same item must differ between stores unless they genuinely match — identical prices across three stores is a sign you estimated instead of checking. Give a number whenever you can name one at all, including when you are inferring it — an inferred price marked "estimate" is useful; the uncertainty belongs in priceConfidence, not in a missing number. Reserve null for the case where you cannot even put a plausible figure on it. Never use 0: a zero is shown to the user as free and makes this store look like the cheapest one.
3. priceConfidence: "exact" ONLY when you found this store's actual current listing for this product. "estimate" when you are inferring from typical ${city} pricing. Be strict about this distinction — it is shown to the user, and marking a guess as exact is worse than admitting the guess. Note that "estimate" is a normal, expected answer, not a failure: most items will be estimates.
4. isRecommended: Mark exactly ONE option per item as recommended, the best value for a "${userGoal}" goal.
5. reason: Brief reason for the recommended one (e.g. "Best value", "Best quality"). Use null for the others.

User's health goal: ${userGoal}
Prioritize: quality ingredients that support that goal, balanced against good value.

Price every item listed above. Do not add items, and do not compute any totals — only the per-store options for each item.

Return as JSON only:
{
  "items": [
    {
      "item": "Chicken Breast",
      "quantity": "2 lbs",
      "uses": "Grilled chicken salad",
      "category": "proteins",
      "storeOptions": [
        {
          "store": "Store1",
          "displayName": "365 Organic Boneless Skinless Chicken Breast",
          "price": 7.49,
          "priceConfidence": "exact",
          "isRecommended": true,
          "reason": "Best value"
        },
        {
          "store": "Store2",
          "displayName": "Trader Joe's Air Chilled Chicken Breast",
          "price": 8.99,
          "priceConfidence": "estimate",
          "isRecommended": false,
          "reason": null
        }
      ]
    }
  ]
}`;
}
