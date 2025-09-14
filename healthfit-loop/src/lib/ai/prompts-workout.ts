// Workout planning prompts with safety-first approach
import { SurveyResponse } from '@prisma/client';

export interface WorkoutUserContext {
  surveyData: SurveyResponse;
  weekOf: string;
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
  availableDays: number;
  preferredDuration: number; // minutes
}

// Enhanced workout methodology selector
interface WorkoutMethodology {
  name: string;
  description: string;
  splitType: string;
  weeklyStructure: string[];
  restDays: number[];
  intensityProfile: string;
  targetAudience: string;
  scientificBasis: string;
}

const WORKOUT_METHODOLOGIES: { [key: string]: WorkoutMethodology } = {
  'push_pull_legs': {
    name: 'Push/Pull/Legs (PPL)',
    description: 'Classic bodybuilding split focusing on movement patterns',
    splitType: 'Push (Chest/Shoulders/Triceps), Pull (Back/Biceps), Legs (Quads/Glutes/Hamstrings/Calves)',
    weeklyStructure: ['push', 'pull', 'legs', 'push', 'pull', 'rest', 'active_recovery'],
    restDays: [5, 6], // Saturday and Sunday (0-indexed)
    intensityProfile: 'Moderate to high volume, progressive overload focus',
    targetAudience: 'Intermediate to advanced trainees, muscle gain primary',
    scientificBasis: 'Maximizes protein synthesis through targeted muscle group training with 48-72hr recovery'
  },
  'upper_lower': {
    name: 'Upper/Lower Split',
    description: 'Efficient split alternating upper and lower body training',
    splitType: 'Upper Body (Chest/Back/Shoulders/Arms), Lower Body (Legs/Glutes)',
    weeklyStructure: ['upper', 'lower', 'upper', 'lower', 'full_body', 'rest', 'active_recovery'],
    restDays: [5, 6],
    intensityProfile: 'High frequency, moderate volume per session',
    targetAudience: 'Beginner to advanced, excellent for strength and hypertrophy',
    scientificBasis: 'Higher training frequency (2x/week per muscle) optimizes muscle protein synthesis'
  },
  'full_body': {
    name: 'Full Body Circuit',
    description: 'Complete body workout targeting all major muscle groups',
    splitType: 'Full Body (All major muscle groups each session)',
    weeklyStructure: ['full_body', 'cardio', 'full_body', 'active_recovery', 'full_body', 'rest', 'rest'],
    restDays: [5, 6],
    intensityProfile: 'Moderate intensity, circuit-style training',
    targetAudience: 'Beginners, weight loss focus, time-constrained individuals',
    scientificBasis: 'High caloric expenditure, improves cardiovascular health while maintaining muscle mass'
  },
  'athletic_performance': {
    name: 'Athletic Performance',
    description: 'Sport-specific training emphasizing functional movement patterns',
    splitType: 'Power/Strength, Conditioning, Movement Quality, Sport-Specific, Recovery',
    weeklyStructure: ['power', 'conditioning', 'movement', 'strength', 'sport_specific', 'rest', 'active_recovery'],
    restDays: [5, 6],
    intensityProfile: 'Variable intensity, periodized approach',
    targetAudience: 'Athletes, advanced trainees, performance goals',
    scientificBasis: 'Periodization principles maximize athletic adaptations while preventing overtraining'
  }
};

export function buildWorkoutPlannerPrompt(userContext: WorkoutUserContext): string {
  const { surveyData, fitnessLevel, availableDays, preferredDuration } = userContext;
  
  // Select methodology based on user profile
  const methodology = selectMethodology(surveyData, fitnessLevel);
  
  const targetDuration = Math.min(preferredDuration, 60); // Cap at 60 minutes
  const repRange = getRepRange(surveyData.goal);
  const restTime = getRestTime(surveyData.goal);
  const estimatedCalories = calculateEstimatedCalories(surveyData.weight, preferredDuration, surveyData.goal);

// Helper functions for workout programming
function selectMethodology(surveyData: any, fitnessLevel: string): WorkoutMethodology {
  // Algorithm to select best methodology based on user data
  if (surveyData.goal === 'MUSCLE_GAIN' && (fitnessLevel === 'intermediate' || fitnessLevel === 'advanced')) {
    return WORKOUT_METHODOLOGIES.push_pull_legs;
  } else if (surveyData.goal === 'WEIGHT_LOSS' || fitnessLevel === 'beginner') {
    return WORKOUT_METHODOLOGIES.full_body;
  } else if (surveyData.goal === 'ENDURANCE' || surveyData.activityLevel === 'ATHLETE') {
    return WORKOUT_METHODOLOGIES.athletic_performance;
  } else {
    return WORKOUT_METHODOLOGIES.upper_lower; // Default balanced approach
  }
}

function getRepRange(goal: string): string {
  switch (goal) {
    case 'WEIGHT_LOSS': return '12-20';
    case 'MUSCLE_GAIN': return '6-12';
    case 'ENDURANCE': return '15-25';
    case 'STRENGTH': return '4-8';
    default: return '8-15';
  }
}

function getRestTime(goal: string): string {
  switch (goal) {
    case 'WEIGHT_LOSS': return '30-45 seconds';
    case 'MUSCLE_GAIN': return '60-90 seconds';
    case 'ENDURANCE': return '30-60 seconds';
    case 'STRENGTH': return '2-3 minutes';
    default: return '60 seconds';
  }
}

function calculateEstimatedCalories(weight: number, duration: number, goal: string): number {
  const baseCaloriesPerMin = weight * 0.1;
  const intensityMultiplier = goal === 'WEIGHT_LOSS' ? 1.4 : goal === 'MUSCLE_GAIN' ? 1.1 : 1.2;
  return Math.round(baseCaloriesPerMin * duration * intensityMultiplier);
}
  
  return `You are FYTR AI's expert fitness trainer. Generate a comprehensive 7-day workout plan following established training methodologies and scientific principles.

CRITICAL JSON REQUIREMENTS:
- Return ONLY valid JSON - no explanations, no markdown, no extra text
- Use double quotes for all strings
- Numbers must be actual numbers, not strings
- Response must start with {{ and end with }}

USER PROFILE:
- Name: ${surveyData.firstName} ${surveyData.lastName}
- Age: ${surveyData.age}, Sex: ${surveyData.sex}
- Goal: ${surveyData.goal.replace('_', ' ').toLowerCase()}
- Activity Level: ${surveyData.activityLevel} (${fitnessLevel})
- Location: ${surveyData.zipCode}

SELECTED TRAINING METHODOLOGY: ${methodology.name}
Scientific Basis: ${methodology.scientificBasis}
Split Type: ${methodology.splitType}
Target Audience: ${methodology.targetAudience}
Intensity Profile: ${methodology.intensityProfile}

WEEKLY STRUCTURE BASED ON ${methodology.name}:
${methodology.weeklyStructure.map((day, i) => `- ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}: ${day.replace('_', ' ').toUpperCase()}`).join('\n')}

SCIENTIFIC PROGRAMMING PRINCIPLES:

1. PROGRESSIVE OVERLOAD:
   - Week 1-2: Master form and movement patterns
   - Week 3-4: Increase volume (reps/sets) by 10-15%
   - Week 5-6: Increase intensity or add complexity
   - Deload week every 4th week for recovery

2. TRAINING PARAMETERS:
   - Rep Range: ${repRange} (optimized for ${surveyData.goal.replace('_', ' ').toLowerCase()})
   - Rest Between Sets: ${restTime}
   - Session Duration: ${targetDuration} minutes
   - Training Frequency: 5 active days, 2 rest/recovery days

3. EXERCISE SELECTION HIERARCHY:
   - Compound movements (70%): Squats, deadlifts, push-ups, pull-ups, rows
   - Isolation movements (20%): Targeted muscle groups
   - Stability/Mobility (10%): Core, balance, flexibility

4. SAFETY & MODIFICATIONS:
   - Age-appropriate intensity: ${surveyData.age > 50 ? 'Reduced impact, extended warm-up' : surveyData.age < 25 ? 'Higher intensity tolerance' : 'Standard progression'}
   - Equipment: Bodyweight focus with optional resistance bands/dumbbells
   - Form cues and modifications for all fitness levels

DAILY WORKOUT STRUCTURE (5 TRAINING DAYS):
Each training day must include:
- Dynamic Warm-up (8-10 minutes): Movement prep, activation
- Main Exercises (4-5 exercises): Based on daily focus
- Accessory Work (1-2 exercises): Support/isolation movements  
- Cool-down (5-7 minutes): Static stretching, mobility

REST/RECOVERY DAYS (2 DAYS):
- Saturday: Active recovery (light walking, yoga, stretching)
- Sunday: Complete rest or very light activity
- Focus on hydration, nutrition, sleep quality

EXERCISE DISTRIBUTION PER WORKOUT:
- 4-5 high-quality exercises per training day
- 3-4 sets per exercise (beginners: 2-3 sets)
- Proper rest intervals between exercises
- Progressive difficulty options for all levels

RESPONSE FORMAT - Return ONLY this JSON structure with ALL 7 DAYS:
{{
  "methodology": {{
    "name": "Push/Pull/Legs (PPL)",
    "description": "Classic bodybuilding split focusing on movement patterns",
    "scientificBasis": "Maximizes protein synthesis through targeted muscle group training with 48-72hr recovery",
    "whyChosen": "Selected based on your ${surveyData.goal.replace('_', ' ').toLowerCase()} goal and ${fitnessLevel} fitness level"
  }},
  "weeklyPlan": [
    {{
      "day": "monday",
      "restDay": false,
      "focus": "PUSH - Primary training day",
      "estimatedTime": "45 minutes",
      "targetMuscles": ["Based on daily focus from methodology"],
      "trainingRationale": "Explanation of why this training focus fits the selected methodology",
      "warmup": [
        {{
          "exercise": "Dynamic movement preparation",
          "duration": "2-3 minutes",
          "purpose": "Prepare specific muscle groups for today's focus"
        }},
        {{
          "exercise": "Activation exercises",
          "duration": "3-4 minutes", 
          "purpose": "Activate target muscles and improve movement quality"
        }},
        {{
          "exercise": "Movement-specific prep",
          "duration": "2-3 minutes", 
          "purpose": "Practice movement patterns at low intensity"
        }}
      ],
      "mainWorkout": [
        {{
          "exercise": "Compound Movement 1",
          "sets": 4,
          "reps": "${repRange}",
          "restBetweenSets": "${restTime}",
          "instructions": "Detailed step-by-step execution",
          "formCues": ["Key technique point 1", "Key technique point 2", "Key technique point 3"],
          "modifications": {{
            "beginner": "Easier variation with specific instructions",
            "intermediate": "Standard execution with progression cues", 
            "advanced": "Challenging variation or added complexity"
          }},
          "safetyNotes": "Specific safety considerations for this exercise",
          "muscleTargets": ["Primary muscles", "Secondary muscles"]
        }},
        {{
          "exercise": "Compound Movement 2",
          "sets": 4,
          "reps": "${repRange}",
          "restBetweenSets": "${restTime}",
          "instructions": "Detailed step-by-step execution",
          "formCues": ["Key technique point 1", "Key technique point 2", "Key technique point 3"],
          "modifications": {{
            "beginner": "Easier variation",
            "intermediate": "Standard execution", 
            "advanced": "Advanced variation"
          }},
          "safetyNotes": "Exercise-specific safety notes",
          "muscleTargets": ["Primary muscles", "Secondary muscles"]
        }},
        {{
          "exercise": "Accessory Movement 1",
          "sets": 3,
          "reps": "${repRange}",
          "restBetweenSets": "${restTime}",
          "instructions": "Detailed execution",
          "formCues": ["Form cue 1", "Form cue 2"],
          "modifications": {{
            "beginner": "Beginner option",
            "intermediate": "Standard option", 
            "advanced": "Advanced option"
          }},
          "safetyNotes": "Safety considerations",
          "muscleTargets": ["Target muscles"]
        }},
        {{
          "exercise": "Accessory Movement 2",
          "sets": 3,
          "reps": "${repRange}",
          "restBetweenSets": "${restTime}",
          "instructions": "Step-by-step instructions",
          "formCues": ["Important form points"],
          "modifications": {{
            "beginner": "Beginner variation",
            "intermediate": "Standard variation", 
            "advanced": "Advanced variation"
          }},
          "safetyNotes": "Safety notes",
          "muscleTargets": ["Target muscles"]
        }},
        {{
          "exercise": "Core/Stability Finisher",
          "sets": 2,
          "reps": "${repRange}",
          "restBetweenSets": "45 seconds",
          "instructions": "Core-focused movement",
          "formCues": ["Core engagement", "Breathing pattern"],
          "modifications": {{
            "beginner": "Basic core exercise",
            "intermediate": "Standard core challenge", 
            "advanced": "Advanced core stability"
          }},
          "safetyNotes": "Maintain neutral spine",
          "muscleTargets": ["Core", "Stabilizers"]
        }}
      ],
      "cooldown": [
        {{
          "exercise": "Target muscle stretches",
          "duration": "3-4 minutes",
          "instructions": "Static stretches for worked muscles"
        }},
        {{
          "exercise": "Full body relaxation",
          "duration": "2-3 minutes",
          "instructions": "Deep breathing and tension release"
        }}
      ]
    }},
    {{
      "day": "saturday", 
      "restDay": false,
      "focus": "ACTIVE RECOVERY - Light movement and mobility",
      "estimatedTime": "20-30 minutes",
      "targetMuscles": ["Full body mobility", "Recovery"],
      "trainingRationale": "Active recovery promotes blood flow and reduces muscle stiffness while allowing nervous system recovery",
      "warmup": [
        {{
          "exercise": "Gentle movement",
          "duration": "5 minutes",
          "purpose": "Increase circulation"
        }}
      ],
      "mainWorkout": [
        {{
          "exercise": "Light walking or easy bike ride",
          "sets": 1,
          "duration": "15-20 minutes",
          "intensity": "Very easy - should be able to hold conversation",
          "instructions": "Keep heart rate low, focus on movement quality",
          "formCues": ["Relaxed pace", "Deep breathing", "Enjoy the movement"],
          "modifications": {{
            "beginner": "10-15 minute walk",
            "intermediate": "20 minute easy activity", 
            "advanced": "25-30 minute easy activity"
          }},
          "safetyNotes": "Stay hydrated, stop if feeling fatigued",
          "muscleTargets": ["Cardiovascular system", "Light muscle activation"]
        }},
        {{
          "exercise": "Gentle yoga or stretching routine",
          "duration": "10-15 minutes",
          "instructions": "Focus on tight areas from the week",
          "formCues": ["Hold stretches 30+ seconds", "Breathe deeply", "Don't force positions"],
          "modifications": {{
            "beginner": "Basic stretches, shorter holds",
            "intermediate": "Standard yoga flow", 
            "advanced": "Deeper stretches, longer holds"
          }},
          "safetyNotes": "Never stretch into pain",
          "muscleTargets": ["Flexibility", "Mobility", "Relaxation"]
        }}
      ],
      "cooldown": [
        {{
          "exercise": "Meditation or relaxation",
          "duration": "5 minutes",
          "instructions": "Focus on recovery and mental restoration"
        }}
      ]
    }},
    {{
      "day": "sunday",
      "restDay": true,
      "focus": "COMPLETE REST - Recovery and preparation",
      "estimatedTime": "0 minutes structured exercise",
      "targetMuscles": ["Recovery", "Mental restoration"],
      "trainingRationale": "Complete rest is essential for muscle protein synthesis, nervous system recovery, and preventing overtraining",
      "warmup": [],
      "mainWorkout": [],
      "cooldown": [],
      "restDayActivities": [
        "Focus on quality sleep (8+ hours)",
        "Proper hydration and nutrition",
        "Light meal prep for the upcoming week",
        "Gentle walking if desired (under 20 minutes)",
        "Stress management and relaxation"
      ],
      "preparationTips": [
        "Plan next week's workouts",
        "Ensure equipment is ready",
        "Set realistic goals for the week",
        "Listen to your body's recovery needs"
      ]
    }}
  ],
  "weeklyNotes": "This ${methodology.name} program is scientifically designed for your ${surveyData.goal.toLowerCase().replace('_', ' ')} goal. The split allows optimal recovery while maximizing training adaptations. Start conservatively and focus on movement quality over intensity.",
  "progressionTips": [
    "Week 1-2: Master movement patterns and establish consistency",
    "Week 3-4: Increase volume (add reps/sets) by 10-15%", 
    "Week 5-6: Add intensity or exercise complexity",
    "Week 7: Deload week - reduce volume by 40% for recovery",
    "Always prioritize form over weight or speed"
  ],
  "safetyReminders": [
    "Stop immediately if you feel pain (different from muscle fatigue)",
    "Proper hydration before, during, and after workouts",
    "Dynamic warm-up is mandatory - prepares body for training",
    "Cool-down aids recovery and reduces next-day soreness",
    "Listen to your body - extra rest days are better than injury",
    ${surveyData.age > 40 ? '"Extended warm-ups and recovery periods due to age considerations"' : '"Progressive challenges to stimulate adaptation"'}
  ],
  "equipmentNeeded": [
    "Primary: Body weight only - no equipment required", 
    "Optional: Yoga mat for floor exercises and stretching",
    "Optional: Resistance bands for added challenge and progression",
    "Optional: Light dumbbells (5-25 lbs) for advanced progressions"
  ],
  "estimatedCaloriesBurn": ${estimatedCalories},
  "scientificReferences": [
    "Progressive overload principle based on research by Schoenfeld et al. (2017)",
    "Rest day importance supported by Kellmann & Beckmann (2018) recovery research",
    "${methodology.name} methodology validated in strength training literature",
    "Rep ranges optimized for ${surveyData.goal.replace('_', ' ').toLowerCase()} based on meta-analysis evidence"
  ]
}}

CRITICAL REQUIREMENTS:
1. Generate ALL 7 DAYS (monday through sunday) - 5 training days + 2 rest/recovery days
2. Each training day must have 4-5 exercises in mainWorkout array
3. Follow the ${methodology.name} methodology structure exactly
4. Provide exercise modifications for beginner/intermediate/advanced levels
5. Include scientific rationale for exercise selection and programming
6. Ensure proper rest and recovery integration
7. MANDATORY: ALL days must have "warmup", "mainWorkout", and "cooldown" arrays (empty arrays [] for rest days)
8. REST DAYS: Use empty arrays for warmup/mainWorkout/cooldown, include "restDayActivities" instead

Return ONLY the JSON object - no explanations or markdown formatting.`;
}

// Workout planning functions for LLM function calling
export const WORKOUT_PLANNING_FUNCTIONS = [
  {
    name: "create_strength_workout",
    description: "Create a strength-focused workout routine with proper progression",
    parameters: {
      type: "object",
      properties: {
        targetMuscles: {
          type: "array",
          items: { type: "string" },
          description: "Primary muscle groups to target"
        },
        exerciseCount: {
          type: "number",
          description: "Number of exercises in the workout"
        },
        sets: {
          type: "number",
          description: "Number of sets per exercise"
        },
        repRange: {
          type: "string", 
          description: "Rep range appropriate for goal (e.g., '8-12', '12-15')"
        },
        restTime: {
          type: "string",
          description: "Rest time between sets"
        },
        difficulty: {
          type: "string",
          enum: ["beginner", "intermediate", "advanced"],
          description: "Difficulty level for exercise selection"
        }
      },
      required: ["targetMuscles", "exerciseCount", "difficulty"]
    }
  },
  {
    name: "create_cardio_session",
    description: "Design a cardiovascular workout session",
    parameters: {
      type: "object", 
      properties: {
        type: {
          type: "string",
          enum: ["steady_state", "interval", "circuit"],
          description: "Type of cardio workout"
        },
        duration: {
          type: "number",
          description: "Total workout duration in minutes"
        },
        intensity: {
          type: "string",
          enum: ["low", "moderate", "high"],
          description: "Overall intensity level"
        },
        equipment: {
          type: "string",
          enum: ["none", "basic", "optional"],
          description: "Equipment requirements"
        }
      },
      required: ["type", "duration", "intensity"]
    }
  },
  {
    name: "create_flexibility_routine",
    description: "Generate a stretching and mobility routine",
    parameters: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["full_body", "upper_body", "lower_body", "core"],
          description: "Primary focus area for flexibility work"
        },
        duration: {
          type: "number",
          description: "Total routine duration in minutes"
        },
        intensity: {
          type: "string",
          enum: ["gentle", "moderate", "deep"],
          description: "Stretch intensity level"
        }
      },
      required: ["focus", "duration"]
    }
  }
];