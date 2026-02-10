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