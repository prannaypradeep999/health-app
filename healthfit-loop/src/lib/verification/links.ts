import { verdict, type Verdict } from './types';
import { parseHttpUrl, isUsableLink } from '@/lib/external/link-check';

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

/**
 * R5: did the search that produced this restaurant actually retrieve this host?
 *
 * Host filtering (hostMatchesPlatform) asks "is this a grubhub URL", and a
 * fabricated one is. Probing (verifyLinks) asks "does it resolve", and platform
 * 404s frequently render as a soft 200. This asks the only question that
 * separates a real link from an invented one that happens to look right.
 */
export function verifyOrderingLinks(
  target: string,
  links: Record<string, unknown>,
  sourceHosts: string[] | undefined
): Verdict[] {
  const out: Verdict[] = [];
  const known = sourceHosts ? new Set(sourceHosts.map(bareHost)) : null;

  for (const [platform, raw] of Object.entries(links ?? {})) {
    // isUsableLink rejects null, '', whitespace and the literal string "null" —
    // the last of which is truthy and once reached the UI as an enabled
    // "Order Now" button pointing nowhere.
    if (!isUsableLink(raw)) continue;

    const where = `${target}.orderingLinks.${platform}`;
    if (!known) {
      out.push(verdict('R5-link-corroborated', where, 'unchecked', raw, 'no search sources available'));
      continue;
    }

    const url = parseHttpUrl(raw);
    if (!url) {
      out.push(verdict('R5-link-corroborated', where, 'contradicted', raw, 'not a parseable http(s) URL'));
      continue;
    }

    const host = bareHost(url.hostname);
    out.push(known.has(host)
      ? verdict('R5-link-corroborated', where, 'verified', raw, `${host} was among the search sources`)
      : verdict('R5-link-corroborated', where, 'contradicted', raw, `${host} is not among the ${known.size} hosts the search retrieved`));
  }

  return out;
}
