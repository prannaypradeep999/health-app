'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Crown, Shield, Smartphone, Cloud, TrendingUp } from 'lucide-react';

interface SaveProgressModalProps {
  onClose: () => void;
  onSkip?: () => void;
}

export default function SaveProgressModal({ onClose, onSkip }: SaveProgressModalProps) {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    confirmPassword: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!isLogin) {
        // Validation for registration
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (formData.password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
      }

      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : {
            email: formData.email,
            password: formData.password,
            firstName: formData.firstName,
            lastName: formData.lastName
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        // Success! Reload the page to show user's saved data
        window.location.reload();
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Save Your Progress
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Keep your personalized plans forever
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Benefits */}
        <div className="p-6 bg-gradient-to-r from-red-50 to-purple-50">
          <h3 className="font-medium text-gray-900 mb-3 flex items-center">
            <Crown className="w-4 h-4 text-red-600 mr-2" />
            Account Benefits
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center text-gray-700">
              <Shield className="w-4 h-4 text-green-600 mr-2 flex-shrink-0" />
              Save your personalized meal & workout plans
            </div>
            <div className="flex items-center text-gray-700">
              <Cloud className="w-4 h-4 text-blue-600 mr-2 flex-shrink-0" />
              Access across all your devices
            </div>
            <div className="flex items-center text-gray-700">
              <TrendingUp className="w-4 h-4 text-purple-600 mr-2 flex-shrink-0" />
              Track your progress over time
            </div>
            <div className="flex items-center text-gray-700">
              <Smartphone className="w-4 h-4 text-orange-600 mr-2 flex-shrink-0" />
              Get weekly plan updates
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName" className="text-gray-700">First name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => updateFormData('firstName', e.target.value)}
                    className="mt-1 border-gray-300 focus:border-red-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName" className="text-gray-700">Last name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => updateFormData('lastName', e.target.value)}
                    className="mt-1 border-gray-300 focus:border-red-500"
                    placeholder="Doe"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="email" className="text-gray-700">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                className="mt-1 border-gray-300 focus:border-red-500"
                placeholder="your.email@example.com"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-gray-700">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => updateFormData('password', e.target.value)}
                className="mt-1 border-gray-300 focus:border-red-500"
                placeholder="Create a password"
                minLength={6}
              />
              {!isLogin && (
                <p className="mt-1 text-xs text-gray-500">Must be at least 6 characters</p>
              )}
            </div>

            {!isLogin && (
              <div>
                <Label htmlFor="confirmPassword" className="text-gray-700">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => updateFormData('confirmPassword', e.target.value)}
                  className="mt-1 border-gray-300 focus:border-red-500"
                  placeholder="Confirm your password"
                  minLength={6}
                />
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{isLogin ? 'Signing in...' : 'Creating account...'}</span>
                </div>
              ) : (
                isLogin ? 'Sign in & Save' : 'Create Account & Save'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setFormData({
                  email: formData.email, // Keep email
                  password: '',
                  firstName: '',
                  lastName: '',
                  confirmPassword: ''
                });
              }}
              className="text-red-600 hover:text-red-500 text-sm font-medium"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"
              }
            </button>
          </div>

          {/* Skip option */}
          {onSkip && (
            <div className="mt-6 pt-6 border-t border-gray-200 text-center">
              <button
                onClick={onSkip}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Continue as guest
              </button>
              <p className="text-xs text-gray-400 mt-1">
                You can create an account anytime
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}