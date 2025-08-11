'use client';

import { useState } from 'react';

const GOALS = [
  { value: 'WEIGHT_LOSS', label: 'Weight loss' },
  { value: 'MUSCLE_GAIN', label: 'Muscle gain' },
  { value: 'ENDURANCE', label: 'Endurance' },
  { value: 'GENERAL_WELLNESS', label: 'General wellness' },
];

const DIET_PREFS = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free'];

export default function SurveyPage() {
  const [email, setEmail] = useState('');
  const [goal, setGoal] = useState('GENERAL_WELLNESS');
  const [budgetTier, setBudgetTier] = useState('$10–20/day');
  const [dietPrefs, setDietPrefs] = useState<string[]>([]);
  const [cholesterol, setCholesterol] = useState('');
  const [vitaminD, setVitaminD] = useState('');
  const [iron, setIron] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);

  const togglePref = (p: string) =>
    setDietPrefs(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));

  const submit = async () => {
    setMsg(null);

    if (!email || !email.includes('@')) {
      setMsg({ error: 'Please enter a valid email.' });
      return;
    }
    if (!budgetTier.trim()) {
      setMsg({ error: 'Please enter a budget tier.' });
      return;
    }

    setSubmitting(true);
    try {
      const biomarkers: Record<string, number> = {};
      if (cholesterol) biomarkers.cholesterol = Number(cholesterol);
      if (vitaminD) biomarkers.vitaminD = Number(vitaminD);
      if (iron) biomarkers.iron = Number(iron);

      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          goal,
          budgetTier,
          dietPrefs,
          biomarkers,
          source: 'web_v1',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Server error');
      setMsg({ ok: true });
    } catch (e: any) {
      setMsg({ error: e.message || 'Failed to submit' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-white">
      {/* Top bar */}
      <header className="border-b bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-blue-600" />
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Health+Fit Loop
            </span>
          </div>
          <div className="text-sm text-slate-500">MVP · Survey</div>
        </div>
      </header>

      {/* Page */}
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-[1fr,420px]">
          {/* Left: marketing blurb */}
          <section className="hidden md:block">
            <div className="sticky top-10 space-y-5">
              <h1 className="text-3xl md:text-4xl font-bold leading-tight text-slate-900">
                Tell us about you<span className="text-blue-600">.</span>
              </h1>
              <p className="text-slate-600">
                We’ll turn this into a 7-day plan with meals, workouts, and one-tap actions.
                Your inputs help us tailor macros and suggestions.
              </p>

              <ul className="space-y-3 text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <div>
                    <p className="font-medium">Frictionless</p>
                    <p className="text-slate-600 text-sm">No hard signup yet. Just your email to save progress.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <div>
                    <p className="font-medium">Adaptive</p>
                    <p className="text-slate-600 text-sm">Account for goals, budget, preferences, and optional labs.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <div>
                    <p className="font-medium">Private</p>
                    <p className="text-slate-600 text-sm">We only store what you enter. Change or delete anytime.</p>
                  </div>
                </li>
              </ul>
            </div>
          </section>

          {/* Right: form card */}
          <section>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5 md:p-6">
                <h2 className="text-xl font-semibold text-slate-900">
                  Signup Survey
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  A few details to personalize your plan.
                </p>
              </div>

              <div className="p-5 md:p-6 space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-3 py-2.5 shadow-sm"
                  />
                </div>

                {/* Goal */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Health goal
                  </label>
                  <div className="relative">
                    <select
                      value={goal}
                      onChange={e => setGoal(e.target.value)}
                      className="w-full appearance-none rounded-xl border-slate-300 bg-white px-3 py-2.5 pr-9 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      {GOALS.map(g => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      ▾
                    </span>
                  </div>
                </div>

                {/* Budget */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Budget tier
                  </label>
                  <input
                    value={budgetTier}
                    onChange={e => setBudgetTier(e.target.value)}
                    placeholder="$10–20/day"
                    className="w-full rounded-xl border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-3 py-2.5 shadow-sm"
                  />
                </div>

                {/* Diet prefs */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Diet preferences
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DIET_PREFS.map(p => {
                      const active = dietPrefs.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePref(p)}
                          className={[
                            'rounded-full border px-3 py-1.5 text-sm shadow-sm transition',
                            active
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700',
                          ].join(' ')}
                          aria-pressed={active}
                        >
                          {p.replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Biomarkers */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Optional biomarkers
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="block text-xs text-slate-500 mb-1">Cholesterol</span>
                      <input
                        type="number"
                        value={cholesterol}
                        onChange={e => setCholesterol(e.target.value)}
                        placeholder="e.g. 210"
                        className="w-full rounded-xl border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-3 py-2.5 shadow-sm"
                      />
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500 mb-1">Vitamin D</span>
                      <input
                        type="number"
                        value={vitaminD}
                        onChange={e => setVitaminD(e.target.value)}
                        placeholder="e.g. 20"
                        className="w-full rounded-xl border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-3 py-2.5 shadow-sm"
                      />
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500 mb-1">Iron</span>
                      <input
                        type="number"
                        value={iron}
                        onChange={e => setIron(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full rounded-xl border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-3 py-2.5 shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Alerts */}
                {msg?.error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {msg.error}
                  </div>
                )}
                {msg?.ok && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Thanks! Your survey was saved.
                  </div>
                )}

                {/* Submit */}
                <div className="pt-2">
                  <button
                    onClick={submit}
                    disabled={submitting}
                    className="group relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white shadow-sm ring-1 ring-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  >
                    {submitting ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Submitting…
                      </span>
                    ) : (
                      'Submit survey'
                    )}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    You can change these later.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer note */}
            <p className="mt-6 text-center text-xs text-slate-500">
              By continuing you agree to our basic data policy for this MVP.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
