import { test } from 'node:test';
import assert from 'node:assert/strict';
import { protectionBypassHeaders, resolveInternalBaseUrl } from './internal-fetch';

test('resolveInternalBaseUrl prefers the variable this project actually defines', () => {
  // The bug this guards: both relay call sites read NEXT_PUBLIC_BASE_URL, which
  // is not set on this project, so resolution silently fell through to
  // VERCEL_URL — a per-deployment hostname nothing else treats as the app URL.
  assert.equal(
    resolveInternalBaseUrl({
      NEXT_PUBLIC_APP_URL: 'https://fytr-app.vercel.app',
      NEXT_PUBLIC_BASE_URL: 'https://legacy.example.com',
      VERCEL_URL: 'fytr-abc123.vercel.app',
    }),
    'https://fytr-app.vercel.app'
  );
});

test('resolveInternalBaseUrl falls back to NEXT_PUBLIC_BASE_URL', () => {
  assert.equal(
    resolveInternalBaseUrl({
      NEXT_PUBLIC_BASE_URL: 'https://legacy.example.com',
      VERCEL_URL: 'fytr-abc123.vercel.app',
    }),
    'https://legacy.example.com'
  );
});

test('resolveInternalBaseUrl falls back to VERCEL_URL last, adding a scheme', () => {
  // VERCEL_URL is supplied without a scheme; fetch() rejects a scheme-less URL.
  assert.equal(
    resolveInternalBaseUrl({ VERCEL_URL: 'fytr-abc123.vercel.app' }),
    'https://fytr-abc123.vercel.app'
  );
});

test('resolveInternalBaseUrl leaves an explicit scheme alone', () => {
  assert.equal(
    resolveInternalBaseUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:4000' }),
    'http://localhost:4000'
  );
});

test('resolveInternalBaseUrl strips trailing slashes so paths do not double up', () => {
  assert.equal(
    resolveInternalBaseUrl({ NEXT_PUBLIC_APP_URL: 'https://fytr-app.vercel.app///' }),
    'https://fytr-app.vercel.app'
  );
});

test('resolveInternalBaseUrl falls back to localhost when nothing is configured', () => {
  assert.equal(resolveInternalBaseUrl({}), 'http://localhost:3000');
});

test('resolveInternalBaseUrl treats an empty string as unconfigured', () => {
  assert.equal(
    resolveInternalBaseUrl({ NEXT_PUBLIC_APP_URL: '', VERCEL_URL: 'fytr-abc123.vercel.app' }),
    'https://fytr-abc123.vercel.app'
  );
});

test('protectionBypassHeaders sends the secret as a header', () => {
  assert.deepEqual(protectionBypassHeaders('s3cret'), {
    'x-vercel-protection-bypass': 's3cret',
  });
});

test('protectionBypassHeaders sends nothing when there is no secret', () => {
  // An empty bypass header is rejected rather than ignored, so absence has to
  // mean "omit the header", not "send an empty one". This is the correct
  // behaviour locally and on a project with protection turned off.
  assert.deepEqual(protectionBypassHeaders(undefined), {});
  assert.deepEqual(protectionBypassHeaders(''), {});
});
