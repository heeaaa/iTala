import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Alert } from 'react-native';
import { Screen, Txt, Button, Card } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { colors, space, radius, font } from '../theme';
import { ScreenProps } from '../navigation';
import { uid } from '../lib/format';
import { parseRoster, ParsedTeam } from '../lib/rosterParse';

// Bulk roster import for a NEW (empty) league. Paste → parse → review/edit →
// confirm. The parser is conservative: suspicious rows are flagged with an
// amber marker + one-line reason, never silently guessed. Committing reuses
// the existing ADD_TEAM / ADD_PLAYER actions with pre-generated ids, so it
// plugs into sync exactly like manual entry.
export default function BulkImportScreen({ route, navigation }: ScreenProps<'BulkImport'>) {
  const { leagueId } = route.params;
  const league = useLeague(leagueId);
  const { dispatch } = useStore();
  const [text, setText] = useState('');
  const [teams, setTeams] = useState<ParsedTeam[] | null>(null); // null = paste phase

  if (!league) return <Screen><Txt k="body">League not found.</Txt></Screen>;

  const playerCount = (ts: ParsedTeam[]) => ts.reduce((n, t) => n + t.players.length, 0);

  // ---- edit helpers (all immutable so React re-renders) ----
  const editTeamName = (ti: number, name: string) =>
    setTeams(ts => ts!.map((t, i) => i === ti ? { ...t, name } : t));
  const deleteTeam = (ti: number) =>
    setTeams(ts => ts!.filter((_, i) => i !== ti));
  const editPlayer = (ti: number, pi: number, patch: Partial<{ name: string; number: string }>) =>
    setTeams(ts => ts!.map((t, i) => i !== ti ? t : {
      ...t,
      players: t.players.map((p, j) => j !== pi ? p : { ...p, ...patch, flag: undefined }),
    }));
  const deletePlayer = (ti: number, pi: number) =>
    setTeams(ts => ts!.map((t, i) => i !== ti ? t : { ...t, players: t.players.filter((_, j) => j !== pi) }));
  const addPlayerRow = (ti: number) =>
    setTeams(ts => ts!.map((t, i) => i !== ti ? t : { ...t, players: [...t.players, { name: '', number: '', raw: '' }] }));
  const addTeamRow = () =>
    setTeams(ts => [...(ts ?? []), { name: `Team ${(ts?.length ?? 0) + 1}`, players: [] }]);

  const commit = () => {
    const clean = (teams ?? [])
      .map(t => ({ ...t, players: t.players.filter(p => p.name.trim()) }))
      .filter(t => t.name.trim() && t.players.length > 0);
    if (clean.length === 0) { Alert.alert('Nothing to import', 'Add at least one team with one player.'); return; }
    const n = clean.length, m = playerCount(clean);
    Alert.alert('Create roster?', `Create ${n} team${n === 1 ? '' : 's'} and ${m} player${m === 1 ? '' : 's'} in ${league.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Create`, onPress: () => {
        // One atomic dispatch — team+player ids are pre-generated here so the
        // reducer and the server insert reference the exact same rows. This
        // is deliberately NOT a loop of per-team/per-player dispatches: that
        // fires one independent network write per action with no ordering
        // guarantee, and a player's write can reach the server before its
        // own team's write lands, silently dropping players. See
        // bulk_import_roster in schema.sql.
        dispatch({
          t: 'BULK_IMPORT_ROSTER',
          leagueId,
          teams: clean.map(t => ({
            id: uid(),
            name: t.name.trim(),
            players: t.players.map(p => ({ id: uid(), name: p.name.trim(), number: p.number.trim() || undefined })),
          })),
        });
        navigation.goBack();
      } },
    ]);
  };

  // ============================== PASTE PHASE ==============================
  if (teams === null) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
          <Txt k="h1">Bulk import roster</Txt>
          <Txt k="body" color={colors.muted} style={{ marginTop: 4, marginBottom: space(3), fontSize: 13 }}>
            Paste your teams and players — each team name on its own line, players below it. Numbers can be written any way: "Juan-17", "Juan 22", "#24", "Juan#14". Nicknames inside ( ) are dropped.
          </Txt>
          <TextInput
            value={text} onChangeText={setText} multiline
            placeholder={"Team A\n\n1. Player One - 17\n2. Juan Dela Cruz #19\n…"}
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            style={{ minHeight: 280, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, color: colors.text, padding: 14, fontFamily: font.body, fontSize: 14, lineHeight: 20 }}
          />
          <Button title="Preview" style={{ marginTop: space(3) }} onPress={() => {
            const parsed = parseRoster(text);
            if (parsed.length === 0 || playerCount(parsed) === 0) {
              Alert.alert('Nothing recognized', 'Could not find any teams or players in that text. Check the format and try again.');
              return;
            }
            setTeams(parsed);
          }} />
        </ScrollView>
      </Screen>
    );
  }

  // ============================= REVIEW PHASE ==============================
  const nTeams = teams.filter(t => t.players.some(p => p.name.trim())).length;
  const nPlayers = playerCount(teams.map(t => ({ ...t, players: t.players.filter(p => p.name.trim()) })));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <Txt k="h1">Review roster</Txt>
        <Txt k="body" color={colors.muted} style={{ marginTop: 4, marginBottom: space(2), fontSize: 13 }}>
          {nTeams} team{nTeams === 1 ? '' : 's'} · {nPlayers} player{nPlayers === 1 ? '' : 's'} — everything is editable. Amber rows need a look before you create.
        </Txt>

        {teams.map((t, ti) => (
          <Card key={ti} style={{ marginBottom: space(3) }}>
            {/* Team header: editable name + delete team */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={t.name} onChangeText={(v) => editTeamName(ti, v)}
                placeholder="Team name" placeholderTextColor={colors.muted}
                style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 12, paddingVertical: 9, fontFamily: font.bodyBold, fontSize: 16 }}
              />
              <Pressable onPress={() => Alert.alert('Delete team?', `Remove "${t.name}" and its ${t.players.length} players from the import?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteTeam(ti) },
              ])} hitSlop={8}>
                <Txt k="body" color={colors.red}>✕</Txt>
              </Pressable>
            </View>

            {/* Player rows */}
            {t.players.map((p, pi) => (
              <View key={pi} style={{
                flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5,
                borderLeftWidth: p.flag ? 3 : 0, borderLeftColor: colors.yellow,
                paddingLeft: p.flag ? 8 : 0, marginLeft: p.flag ? -8 : 0,
              }}>
                <TextInput
                  value={p.number} onChangeText={(v) => editPlayer(ti, pi, { number: v })}
                  placeholder="#" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={3}
                  style={{ width: 52, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 8, paddingVertical: 7, fontFamily: font.body, fontSize: 14, textAlign: 'center' }}
                />
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={p.name} onChangeText={(v) => editPlayer(ti, pi, { name: v })}
                    placeholder="Player name" placeholderTextColor={colors.muted}
                    style={{ backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: p.flag ? colors.yellow : colors.line, color: colors.text, paddingHorizontal: 10, paddingVertical: 7, fontFamily: font.body, fontSize: 14 }}
                  />
                  {p.flag ? (
                    <Txt k="body" color={colors.yellow} style={{ fontSize: 11, marginTop: 2 }}>⚠ {p.flag}</Txt>
                  ) : null}
                </View>
                <Pressable onPress={() => deletePlayer(ti, pi)} hitSlop={8}>
                  <Txt k="body" color={colors.muted}>✕</Txt>
                </Pressable>
              </View>
            ))}

            <Pressable onPress={() => addPlayerRow(ti)} style={{ paddingVertical: 8 }}>
              <Txt k="body" color={colors.brandTeal} style={{ fontSize: 13 }}>＋ Add player</Txt>
            </Pressable>
          </Card>
        ))}

        <Pressable onPress={addTeamRow} style={{ paddingVertical: 4, marginBottom: space(3) }}>
          <Txt k="body" color={colors.brandTeal}>＋ Add team</Txt>
        </Pressable>

        <Button title={`Create ${nTeams} teams & ${nPlayers} players`} onPress={commit} />
        <Button title="Back to paste" kind="ghost" style={{ marginTop: space(2) }} onPress={() => setTeams(null)} />
      </ScrollView>
    </Screen>
  );
}
