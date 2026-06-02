'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, Loader2, Trash2, ImagePlus, MapPin } from 'lucide-react';
import { resizeImage } from '@/lib/utils';

interface Photo {
  id: string;
  imageData: string;
  thumbnail: string;
  photoDate?: string;
  note: string;
  placeName: string;
  placeType: string;
  placeOrt: string;
  createdAt: string;
}

interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  photos: Photo[];
}

interface UploadingPhoto {
  id: string;
  preview: string;
  status: 'uploading' | 'done' | 'error';
}

async function extractGPS(file: File): Promise<{ lat: number; lon: number } | null> {
  try {
    const { default: exifr } = await import('exifr');
    const gps = await exifr.gps(file);
    if (!gps || !gps.latitude || !gps.longitude) return null;
    return { lat: gps.latitude, lon: gps.longitude };
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<{ name: string; ort: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=de`,
      { headers: { 'User-Agent': 'UrlaubApp/1.0' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const name =
      addr.tourism || addr.amenity || addr.historic || addr.natural ||
      addr.leisure || addr.shop || addr.road || data.display_name?.split(',')[0] || '';
    const city = addr.city || addr.town || addr.village || addr.county || '';
    const country = addr.country || '';
    return {
      name: name.trim(),
      ort: [city, country].filter(Boolean).join(', '),
    };
  } catch {
    return null;
  }
}

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const inputRef = useRef<HTMLInputElement>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<UploadingPhoto[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [editNote, setEditNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    fetch(`/api/trips/${tripId}`)
      .then(r => r.json())
      .then(data => { setTrip(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tripId]);

  const processFiles = useCallback(async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (!images.length) return;

    const newUploads: UploadingPhoto[] = images.map(f => ({
      id: Math.random().toString(36).slice(2),
      preview: URL.createObjectURL(f),
      status: 'uploading' as const,
    }));
    setUploading(prev => [...prev, ...newUploads]);

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const uid = newUploads[i].id;
      try {
        const [display, thumb] = await Promise.all([
          resizeImage(file, 1200),
          resizeImage(file, 300),
        ]);

        const gps = await extractGPS(file);
        let placeName = '';
        let placeOrt = '';
        if (gps) {
          const geo = await reverseGeocode(gps.lat, gps.lon);
          if (geo) {
            placeName = geo.name;
            placeOrt = geo.ort;
          }
        }

        const saveRes = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId, imageData: display, thumbnail: thumb, placeName, placeOrt, placeType: '', placeInfo: '' }),
        });
        const savedPhoto = await saveRes.json();

        setTrip(prev => prev ? { ...prev, photos: [...prev.photos, savedPhoto] } : prev);
        setUploading(prev => prev.map(u => u.id === uid ? { ...u, status: 'done' } : u));
        setTimeout(() => setUploading(prev => prev.filter(u => u.id !== uid)), 1000);
      } catch {
        setUploading(prev => prev.map(u => u.id === uid ? { ...u, status: 'error' } : u));
        setTimeout(() => setUploading(prev => prev.filter(u => u.id !== uid)), 3000);
      }
    }
  }, [tripId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const deletePhoto = async (photoId: string) => {
    await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
    setTrip(prev => prev ? { ...prev, photos: prev.photos.filter(p => p.id !== photoId) } : prev);
    setSelectedPhoto(null);
  };

  const saveNote = async () => {
    if (!selectedPhoto) return;
    setSavingNote(true);
    await fetch(`/api/photos/${selectedPhoto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: editNote }),
    });
    setTrip(prev => prev ? {
      ...prev,
      photos: prev.photos.map(p => p.id === selectedPhoto.id ? { ...p, note: editNote } : p),
    } : prev);
    setSelectedPhoto(prev => prev ? { ...prev, note: editNote } : prev);
    setSavingNote(false);
  };

  const openPhoto = (photo: Photo) => {
    setSelectedPhoto(photo);
    setEditNote(photo.note);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="text-sky-400 animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-gray-500">Reise nicht gefunden</p>
        <button onClick={() => router.push('/fotobuch')} className="text-sky-500 text-sm font-medium">Zurück</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#f0f4f8]/95 backdrop-blur-sm pt-12 pb-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/fotobuch')} className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{trip.name}</h1>
              <p className="text-xs text-gray-400">{trip.destination} · {trip.photos.length} Fotos</p>
            </div>
          </div>
          <button onClick={() => inputRef.current?.click()}
            className="w-9 h-9 bg-sky-500 rounded-full flex items-center justify-center shadow-md hover:bg-sky-600 transition-colors">
            <ImagePlus size={18} className="text-white" />
          </button>
        </div>
      </div>

      <div className="px-5">
        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-6 text-center mb-5 cursor-pointer transition-all ${
            dragOver ? 'border-sky-400 bg-sky-50' : 'border-gray-200 hover:border-sky-300 hover:bg-sky-50/30'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files) processFiles(Array.from(e.target.files)); }} />
          <ImagePlus size={24} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400 font-medium">Fotos hineinziehen oder antippen</p>
          <p className="text-xs text-gray-300 mt-1">Ort wird automatisch aus GPS-Daten ermittelt</p>
        </div>

        {/* Upload progress */}
        {uploading.length > 0 && (
          <div className="space-y-2 mb-4">
            {uploading.map(u => (
              <div key={u.id} className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm">
                <img src={u.preview} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-600">
                    {u.status === 'uploading' && 'Wird gespeichert…'}
                    {u.status === 'done' && '✅ Gespeichert'}
                    {u.status === 'error' && '⚠️ Fehler'}
                  </p>
                </div>
                {u.status === 'uploading' && (
                  <Loader2 size={16} className="text-sky-400 animate-spin flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Photo book */}
        {trip.photos.length === 0 && uploading.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📷</div>
            <p className="text-gray-400 text-sm">Noch keine Fotos — ziehe Bilder ins Feld oben</p>
          </div>
        ) : (
          <div className="space-y-4">
            {trip.photos.map(photo => (
              <div key={photo.id} className="bg-white rounded-3xl overflow-hidden shadow-sm">
                <button className="w-full" onClick={() => openPhoto(photo)}>
                  <img src={photo.imageData} alt={photo.placeName || 'Foto'}
                    className="w-full max-h-72 object-cover" />
                </button>

                <div className="p-4">
                  {/* Ort aus GPS */}
                  {(photo.placeName || photo.placeOrt) ? (
                    <div className="flex items-start gap-1.5 mb-3">
                      <MapPin size={13} className="text-sky-400 mt-0.5 flex-shrink-0" />
                      <div>
                        {photo.placeName && (
                          <p className="font-semibold text-gray-900 text-sm leading-tight">{photo.placeName}</p>
                        )}
                        {photo.placeOrt && (
                          <p className="text-xs text-gray-400">{photo.placeOrt}</p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Eigene Notiz */}
                  {photo.note ? (
                    <div className="bg-amber-50 rounded-xl px-3 py-2 border-l-4 border-amber-300">
                      <p className="text-sm text-amber-800 italic">"{photo.note}"</p>
                    </div>
                  ) : (
                    <button onClick={() => openPhoto(photo)}
                      className="text-xs text-gray-300 hover:text-gray-400 transition-colors">
                      + Notiz hinzufügen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photo detail modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setSelectedPhoto(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-t-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <img src={selectedPhoto.imageData} alt="" className="w-full max-h-64 object-contain bg-gray-50" />

            <div className="p-5 space-y-4">
              {/* Ort */}
              {(selectedPhoto.placeName || selectedPhoto.placeOrt) && (
                <div className="flex items-start gap-2">
                  <MapPin size={15} className="text-sky-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {selectedPhoto.placeName && (
                      <p className="font-semibold text-gray-900">{selectedPhoto.placeName}</p>
                    )}
                    {selectedPhoto.placeOrt && (
                      <p className="text-sm text-gray-400">{selectedPhoto.placeOrt}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Notiz-Editor */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Meine Notiz</p>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="Was war besonders? Wie war das Wetter? Erinnerungen…"
                  className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                  rows={4}
                />
                <button onClick={saveNote} disabled={savingNote}
                  className="mt-2 w-full py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-600 transition-colors disabled:opacity-50">
                  {savingNote ? 'Speichert…' : 'Notiz speichern'}
                </button>
              </div>

              <button onClick={() => deletePhoto(selectedPhoto.id)}
                className="w-full py-2.5 flex items-center justify-center gap-2 text-red-400 hover:text-red-500 text-sm font-medium transition-colors">
                <Trash2 size={14} /> Foto löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
