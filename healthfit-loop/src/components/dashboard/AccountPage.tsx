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

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-red-50/15 to-purple-50/10">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("dashboard")}
              className="mr-3 text-neutral-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-medium text-neutral-900">Account</h1>
              <p className="text-sm text-neutral-600">Manage your profile and settings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Profile Section */}
        <Card className="border-0 shadow-subtle bg-white">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-medium text-neutral-900">{user?.name || "User Name"}</h2>
                <p className="text-neutral-600">{user?.email || "user@example.com"}</p>
                <div className="flex items-center mt-2">
                  <Badge variant="secondary" className="mr-2 bg-neutral-100 text-neutral-700">
                    Free Plan
                  </Badge>
                  <span className="text-sm text-neutral-500">Member since Nov 2024</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-neutral-200">
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Premium Upgrade */}
        <Card className="border-0 shadow-medium bg-gradient-to-r from-primary via-accent-purple to-accent-pink text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Crown className="w-6 h-6 mr-3" />
                <h3 className="text-lg font-medium">Upgrade to Premium</h3>
              </div>
              <Badge variant="secondary" className="text-primary bg-white">
                Coming Soon
              </Badge>
            </div>
            <p className="text-sm opacity-90 mb-4">
              Advanced features and premium support will be available soon
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <div className="flex items-center opacity-90">
                <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
                Advanced analytics
              </div>
              <div className="flex items-center opacity-90">
                <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
                Custom recipes
              </div>
              <div className="flex items-center opacity-90">
                <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
                Priority support
              </div>
              <div className="flex items-center opacity-90">
                <span className="w-1.5 h-1.5 bg-white rounded-full mr-2"></span>
                Unlimited plans
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full text-primary bg-white hover:bg-neutral-50"
              disabled
            >
              Notify Me When Available
            </Button>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card className="border-0 shadow-subtle bg-white">
          <CardHeader>
            <CardTitle className="flex items-center text-lg font-medium">
              <Settings className="w-5 h-5 mr-2" />
              Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bell className="w-5 h-5 text-neutral-500" />
                <div>
                  <Label className="font-medium">Push Notifications</Label>
                  <p className="text-sm text-neutral-600">Get reminders for workouts and meals</p>
                </div>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>

            <Separator className="bg-neutral-100" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Moon className="w-5 h-5 text-neutral-500" />
                <div>
                  <Label className="font-medium">Dark Mode</Label>
                  <p className="text-sm text-neutral-600">Switch to dark theme (Coming soon)</p>
                </div>
              </div>
              <Switch
                checked={darkMode}
                onCheckedChange={setDarkMode}
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* Menu Options */}
        <Card className="border-0 shadow-subtle bg-white">
          <CardContent className="p-0">
            <div className="space-y-0">
              <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors" disabled>
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-neutral-500" />
                  <div className="text-left">
                    <div className="font-medium text-neutral-900">Edit Profile</div>
                    <div className="text-sm text-neutral-600">Update personal information</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-400" />
              </button>

              <Separator className="bg-neutral-100" />

              <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors" disabled>
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-neutral-500" />
                  <div className="text-left">
                    <div className="font-medium text-neutral-900">Privacy & Security</div>
                    <div className="text-sm text-neutral-600">Data and privacy settings</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-400" />
              </button>

              <Separator className="bg-neutral-100" />

              <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors" disabled>
                <div className="flex items-center space-x-3">
                  <HelpCircle className="w-5 h-5 text-neutral-500" />
                  <div className="text-left">
                    <div className="font-medium text-neutral-900">Help & Support</div>
                    <div className="text-sm text-neutral-600">Get help and send feedback</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-400" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* User Info Card */}
        <Card className="border-0 shadow-subtle bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Your Health Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Goal</span>
              <span className="text-sm font-medium text-neutral-900 capitalize">{user?.goal || 'Fitness'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Activity Level</span>
              <span className="text-sm font-medium text-neutral-900 capitalize">{user?.activityLevel || 'Moderate'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Location</span>
              <span className="text-sm font-medium text-neutral-900">{user?.location || 'Not set'}</span>
            </div>
            <div className="pt-2 border-t border-neutral-100">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.location.href = '/survey'}
              >
                Update Survey Responses
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sign Out */}
        <Card className="border-0 shadow-subtle bg-white">
          <CardContent className="p-4">
            <Button
              variant="ghost"
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                // Clear cookies and redirect to home
                document.cookie = 'guest_session=; Max-Age=0; path=/';
                document.cookie = 'survey_id=; Max-Age=0; path=/';
                window.location.href = '/';
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Start Over
            </Button>
          </CardContent>
        </Card>

        {/* App Info */}
        <div className="text-center text-sm text-neutral-500 pb-20">
          <p>FYTR v1.0.0</p>
          <p className="mt-1">Your AI-powered fitness companion</p>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("dashboard")}
          >
            <Target className="w-5 h-5 mb-1" />
            <span className="text-xs">Home</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("meal-plan")}
          >
            <Apple className="w-5 h-5 mb-1" />
            <span className="text-xs">Meals</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("workout-plan")}
          >
            <Dumbbell className="w-5 h-5 mb-1" />
            <span className="text-xs">Workouts</span>
          </button>
          <button
            className="flex flex-col items-center justify-center text-neutral-400"
            onClick={() => onNavigate("progress")}
          >
            <TrendingUp className="w-5 h-5 mb-1" />
            <span className="text-xs">Progress</span>
          </button>
          <button className="flex flex-col items-center justify-center text-primary">
            <User className="w-5 h-5 mb-1" />
            <span className="text-xs">Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}