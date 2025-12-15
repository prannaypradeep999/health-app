'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Lock, Mail, User, Shield, Check } from 'lucide-react';

interface AccountCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  guestData?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
}

export default function AccountCreationModal({ isOpen, onClose, guestData }: AccountCreationModalProps) {
  const [formData, setFormData] = useState({
    email: guestData?.email || '',
    firstName: guestData?.firstName || '',
    lastName: guestData?.lastName || '',
    password: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          password: formData.password,
          preserveGuestData: true
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Registration failed');
      }

      setSuccess(true);

      // Auto-close after 2 seconds and refresh page
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <Card className="p-8 max-w-md w-full bg-white">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto border border-green-200">
              <Check className="w-8 h-8 text-green-600" />
            </div>

            <div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Account Created!</h3>
              <p className="text-gray-600">
                Your account has been created and your survey data has been saved.
                You now have access to your personalized dashboard.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="p-8 max-w-md w-full bg-white relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          ×
        </button>

        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200">
            <Shield className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-2xl font-medium text-gray-900 mb-2">Save Your Progress</h2>
          <p className="text-gray-600">
            Create an account to save your personalized plans and track your progress
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-700 mb-2 block">Email</Label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="pl-10 border-gray-300 focus:border-red-500 bg-white"
                placeholder="your.email@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-700 mb-2 block">First Name</Label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <Input
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  className="pl-10 border-gray-300 focus:border-red-500 bg-white"
                  placeholder="John"
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-700 mb-2 block">Last Name</Label>
              <Input
                required
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="border-gray-300 focus:border-red-500 bg-white"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-700 mb-2 block">Password</Label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <Input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="pl-10 border-gray-300 focus:border-red-500 bg-white"
                placeholder="At least 6 characters"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-700 mb-2 block">Confirm Password</Label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <Input
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="pl-10 border-gray-300 focus:border-red-500 bg-white"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-gray-300 hover:border-gray-400 bg-white text-gray-900 hover:bg-gray-50"
            >
              Maybe Later
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {isLoading ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          By creating an account, you agree to our Terms of Service and Privacy Policy
        </p>
      </Card>
    </div>
  );
}