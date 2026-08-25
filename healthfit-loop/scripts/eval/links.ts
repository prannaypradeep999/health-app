import { finding, type Finding } from './types';

export interface LinkVerdict {
  url: string;
  alive: boolean;
  /** HTTP status of the final response, or null if the request never completed. */
  status: number | null;
  /** URL after redirects. Null when the request never completed. */
  finalUrl: string | null;
  reason: string;
}

/**
 * Registrable domain per ordering platform.
 *
 * Anchored with (^|\.) so that `doordash.com.evil.example` does not match — a
 * bare `endsWith('doordash.com')` would accept it.
 *
 * `direct` is absent on purpose: a restaurant's own site can be any domain, so
 * there is nothing to allow-list. Its correctness is checked by liveness and by
 * corroboration against the Google Places `website` field, not by host.
 */
export const PLATFORM_HOSTS: Record<string, RegExp> = {
  doordash: /(^|\.)doordash\.com$/i,
  ubereats: /(^|\.)ubereats\.com$/i,
  grubhub: /(^|\.)grubhub\.com$/i,
};

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Is this URL reachable?
 *
 * HEAD first because it is cheap, then GET on any 4xx that smells like "this
 * server does not implement HEAD" — 405 and 501 are the standard ones, and some
 * CDNs answer 403. Treating those as dead links would produce false failures on
 * URLs that work perfectly in a browser.
 */
export async function probe(url: string, timeoutMs = 8000): Promise<LinkVerdict> {
  const parsed = parse(url);
  if (!parsed) {
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
        headers: { 'User-Agent': 'healthfit-loop-eval/1.0' },
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

/** Is a platform link actually on that platform's domain? */
export function checkHost(where: string, platform: string, url: string): Finding[] {
  const expected = PLATFORM_HOSTS[platform];
  if (!expected) return [];
  const parsed = parse(url);
  if (!parsed) {
    return [finding('LINKS', 'error', 'malformed-url', where, `${platform}: not a usable URL — ${url}`)];
  }
  if (!expected.test(parsed.hostname)) {
    return [finding('LINKS', 'error', 'wrong-host', where,
      `${platform} link points at ${parsed.hostname}`)];
  }
  return [];
}

/**
 * Did a deep link quietly become a homepage?
 *
 * This is the specific failure mode a liveness check alone misses: the model
 * invents a store path, the platform 302s the unknown path to its front page,
 * and the response is a cheerful 200. The link is alive and useless.
 */
export function checkRedirectedToHomepage(where: string, verdict: LinkVerdict): Finding[] {
  if (!verdict.alive || !verdict.finalUrl) return [];
  const from = parse(verdict.url);
  const to = parse(verdict.finalUrl);
  if (!from || !to) return [];
  const hadPath = from.pathname.replace(/\/+$/, '').length > 0;
  const landedAtRoot = to.pathname.replace(/\/+$/, '').length === 0;
  if (hadPath && landedAtRoot) {
    return [finding('LINKS', 'error', 'homepage-redirect', where,
      `${verdict.url} redirected to the site root — the specific page does not exist`)];
  }
  return [];
}

/**
 * Statuses that mean "a bot wall answered", not "this page is missing".
 * 429 is here for the same reason as 403: it is about us, not about the URL.
 */
const BOT_WALL_STATUSES: number[] = [403, 429];

const isUsable = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());

/**
 * Full check of one orderingLinks object.
 *
 * `probeNetwork: false` runs only the offline checks (host allow-list, usable
 * count), which is what `--no-links` and the unit tests use.
 */
export async function checkOrderingLinks(
  where: string,
  links: Record<string, string | null>,
  opts: { probeNetwork?: boolean } = {}
): Promise<Finding[]> {
  const probeNetwork = opts.probeNetwork ?? true;
  const out: Finding[] = [];

  const usable = Object.entries(links ?? {}).filter(([, v]) => isUsable(v)) as Array<[string, string]>;

  if (usable.length === 0) {
    out.push(finding('LINKS', 'error', 'no-usable-link', where,
      'no orderable link on any platform — the Order Now button has nowhere to go'));
    return out;
  }

  for (const [platform, url] of usable) {
    out.push(...checkHost(where, platform, url));
  }

  if (!probeNetwork) return out;

  const verdicts = await Promise.all(usable.map(([, url]) => probe(url)));
  for (const [i, verdict] of verdicts.entries()) {
    const platform = usable[i][0];
    if (!verdict.alive) {
      // Measured 2026-08-24: doordash.com answers 403 to HEAD and to GET alike
      // for any non-browser User-Agent, on its homepage as readily as on a
      // nonexistent store path. Calling that "dead" would fail every DoorDash
      // link ever generated and drown the real dead ones. A bot wall says
      // nothing about whether the page exists, so it is a separate, softer
      // verdict — host checking is what carries these platforms.
      const [severity, code] = verdict.status !== null && BOT_WALL_STATUSES.includes(verdict.status)
        ? (['warn', 'link-unverifiable'] as const)
        : (['error', 'dead-link'] as const);
      out.push(finding('LINKS', severity, code, where,
        `${platform}: ${verdict.url} — ${verdict.reason}`));
      continue;
    }
    out.push(...checkRedirectedToHomepage(`${where}.${platform}`, verdict));
  }

  return out;
}
