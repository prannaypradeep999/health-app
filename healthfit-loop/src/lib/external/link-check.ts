/**
 * Link verification for anything this app is about to show a user.
 *
 * B1: before this file, `grep -rn "method: 'HEAD'" src/ scripts/` returned
 * nothing. Every ordering link the UI rendered had been produced by a model,
 * passed a regex that checks it looks like a URL, and shipped. B6: nothing
 * checked that the value under `doordash` was on doordash.com.
 *
 * The primitives live in src/ rather than in the eval harness because both need
 * them and a second copy would drift — a harness measuring a different
 * implementation from production measures nothing. scripts/eval/links.ts
 * imports from here; nothing here imports from scripts/.
 */

export interface LinkVerdict {
  url: string;
  alive: boolean;
  status: number | null;
  finalUrl: string | null;
  reason: string;
}

/**
 * Anchored with (^|\.) so that `doordash.com.evil.example` does not match — a
 * bare `endsWith('doordash.com')` would accept it, and so would a substring
 * test against `mydoordash.com`.
 *
 * `direct` is absent on purpose: a restaurant's own site can be any domain, so
 * there is nothing to allow-list. Its correctness comes from liveness and from
 * being seeded off the Google Places `website` field, not host.
 */
export const PLATFORM_HOSTS: Record<string, RegExp> = {
  doordash: /(^|\.)doordash\.com$/i,
  ubereats: /(^|\.)ubereats\.com$/i,
  grubhub: /(^|\.)grubhub\.com$/i,
};

export function parseHttpUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** The same test the restaurant route already applies, in one place. */
export const isUsableLink = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());

/**
 * HEAD first because it is cheap, then GET on any status that smells like
 * "this server does not implement HEAD" — 405 and 501 are the standard ones,
 * and some CDNs answer 403. Treating those as dead would fail URLs that work
 * perfectly in a browser.
 */
export async function probe(url: string, timeoutMs = 8000): Promise<LinkVerdict> {
  if (!parseHttpUrl(url)) {
    return { url, alive: false, status: null, finalUrl: null, reason: 'unsupported scheme or malformed URL' };
  }

  const attempt = async (method: 'HEAD' | 'GET'): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'healthfit-loop/1.0' },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await attempt('HEAD');
    if ([403, 405, 501].includes(res.status)) res = await attempt('GET');
    return {
      url,
      alive: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      reason: res.ok ? 'ok' : `HTTP ${res.status}`,
    };
  } catch (e) {
    const reason = e instanceof Error && e.name === 'AbortError'
      ? `timed out after ${timeoutMs}ms`
      : `network error: ${e instanceof Error ? e.message : String(e)}`;
    return { url, alive: false, status: null, finalUrl: null, reason };
  }
}

/** Unknown platforms — `direct`, and anything added later — are unconstrained. */
export function hostMatchesPlatform(platform: string, url: string): boolean {
  const expected = PLATFORM_HOSTS[platform];
  if (!expected) return true;
  const parsed = parseHttpUrl(url);
  return parsed ? expected.test(parsed.hostname) : false;
}

/**
 * Did a deep link quietly become a homepage?
 *
 * This is the failure a liveness check alone misses: the model invents a store
 * path, the platform 302s the unknown path to its front page, and the response
 * is a cheerful 200. The link is alive and useless — an Order Now button that
 * drops the user on doordash.com with no idea what they were ordering.
 */
export function isHomepageRedirect(verdict: LinkVerdict): boolean {
  if (!verdict.alive || !verdict.finalUrl) return false;
  const from = parseHttpUrl(verdict.url);
  const to = parseHttpUrl(verdict.finalUrl);
  if (!from || !to) return false;
  const hadPath = from.pathname.replace(/\/+$/, '').length > 0;
  const landedAtRoot = to.pathname.replace(/\/+$/, '').length === 0;
  return hadPath && landedAtRoot;
}

/**
 * The production entry point: given an orderingLinks object, return only the
 * entries a user can actually be sent to.
 *
 * Rejected keys are dropped rather than set to null, matching what
 * processWithGPT4's `cleanedLinks` already does — callers downstream count
 * `Object.keys(...)`, and the failure paths in that file already return `{}`.
 *
 * `prober` is injectable so the unit tests never touch the network. Production
 * always uses the default.
 */
export async function verifyLinks(
  links: Record<string, string | null | undefined>,
  opts: { prober?: (url: string) => Promise<LinkVerdict>; timeoutMs?: number } = {}
): Promise<Record<string, string>> {
  const prober = opts.prober ?? ((u: string) => probe(u, opts.timeoutMs));

  // Host is checked first because it is free. Spending an HTTP request to
  // reject a link we can already prove is on the wrong domain is waste inside
  // a route that shares a 52-second budget with everything else.
  const candidates = Object.entries(links ?? {})
    .filter(([, v]) => isUsableLink(v))
    .map(([platform, v]) => [platform, (v as string).trim()] as const)
    .filter(([platform, url]) => hostMatchesPlatform(platform, url));

  const verdicts = await Promise.all(candidates.map(([, url]) => prober(url)));

  const out: Record<string, string> = {};
  candidates.forEach(([platform, url], i) => {
    const v = verdicts[i];
    if (v.alive && !isHomepageRedirect(v)) out[platform] = url;
  });
  return out;
}
