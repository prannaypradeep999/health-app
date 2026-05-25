'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, Edit2, ChevronDown, ChevronUp, Star, Loader2 } from 'lucide-react';
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

interface CustomWorkout {
  id: string;
  name: string;
  notes?: string;
  exercises: Array<{ name: string; sets: string; reps: string; notes?: string }>;
}

const MUSCLE_GROUPS = ['Favorites', 'All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Mobility', 'Full Body'];
const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced: 'bg-red-100 text-red-700',
};

export default function ExerciseLibraryTab() {
  const [activeTab, setActiveTab] = useState<'library' | 'myworkouts'>('library');

  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());

  const [customs, setCustoms] = useState<CustomWorkout[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formExercises, setFormExercises] = useState([{ name: '', sets: '3', reps: '10', notes: '' }]);

  useEffect(() => {
    if (activeTab !== 'library') return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedGroup !== 'All' && selectedGroup !== 'Favorites') params.set('muscleGroup', selectedGroup);
    if (search) params.set('search', search);
    fetch(`/api/exercises?${params}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setExercises(data.exercises || []))
      .catch(err => { if (err.name !== 'AbortError') console.error(err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [activeTab, selectedGroup, search]);

  const fetchFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/exercises/favorites');
      if (!res.ok) return;
      const data = await res.json();
      setFavorited(new Set(data.favoriteIds || []));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'library') fetchFavorites();
  }, [activeTab, fetchFavorites]);

  const fetchCustoms = useCallback(async () => {
    const res = await fetch('/api/workouts/custom');
    const data = await res.json();
    setCustoms(data.customs || []);
  }, []);

  useEffect(() => { if (activeTab === 'myworkouts') fetchCustoms(); }, [activeTab, fetchCustoms]);

  const displayedExercises = selectedGroup === 'Favorites'
    ? exercises.filter(ex => favorited.has(ex.id))
    : exercises;

  async function toggleFavorite(exerciseId: string) {
    const isFav = favorited.has(exerciseId);
    setFavorited(prev => {
      const next = new Set(prev);
      isFav ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
    const res = await fetch('/api/exercises/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseLibraryId: exerciseId }),
    });
    if (!res.ok) {
      setFavorited(prev => {
        const next = new Set(prev);
        isFav ? next.add(exerciseId) : next.delete(exerciseId);
        return next;
      });
    }
  }

  async function saveCustomWorkout() {
    if (!formName.trim()) return;
    const body = { name: formName, notes: formNotes, exercises: formExercises.filter(e => e.name.trim()) };
    if (editingId) {
      await fetch('/api/workouts/custom', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) });
    } else {
      await fetch('/api/workouts/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    setShowCreateForm(false);
    setEditingId(null);
    setFormName('');
    setFormNotes('');
    setFormExercises([{ name: '', sets: '3', reps: '10', notes: '' }]);
    fetchCustoms();
  }

  async function deleteCustom(id: string) {
    await fetch(`/api/workouts/custom?id=${id}`, { method: 'DELETE' });
    fetchCustoms();
  }

  function startEdit(cw: CustomWorkout) {
    setEditingId(cw.id);
    setFormName(cw.name);
    setFormNotes(cw.notes || '');
    setFormExercises(cw.exercises.length > 0 ? cw.exercises.map(e => ({ ...e, notes: e.notes ?? '' })) : [{ name: '', sets: '3', reps: '10', notes: '' }]);
    setShowCreateForm(true);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-100 mb-4">
        {(['library', 'myworkouts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'library' ? 'Exercise Library' : 'My Workouts'}
          </button>
        ))}
      </div>

      {activeTab === 'library' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
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

          <div className="flex-1 overflow-y-auto space-y-2">
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
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-start justify-between p-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(expandedId === ex.id ? null : ex.id); } }}
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">{ex.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[ex.difficulty] ?? 'bg-gray-100 text-gray-600'}`}>
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
                </div>
                {expandedId === ex.id && (
                  <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
                    <p className="text-sm text-gray-600">{ex.description}</p>
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-blue-700 mb-0.5">Weight Guidance</p>
                      <p className="text-xs text-blue-600">{ex.weightGuidance}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div><span className="font-medium text-gray-700">Easier: </span>{ex.beginnerMod}</div>
                      <div><span className="font-medium text-gray-700">Harder: </span>{ex.advancedMod}</div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-gray-500">Your weight:</span>
                      <WeightInput exerciseName={ex.name} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'myworkouts' && (
        <div className="flex flex-col flex-1 min-h-0">
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 mb-4 w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors justify-center"
            >
              <Plus className="w-4 h-4" /> Create Workout
            </button>
          )}

          {showCreateForm && (
            <div className="border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Workout name" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
              <p className="text-xs font-medium text-gray-700">Exercises</p>
              {formExercises.map((ex, i) => (
                <div key={i} className="flex gap-2">
                  <input value={ex.name} onChange={e => { const n = [...formExercises]; n[i].name = e.target.value; setFormExercises(n); }} placeholder="Exercise name" className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500" />
                  <input value={ex.sets} onChange={e => { const n = [...formExercises]; n[i].sets = e.target.value; setFormExercises(n); }} placeholder="Sets" className="w-14 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 text-center" />
                  <input value={ex.reps} onChange={e => { const n = [...formExercises]; n[i].reps = e.target.value; setFormExercises(n); }} placeholder="Reps" className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 text-center" />
                </div>
              ))}
              <button onClick={() => setFormExercises(p => [...p, { name: '', sets: '3', reps: '10', notes: '' }])} className="text-xs text-red-600 hover:underline">+ Add exercise</button>
              <div className="flex gap-2 pt-1">
                <button onClick={saveCustomWorkout} className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-700 transition-colors">Save</button>
                <button onClick={() => { setShowCreateForm(false); setEditingId(null); }} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2">
            {customs.length === 0 && !showCreateForm && (
              <p className="text-sm text-gray-400 text-center py-8">No saved workouts yet.</p>
            )}
            {customs.map(cw => (
              <div key={cw.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{cw.name}</p>
                    <p className="text-xs text-gray-500">{cw.exercises.length} exercise{cw.exercises.length !== 1 ? 's' : ''}{cw.notes ? ` · ${cw.notes.slice(0, 40)}${cw.notes.length > 40 ? '…' : ''}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(cw)} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteCustom(cw.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
