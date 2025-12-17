# Claude Code Session: User Profile Confirmation System

## PROJECT CONTEXT
You're working on a health/fitness app with 34 TypeScript files. The app has a survey system that collects user health/fitness data, then generates meal plans and workout routines.

## CURRENT WORKFLOW ISSUE
Right now: Survey → Direct generation (slow, no user confirmation)
GOAL: Survey → Profile Confirmation Screens → Parallel Generation

## TASK: Add User Profile Confirmation System

### IMPLEMENTATION REQUIREMENTS

**1. CREATE TWO PROFILE GENERATION ENDPOINTS:**
- `/api/ai/profiles/food` - Generate conversational food/nutrition profile
- `/api/ai/profiles/workout` - Generate conversational workout/fitness profile

**2. MODIFY SURVEY FLOW:**
- After survey step 5 completion → trigger BOTH profile generations in parallel
- Show profile confirmation screens as "filler" while actual generation happens in background
- User can approve/edit profiles before final generation

**3. PROFILE SCREEN SPECIFICATIONS:**

**Food Profile Screen:**
- Conversational, friendly tone ("Here's what we learned about your nutrition goals...")
- Summarize health goals, dietary preferences, meal preferences
- Show our planned approach ("We'll focus on...")
- Include budget considerations and restaurant vs home cooking balance
- Editable sections with approve/modify options

**Workout Profile Screen:**
- Conversational tone ("Based on your fitness journey...")
- Summarize fitness goals, activity level, equipment access
- Show planned workout approach and methodology
- Include progression timeline and expected results
- Editable sections with approve/modify options

### PROMPTS NEEDED (Add to `/src/lib/ai/prompts/`)

**Create new file: `profile-generation.ts`**

```typescript
// User Food Profile Generation Prompt
export const createFoodProfilePrompt = (surveyData: SurveyResponse): string => {
  return `You are a friendly, expert nutritionist creating a personalized food profile summary. Write in a warm, conversational tone as if speaking directly to the user.

SURVEY DATA:
${JSON.stringify(surveyData, null, 2)}

TASK: Create a friendly, conversational profile that:
1. Acknowledges their specific health goal (${surveyData.goal})
2. Summarizes their dietary preferences and restrictions
3. Explains our planned nutrition approach
4. Discusses their budget and restaurant/home cooking balance
5. Sets realistic expectations for their journey

TONE: Warm, encouraging, expert but approachable
LENGTH: 150-250 words
FORMAT: Write in 2nd person ("you") like a personal nutritionist

Include sections:
- Your Goals & Why They Matter
- Your Food Preferences
- Our Nutrition Strategy
- What to Expect

Return ONLY the conversational text - no JSON, no markdown.`;
};

// User Workout Profile Generation Prompt
export const createWorkoutProfilePrompt = (surveyData: SurveyResponse): string => {
  return `You are an encouraging, expert fitness trainer creating a personalized workout profile summary. Write in a motivational, conversational tone as if you're their personal trainer.

SURVEY DATA:
${JSON.stringify(surveyData, null, 2)}

TASK: Create an inspiring, conversational profile that:
1. Acknowledges their fitness goal (${surveyData.goal}) and current level
2. Summarizes their workout preferences and constraints
3. Explains our planned training approach and methodology
4. Discusses their timeline and equipment considerations
5. Sets realistic expectations and motivates them

TONE: Motivational, encouraging, expert but relatable
LENGTH: 150-250 words
FORMAT: Write in 2nd person ("you") like a personal trainer

Include sections:
- Your Fitness Goals & Journey
- Your Training Preferences
- Our Workout Strategy
- Your Path to Success

Return ONLY the conversational text - no JSON, no markdown.`;
};
```

### FRONTEND INTEGRATION POINTS

**Update Survey Flow:**
- After step 5: POST to both `/api/ai/profiles/food` AND `/api/ai/profiles/workout` in parallel
- Show loading state: "Creating your personalized profiles..."
- Display both profiles with approve/edit options
- Only after approval: trigger actual meal/workout generation

**New Profile Confirmation Pages:**
- `/dashboard/profile-confirmation` - Shows both profiles side by side
- Allow inline editing of key preferences
- "Looks Great!" vs "Let me adjust this" buttons
- Progress indicator showing "Profile creation → Generation → Results"

### TIMING & PERFORMANCE
- Profile generation: ~3-5 seconds (fast, lightweight prompts)
- Actual generation: 30-60 seconds (heavy, detailed generation)
- User experience: Feels faster because they're reviewing/confirming during wait time

### FILES TO MODIFY/CREATE

**New Files:**
- `src/app/api/ai/profiles/food/route.ts`
- `src/app/api/ai/profiles/workout/route.ts`
- `src/lib/ai/prompts/profile-generation.ts`
- `src/components/dashboard/ProfileConfirmation.tsx`

**Existing Files to Update:**
- Survey flow components (trigger profile generation after step 5)
- Dashboard routing (add profile confirmation step)
- `src/lib/ai/prompts/index.ts` (export new profile prompts)

### EXPECTED USER FLOW
1. Complete survey step 5 ✓
2. "Creating your profiles..." (3-5 seconds)
3. Review food profile + workout profile (user takes time to read/edit)
4. Click "Generate My Plan" → actual heavy generation starts in background
5. User feels engaged and informed, not just waiting

### SUCCESS CRITERIA
- ✅ Profiles generate quickly (<5 seconds total)
- ✅ Conversational, personalized tone that builds confidence
- ✅ Users understand our approach before generation
- ✅ Feels like consultation with expert, not just waiting for results
- ✅ Actual generation happens seamlessly after approval

This creates a much better UX where users feel consulted and informed rather than just waiting for black-box generation.

## PROMPT INTEGRATION
Use the centralized prompt system at `/src/lib/ai/prompts/` that's already established. Add these new profile generation functions to maintain consistency with the existing architecture.