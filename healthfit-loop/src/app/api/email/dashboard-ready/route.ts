import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { sendEmail, generateDashboardReadyEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const surveyId = cookieStore.get('survey_id')?.value;
    const guestSession = cookieStore.get('guest_session')?.value;
    const userId = cookieStore.get('user_id')?.value;

    // Must have survey_id to send dashboard email
    if (!surveyId) {
      return NextResponse.json({ error: 'No survey found' }, { status: 400 });
    }

    // Look up survey
    const survey = await prisma.surveyResponse.findUnique({
      where: { id: surveyId }
    });

    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    // Check if email already sent
    if (survey.dashboardEmailSent) {
      return NextResponse.json({
        success: true,
        message: 'Email already sent',
        alreadySent: true
      });
    }

    // Check if we have an email to send to
    if (!survey.email) {
      return NextResponse.json({
        success: false,
        message: 'No email address found'
      }, { status: 400 });
    }

    // Generate and send email
    const { subject, html } = generateDashboardReadyEmail(survey.firstName, survey.id);
    const emailSent = await sendEmail({
      to: survey.email,
      subject,
      html
    });

    if (emailSent) {
      // Mark email as sent in database
      await prisma.surveyResponse.update({
        where: { id: survey.id },
        data: { dashboardEmailSent: true }
      });

      console.log(`[Dashboard Email] ✅ Sent to ${survey.email} for survey ${survey.id}`);

      return NextResponse.json({
        success: true,
        message: 'Dashboard email sent successfully'
      });
    } else {
      console.log(`[Dashboard Email] ❌ Failed to send to ${survey.email} for survey ${survey.id}`);

      return NextResponse.json({
        success: false,
        message: 'Failed to send email'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[Dashboard Email API] ❌ Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}