'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check auth status client-side as backup
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          if (data.user || data.guestSession) {
            router.push('/dashboard');
            return;
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }
      // No auth → survey
      router.push('/survey');
    };

    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">Welcome to FYTR AI</h2>
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  );
}