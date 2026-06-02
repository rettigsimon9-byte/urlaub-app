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

async function extractExif(file: File): Promise<{ lat: number | null; lon: number | null; date: string | null }> {
  try {
    const exifr = await import('exifr');
    const result = await exifr.default.parse(file, { gps: true, tiff: true, exif: true });
    if (!result) return { lat: null, lon: null, date: null };

    const lat = result.latitude ?? null;
    const lon = result.longitude ?? null;

    let date: string | null = null;
    const raw = result.DateTimeOriginal ?? result.DateTime;
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      date = raw.toISOString().split('T')[0];
    }

    return { lat, lon, date };
  } catch {
    return { lat: null, lon: null, date: null };
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
        const exif = await extractExif(file);
        const { lat, lon } = exif;
        let placeName = '', placeOrt = '';
        if (lat && lon) {
          const geo = await reverseGeocode(lat, lon);
          if (geo) { placeName = geo.name; placeOrt = geo.ort; }
        }
        const saveRes = await fetch('/api/photos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId, imageData: display, thumbnail: thumb, placeName, placeOrt, placeType: '', placeInfo: '', lat, lon, photoDate: exif.date }),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = doc as any;
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const ml = 12;
      const cw = pw - ml * 2;

      // Hilfsfunktion: dunkle Seite anlegen
      const darkPage = () => {
        doc.addPage();
        d.setFillColor(28, 28, 30);
        d.rect(0, 0, pw, ph, 'F');
      };

      // Hilfsfunktion: Polaroid-Karte zeichnen
      // Gibt die tatsächliche Kartenhöhe zurück
      const drawPolaroid = async (
        photo: { imageData: string; placeName: string; placeOrt: string; note: string },
        num: string,
        cardX: number,
        cardY: number,
        cardW: number,
      ): Promise<number> => {
        const PAD = 5;
        const BOTTOM = 22;
        const MAX_H = 78;

        const { w, h } = await getImageSize(photo.imageData);
        const aspect = h / w;
        let photoW = cardW - PAD * 2;
        let photoH = photoW * aspect;
        if (photoH > MAX_H) { photoH = MAX_H; photoW = photoH / aspect; }
        const cardH = PAD + photoH + PAD + BOTTOM;

        // Schatten (leicht versetzt, dunkelgrau auf dunklem Hintergrund)
        d.setFillColor(10, 10, 12);
        d.rect(cardX + 4, cardY + 4, cardW, cardH, 'F');

        // Weißer Polaroid-Rahmen
        d.setFillColor(255, 255, 255);
        d.rect(cardX, cardY, cardW, cardH, 'F');

        // Foto einbetten
        const photoX = cardX + PAD + (cardW - PAD * 2 - photoW) / 2;
        const photoY = cardY + PAD;
        try {
          const fmt = photo.imageData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          d.addImage(photo.imageData, fmt, photoX, photoY, photoW, photoH, undefined, 'FAST');
        } catch {
          d.setFillColor(220, 220, 220);
          d.rect(photoX, photoY, photoW, photoH, 'F');
        }

        // Caption im weißen Unterteil
        const capY = cardY + PAD + photoH + PAD + 4;
        // Ort
        if (photo.placeName) {
          d.setFontSize(8); d.setFont('helvetica', 'bold'); d.setTextColor(30, 30, 30);
          const name = photo.placeName.length > 24 ? photo.placeName.slice(0, 22) + '…' : photo.placeName;
          d.text(name, cardX + PAD, capY);
        }
        if (photo.placeOrt) {
          d.setFontSize(6.5); d.setFont('helvetica', 'normal'); d.setTextColor(130, 130, 130);
          const ort = photo.placeOrt.length > 28 ? photo.placeOrt.slice(0, 26) + '…' : photo.placeOrt;
          d.text(ort, cardX + PAD, capY + (photo.placeName ? 5 : 0));
        }
        if (photo.note && !photo.placeName) {
          d.setFontSize(7); d.setFont('helvetica', 'italic'); d.setTextColor(80, 80, 80);
          d.text(`"${photo.note.slice(0, 28)}"`, cardX + PAD, capY);
        }

        // Rote Nummern-Badge oben rechts
        d.setFillColor(220, 50, 50);
        d.roundedRect(cardX + cardW - 14, cardY + 3, 12, 7, 1, 1, 'F');
        d.setFontSize(6.5); d.setFont('helvetica', 'bold'); d.setTextColor(255, 255, 255);
        d.text(num, cardX + cardW - 12.5, cardY + 7.5);

        return cardH;
      };

      // ---- SEITE 1: COVER ----
      d.setFillColor(28, 28, 30);
      d.rect(0, 0, pw, ph, 'F');

      if (trip.coverPhoto) {
        try {
          // Großes zentrales Polaroid-Cover
          const coverCardW = pw - 36;
          const coverCardX = 18;
          const { w: cw2, h: ch2 } = await getImageSize(trip.coverPhoto);
          const coverAspect = ch2 / cw2;
          let coverPhotoW = coverCardW - 8;
          let coverPhotoH = coverPhotoW * coverAspect;
          if (coverPhotoH > 140) {
            coverPhotoH = 140;
            coverPhotoW = coverPhotoH / coverAspect; // Breite proportional reduzieren
          }
          const coverCardH = 4 + coverPhotoH + 4 + 24;
          const coverCardY = (ph - coverCardH) / 2 - 20;

          // Schatten
          d.setFillColor(8, 8, 10);
          d.rect(coverCardX + 5, coverCardY + 5, coverCardW, coverCardH, 'F');
          // Weiße Karte
          d.setFillColor(255, 255, 255);
          d.rect(coverCardX, coverCardY, coverCardW, coverCardH, 'F');
          // Cover-Foto
          const fmt = trip.coverPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          d.addImage(trip.coverPhoto, fmt, coverCardX + 4, coverCardY + 4, coverPhotoW, coverPhotoH, undefined, 'FAST');
          // Titel im Polaroid-Unterteil
          d.setFontSize(11); d.setFont('helvetica', 'bold'); d.setTextColor(30, 30, 30);
          d.text(trip.name, coverCardX + 8, coverCardY + 4 + coverPhotoH + 12);
          d.setFontSize(8); d.setFont('helvetica', 'normal'); d.setTextColor(140, 140, 140);
          d.text(trip.destination, coverCardX + 8, coverCardY + 4 + coverPhotoH + 19);
        } catch {
          // Fallback-Titel
          d.setFontSize(28); d.setFont('helvetica', 'bold'); d.setTextColor(255, 255, 255);
          d.text(trip.name, 18, ph / 2);
        }
      } else {
        // Kein Cover-Foto: eleganter Titel auf Dunkel
        d.setFontSize(32); d.setFont('helvetica', 'bold'); d.setTextColor(255, 255, 255);
        d.text(trip.name, 18, ph / 2 - 10);
        d.setFontSize(14); d.setFont('helvetica', 'normal'); d.setTextColor(150, 150, 155);
        d.text(trip.destination, 18, ph / 2 + 5);
      }
      // Datum + Anzahl unten
      d.setFontSize(8); d.setFont('helvetica', 'normal'); d.setTextColor(100, 100, 105);
      const metaParts: string[] = [];
      if (trip.startDate) metaParts.push(trip.endDate ? `${trip.startDate} – ${trip.endDate}` : trip.startDate);
      metaParts.push(`${trip.photos.length} Fotos`);
      d.text(metaParts.join('   ·   '), 18, ph - 18);

      // ---- SEITE 2: KARTE ----
      const pinsForMap = trip.photos
        .map((p, i) => ({ ...p, num: i + 1 }))
        .filter(p => p.lat != null && p.lon != null)
        .map(p => ({ lat: p.lat!, lon: p.lon!, num: p.num, placeName: p.placeName, placeOrt: p.placeOrt }));

      if (pinsForMap.length > 0) {
        darkPage();

        // Titel
        d.setFontSize(9); d.setFont('helvetica', 'bold'); d.setTextColor(100, 100, 110);
        d.text('STANDORTE', 18, 18);
        d.setFontSize(22); d.setFont('helvetica', 'bold'); d.setTextColor(240, 240, 245);
        d.text('Wo wir waren', 18, 28);
        d.setFillColor(239, 68, 68);
        d.rect(18, 31, 18, 1.5, 'F');

        // Karte: direkt aus der App-Ansicht per html2canvas capturen
        // → sieht 1:1 wie die Leaflet-Karte in der App aus
        let mapImg: string | null = null;
        const mapEl = document.getElementById('trip-map-container');
        if (mapEl) {
          try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(mapEl, {
              useCORS: true,
              allowTaint: false,
              logging: false,
              scale: 2,
            });
            mapImg = canvas.toDataURL('image/png');
          } catch {
            mapImg = await buildMapDataUrl(pinsForMap);
          }
        } else {
          mapImg = await buildMapDataUrl(pinsForMap);
        }

        const mapX = 18, mapY = 37, mapW = pw - 36, mapH = 115;
        if (mapImg) {
          d.setFillColor(255, 255, 255);
          d.rect(mapX - 2, mapY - 2, mapW + 4, mapH + 4, 'F');
          d.addImage(mapImg, 'PNG', mapX, mapY, mapW, mapH, undefined, 'FAST');
        }

        // Legende als saubere Liste
        interface LegendGroup { nums: number[]; name: string; ort: string }
        const groups: LegendGroup[] = [];
        pinsForMap.forEach(pin => {
          const key = `${pin.placeName}||${pin.placeOrt}`;
          const existing = groups.find(g => `${g.name}||${g.ort}` === key);
          if (existing) existing.nums.push(pin.num);
          else groups.push({ nums: [pin.num], name: pin.placeName || '', ort: pin.placeOrt || '' });
        });

        let ly = mapY + mapH + 12;
        d.setFontSize(7.5); d.setFont('helvetica', 'bold'); d.setTextColor(100, 100, 110);
        d.text('LEGENDE', 18, ly); ly += 7;

        const colW = (pw - 36 - 8) / 2;
        let col = 0;
        let rowY = ly;

        for (const g of groups) {
          if (rowY > ph - 14) break;
          const lx = 18 + col * (colW + 8);
          // Nummern rot
          const numStr = g.nums.map(n => String(n).padStart(2, '0')).join(', ');
          d.setFontSize(7); d.setFont('helvetica', 'bold'); d.setTextColor(220, 80, 80);
          d.text(numStr, lx, rowY);
          // Ort
          d.setFontSize(8); d.setFont('helvetica', 'bold'); d.setTextColor(220, 220, 230);
          d.text((g.name || '–').slice(0, 28), lx, rowY + 5);
          // Stadt
          if (g.ort) {
            d.setFontSize(6.5); d.setFont('helvetica', 'normal'); d.setTextColor(120, 120, 130);
            d.text(g.ort.slice(0, 30), lx, rowY + 10);
          }
          col++;
          if (col === 2) { col = 0; rowY += 16; }
        }
      }

      // ---- FOTOS: 2 pro Seite, Polaroid-Stil, gestreutes Layout ----
      // Linke Karte: oben links; Rechte Karte: unten rechts (wie im Screenshot)
      const CARD_W = 95;

      for (let i = 0; i < trip.photos.length; i += 2) {
        darkPage();

        const photoA = trip.photos[i];
        const numA = String(i + 1).padStart(2, '0');

        // Karte A: oben links
        const cardAx = 10;
        const cardAy = 14;
        const cardAH = await drawPolaroid(photoA, numA, cardAx, cardAy, CARD_W);

        // Karte B (falls vorhanden): unten rechts, leicht versetzt
        if (i + 1 < trip.photos.length) {
          const photoB = trip.photos[i + 1];
          const numB = String(i + 2).padStart(2, '0');
          const cardBx = pw - CARD_W - 10;
          // Y-Start: unterhalb von Karte A, plus Versatz für den gestaffelten Look
          const cardBy = Math.max(cardAy + cardAH + 12, ph / 2 - 10);
          await drawPolaroid(photoB, numB, cardBx, cardBy, CARD_W);
        }
      }

      // ---- FOOTER: Seitenzahl ----
      const pageCount = doc.getNumberOfPages();
      for (let p = 2; p <= pageCount; p++) {
        doc.setPage(p);
        d.setFontSize(7); d.setFont('helvetica', 'normal'); d.setTextColor(80, 80, 85);
        const ps = String(p - 1);
        d.text(ps, pw / 2 - doc.getTextWidth(ps) / 2, ph - 6);
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
