/**
 * Concurrency limiting.
 *
 * Several vendors here cap concurrent connections per client independently of
 * any published rate limit, and they enforce it by queueing rather than by
 * rejecting. That failure mode is invisible from the outside: the request never
 * gets a socket, so it never arrives, so it never counts against quota and
 * never returns an error — it just sits there until our own abort timer fires
 * and reports a timeout.
 *
 * Measured against Pexels on 2026-08-18, one client, `per_page=1`:
 *
 *   concurrency=1    0/1   failed   median   686ms
 *   concurrency=10   1/10  failed   median   377ms
 *   concurrency=50  12/50  failed   median 12_407ms
 *   concurrency=150 66/150 failed   median 16_121ms
 *
 * Quota was untouched throughout (24855 of 25000 remaining) which is the tell:
 * the failures never reached the API. Retrying does not help, because the
 * retries join the same queue. The only fix is to stop issuing them.
 *
 * Capping concurrency alone turned out to be half the answer. Once requests
 * actually reached Pexels it answered `429 {"code":"Too Many Requests",
 * "message":"Throttle limit exceeded"}` — a short-window *rate* limit separate
 * from the monthly quota, and one that survives being spread across only two
 * connections (20 requests at concurrency 2 still took 14 rejections). So the
 * limiter gates on rate as well as parallelism.
 */

/**
 * Returns a function that runs at most `maxConcurrent` operations at a time.
 * Everything else waits in FIFO order.
 *
 * Wrap the limiter *outside* any retry/timeout helper, never inside it. A
 * timeout started before the slot is acquired is counting someone else's work,
 * which turns queue depth into spurious timeouts — exactly the bug this exists
 * to prevent.
 */
export function createLimiter(maxConcurrent: number, minIntervalMs = 0) {
  if (maxConcurrent < 1) throw new Error('maxConcurrent must be >= 1');

  let active = 0;
  const waiting: Array<() => void> = [];
  // Timestamp the next request is allowed to start. Reserved up front so
  // concurrent callers each claim a distinct slot rather than all reading the
  // same "last request" time and starting together.
  let nextSlotAt = 0;

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    // No await on this branch, so the check and the increment below are
    // atomic with respect to other callers and `active` cannot overshoot.
    if (active >= maxConcurrent) {
      await new Promise<void>(resolve => waiting.push(resolve));
    }
    active++;
    try {
      if (minIntervalMs > 0) {
        const now = Date.now();
        const startAt = Math.max(now, nextSlotAt);
        nextSlotAt = startAt + minIntervalMs;
        if (startAt > now) {
          await new Promise<void>(resolve => setTimeout(resolve, startAt - now));
        }
      }
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

export type Limiter = ReturnType<typeof createLimiter>;

/**
 * `Promise.all(items.map(fn))` with a ceiling on how many run at once.
 *
 * Results stay in input order, and a rejection propagates just as it would
 * from `Promise.all`, so this is a drop-in replacement at call sites that
 * fan out over an array.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  maxConcurrent: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = createLimiter(maxConcurrent);
  return Promise.all(items.map((item, i) => limit(() => fn(item, i))));
}
