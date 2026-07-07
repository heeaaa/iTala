import React from 'react';
import { View, ScrollView, Alert, Pressable } from 'react-native';
import { Screen, Txt, Card, Pill, Empty, TeamBadge, SwipeableRow, LivePip } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space } from '../theme';
import { ScreenProps } from '../navigation';
import { gameScore } from '../lib/stats';
import { dayKey, dayLabel, dateTimeLabel } from '../lib/format';

export default function GamesOnDateScreen({ route, navigation }: ScreenProps<'GamesOnDate'>) {
  const { leagueId, dayKey: key, teamId } = route.params;
  const { dispatch } = useStore();
  const { canScore, isOwner } = useAdmin();
  const league = useLeague(leagueId);

  if (!league) return <Screen><Txt k="body">League not found.</Txt></Screen>;
  const scorer = canScore(league);
  const owner = isOwner(league); // deleting games is destructive — owners only

  const teamName = (id: string) => league.teams.find(t => t.id === id)?.name ?? '?';
  const teamColor = (id: string) => league.teams.find(t => t.id === id)?.color ?? colors.muted;
  const teamLogo = (id: string) => league.teams.find(t => t.id === id)?.logo;

  const games = league.games
    .filter(g => dayKey(g.finishedAt ?? g.scheduledAt) === key)
    .filter(g => !teamId || g.homeTeamId === teamId || g.awayTeamId === teamId)
    .slice()
    .sort((a, b) => (b.finishedAt ?? b.scheduledAt ?? 0) - (a.finishedAt ?? a.scheduledAt ?? 0));
  const headerTs = games.length ? (games[0].finishedAt ?? games[0].scheduledAt) : undefined;

  const confirmDelete = (gameId: string, label: string) => {
    Alert.alert('Delete game?', `Delete ${label}? All stats logged for this game will be removed. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => dispatch({ t: 'DELETE_GAME', leagueId, gameId }) },
    ]);
  };

  // No modal, no friction: taps open the game directly based on the current
  // role. Admins land in the tracker; everyone else lands in spectator mode
  // (the header below reminds them how to get admin access).
  const openGame = (gameId: string, status: string) => {
    if (status !== 'live') { navigation.navigate('BoxScore', { leagueId, gameId }); return; }
    navigation.navigate('LiveGame', { leagueId, gameId, spectator: !scorer });
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: space(4), paddingTop: space(2) }}>
        <Txt k="h1">{dayLabel(headerTs)}</Txt>
        <Txt k="body" color={colors.muted} style={{ marginBottom: space(1) }}>
          {league.name} · {games.length} game{games.length === 1 ? '' : 's'}
        </Txt>
        {teamId ? (
          <Pressable onPress={() => navigation.setParams({ teamId: undefined })}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.brandTeal, marginBottom: space(2) }}>
            <TeamBadge logo={teamLogo(teamId)} color={teamColor(teamId)} size={12} />
            <Txt k="body" color={colors.brandTeal} style={{ fontSize: 13 }}>{teamName(teamId)} only</Txt>
            <Txt k="body" color={colors.brandTeal} style={{ fontSize: 13 }}>✕</Txt>
          </Pressable>
        ) : null}
        {scorer ? (
          <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginBottom: space(2) }}>Swipe a game left to delete.</Txt>
        ) : (
          <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginBottom: space(2) }}>Live games open in spectator mode — sign in with a scorekeeper or owner account to track stats.</Txt>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(16) }}>
        {games.length === 0 ? (
          <Empty title={teamId ? "No games for this team on this date" : "No games on this date"} />
        ) : games.map(g => {
          const s = gameScore(league, g);
          const homeWon = s.home >= s.away;
          const label = `${teamName(g.homeTeamId)} vs ${teamName(g.awayTeamId)}`;
          const card = (
            <Card onPress={() => openGame(g.id, g.status)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                {g.status === 'live' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <LivePip size={7} />
                    <Txt k="label" color={colors.brandLime}>LIVE</Txt>
                  </View>
                ) : (
                  <Pill label={g.status === 'final' ? 'FINAL' : 'SCHEDULED'} color={colors.surfaceHi} textColor={colors.muted} />
                )}
                <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: 8 }}>
                  <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>
                    {dateTimeLabel(g.finishedAt ?? g.scheduledAt)}
                  </Txt>
                  {g.location ? <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginTop: 1 }} numberOfLines={1}>{g.location}</Txt> : null}
                </View>
              </View>
              <Row name={teamName(g.homeTeamId)} color={teamColor(g.homeTeamId)} logo={teamLogo(g.homeTeamId)} score={s.home} win={g.status === 'final' && homeWon} />
              <Row name={teamName(g.awayTeamId)} color={teamColor(g.awayTeamId)} logo={teamLogo(g.awayTeamId)} score={s.away} win={g.status === 'final' && !homeWon} />
            </Card>
          );
          // Only admins can delete (swipe). Spectators get a plain, non-swipeable card.
          return owner ? (
            <SwipeableRow key={g.id} onDelete={() => confirmDelete(g.id, label)}>{card}</SwipeableRow>
          ) : (
            <View key={g.id} style={{ marginBottom: space(3) }}>{card}</View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function Row({ name, color, logo, score, win }: { name: string; color: string; logo?: string; score: number; win: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
      <View style={{ marginRight: 10 }}><TeamBadge logo={logo} color={color} size={16} /></View>
      <Txt k="h2" style={{ flex: 1 }} color={win ? colors.text : colors.muted}>{name}</Txt>
      <Txt k="statBig" color={win ? colors.text : colors.muted}>{score}</Txt>
    </View>
  );
}
