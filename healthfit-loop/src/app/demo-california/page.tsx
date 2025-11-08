'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DemoCaliforniaPage() {
  const router = useRouter();

  useEffect(() => {
    // Set the demo session cookie and redirect to dashboard
    const setDemoSession = async () => {
      try {
        // Clear old cookies and set new ones
        document.cookie = 'guest_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'survey_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        // Set the demo session cookie using document.cookie for Bob Builder with Pexels images
        document.cookie = 'guest_session=CBzXVISzsTQ8P7IwIIDHl; path=/; max-age=' + (60 * 60 * 24 * 7); // 7 days
        document.cookie = 'survey_id=cmhp4ciq500019k4sk6vgwyg9; path=/; max-age=' + (60 * 60 * 24 * 7); // 7 days

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
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">Setting up Bob Builder's demo...</h2>
        <p className="text-sm text-gray-600">Loading personalized muscle gain plan with real restaurant links for 1244 California St, SF</p>
      </div>
    </div>
  );
}