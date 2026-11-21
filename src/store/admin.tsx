/**
 * Super admin data and actions. Live mode calls the admin_* database functions (which verify the
 * caller is an admin); demo mode builds the same views from local data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { players as seedPlayers } from '@/data/seed';
import type { L10n, Tournament, PitchSize } from '@/data/types';
import { dateFromOffset, kwParts, toISODate } from '@/i18n/format';
import { errorCode } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAcademies } from './academies';
import { useApp, type Result } from './AppStore';
import { useSupport } from './support';

export type Role = 'player' | 'owner' | 'academy' | 'admin';
export interface AdminUser {
  id: string;
  name: string;
  role: Role;
  contact: string;
  avatarUrl?: string;
  bookings: number;
  createdAt: number;
}
export interface AdminBooking {
  id: string;
  pitchId: string;
  dateISO: string;
  hour: number;
  status: 'confirmed' | 'cancelled';
  total: number;
  playerName: string;
}
export interface AdminStats {
  users: number;
  owners: number;
  pitches: number;
  academies: number;
  students: number;
  bookings7: number;
  revenue7: number;
  openMatches: number;
  openTickets: number;
  daily: { day: string; count: number }[];
}
export interface Announcement {
  id: string;
  body: L10n;
  active: boolean;
  createdAt: number;
}

interface Ctx {
  stats: AdminStats | null;
  users: AdminUser[];
  bookings: AdminBooking[];
  announcements: Announcement[];
  activeAnnouncement?: Announcement;
  reload: () => Promise<void>;
  searchUsers: (q: string) => Promise<void>;
  setRole: (userId: string, role: Role) => Promise<Result>;
  updatePitch: (pitchId: string, p: { active?: boolean; ownerId?: string | null; price?: number }) => Promise<Result>;
  updateAcademy: (academyId: string, p: { active?: boolean; ownerId?: string | null }) => Promise<Result>;
  cancelBooking: (id: string) => Promise<Result>;
  setTournamentStatus: (id: string, status: Tournament['status']) => Promise<Result>;
  createTournament: (p: { name: string; pitchId: string; format: PitchSize; startOffset: number; maxTeams: number; fee: number; prize: number }) => Promise<Result>;
  postAnnouncement: (body: string) => Promise<Result>;
  setAnnouncementActive: (id: string, active: boolean) => Promise<Result>;
}

const KEY = 'aldawri.admin.v1';
const C = createContext<Ctx | null>(null);

interface DemoAdmin {
  roles: Record<string, Role>;
  cancelled: string[];
  announcements: Announcement[];
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const { mode, meId, role, state, dispatch, allPitches, myBookings, allMatches, players } = app;
  const { programs } = useAcademies();
  const { tickets } = useSupport();
  const live = mode === 'live';
  const isAdmin = role === 'admin';
  const [demo, setDemo] = useState<DemoAdmin>({ roles: {}, cancelled: [], announcements: [] });
  const [hydrated, setHydrated] = useState(false);
  const [liveStats, setLiveStats] = useState<AdminStats | null>(null);
  const [liveUsers, setLiveUsers] = useState<AdminUser[]>([]);
  const [liveBookings, setLiveBookings] = useState<AdminBooking[]>([]);
  const [liveAnnouncements, setLiveAnnouncements] = useState<Announcement[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (live) return;
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setDemo(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [live]);
  useEffect(() => {
    if (!live && hydrated) AsyncStorage.setItem(KEY, JSON.stringify(demo)).catch(() => {});
  }, [demo, live, hydrated]);

  const loadAnnouncements = useCallback(async () => {
    if (!live || !supabase) return;
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
    setLiveAnnouncements((data ?? []).map((r: Record<string, any>) => ({ id: r.id, body: { ar: r.body_ar, en: r.body_en }, active: r.active, createdAt: Date.parse(r.created_at) })));
  }, [live]);

  const reload = useCallback(async () => {
    if (!live || !supabase) return;
    await loadAnnouncements();
    if (!isAdmin) return;
    const [s, u, b] = await Promise.all([supabase.rpc('admin_stats'), supabase.rpc('admin_users', { p_search: query }), supabase.rpc('admin_bookings', { p_limit: 100 })]);
    if (s.data) setLiveStats(s.data as AdminStats);
    setLiveUsers(
      ((u.data ?? []) as Record<string, any>[]).map((r) => ({ id: r.id, name: r.name, role: r.role, contact: r.phone || r.email || '', avatarUrl: r.avatar_url ?? undefined, bookings: Number(r.bookings), createdAt: Date.parse(r.created_at) })),
    );
    setLiveBookings(
      ((b.data ?? []) as Record<string, any>[]).map((r) => {
        const { dateISO, hour } = kwParts(r.starts_at);
        return { id: r.id, pitchId: r.pitch_id, dateISO, hour, status: r.status === 'cancelled' ? 'cancelled' : 'confirmed', total: Number(r.total), playerName: r.player_name };
      }),
    );
  }, [live, isAdmin, query, loadAnnouncements]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<Ctx>(() => {
    // ---- demo views
    const demoUsers: AdminUser[] = [
      { id: meId, name: state.profile.name || 'أنا', role: 'admin', contact: '+965 9•••• 1234', avatarUrl: state.profile.avatarUrl, bookings: myBookings.length, createdAt: Date.now() },
      ...seedPlayers.map((p, i) => ({
        id: p.id, name: p.name.ar, role: demo.roles[p.id] ?? (i === 6 ? 'owner' : i === 9 ? 'academy' : 'player'), contact: `+965 ${5 + (i % 5)}••• ${1000 + i * 37}`, bookings: p.stats.matches % 9, createdAt: Date.now() - i * 86400000 * 3,
      })),
    ];
    const names = seedPlayers.map((p) => p.name.ar);
    const synthetic: AdminBooking[] = Array.from({ length: 14 }, (_, i) => {
      const p = allPitches[i % allPitches.length];
      return { id: `sb${i}`, pitchId: p?.id ?? '', dateISO: toISODate(dateFromOffset((i % 5) - 1)), hour: 16 + (i % 7), status: 'confirmed' as const, total: p?.pricePerHour ?? 20, playerName: names[i % names.length] };
    });
    const demoBookings: AdminBooking[] = [
      ...myBookings.map((b) => ({ id: b.id, pitchId: b.pitchId, dateISO: b.dateISO, hour: b.hour, status: b.status, total: b.total, playerName: state.profile.name })),
      ...synthetic,
    ].map((b) => (demo.cancelled.includes(b.id) ? { ...b, status: 'cancelled' as const } : b));
    const confirmed = demoBookings.filter((b) => b.status === 'confirmed');
    const demoStats: AdminStats = {
      users: demoUsers.length + 1240,
      owners: demoUsers.filter((u) => u.role === 'owner').length + 5,
      pitches: allPitches.filter((p) => p.active !== false).length,
      academies: 3,
      students: programs.reduce((s, p) => s + p.enrolled, 0),
      bookings7: confirmed.length + 180,
      revenue7: confirmed.reduce((s, b) => s + b.total, 0) + 4120,
      openMatches: allMatches.filter((m) => m.dayOffset >= 0).length,
      openTickets: tickets.filter((tk) => tk.status === 'open').length,
      daily: Array.from({ length: 7 }, (_, i) => ({ day: toISODate(dateFromOffset(i - 6)), count: 18 + (hash(`d${i}`) % 22) })),
    };

    const run = async (fn: () => Promise<void>): Promise<Result> => {
      try {
        await fn();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: errorCode(e) };
      }
    };
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { error } = await supabase!.rpc(name, args);
      if (error) throw error;
    };
    const announcements = live ? liveAnnouncements : demo.announcements;

    return {
      stats: live ? liveStats : demoStats,
      users: live ? liveUsers : demoUsers.filter((u) => !query || u.name.includes(query) || u.contact.includes(query)),
      bookings: live ? liveBookings : demoBookings,
      announcements,
      activeAnnouncement: announcements.find((a) => a.active),
      reload,
      searchUsers: async (q) => setQuery(q.trim()),
      setRole: (userId, r) =>
        run(async () => {
          if (live) {
            await rpc('admin_set_role', { p_user: userId, p_role: r });
            await reload();
            await app.refresh();
          } else setDemo((d) => ({ ...d, roles: { ...d.roles, [userId]: r } }));
        }),
      updatePitch: (pitchId, p) =>
        run(async () => {
          if (live) {
            const cur = allPitches.find((x) => x.id === pitchId);
            await rpc('admin_update_pitch', { p_pitch: pitchId, p_active: p.active ?? null, p_owner: p.ownerId === undefined ? cur?.ownerId ?? null : p.ownerId, p_price: p.price ?? null });
            await app.refresh();
          } else {
            if (p.active !== undefined) dispatch({ type: 'setDemoPitchActive', pitchId, active: p.active });
            if (p.price !== undefined) dispatch({ type: 'setDemoPrice', pitchId, price: p.price });
          }
        }),
      updateAcademy: (academyId, p) =>
        run(async () => {
          if (live) await rpc('admin_update_academy', { p_academy: academyId, p_active: p.active ?? null, p_owner: p.ownerId ?? null });
        }),
      cancelBooking: (id) =>
        run(async () => {
          if (live) {
            await rpc('admin_cancel_booking', { p_booking: id });
            await reload();
          } else setDemo((d) => ({ ...d, cancelled: [...d.cancelled, id] }));
        }),
      setTournamentStatus: (id, status) =>
        run(async () => {
          if (live) {
            await rpc('admin_set_tournament_status', { p_tournament: id, p_status: status });
            await app.refresh();
          } else dispatch({ type: 'setDemoTournamentStatus', id, status });
        }),
      createTournament: (p) =>
        run(async () => {
          if (live) {
            await rpc('admin_create_tournament', { p_name: p.name, p_pitch: p.pitchId, p_format: p.format, p_starts_on: toISODate(dateFromOffset(p.startOffset)), p_max_teams: p.maxTeams, p_fee: p.fee, p_prize: p.prize });
            await app.refresh();
          } else
            dispatch({
              type: 'addDemoTournament',
              tournament: { id: `t${Date.now()}`, name: { ar: p.name, en: p.name }, pitchId: p.pitchId, format: p.format, status: 'open', startOffset: p.startOffset, maxTeams: p.maxTeams, entryFee: p.fee, prize: p.prize, teams: [], fixtures: [], tint: ['#1E56B3', '#071E4B'] },
            });
        }),
      postAnnouncement: (body) =>
        run(async () => {
          if (live) {
            const { error } = await supabase!.from('announcements').insert({ body_ar: body, body_en: body, created_by: meId });
            if (error) throw error;
            await loadAnnouncements();
          } else setDemo((d) => ({ ...d, announcements: [{ id: `an${Date.now()}`, body: { ar: body, en: body }, active: true, createdAt: Date.now() }, ...d.announcements.map((a) => ({ ...a, active: false }))] }));
        }),
      setAnnouncementActive: (id, active) =>
        run(async () => {
          if (live) {
            const { error } = await supabase!.from('announcements').update({ active }).eq('id', id);
            if (error) throw error;
            await loadAnnouncements();
          } else setDemo((d) => ({ ...d, announcements: d.announcements.map((a) => (a.id === id ? { ...a, active } : a)) }));
        }),
    };
  }, [live, liveStats, liveUsers, liveBookings, liveAnnouncements, demo, query, meId, state.profile, myBookings, allPitches, allMatches, programs, tickets, players, reload, loadAnnouncements, app, dispatch]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useAdmin() {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider');
  return ctx;
}
