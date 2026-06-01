'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, MapPin, Utensils, Zap, Package, Lightbulb } from 'lucide-react';

interface PlanResult {
  sehenswuerdigkeiten: { name: string; beschreibung: string; tipp: string; dauer: string }[];
  restaurants: { name: string; typ: string; beschreibung: string; preisklasse: string }[];
  aktivitaeten: { name: string; beschreibung: string; typ: string }[];
  packliste: { kleidung: string[]; dokumente: string[]; sonstiges: string[] };
  geheimtipps: string[];
  beste_reisezeit: string;
  währung: string;
  sprache: string;
}

export default function PlanerPage() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [interessen, setInteressen] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'sights' | 'food' | 'activities' | 'pack' | 'tips'>('sights');

  const generate = async () => {
    if (!destination.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/planer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, startDate, endDate, interessen }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setActiveTab('sights');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'sights', label: 'Sights', icon: MapPin },
    { id: 'food', label: 'Essen', icon: Utensils },
    { id: 'activities', label: 'Aktiv', icon: Zap },
    { id: 'pack', label: 'Packen', icon: Package },
    { id: 'tips', label: 'Tipps', icon: Lightbulb },
  ] as const;

  return (
    <div className="min-h-screen pb-10">
      <div className="sticky top-0 z-10 bg-[#f0f4f8]/95 backdrop-blur-sm pt-12 pb-4 px-5">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Reiseplaner</h1>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input
            value={destination}
            onChange={e => setDestination(e.target.value)}
            placeholder="Reiseziel z.B. Barcelona, Japan, Kroatien..."
            className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 font-medium"
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-600" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-600" />
          </div>
          <input
            value={interessen}
            onChange={e => setInteressen(e.target.value)}
            placeholder="Interessen z.B. Strand, Kultur, Essen, Wandern..."
            className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 text-gray-500"
          />
          <button
            onClick={generate}
            disabled={loading || !destination.trim()}
            className="w-full py-3 bg-sky-500 text-white rounded-xl font-semibold text-sm hover:bg-sky-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> KI plant deinen Urlaub…</> : '🗺️ Reiseplan erstellen'}
          </button>
        </div>
      </div>

      <div className="px-5">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-500 mb-4">⚠️ {error}</div>}

        {result && (
          <div className="animate-slide-up">
            {/* Quick info */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Beste Zeit', value: result.beste_reisezeit },
                { label: 'Währung', value: result.währung },
                { label: 'Sprache', value: result.sprache },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{value}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                    activeTab === id ? 'bg-sky-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>

            {/* Sehenswürdigkeiten */}
            {activeTab === 'sights' && (
              <div className="space-y-3">
                {result.sehenswuerdigkeiten.map((s, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-bold text-gray-900">{s.name}</p>
                      <span className="text-xs text-sky-500 bg-sky-50 px-2 py-0.5 rounded-full flex-shrink-0">{s.dauer}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-2">{s.beschreibung}</p>
                    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">💡 {s.tipp}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Restaurants */}
            {activeTab === 'food' && (
              <div className="space-y-3">
                {result.restaurants.map((r, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-gray-900">{r.name}</p>
                      <span className="text-sm text-green-600 font-semibold">{r.preisklasse}</span>
                    </div>
                    <p className="text-xs text-indigo-500 font-medium mb-2">{r.typ}</p>
                    <p className="text-sm text-gray-600 leading-relaxed">{r.beschreibung}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Aktivitäten */}
            {activeTab === 'activities' && (
              <div className="space-y-3">
                {result.aktivitaeten.map((a, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-bold text-gray-900 flex-1">{a.name}</p>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a.typ}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{a.beschreibung}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Packliste */}
            {activeTab === 'pack' && (
              <div className="space-y-3">
                {[
                  { title: '👕 Kleidung', items: result.packliste.kleidung },
                  { title: '📄 Dokumente', items: result.packliste.dokumente },
                  { title: '🎒 Sonstiges', items: result.packliste.sonstiges },
                ].map(({ title, items }) => (
                  <div key={title} className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="font-bold text-gray-800 mb-3">{title}</p>
                    <div className="space-y-2">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 border-gray-200 flex-shrink-0" />
                          <p className="text-sm text-gray-600">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Geheimtipps */}
            {activeTab === 'tips' && (
              <div className="space-y-2">
                {result.geheimtipps.map((tip, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
                    <span className="text-lg flex-shrink-0">✨</span>
                    <p className="text-sm text-gray-700 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
