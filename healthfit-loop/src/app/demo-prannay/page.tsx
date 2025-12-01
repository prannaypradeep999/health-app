'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function DemoPrannayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Set the demo session cookie and redirect to dashboard
    const setDemoSession = async () => {
      try {
        // Get session parameters from URL or use defaults for Prannay
        const surveyId = searchParams.get('surveyId') || 'cmhqf60yj00019ksg5fynzcr8';
        const sessionId = searchParams.get('sessionId') || 'Q3mD4yE1F_uAE7shrunPI';

        // Clear old cookies and set new ones
        document.cookie = 'guest_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'survey_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        // Set the demo session cookie for Prannay with restaurant search functionality
        document.cookie = `guest_session=${sessionId}; path=/; max-age=${60 * 60 * 24 * 7}`; // 7 days
        document.cookie = `survey_id=${surveyId}; path=/; max-age=${60 * 60 * 24 * 7}`; // 7 days

        console.log('Setting demo session for Prannay:', { surveyId, sessionId });

        // Small delay to ensure cookie is set
        setTimeout(() => {
          router.push('/dashboard');
        }, 500);
      } catch (error) {
        console.error('Failed to set demo session:', error);
        // Fallback - redirect anyway
        router.push('/dashboard');
      }
    };

    setDemoSession();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">Setting up Prannay's demo...</h2>
        <p className="text-sm text-gray-600">Loading personalized muscle gain plan with real restaurant search for 1244 California St, SF</p>
      </div>
    </div>
  );
}

export default function DemoPrannayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Loading demo...</h2>
        </div>
      </div>
    }>
      <DemoPrannayContent />
    </Suspense>
  );
}