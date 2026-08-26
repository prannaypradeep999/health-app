import { finding, type Finding } from './types';
import {
  probe, PLATFORM_HOSTS, parseHttpUrl, isUsableLink, isHomepageRedirect,
  type LinkVerdict,
} from '../../src/lib/external/link-check';
import { orderOptionsFor } from '../../src/lib/utils/restaurant-links';

export { probe, PLATFORM_HOSTS, type LinkVerdict };

/** Is a platform link actually on that platform's domain? */
export function checkHost(where: string, platform: string, url: string): Finding[] {
  const expected = PLATFORM_HOSTS[platform];
  if (!expected) return [];
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return [finding('LINKS', 'error', 'malformed-url', where, `${platform}: not a usable URL — ${url}`)];
  }
  if (!expected.test(parsed.hostname)) {
    return [finding('LINKS', 'error', 'wrong-host', where,
      `${platform} link points at ${parsed.hostname}`)];
  }
  return [];
}

export function checkRedirectedToHomepage(where: string, verdict: LinkVerdict): Finding[] {
  if (!isHomepageRedirect(verdict)) return [];
  return [finding('LINKS', 'error', 'homepage-redirect', where,
    `${verdict.url} redirected to the site root — the specific page does not exist`)];
}

/**
 * Statuses that mean "a bot wall answered", not "this page is missing".
 * 429 is here for the same reason as 403: it is about us, not about the URL.
 */
const BOT_WALL_STATUSES: number[] = [403, 429];

/**
 * Full check of one orderingLinks object.
 *
 * `probeNetwork: false` runs only the offline checks (host allow-list, usable
 * count), which is what `--no-links` and the unit tests use.
 */
export async function checkOrderingLinks(
  where: string,
  links: Record<string, string | null>,
  opts: { probeNetwork?: boolean; owner?: unknown } = {}
): Promise<Finding[]> {
  const probeNetwork = opts.probeNetwork ?? true;
  const out: Finding[] = [];

  const usable = Object.entries(links ?? {}).filter(([, v]) => isUsableLink(v)) as Array<[string, string]>;

  if (usable.length === 0) {
    // `no-usable-link` used to fire here unconditionally, and it described a
    // generator failure that had not happened: three upstream filters drop
    // unverifiable links for good reasons, so an empty object is the expected
    // outcome for a walk-in restaurant, not a fault. 14 of 140 benched options
    // tripped it.
    //
    // What the error was really claiming is that the button has nowhere to go.
    // That is now only true when the option has no name to search for either,
    // so it is what is checked. `owner` is the meal or restaurant record the
    // links came off; without one the old behaviour stands, since there is
    // nothing to derive a destination from.
    const locate = opts.owner === undefined ? [] : orderOptionsFor(opts.owner);
    if (locate.length > 0) {
      out.push(finding('LINKS', 'warn', 'locate-only', where,
        'no orderable link survived verification — the card falls back to a Maps search'));
      return out;
    }
    out.push(finding('LINKS', 'error', 'no-usable-link', where,
      'no orderable link on any platform, and no restaurant name to search for — ' +
      'the Order Now button has nowhere to go'));
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
