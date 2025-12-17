import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { createWorkoutProfilePrompt } from '@/lib/ai/prompts/profile-generation';
import { SurveyResponse } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    console.log('[Workout Profile API] Starting workout profile generation');

    const body = await request.json();
    const surveyData: SurveyResponse = body;

    // Validate required fields
    if (!surveyData.goal || !surveyData.firstName) {
      return NextResponse.json(
        { error: 'Missing required survey data for profile generation' },
        { status: 400 }
      );
    }

    // Check for existing workout profile for this survey
    const existingProfile = await prisma.workoutProfile.findFirst({
      where: { surveyId: body.surveyId || 'temp' },
      orderBy: { createdAt: 'desc' }
    });

    if (existingProfile && !body.forceRegenerate) {
      console.log('[Workout Profile API] Returning existing profile');
      return NextResponse.json({
        success: true,
        profile: existingProfile.profileContent,
        profileId: existingProfile.id,
        isApproved: existingProfile.isApproved,
        userEdits: existingProfile.userEdits
      });
    }

    // Generate profile using GPT-4
    console.log('[Workout Profile API] Generating new workout profile with AI');
    const profilePrompt = createWorkoutProfilePrompt(surveyData);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GPT_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert fitness trainer creating personalized, motivational workout profiles for health and fitness clients. Your responses should be encouraging, inspiring, and professionally informative.'
          },
          {
            role: 'user',
            content: profilePrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
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

    // Save profile to database
    console.log('[Workout Profile API] Saving workout profile to database');
    const workoutProfile = await prisma.workoutProfile.create({
      data: {
        userId: body.userId || null,
        surveyId: body.surveyId || 'temp',
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