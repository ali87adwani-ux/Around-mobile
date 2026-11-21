/**
 * Supabase data access. Maps database rows to the app's types.
 * Only used when the backend is configured (see src/lib/supabase.ts).
 */
import type { AppNotification, Booking, DuesRow, Fixture, Highlight, Match, MatchEvent, PendingPitch, Pitch, PitchSubmissionInput, Player, RosterPlayer, TeamRow, Tournament, TournamentAward, TournamentFormat, Trophy, PitchSize } from '@/data/types';
import { kwDateFromOffset, kwOffset, kwParts, kwTimestamp } from '@/i18n/format';
import { prepareImage } from './image';
import { supabase } from './supabase';

const db = () => {
  if (!supabase) throw new Error('backend_not_configured');
  return supabase;
};

export type OwnerSlot = { id: string; hour: number; duration: number; status: 'confirmed' | 'blocked'; playerName: string; total: number; noShow?: boolean; startsAt?: string; court?: number };

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
    courts: r.courts ?? 1,
    cancelHours: r.cancel_hours ?? 6,
    lateRefundPct: r.late_refund_pct ?? 0,
    photos: (r.photos ?? []).map(photoUrl),
    photoPaths: r.photos ?? [],
    nameEn: r.name_en,
  }));
}

export async function fetchMatches(): Promise<{ matches: Match[]; playerIds: string[] }> {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data, error } = await db()
    .from('matches')
    .select('*, match_players(user_id, joined_at, team)')
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
      startsAt: Date.parse(r.starts_at),
      isPrivate: !!r.is_private,
      inviteCode: r.invite_code ?? undefined,
      teams: Object.fromEntries((r.match_players ?? []).filter((p: { team?: string }) => p.team).map((p: { user_id: string; team: 'A' | 'B' }) => [p.user_id, p.team])),
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

export function mapFixture(f: Record<string, any>): Fixture {
  const parts = f.starts_at ? kwParts(f.starts_at) : null;
  return {
    id: f.id,
    homeId: f.home_id ?? undefined,
    awayId: f.away_id ?? undefined,
    startsAt: f.starts_at ?? undefined,
    dayOffset: parts ? kwOffset(parts.dateISO) : 9999,
    hour: parts ? parts.hour : 0,
    score: f.home_score == null ? undefined : [f.home_score, f.away_score],
    pens: f.pens_home == null ? undefined : [f.pens_home, f.pens_away],
    stage: f.stage ?? 'league',
    roundNo: f.round_no ?? 1,
    groupLabel: f.group_label ?? undefined,
    bracketPos: f.bracket_pos ?? undefined,
    status: f.status ?? (f.home_score == null ? 'scheduled' : 'played'),
    mvpId: f.mvp_id ?? undefined,
  };
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const { data, error } = await db().from('tournaments').select('*, tournament_teams(*), fixtures(*)').order('starts_on');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const teams: TeamRow[] = (r.tournament_teams ?? [])
      .map((tm: Record<string, any>) => ({
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
        status: tm.status ?? 'approved',
        paid: !!tm.paid,
        groupLabel: tm.group_label ?? undefined,
      }))
      .sort((a: TeamRow & { status?: string }, b: TeamRow) => a.name.ar.localeCompare(b.name.ar));
    return {
      id: r.id,
      name: { ar: r.name_ar, en: r.name_en },
      pitchId: r.pitch_id,
      format: r.format,
      status: r.status,
      startOffset: kwOffset(r.starts_on),
      startsOn: r.starts_on,
      maxTeams: r.max_teams,
      entryFee: Number(r.entry_fee),
      prize: Number(r.prize),
      prizeSecond: Number(r.prize_second ?? 0),
      organizerId: r.organizer_id ?? undefined,
      formatType: r.format_type ?? 'league',
      groupsCount: r.groups_count ?? 2,
      minPlayers: r.min_players ?? 5,
      maxPlayers: r.max_players ?? 10,
      ageCategory: r.age_category ?? 'open',
      rules: r.rules ?? '',
      commissionRate: Number(r.commission_rate ?? 0),
      rejectReason: r.reject_reason ?? '',
      finishedAt: r.finished_at ?? undefined,
      regDeadline: r.reg_deadline ?? undefined,
      slotMinutes: r.slot_minutes ?? 60,
      tint: [r.tint[0], r.tint[1] ?? r.tint[0]],
      teams,
      fixtures: (r.fixtures ?? []).map(mapFixture).sort((a: Fixture, b: Fixture) => (a.startsAt ?? '9').localeCompare(b.startsAt ?? '9') || (a.roundNo ?? 0) - (b.roundNo ?? 0) || (a.bracketPos ?? 0) - (b.bracketPos ?? 0)),
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

export async function matchInviteCode(id: string) {
  const { data, error } = await db().rpc('match_invite_code', { p_match: id });
  if (error) throw error;
  return data as string;
}

export async function setMatchPrivate(id: string, isPrivate: boolean) {
  const { data, error } = await db().rpc('set_match_private', { p_match: id, p_private: isPrivate });
  if (error) throw error;
  return data as string;
}

export async function switchMyTeam(matchId: string) {
  const { data, error } = await db().rpc('switch_my_team', { p_match: matchId });
  if (error) throw error;
  return data as 'A' | 'B';
}

export async function joinMatchByCode(code: string) {
  const { data, error } = await db().rpc('join_match_by_code', { p_code: code.trim() });
  if (error) throw error;
  return data as string;
}

export async function inviteTeamToMatch(matchId: string, teamId: string) {
  const { data, error } = await db().rpc('invite_team_to_match', { p_match: matchId, p_team: teamId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function balanceTeams(matchId: string, shuffle: boolean) {
  const { error } = await db().rpc('balance_teams', { p_match: matchId, p_shuffle: shuffle });
  if (error) throw error;
}

export async function setPlayerTeam(matchId: string, userId: string, team: 'A' | 'B' | null) {
  const { error } = await db().rpc('set_player_team', { p_match: matchId, p_user: userId, p_team: team });
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

export async function ownerDayV1(pitchId: string, dateISO: string): Promise<OwnerSlot[]> {
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
/** Storage path of the user's current photo, read from the URL saved on their profile. */
async function currentAvatarPath(userId: string): Promise<string | null> {
  const { data } = await db().from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
  const url = (data as { avatar_url?: string | null } | null)?.avatar_url;
  const m = url?.match(/\/avatars\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const res = await fetch(await prepareImage(localUri, 640));
  const body = await res.arrayBuffer();
  // A new file each time (insert only), then the old one is removed.
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const old = await currentAvatarPath(userId);
  const { error } = await db().storage.from('avatars').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = db().storage.from('avatars').getPublicUrl(path);
  const url = data.publicUrl;
  const { error: e2 } = await db().from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (e2) throw e2;
  if (old && old !== path) await db().storage.from('avatars').remove([old]).catch(() => {});
  return url;
}

export async function removeAvatar(userId: string) {
  const old = await currentAvatarPath(userId);
  if (old) await db().storage.from('avatars').remove([old]).catch(() => {});
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

export async function submitPitch(p: PitchSubmissionInput): Promise<string> {
  const { data, error } = await db().rpc('submit_pitch', {
    p_name: p.name, p_area: p.area, p_governorate: p.governorate, p_address: p.address, p_price: p.price, p_sizes: p.sizes,
    p_surface: p.surface, p_indoor: p.indoor, p_amenities: p.amenities, p_open_from: p.openFrom, p_open_to: p.openTo,
    p_phone: p.phone, p_note: p.note, p_lat: p.lat ?? null, p_lng: p.lng ?? null,
  });
  if (error) throw error;
  return (data as { id: string }).id;
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

/* ---------- tournaments ---------- */

const rpc = async <T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  return data as T;
};

export interface TournamentInput {
  name: string;
  pitchId: string;
  format: PitchSize;
  formatType: TournamentFormat;
  groupsCount: number;
  startsOn: string;
  maxTeams: number;
  minPlayers: number;
  maxPlayers: number;
  ageCategory: string;
  entryFee: number;
  prize: number;
  prizeSecond: number;
  rules: string;
}

export async function createTournament(p: TournamentInput): Promise<string> {
  const row = await rpc<{ id: string }>('create_tournament', {
    p_name: p.name, p_pitch: p.pitchId, p_format: p.format, p_type: p.formatType, p_groups: p.groupsCount, p_starts_on: p.startsOn,
    p_max_teams: p.maxTeams, p_min_players: p.minPlayers, p_max_players: p.maxPlayers, p_age: p.ageCategory, p_fee: p.entryFee,
    p_prize: p.prize, p_prize2: p.prizeSecond, p_rules: p.rules,
  });
  return row.id;
}
export const adminReviewTournament = (id: string, approve: boolean, reason = '') => rpc('admin_review_tournament', { p_t: id, p_approve: approve, p_reason: reason });
export const teamInviteCode = (teamId: string) => rpc<string>('team_invite_code', { p_team: teamId });
export const joinTeamByCode = (code: string) => rpc<string>('join_team_by_code', { p_code: code });
export const removeTeamPlayer = (teamId: string, userId: string) => rpc('remove_team_player', { p_team: teamId, p_user: userId });
export const organizerReviewTeam = (teamId: string, status: string, paid: boolean | null) => rpc('organizer_review_team', { p_team: teamId, p_status: status, p_paid: paid });
export const closeRegistration = (id: string) => rpc('close_registration', { p_t: id });
export const generateFixtures = (id: string, start: string, days: number[], startHour: number) => rpc<number>('generate_fixtures', { p_t: id, p_start: start, p_days: days, p_start_hour: startHour });
export const rescheduleFixture = (fixtureId: string, startsAt: string) => rpc('reschedule_fixture', { p_fixture: fixtureId, p_starts: startsAt });
export const recordResult = (fixtureId: string, home: number, away: number, pens: [number, number] | null, events: { team_id: string; player_id?: string; kind: string; minute?: number }[], mvp: string | null) =>
  rpc('record_fixture_result', { p_fixture: fixtureId, p_home: home, p_away: away, p_pens_home: pens?.[0] ?? null, p_pens_away: pens?.[1] ?? null, p_events: events, p_mvp: mvp });
export const recordWalkover = (fixtureId: string, winner: string) => rpc('record_walkover', { p_fixture: fixtureId, p_winner: winner });
export const withdrawTeam = (teamId: string) => rpc('withdraw_team', { p_team: teamId });
export const cancelTournament = (id: string) => rpc('cancel_tournament', { p_t: id });
export const setAward = (id: string, kind: 'best_player' | 'best_keeper', userId: string | null) => rpc('set_award', { p_t: id, p_kind: kind, p_user: userId });
export const toggleHighlightLike = (id: string) => rpc<boolean>('toggle_highlight_like', { p_id: id });
export const markDues = (id: string, paid: boolean) => rpc('admin_mark_dues', { p_t: id, p_paid: paid });
export const setCommission = (rate: number | null, pitchId?: string) => rpc('admin_set_commission', { p_rate: rate, p_pitch: pitchId ?? null });
export const commissionRateFor = async (pitchId: string) => Number(await rpc<number>('commission_rate_for', { p_pitch: pitchId }));

export interface AppSettings {
  commissionRate: number;
  clipRetentionDays: number;
  pricePitch: number;
  priceAcademy: number;
  trialDays: number;
  graceDays: number;
  paymentLink: string;
}

export async function appSettings(): Promise<AppSettings> {
  const { data } = await db().from('app_settings').select('*');
  const m = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const n = (k: string, d: number) => (m.has(k) ? Number(m.get(k)) : d);
  return {
    commissionRate: n('commission_rate', 0.05),
    clipRetentionDays: n('clip_retention_days', 14),
    pricePitch: n('subscription_price_pitch', 100),
    priceAcademy: n('subscription_price_academy', 100),
    trialDays: n('trial_days', 30),
    graceDays: n('grace_days', 7),
    paymentLink: String(m.get('payment_link') ?? ''),
  };
}

export async function fetchTournamentDetail(id: string, userId?: string) {
  const c = db();
  const [roster, events, clips, awards, susp, likes] = await Promise.all([
    c.from('team_players').select('team_id, user_id, profiles(name, avatar_url)').eq('tournament_id', id),
    c.from('match_events').select('*').eq('tournament_id', id),
    c.from('highlights').select('*').eq('tournament_id', id).order('created_at', { ascending: false }),
    c.from('tournament_awards').select('*').eq('tournament_id', id),
    c.rpc('tournament_suspensions', { p_t: id }),
    userId ? c.from('highlight_likes').select('highlight_id') : Promise.resolve({ data: [] as { highlight_id: string }[] }),
  ]);
  const players: RosterPlayer[] = (roster.data ?? []).map((r: Record<string, any>) => ({ teamId: r.team_id, userId: r.user_id, name: r.profiles?.name ?? '', avatarUrl: r.profiles?.avatar_url ?? undefined }));
  const ev: MatchEvent[] = (events.data ?? []).map((e: Record<string, any>) => ({ id: e.id, fixtureId: e.fixture_id, teamId: e.team_id, playerId: e.player_id ?? undefined, kind: e.kind, minute: e.minute ?? undefined }));
  const hl: Highlight[] = (clips.data ?? []).map((h: Record<string, any>) => ({
    id: h.id, fixtureId: h.fixture_id, playerId: h.player_id ?? undefined, path: h.path, likes: h.likes, at: Date.parse(h.created_at),
    url: c.storage.from('highlights').getPublicUrl(h.path).data.publicUrl,
  }));
  const aw: TournamentAward[] = (awards.data ?? []).map((a: Record<string, any>) => ({ kind: a.kind, teamId: a.team_id ?? undefined, userId: a.user_id ?? undefined, value: a.value ?? undefined }));
  const suspensions = ((susp.data ?? []) as { user_id: string; team_id: string; fixture_id: string }[]).map((s) => ({ userId: s.user_id, teamId: s.team_id, fixtureId: s.fixture_id }));
  return { players, events: ev, highlights: hl, awards: aw, suspensions, liked: new Set(((likes.data ?? []) as { highlight_id: string }[]).map((l) => l.highlight_id)) };
}

/** Uploads a clip to storage under <tournament>/<fixture>/ and registers it. */
export async function uploadHighlight(tournamentId: string, fixtureId: string, localUri: string, playerId: string | null) {
  const res = await fetch(localUri);
  const body = await res.arrayBuffer();
  const type = res.headers.get('content-type') || 'video/mp4';
  const ext = type.includes('quicktime') ? 'mov' : type.includes('webm') ? 'webm' : 'mp4';
  const path = `${tournamentId}/${fixtureId}/${Date.now()}.${ext}`;
  const { error } = await db().storage.from('highlights').upload(path, body, { contentType: type, upsert: false });
  if (error) throw error;
  try {
    await rpc('add_highlight', { p_fixture: fixtureId, p_path: path, p_player: playerId });
  } catch (e) {
    await db().storage.from('highlights').remove([path]);
    throw e;
  }
}

export async function deleteHighlight(id: string) {
  const path = await rpc<string>('delete_highlight', { p_id: id });
  if (path) await db().storage.from('highlights').remove([path]);
}

export async function fetchDues(mine: boolean): Promise<DuesRow[]> {
  const data = await rpc<Record<string, any>[]>('tournament_dues_list', { p_mine: mine });
  return (data ?? []).map((r) => ({
    tournamentId: r.tournament_id, name: { ar: r.name_ar, en: r.name_en }, organizerId: r.organizer_id, organizerName: r.organizer_name, status: r.status,
    entryFee: Number(r.entry_fee), paidTeams: r.paid_teams, rate: Number(r.rate), amount: Number(r.amount), settled: r.settled, finishedAt: r.finished_at ?? undefined,
  }));
}

export async function fetchTrophies(userId: string): Promise<Trophy[]> {
  const data = await rpc<Record<string, any>[]>('player_trophies', { p_user: userId });
  return (data ?? []).map((r) => ({ tournamentId: r.tournament_id, name: { ar: r.name_ar, en: r.name_en }, kind: r.kind, value: r.value ?? undefined }));
}

/* ---------- owner subscriptions ---------- */

export interface Subscription {
  id: string;
  ownerId: string;
  ownerName: string;
  kind: 'pitch' | 'academy';
  listingId: string;
  listingName: string;
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  price: number;
  trialEndsAt: string;
  paidUntil: string;
}

export interface Invoice {
  id: string;
  subscriptionId: string | null;
  ownerId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: 'unpaid' | 'claimed' | 'paid' | 'void';
  dueAt: string;
  paymentLink: string;
  note: string;
}

export async function billingOverview(all = false): Promise<Subscription[]> {
  const data = await rpc<Record<string, any>[]>('billing_overview', { p_all: all });
  return (data ?? []).map((r) => ({
    id: r.subscription_id, ownerId: r.owner_id, ownerName: r.owner_name, kind: r.kind, listingId: r.listing_id, listingName: r.listing_name,
    status: r.status, price: Number(r.price), trialEndsAt: r.trial_ends_at, paidUntil: r.paid_until,
  }));
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await db().from('invoices').select('*').order('due_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r.id, subscriptionId: r.subscription_id, ownerId: r.owner_id, periodStart: r.period_start, periodEnd: r.period_end, amount: Number(r.amount),
    status: r.status, dueAt: r.due_at, paymentLink: r.payment_link ?? '', note: r.note ?? '',
  }));
}

export const claimInvoice = (id: string, note = '') => rpc('claim_invoice_paid', { p_invoice: id, p_note: note });
export const adminMarkInvoice = (id: string, status: 'paid' | 'unpaid' | 'void') => rpc('admin_mark_invoice', { p_invoice: id, p_status: status });
export const adminRunBilling = () => rpc<number>('admin_run_billing');
export const adminSetBilling = (p: { pricePitch: number; priceAcademy: number; trialDays: number; graceDays: number; paymentLink: string }) =>
  rpc('admin_set_billing', { p_price_pitch: p.pricePitch, p_price_academy: p.priceAcademy, p_trial_days: p.trialDays, p_grace_days: p.graceDays, p_link: p.paymentLink });

/* ---------- v5: photos, details, moderation, owner actions, academy tracking ---------- */

export const photoUrl = (path: string) => (path.startsWith('http') ? path : db().storage.from('listing-photos').getPublicUrl(path).data.publicUrl);

/** Uploads a listing photo under the owner's folder and returns its storage path. */
export async function uploadListingPhoto(ownerId: string, localUri: string): Promise<string> {
  const res = await fetch(await prepareImage(localUri, 1600));
  const body = await res.arrayBuffer();
  const type = 'image/jpeg';
  const ext = 'jpg';
  const path = `${ownerId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error } = await db().storage.from('listing-photos').upload(path, body, { contentType: type });
  if (error) throw error;
  return path;
}

export async function removeListingPhotos(paths: string[]) {
  if (paths.length) await db().storage.from('listing-photos').remove(paths);
}

export interface PitchDetailsInput {
  nameAr: string;
  nameEn: string;
  area: string;
  governorate: string;
  address: string;
  sizes: number[];
  surface: 'artificial' | 'natural';
  indoor: boolean;
  lat?: number;
  lng?: number;
  photos: string[];
}
export const updatePitchDetails = (id: string, p: PitchDetailsInput) =>
  rpc('update_pitch_details', {
    p_pitch: id, p_name_ar: p.nameAr, p_name_en: p.nameEn, p_area: p.area, p_governorate: p.governorate, p_address: p.address, p_sizes: p.sizes,
    p_surface: p.surface, p_indoor: p.indoor, p_lat: p.lat ?? null, p_lng: p.lng ?? null, p_photos: p.photos,
  });

export interface AcademyDetailsInput {
  nameAr: string;
  nameEn: string;
  area: string;
  governorate: string;
  about: string;
  lat?: number;
  lng?: number;
  photos: string[];
}
export const updateAcademyDetails = (id: string, p: AcademyDetailsInput) =>
  rpc('update_academy_details', {
    p_academy: id, p_name_ar: p.nameAr, p_name_en: p.nameEn, p_area: p.area, p_governorate: p.governorate, p_about: p.about,
    p_lat: p.lat ?? null, p_lng: p.lng ?? null, p_photos: p.photos,
  });

export interface TournamentEdit {
  nameAr: string;
  nameEn: string;
  fee: number;
  prize: number;
  prize2: number;
  rules: string;
  maxTeams: number;
  startsOn: string;
  regDeadline: string | null;
  minPlayers: number;
  maxPlayers: number;
  slotMinutes: number;
}
export const updateTournament = (id: string, p: TournamentEdit) =>
  rpc('update_tournament', {
    p_t: id, p_name_ar: p.nameAr, p_name_en: p.nameEn, p_fee: p.fee, p_prize: p.prize, p_prize2: p.prize2, p_rules: p.rules, p_max_teams: p.maxTeams,
    p_starts_on: p.startsOn, p_reg_deadline: p.regDeadline, p_min_players: p.minPlayers, p_max_players: p.maxPlayers, p_slot_minutes: p.slotMinutes,
  });
export const rosterCheck = (id: string) => rpc<{ team_id: string; players: number; min_players: number }[]>('tournament_roster_check', { p_t: id });
export const inviteFixedTeam = (teamId: string, fixedTeamId: string) => rpc<number>('invite_fixed_team', { p_team: teamId, p_fixed: fixedTeamId });

export const ownerCancelBooking = (id: string, reason: string) => rpc('owner_cancel_booking', { p_booking: id, p_reason: reason });
export const ownerMarkNoShow = (id: string, noShow: boolean) => rpc('owner_mark_no_show', { p_booking: id, p_no_show: noShow });

export async function playerStats(userId: string) {
  return rpc<{ played: number; noShows: number; mvp: number; bookings: number; goals?: number; cards?: number; tournaments?: number; titles?: number }>('player_stats', { p_user: userId });
}

export async function adminUsersV2(search: string) {
  const data = await rpc<{ id: string; suspended: boolean }[]>('admin_users_v2', { p_search: search });
  return new Map((data ?? []).map((r) => [r.id, r.suspended]));
}
export const adminSetSuspended = (userId: string, suspended: boolean) => rpc('admin_set_suspended', { p_user: userId, p_suspended: suspended });
export const adminDeleteUser = (userId: string) => rpc('admin_delete_user', { p_user: userId });

export async function fetchInvoiceItems(): Promise<{ invoiceId: string; kind: string; labelAr: string; labelEn: string; amount: number }[]> {
  const { data, error } = await db().from('invoice_items').select('*');
  if (error) return [];
  return (data ?? []).map((r: Record<string, any>) => ({ invoiceId: r.invoice_id, kind: r.kind, labelAr: r.label_ar, labelEn: r.label_en, amount: Number(r.amount) }));
}

export async function academyTracking(enrollmentIds: string[], month: string, day: string) {
  if (!enrollmentIds.length) return { paid: new Set<string>(), present: new Map<string, boolean>() };
  const [p, a] = await Promise.all([
    db().from('enrollment_payments').select('enrollment_id').in('enrollment_id', enrollmentIds).eq('month', month),
    db().from('attendance').select('enrollment_id, present').in('enrollment_id', enrollmentIds).eq('day', day),
  ]);
  return {
    paid: new Set(((p.data ?? []) as { enrollment_id: string }[]).map((r) => r.enrollment_id)),
    present: new Map(((a.data ?? []) as { enrollment_id: string; present: boolean }[]).map((r) => [r.enrollment_id, r.present])),
  };
}
export const academyMarkPaid = (enrollmentId: string, month: string, paid: boolean) => rpc('academy_mark_paid', { p_enrollment: enrollmentId, p_month: month, p_paid: paid });
export const academyMarkAttendance = (enrollmentId: string, day: string, present: boolean | null) => rpc('academy_mark_attendance', { p_enrollment: enrollmentId, p_day: day, p_present: present });

export async function ownerDay(pitchId: string, dateISO: string): Promise<OwnerSlot[]> {
  const map = (rows: Record<string, any>[]) =>
    rows.map((r) => ({
      id: r.id, hour: kwParts(r.starts_at).hour, duration: hoursBetween(r.starts_at, r.ends_at), status: (r.status === 'blocked' ? 'blocked' : 'confirmed') as OwnerSlot['status'],
      playerName: r.player_name, total: Number(r.total), noShow: r.no_show ?? false, startsAt: r.starts_at, court: r.court_no ?? 1,
    }));
  const v3 = await db().rpc('owner_day_v3', { p_pitch: pitchId, p_day: dateISO });
  if (!v3.error) return map((v3.data ?? []) as Record<string, any>[]);
  const v2 = await db().rpc('owner_day_v2', { p_pitch: pitchId, p_day: dateISO });
  if (!v2.error) return map((v2.data ?? []) as Record<string, any>[]);
  return ownerDayV1(pitchId, dateISO);
}

/* ---------- v6: courts & staff ---------- */

export const setPitchCourts = (pitchId: string, courts: number) => rpc('set_pitch_courts', { p_pitch: pitchId, p_courts: courts });
export const createStaffInvite = (pitchId: string) => rpc<string>('create_staff_invite', { p_pitch: pitchId });
export const acceptStaffInvite = (code: string) => rpc<string>('accept_staff_invite', { p_code: code });
export const removeStaff = (pitchId: string, userId: string) => rpc('remove_staff', { p_pitch: pitchId, p_user: userId });
export async function staffList(pitchId: string): Promise<{ userId: string; name: string; avatarUrl?: string }[]> {
  const data = await rpc<Record<string, any>[]>('pitch_staff_list', { p_pitch: pitchId });
  return (data ?? []).map((r) => ({ userId: r.user_id, name: r.name, avatarUrl: r.avatar_url ?? undefined }));
}
export async function myStaffPitches(): Promise<string[]> {
  const { data, error } = await db().rpc('my_staff_pitches');
  if (error) return [];
  return ((data ?? []) as (string | { my_staff_pitches: string })[]).map((x) => (typeof x === 'string' ? x : x.my_staff_pitches));
}

// ---------------------------------------------------------------- cancellation policy
export async function setPitchPolicy(pitchId: string, cancelHours: number, lateRefundPct: number) {
  const { error } = await db().rpc('set_pitch_policy', { p_pitch: pitchId, p_cancel_hours: cancelHours, p_late_refund_pct: lateRefundPct });
  if (error) throw error;
}

export interface Reliability {
  bookings: number;
  no_shows: number;
  late_cancels: number;
  conduct: { avg: number | null; count: number };
}
export async function bookingReliability(bookingId: string) {
  const { data, error } = await db().rpc('booking_reliability', { p_booking: bookingId });
  if (error) throw error;
  return data as Reliability;
}

// ---------------------------------------------------------------- sportsmanship & reports
export async function playerConduct(userId: string) {
  const { data, error } = await db().rpc('player_conduct', { p_user: userId });
  if (error) throw error;
  return data as { avg: number | null; count: number };
}

export async function myRatings(matchId: string): Promise<Record<string, number>> {
  const { data, error } = await db().from('player_ratings').select('ratee_id, stars').eq('match_id', matchId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: { ratee_id: string; stars: number }) => [r.ratee_id, r.stars]));
}

export async function ratePlayer(matchId: string, userId: string, stars: number) {
  const { error } = await db().rpc('rate_player', { p_match: matchId, p_ratee: userId, p_stars: stars });
  if (error) throw error;
}

export type ReportReason = 'abuse' | 'violence' | 'unsporting' | 'no_show' | 'cheating' | 'other';
export async function reportUser(userId: string, reason: ReportReason, details: string, matchId?: string) {
  const { error } = await db().rpc('report_user', { p_user: userId, p_reason: reason, p_details: details, p_match: matchId ?? null });
  if (error) throw error;
}

export interface UserReport {
  id: string;
  reporter_id: string;
  reporter_name: string;
  reported_id: string;
  reported_name: string;
  match_id: string | null;
  reason: ReportReason;
  details: string;
  status: 'open' | 'reviewed' | 'dismissed';
  admin_note: string | null;
  created_at: string;
  reports_against: number;
}
export async function adminReports(status: 'open' | 'all') {
  const { data, error } = await db().rpc('admin_reports', { p_status: status });
  if (error) throw error;
  return (data ?? []) as UserReport[];
}
export async function adminResolveReport(id: string, status: 'reviewed' | 'dismissed' | 'open', note: string) {
  const { error } = await db().rpc('admin_resolve_report', { p_id: id, p_status: status, p_note: note });
  if (error) throw error;
}

// ---------------------------------------------------------------- game chat
export interface ChatMessage {
  id: string;
  userId: string;
  body: string;
  at: number;
}
const mapMsg = (r: { id: string; user_id: string; body: string; created_at: string }): ChatMessage => ({ id: r.id, userId: r.user_id, body: r.body, at: Date.parse(r.created_at) });
export async function fetchChat(matchId: string) {
  const { data, error } = await db().from('match_messages').select('id, user_id, body, created_at').eq('match_id', matchId).order('created_at').limit(300);
  if (error) throw error;
  return (data ?? []).map(mapMsg);
}
export async function sendChat(matchId: string, body: string) {
  const { error } = await db().from('match_messages').insert({ match_id: matchId, body: body.trim() });
  if (error) throw error;
}
export async function deleteChat(id: string) {
  const { error } = await db().from('match_messages').delete().eq('id', id);
  if (error) throw error;
}
export function subscribeChat(matchId: string, onMsg: (m: ChatMessage) => void, onDelete: (id: string) => void) {
  const c = db()
    .channel(`chat:${matchId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_messages', filter: `match_id=eq.${matchId}` }, (p) => onMsg(mapMsg(p.new as never)))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'match_messages' }, (p) => onDelete((p.old as { id: string }).id))
    .subscribe();
  return () => {
    db().removeChannel(c);
  };
}

// ---------------------------------------------------------------- friends
export interface Friend {
  id: string;
  name: string;
  avatarUrl?: string;
  position: string;
  level: string;
  status: 'pending' | 'accepted';
  incoming: boolean;
}
export async function myFriends(): Promise<Friend[]> {
  const { data, error } = await db().rpc('my_friends');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, any>) => ({ id: r.user_id, name: r.name, avatarUrl: r.avatar_url ?? undefined, position: r.player_position, level: r.level, status: r.status, incoming: r.incoming }));
}
export async function friendRequest(userId: string) {
  const { data, error } = await db().rpc('friend_request', { p_user: userId });
  if (error) throw error;
  return data as 'pending' | 'accepted';
}
export async function friendRespond(userId: string, accept: boolean) {
  const { error } = await db().rpc('friend_respond', { p_user: userId, p_accept: accept });
  if (error) throw error;
}
export async function friendRemove(userId: string) {
  const { error } = await db().rpc('friend_remove', { p_user: userId });
  if (error) throw error;
}
export async function searchPlayers(q: string) {
  const { data, error } = await db().from('profiles').select('id, name, avatar_url, position, level').ilike('name', `%${q.replace(/[%_]/g, '')}%`).limit(20);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, any>) => ({ id: r.id as string, name: (r.name ?? '') as string, avatarUrl: r.avatar_url ?? undefined, position: r.position as string, level: r.level as string }));
}
export async function inviteFriendsToMatch(matchId: string, userIds: string[]) {
  const { data, error } = await db().rpc('invite_friends_to_match', { p_match: matchId, p_users: userIds });
  if (error) throw error;
  return (data as number) ?? 0;
}
