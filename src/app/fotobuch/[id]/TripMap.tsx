'use client';

import { useEffect, useRef } from 'react';

interface PhotoPin {
  id: string;
  lat: number;
  lon: number;
  placeName: string;
  thumbnail: string;
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

      // Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Destroy previous instance
      if (instanceRef.current) {
        (instanceRef.current as ReturnType<typeof L.map>).remove();
        instanceRef.current = null;
      }

      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false });
      instanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const clusters = clusterPhotos(photos);

      clusters.forEach(cluster => {
        const count = cluster.photos.length;
        const icon = L.divIcon({
          className: '',
          html: count > 1
            ? `<div style="background:#ef4444;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${count}</div>`
            : `<div style="position:relative;width:18px;height:18px"><div style="background:#ef4444;border-radius:50%;width:18px;height:18px;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div></div>`,
          iconSize: count > 1 ? [30, 30] : [18, 18],
          iconAnchor: count > 1 ? [15, 15] : [9, 9],
          popupAnchor: [0, count > 1 ? -15 : -9],
        });

        const names = Array.from(new Set(cluster.photos.map(p => p.placeName).filter(Boolean)));
        const label = names.length > 0 ? names.join(' · ') : `${count} Foto${count > 1 ? 's' : ''}`;

        L.marker([cluster.lat, cluster.lon], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-size:13px;font-weight:600;max-width:160px">${label}</div>`);
      });

      // Fit bounds
      const bounds = L.latLngBounds(photos.map(p => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    });

    return () => {
      cancelled = true;
    };
  }, [photos]);

  // Cleanup on unmount
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
      <div ref={mapRef} style={{ height: 220, width: '100%' }} />
    </div>
  );
}
