import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHttpUrl, isUsableLink, hostMatchesPlatform, isHomepageRedirect, verifyLinks,
  corroborate, DISPLAYED_PLATFORMS, suppressUndisplayablePlatforms, isUnverifiable, verifyLinksDetailed, mergeOrderingLinks,
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

test('a link whose host appears in the citations is cited', () => {
  const result = corroborate(
    { doordash: 'https://www.doordash.com/store/fanoos-berkeley-123' },
    ['https://www.doordash.com/store/fanoos-berkeley-123', 'https://yelp.com/biz/fanoos']
  );
  assert.equal(result.doordash, 'cited');
});

test('a link on a host that appears nowhere in the citations is uncited', () => {
  const result = corroborate(
    { ubereats: 'https://www.ubereats.com/store/fanoos' },
    ['https://www.doordash.com/store/fanoos-berkeley-123']
  );
  assert.equal(result.ubereats, 'uncited');
});

test('matching is on host, not exact URL', () => {
  const result = corroborate(
    { doordash: 'https://www.doordash.com/store/fanoos-berkeley-999' },
    ['https://www.doordash.com/store/some-other-place']
  );
  // Same host, different path — the search did visit doordash.com, so this is
  // weak corroboration rather than none.
  assert.equal(result.doordash, 'cited');
});

test('a null link is omitted from the result', () => {
  const result = corroborate({ grubhub: null }, ['https://doordash.com/x']);
  assert.equal(result.grubhub, undefined);
});

test('an unparseable citation does not throw', () => {
  assert.doesNotThrow(() =>
    corroborate({ direct: 'https://fanoos.com' }, ['not a url', '', 'https://fanoos.com'])
  );
});

test('an empty citation list marks everything uncited', () => {
  const result = corroborate({ direct: 'https://fanoos.com' }, []);
  assert.equal(result.direct, 'uncited');
});

test('suppression keeps grubhub and direct', () => {
  const out = suppressUndisplayablePlatforms({
    doordash: 'https://www.doordash.com/store/x',
    ubereats: 'https://www.ubereats.com/store/x',
    grubhub: 'https://www.grubhub.com/restaurant/x',
    direct: 'https://example.com',
  });
  assert.equal(out.grubhub, 'https://www.grubhub.com/restaurant/x');
  assert.equal(out.direct, 'https://example.com');
});

test('suppression nulls the platforms that 403 datacenter IPs', () => {
  // Not "drops": OrderingLinks is .strict() and every key is required, so a
  // missing key is a schema violation downstream. Null is the schema's way of
  // saying "no link", and it is what the UI already skips.
  const out = suppressUndisplayablePlatforms({
    doordash: 'https://www.doordash.com/store/x',
    ubereats: 'https://www.ubereats.com/store/x',
    grubhub: null,
    direct: null,
  });
  assert.equal(out.doordash, null);
  assert.equal(out.ubereats, null);
  assert.ok('doordash' in out, 'the key must survive even though the value does not');
  assert.ok('ubereats' in out);
});

test('suppression leaves an already-empty object alone', () => {
  assert.deepEqual(suppressUndisplayablePlatforms({}), {});
});

test('DISPLAYED_PLATFORMS is the single switch for this policy', () => {
  assert.deepEqual([...DISPLAYED_PLATFORMS].sort(), ['direct', 'grubhub']);
});

// --- Unverifiable vs dead -------------------------------------------------
//
// The distinction that keeps a real restaurant's real website from being
// deleted because a bot wall refused a datacenter IP.

test('isUnverifiable treats a refusal as inconclusive, not negative', () => {
  for (const status of [401, 403, 429, 451, 503]) {
    assert.equal(
      isUnverifiable(verdict('https://x.example/a', { alive: false, status, reason: `HTTP ${status}` })),
      true,
      `HTTP ${status} should be inconclusive`
    );
  }
});

test('isUnverifiable treats a timeout or network error as inconclusive', () => {
  assert.equal(isUnverifiable(verdict('https://x.example/a', {
    alive: false, status: null, finalUrl: null, reason: 'timed out after 6000ms',
  })), true);
});

test('isUnverifiable keeps 404 and 410 fatal — those are real answers', () => {
  assert.equal(isUnverifiable(verdict('https://x.example/a', { alive: false, status: 404, reason: 'HTTP 404' })), false);
  assert.equal(isUnverifiable(verdict('https://x.example/a', { alive: false, status: 410, reason: 'HTTP 410' })), false);
});

test('isUnverifiable is false for a link that answered', () => {
  assert.equal(isUnverifiable(verdict('https://x.example/a')), false);
});

test('a lenient platform survives a bot wall', async () => {
  const url = 'https://laoaxaquena.example/menu';
  const out = await verifyLinks({ direct: url }, {
    lenientPlatforms: ['direct'],
    prober: async (u) => verdict(u, { alive: false, status: 403, finalUrl: null, reason: 'HTTP 403' }),
  });
  assert.deepEqual(out, { direct: url });
});

test('a lenient platform is still dropped by a real 404', async () => {
  const out = await verifyLinks({ direct: 'https://gone.example/menu' }, {
    lenientPlatforms: ['direct'],
    prober: async (u) => verdict(u, { alive: false, status: 404, finalUrl: null, reason: 'HTTP 404' }),
  });
  assert.deepEqual(out, {});
});

test('leniency does not leak to platforms that were not named', async () => {
  const out = await verifyLinks(
    { direct: 'https://site.example/menu', grubhub: 'https://www.grubhub.com/restaurant/x' },
    {
      lenientPlatforms: ['direct'],
      prober: async (u) => verdict(u, { alive: false, status: 403, finalUrl: null, reason: 'HTTP 403' }),
    }
  );
  assert.deepEqual(out, { direct: 'https://site.example/menu' });
});

test('a lenient platform is allowed to redirect to its own homepage', async () => {
  const url = 'https://restaurant.example/home';
  const out = await verifyLinks({ direct: url }, {
    lenientPlatforms: ['direct'],
    prober: async (u) => verdict(u, { finalUrl: 'https://restaurant.example/' }),
  });
  assert.deepEqual(out, { direct: url });
});

test('a non-lenient platform is still dropped for a homepage redirect', async () => {
  const out = await verifyLinks({ grubhub: 'https://www.grubhub.com/restaurant/invented' }, {
    prober: async (u) => verdict(u, { finalUrl: 'https://www.grubhub.com/' }),
  });
  assert.deepEqual(out, {});
});

test('verifyLinksDetailed reports why each link was kept or dropped', async () => {
  const { links, outcomes } = await verifyLinksDetailed(
    {
      grubhub: 'https://www.grubhub.com/restaurant/ok',
      direct: 'https://walled.example/menu',
      doordash: 'https://not-doordash.example/x',
    },
    {
      lenientPlatforms: ['direct'],
      prober: async (u) => u.includes('grubhub')
        ? verdict(u)
        : verdict(u, { alive: false, status: 403, finalUrl: null, reason: 'HTTP 403' }),
    }
  );

  assert.deepEqual(Object.keys(links).sort(), ['direct', 'grubhub']);
  assert.equal(outcomes.grubhub.kept, true);
  assert.equal(outcomes.direct.kept, true);
  assert.match(outcomes.direct.reason, /unverified .*kept on provenance/);
  assert.equal(outcomes.doordash.kept, false);
  assert.equal(outcomes.doordash.reason, 'wrong host for platform');
});

// --- Merging the two hops' views of the same links ------------------------

test('mergeOrderingLinks prefers the first source and fills gaps from the second', () => {
  const merged = mergeOrderingLinks(
    { grubhub: 'https://www.grubhub.com/a', direct: null },
    { grubhub: 'https://www.grubhub.com/stale', direct: 'https://site.example' }
  );
  assert.deepEqual(merged, {
    grubhub: 'https://www.grubhub.com/a',
    direct: 'https://site.example',
  });
});

test('mergeOrderingLinks recovers everything when the preferred source is empty', () => {
  // The production failure: hop 2 timed out and returned {}, taking a good
  // GrubHub link with it.
  assert.deepEqual(
    mergeOrderingLinks({}, { grubhub: 'https://www.grubhub.com/a' }),
    { grubhub: 'https://www.grubhub.com/a' }
  );
});

test('mergeOrderingLinks tolerates null and undefined sources', () => {
  assert.deepEqual(mergeOrderingLinks(null, undefined), {});
  assert.deepEqual(mergeOrderingLinks(undefined, { direct: 'https://a.example' }), { direct: 'https://a.example' });
});

test('mergeOrderingLinks drops junk rather than passing it through', () => {
  assert.deepEqual(
    mergeOrderingLinks({ grubhub: 'not a url', direct: '' }, { direct: 'javascript:alert(1)' }),
    {}
  );
});

test('mergeOrderingLinks trims whitespace', () => {
  assert.deepEqual(
    mergeOrderingLinks({ direct: '  https://a.example  ' }, {}),
    { direct: 'https://a.example' }
  );
});
