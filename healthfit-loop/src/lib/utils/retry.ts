/**
 * Retry utility with exponential backoff for API calls
 * Used across all external API calls: GPT, Perplexity, Pexels, Google Places
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number; // Timeout per attempt
  /**
   * Ceiling for the whole retry sequence, backoff included.
   *
   * `timeoutMs * maxAttempts` used to be the real budget, which on the gpt
   * preset came to 720s inside a route the platform kills at 60s. The retry
   * loop would confidently begin a third 240s attempt that had no chance of
   * returning. With a deadline set we clamp each attempt to the time actually
   * left and refuse to start one that cannot finish, so the budget is spent on
   * attempts that can still produce an answer.
   */
  maxTotalMs?: number;
  context?: string; // For logging
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

/**
 * A retry that would get only a sliver of time left is not worth the backoff
 * sleep that precedes it — better to surface the previous error immediately.
 */
const MIN_USEFUL_ATTEMPT_MS = 5000;

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalTimeMs: number;
}

const defaultOptions: Required<Omit<RetryOptions, 'onRetry' | 'context' | 'maxTotalMs'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  timeoutMs: 30000 // 30s default timeout
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * An HTTP failure that carries its status code, so `withRetry` can tell a
 * client mistake from a transient server problem.
 *
 * Without this every `throw new Error('GPT error 401')` looked identical to a
 * 503, so a bad API key or a malformed request burned the full retry budget at
 * every call site — roughly 6s each, and `generate-home` chains five of them.
 */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Build an HttpError from a failed Response, including a short slice of the
 * body — the body is where OpenAI explains *why* a 400 happened.
 */
export async function httpErrorFrom(response: Response, context: string): Promise<HttpError> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 500);
  } catch {
    // Body already consumed or unreadable; the status alone still tells us
    // whether to retry, which is the part that matters here.
  }
  return new HttpError(response.status, `${context} failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
}

/**
 * 4xx means the request itself is wrong; sending it again unchanged cannot
 * help. 408 (timeout) and 429 (rate limit) are the two exceptions that do
 * clear on their own.
 */
function isRetryableError(error: unknown): boolean {
  const status = (error as HttpError | undefined)?.status;
  if (typeof status !== 'number') return true;
  if (status === 408 || status === 429) return true;
  return status < 400 || status >= 500;
}

/**
 * Wraps a function with a timeout
 */
async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new Error(`Operation timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Execute an async function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...defaultOptions, ...options };
  const context = opts.context || 'API call';
  const startTime = Date.now();
  let lastError: Error | null = null;
  let currentDelay = opts.initialDelayMs;

  const deadline = options.maxTotalMs !== undefined ? startTime + options.maxTotalMs : null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    // Never hand an attempt more time than the sequence has left, or it will be
    // the platform that kills the request rather than our own error handling.
    let attemptTimeout = opts.timeoutMs;
    if (deadline !== null) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_USEFUL_ATTEMPT_MS) {
        console.log(`[RETRY] ⌛ ${context} - ${remaining}ms left of the ${options.maxTotalMs}ms budget, stopping`);
        return {
          success: false,
          error: lastError?.message || `Retry budget of ${options.maxTotalMs}ms exhausted`,
          attempts: attempt - 1,
          totalTimeMs: Date.now() - startTime
        };
      }
      attemptTimeout = Math.min(attemptTimeout, remaining);
    }

    try {
      const data = await withTimeout(fn, attemptTimeout);
      if (attempt > 1) {
        console.log(`[RETRY] ✅ ${context} succeeded on attempt ${attempt}`);
      }
      return {
        success: true,
        data,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      console.log(`[RETRY] ⚠️ ${context} - Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}`);

      // A 4xx will fail identically on every subsequent attempt. Surface it now
      // rather than making the user wait out the backoff to learn the same thing.
      if (!isRetryableError(error)) {
        console.log(`[RETRY] ⛔ ${context} - ${(error as HttpError).status} is not retryable, giving up immediately`);
        return {
          success: false,
          error: lastError.message,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime
        };
      }

      // The caller aborted (not our timeout) — respect it instead of burning
      // the remaining attempts on a request nobody is waiting for.
      if (lastError.name === 'AbortError') {
        console.log(`[RETRY] ⛔ ${context} - aborted by caller, not retrying`);
        return {
          success: false,
          error: lastError.message,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime
        };
      }

      if (attempt < opts.maxAttempts) {
        // Sleeping out the backoff only to find there is no time left for the
        // attempt it precedes wastes the very budget we are trying to protect.
        if (deadline !== null && Date.now() + currentDelay + MIN_USEFUL_ATTEMPT_MS > deadline) {
          console.log(`[RETRY] ⌛ ${context} - no room for another attempt after a ${currentDelay}ms backoff, stopping`);
          return {
            success: false,
            error: lastError.message,
            attempts: attempt,
            totalTimeMs: Date.now() - startTime
          };
        }

        if (opts.onRetry) {
          opts.onRetry(attempt, lastError, currentDelay);
        }

        console.log(`[RETRY] ⏳ ${context} - Retrying in ${currentDelay}ms...`);
        await sleep(currentDelay);

        // Exponential backoff with cap
        currentDelay = Math.min(currentDelay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  console.log(`[RETRY] ❌ ${context} - All ${opts.maxAttempts} attempts failed`);
  return {
    success: false,
    error: lastError?.message || 'Unknown error after all retries',
    attempts: opts.maxAttempts,
    totalTimeMs: Date.now() - startTime
  };
}

/**
 * Every AI route declares `maxDuration = 60`. 60s is the Hobby ceiling and is
 * accepted on every Vercel plan, so it is the one value safe to hard-code
 * without knowing the plan; routes that declared nothing were silently getting
 * the platform default of 10-15s instead.
 *
 * `maxTotalMs` below leaves ~8s of that 60s for everything the route does
 * around the model call: parsing the request, Prisma reads and writes, image
 * lookups, and serialising the response.
 *
 * ⚠️ If meal or workout generation genuinely needs more than ~50s of model
 * time, no preset can fix that — 60s is a hard platform ceiling. That needs
 * either a Vercel plan with a higher limit (Pro allows 300s) or moving
 * generation to a background job the client polls. See ROUTE_BUDGET_MS users.
 */
const ROUTE_BUDGET_MS = 52_000;

/**
 * Preset configurations for different API types
 */
export const RetryPresets = {
  // GPT/OpenAI calls - longer delays and timeouts, they can be slow
  gpt: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 15000,
    // Was 240s, which multiplied out to a 720s sequence inside a 60s route.
    // The deadline below is the real limit; this just caps a single attempt.
    timeoutMs: 45000,
    backoffMultiplier: 2,
    maxTotalMs: ROUTE_BUDGET_MS
  },
  // Perplexity calls - similar to GPT but slightly faster
  perplexity: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 12000,
    // Was 75s — longer than the 60s route that contains it, so a single
    // attempt could never have timed out on its own terms.
    timeoutMs: 45000,
    backoffMultiplier: 2,
    maxTotalMs: ROUTE_BUDGET_MS
  },
  // Pexels image calls - faster, less critical
  pexels: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    timeoutMs: 20000,
    // Decorative imagery must never eat the budget the meal itself needs.
    maxTotalMs: 25_000
  },
  // Google Places - usually fast
  googlePlaces: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    timeoutMs: 20000,
    maxTotalMs: 25_000
  }
};

/**
 * Helper for GPT API calls
 */
export function withGPTRetry<T>(fn: (signal: AbortSignal) => Promise<T>, context: string): Promise<RetryResult<T>> {
  return withRetry(fn, { ...RetryPresets.gpt, context: `GPT: ${context}` });
}

/**
 * Helper for Perplexity API calls
 */
export function withPerplexityRetry<T>(fn: (signal: AbortSignal) => Promise<T>, context: string): Promise<RetryResult<T>> {
  return withRetry(fn, { ...RetryPresets.perplexity, context: `Perplexity: ${context}` });
}

/**
 * Helper for Pexels API calls
 */
export function withPexelsRetry<T>(fn: (signal: AbortSignal) => Promise<T>, context: string): Promise<RetryResult<T>> {
  return withRetry(fn, { ...RetryPresets.pexels, context: `Pexels: ${context}` });
}

/**
 * Helper for Google Places API calls
 */
export function withPlacesRetry<T>(fn: (signal: AbortSignal) => Promise<T>, context: string): Promise<RetryResult<T>> {
  return withRetry(fn, { ...RetryPresets.googlePlaces, context: `Places: ${context}` });
}