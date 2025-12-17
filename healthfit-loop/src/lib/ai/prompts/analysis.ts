// Workout Analysis Prompts

export interface WorkoutAnalysisContext {
  activity: string;
  details: string;
}

export interface WorkoutAnalysisResult {
  calories: number;
  tips: string;
}

// Workout Analysis Prompt
export const createWorkoutAnalysisPrompt = (context: WorkoutAnalysisContext): string => {
  return `Analyze this workout quickly and return JSON with calories and tips:

Activity: ${context.activity}
Details: ${context.details}

Provide:
1. Realistic calorie estimate based on activity type, intensity keywords, and duration
2. Short encouraging tip/advice related to this specific workout

Look for duration indicators (45 min, 1 hour, etc.)
Look for intensity words (high, intense, easy, light, etc.)

Base calorie rates per minute:
- Run: 12 cal/min
- Bike: 9 cal/min
- Swim: 10 cal/min
- Class (fitness): 8 cal/min
- Yoga: 3 cal/min
- Other: 6 cal/min

Respond with ONLY this JSON format:
{"calories": 280, "tips": "Great high-intensity session! That heart rate boost will improve your cardiovascular fitness."}`;
};