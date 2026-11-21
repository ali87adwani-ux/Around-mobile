import type { Pitch, PitchSize } from '@/data/types';
import { fromISODate } from '@/i18n/format';

export const OFF_PEAK_DISCOUNT = 0.2;
const sizeMultiplier: Record<PitchSize, number> = { 5: 1, 6: 1.2, 7: 1.5, 11: 2.4 };

/** Kick-off before 5 PM, Sunday to Wednesday. Mirrors public.off_peak_factor() on the server. */
export function isOffPeak(dateISO: string, hour: number) {
  const day = fromISODate(dateISO).getDay();
  return hour < 17 && day >= 0 && day <= 3;
}

export function bookingPrice(pitch: Pitch, size: PitchSize, duration: number, dateISO?: string, hour?: number) {
  const base = pitch.pricePerHour * sizeMultiplier[size] * duration;
  const factor = dateISO != null && hour != null && isOffPeak(dateISO, hour) ? 1 - OFF_PEAK_DISCOUNT : 1;
  return { full: Math.round(base * 2) / 2, price: Math.round(base * factor * 2) / 2, discounted: factor < 1 };
}
