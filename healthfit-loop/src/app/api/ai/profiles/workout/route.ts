import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Workout Profile API Route
 * 
 * This generates and manages the TEXT-BASED fitness profile/strategy,
 * NOT the full workout plan with exercises.
 * 
 * Uses the WorkoutProfile Prisma model (same pattern as FoodProfile)
 * 
 * GET  - Retrieve existing workout profile
 * POST - Generate new workout profile
 * PUT  - Update/approve workout profile
 */

// GET - Retrieve existing workout profile
export async function GET(req: NextRequest) {
  try {
    console.log('[Workout Profile API] Checking for existing workout profile');

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    if (!userId && !sessionId && !surveyId) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 404 }
      );
    }

    // Find existing workout profile
    const existingProfile = await prisma.workoutProfile.findFirst({
      where: {
        OR: [
          { surveyId: surveyId },
          { userId: userId }
        ].filter(condition => Object.values(condition)[0] !== undefined)
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!existingProfile) {
      return NextResponse.json(
        { error: 'No existing workout profile found' },
        { status: 404 }
      );
    }

    console.log('[Workout Profile API] Found existing profile');
    return NextResponse.json({
      success: true,
      profile: existingProfile.profileContent,
      profileId: existingProfile.id,
      isApproved: existingProfile.isApproved,
      userEdits: existingProfile.userEdits
    });

  } catch (error) {
    console.error('[Workout Profile API] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout profile' },
      { status: 500 }
    );
  }
}

// POST - Generate new workout profile
export async function POST(req: NextRequest) {
  try {
    console.log('[Workout Profile API] Starting workout profile generation');

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    // Clean cookie values
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null') ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null') ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null') ? undefined : sessionId;

    // Check for existing workout profile first
    const existingProfile = await prisma.workoutProfile.findFirst({
      where: {
        OR: [
          cleanSurveyId ? { surveyId: cleanSurveyId } : {},
          cleanUserId ? { userId: cleanUserId } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingProfile) {
      console.log('[Workout Profile API] Returning existing profile');
      return NextResponse.json({
        success: true,
        profile: existingProfile.profileContent,
        profileId: existingProfile.id,
        isApproved: existingProfile.isApproved,
        userEdits: existingProfile.userEdits
      });
    }

    // Find the survey to get user data for profile generation
    let surveyData = null;
    if (cleanUserId) {
      const user = await prisma.user.findUnique({
        where: { id: cleanUserId },
        include: { activeSurvey: true }
      });
      surveyData = user?.activeSurvey;
    }
    if (!surveyData && cleanSurveyId) {
      surveyData = await prisma.surveyResponse.findUnique({
        where: { id: cleanSurveyId }
      });
    }
    if (!surveyData && cleanSessionId) {
      surveyData = await prisma.surveyResponse.findFirst({
        where: { sessionId: cleanSessionId }
      });
    }

    if (!surveyData) {
      return NextResponse.json({ error: 'Survey data required' }, { status: 400 });
    }

    // Generate profile using GPT
    console.log('[Workout Profile API] Generating new workout profile with AI');
    const profileContent = await generateWorkoutProfile(surveyData);

    // Save profile to database
    console.log('[Workout Profile API] Saving workout profile to database');
    const workoutProfile = await prisma.workoutProfile.create({
      data: {
        userId: cleanUserId || null,
        surveyId: surveyData.id,
        profileContent: profileContent.trim(),
        isApproved: false,
        userEdits: null
      }
    });

    console.log('[Workout Profile API] Workout profile generated successfully');
    return NextResponse.json({
      success: true,
      profile: profileContent.trim(),
      profileId: workoutProfile.id,
      isApproved: false
    });

  } catch (error) {
    console.error('[Workout Profile API] Error generating workout profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate workout profile'
      },
      { status: 500 }
    );
  }
}

// PUT - Update/approve workout profile
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { profileId, userEdits, isApproved } = body;

    if (!profileId) {
      return NextResponse.json(
        { error: 'Profile ID is required for updates' },
        { status: 400 }
      );
    }

    console.log(`[Workout Profile API] Updating profile ${profileId}`);
    const updatedProfile = await prisma.workoutProfile.update({
      where: { id: profileId },
      data: {
        userEdits: userEdits || null,
        isApproved: isApproved ?? false,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      profile: updatedProfile
    });

  } catch (error) {
    console.error('[Workout Profile API] Error updating workout profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update workout profile'
      },
      { status: 500 }
    );
  }
}

// Generate workout profile text using GPT
async function generateWorkoutProfile(surveyData: any): Promise<string> {
  const workoutPrefs = surveyData.workoutPreferencesJson || {};
  
  const prompt = `Create a personalized, motivating fitness profile for this user. Write in a friendly, coach-like tone directly addressing them by name.

USER PROFILE:
- Name: ${surveyData.firstName} ${surveyData.lastName}
- Age: ${surveyData.age}
- Goal: ${surveyData.goal?.replace('_', ' ').toLowerCase()}
- Activity Level: ${surveyData.activityLevel?.replace('_', ' ').toLowerCase()}
- Sports Interests: ${surveyData.sportsInterests || 'None specified'}
- Fitness Timeline: ${surveyData.fitnessTimeline || 'Not specified'}
- Monthly Fitness Budget: $${surveyData.monthlyFitnessBudget || 50}

WORKOUT PREFERENCES:
- Preferred Duration: ${workoutPrefs.preferredDuration || 45} minutes
- Available Days: ${workoutPrefs.availableDays?.join(', ') || 'Flexible'}
- Workout Types: ${workoutPrefs.workoutTypes?.join(', ') || 'Various'}
- Gym Access: ${workoutPrefs.gymAccess?.replace('_', ' ') || 'No gym'}
- Experience Level: ${workoutPrefs.fitnessExperience || 'Intermediate'}
- Injury Considerations: ${workoutPrefs.injuryConsiderations?.join(', ') || 'None'}

Write a comprehensive fitness profile (300-400 words) that includes:
1. A personalized greeting
2. Training philosophy tailored to their goal
3. Workout strategy overview
4. How their sports interests will be incorporated
5. Progression approach
6. Motivation and accountability tips
7. How their budget will be optimized

Make it feel personal, specific to their situation, and motivating. Use their name naturally throughout.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GPT_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a friendly, knowledgeable fitness coach creating personalized training profiles. Write in a warm, motivating tone.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`GPT API error: ${response.status}`);
  }

  const completion = await response.json();
  return completion.choices[0].message.content;
}