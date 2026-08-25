/**
 * Shared vocabulary for the generation eval harness.
 *
 * A Finding is the unit the harness gates on. `code` is stable across runs so
 * two bench results can be diffed by code rather than by prose.
 */

/**
 * GROUNDING is the odd one out and deliberately so. The other four ask whether
 * an answer is internally coherent; GROUNDING asks whether it is traceable to
 * something outside the model. A plan can score clean on all four and still be
 * confidently invented.
 */
export type Family = 'COMPLETENESS' | 'ARITHMETIC' | 'ADHERENCE' | 'LINKS' | 'GROUNDING';

export type Severity = 'error' | 'warn';

export interface Finding {
  family: Family;
  severity: Severity;
  /** Stable identifier, e.g. 'atwater-mismatch'. Groups findings across runs. */
  code: string;
  /** Path into the payload, e.g. 'monday.dinner.primary'. */
  where: string;
  message: string;
}

export interface CheckResult {
  /** One line for the console, replacing the old `inspect` return value. */
  summary: string;
  findings: Finding[];
}

export function finding(
  family: Family, severity: Severity, code: string, where: string, message: string
): Finding {
  return { family, severity, code, where, message };
}

/** Count findings by family and severity, for the results table. */
export function tally(findings: Finding[]): Record<Family, { error: number; warn: number }> {
  const out = {
    COMPLETENESS: { error: 0, warn: 0 },
    ARITHMETIC: { error: 0, warn: 0 },
    ADHERENCE: { error: 0, warn: 0 },
    LINKS: { error: 0, warn: 0 },
    GROUNDING: { error: 0, warn: 0 },
  } as Record<Family, { error: number; warn: number }>;
  for (const f of findings) out[f.family][f.severity]++;
  return out;
}
