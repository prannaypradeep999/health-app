# Grocery Price Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every grocery item on screen shows either a real price, a labelled estimate, or a plain-language reason — and never the words "no price".

**Architecture:** Three layers, cheapest first. Layer 1 is pure display and fixes items that already *have* a price but render blank. Layer 2 raises how many items get a real price out of the pipeline. Layer 3 makes the genuinely-unpriced case read as an explanation rather than as a defect. No layer fabricates a number without labelling it as an estimate.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Prisma/Postgres (Neon), Perplexity for price lookup, Node's built-in test runner via `npx tsx --test`.

**Spec:** No separate design doc. The audit findings this plan implements are recorded inline per task, with file:line evidence gathered 2026-08-27.

## Global Constraints

- **Never fabricate an unlabelled price.** `src/lib/utils/grocery-price-estimates.ts:54` sets this policy: a number the user could mistake for a real price is worse than no number. Every inferred value renders with a `~` prefix and a badge naming where it came from.
- **`price` is never written with an inferred value.** Estimates go in `estimatedPrice`. Store totals and store ranking read `price` only, so an estimate must never move a store up the ranking. Enforced today at `grocery-price-estimates.ts:73`.
- **Tests:** `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts"` — globs MUST be quoted for zsh. Current baseline: **532 passing**.
- **Typecheck:** `npx tsc --noEmit` — current baseline **23 errors**, all pre-existing. Do not fix them incidentally; do not add to them. `next build` has `ignoreBuildErrors: true` and will happily build broken TypeScript, so compiling is not verification.
- **Database is shared production data.** No task in this plan requires a migration. If one appears to, stop and ask.

---

### Task 1: A one-store item shows its price

**The defect:** `GroceryListSection.tsx:737` and `:777` both gate the price comparison on `storeOptions.length > 1`. An item found at exactly one store renders no price at all — despite holding a real one — and `unpricedReason` returns null because the option *does* have a price, so nothing explains the blank either. A silent empty row for an item we priced correctly. This is the highest-value fix in the plan: it costs nothing and it removes blank rows from a demo.

**Files:**
- Modify: `src/components/dashboard/GroceryListSection.tsx` (the two `storeOptions.length > 1` guards)
- Test: `src/components/dashboard/grocery-display.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Follow the existing source-regex pattern used by `src/components/dashboard/restaurant-display.test.ts` — these components are not render-tested, so assert against the source text.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
  new URL('./GroceryListSection.tsx', import.meta.url),
  'utf8'
);

test('a single-store item is not hidden from the price comparison', () => {
  // `> 1` meant an item found at exactly one store rendered no price at all,
  // even though it had a real one.
  assert.doesNotMatch(SRC, /storeOptions\.length > 1/);
});

test('the price comparison renders whenever there is at least one store', () => {
  const matches = SRC.match(/storeOptions\.length >= 1/g) ?? [];
  assert.equal(matches.length, 2, 'both the desktop and mobile guards');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test "src/components/dashboard/grocery-display.test.ts"`
Expected: FAIL — `storeOptions.length > 1` is still present.

- [ ] **Step 3: Change both guards**

At both `:737` (desktop) and `:777` (mobile), change `storeOptions.length > 1` to `storeOptions.length >= 1`. The desktop branch uses `grid-cols-3`; with one option that leaves two empty cells, so make the column count follow the data:

```tsx
<div className={`grid divide-x divide-gray-200 ${
  storeOptions.length === 1 ? 'grid-cols-1'
  : storeOptions.length === 2 ? 'grid-cols-2'
  : 'grid-cols-3'
}`}>
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx tsx --test "src/components/dashboard/grocery-display.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/GroceryListSection.tsx src/components/dashboard/grocery-display.test.ts
git commit -m "fix(grocery): show the price of an item found at only one store"
```

---

### Task 2: Retire the words "no price"

**The defect:** `GroceryListSection.tsx:74` and `:79` — `formatPrice` returns the literal lowercase string `'no price'`, rendered at `:751`, `:799` and `:830`. It reads as a defect rather than as information, and it appears in the same bold slot a real price would occupy, so a list with a few gaps looks broken.

**The fix:** `formatPrice` returns `null` for "nothing to show", and call sites render a muted em-dash plus the existing `unpricedReason` explanation instead of bold text. Returning `null` rather than a different string forces every call site to be visited by the compiler.

**Files:**
- Modify: `src/components/dashboard/GroceryListSection.tsx:69-80` and the three call sites
- Test: `src/components/dashboard/grocery-display.test.ts` (extend)

**Interfaces:**
- Consumes: the test file created in Task 1.
- Produces: `formatPrice(option) -> string | null`. Null means "no price and no estimate"; callers must render their own placeholder.

- [ ] **Step 1: Write the failing test**

```ts
test('the phrase "no price" never reaches the screen', () => {
  assert.doesNotMatch(SRC, /'no price'/);
  assert.doesNotMatch(SRC, /"no price"/);
});

test('formatPrice signals absence with null so every caller must handle it', () => {
  assert.match(SRC, /function formatPrice\([\s\S]*?\):\s*string \| null/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test "src/components/dashboard/grocery-display.test.ts"`
Expected: FAIL — two occurrences of `'no price'` remain.

- [ ] **Step 3: Change the signature and the call sites**

```ts
/**
 * The formatted price, or null when there is neither a real price nor an
 * estimate. Null rather than a placeholder string so that each call site
 * decides how absence looks in its own layout — the previous "no price" text
 * sat in the bold slot a real price occupies and read as a broken row.
 */
function formatPrice(
  option:
    | { price?: number | null; estimatedPrice?: number; priceConfidence?: 'exact' | 'estimate' }
    | undefined
): string | null {
  if (!option) return null;
  if (typeof option.price === 'number') {
    return `${option.priceConfidence === 'estimate' ? '~' : ''}$${option.price.toFixed(2)}`;
  }
  if (typeof option.estimatedPrice === 'number') return `~$${option.estimatedPrice.toFixed(2)}`;
  return null;
}
```

At each of the three call sites, replace `{formatPrice(option)}` with a form that handles null. Example for `:751`:

```tsx
{formatPrice(option) ?? <span className="font-normal text-gray-400">—</span>}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx tsx --test "src/components/dashboard/grocery-display.test.ts"`
Expected: PASS

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `23` — unchanged from baseline. A higher number means a call site was missed.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/GroceryListSection.tsx src/components/dashboard/grocery-display.test.ts
git commit -m "fix(grocery): render a dash and a reason instead of the words \"no price\""
```

---

### Task 3: Always explain an unpriced item

**The defect:** `GroceryListSection.tsx:671` gates `noPriceReason` on `hasRealPrices`. When the price search returns nothing at all, `hasRealPrices` is false, so the explanation is suppressed precisely in the case that most needs explaining. `hasStoresNoPrices` (`:283`) depends on `priceSearchSuccess === false`, which is never written on the 404 path at `generate-groceries/route.ts:201`, so no banner renders either. The user gets bare rows with no prices and no reason.

**Files:**
- Modify: `src/components/dashboard/GroceryListSection.tsx:671` and the `hasStoresNoPrices` derivation at `:283`
- Test: `src/components/dashboard/grocery-display.test.ts` (extend)

**Interfaces:**
- Consumes: `formatPrice -> string | null` from Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

```ts
test('the no-price explanation is not gated on prices existing', () => {
  // The explanation was hidden exactly when the whole list was unpriced, which
  // is the case that most needs it.
  const gated = /hasRealPrices\s*&&\s*noPriceReason/;
  assert.doesNotMatch(SRC, gated);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test "src/components/dashboard/grocery-display.test.ts"`
Expected: FAIL

- [ ] **Step 3: Ungate the explanation**

Render `noPriceReason` whenever it is non-null, independent of `hasRealPrices`. Derive `hasStoresNoPrices` from the data rather than from the `priceSearchSuccess` flag that the 404 path never writes:

```ts
// Derived from the list itself, because priceSearchSuccess is not written on
// every failure path — the store-search 404 at generate-groceries/route.ts:201
// returns before persisting anything.
const hasStoresNoPrices = stores.length > 0 && !hasRealPrices;
```

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test "src/components/dashboard/grocery-display.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/GroceryListSection.tsx src/components/dashboard/grocery-display.test.ts
git commit -m "fix(grocery): explain an unpriced list instead of hiding the reason"
```

---

### Task 4: A second pass for the stragglers

**The defect:** `perplexity-client.ts:585-603` retries a chunk once, and only when `chunkPriceCoverage < 0.5`. A chunk that comes back 60% priced is never retried, so those 40% stay unpriced even though a targeted second ask would likely resolve them. This is the layer that raises real-price coverage rather than dressing up its absence.

**The fix:** after the existing chunk retry, collect every item still without a real price across all chunks and issue one final small lookup naming just those items. One extra request, bounded, and only when there is something to ask about.

**Files:**
- Modify: `src/lib/external/perplexity-client.ts` (`getGroceryPrices`, around `:542-610`)
- Test: `src/lib/external/grocery-price-retry.test.ts` (create)

**Interfaces:**
- Consumes: `fillMissingPriceEstimates` from `src/lib/utils/grocery-price-estimates.ts` (unchanged).
- Produces: `collectUnpricedItems(items: PricedItemLike[]): string[]` — exported from `src/lib/utils/grocery-price-estimates.ts`, returns the normalized names of items where no store option has a real price. Used by `getGroceryPrices` to build the final lookup.

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUnpricedItems } from '../utils/grocery-price-estimates';

test('an item with a real price at any store is not a straggler', () => {
  const items = [{ name: 'eggs', storeOptions: [{ store: 'A', price: null }, { store: 'B', price: 4.99 }] }];
  assert.deepEqual(collectUnpricedItems(items as any), []);
});

test('an item priced nowhere is a straggler', () => {
  const items = [{ name: 'saffron', storeOptions: [{ store: 'A', price: null }] }];
  assert.deepEqual(collectUnpricedItems(items as any), ['saffron']);
});

test('a zero price counts as unpriced, matching isRealPrice', () => {
  // Zero is how the model spells "I could not find this", and treating it as a
  // price makes the item read as free.
  const items = [{ name: 'bay leaf', storeOptions: [{ store: 'A', price: 0 }] }];
  assert.deepEqual(collectUnpricedItems(items as any), ['bay leaf']);
});

test('an item with no store options at all is a straggler', () => {
  assert.deepEqual(collectUnpricedItems([{ name: 'tahini', storeOptions: [] }] as any), ['tahini']);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test "src/lib/external/grocery-price-retry.test.ts"`
Expected: FAIL with "collectUnpricedItems is not a function" or a module resolution error.

- [ ] **Step 3: Implement `collectUnpricedItems`**

In `src/lib/utils/grocery-price-estimates.ts`, reusing the existing private `isRealPrice`:

```ts
/**
 * Items where no store returned a usable price. These are the ones a second,
 * targeted lookup should name — the chunk-level retry only fires below 50%
 * coverage, so a chunk that came back mostly priced leaves its gaps behind.
 */
export function collectUnpricedItems<T extends PricedItemLike>(items: T[]): string[] {
  return items
    .filter(item => {
      const options = item.storeOptions;
      if (!Array.isArray(options) || options.length === 0) return true;
      return !options.some(option => isRealPrice(option.price));
    })
    .map(item => (item as any).name ?? (item as any).item ?? '')
    .filter((name: string) => name.length > 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test "src/lib/external/grocery-price-retry.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the second pass into `getGroceryPrices`**

After the existing chunk-retry block in `perplexity-client.ts`, before returning: call `collectUnpricedItems` on the merged results; if the list is non-empty and under 25 items, issue one more `fetchPriceChunk` naming only those items, and merge any real prices it returns. Never let this pass overwrite a real price that already exists. Log the before/after count:

```ts
console.log(`[GROCERY-PRICES] straggler pass: ${straggler.length} unpriced -> ${remaining.length} after`);
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: all passing, count = 532 + the new tests.

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `23`

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/grocery-price-estimates.ts src/lib/external/perplexity-client.ts src/lib/external/grocery-price-retry.test.ts
git commit -m "feat(grocery): one targeted second pass for items no chunk priced"
```

---

### Task 5: Never render a stray empty badge

**The defect:** `src/lib/ai/schemas/shared.ts:59-63` permits empty strings for `quantity` and `displayName`. An empty `quantity` renders as an empty outline `Badge` at `GroceryListSection.tsx:709` — a stray pill with nothing in it. An empty `displayName` leaves a blank line under the price at `:756`. Small, but it is exactly the kind of thing that shows up in a demo screenshot.

**Files:**
- Modify: `src/components/dashboard/GroceryListSection.tsx:709` and `:756`
- Test: `src/components/dashboard/grocery-display.test.ts` (extend)

**Interfaces:**
- Consumes: the test file from Task 1.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```ts
test('an empty quantity does not render an empty badge', () => {
  // `{item.quantity && <Badge>}` passes for "" only because "" is falsy — but
  // a whitespace-only string is truthy and renders a blank pill.
  assert.doesNotMatch(SRC, /\{item\.quantity && </);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test "src/components/dashboard/grocery-display.test.ts"`
Expected: FAIL

- [ ] **Step 3: Guard on trimmed content**

Add a helper near `formatPrice` and use it at both sites:

```ts
/** Truthy only for a string with visible characters. "" is falsy but "  " is not. */
const hasText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
```

Then `{hasText(item.quantity) && (` and `{hasText(option.displayName) && (`.

- [ ] **Step 4: Run the full suite**

Run: `npx tsx --test "scripts/eval/*.test.ts" "src/**/*.test.ts" 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/GroceryListSection.tsx src/components/dashboard/grocery-display.test.ts
git commit -m "fix(grocery): stop rendering an empty badge for a blank quantity"
```

---

## Open decision for the user

Tasks 1-5 remove every *rendering* defect and raise real-price coverage, without inventing a number. What they do not do is guarantee a price on an item that genuinely no store priced and that the straggler pass also fails to resolve. That item will show `—` plus a reason.

If that is still too visible for the demo, the remaining option is a **category-median estimate** — show `~$4.50` derived from the item's category, badged "estimated, not found in search". That is a real departure from the policy at `grocery-price-estimates.ts:54`, so it is deliberately not in this plan. It needs an explicit yes, and it should be a separate commit that can be reverted on its own.

**Recommendation:** ship Tasks 1-5 first and re-measure. My expectation is that Task 1 alone removes most of the visible gaps, because a blank row from the `> 1` guard is indistinguishable from a genuinely unpriced item, and the `> 1` guard fires on every item found at only one store — which in a small-city store set is a lot of them.
