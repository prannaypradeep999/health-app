/**
 * A category icon for a meal card.
 *
 * Why this exists, from the imagery audit (docs/superpowers/plans/
 * 2026-08-25-imagery-strategy.md): Pexels answers 429 after roughly 8 images
 * while a cold generation wants ~50, so most cards were already showing a stock
 * fallback rather than a photo of the dish. A stock photo asserts something the
 * app cannot back — "your shawarma looks like this" — and is usually false. An
 * icon asserts only the category, which is true, instant, and never rate
 * limited. Being obviously schematic is the point: nobody feels misled by an
 * icon.
 *
 * Keyed on `cuisine`, which MealObject (schemas/shared.ts:86) and the restaurant
 * schema (schemas/meals.ts:10) already carry on every meal. The imagery plan
 * proposed adding a `mealFormat` field for this, but that schema is `.strict()`
 * under json_schema strict mode and is duplicated verbatim in the legacy prompt,
 * so adding a property changes two contracts at once. Using a field that already
 * ships avoids that risk entirely.
 *
 * Dish keywords are checked before cuisine because they are more specific: a
 * salad at an Italian restaurant is better served by the salad icon than the
 * pasta one. Both are category claims, so neither can be "wrong" the way a
 * photograph can.
 */

/** Checked first, most specific. Order matters: earlier entries win. */
const DISH_ICONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsalad\b|\bgreens\b/i, '🥗'],
  [/\bsoup\b|\bpho\b|\bramen\b|\bbroth\b|\bstew\b|\bchowder\b/i, '🍜'],
  [/\bsushi\b|\bsashimi\b|\bnigiri\b|\bmaki\b/i, '🍣'],
  [/\btaco\b|\bburrito\b|\bquesadilla\b|\bfajita\b|\bnachos\b/i, '🌮'],
  [/\bpizza\b/i, '🍕'],
  [/\bpasta\b|\bspaghetti\b|\blasagn|\bpenne\b|\bnoodle\b|\bfettucc/i, '🍝'],
  [/\bburger\b|\bcheeseburger\b|\bpatty melt\b/i, '🍔'],
  [/\bsandwich\b|\bsub\b|\bpanini\b|\bhoagie\b|\bblt\b/i, '🥪'],
  [/\bwrap\b|\bshawarma\b|\bgyro\b|\bfalafel\b|\bkebab\b|\bkabob\b|\bdoner\b/i, '🥙'],
  [/\bburrito bowl\b|\bgrain bowl\b|\brice bowl\b|\bpoke\b|\bbowl\b/i, '🥘'],
  [/\bcurry\b|\btikka\b|\bmasala\b|\bvindaloo\b|\bkorma\b/i, '🍛'],
  [/\bsteak\b|\bbrisket\b|\bribeye\b|\bsirloin\b|\bbeef\b/i, '🥩'],
  [/\bchicken\b|\bpoultry\b|\bturkey\b/i, '🍗'],
  [/\bshrimp\b|\bprawn\b|\blobster\b|\bcrab\b|\bscallop\b/i, '🦐'],
  [/\bsalmon\b|\btuna\b|\bfish\b|\bcod\b|\bhalibut\b|\btilapia\b/i, '🐟'],
  [/\begg\b|\bomelet|\bfrittata\b|\bscramble\b|\bbenedict\b/i, '🍳'],
  [/\bpancake\b|\bwaffle\b|\bfrench toast\b|\bcrepe\b/i, '🥞'],
  [/\boatmeal\b|\bporridge\b|\bgranola\b|\bcereal\b|\bmuesli\b/i, '🥣'],
  [/\bsmoothie\b|\bshake\b|\bjuice\b/i, '🥤'],
  [/\byogurt\b|\bparfait\b/i, '🍧'],
  [/\bburrito\b|\btofu\b|\btempeh\b|\bveggie\b|\bvegetable\b/i, '🥦'],
  [/\bdumpling\b|\bpotsticker\b|\bgyoza\b|\bbao\b|\bdim sum\b/i, '🥟'],
  [/\brice\b|\bbiryani\b|\bpilaf\b|\bfried rice\b/i, '🍚'],
  [/\bbread\b|\bbagel\b|\btoast\b|\bcroissant\b/i, '🥖'],
];

/** Checked second, one entry per survey cuisine option. */
const CUISINE_ICONS: Readonly<Record<string, string>> = {
  mediterranean: '🥙',
  'middle eastern': '🥙',
  greek: '🥙',
  italian: '🍝',
  mexican: '🌮',
  chinese: '🥡',
  japanese: '🍣',
  korean: '🍲',
  thai: '🍜',
  vietnamese: '🍜',
  indian: '🍛',
  american: '🍔',
  french: '🥐',
  spanish: '🥘',
  seafood: '🐟',
  vegan: '🥗',
  vegetarian: '🥗',
};

/** Checked last, so a card always has something rather than an empty box. */
const MEAL_TYPE_ICONS: Readonly<Record<string, string>> = {
  breakfast: '🍳',
  lunch: '🥪',
  dinner: '🍽️',
  snack: '🍎',
};

export const DEFAULT_MEAL_ICON = '🍽️';

function textOf(meal: unknown): string {
  const m = meal as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== 'object') return '';
  // `dish` is the restaurant spelling, `name` the home-meal one. Description is
  // included because a dish called "Bento Box" says nothing on its own.
  return [m.dish, m.name, m.mealName, m.description]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
}

function cuisineOf(meal: unknown): string | null {
  const c = (meal as Record<string, unknown> | null | undefined)?.cuisine;
  if (typeof c !== 'string') return null;
  const trimmed = c.trim().toLowerCase();
  return trimmed || null;
}

/**
 * Never throws and always returns a printable glyph: this feeds a render path,
 * and an exception here would blank a meal card.
 */
export function mealIcon(meal: unknown, mealType?: string | null): string {
  const text = textOf(meal);
  if (text) {
    for (const [pattern, icon] of DISH_ICONS) {
      if (pattern.test(text)) return icon;
    }
  }

  const cuisine = cuisineOf(meal);
  if (cuisine && Object.hasOwn(CUISINE_ICONS, cuisine)) return CUISINE_ICONS[cuisine];

  const type = typeof mealType === 'string' ? mealType.trim().toLowerCase() : '';
  if (type && Object.hasOwn(MEAL_TYPE_ICONS, type)) return MEAL_TYPE_ICONS[type];

  return DEFAULT_MEAL_ICON;
}
