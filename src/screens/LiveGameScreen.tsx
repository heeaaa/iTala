import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { View, Pressable, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { Screen, Txt, Button, Segmented, TeamBadge, LivePip, PromoStrip } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { colors, space, radius, font, statColors, MAX_PERIOD, LINEUP_SIZE } from '../theme';
import { ScreenProps } from '../navigation';
import { EventType, Team, Player } from '../types';
import {
  gameScore, teamBoxScore, teamPeriodFouls, fouledOutSet, playerFouls, effectiveFoulLimit,
  lineScore, perfRating, teamPeriodTimeouts,
} from '../lib/stats';
import { tapFeedback, undoFeedback, successFeedback } from '../lib/haptics';
import { usePromos, onPromoTap } from '../lib/usePromos';

type PadBtn = { label: string; type: EventType; color: string };
const MISS_ROW: PadBtn[] = [
  { label: '2PT ✗', type: 'fg2_miss', color: statColors.miss }, { label: '3PT ✗', type: 'fg3_miss', color: statColors.miss }, { label: 'FT ✗', type: 'ft_miss', color: statColors.miss },
];
const PAD_MAKES: PadBtn[] = [
  { label: '2PT', type: 'fg2_make', color: statColors.make }, { label: '3PT', type: 'fg3_make', color: statColors.make }, { label: 'FT', type: 'ft_make', color: statColors.make },
];
const PAD_OTHER: PadBtn[][] = [
  [{ label: 'REB', type: 'reb', color: statColors.reb }, { label: 'AST', type: 'ast', color: statColors.ast }, { label: 'STL', type: 'stl', color: statColors.stl }],
  [{ label: 'BLK', type: 'blk', color: statColors.blk }, { label: 'FOUL', type: 'pf', color: statColors.foul }],
];
const TOV_BTN: PadBtn = { label: 'TOV', type: 'tov', color: statColors.tov };

const LABELS: Record<EventType, string> = {
  fg2_make: '+2', fg2_miss: '2PT miss', fg3_make: '+3', fg3_miss: '3PT miss',
  ft_make: '+1 FT', ft_miss: 'FT miss', reb: 'Rebound', oreb: 'O.Reb', dreb: 'D.Reb',
  ast: 'Assist', stl: 'Steal', blk: 'Block', tov: 'Turnover', pf: 'Foul', timeout: 'Timeout',
};
const PBP_LABEL: Record<EventType, string> = {
  fg2_make: 'made 2', fg2_miss: 'missed 2', fg3_make: 'made 3', fg3_miss: 'missed 3',
  ft_make: 'made FT', ft_miss: 'missed FT', reb: 'rebound', oreb: 'off. reb', dreb: 'def. reb',
  ast: 'assist', stl: 'steal', blk: 'block', tov: 'turnover', pf: 'foul', timeout: 'Timeout',
};

export default function LiveGameScreen({ route, navigation }: ScreenProps<'LiveGame'>) {
  const { leagueId, gameId, spectator } = route.params;
  const readOnly = !!spectator;
  const { activePromos } = usePromos();
  const { state, dispatch } = useStore();
  const league = useLeague(leagueId);
  const game = league?.games.find(g => g.id === gameId);

  const [activeSide, setActiveSide] = useState<'home' | 'away'>('home');
  const [armed, setArmed] = useState<EventType | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null); // brief "logged" confirmation
  const [milestone, setMilestone] = useState<string | null>(null); // celebratory banner
  useKeepAwake(); // screen never sleeps mid-game
  const leagueRef = React.useRef(league);
  leagueRef.current = league;

  // Guard against an accidental back-swipe dumping the scorekeeper out of a
  // live game. The game state is safe either way, but the interruption is
  // jarring mid-action, so we confirm first. Spectators aren't guarded.

  const score = useMemo(() => (league && game ? gameScore(league, game) : { home: 0, away: 0 }), [state, leagueId, gameId]);

  // Stat pad respects the LEAGUE's settings: the miss row and the TOV button
  // appear only when enabled for this league. Misses fall back to the legacy
  // global for old data; turnovers default on.
  // Per-game overrides (drop-in games) win; otherwise the league setting.
  const trackMisses = game?.trackMisses ?? league?.trackMisses ?? state.settings.trackMisses;
  const trackTurnovers = game?.trackTurnovers ?? league?.trackTurnovers ?? true;
  const PAD: PadBtn[][] = (() => {
    const rows = trackMisses ? [PAD_MAKES, MISS_ROW, ...PAD_OTHER] : [PAD_MAKES, ...PAD_OTHER];
    if (trackTurnovers) {
      // TOV joins BLK + FOUL to keep the bottom row a balanced trio.
      const last = rows.length - 1;
      rows[last] = [...rows[last], TOV_BTN];
    }
    return rows;
  })();

  // If a stat gets disabled while armed, disarm it.
  useEffect(() => {
    if (!trackMisses && armed && armed.endsWith('_miss')) setArmed(null);
    if (!trackTurnovers && armed === 'tov') setArmed(null);
  }, [trackMisses, trackTurnovers, armed]);

  const guardEnabled = !readOnly;
  const leavingRef = React.useRef(false); // set when WE navigate intentionally

  // iOS's back-swipe is a NATIVE gesture: it visually dismisses the screen
  // before JS can ask "are you sure?" — un-preventable in any clean way on
  // native-stack. So for scorekeepers we disable the gesture entirely (an
  // accidental exit becomes impossible) and provide an explicit ✕ Exit button
  // that confirms while the screen is still fully present. Spectators keep
  // the natural swipe — nothing to protect there.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: readOnly });
  }, [navigation, readOnly]);

  const confirmExit = () => {
    const g = leagueRef.current?.games.find(x => x.id === gameId);
    if (readOnly || !g || g.status !== 'live') { navigation.goBack(); return; }
    Alert.alert(
      'Leave live tracking?',
      'The game stays saved — you can come back to it anytime from the league. Leave now?',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => {
          leavingRef.current = true;
          navigation.goBack();
        } },
      ],
    );
  };
  useEffect(() => {
    if (!guardEnabled) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      // This guard now serves the ANDROID HARDWARE BACK (a JS-driven event
      // that preventDefault genuinely stops before any transition) and any
      // programmatic goBack. The iOS swipe is handled by disabling the
      // gesture above — it cannot be reliably intercepted on native-stack.
      // Programmatic navigations we trigger (finish → REPLACE) pass through.
      const t = e.data.action.type;
      if (t !== 'GO_BACK' && t !== 'POP' && t !== 'POP_TO_TOP') return;
      // If we've already decided to leave (user confirmed), let it through.
      if (leavingRef.current) return;
      // Only guard while the game is still live.
      const g = leagueRef.current?.games.find(x => x.id === gameId);
      if (!g || g.status !== 'live') return;

      e.preventDefault();
      Alert.alert(
        'Leave live tracking?',
        'The game stays saved — you can come back to it anytime from the league. Leave now?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => {
            leavingRef.current = true;
            navigation.dispatch(e.data.action);
          } },
        ],
      );
    });
    return unsub;
  }, [navigation, guardEnabled, gameId]);

  const celebratedRef = React.useRef<Set<string>>(new Set());
  const milestoneQueue = React.useRef<string[]>([]);
  const bannerBusy = React.useRef(false);
  // Drain the queue one banner at a time so two milestones landing together
  // (e.g. a bucket that's both a career high AND completes a double-double)
  // are each shown for their full moment instead of one clobbering the other.
  const showNextMilestone = React.useCallback(() => {
    if (bannerBusy.current) return;
    const next = milestoneQueue.current.shift();
    if (!next) return;
    bannerBusy.current = true;
    successFeedback();
    setMilestone(next);
    setTimeout(() => {
      setMilestone(null);
      bannerBusy.current = false;
      setTimeout(showNextMilestone, 350); // brief gap, then next if any
    }, 2200);
  }, []);

  useEffect(() => {
    if (!league || !game || game.status !== 'live') return;
    const enqueue = (key: string, text: string) => {
      if (celebratedRef.current.has(key)) return;
      celebratedRef.current.add(key);
      milestoneQueue.current.push(text);
      showNextMilestone();
    };
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      const box = teamBoxScore(league, gameId, teamId);
      for (const l of box.lines) {
        if (!l.playerId) continue;
        const nm = league.players.find(p => p.id === l.playerId)?.name ?? 'Player';

        // Scoring milestones — only at big round numbers, not every bucket.
        // Fires once as the player crosses each threshold this game.
        for (const threshold of [25, 50, 100]) {
          if (l.pts >= threshold) {
            enqueue(`pts${threshold}:${l.playerId}`, `🎉 ${nm} hits ${threshold} points!`);
          }
        }

        // Double-double: 10+ in any two of PTS / REB / AST / STL / BLK.
        // Keyed per-player-per-game so it fires once, the moment it completes.
        const cats: [string, number][] = [['PTS', l.pts], ['REB', l.reb], ['AST', l.ast], ['STL', l.stl], ['BLK', l.blk]];
        const doubles = cats.filter(([, v]) => v >= 10);
        if (doubles.length >= 2) {
          const label = doubles.length >= 3 ? 'Triple-double' : 'Double-double';
          enqueue(`dd:${l.playerId}`, `🔥 ${label} — ${nm}! ${doubles.slice(0, 3).map(([c, v]) => `${v} ${c}`).join(' · ')}`);
        }
      }
    }
  }, [state, gameId]); // eslint-disable-line

  const [waitedForGame, setWaitedForGame] = useState(false);
  useEffect(() => {
    if (game) return;
    const t = setTimeout(() => setWaitedForGame(true), 1500);
    return () => clearTimeout(t);
  }, [game]);
  if (!league || !game) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) }}>
          <Txt k="body" color={colors.muted}>{waitedForGame ? 'Game not found.' : 'Loading game…'}</Txt>
        </View>
      </Screen>
    );
  }

  // FIBA: foul out on the 5th personal foul (legacy leagues stored 6 — capped to 5).
  const foulLimit = effectiveFoulLimit(league);
  const homeTeam = league.teams.find(t => t.id === game.homeTeamId)!;
  const awayTeam = league.teams.find(t => t.id === game.awayTeamId)!;
  const activeTeam: Team = activeSide === 'home' ? homeTeam : awayTeam;
  const onCourtIds = (activeSide === 'home' ? game.homeOnCourt : game.awayOnCourt) ?? [];

  // Period is stored on the game so it survives leaving and returning to this screen.
  const period = game.period ?? 1;
  const setPeriod = (p: number) => dispatch({ t: 'SET_PERIOD', leagueId, gameId, period: p });

  const box = teamBoxScore(league, gameId, activeTeam.id);
  const lineFor = (pid: string) => box.lines.find(l => l.playerId === pid);

  const events = league.events.filter(e => e.gameId === gameId);
  const lastEvent = events[events.length - 1];

  const nameOf = (id: string | null) => id ? (league.players.find(p => p.id === id)?.name ?? 'Player') : activeTeam.name;
  const homeBoxNow = () => teamBoxScore(league, gameId, game.homeTeamId);
  const awayBoxNow = () => teamBoxScore(league, gameId, game.awayTeamId);

  const log = (playerId: string | null) => {
    if (!armed) return;
    const verb = LABELS[armed];
    const who = nameOf(playerId);

    // foul handling + foul-out (reducer also removes them from the court)
    if (armed === 'pf' && playerId) {
      const willHave = playerFouls(league, gameId, playerId) + 1;
      if (willHave >= foulLimit) {
        const nm = league.players.find(p => p.id === playerId)?.name ?? 'Player';
        Alert.alert('Fouled out', `${nm} reached ${foulLimit} fouls (FIBA) and was taken off the court. Tap Subs to bring someone in.`);
      }
    }
    dispatch({ t: 'ADD_EVENT', leagueId, gameId, teamId: activeTeam.id, playerId, type: armed, period });

    // Physical confirmation for the scorekeeper who isn't looking at the screen.
    tapFeedback();

    // ALWAYS clear the armed stat after logging, and show a brief confirmation.
    setArmed(null);
    setFlash(`✓ ${verb} — ${who}`);
  };

  // Timeout: logged against the active team, with the entered time remaining stored as note.
  const logTimeout = (timeRemaining: string) => {
    const tr = timeRemaining.trim();
    dispatch({ t: 'ADD_EVENT', leagueId, gameId, teamId: activeTeam.id, playerId: null, type: 'timeout', period, note: tr || undefined });
    tapFeedback();
    setTimeoutOpen(false);
    setArmed(null);
    setFlash(`✓ Timeout — ${activeTeam.name}${tr ? ` (${tr} left)` : ''}`);
  };

  const arm = (type: EventType | null) => { setFlash(null); setArmed(type); };

  const undo = () => { undoFeedback(); dispatch({ t: 'UNDO_EVENT', leagueId, gameId }); setFlash(null); setMilestone(null); };
  const redo = () => { tapFeedback(); dispatch({ t: 'REDO_EVENT', leagueId, gameId }); setFlash(null); };
  const canRedo = (league?._redo?.[gameId]?.length ?? 0) > 0;

  const nextPeriod = () => {
    if (period >= MAX_PERIOD) return;
    Alert.alert('Advance period?', `Move from period ${period} to ${period + 1}? Team fouls reset each period.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Go to ${period + 1}`, onPress: () => setPeriod(Math.min(MAX_PERIOD, period + 1)) },
    ]);
  };

  const prevPeriod = () => {
    if (period <= 1) return;
    Alert.alert('Go back a period?', `Move from period ${period} to ${period - 1}? Team fouls are tracked per period.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Go to ${period - 1}`, onPress: () => setPeriod(Math.max(1, period - 1)) },
    ]);
  };

  const finish = () => {
    Alert.alert('Finish game?', 'This locks the final score and updates standings. You can still edit the box score after.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Finish', style: 'destructive', onPress: () => {
        successFeedback();
        leavingRef.current = true; // this navigation is intentional
        dispatch({ t: 'SET_GAME_STATUS', leagueId, gameId, status: 'final' });
        // Land on the celebratory FINAL screen; it leads to the box score.
        navigation.replace('FinalScore', { leagueId, gameId });
      } },
    ]);
  };

  const needsLineup = !activeTeam.teamOnly && activeTeam.playerIds.length > 0 && onCourtIds.length === 0;

  // scoreboard sides honoring "change court"
  const leftSide: 'home' | 'away' = swapped ? 'away' : 'home';
  const rightSide: 'home' | 'away' = swapped ? 'home' : 'away';
  const sideTeam = (s: 'home' | 'away') => (s === 'home' ? homeTeam : awayTeam);
  const sideScore = (s: 'home' | 'away') => (s === 'home' ? score.home : score.away);

  const statusText = armed
    ? `${LABELS[armed]} — tap a ${activeTeam.name} player`
    : flash
      ? flash
      : (lastEvent ? `Last: ${LABELS[lastEvent.type]} — ${nameOf(lastEvent.playerId)}` : 'Pick a stat, then tap a player');
  const statusColor = armed ? colors.text : flash ? colors.green : colors.muted;

  return (
    <Screen>
      {/* 🎉 Milestone banner — celebratory, auto-dismisses. Shown in both the
          scorekeeper tracker and the spectator view (same component). */}
      {milestone && (
        <View style={{ position: 'absolute', top: space(2), left: space(4), right: space(4), zIndex: 50,
          backgroundColor: colors.brandLime, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }}>
          <Txt k="body" color={colors.bg} style={{ fontFamily: font.bodyBold, fontSize: 15, textAlign: 'center' }}>{milestone}</Txt>
        </View>
      )}
      <View style={{ flex: 1, paddingHorizontal: space(3), paddingTop: space(1) }}>
        {/* Top row: Exit sits here, away from the stat controls, so it's never
            confused with a logging action. Scorekeepers only. */}
        {!readOnly && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: space(1) }}>
            <Pressable onPress={confirmExit}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.red, backgroundColor: 'rgba(255,90,90,0.12)' }}>
              <Txt k="body" color={colors.red} style={{ fontSize: 13 }}>✕  Exit</Txt>
            </Pressable>
          </View>
        )}

        {/* Compact scoreboard */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SideScore
            team={sideTeam(leftSide)} score={sideScore(leftSide)} active={activeSide === leftSide}
            teamFouls={teamPeriodFouls(league, gameId, sideTeam(leftSide).id, period)}
            timeouts={teamPeriodTimeouts(league, gameId, sideTeam(leftSide).id, period)}
            onPress={() => setActiveSide(leftSide)} />
          <View style={{ alignItems: 'center', paddingHorizontal: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <LivePip size={5} />
              <Txt k="label" color={colors.brandLime} style={{ fontSize: 9, letterSpacing: 1 }}>LIVE</Txt>
            </View>
            <Txt k="label" style={{ fontSize: 10, marginTop: 1 }}>Period</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 0 }}>
              {readOnly ? (
                <Txt k="statBig">{period}</Txt>
              ) : (
                <>
                  <Pressable onPress={prevPeriod} hitSlop={12}><Txt k="h1" color={period <= 1 ? colors.line : colors.accent}>−</Txt></Pressable>
                  <Txt k="statBig">{period}</Txt>
                  <Pressable onPress={nextPeriod} hitSlop={12}><Txt k="h1" color={period >= MAX_PERIOD ? colors.line : colors.accent}>+</Txt></Pressable>
                </>
              )}
            </View>
          </View>
          <SideScore
            team={sideTeam(rightSide)} score={sideScore(rightSide)} active={activeSide === rightSide} right
            teamFouls={teamPeriodFouls(league, gameId, sideTeam(rightSide).id, period)}
            timeouts={teamPeriodTimeouts(league, gameId, sideTeam(rightSide).id, period)}
            onPress={() => setActiveSide(rightSide)} />
        </View>

        {/* Controls row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space(2), gap: 6 }}>
          {!readOnly && <MiniBtn label="⇄ Court" onPress={() => setSwapped(s => !s)} />}
          <MiniBtn label={readOnly ? "📋 Play-by-play" : "📋 Log"} onPress={() => setLogOpen(true)} />
          {!readOnly && <MiniBtn label="⏱ Timeout" onPress={() => setTimeoutOpen(true)} />}
          {!readOnly && <MiniBtn label="↺ Undo" onPress={undo} disabled={!lastEvent} />}
          {!readOnly && <MiniBtn label="↻ Redo" onPress={redo} disabled={!canRedo} />}
          {!readOnly && !activeTeam.teamOnly && <MiniBtn label="🔁 Subs" onPress={() => setSubOpen(true)} />}
        </View>

        {/* Status / confirmation line */}
        <View style={{ marginTop: space(2), borderRadius: radius.md, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: flash ? colors.greenDim : colors.surface, borderWidth: 1, borderColor: armed ? activeTeam.color : flash ? colors.green : colors.line }}>
          <Txt k="body" color={readOnly ? colors.muted : statusColor} numberOfLines={1}>
            {readOnly ? '👁  Spectator only. Tap team to view on-court 5.' : statusText}
          </Txt>
        </View>

        {/* Roster: the 5 on court — fills available space, no scroll needed */}
        {!readOnly && <View style={{ flex: 1, marginTop: space(2) }}>
          <Txt k="label" style={{ marginBottom: 6 }}>{activeTeam.name} on court</Txt>
          {activeTeam.teamOnly ? (
            <PlayerChip name={`${activeTeam.name} (team total)`} color={activeTeam.color} grow onPress={() => log(null)} disabled={readOnly || !armed} />
          ) : needsLineup ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Txt k="body" color={colors.muted} style={{ marginBottom: 10 }}>
                {readOnly ? `No lineup set yet for ${activeTeam.name}.` : `No lineup set for ${activeTeam.name}.`}
              </Txt>
              {!readOnly && <Button title="Set starting 5" onPress={() => setSubOpen(true)} />}
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'space-between' }}>
              {onCourtIds.map(pid => {
                const p = league.players.find(x => x.id === pid);
                if (!p) return null;
                const l = lineFor(pid);
                return (
                  <PlayerChip
                    key={pid}
                    name={p.name}
                    number={p.number}
                    pts={l?.pts ?? 0}
                    fouls={l?.pf ?? 0} foulLimit={foulLimit}
                    color={activeTeam.color}
                    onPress={() => log(pid)}
                    disabled={readOnly || !armed}
                    grow
                  />
                );
              })}
              {!readOnly && onCourtIds.length < LINEUP_SIZE && (
                <Pressable onPress={() => setSubOpen(true)}
                  style={{ flex: 1, marginVertical: 3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt k="body" color={colors.muted}>+ Add player to court ({onCourtIds.length}/{LINEUP_SIZE})</Txt>
                </Pressable>
              )}
            </View>
          )}
        </View>}

        {/* Color-coded stat pad — admins only. Spectators get the fan dashboard. */}
        {readOnly ? (
          <>
            {activePromos.length > 0 ? (
              <View style={{ marginTop: space(2) }}>
                <PromoStrip promo={activePromos[0]} onPress={onPromoTap} />
              </View>
            ) : null}
            <SpectatorPanel league={league} game={game} activeTeam={activeTeam} onCourtIds={onCourtIds} />
          </>
        ) : (
          <View style={{ paddingBottom: space(2), marginTop: space(2) }}>
            {PAD.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {row.map(btn => {
                  const on = armed === btn.type;
                  return (
                    <Pressable key={btn.type} onPress={() => arm(on ? null : btn.type)}
                      style={{
                        flex: 1, backgroundColor: on ? btn.color : colors.surface, borderRadius: radius.md,
                        borderWidth: 1.5, borderColor: btn.color, paddingVertical: 14, alignItems: 'center',
                      }}>
                      <Txt k="stat" color={on ? statColors.onText : btn.color}>{btn.label}</Txt>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Button title="FINISH GAME" onPress={finish} />
          </View>
        )}
      </View>

      {/* Substitution modal */}
      {subOpen && (
        <SubModal
          team={activeTeam}
          players={league.players}
          onCourtIds={onCourtIds}
          foulLimit={foulLimit}
          fouledOut={fouledOutSet(league, gameId, activeTeam.id)}
          foulsOf={pid => playerFouls(league, gameId, pid)}
          onClose={() => setSubOpen(false)}
          onSetLineup={(ids) => { dispatch({ t: 'SET_LINEUP', leagueId, gameId, side: activeSide, playerIds: ids }); setSubOpen(false); }}
          onSub={(outId, inId) => dispatch({ t: 'SUBSTITUTE', leagueId, gameId, side: activeSide, outId, inId })}
        />
      )}

      {/* Play-by-play modal */}
      {logOpen && (
        <PlayByPlayModal
          events={events.slice().reverse()}
          nameOf={(id) => id ? (league.players.find(p => p.id === id)?.name ?? 'Player') : 'Team'}
          teamNameOf={(teamId) => league.teams.find(t => t.id === teamId)?.name ?? 'Team'}
          canDelete={!readOnly}
          onDelete={(eid) => dispatch({ t: 'DELETE_EVENT', leagueId, eventId: eid })}
          onClose={() => setLogOpen(false)}
        />
      )}

      {/* Timeout modal */}
      {timeoutOpen && (
        <TimeoutModal
          teamName={activeTeam.name}
          period={period}
          onCancel={() => setTimeoutOpen(false)}
          onSubmit={logTimeout}
        />
      )}
    </Screen>
  );
}

function TimeoutModal({ teamName, period, onCancel, onSubmit }:
  { teamName: string; period: number; onCancel: () => void; onSubmit: (timeRemaining: string) => void }) {
  const [time, setTime] = useState('');
  // light auto-format: turn "428" into "4:28" as a convenience, leave anything else as typed
  const pretty = (s: string) => {
    const digits = s.replace(/[^0-9]/g, '');
    if (s.includes(':')) return s;
    if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`;
    if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
    return s;
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(6) }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space(5) }}>
          <Txt k="h2">Timeout — {teamName}</Txt>
          <Txt k="body" color={colors.muted} style={{ marginTop: 4, marginBottom: space(3) }}>Period {period}. Enter the time remaining on the clock (e.g. 4:28).</Txt>
          <TextInput
            value={time} onChangeText={setTime} placeholder="m:ss   (e.g. 4:28)" placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation" autoFocus
            onSubmitEditing={() => onSubmit(pretty(time))}
            style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.body, fontSize: 18, textAlign: 'center' }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: space(4) }}>
            <Button title="Cancel" kind="ghost" onPress={onCancel} style={{ flex: 1 }} />
            <Button title="Log timeout" onPress={() => onSubmit(pretty(time))} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MiniBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={{ flex: 1, opacity: disabled ? 0.35 : 1, paddingVertical: 7, paddingHorizontal: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Txt k="body"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
        style={{ fontSize: 13 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function SideScore({ team, score, active, onPress, right, teamFouls, timeouts }:
  { team: Team; score: number; active: boolean; onPress: () => void; right?: boolean; teamFouls: number; timeouts: number }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: right ? 'flex-end' : 'flex-start' }}>
      <Txt k="label" color={colors.muted} style={{ fontSize: 10 }}>Team Fouls: {teamFouls}</Txt>
      <Txt k="label" color={colors.muted} style={{ fontSize: 10 }}>Timeout used: {timeouts}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        {!right && <TeamBadge logo={team.logo} color={team.color} size={18} />}
        <Txt k="h2" numberOfLines={1} color={active ? colors.text : colors.muted}>{team.name}</Txt>
        {right && <TeamBadge logo={team.logo} color={team.color} size={18} />}
      </View>
      <Txt k="display" color={active ? colors.text : colors.muted} style={{ fontSize: 52 }}>{score}</Txt>
      {active ? <View style={{ height: 3, width: 40, backgroundColor: team.color, borderRadius: 2 }} /> : <View style={{ height: 3 }} />}
    </Pressable>
  );
}

function PlayerChip({ name, number, pts, color, onPress, disabled, grow, fouls, foulLimit }:
  { name: string; number?: string; pts?: number; color: string; onPress: () => void; disabled?: boolean; grow?: boolean; fouls?: number; foulLimit?: number }) {
  const danger = fouls !== undefined && foulLimit !== undefined && fouls >= foulLimit - 1;
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        flex: grow ? 1 : undefined, marginVertical: 3,
        backgroundColor: colors.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: disabled ? colors.line : color, paddingHorizontal: 12,
        opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
        flexDirection: 'row', alignItems: 'center', gap: 8,
      })}>
      <View style={{ width: 4, alignSelf: 'stretch', marginVertical: 10, borderRadius: 2, backgroundColor: color }} />
      {/* jersey number */}
      {number ? <Txt k="stat" color={colors.muted} allowFontScaling={false} style={{ width: 30, fontSize: 14 }}>#{number}</Txt> : null}
      {/* name — flexes and auto-shrinks to fit one line so it never clips */}
      <Txt
        k="h2"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
        style={{ flex: 1, fontSize: 17 }}>
        {name}
      </Txt>
      {/* right-aligned stat block: fixed-ish width so the name always has predictable room */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
        {pts !== undefined && (
          <>
            <Txt k="stat" allowFontScaling={false} style={{ fontSize: 17 }}>{pts}</Txt>
            <Txt k="body" color={colors.muted} allowFontScaling={false} style={{ fontSize: 10 }}>PTS</Txt>
          </>
        )}
        {fouls !== undefined && (
          <Txt k="body" color={danger ? colors.red : colors.muted} allowFontScaling={false} style={{ fontSize: 11, marginLeft: 6 }}>{fouls} PF</Txt>
        )}
      </View>
    </Pressable>
  );
}

function SubModal({ team, players, onCourtIds, foulLimit, fouledOut, foulsOf, onClose, onSetLineup, onSub }:
  {
    team: Team; players: Player[]; onCourtIds: string[]; foulLimit: number;
    fouledOut: Set<string>; foulsOf: (pid: string) => number;
    onClose: () => void; onSetLineup: (ids: string[]) => void; onSub: (outId: string, inId: string) => void;
  }) {
  const [mode, setMode] = useState(onCourtIds.length === 0 ? 1 : 0); // 0 = sub one, 1 = set 5
  const [selected, setSelected] = useState<string[]>(onCourtIds);
  const [outId, setOutId] = useState<string | null>(null);

  const roster = team.playerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const eligibleCount = roster.filter(p => !fouledOut.has(p.id)).length;
  const target = Math.min(LINEUP_SIZE, eligibleCount);
  const lineupFull = onCourtIds.length >= LINEUP_SIZE;

  const toggle = (pid: string) => {
    if (fouledOut.has(pid)) return;
    setSelected(s => s.includes(pid) ? s.filter(x => x !== pid) : (s.length >= LINEUP_SIZE ? s : [...s, pid]));
  };

  const bench = roster.filter(p => !onCourtIds.includes(p.id));
  const label = (p: Player) => `${p.number ? `#${p.number} ` : ''}${p.name}`;

  // "comes in" is allowed when the court has an empty slot (no OUT needed) OR an OUT is selected.
  const canBringIn = !lineupFull || !!outId;

  const bringIn = (inId: string) => {
    // If a slot is open, pass an outId that isn't on court so the reducer just adds them.
    onSub(outId ?? '__none__', inId);
    setOutId(null);
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000B', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space(4), maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(3) }}>
            <Txt k="h2">{team.name} — Substitutions</Txt>
            <Pressable onPress={onClose} hitSlop={10}><Txt k="h2" color={colors.muted}>✕</Txt></Pressable>
          </View>

          <Segmented options={['Sub one', 'Set 5']} value={mode} onChange={setMode} />
          <View style={{ height: space(3) }} />

          {mode === 0 ? (
            <ScrollView style={{ maxHeight: 420 }}>
              <Txt k="label" style={{ marginBottom: 6 }}>
                {lineupFull ? '1. Tap who comes OUT' : `On court (${onCourtIds.length}/${LINEUP_SIZE}) — tap to take OUT`}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space(3) }}>
                {onCourtIds.length === 0 && <Txt k="body" color={colors.muted}>No one is on the court yet — pick from below.</Txt>}
                {onCourtIds.map(pid => {
                  const p = players.find(x => x.id === pid);
                  if (!p) return null;
                  const sel = outId === pid;
                  const pf = foulsOf(pid);
                  const danger = pf >= foulLimit - 1; // one away from fouling out
                  return (
                    <Pressable key={pid} onPress={() => setOutId(sel ? null : pid)}
                      style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: sel ? colors.red : colors.line, backgroundColor: sel ? colors.red : colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt k="body" color={sel ? '#FFFFFF' : colors.text}>{label(p)}</Txt>
                      <Txt k="body" color={sel ? '#FFFFFF' : (danger ? colors.red : colors.muted)} style={{ fontSize: 12 }}>· {pf} PF</Txt>
                    </Pressable>
                  );
                })}
              </View>

              <Txt k="label" style={{ marginBottom: 6 }}>
                {lineupFull
                  ? (outId ? '2. Tap who comes IN' : '2. Select someone to take out first — or open a slot')
                  : '2. Tap who comes IN'}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {bench.length === 0 && <Txt k="body" color={colors.muted}>No bench players available.</Txt>}
                {bench.map(p => {
                  const out = fouledOut.has(p.id);
                  const disabled = out || !canBringIn;
                  const pf = foulsOf(p.id);
                  const danger = !out && pf >= foulLimit - 1;
                  return (
                    <Pressable key={p.id} disabled={disabled}
                      onPress={() => bringIn(p.id)}
                      style={{ opacity: out ? 0.4 : (disabled ? 0.55 : 1), paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: out ? colors.line : colors.green, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt k="body" color={out ? colors.muted : colors.text}>{label(p)}</Txt>
                      <Txt k="body" color={out ? colors.muted : (danger ? colors.red : colors.muted)} style={{ fontSize: 12 }}>
                        · {out ? 'fouled out' : `${pf} PF`}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <>
              <Txt k="label" style={{ marginBottom: 6 }}>Pick your {target} on court ({selected.filter(id => !fouledOut.has(id)).length}/{target})</Txt>
              <ScrollView style={{ maxHeight: 380 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {roster.map(p => {
                    const out = fouledOut.has(p.id);
                    const sel = selected.includes(p.id) && !out;
                    return (
                      <Pressable key={p.id} disabled={out} onPress={() => toggle(p.id)}
                        style={{ opacity: out ? 0.4 : 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: sel ? team.color : colors.line, backgroundColor: sel ? team.color : colors.surface }}>
                        <Txt k="body" color={sel ? '#FFFFFF' : colors.text}>{label(p)}{out ? ' · fouled out' : ` · ${foulsOf(p.id)} PF`}</Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={{ height: space(3) }} />
              <Button
                title={`Confirm lineup (${selected.filter(id => !fouledOut.has(id)).length})`}
                onPress={() => onSetLineup(selected.filter(id => !fouledOut.has(id)))}
                disabled={selected.filter(id => !fouledOut.has(id)).length === 0}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PlayByPlayModal({ events, nameOf, teamNameOf, canDelete, onDelete, onClose }:
  { events: { id: string; period: number; type: EventType; playerId: string | null; teamId: string; note?: string }[]; nameOf: (id: string | null) => string; teamNameOf: (teamId: string) => string; canDelete: boolean; onDelete: (id: string) => void; onClose: () => void }) {
  const lineFor = (e: { type: EventType; playerId: string | null; teamId: string; note?: string }) => {
    if (e.type === 'timeout') {
      const team = teamNameOf(e.teamId);
      return e.note ? `${team} Timeout — ${e.note} remaining` : `${team} Timeout`;
    }
    return `${nameOf(e.playerId)} — ${PBP_LABEL[e.type]}`;
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000B', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space(4), maxHeight: '80%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(3) }}>
            <Txt k="h2">Play-by-play</Txt>
            <Pressable onPress={onClose} hitSlop={10}><Txt k="h2" color={colors.muted}>✕</Txt></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }}>
            {events.length === 0 ? <Txt k="body" color={colors.muted}>No events logged yet.</Txt> :
              events.map((e, i) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                  <Txt k="stat" color={colors.muted} style={{ width: 28 }}>{e.period}</Txt>
                  <Txt k="body" style={{ flex: 1 }} color={e.type === 'timeout' ? colors.yellow : colors.text}>{lineFor(e)}</Txt>
                  {canDelete && <Pressable onPress={() => onDelete(e.id)} hitSlop={8}><Txt k="body" color={colors.red}>✕</Txt></Pressable>}
                </View>
              ))
            }
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// SPECTATOR DASHBOARD — the public live-game view for parents, friends, fans.
// Quarter scores, leading scorers, top rebounders, and a running MVP, all
// recomputed on every event so remote viewers follow the story, not just the
// score. Scores update automatically via realtime sync.
// ---------------------------------------------------------------------------
function SpectatorPanel({ league, game, activeTeam, onCourtIds }: {
  league: NonNullable<ReturnType<typeof useLeague>>;
  game: NonNullable<ReturnType<typeof useLeague>>['games'][number];
  activeTeam: { id: string; name: string; color: string; teamOnly?: boolean };
  onCourtIds: string[];
}) {
  const home = league.teams.find(t => t.id === game.homeTeamId);
  const away = league.teams.find(t => t.id === game.awayTeamId);
  const homeBox = teamBoxScore(league, game.id, game.homeTeamId);
  const awayBox = teamBoxScore(league, game.id, game.awayTeamId);
  const ls = lineScore(league, game);
  const nameOf = (pid: string | null) => league.players.find(p => p.id === pid)?.name ?? 'Team';

  const scorers = (box: { lines: typeof homeBox.lines }) =>
    box.lines.filter(l => l.playerId && l.pts > 0).slice(0, 3);
  const topReb = (box: { lines: typeof homeBox.lines }) =>
    [...box.lines].filter(l => l.playerId).sort((a, b) => b.reb - a.reb)[0];

  // Player of the Game so far: best composite line, drawn from the CURRENTLY
  // WINNING team (basketball convention — the POTG comes from the winning
  // side). If the score is tied, consider both teams. Falls back to overall
  // best if the leading team has no positive contributor yet.
  const potg = (() => {
    const homePts = homeBox.total.pts;
    const awayPts = awayBox.total.pts;
    const homeCand = homeBox.lines.map(l => ({ l, team: home }));
    const awayCand = awayBox.lines.map(l => ({ l, team: away }));
    let pool = homePts === awayPts
      ? [...homeCand, ...awayCand]
      : (homePts > awayPts ? homeCand : awayCand);
    pool = pool.filter(x => x.l.playerId && perfRating(x.l) > 0);
    if (pool.length === 0) {
      // leading team hasn't recorded a positive line — fall back to all players
      pool = [...homeCand, ...awayCand].filter(x => x.l.playerId && perfRating(x.l) > 0);
    }
    if (pool.length === 0) return null;
    return pool.sort((a, b) => perfRating(b.l) - perfRating(a.l))[0];
  })();

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 12, marginTop: space(2) }}>
      <Txt k="label" style={{ marginBottom: 8 }}>{title}</Txt>
      {children}
    </View>
  );
  const Row = ({ left, right, color }: { left: string; right: string; color?: string }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Txt k="body" numberOfLines={1} style={{ flex: 1, fontSize: 14 }} color={color}>{left}</Txt>
      <Txt k="stat" style={{ fontSize: 14 }} color={color ?? colors.text}>{right}</Txt>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, marginTop: space(2) }} contentContainerStyle={{ paddingBottom: space(4) }} showsVerticalScrollIndicator={false}>
      {potg && potg.team && (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTeal, backgroundColor: colors.accentDim, padding: 12 }}>
          <Txt k="label" color={colors.brandTeal} style={{ marginBottom: 4 }}>🏅 Player of the Game so far</Txt>
          <Txt k="h2">{nameOf(potg.l.playerId)} <Txt k="body" color={colors.muted}>· {potg.team.name}</Txt></Txt>
          <Txt k="body" color={colors.muted} style={{ fontSize: 13 }}>
            {potg.l.pts} PTS · {potg.l.reb} REB · {potg.l.ast} AST{potg.l.stl ? ` · ${potg.l.stl} STL` : ''}{potg.l.blk ? ` · ${potg.l.blk} BLK` : ''}
          </Txt>
        </View>
      )}

      <Section title="Quarter scores">
        <View style={{ flexDirection: 'row' }}>
          <Txt k="label" style={{ flex: 1 }}> </Txt>
          {ls.periods.map(pn => <Txt k="label" key={pn} style={{ width: 34, textAlign: 'center' }}>{pn <= 4 ? `Q${pn}` : `OT${pn - 4}`}</Txt>)}
          <Txt k="label" style={{ width: 40, textAlign: 'center' }}>T</Txt>
        </View>
        {([['home', home, ls.home, homeBox.total.pts], ['away', away, ls.away, awayBox.total.pts]] as const).map(([key, team, arr, tot]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TeamBadge logo={team?.logo} color={team?.color ?? colors.muted} size={12} />
              <Txt k="body" numberOfLines={1} style={{ fontSize: 13, flex: 1 }}>{team?.name}</Txt>
            </View>
            {arr.map((v, i) => <Txt k="stat" key={i} style={{ width: 34, textAlign: 'center', fontSize: 14 }}>{v}</Txt>)}
            <Txt k="stat" color={colors.accent} style={{ width: 40, textAlign: 'center' }}>{tot}</Txt>
          </View>
        ))}
      </Section>

      {([{ team: home, box: homeBox }, { team: away, box: awayBox }] as const).map(({ team, box }) => team && (
        <Section key={team.id} title={`${team.name} — leading scorers`}>
          {scorers(box).length === 0
            ? <Txt k="body" color={colors.muted} style={{ fontSize: 13 }}>No points yet.</Txt>
            : scorers(box).map(l => <Row key={l.playerId} left={nameOf(l.playerId)} right={`${l.pts} PTS`} />)}
          {topReb(box) && topReb(box)!.reb > 0 ? (
            <Row left={`Top rebounder: ${nameOf(topReb(box)!.playerId)}`} right={`${topReb(box)!.reb} REB`} color={colors.muted} />
          ) : null}
        </Section>
      ))}

      <Section title={`${activeTeam.name} on court`}>
        {activeTeam.teamOnly ? (
          <Txt k="body" color={colors.muted} style={{ fontSize: 13 }}>Tracked as a team total (no individual players).</Txt>
        ) : onCourtIds.length === 0 ? (
          <Txt k="body" color={colors.muted} style={{ fontSize: 13 }}>No lineup set yet.</Txt>
        ) : onCourtIds.map(pid => {
          const pl = league.players.find(x => x.id === pid);
          const l = [...homeBox.lines, ...awayBox.lines].find(x => x.playerId === pid);
          return pl ? <Row key={pid} left={`${pl.number ? `#${pl.number} ` : ''}${pl.name}`} right={`${l?.pts ?? 0} PTS`} /> : null;
        })}
      </Section>
    </ScrollView>
  );
}
