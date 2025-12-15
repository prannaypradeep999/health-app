'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to survey for new users
    router.push('/survey');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">Welcome to FYTR AI</h2>
        <p className="text-sm text-gray-600">Redirecting you to get started...</p>
      </div>
    </div>
  );
}