'use client';

import { useState, useEffect } from 'react';

interface WeightInputProps {
  exerciseName: string;
  onWeightChange?: (weight: number | null) => void;
  className?: string;
}

export default function WeightInput({ exerciseName, onWeightChange, className = '' }: WeightInputProps) {
  const [weight, setWeight] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(`lastWeight:${exerciseName}`);
    if (stored) {
      setWeight(stored);
      onWeightChange?.(parseFloat(stored));
      setLoading(false);
      return;
    }
    fetch(`/api/workouts/last-weight?exerciseName=${encodeURIComponent(exerciseName)}`)
      .then(r => r.json())
      .then(data => {
        if (data.weightUsedLbs) {
          setWeight(String(data.weightUsedLbs));
          onWeightChange?.(data.weightUsedLbs);
          localStorage.setItem(`lastWeight:${exerciseName}`, String(data.weightUsedLbs));
        }
      })
      .finally(() => setLoading(false));
  }, [exerciseName]);

  function handleBlur() {
    const val = parseFloat(weight);
    if (!isNaN(val) && val > 0) {
      localStorage.setItem(`lastWeight:${exerciseName}`, String(val));
      onWeightChange?.(val);
    } else {
      onWeightChange?.(null);
    }
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <input
        type="number"
        min="1"
        step="2.5"
        value={weight}
        onChange={e => setWeight(e.target.value)}
        onBlur={handleBlur}
        placeholder={loading ? '…' : '0'}
        className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
      />
      <span className="text-xs text-gray-500">lbs</span>
    </div>
  );
}
