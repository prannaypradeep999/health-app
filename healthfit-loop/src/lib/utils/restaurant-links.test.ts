import test from 'node:test';
import assert from 'node:assert/strict';
import { orderOptionsFor, mapsSearchUrl, isLocateOnly, formatRestaurantLocation, orderabilityRank, sortByOrderability } from './restaurant-links';

const links = (over: Record<string, string | null> = {}) => ({
  doordash: null, ubereats: null, grubhub: null, direct: null, ...over,
});

const option = (over: Record<string, unknown> = {}) => ({
  restaurant: 'Comal Next Door',
  address: '2020 Shattuck Ave, Berkeley',
  dish: 'Grilled Fish Bowl',
  orderingLinks: links(),
  ...over,
});

test('surviving platform links are returned in display order, best first', () => {
  const out = orderOptionsFor(option({
    orderingLinks: links({ grubhub: 'https://grubhub.com/x', direct: 'https://comal.example' }),
  }));
  assert.deepEqual(out.map(o => o.key), ['grubhub', 'direct']);
  assert.ok(out.every(o => o.kind === 'order'));
});

test('an option with no surviving link still has somewhere to go', () => {
  // The defect. Three filters upstream drop unverifiable links for good
  // reasons, and the meal card then rendered no button at all — a dish name
  // the user could not act on.
  const out = orderOptionsFor(option());
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'locate');
  assert.ok(out[0].url.startsWith('https://www.google.com/maps/search/?api=1&query='));
});

test('the fallback is a search, never a deep link', () => {
  // A place deep link can land on the wrong restaurant, which is the exact
  // failure isHomepageRedirect exists to catch. A search cannot.
  const url = mapsSearchUrl('Sakura Ramen House', '2100 Shattuck Ave, Berkeley')!;
  assert.ok(url.includes('/maps/search/'));
  assert.ok(url.includes(encodeURIComponent('Sakura Ramen House, 2100 Shattuck Ave, Berkeley')));
});

test('the fallback never appears alongside a real ordering link', () => {
  const out = orderOptionsFor(option({ orderingLinks: links({ grubhub: 'https://grubhub.com/x' }) }));
  assert.ok(out.every(o => o.kind === 'order'), 'a locate option was offered when ordering was possible');
});

test('a restaurant with no name gets nothing, and that is the only empty case', () => {
  // This is now the ONLY input that deserves the harness's `no-usable-link`
  // error. It used to fire for every option whose platform links had merely
  // been filtered, which described a generator failure that had not happened.
  assert.deepEqual(orderOptionsFor(option({ restaurant: '' })), []);
  assert.deepEqual(orderOptionsFor(option({ restaurant: undefined })), []);
  assert.deepEqual(orderOptionsFor(null), []);
  assert.deepEqual(orderOptionsFor(undefined), []);
});

test('the literal string "null" is not a link', () => {
  // The model is told to write null for a platform it could not find, and the
  // string has come back before. Truthiness alone renders an Order button that
  // opens the relative path `null`.
  const out = orderOptionsFor(option({ orderingLinks: links({ doordash: 'null', grubhub: '   ' }) }));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'locate');
});

test('a placeholder address is left out of the search rather than searched for', () => {
  // `Address not available` and `Unknown City` are strings the restaurant route
  // substitutes when Places gave it nothing. Searching for them finds nothing;
  // searching for the name alone finds the restaurant.
  const url = mapsSearchUrl('Zaytoon Mediterranean', 'Address not available')!;
  assert.equal(url, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Zaytoon Mediterranean')}`);
});

test('a missing address still yields a usable search', () => {
  const url = mapsSearchUrl('Zaytoon Mediterranean')!;
  assert.ok(url.includes(encodeURIComponent('Zaytoon Mediterranean')));
});

test('an address alone is never searched — it would open the wrong business', () => {
  assert.equal(mapsSearchUrl('', '2020 Shattuck Ave'), null);
  assert.equal(mapsSearchUrl(null, '2020 Shattuck Ave'), null);
});

test('the query is encoded, so a name with punctuation cannot break the URL', () => {
  const url = mapsSearchUrl("Nick's Pizza & Pasta", '1 A St #200')!;
  assert.ok(!url.includes(' '));
  assert.ok(!url.includes('#'), 'an unencoded # truncates the query into a fragment');
  assert.ok(url.includes(encodeURIComponent("Nick's Pizza & Pasta, 1 A St #200")));
});

test('plans written before orderingLinks existed still order', () => {
  const out = orderOptionsFor({
    restaurant: 'Old Plan Cafe', address: '1 Main St', website: 'https://oldplancafe.example',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'order');
  assert.equal(out[0].url, 'https://oldplancafe.example');
});

test('a filtered-empty orderingLinks does not fall back to the website', () => {
  // The route seeds `direct` FROM the Places website, then verifies it. An
  // empty-but-present orderingLinks means that link was probed and rejected,
  // so reading `website` back would reinstate the exact URL isHomepageRedirect
  // threw out — as an Order button. Present-and-empty is not the legacy shape.
  const out = orderOptionsFor({
    restaurant: 'Comal Next Door',
    address: '2020 Shattuck Ave',
    website: 'https://comal.example',
    orderingLinks: links(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'locate', 'a rejected website was resurrected as an order link');
});

test('a bare restaurant record works too, not just a meal option', () => {
  // RestaurantListSection holds records keyed `name`; the meal card holds
  // options keyed `restaurant`. One helper has to read both.
  const out = orderOptionsFor({ name: 'Comal Next Door', address: '2020 Shattuck Ave' });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'locate');
});

test('isLocateOnly distinguishes "we could not verify an order link" from "we could"', () => {
  assert.equal(isLocateOnly(orderOptionsFor(option())), true);
  assert.equal(
    isLocateOnly(orderOptionsFor(option({ orderingLinks: links({ grubhub: 'https://grubhub.com/x' }) }))),
    false
  );
  assert.equal(isLocateOnly([]), false, 'nothing on offer is not the same as directions on offer');
});

test('a Places address already naming the city is not given it twice', () => {
  assert.equal(
    formatRestaurantLocation('3105 Shattuck Ave., Berkeley, CA 94705, USA', 'Berkeley'),
    '3105 Shattuck Ave., Berkeley, CA 94705, USA'
  );
});

test('a bare street address is completed with the city', () => {
  assert.equal(formatRestaurantLocation('2100 Ward St', 'Berkeley'), '2100 Ward St, Berkeley');
});

test('a missing city leaves no trailing comma', () => {
  assert.equal(formatRestaurantLocation('2100 Ward St', undefined), '2100 Ward St');
  assert.equal(formatRestaurantLocation('2100 Ward St', ''), '2100 Ward St');
});

test('a missing address does not produce a leading comma', () => {
  assert.equal(formatRestaurantLocation('', 'Berkeley'), 'Berkeley');
  assert.equal(formatRestaurantLocation(null, 'Berkeley'), 'Berkeley');
});

test('case differences between sources do not duplicate the city', () => {
  assert.equal(
    formatRestaurantLocation('1974 Shattuck Ave., berkeley, CA 94704', 'Berkeley'),
    '1974 Shattuck Ave., berkeley, CA 94704'
  );
});

test('neither address nor city yields an empty line, not punctuation', () => {
  assert.equal(formatRestaurantLocation(null, null), '');
});

// ---------------------------------------------------------------------------
// Ordering the list: GrubHub-orderable first, menu-only last.
// ---------------------------------------------------------------------------

const withLinks = (name: string, orderingLinks: Record<string, string | null>) => ({
  name,
  restaurant: name,
  address: '1 Main St, Berkeley, CA',
  orderingLinks
});

test('a GrubHub link ranks ahead of a direct-only one, which ranks ahead of menu-only', () => {
  assert.equal(orderabilityRank(withLinks('G', { grubhub: 'https://grubhub.com/x' })), 0);
  assert.equal(orderabilityRank(withLinks('D', { direct: 'https://taqueria.example/order' })), 1);
  assert.equal(orderabilityRank(withLinks('M', { grubhub: null, direct: null })), 2);
});

test('a restaurant with both GrubHub and direct still ranks as GrubHub', () => {
  const r = withLinks('Both', { grubhub: 'https://grubhub.com/x', direct: 'https://x.example' });
  assert.equal(orderabilityRank(r), 0);
});

test('a restaurant with no name at all ranks last rather than throwing', () => {
  assert.equal(orderabilityRank({ orderingLinks: {} }), 2);
  assert.equal(orderabilityRank(null), 2);
});

test('sorting stacks every GrubHub restaurant before the menu-only ones', () => {
  const sorted = sortByOrderability([
    withLinks('menu-only-1', { grubhub: null }),
    withLinks('grubhub-1', { grubhub: 'https://grubhub.com/a' }),
    withLinks('direct-1', { direct: 'https://a.example/order' }),
    withLinks('menu-only-2', { grubhub: null }),
    withLinks('grubhub-2', { grubhub: 'https://grubhub.com/b' })
  ]);

  assert.deepEqual(sorted.map(r => r.name), [
    'grubhub-1',
    'grubhub-2',
    'direct-1',
    'menu-only-1',
    'menu-only-2'
  ]);
});

test('sorting preserves the incoming order within a tier', () => {
  const sorted = sortByOrderability([
    withLinks('g-first', { grubhub: 'https://grubhub.com/1' }),
    withLinks('g-second', { grubhub: 'https://grubhub.com/2' }),
    withLinks('g-third', { grubhub: 'https://grubhub.com/3' })
  ]);

  assert.deepEqual(sorted.map(r => r.name), ['g-first', 'g-second', 'g-third']);
});

test('sorting does not mutate the array it was given', () => {
  const input = [
    withLinks('menu-only', { grubhub: null }),
    withLinks('grubhub', { grubhub: 'https://grubhub.com/a' })
  ];
  const before = input.map(r => r.name);
  sortByOrderability(input);
  assert.deepEqual(input.map(r => r.name), before);
});

test('an empty list sorts to an empty list', () => {
  assert.deepEqual(sortByOrderability([]), []);
});
