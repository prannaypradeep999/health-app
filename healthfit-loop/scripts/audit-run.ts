/**
 * Post-run review: what actually landed in the database for one survey.
 *
 * The trace lines say which phases ran. This says whether they produced
 * anything worth having — the two failures that motivated it were a plan whose
 * restaurant phase logged success while persisting zero meals, and ordering
 * links that were present but unusable.
 *
 * READ-ONLY. Every query here is a find; nothing writes. Safe against the
 * shared production database.
 *
 *   npx tsx --env-file=.env scripts/audit-run.ts              # newest plan
 *   npx tsx --env-file=.env scripts/audit-run.ts <mealPlanId>
 */
import { prisma } from '../src/lib/db';
import { DISPLAYED_PLATFORMS, isUsableLink } from '../src/lib/external/link-check';

function ok(pass: boolean): string {
  return pass ? 'PASS' : 'FAIL';
}

async function main() {
  const argId = process.argv[2];

  const plan = argId
    ? await prisma.mealPlan.findUnique({ where: { id: argId } })
    : await prisma.mealPlan.findFirst({ orderBy: { createdAt: 'desc' } });

  if (!plan) {
    console.error(argId ? `No meal plan ${argId}` : 'No meal plans found');
    process.exit(1);
  }

  // Everything lives in userContext. `planData` is written empty by the
  // current pipeline — reading days from there returns zero for every run and
  // makes a healthy plan look dead.
  const ctx = (plan.userContext ?? {}) as any;
  const restaurantMeals: any[] = ctx.restaurantMeals ?? [];
  const groceryList = ctx.groceryList ?? null;
  const days: any[] = ctx.days ?? [];
  const homeMeals: any[] = ctx.homeMeals ?? [];

  // A day is `{ day, date, meals: { breakfast, lunch, dinner } }` and any slot
  // may legitimately be null, so count the filled ones rather than the days.
  const scheduledMealCount = days.reduce((total, day) => {
    return total + ['breakfast', 'lunch', 'dinner'].filter((m) => day?.meals?.[m]).length;
  }, 0);

  // The six category arrays the grocery pipeline writes. The enriched list
  // mixes them with scalar keys (stores, savings, pricesUpdatedAt), so count
  // only these rather than every array-shaped value.
  const GROCERY_CATEGORIES = ['proteins', 'vegetables', 'grains', 'dairy', 'pantryStaples', 'snacks'];
  const groceryItemCount = groceryList
    ? GROCERY_CATEGORIES.reduce((n, c) => n + (Array.isArray(groceryList[c]) ? groceryList[c].length : 0), 0)
    : 0;

  const survey = await prisma.surveyResponse.findUnique({ where: { id: plan.surveyId } });
  const workoutPlan = await prisma.workoutPlan.findFirst({
    where: { surveyId: plan.surveyId },
    orderBy: { createdAt: 'desc' },
  });

  const ageMin = Math.round((Date.now() - plan.updatedAt.getTime()) / 60000);

  console.log('='.repeat(64));
  console.log(`RUN AUDIT  run=${plan.id}`);
  console.log('='.repeat(64));
  console.log(`survey        ${plan.surveyId}  ${survey?.firstName ?? '?'}  zip=${survey?.zipCode ?? '?'}`);
  console.log(`status        ${plan.status}`);
  console.log(`created       ${plan.createdAt.toISOString()}`);
  console.log(`last write    ${plan.updatedAt.toISOString()}  (${ageMin} min ago)`);
  console.log(`wall clock    ${Math.round((plan.updatedAt.getTime() - plan.createdAt.getTime()) / 1000)}s end to end`);
  console.log('');

  console.log('--- RELAY OUTPUT ---------------------------------------------');
  console.log(`${ok(homeMeals.length > 0)}  home meals        ${homeMeals.length}`);
  console.log(`${ok(restaurantMeals.length > 0)}  restaurant meals  ${restaurantMeals.length}`);
  // The schedule is what the dashboard renders. Meals can exist while the
  // week is empty, which looks like a working run and shows a blank plan.
  console.log(`${ok(scheduledMealCount > 0)}  week populated    ${scheduledMealCount} slots across ${days.length} days`);
  console.log(`${ok(groceryItemCount > 0)}  grocery list      ${groceryItemCount} items`);
  console.log(`${ok(!!groceryList?.stores?.length)}  grocery stores    ${groceryList?.stores ? `${groceryList.stores.length} stores` : 'absent'}`);
  console.log(`${ok(!!workoutPlan)}  workout plan      ${workoutPlan ? `saved ${workoutPlan.createdAt.toISOString()}` : 'absent'}`);
  console.log('');

  console.log('--- ORDERING LINKS -------------------------------------------');
  if (restaurantMeals.length === 0) {
    console.log('(no restaurant meals, nothing to check)');
  } else {
    const byPlatform = new Map<string, number>();
    let mealsWithAtLeastOneLink = 0;
    let leaked = 0;

    for (const meal of restaurantMeals) {
      const links = meal?.primary?.orderingLinks ?? meal?.orderingLinks ?? {};
      let has = false;
      for (const [platform, url] of Object.entries(links)) {
        if (!isUsableLink(url as any)) continue;
        has = true;
        byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + 1);
        // Task 2 nulls these before they are ever probed; a survivor means
        // suppressUndisplayablePlatforms was bypassed on some path.
        if (!DISPLAYED_PLATFORMS.includes(platform)) leaked += 1;
      }
      if (has) mealsWithAtLeastOneLink += 1;
    }

    for (const [platform, count] of [...byPlatform.entries()].sort()) {
      console.log(`     ${platform.padEnd(10)} ${count}`);
    }
    console.log(`${ok(mealsWithAtLeastOneLink === restaurantMeals.length)}  every meal has a usable link  (${mealsWithAtLeastOneLink}/${restaurantMeals.length})`);
    console.log(`${ok(leaked === 0)}  no suppressed platform leaked through  (${leaked} found)`);
  }
  console.log('');

  console.log('--- RECORDED METADATA ----------------------------------------');
  console.log(`generators        ${JSON.stringify(ctx.generators ?? null)}`);
  console.log(`metadata.type     ${ctx.metadata?.type ?? 'none'}`);
  console.log(`restaurantsStatus ${ctx.metadata?.restaurantsStatus ?? 'none'}`);
  console.log(`restaurantTimings ${JSON.stringify(ctx.metadata?.restaurantTimings ?? null)}`);

  // The disagreement that exposed the clobber: two writers merging partial
  // state leave these two fields telling different stories.
  const generatorsSaysDone = ctx.generators?.restaurants === 'completed';
  const metadataSaysDone = ctx.metadata?.restaurantsStatus === 'completed';
  if (generatorsSaysDone !== metadataSaysDone) {
    console.log('');
    console.log(`WARN  generators.restaurants and metadata.restaurantsStatus disagree`);
    console.log(`      (${ctx.generators?.restaurants} vs ${ctx.metadata?.restaurantsStatus}) — sign of a lost update`);
  }
  console.log('='.repeat(64));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
