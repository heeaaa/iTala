import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Screen, Txt, Card, Button, TeamBadge } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { colors, space, radius, LINEUP_SIZE } from '../theme';
import { ScreenProps } from '../navigation';
import { Team, Player } from '../types';

export default function SelectLineupScreen({ route, navigation }: ScreenProps<'SelectLineup'>) {
  const { leagueId, gameId } = route.params;
  const { dispatch } = useStore();
  const league = useLeague(leagueId);
  const game = league?.games.find(g => g.id === gameId);
  const homeTeam = league?.teams.find(t => t.id === game?.homeTeamId);
  const awayTeam = league?.teams.find(t => t.id === game?.awayTeamId);

  // ALL hooks run unconditionally, before any early return (React rules).
  const [waited, setWaited] = useState(false);
  // Lazy initial state seeds the first five synchronously on first render when
  // teams are already present (the common league-flow case), so the defaults
  // are correct immediately without waiting for an effect tick.
  const [home, setHome] = useState<string[]>(() =>
    homeTeam && !homeTeam.teamOnly ? homeTeam.playerIds.slice(0, LINEUP_SIZE) : []);
  const [away, setAway] = useState<string[]>(() =>
    awayTeam && !awayTeam.teamOnly ? awayTeam.playerIds.slice(0, LINEUP_SIZE) : []);
  const seededRef = React.useRef(!!(homeTeam && awayTeam));

  useEffect(() => {
    if (game) return;
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, [game]);

  // Fallback seed for the rec flow where teams may arrive a beat after mount:
  // populate once, the first render where both teams exist.
  useEffect(() => {
    if (seededRef.current || !homeTeam || !awayTeam) return;
    seededRef.current = true;
    setHome(homeTeam.teamOnly ? [] : homeTeam.playerIds.slice(0, LINEUP_SIZE));
    setAway(awayTeam.teamOnly ? [] : awayTeam.playerIds.slice(0, LINEUP_SIZE));
  }, [homeTeam, awayTeam]);

  if (!league || !game) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) }}>
          {waited
            ? <Txt k="body" color={colors.muted}>Game not found.</Txt>
            : <ActivityIndicator color={colors.brandTeal} size="large" />}
        </View>
      </Screen>
    );
  }

  // The game row can arrive a beat before its team rows during a fresh rec
  // creation. Don't dereference teams until both exist.
  if (!homeTeam || !awayTeam) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) }}>
          {waited
            ? <Txt k="body" color={colors.muted}>Teams not found for this game.</Txt>
            : <ActivityIndicator color={colors.brandTeal} size="large" />}
        </View>
      </Screen>
    );
  }

  const ready =
    (homeTeam.teamOnly || home.length > 0) && (awayTeam.teamOnly || away.length > 0);

  const start = () => {
    // One combined write so a realtime echo can't land between two separate
    // dispatches and clear the away side (the "away lineup not set" bug).
    dispatch({
      t: 'SET_LINEUPS', leagueId, gameId,
      home: homeTeam.teamOnly ? [] : home,
      away: awayTeam.teamOnly ? [] : away,
    });
    navigation.replace('LiveGame', { leagueId, gameId, spectator: false });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(28) }}>
        <Txt k="h1" style={{ marginBottom: 4 }}>Starting Lineups</Txt>
        <Txt k="body" color={colors.muted} style={{ marginBottom: space(4) }}>
          Pick the {LINEUP_SIZE} players starting on court for each team. You can sub anytime during the game.
        </Txt>

        <TeamLineup team={homeTeam} players={league.players} selected={home} onChange={setHome} />
        <View style={{ height: space(3) }} />
        <TeamLineup team={awayTeam} players={league.players} selected={away} onChange={setAway} />
      </ScrollView>

      <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(6) }}>
        <Button title="Tip off  ▶" onPress={start} disabled={!ready} />
      </View>
    </Screen>
  );
}

function TeamLineup({ team, players, selected, onChange }:
  { team: Team; players: Player[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const roster = team.playerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const target = Math.min(LINEUP_SIZE, roster.length);

  const toggle = (pid: string) =>
    onChange(selected.includes(pid)
      ? selected.filter(x => x !== pid)
      : (selected.length >= LINEUP_SIZE ? selected : [...selected, pid]));

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space(2) }}>
        <TeamBadge logo={team.logo} color={team.color} size={18} />
        <Txt k="h2" style={{ flex: 1 }}>{team.name}</Txt>
        {!team.teamOnly && <Txt k="stat" color={selected.length === target ? colors.green : colors.muted}>{selected.length}/{target}</Txt>}
      </View>

      {team.teamOnly ? (
        <Txt k="body" color={colors.muted}>Opponent tracked at team level — no lineup needed.</Txt>
      ) : roster.length === 0 ? (
        <Txt k="body" color={colors.muted}>No players on this team yet.</Txt>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {roster.map(p => {
            const sel = selected.includes(p.id);
            return (
              <Pressable key={p.id} onPress={() => toggle(p.id)}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: sel ? team.color : colors.line, backgroundColor: sel ? team.color : colors.surface }}>
                <Txt k="body" color={sel ? '#FFFFFF' : colors.text}>{p.number ? `#${p.number} ` : ''}{p.name}</Txt>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
