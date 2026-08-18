/**
 * Asserts every exported schema converts to a legal OpenAI strict-mode schema.
 * Run: npx tsx scripts/check-schemas.ts
 */
import { z } from 'zod';
import * as S from '../src/lib/ai/schemas';

const ROOTS: Record<string, z.ZodType> = {
  WorkoutPlanSchema: S.WorkoutPlanSchema,
  WorkoutDetailShape: S.WorkoutDetailShape,
  WorkoutAnalysisSchema: S.WorkoutAnalysisSchema,
  MealPlanSchema: S.MealPlanSchema,
  MealDetailSchema: S.MealDetailSchema,
  GroceryListSchema: S.GroceryListSchema,
  HomeMealsLegacySchema: S.HomeMealsLegacySchema,
  RecipeSchema: S.RecipeSchema,
  RestaurantSelectionSchema: S.RestaurantSelectionSchema,
  RestaurantMealsSchema: S.RestaurantMealsSchema,
  MenuExtractionSchema: S.MenuExtractionSchema,
};

let failures = 0;
const fail = (name: string, msg: string) => { failures++; console.error(`  FAIL ${name}: ${msg}`); };

function walk(node: any, path: string, name: string) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') {
    if (node.additionalProperties !== false) fail(name, `${path} missing additionalProperties:false`);
    const props = Object.keys(node.properties ?? {});
    const required: string[] = node.required ?? [];
    const missing = props.filter(p => !required.includes(p));
    if (missing.length) fail(name, `${path} properties not in required: ${missing.join(', ')}`);
  }
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === 'object') walk(v, `${path}.${k}`, name);
  }
}

for (const [name, schema] of Object.entries(ROOTS)) {
  let rf: any;
  try {
    rf = S.toStrictJsonSchema(name, schema);
  } catch (e) {
    fail(name, `conversion threw: ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  const root = rf.json_schema.schema;
  const text = JSON.stringify(root);

  if (rf.json_schema.strict !== true) fail(name, 'strict is not true');
  if (root.anyOf) fail(name, 'anyOf at root — forbidden by strict mode');
  if (root.type !== 'object') fail(name, `root type is ${root.type}, must be object`);
  for (const banned of ['minLength', 'maxLength', 'default', 'allOf']) {
    if (text.includes(`"${banned}"`)) fail(name, `contains unsupported keyword ${banned}`);
  }
  walk(root, 'root', name);

  const props = Object.keys(root.properties ?? {}).length;
  const refs = (text.match(/"\$ref"/g) ?? []).length;
  console.log(`  ${failures ? ' ' : 'ok'} ${name.padEnd(26)} ${props} root props, ${refs} $ref, ${text.length} chars`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll schemas convert to legal strict-mode JSON Schema.');
process.exit(failures ? 1 : 0);
