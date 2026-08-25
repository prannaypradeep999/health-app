import { z } from 'zod';
import { OrderingLinks } from './shared';

/**
 * What Sonar returns directly. Deliberately looser than MenuExtractionSchema:
 * this is a search result, so price and calories are what the page said, and
 * anything the page did not say is null rather than estimated. The estimating
 * happens downstream where it can be labelled as an estimate.
 */
export const MenuSearchSchema = z.object({
  menuItems: z.array(z.object({
    name: z.string(),
    price: z.number().nullable(),
    description: z.string(),
    // Null when the menu did not publish it. Do not estimate here.
    statedCalories: z.number().nullable(),
    sourceUrl: z.string().nullable(),
  }).strict()).min(1).max(40),
  orderingLinks: OrderingLinks,
}).strict();
