import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import { Screen, Txt, Card, Button, Field, Toggle, GoogleButton, AppleButton } from '../components/ui';
import { useStore } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, radius, font, teamColors } from '../theme';
import { uid } from '../lib/format';
import { ScreenProps } from '../navigation';

const PRIVATE_REC_NAME = 'Private Drop-In Games';

// Find the existing recreational league, if any.
export function findRecLeagueId(leagues: { id: string; kind?: string }[]): string | undefined {
  return leagues.find(l => l.kind === 'recreational')?.id;
}

interface TeamDraft { name: string; color: string; players: { id: string; name: string; num: string }[]; }

export default function RecGameScreen({ navigation }: ScreenProps<'RecGame'>) {
  const { state, dispatch, synced } = useStore();
  const { role, userId, isOwner, signInWithGoogle, appleAvailable, signInWithApple, authBusy, lastError } = useAdmin();
  const [location, setLocation] = useState('');
  const [makePublic, setMakePublic] = useState(false);
  const [trackMisses, setTrackMisses] = useState(true);
  const [trackTurnovers, setTrackTurnovers] = useState(true);
  const [signInBusy, setSignInBusy] = useState(false);
  const [teams, setTeams] = useState<[TeamDraft, TeamDraft]>([
    { name: '', color: teamColors[0], players: [] },
    { name: '', color: teamColors[1], players: [] },
  ]);
  const [draftName, setDraftName] = useState<[string, string]>(['', '']);
  const [draftNum, setDraftNum] = useState<[string, string]>(['', '']);

  const addPlayer = (ti: 0 | 1) => {
    const nm = draftName[ti].trim();
    if (!nm) return;
    setTeams(prev => {
      const copy: [TeamDraft, TeamDraft] = [{ ...prev[0], players: [...prev[0].players] }, { ...prev[1], players: [...prev[1].players] }];
      copy[ti].players.push({ id: uid(), name: nm, num: draftNum[ti].trim() });
      return copy;
    });
    setDraftName(prev => { const c: [string, string] = [...prev] as [string, string]; c[ti] = ''; return c; });
    setDraftNum(prev => { const c: [string, string] = [...prev] as [string, string]; c[ti] = ''; return c; });
  };

  const removePlayer = (ti: 0 | 1, pid: string) => {
    setTeams(prev => {
      const copy: [TeamDraft, TeamDraft] = [{ ...prev[0], players: [...prev[0].players] }, { ...prev[1], players: [...prev[1].players] }];
      copy[ti].players = copy[ti].players.filter(p => p.id !== pid);
      return copy;
    });
  };

  // Tap the swatch to cycle through the palette — simplest possible picker,
  // no modal. Long list of distinct colors so two teams never clash.
  const cycleColor = (ti: 0 | 1) =>
    setTeams(prev => {
      const c: [TeamDraft, TeamDraft] = [{ ...prev[0] }, { ...prev[1] }];
      const idx = teamColors.indexOf(c[ti].color);
      c[ti].color = teamColors[(idx + 1) % teamColors.length];
      return c;
    });

  const setTeamName = (ti: 0 | 1, name: string) =>
    setTeams(prev => { const c: [TeamDraft, TeamDraft] = [{ ...prev[0] }, { ...prev[1] }]; c[ti].name = name; return c; });

  const ready =
    location.trim().length > 0 &&
    teams[0].name.trim() && teams[1].name.trim() &&
    teams[0].players.length > 0 && teams[1].players.length > 0;

  const start = () => {
    if (!ready) return;

    // Resolve the target container. Public → the single shared community space;
    // private → this user's personal space. We DON'T dispatch ADD_LEAGUE
    // separately anymore — that raced the game insert (the league didn't exist
    // server-side yet, so teams/games failed their foreign key and the game
    // "disappeared" on the next pull). Instead REC_SETUP_GAME carries
    // ensureLeague and the sync layer creates the league first, atomically.
    let recId: string;
    let ensureLeague: { name: string; isShared?: boolean } | undefined;
    if (makePublic) {
      const existing = state.leagues.find(l => l.kind === 'recreational' && l.isShared);
      recId = existing?.id ?? 'rec-shared';
      if (!existing) ensureLeague = { name: 'Community Drop-in Games (Papawis)', isShared: true };
    } else {
      const existing = state.leagues.find(l => l.kind === 'recreational' && !l.isShared && isOwner(l));
      recId = existing?.id ?? `rec-${userId ?? 'local'}`;
      if (!existing) ensureLeague = { name: PRIVATE_REC_NAME };
    }

    // Explicit ids assigned HERE so the sync layer pushes exactly these
    // entities — no "guess the last two teams" (which broke because pulls sort
    // teams alphabetically, losing the just-added players).
    const gameId = uid();
    dispatch({
      t: 'REC_SETUP_GAME',
      leagueId: recId,
      gameId,
      location: location.trim(),
      trackMisses, trackTurnovers,
      ensureLeague,
      teams: [
        { id: uid(), name: teams[0].name.trim(), color: teams[0].color, players: teams[0].players.map(p => ({ id: p.id, name: p.name, number: p.num || undefined })) },
        { id: uid(), name: teams[1].name.trim(), color: teams[1].color, players: teams[1].players.map(p => ({ id: p.id, name: p.name, number: p.num || undefined })) },
      ],
    });

    navigation.replace('SelectLineup', { leagueId: recId, gameId });
  };

  // Drop-in games require an account: they're written under YOUR name (your
  // personal space, or the public community space).
  if (synced && role === 'guest') {
    const onSignIn = async (signIn: () => Promise<unknown>) => {
      setSignInBusy(true);
      await signIn();
      setSignInBusy(false);
    };
    return (
      <Screen scroll>
        <View style={{ paddingTop: space(8), alignItems: 'center' }}>
          <Txt k="h1" style={{ marginBottom: space(2) }}>Sign in required</Txt>
          <Txt k="body" color={colors.muted} style={{ textAlign: 'center', marginBottom: space(6) }}>
            Drop-in games are saved to your account — sign in to start one.
          </Txt>
          <GoogleButton onPress={() => { void onSignIn(signInWithGoogle); }} busy={signInBusy || authBusy} style={{ alignSelf: 'stretch' }} />
          {appleAvailable ? <AppleButton onPress={() => { void onSignIn(signInWithApple); }} busy={signInBusy || authBusy} style={{ alignSelf: 'stretch', marginTop: 10 }} /> : null}
          {lastError ? <Txt k="body" color={colors.red} style={{ marginTop: 10, fontSize: 13 }}>{lastError}</Txt> : null}
          <Button title="Cancel" kind="ghost" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch', marginTop: 10 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(28) }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <Txt k="h1" style={{ marginBottom: 4 }}>Drop-In Game</Txt>
        <Txt k="body" color={colors.muted} style={{ marginBottom: space(4) }}>
          Quick ad-hoc game outside a league. Add a location and two teams with players, then pick your starting fives.
        </Txt>

        <Field label="Location (required)" value={location} onChangeText={setLocation} placeholder="Main Gym, Court 2…" />

        <Card style={{ marginBottom: space(4) }}>
          <Toggle
            label="Make this game public"
            description="Public games go into the shared Community Drop-in Games (Papawis) space that every signed-in user can see and add to. Off = the game stays in your personal drop-in space."
            value={makePublic}
            onChange={setMakePublic}
          />
          <View style={{ height: space(3) }} />
          <Toggle
            label="Track missed shots"
            description="Show the 2PT ✗, 3PT ✗, and FT ✗ buttons in the live tracker, enabling FG% for this game. Off = log makes only (faster)."
            value={trackMisses}
            onChange={setTrackMisses}
          />
          <View style={{ height: space(3) }} />
          <Toggle
            label="Track turnovers"
            description="Show the TOV button in the live tracker and the TO column in this game's box score."
            value={trackTurnovers}
            onChange={setTrackTurnovers}
          />
        </Card>

        {[0, 1].map((idx) => {
          const ti = idx as 0 | 1;
          const t = teams[ti];
          return (
            <Card key={ti} style={{ marginBottom: space(3) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space(2) }}>
                <Pressable onPress={() => cycleColor(ti)} hitSlop={10}
                  style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.color, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt k="body" color="#fff" style={{ fontSize: 11, opacity: 0.85 }}>⟳</Txt>
                </Pressable>
                <TextInput
                  value={t.name} onChangeText={(v) => setTeamName(ti, v)}
                  placeholder={`Team ${ti + 1} name`} placeholderTextColor={colors.muted}
                  style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.bodyMed, fontSize: 16 }}
                />
              </View>

              {t.players.map(p => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 }}>
                  <Txt k="stat" color={colors.muted} style={{ width: 34 }}>{p.num ? `#${p.num}` : '—'}</Txt>
                  <Txt k="body" style={{ flex: 1 }}>{p.name}</Txt>
                  <Pressable onPress={() => removePlayer(ti, p.id)} hitSlop={8}><Txt k="body" color={colors.red}>✕</Txt></Pressable>
                </View>
              ))}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput
                  value={draftNum[ti]} onChangeText={(v) => setDraftNum(prev => { const c: [string, string] = [...prev] as [string, string]; c[ti] = v; return c; })}
                  placeholder="#" placeholderTextColor={colors.muted} keyboardType="number-pad"
                  style={{ width: 52, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 10, paddingVertical: 10, fontFamily: font.body, textAlign: 'center' }}
                />
                <TextInput
                  value={draftName[ti]} onChangeText={(v) => setDraftName(prev => { const c: [string, string] = [...prev] as [string, string]; c[ti] = v; return c; })}
                  placeholder="Add player" placeholderTextColor={colors.muted}
                  onSubmitEditing={() => addPlayer(ti)}
                  style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.body }}
                />
                <Button title="+" onPress={() => addPlayer(ti)} style={{ paddingVertical: 10, paddingHorizontal: 16 }} />
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(6) }}>
        <Button title="Next: lineups  ▶" onPress={start} disabled={!ready} />
      </View>
    </Screen>
  );
}
