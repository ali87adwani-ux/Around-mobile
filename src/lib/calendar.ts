/**
 * "Add to calendar": on the web (iPhone Safari / home-screen app) we hand the phone an .ics file,
 * which opens the system "Add event" screen; elsewhere we open Google Calendar's add-event page.
 */
import { Linking, Platform } from 'react-native';

export interface CalEvent {
  title: string;
  start: number; // ms
  end: number; // ms
  location?: string;
  details?: string;
  url?: string;
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');

export function icsText(e: CalEvent) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Al Dawri//AR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.start}-${Math.random().toString(36).slice(2)}@aldawri`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.details || e.url ? `DESCRIPTION:${esc([e.details, e.url].filter(Boolean).join('\n'))}` : '',
    e.url ? `URL:${e.url}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(e.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export async function addToCalendar(e: CalEvent) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([icsText(e)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aldawri.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    details: [e.details, e.url].filter(Boolean).join('\n'),
    location: e.location ?? '',
  });
  await Linking.openURL(`https://calendar.google.com/calendar/render?${q.toString()}`);
}
