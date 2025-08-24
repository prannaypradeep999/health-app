'use client';

import React from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { colors } from '../constants';

interface ShareModalProps {
  onClose: () => void;
}

export default function ShareModal({ onClose }: ShareModalProps) {
  const socialPlatforms = [
    { name: 'Instagram', icon: '📸', color: colors.accentRed },
    { name: 'TikTok', icon: '🎵', color: colors.nearBlack },
    { name: 'Twitter', icon: '🐦', color: colors.deepBlue },
    { name: 'Facebook', icon: '👥', color: colors.mediumGray },
    { name: 'LinkedIn', icon: '💼', color: colors.darkGray }
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
      <div className="rounded-2xl max-w-md w-full flex flex-col" style={{ backgroundColor: colors.white }}>
        <div className="flex-shrink-0 p-6 border-b" style={{ borderColor: colors.paleGray }}>
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button onClick={onClose} className="rounded-full p-2 flex items-center space-x-2" style={{ backgroundColor: colors.paleGray }}>
                <ArrowLeft className="w-4 h-4" style={{ color: colors.mediumGray }} />
                <span className="text-sm" style={{ color: colors.mediumGray }}>Back</span>
              </button>
              <h2 className="text-xl font-bold" style={{ color: colors.nearBlack }}>Share Your Progress</h2>
            </div>
            <button onClick={onClose} className="rounded-full p-2" style={{ backgroundColor: colors.paleGray }}>
              <X className="w-5 h-5" style={{ color: colors.mediumGray }} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-6">
          <p className="mb-6" style={{ color: colors.mediumGray }}>Share your health journey with friends and family!</p>
          
          <div className="grid grid-cols-2 gap-4">
            {socialPlatforms.map((platform) => (
              <button
                key={platform.name}
                onClick={() => shareProgress(platform.name)}
                className="text-white p-4 rounded-lg hover:opacity-90 transition-opacity flex flex-col items-center space-y-2"
                style={{ backgroundColor: platform.color }}
              >
                <span className="text-2xl">{platform.icon}</span>
                <span className="text-sm font-medium">{platform.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}