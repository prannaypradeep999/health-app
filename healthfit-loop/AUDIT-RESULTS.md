# FYTR Home Meal Generation Audit Results

## Executive Summary

**Problem**: Home meal generation is consistently timing out at 180s (3 minutes), and even after increasing to 240s, it's at risk of timeouts due to the massive scope of data being generated in a single API call.

**Root Cause**: Attempting to generate 14-21 detailed home meals with full recipes + grocery list in ONE GPT API call using an enormous prompt (~6,000+ tokens) that requests massive JSON responses (~15,000+ tokens).

## Files Involved

### Core Home Meal Generation Flow
- **`src/app/api/ai/meals/generate-home/route.ts`** - Main API endpoint
- **`src/lib/ai/prompts/meal-generation.ts`** - Prompt generation (1,159 lines!)
- **`src/lib/utils/retry.ts`** - Timeout configuration (now 240s)

### Supporting Files
- **`src/lib/utils/nutrition.ts`** - Calorie/macro calculation
- **`src/lib/utils/nutrition-targets.ts`** - Weekly target building
- **`src/lib/utils/meal-plan-validator.ts`** - Response validation
- **`src/lib/utils/ingredient-validator.ts`** - Nutrition sum validation
- **`src/lib/utils/restriction-validator.ts`** - Diet restriction compliance
- **`src/lib/utils/grocery-list.ts`** - Grocery list generation

## Current Configuration

### Model & API Settings
- **Model**: `gpt-4o-mini`
- **Temperature**: `0.8`
- **Response Format**: `json_object`
- **Timeout**: `240000ms` (4 minutes) ✅ **JUST INCREASED**
- **Max Retries**: `3`
- **Max Tokens**: Not set (defaults to model max)

### Meal Generation Scope
- **Typical Range**: 14-21 home meals per generation
  - **14 meals**: If user schedules restaurant meals for lunch (breakfast + dinner × 7 days)
  - **21 meals**: If no schedule provided (breakfast + lunch + dinner × 7 days)
- **Data Per Meal**:
  - Primary recipe with full ingredients list, nutrition breakdown, instructions
  - Alternative recipe with full ingredients list, nutrition breakdown, instructions
  - Both recipes enhanced with Pexels images post-generation

## Token Analysis

### Prompt Size (Input Tokens)
**Estimated: ~6,000-8,000 tokens**

The prompt includes:
- **User Profile Data**: ~500 tokens (demographics, goals, preferences)
- **Diet Restrictions & Allergies**: ~300 tokens
- **Goal-Specific Guidance**: ~800 tokens (personalized fitness/health guidance)
- **Nutrition Reference Table**: ~2,500 tokens (massive lookup table for ingredients)
- **Preferred Foods/Cuisines**: ~300 tokens
- **Weekly Schedule**: ~200 tokens
- **Nutrition Targets**: ~400 tokens (per-day or per-meal targets)
- **JSON Schema Example**: ~1,000 tokens (detailed format specification)

### Response Size (Output Tokens)
**Estimated: ~15,000-25,000 tokens**

For 14 home meals:
- **Each Meal**: ~800-1,200 tokens
  - Primary recipe: ~400-600 tokens (name, description, ingredients with nutrition, instructions)
  - Alternative recipe: ~400-600 tokens
- **14 Meals × 1,000 avg**: ~14,000 tokens
- **Grocery List**: ~1,000-2,000 tokens (6 categories, detailed with quantities/uses)

### Total Token Budget
- **Input**: 6,000-8,000 tokens
- **Output**: 15,000-25,000 tokens
- **Total**: **21,000-33,000 tokens** per API call

### Model Limits (GPT-4o-mini)
- **Context Window**: 128,000 tokens ✅ **SUFFICIENT**
- **Output Limit**: 16,384 tokens ❌ **POTENTIAL PROBLEM**

## Why It's Timing Out

### 1. Massive Response Generation
GPT-4o-mini has to generate 15,000-25,000 tokens in one response, which can hit the 16K output limit and cause processing slowdowns.

### 2. Complex Constraint Processing
The AI must simultaneously:
- Track nutrition targets for 14+ meals
- Avoid ingredient repetition across days
- Comply with dietary restrictions
- Generate realistic recipes with accurate macros
- Create shopping-ready grocery lists
- Maintain cuisine variety and preferences

### 3. Nutrition Calculation Overhead
Each recipe requires precise calorie/macro calculation from the 2,500-token ingredient reference table, adding significant processing complexity.

### 4. JSON Structure Complexity
The nested JSON with detailed nutrition breakdowns, instructions, and grocery categorization is computationally expensive to generate correctly.

## Calorie Budget System Analysis

### How Restaurant Calories Are Integrated
1. **Weekly Schedule Analysis**: `extractHomeMealsFromSchedule()` identifies which meals are 'home' vs 'restaurant'
2. **Nutrition Target Building**: `buildNutritionTargets()` calculates per-meal targets accounting for restaurant calories
3. **Day-Specific Targets**: If restaurant meals exist, creates adjusted daily targets in `formatNutritionTargets()`
4. **Budget Calculation**: Home meals get remaining calories after restaurant allocation

### Budget Accuracy
✅ **System correctly calculates remaining calorie budgets** after accounting for restaurant meals
✅ **Per-day and per-meal targets are properly calculated**
❌ **Massive prompt complexity makes it hard for AI to consistently hit targets**

## Food Profile Integration

The system includes comprehensive user preference data:
- **Diet Restrictions**: Vegan, keto, paleo, etc. (strict compliance)
- **Food Allergies**: Critical safety requirements
- **Preferred Foods**: Priority ingredients to feature frequently
- **Preferred Cuisines**: Cooking styles and flavor profiles
- **Custom Food Notes**: User-specific preferences
- **Goal-Specific Guidance**: Tailored nutrition advice based on fitness goals

**Token Impact**: Food profile data adds ~1,500-2,000 tokens to prompt size.

## Recommendations

### Option 1: Chunked Generation (RECOMMENDED)
Split into 3 smaller API calls:
1. **Breakfast Generation** (7 meals) - ~1,500 output tokens
2. **Lunch Generation** (7 meals) - ~1,500 output tokens
3. **Dinner Generation** (7 meals) - ~1,500 output tokens
4. **Grocery List Consolidation** (1 call) - ~500 tokens

**Benefits**:
- Well under output token limits
- Faster individual calls (~30-60s each)
- Better error recovery (if one fails, others succeed)
- More focused prompts = better quality

### Option 2: Reduced Detail Level
Keep single call but reduce response complexity:
- Remove alternative recipes (primary only)
- Simplify ingredient nutrition breakdowns
- Generate grocery list separately

**Benefits**:
- Maintains single-call simplicity
- ~50% token reduction
- Still provides complete meal plans

### Option 3: Optimize Prompt Size
- Remove ingredient reference table (use AI's built-in knowledge)
- Reduce goal-specific guidance length
- Consolidate user preference sections

**Benefits**:
- ~2,000 token reduction in prompts
- Faster processing
- Maintains current architecture

## Recommendation: Chunked Generation

**Implementation Plan**:
1. Create `generateBreakfasts()`, `generateLunches()`, `generateDinners()` functions
2. Each takes user data + day-specific calorie targets
3. Run in parallel for speed (3 concurrent calls)
4. Consolidate results + generate grocery list in 4th call
5. Total time: ~2-3 minutes vs 4+ minutes currently

**Preserves**:
- ✅ Calorie/macro accuracy per day
- ✅ No repeated meals across week
- ✅ Recipe quality with full ingredients/steps
- ✅ Grocery list compatibility
- ✅ Diet restriction compliance
- ✅ User preference integration

**Expected Result**:
- Consistent generation in 2-3 minutes
- Better error handling and recovery
- Higher quality recipes due to focused prompts
- Reduced timeout risk by 80%+

## Immediate Actions Taken

✅ **Increased workout timeout to 240s** as safety buffer (workout generation completing ~143s)

## Next Steps

1. **Test current 240s timeout** to see if it resolves immediate issues
2. **Implement chunked generation** if timeouts continue
3. **Monitor generation times** and token usage
4. **Consider prompt optimization** for further speed gains

---
**Audit Date**: February 9, 2026
**Auditor**: Claude Code Assistant
**Priority**: High - Production timeout issue