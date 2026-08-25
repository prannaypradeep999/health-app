export interface SlotRef {
  day?: string;
  mealType?: string;
}

export interface CompletenessReport {
  status: 'complete' | 'partial' | 'empty';
  requestedSlots: number;
  deliveredSlots: number;
  missingSlots: string[];
  reasons: string[];
}

const key = (s: SlotRef) => `${String(s.day ?? '').toLowerCase()}|${String(s.mealType ?? '').toLowerCase()}`;

/**
 * What the user asked for versus what they got, in a form the response can
 * carry.
 *
 * The route had no vocabulary for "partial": a short week logged a
 * console.error and returned success:true, a budget exhaustion produced a
 * response identical to having had nothing to generate, and a zero-meal run
 * also returned success:true. Three findings, one missing concept.
 *
 * Matching is by slot identity rather than by count. `delivered.length >=
 * requested.length` is the obvious test and it is wrong — the model can
 * substitute Tuesday dinner for the Monday lunch it dropped, and a count check
 * calls that complete.
 */
export function summarizeCompleteness(input: {
  requested: SlotRef[];
  delivered: SlotRef[];
  reasons?: string[];
}): CompletenessReport {
  const deliveredKeys = new Set(input.delivered.map(key));
  const missingSlots = input.requested.map(key).filter((k) => !deliveredKeys.has(k));

  const status: CompletenessReport['status'] =
    input.requested.length === 0 ? 'complete'
    : input.delivered.length === 0 ? 'empty'
    : missingSlots.length === 0 ? 'complete'
    : 'partial';

  return {
    status,
    requestedSlots: input.requested.length,
    deliveredSlots: input.delivered.length,
    missingSlots,
    reasons: input.reasons ?? [],
  };
}
