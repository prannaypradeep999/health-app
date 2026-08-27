'use client';

import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { mealImageUrl } from '@/lib/external/fallback-images';
import { mealIcon, hasFetchedPhoto } from '@/lib/utils/meal-icon';

/**
 * The visual for a meal card: a real photograph when we actually fetched one,
 * a category icon otherwise.
 *
 * Measured in `pexels-client.ts:24-28` (2026-08-18): Pexels allows roughly 8
 * images per run and answers 429 to the rest, while a cold generation wants
 * ~50. So the majority of cards were never showing a photo of their dish — they
 * were showing one of a handful of stock images, repeated across the week.
 *
 * A stock photo is a claim the app cannot back. An icon claims only the
 * category, which is true, instant, and cannot be rate limited. The photo path
 * is unchanged when a photo genuinely exists, so this only replaces the cases
 * that were already wrong.
 *
 * One component rather than four inline branches because the same decision was
 * previously duplicated across MealPlanPage and DashboardHome, and drifted.
 */
export function MealVisual({
  meal,
  mealType,
  alt,
  className = 'w-16 h-16 rounded-lg',
  iconClassName = 'text-2xl',
}: {
  meal: unknown;
  mealType?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  if (hasFetchedPhoto(meal)) {
    return (
      <ImageWithFallback
        src={mealImageUrl(meal, mealType)}
        alt={alt}
        className={`${className} object-cover`}
      />
    );
  }

  // role/aria-label so the icon reads to a screen reader as the dish it stands
  // for, the same information the photo's alt text carried.
  return (
    <div
      role="img"
      aria-label={alt}
      className={`${className} flex items-center justify-center bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-100 select-none`}
    >
      <span className={iconClassName} aria-hidden="true">
        {mealIcon(meal, mealType)}
      </span>
    </div>
  );
}
