/**
 * One greppable line per generation phase boundary.
 *
 * Reading a production run used to mean scrolling thousands of interleaved
 * lines across five route prefixes ([SURVEY-API], [RESTAURANT-GENERATION],
 * [HOME-MEALS], ...), each with its own ad-hoc shape, while the dashboard's
 * 3s poll flooded the same stream. Confirming "did the relay complete?"
 * was not practically possible, which is how a broken chain survived a
 * deploy that was reported as verified.
 *
 * Every phase now emits `[TRACE] ...` with a stable key=value body, so:
 *
 *     vercel logs <url> | grep '\[TRACE\]'
 *
 * yields the whole run as an ordered timeline, and `run=<mealPlanId>` narrows
 * it to a single user's chain across all four function invocations.
 *
 * The meal plan id is the correlation key because it already flows through
 * every hop of the relay — no new plumbing, and it ties the log line back to
 * the row the audit script inspects.
 */

export type TraceEvent = 'start' | 'ok' | 'fail';

export type TracePhase =
  | 'survey'
  | 'restaurants'
  | 'home-meals'
  | 'groceries'
  | 'workouts'
  | 'chat';

export interface TraceFields {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Build the log line. Pure, so the format is testable without capturing
 * stdout — the format is the contract the post-run review depends on.
 *
 * Values are rendered as `key=value` with no quoting: keep them short and
 * space-free. Undefined and null fields are dropped rather than printed as
 * "undefined", which is noise in a grep.
 */
export function formatTrace(
  runId: string | null | undefined,
  phase: TracePhase,
  event: TraceEvent,
  fields: TraceFields = {}
): string {
  const parts = [`run=${runId || 'unknown'}`, `phase=${phase}`, `event=${event}`];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(`${key}=${String(value).replace(/\s+/g, '_')}`);
  }

  return `[TRACE] ${parts.join(' ')}`;
}

/**
 * Emit a phase boundary. Failures go to stderr so they surface in Vercel's
 * error filter as well as the full stream.
 */
export function trace(
  runId: string | null | undefined,
  phase: TracePhase,
  event: TraceEvent,
  fields: TraceFields = {}
): void {
  const line = formatTrace(runId, phase, event, fields);
  if (event === 'fail') console.error(line);
  else console.log(line);
}

/**
 * Wrap a phase so its duration and outcome are recorded whatever happens.
 *
 * Rethrows: this is instrumentation, not error handling. A phase that was
 * going to fail still fails, it just says so in the timeline first.
 */
export async function tracePhase<T>(
  runId: string | null | undefined,
  phase: TracePhase,
  fn: () => Promise<T>,
  startFields: TraceFields = {}
): Promise<T> {
  const started = Date.now();
  trace(runId, phase, 'start', startFields);
  try {
    const result = await fn();
    trace(runId, phase, 'ok', { ms: Date.now() - started });
    return result;
  } catch (error) {
    trace(runId, phase, 'fail', {
      ms: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    throw error;
  }
}
