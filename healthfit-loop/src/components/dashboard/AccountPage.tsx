'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  User,
  Settings,
  CreditCard,
  HelpCircle,
  Shield,
  Bell,
  Moon,
  LogOut,
  ChevronRight,
  Crown,
  TrendingUp,
  Target,
  Apple,
  Dumbbell
} from "lucide-react";

interface AccountPageProps {
  user: any;
  onNavigate: (screen: string) => void;
}

export function AccountPage({ user, onNavigate }: AccountPageProps) {
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Calculate real member since date
  const getMemberSinceDate = () => {
    if (user?.createdAt) {
      return new Date(user.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      });
    }
    // Fallback to a recent date if no real date available
    return "November 2024";
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 px-8 py-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <img src="/fytr-icon.svg" alt="FYTR" className="w-10 h-10" />
              <span className="text-xl font-bold text-[#c1272d]">FYTR</span>
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              <button className="text-sm font-medium text-[#c1272d] border-b-2 border-[#c1272d] pb-3">Account</button>
            </nav>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("dashboard")}
            className="text-gray-600 hover:text-[#c1272d]"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[#c1272d] mb-2">
            Welcome back, {user?.name?.split(' ')[0] || "User"}!
          </h1>
          <p className="text-base text-gray-600">Manage your account settings and preferences</p>
        </div>

        {/* Profile Section */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <div className="flex items-start space-x-6">
            <div className="w-20 h-20 bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-full flex items-center justify-center shadow-lg flex-shrink-0">
              <span className="text-2xl font-bold text-white">{user?.name?.charAt(0) || "U"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{user?.name || "User Name"}</h2>
                  <p className="text-gray-600 mb-4">{user?.email || ""}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className="bg-[#c1272d] text-white px-3 py-1 text-sm">
                      Free Plan
                    </Badge>
                    <span className="text-sm text-gray-500">Member since {getMemberSinceDate()}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-[#c1272d] hover:bg-red-700 text-white border-none ml-4"
                >
                  Edit Profile
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Premium Upgrade */}
        <div className="bg-gradient-to-r from-[#c1272d] to-[#8b5cf6] rounded-2xl p-8 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Crown className="w-7 h-7 mr-3 text-yellow-300" />
              <h3 className="text-xl font-bold">Upgrade to FYTR Premium</h3>
            </div>
            <Badge className="bg-white text-[#c1272d] px-3 py-1 font-medium">
              Coming Soon
            </Badge>
          </div>
          <p className="text-white/90 mb-6 text-base">
            Unlock advanced AI-powered features and personalized coaching
          </p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
              <span className="text-sm">Advanced analytics</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
              <span className="text-sm">Custom meal plans</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
              <span className="text-sm">Priority support</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
              <span className="text-sm">Unlimited workouts</span>
            </div>
          </div>
          <Button
            className="w-full bg-white text-[#c1272d] hover:bg-gray-100 font-semibold py-3"
            disabled
          >
            Get Notified When Available
          </Button>
        </div>

        {/* Settings */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <Settings className="w-6 h-6 mr-3 text-[#c1272d]" />
            App Preferences
          </h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-[#8b5cf6]/10 rounded-full flex items-center justify-center">
                  <Bell className="w-5 h-5 text-[#8b5cf6]" />
                </div>
                <div>
                  <Label className="text-base font-semibold text-gray-900">Push Notifications</Label>
                  <p className="text-sm text-gray-600 mt-1">Get reminders for workouts and meals</p>
                </div>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
                className="data-[state=checked]:bg-[#c1272d]"
              />
            </div>

            <Separator className="bg-gray-200" />

            <div className="flex items-center justify-between py-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <Moon className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <Label className="text-base font-semibold text-gray-900">Dark Mode</Label>
                  <p className="text-sm text-gray-600 mt-1">Switch to dark theme (Coming soon)</p>
                </div>
              </div>
              <Switch
                checked={darkMode}
                onCheckedChange={setDarkMode}
                disabled
                className="opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Your Health Profile */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <Target className="w-6 h-6 mr-3 text-[#c1272d]" />
            Your Health Profile
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-600">Primary Goal</span>
                <span className="text-sm font-bold text-[#c1272d] capitalize">{user?.goal || 'General Wellness'}</span>
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-600">Activity Level</span>
                <span className="text-sm font-bold text-gray-900 capitalize">{user?.activityLevel || 'Moderate'}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-600">Location</span>
                <span className="text-sm font-bold text-gray-900">{user?.zipCode || user?.location || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-600">Workout Days/Week</span>
                <span className="text-sm font-bold text-gray-900">{user?.workoutsPerWeek || '3-4'} days</span>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-200">
            <Button
              className="w-full bg-[#8b5cf6] hover:bg-purple-700 text-white"
              onClick={() => window.location.href = '/survey'}
            >
              Update Survey Responses
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition-shadow text-left">
            <div className="w-12 h-12 bg-[#c1272d]/10 rounded-full flex items-center justify-center mb-4">
              <User className="w-6 h-6 text-[#c1272d]" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Edit Profile</h4>
            <p className="text-sm text-gray-600">Update personal information</p>
          </button>

          <button className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition-shadow text-left">
            <div className="w-12 h-12 bg-[#8b5cf6]/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-[#8b5cf6]" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Privacy & Security</h4>
            <p className="text-sm text-gray-600">Manage data and privacy</p>
          </button>

          <button className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition-shadow text-left">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <HelpCircle className="w-6 h-6 text-green-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Help & Support</h4>
            <p className="text-sm text-gray-600">Get help and send feedback</p>
          </button>
        </div>

        {/* Sign Out */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md">
          <Button
            variant="ghost"
            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 py-3 text-base font-semibold"
            onClick={async () => {
              try {
                // Check if user is logged in (has user_id cookie)
                const hasUserAccount = document.cookie.includes('user_id=');

                if (hasUserAccount) {
                  // Logged in user - call logout API
                  await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                  });
                } else {
                  // Guest user - just clear guest cookies
                  document.cookie = 'guest_session=; Max-Age=0; path=/';
                  document.cookie = 'survey_id=; Max-Age=0; path=/';
                }

                // Redirect to home
                window.location.href = '/';
              } catch (error) {
                console.error('Logout error:', error);
                // Fallback - clear all cookies and redirect
                document.cookie = 'auth_session=; Max-Age=0; path=/';
                document.cookie = 'user_id=; Max-Age=0; path=/';
                document.cookie = 'guest_session=; Max-Age=0; path=/';
                document.cookie = 'survey_id=; Max-Age=0; path=/';
                window.location.href = '/';
              }
            }}
          >
            <LogOut className="w-5 h-5 mr-2" />
            {user?.email ? 'Sign Out' : 'Start Over'}
          </Button>
        </div>

        {/* App Info */}
        <div className="text-center py-8 pb-24">
          <div className="flex items-center justify-center mb-4">
            <img src="/fytr-icon.svg" alt="FYTR" className="w-8 h-8 mr-3" />
            <span className="text-xl font-bold text-[#c1272d]">FYTR</span>
          </div>
          <p className="text-sm text-gray-500">Version 1.0.0</p>
          <p className="text-sm text-gray-400 mt-1">Your AI-powered fitness companion</p>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("dashboard")}
          >
            <img src="/fytr-icon.svg" alt="Home" className="w-5 h-5 mb-1" />
            <span className="text-xs">Home</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("meal-plan")}
          >
            <Apple className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("workout-plan")}
          >
            <Dumbbell className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Workouts</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-gray-400 hover:text-[#c1272d] transition-colors"
            onClick={() => onNavigate("progress")}
          >
            <TrendingUp className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Progress</span>
          </button>
          <button className="flex flex-col items-center justify-center text-[#c1272d]">
            <User className="w-5 h-5 mb-1 stroke-1" />
            <span className="text-xs">Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}