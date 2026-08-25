# Generation Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare what generation shows the user against the grounded sources the pipeline already fetched, so fabricated dishes, drifted prices, uncited links, missing groceries and survey-violating workouts become visible.

**Architecture:** A new `src/lib/verification/` directory of pure `(claim, evidence) => Verdict[]` functions. Routes call one verifier at the end of generation, inside a single try/catch, and persist the verdicts as a `verification` sidecar in `userContext` — never mutating model-authored objects. Every check reads a three-state env flag and ships in `shadow`, so user-visible output is byte-identical until a check is promoted.

**Tech Stack:** TypeScript, Zod, Node's built-in test runner via `npx tsx --test`, Next.js App Router API routes, Prisma.

**Spec:** `docs/superpowers/specs/2026-08-25-generation-grounding-design.md`

## Global Constraints

- **Zero added request-path latency.** No check may make a network call during generation. Everything compares data already in memory.
- **Fail-open.** The verifier is wrapped in one try/catch. On throw, verdicts are `unchecked` and the request proceeds unchanged.
- **Shadow by default.** Every flag defaults to `shadow`. No task in this plan changes user-visible output.
- **Sidecar only.** Verdicts go in a `verification` key on `userContext`. No task adds a field to `RestaurantMealObject`, `MenuExtractionSchema`, or any other generated shape.
- **`unverified` ≠ `unchecked`.** Never collapse them. `unverified` means no evidence existed; `unchecked` means the verifier did not run.
- **Never upgrade to `verified` on ambiguity.** Ambiguous comparisons resolve to `unverified`.
- Tests live next to the module they cover. Run with `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"`, globs quoted for zsh.
- `npx tsc --noEmit` baseline is **29 errors**. Do not add to it; do not fix the pre-existing ones.
- Commit after each task.

---

### Task 1: Verification core — types and flags

**Files:**
- Create: `src/lib/verification/types.ts`
- Create: `src/lib/verification/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `VerdictStatus`, `Verdict`, `VerificationReport`, `verdict()`, `CheckMode`, `checkMode()`, `summarize()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verification/types.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { verdict, checkMode, summarize } from './types';

test('verdict builds a complete record', () => {
  const v = verdict('R2-price-matches', 'monday.lunch.primary.price', 'contradicted', '18.95', 'menu listed 16.50', 'https://x.test/menu');
  assert.equal(v.check, 'R2-price-matches');
  assert.equal(v.status, 'contradicted');
  assert.equal(v.source, 'https://x.test/menu');
});

test('source defaults to null rather than undefined', () => {
  assert.strictEqual(verdict('c', 'w', 'unverified', 'a', 'b').source, null);
});

test('checkMode defaults to shadow when the env var is unset', () => {
  delete process.env.VERIFY_R2;
  assert.equal(checkMode('R2'), 'shadow');
});

test('checkMode reads off and enforce, and ignores nonsense', () => {
  process.env.VERIFY_R2 = 'off';
  assert.equal(checkMode('R2'), 'off');
  process.env.VERIFY_R2 = 'enforce';
  assert.equal(checkMode('R2'), 'enforce');
  process.env.VERIFY_R2 = 'banana';
  assert.equal(checkMode('R2'), 'shadow');
  delete process.env.VERIFY_R2;
});

test('summarize counts by status and never reports contradicted as clean', () => {
  const s = summarize([
    verdict('a', 'w', 'verified', '1', '1'),
    verdict('b', 'w', 'contradicted', '2', '3'),
    verdict('c', 'w', 'unverified', '4', ''),
  ]);
  assert.equal(s.verified, 1);
  assert.equal(s.contradicted, 1);
  assert.equal(s.unverified, 1);
  assert.equal(s.unchecked, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test "src/lib/verification/types.test.ts"`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/verification/types.ts

/**
 * Four states, not two. `unverified` means we had no evidence either way —
 * the honest state for a macro estimate no upstream source supplied.
 * `unchecked` means the verifier itself did not run. Collapsing them would let
 * a crash read as a clean bill of health.
 */
export type VerdictStatus = 'verified' | 'unverified' | 'contradicted' | 'unchecked';

export interface Verdict {
  /** Stable id, e.g. 'R2-price-matches'. Diffable across runs. */
  check: string;
  /** Path into the payload, e.g. 'monday.lunch.primary.price'. */
  target: string;
  status: VerdictStatus;
  /** What the generated payload said. */
  claim: string;
  /** What the evidence said, or why there was none. */
  evidence: string;
  /** The URL that grounds the evidence, when one exists. */
  source: string | null;
}

export function verdict(
  check: string,
  target: string,
  status: VerdictStatus,
  claim: string,
  evidence: string,
  source: string | null = null
): Verdict {
  return { check, target, status, claim, evidence, source };
}

export type CheckMode = 'off' | 'shadow' | 'enforce';

/**
 * Three states so a check can be built, observed and only then trusted.
 * `shadow` is the default and the shipping state: verdicts are computed and
 * persisted but change nothing the user sees. An unrecognised value is treated
 * as `shadow` — a typo in an env var must not silently disable a check, nor
 * silently promote one to changing output.
 */
export function checkMode(id: string): CheckMode {
  const raw = process.env[`VERIFY_${id}`];
  return raw === 'off' || raw === 'enforce' ? raw : 'shadow';
}

export interface VerificationReport {
  verdicts: Verdict[];
  counts: Record<VerdictStatus, number>;
  /** ISO timestamp, so a stored report can be aged out. */
  ranAt: string;
}

export function summarize(verdicts: Verdict[]): Record<VerdictStatus, number> {
  const counts: Record<VerdictStatus, number> = {
    verified: 0, unverified: 0, contradicted: 0, unchecked: 0,
  };
  for (const v of verdicts) counts[v.status]++;
  return counts;
}

export function report(verdicts: Verdict[]): VerificationReport {
  return { verdicts, counts: summarize(verdicts), ranAt: new Date().toISOString() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test "src/lib/verification/types.test.ts"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/verification/types.ts src/lib/verification/types.test.ts
git commit -m "feat(verification): verdict vocabulary and three-state check flags"
```

---

### Task 2: Keep the hop-1 receipt

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` — `PerplexityMenuResponse` interface (grep `linkCorroboration?:`), and `extractMenuData`'s return (grep `const structuredData = await this.processWithGPT4`)
- Create: `src/lib/verification/receipt.ts`
- Create: `src/lib/verification/receipt.test.ts`

**Interfaces:**
- Consumes: `MenuSearchSchema` from `@/lib/ai/schemas/menu-search`.
- Produces: `parseReceipt(content: string): Receipt | null`, `Receipt { items: SearchItem[]; orderingLinks: Record<string,string|null> }`, `SearchItem { name; price: number|null; description; statedCalories: number|null; sourceUrl: string|null }`. `PerplexityMenuResponse` gains `searchItems?: SearchItem[]` and `sourceHosts?: string[]`.

This is the highest-value change in the plan. Hop 1 returns grammar-constrained
`MenuSearchSchema` JSON and the code passes it to hop 2 **as a string**, never
parsing it. Everything downstream in this plan compares against what this task
recovers.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verification/receipt.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { parseReceipt } from './receipt';

const valid = JSON.stringify({
  menuItems: [
    { name: 'Chicken Shawarma Plate', price: 16.5, description: 'grilled', statedCalories: 720, sourceUrl: 'https://x.test/m' },
    { name: 'Falafel Wrap', price: null, description: 'fried', statedCalories: null, sourceUrl: null },
  ],
  orderingLinks: { doordash: 'https://doordash.com/store/1', ubereats: null, grubhub: null, direct: null },
});

test('parses a well-formed hop-1 payload', () => {
  const r = parseReceipt(valid);
  assert.equal(r?.items.length, 2);
  assert.equal(r?.items[0].price, 16.5);
});

test('preserves null rather than coercing it to zero', () => {
  const r = parseReceipt(valid);
  assert.strictEqual(r?.items[1].price, null);
  assert.strictEqual(r?.items[1].statedCalories, null);
});

test('returns null for prose, so a caller cannot mistake it for an empty menu', () => {
  assert.strictEqual(parseReceipt('The menu features several dishes.'), null);
});

test('returns null for JSON of the wrong shape', () => {
  assert.strictEqual(parseReceipt('{"foo":1}'), null);
});

test('returns null for empty input', () => {
  assert.strictEqual(parseReceipt(''), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test "src/lib/verification/receipt.test.ts"`
Expected: FAIL — cannot find module `./receipt`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/verification/receipt.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test "src/lib/verification/receipt.test.ts"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Thread the receipt through `extractMenuData`**

In `src/lib/external/perplexity-client.ts`, add to the `PerplexityMenuResponse`
interface, next to the existing `linkCorroboration?:` line:

```ts
  /** Hop 1's own answer, kept so downstream can check hop 2 and hop 3 against it. */
  searchItems?: SearchItem[];
  /** Hosts hop 1 actually retrieved from. */
  sourceHosts?: string[];
```

Add the import at the top of the file:

```ts
import { parseReceipt, sourceHostsFrom, type SearchItem } from '@/lib/verification/receipt';
```

Then, immediately after the line `const citations = data.citations || [];`, add:

```ts
      // Hop 1 is the only hop that looked at the internet. Its answer used to be
      // handed to hop 2 as a string and dropped. Parsing it here is what makes
      // every downstream grounding check possible.
      const receipt = parseReceipt(content);
      if (!receipt) {
        console.warn(`[PERPLEXITY] ⚠️ Hop-1 payload did not parse as MenuSearchSchema; grounding checks will report unchecked`);
      }
```

Finally, in the object `extractMenuData` returns (the one with
`linkCorroboration: corroboration`), add two keys:

```ts
        searchItems: receipt?.items,
        sourceHosts: receipt ? sourceHostsFrom(receipt, citationUrls) : undefined,
```

Leave `processWithGPT4(content, ...)` exactly as it is. This step is purely
additive: nothing that exists changes behaviour.

- [ ] **Step 6: Verify the whole suite and the type checker**

Run: `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"`
Expected: all pass, 5 more than before.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `29`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/verification/receipt.ts src/lib/verification/receipt.test.ts src/lib/external/perplexity-client.ts
git commit -m "feat(verification): parse the hop-1 menu payload instead of discarding it"
```

---

### Task 3: Restaurant checks — dish, price, calories, identity

**Files:**
- Create: `src/lib/verification/restaurants.ts`
- Create: `src/lib/verification/restaurants.test.ts`

**Interfaces:**
- Consumes: `Verdict`, `verdict` from `./types`; `SearchItem` from `./receipt`; `RestaurantFacts` from `@/lib/utils/restaurant-facts`.
- Produces: `normalizeDishName(s: string): string`, `matchDish(dish: string, items: SearchItem[]): SearchItem | null`, `verifyRestaurantMeal(target: string, meal: MealClaim, items: SearchItem[] | undefined, facts: RestaurantFacts | undefined): Verdict[]`, `MealClaim { restaurant; dish; price; estimatedCalories; address }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verification/restaurants.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeDishName, matchDish, verifyRestaurantMeal } from './restaurants';
import type { SearchItem } from './receipt';

const items: SearchItem[] = [
  { name: 'Grilled Chicken Shawarma Plate', price: 16.5, description: '', statedCalories: 720, sourceUrl: 'https://x.test/m' },
  { name: 'Falafel Wrap', price: null, description: '', statedCalories: null, sourceUrl: null },
];

const at = (over: Partial<any> = {}) => ({
  restaurant: 'Fanoos', dish: 'Chicken Shawarma', price: 16.5,
  estimatedCalories: 720, address: '123 Main St', ...over,
});

test('normalizeDishName strips case, punctuation and articles', () => {
  assert.equal(normalizeDishName('The Grilled  Chicken-Shawarma Plate!'), 'grilled chicken shawarma plate');
});

test('matchDish accepts a shortened name', () => {
  assert.equal(matchDish('Chicken Shawarma', items)?.name, 'Grilled Chicken Shawarma Plate');
});

test('matchDish rejects an invented dish', () => {
  assert.strictEqual(matchDish('Lobster Thermidor', items), null);
});

test('R1 contradicts a dish the menu never listed', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at({ dish: 'Lobster Thermidor' }), items, undefined);
  const r1 = vs.find(v => v.check === 'R1-dish-exists');
  assert.equal(r1?.status, 'contradicted');
});

test('R2 verifies a price that matches the published one', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at(), items, undefined);
  assert.equal(vs.find(v => v.check === 'R2-price-matches')?.status, 'verified');
});

test('R2 contradicts a drifted price and carries the real one as evidence', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at({ price: 18.95 }), items, undefined);
  const r2 = vs.find(v => v.check === 'R2-price-matches');
  assert.equal(r2?.status, 'contradicted');
  assert.match(r2!.evidence, /16\.5/);
});

test('R2 is unverified, not verified, when the menu published no price', () => {
  const vs = verifyRestaurantMeal('mon.lunch.primary', at({ dish: 'Falafel Wrap', price: 12 }), items, undefined);
  assert.equal(vs.find(v => v.check === 'R2-price-matches')?.status, 'unverified');
});

test('R3 tolerates calories within 15% and contradicts beyond it', () => {
  const near = verifyRestaurantMeal('w', at({ estimatedCalories: 790 }), items, undefined);
  assert.equal(near.find(v => v.check === 'R3-calories-match')?.status, 'verified');
  const far = verifyRestaurantMeal('w', at({ estimatedCalories: 1200 }), items, undefined);
  assert.equal(far.find(v => v.check === 'R3-calories-match')?.status, 'contradicted');
});

test('R4 always reports macros unverified', () => {
  const vs = verifyRestaurantMeal('w', at(), items, undefined);
  assert.equal(vs.find(v => v.check === 'R4-macros-estimated')?.status, 'unverified');
});

test('R7 contradicts an address that disagrees with Places', () => {
  const vs = verifyRestaurantMeal('w', at(), items, { rating: 4.6, userRatingsTotal: 10, distanceMiles: 0.8, address: '999 Other Ave' });
  assert.equal(vs.find(v => v.check === 'R7-restaurant-identity')?.status, 'contradicted');
});

test('everything is unchecked when hop 1 did not parse', () => {
  const vs = verifyRestaurantMeal('w', at(), undefined, undefined);
  assert.ok(vs.length > 0);
  assert.ok(vs.filter(v => v.check.startsWith('R1') || v.check.startsWith('R2') || v.check.startsWith('R3'))
    .every(v => v.status === 'unchecked'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test "src/lib/verification/restaurants.test.ts"`
Expected: FAIL — cannot find module `./restaurants`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/verification/restaurants.ts
import { verdict, type Verdict } from './types';
import type { SearchItem } from './receipt';
import type { RestaurantFacts } from '@/lib/utils/restaurant-facts';

export interface MealClaim {
  restaurant: string;
  dish: string;
  price: number;
  estimatedCalories: number;
  address: string;
}

const ARTICLES = /\b(the|a|an|with|and|of)\b/g;

export function normalizeDishName(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(ARTICLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Containment, not equality and not token-overlap scoring.
 *
 * Hops 2 and 3 shorten names — "Grilled Chicken Shawarma Plate" becomes
 * "Chicken Shawarma" — so equality would flag honest rewording as fabrication.
 * Overlap scoring would need a threshold nobody can defend. Containment in
 * either direction is the narrowest rule that tolerates shortening while still
 * catching a dish the menu never listed.
 */
export function matchDish(dish: string, items: SearchItem[]): SearchItem | null {
  const d = normalizeDishName(dish);
  if (!d) return null;
  for (const item of items) {
    const n = normalizeDishName(item.name);
    if (!n) continue;
    if (n === d || n.includes(d) || d.includes(n)) return item;
  }
  return null;
}

/** Published calories and a model's estimate of them are not expected to agree exactly. */
const CALORIE_TOLERANCE = 0.15;
/** Prices are printed on a menu. A cent of drift is a different price. */
const PRICE_TOLERANCE = 0.01;

export function verifyRestaurantMeal(
  target: string,
  meal: MealClaim,
  items: SearchItem[] | undefined,
  facts: RestaurantFacts | undefined
): Verdict[] {
  const out: Verdict[] = [];

  // R4 is not a check. It is a standing admission: no upstream source — not
  // Sonar, not Places — supplies per-dish protein, carbs or fat, so every one
  // of those numbers is a model estimate. It exists so the UI has something to
  // hang an "est." label on.
  out.push(verdict(
    'R4-macros-estimated', `${target}.macros`, 'unverified',
    'protein/carbs/fat', 'no upstream source publishes per-dish macros'
  ));

  if (!items) {
    for (const check of ['R1-dish-exists', 'R2-price-matches', 'R3-calories-match']) {
      out.push(verdict(check, target, 'unchecked', String(meal.dish), 'hop-1 menu payload unavailable'));
    }
  } else {
    const match = matchDish(meal.dish, items);
    if (!match) {
      out.push(verdict(
        'R1-dish-exists', `${target}.dish`, 'contradicted', meal.dish,
        `not among the ${items.length} items the menu search returned`
      ));
      // Price and calories cannot be checked against an item we could not find.
      out.push(verdict('R2-price-matches', `${target}.price`, 'unchecked', String(meal.price), 'no matching menu item'));
      out.push(verdict('R3-calories-match', `${target}.estimatedCalories`, 'unchecked', String(meal.estimatedCalories), 'no matching menu item'));
    } else {
      out.push(verdict('R1-dish-exists', `${target}.dish`, 'verified', meal.dish, `menu listed "${match.name}"`, match.sourceUrl));

      if (match.price === null) {
        // MenuSearchSchema: "Null when the menu did not publish it." The price
        // shown is therefore an estimate, and saying so is the honest verdict.
        out.push(verdict('R2-price-matches', `${target}.price`, 'unverified', String(meal.price), 'the menu did not publish a price', match.sourceUrl));
      } else if (Math.abs(match.price - meal.price) <= PRICE_TOLERANCE) {
        out.push(verdict('R2-price-matches', `${target}.price`, 'verified', String(meal.price), `menu listed ${match.price}`, match.sourceUrl));
      } else {
        out.push(verdict('R2-price-matches', `${target}.price`, 'contradicted', String(meal.price), `menu listed ${match.price}`, match.sourceUrl));
      }

      if (match.statedCalories === null) {
        out.push(verdict('R3-calories-match', `${target}.estimatedCalories`, 'unverified', String(meal.estimatedCalories), 'the menu did not publish calories', match.sourceUrl));
      } else {
        const drift = Math.abs(match.statedCalories - meal.estimatedCalories) / match.statedCalories;
        out.push(verdict(
          'R3-calories-match', `${target}.estimatedCalories`,
          drift <= CALORIE_TOLERANCE ? 'verified' : 'contradicted',
          String(meal.estimatedCalories), `menu stated ${match.statedCalories}`, match.sourceUrl
        ));
      }
    }
  }

  // Places holds the address. A model asked for a fact we already have turns a
  // correct value into a wrong one — the same failure grocery.ts documents for
  // store addresses.
  if (!facts || !facts.address) {
    out.push(verdict('R7-restaurant-identity', `${target}.address`, 'unchecked', meal.address, 'no Places record for this restaurant'));
  } else {
    const same = normalizeDishName(facts.address) === normalizeDishName(meal.address);
    out.push(verdict(
      'R7-restaurant-identity', `${target}.address`,
      same ? 'verified' : 'contradicted',
      meal.address, `Places has "${facts.address}"`
    ));
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test "src/lib/verification/restaurants.test.ts"`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/verification/restaurants.ts src/lib/verification/restaurants.test.ts
git commit -m "feat(verification): check dish, price, calories and address against the menu search"
```

---

### Task 4: Link corroboration (R5)

**Files:**
- Create: `src/lib/verification/links.ts`
- Create: `src/lib/verification/links.test.ts`

**Interfaces:**
- Consumes: `verdict`, `Verdict` from `./types`; `parseHttpUrl`, `isUsableLink` from `@/lib/external/link-check`.
- Produces: `verifyOrderingLinks(target: string, links: Record<string, unknown>, sourceHosts: string[] | undefined): Verdict[]`.

`corroborate()` already exists in `link-check.ts`, is called once at
`perplexity-client.ts`, is returned as `linkCorroboration`, and has zero
consumers — `grep -rn "linkCorroboration" src/ scripts/` finds only its own type
declaration and its own assignment. This task applies the same idea per meal
rather than per restaurant, and actually records the result.

This is the check that catches a *plausible invented* URL. Host filtering
(`hostMatchesPlatform`) passes it because the host is right; probing
(`verifyLinks`) passes it when the host serves a soft 200. Only asking "did the
search actually retrieve this host?" catches it.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verification/links.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { verifyOrderingLinks } from './links';

const hosts = ['grubhub.com', 'fanoossf.com'];

test('a link on a retrieved host is corroborated', () => {
  const vs = verifyOrderingLinks('w', { grubhub: 'https://www.grubhub.com/restaurant/fanoos/123' }, hosts);
  assert.equal(vs[0].status, 'verified');
});

test('a plausible link on a host the search never touched is contradicted', () => {
  const vs = verifyOrderingLinks('w', { doordash: 'https://www.doordash.com/store/fanoos-999999/' }, hosts);
  assert.equal(vs[0].status, 'contradicted');
  assert.match(vs[0].evidence, /not among/);
});

test('null and empty links produce no verdict at all', () => {
  const vs = verifyOrderingLinks('w', { doordash: null, ubereats: '', grubhub: '   ' }, hosts);
  assert.equal(vs.length, 0);
});

test('the string "null" produces no verdict', () => {
  assert.equal(verifyOrderingLinks('w', { grubhub: 'null' }, hosts).length, 0);
});

test('a malformed URL is contradicted rather than silently skipped', () => {
  const vs = verifyOrderingLinks('w', { grubhub: 'not a url' }, hosts);
  assert.equal(vs[0].status, 'contradicted');
});

test('without source hosts every link is unchecked, never verified', () => {
  const vs = verifyOrderingLinks('w', { grubhub: 'https://www.grubhub.com/x' }, undefined);
  assert.equal(vs[0].status, 'unchecked');
});

test('www. and case are ignored when comparing hosts', () => {
  const vs = verifyOrderingLinks('w', { direct: 'https://WWW.Fanoossf.com/menu' }, hosts);
  assert.equal(vs[0].status, 'verified');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test "src/lib/verification/links.test.ts"`
Expected: FAIL — cannot find module `./links`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/verification/links.ts
import { verdict, type Verdict } from './types';
import { parseHttpUrl, isUsableLink } from '@/lib/external/link-check';

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

/**
 * R5: did the search that produced this restaurant actually retrieve this host?
 *
 * Host filtering asks "is this a grubhub URL", and a fabricated one is. Probing
 * asks "does it resolve", and platform 404s frequently render as a soft 200.
 * This asks the only question that separates a real link from an invented one
 * that happens to look right.
 */
export function verifyOrderingLinks(
  target: string,
  links: Record<string, unknown>,
  sourceHosts: string[] | undefined
): Verdict[] {
  const out: Verdict[] = [];
  const known = sourceHosts ? new Set(sourceHosts.map(bareHost)) : null;

  for (const [platform, raw] of Object.entries(links ?? {})) {
    // isUsableLink rejects null, '', whitespace and the literal string "null" —
    // the last of which is truthy and once reached the UI as an enabled
    // "Order Now" button pointing nowhere.
    if (!isUsableLink(raw)) continue;

    const where = `${target}.orderingLinks.${platform}`;
    if (!known) {
      out.push(verdict('R5-link-corroborated', where, 'unchecked', raw, 'no search sources available'));
      continue;
    }

    const url = parseHttpUrl(raw);
    if (!url) {
      out.push(verdict('R5-link-corroborated', where, 'contradicted', raw, 'not a parseable http(s) URL'));
      continue;
    }

    const host = bareHost(url.hostname);
    out.push(known.has(host)
      ? verdict('R5-link-corroborated', where, 'verified', raw, `${host} was among the search sources`)
      : verdict('R5-link-corroborated', where, 'contradicted', raw, `${host} is not among the ${known.size} hosts the search retrieved`));
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test "src/lib/verification/links.test.ts"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/verification/links.ts src/lib/verification/links.test.ts
git commit -m "feat(verification): corroborate ordering links against the hosts search retrieved"
```

---

### Task 5: Grocery coverage (G1, G2)

**Files:**
- Create: `src/lib/verification/groceries.ts`
- Create: `src/lib/verification/groceries.test.ts`

**Interfaces:**
- Consumes: `verdict`, `Verdict` from `./types`; `extractIngredientName`, `normalizeGroceryKey` from `@/lib/utils/grocery-list`.
- Produces: `verifyGroceryCoverage(recipeIngredients: string[], groceryItemNames: string[]): Verdict[]`, `PANTRY_STAPLES: Set<string>`.

G1 is the check most likely to catch the original complaint. "The generation
doesn't always give me the full answer" describes a grocery list missing
ingredients far better than it describes a wrong macro — and it is verifiable
for free against data already in memory.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verification/groceries.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { verifyGroceryCoverage } from './groceries';

test('G1 contradicts an ingredient missing from the list', () => {
  const vs = verifyGroceryCoverage(['2 lb chicken thighs', '1 cup quinoa'], ['Quinoa']);
  const g1 = vs.filter(v => v.check === 'G1-ingredient-covered');
  assert.equal(g1.find(v => v.claim.includes('chicken'))?.status, 'contradicted');
  assert.equal(g1.find(v => v.claim.includes('quinoa'))?.status, 'verified');
});

test('G1 exempts pantry staples', () => {
  const vs = verifyGroceryCoverage(['1 tsp salt', '2 tbsp olive oil'], []);
  assert.ok(vs.filter(v => v.check === 'G1-ingredient-covered').every(v => v.status === 'unverified'));
});

test('G1 matches despite quantities and units', () => {
  const vs = verifyGroceryCoverage(['1.5 lbs boneless chicken breast'], ['Boneless Chicken Breast']);
  assert.equal(vs.find(v => v.check === 'G1-ingredient-covered')?.status, 'verified');
});

test('G2 flags a grocery item no recipe asked for', () => {
  const vs = verifyGroceryCoverage(['1 cup quinoa'], ['Quinoa', 'Caviar']);
  const g2 = vs.filter(v => v.check === 'G2-item-traced');
  assert.equal(g2.find(v => v.claim === 'Caviar')?.status, 'contradicted');
});

test('an empty grocery list against a real plan contradicts every ingredient', () => {
  const vs = verifyGroceryCoverage(['2 lb chicken thighs'], []);
  assert.equal(vs.find(v => v.check === 'G1-ingredient-covered')?.status, 'contradicted');
});

test('an empty plan yields unchecked rather than a clean sweep', () => {
  const vs = verifyGroceryCoverage([], ['Quinoa']);
  assert.ok(vs.every(v => v.status === 'unchecked'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test "src/lib/verification/groceries.test.ts"`
Expected: FAIL — cannot find module `./groceries`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/verification/groceries.ts
import { verdict, type Verdict } from './types';
import { extractIngredientName, normalizeGroceryKey } from '@/lib/utils/grocery-list';

/**
 * Things a recipe names but a shopping list is not wrong to omit. Flagging
 * these buries the real misses — a plan of seven dinners mentions salt and
 * pepper twenty times.
 */
export const PANTRY_STAPLES = new Set([
  'salt', 'pepper', 'black pepper', 'water', 'olive oil', 'oil', 'vegetable oil',
  'cooking spray', 'sugar', 'flour', 'baking powder', 'baking soda', 'vinegar',
  'garlic powder', 'onion powder', 'paprika', 'cumin', 'oregano', 'basil',
  'thyme', 'cinnamon', 'chili powder', 'red pepper flakes', 'bay leaf',
  'soy sauce', 'honey', 'butter', 'ice',
]);

const key = (raw: string) => normalizeGroceryKey(extractIngredientName(raw));

export function verifyGroceryCoverage(
  recipeIngredients: string[],
  groceryItemNames: string[]
): Verdict[] {
  const out: Verdict[] = [];

  if (recipeIngredients.length === 0) {
    out.push(verdict('G1-ingredient-covered', 'groceries', 'unchecked', '', 'no recipe ingredients to check against'));
    out.push(verdict('G2-item-traced', 'groceries', 'unchecked', '', 'no recipe ingredients to check against'));
    return out;
  }

  const listed = new Set(groceryItemNames.map(key).filter(Boolean));

  // G1: every ingredient the recipes call for should be buyable from the list.
  const seen = new Set<string>();
  for (const raw of recipeIngredients) {
    const k = key(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);

    if (PANTRY_STAPLES.has(k)) {
      out.push(verdict('G1-ingredient-covered', `groceries.${k}`, 'unverified', raw, 'pantry staple; omission is not an error'));
      continue;
    }
    // Containment in either direction: the list says "Chicken Breast" where the
    // recipe said "boneless chicken breast", and both are the same purchase.
    const covered = listed.has(k) || [...listed].some(l => l.includes(k) || k.includes(l));
    out.push(covered
      ? verdict('G1-ingredient-covered', `groceries.${k}`, 'verified', raw, 'present in the grocery list')
      : verdict('G1-ingredient-covered', `groceries.${k}`, 'contradicted', raw, 'no grocery item covers this ingredient'));
  }

  // G2: the reverse. An item traceable to no recipe is either an invented
  // purchase or a sign the list was built from a different plan.
  for (const name of groceryItemNames) {
    const k = key(name);
    if (!k) continue;
    const traced = seen.has(k) || [...seen].some(s => s.includes(k) || k.includes(s));
    if (!traced) {
      out.push(verdict('G2-item-traced', `groceries.${k}`, 'contradicted', name, 'no recipe in the plan uses this item'));
    }
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test "src/lib/verification/groceries.test.ts"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/verification/groceries.ts src/lib/verification/groceries.test.ts
git commit -m "feat(verification): check the grocery list covers the plan it was built from"
```

---

### Task 6: Workout survey adherence (W1–W3)

**Files:**
- Create: `src/lib/verification/workouts.ts`
- Create: `src/lib/verification/workouts.test.ts`

**Interfaces:**
- Consumes: `verdict`, `Verdict` from `./types`.
- Produces: `EQUIPMENT_PATTERNS: Record<string, RegExp>`, `INJURY_CONTRAINDICATIONS: Record<string, RegExp>`, `verifyWorkoutPlan(days: WorkoutDayClaim[], survey: WorkoutSurvey): Verdict[]`, `WorkoutDayClaim { day; restDay; exercises: Array<{name: string}> | null }`, `WorkoutSurvey { equipmentAccess: string[]; injuryConsiderations: string[]; availableDays: string[] }`.

All Tier A — the evidence is the survey, which the route is already holding.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verification/workouts.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { verifyWorkoutPlan } from './workouts';

const survey = { equipmentAccess: ['dumbbells'], injuryConsiderations: ['knee'], availableDays: ['Monday', 'Wednesday', 'Friday'] };
const day = (over: any = {}) => ({ day: 'Monday', restDay: false, exercises: [{ name: 'Dumbbell Press' }], ...over });

test('W1 contradicts an exercise needing equipment the user does not have', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Barbell Back Squat' }] })], survey);
  const w1 = vs.find(v => v.check === 'W1-equipment-available');
  assert.equal(w1?.status, 'contradicted');
  assert.match(w1!.evidence, /barbell/i);
});

test('W1 passes bodyweight movements with no equipment at all', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Push-Up' }] })], { ...survey, equipmentAccess: [] });
  assert.notEqual(vs.find(v => v.check === 'W1-equipment-available')?.status, 'contradicted');
});

test('W2 contradicts a movement contraindicated by a reported injury', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Jump Squat' }] })], survey);
  assert.equal(vs.find(v => v.check === 'W2-injury-safe')?.status, 'contradicted');
});

test('W2 is unchecked when no injuries were reported', () => {
  const vs = verifyWorkoutPlan([day({ exercises: [{ name: 'Jump Squat' }] })], { ...survey, injuryConsiderations: [] });
  assert.equal(vs.find(v => v.check === 'W2-injury-safe')?.status, 'unchecked');
});

test('W3 contradicts a training day the user said they are unavailable', () => {
  const vs = verifyWorkoutPlan([day({ day: 'Tuesday' })], survey);
  assert.equal(vs.find(v => v.check === 'W3-day-available')?.status, 'contradicted');
});

test('W3 does not flag a rest day on an unavailable day', () => {
  const vs = verifyWorkoutPlan([day({ day: 'Tuesday', restDay: true, exercises: null })], survey);
  assert.notEqual(vs.find(v => v.check === 'W3-day-available')?.status, 'contradicted');
});

test('an empty availableDays list yields unchecked, not a clean sweep', () => {
  const vs = verifyWorkoutPlan([day({ day: 'Tuesday' })], { ...survey, availableDays: [] });
  assert.equal(vs.find(v => v.check === 'W3-day-available')?.status, 'unchecked');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test "src/lib/verification/workouts.test.ts"`
Expected: FAIL — cannot find module `./workouts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/verification/workouts.ts
import { verdict, type Verdict } from './types';

export interface WorkoutDayClaim {
  day: string;
  restDay: boolean;
  exercises: Array<{ name: string }> | null;
}

export interface WorkoutSurvey {
  equipmentAccess: string[];
  injuryConsiderations: string[];
  availableDays: string[];
}

/**
 * Equipment a movement's *name* implies. Deliberately name-only: the exercise
 * object carries no equipment field, and inferring from `description` produced
 * false positives on every "no barbell needed" modification note.
 */
export const EQUIPMENT_PATTERNS: Record<string, RegExp> = {
  barbell: /\bbarbell|\bdeadlift\b|\bback squat\b|\bfront squat\b|\bbench press\b|\bclean\b|\bsnatch\b/i,
  dumbbell: /\bdumbbell|\bdb\b/i,
  kettlebell: /\bkettlebell|\bkb\b|\bswing\b/i,
  cable: /\bcable\b|\blat pulldown\b|\bpulldown\b|\btricep pushdown\b/i,
  machine: /\bmachine\b|\bleg press\b|\bleg extension\b|\bleg curl\b|\bsmith\b/i,
  'pull-up bar': /\bpull-?up\b|\bchin-?up\b|\bhanging leg raise\b/i,
  bench: /\bbench\b|\bincline\b|\bdecline\b/i,
  bands: /\bband\b|\bresistance band\b/i,
};

/** Movements a given reported injury makes a bad idea. */
export const INJURY_CONTRAINDICATIONS: Record<string, RegExp> = {
  knee: /\bjump|\bplyo|\bbox jump\b|\blunge\b|\bdeep squat\b|\bsprint\b|\bburpee\b/i,
  back: /\bdeadlift\b|\bgood morning\b|\bbent-?over row\b|\bsit-?up\b|\bhyperextension\b|\btoe touch\b/i,
  shoulder: /\boverhead press\b|\bmilitary press\b|\bupright row\b|\bbehind the neck\b|\bdip\b|\bsnatch\b/i,
  wrist: /\bpush-?up\b|\bplank\b|\bfront squat\b|\bclean\b|\bhandstand\b/i,
  ankle: /\bjump|\bplyo|\bsprint\b|\bcalf raise\b|\bbox jump\b/i,
  hip: /\bdeep squat\b|\blunge\b|\bleg press\b|\bhip thrust\b/i,
  neck: /\bshrug\b|\boverhead press\b|\bbehind the neck\b|\bbridge\b/i,
};

const has = (haystack: string[], needle: string) =>
  haystack.some(h => h.toLowerCase().includes(needle) || needle.includes(h.toLowerCase()));

export function verifyWorkoutPlan(days: WorkoutDayClaim[], survey: WorkoutSurvey): Verdict[] {
  const out: Verdict[] = [];
  const owned = (survey.equipmentAccess ?? []).map(e => e.toLowerCase());
  const injuries = (survey.injuryConsiderations ?? []).map(i => i.toLowerCase()).filter(Boolean);
  const available = (survey.availableDays ?? []).map(d => d.toLowerCase());

  for (const d of days) {
    const where = `workout.${d.day}`;

    // W3 first: it is about the day, not the exercises.
    if (available.length === 0) {
      out.push(verdict('W3-day-available', where, 'unchecked', d.day, 'the survey recorded no available days'));
    } else if (d.restDay) {
      // A rest day on an unavailable day is exactly right, not a violation.
      out.push(verdict('W3-day-available', where, 'verified', d.day, 'rest day'));
    } else if (available.includes(d.day.toLowerCase())) {
      out.push(verdict('W3-day-available', where, 'verified', d.day, 'listed as available'));
    } else {
      out.push(verdict('W3-day-available', where, 'contradicted', d.day, `training scheduled on a day the survey did not list (${survey.availableDays.join(', ')})`));
    }

    for (const ex of d.exercises ?? []) {
      const name = ex?.name ?? '';
      const target = `${where}.${name}`;

      // W1
      const needed = Object.entries(EQUIPMENT_PATTERNS)
        .filter(([, re]) => re.test(name))
        .map(([kind]) => kind);
      if (needed.length === 0) {
        out.push(verdict('W1-equipment-available', target, 'verified', name, 'no equipment implied by the name'));
      } else {
        const missing = needed.filter(n => !has(owned, n));
        out.push(missing.length === 0
          ? verdict('W1-equipment-available', target, 'verified', name, `requires ${needed.join(', ')}, all available`)
          : verdict('W1-equipment-available', target, 'contradicted', name, `requires ${missing.join(', ')}, which the survey did not list`));
      }

      // W2. Absence of a reported injury is not evidence of safety, so with no
      // injuries on file this is unchecked rather than verified.
      if (injuries.length === 0) {
        out.push(verdict('W2-injury-safe', target, 'unchecked', name, 'no injuries reported'));
      } else {
        const hits = injuries.filter(inj => {
          const re = Object.entries(INJURY_CONTRAINDICATIONS).find(([k]) => inj.includes(k))?.[1];
          return re ? re.test(name) : false;
        });
        out.push(hits.length === 0
          ? verdict('W2-injury-safe', target, 'verified', name, `no contraindication for ${injuries.join(', ')}`)
          : verdict('W2-injury-safe', target, 'contradicted', name, `contraindicated for reported ${hits.join(', ')} injury`));
      }
    }
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test "src/lib/verification/workouts.test.ts"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/verification/workouts.ts src/lib/verification/workouts.test.ts
git commit -m "feat(verification): check workouts against the equipment, injuries and days the survey recorded"
```

---

### Task 7: Wire the verifiers into the routes, in shadow

**Files:**
- Create: `src/lib/verification/index.ts`
- Create: `src/lib/verification/index.test.ts`
- Modify: `src/app/api/ai/meals/generate-restaurants/route.ts` — before `const restaurantFacts = buildRestaurantFacts(selectedRestaurants);` (grep that literal)
- Modify: `src/app/api/ai/meals/generate-groceries/route.ts`
- Modify: `src/app/api/ai/workouts/generate/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5, 6.
- Produces: `runVerification(fn: () => Verdict[], label: string): VerificationReport` — the fail-open wrapper; `verifyRestaurantPayload(meals, menuData, facts): Verdict[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verification/index.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { runVerification } from './index';
import { verdict } from './types';

test('a normal pass reports its verdicts', () => {
  const r = runVerification(() => [verdict('a', 'w', 'verified', '1', '1')], 'test');
  assert.equal(r.counts.verified, 1);
  assert.equal(r.verdicts.length, 1);
});

test('a throwing check yields unchecked and does not propagate', () => {
  const r = runVerification(() => { throw new Error('boom'); }, 'test');
  assert.equal(r.counts.unchecked, 1);
  assert.equal(r.counts.contradicted, 0);
  assert.match(r.verdicts[0].evidence, /boom/);
});

test('a throwing check never reports anything as verified', () => {
  const r = runVerification(() => { throw new Error('boom'); }, 'test');
  assert.equal(r.counts.verified, 0);
});

test('the report carries a timestamp', () => {
  assert.ok(!Number.isNaN(Date.parse(runVerification(() => [], 'test').ranAt)));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test "src/lib/verification/index.test.ts"`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/verification/index.ts
import { report, verdict, type Verdict, type VerificationReport } from './types';
import { verifyRestaurantMeal, type MealClaim } from './restaurants';
import { verifyOrderingLinks } from './links';
import type { SearchItem } from './receipt';
import type { RestaurantFacts } from '@/lib/utils/restaurant-facts';

export * from './types';
export * from './receipt';
export * from './restaurants';
export * from './links';
export * from './groceries';
export * from './workouts';

/**
 * The fail-open boundary. Verification is a diagnostic; it must never be able
 * to fail a generation the user is waiting on. On throw every verdict is
 * `unchecked`, which is distinct from `verified` precisely so a crash cannot
 * read as a clean bill of health.
 */
export function runVerification(fn: () => Verdict[], label: string): VerificationReport {
  try {
    return report(fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[VERIFY] ${label} threw, reporting unchecked: ${message}`);
    return report([verdict(`${label}-crashed`, label, 'unchecked', '', message)]);
  }
}

/** One restaurant's worth of hop-1 evidence, keyed by lowercased restaurant name. */
export interface MenuEvidence {
  searchItems?: SearchItem[];
  sourceHosts?: string[];
}

export function verifyRestaurantPayload(
  slots: Array<{ day: string; mealType: string; primary: any; alternative: any }>,
  evidenceByRestaurant: Record<string, MenuEvidence>,
  facts: Record<string, RestaurantFacts>
): Verdict[] {
  const out: Verdict[] = [];
  for (const slot of slots) {
    for (const which of ['primary', 'alternative'] as const) {
      const meal = slot[which];
      if (!meal) continue;
      const target = `${slot.day}.${slot.mealType}.${which}`;
      const key = String(meal.restaurant ?? '').toLowerCase().trim();
      const evidence = evidenceByRestaurant[key] ?? {};

      out.push(...verifyRestaurantMeal(target, {
        restaurant: meal.restaurant,
        dish: meal.dish,
        price: Number(meal.price),
        estimatedCalories: Number(meal.estimatedCalories),
        address: meal.address,
      } as MealClaim, evidence.searchItems, facts[key]));

      out.push(...verifyOrderingLinks(target, meal.orderingLinks ?? {}, evidence.sourceHosts));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test "src/lib/verification/index.test.ts"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Call it from the restaurant route**

In `src/app/api/ai/meals/generate-restaurants/route.ts`, add the import:

```ts
import { runVerification, verifyRestaurantPayload } from '@/lib/verification';
```

Find the line `const restaurantFacts = buildRestaurantFacts(selectedRestaurants);`
and insert immediately after it:

```ts
        // Grounding runs on data already in memory: hop-1's menu payload, the
        // hosts the search retrieved, and the Places facts above. No network
        // call, so this costs nothing against ROUTE_TOTAL_BUDGET_MS.
        const menuEvidence: Record<string, { searchItems?: any[]; sourceHosts?: string[] }> = {};
        for (const m of restaurantMenuData) {
          const key = String(m?.restaurant ?? '').toLowerCase().trim();
          if (key) menuEvidence[key] = { searchItems: m?.searchItems, sourceHosts: m?.sourceHosts };
        }
        const verification = runVerification(
          () => verifyRestaurantPayload(selectedRestaurantMeals, menuEvidence, restaurantFacts),
          'restaurants'
        );
        console.log(`[VERIFY] restaurants: ${JSON.stringify(verification.counts)}`);
```

Then add `verification,` to the `updatedContext` object literal, immediately
after the existing `restaurantFacts,` line. Do the same in the `completePlan`
object in the `else` branch below it (grep `restaurantFacts: buildRestaurantFacts(selectedRestaurants),`)
— there, compute the report once above and reference the same variable.

- [ ] **Step 6: Call it from the grocery and workout routes**

In `src/app/api/ai/meals/generate-groceries/route.ts`, immediately before the
`prisma` write that persists the finished grocery list, add:

```ts
    const verification = runVerification(
      () => verifyGroceryCoverage(recipeIngredients, groceryItemNames),
      'groceries'
    );
    console.log(`[VERIFY] groceries: ${JSON.stringify(verification.counts)}`);
```

where `recipeIngredients` is every string in the plan's recipe ingredient lists
and `groceryItemNames` is every `item`/`name` in the generated list. Locate the
existing variables holding those before writing this; do not introduce new
queries. Persist `verification` alongside the list in the same JSON column.

In `src/app/api/ai/workouts/generate/route.ts`, immediately before the
`prisma.workoutPlan` write, add:

```ts
    const verification = runVerification(
      () => verifyWorkoutPlan(detail.days, {
        equipmentAccess, injuryConsiderations, availableDays,
      }),
      'workouts'
    );
    console.log(`[VERIFY] workouts: ${JSON.stringify(verification.counts)}`);
```

using the survey variables the route already holds, and persist `verification`
inside `planData`.

If any of those variables do not exist under those names, find the equivalent
and use it — do not add a database read.

- [ ] **Step 7: Verify nothing regressed**

Run: `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"`
Expected: all pass.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `29`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/verification src/app/api/ai
git commit -m "feat(verification): record grounding verdicts alongside every generated plan"
```

---

### Task 8: GROUNDING family in the eval harness

**Files:**
- Create: `scripts/eval/grounding.ts`
- Create: `scripts/eval/grounding.test.ts`
- Modify: `scripts/eval/types.ts` — the `Family` union and `tally`'s initializer
- Modify: `scripts/bench-generators.ts` — the restaurant site's check list

**Interfaces:**
- Consumes: `verifyRestaurantPayload`, `runVerification` from `@/lib/verification`; `finding`, `CheckResult` from `./types`.
- Produces: `checkGrounding(slots, evidence, facts): CheckResult`.

The harness must prove the checks *fire*, not merely that they run. Each test
seeds a specific fabrication.

- [ ] **Step 1: Add GROUNDING to the family vocabulary**

In `scripts/eval/types.ts`, change:

```ts
export type Family = 'COMPLETENESS' | 'ARITHMETIC' | 'ADHERENCE' | 'LINKS';
```

to:

```ts
export type Family = 'COMPLETENESS' | 'ARITHMETIC' | 'ADHERENCE' | 'LINKS' | 'GROUNDING';
```

and add `GROUNDING: { error: 0, warn: 0 },` to the object literal inside `tally`.

- [ ] **Step 2: Write the failing test**

```ts
// scripts/eval/grounding.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { checkGrounding } from './grounding';

const items = [{ name: 'Chicken Shawarma Plate', price: 16.5, description: '', statedCalories: 720, sourceUrl: 'https://fanoossf.com/menu' }];
const evidence = { fanoos: { searchItems: items, sourceHosts: ['fanoossf.com', 'grubhub.com'] } };
const facts = { fanoos: { rating: 4.6, userRatingsTotal: 10, distanceMiles: 0.8, address: '123 Main St' } };

const slot = (over: any = {}) => ({
  day: 'monday', mealType: 'lunch',
  primary: {
    restaurant: 'Fanoos', dish: 'Chicken Shawarma', price: 16.5, estimatedCalories: 720,
    address: '123 Main St', orderingLinks: { grubhub: 'https://www.grubhub.com/restaurant/fanoos/1' },
    ...over,
  },
  alternative: null,
});

test('a faithful payload produces no GROUNDING errors', () => {
  const r = checkGrounding([slot()], evidence, facts);
  assert.equal(r.findings.filter(f => f.severity === 'error').length, 0);
});

test('an invented dish is an error', () => {
  const r = checkGrounding([slot({ dish: 'Lobster Thermidor' })], evidence, facts);
  assert.ok(r.findings.some(f => f.code === 'R1-dish-exists' && f.severity === 'error'));
});

test('a drifted price is an error', () => {
  const r = checkGrounding([slot({ price: 24.0 })], evidence, facts);
  assert.ok(r.findings.some(f => f.code === 'R2-price-matches' && f.severity === 'error'));
});

test('a plausible uncited link is an error', () => {
  const r = checkGrounding([slot({ orderingLinks: { doordash: 'https://www.doordash.com/store/fanoos-99/' } })], evidence, facts);
  assert.ok(r.findings.some(f => f.code === 'R5-link-corroborated' && f.severity === 'error'));
});

test('unverified macros are a warn, not an error', () => {
  const r = checkGrounding([slot()], evidence, facts);
  const macro = r.findings.find(f => f.code === 'R4-macros-estimated');
  assert.equal(macro?.severity, 'warn');
});

test('missing evidence is a warn, so an unavailable source cannot fail the run', () => {
  const r = checkGrounding([slot()], {}, facts);
  assert.equal(r.findings.filter(f => f.severity === 'error').length, 0);
  assert.ok(r.findings.some(f => f.severity === 'warn'));
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx --test "scripts/eval/grounding.test.ts"`
Expected: FAIL — cannot find module `./grounding`.

- [ ] **Step 4: Write the implementation**

```ts
// scripts/eval/grounding.ts
import { finding, type CheckResult, type Finding } from './types';
import { runVerification, verifyRestaurantPayload } from '../../src/lib/verification';

/**
 * GROUNDING asks whether the payload matches the sources the pipeline fetched.
 *
 * Only `contradicted` is an error. `unverified` means no evidence existed — the
 * honest state for a macro estimate — and `unchecked` means the source was
 * unavailable, which is a harness problem rather than a generation defect.
 * Grading either as an error would make the run fail on days Perplexity is slow.
 */
export function checkGrounding(
  slots: any[],
  evidenceByRestaurant: Record<string, any>,
  facts: Record<string, any>
): CheckResult {
  const report = runVerification(
    () => verifyRestaurantPayload(slots, evidenceByRestaurant, facts),
    'grounding'
  );

  const findings: Finding[] = report.verdicts
    .filter(v => v.status === 'contradicted' || v.status === 'unverified' || v.status === 'unchecked')
    .map(v => finding(
      'GROUNDING',
      v.status === 'contradicted' ? 'error' : 'warn',
      v.check,
      v.target,
      `${v.status}: claimed ${v.claim} — ${v.evidence}`
    ));

  const c = report.counts;
  return {
    summary: `grounding: ${c.verified} verified, ${c.contradicted} contradicted, ${c.unverified} unverified, ${c.unchecked} unchecked`,
    findings,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test "scripts/eval/grounding.test.ts"`
Expected: PASS, 6 tests.

- [ ] **Step 6: Call it from the bench**

In `scripts/bench-generators.ts`, in the restaurant site's check function (grep
for where `checkLinks` is called on restaurant payloads), add:

```ts
  const evidenceByRestaurant: Record<string, any> = {};
  for (const m of (payload.restaurantData ?? [])) {
    const key = String(m?.restaurant ?? '').toLowerCase().trim();
    if (key) evidenceByRestaurant[key] = { searchItems: m?.searchItems, sourceHosts: m?.sourceHosts };
  }
  const grounding = checkGrounding(
    payload.restaurantMeals ?? [],
    evidenceByRestaurant,
    payload.restaurantFacts ?? {}
  );
  findings.push(...grounding.findings);
```

with the matching import. Adjust the payload field names to whatever the bench's
restaurant fixture actually uses — grep the fixture rather than trusting these.

- [ ] **Step 7: Verify the whole suite**

Run: `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"`
Expected: all pass.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `29`.

- [ ] **Step 8: Commit**

```bash
git add scripts/eval src/lib/verification scripts/bench-generators.ts
git commit -m "feat(eval): GROUNDING family, gated on contradictions only"
```

---

## Done criteria

- `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"` — all pass, ~46 new tests.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` — exactly `29`.
- Every `VERIFY_*` flag unset, therefore `shadow`, therefore user-visible output
  is unchanged.
- `grep -rn "linkCorroboration" src/` no longer describes a signal with no
  consumers.
