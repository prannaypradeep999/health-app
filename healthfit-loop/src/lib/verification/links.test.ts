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

test('bare prose never reaches a verdict — isUsableLink rejects it upstream', () => {
  assert.equal(verifyOrderingLinks('w', { grubhub: 'not a url' }, hosts).length, 0);
});

test('a URL-shaped string that will not parse is contradicted, not skipped', () => {
  // Passes isUsableLink's /^https?:\/\/\S+$/ but throws in `new URL`.
  const vs = verifyOrderingLinks('w', { grubhub: 'https://[bad' }, hosts);
  assert.equal(vs[0].status, 'contradicted');
  assert.match(vs[0].evidence, /parseable/);
});

test('without source hosts every link is unchecked, never verified', () => {
  const vs = verifyOrderingLinks('w', { grubhub: 'https://www.grubhub.com/x' }, undefined);
  assert.equal(vs[0].status, 'unchecked');
});

test('www. and case are ignored when comparing hosts', () => {
  const vs = verifyOrderingLinks('w', { direct: 'https://WWW.Fanoossf.com/menu' }, hosts);
  assert.equal(vs[0].status, 'verified');
});

test('an empty links object produces no verdicts', () => {
  assert.equal(verifyOrderingLinks('w', {}, hosts).length, 0);
});

test('each platform gets its own targeted verdict', () => {
  const vs = verifyOrderingLinks('mon.lunch.primary', {
    grubhub: 'https://www.grubhub.com/a',
    doordash: 'https://www.doordash.com/b',
  }, hosts);
  assert.equal(vs.length, 2);
  assert.ok(vs.some(v => v.target.endsWith('.grubhub') && v.status === 'verified'));
  assert.ok(vs.some(v => v.target.endsWith('.doordash') && v.status === 'contradicted'));
});
