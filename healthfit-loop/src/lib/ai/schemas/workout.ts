import { z } from 'zod';

/** Plan phase: createWorkoutPlanningPrompt in workout-generation.ts */
export const WorkoutDayOutline = z.object({
  day: z.string(),
  restDay: z.boolean(),
  focus: z.string(),
  estimatedTime: z.string(),
  estimatedCalories: z.number(),
  targetMuscles: z.array(z.string()),
  description: z.string(),
}).strict();

export const WorkoutPlanSchema = z.object({
  splitType: z.string(),
  description: z.string(),
  whyThisSplit: z.string(),
  expectedResults: z.array(z.string()),
  progressionTips: z.array(z.string()),
  safetyReminders: z.array(z.string()),
  equipmentNeeded: z.array(z.string()),
  // A week is seven days and the prompt enumerates them by name, so pinning the
  // count cannot force filler — it can only stop the array closing early. An
  // unbounded array let a four-day answer to a seven-day request ship a 200.
  weeklyPlan: z.array(WorkoutDayOutline).length(7),
}).strict();

const TimedMovement = z.object({
  name: z.string(),
  duration: z.string(),
  instructions: z.string(),
}).strict();

export const Exercise = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  restTime: z.string(),
  tempo: z.string(),
  description: z.string(),
  instructions: z.string(),
  formTips: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  breathingCue: z.string(),
  weightGuidance: z.object({
    method: z.string(),
    suggestion: z.string(),
    rpeTarget: z.number(),
    warmupSets: z.string(),
  }).strict(),
  modifications: z.object({
    beginner: z.string(),
    intermediate: z.string(),
    advanced: z.string(),
  }).strict(),
  muscleTargets: z.array(z.string()),
}).strict();

/**
 * An object, not a string array. WorkoutPlanPage.tsx reads .suggestedActivity,
 * .duration, .description and .alternatives.
 */
export const ActiveRecovery = z.object({
  suggestedActivity: z.string(),
  duration: z.string(),
  description: z.string(),
  alternatives: z.array(z.string()),
}).strict();

/**
 * Training days carry warmup/exercises/cooldown; rest days carry activeRecovery.
 * Strict mode forbids anyOf at the root and requires every key, so the branches
 * are flattened and nullable, discriminated by restDay. The branch invariant is
 * enforced by WorkoutDetailSchema's superRefine, which runs locally only.
 */
export const WorkoutDayDetail = z.object({
  day: z.string(),
  restDay: z.boolean(),
  warmup: z.array(TimedMovement).nullable(),
  exercises: z.array(Exercise).nullable(),
  cooldown: z.array(TimedMovement).nullable(),
  activeRecovery: ActiveRecovery.nullable(),
}).strict();

export const WorkoutDetailShape = z.object({
  days: z.array(WorkoutDayDetail),
}).strict();

/** Catches the exercise-less training day that the day-key merge used to hide. */
export const WorkoutDetailSchema = WorkoutDetailShape.superRefine((value, ctx) => {
  value.days.forEach((d, i) => {
    if (!d.restDay && (!d.exercises || d.exercises.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['days', i, 'exercises'],
        message: `Training day "${d.day}" must have exercises`,
      });
    }
    if (d.restDay && !d.activeRecovery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['days', i, 'activeRecovery'],
        message: `Rest day "${d.day}" must have activeRecovery`,
      });
    }
  });
});

/** analyze-workout/route.ts */
export const WorkoutAnalysisSchema = z.object({
  calories: z.number(),
  tips: z.string(),
}).strict();
