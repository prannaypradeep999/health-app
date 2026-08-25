import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { probe, checkHost, checkRedirectedToHomepage, checkOrderingLinks } from './links';

let base = '';
let server: http.Server;

before(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/ok') { res.writeHead(200); res.end('ok'); return; }
    if (url === '/gone') { res.writeHead(404); res.end('no'); return; }
    if (url === '/no-head') {
      // Some CDNs reject HEAD but serve GET. The prober must fall back.
      if (req.method === 'HEAD') { res.writeHead(405); res.end(); return; }
      res.writeHead(200); res.end('ok');
      return;
    }
    if (url === '/store/some-restaurant') {
      // The classic hallucination: a plausible deep link that redirects home.
      res.writeHead(302, { Location: '/' }); res.end();
      return;
    }
    if (url === '/walled') { res.writeHead(403); res.end('bot wall'); return; }
    if (url === '/') { res.writeHead(200); res.end('homepage'); return; }
    res.writeHead(500); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => { server.close(); });

test('probe reports a 200 as alive', async () => {
  const v = await probe(`${base}/ok`);
  assert.equal(v.alive, true);
  assert.equal(v.status, 200);
});

test('probe reports a 404 as dead', async () => {
  const v = await probe(`${base}/gone`);
  assert.equal(v.alive, false);
  assert.equal(v.status, 404);
});

test('probe falls back to GET when HEAD is rejected', async () => {
  const v = await probe(`${base}/no-head`);
  assert.equal(v.alive, true, 'a 405 on HEAD must not be reported as a dead link');
  assert.equal(v.status, 200);
});

test('probe records the final URL after redirects', async () => {
  const v = await probe(`${base}/store/some-restaurant`);
  assert.equal(v.alive, true);
  assert.equal(new URL(v.finalUrl!).pathname, '/');
});

test('probe reports an unreachable host as dead rather than throwing', async () => {
  const v = await probe('http://127.0.0.1:1/nothing', 1500);
  assert.equal(v.alive, false);
  assert.equal(v.status, null);
});

test('probe rejects a non-http scheme without touching the network', async () => {
  const v = await probe('javascript:alert(1)');
  assert.equal(v.alive, false);
  assert.match(v.reason, /scheme/i);
});

test('checkHost accepts a URL on the right platform domain', () => {
  assert.deepEqual(checkHost('x', 'doordash', 'https://www.doordash.com/store/sakura-12345/'), []);
});

test('checkHost rejects a URL parked on the wrong platform domain', () => {
  const out = checkHost('x', 'doordash', 'https://www.ubereats.com/store/sakura');
  assert.equal(out.length, 1);
  assert.equal(out[0].family, 'LINKS');
  assert.equal(out[0].severity, 'error');
  assert.equal(out[0].code, 'wrong-host');
});

test('checkHost does not constrain the direct platform, which is any real site', () => {
  assert.deepEqual(checkHost('x', 'direct', 'https://sakuraramenhouse.com'), []);
});

test('checkHost is not fooled by a lookalike domain', () => {
  const out = checkHost('x', 'doordash', 'https://doordash.com.evil.example/store/1');
  assert.equal(out.length, 1, 'suffix matching must be anchored to the registrable domain');
});

test('checkRedirectedToHomepage flags a deep link that lands on /', () => {
  const out = checkRedirectedToHomepage('x', {
    url: 'https://www.doordash.com/store/sakura-12345/',
    alive: true, status: 200,
    finalUrl: 'https://www.doordash.com/',
    reason: 'ok',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'homepage-redirect');
});

test('checkRedirectedToHomepage is silent when the link was always a homepage', () => {
  const out = checkRedirectedToHomepage('x', {
    url: 'https://sakuraramenhouse.com',
    alive: true, status: 200,
    finalUrl: 'https://sakuraramenhouse.com/',
    reason: 'ok',
  });
  assert.deepEqual(out, []);
});

test('checkOrderingLinks skips nulls and needs at least one usable link', async () => {
  const none = await checkOrderingLinks('monday.dinner',
    { doordash: null, ubereats: null, grubhub: null, direct: null },
    { probeNetwork: false });
  assert.equal(none.length, 1);
  assert.equal(none[0].code, 'no-usable-link');

  const some = await checkOrderingLinks('monday.dinner',
    { doordash: 'https://www.doordash.com/store/x-1/', ubereats: null, grubhub: null, direct: null },
    { probeNetwork: false });
  assert.deepEqual(some, []);
});

test('a bot wall is unverifiable, not dead', async () => {
  // doordash.com 403s every non-browser request, homepage included. Grading that
  // as a dead link would fail every DoorDash link the app has ever produced.
  const out = await checkOrderingLinks('monday.dinner',
    { doordash: `${base}/walled`, ubereats: null, grubhub: null, direct: null },
    { probeNetwork: true });
  const codes = out.map(f => f.code);
  assert.ok(codes.includes('link-unverifiable'));
  assert.ok(!codes.includes('dead-link'));
  assert.equal(out.find(f => f.code === 'link-unverifiable')!.severity, 'warn');
});

test('a 404 is still a dead link, not a bot wall', async () => {
  const out = await checkOrderingLinks('monday.dinner',
    { direct: `${base}/gone` },
    { probeNetwork: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'dead-link');
  assert.equal(out[0].severity, 'error');
});

test('checkOrderingLinks treats the literal string "null" as absent', async () => {
  // normalizeOrderingLinks in shared.ts exists because the model emits this.
  const out = await checkOrderingLinks('monday.dinner',
    { doordash: 'null', ubereats: null, grubhub: null, direct: null } as any,
    { probeNetwork: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'no-usable-link');
});
