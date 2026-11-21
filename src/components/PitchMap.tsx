/**
 * Map of pitches. The web app draws an OpenStreetMap map with Leaflet (loaded on demand);
 * the phone app shows the same list with "open in Maps" until the native map is added.
 */
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import type { Pitch } from '@/data/types';
import { colors, radius } from '@/theme';

import { LEAFLET_CSS } from './leafletCss';

let loading: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (loading) return loading;
  const style = document.createElement('style');
  style.textContent = LEAFLET_CSS;
  document.head.appendChild(style);
  loading = import('leaflet').then((m: any) => m.default ?? m);
  return loading;
}

export interface MapPin {
  pitch: Pitch;
  label: string;
  sub: string;
}

export function PitchMap({ pins, me, onOpen, openLabel, height = 420 }: { pins: MapPin[]; me?: { lat: number; lng: number } | null; onOpen: (id: string) => void; openLabel: string; height?: number }) {
  const ref = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current) return;
        const el = ref.current as unknown as HTMLElement;
        if (!mapRef.current) {
          mapRef.current = L.map(el, { zoomControl: true, attributionControl: true }).setView([29.33, 47.98], 10);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapRef.current);
          layerRef.current = L.layerGroup().addTo(mapRef.current);
        }
        const layer = layerRef.current;
        layer.clearLayers();
        const pts: [number, number][] = [];
        for (const p of pins) {
          if (p.pitch.lat == null || p.pitch.lng == null) continue;
          pts.push([p.pitch.lat, p.pitch.lng]);
          const icon = L.divIcon({
            className: '',
            html: `<div dir="rtl" style="display:inline-block;width:max-content;background:${colors.primary};color:#fff;border-radius:14px;padding:3px 9px;font:600 12px system-ui;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff;transform:translate(-50%,-50%)">⚽ ${p.sub}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });
          const m = L.marker([p.pitch.lat, p.pitch.lng], { icon }).addTo(layer);
          const box = document.createElement('div');
          box.style.cssText = 'font:14px system-ui;min-width:150px;text-align:center';
          box.innerHTML = `<b>${p.label.replace(/</g, '&lt;')}</b><br/><span style="color:#667">${p.sub}</span><br/>`;
          const btn = document.createElement('button');
          btn.textContent = openLabel;
          btn.style.cssText = `margin-top:6px;background:${colors.primary};color:#fff;border:0;border-radius:10px;padding:6px 14px;font-weight:600`;
          btn.onclick = () => openRef.current(p.pitch.id);
          box.appendChild(btn);
          m.bindPopup(box);
        }
        if (me) {
          L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1E88E5', fillOpacity: 1 }).addTo(layer);
          pts.push([me.lat, me.lng]);
        }
        if (pts.length) mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
        setTimeout(() => mapRef.current?.invalidateSize(), 200);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pins, me, openLabel]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  if (Platform.OS !== 'web') return null;
  return <View ref={ref} style={{ height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted }} />;
}
