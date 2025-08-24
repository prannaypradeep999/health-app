import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import DashboardClient from '@/components/dashboard/DashboardClient';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  
  // Check for logged-in user first
  const userId = cookieStore.get('user_id')?.value;
  const sessionId = cookieStore.get('guest_session')?.value;
  const surveyId = cookieStore.get('survey_id')?.value;
  
  let userData = null;
  let surveyData = null;
  let isGuest = true;
  
  // Try to get user data
  if (userId) {
    // Logged-in user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        activeSurvey: true 
      }
    });
    
    if (user) {
      userData = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      };
      surveyData = user.activeSurvey;
      isGuest = false;
    }
  } 
  
  // If no user or no survey, try guest
  if (!surveyData && surveyId) {
    surveyData = await prisma.surveyResponse.findUnique({
      where: { id: surveyId }
    });
  } else if (!surveyData && sessionId) {
    surveyData = await prisma.surveyResponse.findFirst({
      where: { 
        sessionId,
        isGuest: true 
      },
      orderBy: { createdAt: 'desc' }
    });
  }
  
  // If still no data, redirect to survey
  if (!surveyData) {
    redirect('/survey');
  }
  
  // Pass data to client component
  return (
    <DashboardClient 
      userData={userData}
      surveyData={surveyData}
      isGuest={isGuest}
    />
  );
}