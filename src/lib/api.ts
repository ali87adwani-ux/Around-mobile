/**
 * Supabase data access. Maps database rows to the app's types.
 * Only used when the backend is configured (see src/lib/supabase.ts).
 */
import type { AppNotification, Booking, Match, PendingPitch, Pitch, PitchSubmissionInput, Player, TeamRow, Tournament } from '@/data/types';
import { kwDateFromOffset, kwOffset, kwParts, kwTimestamp } from '@/i18n/format';
import { supabase } from './supabase';

const db = () => {
  if (!supabase) throw new Error('backend_not_configured');
  return supabase;
};

export type OwnerSlot = { id: string; hour: number; duration: number; status: 'confirmed' | 'blocked'; playerName: string; total: number };

const palette = ['#0B2E6F', '#1E56B3', '#C2185B', '#E65100', '#6A1B9A', '#00838F', '#5D4037', '#283593', '#AD1457', '#2E7D32'];
export function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function hoursBetween(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
}

/** Turns "P0001: slot_taken" style Postgres errors into the short code our functions raise. */
export function errorCode(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.match(/[a-z_]{4,}/);
  return m ? m[0] : 'unknown';
}

export async function fetchPitches(): Promise<Pitch[]> {
  const { data, error } = await db().from('pitches').select('*').order('rating', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    ownerId: r.owner_id ?? undefined,
    name: { ar: r.name_ar, en: r.name_en },
    area: { ar: r.area_ar, en: r.area_en },
    address: { ar: r.address_ar, en: r.address_en },
    pricePerHour: Number(r.price_per_hour),
    sizes: r.sizes,
    surface: r.surface,
    indoor: r.indoor,
    rating: Number(r.rating),
    reviews: r.reviews,
    distanceKm: 0,
    amenities: r.amenities,
    openFrom: r.open_from,
    openTo: r.open_to,
    tint: [r.tint[0], r.tint[1] ?? r.tint[0]],
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    active: r.active,
    status: r.status ?? 'approved',
    governorate: r.governorate,
  }));
}

export async function fetchMatches(): Promise<{ matches: Match[]; playerIds: string[] }> {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data, error } = await db()
    .from('matches')
    .select('*, match_players(user_id, joined_at)')
    .in('status', ['open', 'played'])
    .gte('starts_at', since)
    .order('starts_at');
  if (error) throw error;
  const ids = new Set<string>();
  const matches: Match[] = (data ?? []).map((r) => {
    const { dateISO, hour } = kwParts(r.starts_at);
    const players = [...(r.match_players ?? [])].sort((a: { joined_at: string }, b: { joined_at: string }) => a.joined_at.localeCompare(b.joined_at)).map((p: { user_id: string }) => p.user_id);
    players.forEach((p) => ids.add(p));
    if (r.organizer_id) ids.add(r.organizer_id);
    return {
      id: r.id,
      pitchId: r.pitch_id,
      dayOffset: kwOffset(dateISO),
      hour,
      duration: Number(r.duration_hours),
      format: r.format,
      level: r.level,
      pricePerPlayer: Number(r.price_per_player),
      maxPlayers: r.max_players,
      playerIds: players,
      organizerId: r.organizer_id ?? '',
    };
  });
  return { matches, playerIds: [...ids] };
}

export async function fetchPlayers(ids: string[]): Promise<Player[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from('profiles').select('id, name, position, level, avatar_url').in('id', ids);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: { ar: r.name || 'لاعب', en: r.name || 'Player' },
    position: r.position,
    level: r.level,
    area: { ar: '', en: '' },
    stats: { matches: 0, goals: 0, assists: 0, mvp: 0, wins: 0, rating: 0 },
    color: colorFor(r.id),
    avatarUrl: r.avatar_url ?? undefined,
  }));
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const { data, error } = await db().from('tournaments').select('*, tournament_teams(*), fixtures(*)').order('starts_on');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const teams: TeamRow[] = (r.tournament_teams ?? []).map((tm: Record<string, any>) => ({
      id: tm.id,
      name: { ar: tm.name_ar, en: tm.name_en },
      played: tm.played,
      won: tm.won,
      drawn: tm.drawn,
      lost: tm.lost,
      gf: tm.gf,
      ga: tm.ga,
      color: tm.color,
      captainId: tm.captain_id ?? undefined,
    }));
    return {
      id: r.id,
      name: { ar: r.name_ar, en: r.name_en },
      pitchId: r.pitch_id,
      format: r.format,
      status: r.status,
      startOffset: kwOffset(r.starts_on),
      maxTeams: r.max_teams,
      entryFee: Number(r.entry_fee),
      prize: Number(r.prize),
      tint: [r.tint[0], r.tint[1] ?? r.tint[0]],
      teams,
      fixtures: (r.fixtures ?? [])
        .map((f: Record<string, any>) => {
          const { dateISO, hour } = kwParts(f.starts_at);
          return {
            id: f.id,
            homeId: f.home_id,
            awayId: f.away_id,
            dayOffset: kwOffset(dateISO),
            hour,
            score: f.home_score == null ? undefined : ([f.home_score, f.away_score] as [number, number]),
          };
        })
        .sort((a: { dayOffset: number; hour: number }, b: { dayOffset: number; hour: number }) => a.dayOffset * 24 + a.hour - (b.dayOffset * 24 + b.hour)),
    } as Tournament;
  });
}

export async function fetchMyBookings(userId: string): Promise<Booking[]> {
  const { data, error } = await db().from('bookings').select('*').eq('user_id', userId).neq('status', 'blocked').order('starts_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const { dateISO, hour } = kwParts(r.starts_at);
    return {
      id: r.id,
      pitchId: r.pitch_id,
      dateISO,
      hour,
      duration: hoursBetween(r.starts_at, r.ends_at),
      size: r.size,
      total: Number(r.total),
      status: r.status === 'cancelled' ? 'cancelled' : 'confirmed',
      createdAt: new Date(r.created_at).getTime(),
    } as Booking;
  });
}

/** Hours (Kuwait local) that are taken on a pitch for a given day. */
export async function fetchBusyHours(pitchId: string, dateISO: string): Promise<number[]> {
  const { data, error } = await db().rpc('pitch_busy', { p_pitch: pitchId, p_day: dateISO });
  if (error) throw error;
  const hours = new Set<number>();
  for (const r of (data ?? []) as { starts_at: string; ends_at: string }[]) {
    const s = kwParts(r.starts_at);
    const e = kwParts(r.ends_at);
    const start = s.dateISO < dateISO ? 0 : s.hour;
    const end = e.dateISO > dateISO ? 24 : e.hour;
    for (let h = Math.floor(start); h < end; h++) hours.add(h);
  }
  return [...hours];
}

export async function bookPitch(p: { pitchId: string; dateISO: string; hour: number; duration: number; size: number }) {
  const { data, error } = await db().rpc('book_pitch', { p_pitch: p.pitchId, p_starts: kwTimestamp(p.dateISO, p.hour), p_hours: p.duration, p_size: p.size });
  if (error) throw error;
  return data as { id: string };
}

export async function cancelBooking(id: string) {
  const { error } = await db().rpc('cancel_booking', { p_booking: id });
  if (error) throw error;
}

export async function createMatch(p: { pitchId: string; dayOffset: number; hour: number; duration: number; format: number; level: string }) {
  const { data, error } = await db().rpc('create_match', {
    p_pitch: p.pitchId,
    p_starts: kwTimestamp(kwDateFromOffset(p.dayOffset), p.hour),
    p_hours: p.duration,
    p_format: p.format,
    p_level: p.level,
  });
  if (error) throw error;
  return data as { id: string };
}

export async function joinMatch(id: string) {
  const { error } = await db().rpc('join_match', { p_match: id });
  if (error) throw error;
}

export async function leaveMatch(id: string) {
  const { error } = await db().rpc('leave_match', { p_match: id });
  if (error) throw error;
}

export async function registerTeam(tournamentId: string, name: string) {
  const { error } = await db().rpc('register_team', { p_tournament: tournamentId, p_name: name });
  if (error) throw error;
}

export async function fetchProfile(userId: string) {
  const { data, error } = await db().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as { id: string; name: string; position: Player['position']; level: Player['level']; role: 'player' | 'owner' | 'academy' | 'admin'; avatar_url: string | null } | null;
}

export async function updateProfile(userId: string, p: { name?: string; position?: string; level?: string }) {
  const { error } = await db().from('profiles').update(p).eq('id', userId);
  if (error) throw error;
}

/* ---------- pitch owners ---------- */

export async function ownerDay(pitchId: string, dateISO: string): Promise<OwnerSlot[]> {
  const { data, error } = await db().rpc('owner_day', { p_pitch: pitchId, p_day: dateISO });
  if (error) throw error;
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    hour: kwParts(r.starts_at).hour,
    duration: hoursBetween(r.starts_at, r.ends_at),
    status: r.status === 'blocked' ? 'blocked' : 'confirmed',
    playerName: r.player_name,
    total: Number(r.total),
  }));
}

export async function ownerBlock(pitchId: string, dateISO: string, hour: number) {
  const { error } = await db().rpc('owner_block_slot', { p_pitch: pitchId, p_starts: kwTimestamp(dateISO, hour), p_hours: 1 });
  if (error) throw error;
}

export async function ownerUnblock(bookingId: string) {
  const { error } = await db().rpc('owner_unblock', { p_booking: bookingId });
  if (error) throw error;
}

export async function ownerUpdatePrice(pitchId: string, price: number) {
  const { error } = await db().from('pitches').update({ price_per_hour: price }).eq('id', pitchId);
  if (error) throw error;
}

/* ---------- profile photo ---------- */

/** Uploads a local image to the avatars bucket and stores its public URL on the profile. */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const res = await fetch(localUri);
  const body = await res.arrayBuffer();
  const type = res.headers.get('content-type') || 'image/jpeg';
  const path = `${userId}/avatar.jpg`;
  const { error } = await db().storage.from('avatars').upload(path, body, { contentType: type, upsert: true });
  if (error) throw error;
  const { data } = db().storage.from('avatars').getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`; // bust caches after a change
  const { error: e2 } = await db().from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (e2) throw e2;
  return url;
}

export async function removeAvatar(userId: string) {
  await db().storage.from('avatars').remove([`${userId}/avatar.jpg`]);
  const { error } = await db().from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) throw error;
}

export type ReportDay = { dateISO: string; bookings: number; hours: number; revenue: number };

export async function ownerReport(pitchId: string, days: number): Promise<ReportDay[]> {
  const { data, error } = await db().rpc('owner_report', { p_pitch: pitchId, p_days: days });
  if (error) throw error;
  return ((data ?? []) as Record<string, any>[]).map((r) => ({ dateISO: String(r.day).slice(0, 10), bookings: Number(r.bookings), hours: Number(r.hours), revenue: Number(r.revenue) }));
}

export async function ownerUpdatePitch(pitchId: string, p: { openFrom?: number; openTo?: number; amenities?: string[]; price?: number }) {
  const row: Record<string, unknown> = {};
  if (p.openFrom !== undefined) row.open_from = p.openFrom;
  if (p.openTo !== undefined) row.open_to = p.openTo;
  if (p.amenities !== undefined) row.amenities = p.amenities;
  if (p.price !== undefined) row.price_per_hour = p.price;
  const { error } = await db().from('pitches').update(row).eq('id', pitchId);
  if (error) throw error;
}

/* ---------- reviews ---------- */

export async function fetchReviews(pitchId: string) {
  const { data, error } = await db().from('pitch_reviews').select('*, profiles(name)').eq('pitch_id', pitchId).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return ((data ?? []) as Record<string, any>[]).map((r) => ({ id: r.id, pitchId: r.pitch_id, userId: r.user_id, userName: r.profiles?.name ?? '', rating: r.rating, comment: r.comment, at: Date.parse(r.created_at) }));
}

export async function reviewPitch(pitchId: string, rating: number, comment: string) {
  const { error } = await db().rpc('review_pitch', { p_pitch: pitchId, p_rating: rating, p_comment: comment });
  if (error) throw error;
}

/* ---------- pitch listings by owners ---------- */

export async function submitPitch(p: PitchSubmissionInput) {
  const { error } = await db().rpc('submit_pitch', {
    p_name: p.name, p_area: p.area, p_governorate: p.governorate, p_address: p.address, p_price: p.price, p_sizes: p.sizes,
    p_surface: p.surface, p_indoor: p.indoor, p_amenities: p.amenities, p_open_from: p.openFrom, p_open_to: p.openTo,
    p_phone: p.phone, p_note: p.note, p_lat: p.lat ?? null, p_lng: p.lng ?? null,
  });
  if (error) throw error;
}

export async function withdrawPitch(pitchId: string) {
  const { error } = await db().rpc('withdraw_pitch', { p_pitch: pitchId });
  if (error) throw error;
}

export async function adminPitchSubmissions(): Promise<PendingPitch[]> {
  const { data, error } = await db().rpc('admin_pitch_submissions');
  if (error) throw error;
  return (data ?? []).map((r: { pitch_id: string; owner_id: string; owner_name: string; contact_phone: string; note: string; created_at: string }) => ({
    pitchId: r.pitch_id, ownerId: r.owner_id, ownerName: r.owner_name, phone: r.contact_phone, note: r.note, at: new Date(r.created_at).getTime(),
  }));
}

export async function adminReviewPitch(pitchId: string, approve: boolean, reason = '') {
  const { error } = await db().rpc('admin_review_pitch', { p_pitch: pitchId, p_approve: approve, p_reason: reason });
  if (error) throw error;
}

/* ---------- account ---------- */

export async function deleteMyAccount() {
  const { error } = await db().rpc('delete_my_account');
  if (error) throw error;
}

/* ---------- notifications ---------- */

type NotificationRow = { id: string; kind: string; title_ar: string; title_en: string; body_ar: string; body_en: string; data: Record<string, string> | null; read_at: string | null; created_at: string };

export function mapNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    title: { ar: r.title_ar, en: r.title_en },
    body: { ar: r.body_ar, en: r.body_en },
    data: r.data ?? {},
    read: !!r.read_at,
    at: new Date(r.created_at).getTime(),
  };
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await db().from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map(mapNotification);
}

export async function markNotificationsRead(ids?: string[]) {
  const { error } = await db().rpc('mark_notifications_read', { p_ids: ids ?? null });
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await db().from('notifications').delete().eq('id', id);
  if (error) throw error;
}

export async function registerPushToken(token: string, platform: string, lang: string) {
  const { error } = await db().rpc('register_push_token', { p_token: token, p_platform: platform, p_lang: lang });
  if (error) throw error;
}

export async function unregisterPushToken(token: string) {
  await db().rpc('unregister_push_token', { p_token: token });
}
