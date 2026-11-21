/**
 * "Invite your friends" from a booking: turns the booking into a private game (or opens the one
 * already made for it) so the organiser can share the code and each player's share of the price.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import type { PitchSize } from '@/data/types';
import { fromISODate, offsetOf } from '@/i18n/format';
import { useApp } from './AppStore';

export function useInviteFriends() {
  const { allMatches, meId, createMatch, state } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const invite = async (b: { id: string; pitchId: string; dateISO: string; hour: number; duration: number; size: number; total: number }) => {
    const dayOffset = offsetOf(fromISODate(b.dateISO));
    const existing = allMatches.find((m) => m.organizerId === meId && m.pitchId === b.pitchId && m.dayOffset === dayOffset && m.hour === b.hour);
    if (existing) {
      router.push({ pathname: '/match/[id]', params: { id: existing.id, invite: '1' } });
      return { ok: true as const };
    }
    setBusy(b.id);
    const size = b.size as PitchSize;
    const r = await createMatch({
      pitchId: b.pitchId,
      dayOffset,
      hour: b.hour,
      duration: b.duration,
      format: size,
      level: state.profile.level,
      pricePerPlayer: Math.ceil((b.total / (size * 2)) * 4) / 4,
      isPrivate: true,
    });
    setBusy(null);
    if (r.ok && r.id) router.push({ pathname: '/match/[id]', params: { id: r.id, invite: '1' } });
    return r;
  };

  return { invite, busy };
}
