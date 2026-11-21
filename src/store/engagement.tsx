/**
 * Match results & MVP votes, attendance-based reliability, waitlists, fixed teams, and points/rewards.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { errorCode } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useApp, type Result } from './AppStore';

export interface MatchResult {
  scoreA: number;
  scoreB: number;
  noShows: string[];
  votes: Record<string, string>; // voter -> player
}
export interface Team {
  id: string;
  name: string;
  color: string;
  code: string;
  captainId: string;
  members: { id: string; name: string }[];
}
export type RewardKey = 'discount_1' | 'discount_3' | 'free_hour';
export const REWARDS: { key: RewardKey; cost: number; value: number }[] = [
  { key: 'discount_1', cost: 100, value: 1 },
  { key: 'discount_3', cost: 250, value: 3 },
  { key: 'free_hour', cost: 600, value: 0 },
];
export interface Redemption {
  id: string;
  reward: RewardKey;
  cost: number;
  code: string;
  at: number;
}
export type Tier = 'bronze' | 'silver' | 'gold';
export const TIERS: { key: Tier; min: number }[] = [
  { key: 'bronze', min: 0 },
  { key: 'silver', min: 300 },
  { key: 'gold', min: 800 },
];

interface Ctx {
  getResult: (matchId: string) => MatchResult | undefined;
  mvpOf: (matchId: string) => string | undefined;
  recordResult: (matchId: string, scoreA: number, scoreB: number, noShows: string[]) => Promise<Result>;
  voteMvp: (matchId: string, playerId: string) => Promise<Result>;
  waitlistFor: (matchId: string) => string[];
  joinWaitlist: (matchId: string) => Promise<Result>;
  leaveWaitlist: (matchId: string) => Promise<Result>;
  stats: { played: number; noShows: number; mvp: number; bookings: number; reliability: number; points: number; earned: number; tier: Tier; nextTier?: { key: Tier; min: number } };
  reliabilityOf: (playerId: string) => number;
  teams: Team[];
  createTeam: (name: string, color: string) => Promise<Result>;
  joinTeam: (code: string) => Promise<Result>;
  leaveTeam: (teamId: string) => Promise<Result>;
  redemptions: Redemption[];
  redeem: (reward: RewardKey) => Promise<Result>;
  reload: () => Promise<void>;
}

const KEY = 'aldawri.engagement.v1';
const C = createContext<Ctx | null>(null);

interface DemoState {
  results: Record<string, MatchResult>;
  waitlists: Record<string, string[]>;
  teams: Team[];
  redemptions: Redemption[];
}
const emptyDemo: DemoState = { results: {}, waitlists: {}, teams: [], redemptions: [] };

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const randomCode = (n: number) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export function EngagementProvider({ children }: { children: React.ReactNode }) {
  const { mode, meId, state, allMatches, myBookings, players, refresh: refreshApp } = useApp();
  const live = mode === 'live';
  const [demo, setDemo] = useState<DemoState>(emptyDemo);
  const [hydrated, setHydrated] = useState(false);
  const [liveResults, setLiveResults] = useState<Record<string, MatchResult>>({});
  const [liveWaitlists, setLiveWaitlists] = useState<Record<string, string[]>>({});
  const [liveStats, setLiveStats] = useState<{ played: number; noShows: number; mvp: number; bookings: number } | null>(null);
  const [livePoints, setLivePoints] = useState(0);
  const [liveTeams, setLiveTeams] = useState<Team[]>([]);
  const [liveRedemptions, setLiveRedemptions] = useState<Redemption[]>([]);

  useEffect(() => {
    if (live) return;
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setDemo({ ...emptyDemo, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [live]);
  useEffect(() => {
    if (!live && hydrated) AsyncStorage.setItem(KEY, JSON.stringify(demo)).catch(() => {});
  }, [demo, live, hydrated]);

  const reload = useCallback(async () => {
    if (!live || !supabase || !meId) return;
    const ids = allMatches.map((m) => m.id);
    try {
      const [res, votes, att, wl, st, pts, tm, red] = await Promise.all([
        ids.length ? supabase.from('match_results').select('*').in('match_id', ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('mvp_votes').select('*').in('match_id', ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('match_players').select('match_id, user_id, attended').in('match_id', ids).eq('attended', false) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from('match_waitlist').select('*').in('match_id', ids).order('joined_at') : Promise.resolve({ data: [] }),
        supabase.rpc('player_stats', { p_user: meId }),
        supabase.rpc('my_points'),
        supabase.from('teams').select('*, team_members(user_id, profiles(name))'),
        supabase.from('reward_redemptions').select('*').order('created_at', { ascending: false }),
      ]);
      const results: Record<string, MatchResult> = {};
      for (const r of (res.data ?? []) as Record<string, any>[]) results[r.match_id] = { scoreA: r.score_a, scoreB: r.score_b, noShows: [], votes: {} };
      for (const v of (votes.data ?? []) as Record<string, any>[]) if (results[v.match_id]) results[v.match_id].votes[v.voter_id] = v.player_id;
      for (const a of (att.data ?? []) as Record<string, any>[]) if (results[a.match_id]) results[a.match_id].noShows.push(a.user_id);
      setLiveResults(results);
      const w: Record<string, string[]> = {};
      for (const r of (wl.data ?? []) as Record<string, any>[]) (w[r.match_id] ??= []).push(r.user_id);
      setLiveWaitlists(w);
      if (st.data) setLiveStats(st.data as { played: number; noShows: number; mvp: number; bookings: number });
      setLivePoints(Number(pts.data ?? 0));
      setLiveTeams(
        ((tm.data ?? []) as Record<string, any>[]).map((t) => ({
          id: t.id, name: t.name, color: t.color, code: t.code, captainId: t.captain_id,
          members: (t.team_members ?? []).map((m: Record<string, any>) => ({ id: m.user_id, name: m.profiles?.name ?? '' })),
        })),
      );
      setLiveRedemptions(((red.data ?? []) as Record<string, any>[]).map((r) => ({ id: r.id, reward: r.reward, cost: r.cost, code: r.code, at: Date.parse(r.created_at) })));
    } catch {}
  }, [live, meId, allMatches]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<Ctx>(() => {
    const results = live ? liveResults : demo.results;
    const waitlists = live ? liveWaitlists : demo.waitlists;
    const mvpOf = (matchId: string) => {
      const votes = Object.values(results[matchId]?.votes ?? {});
      if (!votes.length) return undefined;
      const count = new Map<string, number>();
      votes.forEach((p) => count.set(p, (count.get(p) ?? 0) + 1));
      return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };
    // demo stats from local data
    const myPlayed = allMatches.filter((m) => results[m.id] && (m.playerIds.includes(meId) || state.joinedMatchIds.includes(m.id)));
    const demoStats = {
      played: myPlayed.length,
      noShows: myPlayed.filter((m) => results[m.id].noShows.includes(meId)).length,
      mvp: allMatches.filter((m) => mvpOf(m.id) === meId).length,
      bookings: myBookings.filter((b) => b.status === 'confirmed').length,
    };
    const s = live ? liveStats ?? { played: 0, noShows: 0, mvp: 0, bookings: 0 } : demoStats;
    const redemptions = live ? liveRedemptions : demo.redemptions;
    const earned = s.played * 10 + s.bookings * 5 + s.mvp * 20;
    const spent = redemptions.reduce((sum, r) => sum + r.cost, 0);
    const points = live ? livePoints : earned - spent;
    const tier = [...TIERS].reverse().find((x) => earned >= x.min)!.key;
    const nextTier = TIERS.find((x) => x.min > earned);
    const run = async (fn: () => Promise<void>): Promise<Result> => {
      try {
        await fn();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: errorCode(e) };
      }
    };
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase!.rpc(name, args);
      if (error) throw error;
      return data;
    };

    return {
      getResult: (id) => results[id],
      mvpOf,
      recordResult: (matchId, scoreA, scoreB, noShows) =>
        run(async () => {
          if (live) {
            await rpc('record_result', { p_match: matchId, p_score_a: scoreA, p_score_b: scoreB, p_no_shows: noShows });
            await reload();
          } else setDemo((d) => ({ ...d, results: { ...d.results, [matchId]: { scoreA, scoreB, noShows, votes: d.results[matchId]?.votes ?? {} } } }));
        }),
      voteMvp: (matchId, playerId) =>
        run(async () => {
          if (playerId === meId) throw new Error('no_self_vote');
          if (live) {
            await rpc('vote_mvp', { p_match: matchId, p_player: playerId });
            await reload();
          } else {
            // Demo: other players' votes are simulated so the MVP feels real.
            const m = allMatches.find((x) => x.id === matchId);
            const others = (m?.playerIds ?? []).filter((p) => p !== meId);
            const fake: Record<string, string> = {};
            others.slice(0, 4).forEach((voter, i) => (fake[voter] = i % 2 === 0 ? playerId : others[(hash(voter) % others.length)]));
            setDemo((d) => ({ ...d, results: { ...d.results, [matchId]: { ...d.results[matchId], votes: { ...fake, ...d.results[matchId]?.votes, [meId]: playerId } } } }));
          }
        }),
      waitlistFor: (id) => waitlists[id] ?? [],
      joinWaitlist: (matchId) =>
        run(async () => {
          if (live) {
            await rpc('join_waitlist', { p_match: matchId });
            await reload();
          } else setDemo((d) => ({ ...d, waitlists: { ...d.waitlists, [matchId]: [...(d.waitlists[matchId] ?? ['u9', 'u11']).filter((x) => x !== meId), meId] } }));
        }),
      leaveWaitlist: (matchId) =>
        run(async () => {
          if (live) {
            await rpc('leave_waitlist', { p_match: matchId });
            await reload();
          } else setDemo((d) => ({ ...d, waitlists: { ...d.waitlists, [matchId]: (d.waitlists[matchId] ?? []).filter((x) => x !== meId) } }));
        }),
      stats: { ...s, reliability: s.played ? Math.round(((s.played - s.noShows) / s.played) * 100) : 100, points, earned, tier, nextTier },
      reliabilityOf: (playerId) => {
        if (playerId === meId) return s.played ? Math.round(((s.played - s.noShows) / s.played) * 100) : 100;
        return live ? 100 : 88 + (hash(playerId) % 13);
      },
      teams: live ? liveTeams : demo.teams,
      createTeam: (name, color) =>
        run(async () => {
          if (live) {
            await rpc('create_team', { p_name: name, p_color: color });
            await reload();
          } else setDemo((d) => ({ ...d, teams: [...d.teams, { id: `tm${Date.now()}`, name, color, code: randomCode(6), captainId: meId, members: [{ id: meId, name: state.profile.name }] }] }));
        }),
      joinTeam: (code) =>
        run(async () => {
          if (live) {
            await rpc('join_team', { p_code: code });
            await reload();
            return;
          }
          // Demo: any 6-character code joins a sample team.
          if (code.trim().length !== 6) throw new Error('team_not_found');
          const sample = players.slice(0, 5).map((p) => ({ id: p.id, name: p.name.ar }));
          setDemo((d) => ({ ...d, teams: [...d.teams, { id: `tm${Date.now()}`, name: 'عيال الفريج', color: '#C2185B', code: code.trim().toUpperCase(), captainId: sample[0].id, members: [...sample, { id: meId, name: state.profile.name }] }] }));
        }),
      leaveTeam: (teamId) =>
        run(async () => {
          if (live) {
            await rpc('leave_team', { p_team: teamId });
            await reload();
          } else setDemo((d) => ({ ...d, teams: d.teams.filter((t) => t.id !== teamId) }));
        }),
      redemptions,
      redeem: (reward) =>
        run(async () => {
          const r = REWARDS.find((x) => x.key === reward)!;
          if (points < r.cost) throw new Error('not_enough_points');
          if (live) {
            await rpc('redeem_reward', { p_reward: reward });
            await reload();
          } else setDemo((d) => ({ ...d, redemptions: [{ id: `rd${Date.now()}`, reward, cost: r.cost, code: randomCode(8), at: Date.now() }, ...d.redemptions] }));
        }),
      reload,
    };
  }, [live, liveResults, liveWaitlists, liveStats, livePoints, liveTeams, liveRedemptions, demo, allMatches, myBookings, meId, state.joinedMatchIds, state.profile.name, players, reload, refreshApp]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useEngagement() {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useEngagement must be used inside EngagementProvider');
  return ctx;
}
