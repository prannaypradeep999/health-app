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
 * Statuses that mean "we were not allowed to look", as distinct from "there is
 * nothing here".
 *
 * 403 and 429 are what a bot wall answers a datacenter IP, and a great many
 * small restaurant sites sit behind one. A timeout is the same class of
 * non-answer. None of them is evidence the page is dead, and treating them as
 * such is how a real restaurant's real website gets deleted — measured in
 * production, where La Oaxaqueña's only link was dropped as "unreachable" and
 * the restaurant was then served to the user three times with no way to order.
 */
const UNVERIFIABLE_STATUSES: readonly number[] = [401, 403, 405, 429, 451, 503];

/**
 * Did the probe fail to reach a conclusion, rather than reach a negative one?
 *
 * A 404 or 410 is a real answer and stays fatal. Only refusals and non-answers
 * count as unverifiable.
 */
export function isUnverifiable(verdict: LinkVerdict): boolean {
  if (verdict.alive) return false;
  if (verdict.status === null) return true; // timeout or network error
  return UNVERIFIABLE_STATUSES.includes(verdict.status);
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

/**
 * The platforms whose links we are willing to put in front of a user.
 *
 * Measured 2026-08-25 against the deployed function:
 *
 *   GET https://www.doordash.com/  -> 403   (our UA and a Chrome UA alike)
 *   GET https://www.ubereats.com/  -> 403
 *   GET https://www.grubhub.com/   -> 200
 *
 * DoorDash and Uber Eats refuse datacenter IPs outright, so `probe` cannot tell
 * a dead link from a live one it is not allowed to see. In production this
 * dropped every DoorDash link the model found — 3 of 3 in the observed run —
 * while logging them as "unreachable", which was a guess dressed as a fact.
 *
 * Rather than show links we cannot stand behind, we show the two we can check.
 * This is deliberately a policy switch and not a code change: when there is a
 * verification path for the other two (a residential egress, an official API,
 * or treating 403 as `unverified` rather than `contradicted` and labelling it
 * in the UI), add them back here and the rest of the pipeline follows.
 */
export const DISPLAYED_PLATFORMS: readonly string[] = ['grubhub', 'direct'];

/**
 * Null out every platform not in DISPLAYED_PLATFORMS, preserving the key set.
 *
 * Keys are preserved rather than deleted because `OrderingLinks` in
 * src/lib/ai/schemas/shared.ts is `.strict()` with all four keys required —
 * a missing key is a schema violation, whereas null is how that schema spells
 * "no link". The UI already skips nulls.
 */
export function suppressUndisplayablePlatforms(
  links: Record<string, string | null | undefined>
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [platform, url] of Object.entries(links ?? {})) {
    out[platform] = DISPLAYED_PLATFORMS.includes(platform) && isUsableLink(url) ? url.trim() : null;
  }
  return out;
}

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

/** Alias used where the intent is "did this source supply a link at all". */
export const isNonEmptyLink = isUsableLink;

/**
 * Combine two independently-derived views of the same restaurant's ordering
 * links, preferring the first and letting the second fill gaps.
 *
 * Only usable values are kept, and only platforms we would display, so a
 * merge can never widen what reaches the user beyond what the sources said.
 */
export function mergeOrderingLinks(
  preferred: Record<string, string | null | undefined> | null | undefined,
  fallback: Record<string, string | null | undefined> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of [fallback, preferred]) {
    for (const [platform, url] of Object.entries(source ?? {})) {
      if (isUsableLink(url)) out[platform] = url.trim();
    }
  }
  return out;
}

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
        // A browser-shaped UA, because the question being asked is "would this
        // work if the user clicked it", and the user clicks from a browser.
        // `healthfit-loop/1.0` was being refused by bot walls that serve the
        // same page happily to Chrome, which made the probe answer a different
        // question from the one we care about.
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
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
 * Host-level match against the URLs the search actually retrieved. Weak by
 * design: same host counts. An uncited link is one the model produced without
 * the search ever having visited that host.
 */
export function corroborate(
  links: Record<string, string | null | undefined>,
  citations: string[]
): Record<string, 'cited' | 'uncited'> {
  const citedHosts = new Set<string>();
  citations.forEach(c => {
    const parsed = parseHttpUrl(c);
    if (parsed) citedHosts.add(parsed.hostname.replace(/^www\./, ''));
  });

  const out: Record<string, 'cited' | 'uncited'> = {};
  Object.entries(links).forEach(([platform, url]) => {
    if (!url) return;
    const parsed = parseHttpUrl(url);
    if (!parsed) return;
    const host = parsed.hostname.replace(/^www\./, '');
    out[platform] = citedHosts.has(host) ? 'cited' : 'uncited';
  });
  return out;
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
export interface VerifyLinksOptions {
  prober?: (url: string) => Promise<LinkVerdict>;
  timeoutMs?: number;
  /**
   * Platforms whose links survive an inconclusive probe.
   *
   * Use this only where the link has provenance independent of the probe. The
   * caller passes `['direct']` when `direct` came from the Google Places
   * `website` field: Places looked the business up, so a bot wall refusing us
   * says nothing about whether the address is right. A model-guessed URL has no
   * such backing and must still prove itself.
   *
   * Leniency also skips the homepage-redirect test, which exists to catch
   * invented deep links. A restaurant's own site redirecting `/home` to `/` is
   * ordinary and not evidence of anything.
   */
  lenientPlatforms?: readonly string[];
}

export interface LinkResolution {
  links: Record<string, string>;
  /** Per-platform outcome, for logging. Keys match the input's usable entries. */
  outcomes: Record<string, { kept: boolean; reason: string }>;
}

export async function verifyLinksDetailed(
  links: Record<string, string | null | undefined>,
  opts: VerifyLinksOptions = {}
): Promise<LinkResolution> {
  const prober = opts.prober ?? ((u: string) => probe(u, opts.timeoutMs));
  const lenient = new Set(opts.lenientPlatforms ?? []);

  const usable = Object.entries(links ?? {})
    .filter(([, v]) => isUsableLink(v))
    .map(([platform, v]) => [platform, (v as string).trim()] as const);

  // Host is checked first because it is free. Spending an HTTP request to
  // reject a link we can already prove is on the wrong domain is waste inside
  // a route that shares a 52-second budget with everything else.
  const outcomes: Record<string, { kept: boolean; reason: string }> = {};
  const candidates = usable.filter(([platform, url]) => {
    const ok = hostMatchesPlatform(platform, url);
    if (!ok) outcomes[platform] = { kept: false, reason: 'wrong host for platform' };
    return ok;
  });

  const verdicts = await Promise.all(candidates.map(([, url]) => prober(url)));

  const out: Record<string, string> = {};
  candidates.forEach(([platform, url], i) => {
    const v = verdicts[i];
    const isLenient = lenient.has(platform);

    if (v.alive) {
      if (!isLenient && isHomepageRedirect(v)) {
        outcomes[platform] = { kept: false, reason: 'redirected to homepage' };
        return;
      }
      out[platform] = url;
      outcomes[platform] = { kept: true, reason: 'ok' };
      return;
    }

    if (isLenient && isUnverifiable(v)) {
      out[platform] = url;
      outcomes[platform] = { kept: true, reason: `unverified (${v.reason}), kept on provenance` };
      return;
    }

    outcomes[platform] = { kept: false, reason: v.reason };
  });

  return { links: out, outcomes };
}

export async function verifyLinks(
  links: Record<string, string | null | undefined>,
  opts: VerifyLinksOptions = {}
): Promise<Record<string, string>> {
  return (await verifyLinksDetailed(links, opts)).links;
}
