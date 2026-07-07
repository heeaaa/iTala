import React, { useRef, useState } from 'react';
import { View, ScrollView, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { Screen, Txt, Card, Pill, Empty, Button, TeamBadge, MiniWordmark, SignInModal, SponsorMark } from '../components/ui';
import { useLeague } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, font, wordmarkGradient } from '../theme';
import { ScreenProps } from '../navigation';
import { careerStats } from '../lib/stats';
import { dateLabel } from '../lib/format';

export default function PlayerProfileScreen({ route }: ScreenProps<'PlayerProfile'>) {
  const { leagueId, playerId } = route.params;
  const league = useLeague(leagueId);
  const { role, signInWithGoogle, appleAvailable, signInWithApple, authBusy, lastError } = useAdmin();
  const [askSignIn, setAskSignIn] = useState(false);
  const cardRef = useRef<View>(null);

  if (!league) return <Screen><Txt k="body">Not found.</Txt></Screen>;
  const player = league.players.find(p => p.id === playerId);
  const team = league.teams.find(t => t.playerIds.includes(playerId));
  if (!player) return <Screen><Txt k="body">Player not found.</Txt></Screen>;

  const c = careerStats(league, playerId);

  const textBrag = () =>
    `${player.name}${team ? ` (${team.name})` : ''} — ${c.ppg.toFixed(1)} PPG · ${c.rpg.toFixed(1)} RPG · ` +
    `${c.apg.toFixed(1)} APG · ${c.spg.toFixed(1)} SPG · ${c.bpg.toFixed(1)} BPG over ${c.gp} games ` +
    `(tracked with iTala 🏀)`;

  const share = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri); return; }
    } catch {
      // react-native-view-shot isn't in Expo Go — fall through to text sharing
    }
    try { await Share.share({ message: textBrag() }); } catch { /* cancelled */ }
  };

  // Guests can view everything but must sign in to share (encourages sign-up).
  const onSharePress = () => {
    if (role === 'guest') { setAskSignIn(true); return; }
    void share();
  };
  const onSignInThenShare = async (signIn: () => Promise<unknown>) => {
    const newRole = await signIn();
    if (newRole) {
      setAskSignIn(false);
      void share(); // continue straight into what they were trying to do
    }
  };

  const Big = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Txt k="statBig" color={colors.accent}>{value}</Txt>
      <Txt k="label">{label}</Txt>
    </View>
  );
  const Avg = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Txt k="stat">{value}</Txt>
      <Txt k="label">{label}</Txt>
    </View>
  );
  const Split = ({ label, makes, att, pctStr }: { label: string; makes: number; att: number; pctStr: string }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Txt k="stat">{makes}-{att}</Txt>
      <Txt k="body" color={colors.accent} style={{ fontSize: 13 }}>{pctStr}</Txt>
      <Txt k="label" style={{ marginTop: 2 }}>{label}</Txt>
    </View>
  );
  const High = ({ label, value }: { label: string; value: number }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 }}>
      <Txt k="body" color={colors.muted}>{label}</Txt>
      <Txt k="stat">{value}</Txt>
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(16) }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space(4) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: team?.color ?? colors.surfaceHi, alignItems: 'center', justifyContent: 'center' }}>
          <Txt k="h1" color="#FFFFFF">{player.number ?? player.name.slice(0, 1)}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt k="h1">{player.name}</Txt>
          <Txt k="body" color={colors.muted}>{team?.name ?? 'Free agent'} · {c.gp} games</Txt>
        </View>
      </View>

      {c.gp === 0 ? (
        <Empty title="No games played yet" subtitle="Stats appear after this player's first finished game." />
      ) : (
        <>
          <Button title="Share stat card" onPress={onSharePress} kind="ghost" style={{ marginBottom: space(3) }} />

          <Card style={{ marginBottom: space(3) }}>
            <Txt k="label" style={{ marginBottom: space(2) }}>Season averages</Txt>
            <View style={{ flexDirection: 'row', marginBottom: space(3) }}>
              <Big label="PPG" value={c.ppg.toFixed(1)} />
              <Big label="RPG" value={c.rpg.toFixed(1)} />
              <Big label="APG" value={c.apg.toFixed(1)} />
            </View>
            <View style={{ height: 1, backgroundColor: colors.line, marginBottom: space(3) }} />
            <View style={{ flexDirection: 'row' }}>
              <Avg label="SPG" value={c.spg.toFixed(1)} />
              <Avg label="BPG" value={c.bpg.toFixed(1)} />
              <Avg label="3PM/G" value={c.tpmpg.toFixed(1)} />
              <Avg label="TOPG" value={c.topg.toFixed(1)} />
              <Avg label="PF/G" value={c.pfpg.toFixed(1)} />
            </View>
          </Card>

          {(league.trackMisses ?? true) && (
            <Card style={{ marginBottom: space(3) }}>
              <Txt k="label" style={{ marginBottom: space(2) }}>Shooting splits</Txt>
              <View style={{ flexDirection: 'row' }}>
                <Split label="FG" makes={c.fgm} att={c.fga} pctStr={c.fgPct} />
                <Split label="3PT" makes={c.tpm} att={c.tpa} pctStr={c.tpPct} />
                <Split label="FT" makes={c.ftm} att={c.fta} pctStr={c.ftPct} />
              </View>
            </Card>
          )}

          <Card style={{ marginBottom: space(3) }}>
            <Txt k="label" style={{ marginBottom: 2 }}>Career highs</Txt>
            <Txt k="body" color={colors.muted} style={{ fontSize: 11, marginBottom: space(2) }}>
              Single-game bests across all {c.gp} games — each number may come from a different game.
            </Txt>
            {([
              ['Points', c.highPts],
              ['Rebounds', c.highReb],
              ['Assists', c.highAst],
              ['Steals', c.highStl],
              ['Blocks', c.highBlk],
            ] as [string, number][])
              .filter(([, v]) => v > 0)
              .map(([label, v], idx) => (
                <View key={label}>
                  {idx > 0 ? <View style={{ height: 1, backgroundColor: colors.line }} /> : null}
                  <High label={label} value={v} />
                </View>
              ))}
            {c.bestGame ? (
              <View style={{ marginTop: space(3), borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space(2) }}>
                <Txt k="label" color={colors.brandTeal} style={{ fontSize: 10, marginBottom: 4 }}>BEST ALL-AROUND GAME</Txt>
                <Txt k="body">
                  {([
                    ['PTS', c.bestGame.pts],
                    ['REB', c.bestGame.reb],
                    ['AST', c.bestGame.ast],
                    ['STL', c.bestGame.stl],
                    ['BLK', c.bestGame.blk],
                  ] as [string, number][])
                    .filter(([, v]) => v > 0)
                    .map(([label, v]) => `${v} ${label}`)
                    .join(' · ')}
                </Txt>
                {c.bestGame.matchup ? (
                  <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginTop: 2 }}>
                    {c.bestGame.matchup} · {c.bestGame.score}{c.bestGame.dateMs ? ` · ${dateLabel(c.bestGame.dateMs)}` : ''}
                  </Txt>
                ) : null}
              </View>
            ) : null}
          </Card>

          {c.lastGame && (
            <Card style={{ marginBottom: space(3) }}>
              <Txt k="label" color={colors.brandTeal} style={{ marginBottom: space(2) }}>Last game</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
                {([
                  ['PTS', c.lastGame.pts],
                  ['REB', c.lastGame.reb],
                  ['AST', c.lastGame.ast],
                  ['STL', c.lastGame.stl],
                  ['BLK', c.lastGame.blk],
                ] as [string, number][])
                  .filter(([, v]) => v > 0)
                  .map(([label, v]) => (
                    <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                      <Txt color={colors.text} style={{ fontFamily: font.display, fontSize: 26, lineHeight: 32, includeFontPadding: false } as any}>{v}</Txt>
                      <Txt k="label" color={colors.muted}>{label}</Txt>
                    </View>
                  ))}
              </View>
              {c.lastGame.matchup ? (
                <Txt k="body" style={{ marginTop: 10, fontSize: 14 }}>
                  {c.lastGame.matchup} · <Txt k="body" color={colors.accent} style={{ fontSize: 14 }}>{c.lastGame.score}</Txt>
                </Txt>
              ) : null}
              <Txt k="body" color={colors.muted} style={{ marginTop: c.lastGame.matchup ? 2 : 10 }}>
                {c.lastGame.leagueName}{c.lastGame.dateMs ? ` · ${dateLabel(c.lastGame.dateMs)}` : ''}
              </Txt>
            </Card>
          )}

          {c.badges.length > 0 && (
            <Card>
              <Txt k="label" style={{ marginBottom: space(2) }}>Badges</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {c.badges.map(b => <Pill key={b} label={b} color={colors.accentDim} textColor={colors.text} />)}
              </View>
            </Card>
          )}
        </>
      )}

      </ScrollView>

      {/* Off-screen shareable stat card */}
      {c.gp > 0 && (
        <View style={{ position: 'absolute', left: -9999, top: 0 }}>
          <View ref={cardRef} collapsable={false}
            style={{ width: 540, minHeight: 720, backgroundColor: colors.bg, overflow: 'hidden', paddingBottom: 24 }}>

            {/* Teal radial glow behind the player name */}
            <LinearGradient
              colors={['rgba(18,215,208,0.18)', 'rgba(18,215,208,0)']}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }}
            />
            {/* Vertical brand stripe */}
            <LinearGradient
              colors={wordmarkGradient}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 }}
            />

            {/* HEADER */}
            <View style={{ paddingHorizontal: 36, paddingTop: 32 }}>
              <MiniWordmark size={30} />
              <Txt k="label" color={colors.muted} style={{ fontSize: 11, marginTop: 8 }}>
                {league.name.toUpperCase()} · {league.season.toUpperCase()}
              </Txt>
            </View>

            {/* PLAYER */}
            <View style={{ paddingHorizontal: 36, marginTop: 30 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {team ? <TeamBadge logo={team.logo} color={team.color} size={32} /> : null}
                <View style={{ flex: 1 }}>
                  <Txt color={colors.text} style={{ fontFamily: font.display, fontSize: 38, lineHeight: 48, includeFontPadding: false } as any}>
                    {player.name}
                  </Txt>
                  <Txt k="body" color={colors.muted} style={{ marginTop: 4 }}>
                    {team?.name ?? 'Free agent'} · {c.gp} game{c.gp === 1 ? '' : 's'}
                  </Txt>
                </View>
              </View>
            </View>

            {/* PRIMARY AVERAGES — the big three */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 36, marginTop: 28, gap: 16 }}>
              <PosterStat label="PPG" value={c.ppg.toFixed(1)} />
              <PosterStat label="RPG" value={c.rpg.toFixed(1)} />
              <PosterStat label="APG" value={c.apg.toFixed(1)} />
            </View>

            {/* SECONDARY ROW */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 36, marginTop: 18, gap: 12 }}>
              <MiniStat label="SPG" value={c.spg.toFixed(1)} />
              <MiniStat label="BPG" value={c.bpg.toFixed(1)} />
              <MiniStat label="3PM/G" value={c.tpmpg.toFixed(1)} />
            </View>

            {/* CAREER HIGH */}
            <View style={{ marginHorizontal: 36, marginTop: 20, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line }}>
              <Txt k="label" color={colors.brandLime} style={{ fontSize: 10, letterSpacing: 1 }}>★ CAREER HIGH</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <Txt color={colors.text} style={{ fontFamily: font.display, fontSize: 36, lineHeight: 46, includeFontPadding: false } as any}>{c.highPts}</Txt>
                <Txt k="label" color={colors.muted}>PTS</Txt>
              </View>
              <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginTop: 2 }}>
                {c.bestGame ? `Best night: ${([
                  ['pts', c.bestGame.pts],
                  ['ast', c.bestGame.ast],
                  ['reb', c.bestGame.reb],
                  ['stl', c.bestGame.stl],
                  ['blk', c.bestGame.blk],
                ] as [string, number][])
                  .filter(([, v]) => v > 0)
                  .map(([label, v]) => `${v} ${label}`)
                  .join(' / ')}` : ''}
              </Txt>
            </View>

            {/* LAST GAME */}
            {c.lastGame && (
              <View style={{ marginHorizontal: 36, marginTop: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line }}>
                <Txt k="label" color={colors.brandTeal} style={{ fontSize: 10, letterSpacing: 1 }}>LAST GAME</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 14, marginTop: 6 }}>
                  {([
                    ['PTS', c.lastGame.pts],
                    ['REB', c.lastGame.reb],
                    ['AST', c.lastGame.ast],
                    ['STL', c.lastGame.stl],
                    ['BLK', c.lastGame.blk],
                  ] as [string, number][])
                    .filter(([, v]) => v > 0)
                    .map(([label, v]) => (
                      <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Txt color={colors.text} style={{ fontFamily: font.display, fontSize: 24, lineHeight: 30, includeFontPadding: false } as any}>{v}</Txt>
                        <Txt k="label" color={colors.muted} style={{ fontSize: 9, letterSpacing: 1 }}>{label}</Txt>
                      </View>
                    ))}
                </View>
                {c.lastGame.matchup ? (
                  <Txt k="body" style={{ fontSize: 12, marginTop: 6 }}>
                    {c.lastGame.matchup} · <Txt k="body" color={colors.accent} style={{ fontSize: 12 }}>{c.lastGame.score}</Txt>
                  </Txt>
                ) : null}
                <Txt k="body" color={colors.muted} style={{ fontSize: 11, marginTop: 2 }}>
                  {c.lastGame.leagueName}{c.lastGame.dateMs ? ` · ${dateLabel(c.lastGame.dateMs)}` : ''}
                </Txt>
              </View>
            )}

            {/* FOOTER — brand left, sponsor right */}
            <View style={{ marginTop: 24, marginHorizontal: 36, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <LinearGradient
                  colors={wordmarkGradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: 2, width: 64, borderRadius: 1, marginBottom: 10 }}
                />
                <Txt k="body" color={colors.muted} style={{ fontSize: 11, letterSpacing: 1.2 }}>
                  RECORD · TRACK · ELEVATE
                </Txt>
              </View>
              <SponsorMark />
            </View>
          </View>
        </View>
      )}

      <SignInModal
        visible={askSignIn}
        message="Sharing player stat cards requires a Google account."
        error={lastError ?? undefined}
        busy={authBusy}
        onGoogle={() => { void onSignInThenShare(signInWithGoogle); }}
        onApple={appleAvailable ? () => { void onSignInThenShare(signInWithApple); } : undefined}
        onCancel={() => setAskSignIn(false)}
      />
    </Screen>
  );
}

function PosterStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, padding: 14, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}>
      <Txt color={colors.brandTeal} style={{ fontFamily: font.display, fontSize: 36, lineHeight: 44, includeFontPadding: false } as any}>{value}</Txt>
      <Txt k="label" color={colors.muted} style={{ fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</Txt>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt color={colors.text} style={{ fontFamily: font.display, fontSize: 22, lineHeight: 28, includeFontPadding: false } as any}>{value}</Txt>
      <Txt k="label" color={colors.muted} style={{ fontSize: 9, letterSpacing: 1, marginTop: 1 }}>{label}</Txt>
    </View>
  );
}

// Visible profile stat tiles (used in the on-screen layout, separate from the share card).
function Big({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt color={colors.text} style={{ fontFamily: font.display, fontSize: 30, lineHeight: 32 }}>{value}</Txt>
      <Txt k="label" color={colors.muted}>{label}</Txt>
    </View>
  );
}

function Avg({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt color={colors.text} style={{ fontFamily: font.displaySemi, fontSize: 18 }}>{value}</Txt>
      <Txt k="label" color={colors.muted}>{label}</Txt>
    </View>
  );
}
