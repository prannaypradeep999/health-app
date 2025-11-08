'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SetTestCookiesPage() {
  const router = useRouter();

  useEffect(() => {
    const setCookiesAndRedirect = async () => {
      try {
        // Clear any existing cookies first
        document.cookie = 'guest_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'survey_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        // Wait a moment for clearing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Set the working cookies with explicit domain
        document.cookie = `guest_session=Fl3KuzDKyxSHw6hv6ZOsX; path=/; max-age=${60 * 60 * 24}; domain=localhost`;
        document.cookie = `survey_id=cmhqch4no000p9kx07xefzpr6; path=/; max-age=${60 * 60 * 24}; domain=localhost`;

        console.log('✅ Test cookies set with domain:');
        console.log('guest_session=Fl3KuzDKyxSHw6hv6ZOsX');
        console.log('survey_id=cmhqch4no000p9kx07xefzpr6');

        // Verify cookies were set
        const cookies = document.cookie;
        console.log('🍪 Current cookies:', cookies);

        // Test the API to verify it works
        const response = await fetch('/api/ai/meals/current');
        console.log('🧪 API test response status:', response.status);

        if (response.ok) {
          console.log('✅ API working! Redirecting to dashboard...');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 2000);
        } else {
          console.log('❌ API not working, trying alternative...');
          // Try setting cookies without domain
          document.cookie = `guest_session=Fl3KuzDKyxSHw6hv6ZOsX; path=/; max-age=${60 * 60 * 24}`;
          document.cookie = `survey_id=cmhqch4no000p9kx07xefzpr6; path=/; max-age=${60 * 60 * 24}`;

          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 2000);
        }
      } catch (error) {
        console.error('Cookie setting error:', error);
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      }
    };

    setCookiesAndRedirect();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">Setting test cookies...</h2>
        <p className="text-sm text-gray-600">Redirecting to completed meal plan</p>
      </div>
    </div>
  );
}