'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MapPin, BookImage, Plus, ChevronRight } from 'lucide-react';

interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  coverPhoto?: string;
  _count: { photos: number };
}

export default function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    fetch('/api/trips').then(r => r.json()).then(setTrips).catch(() => {});
  }, []);

  const recent = trips.slice(0, 3);

  return (
    <div className="min-h-screen pb-10">
      {/* Hero */}
      <div className="bg-gradient-to-br from-sky-500 to-indigo-600 px-5 pt-14 pb-10 text-white">
        <p className="text-sky-200 text-sm font-medium mb-1">Willkommen zurück</p>
        <h1 className="text-3xl font-bold mb-1">Urlaub App ✈️</h1>
        <p className="text-sky-100 text-sm">Planen, erleben, erinnern</p>
      </div>

      <div className="px-5 -mt-5">
        {/* Main cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link href="/planer" className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group">
            <div className="w-11 h-11 bg-sky-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-sky-200 transition-colors">
              <MapPin size={22} className="text-sky-600" />
            </div>
            <p className="font-bold text-gray-900 text-sm mb-0.5">Reiseplaner</p>
            <p className="text-xs text-gray-400 leading-relaxed">KI plant deinen Urlaub</p>
          </Link>

          <Link href="/fotobuch" className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group">
            <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-amber-200 transition-colors">
              <BookImage size={22} className="text-amber-600" />
            </div>
            <p className="font-bold text-gray-900 text-sm mb-0.5">Fotobuch</p>
            <p className="text-xs text-gray-400 leading-relaxed">Digitales Reise-Album</p>
          </Link>
        </div>

        {/* Recent trips */}
        {recent.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-700">Letzte Reisen</p>
              <Link href="/fotobuch" className="text-xs text-sky-500 font-medium flex items-center gap-0.5">
                Alle <ChevronRight size={12} />
              </Link>
            </div>
            <div className="space-y-2">
              {recent.map(trip => (
                <Link
                  key={trip.id}
                  href={`/fotobuch/${trip.id}`}
                  className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-sky-100 to-indigo-100 flex-shrink-0">
                    {trip.coverPhoto
                      ? <img src={trip.coverPhoto} alt={trip.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl">🏖️</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{trip.name}</p>
                    <p className="text-xs text-gray-400">{trip.destination}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{trip._count.photos} Fotos</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {recent.length === 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">✈️</div>
            <p className="font-semibold text-gray-700 mb-1">Noch kein Urlaub geplant</p>
            <p className="text-sm text-gray-400 mb-4">Starte mit dem Reiseplaner oder lege dein erstes Fotobuch an</p>
            <div className="flex gap-2 justify-center">
              <Link href="/planer" className="px-4 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors">
                Jetzt planen
              </Link>
              <Link href="/fotobuch" className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Fotobuch
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
