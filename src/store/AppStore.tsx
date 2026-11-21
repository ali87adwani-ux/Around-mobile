import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { ME_ID, matches as seedMatches, pitches, players, tournaments } from '@/data/seed';
import type { Booking, Lang, Match, Pitch, Player, Profile, Tournament } from '@/data/types';
import { strings, type StringKey } from '@/i18n/strings';
import { dateFromOffset, formatMoney, toISODate } from '@/i18n/format';

const STORAGE_KEY = 'aldawri.state.v1';

interface PersistedState {
  lang: Lang;
  onboarded: boolean;
  profile: Profile;
  bookings: Booking[];
  joinedMatchIds: string[];
  createdMatches: Match[];
  registrations: Record<string, string>;
  favorites: string[];
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
  bookings: [],
  joinedMatchIds: [],
  createdMatches: [],
  registrations: {},
  favorites: ['p1'],
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
    case 'reset':
      return { ...initial(), lang: state.lang, onboarded: state.onboarded, profile: state.profile, hydrated: true };
  }
}

type TParams = Record<string, string | number>;

interface Ctx {
  state: State;
  dispatch: React.Dispatch<Action>;
  lang: Lang;
  isRTL: boolean;
  t: (key: StringKey, params?: TParams) => string;
  l: (v: { ar: string; en: string }) => string;
  money: (n: number) => string;
  me: Player;
  allMatches: Match[];
  getPitch: (id: string) => Pitch;
  getPlayer: (id: string) => Player;
  getMatch: (id: string) => Match | undefined;
  getTournament: (id: string) => Tournament | undefined;
  matchPlayers: (m: Match) => string[];
  isJoined: (id: string) => boolean;
  bookedHours: (pitchId: string, dateISO: string) => Set<number>;
  pitches: Pitch[];
  players: Player[];
  tournaments: Tournament[];
}

const AppContext = createContext<Ctx | null>(null);

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { ...initial(), hydrated: false });

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

  const allMatches = useMemo(() => [...state.createdMatches, ...seedMatches], [state.createdMatches]);

  const me: Player = useMemo(() => {
    const played = state.joinedMatchIds.length;
    return {
      id: ME_ID,
      name: { ar: state.profile.name || 'أنا', en: state.profile.name || 'Me' },
      position: state.profile.position,
      level: state.profile.level,
      area: pitches[0].area,
      stats: { matches: 24 + played, goals: 11, assists: 9, mvp: 3, wins: 14, rating: 7.6 },
      color: '#0B2E6F',
    };
  }, [state.profile, state.joinedMatchIds.length]);

  const value: Ctx = useMemo(() => {
    const getPlayer = (id: string) => (id === ME_ID ? me : players.find((p) => p.id === id) ?? players[0]);
    const isJoined = (id: string) => state.joinedMatchIds.includes(id);
    return {
      state,
      dispatch,
      lang,
      isRTL,
      t,
      l,
      money,
      me,
      allMatches,
      pitches,
      players,
      tournaments,
      getPitch: (id) => pitches.find((p) => p.id === id) ?? pitches[0],
      getPlayer,
      getMatch: (id) => allMatches.find((m) => m.id === id),
      getTournament: (id) => tournaments.find((x) => x.id === id),
      isJoined,
      matchPlayers: (m) => {
        const base = m.playerIds.filter((x) => x !== ME_ID);
        return isJoined(m.id) ? [ME_ID, ...base] : base;
      },
      bookedHours: (pitchId, dateISO) => {
        const set = new Set<number>();
        const p = pitches.find((x) => x.id === pitchId);
        if (!p) return set;
        for (let h = p.openFrom; h < p.openTo; h++) if (hash(`${pitchId}${dateISO}${h}`) % 3 === 0) set.add(h);
        for (const b of state.bookings)
          if (b.pitchId === pitchId && b.dateISO === dateISO && b.status === 'confirmed')
            for (let h = b.hour; h < b.hour + b.duration; h++) set.add(Math.floor(h));
        for (const m of allMatches)
          if (m.pitchId === pitchId && toISODate(dateFromOffset(m.dayOffset)) === dateISO)
            for (let h = m.hour; h < m.hour + m.duration; h++) set.add(Math.floor(h));
        return set;
      },
    };
  }, [state, lang, isRTL, t, l, money, me, allMatches]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
