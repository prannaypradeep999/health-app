'use client';

import React from 'react';
import { X } from 'lucide-react';

interface ShareModalProps {
  onClose: () => void;
}

export default function ShareModal({ onClose }: ShareModalProps) {
  const socialPlatforms = [
    { name: 'Instagram', icon: '📸' },
    { name: 'TikTok', icon: '🎵' },
    { name: 'Twitter', icon: '🐦' },
    { name: 'Facebook', icon: '👥' },
    { name: 'LinkedIn', icon: '💼' }
  ];

  const shareProgress = (platform: string) => {
    const shareText = "Check out my health journey progress! 💪 #FitnessGoals";
    const shareUrl = window.location.href;
    
    const shareUrls: Record<string, string> = {
      Twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      Facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      LinkedIn: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    };
    
    if (shareUrls[platform]) {
      window.open(shareUrls[platform], '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full border border-gray-200">
        <div className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Share Your Progress</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <p className="text-gray-600 mb-6">Share your health journey with friends and family!</p>

          <div className="grid grid-cols-2 gap-3">
            {socialPlatforms.map((platform) => (
              <button
                key={platform.name}
                onClick={() => shareProgress(platform.name)}
                className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all flex flex-col items-center space-y-2"
              >
                <span className="text-2xl">{platform.icon}</span>
                <span className="text-sm font-medium text-gray-700">{platform.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}