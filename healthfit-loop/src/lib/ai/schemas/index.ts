import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

/**
 * Build an OpenAI strict-mode `response_format` from a Zod schema.
 *
 * Uses the openai SDK's own helper rather than a direct zod-to-json-schema
 * call: it applies the required/nullable/additionalProperties transformation
 * strict mode needs, and throws at build time on `.optional()` without
 * `.nullable()` instead of letting the API reject the request at runtime.
 *
 * Pass the unrefined object schema — a `.superRefine()` wrapper is a ZodEffects
 * and carries no JSON Schema of its own. Refinements are local-only anyway.
 */
export function toStrictJsonSchema(name: string, schema: z.ZodType) {
  return zodResponseFormat(schema, name);
}

export * from './shared';
export * from './workout';
export * from './meals';
export * from './recipe';
export * from './restaurants';
