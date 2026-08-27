import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, HttpError, TimeoutError } from './retry';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a timeout is reported as a TimeoutError carrying the budget it was given', async () => {
  let caught: unknown;
  const result = await withRetry(
    async () => {
      await sleep(200);
      return 'never';
    },
    { timeoutMs: 30, maxAttempts: 1, context: 'probe', onRetry: (_a, e) => { caught = e; } }
  );

  assert.equal(result.success, false);
  assert.match(result.error!, /Operation timed out after 30ms/);
  assert.equal(caught, undefined);
});

test('withTimeout throws TimeoutError, not a bare Error', async () => {
  let seen: unknown;
  await withRetry(
    async () => { await sleep(200); return 'never'; },
    {
      timeoutMs: 30,
      maxAttempts: 2,
      initialDelayMs: 1,
      maxTotalMs: 10_000,
      onRetry: (_attempt, error) => { seen = error; }
    }
  );

  assert.ok(seen instanceof TimeoutError, `expected TimeoutError, got ${(seen as Error)?.name}`);
  assert.equal((seen as TimeoutError).timeoutMs, 30);
});

// The two tests below throw TimeoutError directly rather than sleeping out a
// real one. `MIN_USEFUL_ATTEMPT_MS` is 5000, so any budget small enough to
// exercise this quickly is refused before the first attempt even starts, and a
// budget large enough costs six seconds of wall clock per assertion. Throwing
// the error withTimeout would have thrown tests the same branch — the guard
// reads `instanceof TimeoutError` and its `timeoutMs`, both of which are real
// here — without paying for the wait.

test('does not retry a timeout when the next attempt would get less time', async () => {
  let attempts = 0;

  // Attempt 1 was given 45s and expired. Only ~6s of the budget remains, which
  // is more than MIN_USEFUL_ATTEMPT_MS and so passes the older check — but it
  // cannot finish work that 45s could not. This is the recipe route's exact
  // shape before the fix.
  const result = await withRetry(
    async () => {
      attempts++;
      throw new TimeoutError(45_000);
    },
    { timeoutMs: 45_000, maxAttempts: 3, initialDelayMs: 2000, maxTotalMs: 6_000, context: 'futile' }
  );

  assert.equal(result.success, false);
  assert.match(result.error!, /timed out after 45000ms/);
  assert.equal(attempts, 1, 'should not have started a doomed second attempt');
});

test('still retries a timeout when the next attempt gets at least as much time', async () => {
  let attempts = 0;

  // A short attempt inside a generous budget: the retry gets far more than the
  // 100ms that just expired, so it is worth making.
  const result = await withRetry(
    async () => {
      attempts++;
      if (attempts === 1) throw new TimeoutError(100);
      return 'second time lucky';
    },
    { timeoutMs: 100, maxAttempts: 3, initialDelayMs: 1, maxTotalMs: 20_000, context: 'worth-retrying' }
  );

  assert.equal(result.success, true);
  assert.equal(result.data, 'second time lucky');
  assert.equal(attempts, 2);
});

test('a fast server error is still retried inside a budget a timeout could not use', async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      if (attempts === 1) throw new HttpError(503, 'upstream wobbled');
      return 'recovered';
    },
    { timeoutMs: 50_000, maxAttempts: 2, initialDelayMs: 1, maxTotalMs: 52_000, context: 'fast-500' }
  );

  assert.equal(result.success, true);
  assert.equal(result.data, 'recovered');
  assert.equal(attempts, 2);
});

test('a 4xx is not retried at all', async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      throw new HttpError(400, 'malformed request');
    },
    { timeoutMs: 1000, maxAttempts: 3, initialDelayMs: 1, maxTotalMs: 10_000, context: 'client-error' }
  );

  assert.equal(result.success, false);
  assert.equal(attempts, 1);
});

test('the recipe route configuration spends its budget on one usable attempt', async () => {
  // The shape the recipe route now asks for: 50s per attempt inside a 52s
  // budget. A slow-but-finishing call must succeed rather than be cut at 45s.
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      await sleep(120);
      return 'recipe';
    },
    { timeoutMs: 50_000, maxAttempts: 2, initialDelayMs: 2000, maxTotalMs: 52_000, context: 'recipe-shape' }
  );

  assert.equal(result.success, true);
  assert.equal(attempts, 1);
});
