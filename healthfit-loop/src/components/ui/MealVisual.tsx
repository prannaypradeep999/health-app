'use client';

import { mealIcon } from '@/lib/utils/meal-icon';

/**
 * The visual for a meal card: always a category icon.
 *
 * Why never a photograph, even when one exists: measured in
 * `pexels-client.ts:24-28` (2026-08-18), Pexels allows roughly 8 images per run
 * and answers 429 to the rest, while a cold generation wants ~50. So a photo
 * path can only ever cover a minority of cards, and covering *some* of them is
 * worse than covering none — a week where four cards are photographs and
 * fourteen are icons reads as broken rather than as a considered design. One
 * treatment applied to every card reads as a decision.
 *
 * A stock photo is also a claim the app cannot back ("your shawarma looks like
 * this"), and was usually false. An icon claims only the category, which is
 * true, instant, and cannot be rate limited.
 *
 * One component rather than four inline branches because the same decision was
 * previously duplicated across MealPlanPage and DashboardHome, and drifted.
 */

/**
 * Box and glyph are defined together, because they are one decision.
 *
 * They were previously two independent strings at each of four call sites,
 * which is eight numbers free to drift out of proportion — and they had. Each
 * variant below holds the glyph at roughly half the box's shorter side, which
 * leaves the icon optically centred with even breathing room at every size.
 */
export const MEAL_VISUAL_SIZES = {
  /** Dense list rows. */
  sm: { box: 'w-12 h-12 sm:w-14 sm:h-14 rounded-lg', glyph: 'text-2xl sm:text-3xl' },
  /** Standard meal card thumbnail. */
  md: { box: 'w-16 h-16 rounded-xl', glyph: 'text-3xl' },
  /** The selected-meal hero on the meal plan page. */
  lg: { box: 'w-20 h-20 sm:w-24 sm:h-24 rounded-xl', glyph: 'text-4xl sm:text-5xl' },
} as const;

export type MealVisualSize = keyof typeof MEAL_VISUAL_SIZES;

export function MealVisual({
  meal,
  mealType,
  alt,
  size = 'md',
  className = '',
}: {
  meal: unknown;
  mealType?: string | null;
  alt: string;
  size?: MealVisualSize;
  /** Extra classes for context — shadow, margin. Not dimensions: those are `size`. */
  className?: string;
}) {
  const { box, glyph } = MEAL_VISUAL_SIZES[size] ?? MEAL_VISUAL_SIZES.md;

  // role/aria-label so the icon reads to a screen reader as the dish it stands
  // for, which is the information the photo's alt text used to carry.
  return (
    <div
      role="img"
      aria-label={alt}
      className={`${box} ${className} flex items-center justify-center bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-100 select-none`}
    >
      <span className={`${glyph} leading-none`} aria-hidden="true">
        {mealIcon(meal, mealType)}
      </span>
    </div>
  );
}
