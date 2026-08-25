import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyLinks, type LinkVerdict } from '@/lib/external/link-check';

function fakeProber(map: Record<string, boolean>) {
  return async (url: string): Promise<LinkVerdict> =>
    map[url]
      ? { url, alive: true, status: 200, finalUrl: url, reason: 'ok' }
      : { url, alive: false, status: 404, finalUrl: url, reason: 'not found' };
}

test('drops a link whose host does not match its platform', async () => {
  const out = await verifyLinks(
    { doordash: 'https://example.com/menu' },
    { prober: fakeProber({ 'https://example.com/menu': true }) }
  );
  assert.deepEqual(out, {});
});

test('keeps a link that is on the right host and answers', async () => {
  const url = 'https://www.doordash.com/store/pho-99-123456/';
  const out = await verifyLinks({ doordash: url }, { prober: fakeProber({ [url]: true }) });
  assert.deepEqual(out, { doordash: url });
});

test('drops a link that does not answer', async () => {
  const url = 'https://www.ubereats.com/store/gone';
  const out = await verifyLinks({ ubereats: url }, { prober: fakeProber({}) });
  assert.deepEqual(out, {});
});

test('accepts any host for the direct link', async () => {
  const url = 'https://pho99.com/';
  const out = await verifyLinks({ direct: url }, { prober: fakeProber({ [url]: true }) });
  assert.deepEqual(out, { direct: url });
});

test('ignores null and the literal string null', async () => {
  const out = await verifyLinks(
    { doordash: null, grubhub: 'null', ubereats: undefined },
    { prober: async () => { throw new Error('should not probe'); } }
  );
  assert.deepEqual(out, {});
});
