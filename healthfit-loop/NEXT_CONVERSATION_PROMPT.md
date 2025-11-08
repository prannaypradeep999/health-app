# 🍽️ MEAL GENERATION API FIXES - NEXT CONVERSATION INSTRUCTIONS

## REPOSITORY CONTEXT
This is a Next.js meal planning app. The main API route is `/src/app/api/ai/meals/generate/route.ts` which generates weekly meal plans using:
1. Google Places to find restaurants
2. Tavily to search for menu content
3. GPT to extract dish names and create meal plans

## EXACT ISSUES IDENTIFIED

### 🔍 ISSUE #1: Restaurant Name Confusion in Tavily Searches
**Problem:** Tavily searches like `"Bottega" "San Francisco" menu` return WRONG restaurants with similar names:
- Searching for "Bottega" (1132 Valencia St) returns "La Bottega" (different restaurant)
- This causes hallucinated dishes like "Tuscan Cobb Salad" that don't exist at the target restaurant

**Evidence:** Testing script shows Tavily finds `https://labottegala.com/pages/menu-2025-test` instead of actual Bottega SF

### 🍽️ ISSUE #2: Final Meal Selection Too Restrictive
**Problem:** The `selectRestaurantMeals()` function only picks 4-6 dishes TOTAL across ALL restaurants for the entire week
- This causes repetition: same dish appears multiple days
- Should pick 2-3 dishes PER restaurant (10-15 total diverse dishes)
- Current result: "Immunity Bone Broth" appears on Day 1, 2, 3, 4

## SOLUTIONS TO IMPLEMENT

### ✅ FIX #1: More Specific Tavily Queries
**Current queries:**
```javascript
"${restaurant.name}" "${restaurant.city}" menu prices dishes
"${restaurant.name}" "${restaurant.city}" site:doordash.com/store
```

**New queries needed:**
```javascript
"${restaurant.name}" "${restaurant.address}" menu prices dishes
"${restaurant.name}" "${restaurant.zipCode}" site:doordash.com/store
```
This will target the EXACT restaurant location, not similar-named restaurants.

### ✅ FIX #2: Diverse Meal Selection Logic
**Current logic:** Pick 4-6 dishes total across all restaurants
**New logic:** Pick 2-3 dishes PER restaurant for diverse weekly meals

**File to modify:** Lines 963-1072 in `/src/app/api/ai/meals/generate/route.ts`
**Function:** `selectRestaurantMeals()`

Change prompt from:
"Select 4-6 restaurant meals for a 4-day period"
To:
"Select 2-3 specific dishes from EACH restaurant that has menu data (10-15 total dishes)"

## TESTING APPROACH

### Phase 1: Test Fixes in Script
1. **Use existing testing scripts:**
   - `test-tavily-queries.js` - to test new specific queries
   - `test-gpt-extraction.js` - to test meal selection logic

2. **Verify results:**
   - Each restaurant returns CORRECT menu content (not wrong restaurant)
   - GPT extracts 8-12 diverse dishes per restaurant
   - Final meal plan has different dishes each day

### Phase 2: Implement in Main Route
1. **Update `/src/app/api/ai/meals/generate/route.ts`:**
   - Lines 505-530: Update Tavily query strategies
   - Lines 963-1072: Update meal selection logic

2. **Test with API call:**
   ```bash
   curl -X POST -H "Content-Type: application/json" -H "Cookie: survey_id=cmhp4ciq500019k4sk6vgwyg9; guest_session=CBzXVISzsTQ8P7IwIIDHl" http://localhost:3001/api/ai/meals/generate
   ```

## EXPECTED FINAL RESULT

### ✅ What Success Looks Like:
- **10-15 diverse restaurant dishes** across the week
- **Each day has different meals** (no repetition)
- **Real dish names** like "Grilled Chicken Breast Rice Bowl", "Lasagne Al Forno", "Carpaccio Tonno"
- **Correct restaurant matching** (no wrong restaurant menus)

### ❌ Current Bad Result:
```json
Day 1: "Immunity Bone Broth", Day 2: "Immunity Bone Broth", Day 3: "Immunity Bone Broth"
```

### ✅ Target Good Result:
```json
Day 1 Lunch: "Grilled Chicken Breast Rice Bowl" (The Bite)
Day 1 Dinner: "Lasagne Al Forno" (Bottega)
Day 2 Lunch: "Crab Ravioli" (Piccolo Forno)
Day 2 Dinner: "Wild Rice Bowl" (Kitava)
Day 3 Lunch: "White Peach & Lychee Sorbet" (Pearl 6101)
Day 3 Dinner: "Lamb & Beef Gyro Rice Bowl" (The Bite)
Day 4 Lunch: "Antipasto Bottega for Two" (Bottega)
Day 4 Dinner: "Margherita Pizza" (Piccolo Forno)
```

## KEY FILES TO MODIFY
1. **Main route:** `/src/app/api/ai/meals/generate/route.ts` (lines 505-530, 963-1072)
2. **Test scripts:** `test-tavily-queries.js`, `test-gpt-extraction.js`

## VERIFICATION CHECKLIST
- [ ] Tavily returns correct restaurant menu content (not similar-named restaurants)
- [ ] GPT extracts 8-12 specific dishes per restaurant
- [ ] Final meal plan has 10-15 diverse dishes across the week
- [ ] No dish repetition across days
- [ ] All dishes have real names (not generic "Rice Bowl")
- [ ] API response shows different meals for breakfast/lunch/dinner each day

## START HERE
1. Read this file completely
2. Examine `test-tavily-queries.js` and `test-gpt-extraction.js` to understand current testing
3. Update the testing scripts first
4. Test the new queries and selection logic
5. Once proven working, implement in main route
6. Test with full API call to verify 10-15 diverse dishes per week