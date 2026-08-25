export interface MergedGroceryItem {
  name: string;
  quantity?: string;
  uses?: string;
  category?: string;
  storeOptions: any[];
  pricedAs?: string;
  [key: string]: any;
}

/**
 * Precedence: the meal plan owns what it computed, the model owns prices.
 *
 * The merge was `{...original, ...item}`, so every field the model echoed back
 * replaced the value derived from the recipes — including `uses`, which is the
 * list of meals the ingredient appears in and is not something the model is in
 * a position to know.
 */
export function mergePricedItem(
  original: Record<string, any> | undefined,
  priced: Record<string, any>
): MergedGroceryItem {
  if (!original) {
    return {
      ...priced,
      name: priced.item ?? priced.name ?? 'Unknown item',
      storeOptions: priced.storeOptions ?? [],
    };
  }

  const pricedName = priced.item ?? priced.name;
  const originalName = original.name ?? original.item;

  return {
    // Model fields first so plan-owned fields below win the collision.
    ...priced,
    ...original,
    name: originalName,
    storeOptions: priced.storeOptions ?? [],
    // Kept so the rename is visible rather than either lost or substituted:
    // the shelf name is useful, but it is not the name the user's plan uses.
    pricedAs:
      pricedName && pricedName !== originalName ? pricedName : undefined,
  };
}
