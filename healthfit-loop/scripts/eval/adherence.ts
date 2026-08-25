import { finding, type Finding, type Severity } from './types';

export interface Rule {
  /** Human-readable source of the constraint, e.g. 'Halal' or 'allergy:shellfish'. */
  label: string;
  severity: Severity;
  pattern: RegExp;
}

/**
 * Forbidden-term patterns per declared restriction.
 *
 * Deliberately broader than production's RESTRICTION_MAPPINGS, which covers only
 * vegetarian and vegan. A harness that shared production's blind spot could not
 * detect production's blind spot.
 *
 * These are recall-oriented: a false positive costs a reviewer thirty seconds,
 * a false negative ships a coeliac user a wheat dish. Word boundaries keep the
 * obvious substring collisions out ("ham" in "hammock").
 */
export const RESTRICTION_PATTERNS: Record<string, RegExp> = {
  vegetarian: /\b(chicken|beef|pork|lamb|mutton|veal|bacon|ham|prosciutto|salami|pepperoni|sausage|turkey|duck|venison|fish|salmon|tuna|cod|halibut|tilapia|anchov(y|ies)|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|squid|calamari|octopus|gelatin|lard)\b/i,
  vegan: /\b(chicken|beef|pork|lamb|bacon|ham|turkey|fish|salmon|tuna|shrimp|crab|lobster|milk|cream|butter|cheese|yogh?urt|ghee|egg|eggs|honey|gelatin|whey|casein|lard)\b/i,
  pescatarian: /\b(chicken|beef|pork|lamb|mutton|veal|bacon|ham|turkey|duck|venison|sausage)\b/i,
  halal: /\b(pork|bacon|ham|prosciutto|lard|gelatin|wine|beer|rum|vodka|whisk(e)?y|bourbon|brandy|sake|mirin|alcohol)\b/i,
  kosher: /\b(pork|bacon|ham|prosciutto|lard|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|squid|calamari|octopus|catfish|eel)\b/i,
  'gluten-free': /\b(wheat|barley|rye|malt|farro|spelt|semolina|couscous|bulgur|seitan|panko|breadcrumbs?|flour tortilla|soy sauce|pasta|bread|baguette|pita|naan|noodles?|cracker|beer)\b/i,
  'dairy-free': /\b(milk|cream|creamy|butter|cheese|parmesan|mozzarella|cheddar|feta|ricotta|yogh?urt|ghee|whey|casein|custard)\b/i,
  keto: /\b(sugar|rice|pasta|bread|potato(es)?|corn|oats|honey|banana|maple syrup)\b/i,
  paleo: /\b(bread|pasta|rice|beans?|lentils?|chickpeas?|peanuts?|milk|cheese|yogh?urt|sugar)\b/i,
};

/** Allergen name → the terms that carry that allergen. */
const ALLERGEN_PATTERNS: Record<string, RegExp> = {
  shellfish: /\b(shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|crawfish|langoustine)\b/i,
  'tree nuts': /\b(almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|brazil nut|pine nut)\b/i,
  peanuts: /\b(peanut|groundnut|satay)\b/i,
  soy: /\b(soy|soya|tofu|edamame|tempeh|miso)\b/i,
  eggs: /\b(egg|eggs|mayonnaise|meringue|aioli)\b/i,
  dairy: /\b(milk|cream|butter|cheese|yogh?urt|ghee|whey|casein)\b/i,
  fish: /\b(fish|salmon|tuna|cod|halibut|tilapia|anchov(y|ies)|sardine|mackerel)\b/i,
  sesame: /\b(sesame|tahini|halva)\b/i,
  gluten: RESTRICTION_PATTERNS['gluten-free'],
  wheat: RESTRICTION_PATTERNS['gluten-free'],
};

/** Escape a user-supplied exclusion so it can go into a RegExp safely. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turn a survey row into the set of rules its output must satisfy.
 *
 * Three sources, all of which exist on the survey and only some of which reach
 * the prompts in production: dietPrefs, foodAllergies, and strictExclusions.
 */
export function rulesFor(surveyData: any): Rule[] {
  const rules: Rule[] = [];

  for (const pref of (surveyData?.dietPrefs ?? []) as string[]) {
    const pattern = RESTRICTION_PATTERNS[String(pref).toLowerCase().replace(/_/g, '-')];
    if (pattern) rules.push({ label: pref, severity: 'error', pattern });
  }

  for (const allergy of (surveyData?.foodAllergies ?? []) as string[]) {
    const pattern = ALLERGEN_PATTERNS[String(allergy).toLowerCase().trim()];
    if (pattern) rules.push({ label: `allergy:${allergy}`, severity: 'error', pattern });
  }

  const strict = surveyData?.strictExclusions;
  if (strict && typeof strict === 'object') {
    const terms = [...(strict.meats ?? []), ...(strict.other ?? [])] as string[];
    for (const term of terms) {
      const t = String(term).toLowerCase().trim();
      // 'all' under meats means every meat, which the vegetarian pattern already encodes.
      if (t === 'all') {
        rules.push({ label: 'exclusion:all meats', severity: 'error', pattern: RESTRICTION_PATTERNS.vegetarian });
        continue;
      }
      if (!t) continue;
      rules.push({
        label: `exclusion:${t}`,
        severity: 'error',
        pattern: new RegExp(`\\b${escapeForRegex(t)}\\b`, 'i'),
      });
    }
  }

  return rules;
}

/**
 * Check one piece of generated text — a dish name, a description, an ingredient
 * list joined together — against every rule.
 */
export function checkText(where: string, text: string, rules: Rule[]): Finding[] {
  if (!text) return [];
  const out: Finding[] = [];
  for (const rule of rules) {
    const hit = text.match(rule.pattern);
    if (hit) {
      out.push(finding('ADHERENCE', rule.severity, 'restriction-violation', where,
        `${rule.label} violated by "${hit[0]}" in: ${text.slice(0, 120)}`));
    }
  }
  return out;
}
