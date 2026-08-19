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
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
      prompt_tokens_details?: { cached_tokens?: number };
    };
    choices?: Array<{ finish_reason?: string | null }>;
  } | null | undefined;

  const out = d?.usage?.completion_tokens ?? -1;
  const inTok = d?.usage?.prompt_tokens ?? -1;
  const finish = d?.choices?.[0]?.finish_reason ?? 'unknown';
  const pct = out >= 0 ? Math.round((out / ceiling) * 100) : -1;

  // On a gpt-5 model `completion_tokens` already contains the reasoning tokens,
  // so `out` alone reads as a bigger answer than the user actually received.
  // Both draw from the same ceiling, which is why `pct` still uses the total —
  // but the split is what tells you whether to raise the cap or lower the effort.
  const reasoning = d?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  // Prompt-prefix cache hits. Zero on a prompt whose per-user data precedes its
  // static block, which is the failure this number exists to make visible.
  const cached = d?.usage?.prompt_tokens_details?.cached_tokens ?? 0;

  console.log(
    `[USAGE] ${site} out=${out}/${ceiling} (${pct}%)` +
      (reasoning > 0 ? ` [visible=${out - reasoning} reasoning=${reasoning}]` : '') +
      ` in=${inTok}` +
      (cached > 0 ? ` (cached=${cached}, ${Math.round((cached / inTok) * 100)}%)` : '') +
      ` finish=${finish}` +
      (finish === 'length' ? '  ⚠️ TRUNCATED' : '')
  );
}
