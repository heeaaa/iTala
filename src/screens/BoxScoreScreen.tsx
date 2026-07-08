import React, { useRef, useState } from 'react';
import { View, ScrollView, Pressable, Platform, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { Screen, Txt, Card, Segmented, Button, Pill, TeamBadge, LivePip, MiniWordmark, SignInModal, SponsorMark } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, radius, font, brandGradient, wordmarkGradient } from '../theme';
import { ScreenProps } from '../navigation';
import { teamBoxScore, gameScore, lineScore, statPlayersOfGame } from '../lib/stats';
import { pct } from '../lib/format';
import { StatLine, EventType } from '../types';

const EV_LABEL: Record<EventType, string> = {
  fg2_make: 'made 2', fg2_miss: 'missed 2', fg3_make: 'made 3', fg3_miss: 'missed 3',
  ft_make: 'made FT', ft_miss: 'missed FT', reb: 'rebound', oreb: 'off. reb', dreb: 'def. reb',
  ast: 'assist', stl: 'steal', blk: 'block', tov: 'turnover', pf: 'foul', timeout: 'Timeout',
};

export default function BoxScoreScreen({ route, navigation }: ScreenProps<'BoxScore'>) {
  const { leagueId, gameId } = route.params;
  const { state, dispatch } = useStore();
  const { role, canScore, signInWithGoogle, appleAvailable, signInWithApple, authBusy, lastError } = useAdmin();
  const league = useLeague(leagueId);
  const game = league?.games.find(g => g.id === gameId);
  const [side, setSide] = useState(0);
  const [askSignIn, setAskSignIn] = useState(false);
  const [attOpen, setAttOpen] = useState(false);
  const [cardPickOpen, setCardPickOpen] = useState(false);
  // Attendance draft: starts from what's saved, else auto-seeds with everyone
  // who recorded a stat ("played = present"). Benched-but-present players get
  // checked manually.
  const [attDraft, setAttDraft] = useState<Set<string> | null>(null);
  const cardRef = useRef<View>(null);

  if (!league || !game) return <Screen><Txt k="body">Game not found.</Txt></Screen>;

  const homeTeam = league.teams.find(t => t.id === game.homeTeamId)!;
  const awayTeam = league.teams.find(t => t.id === game.awayTeamId)!;
  const score = gameScore(league, game);
  const ls = lineScore(league, game);
  const team = side === 0 ? homeTeam : awayTeam;
  const box = teamBoxScore(league, gameId, team.id);

  const playerName = (id: string | null) => id ? (league.players.find(p => p.id === id)?.name ?? 'Player') : 'Team';

  // top performer across both teams for the share card
  const allLines = [
    ...teamBoxScore(league, gameId, homeTeam.id).lines.map(l => ({ l, teamId: homeTeam.id })),
    ...teamBoxScore(league, gameId, awayTeam.id).lines.map(l => ({ l, teamId: awayTeam.id })),
  ].filter(x => x.l.playerId);
  const star = allLines.sort((a, b) => b.l.pts - a.l.pts)[0];

  const events = league.events.filter(e => e.gameId === gameId).slice().reverse();
  // Highest period seen — shown on the LIVE share-card pill.
  const period = events[0]?.period ?? game.period ?? 1;

  const textBrag = () => {
    const lead = `${homeTeam.name} ${score.home}, ${awayTeam.name} ${score.away}`;
    const starLine = star && star.l.playerId
      ? ` — ${playerName(star.l.playerId)} went ${star.l.pts}/${star.l.reb}/${star.l.ast}`
      : '';
    return `${game.status === 'final' ? 'Final: ' : ''}${lead}${starLine} (tracked with iTala 🏀)`;
  };

  const share = async () => {
    // Primary: a polished image card (works in production/dev builds).
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri); return; }
    } catch {
      // react-native-view-shot isn't part of Expo Go — fall through to text sharing.
    }
    // Fallback: share a text brag via the OS sheet (works everywhere, incl. Expo Go).
    try { await Share.share({ message: textBrag() }); } catch { /* user cancelled */ }
  };

  // Post-game CSV export — one message with both teams' full box, ready to
  // paste into Sheets/Excel or archive. Uses the OS share sheet (no deps).
  const exportCsv = async () => {
    if (!game || !league) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['Team', 'Player', 'PTS', 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF'];
    const rows: string[] = [header.join(',')];
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      const team = league.teams.find(t => t.id === teamId);
      const { lines, total } = teamBoxScore(league, game.id, teamId);
      for (const l of lines) {
        rows.push([esc(team?.name ?? ''), esc(playerName(l.playerId)),
          l.pts, l.fgm, l.fga, l.tpm, l.tpa, l.ftm, l.fta, l.reb, l.ast, l.stl, l.blk, l.tov, l.pf].join(','));
      }
      rows.push([esc(team?.name ?? ''), esc('TOTAL'),
        total.pts, total.fgm, total.fga, total.tpm, total.tpa, total.ftm, total.fta, total.reb, total.ast, total.stl, total.blk, total.tov, total.pf].join(','));
    }
    const home = league.teams.find(t => t.id === game.homeTeamId)?.name ?? 'Home';
    const away = league.teams.find(t => t.id === game.awayTeamId)?.name ?? 'Away';
    const title = `${home} vs ${away} — box score (${league.name})`;
    try { await Share.share({ message: `${title}\n${rows.join('\n')}`, title }); } catch { /* cancelled */ }
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

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(20) }}>
        {/* Final score header */}
        <Card style={{ marginBottom: space(3) }}>
          {game.status === 'final' ? (
            <Pill label="FINAL" color={colors.surfaceHi} textColor={colors.muted} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <LivePip size={7} />
              <Txt k="label" color={colors.brandLime}>LIVE</Txt>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space(2) }}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TeamBadge logo={homeTeam.logo} color={homeTeam.color} size={20} />
                <Txt k="h2" color={score.home >= score.away ? colors.text : colors.muted}>{homeTeam.name}</Txt>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TeamBadge logo={awayTeam.logo} color={awayTeam.color} size={20} />
                <Txt k="h2" color={score.away > score.home ? colors.text : colors.muted}>{awayTeam.name}</Txt>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Txt k="statBig" color={score.home >= score.away ? colors.text : colors.muted}>{score.home}</Txt>
              <Txt k="statBig" color={score.away > score.home ? colors.text : colors.muted}>{score.away}</Txt>
            </View>
          </View>

          {/* End-of-quarter line score */}
          <View style={{ marginTop: space(3), borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space(2) }}>
            <View style={{ flexDirection: 'row' }}>
              <Txt k="label" style={{ flex: 1 }}>By period</Txt>
              {ls.periods.map(p => <Txt key={p} k="label" style={{ width: 34, textAlign: 'center' }}>Q{p}</Txt>)}
              <Txt k="label" style={{ width: 38, textAlign: 'center' }}>T</Txt>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Txt k="body" numberOfLines={1} style={{ flex: 1 }}>{homeTeam.name}</Txt>
              {ls.home.map((v, i) => <Txt key={i} k="stat" style={{ width: 34, textAlign: 'center' }}>{v}</Txt>)}
              <Txt k="stat" color={colors.accent} style={{ width: 38, textAlign: 'center' }}>{score.home}</Txt>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <Txt k="body" numberOfLines={1} style={{ flex: 1 }}>{awayTeam.name}</Txt>
              {ls.away.map((v, i) => <Txt key={i} k="stat" style={{ width: 34, textAlign: 'center' }}>{v}</Txt>)}
              <Txt k="stat" color={colors.accent} style={{ width: 38, textAlign: 'center' }}>{score.away}</Txt>
            </View>
          </View>
        </Card>

        <Button title="Share box-score card" onPress={onSharePress} kind="ghost" style={{ marginBottom: space(2) }} />
        {game.status === 'final' && (
          <Button
            title="🏅 Player achievement cards"
            kind="ghost"
            style={{ marginBottom: space(2) }}
            onPress={() => setCardPickOpen(v => !v)}
          />
        )}
        {game.status === 'final' && cardPickOpen && (
          <Card style={{ marginBottom: space(2) }}>
            <Txt k="label" color={colors.muted} style={{ marginBottom: space(2) }}>Pick a player to make a shareable card</Txt>
            {allLines.filter(r => r.l.playerId && (r.l.pts || r.l.reb || r.l.ast || r.l.stl || r.l.blk)).map(({ l, teamId }) => {
              const team = league!.teams.find(t => t.id === teamId);
              return (
                <Pressable key={l.playerId}
                  onPress={() => navigation.navigate('ShareCard', { leagueId, kind: 'game', gameId, playerId: l.playerId! })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <TeamBadge logo={team?.logo} color={team?.color ?? colors.muted} size={16} />
                  <Txt k="body" style={{ flex: 1 }}>{playerName(l.playerId)}</Txt>
                  <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>{l.pts} PTS · {l.reb} REB · {l.ast} AST ›</Txt>
                </Pressable>
              );
            })}
          </Card>
        )}
        {game.status === 'final' && (
          <Button title="⇩ Export box score (CSV)" onPress={() => { void exportCsv(); }} kind="ghost" style={{ marginBottom: space(2) }} />
        )}
        {game.status === 'final' && league && canScore(league) && (
          <Button
            title={game.attendance ? `📋 Attendance (${game.attendance.length} present)` : '📋 Record attendance'}
            kind="ghost"
            style={{ marginBottom: space(3) }}
            onPress={() => {
              setAttDraft(new Set(game.attendance ?? [...statPlayersOfGame(league, gameId)]));
              setAttOpen(true);
            }}
          />
        )}
        {attOpen && attDraft && league && (() => {
          const auto = statPlayersOfGame(league, gameId);
          const toggle = (pid: string) => setAttDraft(prev => {
            const next = new Set(prev);
            if (next.has(pid)) next.delete(pid); else next.add(pid);
            return next;
          });
          const teamBlock = (teamId: string) => {
            const team = league.teams.find(t => t.id === teamId);
            if (!team || team.teamOnly) return null;
            const roster = team.playerIds
              .map(pid => league.players.find(pl => pl.id === pid))
              .filter((pl): pl is NonNullable<typeof pl> => !!pl)
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            return (
              <View key={teamId} style={{ marginTop: space(2) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <TeamBadge logo={team.logo} color={team.color} size={13} />
                  <Txt k="label">{team.name}</Txt>
                </View>
                {roster.map(pl => {
                  const present = attDraft.has(pl.id);
                  const played = auto.has(pl.id);
                  return (
                    <Pressable key={pl.id} onPress={() => toggle(pl.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                      <View style={{
                        width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                        borderColor: present ? colors.brandTeal : colors.line,
                        backgroundColor: present ? colors.brandTeal : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {present ? <Txt k="body" color={colors.bg} style={{ fontSize: 14, lineHeight: 18 }}>✓</Txt> : null}
                      </View>
                      <Txt k="body" style={{ flex: 1 }}>{pl.number ? `#${pl.number} ` : ''}{pl.name}</Txt>
                      {played && <Pill label="PLAYED" color={colors.accentDim} textColor={colors.brandTeal} />}
                    </Pressable>
                  );
                })}
              </View>
            );
          };
          return (
            <Card style={{ marginBottom: space(3), borderColor: colors.brandTeal }}>
              <Txt k="label" color={colors.brandTeal}>📋 Attendance</Txt>
              <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginTop: 2 }}>
                Players with stats are checked automatically. Tap to check benched players who were present — attendance counts toward Games Played on the roster.
              </Txt>
              {teamBlock(game.homeTeamId)}
              {teamBlock(game.awayTeamId)}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: space(3) }}>
                <Button title="Cancel" kind="ghost" style={{ flex: 1 }} onPress={() => setAttOpen(false)} />
                <Button title="Save attendance" style={{ flex: 1 }} onPress={() => {
                  dispatch({ t: 'SET_ATTENDANCE', leagueId, gameId, playerIds: [...attDraft] });
                  setAttOpen(false);
                }} />
              </View>
            </Card>
          );
        })()}

        <Segmented options={[homeTeam.name, awayTeam.name]} value={side} onChange={setSide} />
        <View style={{ height: space(3) }} />

        {/* Box score table */}
        <BoxTable lines={box.lines} total={box.total} nameOf={playerName} trackMisses={game.trackMisses ?? league.trackMisses ?? state.settings.trackMisses} trackTurnovers={game.trackTurnovers ?? league.trackTurnovers ?? true} />

        {/* Play-by-play */}
        <Txt k="label" style={{ marginTop: space(5), marginBottom: 8 }}>Play-by-play</Txt>
        <Card>
          {events.length === 0 ? <Txt k="body" color={colors.muted}>No events logged.</Txt> :
            events.map((e, i) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <Txt k="stat" color={colors.muted} style={{ width: 28 }}>{e.period}</Txt>
                <Txt k="body" style={{ flex: 1 }} color={e.type === 'timeout' ? colors.yellow : colors.text}>
                  {e.type === 'timeout'
                    ? (() => { const tn = league.teams.find(t => t.id === e.teamId)?.name ?? 'Team'; return e.note ? `${tn} Timeout — ${e.note} remaining` : `${tn} Timeout`; })()
                    : `${playerName(e.playerId)} — ${EV_LABEL[e.type]}`}
                </Txt>
                {game.status !== 'final' && (
                  <Pressable onPress={() => dispatch({ t: 'DELETE_EVENT', leagueId, eventId: e.id })} hitSlop={8}>
                    <Txt k="body" color={colors.red}>✕</Txt>
                  </Pressable>
                )}
              </View>
            ))
          }
        </Card>
      </ScrollView>

      {/* Off-screen share card — captured by react-native-view-shot. Rendered at
          540×720 (a 3:4 portrait poster that reads well in chat / Instagram). */}
      <View style={{ position: 'absolute', left: -9999, top: 0 }}>
        <View ref={cardRef} collapsable={false}
          style={{ width: 540, height: 720, backgroundColor: colors.bg, overflow: 'hidden' }}>

          {/* Teal radial glow behind the score (faked with a vertical linear gradient) */}
          <LinearGradient
            colors={['rgba(18,215,208,0.18)', 'rgba(18,215,208,0)']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }}
          />

          {/* Vertical brand stripe down the left edge */}
          <LinearGradient
            colors={wordmarkGradient}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 }}
          />

          {/* HEADER: wordmark + league context + FINAL pip */}
          <View style={{ paddingHorizontal: 36, paddingTop: 32 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <MiniWordmark size={30} />
                <Txt k="label" color={colors.muted} style={{ fontSize: 11, marginTop: 8 }}>
                  {league.name.toUpperCase()} · {league.season.toUpperCase()}
                </Txt>
              </View>
              <View style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                backgroundColor: 'rgba(18,215,208,0.12)', borderWidth: 1, borderColor: colors.brandTeal,
              }}>
                <Txt k="label" color={colors.brandTeal} style={{ fontSize: 10 }}>
                  {game.status === 'final' ? 'FINAL' : `LIVE · P${period}`}
                </Txt>
              </View>
            </View>
          </View>

          {/* SCORES — the focal point. Winner in white, loser muted. */}
          <View style={{ paddingHorizontal: 36, marginTop: 38, flex: 1 }}>
            <ScoreRow team={homeTeam} score={score.home} winner={score.home >= score.away} />
            <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 14 }} />
            <ScoreRow team={awayTeam} score={score.away} winner={score.away > score.home} />

            {/* STAR PLAYER */}
            {star && (
              <View style={{ marginTop: 32, padding: 18, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line }}>
                <Txt k="label" color={colors.brandLime} style={{ fontSize: 10, letterSpacing: 1 }}>★ PLAYER OF THE GAME</Txt>
                <Txt k="h1" style={{ marginTop: 8, fontSize: 26 }} color={colors.text}>{playerName(star.l.playerId)}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 24, marginTop: 8 }}>
                  <StatBig label="PTS" value={star.l.pts} />
                  <StatBig label="REB" value={star.l.reb} />
                  <StatBig label="AST" value={star.l.ast} />
                </View>
              </View>
            )}
          </View>

          {/* FOOTER — brand left, sponsor right */}
          <View style={{ paddingHorizontal: 36, paddingBottom: 24, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
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

      {game.status === 'live' && (
        <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(6) }}>
          <Button title="Back to live game" onPress={() => navigation.replace('LiveGame', { leagueId, gameId, spectator: false })} />
        </View>
      )}

      <SignInModal
        visible={askSignIn}
        message="Sharing box-score cards requires a Google account."
        error={lastError ?? undefined}
        busy={authBusy}
        onGoogle={() => { void onSignInThenShare(signInWithGoogle); }}
        onApple={appleAvailable ? () => { void onSignInThenShare(signInWithApple); } : undefined}
        onCancel={() => setAskSignIn(false)}
      />
    </Screen>
  );
}

/* --- Share card sub-components ------------------------------------------- */

function ScoreRow({ team, score, winner }: { team: { name: string; color: string; logo?: string }; score: number; winner: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
        <TeamBadge logo={team.logo} color={team.color} size={28} />
        <Txt k="h1" color={winner ? colors.text : colors.muted} numberOfLines={1} style={{ flex: 1, fontSize: 28, lineHeight: 34 }}>
          {team.name}
        </Txt>
      </View>
      <Txt color={winner ? colors.text : colors.muted}
        style={{ fontFamily: font.display, fontSize: 76, lineHeight: 92, includeFontPadding: false } as any}>
        {score}
      </Txt>
    </View>
  );
}

function StatBig({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Txt color={colors.brandTeal} style={{ fontFamily: font.display, fontSize: 36, lineHeight: 44, includeFontPadding: false } as any}>{value}</Txt>
      <Txt k="label" color={colors.muted} style={{ fontSize: 10, letterSpacing: 1 }}>{label}</Txt>
    </View>
  );
}

function BoxTable({ lines, total, nameOf, trackMisses, trackTurnovers }: { lines: StatLine[]; total: StatLine; nameOf: (id: string | null) => string; trackMisses: boolean; trackTurnovers: boolean }) {
  const Head = ({ children, w }: { children: React.ReactNode; w: number }) => (
    <Txt k="label" style={{ width: w, textAlign: 'center' }}>{children}</Txt>
  );
  const Cell = ({ children, w, accent }: { children: React.ReactNode; w: number; accent?: boolean }) => (
    <Txt k="stat" color={accent ? colors.accent : colors.text} style={{ width: w, textAlign: 'center' }}>{children}</Txt>
  );
  return (
    <Card style={{ padding: space(2) }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
            <Txt k="label" style={{ width: 120 }}>Player</Txt>
            <Head w={42}>PTS</Head>
            {trackMisses ? (
              <><Head w={56}>FG</Head><Head w={48}>3P</Head><Head w={48}>FT</Head></>
            ) : (
              <><Head w={48}>FGM</Head><Head w={48}>3PM</Head><Head w={48}>FTM</Head></>
            )}
            <Head w={38}>REB</Head><Head w={36}>AST</Head><Head w={36}>STL</Head><Head w={36}>BLK</Head>{trackTurnovers ? <Head w={36}>TO</Head> : null}<Head w={32}>PF</Head>
          </View>
          {lines.map((l, i) => (
            <View key={l.playerId ?? `t${i}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Txt k="body" numberOfLines={1} style={{ width: 120 }}>{nameOf(l.playerId)}</Txt>
              <Cell w={42} accent>{l.pts}</Cell>
              {trackMisses ? (
                <><Cell w={56}>{l.fgm}-{l.fga}</Cell><Cell w={48}>{l.tpm}-{l.tpa}</Cell><Cell w={48}>{l.ftm}-{l.fta}</Cell></>
              ) : (
                <><Cell w={48}>{l.fgm}</Cell><Cell w={48}>{l.tpm}</Cell><Cell w={48}>{l.ftm}</Cell></>
              )}
              <Cell w={38}>{l.reb}</Cell><Cell w={36}>{l.ast}</Cell><Cell w={36}>{l.stl}</Cell>
              <Cell w={36}>{l.blk}</Cell>{trackTurnovers ? <Cell w={36}>{l.tov}</Cell> : null}<Cell w={32}>{l.pf}</Cell>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 2, borderTopColor: colors.line }}>
            <Txt k="label" style={{ width: 120 }}>Team{trackMisses ? ` · ${pct(total.fgm, total.fga)} FG` : ''}</Txt>
            <Cell w={42} accent>{total.pts}</Cell>
            {trackMisses ? (
              <><Cell w={56}>{total.fgm}-{total.fga}</Cell><Cell w={48}>{total.tpm}-{total.tpa}</Cell><Cell w={48}>{total.ftm}-{total.fta}</Cell></>
            ) : (
              <><Cell w={48}>{total.fgm}</Cell><Cell w={48}>{total.tpm}</Cell><Cell w={48}>{total.ftm}</Cell></>
            )}
            <Cell w={38}>{total.reb}</Cell><Cell w={36}>{total.ast}</Cell><Cell w={36}>{total.stl}</Cell>
            <Cell w={36}>{total.blk}</Cell>{trackTurnovers ? <Cell w={36}>{total.tov}</Cell> : null}<Cell w={32}>{total.pf}</Cell>
          </View>
        </View>
      </ScrollView>
      <Txt k="body" color={colors.muted} style={{ fontSize: 11, marginTop: 8, textAlign: 'center' }}>
        Swipe the table sideways to see all columns →
      </Txt>
    </Card>
  );
}
