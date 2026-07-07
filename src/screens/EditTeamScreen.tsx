import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Txt, Card, Button, Field, TeamBadge } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, radius, font, teamColors } from '../theme';
import { ScreenProps } from '../navigation';
import { Player } from '../types';

// ---- color picker support ---------------------------------------------------
// A dependency-free "picker": the curated 24-color team palette, plus a
// generated hue×shade grid (36 more), plus a custom hex field. Tapping big
// swatches beats dragging a tiny slider thumb on a phone court-side.

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100, light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const c = light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

// 12 hues × 3 shades (light / mid / deep) = 36 swatches.
const SHADE_GRID: string[] = (() => {
  const out: string[] = [];
  for (const light of [66, 50, 36]) {
    for (let hue = 0; hue < 360; hue += 30) out.push(hslToHex(hue, 78, light));
  }
  return out;
})();

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

export default function EditTeamScreen({ route, navigation }: ScreenProps<'EditTeam'>) {
  const { leagueId, teamId } = route.params;
  const { dispatch } = useStore();
  const league = useLeague(leagueId);
  const { isOwner } = useAdmin();
  const team = league?.teams.find(t => t.id === teamId);

  const [name, setName] = useState(team?.name ?? '');
  const [coach, setCoach] = useState(team?.coach ?? '');
  const [customHex, setCustomHex] = useState('');
  const [moreColors, setMoreColors] = useState(false);
  const [hexError, setHexError] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNum, setNewNum] = useState('');
  // local editable drafts for existing players, committed on blur
  const [drafts, setDrafts] = useState<Record<string, { name: string; num: string }>>(() => {
    const d: Record<string, { name: string; num: string }> = {};
    league?.players.forEach(p => { d[p.id] = { name: p.name, num: p.number ?? '' }; });
    return d;
  });

  if (!league || !team) return <Screen><Txt k="body">Team not found.</Txt></Screen>;

  const [savedTick, setSavedTick] = useState(false);
  const saveDetails = () => {
    dispatch({ t: 'UPDATE_TEAM', leagueId, teamId, name, coach });
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1800);
  };

  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to set a team logo.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.4, base64: true,
      });
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        const uri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        dispatch({ t: 'UPDATE_TEAM', leagueId, teamId, logo: uri });
      }
    } catch {
      Alert.alert('Could not open photos', 'Image picking is unavailable on this device.');
    }
  };

  const commitPlayer = (p: Player) => {
    const d = drafts[p.id];
    if (!d) return;
    dispatch({ t: 'UPDATE_PLAYER', leagueId, playerId: p.id, name: d.name, number: d.num || null });
  };

  const addPlayer = () => {
    if (!newName.trim()) return;
    dispatch({ t: 'ADD_PLAYER', leagueId, teamId, name: newName, number: newNum || undefined });
    setNewName(''); setNewNum('');
  };

  const removePlayer = (p: Player) => {
    Alert.alert('Remove player?', `Remove ${p.name} from ${team.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => dispatch({ t: 'DELETE_PLAYER', leagueId, teamId, playerId: p.id }) },
    ]);
  };

  const deleteTeam = () => {
    Alert.alert('Delete team?', `This deletes ${team.name} and its games. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { dispatch({ t: 'DELETE_TEAM', leagueId, teamId }); navigation.goBack(); } },
    ]);
  };

  const roster = team.playerIds.map(id => league.players.find(p => p.id === id)).filter(Boolean) as Player[];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(28) }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space(4) }}>
          <TeamBadge logo={team.logo} color={team.color} size={44} />
          <Txt k="h1" style={{ flex: 1 }}>Edit Team</Txt>
        </View>

        <Field label="Team name" value={name} onChangeText={setName} />
        <Field label="Coach (optional)" value={coach} onChangeText={setCoach} placeholder="Coach Bogs" />
        <Button
          title={savedTick ? '✓ Saved' : 'Save details'}
          kind={savedTick ? 'ghost' : 'primary'}
          onPress={saveDetails}
          style={{ marginTop: space(1), marginBottom: space(4) }}
        />

        {/* Color */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Txt k="label" style={{ flex: 1 }}>Team color</Txt>
          <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>{team.color.toUpperCase()}</Txt>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: space(3) }}>
          {teamColors.map(c => (
            <Swatch key={c} c={c} selected={team.color.toLowerCase() === c.toLowerCase()}
              onPress={() => { setHexError(false); dispatch({ t: 'UPDATE_TEAM', leagueId, teamId, color: c }); }} />
          ))}
        </View>

        <Pressable onPress={() => setMoreColors(v => !v)} style={{ paddingVertical: 6, marginBottom: 8 }}>
          <Txt k="body" color={colors.accent}>{moreColors ? '▾ Hide more colors' : '▸ More colors'}</Txt>
        </Pressable>

        {moreColors && (<>
        <Txt k="label" color={colors.muted} style={{ marginBottom: 8 }}>More shades</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: space(3) }}>
          {SHADE_GRID.map(c => (
            <Swatch key={c} c={c} selected={team.color.toLowerCase() === c.toLowerCase()}
              onPress={() => { setHexError(false); dispatch({ t: 'UPDATE_TEAM', leagueId, teamId, color: c }); }} />
          ))}
        </View>

        {/* Custom hex — any color at all */}
        <Txt k="label" color={colors.muted} style={{ marginBottom: 8 }}>Custom color (hex)</Txt>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: hexError ? 4 : space(4) }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: HEX_RE.test(customHex) ? `#${customHex.replace('#', '')}` : colors.surfaceHi, borderWidth: 1, borderColor: colors.line }} />
          <TextInput
            value={customHex}
            onChangeText={(v) => { setCustomHex(v); setHexError(false); }}
            placeholder="e.g. 1A6FEB" placeholderTextColor={colors.muted}
            autoCapitalize="characters" autoCorrect={false} maxLength={7}
            style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: hexError ? colors.red : colors.line, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.body }}
          />
          <Button title="Apply" kind="ghost" style={{ paddingVertical: 10, paddingHorizontal: 16 }}
            onPress={() => {
              const m = HEX_RE.exec(customHex.trim());
              if (!m) { setHexError(true); return; }
              setHexError(false);
              dispatch({ t: 'UPDATE_TEAM', leagueId, teamId, color: `#${m[1].toUpperCase()}` });
              setCustomHex('');
            }} />
        </View>
        {hexError ? <Txt k="body" color={colors.red} style={{ fontSize: 12, marginBottom: space(4) }}>Enter a 6-digit hex code, e.g. 1A6FEB.</Txt> : null}
        </>)}

        {/* Logo */}
        <Txt k="label" style={{ marginBottom: 8 }}>Team logo</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space(5) }}>
          {team.logo
            ? <Image source={{ uri: team.logo }} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceHi }} />
            : <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}><Txt k="body" color={colors.muted}>none</Txt></View>}
          <Button title={team.logo ? 'Change' : 'Add logo'} kind="ghost" onPress={pickLogo} style={{ paddingVertical: 10 }} />
          {team.logo ? <Button title="Remove" kind="danger" onPress={() => dispatch({ t: 'UPDATE_TEAM', leagueId, teamId, logo: null })} style={{ paddingVertical: 10 }} /> : null}
        </View>

        {/* Players */}
        {!team.teamOnly && (
          <>
            <Txt k="label" style={{ marginBottom: 8 }}>Players</Txt>
            {roster.map(p => (
              <View key={p.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <TextInput
                  value={drafts[p.id]?.num ?? p.number ?? ''} keyboardType="number-pad" placeholder="#" placeholderTextColor={colors.muted}
                  onChangeText={v => setDrafts(d => ({ ...d, [p.id]: { name: d[p.id]?.name ?? p.name, num: v } }))}
                  onEndEditing={() => commitPlayer(p)}
                  style={{ width: 52, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 10, paddingVertical: 10, fontFamily: font.body, textAlign: 'center' }}
                />
                <TextInput
                  value={drafts[p.id]?.name ?? p.name} placeholder="Name" placeholderTextColor={colors.muted}
                  onChangeText={v => setDrafts(d => ({ ...d, [p.id]: { num: d[p.id]?.num ?? p.number ?? '', name: v } }))}
                  onEndEditing={() => commitPlayer(p)}
                  style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.body }}
                />
                <Pressable onPress={() => removePlayer(p)} hitSlop={8} style={{ padding: 8 }}>
                  <Txt k="body" color={colors.red}>Delete</Txt>
                </Pressable>
              </View>
            ))}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                value={newNum} onChangeText={setNewNum} placeholder="#" placeholderTextColor={colors.muted} keyboardType="number-pad"
                style={{ width: 52, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 10, paddingVertical: 10, fontFamily: font.body, textAlign: 'center' }}
              />
              <TextInput
                value={newName} onChangeText={setNewName} placeholder="Add player" placeholderTextColor={colors.muted}
                onSubmitEditing={addPlayer}
                style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.body }}
              />
              <Button title="+" onPress={addPlayer} style={{ paddingVertical: 10, paddingHorizontal: 16 }} />
            </View>
          </>
        )}

        <View style={{ height: space(6) }} />
        {league && isOwner(league) ? (
          <Button title="Delete team" kind="danger" onPress={deleteTeam} />
        ) : (
          <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>Deleting a team is reserved for league owners.</Txt>
        )}
      </ScrollView>
    </Screen>
  );
}

// A tappable color dot; the selected one gets a ring in the app's text color
// with a gap so it reads clearly even for very dark swatches.
function Swatch({ c, selected, onPress }: { c: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4}
      style={{
        width: 34, height: 34, borderRadius: 17,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: selected ? 2 : 0, borderColor: colors.text,
      }}>
      <View style={{ width: selected ? 24 : 34, height: selected ? 24 : 34, borderRadius: 17, backgroundColor: c }} />
    </Pressable>
  );
}
