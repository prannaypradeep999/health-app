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
1. TRAINING PHILOSOPHY: Based on their goal (${surveyData.primaryGoal || surveyData.goal}) and fitness level (${surveyData.fitnessLevel || 'intermediate'})
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
- Name: ${surveyData.firstName || 'User'}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Height: ${surveyData.height} inches, Weight: ${surveyData.weight} lbs
- Primary Goal: ${surveyData.primaryGoal || surveyData.goal}
- Health Focus: ${surveyData.healthFocus || 'general'}
- Maintain Focus: ${surveyData.maintainFocus || 'Not specified'}
- Current Fitness Level: ${surveyData.fitnessLevel || workoutPrefs.fitnessExperience || 'intermediate'}
- Activity Level: ${surveyData.activityLevel}
- Monthly Fitness Budget: ${surveyData.monthlyFitnessBudget || 50}

WORKOUT PREFERENCES (CRITICAL - MUST FOLLOW):
- Session Duration: ${workoutPrefs.preferredDuration || 45} minutes MAX
- Available Days: ${workoutPrefs.availableDays?.join(', ') || 'flexible'} (${workoutPrefs.availableDays?.length || 5} days per week)
- Gym Access: ${workoutPrefs.gymAccess || 'no_gym'}
- Preferred Workout Types: ${workoutPrefs.workoutTypes?.join(', ') || 'varied'}

⚠️ EQUIPMENT CONSTRAINTS (STRICTLY ENFORCE):
${(() => {
  const gymAccess = workoutPrefs.gymAccess || 'no_gym';
  if (gymAccess === 'no_gym') {
    return `- USER HAS NO GYM ACCESS - Use ONLY bodyweight exercises, resistance bands, or exercises requiring no equipment
- DO NOT include: barbell exercises, cable machines, leg press, lat pulldown, or any gym-specific equipment
- ALLOWED: Push-ups, squats, lunges, planks, burpees, mountain climbers, dips (using chair), pull-ups (if they have a bar)`;
  } else if (gymAccess === 'calisthenics') {
    return `- USER PREFERS CALISTHENICS - Focus on bodyweight progressions
- Prioritize: Pull-ups, dips, muscle-ups progressions, handstands, L-sits, pistol squats
- Minimize equipment usage - body mastery is the goal`;
  } else if (gymAccess === 'free_weights') {
    return `- USER HAS FREE WEIGHTS ONLY (dumbbells, barbells, kettlebells)
- DO NOT include cable machines, leg press, or gym-specific machines
- ALLOWED: All dumbbell/barbell/kettlebell exercises, bodyweight exercises`;
  } else if (gymAccess === 'full_gym') {
    return `- USER HAS FULL GYM ACCESS - Can use all equipment
- Include variety: free weights, machines, cables, cardio equipment`;
  }
  return '- Standard home/gym hybrid exercises';
})()}

⚠️ INJURY CONSIDERATIONS (MUST AVOID):
${workoutPrefs.injuryConsiderations?.length > 0
  ? workoutPrefs.injuryConsiderations.map(injury => `- AVOID exercises that stress: ${injury}`).join('\n')
  : '- No injuries reported - full exercise selection available'}

🎯 PREFERRED ACTIVITIES (MUST INCLUDE 1-2x PER WEEK):
${surveyData.preferredActivities?.length > 0
  ? `The user ENJOYS these activities and wants them in their routine:
${surveyData.preferredActivities.map(activity => `- ${activity}`).join('\n')}
YOU MUST incorporate at least 1-2 sessions per week featuring these preferred activities.
For example, if they like "Sports (Basketball, Tennis, Soccer)", include sport-specific drills or a dedicated sports day.
If they like "Mind-Body (Yoga, Pilates)", include a yoga/stretching session.`
  : '- No specific activity preferences - create a balanced program'}

🏆 SPORTS INTERESTS (SPORT-SPECIFIC TRAINING):
${surveyData.sportsInterests
  ? `User is interested in: ${surveyData.sportsInterests}
Include sport-specific training elements:
- Basketball → lateral agility drills, jump training, core stability
- Tennis → rotational power, lateral movement, shoulder stability
- Soccer → endurance, leg power, agility
- Running → progressive cardio, leg strength, mobility
- Swimming → shoulder mobility, core, cardio endurance
- Golf → rotational flexibility, core strength, balance`
  : '- No specific sports - general fitness focus'}

📝 USER'S ADDITIONAL NOTES (IMPORTANT - READ CAREFULLY):
${surveyData.additionalGoalsNotes
  ? `"${surveyData.additionalGoalsNotes}"

Parse this for: specific injuries, time constraints, equipment limitations, or special requests.
Adjust the workout plan accordingly.`
  : '- No additional notes provided'}

FITNESS TIMELINE EXPECTATION: ${surveyData.fitnessTimeline || 'no specific timeline'}

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

${(() => {
  // Goal-specific workout guidance
  function getWorkoutGoalGuidance(surveyData, workoutPrefs) {
    const { primaryGoal, fitnessLevel, healthFocus, maintainFocus } = surveyData;

    if (primaryGoal === 'lose_weight') {
      return `WEIGHT LOSS FOCUS: Include HIIT elements, higher rep ranges, shorter rest periods.
              Emphasize compound movements for maximum calorie burn.
              Add optional cardio finishers to workouts.`;
    }

    if (primaryGoal === 'build_muscle' && fitnessLevel) {
      const levelGuide = {
        'beginner': 'BEGINNER: Full body 3x/week, focus on form, lighter weights, 2-3 sets per exercise.',
        'intermediate': 'INTERMEDIATE: Upper/Lower or PPL split, progressive overload, 3-4 sets.',
        'advanced': 'ADVANCED: Advanced splits, periodization, intensity techniques, 4-5 sets.'
      };
      return levelGuide[fitnessLevel] || '';
    }

    if (primaryGoal === 'get_healthier' && healthFocus) {
      const healthGuide = {
        'energy': 'ENERGY FOCUS: Morning workouts preferred, mix of cardio and strength.',
        'digestion': 'DIGESTION FOCUS: Include core work, walking, yoga elements. Avoid exercising right after meals.',
        'mental_clarity': 'MENTAL CLARITY: Include mind-body elements, outdoor options when possible.',
        'bloodwork': 'BLOODWORK FOCUS: Emphasize cardiovascular health, moderate intensity steady-state cardio.',
        'general': 'GENERAL WELLNESS: Balanced approach with strength, cardio, and flexibility.'
      };
      return healthGuide[healthFocus] || '';
    }

    if (primaryGoal === 'maintain') {
      let maintainGuide = 'MAINTENANCE FOCUS: Emphasize consistency and enjoyment over intensity. Mix of strength training and activities you enjoy. Focus on movement quality and habit formation.';

      if (maintainFocus) {
        const focusGuidance: Record<string, string> = {
          'consistency': `

USER WANTS CONSISTENCY: Design a highly repeatable routine.
- Use the same core exercises each week (builds mastery and habit)
- 3-4 day split that fits their schedule reliably
- Moderate intensity (RPE 6-7) to avoid burnout
- Same workout times each week when possible
- Simple progressions (add 1 rep or small weight increases)
- Minimal equipment changes between exercises
- Include "minimum effective dose" alternatives for busy days`,

          'recomp': `

USER WANTS BODY RECOMPOSITION: Build muscle while staying lean.
- Higher training volume (4-5 days if possible)
- Compound lifts with progressive overload emphasis
- Include both strength (3-6 reps) and hypertrophy (8-12 reps) rep ranges
- Strategic cardio: 2-3 HIIT or LISS sessions for fat oxidation
- Focus on muscle groups user wants to develop
- Track lifts to ensure progressive overload
- Emphasize time under tension for hypertrophy`,

          'habits': `

USER WANTS TO BUILD LASTING HABITS: Focus on habit formation.
- Start with achievable frequency (3 days) before adding more
- Suggest habit stacking: "After [morning coffee], I will [do 10 min warmup]"
- Same time each day to build automatic behavior
- Celebrate small wins in workout descriptions
- Include "2-minute rule" mini-workouts for tough days
- Build identity: "You're becoming someone who exercises regularly"
- Remove friction: prep workout clothes night before`,

          'intuitive': `

USER PREFERS INTUITIVE TRAINING: Flexible, body-aware approach.
- RPE-based intensity (no strict percentages)
- Offer exercise alternatives for each movement pattern
- Include "listen to your body" cues in descriptions
- Autoregulation: adjust volume based on daily energy
- No rigid structure - suggest movement categories not exact exercises
- Include mobility/recovery as valid workout options
- Emphasize enjoyment and sustainability over optimization`
        };

        maintainGuide += focusGuidance[maintainFocus] || '';
      }

      return maintainGuide;
    }

    return '';
  }

  const guidance = getWorkoutGoalGuidance(surveyData, workoutPrefs);
  return guidance ? `PERSONALIZED WORKOUT GUIDANCE:
${guidance}

` : '';
})()}PREFERRED ACTIVITIES INTEGRATION:
${(() => {
  const activities = surveyData.preferredActivities || [];
  const sports = surveyData.sportsInterests || '';

  if (activities.length === 0 && !sports) return '';

  let activityPlan = `
MANDATORY - INTEGRATE USER'S PREFERRED ACTIVITIES:
The user specifically chose these activities because they ENJOY them. You MUST include them:

`;

  // Sports interests
  if (sports) {
    activityPlan += `SPORTS: ${sports}
- Include 1-2 dedicated sports-specific training days OR integrate sport drills into existing days
- For ${sports.split(',')[0]?.trim() || 'their sport'}:
  * Include agility drills, sport-specific movements, and conditioning
  * Make one day's description reference how the workout helps their sport
  * Example: "Today's lateral work directly translates to better court movement in basketball!"

`;
  }

  activities.forEach(activity => {
    if (activity.includes('Cardio') || activity.includes('Running') || activity.includes('Cycling')) {
      activityPlan += `CARDIO LOVER: Include 2-3 dedicated cardio sessions:
  - One steady-state cardio day (30-45 min run, bike, or swim)
  - One HIIT day (sprints, intervals, or circuit training)
  - Can combine cardio with strength on some days (finishers)
  - Make cardio days feel like a reward, not a punishment!

`;
    }
    if (activity.includes('Mind-Body') || activity.includes('Yoga') || activity.includes('Pilates')) {
      activityPlan += `MIND-BODY: Include 1 dedicated yoga/mobility day:
  - Full 30-45 min yoga flow or stretching session
  - NOT just "active recovery" - a real structured session
  - Include specific poses/stretches, not just "do yoga"
  - Great for rest days - transforms rest into purposeful practice

`;
    }
    if (activity.includes('Sports')) {
      activityPlan += `SPORTS ENTHUSIAST: Include sport-specific training:
  - 1 day focused on athletic performance (agility, power, speed)
  - Include drills like ladder work, cone drills, plyometrics
  - Make it FUN - these should feel like practice, not punishment

`;
    }
    if (activity.includes('Outdoor')) {
      activityPlan += `OUTDOOR LOVER: Suggest outdoor alternatives:
  - Note when exercises can be done outside
  - Include hiking, trail running, or outdoor circuits as options
  - One day could be "Outdoor Adventure Day" with suggested activities

`;
    }
    if (activity.includes('Swimming')) {
      activityPlan += `SWIMMER: Include swimming options:
  - 1-2 days can be swim workouts (laps, drills, water aerobics)
  - Great for active recovery and cardio
  - Specify stroke types and distances when suggesting swim workouts

`;
    }
    if (activity.includes('Martial Arts') || activity.includes('Combat') || activity.includes('Boxing')) {
      activityPlan += `COMBAT SPORTS: Include striking/martial arts elements:
  - Heavy bag work simulations (shadowboxing combinations)
  - Core power and rotational exercises
  - Agility and footwork drills
  - One dedicated "Combat Conditioning" day if possible

`;
    }
  });

  return activityPlan;
})()}

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
      "description": "Today's push workout targets your chest, shoulders, and triceps. Focus on controlled movements and proper breathing. Choose weights that challenge you while maintaining perfect form throughout all sets.",
      "warmup": [
        {
          "name": "Arm Circles",
          "duration": "30 seconds each direction",
          "instructions": "Stand tall, extend arms to sides, make small circles gradually increasing to larger circles"
        },
        {
          "name": "Wall Push-ups",
          "duration": "10 reps",
          "instructions": "Light warmup push-ups against a wall to activate chest and shoulders"
        },
        {
          "name": "Shoulder Rolls",
          "duration": "30 seconds",
          "instructions": "Roll shoulders forward then backward to loosen the joints"
        }
      ],
      "exercises": [
        {
          "name": "Push-ups (or Bench Press)",
          "sets": 3,
          "reps": "8-12",
          "restTime": "90 seconds",
          "tempo": "2-1-2",
          "description": "The foundation of upper body pushing strength. Builds chest, shoulders, and triceps while engaging your core.",
          "instructions": "Start in plank position with hands slightly wider than shoulders. Keep your body in a straight line from head to heels. Lower your chest toward the floor by bending your elbows at a 45-degree angle. Push back up explosively while keeping your core tight.",
          "formTips": [
            "Keep your body in a perfectly straight line - no sagging hips or raised butt",
            "Lower until your chest nearly touches the floor for full range of motion",
            "Keep elbows at 45 degrees, not flared out to 90 degrees",
            "Engage your core throughout - imagine bracing for a punch"
          ],
          "commonMistakes": [
            "Letting hips sag or pike up",
            "Not going low enough (partial reps)",
            "Flaring elbows out to 90 degrees (stresses shoulders)",
            "Holding breath instead of breathing rhythmically"
          ],
          "breathingCue": "Inhale as you lower down, exhale forcefully as you push up",
          "weightGuidance": {
            "method": "bodyweight",
            "suggestion": "For bodyweight push-ups, focus on form first. If you can do 15+ with perfect form, progress to feet-elevated or add a weight plate on your back. If standard push-ups are too hard, start with knee or incline push-ups.",
            "rpeTarget": 7,
            "warmupSets": "Do 5-10 easy push-ups to warmup before your working sets"
          },
          "modifications": {
            "beginner": "Knee push-ups or incline push-ups (hands on bench/step). Focus on full range of motion before progressing.",
            "intermediate": "Standard push-ups with perfect form. Aim for slow, controlled reps.",
            "advanced": "Decline push-ups (feet elevated), diamond push-ups, or weighted push-ups with plate on back"
          },
          "muscleTargets": ["chest", "shoulders", "triceps", "core"]
        },
        {
          "name": "Incline Dumbbell Press",
          "sets": 3,
          "reps": "10-12",
          "restTime": "90 seconds",
          "description": "Targets the upper chest for a fuller, more defined look.",
          "instructions": "Set bench to 30-45 degree incline. Press dumbbells up and together.",
          "formTips": ["Keep shoulder blades squeezed together", "Don't let elbows flare past 45 degrees"],
          "breathingCue": "Exhale as you press up",
          "weightGuidance": {
            "method": "RPE",
            "suggestion": "Start with weights you can control for all 12 reps. Increase when you can do 15.",
            "rpeTarget": 7
          },
          "modifications": {
            "beginner": "Use lighter dumbbells or do incline push-ups on a bench",
            "intermediate": "Standard incline dumbbell press",
            "advanced": "Pause at bottom for 2 seconds each rep"
          },
          "muscleTargets": ["upper chest", "shoulders", "triceps"]
        },
        {
          "name": "Dumbbell Shoulder Press",
          "sets": 3,
          "reps": "10-12",
          "restTime": "90 seconds",
          "description": "Builds strong, defined shoulders that improve your overall upper body strength.",
          "instructions": "Press dumbbells straight up from shoulder height, then lower with control.",
          "formTips": ["Keep core tight", "Don't arch your back excessively"],
          "breathingCue": "Exhale as you press up, inhale as you lower",
          "weightGuidance": {
            "method": "RPE",
            "suggestion": "Start lighter than you think - shoulders fatigue quickly. Focus on form.",
            "rpeTarget": 7
          },
          "modifications": {
            "beginner": "Seated shoulder press for better stability",
            "intermediate": "Standing dumbbell shoulder press",
            "advanced": "Single-arm overhead press for core challenge"
          },
          "muscleTargets": ["shoulders", "triceps", "core"]
        },
        {
          "name": "Tricep Dips (or Bench Dips)",
          "sets": 3,
          "reps": "12-15",
          "restTime": "60 seconds",
          "description": "Sculpts the back of your arms for that strong, defined tricep look.",
          "instructions": "Lower body by bending elbows behind you, then press back up.",
          "formTips": ["Keep elbows close to body", "Lower until you feel a stretch"],
          "breathingCue": "Inhale down, exhale up",
          "weightGuidance": {
            "method": "bodyweight",
            "suggestion": "If too easy, elevate feet. If too hard, bend knees more.",
            "rpeTarget": 6
          },
          "modifications": {
            "beginner": "Assisted dips or bench dips with feet close to bench",
            "intermediate": "Standard bench dips",
            "advanced": "Feet elevated or add weight on lap"
          },
          "muscleTargets": ["triceps", "shoulders", "chest"]
        },
        {
          "name": "Lateral Raises",
          "sets": 3,
          "reps": "12-15",
          "restTime": "60 seconds",
          "description": "Creates that wide shoulder look and improves shoulder stability.",
          "instructions": "Raise dumbbells out to sides until arms are parallel to floor.",
          "formTips": ["Slight bend in elbows", "Lead with your pinkies"],
          "breathingCue": "Exhale as you raise, inhale as you lower",
          "weightGuidance": {
            "method": "RPE",
            "suggestion": "Use lighter weights - this exercise is about form and feeling the burn.",
            "rpeTarget": 6
          },
          "modifications": {
            "beginner": "Very light dumbbells or water bottles",
            "intermediate": "Standard lateral raises",
            "advanced": "Pause at the top for 2 seconds"
          },
          "muscleTargets": ["side delts", "shoulders"]
        },
        {
          "name": "Plank Hold",
          "sets": 3,
          "reps": "30-45 seconds",
          "restTime": "60 seconds",
          "description": "Builds rock-solid core strength that supports all your other lifts.",
          "instructions": "Hold plank position with perfect form - straight line from head to heels.",
          "formTips": ["Engage core like bracing for a punch", "Don't let hips sag or pike up"],
          "breathingCue": "Breathe normally - don't hold your breath",
          "weightGuidance": {
            "method": "time",
            "suggestion": "Focus on perfect form over duration. Better to hold 20 seconds perfectly than 60 seconds with poor form.",
            "rpeTarget": 7
          },
          "modifications": {
            "beginner": "Knee plank or incline plank (hands on bench)",
            "intermediate": "Standard plank hold",
            "advanced": "Single-arm plank or plank with arm/leg lifts"
          },
          "muscleTargets": ["core", "shoulders", "glutes"]
        }
      ],
      "cooldown": [
        {
          "name": "Chest Doorway Stretch",
          "duration": "30 seconds each side",
          "instructions": "Place forearm on doorframe, lean forward gently until you feel a stretch in your chest"
        },
        {
          "name": "Tricep Stretch",
          "duration": "30 seconds each arm",
          "instructions": "Raise arm overhead, bend elbow, use other hand to gently press elbow back"
        },
        {
          "name": "Child's Pose",
          "duration": "60 seconds",
          "instructions": "Kneel, sit back on heels, reach arms forward on floor, relax and breathe deeply"
        }
      ]
    },
    {
      "day": "tuesday",
      "restDay": true,
      "focus": "Active Recovery & Mobility",
      "estimatedTime": "20-30 minutes",
      "estimatedCalories": 100,
      "targetMuscles": [],
      "description": "Your muscles grow during rest, not during workouts! Today is about giving your body what it needs to come back stronger. This isn't a 'skip day' - it's a strategic recovery session that's just as important as your heavy training days.",
      "exercises": [],
      "activeRecovery": {
        "suggestedActivity": "Yoga Flow Session",
        "duration": "25 minutes",
        "description": "A gentle yoga flow focusing on the muscle groups you worked this week. This will improve your flexibility, reduce soreness, and help you recover faster for your next training session.",
        "alternatives": [
          "20-minute gentle yoga or stretching routine (YouTube: 'Yoga With Adriene' has great options)",
          "30-minute easy walk in nature - keep it conversational pace",
          "15-minute foam rolling session focusing on legs and back",
          "Light swimming - easy laps, focus on smooth strokes",
          "Casual bike ride around the neighborhood (not for speed!)"
        ]
      }
    }
  ],
  "overview": {
    "splitType": "Push/Pull/Legs (PPL)",
    "description": "This science-based program is designed for your specific goals and experience level.",
    "whyThisSplit": "Explanation of why this split works for the user's goals",
    "expectedResults": ["Result 1", "Result 2", "Result 3"]
  },
  "progressionTips": [
    "Week 1-2: Focus on learning proper form. Use lighter weights and master the movement patterns.",
    "Week 3-4: Gradually increase weight when you can complete all sets with 2+ reps in reserve.",
    "Week 5-6: Push closer to failure (1 rep in reserve) on your last set of each exercise.",
    "Every 4-6 weeks: Take a deload week - reduce weight by 40% to allow full recovery."
  ],
  "safetyReminders": [
    "Always warm up before lifting - 5-10 minutes of light cardio and dynamic stretches",
    "If you feel sharp pain (not muscle burn), stop immediately",
    "Stay hydrated - drink water between sets",
    "Don't skip rest days - muscles grow during recovery, not during workouts"
  ],
  "equipmentNeeded": ["Based on user's gymAccess selection"]
}

CRITICAL REQUIREMENTS:

EXERCISE COUNT REQUIREMENTS:
- Each TRAINING DAY must have 3-7 exercises based on these factors:
  * Time available: Short workouts (20-30min) = 3-4 exercises, Longer workouts (45min+) = 5-7 exercises
  * User goals: Muscle building/strength = more exercises (5-7), General fitness = fewer (3-5)
  * Experience level: Beginners = fewer exercises (3-4), Advanced = more exercises (5-7)
  * Workout type: Full body = more exercises (5-7), Single body part = fewer (3-5)
- Structure should be: compound movements first, then isolation, always end with core
- For cardio/sports days: 4-6 drills or activities depending on session length
- Example structure for a training day:
  * Exercise 1: Main compound lift (e.g., Squats)
  * Exercise 2: Secondary compound (e.g., Romanian Deadlifts)
  * Exercise 3: Compound accessory (e.g., Lunges)
  * Exercise 4: Isolation (e.g., Leg Curls)
  * Exercise 5: Isolation (e.g., Calf Raises)
  * Exercise 6: Core work (e.g., Planks)

DAY DESCRIPTIONS (CRITICAL - MAKE ENGAGING):
Each day's "description" field must be:
- 2-3 sentences that get the user EXCITED about the workout
- Personal and motivating - use "you" and "your"
- Reference their specific goals (${surveyData.primaryGoal || surveyData.goal})
- Include a fun fact or benefit of that day's focus

BAD example: "Today's workout focuses on legs."
GOOD example: "Today we're building powerful legs that will improve everything from your daily walks to your weekend hikes! Your quads, hamstrings, and glutes are about to get stronger - this is where real functional fitness is built. Let's make those legs work!"

BAD example: "Upper body push day."
GOOD example: "Time to sculpt your chest, shoulders, and arms! Push movements are the foundation of upper body strength - whether you're pushing a door open or crushing a workout, today's session builds real-world power. You've got this!"

1. Create ALL 7 days (monday through sunday) based on user's availableDays
2. For REST DAYS:
   - Set restDay: true
   - Set exercises: [] (empty array)
   - MUST include activeRecovery object with personalized suggestions based on user's preferredActivities:
     * If user likes "Mind-Body (Yoga, Pilates)" → suggest yoga or stretching
     * If user likes "Outdoor Activities" → suggest hiking or nature walks
     * If user likes "Low Impact (Walking)" → suggest easy walks
     * If user likes "Swimming" → suggest easy pool session
     * Always provide 3-5 alternatives so user has options
3. For TRAINING DAYS:
   - Include warmup array (3-4 exercises specific to that day's focus)
   - Each exercise MUST have weightGuidance object with practical advice
   - Each exercise MUST have breathingCue
   - Each exercise SHOULD have commonMistakes (2-4 items)
   - Include cooldown array (3-4 stretches for muscles worked)
4. Exercise weightGuidance should be PRACTICAL and SPECIFIC:
   - For beginners: "Start with X-Y lbs and focus on form"
   - For bodyweight: "If too easy, try [harder variation]. If too hard, try [easier variation]"
   - For gym exercises: "Start with a weight you can lift for 12 reps, then increase when you can do 15"
   - Include RPE target (6-8 for most exercises, 8-9 for advanced)
5. Tempo format is "eccentric-pause-concentric" (e.g., "3-1-2" = 3 sec down, 1 sec pause, 2 sec up)
6. EXERCISE VARIETY per training day:
   - Minimum 3 exercises, maximum 7 exercises per training day (based on time/goals/experience)
   - Mix of compound (multi-joint) and isolation (single-joint) movements
   - Include at least one core/stability exercise per training day
   - For users who like sports/cardio: Include conditioning finishers (2-3 min AMRAP, etc.)
7. DAY DESCRIPTIONS must be:
   - Motivating and energetic (not boring/clinical)
   - Personal (use "you" and "your")
   - Reference the user's goals when relevant
   - 2-3 sentences minimum

Generate the complete 7-day plan now with expert-level detail and motivating descriptions:

CRITICAL: Return PURE JSON only. No markdown, no text before/after. Must start with { and end with }.`;
};