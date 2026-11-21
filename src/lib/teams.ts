/** Splitting a pickup game into two sides. Mirrors public.balance_teams on the server (used in demo mode). */
import type { Player } from '@/data/types';

const LEVEL_SCORE = { beginner: 1, intermediate: 2, advanced: 3 } as const;

/** Goalkeepers first (one per side), then each next-strongest player joins the weaker side. */
export function balanceLocal(ids: string[], getPlayer: (id: string) => Player, shuffle: boolean): Record<string, 'A' | 'B'> {
  const rows = ids.map((id) => {
    const p = getPlayer(id);
    return { id, gk: p.position === 'GK', score: (LEVEL_SCORE[p.level] ?? 2) + Math.random() * (shuffle ? 1.6 : 0.2) };
  });
  rows.sort((a, b) => Number(b.gk) - Number(a.gk) || b.score - a.score);
  const cap = Math.ceil(ids.length / 2);
  const out: Record<string, 'A' | 'B'> = {};
  let sa = 0, sb = 0, ca = 0, cb = 0, keepers = 0;
  for (const r of rows) {
    let t: 'A' | 'B';
    if (r.gk && keepers < 2) {
      keepers += 1;
      t = keepers === 1 ? (shuffle && Math.random() < 0.5 ? 'B' : 'A') : ca <= cb ? 'A' : 'B';
    } else if (ca >= cap) t = 'B';
    else if (cb >= cap) t = 'A';
    else t = sa < sb || (sa === sb && ca <= cb) ? 'A' : 'B';
    out[r.id] = t;
    if (t === 'A') (sa += r.score), (ca += 1);
    else (sb += r.score), (cb += 1);
  }
  return out;
}

/**
 * The two sides to draw. Before the organiser splits the teams, players alternate by join order.
 * Afterwards each player sits on their side; newcomers fill the side with fewer players.
 */
export function sidesFor(ids: string[], teams: Record<string, 'A' | 'B'> | undefined, maxPlayers: number) {
  const half = Math.ceil(maxPlayers / 2);
  const a: string[] = [];
  const b: string[] = [];
  const assigned = !!teams && Object.keys(teams).some((k) => ids.includes(k));
  if (!assigned) ids.forEach((id, i) => (i % 2 === 0 ? a : b).push(id));
  else {
    for (const id of ids) if (teams![id] === 'A') a.push(id);
    for (const id of ids) if (teams![id] === 'B') b.push(id);
    for (const id of ids) if (!teams![id]) (a.length <= b.length ? a : b).push(id);
  }
  const pad = (s: string[]) => [...s, ...Array.from({ length: Math.max(0, half - s.length) }, () => undefined)] as (string | undefined)[];
  return { teamA: pad(a), teamB: pad(b), assigned };
}

/** Average level (1–3) of a side, for the "balanced" indicator. */
export function sideLevel(ids: (string | undefined)[], getPlayer: (id: string) => Player) {
  const real = ids.filter(Boolean) as string[];
  if (!real.length) return 0;
  return real.reduce((s, id) => s + (LEVEL_SCORE[getPlayer(id).level] ?? 2), 0) / real.length;
}
