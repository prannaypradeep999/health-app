import { test } from 'node:test';
import assert from 'node:assert';
import { parseReceipt, sourceHostsFrom } from './receipt';

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

test('sourceHostsFrom collects citation, item and ordering hosts, bare and lowercased', () => {
  const hosts = sourceHostsFrom(parseReceipt(valid), ['https://WWW.Yelp.com/biz/x']);
  assert.ok(hosts.includes('yelp.com'));
  assert.ok(hosts.includes('x.test'));
  assert.ok(hosts.includes('doordash.com'));
});

test('sourceHostsFrom survives a null receipt and unparseable citations', () => {
  assert.deepEqual(sourceHostsFrom(null, ['not a url']), []);
});
