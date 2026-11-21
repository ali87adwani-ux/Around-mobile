/**
 * Tournament detail: rosters, match events, clips, awards and suspensions, plus every organiser and
 * captain action. Live mode only; in demo mode the detail is empty and actions explain that.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Highlight, MatchEvent, RosterPlayer, Tournament, TournamentAward } from '@/data/types';
import * as api from '@/lib/api';
import { useApp, type Result } from './AppStore';

export interface CupDetail {
  players: RosterPlayer[];
  events: MatchEvent[];
  highlights: Highlight[];
  awards: TournamentAward[];
  suspensions: { userId: string; teamId: string; fixtureId: string }[];
  liked: Set<string>;
}

const empty: CupDetail = { players: [], events: [], highlights: [], awards: [], suspensions: [], liked: new Set() };

export function useCup(id: string | undefined) {
  const app = useApp();
  const { mode, meId, role, getTournament, refresh } = app;
  const live = mode === 'live';
  const tour = id ? getTournament(id) : undefined;
  const [detail, setDetail] = useState<CupDetail>(empty);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!live || !id) return;
    setLoading(true);
    try {
      setDetail(await api.fetchTournamentDetail(id, meId || undefined));
    } catch {
    } finally {
      setLoading(false);
    }
  }, [live, id, meId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const isOrganizer = !!tour && (tour.organizerId === meId || role === 'admin');
  const myTeam = useMemo(() => {
    if (!tour) return undefined;
    const p = detail.players.find((x) => x.userId === meId);
    const teamId = p?.teamId ?? tour.teams.find((tm) => tm.captainId === meId)?.id;
    return tour.teams.find((tm) => tm.id === teamId);
  }, [tour, detail.players, meId]);

  /** Runs an action, then refreshes the tournament and its detail. */
  const act = useCallback(
    async (fn: () => Promise<unknown>): Promise<Result> => {
      if (!live) return { ok: false, error: 'live_only' };
      try {
        await fn();
        await Promise.all([refresh(), reload()]);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: api.errorCode(e) };
      }
    },
    [live, refresh, reload],
  );

  const helpers = useMemo(() => {
    const teamName = (teamId?: string) => {
      const tm = tour?.teams.find((x) => x.id === teamId);
      return tm ? app.l(tm.name) : app.t('tbd');
    };
    const playerName = (userId?: string) => detail.players.find((p) => p.userId === userId)?.name || app.t('player');
    const rosterOf = (teamId?: string) => detail.players.filter((p) => p.teamId === teamId);
    const scorers = () => {
      const m = new Map<string, { userId: string; teamId: string; goals: number; yellow: number; red: number }>();
      for (const e of detail.events) {
        if (!e.playerId) continue;
        const row = m.get(e.playerId) ?? { userId: e.playerId, teamId: e.teamId, goals: 0, yellow: 0, red: 0 };
        if (e.kind === 'goal') row.goals++;
        if (e.kind === 'yellow') row.yellow++;
        if (e.kind === 'red') row.red++;
        m.set(e.playerId, row);
      }
      return [...m.values()].sort((a, b) => b.goals - a.goals || a.red - b.red);
    };
    return { teamName, playerName, rosterOf, scorers };
  }, [tour, detail, app]);

  return { tour, detail, loading, reload, isOrganizer, myTeam, act, live, ...helpers };
}

/** Groups standings: points, goal difference, goals scored. */
export function rankTeams(teams: Tournament['teams']) {
  return [...teams].sort((a, b) => b.won * 3 + b.drawn - (a.won * 3 + a.drawn) || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
}

/** Label for a knockout round: final, semi-final, quarter-final, round of 16. */
export function roundKey(fixturesInRound: number): 'final' | 'semi' | 'quarter' | 'r16' | 'r32' {
  return fixturesInRound <= 1 ? 'final' : fixturesInRound === 2 ? 'semi' : fixturesInRound <= 4 ? 'quarter' : fixturesInRound <= 8 ? 'r16' : 'r32';
}
