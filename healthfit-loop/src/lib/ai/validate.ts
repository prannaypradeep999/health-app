import { z } from 'zod';

export type ParseFailureReason = 'refusal' | 'truncated' | 'invalid_json' | 'schema';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: ParseFailureReason; detail: string; raw: string };

/** The subset of an OpenAI choice this helper needs. Pass `response.choices[0]`. */
export interface ModelChoice {
  message?: { content?: string | null; refusal?: string | null } | null;
  finish_reason?: string | null;
}

/**
 * Parse and validate a model JSON response.
 *
 * Order matters. A refusal arrives as `finish_reason: 'stop'` with `content: null`
 * and a populated `message.refusal`, so checking the finish reason alone reads it
 * as a success and then parses null. Truncation is checked before parsing because
 * under grammar-constrained decoding a cut-off response is a hard failure, not
 * something to salvage.
 */
export function parseModelJson<T>(
  schema: z.ZodType<T>,
  content: string | null | undefined,
  finishReason: string | null | undefined,
  context: string,
  refusal?: string | null
): ParseResult<T> {
  if (refusal) {
    console.error(`[VALIDATE] ${context}: model refused — ${refusal}`);
    return { ok: false, reason: 'refusal', detail: refusal, raw: '' };
  }
  if (finishReason === 'length') {
    console.error(`[VALIDATE] ${context}: truncated (finish_reason=length)`);
    return { ok: false, reason: 'truncated', detail: 'max_tokens reached', raw: content ?? '' };
  }
  if (finishReason === 'content_filter') {
    console.error(`[VALIDATE] ${context}: content filter`);
    return { ok: false, reason: 'refusal', detail: 'content filter', raw: content ?? '' };
  }
  if (!content) {
    console.error(`[VALIDATE] ${context}: empty content (finish_reason=${finishReason})`);
    return { ok: false, reason: 'invalid_json', detail: 'empty content', raw: '' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error(`[VALIDATE] ${context}: JSON.parse failed`, content.slice(0, 500));
    return { ok: false, reason: 'invalid_json', detail: String(e), raw: content };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    console.error(`[VALIDATE] ${context}: schema failed`, result.error.issues.slice(0, 5));
    return { ok: false, reason: 'schema', detail: result.error.message, raw: content };
  }
  return { ok: true, data: result.data };
}

/** Convenience wrapper for the common `response.choices[0]` shape. */
export function parseChoice<T>(
  schema: z.ZodType<T>,
  choice: ModelChoice | undefined,
  context: string
): ParseResult<T> {
  return parseModelJson(
    schema,
    choice?.message?.content,
    choice?.finish_reason,
    context,
    choice?.message?.refusal
  );
}

/** Enums are not capitalization-guaranteed by either vendor. Normalize at the boundary. */
export function normalizeEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[]
): T | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  return allowed.find(a => a.toLowerCase() === lowered) ?? null;
}
