'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, Edit3, Utensils, ArrowRight, Leaf, ArrowLeft } from 'lucide-react';

interface FoodProfileScreenProps {
  profileData: {
    foodProfile?: string;
    foodProfileId?: string;
    foodApproved: boolean;
    foodEdits?: string;
  };
  onApprove: (edits?: string) => void;
  onNext: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

// Helper function to format profile text with enhanced styling
const formatProfileText = (text: string) => {
  if (!text) return '';

  // Split into paragraphs and format
  const paragraphs = text.split('\n\n').filter(p => p.trim());

  return paragraphs.map((paragraph, index) => {
    const trimmed = paragraph.trim();

    // Check if it's a heading (starts with capital and ends with colon)
    if (trimmed.match(/^[A-Z][^.]*:$/)) {
      return (
        <div key={index} className="mb-4 mt-6 first:mt-0">
          <h3 className="font-bold text-red-700 text-lg flex items-center mb-3">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
            {trimmed.replace(':', '')}
          </h3>
        </div>
      );
    }

    // Process text with bold markers and enhanced formatting
    const processText = (text: string) => {
      // Split by bold markers
      const parts = text.split(/\*\*(.*?)\*\*/g);

      return parts.map((part, i) => {
        // Every odd index is what was inside ** **
        if (i % 2 === 1) {
          return (
            <span key={i} className="font-semibold text-red-800 bg-red-50 px-1 py-0.5 rounded">
              {part}
            </span>
          );
        }
        return part;
      });
    };

    // Regular paragraph with enhanced styling
    return (
      <p key={index} className="text-gray-700 leading-relaxed mb-4 pl-5 border-l-2 border-red-100">
        {processText(trimmed)}
      </p>
    );
  });
};

export default function FoodProfileScreen({
  profileData,
  onApprove,
  onNext,
  onBack,
  isLoading = false
}: FoodProfileScreenProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const handleApprove = () => {
    onApprove(editText);
    setEditing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
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
          <p className="text-sm text-gray-500 animate-pulse">Creating your nutrition profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10 relative overflow-hidden">
      {/* Subtle animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-r from-red-100/30 to-orange-100/30 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute bottom-32 right-16 w-40 h-40 bg-gradient-to-r from-orange-100/20 to-red-100/20 rounded-full blur-2xl animate-bounce delay-1000 duration-[3s]"></div>
        <div className="absolute top-1/3 right-1/4 w-24 h-24 bg-gradient-to-r from-red-100/15 to-pink-100/15 rounded-full blur-xl animate-ping delay-500"></div>
      </div>

      {/* Header - Match dashboard style */}
      <div className="bg-white border-b border-neutral-200 p-4 sm:p-6 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="mr-2 sm:mr-3 text-neutral-600 p-1 sm:p-2"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-medium text-neutral-900">Nutrition Profile</h1>
              <p className="text-xs sm:text-sm text-neutral-600">Review your personalized food approach</p>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="hidden sm:flex items-center space-x-2 text-xs">
            <div className="flex items-center bg-green-100 text-green-700 px-2 py-1 rounded-full">
              <CheckCircle className="w-3 h-3 mr-1" />
              Survey
            </div>
            <div className="w-4 h-px bg-red-300"></div>
            <div className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
              Nutrition
            </div>
            <div className="w-4 h-px bg-gray-300"></div>
            <div className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
              Fitness
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto relative z-10">
        {/* Main Profile Card */}
        <Card className="bg-white border border-neutral-200 shadow-sm rounded-lg overflow-hidden mb-6">
          <div className="p-4 sm:p-6">
            {/* Profile Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center mr-3 border border-red-100">
                  <Utensils className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold text-neutral-900">Your Nutrition Journey</h3>
                  <p className="text-sm text-neutral-600">Personalized approach based on your preferences</p>
                </div>
              </div>

              {profileData.foodApproved ? (
                <div className="flex items-center bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Approved
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(!editing)}
                  className="text-neutral-600 hover:text-neutral-900"
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
            </div>

            {/* Profile Content */}
            <div className="mb-6">
              <div className="bg-neutral-50 rounded-lg p-4 sm:p-6 border border-neutral-100">
                <div className="prose prose-sm max-w-none">
                  {formatProfileText(profileData.foodProfile || "Your personalized nutrition profile will appear here...")}
                </div>
              </div>
            </div>

            {/* Editing Interface */}
            {editing && !profileData.foodApproved && (
              <div className="mb-6 space-y-4">
                <div className="flex items-center text-red-600 mb-3">
                  <Leaf className="w-4 h-4 mr-2" />
                  <label className="font-medium text-sm">Add your thoughts or modifications:</label>
                </div>
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="Share any dietary preferences, restrictions, or goals we should consider..."
                  className="resize-none border-neutral-200 focus:border-red-300 bg-white text-sm"
                  rows={3}
                />
              </div>
            )}

            {/* Action Button */}
            {!profileData.foodApproved && (
              <Button
                onClick={handleApprove}
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                {editText ? 'Approve with My Notes' : 'This Looks Perfect!'}
              </Button>
            )}
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 h-12 border-neutral-200 hover:border-neutral-300 bg-white text-neutral-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Button
            onClick={onNext}
            disabled={!profileData.foodApproved}
            className={`flex-2 h-12 transition-all ${
              profileData.foodApproved
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {profileData.foodApproved ? (
              <>
                Continue to Fitness
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            ) : (
              <span className="text-sm">Please approve your profile</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}