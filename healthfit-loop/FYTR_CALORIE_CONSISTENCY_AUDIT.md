# FYTR App — Full Calorie Consistency & Frontend Audit

**Date:** 2025-02-03  
**Scope:** Survey → calorie calculation → AI generation → database → frontend display  
**No code changes.** Audit only.

---

## 1. Data Flow Trace

### 1.1 Survey submission

| Step | File | Function / Logic | Inputs | Outputs | Next |
|------|------|------------------|--------|---------|------|
| Submit survey | `src/app/survey/page.tsx` | Form submit | User: age, sex, height (feet+inches → total inches), weight, goal, activityLevel, weeklyMealSchedule, etc. | POST `/api/survey` with parsed payload. Height sent as **number (total inches)**. | Survey API |
| Validate & save | `src/app/api/survey/route.ts` | `buildSurveyData()`, `prisma.surveyResponse.create/update` | Parsed payload from SurveySchema | Survey record in DB. **Height:** `Number(data.height) \|\| 0` — if frontend ever sent a string like `"5'8\""`, this would become 0. | DB + cookies (survey_id, meal_plan_id, guest_session) |
| Schema | `src/lib/schemas.ts` | SurveySchema | Payload | `height: z.number().int().min(36).max(96).optional()` | — |

**Note:** Frontend survey builds `height` as total inches from feet + inches (`survey/page.tsx` ~1436, 1454), so it sends a number. Survey route does not use `parseHeight()` from nutrition.ts; it uses `Number(data.height) || 0`. If height were ever sent as a string (e.g. `"5'8\""`), targets would be wrong.

---

### 1.2 Calorie target calculation

| Step | File | Function / Logic | Inputs | Outputs | Next |
|------|------|------------------|--------|---------|------|
| BMR | `src/lib/utils/nutrition.ts` | `calculateBMR(profile)` | UserProfile (age, sex, height in **inches**, weight in **lbs**) | BMR (Mifflin–St Jeor), rounded | TDEE |
| TDEE | `src/lib/utils/nutrition.ts` | `calculateTDEE(profile)` | BMR + activityLevel | BMR × activity multiplier | Target calories |
| Target calories | `src/lib/utils/nutrition.ts` | `calculateTargetCalories(profile)` | TDEE + goal | WEIGHT_LOSS: 0.8×, MUSCLE_GAIN: 1.15×, ENDURANCE: 1.1×, default: 1× | Macros / distribution |
| Macros | `src/lib/utils/nutrition.ts` | `calculateMacroTargets(profile)` | Target calories + goal | `{ calories, protein, carbs, fat }` (goal-based ratios) | Prompts / display |
| Weekly distribution | `src/lib/utils/nutrition.ts` | `getDynamicMealDistribution(dailyCalories, weeklySchedule)` | Daily calories + weeklyMealSchedule | Per-day, per-slot: `{ breakfast, lunch, dinner }` with `calories` and `source` (home/restaurant/skipped). **Respects schedule:** 1 meal → cap 1200; 2 meals → 40/60; 3 meals → 25/35/40. | nutrition-targets |
| Full weekly targets | `src/lib/utils/nutrition-targets.ts` | `buildNutritionTargets(surveyData)` | Survey (must have age, sex, height, weight). **Height:** used as-is (number). No parseHeight here. | `WeeklyNutritionTargets`: dailyCalories, macros, `days[day].breakfast/lunch/dinner` with calories + protein/carbs/fat proportionally, dailyTotals | generate-home, generate-restaurants |
| Legacy daily goal (optional) | `src/lib/utils/calorie-calculator.ts` | `calculateDailyCalorieGoal(surveyData, day?, weeklyMealSchedule?)` | SurveyResponse. **Height:** `typeof surveyData.height === 'string' ? parseHeight(surveyData.height) : (surveyData.height \|\| 68)` | CalorieGoal: dailyGoal, breakfast, lunch, dinner (dynamic or 25/35/40) | Used elsewhere if needed |

**Summary:** Single source of truth for math is `nutrition.ts` (BMR → TDEE → target → macros). `nutrition-targets.ts` builds per-day, per-slot targets from `getWeeklyCalorieTargets()` and respects `weeklyMealSchedule`. `calorie-calculator.ts` wraps the same logic and handles height string (e.g. from DB) via `parseHeight`.

---

### 1.3 Meal distribution vs weekly schedule

- **Source:** `nutrition.ts` → `getDynamicMealDistribution(dailyCalories, weeklySchedule)`.
- **Behavior:** For each day, only **non–no-meal** slots get calories. Ratios: 3 meals → 25/35/40; 2 meals → 40/60; 1 meal → min(dailyCalories, 1200). So **weekly schedule does affect** distribution; it is not always 25/35/40.

---

### 1.4 Prompt construction

| Route | File | How targets get into prompt |
|-------|------|----------------------------|
| Home | `src/lib/ai/prompts/meal-generation.ts` | `createHomeMealGenerationPrompt({ nutritionTargets, weeklyNutritionTargets, ... })`. `formatNutritionTargets(context)` uses **weeklyNutritionTargets** when present and varies per day (per-day, per-meal cal/protein). Otherwise falls back to **nutritionTargets.mealTargets** (breakfast/lunch/dinner calories + protein). No hardcoded numbers in prompt; all from context. |
| Home route | `src/app/api/ai/meals/generate-home/route.ts` | `buildNutritionTargets(surveyData)` → optional `adjustTargetsForRestaurantBudget(weeklyTargets, restaurantCalories)` → `convertToLegacyTargets(adjustedTargets)` → passed as `nutritionTargets`; `adjustedTargets` (weekly) passed as `weeklyNutritionTargets`. So **per-meal targets in prompt are derived from calculation** (and adjusted for restaurant budget when applicable). |
| Restaurant | `src/lib/ai/prompts/meal-generation.ts` | `createRestaurantMealGenerationPrompt`: uses `nutritionTargets.mealTargets?.breakfast/lunch/dinner` for calories and protein, or **hardcoded defaults** 500/600/700 cal and 30/40/45g protein if `nutritionTargets` is missing. |
| Restaurant route | `src/app/api/ai/meals/generate-restaurants/route.ts` | `buildNutritionTargets(surveyData)` → `convertToLegacyTargets(weeklyNutritionTargets)`. If `weeklyNutritionTargets` is null, **convertToLegacyTargets returns hardcoded 2000 cal and 500/650/750/100 per meal**. So restaurant prompt can see either computed targets or defaults. |

**Conclusion:** Home prompts use calculated (and optionally restaurant-adjusted) targets. Restaurant prompts use calculated targets when survey is complete; otherwise fallback defaults.

---

### 1.5 LLM response parsing and validation

| Route | Parsing | Validation |
|-------|--------|------------|
| Home | `generate-home/route.ts`: JSON.parse(content) for `homeMeals` and `groceryList`. | **Intended:** `validateMealPlan(parsedResult.homeMeals, adjustedTargets.days)` in `generateHomeMealsForSchedule`. **Bug:** Variable used is `adjustedTargets`, but the 4th parameter of `generateHomeMealsForSchedule` is named `weeklyNutritionTargets`. So **`adjustedTargets` is undefined** in that scope; the validation block never runs (condition false). See `generate-home/route.ts` ~269. |
| Restaurant | `generate-restaurants/route.ts`: `cleanJsonResponse(content)` then `result?.restaurantMeals`. | No validation of calorie numbers before save. |

So: **no effective validation of LLM calorie numbers before save.** Home validator exists but is unreachable due to wrong variable name.

---

### 1.6 Database storage

| Model | Field | What is stored |
|-------|--------|----------------|
| SurveyResponse | age, sex, height (Int), weight, goal, activityLevel, weeklyMealSchedule (Json), ... | Raw survey. **No stored daily calorie target.** |
| MealPlan | userContext (Json) | Full plan: `days[]` (per-day meals with primary/alternative and calories), `nutritionTargets` (from home route: dailyCalories, dailyProtein/Carbs/Fat, mealTargets), homeMeals[], restaurantMeals[], groceryList, metadata. **Daily target is inside userContext**, not a top-level column. |
| MealPlan | — | No separate column for daily calorie target; it lives only inside userContext. |

**Conclusion:** Nutrition data in DB is whatever the generation routes put in `userContext` (including targets at generation time). There is no separate “authoritative” daily target column.

---

### 1.7 Frontend data fetching

| Consumer | API | What it gets |
|----------|-----|--------------|
| DashboardContainer | `/api/ai/meals/current` | Meal plan (id, weekOf, planData.days, planData.weeklyPlan, groceryList, counts). Does **not** use meal plan’s stored nutrition targets for display. |
| MealPlanPage | `/api/ai/meals/current` | Same. Sets `nutritionTargets` from **`data.mealPlan?.nutritionTargets`**. |
| DashboardHome | `/api/ai/meals/current` | Same meal plan; for targets it uses **survey-based** `calculateMacroTargets(userProfile)` (user from props), not the API’s nutritionTargets. |
| current route | `src/app/api/ai/meals/current/route.ts` | Loads MealPlan by cookie (meal_plan_id / surveyId / sessionId). **Recalculates** nutrition targets from survey: `calculateMacroTargets(userProfile)` → `nutritionTargets = { dailyCalories, dailyProtein, dailyCarbs, dailyFat }`. Returns `mealPlan: { ..., nutritionTargets }`. So **frontend always gets recalculated targets**, not the targets stored in userContext at generation time. |

So: **displayed targets = current survey → calculateMacroTargets.** If the user never changes survey, this matches generation. If survey were ever updated after plan creation, displayed target could differ from the target used to generate meals.

---

### 1.8 Frontend display (high level)

- **MealPlanPage:** Uses `data.mealPlan.nutritionTargets` (recalculated daily totals). Shows per-meal calories from `meal.primary.calories` / `estimatedCalories` and same for alternative. Daily total = sum of “eaten” meals + logged meals. Progress: totalCalories vs nutritionTargets.dailyCalories, protein vs dailyProtein.
- **DashboardHome:** Builds its own `nutritionTargets` from `calculateMacroTargets(user)` (survey). Shows calories eaten vs daily target, macro progress.
- **ProgressPage:** No calorie target vs actual from meal plan; uses placeholders (e.g. avgCalories: 2000).

---

## 2. Consistency Issues Found

1. **generate-home: validation never runs**  
   - **File:line:** `src/app/api/ai/meals/generate-home/route.ts` ~269.  
   - **Issue:** `if (parsedResult.homeMeals && adjustedTargets)` — `adjustedTargets` is not in scope (4th parameter is `weeklyNutritionTargets`). So `validateMealPlan()` is never called; LLM calorie/macro output is not validated before save.

2. **MealPlanPage: possible double-count of calories**  
   - **File:line:** `src/components/dashboard/MealPlanPage.tsx` ~376–390.  
   - **Issue:** For primary (and similarly for alternative), both `meal.primary.calories` and `meal.primary.estimatedCalories` are added when `isMealEaten(..., 'primary')`. If both fields exist, the same meal is counted twice in daily total.

3. **Restaurant route: hardcoded fallback when survey incomplete**  
   - **File:line:** `src/app/api/ai/meals/generate-restaurants/route.ts` ~27–41.  
   - **Issue:** `convertToLegacyTargets(null)` returns 2000 cal and fixed meal split (500/650/750/100). If `buildNutritionTargets(surveyData)` ever returns null (e.g. missing height), restaurant prompt gets these defaults instead of failing fast.

4. **current/route: height type**  
   - **File:line:** `src/app/api/ai/meals/current/route.ts` ~148–151.  
   - **Issue:** UserProfile is built with `height: surveyData.height`. Prisma type is Int; if anything ever passed a string, it could reach nutrition.ts. calorie-calculator uses parseHeight for string; current route does not. Low risk if survey always sends number.

5. **Two sources of “daily target” on frontend**  
   - **Issue:** MealPlanPage uses API `nutritionTargets` (recalculated in current route). DashboardHome recalculates from `user` (survey) via `calculateMacroTargets`. Same formula but different data source; if user/ survey and API survey diverge (e.g. caching), targets could disagree.

6. **No validation of restaurant LLM output**  
   - **Issue:** Restaurant meal calories/protein are not checked against targets or sanity bounds before saving. Bad or inconsistent numbers can be stored.

7. **Stored vs displayed targets**  
   - **Issue:** userContext stores `nutritionTargets` at generation time. Frontend never uses that; it uses recalculated targets from current survey. So “what was used to generate” is not what user sees if survey is ever edited.

---

## 3. Frontend Display Status

### MealPlanPage.tsx

| Question | Answer |
|----------|--------|
| Calorie information per meal? | Yes. Per option: `mealOption.calories` or estimatedCalories; label e.g. “X cal” / “~X cal” for restaurant. |
| Daily calorie total shown? | Yes. Sum of eaten primary/alternative + logged meals for selected day. |
| Daily target shown? | Yes. `nutritionTargets.dailyCalories` (rounded to 100s in label). |
| Over/under target for the day? | Yes. Progress bar and color: green 80–100%, red >110%, orange otherwise. |
| Restaurant vs home distinguished? | Yes. Source and “~” for restaurant calories. |
| Skipped / no-meal? | Empty slot; no calorie display. No explicit “skipped” or “no-meal” label. |

**Gap:** Per-meal targets (e.g. “Breakfast: 500 cal”) are not shown; only daily total vs daily goal. Recipe detail calories come from the same meal object as the card; no separate check that recipe calories match card.

### DashboardHome.tsx

| Question | Answer |
|----------|--------|
| Nutrition summary? | Yes. “Calories” and “Macros” sections: calories and protein/carbs/fat eaten vs target. |
| Source of numbers? | Eaten: summed from plan (primary/alternative + logged). Target: **recalculated** via `calculateMacroTargets(user)` from survey, not from API nutritionTargets. |
| Weekly overview? | No single “weekly calorie total” or “weekly target.” Building block shows meal/workout counts and previews. |

### ProgressPage.tsx

| Question | Answer |
|----------|--------|
| Tracking data shown? | Weight, workouts completed, meals logged, achievements. |
| Calorie target vs actual? | **No.** avgCalories is placeholder (2000). No integration with meal plan or consumption API for real calorie actuals. |
| Daily vs weekly? | Weight and activity are summarized; no daily/weekly calorie breakdown. |

### DashboardContainer.tsx

| Question | Answer |
|----------|--------|
| How does it fetch meal plan data? | Calls `/api/ai/meals/current` (e.g. for polling, preview, status). Does not hold meal plan state for MealPlanPage; children fetch their own. |
| Calorie recalculation on client? | For preview/banner it uses `calculateMacroTargets(surveyData)` (survey from state) to show calorie target. No recalculation of meal calories; those come from API. |

---

## 4. Database Schema Notes

### MealPlan (userContext)

- **Stored:** `days[]` (per-day meals with primary/alternative, calories, source), `nutritionTargets` (dailyCalories, dailyProtein/Carbs/Fat, mealTargets.breakfast/lunch/dinner), homeMeals[], restaurantMeals[], groceryList, metadata, weeklySchedule.
- **Daily calorie target:** Stored only inside userContext (e.g. `nutritionTargets.dailyCalories`), not as a column.
- **Redundancy:** Same plan can be described both in `days` and in `homeMeals` / `restaurantMeals`; merging logic in current route reconciles for response.

### SurveyResponse

- **Nutrition-related:** age, sex, height (Int), weight, goal, activityLevel, weeklyMealSchedule (Json). No cached daily calorie target; always recomputed when needed.

### Gaps

- No dedicated column for “daily calorie target at plan creation” for comparison or auditing.
- Per-meal targets are only in userContext (and in recalculated form in API response), not in a normalized structure.

---

## 5. Priority Fix List

Ordered by impact on correctness and user trust.

1. **Fix home meal validation (generate-home)**  
   Use the 4th parameter (e.g. `weeklyNutritionTargets`) in the validation condition and call: `if (parsedResult.homeMeals && weeklyNutritionTargets)` and `validateMealPlan(parsedResult.homeMeals, weeklyNutritionTargets.days)`. Optionally block or flag save when validation fails.

2. **Fix double-count of calories (MealPlanPage)**  
   In `getTotalCalories`, for each option add either `calories` or `estimatedCalories`, not both (e.g. `total += meal.primary.calories ?? meal.primary.estimatedCalories ?? 0` when eaten).

3. **Unify source of nutrition targets on frontend**  
   Either have all screens use `data.mealPlan.nutritionTargets` from the same API response, or have a single place that computes from survey and pass it down, so dashboard and meal plan never show different targets.

4. **Surface daily target and “target vs actual” on Progress**  
   Replace placeholder avgCalories with real consumed vs target (from meal plan + consumption or logs), at least for the current week.

5. **Optional: validate restaurant LLM output**  
   Add a lightweight check (e.g. per-meal calorie range, or total vs daily target) before saving restaurant meals; log or flag large deviations.

6. **Optional: store daily target at plan creation**  
   Add a field (e.g. `dailyCalorieTarget Int?` on MealPlan or inside userContext) set once at generation so “target used for this plan” is auditable and displayable.

7. **Optional: show per-meal targets on MealPlanPage**  
   Use stored or recalculated mealTargets to show e.g. “Breakfast: 450 / 500 cal” so users can verify per slot.

8. **Survey height robustness**  
   In survey route, if `data.height` is a string (e.g. `"5'8\""`), use `parseHeight(data.height)` before saving so targets never get 0 from bad parsing.

---

## Addendum: Additional Files Reviewed

### A. Meal consumption logging (`/api/meals/consume`)
- **File:** `src/app/api/meals/consume/route.ts`
- **Flow:** Client submits `calories`, `protein`, `carbs`, `fat` and `wasEaten`; API upserts `MealConsumptionLog` and returns weekly totals on GET.
- **Consistency risk:** Values are **client‑supplied** and not validated against meal plan or nutrition targets. If client data is stale or edited, consumption stats can diverge from plan targets/meal card calories.

### B. Meal feedback (`/api/meals/feedback`)
- **File:** `src/app/api/meals/feedback/route.ts`, `src/app/api/meals/feedback/batch/route.ts`
- **Flow:** Feedback doesn’t affect calories directly; safe for nutrition math. No calorie changes here.

### C. Grocery pricing (`/api/ai/meals/generate-groceries`)
- **File:** `src/app/api/ai/meals/generate-groceries/route.ts`
- **Flow:** Enriches grocery list with store prices and saves back into `MealPlan.userContext`.
- **Calories:** No calorie recalculation or changes. Does not affect nutrition targets.

### D. Planning preview (`/api/ai/meals/planning-preview`)
- **File:** `src/app/api/ai/meals/planning-preview/route.ts`
- **Flow:** Reads existing meal plan and grocery list to show preview. No nutrition recalculation. Uses fallback grocery cost calculations if missing.
- **Calories:** No direct impact on calorie numbers.

### E. Recipe generation (`/api/ai/recipes/generate`)
- **File:** `src/app/api/ai/recipes/generate/route.ts`
- **Flow:** If a recipe is cached by `dishName`, it is **always returned** even if `nutritionTargets` are provided.
- **Consistency risk:** Comment says “only use if nutrition targets match,” but implementation **ignores nutritionTargets** once cached. This can cause recipe details to **disagree** with meal plan macros if the cached recipe was generated with different targets.

---

**End of audit.** No code was changed; this document is for planning fixes.
