/**
 * Central model configuration.
 * Roles, not model names, so vendor/model migration is a one-line change.
 */

export const MODELS = {
  /** Short prose, chat, light JSON. Latency-sensitive, high volume. */
  FAST: process.env.AI_MODEL_FAST ?? 'gpt-4o-mini',
  /** Multi-step planning that sets structure for downstream calls. */
  PLANNING: process.env.AI_MODEL_PLANNING ?? 'gpt-4o',
  /** Large structured JSON generation. Output-token heavy. */
  DETAIL: process.env.AI_MODEL_DETAIL ?? 'gpt-4o',
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
