import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Screen, Txt, Card, Button, Field, TeamBadge } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { colors, space } from '../theme';
import { uid } from '../lib/format';
import { ScreenProps } from '../navigation';

export default function NewGameScreen({ route, navigation }: ScreenProps<'NewGame'>) {
  const { leagueId } = route.params;
  const { dispatch } = useStore();
  const league = useLeague(leagueId);
  const [home, setHome] = useState<string | null>(null);
  const [away, setAway] = useState<string | null>(null);
  const [location, setLocation] = useState('');

  if (!league) return <Screen><Txt k="body">League not found.</Txt></Screen>;

  const pick = (id: string) => {
    if (home === null) { setHome(id); return; }
    if (id === home) { setHome(null); return; }
    if (away === id) { setAway(null); return; }
    setAway(id);
  };
  const stage = (id: string) => (id === home ? 'HOME' : id === away ? 'AWAY' : null);

  const start = () => {
    if (!home || !away) return;
    const gameId = uid();
    dispatch({ t: 'CREATE_GAME', id: gameId, leagueId, homeTeamId: home, awayTeamId: away, location: location || undefined });
    navigation.replace('SelectLineup', { leagueId, gameId });
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(28) }}>
        <Txt k="h1" style={{ marginBottom: 4 }}>New Game</Txt>
        <Txt k="body" color={colors.muted} style={{ marginBottom: space(4) }}>Tap to pick home, then away.</Txt>

        {[...league.teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map(t => {
          const s = stage(t.id);
          return (
            <Card key={t.id} style={{ marginBottom: space(2), borderColor: s ? t.color : colors.line, borderWidth: s ? 2 : 1 }} onPress={() => pick(t.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TeamBadge logo={t.logo} color={t.color} size={18} />
                <Txt k="h2" style={{ flex: 1 }}>{t.name}</Txt>
                {s ? <Txt k="stat" color={t.color}>{s}</Txt> : null}
              </View>
            </Card>
          );
        })}

        <View style={{ height: space(3) }} />
        <Field label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Main Gym, Court 2…" />
      </ScrollView>

      <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(6) }}>
        <Button title="Next: lineups  ▶" onPress={start} disabled={!home || !away} />
      </View>
    </Screen>
  );
}
