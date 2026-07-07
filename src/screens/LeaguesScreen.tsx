import React, { useRef, useState } from 'react';
import { View, FlatList, Pressable, Alert, TextInput, ScrollView, Dimensions } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
import {
  Screen, Txt, Card, Button, Pill, Empty, Wordmark, PasswordModal, LivePip,
  ProfileButton, ProfileSheet, InviteCodeModal,
} from '../components/ui';
import { useStore } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, font, radius } from '../theme';
import { ScreenProps } from '../navigation';

// Tap the wordmark this many times (with <1.5s between taps) to reveal the
// hidden password lock — the emergency admin backup when Google sign-in or
// the network is unavailable.
const HIDDEN_LOCK_TAPS = 10;

export default function LeaguesScreen({ navigation }: ScreenProps<'Leagues'>) {
  const { state, ready, prefs, toggleFavLeague, dispatch } = useStore();
  const { role, isAdmin, user, unlock, lock, signOut, signInWithGoogle, appleAvailable, signInWithApple, authBusy, lastError, canScore, isOwner, redeemCode, createCreationCode } = useAdmin();
  const [askPw, setAskPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lockRevealed, setLockRevealed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Hidden-gesture counter (10 quick taps on the iTala wordmark).
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWordmarkTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= HIDDEN_LOCK_TAPS) {
      tapCount.current = 0;
      setLockRevealed(v => !v); // 10 more taps hides it again
    } else {
      tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
    }
  };

  // Leagues visible on this device: all real leagues, plus recreational spaces
  // that are either the shared community one or ones this user owns. Other
  // people's personal drop-in spaces stay out of sight.
  const visibleLeagues = state.leagues.filter(
    l => !l.isArchived && (l.kind !== 'recreational' || l.isShared || isOwner(l))
  );

  // Live banner: EVERY live game across all visible leagues (a Saturday can
  // have several leagues playing at once).
  const liveRefs = visibleLeagues.flatMap(l =>
    l.games.filter(g => g.status === 'live')
      .map(g => ({ leagueId: l.id, gameId: g.id, leagueName: l.name, league: l }))
  );

  // Search + favorites. Favorites float to the top (stable within groups so
  // the newest-first creation order is otherwise preserved).
  const favLeagues = new Set(prefs.favLeagueIds);
  const q = query.trim().toLowerCase();
  const leagueList = state.leagues
    .filter(l => l.kind !== 'recreational' && !l.isArchived)
    .filter(l => !q || l.name.toLowerCase().includes(q) || l.season.toLowerCase().includes(q))
    .sort((a, b) => Number(favLeagues.has(b.id)) - Number(favLeagues.has(a.id)));
  const showSearch = state.leagues.filter(l => l.kind !== 'recreational' && !l.isArchived).length >= 4 || q.length > 0;
  const archivedLeagues = state.leagues.filter(l => l.isArchived && l.kind !== 'recreational');

  const onLockPress = () => {
    if (isAdmin) { void lock(); return; } // tapping the unlocked icon re-locks
    setAskPw(true);
  };

  const submitPw = async (pw: string) => {
    setSubmitting(true);
    const ok = await unlock(pw);
    setSubmitting(false);
    if (ok) setAskPw(false);
    // on failure, lastError from context is shown in the modal automatically
  };

  const onGoogle = async () => {
    const resultRole = await signInWithGoogle();
    if (resultRole) setSheetOpen(false);
    // on failure/cancel, lastError (if any) shows inside the sheet
  };

  const onApple = async () => {
    const resultRole = await signInWithApple();
    if (resultRole) setSheetOpen(false);
  };

  const onSignOut = async () => {
    await signOut();
    setSheetOpen(false);
  };

  const submitCode = async (code: string) => {
    setCodeBusy(true); setCodeError(null);
    const res = await redeemCode(code);
    setCodeBusy(false);
    if (res.type === 'error') { setCodeError(res.message); return; }
    setCodeOpen(false);
    if (res.type === 'create') {
      navigation.navigate('CreateLeague', { code: code.trim().toUpperCase() });
    } else {
      Alert.alert(
        res.role === 'owner' ? "You're now a co-owner" : "You're now a scorekeeper",
        `You joined ${res.leagueName} as ${res.role === 'owner' ? 'a co-owner' : 'a scorekeeper'}.`,
      );
    }
  };

  // New League: Super Admins go straight in; everyone else needs a single-use
  // creation code from a Super Admin (the same code field handles it).
  const onNewLeague = () => {
    if (isAdmin) { navigation.navigate('CreateLeague', {}); return; }
    setCodeError(null);
    setCodeOpen(true);
  };

  // Super Admin: mint a creation code to hand to a new league organizer.
  const onMintCode = async () => {
    const code = await createCreationCode();
    if (code) {
      Alert.alert('League-creation code', `${code}

Share this with the organizer. It can create exactly one league, then expires.`);
    } else {
      Alert.alert('Could not create code', lastError ?? 'Try again.');
    }
  };

  const onAbout = () => {
    setSheetOpen(false);
    Alert.alert(
      'iTala',
      'Record. Track. Elevate.\n\nLive basketball stat tracking, league standings, and shareable stat cards for the people you play with.\n\nVersion 1.0.0',
      [{ text: 'OK' }],
    );
  };

  return (
    <Screen inset>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(3) }}>
        {/* Wordmark doubles as the hidden-lock gesture target */}
        <Pressable onPress={onWordmarkTap}>
          <Wordmark size={40} />
          <Txt k="body" color={colors.muted} style={{ marginTop: 6 }}>Record. Track. Elevate.</Txt>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Settings gear: admin shortcut (Settings is also in the profile sheet) */}
          {isAdmin && (
            <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={12}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
              <Txt k="h2" color={colors.muted}>⚙️</Txt>
            </Pressable>
          )}
          {/* Hidden password lock — emergency backup. Revealed by the wordmark
              gesture; also shown while password-elevated so it can re-lock. */}
          {(lockRevealed || (isAdmin && !user)) && (
            <Pressable onPress={onLockPress} hitSlop={12}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isAdmin ? colors.accentDim : colors.surface, borderWidth: 1, borderColor: isAdmin ? colors.brandTeal : colors.line }}>
              <Txt k="h2" color={isAdmin ? colors.brandTeal : colors.muted}>{isAdmin ? '🔓' : '🔒'}</Txt>
            </Pressable>
          )}
          {/* Profile: guest 👤 or the Google avatar */}
          <ProfileButton avatarUrl={user?.avatarUrl} onPress={() => setSheetOpen(true)} />
        </View>
      </View>

      {isAdmin && (
        <View style={{ marginHorizontal: space(4), marginBottom: space(3) }}>
          <Pill label="SUPER ADMIN — full access to every league" color={colors.accentDim} textColor={colors.brandTeal} />
        </View>
      )}

      {liveRefs.length > 0 && (
        // One live game → full-width card. Several → horizontal carousel so
        // every court gets a card; peek of the next card invites the swipe.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          decelerationRate="fast"
          style={{ flexGrow: 0, marginBottom: space(3) }}
          contentContainerStyle={{ paddingHorizontal: space(4), gap: 10 }}>
          {liveRefs.map(ref => (
            <Pressable
              key={ref.gameId}
              onPress={() => navigation.navigate('LiveGame', { leagueId: ref.leagueId, gameId: ref.gameId, spectator: !canScore(ref.league) })}
              style={{
                width: liveRefs.length === 1 ? SCREEN_W - space(4) * 2 : SCREEN_W * 0.78,
                backgroundColor: colors.surface, borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: colors.brandTeal,
                flexDirection: 'row', alignItems: 'center', gap: 12,
              }}>
              <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: colors.brandTeal, borderRadius: 2 }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <LivePip size={7} />
                  <Txt k="label" color={colors.brandLime}>Live now</Txt>
                </View>
                <Txt k="h2" color={colors.text} numberOfLines={1}>{ref.leagueName}</Txt>
              </View>
              <Txt k="h1" color={colors.brandTeal}>▶</Txt>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {showSearch && (
        <View style={{ paddingHorizontal: space(4), marginBottom: space(3) }}>
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Search leagues by name or season" placeholderTextColor={colors.muted}
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 14, paddingVertical: 11, fontFamily: font.body, fontSize: 15 }}
          />
        </View>
      )}

      <FlatList
        data={leagueList}
        keyExtractor={l => l.id}
        contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(40) }}
        ListHeaderComponent={(() => {
          if (q) return null; // rec drop-in cards aren't part of search results
          const recs = visibleLeagues.filter(l => l.kind === 'recreational');
          if (recs.length === 0) return null;
          return (
            <>
              {recs.map(rec => {
                const finals = rec.games.filter(g => g.status === 'final').length;
                const live = rec.games.filter(g => g.status === 'live').length;
                return (
                  <Card key={rec.id} style={{ marginBottom: space(3), borderColor: colors.brandTeal }} onPress={() => navigation.navigate('LeagueDetail', { leagueId: rec.id })}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Txt k="h2">🏀 {rec.isShared ? 'Community Drop-In' : 'My Drop-In Games'}</Txt>
                        <Txt k="body" color={colors.muted}>{rec.isShared ? 'Public ad-hoc games from all users' : 'Your ad-hoc games outside a league'}</Txt>
                      </View>
                      {live ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <LivePip size={7} />
                          <Txt k="label" color={colors.brandLime}>LIVE</Txt>
                        </View>
                      ) : (
                        <Pill label={`${finals} played`} color={colors.surfaceHi} textColor={colors.muted} />
                      )}
                    </View>
                  </Card>
                );
              })}
            </>
          );
        })()}
        ListEmptyComponent={ready ? (q ? <Empty title="No matches" subtitle={`No league matches "${query}".`} /> : <Empty title="No leagues yet" subtitle="Create your first league to start tracking games." />) : null}
        ListFooterComponent={isAdmin && archivedLeagues.length > 0 ? (
          <View style={{ marginTop: space(2) }}>
            <Pressable onPress={() => setShowArchived(v => !v)} style={{ paddingVertical: 10 }}>
              <Txt k="body" color={colors.muted}>
                {showArchived ? '▾' : '▸'} 🗄 Archived leagues ({archivedLeagues.length}) — Super Admins only
              </Txt>
            </Pressable>
            {showArchived && archivedLeagues.map(l => (
              <Card key={l.id} style={{ marginBottom: space(3), opacity: 0.75 }} onPress={() => navigation.navigate('LeagueDetail', { leagueId: l.id })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt k="h2">{l.name}</Txt>
                    <Txt k="body" color={colors.muted}>{l.season} · archived</Txt>
                  </View>
                  <Button title="Unarchive" kind="ghost" style={{ paddingVertical: 8, paddingHorizontal: 14 }}
                    onPress={() => dispatch({ t: 'SET_LEAGUE_SETTINGS', leagueId: l.id, isArchived: false })} />
                </View>
              </Card>
            ))}
          </View>
        ) : null}
        renderItem={({ item }) => {
          const finals = item.games.filter(g => g.status === 'final').length;
          const fav = favLeagues.has(item.id);
          return (
            <Card style={{ marginBottom: space(3) }} onPress={() => navigation.navigate('LeagueDetail', { leagueId: item.id })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Txt k="h2">{item.name}</Txt>
                  <Txt k="body" color={colors.muted}>{item.season}</Txt>
                </View>
                {/* Favorite star: tap to pin this league to the top of the list */}
                <Pressable onPress={() => toggleFavLeague(item.id)} hitSlop={12} style={{ marginRight: 10, padding: 2 }}>
                  <Txt k="h2" color={fav ? colors.yellow : colors.muted}>{fav ? '★' : '☆'}</Txt>
                </Pressable>
                <Pill label={`${item.teams.length} teams`} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: space(3) }}>
                <Pill label={`${item.players.length} players`} color={colors.surfaceHi} textColor={colors.muted} />
                <Pill label={`${finals} games played`} color={colors.surfaceHi} textColor={colors.muted} />
              </View>
            </Card>
          );
        }}
      />

      {role !== 'guest' && (
        <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(6), gap: 10 }}>
          {isAdmin && (
            <Button title="🎟  Create league-creation code" kind="ghost" onPress={() => { void onMintCode(); }} />
          )}
          <Button title="🏀  Recreational / Drop-In Game" kind="ghost" onPress={() => navigation.navigate('RecGame')} />
          <Button title="+  New League" onPress={onNewLeague} />
        </View>
      )}

      <ProfileSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        user={user}
        role={role}
        busy={authBusy}
        error={lastError}
        onGoogle={() => { void onGoogle(); }}
        onApple={appleAvailable ? () => { void onApple(); } : undefined}
        onSignOut={() => { void onSignOut(); }}
        onSettings={() => { setSheetOpen(false); navigation.navigate('Settings'); }}
        onAbout={onAbout}
        onEnterCode={user ? () => { setSheetOpen(false); setCodeError(null); setCodeOpen(true); } : undefined}
      />

      <InviteCodeModal
        visible={codeOpen}
        message="One code does it all — create a league, or join one as a co-owner or scorekeeper."
        error={codeError}
        busy={codeBusy}
        onSubmit={(c) => { void submitCode(c); }}
        onCancel={() => setCodeOpen(false)}
      />

      <PasswordModal
        visible={askPw}
        title="Admin access"
        message="Backup admin unlock. Enter the admin password to unlock stat tracking without a Google account."
        error={lastError ?? undefined}
        busy={submitting}
        onSubmit={submitPw}
        onCancel={() => setAskPw(false)}
      />
    </Screen>
  );
}
