/** Device location (asked only when needed) and distances between coordinates. */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type Coords = { lat: number; lng: number };

export async function currentLocation(): Promise<Coords | null> {
  try {
    if (Platform.OS === 'web') {
      if (!('geolocation' in navigator)) return null;
      return await new Promise((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000 },
        ),
      );
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}

export function distanceKm(a: Coords, b: Coords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Reads coordinates out of a pasted Google / Apple Maps link, when the link carries them. */
export function coordsFromLink(link: string): Coords | null {
  const m =
    link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ??
    link.match(/[?&](?:q|query|ll|daddr|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i) ??
    link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ??
    link.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}
