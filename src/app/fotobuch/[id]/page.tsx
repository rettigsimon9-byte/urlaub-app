'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, Loader2, Trash2, ImagePlus, MapPin, Download, Pencil, Check, X } from 'lucide-react';
import { resizeImage } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { PhotoPin } from './TripMap';

const TripMap = dynamic(() => import('./TripMap'), { ssr: false });

interface Photo {
  id: string;
  imageData: string;
  thumbnail: string;
  photoDate?: string;
  note: string;
  placeName: string;
  placeType: string;
  placeOrt: string;
  lat?: number | null;
  lon?: number | null;
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
    const exifr = await import('exifr');
    const result = await exifr.default.parse(file, { gps: true, tiff: false });
    if (!result?.latitude || !result?.longitude) return null;
    return { lat: result.latitude, lon: result.longitude };
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<{ name: string; ort: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=de&zoom=17`,
      { headers: { 'User-Agent': 'UrlaubApp/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const name =
      addr.tourism || addr.amenity || addr.historic || addr.leisure ||
      addr.natural || addr.shop || addr.suburb || addr.neighbourhood ||
      addr.road || data.display_name?.split(',')[0] || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const country = addr.country || '';
    return { name: name.trim(), ort: [city, country].filter(Boolean).join(', ') };
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
  const [editingLocation, setEditingLocation] = useState(false);
  const [editPlaceName, setEditPlaceName] = useState('');
  const [editPlaceOrt, setEditPlaceOrt] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

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
        const [display, thumb] = await Promise.all([resizeImage(file, 1200), resizeImage(file, 300)]);
        const gps = await extractGPS(file);
        let placeName = '', placeOrt = '', lat: number | null = null, lon: number | null = null;
        if (gps) {
          lat = gps.lat; lon = gps.lon;
          const geo = await reverseGeocode(gps.lat, gps.lon);
          if (geo) { placeName = geo.name; placeOrt = geo.ort; }
        }
        const saveRes = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId, imageData: display, thumbnail: thumb, placeName, placeOrt, placeType: '', placeInfo: '', lat, lon }),
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
    e.preventDefault(); setDragOver(false);
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
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: editNote }),
    });
    setTrip(prev => prev ? { ...prev, photos: prev.photos.map(p => p.id === selectedPhoto.id ? { ...p, note: editNote } : p) } : prev);
    setSelectedPhoto(prev => prev ? { ...prev, note: editNote } : prev);
    setSavingNote(false);
  };

  const saveLocation = async () => {
    if (!selectedPhoto) return;
    setSavingLocation(true);
    await fetch(`/api/photos/${selectedPhoto.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeName: editPlaceName, placeOrt: editPlaceOrt }),
    });
    setTrip(prev => prev ? { ...prev, photos: prev.photos.map(p => p.id === selectedPhoto.id ? { ...p, placeName: editPlaceName, placeOrt: editPlaceOrt } : p) } : prev);
    setSelectedPhoto(prev => prev ? { ...prev, placeName: editPlaceName, placeOrt: editPlaceOrt } : prev);
    setSavingLocation(false);
    setEditingLocation(false);
  };

  const openPhoto = (photo: Photo) => {
    setSelectedPhoto(photo);
    setEditNote(photo.note);
    setEditingLocation(false);
  };

  const startEditLocation = () => {
    if (!selectedPhoto) return;
    setEditPlaceName(selectedPhoto.placeName);
    setEditPlaceOrt(selectedPhoto.placeOrt);
    setEditingLocation(true);
  };

  const exportPDF = async () => {
    if (!trip) return;
    setExportingPDF(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const ml = 12;
      const cw = pw - ml * 2;

      // ---- COVER ----
      doc.setFillColor(14, 165, 233);
      doc.rect(0, 0, pw, 45, 'F');
      doc.setFillColor(7, 89, 133);
      doc.rect(0, 37, pw, 8, 'F');

      doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text(trip.name, ml, 18);
      doc.setFontSize(13); doc.setFont('helvetica', 'normal');
      doc.text(trip.destination, ml, 28);
      doc.setFontSize(9); doc.setTextColor(186, 230, 253);
      doc.text(`${trip.photos.length} Fotos`, ml, 41);
      if (trip.startDate) {
        const dateStr = trip.endDate
          ? `${trip.startDate}  bis  ${trip.endDate}`
          : trip.startDate;
        doc.text(dateStr, pw - ml - doc.getTextWidth(dateStr), 41);
      }

      // ---- PHOTOS: 2 per page ----
      let y = 55;
      let slotOnPage = 0;

      for (let i = 0; i < trip.photos.length; i++) {
        const photo = trip.photos[i];
        const num = String(i + 1).padStart(2, '0');

        if (slotOnPage === 2) {
          doc.addPage(); y = 15; slotOnPage = 0;
        }

        const imgH = 72;
        const infoH = (photo.placeName || photo.placeOrt ? 8 : 0) + (photo.note ? 12 : 0);
        const sectionH = imgH + infoH + 6;

        // Number badge
        doc.setFillColor(239, 68, 68);
        doc.roundedRect(ml, y, 10, 6, 1, 1, 'F');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(num, ml + 1.8, y + 4.3);

        // Photo
        const imgY = y + 8;
        try {
          const fmt = photo.imageData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(photo.imageData, fmt, ml, imgY, cw, imgH, undefined, 'FAST');
        } catch {
          doc.setFillColor(240, 244, 248);
          doc.roundedRect(ml, imgY, cw, imgH, 2, 2, 'F');
          doc.setFontSize(9); doc.setTextColor(180, 180, 180);
          doc.text('Foto', ml + cw / 2 - 5, imgY + imgH / 2);
        }

        let infoY = imgY + imgH + 4;

        // Location
        if (photo.placeName || photo.placeOrt) {
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(14, 165, 233);
          doc.text('o', ml, infoY + 0.5); // pin placeholder
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
          const locParts = [photo.placeName, photo.placeOrt].filter(Boolean);
          const locLine = doc.splitTextToSize(locParts.join('  ·  '), cw - 6);
          doc.text(locLine[0], ml + 4, infoY + 0.5);
          if (locParts[1]) {
            doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
            doc.setFontSize(8);
            const sub = locParts.length > 1 ? locParts[1] : '';
            if (sub) doc.text(sub, ml + 4, infoY + 5);
          }
          infoY += 9;
        }

        // Note
        if (photo.note) {
          doc.setFillColor(255, 251, 235);
          const noteLines = doc.splitTextToSize(`"${photo.note}"`, cw - 6);
          const noteBoxH = noteLines.length * 3.8 + 5;
          doc.roundedRect(ml, infoY, cw, noteBoxH, 1.5, 1.5, 'F');
          doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 80, 20);
          doc.text(noteLines, ml + 3, infoY + 4);
          infoY += noteBoxH + 2;
        }

        y += sectionH + 8;

        // Divider between two photos on same page
        if (slotOnPage === 0 && i < trip.photos.length - 1) {
          doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
          doc.line(ml, y - 4, ml + cw, y - 4);
        }

        slotOnPage++;
      }

      // ---- FOOTER ----
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
        doc.text(`${trip.name}  ·  Seite ${p} / ${pageCount}`, ml, ph - 5);
      }

      doc.save(`Fotobuch-${trip.name}.pdf`);
    } catch (e) {
      console.error('PDF error:', e);
    } finally {
      setExportingPDF(false);
    }
  };

  const mapPhotos: PhotoPin[] = (trip?.photos ?? [])
    .map((p, i) => ({ ...p, num: i + 1 }))
    .filter(p => p.lat != null && p.lon != null)
    .map(p => ({ id: p.id, lat: p.lat!, lon: p.lon!, placeName: p.placeName, thumbnail: p.thumbnail, num: p.num }));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="text-sky-400 animate-spin" />
    </div>
  );

  if (!trip) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-gray-500">Reise nicht gefunden</p>
      <button onClick={() => router.push('/fotobuch')} className="text-sky-500 text-sm font-medium">Zurück</button>
    </div>
  );

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
          <div className="flex items-center gap-2">
            {trip.photos.length > 0 && (
              <button onClick={exportPDF} disabled={exportingPDF}
                className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 text-white rounded-xl text-xs font-semibold hover:bg-sky-600 transition-colors disabled:opacity-50">
                {exportingPDF ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                PDF
              </button>
            )}
            <button onClick={() => inputRef.current?.click()}
              className="w-9 h-9 bg-sky-500 rounded-full flex items-center justify-center shadow-md hover:bg-sky-600 transition-colors">
              <ImagePlus size={18} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5">
        <TripMap photos={mapPhotos} />

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-6 text-center mb-5 cursor-pointer transition-all ${dragOver ? 'border-sky-400 bg-sky-50' : 'border-gray-200 hover:border-sky-300 hover:bg-sky-50/30'}`}
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
                <p className="text-xs font-medium text-gray-600 flex-1">
                  {u.status === 'uploading' && 'Wird gespeichert…'}
                  {u.status === 'done' && '✅ Gespeichert'}
                  {u.status === 'error' && '⚠️ Fehler'}
                </p>
                {u.status === 'uploading' && <Loader2 size={16} className="text-sky-400 animate-spin flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {/* Photo list */}
        {trip.photos.length === 0 && uploading.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📷</div>
            <p className="text-gray-400 text-sm">Noch keine Fotos — ziehe Bilder ins Feld oben</p>
          </div>
        ) : (
          <div className="space-y-4">
            {trip.photos.map((photo, i) => (
              <div key={photo.id} className="bg-white rounded-3xl overflow-hidden shadow-sm">
                {/* Number + Photo */}
                <div className="relative">
                  <button className="w-full" onClick={() => openPhoto(photo)}>
                    <img src={photo.imageData} alt={photo.placeName || 'Foto'} className="w-full max-h-72 object-cover" />
                  </button>
                  <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-md">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                </div>

                <div className="p-4">
                  {(photo.placeName || photo.placeOrt) ? (
                    <div className="flex items-start gap-1.5 mb-3">
                      <MapPin size={13} className="text-sky-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {photo.placeName && <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{photo.placeName}</p>}
                        {photo.placeOrt && <p className="text-xs text-gray-400">{photo.placeOrt}</p>}
                      </div>
                    </div>
                  ) : null}

                  {photo.note ? (
                    <div className="bg-amber-50 rounded-xl px-3 py-2 border-l-4 border-amber-300">
                      <p className="text-sm text-amber-800 italic">"{photo.note}"</p>
                    </div>
                  ) : (
                    <button onClick={() => openPhoto(photo)} className="text-xs text-gray-300 hover:text-gray-400 transition-colors">
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
              {/* Location — anzeigen oder bearbeiten */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ort</p>
                  {!editingLocation && (
                    <button onClick={startEditLocation}
                      className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 font-medium">
                      <Pencil size={11} /> Bearbeiten
                    </button>
                  )}
                </div>

                {editingLocation ? (
                  <div className="space-y-2">
                    <input
                      value={editPlaceName}
                      onChange={e => setEditPlaceName(e.target.value)}
                      placeholder="Ortsname z.B. Playa de las Américas"
                      className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    <input
                      value={editPlaceOrt}
                      onChange={e => setEditPlaceOrt(e.target.value)}
                      placeholder="Stadt, Land z.B. Teneriffa, Spanien"
                      className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setEditingLocation(false)}
                        className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium flex items-center justify-center gap-1">
                        <X size={13} /> Abbrechen
                      </button>
                      <button onClick={saveLocation} disabled={savingLocation}
                        className="flex-1 py-2 bg-sky-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1 hover:bg-sky-600 disabled:opacity-50">
                        {savingLocation ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Speichern
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <MapPin size={15} className="text-sky-400 mt-0.5 flex-shrink-0" />
                    <div>
                      {selectedPhoto.placeName
                        ? <p className="font-semibold text-gray-900">{selectedPhoto.placeName}</p>
                        : <p className="text-gray-400 text-sm italic">Kein Ort hinterlegt</p>}
                      {selectedPhoto.placeOrt && <p className="text-sm text-gray-400">{selectedPhoto.placeOrt}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Note */}
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
