import { verdict, type Verdict } from './types';

export interface WorkoutDayClaim {
  day: string;
  restDay: boolean;
  exercises: Array<{ name: string }> | null;
}

export interface WorkoutSurvey {
  equipmentAccess: string[];
  injuryConsiderations: string[];
  availableDays: string[];
}

/**
 * Equipment a movement's *name* implies. Deliberately name-only: the exercise
 * object carries no equipment field, and inferring from `description` produced
 * false positives on every "no barbell needed" modification note.
 */
export const EQUIPMENT_PATTERNS: Record<string, RegExp> = {
  barbell: /\bbarbell|\bdeadlift\b|\bback squat\b|\bfront squat\b|\bbench press\b|\bclean\b|\bsnatch\b/i,
  dumbbell: /\bdumbbell|\bdb\b/i,
  kettlebell: /\bkettlebell|\bkb\b|\bswing\b/i,
  cable: /\bcable\b|\blat pulldown\b|\bpulldown\b|\btricep pushdown\b/i,
  machine: /\bmachine\b|\bleg press\b|\bleg extension\b|\bleg curl\b|\bsmith\b/i,
  'pull-up bar': /\bpull-?up\b|\bchin-?up\b|\bhanging leg raise\b/i,
  bench: /\bbench\b|\bincline\b|\bdecline\b/i,
  bands: /\bband\b|\bresistance band\b/i,
};

/** Movements a given reported injury makes a bad idea. */
export const INJURY_CONTRAINDICATIONS: Record<string, RegExp> = {
  knee: /\bjump|\bplyo|\bbox jump\b|\blunge\b|\bdeep squat\b|\bsprint\b|\bburpee\b/i,
  back: /\bdeadlift\b|\bgood morning\b|\bbent-?over row\b|\bsit-?up\b|\bhyperextension\b|\btoe touch\b/i,
  shoulder: /\boverhead press\b|\bmilitary press\b|\bupright row\b|\bbehind the neck\b|\bdip\b|\bsnatch\b/i,
  wrist: /\bpush-?up\b|\bplank\b|\bfront squat\b|\bclean\b|\bhandstand\b/i,
  ankle: /\bjump|\bplyo|\bsprint\b|\bcalf raise\b|\bbox jump\b/i,
  hip: /\bdeep squat\b|\blunge\b|\bleg press\b|\bhip thrust\b/i,
  neck: /\bshrug\b|\boverhead press\b|\bbehind the neck\b|\bbridge\b/i,
};

const has = (haystack: string[], needle: string) =>
  haystack.some(h => h.toLowerCase().includes(needle) || needle.includes(h.toLowerCase()));

/**
 * W1-W3: does the plan respect what the user actually told us?
 *
 * All Tier A — the evidence is the survey, which the route is already holding.
 * Nothing here makes a network call.
 */
export function verifyWorkoutPlan(days: WorkoutDayClaim[], survey: WorkoutSurvey): Verdict[] {
  const out: Verdict[] = [];
  const owned = (survey.equipmentAccess ?? []).map(e => e.toLowerCase());
  const injuries = (survey.injuryConsiderations ?? []).map(i => i.toLowerCase()).filter(Boolean);
  const available = (survey.availableDays ?? []).map(d => d.toLowerCase());

  for (const d of days ?? []) {
    const where = `workout.${d.day}`;

    // W3 first: it is about the day, not the exercises.
    if (available.length === 0) {
      out.push(verdict('W3-day-available', where, 'unchecked', d.day, 'the survey recorded no available days'));
    } else if (d.restDay) {
      // A rest day on an unavailable day is exactly right, not a violation.
      out.push(verdict('W3-day-available', where, 'verified', d.day, 'rest day'));
    } else if (available.includes(String(d.day ?? '').toLowerCase())) {
      out.push(verdict('W3-day-available', where, 'verified', d.day, 'listed as available'));
    } else {
      out.push(verdict('W3-day-available', where, 'contradicted', d.day, `training scheduled on a day the survey did not list (${survey.availableDays.join(', ')})`));
    }

    for (const ex of d.exercises ?? []) {
      const name = ex?.name ?? '';
      const target = `${where}.${name}`;

      // W1
      const needed = Object.entries(EQUIPMENT_PATTERNS)
        .filter(([, re]) => re.test(name))
        .map(([kind]) => kind);
      if (needed.length === 0) {
        out.push(verdict('W1-equipment-available', target, 'verified', name, 'no equipment implied by the name'));
      } else {
        const missing = needed.filter(n => !has(owned, n));
        out.push(missing.length === 0
          ? verdict('W1-equipment-available', target, 'verified', name, `requires ${needed.join(', ')}, all available`)
          : verdict('W1-equipment-available', target, 'contradicted', name, `requires ${missing.join(', ')}, which the survey did not list`));
      }

      // W2. Absence of a reported injury is not evidence of safety, so with no
      // injuries on file this is unchecked rather than verified.
      if (injuries.length === 0) {
        out.push(verdict('W2-injury-safe', target, 'unchecked', name, 'no injuries reported'));
      } else {
        const hits = injuries.filter(inj => {
          const re = Object.entries(INJURY_CONTRAINDICATIONS).find(([k]) => inj.includes(k))?.[1];
          return re ? re.test(name) : false;
        });
        out.push(hits.length === 0
          ? verdict('W2-injury-safe', target, 'verified', name, `no contraindication for ${injuries.join(', ')}`)
          : verdict('W2-injury-safe', target, 'contradicted', name, `contraindicated for reported ${hits.join(', ')} injury`));
      }
    }
  }

  return out;
}
