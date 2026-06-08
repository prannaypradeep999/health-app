# Workout Library Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove "Log Alternative Workout", replace with cardio entries in the exercise library, add DB-backed favorites with AI feedback, and improve exercise library UI with loading states, star buttons, and richer cards.

**Architecture:** Favorites stored in a new `UserExerciseFavorite` DB model, queried by cookie-based userId/surveyId. Cardio activities (Running, Swimming, etc.) added as exercise library entries so they flow through the existing `UserWorkoutAddition` pipeline into the AI feedback context. UI components get loading states, star toggles, and a Favorites filter chip.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + PostgreSQL (Neon), React 19, Tailwind CSS 4, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src/lib/data/exercise-library.ts` | Add 6 cardio/activity entries |
| `prisma/schema.prisma` | Add `UserExerciseFavorite` model + relations to User and ExerciseLibrary |
| `prisma/seed.ts` | No change — re-run to seed new entries |
| `src/app/api/exercises/favorites/route.ts` | NEW — GET/POST/DELETE favorites |
| `src/lib/ai/prompts/workout-generation.ts` | Add `favoriteExercises` to interface + feedbackBlock |
| `src/app/api/ai/workouts/generate/route.ts` | Query favorites in `getWorkoutFeedbackContext` |
| `src/components/dashboard/ExerciseLibraryModal.tsx` | Loading state, star buttons, Favorites filter, richer cards |
| `src/components/dashboard/ExerciseLibraryTab.tsx` | Same as modal |
| `src/components/dashboard/WorkoutPlanPage.tsx` | Remove Log Alternative Workout button, modal, related state/functions |

---

### Task 1: Add cardio activity entries to exercise library + re-seed

**Files:**
- Modify: `src/lib/data/exercise-library.ts`
- Run: `npx tsx prisma/seed.ts`

- [ ] **Step 1: Add 6 entries to the end of EXERCISE_LIBRARY array**

Open `src/lib/data/exercise-library.ts`. Before the closing `];` of the `EXERCISE_LIBRARY` array, add:

```typescript
  // Cardio Activities
  {
    name: 'Running',
    description: 'Sustained aerobic activity that builds cardiovascular endurance and burns calories. Scale distance and pace to your current fitness level.',
    muscleGroup: 'Cardio',
    equipmentType: 'Bodyweight',
    category: 'Cardio',
    defaultSets: 1,
    defaultReps: '20-60 min',
    difficulty: 'beginner',
    weightGuidance: 'No equipment needed. Track duration and perceived effort (aim for RPE 6-7 for easy runs, 8-9 for intervals).',
    beginnerMod: 'Alternate walking and jogging — 1 min jog, 2 min walk, repeat for 20 min.',
    advancedMod: 'Add tempo intervals: 10 min warm-up, 20 min at 80% effort, 10 min cool-down.',
    tags: ['cardio', 'endurance', 'outdoor', 'running'],
  },
  {
    name: 'Swimming',
    description: 'Full-body low-impact cardio that builds endurance and strength simultaneously. Excellent for joint-friendly conditioning.',
    muscleGroup: 'Cardio',
    equipmentType: 'Bodyweight',
    category: 'Cardio',
    defaultSets: 1,
    defaultReps: '20-45 min',
    difficulty: 'intermediate',
    weightGuidance: 'No equipment needed. Focus on breathing rhythm — exhale underwater, inhale on stroke rotation.',
    beginnerMod: 'Swim easy laps with rest at each wall. Aim for 10-15 min continuous, rest 60 sec, repeat.',
    advancedMod: 'Interval sets: 4×100m at race pace with 30 sec rest between sets.',
    tags: ['cardio', 'endurance', 'low-impact', 'swimming', 'full body'],
  },
  {
    name: 'Cycling',
    description: 'Leg-dominant cardio that builds aerobic capacity and lower body endurance with low joint impact. Works on a bike or stationary trainer.',
    muscleGroup: 'Cardio',
    equipmentType: 'Equipment',
    category: 'Cardio',
    defaultSets: 1,
    defaultReps: '30-60 min',
    difficulty: 'beginner',
    weightGuidance: 'Keep cadence 80-100 RPM and adjust resistance to hit your target heart rate rather than grinding a hard gear.',
    beginnerMod: 'Flat terrain or low resistance — focus on consistent cadence for 20-30 min.',
    advancedMod: 'Add hill climbs or resistance intervals: 2 min hard effort, 2 min easy, repeat 8-10 times.',
    tags: ['cardio', 'endurance', 'legs', 'cycling', 'low-impact'],
  },
  {
    name: 'Yoga Session',
    description: 'Movement practice combining postures, breathwork, and mindfulness to improve flexibility, balance, and recovery.',
    muscleGroup: 'Mobility',
    equipmentType: 'Bodyweight',
    category: 'Mobility',
    defaultSets: 1,
    defaultReps: '30-60 min',
    difficulty: 'beginner',
    weightGuidance: 'No weight needed. Use a mat. A block or strap helps with tight hips and hamstrings.',
    beginnerMod: 'Follow a beginner YouTube flow (Yoga with Adriene recommended). Hold poses 3-5 breaths.',
    advancedMod: 'Power yoga or ashtanga flow at a faster pace with longer holds (5-10 breaths per pose).',
    tags: ['mobility', 'flexibility', 'recovery', 'yoga', 'mindfulness'],
  },
  {
    name: 'Group Fitness Class',
    description: 'Instructor-led workout in a group setting — spin, Zumba, bootcamp, Pilates, etc. High energy and motivating.',
    muscleGroup: 'Cardio',
    equipmentType: 'Equipment',
    category: 'Cardio',
    defaultSets: 1,
    defaultReps: '45-60 min',
    difficulty: 'intermediate',
    weightGuidance: 'Equipment varies by class type. Arrive early to set up your station and choose appropriate weight/resistance.',
    beginnerMod: 'Choose a beginner or all-levels class. Modify intensity as needed — instructor will offer options.',
    advancedMod: 'Take advanced sections of the class and push to maximum effort on intervals.',
    tags: ['cardio', 'group', 'class', 'social', 'instructor-led'],
  },
  {
    name: 'HIIT Session',
    description: 'High-intensity interval training alternating between maximum effort bursts and active recovery. Maximises calorie burn in minimal time.',
    muscleGroup: 'Cardio',
    equipmentType: 'Bodyweight',
    category: 'HIIT',
    defaultSets: 1,
    defaultReps: '20-30 min',
    difficulty: 'advanced',
    weightGuidance: 'No equipment needed. Work:rest ratio of 2:1 (40 sec on, 20 sec rest). Maintain form even when fatigued.',
    beginnerMod: 'Start with 1:1 ratio (30 sec work, 30 sec rest) and choose lower-impact movements (step instead of jump).',
    advancedMod: 'Reduce rest to 10 sec and add weighted movements (dumbbells, kettlebell swings).',
    tags: ['cardio', 'hiit', 'intervals', 'fat-burn', 'bodyweight'],
  },
```

- [ ] **Step 2: Re-run seed to insert new entries**

```bash
npx tsx prisma/seed.ts
```

Expected output: `Seeded X exercises` (should be 57 total — 51 existing + 6 new).

- [ ] **Step 3: Verify in DB**

```bash
node -e "
const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();
p.exerciseLibrary.count().then(n => { console.log('Total exercises:', n); p.\$disconnect(); });
"
```

Expected: `Total exercises: 57`

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/exercise-library.ts
git commit -m "feat: add cardio activity entries to exercise library (Running, Swimming, Cycling, Yoga, Group Fitness, HIIT)"
```

---

### Task 2: Prisma schema — add UserExerciseFavorite model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add UserExerciseFavorite model**

At the end of `prisma/schema.prisma`, before the `enum HealthGoal` block, add:

```prisma
model UserExerciseFavorite {
  id                String          @id @default(cuid())
  userId            String?
  surveyId          String?
  exerciseLibraryId String
  createdAt         DateTime        @default(now())

  user            User?           @relation(fields: [userId], references: [id], onDelete: Cascade)
  exerciseLibrary ExerciseLibrary @relation(fields: [exerciseLibraryId], references: [id], onDelete: Cascade)

  @@unique([userId, exerciseLibraryId])
  @@unique([surveyId, exerciseLibraryId])
  @@index([userId])
  @@index([surveyId])
}
```

- [ ] **Step 2: Add relation to User model**

In `prisma/schema.prisma`, find the User model's relations section (after `workoutAdditions UserWorkoutAddition[]`) and add:

```prisma
  exerciseFavorites UserExerciseFavorite[]
```

- [ ] **Step 3: Add relation to ExerciseLibrary model**

In `prisma/schema.prisma`, find the ExerciseLibrary model's relations section (after `additions UserWorkoutAddition[]`) and add:

```prisma
  favorites UserExerciseFavorite[]
```

- [ ] **Step 4: Run migration**

```bash
npx prisma migrate dev --name add_exercise_favorites
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 5: Verify Prisma client generated**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add UserExerciseFavorite model to schema"
```

---

### Task 3: Favorites API route

**Files:**
- Create: `src/app/api/exercises/favorites/route.ts`

- [ ] **Step 1: Create the file**

Create `src/app/api/exercises/favorites/route.ts` with this content:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

async function getIdentifiers() {
  const cookieStore = await cookies();
  return {
    userId: cookieStore.get('user_id')?.value ?? null,
    surveyId: cookieStore.get('survey_id')?.value ?? null,
  };
}

export async function GET() {
  try {
    const { userId, surveyId } = await getIdentifiers();
    const userFilter = [
      ...(userId ? [{ userId }] : []),
      ...(surveyId ? [{ surveyId }] : []),
    ];
    if (userFilter.length === 0) return NextResponse.json({ favoriteIds: [] });

    const favorites = await prisma.userExerciseFavorite.findMany({
      where: { OR: userFilter },
      select: { exerciseLibraryId: true },
    });

    return NextResponse.json({ favoriteIds: favorites.map(f => f.exerciseLibraryId) });
  } catch (error) {
    console.error('[FAVORITES GET] Error:', error);
    return NextResponse.json({ favoriteIds: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, surveyId } = await getIdentifiers();
    if (!userId && !surveyId) {
      return NextResponse.json({ error: 'Not identified' }, { status: 401 });
    }

    const { exerciseLibraryId } = await req.json();
    if (!exerciseLibraryId) {
      return NextResponse.json({ error: 'Missing exerciseLibraryId' }, { status: 400 });
    }

    const favorite = await prisma.userExerciseFavorite.upsert({
      where: userId
        ? { userId_exerciseLibraryId: { userId, exerciseLibraryId } }
        : { surveyId_exerciseLibraryId: { surveyId: surveyId!, exerciseLibraryId } },
      create: {
        userId: userId ?? null,
        surveyId: surveyId ?? null,
        exerciseLibraryId,
      },
      update: {},
    });

    return NextResponse.json({ success: true, favorite });
  } catch (error) {
    console.error('[FAVORITES POST] Error:', error);
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, surveyId } = await getIdentifiers();
    if (!userId && !surveyId) {
      return NextResponse.json({ error: 'Not identified' }, { status: 401 });
    }

    const { exerciseLibraryId } = await req.json();
    if (!exerciseLibraryId) {
      return NextResponse.json({ error: 'Missing exerciseLibraryId' }, { status: 400 });
    }

    await prisma.userExerciseFavorite.deleteMany({
      where: {
        exerciseLibraryId,
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(surveyId ? [{ surveyId }] : []),
        ],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FAVORITES DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/exercises/favorites/route.ts
git commit -m "feat: add favorites API route (GET/POST/DELETE)"
```

---

### Task 4: Wire favorites into AI feedback context

**Files:**
- Modify: `src/lib/ai/prompts/workout-generation.ts`
- Modify: `src/app/api/ai/workouts/generate/route.ts`

- [ ] **Step 1: Add favoriteExercises to WorkoutFeedbackContext interface**

In `src/lib/ai/prompts/workout-generation.ts`, find the `WorkoutFeedbackContext` interface (lines 69-74) and update it to:

```typescript
export interface WorkoutFeedbackContext {
  poorlyRatedExercises: string[];
  wellRatedExercises: string[];
  completionRateByDay: Record<string, number>;
  savedCustomExercises: string[];
  favoriteExercises: string[];
}
```

- [ ] **Step 2: Add favoriteExercises to feedbackBlock**

In `src/lib/ai/prompts/workout-generation.ts`, find the feedbackBlock conditional. Update the check condition and add a line for favorites. The full updated feedbackBlock should be:

```typescript
const feedbackBlock = feedbackContext && (
  feedbackContext.poorlyRatedExercises.length > 0 ||
  feedbackContext.wellRatedExercises.length > 0 ||
  feedbackContext.savedCustomExercises.length > 0 ||
  feedbackContext.favoriteExercises.length > 0 ||
  Object.keys(feedbackContext.completionRateByDay).length > 0
) ? `\n\nPAST WORKOUT FEEDBACK (use this to improve the plan):
${feedbackContext.poorlyRatedExercises.length > 0 ? `- Exercises rated poorly — avoid or substitute: ${feedbackContext.poorlyRatedExercises.slice(0, 10).join(', ')}` : ''}
${feedbackContext.wellRatedExercises.length > 0 ? `- Exercises rated well — include variations: ${feedbackContext.wellRatedExercises.slice(0, 10).join(', ')}` : ''}
${Object.keys(feedbackContext.completionRateByDay).length > 0 ? `- Completion rate by day: ${Object.entries(feedbackContext.completionRateByDay).map(([d, r]) => `${d} ${r}%`).join(', ')} — reduce volume on low-completion days` : ''}
${feedbackContext.savedCustomExercises.length > 0 ? `- User's saved exercises (reference their style): ${feedbackContext.savedCustomExercises.slice(0, 10).join(', ')}` : ''}
${feedbackContext.favoriteExercises.length > 0 ? `- User's favourite exercises — include variations or progressions: ${feedbackContext.favoriteExercises.slice(0, 10).join(', ')}` : ''}` : '';
```

- [ ] **Step 3: Query favorites in getWorkoutFeedbackContext**

In `src/app/api/ai/workouts/generate/route.ts`, find the `getWorkoutFeedbackContext` function. Update the `Promise.all` to include a fourth query and add favorites to the return:

```typescript
async function getWorkoutFeedbackContext(surveyData: any): Promise<WorkoutFeedbackContext | undefined> {
  const userId = surveyData.userId;
  const surveyId = surveyData.id;
  if (!userId && !surveyId) return undefined;

  const userFilter = [
    ...(userId ? [{ userId }] : []),
    ...(surveyId ? [{ surveyId }] : []),
  ];

  const [exerciseLogs, workoutLogs, customWorkouts, favoritesRaw] = await Promise.all([
    prisma.workoutExerciseLog.findMany({
      where: { workoutLog: { userId: userId || undefined } },
      select: { exerciseName: true, difficultyRating: true, formRating: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workoutLog.findMany({
      where: { userId: userId || undefined },
      select: { day: true, completed: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userCustomWorkout.findMany({
      where: { OR: userFilter },
      select: { exercises: true },
      take: 10,
    }),
    prisma.userExerciseFavorite.findMany({
      where: { OR: userFilter },
      select: { exerciseLibrary: { select: { name: true } } },
      take: 20,
    }),
  ]);

  const poor = exerciseLogs.filter(l => (l.difficultyRating || 0) >= 8).map(l => l.exerciseName);
  const good = exerciseLogs.filter(l => (l.formRating || 0) >= 8).map(l => l.exerciseName);

  const dayTotals: Record<string, { total: number; completed: number }> = {};
  for (const log of workoutLogs) {
    if (!dayTotals[log.day]) dayTotals[log.day] = { total: 0, completed: 0 };
    dayTotals[log.day].total++;
    if (log.completed) dayTotals[log.day].completed++;
  }
  const completionRateByDay: Record<string, number> = {};
  for (const [day, { total, completed }] of Object.entries(dayTotals)) {
    completionRateByDay[day] = Math.round((completed / total) * 100);
  }

  const savedNames = customWorkouts.flatMap(cw => {
    const exs = cw.exercises as Array<{ name: string }>;
    return exs.map(e => e.name);
  });

  const favoriteNames = favoritesRaw.map(f => f.exerciseLibrary.name);

  if (!poor.length && !good.length && !savedNames.length && !favoriteNames.length && !Object.keys(completionRateByDay).length) {
    return undefined;
  }

  return {
    poorlyRatedExercises: [...new Set(poor)].slice(0, 10),
    wellRatedExercises: [...new Set(good)].slice(0, 10),
    completionRateByDay,
    savedCustomExercises: [...new Set(savedNames)].slice(0, 10),
    favoriteExercises: [...new Set(favoriteNames)].slice(0, 10),
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/prompts/workout-generation.ts src/app/api/ai/workouts/generate/route.ts
git commit -m "feat: add favoriteExercises to AI workout feedback context"
```

---

### Task 5: Update ExerciseLibraryModal — loading state, stars, favorites filter, richer cards

**Files:**
- Modify: `src/components/dashboard/ExerciseLibraryModal.tsx`

- [ ] **Step 1: Replace the full file content**

Replace `src/components/dashboard/ExerciseLibraryModal.tsx` with:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Search, Plus, Star, Loader2 } from 'lucide-react';
import WeightInput from './WeightInput';

interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  equipmentType: string;
  category: string;
  defaultSets: number;
  defaultReps: string;
  difficulty: string;
  weightGuidance: string;
  beginnerMod: string;
  advancedMod: string;
  tags: string[];
}

interface ExerciseLibraryModalProps {
  open: boolean;
  onClose: () => void;
  workoutPlanId: string;
  day: string;
  defaultMuscleGroup?: string;
  onAdded: (exercise: LibraryExercise, additionType: 'supplement' | 'standalone', weight: number | null) => void;
}

const MUSCLE_GROUPS = ['Favorites', 'All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Mobility', 'Full Body'];
const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced: 'bg-red-100 text-red-700',
};

export default function ExerciseLibraryModal({
  open, onClose, workoutPlanId, day, defaultMuscleGroup, onAdded,
}: ExerciseLibraryModalProps) {
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(defaultMuscleGroup || 'All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number | null>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());

  const fetchFavorites = useCallback(async () => {
    const res = await fetch('/api/exercises/favorites');
    const data = await res.json();
    setFavorited(new Set(data.favoriteIds || []));
  }, []);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedGroup !== 'All' && selectedGroup !== 'Favorites') params.set('muscleGroup', selectedGroup);
      if (search) params.set('search', search);
      const res = await fetch(`/api/exercises?${params}`);
      const data = await res.json();
      setExercises(data.exercises || []);
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, search]);

  useEffect(() => {
    if (open) {
      fetchFavorites();
      fetchExercises();
    }
  }, [open, fetchExercises, fetchFavorites]);

  async function toggleFavorite(exerciseId: string) {
    const isFav = favorited.has(exerciseId);
    setFavorited(prev => {
      const next = new Set(prev);
      isFav ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
    await fetch('/api/exercises/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseLibraryId: exerciseId }),
    });
  }

  async function handleAdd(exercise: LibraryExercise, additionType: 'supplement' | 'standalone') {
    setAdding(`${exercise.id}-${additionType}`);
    await fetch('/api/exercises/add-to-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workoutPlanId, day, additionType, source: 'library',
        exerciseLibraryId: exercise.id,
        weightUsedLbs: weights[exercise.id] ?? null,
      }),
    });
    setAdding(null);
    onAdded(exercise, additionType, weights[exercise.id] ?? null);
  }

  const displayedExercises = selectedGroup === 'Favorites'
    ? exercises.filter(ex => favorited.has(ex.id))
    : exercises;

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="flex flex-col p-0">
        <DrawerHeader className="px-5 pt-4 pb-3 border-b border-gray-100">
          <DrawerTitle className="text-base font-semibold">Add Exercise</DrawerTitle>
        </DrawerHeader>

        <div className="px-5 py-3 border-b border-gray-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MUSCLE_GROUPS.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedGroup === g
                    ? g === 'Favorites' ? 'bg-amber-400 text-white' : 'bg-red-600 text-white'
                    : g === 'Favorites' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {g === 'Favorites' ? '★ Favorites' : g}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
          {!loading && displayedExercises.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              {selectedGroup === 'Favorites' ? 'No favourites yet — star exercises to save them here.' : 'No exercises found.'}
            </p>
          )}
          {!loading && displayedExercises.map(ex => (
            <div key={ex.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-start justify-between p-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-900">{ex.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[ex.difficulty]}`}>
                      {ex.difficulty}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                      {ex.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{ex.muscleGroup}</span>
                    <span>·</span>
                    <span>{ex.equipmentType}</span>
                    <span>·</span>
                    <span>{ex.defaultSets}×{ex.defaultReps}</span>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); toggleFavorite(ex.id); }}
                  className="flex-shrink-0 p-1 rounded-lg hover:bg-amber-50 transition-colors ml-1"
                  aria-label={favorited.has(ex.id) ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <Star
                    className={`w-4 h-4 transition-colors ${favorited.has(ex.id) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                  />
                </button>
              </button>

              {expandedId === ex.id && (
                <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
                  <p className="text-sm text-gray-600">{ex.description}</p>
                  <div className="bg-blue-50 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-blue-700 mb-0.5">Weight Guidance</p>
                    <p className="text-xs text-blue-600">{ex.weightGuidance}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>
                      <span className="font-medium text-gray-700">Easier: </span>{ex.beginnerMod}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Harder: </span>{ex.advancedMod}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Your weight:</span>
                      <WeightInput
                        exerciseName={ex.name}
                        onWeightChange={w => setWeights(prev => ({ ...prev, [ex.id]: w }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAdd(ex, 'supplement')}
                        disabled={!!adding}
                        className="flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add to {day}
                      </button>
                      <button
                        onClick={() => handleAdd(ex, 'standalone')}
                        disabled={!!adding}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Log Standalone
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/ExerciseLibraryModal.tsx
git commit -m "feat: add loading state, star favorites, Favorites filter, and category pill to ExerciseLibraryModal"
```

---

### Task 6: Update ExerciseLibraryTab — same improvements

**Files:**
- Modify: `src/components/dashboard/ExerciseLibraryTab.tsx`

- [ ] **Step 1: Replace the full file content**

Replace `src/components/dashboard/ExerciseLibraryTab.tsx` with:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, Edit2, ChevronDown, ChevronUp, Star, Loader2 } from 'lucide-react';
import WeightInput from './WeightInput';

interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  equipmentType: string;
  category: string;
  defaultSets: number;
  defaultReps: string;
  difficulty: string;
  weightGuidance: string;
  beginnerMod: string;
  advancedMod: string;
  tags: string[];
}

interface CustomWorkout {
  id: string;
  name: string;
  notes?: string;
  exercises: Array<{ name: string; sets: string; reps: string; notes?: string }>;
}

const MUSCLE_GROUPS = ['Favorites', 'All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Mobility', 'Full Body'];
const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced: 'bg-red-100 text-red-700',
};

export default function ExerciseLibraryTab() {
  const [activeTab, setActiveTab] = useState<'library' | 'myworkouts'>('library');

  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());

  const [customs, setCustoms] = useState<CustomWorkout[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formExercises, setFormExercises] = useState([{ name: '', sets: '3', reps: '10', notes: '' }]);

  const fetchFavorites = useCallback(async () => {
    const res = await fetch('/api/exercises/favorites');
    const data = await res.json();
    setFavorited(new Set(data.favoriteIds || []));
  }, []);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedGroup !== 'All' && selectedGroup !== 'Favorites') params.set('muscleGroup', selectedGroup);
      if (search) params.set('search', search);
      const res = await fetch(`/api/exercises?${params}`);
      const data = await res.json();
      setExercises(data.exercises || []);
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, search]);

  const fetchCustoms = useCallback(async () => {
    const res = await fetch('/api/workouts/custom');
    const data = await res.json();
    setCustoms(data.customs || []);
  }, []);

  useEffect(() => { fetchFavorites(); fetchExercises(); }, [fetchFavorites, fetchExercises]);
  useEffect(() => { if (activeTab === 'myworkouts') fetchCustoms(); }, [activeTab, fetchCustoms]);

  async function toggleFavorite(exerciseId: string) {
    const isFav = favorited.has(exerciseId);
    setFavorited(prev => {
      const next = new Set(prev);
      isFav ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
    await fetch('/api/exercises/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseLibraryId: exerciseId }),
    });
  }

  async function saveCustomWorkout() {
    if (!formName.trim()) return;
    const body = { name: formName, notes: formNotes, exercises: formExercises.filter(e => e.name.trim()) };
    if (editingId) {
      await fetch('/api/workouts/custom', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) });
    } else {
      await fetch('/api/workouts/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    setShowCreateForm(false);
    setEditingId(null);
    setFormName('');
    setFormNotes('');
    setFormExercises([{ name: '', sets: '3', reps: '10', notes: '' }]);
    fetchCustoms();
  }

  async function deleteCustom(id: string) {
    await fetch(`/api/workouts/custom?id=${id}`, { method: 'DELETE' });
    fetchCustoms();
  }

  function startEdit(cw: CustomWorkout) {
    setEditingId(cw.id);
    setFormName(cw.name);
    setFormNotes(cw.notes || '');
    setFormExercises(cw.exercises.length > 0 ? cw.exercises.map(e => ({ ...e, notes: e.notes ?? '' })) : [{ name: '', sets: '3', reps: '10', notes: '' }]);
    setShowCreateForm(true);
  }

  const displayedExercises = selectedGroup === 'Favorites'
    ? exercises.filter(ex => favorited.has(ex.id))
    : exercises;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-100 mb-4">
        {(['library', 'myworkouts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'library' ? 'Exercise Library' : 'My Workouts'}
          </button>
        ))}
      </div>

      {activeTab === 'library' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {MUSCLE_GROUPS.map(g => (
                <button key={g} onClick={() => setSelectedGroup(g)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedGroup === g
                      ? g === 'Favorites' ? 'bg-amber-400 text-white' : 'bg-red-600 text-white'
                      : g === 'Favorites' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {g === 'Favorites' ? '★ Favorites' : g}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}
            {!loading && displayedExercises.map(ex => (
              <div key={ex.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-start justify-between p-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{ex.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[ex.difficulty]}`}>{ex.difficulty}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{ex.category}</span>
                    </div>
                    <p className="text-xs text-gray-500">{ex.muscleGroup} · {ex.equipmentType} · {ex.defaultSets}×{ex.defaultReps}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); toggleFavorite(ex.id); }}
                      className="p-1 rounded-lg hover:bg-amber-50 transition-colors"
                      aria-label={favorited.has(ex.id) ? 'Remove from favourites' : 'Add to favourites'}
                    >
                      <Star className={`w-4 h-4 transition-colors ${favorited.has(ex.id) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                    </button>
                    {expandedId === ex.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {expandedId === ex.id && (
                  <div className="px-3 pb-3 pt-2 border-t border-gray-100 space-y-2">
                    <p className="text-sm text-gray-600">{ex.description}</p>
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-blue-700 mb-0.5">Weight Guidance</p>
                      <p className="text-xs text-blue-600">{ex.weightGuidance}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div><span className="font-medium text-gray-700">Easier: </span>{ex.beginnerMod}</div>
                      <div><span className="font-medium text-gray-700">Harder: </span>{ex.advancedMod}</div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-gray-500">Your weight:</span>
                      <WeightInput exerciseName={ex.name} />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!loading && displayedExercises.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                {selectedGroup === 'Favorites' ? 'No favourites yet — star exercises to save them here.' : 'No exercises found.'}
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'myworkouts' && (
        <div className="flex flex-col flex-1 min-h-0">
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 mb-4 w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors justify-center"
            >
              <Plus className="w-4 h-4" /> Create Workout
            </button>
          )}

          {showCreateForm && (
            <div className="border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Workout name" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
              <p className="text-xs font-medium text-gray-700">Exercises</p>
              {formExercises.map((ex, i) => (
                <div key={i} className="flex gap-2">
                  <input value={ex.name} onChange={e => { const n = [...formExercises]; n[i].name = e.target.value; setFormExercises(n); }} placeholder="Exercise name" className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500" />
                  <input value={ex.sets} onChange={e => { const n = [...formExercises]; n[i].sets = e.target.value; setFormExercises(n); }} placeholder="Sets" className="w-14 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 text-center" />
                  <input value={ex.reps} onChange={e => { const n = [...formExercises]; n[i].reps = e.target.value; setFormExercises(n); }} placeholder="Reps" className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 text-center" />
                </div>
              ))}
              <button onClick={() => setFormExercises(p => [...p, { name: '', sets: '3', reps: '10', notes: '' }])} className="text-xs text-red-600 hover:underline">+ Add exercise</button>
              <div className="flex gap-2 pt-1">
                <button onClick={saveCustomWorkout} className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-700 transition-colors">Save</button>
                <button onClick={() => { setShowCreateForm(false); setEditingId(null); }} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2">
            {customs.length === 0 && !showCreateForm && (
              <p className="text-sm text-gray-400 text-center py-8">No saved workouts yet.</p>
            )}
            {customs.map(cw => (
              <div key={cw.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{cw.name}</p>
                    <p className="text-xs text-gray-500">{cw.exercises.length} exercise{cw.exercises.length !== 1 ? 's' : ''}{cw.notes ? ` · ${cw.notes.slice(0, 40)}${cw.notes.length > 40 ? '…' : ''}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(cw)} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteCustom(cw.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/ExerciseLibraryTab.tsx
git commit -m "feat: add loading state, star favorites, Favorites filter, and category pill to ExerciseLibraryTab"
```

---

### Task 7: Remove Log Alternative Workout from WorkoutPlanPage

**Files:**
- Modify: `src/components/dashboard/WorkoutPlanPage.tsx`

- [ ] **Step 1: Remove state declarations (lines 65-68)**

Remove these 4 lines from WorkoutPlanPage.tsx:
```typescript
const [showLogModal, setShowLogModal] = useState(false);
const [loggedWorkouts, setLoggedWorkouts] = useState<any[]>([]);
const [selectedActivity, setSelectedActivity] = useState<string>('');
const [workoutDetails, setWorkoutDetails] = useState('');
```

- [ ] **Step 2: Remove isAnalyzing and workoutTips state (lines 397-398)**

Remove:
```typescript
const [workoutTips, setWorkoutTips] = useState<string>('');
const [isAnalyzing, setIsAnalyzing] = useState(false);
```

- [ ] **Step 3: Remove activities array, analyzeWorkoutWithLLM, logWorkout, deleteWorkout functions**

Remove the `activities` array (6 entries starting with `{ id: 'class', ...}`), the `analyzeWorkoutWithLLM` function, the `logWorkout` function, and the `deleteWorkout` function. These are at approximately lines 362-437.

- [ ] **Step 4: Remove WorkoutLogModal component definition (lines 713-781)**

Remove the entire `const WorkoutLogModal = () => (...)` component definition.

- [ ] **Step 5: Remove loggedWorkouts "Recent Workouts" display section (lines 1107-1155)**

Remove the entire block:
```typescript
{/* Logged Workouts History */}
{loggedWorkouts.length > 0 && (
  <div className="mb-6">
    ...
  </div>
)}
```

- [ ] **Step 6: Remove the "Log Alternative Workout" button (lines 1244-1253)**

Remove:
```typescript
{/* Log Workout Button */}
<div className="mt-6">
  <Button
    onClick={() => setShowLogModal(true)}
    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 flex items-center justify-center space-x-2"
  >
    <Plus className="w-5 h-5" />
    <span>Log Alternative Workout</span>
  </Button>
</div>
```

- [ ] **Step 7: Remove the WorkoutLogModal render and update success message (lines ~1282-1283)**

Remove:
```typescript
{showLogModal && <WorkoutLogModal />}
```

Update the success message (currently uses `workoutTips`) to remove the variable reference. Change:
```typescript
{workoutTips || 'Great job staying active! Your estimated calorie burn has been added to your daily totals.'}
```
To:
```typescript
{'Great job staying active! Keep up the great work.'}
```

- [ ] **Step 8: Check for unused imports**

After removing the above, check if any imports are now unused. The `X` icon from lucide-react may have been used only by WorkoutLogModal. Check imports at top of file and remove any that are now unused.

Run:
```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any TypeScript errors shown.

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/WorkoutPlanPage.tsx
git commit -m "feat: remove Log Alternative Workout modal and replace with exercise library flow"
```

---

## Verification

1. Run `npm run dev`
2. Go to Workouts → select a day
3. Confirm "Log Alternative Workout" button is gone
4. Tap "Add Exercise" — drawer slides up with a spinner, then exercises load
5. Confirm 57 exercises appear (including Running, Swimming, Cycling, Yoga, Group Fitness, HIIT in Cardio tab)
6. Star an exercise — star turns amber/gold
7. Tap "Favorites" filter chip — only starred exercises show
8. Unstar — exercise disappears from Favorites filter
9. Go to Library tab — same star and Favorites behavior
10. Refresh page — favorites persist (fetched from DB)
11. Check TypeScript: `npx tsc --noEmit` — no errors
