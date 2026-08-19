import { SurveyResponse } from '@prisma/client';

// Maps the fine-grained muscle names Phase 1 produces onto the coarse
// muscleGroup values actually stored in ExerciseLibrary
// ("Mobility","Chest","Cardio","Shoulders","Arms","Full Body","Back","Core","Legs").
const MUSCLE_GROUP_SYNONYMS: Record<string, string> = {
  triceps: 'arms',
  biceps: 'arms',
  forearms: 'arms',
  quads: 'legs',
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  lats: 'back',
  traps: 'back',
  rhomboids: 'back',
  'lower back': 'back',
  abs: 'core',
  abdominals: 'core',
  obliques: 'core',
  pecs: 'chest',
  pectorals: 'chest',
  delts: 'shoulders',
  deltoids: 'shoulders',
  conditioning: 'cardio',
  endurance: 'cardio',
  flexibility: 'mobility',
  stretching: 'mobility',
};

// Types for workout generation
export interface WorkoutPreferences {
  fitnessExperience?: string;
  gymAccess?: string;
  workoutTypes?: string[];
  availableDays?: string[];
  preferredDuration?: number;
  injuryConsiderations?: string[];
  timePreferences?: string[];
}

export interface WorkoutDay {
  day: string;
  restDay: boolean;
  focus: string;
  estimatedTime: string;
  estimatedCalories: number;
  targetMuscles: string[];
  description: string;
  warmup?: Array<{
    name: string;
    duration: string;
    instructions: string;
  }>;
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    restTime: string;
    tempo?: string; // e.g., "3-1-2" (eccentric-pause-concentric)
    description: string;
    instructions: string;
    formTips: string[];
    commonMistakes?: string[];
    breathingCue?: string; // e.g., "Exhale on push, inhale on lower"
    weightGuidance: {
      method: string; // "RPE", "bodyweight", "percentage", "feel"
      suggestion: string; // e.g., "Start with 10-15 lb dumbbells, increase when you can complete all reps with good form"
      rpeTarget?: number; // 6-10 scale
      warmupSets?: string; // e.g., "Do 1-2 warmup sets at 50% weight"
    };
    modifications: {
      beginner: string;
      intermediate: string;
      advanced: string;
    };
    muscleTargets: string[];
    imageUrl?: string;
    imageSource?: string;
    imageSearchQuery?: string;
    imageCached?: boolean;
  }>;
  cooldown?: Array<{
    name: string;
    duration: string;
    instructions: string;
  }>;
  // For rest days - personalized active recovery
  activeRecovery?: {
    suggestedActivity: string; // Based on user's preferredActivities
    duration: string;
    description: string;
    alternatives: string[];
  };
}

export const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
] as const;

/**
 * One spelling of a weekday, whatever came in.
 *
 * `workoutPreferences.availableDays` holds two different formats depending on
 * how the row was written: the survey UI submits `["Mon","Tue"]` while the
 * fallback in api/survey/route.ts writes `['monday','wednesday','friday']`.
 * Both then flowed straight into the prompt and into the validator, which
 * lower-cased and compared — so `"mon" !== "monday"` and the availableDays
 * check warned on literally every day, every run. Because warnings are
 * advisory, nothing stopped a 3-day-a-week user from being handed 6 training
 * days.
 *
 * Returns '' for anything unrecognised so callers can drop it rather than
 * silently matching the wrong day.
 */
export function canonicalDay(day: unknown): string {
  if (typeof day !== 'string') return '';
  const d = day.trim().toLowerCase();
  return DAYS_OF_WEEK.find(full => full === d || full.startsWith(d) && d.length >= 3) || '';
}

export interface WorkoutFeedbackContext {
  poorlyRatedExercises: string[];
  wellRatedExercises: string[];
  completionRateByDay: Record<string, number>;
  savedCustomExercises: string[];
  favoriteExercises: string[];
  weightProgressionByExercise: Record<string, { lastWeightLbs: number; suggestedWeightLbs: number }>;
  repCompletionByExercise: Record<string, number[]>;
}

export interface WorkoutPlan {
  weeklyPlan: WorkoutDay[];
  overview: {
    splitType: string;
    description: string;
    whyThisSplit: string;
    expectedResults: string[];
  };
  progressionTips: string[];
  safetyReminders: string[];
  equipmentNeeded: string[];
}

const getWorkoutGoalContext = (goal: string): string => {
  switch (goal) {
    case 'WEIGHT_LOSS':
      return 'Focus on calorie-burning exercises, HIIT, and cardio. Higher volume, shorter rest periods.';
    case 'MUSCLE_GAIN':
      return 'Focus on progressive overload and strength training. Lower reps, heavier weights, longer rest.';
    case 'ENDURANCE':
      return 'Focus on cardiovascular endurance, longer duration activities, and aerobic capacity.';
    case 'GENERAL_WELLNESS':
    default:
      return 'Balanced approach with variety. Mix of cardio, strength, and flexibility.';
  }
};

// Helper function to get current day info
const getCurrentDayInfo = () => {
  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayIndex = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

  const orderedDays = [
    ...dayNames.slice(todayIndex),    // Days from today to end of week
    ...dayNames.slice(0, todayIndex)  // Days from start of week to yesterday
  ];

  return {
    currentDay: dayNames[todayIndex],
    orderedDays,
    dayIndex: todayIndex
  };
};

// Planning prompt for high-level workout structure (Phase 1 of plan+parallel)
export const createWorkoutPlanningPrompt = (
  surveyData: SurveyResponse,
  workoutPrefs: WorkoutPreferences,
  feedbackContext?: WorkoutFeedbackContext,
  libraryExercises?: Array<{
    name: string;
    muscleGroup: string | null;
    equipmentType: string | null;
    defaultSets: number | null;
    defaultReps: string | null;
    difficulty: string | null;
    weightGuidance: string | null;
  }>
): string => {
  const dayInfo = getCurrentDayInfo();

  // Canonicalised once here so the prompt speaks the same dialect it asks the
  // model to reply in — previously it interpolated "Mon, Tue, Fri" raw while
  // demanding `"day": "monday"` back.
  const trainingDays = (workoutPrefs.availableDays || [])
    .map(canonicalDay)
    .filter(Boolean);
  const restDays = DAYS_OF_WEEK.filter(d => !trainingDays.includes(d));

  return `You are an expert fitness trainer. Create a high-level 7-day workout plan outline.

USER PROFILE:
- Name: ${surveyData.firstName || 'User'}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Primary Goal: ${surveyData.goal}
- Fitness Level: ${surveyData.fitnessLevel || workoutPrefs.fitnessExperience || 'intermediate'}
- Activity Level: ${surveyData.activityLevel}

WORKOUT PREFERENCES:
- Available Days: ${trainingDays.length > 0 ? `${trainingDays.join(', ')} (${trainingDays.length} days/week)` : 'flexible'}
- Session Duration: ${workoutPrefs.preferredDuration || 45} minutes
- Gym Access: ${workoutPrefs.gymAccess || 'no_gym'}
- Preferred Types: ${workoutPrefs.workoutTypes?.join(', ') || 'varied'}
- Injuries: ${(workoutPrefs.injuryConsiderations || []).join(', ') || 'none'}

${libraryExercises && libraryExercises.length > 0 ? `
AVAILABLE EXERCISE LIBRARY (prefer these exercises — curated for this user's equipment):
${libraryExercises.map(e =>
  `- ${e.name} | muscles: ${e.muscleGroup || 'general'} | equipment: ${e.equipmentType || 'bodyweight'} | sets: ${e.defaultSets || 3} | reps: ${e.defaultReps || '8-12'} | difficulty: ${e.difficulty || 'intermediate'}`
).join('\n')}

PREFER exercises from this library. Add exercises not in the library only if the library lacks coverage for a muscle group.
` : ''}
GOAL CONTEXT: ${getWorkoutGoalContext(surveyData.goal)}

Select the best training split and outline all 7 days. For rest days, mark restDay: true and set exercises to an empty array.
Start the week from today (${dayInfo.orderedDays[0]}) and go through ${dayInfo.orderedDays[6]}.
${trainingDays.length > 0 ? `
DAY SCHEDULE — THIS IS A HARD CONSTRAINT, NOT A PREFERENCE:
- Training days (restDay: false), exactly these ${trainingDays.length}: ${trainingDays.join(', ')}
- Rest days (restDay: true), exactly these ${restDays.length}: ${restDays.join(', ')}
The user told us which days they can train. Scheduling a workout on any other
day produces a plan they cannot follow. Do not add training days to "make the
split work" — fit the split to the days given, and use the "day" values spelled
exactly as above.
` : ''}

Return ONLY this JSON:
{
  "splitType": "Push/Pull/Legs",
  "description": "Why this split suits the user",
  "whyThisSplit": "Science-based reasoning",
  "expectedResults": ["result1", "result2"],
  "progressionTips": ["tip1", "tip2"],
  "safetyReminders": ["reminder1"],
  "equipmentNeeded": ["equipment1"],
  "weeklyPlan": [
    {
      "day": "monday",
      "restDay": false,
      "focus": "Upper Body Push (Chest, Shoulders, Triceps)",
      "estimatedTime": "45 minutes",
      "estimatedCalories": 280,
      "targetMuscles": ["chest", "shoulders", "triceps"],
      "description": "Motivating 2-3 sentence description referencing user goals"
    },
    {
      "day": "tuesday",
      "restDay": true,
      "focus": "Active Recovery",
      "estimatedTime": "20-30 minutes",
      "estimatedCalories": 100,
      "targetMuscles": [],
      "description": "Rest day description"
    }
  ]
}

Include ALL 7 days. No markdown, pure JSON.${feedbackContext ? `

PAST PERFORMANCE DATA (use this to improve the plan):
${feedbackContext.poorlyRatedExercises.length > 0 ? `- Avoid or substitute (rated too hard): ${feedbackContext.poorlyRatedExercises.slice(0, 8).join(', ')}` : ''}
${feedbackContext.wellRatedExercises.length > 0 ? `- Include variations of (rated great form): ${feedbackContext.wellRatedExercises.slice(0, 8).join(', ')}` : ''}
${Object.keys(feedbackContext.completionRateByDay).length > 0 ? `- Completion by day: ${Object.entries(feedbackContext.completionRateByDay).map(([d, r]) => `${d} ${r}%`).join(', ')} — reduce volume on low-completion days` : ''}
${Object.keys(feedbackContext.weightProgressionByExercise).length > 0 ? `- Weight progression targets this week:\n${Object.entries(feedbackContext.weightProgressionByExercise).slice(0, 10).map(([ex, w]) => `  * ${ex}: last used ${w.lastWeightLbs} lbs → suggest ${w.suggestedWeightLbs} lbs`).join('\n')}` : ''}
${feedbackContext.favoriteExercises.length > 0 ? `- Favourite exercises (include progressions): ${feedbackContext.favoriteExercises.slice(0, 8).join(', ')}` : ''}` : ''}`;
};

// Detail prompt for a chunk of workout days (Phase 2 of plan+parallel)
export const createWorkoutDetailPrompt = (
  dayOutlines: Array<{
    day: string;
    restDay: boolean;
    focus: string;
    estimatedTime: string;
    estimatedCalories: number;
    targetMuscles: string[];
    description: string;
  }>,
  surveyData: SurveyResponse,
  workoutPrefs: WorkoutPreferences,
  /**
   * Phase 1 got both of these and Phase 2 did not, which was backwards.
   * Planning only emits day *outlines* — focus, duration, target muscles — and
   * names no exercises at all. Every exercise name, and every
   * `weightGuidance.suggestion`, is written here. So the phase that had last
   * week's weights could not use them, and the phase that needed them could not
   * see them: the plan told the user "increase gradually" while the DB held the
   * exact 135 lbs they pressed on Tuesday.
   */
  feedbackContext?: WorkoutFeedbackContext,
  libraryExercises?: Array<{
    name: string;
    muscleGroup: string | null;
    equipmentType: string | null;
    defaultSets: number | null;
    defaultReps: string | null;
    difficulty: string | null;
    weightGuidance: string | null;
  }>
): string => {
  const gymAccess = workoutPrefs.gymAccess || 'no_gym';
  let equipmentConstraint = '';
  if (gymAccess === 'no_gym') {
    equipmentConstraint = 'USER HAS NO GYM - bodyweight/resistance bands ONLY. No barbells, cables, machines.';
  } else if (gymAccess === 'free_weights') {
    equipmentConstraint = 'USER HAS FREE WEIGHTS ONLY - dumbbells, barbells, kettlebells. No cable machines.';
  } else if (gymAccess === 'full_gym') {
    equipmentConstraint = 'USER HAS FULL GYM - all equipment available.';
  } else if (gymAccess === 'calisthenics') {
    equipmentConstraint = 'USER PREFERS CALISTHENICS - bodyweight progressions, pull-ups, dips.';
  }

  const injuryConstraint = (workoutPrefs.injuryConsiderations || []).length > 0
    ? `AVOID exercises that stress: ${workoutPrefs.injuryConsiderations!.join(', ')}`
    : 'No injuries - full exercise selection.';

  const dayList = dayOutlines
    .map(d => `- ${d.day}: ${d.restDay ? 'REST DAY' : `${d.focus} (${d.estimatedTime}, ${d.estimatedCalories} cal, muscles: ${d.targetMuscles.join(', ')})`}`)
    .join('\n');

  // Only the exercises whose muscle group this chunk actually trains, so a
  // Mon/Tue chunk is not handed 60 rows of leg work. Cap keeps the prompt small.
  const chunkMuscles = new Set(
    dayOutlines.flatMap(d => (d.targetMuscles || []).map(m => String(m).toLowerCase()))
  );
  // Phase 1 emits fine-grained muscles ("triceps", "quads", "lats"); the library
  // stores coarse groups ("Arms", "Legs", "Back"). Without this map 6 of the 12
  // most common target muscles matched nothing and the block rendered empty.
  const normalizedMuscles = new Set<string>();
  for (const m of chunkMuscles) {
    normalizedMuscles.add(m);
    const mapped = MUSCLE_GROUP_SYNONYMS[m];
    if (mapped) normalizedMuscles.add(mapped);
  }

  const matched = (libraryExercises || []).filter(ex => {
    if (normalizedMuscles.size === 0) return true;
    const group = (ex.muscleGroup || '').toLowerCase().trim();
    if (group === '') return false;
    if (group === 'full body') return true;
    return [...normalizedMuscles].some(m => group.includes(m) || m.includes(group));
  });

  // Never hand the model an empty library — a partial match beats no guidance.
  const relevantLibrary = (matched.length > 0 ? matched : (libraryExercises || [])).slice(0, 30);

  const libraryBlock = relevantLibrary.length > 0
    ? `

APPROVED EXERCISE LIBRARY (already filtered to this user's equipment and level —
prefer these names; they are what the app can track progression against):
${relevantLibrary.map(ex => `- ${ex.name}${ex.muscleGroup ? ` [${ex.muscleGroup}]` : ''}${ex.defaultSets && ex.defaultReps ? ` — typically ${ex.defaultSets}x${ex.defaultReps}` : ''}${ex.weightGuidance ? ` — ${ex.weightGuidance}` : ''}`).join('\n')}`
    : '';

  const progression = feedbackContext?.weightProgressionByExercise || {};
  const progressionEntries = Object.entries(progression).slice(0, 12);
  const reps = feedbackContext?.repCompletionByExercise || {};
  const repEntries = Object.entries(reps).slice(0, 10);

  const historyBlock = (progressionEntries.length > 0 || repEntries.length > 0
    || (feedbackContext?.poorlyRatedExercises.length || 0) > 0
    || (feedbackContext?.favoriteExercises.length || 0) > 0)
    ? `

THIS USER'S ACTUAL TRAINING HISTORY — use it, do not write generic advice:
${progressionEntries.length > 0 ? `- Weights they actually lifted, and this week's target. When you emit one of
  these exercises, weightGuidance.method must be "weight" and
  weightGuidance.suggestion must state the target number in lbs explicitly:
${progressionEntries.map(([ex, w]) => `  * ${ex}: last ${w.lastWeightLbs} lbs → prescribe ${w.suggestedWeightLbs} lbs`).join('\n')}` : ''}
${repEntries.length > 0 ? `- Reps completed recently (if they consistently hit the top of the range, raise it):
${repEntries.map(([ex, r]) => `  * ${ex}: ${r.slice(0, 5).join(', ')}`).join('\n')}` : ''}
${(feedbackContext?.poorlyRatedExercises.length || 0) > 0 ? `- Rated too hard / disliked — substitute something for the same muscle: ${feedbackContext!.poorlyRatedExercises.slice(0, 8).join(', ')}` : ''}
${(feedbackContext?.favoriteExercises.length || 0) > 0 ? `- Favourites — include these or a progression of them: ${feedbackContext!.favoriteExercises.slice(0, 8).join(', ')}` : ''}

Never write "start light", "use a comfortable weight" or "increase gradually"
for an exercise listed above. The number is known; state it.` : '';

  return `You are an expert fitness trainer. Generate FULL exercise details for these specific workout days.

DAYS TO FILL IN:
${dayList}

USER CONSTRAINTS:
- Goal: ${surveyData.goal}
- Fitness Level: ${surveyData.fitnessLevel || workoutPrefs.fitnessExperience || 'intermediate'}
- Session Duration: ${workoutPrefs.preferredDuration || 45} minutes
- ${equipmentConstraint}
- ${injuryConstraint}
- Preferred Activities: ${surveyData.preferredActivities?.join(', ') || 'none'}
${libraryBlock}${historyBlock}

For each TRAINING day, generate 3-7 exercises with full detail.
For each REST day, generate only the activeRecovery block.

Every day object must carry all four of warmup, exercises, cooldown and
activeRecovery. Use null for the ones that do not apply: a training day has
activeRecovery: null, a rest day has warmup: null, exercises: null and
cooldown: null. Never omit a key.

Return ONLY this JSON:
{
  "days": [
    {
      "day": "monday",
      "restDay": false,
      "warmup": [
        {"name": "Arm Circles", "duration": "30 seconds", "instructions": "..."}
      ],
      "exercises": [
        {
          "name": "Push-ups",
          "sets": 3,
          "reps": "8-12",
          "restTime": "90 seconds",
          "tempo": "2-1-2",
          "description": "Foundation of upper body push strength",
          "instructions": "Full instructions here",
          "formTips": ["tip1", "tip2"],
          "commonMistakes": ["mistake1"],
          "breathingCue": "Exhale on push, inhale on lower",
          "weightGuidance": {
            "method": "bodyweight",
            "suggestion": "Focus on form. Progress to decline when you can do 15+",
            "rpeTarget": 7,
            "warmupSets": "5-10 easy reps before working sets"
          },
          "modifications": {
            "beginner": "Knee push-ups",
            "intermediate": "Standard push-ups",
            "advanced": "Decline or weighted push-ups"
          },
          "muscleTargets": ["chest", "shoulders", "triceps"]
        }
      ],
      "cooldown": [
        {"name": "Chest Stretch", "duration": "30 seconds", "instructions": "..."}
      ],
      "activeRecovery": null
    },
    {
      "day": "tuesday",
      "restDay": true,
      "warmup": null,
      "exercises": null,
      "cooldown": null,
      "activeRecovery": {
        "suggestedActivity": "Gentle yoga flow",
        "duration": "25 minutes",
        "description": "Recovery session to reduce soreness",
        "alternatives": ["20-min walk", "foam rolling", "light stretching"]
      }
    }
  ]
}

IMPORTANT: Return ALL ${dayOutlines.length} days. No markdown, pure JSON.`;
};

// Fitness Profile Generation Prompt
export const createFitnessProfilePrompt = (surveyData: SurveyResponse): string => {
  return `You are an elite personal trainer and fitness coach. Create a comprehensive fitness profile for this user.

SURVEY DATA:
${JSON.stringify({
  name: `${surveyData.firstName} ${surveyData.lastName}`,
  age: surveyData.age,
  sex: surveyData.sex,
  goal: surveyData.goal,
  activityLevel: surveyData.activityLevel,
  sportsInterests: surveyData.sportsInterests,
  fitnessTimeline: surveyData.fitnessTimeline,
  workoutPreferences: surveyData.workoutPreferencesJson,
  monthlyFitnessBudget: surveyData.monthlyFitnessBudget
}, null, 2)}

TASK: Create a comprehensive fitness profile that captures this user's personality, goals, and training needs. Write as if you're their personal trainer who knows them well.

FORMAT: Write in 2nd person ("you") as if speaking directly to the user. Be specific, actionable, and motivating.

INCLUDE:
1. TRAINING PHILOSOPHY: Based on their goal (${surveyData.goal || surveyData.primaryGoal || 'GENERAL_WELLNESS'}) and fitness level (${surveyData.fitnessLevel || 'intermediate'})
2. WORKOUT STRATEGY: How to structure training for their lifestyle and preferences
3. PROGRESSION APPROACH: Realistic timeline based on their fitness timeline expectations
4. MOTIVATION STYLE: What drives them based on sports interests and personality
5. EQUIPMENT & BUDGET: How to optimize their $${surveyData.monthlyFitnessBudget}/month budget
6. LIFESTYLE INTEGRATION: How workouts fit into their current activity patterns
7. SUCCESS METRICS: What progress looks like for their specific goals

Keep it concise but comprehensive (300-500 words). Write like a knowledgeable trainer who understands their specific situation.`;
};
