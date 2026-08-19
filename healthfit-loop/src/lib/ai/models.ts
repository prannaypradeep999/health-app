/**
 * Central model configuration.
 * Roles, not model names, so vendor/model migration is a one-line change.
 */

export const MODELS = {
  /** Short prose, chat, light JSON. Latency-sensitive, high volume. */
  FAST: process.env.AI_MODEL_FAST ?? 'gpt-5.4-mini',
  /** Multi-step planning that sets structure for downstream calls. */
  PLANNING: process.env.AI_MODEL_PLANNING ?? 'gpt-5.6-luna',
  /** Large structured JSON generation. Output-token heavy. */
  DETAIL: process.env.AI_MODEL_DETAIL ?? 'gpt-5.6-luna',
  /** Perplexity Sonar: live web search with citations. */
  SEARCH: process.env.AI_MODEL_SEARCH ?? 'sonar',
} as const;

export type ModelRole = keyof typeof MODELS;

/** Per-role output ceilings. See Task 5 measurements before changing these. */
export const MAX_TOKENS: Record<ModelRole, number> = {
  FAST: 2000,
  PLANNING: 4000,
  DETAIL: 8000,
  SEARCH: 4000,
};

/**
 * The gpt-5 line speaks a different request dialect than gpt-4o, and the
 * differences are hard 400s, not warnings. Measured against this account's
 * live model list on 2026-08-18:
 *
 *   - `max_tokens` is rejected by EVERY gpt-5 model, down to gpt-5.4-nano.
 *     The replacement is `max_completion_tokens`.
 *   - `temperature` is rejected by gpt-5.5 and the gpt-5.6 family ("only the
 *     default (1) value is supported") but ACCEPTED by the gpt-5.4 family.
 *     So this is a second, narrower axis — not the same cut as the token
 *     parameter. Assuming one family flag covers both is how you ship a
 *     migration that 400s on half the routes.
 *   - `reasoning_effort` accepts none | low | medium | high | xhigh across the
 *     whole gpt-5 line. `minimal` does NOT exist on any of them.
 *
 * `reasoning_tokens` bill at the output rate and are counted INSIDE
 * `completion_tokens`, so they eat the same budget the visible answer draws
 * from. At `low` the overhead measured 26-132 tokens on a 7-recipe generation,
 * which is why the existing per-call ceilings carry over roughly 1:1. Raise a
 * ceiling before raising an effort level.
 *
 * Under strict `json_schema` the response shape is grammar-enforced, so
 * swapping the model underneath cannot change the JSON the UI receives. That
 * is the whole reason this swap is safe to make without touching consumers.
 */
function isGpt5(model: string): boolean {
  return /^gpt-5/.test(model);
}

/** gpt-5.4 and its mini/nano variants still honour an explicit temperature. */
function acceptsTemperature(model: string): boolean {
  if (!isGpt5(model)) return true;
  return /^gpt-5\.4/.test(model);
}

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export interface TuningOptions {
  /**
   * Output ceiling, mapped to whichever parameter name the model accepts.
   * Omit to leave the call uncapped — correct for the few short-prose routes
   * that never set one, where inventing a ceiling would risk turning a
   * working call into a truncation (a total loss under strict mode).
   */
  maxTokens?: number;
  /** Dropped automatically for models that only accept the default. */
  temperature?: number;
  /** gpt-5 only. Defaults to 'low' — measured as the best latency//quality trade. */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Build the model-specific half of a chat/completions body.
 *
 * Spread it into the request alongside `model`, `messages` and
 * `response_format`, which are dialect-independent:
 *
 *   body: JSON.stringify({
 *     model: MODELS.DETAIL,
 *     messages,
 *     response_format: toStrictJsonSchema(...),
 *     ...tuning(MODELS.DETAIL, { maxTokens: 12000, temperature: 0.5 }),
 *   })
 */
export function tuning(model: string, opts: TuningOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (isGpt5(model)) {
    if (opts.maxTokens !== undefined) body.max_completion_tokens = opts.maxTokens;
    body.reasoning_effort = opts.reasoningEffort ?? 'low';
  } else if (opts.maxTokens !== undefined) {
    body.max_tokens = opts.maxTokens;
  }

  // A caller that asks for 0.3 on a model pinned to 1 gets its intent dropped
  // rather than a 400. The temperature was a nudge; the schema is the contract.
  if (opts.temperature !== undefined && acceptsTemperature(model)) {
    body.temperature = opts.temperature;
  }

  return body;
}
