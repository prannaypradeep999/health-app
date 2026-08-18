/**
 * One grep-able line per model call: `grep '\[USAGE\]' <logs>`.
 *
 * `pct` is what matters before enabling strict mode. Grammar-constrained
 * decoding turns a truncated response from a partially-salvageable one into a
 * hard schema failure, so a site sitting near its ceiling needs more headroom
 * or less per-call scope first.
 */
export function logUsage(site: string, ceiling: number, data: unknown): void {
  const d = data as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ finish_reason?: string | null }>;
  } | null | undefined;

  const out = d?.usage?.completion_tokens ?? -1;
  const inTok = d?.usage?.prompt_tokens ?? -1;
  const finish = d?.choices?.[0]?.finish_reason ?? 'unknown';
  const pct = out >= 0 ? Math.round((out / ceiling) * 100) : -1;

  console.log(
    `[USAGE] ${site} out=${out}/${ceiling} (${pct}%) in=${inTok} finish=${finish}` +
      (finish === 'length' ? '  ⚠️ TRUNCATED' : '')
  );
}
