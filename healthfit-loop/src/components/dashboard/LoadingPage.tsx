'use client';

export function LoadingPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        {/* Modern minimal loading dots */}
        <div className="flex space-x-2">
          <div
            className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          ></div>
          <div
            className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          ></div>
          <div
            className="w-3 h-3 bg-red-600 rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          ></div>
        </div>

        {/* Optional subtle text */}
        <p className="text-sm text-gray-500 animate-pulse">Loading...</p>
      </div>
    </div>
  );
}