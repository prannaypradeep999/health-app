import { SurveyResponse } from '@prisma/client';

// Types for workout generation
export interface WorkoutPreferences {
  fitnessExperience?: string;
  gymAccess?: string;
  workoutTypes?: string[];
  availableDays?: string[];
  preferredDuration?: number;
  injuryConsiderations?: string[];
}

export interface WorkoutDay {
  day: string;
  restDay: boolean;
  focus: string;
  estimatedTime: string;
  estimatedCalories: number;
  targetMuscles: string[];
  description: string;
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    restTime: string;
    description: string;
    instructions: string;
    formTips: string[];
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
1. TRAINING PHILOSOPHY: Based on their goal (${surveyData.goal}) and current activity level
2. WORKOUT STRATEGY: How to structure training for their lifestyle and preferences
3. PROGRESSION APPROACH: Realistic timeline based on their fitness timeline expectations
4. MOTIVATION STYLE: What drives them based on sports interests and personality
5. EQUIPMENT & BUDGET: How to optimize their $${surveyData.monthlyFitnessBudget}/month budget
6. LIFESTYLE INTEGRATION: How workouts fit into their current activity patterns
7. SUCCESS METRICS: What progress looks like for their specific goals

Keep it concise but comprehensive (300-500 words). Write like a knowledgeable trainer who understands their specific situation.`;
};

// Main Workout Plan Generation Prompt
export const createWorkoutPlanPrompt = (surveyData: SurveyResponse, workoutPrefs: WorkoutPreferences): string => {
  const dayInfo = getCurrentDayInfo();
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `You are an expert fitness trainer with decades of experience in exercise science, biomechanics, and program design. You create science-based workout programs following established methodologies from top fitness professionals and research institutions.

CORE EXPERTISE AREAS:
- Exercise science and biomechanics (NASM, ACSM guidelines)
- Progressive overload principles (Schoenfeld, 2010-2023 research)
- Training splits: PPL (Helms et al.), Upper/Lower (Candow & Burke), Full Body (Gentil et al.)
- Periodization (Bompa & Haff methodologies)
- Injury prevention (Gray Cook movement patterns)
- Age-specific adaptations (HIIT protocols, senior training)

ESTABLISHED TRAINING METHODOLOGIES:
1. Push/Pull/Legs (PPL) - Brad Schoenfeld, Eric Helms protocols
2. Upper/Lower Split - Mike Israetel, Renaissance Periodization
3. Full Body - Chad Waterbury, Dan John methodologies
4. Athletic Performance - NSCA, Functional Movement Screen protocols

SCIENTIFIC PRINCIPLES YOU FOLLOW:
- Progressive overload (2.5-10% weekly increases)
- Specificity principle (SAID - Specific Adaptation to Imposed Demands)
- Recovery protocols (48-72hr muscle protein synthesis cycles)
- Volume landmarks (Dr. Mike Israetel's training volumes)
- Intensity zones based on goal-specific adaptations

USER PROFILE:
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Primary Goal: ${surveyData.goal}
- Activity Level: ${surveyData.activityLevel}
- Sports Interests: ${surveyData.sportsInterests || 'none specified'}
- Fitness Timeline: ${surveyData.fitnessTimeline || 'no specific timeline'}
- Monthly Fitness Budget: $${surveyData.monthlyFitnessBudget || 50}
- Workout Experience: ${workoutPrefs.fitnessExperience || 'intermediate'}
- Gym Access: ${workoutPrefs.gymAccess || 'no_gym'}
- Preferred Workout Types: ${workoutPrefs.workoutTypes?.join(', ') || 'varied'}
- Available Days: ${workoutPrefs.availableDays?.length || 5} days per week
- Session Duration: ${workoutPrefs.preferredDuration || 45} minutes
- Injury Considerations: ${workoutPrefs.injuryConsiderations?.join(', ') || 'none'}

EXPERT METHODOLOGY SELECTION:
Based on research and established protocols, select the BEST training split for this user:

FOR MUSCLE_GAIN: Push/Pull/Legs (PPL) split - Maximizes hypertrophy through optimal volume distribution and recovery (Schoenfeld et al.)
FOR WEIGHT_LOSS: Full Body + HIIT protocols - Maximizes caloric expenditure and metabolic benefits (Boutcher, 2011)
FOR ENDURANCE: Polarized training model - 80/20 rule from elite endurance research (Seiler, 2010)
FOR STRENGTH: Upper/Lower with compound focus - Powerlifting methodology (Israetel et al.)

EXERCISE SELECTION PRINCIPLES:
1. Compound movements (70%): Squat, deadlift, bench, row patterns
2. Isolation work (20%): Target specific muscle groups
3. Stability/mobility (10%): Core, balance, flexibility work

REP RANGES (Evidence-based):
- Strength: 3-6 reps @ 85-95% 1RM
- Hypertrophy: 6-12 reps @ 65-85% 1RM
- Endurance: 12-20+ reps @ 50-65% 1RM
- Power: 3-5 reps @ 30-60% 1RM (explosive)

REST PERIODS (Research-backed):
- Strength: 3-5 minutes (Ratamess et al.)
- Hypertrophy: 1-3 minutes (Schoenfeld et al.)
- Endurance: 30-90 seconds (circuit style)

RETURN EXACTLY THIS JSON STRUCTURE:

{
  "weeklyPlan": [
    {
      "day": "monday",
      "restDay": false,
      "focus": "Upper Body Push (Chest, Shoulders, Triceps)",
      "estimatedTime": "45 minutes",
      "estimatedCalories": 280,
      "targetMuscles": ["chest", "shoulders", "triceps"],
      "description": "Welcome to your Push day! Today we're targeting your chest, shoulders, and triceps using proven push movement patterns. This workout follows the Push/Pull/Legs methodology used by top bodybuilders and strength coaches. Focus on perfect form over heavy weight - choose weights that allow you to complete all reps with 2-3 reps in reserve. Control the weight on both the lowering and lifting phases, and engage your core throughout each movement. Perfect for your ${surveyData.goal} goal because pushing movements build upper body strength and size while burning significant calories. Listen to your body and adjust weights as needed!",
      "exercises": [
        {
          "name": "Push-ups (or Bench Press if available)",
          "sets": 3,
          "reps": "8-12",
          "restTime": "90 seconds",
          "description": "The king of upper body pushing exercises - builds chest, shoulders, and triceps simultaneously",
          "instructions": "Start in plank position, hands slightly wider than shoulders. Lower chest to floor with control, then push back up explosively. Keep core tight throughout.",
          "formTips": ["Keep body in straight line", "Lower chest to floor", "Drive through palms", "Breathe out on push up"],
          "modifications": {
            "beginner": "Knee push-ups or wall push-ups, focus on form over reps",
            "intermediate": "Standard push-ups, aim for full range of motion",
            "advanced": "Diamond push-ups, decline push-ups, or add weight/resistance"
          },
          "muscleTargets": ["chest", "shoulders", "triceps", "core"]
        }
      ]
    }
  ],
  "overview": {
    "splitType": "Push/Pull/Legs (PPL)",
    "description": "This evidence-based Push/Pull/Legs split is designed specifically for your ${surveyData.goal} goal. It's the gold standard used by elite bodybuilders and strength athletes because it maximizes muscle protein synthesis while allowing optimal recovery between sessions.",
    "whyThisSplit": "PPL split allows you to train each muscle group with high volume while providing 48-72 hours recovery (optimal for muscle protein synthesis). Research by Schoenfeld et al. shows this frequency maximizes hypertrophy and strength gains. Perfect for your ${workoutPrefs.fitnessExperience || 'intermediate'} experience level.",
    "expectedResults": ["Increased muscle mass and strength", "Improved body composition", "Better movement patterns", "Enhanced metabolic rate"]
  },
  "progressionTips": [
    "Week 1-2: Master form and establish movement patterns - focus on quality over quantity",
    "Week 3-4: Increase reps by 1-2 per set when you can complete all sets with perfect form",
    "Week 5-6: Add resistance (weight, bands) or progress to harder exercise variations",
    "Week 7: Deload week - reduce volume by 40% to allow supercompensation",
    "Always prioritize form over ego - perfect reps build perfect results"
  ],
  "safetyReminders": [
    "Dynamic warm-up is mandatory - prepares nervous system and reduces injury risk by 50%",
    "Stop immediately if you feel sharp pain (different from muscle fatigue)",
    "Maintain proper hydration - dehydration reduces performance by 10-15%",
    "Cool-down and stretching aid recovery and reduce next-day soreness",
    "Listen to your body - extra rest days are better than training through injury",
    "Progressive overload should be gradual - 2.5-10% increases per week maximum"
  ],
  "equipmentNeeded": ["Based on user preferences and exercise selection"]
}

CRITICAL REQUIREMENTS:
1. Create ALL 7 days (monday through sunday) - 5 training days + 2 rest days
2. Rest days: restDay: true, empty exercises array
3. Each training day: 4-5 exercises (complete workout structure)
4. Keep descriptions motivating and include form guidance and weight selection tips
5. Include beginner/intermediate/advanced modifications
6. Focus on established exercises and proper form
7. Each workout description must mention: proper form emphasis, weight selection guidance (2-3 reps in reserve), and movement control
8. CALORIE ESTIMATION: Provide realistic calorie burn estimates (typically 200-400 calories for 30-60min workouts) based on workout intensity and duration

Generate the complete 7-day plan now with expert-level detail and motivating descriptions:

CRITICAL: Return PURE JSON only. No markdown, no text before/after. Must start with { and end with }.`;
};