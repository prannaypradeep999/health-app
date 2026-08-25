/**
 * Four states, not two. `unverified` means we had no evidence either way —
 * the honest state for a macro estimate no upstream source supplied.
 * `unchecked` means the verifier itself did not run. Collapsing them would let
 * a crash read as a clean bill of health.
 */
export type VerdictStatus = 'verified' | 'unverified' | 'contradicted' | 'unchecked';

export interface Verdict {
  /** Stable id, e.g. 'R2-price-matches'. Diffable across runs. */
  check: string;
  /** Path into the payload, e.g. 'monday.lunch.primary.price'. */
  target: string;
  status: VerdictStatus;
  /** What the generated payload said. */
  claim: string;
  /** What the evidence said, or why there was none. */
  evidence: string;
  /** The URL that grounds the evidence, when one exists. */
  source: string | null;
}

export function verdict(
  check: string,
  target: string,
  status: VerdictStatus,
  claim: string,
  evidence: string,
  source: string | null = null
): Verdict {
  return { check, target, status, claim, evidence, source };
}

export type CheckMode = 'off' | 'shadow' | 'enforce';

/**
 * Three states so a check can be built, observed and only then trusted.
 * `shadow` is the default and the shipping state: verdicts are computed and
 * persisted but change nothing the user sees. An unrecognised value is treated
 * as `shadow` — a typo in an env var must not silently disable a check, nor
 * silently promote one to changing output.
 */
export function checkMode(id: string): CheckMode {
  const raw = process.env[`VERIFY_${id}`];
  return raw === 'off' || raw === 'enforce' ? raw : 'shadow';
}

export interface VerificationReport {
  verdicts: Verdict[];
  counts: Record<VerdictStatus, number>;
  /** ISO timestamp, so a stored report can be aged out. */
  ranAt: string;
}

export function summarize(verdicts: Verdict[]): Record<VerdictStatus, number> {
  const counts: Record<VerdictStatus, number> = {
    verified: 0, unverified: 0, contradicted: 0, unchecked: 0,
  };
  for (const v of verdicts) counts[v.status]++;
  return counts;
}

export function report(verdicts: Verdict[]): VerificationReport {
  return { verdicts, counts: summarize(verdicts), ranAt: new Date().toISOString() };
}
