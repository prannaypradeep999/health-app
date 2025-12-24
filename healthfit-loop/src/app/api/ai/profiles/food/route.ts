import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { createFoodProfilePrompt } from '@/lib/ai/prompts/profile-generation';

/**
 * Food Profile API Route
 * 
 * CHANGES MADE:
 * - Fixed POST to get surveyId from cookies (like workout profile)
 * - Fixed POST to fetch survey data from database (not from request body)
 * - Fixed surveyId reference when saving to database (uses surveyData.id)
 * - Now matches the pattern used by workout profile route
 * 
 * GET  - Retrieve existing food profile
 * POST - Generate new food profile
 * PUT  - Update/approve food profile
 */

export async function GET(request: NextRequest) {
  try {
    console.log('[Food Profile API] Checking for existing food profile');

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    // Clean cookie values
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null') ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null') ? undefined : surveyId;

    if (!cleanUserId && !sessionId && !cleanSurveyId) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 404 }
      );
    }

    // Find existing food profile
    const existingProfile = await prisma.foodProfile.findFirst({
      where: {
        OR: [
          cleanSurveyId ? { surveyId: cleanSurveyId } : {},
          cleanUserId ? { userId: cleanUserId } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!existingProfile) {
      return NextResponse.json(
        { error: 'No existing food profile found' },
        { status: 404 }
      );
    }

    console.log('[Food Profile API] Found existing profile');
    return NextResponse.json({
      success: true,
      profile: existingProfile.profileContent,
      profileId: existingProfile.id,
      isApproved: existingProfile.isApproved,
      userEdits: existingProfile.userEdits
    });

  } catch (error) {
    console.error('[Food Profile API] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch food profile' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Food Profile API] Starting food profile generation');

    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionId = cookieStore.get('guest_session')?.value;
    const surveyId = cookieStore.get('survey_id')?.value;

    // Clean cookie values
    const cleanUserId = (!userId || userId === 'undefined' || userId === 'null') ? undefined : userId;
    const cleanSurveyId = (!surveyId || surveyId === 'undefined' || surveyId === 'null') ? undefined : surveyId;
    const cleanSessionId = (!sessionId || sessionId === 'undefined' || sessionId === 'null') ? undefined : sessionId;

    // Check for existing food profile first
    const existingProfile = await prisma.foodProfile.findFirst({
      where: {
        OR: [
          cleanSurveyId ? { surveyId: cleanSurveyId } : {},
          cleanUserId ? { userId: cleanUserId } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingProfile) {
      console.log('[Food Profile API] Returning existing profile');
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

    // Validate required fields
    if (!surveyData.goal || !surveyData.firstName) {
      return NextResponse.json(
        { error: 'Missing required survey data for profile generation' },
        { status: 400 }
      );
    }

    // Generate profile using GPT
    console.log('[Food Profile API] Generating new food profile with AI');
    const profilePrompt = createFoodProfilePrompt(surveyData);

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
            content: 'You are an expert nutritionist creating personalized, conversational food profiles for health and fitness clients. Your responses should be warm, encouraging, and professionally informative.'
          },
          {
            role: 'user',
            content: profilePrompt
          }
        ],
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const profileContent = aiResponse.choices[0]?.message?.content;

    if (!profileContent) {
      throw new Error('No profile content generated from AI');
    }

    // Save profile to database using actual survey ID
    console.log('[Food Profile API] Saving food profile to database');
    const foodProfile = await prisma.foodProfile.create({
      data: {
        userId: cleanUserId || null,
        surveyId: surveyData.id,  // FIXED: Use actual survey ID
        profileContent: profileContent.trim(),
        isApproved: false,
        userEdits: null
      }
    });

    console.log('[Food Profile API] Food profile generated successfully');
    return NextResponse.json({
      success: true,
      profile: profileContent.trim(),
      profileId: foodProfile.id,
      isApproved: false
    });

  } catch (error) {
    console.error('[Food Profile API] Error generating food profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate food profile'
      },
      { status: 500 }
    );
  }
}

// PUT endpoint for updating profile (user edits/approval)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { profileId, userEdits, isApproved } = body;

    if (!profileId) {
      return NextResponse.json(
        { error: 'Profile ID is required for updates' },
        { status: 400 }
      );
    }

    console.log(`[Food Profile API] Updating profile ${profileId}`);
    const updatedProfile = await prisma.foodProfile.update({
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
    console.error('[Food Profile API] Error updating food profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update food profile'
      },
      { status: 500 }
    );
  }
}