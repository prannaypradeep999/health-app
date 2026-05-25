# Workout System Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static exercise library, user custom workouts, weight tracking, and an AI feedback loop to the workout system.

**Architecture:** TypeScript data file seeds a Prisma `ExerciseLibrary` table; new API routes serve library queries and CRUD for custom workouts; workout generation prompt gains a conditional feedback block; UI gets an Exercise Library tab and per-day "Add Exercise" modal in `WorkoutPlanPage`.

**Tech Stack:** Next.js 16, Prisma/PostgreSQL (Neon), React 19, Tailwind CSS 4, OpenAI gpt-4o-mini, existing `dialog.tsx` + `badge.tsx` + `input.tsx` UI components.

---

## File Map

| Action | File |
|--------|------|
| Create | `src/lib/data/exercise-library.ts` |
| Modify | `prisma/schema.prisma` |
| Create | `prisma/seed.ts` |
| Create | `src/app/api/exercises/route.ts` |
| Create | `src/app/api/exercises/add-to-plan/route.ts` |
| Create | `src/app/api/workouts/custom/route.ts` |
| Create | `src/app/api/workouts/last-weight/route.ts` |
| Modify | `src/app/api/workouts/log-exercise/route.ts` |
| Modify | `src/app/api/ai/workouts/generate/route.ts` |
| Modify | `src/lib/ai/prompts/workout-generation.ts` |
| Create | `src/components/dashboard/WeightInput.tsx` |
| Create | `src/components/dashboard/ExerciseLibraryModal.tsx` |
| Create | `src/components/dashboard/ExerciseLibraryTab.tsx` |
| Modify | `src/components/dashboard/WorkoutPlanPage.tsx` |

---

### Task 1: Exercise Library Data File

**Files:**
- Create: `src/lib/data/exercise-library.ts`

- [ ] **Step 1: Create the data file**

```typescript
// src/lib/data/exercise-library.ts

export interface ExerciseEntry {
  name: string;
  description: string;
  muscleGroup: string;
  equipmentType: string;
  category: string;
  defaultSets: number;
  defaultReps: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  weightGuidance: string;
  beginnerMod: string;
  advancedMod: string;
  tags: string[];
}

export const EXERCISE_LIBRARY: ExerciseEntry[] = [
  // ── CHEST ──────────────────────────────────────────────────────────────
  {
    name: 'Push-Up',
    description: 'Classic bodyweight chest press. Keep your core tight and body in a straight line from head to heels.',
    muscleGroup: 'Chest',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-15',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. If you can do 15+ easily, elevate feet or add a weighted vest.',
    beginnerMod: 'Perform on knees or against a wall.',
    advancedMod: 'Archer push-ups or add a pause at the bottom.',
    tags: ['chest', 'triceps', 'shoulders', 'compound', 'bodyweight'],
  },
  {
    name: 'Dumbbell Bench Press',
    description: 'Lying press that targets the chest with independent arm movement for greater range of motion.',
    muscleGroup: 'Chest',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-12',
    difficulty: 'intermediate',
    weightGuidance: 'Choose a weight where the last 2 reps feel hard but form stays clean. Start light.',
    beginnerMod: 'Use lighter dumbbells and reduce range of motion.',
    advancedMod: 'Add a 2-second pause at the bottom.',
    tags: ['chest', 'triceps', 'shoulders', 'compound', 'pressing'],
  },
  {
    name: 'Incline Dumbbell Press',
    description: 'Upper-chest focused press on a 30-45 degree incline bench.',
    muscleGroup: 'Chest',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-12',
    difficulty: 'intermediate',
    weightGuidance: 'Go slightly lighter than flat bench — the incline angle is more challenging.',
    beginnerMod: 'Reduce incline angle to 20-25 degrees.',
    advancedMod: 'Single-arm alternating press.',
    tags: ['chest', 'upper chest', 'shoulders', 'compound'],
  },
  {
    name: 'Dumbbell Fly',
    description: 'Isolation movement that stretches the chest through a wide arc. Keep a soft bend in the elbows throughout.',
    muscleGroup: 'Chest',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '10-15',
    difficulty: 'intermediate',
    weightGuidance: 'Use light weight — this is an isolation move. Control the lowering phase.',
    beginnerMod: 'Reduce range of motion and use very light weights.',
    advancedMod: 'Cable fly for constant tension throughout the movement.',
    tags: ['chest', 'isolation', 'stretch'],
  },
  {
    name: 'Diamond Push-Up',
    description: 'Close-grip push-up with hands forming a diamond shape, emphasizing inner chest and triceps.',
    muscleGroup: 'Chest',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '6-12',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight only. Add a weighted vest if too easy.',
    beginnerMod: 'Perform on knees.',
    advancedMod: 'Elevate feet on a bench.',
    tags: ['chest', 'triceps', 'bodyweight', 'compound'],
  },
  // ── BACK ───────────────────────────────────────────────────────────────
  {
    name: 'Dumbbell Row',
    description: 'Single-arm row that builds thickness in the mid-back. Brace the core and keep the back flat.',
    muscleGroup: 'Back',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-12',
    difficulty: 'beginner',
    weightGuidance: 'Choose a weight you can row with full range of motion without rotating your torso.',
    beginnerMod: 'Use a lighter weight and focus on the mind-muscle connection.',
    advancedMod: 'Chest-supported row or add a pause at the top.',
    tags: ['back', 'lats', 'biceps', 'compound', 'pulling'],
  },
  {
    name: 'Pull-Up',
    description: 'Vertical pulling movement for lats and upper back. Hang from a bar and pull your chest toward it.',
    muscleGroup: 'Back',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '4-10',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight to start. Add a dip belt when you can do 10+ clean reps.',
    beginnerMod: 'Band-assisted pull-ups or inverted rows.',
    advancedMod: 'Weighted pull-ups or archer pull-ups.',
    tags: ['back', 'lats', 'biceps', 'bodyweight', 'compound'],
  },
  {
    name: 'Inverted Row',
    description: 'Horizontal pull using a bar at hip height. Feet on the floor, body straight, pull chest to bar.',
    muscleGroup: 'Back',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-15',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight. Increase difficulty by raising feet or wearing a weighted vest.',
    beginnerMod: 'Keep feet flat on floor, body at 45 degrees.',
    advancedMod: 'Elevate feet to make body horizontal.',
    tags: ['back', 'biceps', 'bodyweight', 'horizontal pull'],
  },
  {
    name: 'Resistance Band Pull-Apart',
    description: 'Targets the rear deltoids and upper back. Hold a band at shoulder height and pull it apart.',
    muscleGroup: 'Back',
    equipmentType: 'Bands',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '15-20',
    difficulty: 'beginner',
    weightGuidance: 'Use a band with light-medium resistance. Focus on squeezing shoulder blades together.',
    beginnerMod: 'Use a lighter band.',
    advancedMod: 'Use a heavier band or add a pause at full extension.',
    tags: ['back', 'rear delts', 'posture', 'bands'],
  },
  {
    name: 'Superman Hold',
    description: 'Lie face down and raise arms, chest, and legs off the floor. Builds lower back and posterior chain.',
    muscleGroup: 'Back',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '10-15',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Hold each rep for 2-3 seconds at the top.',
    beginnerMod: 'Lift only arms or only legs at a time.',
    advancedMod: 'Hold a weight plate in hands.',
    tags: ['lower back', 'glutes', 'posterior chain', 'bodyweight'],
  },
  // ── LEGS / GLUTES ──────────────────────────────────────────────────────
  {
    name: 'Bodyweight Squat',
    description: 'Fundamental lower body movement. Feet shoulder-width apart, sit back and down, keep chest up.',
    muscleGroup: 'Legs',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '12-20',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Add a goblet hold with a dumbbell when ready.',
    beginnerMod: 'Squat to a chair or reduce depth.',
    advancedMod: 'Pause squat or jump squat.',
    tags: ['quads', 'glutes', 'compound', 'bodyweight', 'legs'],
  },
  {
    name: 'Goblet Squat',
    description: 'Squat holding a dumbbell at chest height. Naturally keeps the torso upright.',
    muscleGroup: 'Legs',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '10-15',
    difficulty: 'beginner',
    weightGuidance: 'Choose a weight you can hold comfortably at chest height for all reps.',
    beginnerMod: 'Use a lighter weight or bodyweight squat.',
    advancedMod: 'Add a pause at the bottom or use a heavier dumbbell.',
    tags: ['quads', 'glutes', 'compound', 'legs'],
  },
  {
    name: 'Dumbbell Romanian Deadlift',
    description: 'Hip hinge that targets the hamstrings and glutes. Keep a soft knee bend and flat back throughout.',
    muscleGroup: 'Legs',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-12',
    difficulty: 'intermediate',
    weightGuidance: 'Choose a weight where the last 2 reps of each set feel challenging but form stays clean.',
    beginnerMod: 'Bodyweight good mornings to learn the hip hinge pattern.',
    advancedMod: 'Single-leg variation or pause at the bottom.',
    tags: ['hamstrings', 'glutes', 'posterior chain', 'hip hinge', 'compound'],
  },
  {
    name: 'Reverse Lunge',
    description: 'Step backward into a lunge. Easier on the knees than forward lunges while still building leg strength.',
    muscleGroup: 'Legs',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '10 each leg',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight to master form, then add dumbbells at your sides.',
    beginnerMod: 'Hold a wall or chair for balance.',
    advancedMod: 'Add dumbbells or a barbell across the back.',
    tags: ['quads', 'glutes', 'single-leg', 'balance', 'legs'],
  },
  {
    name: 'Glute Bridge',
    description: 'Lie on your back, feet flat, drive hips up by squeezing glutes. Great for glute activation.',
    muscleGroup: 'Legs',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '15-20',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight first. Place a dumbbell across your hips to add load.',
    beginnerMod: 'Keep feet closer to your body.',
    advancedMod: 'Single-leg glute bridge or add a dumbbell on hips.',
    tags: ['glutes', 'hamstrings', 'bodyweight', 'hip extension'],
  },
  {
    name: 'Bulgarian Split Squat',
    description: 'Rear foot elevated split squat — one of the best single-leg movements for quad and glute development.',
    muscleGroup: 'Legs',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-10 each leg',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight is challenging enough to start. Add dumbbells when you can do 10 clean reps.',
    beginnerMod: 'Lower the rear foot height or reduce depth.',
    advancedMod: 'Hold dumbbells or use a barbell.',
    tags: ['quads', 'glutes', 'single-leg', 'compound', 'balance'],
  },
  {
    name: 'Wall Sit',
    description: 'Isometric quad hold with back against the wall and knees at 90 degrees. Builds endurance and strength.',
    muscleGroup: 'Legs',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '30-60 sec',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Increase hold time as you get stronger.',
    beginnerMod: 'Raise the seat height above 90 degrees.',
    advancedMod: 'Add a weight plate on your thighs.',
    tags: ['quads', 'isometric', 'bodyweight', 'endurance'],
  },
  // ── SHOULDERS ──────────────────────────────────────────────────────────
  {
    name: 'Dumbbell Shoulder Press',
    description: 'Overhead pressing movement for all three deltoid heads. Press dumbbells from ear level to overhead.',
    muscleGroup: 'Shoulders',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-12',
    difficulty: 'intermediate',
    weightGuidance: 'Choose a weight where your form stays strict through all reps. Avoid arching the lower back.',
    beginnerMod: 'Seated press to reduce lower back involvement.',
    advancedMod: 'Arnold press or single-arm press.',
    tags: ['shoulders', 'triceps', 'compound', 'pressing', 'overhead'],
  },
  {
    name: 'Lateral Raise',
    description: 'Isolation exercise for the medial deltoid. Raise dumbbells to shoulder height with a slight forward lean.',
    muscleGroup: 'Shoulders',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '12-15',
    difficulty: 'beginner',
    weightGuidance: 'Use light weight. Control the lowering phase — most of the benefit is on the way down.',
    beginnerMod: 'Seated lateral raise.',
    advancedMod: 'Cable lateral raise for constant tension.',
    tags: ['shoulders', 'medial delt', 'isolation'],
  },
  {
    name: 'Face Pull',
    description: 'Band or cable exercise pulling toward the face, targeting rear delts and external rotators.',
    muscleGroup: 'Shoulders',
    equipmentType: 'Bands',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '15-20',
    difficulty: 'beginner',
    weightGuidance: 'Use light resistance. Focus on external rotation at the end of the movement.',
    beginnerMod: 'Use a lighter band.',
    advancedMod: 'Use a cable machine with a rope attachment.',
    tags: ['rear delts', 'rotator cuff', 'posture', 'bands'],
  },
  {
    name: 'Pike Push-Up',
    description: 'Bodyweight overhead press variation in a pike position. Targets the shoulders and upper chest.',
    muscleGroup: 'Shoulders',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '6-12',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight only. Elevate feet to increase difficulty.',
    beginnerMod: 'Reduce the hip angle to make it more like a push-up.',
    advancedMod: 'Elevated pike push-up with feet on a bench.',
    tags: ['shoulders', 'triceps', 'bodyweight', 'pressing'],
  },
  // ── ARMS ───────────────────────────────────────────────────────────────
  {
    name: 'Dumbbell Bicep Curl',
    description: 'Classic curl targeting the biceps. Keep elbows pinned at your sides throughout.',
    muscleGroup: 'Arms',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '10-15',
    difficulty: 'beginner',
    weightGuidance: 'Choose a weight where you feel the bicep working — not so heavy that you swing.',
    beginnerMod: 'Use lighter weight and slower tempo.',
    advancedMod: 'Incline curl or concentration curl.',
    tags: ['biceps', 'arms', 'isolation', 'curl'],
  },
  {
    name: 'Hammer Curl',
    description: 'Neutral-grip curl targeting the brachialis and brachioradialis for arm thickness.',
    muscleGroup: 'Arms',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '10-12',
    difficulty: 'beginner',
    weightGuidance: 'Slightly heavier than a standard curl. Same rule — no swinging.',
    beginnerMod: 'Alternate arms instead of curling both together.',
    advancedMod: 'Cross-body hammer curl.',
    tags: ['biceps', 'brachialis', 'forearms', 'arms', 'isolation'],
  },
  {
    name: 'Tricep Dip',
    description: 'Bodyweight tricep exercise using parallel bars or a bench. Lower until elbows hit 90 degrees.',
    muscleGroup: 'Arms',
    equipmentType: 'Bodyweight',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '8-15',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight to start. Add a dip belt when you can do 15+ clean reps.',
    beginnerMod: 'Bench dip with feet on floor.',
    advancedMod: 'Weighted dip with a belt.',
    tags: ['triceps', 'chest', 'shoulders', 'bodyweight', 'compound'],
  },
  {
    name: 'Overhead Tricep Extension',
    description: 'Hold a dumbbell overhead with both hands and lower it behind your head. Full tricep stretch.',
    muscleGroup: 'Arms',
    equipmentType: 'Dumbbells',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '10-15',
    difficulty: 'beginner',
    weightGuidance: 'Use a moderate weight. Keep elbows pointing forward — do not let them flare out.',
    beginnerMod: 'Use a lighter dumbbell.',
    advancedMod: 'Single-arm version.',
    tags: ['triceps', 'arms', 'isolation', 'overhead'],
  },
  // ── CORE ───────────────────────────────────────────────────────────────
  {
    name: 'Plank',
    description: 'Isometric core hold. Forearms on floor, body in a straight line. Brace like you are about to be punched.',
    muscleGroup: 'Core',
    equipmentType: 'Bodyweight',
    category: 'Core',
    defaultSets: 3,
    defaultReps: '30-60 sec',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Increase hold duration over time.',
    beginnerMod: 'Plank on knees.',
    advancedMod: 'RKC plank or plank with shoulder taps.',
    tags: ['core', 'abs', 'isometric', 'bodyweight', 'stability'],
  },
  {
    name: 'Dead Bug',
    description: 'Lie on your back, extend opposite arm and leg while keeping lower back pressed to the floor.',
    muscleGroup: 'Core',
    equipmentType: 'Bodyweight',
    category: 'Core',
    defaultSets: 3,
    defaultReps: '8-10 each side',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Slow and controlled — never let the lower back arch off the floor.',
    beginnerMod: 'Extend only the legs or only the arms, not both together.',
    advancedMod: 'Add a dumbbell in the extending hand.',
    tags: ['core', 'anti-extension', 'stability', 'bodyweight'],
  },
  {
    name: 'Hollow Body Hold',
    description: 'Lie on your back, press lower back into the floor, raise shoulders and legs. Hold the position.',
    muscleGroup: 'Core',
    equipmentType: 'Bodyweight',
    category: 'Core',
    defaultSets: 3,
    defaultReps: '20-40 sec',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight only. If you cannot hold for 20 seconds, bend the knees.',
    beginnerMod: 'Bend knees to reduce lever length.',
    advancedMod: 'Hollow body rock.',
    tags: ['core', 'abs', 'isometric', 'bodyweight', 'calisthenics'],
  },
  {
    name: 'Russian Twist',
    description: 'Seated rotation exercise. Lean back slightly, lift feet, and rotate side to side with control.',
    muscleGroup: 'Core',
    equipmentType: 'Bodyweight',
    category: 'Core',
    defaultSets: 3,
    defaultReps: '20 total',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight first. Add a dumbbell or medicine ball to increase load.',
    beginnerMod: 'Keep feet on the floor.',
    advancedMod: 'Hold a dumbbell and increase lean angle.',
    tags: ['core', 'obliques', 'rotation', 'bodyweight'],
  },
  {
    name: 'Mountain Climbers',
    description: 'From a push-up position, drive knees toward your chest alternately at a controlled pace.',
    muscleGroup: 'Core',
    equipmentType: 'Bodyweight',
    category: 'HIIT',
    defaultSets: 3,
    defaultReps: '30 sec',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Increase speed or duration for more challenge.',
    beginnerMod: 'Slow the tempo and focus on form.',
    advancedMod: 'Cross-body mountain climbers.',
    tags: ['core', 'cardio', 'bodyweight', 'HIIT', 'conditioning'],
  },
  {
    name: 'Hanging Knee Raise',
    description: 'Hang from a pull-up bar and bring knees up to chest. Targets lower abs and hip flexors.',
    muscleGroup: 'Core',
    equipmentType: 'Bodyweight',
    category: 'Core',
    defaultSets: 3,
    defaultReps: '10-15',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight only. Avoid swinging — control the movement in both directions.',
    beginnerMod: 'Lying leg raise on the floor.',
    advancedMod: 'Straight-leg hanging raise.',
    tags: ['core', 'abs', 'hip flexors', 'bodyweight'],
  },
  // ── CARDIO ─────────────────────────────────────────────────────────────
  {
    name: 'Jump Rope',
    description: 'High-efficiency cardio. Start with basic two-foot jumps and progress to alternating feet.',
    muscleGroup: 'Cardio',
    equipmentType: 'Bodyweight',
    category: 'Cardio',
    defaultSets: 3,
    defaultReps: '60 sec',
    difficulty: 'beginner',
    weightGuidance: 'No load needed. Increase duration or speed to progress.',
    beginnerMod: 'Jump without a rope to practice the rhythm.',
    advancedMod: 'Double-unders or high-knees.',
    tags: ['cardio', 'conditioning', 'full body', 'coordination'],
  },
  {
    name: 'Burpee',
    description: 'Full body conditioning exercise: squat down, kick feet back to plank, push-up, jump back up.',
    muscleGroup: 'Cardio',
    equipmentType: 'Bodyweight',
    category: 'HIIT',
    defaultSets: 3,
    defaultReps: '8-12',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight only. Rest as needed between reps to maintain quality.',
    beginnerMod: 'Step feet back instead of jumping. Skip the push-up.',
    advancedMod: 'Add a tuck jump at the top.',
    tags: ['cardio', 'full body', 'HIIT', 'conditioning', 'bodyweight'],
  },
  {
    name: 'High Knees',
    description: 'Run in place driving knees as high as possible. Keep core braced and land softly.',
    muscleGroup: 'Cardio',
    equipmentType: 'Bodyweight',
    category: 'HIIT',
    defaultSets: 3,
    defaultReps: '30-45 sec',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Go faster to increase intensity.',
    beginnerMod: 'March in place with high knees at a walking pace.',
    advancedMod: 'Sprint variation or add arm drive.',
    tags: ['cardio', 'HIIT', 'bodyweight', 'conditioning'],
  },
  {
    name: 'Box Jump',
    description: 'Explosive jump onto a box or step. Land softly with bent knees and step back down.',
    muscleGroup: 'Cardio',
    equipmentType: 'Bodyweight',
    category: 'HIIT',
    defaultSets: 3,
    defaultReps: '5-8',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight only. Always step down — never jump down — to protect your joints.',
    beginnerMod: 'Step-ups instead of jumping.',
    advancedMod: 'Increase box height.',
    tags: ['power', 'legs', 'explosive', 'HIIT', 'plyometric'],
  },
  // ── MOBILITY / FLEXIBILITY ─────────────────────────────────────────────
  {
    name: 'World's Greatest Stretch',
    description: 'Lunge with rotation that opens hips, thoracic spine, and hamstrings in one movement.',
    muscleGroup: 'Mobility',
    equipmentType: 'Bodyweight',
    category: 'Mobility',
    defaultSets: 2,
    defaultReps: '5 each side',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Move slowly and breathe into each position.',
    beginnerMod: 'Reduce rotation range if tight.',
    advancedMod: 'Add a thoracic extension at the end.',
    tags: ['mobility', 'hips', 'thoracic', 'flexibility', 'warm-up'],
  },
  {
    name: 'Hip Flexor Stretch',
    description: 'Kneeling lunge position with the rear knee on the floor. Drive hips forward to stretch the hip flexor.',
    muscleGroup: 'Mobility',
    equipmentType: 'Bodyweight',
    category: 'Mobility',
    defaultSets: 2,
    defaultReps: '30-45 sec each side',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Do not force the range — breathe and let the muscle relax.',
    beginnerMod: 'Use a pad under the knee.',
    advancedMod: 'Add a slight back bend or reach arm overhead.',
    tags: ['mobility', 'hip flexors', 'flexibility', 'cool-down'],
  },
  {
    name: 'Cat-Cow',
    description: 'On all fours, alternate between arching and rounding the spine. Great for spinal mobility.',
    muscleGroup: 'Mobility',
    equipmentType: 'Bodyweight',
    category: 'Mobility',
    defaultSets: 2,
    defaultReps: '10 cycles',
    difficulty: 'beginner',
    weightGuidance: 'Bodyweight only. Move slowly and breathe with each movement.',
    beginnerMod: 'Reduce range of motion.',
    advancedMod: 'Add a lateral shift to each position.',
    tags: ['mobility', 'spine', 'flexibility', 'warm-up', 'cool-down'],
  },
  {
    name: 'Pigeon Pose',
    description: 'Deep hip stretch targeting the piriformis and glutes. Hold in the lowered position.',
    muscleGroup: 'Mobility',
    equipmentType: 'Bodyweight',
    category: 'Mobility',
    defaultSets: 2,
    defaultReps: '45-60 sec each side',
    difficulty: 'intermediate',
    weightGuidance: 'Bodyweight only. Never force this stretch — use a blanket under the hip if needed.',
    beginnerMod: 'Figure-four stretch lying on back.',
    advancedMod: 'King pigeon for a deeper quad stretch.',
    tags: ['mobility', 'hips', 'glutes', 'flexibility', 'yoga'],
  },
  // ── FULL BODY / COMPOUND ───────────────────────────────────────────────
  {
    name: 'Kettlebell Swing',
    description: 'Hip hinge-driven swing building power, posterior chain, and conditioning simultaneously.',
    muscleGroup: 'Full Body',
    equipmentType: 'Kettlebell',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '15-20',
    difficulty: 'intermediate',
    weightGuidance: 'Start lighter than you think — technique is everything here. Hinge, do not squat.',
    beginnerMod: 'Practice the hip hinge and deadlift pattern first.',
    advancedMod: 'Single-arm swing or American swing (overhead).',
    tags: ['full body', 'posterior chain', 'power', 'conditioning', 'kettlebell'],
  },
  {
    name: 'Thruster',
    description: 'Front squat into overhead press in one fluid movement. Combines legs and shoulders with conditioning.',
    muscleGroup: 'Full Body',
    equipmentType: 'Dumbbells',
    category: 'HIIT',
    defaultSets: 3,
    defaultReps: '8-12',
    difficulty: 'intermediate',
    weightGuidance: 'Use moderate weight. The squat drives the press — use that momentum.',
    beginnerMod: 'Split into squat and press as separate movements.',
    advancedMod: 'Barbell thruster.',
    tags: ['full body', 'compound', 'conditioning', 'legs', 'shoulders'],
  },
  {
    name: 'Turkish Get-Up',
    description: 'Complex movement rising from the floor to standing while holding a weight overhead. Builds stability.',
    muscleGroup: 'Full Body',
    equipmentType: 'Kettlebell',
    category: 'Strength',
    defaultSets: 3,
    defaultReps: '3-5 each side',
    difficulty: 'advanced',
    weightGuidance: 'Learn the movement with no weight first. Only add load once each step is smooth.',
    beginnerMod: 'Practice with a shoe balanced on your fist instead of a weight.',
    advancedMod: 'Increase load progressively.',
    tags: ['full body', 'stability', 'shoulder', 'kettlebell', 'coordination'],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/exercise-library.ts
git commit -m "feat: add static exercise library data file"
```

---

### Task 2: Prisma Schema + Migration + Seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Add new models to schema**

Open `prisma/schema.prisma` and append before the `enum HealthGoal` block:

```prisma
model ExerciseLibrary {
  id             String   @id @default(cuid())
  name           String   @unique
  description    String
  muscleGroup    String
  equipmentType  String
  category       String
  defaultSets    Int
  defaultReps    String
  difficulty     String
  weightGuidance String
  beginnerMod    String
  advancedMod    String
  tags           String[] @default([])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  additions UserWorkoutAddition[]

  @@index([muscleGroup])
  @@index([equipmentType])
  @@index([category])
  @@index([difficulty])
}

model UserCustomWorkout {
  id        String   @id @default(cuid())
  userId    String?
  surveyId  String?
  name      String
  notes     String?
  exercises Json     @default("[]")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([surveyId])
}

model UserWorkoutAddition {
  id                String            @id @default(cuid())
  userId            String?
  surveyId          String?
  workoutPlanId     String
  day               String
  additionType      String            // "supplement" | "standalone"
  source            String            // "library" | "custom"
  exerciseLibraryId String?
  customData        Json?
  weightUsedLbs     Float?
  createdAt         DateTime          @default(now())

  user             User?             @relation(fields: [userId], references: [id], onDelete: Cascade)
  exerciseLibrary  ExerciseLibrary?  @relation(fields: [exerciseLibraryId], references: [id])
  workoutPlan      WorkoutPlan       @relation(fields: [workoutPlanId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([surveyId])
  @@index([workoutPlanId])
  @@index([day])
}
```

Also add `weightUsedLbs Float?` to the existing `WorkoutExerciseLog` model (after the `notes` field).

Add relations to existing models:
- In `User` model add: `customWorkouts UserCustomWorkout[]` and `workoutAdditions UserWorkoutAddition[]`
- In `WorkoutPlan` model add: `additions UserWorkoutAddition[]`

- [ ] **Step 2: Run migration**

```bash
cd /Users/Prannay/Desktop/2025/health/health-app/healthfit-loop
npx prisma migrate dev --name add_exercise_library_custom_workouts
```

Expected: Migration created and applied successfully.

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Create seed file**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { EXERCISE_LIBRARY } from '../src/lib/data/exercise-library';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding exercise library...');
  for (const exercise of EXERCISE_LIBRARY) {
    await prisma.exerciseLibrary.upsert({
      where: { name: exercise.name },
      update: exercise,
      create: exercise,
    });
  }
  console.log(`Seeded ${EXERCISE_LIBRARY.length} exercises.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

- [ ] **Step 5: Add seed script to package.json**

Open `package.json` and add inside the `"prisma"` key (or create it):
```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

- [ ] **Step 6: Run seed**

```bash
npx prisma db seed
```

Expected: `Seeded 38 exercises.`

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts package.json
git commit -m "feat: add ExerciseLibrary, UserCustomWorkout, UserWorkoutAddition schema + seed"
```

---

### Task 3: API Routes

**Files:**
- Create: `src/app/api/exercises/route.ts`
- Create: `src/app/api/exercises/add-to-plan/route.ts`
- Create: `src/app/api/workouts/custom/route.ts`
- Create: `src/app/api/workouts/last-weight/route.ts`
- Modify: `src/app/api/workouts/log-exercise/route.ts`

- [ ] **Step 1: Create GET /api/exercises**

```typescript
// src/app/api/exercises/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const muscleGroup = searchParams.get('muscleGroup');
  const equipmentType = searchParams.get('equipmentType');
  const difficulty = searchParams.get('difficulty');
  const search = searchParams.get('search');

  const exercises = await prisma.exerciseLibrary.findMany({
    where: {
      ...(muscleGroup && { muscleGroup }),
      ...(equipmentType && { equipmentType }),
      ...(difficulty && { difficulty }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { tags: { has: search.toLowerCase() } },
          { muscleGroup: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ exercises });
}
```

- [ ] **Step 2: Create POST /api/exercises/add-to-plan**

```typescript
// src/app/api/exercises/add-to-plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_id')?.value;
  const surveyId = cookieStore.get('survey_id')?.value;

  const { workoutPlanId, day, additionType, source, exerciseLibraryId, customData, weightUsedLbs } =
    await req.json();

  if (!workoutPlanId || !day || !additionType || !source) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const addition = await prisma.userWorkoutAddition.create({
    data: {
      userId: userId || null,
      surveyId: surveyId || null,
      workoutPlanId,
      day,
      additionType,
      source,
      exerciseLibraryId: exerciseLibraryId || null,
      customData: customData || null,
      weightUsedLbs: weightUsedLbs || null,
    },
    include: { exerciseLibrary: true },
  });

  return NextResponse.json({ success: true, addition });
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_id')?.value;
  const surveyId = cookieStore.get('survey_id')?.value;
  const { searchParams } = new URL(req.url);
  const workoutPlanId = searchParams.get('workoutPlanId');
  const day = searchParams.get('day');

  const additions = await prisma.userWorkoutAddition.findMany({
    where: {
      workoutPlanId: workoutPlanId || undefined,
      day: day || undefined,
      OR: [
        { userId: userId || undefined },
        { surveyId: surveyId || undefined },
      ],
    },
    include: { exerciseLibrary: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ additions });
}
```

- [ ] **Step 3: Create CRUD /api/workouts/custom**

```typescript
// src/app/api/workouts/custom/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

async function getIdentifiers() {
  const cookieStore = await cookies();
  return {
    userId: cookieStore.get('user_id')?.value || null,
    surveyId: cookieStore.get('survey_id')?.value || null,
  };
}

export async function GET() {
  const { userId, surveyId } = await getIdentifiers();
  const customs = await prisma.userCustomWorkout.findMany({
    where: { OR: [{ userId: userId || undefined }, { surveyId: surveyId || undefined }] },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ customs });
}

export async function POST(req: NextRequest) {
  const { userId, surveyId } = await getIdentifiers();
  const { name, notes, exercises } = await req.json();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const custom = await prisma.userCustomWorkout.create({
    data: { userId, surveyId, name, notes: notes || null, exercises: exercises || [] },
  });
  return NextResponse.json({ success: true, custom });
}

export async function PUT(req: NextRequest) {
  const { userId } = await getIdentifiers();
  const { id, name, notes, exercises } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  const custom = await prisma.userCustomWorkout.update({
    where: { id },
    data: { name, notes, exercises },
  });
  return NextResponse.json({ success: true, custom });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await prisma.userCustomWorkout.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create GET /api/workouts/last-weight**

```typescript
// src/app/api/workouts/last-weight/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('user_id')?.value;
  const surveyId = cookieStore.get('survey_id')?.value;
  const { searchParams } = new URL(req.url);
  const exerciseName = searchParams.get('exerciseName');

  if (!exerciseName) return NextResponse.json({ weightUsedLbs: null });

  const addition = await prisma.userWorkoutAddition.findFirst({
    where: {
      OR: [{ userId: userId || undefined }, { surveyId: surveyId || undefined }],
      weightUsedLbs: { not: null },
      OR: [
        { exerciseLibrary: { name: { contains: exerciseName, mode: 'insensitive' } } },
        { customData: { path: ['name'], string_contains: exerciseName } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { weightUsedLbs: true },
  });

  if (addition?.weightUsedLbs) {
    return NextResponse.json({ weightUsedLbs: addition.weightUsedLbs });
  }

  const exerciseLog = await prisma.workoutExerciseLog.findFirst({
    where: {
      exerciseName: { contains: exerciseName, mode: 'insensitive' },
      workoutLog: { userId: userId || undefined },
      weightUsedLbs: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { weightUsedLbs: true },
  });

  return NextResponse.json({ weightUsedLbs: exerciseLog?.weightUsedLbs ?? null });
}
```

- [ ] **Step 5: Update log-exercise route to accept weightUsedLbs**

In `src/app/api/workouts/log-exercise/route.ts`, add `weightUsedLbs` to the destructured body:

```typescript
const {
  surveyId,
  workoutPlanId,
  weekNumber = 1,
  day,
  exerciseName,
  focus,
  completed,
  setsCompleted,
  repsCompleted,
  duration,
  estimatedCalories,
  weightUsedLbs,   // ← add this
} = await req.json();
```

And in the `create` and `update` calls for `workoutExerciseLog`, add:
```typescript
weightUsedLbs: weightUsedLbs || null,
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/exercises/ src/app/api/workouts/custom/ src/app/api/workouts/last-weight/ src/app/api/workouts/log-exercise/route.ts
git commit -m "feat: add exercise library, custom workout, last-weight API routes"
```

---

### Task 4: Prompt Feedback Context Block

**Files:**
- Modify: `src/lib/ai/prompts/workout-generation.ts`
- Modify: `src/app/api/ai/workouts/generate/route.ts`

- [ ] **Step 1: Add WorkoutFeedbackContext type and inject into prompt**

In `src/lib/ai/prompts/workout-generation.ts`, add the type after the `WorkoutPreferences` interface:

```typescript
export interface WorkoutFeedbackContext {
  poorlyRatedExercises: string[];
  wellRatedExercises: string[];
  completionRateByDay: Record<string, number>; // e.g. { monday: 90, wednesday: 40 }
  savedCustomExercises: string[];
}
```

Update the `createWorkoutPlanPrompt` signature:

```typescript
export const createWorkoutPlanPrompt = (
  surveyData: SurveyResponse,
  workoutPrefs: WorkoutPreferences,
  feedbackContext?: WorkoutFeedbackContext
): string => {
```

Inside the function, add this block just before the `return` statement (after the existing prompt string starts building). Find the line that reads `return \`You are an expert fitness trainer...` — the feedback block should be appended to the userPrompt string. Add a helper at the end of the function:

```typescript
const feedbackBlock = feedbackContext && (
  feedbackContext.poorlyRatedExercises.length > 0 ||
  feedbackContext.wellRatedExercises.length > 0 ||
  feedbackContext.savedCustomExercises.length > 0 ||
  Object.keys(feedbackContext.completionRateByDay).length > 0
) ? `

PAST WORKOUT FEEDBACK (use this to improve the plan):
${feedbackContext.poorlyRatedExercises.length > 0 ? `- Exercises rated poorly — avoid or substitute: ${feedbackContext.poorlyRatedExercises.slice(0, 10).join(', ')}` : ''}
${feedbackContext.wellRatedExercises.length > 0 ? `- Exercises rated well — include variations: ${feedbackContext.wellRatedExercises.slice(0, 10).join(', ')}` : ''}
${Object.keys(feedbackContext.completionRateByDay).length > 0 ? `- Completion rate by day: ${Object.entries(feedbackContext.completionRateByDay).map(([d, r]) => `${d} ${r}%`).join(', ')} — reduce volume on low-completion days` : ''}
${feedbackContext.savedCustomExercises.length > 0 ? `- User's saved exercises (reference their style): ${feedbackContext.savedCustomExercises.slice(0, 10).join(', ')}` : ''}
` : '';
```

Then append `${feedbackBlock}` at the end of the returned prompt string.

- [ ] **Step 2: Fetch feedback data in generate route**

In `src/app/api/ai/workouts/generate/route.ts`, add a helper function before `generateWorkoutPlan`:

```typescript
async function getWorkoutFeedbackContext(surveyData: any): Promise<WorkoutFeedbackContext | undefined> {
  const userId = surveyData.userId;
  const surveyId = surveyData.id;
  if (!userId && !surveyId) return undefined;

  const [exerciseLogs, workoutLogs, customWorkouts] = await Promise.all([
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
      where: { OR: [{ userId: userId || undefined }, { surveyId }] },
      select: { exercises: true },
      take: 10,
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

  if (!poor.length && !good.length && !savedNames.length && !Object.keys(completionRateByDay).length) {
    return undefined;
  }

  return {
    poorlyRatedExercises: [...new Set(poor)].slice(0, 10),
    wellRatedExercises: [...new Set(good)].slice(0, 10),
    completionRateByDay,
    savedCustomExercises: [...new Set(savedNames)].slice(0, 10),
  };
}
```

Then in `generateWorkoutPlan`, update the prompt call:

```typescript
async function generateWorkoutPlan(surveyData: any): Promise<WorkoutPlan> {
  const workoutPrefs = surveyData.workoutPreferencesJson || {};
  const feedbackContext = await getWorkoutFeedbackContext(surveyData);
  const userPrompt = createWorkoutPlanPrompt(surveyData, workoutPrefs, feedbackContext);
  // rest unchanged...
```

Also add the import at the top:
```typescript
import { createWorkoutPlanPrompt, type WorkoutPlan, type WorkoutDay, type WorkoutFeedbackContext } from '@/lib/ai/prompts';
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/prompts/workout-generation.ts src/app/api/ai/workouts/generate/route.ts
git commit -m "feat: inject past workout feedback context into AI generation prompt"
```

---

### Task 5: WeightInput Component

**Files:**
- Create: `src/components/dashboard/WeightInput.tsx`

- [ ] **Step 1: Create component**

```typescript
// src/components/dashboard/WeightInput.tsx
'use client';

import { useState, useEffect } from 'react';

interface WeightInputProps {
  exerciseName: string;
  onWeightChange?: (weight: number | null) => void;
  className?: string;
}

export default function WeightInput({ exerciseName, onWeightChange, className = '' }: WeightInputProps) {
  const [weight, setWeight] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(`lastWeight:${exerciseName}`);
    if (stored) {
      setWeight(stored);
      onWeightChange?.(parseFloat(stored));
      setLoading(false);
      return;
    }
    fetch(`/api/workouts/last-weight?exerciseName=${encodeURIComponent(exerciseName)}`)
      .then(r => r.json())
      .then(data => {
        if (data.weightUsedLbs) {
          setWeight(String(data.weightUsedLbs));
          onWeightChange?.(data.weightUsedLbs);
          localStorage.setItem(`lastWeight:${exerciseName}`, String(data.weightUsedLbs));
        }
      })
      .finally(() => setLoading(false));
  }, [exerciseName]);

  function handleBlur() {
    const val = parseFloat(weight);
    if (!isNaN(val) && val > 0) {
      localStorage.setItem(`lastWeight:${exerciseName}`, String(val));
      onWeightChange?.(val);
    } else {
      onWeightChange?.(null);
    }
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <input
        type="number"
        min="1"
        step="2.5"
        value={weight}
        onChange={e => setWeight(e.target.value)}
        onBlur={handleBlur}
        placeholder={loading ? '…' : '0'}
        className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
      />
      <span className="text-xs text-gray-500">lbs</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/WeightInput.tsx
git commit -m "feat: add WeightInput component with last-used weight prefill"
```

---

### Task 6: ExerciseLibraryModal Component

**Files:**
- Create: `src/components/dashboard/ExerciseLibraryModal.tsx`

- [ ] **Step 1: Create modal**

```typescript
// src/components/dashboard/ExerciseLibraryModal.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Dumbbell } from 'lucide-react';
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

const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Mobility', 'Full Body'];
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

  const fetchExercises = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedGroup !== 'All') params.set('muscleGroup', selectedGroup);
    if (search) params.set('search', search);
    const res = await fetch(`/api/exercises?${params}`);
    const data = await res.json();
    setExercises(data.exercises || []);
  }, [selectedGroup, search]);

  useEffect(() => { if (open) fetchExercises(); }, [open, fetchExercises]);

  async function handleAdd(exercise: LibraryExercise, additionType: 'supplement' | 'standalone') {
    setAdding(`${exercise.id}-${additionType}`);
    await fetch('/api/exercises/add-to-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workoutPlanId, day, additionType, source: 'library',
        exerciseLibraryId: exercise.id,
        weightUsedLbs: weights[exercise.id] || null,
      }),
    });
    setAdding(null);
    onAdded(exercise, additionType, weights[exercise.id] ?? null);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <DialogTitle className="text-base font-semibold">Add Exercise</DialogTitle>
        </DialogHeader>

        {/* Filters */}
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
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {MUSCLE_GROUPS.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedGroup === g
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {exercises.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No exercises found.</p>
          )}
          {exercises.map(ex => (
            <div key={ex.id} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* Card header */}
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
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{ex.muscleGroup}</span>
                    <span>·</span>
                    <span>{ex.equipmentType}</span>
                    <span>·</span>
                    <span>{ex.defaultSets}×{ex.defaultReps}</span>
                  </div>
                </div>
                <Dumbbell className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              </button>

              {/* Expanded detail */}
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
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/ExerciseLibraryModal.tsx
git commit -m "feat: add ExerciseLibraryModal component"
```

---

### Task 7: Wire Modal into WorkoutPlanPage

**Files:**
- Modify: `src/components/dashboard/WorkoutPlanPage.tsx`

- [ ] **Step 1: Read the current WorkoutPlanPage to find the exercise list render section**

Run: `grep -n "exercises\|Add Exercise\|warmup\|cooldown" src/components/dashboard/WorkoutPlanPage.tsx | head -30`

Find the section that renders the exercise list for a day. It will be a `.map()` over `day.exercises`.

- [ ] **Step 2: Add modal state and imports at top of component**

Add imports:
```typescript
import ExerciseLibraryModal from './ExerciseLibraryModal';
```

Add state inside the component:
```typescript
const [showLibraryModal, setShowLibraryModal] = useState(false);
const [addedExercises, setAddedExercises] = useState<Record<string, any[]>>({});
```

- [ ] **Step 3: Add "+ Add Exercise" button after the exercise list**

After the closing tag of the exercises `.map()` block (still inside the day's exercise section), add:

```tsx
{/* Added exercises from library */}
{(addedExercises[selectedDay] || []).map((ex, i) => (
  <div key={i} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
    <div className="flex-1">
      <p className="text-sm font-medium text-gray-900">{ex.name}</p>
      <p className="text-xs text-gray-500">{ex.defaultSets}×{ex.defaultReps} · {ex.equipmentType}</p>
    </div>
    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Added</span>
  </div>
))}

<button
  onClick={() => setShowLibraryModal(true)}
  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors"
>
  <Plus className="w-4 h-4" />
  Add Exercise
</button>
```

- [ ] **Step 4: Add the modal to the JSX return**

Near the end of the component's return, before the closing `</div>`, add:

```tsx
{showLibraryModal && workoutData && (
  <ExerciseLibraryModal
    open={showLibraryModal}
    onClose={() => setShowLibraryModal(false)}
    workoutPlanId={workoutData.id}
    day={selectedDay}
    defaultMuscleGroup={workoutData.planData?.weeklyPlan?.find((d: any) => d.day === selectedDay)?.targetMuscles?.[0]}
    onAdded={(exercise, additionType, weight) => {
      setAddedExercises(prev => ({
        ...prev,
        [selectedDay]: [...(prev[selectedDay] || []), { ...exercise, additionType, weightUsedLbs: weight }],
      }));
      setShowLibraryModal(false);
    }}
  />
)}
```

- [ ] **Step 5: Add Plus import if not already present**

Check: `grep -n "Plus" src/components/dashboard/WorkoutPlanPage.tsx`

If not imported, add `Plus` to the lucide-react import.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/WorkoutPlanPage.tsx
git commit -m "feat: add exercise library modal to workout day view"
```

---

### Task 8: Exercise Library Tab + My Workouts

**Files:**
- Create: `src/components/dashboard/ExerciseLibraryTab.tsx`
- Modify: `src/components/dashboard/WorkoutPlanPage.tsx` (add tab)

- [ ] **Step 1: Create ExerciseLibraryTab**

```typescript
// src/components/dashboard/ExerciseLibraryTab.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
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

const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Mobility', 'Full Body'];
const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced: 'bg-red-100 text-red-700',
};

export default function ExerciseLibraryTab() {
  const [activeTab, setActiveTab] = useState<'library' | 'myworkouts'>('library');

  // Library state
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // My Workouts state
  const [customs, setCustoms] = useState<CustomWorkout[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formExercises, setFormExercises] = useState([{ name: '', sets: '3', reps: '10', notes: '' }]);

  const fetchExercises = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedGroup !== 'All') params.set('muscleGroup', selectedGroup);
    if (search) params.set('search', search);
    const res = await fetch(`/api/exercises?${params}`);
    const data = await res.json();
    setExercises(data.exercises || []);
  }, [selectedGroup, search]);

  const fetchCustoms = useCallback(async () => {
    const res = await fetch('/api/workouts/custom');
    const data = await res.json();
    setCustoms(data.customs || []);
  }, []);

  useEffect(() => { fetchExercises(); }, [fetchExercises]);
  useEffect(() => { if (activeTab === 'myworkouts') fetchCustoms(); }, [activeTab, fetchCustoms]);

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
    setFormName(''); setFormNotes(''); setFormExercises([{ name: '', sets: '3', reps: '10', notes: '' }]);
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
    setFormExercises(cw.exercises.length > 0 ? cw.exercises : [{ name: '', sets: '3', reps: '10', notes: '' }]);
    setShowCreateForm(true);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab switcher */}
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
          {/* Search + filters */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {MUSCLE_GROUPS.map(g => (
                <button key={g} onClick={() => setSelectedGroup(g)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedGroup === g ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise cards */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {exercises.map(ex => (
              <div key={ex.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-start justify-between p-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{ex.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[ex.difficulty]}`}>{ex.difficulty}</span>
                    </div>
                    <p className="text-xs text-gray-500">{ex.muscleGroup} · {ex.equipmentType} · {ex.defaultSets}×{ex.defaultReps}</p>
                  </div>
                  {expandedId === ex.id ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
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

- [ ] **Step 2: Add Library tab to WorkoutPlanPage**

In `src/components/dashboard/WorkoutPlanPage.tsx`, find the top-level tab navigation (the section that switches between "This Week" / workout days). Add a "Library" tab option, and render `<ExerciseLibraryTab />` when it's selected.

First, check how tabs are structured: `grep -n "tab\|Tab\|activeTab\|screen" src/components/dashboard/WorkoutPlanPage.tsx | head -20`

Add import:
```typescript
import ExerciseLibraryTab from './ExerciseLibraryTab';
```

Add state (if a top-level view state doesn't exist):
```typescript
const [activeView, setActiveView] = useState<'plan' | 'library'>('plan');
```

Add a "Library" tab button alongside the existing navigation:
```tsx
<button
  onClick={() => setActiveView('library')}
  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
    activeView === 'library'
      ? 'border-red-600 text-red-600'
      : 'border-transparent text-gray-500 hover:text-gray-700'
  }`}
>
  Library
</button>
```

Wrap the existing workout plan JSX in `{activeView === 'plan' && (...)}` and add:
```tsx
{activeView === 'library' && <ExerciseLibraryTab />}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ExerciseLibraryTab.tsx src/components/dashboard/WorkoutPlanPage.tsx
git commit -m "feat: add Exercise Library tab and My Workouts to workout section"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Static exercise library TS file → Task 1
- ✅ Prisma models (ExerciseLibrary, UserCustomWorkout, UserWorkoutAddition) → Task 2
- ✅ Seed from TS file → Task 2
- ✅ weightUsedLbs on WorkoutExerciseLog → Task 2
- ✅ GET /api/exercises with filters → Task 3
- ✅ POST /api/exercises/add-to-plan → Task 3
- ✅ CRUD /api/workouts/custom → Task 3
- ✅ GET /api/workouts/last-weight → Task 3
- ✅ log-exercise accepts weightUsedLbs → Task 3
- ✅ Prompt feedback context block → Task 4
- ✅ WeightInput component → Task 5
- ✅ ExerciseLibraryModal (per-day Add Exercise button) → Task 6
- ✅ Wire modal into WorkoutPlanPage → Task 7
- ✅ ExerciseLibraryTab (Library + My Workouts sub-tabs) → Task 8

**No placeholders, no TBDs.** Type names are consistent across all tasks (`LibraryExercise`, `CustomWorkout`, `WorkoutFeedbackContext`).
