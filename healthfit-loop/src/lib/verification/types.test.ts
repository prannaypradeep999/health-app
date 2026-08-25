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
