/**
 * Subtract a day's restaurant meals from its calorie budget and redistribute
 * what is left across that day's home meals.
 *
 * A8. This used to process one restaurant meal at a time, recomputing the
 * remainder from the *full* day budget on every pass — so a 2000-cal day with a
 * 700 lunch and a 900 dinner out ended up budgeting breakfast at 1100 (2000-900,
 * the last subtraction), and the user ate 2700 against a 2000 target. The
 * adjustment did not accumulate; the last meal processed simply won. Grouping by
 * day first also removes the loop-order dependence.
 */
export function adjustTargetsForRestaurantBudget(
  weeklyTargets: any,
  restaurantCalories: Array<{ day: string; mealType: string; calories: number }>
): any {
  if (!weeklyTargets || !weeklyTargets.days) return weeklyTargets;

  const byDay = new Map<string, { spent: number; slots: Set<string> }>();
  restaurantCalories.forEach(({ day, mealType, calories }) => {
    const key = day.toLowerCase();
    const entry = byDay.get(key) ?? { spent: 0, slots: new Set<string>() };
    entry.spent += calories;
    entry.slots.add(mealType.toLowerCase());
    byDay.set(key, entry);
  });

  // Each day object is copied, not just the outer map: the old version wrote
  // through `adjustedDays[dayKey][slot] = …` into an object the caller still
  // held, so callers saw their own targets change under them.
  const adjustedDays: Record<string, any> = {};
  Object.entries(weeklyTargets.days).forEach(([dayKey, dayTargets]) => {
    adjustedDays[dayKey] = { ...(dayTargets as any) };
  });

  byDay.forEach(({ spent, slots }, dayKey) => {
    const dayTargets = adjustedDays[dayKey];
    if (!dayTargets) return;

    console.log(`[BUDGET-ADJUST] ${dayKey}: reducing by ${spent} calories across ${slots.size} restaurant meal(s)`);

    const remainingCalories = Math.max(0, weeklyTargets.dailyCalories - spent);

    const homeMealSlots = (['breakfast', 'lunch', 'dinner'] as const).filter(
      slot => !slots.has(slot) && dayTargets[slot]?.source === 'home'
    );
    if (homeMealSlots.length === 0) return;

    // The three-slot branch was previously unreachable and therefore a silent
    // no-op. It becomes reachable the moment a caller passes a snack-like slot.
    const shares =
      homeMealSlots.length === 1
        ? [Math.min(remainingCalories, 1200)]
        : homeMealSlots.length === 2
          ? [Math.round(remainingCalories * 0.4), remainingCalories - Math.round(remainingCalories * 0.4)]
          : homeMealSlots.map(() => Math.round(remainingCalories / homeMealSlots.length));

    homeMealSlots.forEach((slot, index) => {
      const calories = shares[index];
      const proportion = weeklyTargets.dailyCalories > 0 ? calories / weeklyTargets.dailyCalories : 0;
      dayTargets[slot] = {
        ...dayTargets[slot],
        calories,
        protein: Math.round(weeklyTargets.macros.protein * proportion),
        carbs: Math.round(weeklyTargets.macros.carbs * proportion),
        fat: Math.round(weeklyTargets.macros.fat * proportion),
      };
    });
  });

  return { ...weeklyTargets, days: adjustedDays };
}
