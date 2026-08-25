import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHttpUrl, isUsableLink, hostMatchesPlatform, isHomepageRedirect, verifyLinks,
  type LinkVerdict,
} from './link-check';

const verdict = (url: string, over: Partial<LinkVerdict> = {}): LinkVerdict => ({
  url, alive: true, status: 200, finalUrl: url, reason: 'ok', ...over,
});

test('parseHttpUrl rejects non-http schemes and junk', () => {
  assert.equal(parseHttpUrl('javascript:alert(1)'), null);
  assert.equal(parseHttpUrl('ftp://example.com'), null);
  assert.equal(parseHttpUrl('not a url'), null);
  assert.equal(parseHttpUrl('null'), null);
  assert.ok(parseHttpUrl('https://doordash.com/store/1'));
});

test('isUsableLink matches the test the route already applies', () => {
  assert.equal(isUsableLink('https://x.com/a'), true);
  assert.equal(isUsableLink(''), false);
  assert.equal(isUsableLink('null'), false);
  assert.equal(isUsableLink(null), false);
});

test('hostMatchesPlatform accepts the right domain and its subdomains', () => {
  assert.equal(hostMatchesPlatform('doordash', 'https://www.doordash.com/store/sakura-12345/'), true);
  assert.equal(hostMatchesPlatform('doordash', 'https://doordash.com/store/1'), true);
});

test('hostMatchesPlatform rejects the wrong platform and lookalike domains', () => {
  assert.equal(hostMatchesPlatform('doordash', 'https://www.ubereats.com/store/sakura'), false);
  assert.equal(hostMatchesPlatform('doordash', 'https://doordash.com.evil.example/store/1'), false);
  assert.equal(hostMatchesPlatform('doordash', 'https://mydoordash.com/store/1'), false);
});

test('hostMatchesPlatform does not constrain direct, which can be any domain', () => {
  assert.equal(hostMatchesPlatform('direct', 'https://sakuraramenhouse.com'), true);
});

test('isHomepageRedirect catches a deep link that landed on the root', () => {
  assert.equal(isHomepageRedirect(verdict('https://doordash.com/store/sakura-12345', {
    finalUrl: 'https://www.doordash.com/',
  })), true);
});

test('isHomepageRedirect does not fire when the link was already a homepage', () => {
  assert.equal(isHomepageRedirect(verdict('https://sakuraramenhouse.com/', {
    finalUrl: 'https://sakuraramenhouse.com/',
  })), false);
});

test('isHomepageRedirect does not fire on a dead link', () => {
  assert.equal(isHomepageRedirect(verdict('https://doordash.com/store/1', {
    alive: false, status: 404, finalUrl: null, reason: 'HTTP 404',
  })), false);
});

test('verifyLinks keeps a link that is on-host, alive and not redirected', async () => {
  const out = await verifyLinks(
    { doordash: 'https://www.doordash.com/store/sakura-12345' },
    { prober: async (u) => verdict(u) }
  );
  assert.deepEqual(out, { doordash: 'https://www.doordash.com/store/sakura-12345' });
});

test('verifyLinks drops a wrong-host link without spending a request on it', async () => {
  let probed = 0;
  const out = await verifyLinks(
    { doordash: 'https://www.ubereats.com/store/sakura' },
    { prober: async (u) => { probed++; return verdict(u); } }
  );
  assert.deepEqual(out, {});
  assert.equal(probed, 0, 'the host check is free; do not pay for a request to reject it');
});

test('verifyLinks drops a dead link', async () => {
  const out = await verifyLinks(
    { direct: 'https://sakura.example/order' },
    { prober: async (u) => verdict(u, { alive: false, status: 404, reason: 'HTTP 404' }) }
  );
  assert.deepEqual(out, {});
});

test('verifyLinks drops a link that redirected to the homepage', async () => {
  const out = await verifyLinks(
    { grubhub: 'https://www.grubhub.com/restaurant/sakura-99' },
    { prober: async (u) => verdict(u, { finalUrl: 'https://www.grubhub.com/' }) }
  );
  assert.deepEqual(out, {});
});

test('verifyLinks ignores unusable values rather than throwing on them', async () => {
  const out = await verifyLinks(
    { doordash: 'null', ubereats: '', grubhub: null, direct: 'https://sakura.example/order' },
    { prober: async (u) => verdict(u) }
  );
  assert.deepEqual(out, { direct: 'https://sakura.example/order' });
});

test('verifyLinks returns an empty object rather than throwing on an empty input', async () => {
  assert.deepEqual(await verifyLinks({}, { prober: async (u) => verdict(u) }), {});
});
