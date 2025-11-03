'use client';

import { Card } from '@/components/ui/card';
import Logo from '@/components/logo';

export function LoadingPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="text-center mb-12">
          <div className="mx-auto mb-6 flex items-center justify-center">
            <Logo variant="full" width={200} height={50} href="" />
          </div>
        </div>

        <Card className="p-8 mb-8 border border-gray-200 bg-white">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto border border-blue-200">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>

            <div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Loading Your Dashboard</h3>
              <p className="text-gray-600 leading-relaxed">
                Setting up your personalized health experience...
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}