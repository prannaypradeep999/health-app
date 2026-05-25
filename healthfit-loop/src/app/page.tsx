'use client';

import { useState } from 'react';
import Logo from '@/components/logo';
import { ArrowRight, CheckCircle } from 'lucide-react';

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Something went wrong');
        return;
      }

      setStatus('success');
      setEmail('');
      setFirstName('');
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Try again.');
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <Logo variant="full" />
        <a
          href="/login"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Sign in
        </a>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block bg-red-50 text-red-600 text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full mb-6">
            Coming Soon
          </span>

          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-5">
            Your personal AI health &amp;{' '}
            <span className="text-red-600">fitness loop</span>
          </h1>

          <p className="text-lg text-gray-500 mb-10 max-w-xl mx-auto">
            Personalized meal plans, workout routines, and nutrition tracking — all powered by AI and built around your goals.
          </p>

          {status === 'success' ? (
            <div className="flex flex-col items-center gap-3 text-green-600">
              <CheckCircle className="w-10 h-10" />
              <p className="text-lg font-semibold">You&apos;re on the list!</p>
              <p className="text-sm text-gray-500">We&apos;ll reach out when we launch.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto w-full">
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="flex-shrink-0 sm:w-36 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {status === 'loading' ? 'Joining...' : <>Join waitlist <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {status === 'error' && (
            <p className="mt-3 text-sm text-red-500">{message}</p>
          )}

          <p className="mt-5 text-xs text-gray-400">No spam. Unsubscribe anytime.</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5 border-t border-gray-100 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} FYTR AI. All rights reserved.
      </footer>
    </div>
  );
}
