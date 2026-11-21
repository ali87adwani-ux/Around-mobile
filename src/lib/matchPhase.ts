/** Where a pickup game is in its life: not started yet, being played right now, or finished. */
import type { Match } from '@/data/types';
import { dateFromOffset, fromISODate } from '@/i18n/format';

export type MatchPhase = 'upcoming' | 'live' | 'ended';

export function matchTimes(m: Pick<Match, 'startsAt' | 'dayOffset' | 'hour' | 'duration'>) {
  const start = m.startsAt ?? dateFromOffset(m.dayOffset).getTime() + m.hour * 3600000;
  return { start, end: start + m.duration * 3600000 };
}

export function matchPhase(m: Pick<Match, 'startsAt' | 'dayOffset' | 'hour' | 'duration'>, now = Date.now()): MatchPhase {
  const { start, end } = matchTimes(m);
  if (now < start) return 'upcoming';
  if (now < end) return 'live';
  return 'ended';
}

/** "2h 10m" style pieces for a countdown. */
export function splitDuration(ms: number) {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
}

/** Same idea for a pitch booking (date + start hour + length). */
export function bookingPhase(b: { dateISO: string; hour: number; duration: number }, now = Date.now()): MatchPhase {
  const start = fromISODate(b.dateISO).getTime() + b.hour * 3600000;
  const end = start + b.duration * 3600000;
  return now < start ? 'upcoming' : now < end ? 'live' : 'ended';
}
