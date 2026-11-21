/**
 * App state.
 *
 * Two modes, same API for the screens:
 *  - demo: no backend configured; seed data and the user's actions live on the device.
 *  - live: Supabase configured (src/lib/supabase.ts); data comes from the database and every
 *    write goes through the server-side functions in supabase/migrations.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { getLocales } from 'expo-localization';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ME_ID, matches as seedMatches, pitches as seedPitches, players as seedPlayers, tournaments as seedTournaments } from '@/data/seed';
import type { Booking, Lang, Match, Pitch, Player, Profile, Tournament } from '@/data/types';
import { strings, type StringKey } from '@/i18n/strings';
import { dateFromOffset, formatMoney, toISODate } from '@/i18n/format';
import * as api from '@/lib/api';
import type { OwnerSlot } from '@/lib/api';
import { backendEnabled, supabase } from '@/lib/supabase';

export type { OwnerSlot };
export type Result = { ok: true; id?: string } | { ok: false; error: string };

const STORAGE_KEY = 'aldawri.state.v1';

interface OwnerBlock {
  id: string;
  pitchId: string;
  dateISO: string;
  hour: number;
}

interface PersistedState {
  lang: Lang;
  onboarded: boolean;
  profile: Profile;
  favorites: string[];
  // demo-mode data
  bookings: Booking[];
  joinedMatchIds: string[];
  createdMatches: Match[];
  registrations: Record<string, string>;
  ownerBlocks: OwnerBlock[];
  demoOwner: boolean;
  demoAcademy: boolean;
  demoAdmin: boolean;
  demoPrices: Record<string, number>;
  demoPitchInactive: string[];
  demoPitchEdits: Record<string, { openFrom?: number; openTo?: number; amenities?: Pitch['amenities'] }>;
  demoTournamentStatus: Record<string, Tournament['status']>;
  demoTournaments: Tournament[];
}

interface State extends PersistedState {
  hydrated: boolean;
}

const deviceLang = (): Lang => {
  try {
    return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  } catch {
    return 'ar';
  }
};

const initial = (): PersistedState => ({
  lang: deviceLang(),
  onboarded: false,
  profile: { id: 'me', name: '', position: 'MID', level: 'intermediate', phone: '' },
  favorites: [],
  bookings: [],
  joinedMatchIds: [],
  createdMatches: [],
  registrations: {},
  ownerBlocks: [],
  demoOwner: false,
  demoAcademy: false,
  demoAdmin: false,
  demoPrices: {},
  demoPitchInactive: [],
  demoPitchEdits: {},
  demoTournamentStatus: {},
  demoTournaments: [],
});

type Action =
  | { type: 'hydrate'; state: Partial<PersistedState> }
  | { type: 'setLang'; lang: Lang }
  | { type: 'completeOnboarding'; profile: Partial<Profile> }
  | { type: 'updateProfile'; profile: Partial<Profile> }
  | { type: 'addBooking'; booking: Booking }
  | { type: 'cancelBooking'; id: string }
  | { type: 'join'; id: string }
  | { type: 'leave'; id: string }
  | { type: 'createMatch'; match: Match }
  | { type: 'register'; tournamentId: string; teamName: string }
  | { type: 'toggleFavorite'; id: string }
  | { type: 'ownerBlock'; block: OwnerBlock }
  | { type: 'ownerUnblock'; id: string }
  | { type: 'setDemoOwner'; on: boolean }
  | { type: 'setDemoRole'; key: 'demoAcademy' | 'demoAdmin'; on: boolean }
  | { type: 'setDemoPrice'; pitchId: string; price: number }
  | { type: 'setDemoPitchActive'; pitchId: string; active: boolean }
  | { type: 'editDemoPitch'; pitchId: string; edits: { openFrom?: number; openTo?: number; amenities?: Pitch['amenities'] } }
  | { type: 'setDemoTournamentStatus'; id: string; status: Tournament['status'] }
  | { type: 'addDemoTournament'; tournament: Tournament }
  | { type: 'signedOut' }
  | { type: 'reset' };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return { ...state, ...a.state, hydrated: true };
    case 'setLang':
      return { ...state, lang: a.lang };
    case 'completeOnboarding':
      return { ...state, onboarded: true, profile: { ...state.profile, ...a.profile } };
    case 'updateProfile':
      return { ...state, profile: { ...state.profile, ...a.profile } };
    case 'addBooking':
      return { ...state, bookings: [a.booking, ...state.bookings] };
    case 'cancelBooking':
      return { ...state, bookings: state.bookings.map((b) => (b.id === a.id ? { ...b, status: 'cancelled' } : b)) };
    case 'join':
      return state.joinedMatchIds.includes(a.id) ? state : { ...state, joinedMatchIds: [...state.joinedMatchIds, a.id] };
    case 'leave':
      return {
        ...state,
        joinedMatchIds: state.joinedMatchIds.filter((x) => x !== a.id),
        createdMatches: state.createdMatches.filter((m) => m.id !== a.id),
      };
    case 'createMatch':
      return { ...state, createdMatches: [a.match, ...state.createdMatches], joinedMatchIds: [...state.joinedMatchIds, a.match.id] };
    case 'register':
      return { ...state, registrations: { ...state.registrations, [a.tournamentId]: a.teamName } };
    case 'toggleFavorite':
      return {
        ...state,
        favorites: state.favorites.includes(a.id) ? state.favorites.filter((x) => x !== a.id) : [...state.favorites, a.id],
      };
    case 'ownerBlock':
      return { ...state, ownerBlocks: [...state.ownerBlocks, a.block] };
    case 'ownerUnblock':
      return { ...state, ownerBlocks: state.ownerBlocks.filter((b) => b.id !== a.id) };
    case 'setDemoOwner':
      return { ...state, demoOwner: a.on };
    case 'setDemoRole':
      return { ...state, [a.key]: a.on };
    case 'setDemoPrice':
      return { ...state, demoPrices: { ...state.demoPrices, [a.pitchId]: a.price } };
    case 'setDemoPitchActive':
      return { ...state, demoPitchInactive: a.active ? state.demoPitchInactive.filter((x) => x !== a.pitchId) : [...state.demoPitchInactive, a.pitchId] };
    case 'editDemoPitch':
      return { ...state, demoPitchEdits: { ...state.demoPitchEdits, [a.pitchId]: { ...state.demoPitchEdits[a.pitchId], ...a.edits } } };
    case 'setDemoTournamentStatus':
      return { ...state, demoTournamentStatus: { ...state.demoTournamentStatus, [a.id]: a.status } };
    case 'addDemoTournament':
      return { ...state, demoTournaments: [a.tournament, ...state.demoTournaments] };
    case 'signedOut':
      return { ...state, onboarded: false, profile: initial().profile };
    case 'reset':
      return { ...initial(), lang: state.lang, onboarded: state.onboarded, profile: state.profile, hydrated: true };
  }
}

type TParams = Record<string, string | number>;

interface Remote {
  pitches: Pitch[];
  matches: Match[];
  players: Player[];
  tournaments: Tournament[];
  bookings: Booking[];
}

interface Ctx {
  state: State;
  dispatch: React.Dispatch<Action>;
  mode: 'demo' | 'live';
  /** Live mode: signed in. Demo mode: always true. */
  signedIn: boolean;
  /** Local state loaded and (live mode) session checked. */
  ready: boolean;
  /** Ready to show the main app (signed in with a player card). */
  onboarded: boolean;
  loading: boolean;
  lang: Lang;
  isRTL: boolean;
  t: (key: StringKey, params?: TParams) => string;
  l: (v: { ar: string; en: string }) => string;
  money: (n: number) => string;
  errText: (code: string) => string;
  meId: string;
  me: Player;
  pitches: Pitch[];
  allPitches: Pitch[];
  players: Player[];
  tournaments: Tournament[];
  allMatches: Match[];
  myBookings: Booking[];
  getPitch: (id: string) => Pitch;
  getPlayer: (id: string) => Player;
  getMatch: (id: string) => Match | undefined;
  getTournament: (id: string) => Tournament | undefined;
  matchPlayers: (m: Match) => string[];
  isJoined: (id: string) => boolean;
  registrationFor: (tournamentId: string) => string | undefined;
  bookedHours: (pitchId: string, dateISO: string) => Set<number>;
  loadBusy: (pitchId: string, dateISO: string) => Promise<void>;
  refresh: () => Promise<void>;
  // actions
  bookPitch: (p: { pitchId: string; dateISO: string; hour: number; duration: number; size: number; total: number }) => Promise<Result>;
  cancelBooking: (id: string) => Promise<Result>;
  createMatch: (p: { pitchId: string; dayOffset: number; hour: number; duration: number; format: 5 | 7 | 11; level: Match['level']; pricePerPlayer: number }) => Promise<Result>;
  joinMatch: (id: string) => Promise<Result>;
  leaveMatch: (id: string) => Promise<Result>;
  registerTeam: (tournamentId: string, name: string) => Promise<Result>;
  saveProfile: (p: Partial<Profile>) => Promise<Result>;
  setAvatar: (localUri: string) => Promise<Result>;
  removeAvatar: () => Promise<Result>;
  role: 'player' | 'owner' | 'academy' | 'admin';
  // auth (live mode)
  sendCode: (phone: string) => Promise<Result>;
  verifyCode: (phone: string, code: string) => Promise<Result>;
  signInGuest: () => Promise<Result>;
  signInWithGoogle: () => Promise<Result>;
  signOut: () => Promise<void>;
  // pitch owners
  isOwner: boolean;
  ownerPitches: Pitch[];
  ownerDay: (pitchId: string, dateISO: string) => Promise<OwnerSlot[]>;
  ownerBlock: (pitchId: string, dateISO: string, hour: number) => Promise<Result>;
  ownerUnblock: (slotId: string) => Promise<Result>;
  ownerUpdatePrice: (pitchId: string, price: number) => Promise<Result>;
  ownerUpdatePitch: (pitchId: string, p: { openFrom?: number; openTo?: number; amenities?: Pitch['amenities'] }) => Promise<Result>;
  ownerReport: (pitchId: string, days: number) => Promise<api.ReportDay[]>;
}

const AppContext = createContext<Ctx | null>(null);

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (e: unknown): Result => ({ ok: false, error: api.errorCode(e) });

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { ...initial(), hydrated: false });
  const live = backendEnabled;

  // live-mode state
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<'player' | 'owner' | 'academy' | 'admin'>('player');
  const [authChecked, setAuthChecked] = useState(!live);
  const [remote, setRemote] = useState<Remote>({ pitches: [], matches: [], players: [], tournaments: [], bookings: [] });
  const [busy, setBusy] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const userRef = useRef<string | null>(null);
  userRef.current = userId;

  /* ---------- persistence ---------- */
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'hydrate', state: raw ? JSON.parse(raw) : {} }))
      .catch(() => dispatch({ type: 'hydrate', state: {} }));
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated, ...persist } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persist)).catch(() => {});
  }, [state]);

  /* ---------- live: auth + data ---------- */
  const refresh = useCallback(async () => {
    if (!live) return;
    setLoading(true);
    try {
      const [pitches, m, tournaments] = await Promise.all([api.fetchPitches(), api.fetchMatches(), api.fetchTournaments()]);
      const uid = userRef.current;
      const [players, bookings] = await Promise.all([api.fetchPlayers(m.playerIds), uid ? api.fetchMyBookings(uid) : Promise.resolve([])]);
      setRemote({ pitches, matches: m.matches, players, tournaments, bookings });
    } catch {
      // keep what we have; screens show their empty states
    } finally {
      setLoading(false);
    }
  }, [live]);

  const loadUser = useCallback(async (uid: string | null) => {
    setUserId(uid);
    userRef.current = uid;
    if (uid) {
      try {
        const p = await api.fetchProfile(uid);
        if (p) {
          setRole(p.role);
          dispatch({ type: 'updateProfile', profile: { name: p.name, position: p.position, level: p.level, avatarUrl: p.avatar_url ?? undefined } });
          if (p.name) dispatch({ type: 'completeOnboarding', profile: {} });
          else {
            // Prefill the player card with the name from Google, if signed in that way.
            const { data } = await supabase!.auth.getUser();
            const full = (data.user?.user_metadata?.full_name as string | undefined) ?? '';
            if (full) dispatch({ type: 'updateProfile', profile: { name: full } });
          }
        }
      } catch {}
    } else {
      setRole('player');
    }
    setAuthChecked(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => loadUser(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') loadUser(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUser]);

  /* ---------- i18n ---------- */
  const lang = state.lang;
  const isRTL = lang === 'ar';
  const t = useCallback(
    (key: StringKey, params?: TParams) => {
      let s = strings[lang][key] ?? strings.en[key] ?? key;
      if (params) for (const k of Object.keys(params)) s = s.split(`{${k}}`).join(String(params[k]));
      return s;
    },
    [lang],
  );
  const l = useCallback((v: { ar: string; en: string }) => v[lang], [lang]);
  const money = useCallback((n: number) => formatMoney(n, lang), [lang]);
  const errText = useCallback(
    (code: string) => {
      const key = `err_${code}` as StringKey;
      return key in strings.en ? t(key) : t('err_unknown');
    },
    [t],
  );

  /* ---------- derived data ---------- */
  const meId = live ? userId ?? '' : ME_ID;

  /** Every pitch including deactivated ones (admin). */
  const allPitches = useMemo(() => {
    if (live) return remote.pitches;
    return seedPitches.map((p) => ({ ...p, ...state.demoPitchEdits[p.id], active: !state.demoPitchInactive.includes(p.id), pricePerHour: state.demoPrices[p.id] ?? p.pricePerHour }));
  }, [live, remote.pitches, state.demoPrices, state.demoPitchInactive, state.demoPitchEdits]);
  const pitches = useMemo(() => allPitches.filter((p) => p.active !== false), [allPitches]);

  const allMatches = useMemo(() => (live ? remote.matches : [...state.createdMatches, ...seedMatches]), [live, remote.matches, state.createdMatches]);

  const tournaments = useMemo(() => {
    if (live) return remote.tournaments;
    return [...state.demoTournaments, ...seedTournaments].map((base) => {
      const tr = state.demoTournamentStatus[base.id] ? { ...base, status: state.demoTournamentStatus[base.id] } : base;
      const name = state.registrations[tr.id];
      if (!name) return tr;
      return { ...tr, teams: [...tr.teams, { id: 'mine', name: { ar: name, en: name }, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, color: '#3E8DD8', captainId: ME_ID }] };
    });
  }, [live, remote.tournaments, state.registrations, state.demoTournaments, state.demoTournamentStatus]);

  const myBookings = live ? remote.bookings : state.bookings;
  const players = live ? remote.players : seedPlayers;

  const isJoined = useCallback(
    (id: string) => (live ? !!remote.matches.find((m) => m.id === id)?.playerIds.includes(meId) : state.joinedMatchIds.includes(id)),
    [live, remote.matches, meId, state.joinedMatchIds],
  );

  const me: Player = useMemo(() => {
    const played = live ? remote.matches.filter((m) => m.playerIds.includes(meId)).length : state.joinedMatchIds.length;
    const demoStats = { matches: 24 + played, goals: 11, assists: 9, mvp: 3, wins: 14, rating: 7.6 };
    return {
      id: meId,
      name: { ar: state.profile.name || 'أنا', en: state.profile.name || 'Me' },
      position: state.profile.position,
      level: state.profile.level,
      area: pitches[0]?.area ?? { ar: '', en: '' },
      stats: live ? { matches: played, goals: 0, assists: 0, mvp: 0, wins: 0, rating: 0 } : demoStats,
      color: '#0B2E6F',
      avatarUrl: state.profile.avatarUrl,
    };
  }, [live, remote.matches, meId, state.profile, state.joinedMatchIds.length, pitches]);

  const isOwner = live ? role === 'owner' || role === 'admin' : state.demoOwner;
  const ownerPitches = useMemo(() => (live ? pitches.filter((p) => p.ownerId === meId) : state.demoOwner ? pitches.slice(0, 1) : []), [live, pitches, meId, state.demoOwner]);

  /* ---------- availability ---------- */
  const demoBusy = useCallback(
    (pitchId: string, dateISO: string) => {
      const set = new Set<number>();
      const p = seedPitches.find((x) => x.id === pitchId);
      if (!p) return set;
      for (let h = p.openFrom; h < p.openTo; h++) if (hash(`${pitchId}${dateISO}${h}`) % 3 === 0) set.add(h);
      for (const b of state.bookings)
        if (b.pitchId === pitchId && b.dateISO === dateISO && b.status === 'confirmed')
          for (let h = b.hour; h < b.hour + b.duration; h++) set.add(Math.floor(h));
      for (const m of allMatches)
        if (m.pitchId === pitchId && toISODate(dateFromOffset(m.dayOffset)) === dateISO)
          for (let h = m.hour; h < m.hour + m.duration; h++) set.add(Math.floor(h));
      for (const b of state.ownerBlocks) if (b.pitchId === pitchId && b.dateISO === dateISO) set.add(b.hour);
      return set;
    },
    [state.bookings, state.ownerBlocks, allMatches],
  );

  const bookedHours = useCallback(
    (pitchId: string, dateISO: string) => (live ? new Set(busy[`${pitchId}|${dateISO}`] ?? []) : demoBusy(pitchId, dateISO)),
    [live, busy, demoBusy],
  );

  const loadBusy = useCallback(
    async (pitchId: string, dateISO: string) => {
      if (!live) return;
      try {
        const hours = await api.fetchBusyHours(pitchId, dateISO);
        setBusy((b) => ({ ...b, [`${pitchId}|${dateISO}`]: hours }));
      } catch {}
    },
    [live],
  );

  /* ---------- actions ---------- */
  const value: Ctx = useMemo(() => {
    const getPlayer = (id: string): Player =>
      id === meId ? me : players.find((p) => p.id === id) ?? { ...(seedPlayers[0] as Player), id, name: { ar: 'لاعب', en: 'Player' }, color: api.colorFor(id) };

    const guard = async (fn: () => Promise<Result>): Promise<Result> => {
      try {
        return await fn();
      } catch (e) {
        return fail(e);
      }
    };

    return {
      state,
      dispatch,
      mode: live ? 'live' : 'demo',
      signedIn: live ? !!userId : true,
      ready: state.hydrated && authChecked,
      onboarded: live ? authChecked && !!userId && state.onboarded : state.onboarded,
      loading: loading || !authChecked,
      lang,
      isRTL,
      t,
      l,
      money,
      errText,
      meId,
      me,
      pitches,
      allPitches,
      players,
      tournaments,
      allMatches,
      myBookings,
      getPitch: (id) => pitches.find((p) => p.id === id) ?? pitches[0] ?? seedPitches[0],
      getPlayer,
      getMatch: (id) => allMatches.find((m) => m.id === id),
      getTournament: (id) => tournaments.find((x) => x.id === id),
      isJoined,
      matchPlayers: (m) => {
        if (live) return m.playerIds;
        const base = m.playerIds.filter((x) => x !== ME_ID);
        return isJoined(m.id) ? [ME_ID, ...base] : base;
      },
      registrationFor: (tid) => {
        if (!live) return state.registrations[tid];
        return tournaments.find((x) => x.id === tid)?.teams.find((tm) => tm.captainId === meId)?.name.ar;
      },
      bookedHours,
      loadBusy,
      refresh,

      bookPitch: (p) =>
        guard(async () => {
          if (!live) {
            const id = `b${Date.now()}`;
            dispatch({ type: 'addBooking', booking: { id, pitchId: p.pitchId, dateISO: p.dateISO, hour: p.hour, duration: p.duration, size: p.size as 5, total: p.total, status: 'confirmed', createdAt: Date.now() } });
            return ok(id);
          }
          const row = await api.bookPitch(p);
          await Promise.all([refresh(), loadBusy(p.pitchId, p.dateISO)]);
          return ok(row.id);
        }),
      cancelBooking: (id) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'cancelBooking', id });
            return ok();
          }
          await api.cancelBooking(id);
          await refresh();
          return ok();
        }),
      createMatch: (p) =>
        guard(async () => {
          if (!live) {
            const id = `c${Date.now()}`;
            dispatch({
              type: 'createMatch',
              match: { id, pitchId: p.pitchId, dayOffset: p.dayOffset, hour: p.hour, duration: p.duration, format: p.format, level: p.level, pricePerPlayer: p.pricePerPlayer, maxPlayers: p.format * 2, playerIds: [ME_ID], organizerId: ME_ID, createdByMe: true },
            });
            return ok(id);
          }
          const row = await api.createMatch(p);
          await refresh();
          return ok(row.id);
        }),
      joinMatch: (id) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'join', id });
            return ok();
          }
          await api.joinMatch(id);
          await refresh();
          return ok();
        }),
      leaveMatch: (id) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'leave', id });
            return ok();
          }
          await api.leaveMatch(id);
          await refresh();
          return ok();
        }),
      registerTeam: (tid, name) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'register', tournamentId: tid, teamName: name });
            return ok();
          }
          await api.registerTeam(tid, name);
          await refresh();
          return ok();
        }),
      saveProfile: (p) =>
        guard(async () => {
          if (live && userId) await api.updateProfile(userId, { name: p.name, position: p.position, level: p.level });
          dispatch({ type: 'updateProfile', profile: p });
          return ok();
        }),

      setAvatar: (localUri) =>
        guard(async () => {
          const url = live && userId ? await api.uploadAvatar(userId, localUri) : localUri;
          dispatch({ type: 'updateProfile', profile: { avatarUrl: url } });
          if (live) refresh();
          return ok();
        }),
      removeAvatar: () =>
        guard(async () => {
          if (live && userId) await api.removeAvatar(userId);
          dispatch({ type: 'updateProfile', profile: { avatarUrl: undefined } });
          if (live) refresh();
          return ok();
        }),
      role: live ? role : state.demoAdmin ? 'admin' : state.demoOwner ? 'owner' : state.demoAcademy ? 'academy' : 'player',
      sendCode: (phone) =>
        guard(async () => {
          if (!supabase) return ok();
          const { error } = await supabase.auth.signInWithOtp({ phone });
          if (error) throw error;
          return ok();
        }),
      verifyCode: (phone, code) =>
        guard(async () => {
          if (!supabase) return ok();
          const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
          if (error) throw error;
          return ok();
        }),
      signInWithGoogle: () =>
        guard(async () => {
          if (!supabase) return ok();
          // Web: Supabase redirects the page and picks the session up from the URL on return.
          if (Platform.OS === 'web') {
            const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
            if (error) throw error;
            return ok();
          }
          // Native: open Google in an auth browser session and exchange the returned code.
          const redirectTo = Linking.createURL('auth/callback');
          const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
          if (error || !data?.url) throw error ?? new Error('oauth_failed');
          const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          if (res.type !== 'success') return { ok: false, error: 'cancelled' };
          const code = new URL(res.url).searchParams.get('code');
          if (!code) throw new Error('oauth_failed');
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          return ok();
        }),
      signInGuest: () =>
        guard(async () => {
          if (!supabase) return ok();
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          return ok();
        }),
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
        dispatch({ type: 'signedOut' });
      },

      isOwner,
      ownerPitches,
      ownerDay: async (pitchId, dateISO) => {
        if (live) return api.ownerDay(pitchId, dateISO);
        // Demo: synthetic app bookings + the user's own bookings + owner blocks.
        const names = seedPlayers.map((p) => p.name[lang]);
        const p = pitches.find((x) => x.id === pitchId);
        const slots: OwnerSlot[] = [];
        if (p) {
          for (let h = p.openFrom; h < p.openTo; h++)
            if (hash(`${pitchId}${dateISO}${h}`) % 3 === 0) slots.push({ id: `s${h}`, hour: h, duration: 1, status: 'confirmed', playerName: names[h % names.length], total: p.pricePerHour });
        }
        for (const b of state.bookings)
          if (b.pitchId === pitchId && b.dateISO === dateISO && b.status === 'confirmed') slots.push({ id: b.id, hour: b.hour, duration: b.duration, status: 'confirmed', playerName: state.profile.name, total: b.total });
        for (const b of state.ownerBlocks) if (b.pitchId === pitchId && b.dateISO === dateISO) slots.push({ id: b.id, hour: b.hour, duration: 1, status: 'blocked', playerName: '', total: 0 });
        return slots.sort((a, b) => a.hour - b.hour);
      },
      ownerBlock: (pitchId, dateISO, hour) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'ownerBlock', block: { id: `blk${Date.now()}`, pitchId, dateISO, hour } });
            return ok();
          }
          await api.ownerBlock(pitchId, dateISO, hour);
          await loadBusy(pitchId, dateISO);
          return ok();
        }),
      ownerUnblock: (slotId) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'ownerUnblock', id: slotId });
            return ok();
          }
          await api.ownerUnblock(slotId);
          return ok();
        }),
      ownerUpdatePitch: (pitchId, p) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'editDemoPitch', pitchId, edits: p });
            return ok();
          }
          await api.ownerUpdatePitch(pitchId, p);
          await refresh();
          return ok();
        }),
      ownerReport: async (pitchId, days) => {
        if (live) return api.ownerReport(pitchId, days);
        const p = pitches.find((x) => x.id === pitchId);
        return Array.from({ length: days }, (_, i) => {
          const offset = i - (days - 1);
          const dateISO = toISODate(dateFromOffset(offset));
          let hours = 0;
          if (p) for (let h = p.openFrom; h < p.openTo; h++) if (hash(`${pitchId}${dateISO}${h}`) % 3 === 0) hours++;
          for (const b of state.bookings) if (b.pitchId === pitchId && b.dateISO === dateISO && b.status === 'confirmed') hours += b.duration;
          return { dateISO, bookings: Math.round(hours), hours, revenue: hours * (p?.pricePerHour ?? 0) };
        });
      },
      ownerUpdatePrice: (pitchId, price) =>
        guard(async () => {
          if (!live) {
            dispatch({ type: 'setDemoPrice', pitchId, price });
            return ok();
          }
          await api.ownerUpdatePrice(pitchId, price);
          await refresh();
          return ok();
        }),
    };
  }, [state, live, userId, role, authChecked, loading, lang, isRTL, t, l, money, errText, meId, me, pitches, allPitches, players, tournaments, allMatches, myBookings, isJoined, bookedHours, loadBusy, refresh, isOwner, ownerPitches]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
