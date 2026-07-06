import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, Txt, Field, Button, Toggle, Card } from '../components/ui';
import { useStore } from '../store/StoreProvider';
import { space } from '../theme';
import { uid } from '../lib/format';
import { ScreenProps } from '../navigation';

export default function CreateLeagueScreen({ route, navigation }: ScreenProps<'CreateLeague'>) {
  const creationCode = route.params?.code;
  const { dispatch } = useStore();
  const [name, setName] = useState('');
  const [season, setSeason] = useState('');
  const [trackMisses, setTrackMisses] = useState(true);
  const [trackTurnovers, setTrackTurnovers] = useState(true);

  const create = () => {
    const id = uid();
    dispatch({ t: 'ADD_LEAGUE', id, name, season, trackMisses, trackTurnovers, creationCode });
    navigation.replace('ManageRoster', { leagueId: id });
  };

  return (
    <Screen scroll>
      <Txt k="h1" style={{ marginBottom: space(5) }}>New League</Txt>
      <Field label="League name" value={name} onChangeText={setName} placeholder="Sunday Run, Office League…" />
      <Field label="Season" value={season} onChangeText={setSeason} placeholder="Spring 2026" />
      <Card style={{ marginTop: space(2) }}>
        <Toggle
          label="Track missed shots"
          description="Show the 2PT ✗, 3PT ✗, and FT ✗ buttons in this league's live tracker. You can change this later from the league page."
          value={trackMisses}
          onChange={setTrackMisses}
        />
        <View style={{ height: space(3) }} />
        <Toggle
          label="Track turnovers"
          description="Show the TOV button in this league's live tracker. You can change this later too."
          value={trackTurnovers}
          onChange={setTrackTurnovers}
        />
      </Card>
      <View style={{ height: space(4) }} />
      <Button title="Create & add teams" onPress={create} disabled={!name.trim()} />
    </Screen>
  );
}
