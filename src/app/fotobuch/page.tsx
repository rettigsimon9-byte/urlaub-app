'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Trash2, ChevronRight } from 'lucide-react';

interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  coverPhoto?: string;
  _count: { photos: number };
}

export default function FotobuchPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/trips').then(r => r.json()).then(setTrips).catch(() => {});
  }, []);

  const createTrip = async () => {
    if (!name.trim() || !destination.trim()) return;
    setSaving(true);
    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, destination, startDate, endDate }),
    });
    const trip = await res.json();
    setSaving(false);
    setShowNew(false);
    setName(''); setDestination(''); setStartDate(''); setEndDate('');
    router.push(`/fotobuch/${trip.id}`);
  };

  const deleteTrip = async (id: string) => {
    if (!confirm('Urlaub und alle Fotos löschen?')) return;
    await fetch(`/api/trips/${id}`, { method: 'DELETE' });
    setTrips(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="min-h-screen pb-10">
      <div className="sticky top-0 z-10 bg-[#f0f4f8]/95 backdrop-blur-sm pt-12 pb-4 px-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Meine Reisen</h1>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="w-9 h-9 bg-sky-500 rounded-full flex items-center justify-center shadow-md hover:bg-sky-600 transition-colors"
          >
            <Plus size={20} className="text-white" />
          </button>
        </div>
      </div>

      <div className="px-5">
        {/* New trip form */}
        {showNew && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 animate-slide-up">
            <p className="font-bold text-gray-900 mb-3">Neue Reise anlegen</p>
            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Name z.B. Sommerurlaub Italien 2025"
                className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300" />
              <input value={destination} onChange={e => setDestination(e.target.value)}
                placeholder="Reiseziel z.B. Italien"
                className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-600" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-600" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowNew(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">Abbrechen</button>
                <button onClick={createTrip} disabled={saving || !name.trim() || !destination.trim()}
                  className="flex-1 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-600 transition-colors disabled:opacity-40">
                  {saving ? 'Erstelle…' : 'Anlegen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {trips.length === 0 && !showNew ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📸</div>
            <p className="font-semibold text-gray-700 mb-2">Noch keine Reisen</p>
            <p className="text-sm text-gray-400 mb-5">Lege deine erste Reise an und füge Fotos hinzu</p>
            <button onClick={() => setShowNew(true)} className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-600 transition-colors">
              Erste Reise anlegen
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map(trip => (
              <div key={trip.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <button onClick={() => router.push(`/fotobuch/${trip.id}`)} className="w-full flex items-center gap-3 p-3 text-left">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-sky-100 to-indigo-100 flex-shrink-0">
                    {trip.coverPhoto
                      ? <img src={trip.coverPhoto} alt={trip.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl">🏖️</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{trip.name}</p>
                    <p className="text-sm text-gray-400">{trip.destination}</p>
                    {trip.startDate && (
                      <p className="text-xs text-gray-300 mt-0.5">
                        {new Date(trip.startDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {trip.endDate && ` – ${new Date(trip.endDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}`}
                      </p>
                    )}
                    <p className="text-xs text-sky-400 font-medium mt-1">{trip._count.photos} Fotos</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                </button>
                <div className="border-t border-gray-50 px-3 py-2 flex justify-end">
                  <button onClick={() => deleteTrip(trip.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 transition-colors py-1">
                    <Trash2 size={12} /> Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
