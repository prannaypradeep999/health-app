export interface WorkoutValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  daySummaries: Array<{
    day: string;
    exerciseCount: number;
    estimatedTime: number;
    estimatedCalories: number;
    issues: string[];
  }>;
}

type WorkoutPreferences = {
  preferredDuration?: number;
  availableDays?: string[];
  fitnessExperience?: string;
};

const MIN_CALORIES = 50;
const MAX_CALORIES = 800;
const MIN_TIME = 10;
const MAX_TIME = 120;
const MIN_SETS = 1;
const MAX_SETS = 10;
const MIN_REPS = 1;
const MAX_REPS = 50;
const MIN_EXERCISES = 3;
const MAX_EXERCISES = 12;
const MIN_DURATION_SECONDS = 10;
const MAX_DURATION_SECONDS = 300;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  }
  return null;
};

const normalizeDay = (day: unknown): string => {
  if (typeof day !== 'string') return 'unknown';
  return day.toLowerCase();
};

export function validateWorkoutPlan(
  weeklyPlan: any[],
  preferences: WorkoutPreferences
): WorkoutValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const daySummaries: WorkoutValidationResult['daySummaries'] = [];

  if (!Array.isArray(weeklyPlan) || weeklyPlan.length === 0) {
    return {
      valid: false,
      warnings: [],
      errors: ['Weekly plan is missing or empty'],
      daySummaries: []
    };
  }

  const preferredDuration = typeof preferences.preferredDuration === 'number'
    ? preferences.preferredDuration
    : null;
  const availableDays = Array.isArray(preferences.availableDays)
    ? preferences.availableDays.map(day => day.toLowerCase())
    : null;
  const fitnessExperience = preferences.fitnessExperience || null;

  weeklyPlan.forEach((dayPlan: any, index: number) => {
    const issues: string[] = [];
    const dayLabel = normalizeDay(dayPlan?.day) || `day-${index + 1}`;
    const hasExercises = Array.isArray(dayPlan?.exercises);
    const isRestDay = dayPlan?.restDay === true || !hasExercises || dayPlan.exercises.length === 0;

    if (!dayPlan?.day) {
      errors.push(`[WORKOUT-VALIDATOR] Missing day name at index ${index}`);
      issues.push('Missing day name');
    }

    if (!dayPlan?.focus) {
      errors.push(`[WORKOUT-VALIDATOR] ${dayLabel}: missing focus`);
      issues.push('Missing focus');
    }

    if (isRestDay) {
      if (!dayPlan?.activeRecovery) {
        errors.push(`[WORKOUT-VALIDATOR] ${dayLabel}: rest day missing activeRecovery`);
        issues.push('Rest day missing activeRecovery');
      }
    } else {
      if (!hasExercises) {
        errors.push(`[WORKOUT-VALIDATOR] ${dayLabel}: exercises missing or not an array`);
        issues.push('Exercises missing');
      }
    }

    const exerciseCount = hasExercises ? dayPlan.exercises.length : 0;
    const estimatedTime = toNumber(dayPlan?.estimatedTime) || 0;
    const estimatedCalories = toNumber(dayPlan?.estimatedCalories) || 0;

    if (!isRestDay) {
      if (exerciseCount < MIN_EXERCISES || exerciseCount > MAX_EXERCISES) {
        warnings.push(`[WORKOUT-VALIDATOR] ${dayLabel}: exerciseCount ${exerciseCount} outside ${MIN_EXERCISES}-${MAX_EXERCISES}`);
        issues.push('Exercise count outside expected range');
      }

      if (estimatedTime && (estimatedTime < MIN_TIME || estimatedTime > MAX_TIME)) {
        warnings.push(`[WORKOUT-VALIDATOR] ${dayLabel}: estimatedTime ${estimatedTime} min outside ${MIN_TIME}-${MAX_TIME}`);
        issues.push('Estimated time outside expected range');
      }

      if (estimatedCalories && (estimatedCalories < MIN_CALORIES || estimatedCalories > MAX_CALORIES)) {
        warnings.push(`[WORKOUT-VALIDATOR] ${dayLabel}: estimatedCalories ${estimatedCalories} outside ${MIN_CALORIES}-${MAX_CALORIES}`);
        issues.push('Estimated calories outside expected range');
      }
    }

    if (preferredDuration && estimatedTime > preferredDuration + 15) {
      warnings.push(`[WORKOUT-VALIDATOR] ${dayLabel}: estimatedTime ${estimatedTime} exceeds preferred ${preferredDuration}`);
      issues.push('Exceeds preferred duration');
    }

    if (availableDays && dayPlan?.day && !availableDays.includes(normalizeDay(dayPlan.day))) {
      warnings.push(`[WORKOUT-VALIDATOR] ${dayLabel}: scheduled but not in availableDays`);
      issues.push('Scheduled on unavailable day');
    }

    if (hasExercises && Array.isArray(dayPlan.exercises)) {
      dayPlan.exercises.forEach((exercise: any, exerciseIndex: number) => {
        const prefix = `${dayLabel} exercise ${exerciseIndex + 1}`;
        if (!exercise?.name) {
          errors.push(`[WORKOUT-VALIDATOR] ${prefix}: missing name`);
          issues.push('Exercise missing name');
        }
        if (!exercise?.equipment) {
          errors.push(`[WORKOUT-VALIDATOR] ${prefix}: missing equipment`);
          issues.push('Exercise missing equipment');
        }

        const sets = toNumber(exercise?.sets);
        const reps = toNumber(exercise?.reps);
        const duration = toNumber(exercise?.duration);

        if (sets === null) {
          errors.push(`[WORKOUT-VALIDATOR] ${prefix}: missing sets`);
          issues.push('Exercise missing sets');
        } else if (sets < MIN_SETS || sets > MAX_SETS) {
          warnings.push(`[WORKOUT-VALIDATOR] ${prefix}: sets ${sets} outside ${MIN_SETS}-${MAX_SETS}`);
          issues.push('Sets outside expected range');
        }

        if (reps === null && duration === null) {
          errors.push(`[WORKOUT-VALIDATOR] ${prefix}: missing reps or duration`);
          issues.push('Exercise missing reps/duration');
        }

        if (reps !== null && (reps < MIN_REPS || reps > MAX_REPS)) {
          warnings.push(`[WORKOUT-VALIDATOR] ${prefix}: reps ${reps} outside ${MIN_REPS}-${MAX_REPS}`);
          issues.push('Reps outside expected range');
        }

        if (duration !== null && (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS)) {
          warnings.push(`[WORKOUT-VALIDATOR] ${prefix}: duration ${duration}s outside ${MIN_DURATION_SECONDS}-${MAX_DURATION_SECONDS}`);
          issues.push('Duration outside expected range');
        }
      });
    }

    if (!isRestDay && fitnessExperience) {
      if (fitnessExperience === 'beginner' && exerciseCount > 8) {
        warnings.push(`[WORKOUT-VALIDATOR] ${dayLabel}: exerciseCount ${exerciseCount} high for beginner`);
        issues.push('Too many exercises for beginner');
      }
      if (fitnessExperience === 'advanced' && exerciseCount < 4) {
        warnings.push(`[WORKOUT-VALIDATOR] ${dayLabel}: exerciseCount ${exerciseCount} low for advanced`);
        issues.push('Too few exercises for advanced');
      }
    }

    daySummaries.push({
      day: dayLabel,
      exerciseCount,
      estimatedTime,
      estimatedCalories,
      issues
    });
  });

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    daySummaries
  };
}
