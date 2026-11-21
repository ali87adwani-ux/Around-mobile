import type { Lang } from '@/data/types';

const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dateFromOffset(offset: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + offset);
  return d;
}

export function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function offsetOf(d: Date): number {
  return Math.round((d.getTime() - startOfToday().getTime()) / 86400000);
}

export function weekdayShort(d: Date, lang: Lang) {
  return (lang === 'ar' ? daysAr : daysEn)[d.getDay()];
}

export function formatDay(d: Date, lang: Lang, labels: { today: string; tomorrow: string }) {
  const off = offsetOf(d);
  if (off === 0) return labels.today;
  if (off === 1) return labels.tomorrow;
  const months = lang === 'ar' ? monthsAr : monthsEn;
  return lang === 'ar'
    ? `${weekdayShort(d, lang)} ${d.getDate()} ${months[d.getMonth()]}`
    : `${weekdayShort(d, lang)}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export function formatHour(h: number, lang: Lang) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  const pm = hh >= 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const suffix = lang === 'ar' ? (pm ? 'م' : 'ص') : pm ? 'PM' : 'AM';
  return `${h12}:${`${mm}`.padStart(2, '0')} ${suffix}`;
}

export function formatDuration(hrs: number, lang: Lang) {
  if (hrs < 1) return lang === 'ar' ? `${hrs * 60} دقيقة` : `${hrs * 60} min`;
  if (lang === 'ar') {
    if (hrs === 1) return 'ساعة';
    if (hrs === 1.5) return 'ساعة ونص';
    if (hrs === 2) return 'ساعتين';
    return `${hrs} ساعات`;
  }
  return `${hrs} h`;
}

// Kuwaiti dinar: show up to 3 decimals (fils), dropping trailing zeros.
export function formatMoney(n: number, lang: Lang) {
  const s = (Math.round(n * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 });
  return lang === 'ar' ? `${s} د.ك` : `KD ${s}`;
}

/* ---------- Kuwait time (UTC+3 all year, no daylight saving) ---------- */

const KW_OFFSET_MS = 3 * 3600 * 1000;

export function kwTodayISO(): string {
  return new Date(Date.now() + KW_OFFSET_MS).toISOString().slice(0, 10);
}

/** A Kuwait-local date + hour as an absolute timestamp string. */
export function kwTimestamp(dateISO: string, hour: number): string {
  const hh = `${Math.floor(hour)}`.padStart(2, '0');
  const mm = `${Math.round((hour % 1) * 60)}`.padStart(2, '0');
  return `${dateISO}T${hh}:${mm}:00+03:00`;
}

/** Kuwait-local date and hour of an absolute timestamp. */
export function kwParts(ts: string | Date): { dateISO: string; hour: number } {
  const d = new Date(new Date(ts).getTime() + KW_OFFSET_MS);
  return { dateISO: d.toISOString().slice(0, 10), hour: d.getUTCHours() + d.getUTCMinutes() / 60 };
}

/** Whole days from Kuwait-today to a Kuwait date. */
export function kwOffset(dateISO: string): number {
  return Math.round((Date.parse(dateISO) - Date.parse(kwTodayISO())) / 86400000);
}

export function kwDateFromOffset(offset: number): string {
  return new Date(Date.parse(kwTodayISO()) + offset * 86400000).toISOString().slice(0, 10);
}

const dayNamesAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** 0 = Sunday … 6 = Saturday */
export function dayLabel(i: number, lang: Lang) {
  return (lang === 'ar' ? dayNamesAr : dayNamesEn)[i];
}
export function daysLabel(days: number[], lang: Lang) {
  return [...days].sort().map((d) => dayLabel(d, lang)).join(lang === 'ar' ? '، ' : ', ');
}
