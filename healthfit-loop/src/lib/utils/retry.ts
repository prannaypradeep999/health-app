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
  context?: string; // For logging
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalTimeMs: number;
}

const defaultOptions: Required<Omit<RetryOptions, 'onRetry' | 'context'>> = {
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

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const data = await withTimeout(fn, opts.timeoutMs);
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
 * Preset configurations for different API types
 */
export const RetryPresets = {
  // GPT/OpenAI calls - longer delays and timeouts, they can be slow
  gpt: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    timeoutMs: 240000 // 240s timeout per attempt - workout and meal generation need more time
  },
  // Perplexity calls - similar to GPT but slightly faster
  perplexity: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 12000,
    backoffMultiplier: 2,
    timeoutMs: 75000 // 75s timeout per attempt - complex searches take time
  },
  // Pexels image calls - faster, less critical
  pexels: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    timeoutMs: 30000 // 30s timeout per attempt
  },
  // Google Places - usually fast
  googlePlaces: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    timeoutMs: 20000 // 20s timeout per attempt
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