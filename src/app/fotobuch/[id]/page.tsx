'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, Loader2, Trash2, ImagePlus, MapPin, Download, Pencil, Check, X, Image as ImageIcon } from 'lucide-react';
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
  coverPhoto?: string;
  photos: Photo[];
}

interface UploadingPhoto {
  id: string;
  preview: string;
  status: 'uploading' | 'done' | 'error';
}

// ---- Helpers ----

async function extractGPS(file: File): Promise<{ lat: number; lon: number } | null> {
  try {
    const exifr = await import('exifr');
    const result = await exifr.default.parse(file, { gps: true, tiff: false });
    if (!result?.latitude || !result?.longitude) return null;
    return { lat: result.latitude, lon: result.longitude };
  } catch { return null; }
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
    const name = addr.tourism || addr.amenity || addr.historic || addr.leisure ||
      addr.natural || addr.shop || addr.suburb || addr.neighbourhood ||
      addr.road || data.display_name?.split(',')[0] || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const country = addr.country || '';
    return { name: name.trim(), ort: [city, country].filter(Boolean).join(', ') };
  } catch { return null; }
}

function getImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

function latLonToTileXY(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = Math.floor((1 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) / 2 * n);
  return { x, y };
}

function latLonToPixel(lat: number, lon: number, zoom: number, originX: number, originY: number, tileSize = 256) {
  const n = Math.pow(2, zoom);
  const xFloat = (lon + 180) / 360 * n;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const yFloat = (1 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) / 2 * n;
  return { px: (xFloat - originX) * tileSize, py: (yFloat - originY) * tileSize };
}

async function buildMapDataUrl(pins: { lat: number; lon: number; num: number }[]): Promise<string | null> {
  if (pins.length === 0) return null;

  const TILE_SIZE = 256;
  const TILES_W = 4;
  const TILES_H = 3;

  const lats = pins.map(p => p.lat);
  const lons = pins.map(p => p.lon);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const maxDiff = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));

  const zoom =
    maxDiff < 0.002 ? 17 :
    maxDiff < 0.01 ? 15 :
    maxDiff < 0.08 ? 13 :
    maxDiff < 0.5 ? 11 :
    maxDiff < 5 ? 8 : 5;

  const centerTile = latLonToTileXY(centerLat, centerLon, zoom);
  const originX = centerTile.x - Math.floor(TILES_W / 2);
  const originY = centerTile.y - Math.floor(TILES_H / 2);

  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * TILES_W;
  canvas.height = TILE_SIZE * TILES_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b8d4e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await Promise.all(
    Array.from({ length: TILES_H }, (_, ty) =>
      Array.from({ length: TILES_W }, (_, tx) =>
        new Promise<void>(res => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { ctx.drawImage(img, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE); res(); };
          img.onerror = () => res();
          img.src = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${originX + tx}/${originY + ty}.png`;
        })
      )
    ).flat()
  );

  for (const pin of pins) {
    const { px, py } = latLonToPixel(pin.lat, pin.lon, zoom, originX, originY);
    const R = 16;
    ctx.beginPath();
    ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(pin.num).padStart(2, '0'), px, py);
  }

  return canvas.toDataURL('image/png');
}

// ---- Component ----

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const inputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

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
  const [uploadingCover, setUploadingCover] = useState(false);

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
      id: Math.random().toString(36).slice(2), preview: URL.createObjectURL(f), status: 'uploading' as const,
    }));
    setUploading(prev => [...prev, ...newUploads]);
    for (let i = 0; i < images.length; i++) {
      const file = images[i]; const uid = newUploads[i].id;
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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const resized = await resizeImage(file, 1200);
      await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverPhoto: resized }),
      });
      setTrip(prev => prev ? { ...prev, coverPhoto: resized } : prev);
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const setCoverFromPhoto = async (photo: Photo) => {
    await fetch(`/api/trips/${tripId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverPhoto: photo.imageData }),
    });
    setTrip(prev => prev ? { ...prev, coverPhoto: photo.imageData } : prev);
    setSelectedPhoto(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); processFiles(Array.from(e.dataTransfer.files));
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
    setSavingLocation(false); setEditingLocation(false);
  };

  const openPhoto = (photo: Photo) => {
    setSelectedPhoto(photo); setEditNote(photo.note); setEditingLocation(false);
  };

  const startEditLocation = () => {
    if (!selectedPhoto) return;
    setEditPlaceName(selectedPhoto.placeName); setEditPlaceOrt(selectedPhoto.placeOrt); setEditingLocation(true);
  };

  // ---- PDF Export ----
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

      // ---- SEITE 1: COVER ----
      // Deckblatt: Vollformatfoto + eleganter Textbereich darunter
      if (trip.coverPhoto) {
        try {
          const fmt = trip.coverPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          // Foto nimmt obere 65% der Seite ein
          const coverH = ph * 0.65;
          doc.addImage(trip.coverPhoto, fmt, 0, 0, pw, coverH, undefined, 'FAST');
          // Dünner weißer Trennstrich
          doc.setFillColor(255, 255, 255);
          doc.rect(0, coverH, pw, 2, 'F');
          // Unterer Bereich: cremefarbener Hintergrund
          doc.setFillColor(250, 249, 246);
          doc.rect(0, coverH + 2, pw, ph - coverH - 2, 'F');
          // Akzentlinie links
          doc.setFillColor(14, 165, 233);
          doc.rect(ml, coverH + 14, 3, 28, 'F');
          // Titel
          doc.setFontSize(26); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
          doc.text(trip.name, ml + 8, coverH + 24);
          doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
          doc.text(trip.destination, ml + 8, coverH + 33);
          // Datum + Anzahl
          doc.setFontSize(8.5); doc.setTextColor(148, 163, 184);
          const meta: string[] = [];
          if (trip.startDate) meta.push(trip.endDate ? `${trip.startDate} – ${trip.endDate}` : trip.startDate);
          meta.push(`${trip.photos.length} Fotos`);
          doc.text(meta.join('   ·   '), ml + 8, coverH + 41);
        } catch {
          renderFallbackCover(doc, trip, pw, ml, cw);
        }
      } else {
        renderFallbackCover(doc, trip, pw, ml, cw);
      }

      // ---- SEITE 2: KARTE ----
      const pinsForMap = trip.photos
        .map((p, i) => ({ ...p, num: i + 1 }))
        .filter(p => p.lat != null && p.lon != null)
        .map(p => ({ lat: p.lat!, lon: p.lon!, num: p.num }));

      if (pinsForMap.length > 0) {
        doc.addPage();

        // Seitentitel
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
        doc.text('STANDORTE', ml, 14);
        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
        doc.text('Wo wir waren', ml, 23);
        doc.setFillColor(14, 165, 233);
        doc.rect(ml, 26, 20, 1.5, 'F');

        // Karte
        const mapImg = await buildMapDataUrl(pinsForMap);
        const mapY = 32;
        const mapH = 110;
        if (mapImg) {
          doc.addImage(mapImg, 'PNG', ml, mapY, cw, mapH, undefined, 'FAST');
          // Rahmen um Karte
          doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
          doc.rect(ml, mapY, cw, mapH);
        }

        // Legende: Standorte nach Ort gruppiert (keine Duplikate)
        interface LegendGroup { nums: number[]; name: string; ort: string }
        const groups: LegendGroup[] = [];
        pinsForMap.forEach(pin => {
          const photo = trip.photos[pin.num - 1];
          const key = `${photo.placeName}||${photo.placeOrt}`;
          const existing = groups.find(g => `${g.name}||${g.ort}` === key);
          if (existing) { existing.nums.push(pin.num); }
          else { groups.push({ nums: [pin.num], name: photo.placeName || '', ort: photo.placeOrt || '' }); }
        });

        let ly = mapY + mapH + 10;
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(148, 163, 184);
        doc.text('LEGENDE', ml, ly); ly += 6;

        // 2 Spalten, je Gruppe eine Zeile
        const colW2 = (cw - 6) / 2;
        let col = 0;
        let rowBaseY = ly;

        for (const g of groups) {
          const lx = ml + col * (colW2 + 6);
          if (ly > ph - 18) break; // Kein Platz mehr

          // Nummern-Badges
          const numStr = g.nums.map(n => String(n).padStart(2, '0')).join(', ');
          doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(239, 68, 68);
          doc.text(numStr, lx, ly);

          // Ortsname
          doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
          const nameShort = g.name.length > 30 ? g.name.slice(0, 28) + '…' : g.name || '–';
          doc.text(nameShort, lx, ly + 5);

          // Stadt, Land
          if (g.ort) {
            doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
            const ortShort = g.ort.length > 32 ? g.ort.slice(0, 30) + '…' : g.ort;
            doc.text(ortShort, lx, ly + 10);
          }

          col++;
          if (col === 2) { col = 0; rowBaseY = ly + 16; ly = rowBaseY; }
          else if (col === 1) { /* stay on same row */ }
        }
        void rowBaseY;
      }

      // ---- FOTOS: 2 pro Seite, richtiges Seitenverhältnis ----
      // Professionelle Fotobuch-Optik: großzügige Ränder, klare Typografie
      const PAGE_ML = 15;        // Rand links/rechts
      const PAGE_CW = pw - PAGE_ML * 2;
      const MAX_IMG_H = 88;      // mm max Bildhöhe
      const CAPTION_H = 18;      // mm für Ort + Notiz
      const SLOT_H = MAX_IMG_H + CAPTION_H + 8; // pro Foto-Slot
      const DIVIDER_Y = ph / 2;  // Seitentrennlinie bei A4-Hälfte

      let slotOnPage = 0;
      let y = 0;

      for (let i = 0; i < trip.photos.length; i++) {
        const photo = trip.photos[i];
        const num = String(i + 1).padStart(2, '0');

        if (slotOnPage === 0) {
          doc.addPage();
          y = 14;
          slotOnPage = 0;
        }

        // Foto mit korrektem Seitenverhältnis
        const { w, h } = await getImageSize(photo.imageData);
        const aspect = h / w;
        let imgW = PAGE_CW, imgH = PAGE_CW * aspect;
        if (imgH > MAX_IMG_H) { imgH = MAX_IMG_H; imgW = MAX_IMG_H / aspect; }
        const imgX = PAGE_ML + (PAGE_CW - imgW) / 2;
        const imgY = y;

        try {
          const fmt = photo.imageData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(photo.imageData, fmt, imgX, imgY, imgW, imgH, undefined, 'FAST');
        } catch {
          doc.setFillColor(243, 244, 246);
          doc.rect(imgX, imgY, imgW, imgH, 'F');
        }

        // Nummern-Badge über dem Bild (oben links, dezent)
        doc.setFillColor(239, 68, 68);
        doc.roundedRect(imgX, imgY, 11, 7, 1, 1, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(num, imgX + 2, imgY + 5);

        // Caption-Bereich unter dem Bild
        let captionY = imgY + imgH + 4;

        if (photo.placeName) {
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
          doc.text(photo.placeName, PAGE_ML, captionY);
          captionY += 5;
        }
        if (photo.placeOrt) {
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
          doc.text(photo.placeOrt, PAGE_ML, captionY);
          captionY += 5;
        }
        if (photo.note) {
          doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 100, 60);
          const noteLines = doc.splitTextToSize(`"${photo.note}"`, PAGE_CW);
          doc.text(noteLines.slice(0, 2), PAGE_ML, captionY); // max 2 Zeilen
        }

        if (slotOnPage === 0) {
          // Dünne Trennlinie genau in der Seitenmitte
          y = DIVIDER_Y - 2;
          doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.2);
          doc.line(PAGE_ML, y, PAGE_ML + PAGE_CW, y);
          y = DIVIDER_Y + 5;
          slotOnPage = 1;
        } else {
          slotOnPage = 0;
        }
        void SLOT_H;
      }

      // ---- FOOTER: Seitenzahl zentriert ----
      const pageCount = doc.getNumberOfPages();
      for (let p = 2; p <= pageCount; p++) { // Ab Seite 2 (Cover ohne Footer)
        doc.setPage(p);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 200, 200);
        const pageStr = `${p - 1}`;
        doc.text(pageStr, pw / 2 - doc.getTextWidth(pageStr) / 2, ph - 6);
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
                {exportingPDF ? 'PDF…' : 'PDF'}
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
        {/* Titelbild */}
        <div className="mb-5">
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
          {trip.coverPhoto ? (
            <div className="relative rounded-2xl overflow-hidden shadow-sm" style={{ height: 160 }}>
              <img src={trip.coverPhoto} alt="Titelbild" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-3">
                <span className="text-white text-xs font-semibold bg-black/30 backdrop-blur-sm px-2 py-1 rounded-lg">Titelbild</span>
              </div>
              <button onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}
                className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-xl flex items-center gap-1">
                {uploadingCover ? <Loader2 size={11} className="animate-spin" /> : <Pencil size={11} />}
                Ändern
              </button>
            </div>
          ) : (
            <button onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}
              className="w-full h-28 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-1.5 hover:border-sky-300 hover:bg-sky-50/30 transition-all">
              {uploadingCover
                ? <Loader2 size={20} className="text-sky-400 animate-spin" />
                : <ImageIcon size={20} className="text-gray-300" />}
              <p className="text-sm text-gray-400 font-medium">Titelbild hinzufügen</p>
              <p className="text-xs text-gray-300">Erscheint auf dem PDF-Deckblatt</p>
            </button>
          )}
        </div>

        {/* Karte */}
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
                {u.status === 'uploading' && <Loader2 size={16} className="text-sky-400 animate-spin" />}
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
                <div className="relative">
                  <button className="w-full" onClick={() => openPhoto(photo)}>
                    <img src={photo.imageData} alt={photo.placeName || 'Foto'} className="w-full max-h-72 object-cover" />
                  </button>
                  <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-md">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                </div>
                <div className="p-4">
                  {(photo.placeName || photo.placeOrt) && (
                    <div className="flex items-start gap-1.5 mb-3">
                      <MapPin size={13} className="text-sky-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {photo.placeName && <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{photo.placeName}</p>}
                        {photo.placeOrt && <p className="text-xs text-gray-400">{photo.placeOrt}</p>}
                      </div>
                    </div>
                  )}
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

      {/* Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setSelectedPhoto(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-t-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
            <img src={selectedPhoto.imageData} alt="" className="w-full max-h-64 object-contain bg-gray-50" />

            <div className="p-5 space-y-4">
              {/* Ort */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ort</p>
                  {!editingLocation && (
                    <button onClick={startEditLocation} className="flex items-center gap-1 text-xs text-sky-500 font-medium">
                      <Pencil size={11} /> Bearbeiten
                    </button>
                  )}
                </div>
                {editingLocation ? (
                  <div className="space-y-2">
                    <input value={editPlaceName} onChange={e => setEditPlaceName(e.target.value)}
                      placeholder="Ortsname z.B. Playa de las Américas"
                      className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300" />
                    <input value={editPlaceOrt} onChange={e => setEditPlaceOrt(e.target.value)}
                      placeholder="Stadt, Land z.B. Teneriffa, Spanien"
                      className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300" />
                    <div className="flex gap-2">
                      <button onClick={() => setEditingLocation(false)}
                        className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium flex items-center justify-center gap-1">
                        <X size={13} /> Abbrechen
                      </button>
                      <button onClick={saveLocation} disabled={savingLocation}
                        className="flex-1 py-2 bg-sky-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1 hover:bg-sky-600 disabled:opacity-50">
                        {savingLocation ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Speichern
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

              {/* Notiz */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Meine Notiz</p>
                <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                  placeholder="Was war besonders? Wie war das Wetter? Erinnerungen…"
                  className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-300 resize-none" rows={4} />
                <button onClick={saveNote} disabled={savingNote}
                  className="mt-2 w-full py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold hover:bg-sky-600 disabled:opacity-50">
                  {savingNote ? 'Speichert…' : 'Notiz speichern'}
                </button>
              </div>

              {/* Als Titelbild */}
              <button onClick={() => setCoverFromPhoto(selectedPhoto)}
                className="w-full py-2.5 flex items-center justify-center gap-2 text-sky-500 hover:text-sky-600 text-sm font-medium transition-colors border border-sky-200 rounded-xl">
                <ImageIcon size={14} /> Als Titelbild setzen
              </button>

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

// Hilfsfunktion für Cover-Seite ohne Foto
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderFallbackCover(doc: any, trip: { name: string; destination: string; startDate?: string; endDate?: string; photos: { length: number } }, pw: number, ml: number, cw: number) {
  void cw;
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, pw, 55, 'F');
  doc.setFillColor(7, 89, 133);
  doc.rect(0, 45, pw, 10, 'F');
  doc.setFontSize(24); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(trip.name, ml, 22);
  doc.setFontSize(14); doc.setFont('helvetica', 'normal');
  doc.text(trip.destination, ml, 34);
  doc.setFontSize(9); doc.setTextColor(186, 230, 253);
  if (trip.startDate) {
    const dateStr = trip.endDate ? `${trip.startDate}  –  ${trip.endDate}` : trip.startDate;
    doc.text(dateStr, ml, 51);
  }
  doc.text(`${trip.photos.length} Fotos`, pw - ml - doc.getTextWidth(`${trip.photos.length} Fotos`), 51);
}
