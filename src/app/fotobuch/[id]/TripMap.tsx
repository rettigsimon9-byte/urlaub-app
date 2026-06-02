'use client';

import { useEffect, useRef } from 'react';

export interface PhotoPin {
  id: string;
  lat: number;
  lon: number;
  placeName: string;
  thumbnail: string;
  num: number;
}

interface Cluster {
  photos: PhotoPin[];
  lat: number;
  lon: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clusterPhotos(photos: PhotoPin[], radiusKm = 0.3): Cluster[] {
  const clusters: Cluster[] = [];
  for (const photo of photos) {
    let merged = false;
    for (const c of clusters) {
      if (haversineKm(c.lat, c.lon, photo.lat, photo.lon) < radiusKm) {
        c.photos.push(photo);
        c.lat = c.photos.reduce((s, p) => s + p.lat, 0) / c.photos.length;
        c.lon = c.photos.reduce((s, p) => s + p.lon, 0) / c.photos.length;
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ photos: [photo], lat: photo.lat, lon: photo.lon });
  }
  return clusters;
}

export default function TripMap({ photos }: { photos: PhotoPin[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || photos.length === 0) return;
    let cancelled = false;

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return;

      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (instanceRef.current) {
        (instanceRef.current as ReturnType<typeof L.map>).remove();
        instanceRef.current = null;
      }

      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false });
      instanceRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      const clusters = clusterPhotos(photos);

      clusters.forEach(cluster => {
        const count = cluster.photos.length;
        const nums = cluster.photos.map(p => String(p.num).padStart(2, '0'));

        // Pin-Label: Einzelfoto zeigt Nummer, Gruppe zeigt Nummern
        const pinLabel = count === 1
          ? `<span style="font-size:11px;font-weight:700">${nums[0]}</span>`
          : `<span style="font-size:9px;font-weight:700;line-height:1.1">${nums.join('<br>')}</span>`;

        const pinH = count === 1 ? 26 : Math.min(16 + count * 12, 56);
        const pinW = 26;

        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#ef4444;color:#fff;border-radius:${count === 1 ? '50%' : '8px'};width:${pinW}px;height:${pinH}px;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);flex-direction:column;gap:1px">${pinLabel}</div>`,
          iconSize: [pinW, pinH],
          iconAnchor: [pinW / 2, pinH / 2],
          popupAnchor: [0, -pinH / 2 - 4],
        });

        // Popup-Inhalt
        const names = Array.from(new Set(cluster.photos.map(p => p.placeName).filter(Boolean)));
        const popupLines = cluster.photos.map(p =>
          `<div style="display:flex;align-items:center;gap:5px;padding:2px 0">
            <span style="background:#ef4444;color:#fff;border-radius:4px;padding:1px 4px;font-size:10px;font-weight:700;flex-shrink:0">${String(p.num).padStart(2, '0')}</span>
            <span style="font-size:12px;color:#374151">${p.placeName || '–'}</span>
          </div>`
        ).join('');

        L.marker([cluster.lat, cluster.lon], { icon })
          .addTo(map)
          .bindPopup(`<div style="min-width:140px">${popupLines}${names.length > 0 ? '' : ''}</div>`);
      });

      const bounds = L.latLngBounds(photos.map(p => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    });

    return () => { cancelled = true; };
  }, [photos]);

  useEffect(() => {
    return () => {
      if (instanceRef.current) {
        (instanceRef.current as { remove: () => void }).remove();
        instanceRef.current = null;
      }
    };
  }, []);

  if (photos.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm mb-5 border border-gray-100">
      <div id="trip-map-container" ref={mapRef} style={{ height: 220, width: '100%' }} />
    </div>
  );
}
