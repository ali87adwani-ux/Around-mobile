/**
 * Approximate prayer times for Kuwait City (29.37°N, 47.98°E, UTC+3), Kuwait method
 * (Fajr 18°, Isha 17.5°, Asr Shafi'i). Accurate to a few minutes — enough to hint on the booking grid.
 */
const LAT = 29.3759;
const LNG = 47.9774;
const TZ = 3;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => {
  const x = a - b * Math.floor(a / b);
  return x < 0 ? x + b : x;
};

function sunPosition(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15;
  const eqt = q / 15 - fix(RA, 24);
  const decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L))));
  return { decl, eqt };
}

function julian(y: number, m: number, d: number) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** Prayer times as decimal hours (Kuwait local) for a date `YYYY-MM-DD`. */
export function prayerTimes(dateISO: string): Record<PrayerName, number> {
  const [y, m, d] = dateISO.split('-').map(Number);
  const jd = julian(y, m, d) - LNG / (15 * 24);
  const { decl, eqt } = sunPosition(jd + 0.5);
  const noon = fix(12 - eqt, 24) + TZ - LNG / 15;
  const hourAngle = (angle: number) =>
    deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(LAT))) / (Math.cos(rad(decl)) * Math.cos(rad(LAT))))) / 15;
  const asrAngle = -deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(LAT - decl))))));
  return {
    fajr: noon - hourAngle(18),
    dhuhr: noon + 2 / 60,
    asr: noon + hourAngle(asrAngle),
    maghrib: noon + hourAngle(0.833) + 3 / 60,
    isha: noon + hourAngle(17.5),
  };
}

/** The prayer that falls inside [hour, hour + 1), if any. */
export function prayerInHour(dateISO: string, hour: number): { name: PrayerName; at: number } | undefined {
  const times = prayerTimes(dateISO);
  for (const name of Object.keys(times) as PrayerName[]) {
    const at = times[name];
    if (at >= hour && at < hour + 1) return { name, at };
  }
  return undefined;
}
