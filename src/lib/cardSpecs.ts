import { League, Team } from '../types';
import { colors } from '../theme';
import { CardSpec } from '../components/AchievementCard';
import {
  careerStats, leagueAwards, standings, teamBoxScore, gameScore, perfRating,
  AwardWinner,
} from './stats';
import { dateLabel } from './format';

// ============================================================================
// Card spec builders — pure functions from app data → CardSpec. These decide
// WHICH cards a player/season qualifies for and populate them. Adding a new
// achievement is a new builder here plus (optionally) an entry in the menus.
// ============================================================================

const teamOfPlayer = (league: League, playerId: string): Team | undefined =>
  league.teams.find(t => t.playerIds.includes(playerId));

const leagueLine = (league: League) => `${league.name} · ${league.season}`;

// ---- GAME CARDS -----------------------------------------------------------

export interface GameCardOption { key: string; label: string; build: () => CardSpec }

// Given a specific final game + player, return every game card they earned.
export function gameCardOptions(league: League, gameId: string, playerId: string): GameCardOption[] {
  const game = league.games.find(g => g.id === gameId);
  if (!game) return [];
  const team = teamOfPlayer(league, playerId);
  const teamId = team?.id ?? '';
  const box = teamBoxScore(league, gameId, teamId);
  const line = box.lines.find(l => l.playerId === playerId);
  if (!line) return [];

  const home = league.teams.find(t => t.id === game.homeTeamId);
  const away = league.teams.find(t => t.id === game.awayTeamId);
  const sc = gameScore(league, game);
  const opp = team?.id === game.homeTeamId ? away : home;
  const dateMs = game.finishedAt ?? game.scheduledAt;
  const contextLine = `${home?.name ?? 'Home'} ${sc.home}–${sc.away} ${away?.name ?? 'Away'}${dateMs ? ` · ${dateLabel(dateMs)}` : ''}`;

  const playerName = league.players.find(p => p.id === playerId)?.name ?? 'Player';
  const base = {
    playerName,
    subtitle: team?.name,
    teamLogo: team?.logo,
    teamColor: team?.color,
    leagueLine: leagueLine(league),
    contextLine,
  };

  const statList = [
    { label: 'PTS', value: `${line.pts}` },
    { label: 'REB', value: `${line.reb}` },
    { label: 'AST', value: `${line.ast}` },
    { label: 'STL', value: `${line.stl}` },
    { label: 'BLK', value: `${line.blk}` },
  ];

  const opts: GameCardOption[] = [];

  // Double / triple double
  const doubles = [line.pts, line.reb, line.ast, line.stl, line.blk].filter(v => v >= 10).length;
  if (doubles >= 3) {
    opts.push({ key: 'triple', label: 'Triple-Double', build: () => ({
      kicker: 'Triple-Double', badge: '🔥', accent: colors.brandLime, mvp: false,
      ...base, stats: statList.filter(s => Number(s.value) >= 10).concat(statList).slice(0, 4),
    }) });
  } else if (doubles >= 2) {
    opts.push({ key: 'double', label: 'Double-Double', build: () => ({
      kicker: 'Double-Double', badge: '🔥', accent: colors.brandLime,
      ...base, stats: statList.filter(s => Number(s.value) >= 10).concat(statList).slice(0, 4),
    }) });
  }

  // 25+ point game
  if (line.pts >= 25) {
    opts.push({ key: 'pts25', label: `${line.pts}-Point Game`, build: () => ({
      kicker: `${line.pts}-Point Game`, badge: '🎯', accent: colors.brandTeal,
      ...base, stats: [{ label: 'Points', value: `${line.pts}` }, ...statList.slice(1, 4)],
    }) });
  }

  // Career high (this game equals their all-time high points)
  const c = careerStats(league, playerId);
  if (line.pts > 0 && line.pts >= c.highPts) {
    opts.push({ key: 'careerHigh', label: 'Career High', build: () => ({
      kicker: 'Career High', badge: '⭐', accent: colors.brandLimeBright,
      ...base, stats: [{ label: 'Career-High Points', value: `${line.pts}` }, ...statList.slice(1, 4)],
    }) });
  }

  // Player of the game (best rating on the winning team)
  const winnerId = sc.home >= sc.away ? game.homeTeamId : game.awayTeamId;
  if (teamId === winnerId) {
    const winBox = teamBoxScore(league, gameId, winnerId);
    const best = [...winBox.lines].filter(l => l.playerId && perfRating(l) > 0)
      .sort((a, b) => perfRating(b) - perfRating(a))[0];
    if (best && best.playerId === playerId) {
      opts.push({ key: 'potg', label: 'Player of the Game', build: () => ({
        kicker: 'Player of the Game', badge: '🏅', accent: colors.brandTeal, mvp: true,
        ...base, stats: [{ label: 'PTS', value: `${line.pts}` }, ...statList.slice(1, 4)],
      }) });
    }
  }

  // Always offer a plain "game line" card as a fallback.
  opts.push({ key: 'line', label: 'Game Stat Line', build: () => ({
    kicker: 'Game Stat Line', accent: colors.brandTeal,
    ...base, stats: [{ label: 'PTS', value: `${line.pts}` }, ...statList.slice(1, 4)],
  }) });

  return opts;
}

// ---- SEASON CARDS ---------------------------------------------------------

export interface SeasonCardOption { key: string; label: string; build: () => CardSpec }

// Award cards for a completed/ongoing season. Winners restricted to top-5 teams
// (same rule the awards UI uses).
export function seasonCardOptions(league: League): SeasonCardOption[] {
  const top5 = new Set(standings(league).slice(0, 5).map(r => r.team.id));
  const aw = leagueAwards(league, { restrictTeamIds: top5 });
  const opts: SeasonCardOption[] = [];

  const teamColorOf = (w: AwardWinner) => {
    const t = league.teams.find(x => x.name === w.teamName);
    return { teamLogo: t?.logo, teamColor: t?.color };
  };

  const single = (
    key: string, label: string, kicker: string, badge: string, accent: string,
    w: AwardWinner | null, mvp = false,
  ) => {
    if (!w) return;
    opts.push({ key, label, build: () => ({
      kicker, badge, accent, mvp,
      playerName: w.name, subtitle: w.teamName, ...teamColorOf(w),
      leagueLine: leagueLine(league),
      stats: [{ label: kicker, value: w.value }],
    }) });
  };

  single('mvp', 'Season MVP', 'Season MVP', '👑', colors.brandLimeBright, aw.seasonMVP, true);
  single('scoring', 'Scoring Champion', 'Scoring Champion', '🎯', colors.brandTeal, aw.scoringChampion);
  single('assist', 'Assist Leader', 'Assist Leader', '🤝', colors.brandTeal, aw.assistLeader);
  single('rebound', 'Rebounding Leader', 'Rebounding Leader', '💪', colors.brandTeal, aw.reboundingLeader);
  single('defense', 'Defensive Player', 'Defensive Player', '🛡', colors.brandTeal, aw.bestDefender);
  single('improved', 'Most Improved', 'Most Improved', '📈', colors.brandLime, aw.mostImproved);

  // First Team (Mythical Five) — one combined card listing all five.
  if (aw.mythicalFive.length >= 5) {
    opts.push({ key: 'firstTeam', label: 'First Team', build: () => ({
      kicker: 'First Team', badge: '⭐', accent: colors.brandLimeBright,
      playerName: 'Mythical Five',
      subtitle: aw.mythicalFive.map(w => w.name).join(' · '),
      leagueLine: leagueLine(league),
      stats: aw.mythicalFive.slice(0, 4).map(w => ({ label: w.teamName, value: w.name.split(' ')[0] })),
    }) });
  }

  return opts;
}

// Per-player season averages card (offered from the player profile).
export function seasonAveragesSpec(league: League, playerId: string): CardSpec | null {
  const c = careerStats(league, playerId);
  if (c.gp === 0) return null;
  const team = teamOfPlayer(league, playerId);
  const playerName = league.players.find(p => p.id === playerId)?.name ?? 'Player';
  return {
    kicker: 'Season Averages',
    playerName, subtitle: team ? `${team.name} · ${c.gp} games` : `${c.gp} games`,
    teamLogo: team?.logo, teamColor: team?.color,
    leagueLine: leagueLine(league),
    accent: colors.brandTeal,
    stats: [
      { label: 'PPG', value: c.ppg.toFixed(1) },
      { label: 'RPG', value: c.rpg.toFixed(1) },
      { label: 'APG', value: c.apg.toFixed(1) },
      { label: 'SPG', value: c.spg.toFixed(1) },
    ],
  };
}
