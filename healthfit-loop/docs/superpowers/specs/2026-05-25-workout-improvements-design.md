# Workout System Improvements — Design Spec
**Date:** 2026-05-25  
**Status:** Approved

---

## Overview

Improve the workout system across three axes:
1. A static exercise library (TypeScript-seeded DB) users can browse, filter, and add to their plan
2. User-created custom workouts they can save and reuse
3. A feedback loop that feeds past workout data (ratings, completion, custom exercises) back into future AI generation prompts

---

## 1. Data Layer

### 1.1 New Prisma Models

**`ExerciseLibrary`** — static exercise entries, seeded from `src/lib/data/exercise-library.ts`
```
id, name, description, muscleGroup, equipmentType, category,
defaultSets, defaultReps (string e.g. "8-12"), difficulty,
weightGuidance (text), beginnerMod, advancedMod, tags (string[]),
createdAt, updatedAt
```

**`UserCustomWorkout`** — user-saved custom workout routines
```
id, userId, surveyId, name, notes,
exercises (Json: [{name, sets, reps, notes}]),
createdAt, updatedAt
```

**`UserWorkoutAddition`** — tracks exercises added to plan days from library or custom
```
id, userId, surveyId, workoutPlanId, day,
additionType (supplement | standalone),
source (library | custom),
exerciseLibraryId (optional FK),
customData (Json: {name, sets, reps, notes}),
weightUsedLbs (Float, optional — user's chosen weight),
createdAt
```

### 1.2 Existing Models — Changes
- `WorkoutExerciseLog` — already exists; fix the rating persistence (currently falls back to localStorage only). Add `weightUsedLbs Float?` field.
- No other schema changes to existing models.

### 1.3 Seed File
`prisma/seed.ts` reads from `src/lib/data/exercise-library.ts` and upserts all exercises into `ExerciseLibrary`. Running `npx prisma db seed` is idempotent.

---

## 2. Exercise Library Data File

**File:** `src/lib/data/exercise-library.ts`

~80-100 exercises organized into categories. Each entry:

```typescript
{
  name: string
  description: string          // 1-2 sentences, technique-focused
  muscleGroup: string          // primary muscle (e.g. "Hamstrings")
  equipmentType: string        // "Dumbbells" | "Barbell" | "Bodyweight" | "Cable" | "Machine" | "Bands" | "Kettlebell"
  category: string             // "Strength" | "Cardio" | "Mobility" | "HIIT" | "Core"
  defaultSets: number          // e.g. 3
  defaultReps: string          // e.g. "8-12" or "30 sec"
  difficulty: string           // "beginner" | "intermediate" | "advanced"
  weightGuidance: string       // principle-based, no prescribed numbers
  beginnerMod: string
  advancedMod: string
  tags: string[]               // ["posterior chain", "hip hinge", "compound"]
}
```

**Categories covered:**
- Chest (8 exercises)
- Back (10 exercises)
- Legs / Glutes (12 exercises)
- Shoulders (8 exercises)
- Arms (8 exercises)
- Core (10 exercises)
- Cardio (8 exercises)
- Mobility / Flexibility (8 exercises)
- Full Body / Compound (8 exercises)

---

## 3. API Routes

### New Routes

**`GET /api/exercises`**
- Returns full library, optionally filtered by `?muscleGroup=&equipmentType=&difficulty=&search=`
- Reads from `ExerciseLibrary` DB table

**`POST /api/exercises/add-to-plan`**
- Body: `{ workoutPlanId, day, additionType, source, exerciseLibraryId?, customData?, weightUsedLbs? }`
- Creates `UserWorkoutAddition` record
- Returns updated day exercises

**`GET/POST/PUT/DELETE /api/workouts/custom`**
- CRUD for `UserCustomWorkout`
- GET returns all customs for current user/survey
- POST creates new custom workout
- PUT updates existing
- DELETE removes

**`GET /api/workouts/last-weight`**
- `?exerciseName=` — returns last `weightUsedLbs` for that exercise from `UserWorkoutAddition` or `WorkoutExerciseLog`
- Used to pre-fill the weight input when user opens an exercise card

### Modified Routes

**`/api/ai/workouts/generate`** — inject feedback context block into prompt (see section 4)

**`/api/workouts/log-exercise`** — accept and persist `weightUsedLbs` field

---

## 4. Prompt Improvements

In `src/lib/ai/prompts/workout-generation.ts`, add a conditional context block injected after the user profile section:

```
PAST WORKOUT FEEDBACK (use to improve this week's plan):
- Exercises rated poorly (avoid or substitute): [list]
- Exercises rated well (include variations): [list]  
- Completion rate by day: Mon 90%, Wed 40% → reduce Wed volume
- User's saved custom exercises (reference their style): [list of names]
```

**Rules:**
- Block is omitted entirely if user has no prior workout data (new users unaffected)
- Data sourced from: `WorkoutExerciseLog` (ratings), `WorkoutLog` (completion), `UserCustomWorkout` (saved exercises)
- Fetched in the generate route before prompt construction, passed into `createWorkoutPlanPrompt()`
- Max 10 items per list to keep prompt token count controlled

---

## 5. UI Changes

### 5.1 WorkoutPlanPage.tsx — "Add Exercise" Button

- Each workout day card gets a small "+ Add Exercise" button below the exercise list
- Clicking opens a modal (reuse existing modal patterns from meal plan UI)
- Modal shows library filtered to the day's primary muscle group by default
- User can search, change filters, browse
- Each exercise card in modal shows:
  - Name, difficulty badge, muscle group, equipment tag
  - Description (1-2 lines)
  - Default sets × reps
  - Weight guidance text
  - `[ ___ ] lbs` input (pre-filled from last use)
  - "Add to Day" button → `additionType: supplement`
  - "Log Standalone" button → `additionType: standalone`

### 5.2 New Tab: Exercise Library

Added as a tab in the workout section, consistent with existing dashboard tab navigation.

**"Library" sub-tab:**
- Filter bar: muscle group chips (scrollable row) + equipment dropdown + difficulty toggle
- Search input
- Exercise cards in a grid (2-col mobile, 3-col desktop)
- Each card: name, difficulty badge, muscle/equipment tags, short description, "+ Add" button
- Tapping a card expands it inline to show full detail + weight input + add buttons

**"My Workouts" sub-tab:**
- List of user's saved custom workouts
- Each row: name, exercise count, notes preview, edit/delete icons
- "Create Workout" button → form with:
  - Workout name
  - Notes textarea
  - Dynamic exercise list: add rows of `{name, sets, reps, notes}`
  - Save button

### 5.3 Weight Input Component

Reusable `WeightInput` component:
- Small number input + "lbs" label
- Pre-fills from `/api/workouts/last-weight` on mount
- Saves on blur/submit
- Used in both the library modal and exercise detail view

### 5.4 Styling Notes
- Match existing workout card styles (same border radius, shadow, color tokens)
- Difficulty badges: green = beginner, yellow = intermediate, red = advanced
- Keep cards compact — name + badges + 2-line description is enough at rest
- Expanded state shows full detail inline, no new page navigation
- No extra wordiness — mirror the meal plan card density

---

## 6. What Stays the Same

- AI generation flow, validation, image caching — untouched
- Survey workout preference collection — untouched  
- Existing logging, completion tracking — untouched (just adding weightUsedLbs)
- WorkoutProfile text document — untouched

---

## 7. Implementation Order

1. Exercise library TS data file (no deps)
2. Prisma schema additions + migration + seed
3. API routes (exercises, custom workouts, last-weight, add-to-plan)
4. Prompt feedback context block
5. WeightInput component
6. Library modal on WorkoutPlanPage
7. Exercise Library tab + My Workouts sub-tab
