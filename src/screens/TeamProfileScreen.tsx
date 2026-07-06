import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Screen, Txt, Card, Pill, TeamBadge, Empty } from '../components/ui';
import { useLeague } from '../store/StoreProvider';
import { colors, space, font } from '../theme';
import { ScreenProps } from '../navigation';
import { standings, gameScore, winPctOf } from '../lib/stats';
import { dayLabel } from '../lib/format';

// TEAM PROFILE — the team's home page: identity, record, scoring profile,
// recent form, and the roster. Everything derived live from game data.
export default function TeamProfileScreen({ route, navigation }: ScreenProps<'TeamProfile'>) {
  const { leagueId, teamId } = route.params;
  const league = useLeague(leagueId);
  const team = league?.teams.find(t => t.id === teamId);
  if (!league || !team) return <Screen><Txt k="body">Team not found.</Txt></Screen>;

  const row = standings(league).find(r => r.team.id === teamId);
  const gp = (row?.wins ?? 0) + (row?.losses ?? 0);
  const ppg = gp ? (row!.pf / gp) : 0;
  const oppg = gp ? (row!.pa / gp) : 0;

  // Last 5 finals involving this team, newest first
  const last5 = league.games
    .filter(g => g.status === 'final' && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, 5);

  const roster = team.playerIds
    .map(pid => league.players.find(p => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return (
    <Screen scroll>
      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: space(4) }}>
        <TeamBadge logo={team.logo} color={team.color} size={44} />
        <View style={{ flex: 1 }}>
          <Txt k="h1">{team.name}</Txt>
          <Txt k="body" color={colors.muted}>
            {team.coach ? `Coach ${team.coach} · ` : ''}{league.name}
          </Txt>
        </View>
      </View>

      {/* Season record + scoring profile */}
      <Card style={{ marginBottom: space(3) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {([
            ['RECORD', gp ? `${row!.wins}-${row!.losses}` : '—'],
            ['WIN %', gp ? winPctOf(row!.wins, row!.losses).toFixed(3).replace(/^0/, '') : '—'],
            ['PPG', gp ? ppg.toFixed(1) : '—'],
            ['OPP PPG', gp ? oppg.toFixed(1) : '—'],
            ['STREAK', row?.streak ?? '—'],
          ] as [string, string][]).map(([label, v]) => (
            <View key={label} style={{ alignItems: 'center' }}>
              <Txt color={colors.text} style={{ fontFamily: font.display, fontSize: 22, lineHeight: 28, includeFontPadding: false } as any}>{v}</Txt>
              <Txt k="label" color={colors.muted} style={{ fontSize: 9 }}>{label}</Txt>
            </View>
          ))}
        </View>
      </Card>

      {/* Last 5 games */}
      <Card style={{ marginBottom: space(3) }}>
        <Txt k="label" style={{ marginBottom: 6 }}>Last 5 games</Txt>
        {last5.length === 0 ? (
          <Txt k="body" color={colors.muted} style={{ fontSize: 13 }}>No completed games yet.</Txt>
        ) : last5.map((g, i) => {
          const s = gameScore(league, g);
          const isHome = g.homeTeamId === teamId;
          const us = isHome ? s.home : s.away;
          const them = isHome ? s.away : s.home;
          const opp = league.teams.find(t => t.id === (isHome ? g.awayTeamId : g.homeTeamId));
          const won = us >= them;
          return (
            <Pressable key={g.id} onPress={() => navigation.navigate('BoxScore', { leagueId, gameId: g.id })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
              <Pill label={won ? 'W' : 'L'} color={won ? colors.greenDim : 'rgba(255,77,79,0.15)'} textColor={won ? colors.green : colors.red} />
              <TeamBadge logo={opp?.logo} color={opp?.color ?? colors.muted} size={13} />
              <Txt k="body" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{isHome ? 'vs' : '@'} {opp?.name ?? '—'}</Txt>
              <Txt k="stat" color={won ? colors.green : colors.red}>{us}–{them}</Txt>
              {g.finishedAt ? <Txt k="body" color={colors.muted} style={{ fontSize: 11 }}>{dayLabel(g.finishedAt)}</Txt> : null}
            </Pressable>
          );
        })}
      </Card>

      {/* Roster */}
      <Card>
        <Txt k="label" style={{ marginBottom: 6 }}>Roster ({roster.length})</Txt>
        {team.teamOnly ? (
          <Txt k="body" color={colors.muted} style={{ fontSize: 13 }}>Tracked as a team total — no individual players.</Txt>
        ) : roster.length === 0 ? (
          <Empty title="No players yet" />
        ) : roster.map((p, i) => (
          <Pressable key={p.id} onPress={() => navigation.navigate('PlayerProfile', { leagueId, playerId: p.id })}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
            <Txt k="stat" color={colors.muted} style={{ width: 36, fontSize: 13 }}>{p.number ? `#${p.number}` : '—'}</Txt>
            <Txt k="body" style={{ flex: 1 }}>{p.name}</Txt>
            <Txt k="h2" color={colors.muted}>›</Txt>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
