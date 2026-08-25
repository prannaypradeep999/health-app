/**
 * GROUNDING: is the answer traceable to something outside the model?
 *
 * This module deliberately owns almost no logic. The checks themselves live in
 * `src/lib/verification/`, where the request path runs them; this file is the
 * adapter that lets the bench run the *same* code and report it as Findings.
 *
 * That sharing is the point. A harness with its own private idea of "the same
 * dish" would pass while production failed, and a green bench would tell you
 * nothing about the app.
 */

import { finding, type Finding, type Severity } from './types';
import { matchDish } from '../../src/lib/verification/restaurants';
import type { Verdict } from '../../src/lib/verification/types';
import type { SearchItem } from '../../src/lib/verification/receipt';
import { menuProseFixture } from '../fixtures/surveys';

/**
 * Map runtime verdicts onto bench findings.
 *
 * Only two of the four statuses produce a finding, and the split matters:
 *
 * - `contradicted` is an error. Evidence existed and the claim lost.
 * - `unchecked` is a warn. The verifier could not run — usually because hop 1's
 *   payload did not parse — which is a harness problem worth seeing but is not
 *   a claim about the generated content.
 * - `verified` and `unverified` produce nothing. `unverified` is not a failure;
 *   it is the honest "no evidence exists for this" that Tier C claims all get,
 *   and promoting it to a warn would drown every run in noise about prices no
 *   feed will ever confirm.
 */
export function verdictsToFindings(verdicts: Verdict[]): Finding[] {
  const out: Finding[] = [];
  for (const v of verdicts ?? []) {
    let severity: Severity;
    if (v.status === 'contradicted') severity = 'error';
    else if (v.status === 'unchecked') severity = 'warn';
    else continue;

    out.push(finding(
      'GROUNDING', severity, v.check, v.target,
      `${v.claim ? `"${v.claim}": ` : ''}${v.evidence}`
    ));
  }
  return out;
}

/**
 * The dishes and prices the menu prose fixture actually states.
 *
 * Parsed from the fixture rather than retyped beside it: a hand-maintained copy
 * would drift the first time someone edits the prose, and the check would then
 * be grading the model against a menu nobody showed it.
 *
 * The pattern reads "some words followed by a parenthesised dollar amount",
 * which is how every item in the fixture is written. Trailing qualifiers like
 * "six pieces" sit inside the parentheses in one case, hence the tolerance for
 * text before the `$`.
 */
export function parseProseMenu(prose: string): SearchItem[] {
  const out: SearchItem[] = [];
  const re = /([A-Z][A-Za-z' ]+?)\s*(?:,\s*[a-z ]+)?\s*\(\$?\s*(\d+(?:\.\d{2})?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prose)) !== null) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    const price = Number(m[2]);
    if (!name || !Number.isFinite(price)) continue;
    out.push({ name, price, description: '', statedCalories: null, sourceUrl: null });
  }
  return out;
}

/** Ground truth for the menu-extraction bench site. */
export const PROSE_MENU_TRUTH: SearchItem[] = parseProseMenu(menuProseFixture);

/**
 * Did the extraction stay inside the prose it was given?
 *
 * Hop 2 is the hop that turns grounded prose into structured data, and it is
 * also where `price` became non-nullable — so it is structurally unable to say
 * "the source did not give me a price". This check is what catches the number
 * it invents instead.
 */
export function checkMenuAgainstProse(
  where: string,
  items: Array<{ name: string; price: number }>,
  truth: SearchItem[] = PROSE_MENU_TRUTH
): Finding[] {
  const out: Finding[] = [];

  if (truth.length === 0) {
    return [finding('GROUNDING', 'warn', 'no-ground-truth', where,
      'the prose fixture yielded no parseable dishes; the extraction is ungraded')];
  }

  for (const item of items ?? []) {
    const target = `${where}.${item.name}`;
    const match = matchDish(item.name, truth);

    if (!match) {
      out.push(finding('GROUNDING', 'error', 'dish-not-in-source', target,
        `"${item.name}" appears nowhere in the source prose`));
      continue;
    }
    // Prices are stated to the cent in the prose, so any difference is the model
    // overwriting a number it was handed rather than a rounding artefact.
    if (match.price !== null && Math.abs(item.price - match.price) > 0.005) {
      out.push(finding('GROUNDING', 'error', 'price-differs-from-source', target,
        `extracted $${item.price.toFixed(2)}, source says $${match.price.toFixed(2)}`));
    }
  }

  return out;
}
