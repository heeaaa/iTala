import { League, GameEvent, StatLine, Game, Team, EventType } from '../types';
import { pct } from './format';
import { DEFAULT_FOUL_OUT } from '../theme';

// Effective foul-out limit. FIBA = 5. We cap any legacy stored value (older
// leagues saved 6) so foul-out always triggers on the 5th foul.
export function effectiveFoulLimit(league: League): number {
  const stored = league.foulOutLimit;
  if (!stored || stored > DEFAULT_FOUL_OUT) return DEFAULT_FOUL_OUT;
  return stored;
}

const blankLine = (playerId: string | null): StatLine => ({
  playerId, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
  oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
});

function apply(line: StatLine, type: EventType) {
  switch (type) {
    case 'fg2_make': line.pts += 2; line.fgm++; line.fga++; break;
    case 'fg2_miss': line.fga++; break;
    case 'fg3_make': line.pts += 3; line.fgm++; line.fga++; line.tpm++; line.tpa++; break;
    case 'fg3_miss': line.fga++; line.tpa++; break;
    case 'ft_make':  line.pts += 1; line.ftm++; line.fta++; break;
    case 'ft_miss':  line.fta++; break;
    case 'oreb': line.oreb++; line.reb++; break;
    case 'dreb': line.dreb++; line.reb++; break;
    case 'reb':  line.reb++; break;
    case 'ast': line.ast++; break;
    case 'stl': line.stl++; break;
    case 'blk': line.blk++; break;
    case 'tov': line.tov++; break;
    case 'pf':  line.pf++; break;
  }
}

// Per-player box score for one team in one game (+ team total).
export function teamBoxScore(
  league: League, gameId: string, teamId: string
): { lines: StatLine[]; total: StatLine } {
  const team = league.teams.find(t => t.id === teamId);
  const evs = league.events.filter(e => e.gameId === gameId && e.teamId === teamId);
  const map = new Map<string | null, StatLine>();

  // seed roster players so they show even with 0 stats
  if (team && !team.teamOnly) {
    for (const pid of team.playerIds) map.set(pid, blankLine(pid));
  }
  for (const e of evs) {
    const key = e.playerId;
    if (!map.has(key)) map.set(key, blankLine(key));
    apply(map.get(key)!, e.type);
  }
  const lines = [...map.values()].sort((a, b) => b.pts - a.pts);
  const total = blankLine(null);
  for (const l of lines) {
    total.pts += l.pts; total.fgm += l.fgm; total.fga += l.fga;
    total.tpm += l.tpm; total.tpa += l.tpa; total.ftm += l.ftm; total.fta += l.fta;
    total.oreb += l.oreb; total.dreb += l.dreb; total.reb += l.reb;
    total.ast += l.ast; total.stl += l.stl; total.blk += l.blk;
    total.tov += l.tov; total.pf += l.pf;
  }
  return { lines, total };
}

export function gameScore(league: League, game: Game): { home: number; away: number } {
  return {
    home: teamBoxScore(league, game.id, game.homeTeamId).total.pts,
    away: teamBoxScore(league, game.id, game.awayTeamId).total.pts,
  };
}

export interface StandingRow {
  team: Team; wins: number; losses: number;
  pf: number; pa: number; diff: number; streak: string;
}

export function standings(league: League): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const t of league.teams)
    rows.set(t.id, { team: t, wins: 0, losses: 0, pf: 0, pa: 0, diff: 0, streak: '' });

  const finals = league.games
    .filter(g => g.status === 'final')
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));

  const streakLog = new Map<string, ('W' | 'L')[]>();
  for (const g of finals) {
    const s = gameScore(league, g);
    const home = rows.get(g.homeTeamId);
    const away = rows.get(g.awayTeamId);
    if (!home || !away) continue;
    home.pf += s.home; home.pa += s.away;
    away.pf += s.away; away.pa += s.home;
    const homeWon = s.home >= s.away;
    (homeWon ? home : away).wins++;
    (homeWon ? away : home).losses++;
    pushStreak(streakLog, g.homeTeamId, homeWon ? 'W' : 'L');
    pushStreak(streakLog, g.awayTeamId, homeWon ? 'L' : 'W');
  }
  for (const r of rows.values()) {
    r.diff = r.pf - r.pa;
    r.streak = formatStreak(streakLog.get(r.team.id) ?? []);
  }
  // tie-break: win% -> point differential (head-to-head omitted for brevity)
  return [...rows.values()].sort((a, b) => {
    const wpa = winPct(a), wpb = winPct(b);
    if (wpb !== wpa) return wpb - wpa;
    return b.diff - a.diff;
  });
}

const winPct = (r: StandingRow) =>
  r.wins + r.losses === 0 ? 0 : r.wins / (r.wins + r.losses);

function pushStreak(log: Map<string, ('W' | 'L')[]>, id: string, v: 'W' | 'L') {
  if (!log.has(id)) log.set(id, []);
  log.get(id)!.push(v);
}
function formatStreak(arr: ('W' | 'L')[]): string {
  if (arr.length === 0) return '—';
  const last = arr[arr.length - 1];
  let n = 0;
  for (let i = arr.length - 1; i >= 0 && arr[i] === last; i--) n++;
  return `${last}${n}`;
}

export interface LeaderRow {
  playerId: string; name: string; teamName: string; teamId: string | null; gp: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number;
  tpm: number;    // season 3-pointers made (total)
  rating: number; // composite per-game rating used for MVP/awards
}

export const winPctOf = (wins: number, losses: number): number =>
  wins + losses === 0 ? 0 : wins / (wins + losses);

// Composite single-game value — the standard "game score"-style weighting.
export const perfRating = (l: { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number }): number =>
  l.pts + 1.2 * l.reb + 1.5 * l.ast + 3 * l.stl + 3 * l.blk - l.tov;

// One row per player per final game — feeds leaders, awards, and team pages.
export interface GameLog {
  playerId: string; teamId: string; gameId: string; dateMs: number; line: StatLine;
}

export function gameLogs(league: League): GameLog[] {
  const out: GameLog[] = [];
  const finals = league.games.filter(g => g.status === 'final');
  for (const g of finals) {
    for (const teamId of [g.homeTeamId, g.awayTeamId]) {
      const { lines } = teamBoxScore(league, g.id, teamId);
      for (const l of lines) {
        if (!l.playerId) continue;
        const touched = l.pts || l.reb || l.ast || l.stl || l.blk || l.fga || l.fta || l.tov || l.pf;
        if (!touched) continue;
        out.push({ playerId: l.playerId, teamId, gameId: g.id, dateMs: g.finishedAt ?? g.scheduledAt ?? 0, line: l });
      }
    }
  }
  return out;
}

export function leaderboards(league: League): LeaderRow[] {
  const logs = gameLogs(league);
  const acc = new Map<string, { teamId: string; gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; tpm: number; rating: number }>();
  for (const gl of logs) {
    if (!acc.has(gl.playerId)) acc.set(gl.playerId, { teamId: gl.teamId, gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, rating: 0 });
    const a = acc.get(gl.playerId)!;
    a.gp++; a.pts += gl.line.pts; a.reb += gl.line.reb; a.ast += gl.line.ast;
    a.stl += gl.line.stl; a.blk += gl.line.blk; a.tpm += gl.line.tpm;
    a.rating += perfRating(gl.line);
    a.teamId = gl.teamId; // latest team they appeared for
  }
  const rows: LeaderRow[] = [];
  for (const [pid, a] of acc) {
    const player = league.players.find(p => p.id === pid);
    const team = league.teams.find(t => t.id === a.teamId) ?? league.teams.find(t => t.playerIds.includes(pid));
    if (!player) continue;
    rows.push({
      playerId: pid, name: player.name, teamName: team?.name ?? '', teamId: team?.id ?? null,
      gp: a.gp,
      ppg: a.pts / a.gp, rpg: a.reb / a.gp, apg: a.ast / a.gp,
      spg: a.stl / a.gp, bpg: a.blk / a.gp,
      tpm: a.tpm, rating: a.rating / a.gp,
    });
  }
  return rows.sort((a, b) => b.ppg - a.ppg);
}

// ---- Awards — fully automatic, no manual input --------------------------------
export interface AwardWinner { playerId: string; name: string; teamName: string; value: string }
export interface LeagueAwards {
  playerOfWeek: AwardWinner | null;   // best single-game rating, last 7 days
  playerOfMonth: AwardWinner | null;  // best single-game rating, last 30 days
  scoringChampion: AwardWinner | null;
  assistLeader: AwardWinner | null;
  bestDefender: AwardWinner | null;   // steals + blocks per game
  mostImproved: AwardWinner | null;   // rating jump, 2nd half vs 1st half of their games
  seasonMVP: AwardWinner | null;      // best composite rating per game
  mythicalFive: AwardWinner[];        // top 5 by composite rating
}

export function leagueAwards(league: League): LeagueAwards {
  const rows = leaderboards(league);
  const logs = gameLogs(league);
  const nameOf = (pid: string) => league.players.find(p => p.id === pid)?.name ?? '?';
  const teamOf = (pid: string, tid?: string) =>
    (tid && league.teams.find(t => t.id === tid)?.name) ??
    league.teams.find(t => t.playerIds.includes(pid))?.name ?? '';

  // Eligibility: at least a third of the busiest player's games (min 1).
  const maxGP = rows.reduce((m, r) => Math.max(m, r.gp), 0);
  const minGP = Math.max(1, Math.floor(maxGP / 3));
  const eligible = rows.filter(r => r.gp >= minGP);

  const bestInWindow = (days: number): AwardWinner | null => {
    const cutoff = Date.now() - days * 86400_000;
    let best: GameLog | null = null;
    for (const gl of logs) {
      if (gl.dateMs < cutoff) continue;
      if (!best || perfRating(gl.line) > perfRating(best.line)) best = gl;
    }
    if (!best) return null;
    const l = best.line;
    return {
      playerId: best.playerId, name: nameOf(best.playerId), teamName: teamOf(best.playerId, best.teamId),
      value: `${l.pts} pts · ${l.reb} reb · ${l.ast} ast`,
    };
  };

  const topBy = (fn: (r: LeaderRow) => number, fmt: (r: LeaderRow) => string): AwardWinner | null => {
    const pool = eligible.length ? eligible : rows;
    if (pool.length === 0) return null;
    const r = [...pool].sort((a, b) => fn(b) - fn(a))[0];
    if (fn(r) <= 0) return null;
    return { playerId: r.playerId, name: r.name, teamName: r.teamName, value: fmt(r) };
  };

  // Most improved: split each player's game log in half chronologically.
  let improved: AwardWinner | null = null;
  {
    let bestJump = 0;
    const byPlayer = new Map<string, GameLog[]>();
    for (const gl of logs) {
      if (!byPlayer.has(gl.playerId)) byPlayer.set(gl.playerId, []);
      byPlayer.get(gl.playerId)!.push(gl);
    }
    for (const [pid, arr] of byPlayer) {
      if (arr.length < 4) continue; // needs enough games to mean anything
      arr.sort((a, b) => a.dateMs - b.dateMs);
      const half = Math.floor(arr.length / 2);
      const avg = (part: GameLog[]) => part.reduce((sum, x) => sum + perfRating(x.line), 0) / part.length;
      const jump = avg(arr.slice(half)) - avg(arr.slice(0, half));
      if (jump > bestJump) {
        bestJump = jump;
        improved = { playerId: pid, name: nameOf(pid), teamName: teamOf(pid), value: `+${jump.toFixed(1)} rating` };
      }
    }
  }

  const mythical = [...eligible].sort((a, b) => b.rating - a.rating).slice(0, 5)
    .map(r => ({ playerId: r.playerId, name: r.name, teamName: r.teamName, value: `${r.ppg.toFixed(1)} ppg · ${r.rpg.toFixed(1)} rpg · ${r.apg.toFixed(1)} apg` }));

  return {
    playerOfWeek: bestInWindow(7),
    playerOfMonth: bestInWindow(30),
    scoringChampion: topBy(r => r.ppg, r => `${r.ppg.toFixed(1)} PPG`),
    assistLeader: topBy(r => r.apg, r => `${r.apg.toFixed(1)} APG`),
    bestDefender: topBy(r => r.spg + r.bpg, r => `${(r.spg + r.bpg).toFixed(1)} stocks/gm`),
    mostImproved: improved,
    seasonMVP: topBy(r => r.rating, r => `${r.rating.toFixed(1)} rating`),
    mythicalFive: mythical,
  };
}

export interface LastGameStat {
  pts: number; reb: number; ast: number; stl: number; blk: number;
  leagueName: string;
  dateMs?: number;
  matchup?: string;  // "Warriors vs Bulls"
  score?: string;    // "78–71"
}

export interface CareerStats {
  gp: number;
  // per-game averages
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number; pfpg: number;
  tpmpg: number; // 3-pointers made per game
  // shooting totals + percentages
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  fgPct: string; tpPct: string; ftPct: string;
  // career highs
  highPts: number; highReb: number; highAst: number; highStl: number; highBlk: number;
  best: string; // "22/9/5" of the best scoring game (pts/reb/ast)
  bestGame: LastGameStat | null; // full stat line of the best scoring game
  lastGame: LastGameStat | null;
  badges: string[];
}

export function careerStats(league: League, playerId: string): CareerStats {
  const finals = league.games.filter(g => g.status === 'final');
  let gp = 0, pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, tov = 0, pf = 0;
  let fgm = 0, fga = 0, tpm = 0, tpa = 0, ftm = 0, fta = 0;
  let highPts = 0, highReb = 0, highAst = 0, highStl = 0, highBlk = 0;
  let best = '—';
  let bestGame: LastGameStat | null = null;
  let lastGame: LastGameStat | null = null;
  let lastGameMs = -1;
  const badges = new Set<string>();

  const gameMeta = (g: Game): { matchup: string; score: string } => {
    const home = league.teams.find(t => t.id === g.homeTeamId)?.name ?? 'Home';
    const away = league.teams.find(t => t.id === g.awayTeamId)?.name ?? 'Away';
    const s = gameScore(league, g);
    return { matchup: `${home} vs ${away}`, score: `${s.home}–${s.away}` };
  };

  for (const g of finals) {
    for (const teamId of [g.homeTeamId, g.awayTeamId]) {
      const { lines } = teamBoxScore(league, g.id, teamId);
      const l = lines.find(x => x.playerId === playerId);
      if (!l) continue;
      const touched = l.pts || l.reb || l.ast || l.stl || l.blk || l.fga || l.fta || l.tov || l.pf;
      if (!touched) continue;
      gp++;
      pts += l.pts; reb += l.reb; ast += l.ast; stl += l.stl; blk += l.blk; tov += l.tov; pf += l.pf;
      fgm += l.fgm; fga += l.fga; tpm += l.tpm; tpa += l.tpa; ftm += l.ftm; fta += l.fta;
      if (l.pts > highPts || !bestGame) {
        highPts = Math.max(highPts, l.pts);
        best = `${l.pts}/${l.reb}/${l.ast}`;
        bestGame = {
          pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk,
          leagueName: league.name,
          dateMs: g.finishedAt ?? g.scheduledAt,
          ...gameMeta(g),
        };
      }
      highReb = Math.max(highReb, l.reb);
      highAst = Math.max(highAst, l.ast);
      highStl = Math.max(highStl, l.stl);
      highBlk = Math.max(highBlk, l.blk);
      // Track the most recent final game this player appeared in.
      const ms = g.finishedAt ?? g.scheduledAt ?? 0;
      if (ms >= lastGameMs) {
        lastGameMs = ms;
        lastGame = {
          pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk,
          leagueName: league.name,
          dateMs: g.finishedAt ?? g.scheduledAt,
          ...gameMeta(g),
        };
      }
      const dd = [l.pts >= 10, l.reb >= 10, l.ast >= 10, l.stl >= 10, l.blk >= 10].filter(Boolean).length;
      if (dd >= 3) badges.add('Triple-Double');
      else if (dd >= 2) badges.add('Double-Double');
      if (l.pts >= 50) badges.add('50-Burger');
      else if (l.pts >= 30) badges.add('30+ Game');
      if (l.tpm >= 5) badges.add('Sharpshooter');
    }
  }
  return {
    gp,
    ppg: gp ? pts / gp : 0, rpg: gp ? reb / gp : 0, apg: gp ? ast / gp : 0,
    spg: gp ? stl / gp : 0, bpg: gp ? blk / gp : 0, topg: gp ? tov / gp : 0, pfpg: gp ? pf / gp : 0,
    tpmpg: gp ? tpm / gp : 0,
    fgm, fga, tpm, tpa, ftm, fta,
    fgPct: pct(fgm, fga), tpPct: pct(tpm, tpa), ftPct: pct(ftm, fta),
    highPts, highReb, highAst, highStl, highBlk, best,
    bestGame,
    lastGame,
    badges: [...badges],
  };
}

// ---- Foul helpers ----

export function pointsOfType(type: EventType): number {
  if (type === 'fg2_make') return 2;
  if (type === 'fg3_make') return 3;
  if (type === 'ft_make') return 1;
  return 0;
}

// Personal fouls for one player across the whole game (drives foul-out).
export function playerFouls(league: League, gameId: string, playerId: string): number {
  return league.events.filter(
    e => e.gameId === gameId && e.playerId === playerId && e.type === 'pf'
  ).length;
}

// Team fouls in a specific period (resets each period, like real basketball bonus tracking).
export function teamPeriodFouls(league: League, gameId: string, teamId: string, period: number): number {
  return league.events.filter(
    e => e.gameId === gameId && e.teamId === teamId && e.type === 'pf' && e.period === period
  ).length;
}

// Set of player ids on a team that have fouled out of this game.
export function fouledOutSet(league: League, gameId: string, teamId: string): Set<string> {
  const limit = effectiveFoulLimit(league);
  const team = league.teams.find(t => t.id === teamId);
  const out = new Set<string>();
  if (!team) return out;
  for (const pid of team.playerIds) {
    if (playerFouls(league, gameId, pid) >= limit) out.add(pid);
  }
  return out;
}

export interface LineScore {
  periods: number[];        // [1,2,3,...] periods that have any scoring
  home: number[];           // points per period for home
  away: number[];           // points per period for away
}

// Per-period (end-of-quarter) points for each team.
export function lineScore(league: League, game: Game): LineScore {
  let maxP = 1;
  for (const e of league.events) {
    if (e.gameId === game.id) maxP = Math.max(maxP, e.period);
  }
  const periods = Array.from({ length: maxP }, (_, i) => i + 1);
  const home = periods.map(() => 0);
  const away = periods.map(() => 0);
  for (const e of league.events) {
    if (e.gameId !== game.id) continue;
    const pts = pointsOfType(e.type);
    if (!pts) continue;
    const idx = e.period - 1;
    if (idx < 0 || idx >= periods.length) continue;
    if (e.teamId === game.homeTeamId) home[idx] += pts;
    else if (e.teamId === game.awayTeamId) away[idx] += pts;
  }
  return { periods, home, away };
}
