import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestaurantMealGenerationPrompt } from './meal-generation';
import { MenuExtractionSchema } from '../schemas/restaurants';
import { restaurantMenuDataFixture, nearbyRestaurantsFixture, fixtures } from '../../../../scripts/fixtures/surveys';

/**
 * The restaurant-selection prompt's one irreplaceable job is to show the model
 * the dishes it is allowed to pick from. Everything else in that prompt is
 * advice; the menu is the entire ground truth.
 *
 * It silently stopped doing that in the benchmark. The record the route builds
 * calls the dish list `menuData` — the extraction schema returns `menuItems`
 * and the route immediately re-homes it — but the bench fixture kept the
 * schema's name. `restaurant.menuData` was therefore undefined for every
 * restaurant, the listing collapsed to the literal string "No menu items
 * available", and the model echoed that back as a dish name with 0 calories.
 * The bench read those as `invented-dish` and `off-target` errors against the
 * generator, when the generator had been handed nothing to choose from.
 *
 * A rename fixes it once. These tests are what stop it drifting back, because
 * the failure mode is a field name going quiet rather than anything throwing.
 */

const SURVEY = { dietPrefs: [], preferredCuisines: [] };
const TARGETS = {
  mealTargets: { lunch: { calories: 480, protein: 30, carbs: 55, fat: 15 } },
};

function promptFor(restaurantMenuData: unknown[]) {
  return createRestaurantMealGenerationPrompt({
    restaurantMealsSchedule: [{ day: 'tuesday', mealType: 'lunch' }],
    restaurantMenuData,
    surveyData: SURVEY,
    nutritionTargets: TARGETS,
  } as Parameters<typeof createRestaurantMealGenerationPrompt>[0]);
}

test('the prompt lists the dishes it was given', () => {
  const prompt = promptFor([
    {
      name: 'Sakura Ramen House',
      cuisine: 'japanese',
      address: '2100 Shattuck Ave',
      menuData: [{ name: 'Vegetable Gyoza', price: 8.5, estimatedCalories: 320 }],
    },
  ]);
  assert.ok(prompt.includes('Vegetable Gyoza'), 'dish name missing from prompt');
  assert.ok(prompt.includes('320'), 'dish calories missing from prompt');
});

test('a restaurant with no dishes says so, and that is the only time it does', () => {
  // The placeholder is legitimate — extractMenuInformation can hand back a
  // restaurant whose lookup failed. What must never happen is every restaurant
  // showing it because the field was spelled wrong.
  const empty = promptFor([{ name: 'Comal Next Door', cuisine: 'mexican', address: 'x', menuData: [] }]);
  assert.ok(empty.includes('No menu items available'));
});

test('the dish list is read from menuData, not the extraction schema name', () => {
  // This is the exact regression: `menuItems` is what the model returns from
  // menu extraction; `menuData` is what the record carries afterwards. A
  // fixture or caller using the former renders an empty menu.
  const wrongName = promptFor([
    {
      name: 'Sakura Ramen House',
      cuisine: 'japanese',
      address: '2100 Shattuck Ave',
      menuItems: [{ name: 'Vegetable Gyoza', price: 8.5, estimatedCalories: 320 }],
    },
  ]);
  assert.ok(
    !wrongName.includes('Vegetable Gyoza'),
    'menuItems must not be read — if this passes, the builder now accepts both ' +
      'names and this test should be deleted rather than made to pass'
  );
  assert.ok(wrongName.includes('No menu items available'));
});

test('the bench fixture actually reaches the model as a menu', () => {
  // The test that would have caught it. The bench is only evidence about the
  // generator if the generator was shown the menu.
  const veg = fixtures.find(f => f.name === 'vegetarian-cut');
  assert.ok(veg, 'vegetarian-cut fixture is missing');

  const prompt = createRestaurantMealGenerationPrompt({
    restaurantMealsSchedule: [{ day: 'tuesday', mealType: 'lunch' }],
    restaurantMenuData: restaurantMenuDataFixture,
    surveyData: veg.surveyData,
    nutritionTargets: veg.nutritionTargets,
  } as Parameters<typeof createRestaurantMealGenerationPrompt>[0]);

  assert.ok(
    !prompt.includes('No menu items available'),
    'every benched restaurant rendered an empty menu'
  );
  for (const restaurant of restaurantMenuDataFixture) {
    for (const item of restaurant.menuData) {
      assert.ok(prompt.includes(item.name), `${item.name} missing from benched prompt`);
    }
  }
});

test('every benched dish is the shape menu extraction really produces', () => {
  // The structural version of the test above, and the one that generalises.
  // Renaming `menuItems` to `menuData` fixed the field that had gone missing;
  // this catches the next one. The fixture had no estimatedProtein/Carbs/Fat
  // either, which the extraction schema has required since B8, so the model was
  // shown "? g protein" for every dish and answered 0 — scored as eight
  // `atwater-mismatch` errors against a generator that had been told nothing.
  //
  // Parsing against the real schema means a field added to extraction breaks
  // the bench loudly instead of quietly draining it of signal.
  for (const restaurant of restaurantMenuDataFixture) {
    const parsed = MenuExtractionSchema.safeParse({
      menuItems: restaurant.menuData,
      orderingLinks: restaurant.orderingLinks,
    });
    assert.ok(
      parsed.success,
      `${restaurant.name} is not a valid extraction record: ${
        parsed.success ? '' : JSON.stringify(parsed.error.issues)
      }`
    );
  }
});

test('no benched restaurant renders a placeholder in the selection prompt', () => {
  // The structural guard above cannot see this class of drift, and `rating`
  // proved it. These records are a JOIN — extraction's output merged onto the
  // chosen restaurant — so a field belonging to the selection half is absent
  // from MenuExtractionSchema and parses clean by being missing.
  //
  // `Rating: ${restaurant.rating || 'N/A'}` therefore printed N/A for all three
  // restaurants, and the bench never once exercised the model's ability to
  // prefer a well-reviewed place. Reading the rendered prompt for placeholders
  // catches any field that goes quiet, whichever half it came from.
  const prompt = createRestaurantMealGenerationPrompt({
    restaurantMealsSchedule: [{ day: 'tuesday', mealType: 'lunch' }],
    restaurantMenuData: restaurantMenuDataFixture,
    surveyData: SURVEY,
    nutritionTargets: fixtures[0].nutritionTargets,
  } as Parameters<typeof createRestaurantMealGenerationPrompt>[0]);

  for (const placeholder of ['N/A', 'No menu items available', 'undefined', ': ?']) {
    assert.ok(
      !prompt.includes(placeholder),
      `the benched selection prompt renders "${placeholder}" — a fixture field has gone quiet`
    );
  }
  for (const restaurant of restaurantMenuDataFixture) {
    assert.ok(
      prompt.includes(String(restaurant.rating)),
      `${restaurant.name}'s rating is missing from the benched prompt`
    );
  }
});

test('the benched menu stays the size production actually sends', () => {
  // The latency budget is derived from this prompt's p95, and this prompt's
  // cost scales with the menu. Measured against three restaurants of three
  // dishes, selection p95 was 22.8s against 26.7s available and the 15% margin
  // was an artefact of a fixture a third of production's size.
  //
  // So the size is load-bearing, not incidental, and shrinking it silently
  // invalidates the budget rather than just making the bench cheaper.
  assert.ok(
    restaurantMenuDataFixture.length >= 6,
    `only ${restaurantMenuDataFixture.length} benched restaurants — production sends six, ` +
      'and the selection latency budget was measured against that'
  );
  for (const restaurant of restaurantMenuDataFixture) {
    assert.ok(
      restaurant.menuData.length >= 8,
      `${restaurant.name} has ${restaurant.menuData.length} dishes — extraction returns about eight`
    );
  }
});

test('a restaurant in both fixtures has one rating, not two', () => {
  // The selection site grades `rating-mismatch` by comparing the model's echoed
  // rating against the supplied one. Which fixture supplied it depends on the
  // site, so when the two disagreed the check was gradeable only by luck.
  const nearby = new Map(nearbyRestaurantsFixture.map(r => [r.name, r.rating]));
  for (const restaurant of restaurantMenuDataFixture) {
    const other = nearby.get(restaurant.name);
    if (other === undefined) continue;
    assert.equal(
      restaurant.rating,
      other,
      `${restaurant.name} is rated ${restaurant.rating} here and ${other} in nearbyRestaurantsFixture`
    );
  }
});

test('benched dish macros agree with their stated calories', () => {
  // Otherwise the ARITHMETIC column measures the fixture's arithmetic, not the
  // model's. Atwater: 4 cal/g protein, 4 cal/g carb, 9 cal/g fat.
  for (const restaurant of restaurantMenuDataFixture) {
    for (const item of restaurant.menuData) {
      const fromMacros =
        item.estimatedProtein * 4 + item.estimatedCarbs * 4 + item.estimatedFat * 9;
      const drift = Math.abs(fromMacros - item.estimatedCalories) / item.estimatedCalories;
      assert.ok(
        drift <= 0.1,
        `${item.name}: ${item.estimatedCalories} cal stated vs ${fromMacros} from macros`
      );
    }
  }
});
