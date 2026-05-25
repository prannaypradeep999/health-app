'use client';

import { useState, useEffect, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Search, Plus, Star, Loader2 } from 'lucide-react';
import WeightInput from './WeightInput';

interface LibraryExercise {
  id: string;
  name: string;
  description: string;
  muscleGroup: string;
  equipmentType: string;
  category: string;
  defaultSets: number;
  defaultReps: string;
  difficulty: string;
  weightGuidance: string;
  beginnerMod: string;
  advancedMod: string;
  tags: string[];
}

interface ExerciseLibraryModalProps {
  open: boolean;
  onClose: () => void;
  workoutPlanId: string;
  day: string;
  defaultMuscleGroup?: string;
  onAdded: (exercise: LibraryExercise, additionType: 'supplement' | 'standalone', weight: number | null) => void;
}

const MUSCLE_GROUPS = ['Favorites', 'All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Mobility', 'Full Body'];
const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced: 'bg-red-100 text-red-700',
};

export default function ExerciseLibraryModal({
  open, onClose, workoutPlanId, day, defaultMuscleGroup, onAdded,
}: ExerciseLibraryModalProps) {
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(defaultMuscleGroup || 'All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number | null>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());

  const fetchFavorites = useCallback(async () => {
    const res = await fetch('/api/exercises/favorites');
    const data = await res.json();
    setFavorited(new Set(data.favoriteIds || []));
  }, []);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedGroup !== 'All' && selectedGroup !== 'Favorites') params.set('muscleGroup', selectedGroup);
      if (search) params.set('search', search);
      const res = await fetch(`/api/exercises?${params}`);
      const data = await res.json();
      setExercises(data.exercises || []);
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, search]);

  useEffect(() => {
    if (open) {
      fetchFavorites();
      fetchExercises();
    }
  }, [open, fetchExercises, fetchFavorites]);

  async function toggleFavorite(exerciseId: string) {
    const isFav = favorited.has(exerciseId);
    setFavorited(prev => {
      const next = new Set(prev);
      isFav ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
    await fetch('/api/exercises/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseLibraryId: exerciseId }),
    });
  }

  async function handleAdd(exercise: LibraryExercise, additionType: 'supplement' | 'standalone') {
    setAdding(`${exercise.id}-${additionType}`);
    await fetch('/api/exercises/add-to-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workoutPlanId, day, additionType, source: 'library',
        exerciseLibraryId: exercise.id,
        weightUsedLbs: weights[exercise.id] ?? null,
      }),
    });
    setAdding(null);
    onAdded(exercise, additionType, weights[exercise.id] ?? null);
  }

  const displayedExercises = selectedGroup === 'Favorites'
    ? exercises.filter(ex => favorited.has(ex.id))
    : exercises;

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="flex flex-col p-0">
        <DrawerHeader className="px-5 pt-4 pb-3 border-b border-gray-100">
          <DrawerTitle className="text-base font-semibold">Add Exercise</DrawerTitle>
        </DrawerHeader>

        <div className="px-5 py-3 border-b border-gray-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MUSCLE_GROUPS.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedGroup === g
                    ? g === 'Favorites' ? 'bg-amber-400 text-white' : 'bg-red-600 text-white'
                    : g === 'Favorites' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {g === 'Favorites' ? '★ Favorites' : g}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
          {!loading && displayedExercises.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              {selectedGroup === 'Favorites' ? 'No favourites yet — star exercises to save them here.' : 'No exercises found.'}
            </p>
          )}
          {!loading && displayedExercises.map(ex => (
            <div key={ex.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-start justify-between p-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-900">{ex.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[ex.difficulty]}`}>
                      {ex.difficulty}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                      {ex.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{ex.muscleGroup}</span>
                    <span>·</span>
                    <span>{ex.equipmentType}</span>
                    <span>·</span>
                    <span>{ex.defaultSets}×{ex.defaultReps}</span>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); toggleFavorite(ex.id); }}
                  className="flex-shrink-0 p-1 rounded-lg hover:bg-amber-50 transition-colors ml-1"
                  aria-label={favorited.has(ex.id) ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <Star
                    className={`w-4 h-4 transition-colors ${favorited.has(ex.id) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                  />
                </button>
              </button>

              {expandedId === ex.id && (
                <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
                  <p className="text-sm text-gray-600">{ex.description}</p>
                  <div className="bg-blue-50 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-blue-700 mb-0.5">Weight Guidance</p>
                    <p className="text-xs text-blue-600">{ex.weightGuidance}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>
                      <span className="font-medium text-gray-700">Easier: </span>{ex.beginnerMod}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Harder: </span>{ex.advancedMod}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Your weight:</span>
                      <WeightInput
                        exerciseName={ex.name}
                        onWeightChange={w => setWeights(prev => ({ ...prev, [ex.id]: w }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAdd(ex, 'supplement')}
                        disabled={!!adding}
                        className="flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add to {day}
                      </button>
                      <button
                        onClick={() => handleAdd(ex, 'standalone')}
                        disabled={!!adding}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Log Standalone
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
