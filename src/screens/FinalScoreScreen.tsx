import React, { useEffect, useState } from 'react';
import { View, Animated, Easing } from 'react-native';
import { Screen, Txt, Button, TeamBadge, PromoStrip } from '../components/ui';
import { useLeague } from '../store/StoreProvider';
import { colors, space, radius, font } from '../theme';
import { ScreenProps } from '../navigation';
import { gameScore, teamBoxScore, perfRating } from '../lib/stats';
import { usePromos, onPromoTap } from '../lib/usePromos';

// The emotional payoff at the buzzer. A brief, celebratory FINAL card —
// winner, score, and Player of the Game — before the user continues to the
// detailed box score. This is the moment players screenshot.
export default function FinalScoreScreen({ route, navigation }: ScreenProps<'FinalScore'>) {
  const { leagueId, gameId } = route.params;
  const league = useLeague(leagueId);
  const game = league?.games.find(g => g.id === gameId);
  const { activePromos } = usePromos();
  // Pick one promo once (stable across the animation's re-renders).
  const promoPick = React.useMemo(
    () => activePromos.length ? activePromos[Math.floor(Math.random() * activePromos.length)] : null,
    [activePromos.length],
  );

  const fade = useState(new Animated.Value(0))[0];
  const pop = useState(new Animated.Value(0.9))[0];
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [fade, pop]);

  if (!league || !game) return <Screen><Txt k="body">Game not found.</Txt></Screen>;

  const home = league.teams.find(t => t.id === game.homeTeamId);
  const away = league.teams.find(t => t.id === game.awayTeamId);
  const sc = gameScore(league, game);
  const homeWon = sc.home >= sc.away;
  const winner = homeWon ? home : away;
  const winnerScore = homeWon ? sc.home : sc.away;
  const loserScore = homeWon ? sc.away : sc.home;
  const tie = sc.home === sc.away;

  // Player of the Game: best composite line on the winning team.
  const potg = (() => {
    const box = teamBoxScore(league, gameId, winner?.id ?? '');
    const pool = box.lines.filter(l => l.playerId && perfRating(l) > 0);
    if (pool.length === 0) return null;
    const best = pool.sort((a, b) => perfRating(b) - perfRating(a))[0];
    const p = league.players.find(x => x.id === best.playerId);
    return p ? { name: p.name, line: best } : null;
  })();

  return (
    <Screen>
      <Animated.View style={{ flex: 1, opacity: fade, justifyContent: 'center', paddingHorizontal: space(5) }}>
        <Animated.View style={{ transform: [{ scale: pop }], alignItems: 'center' }}>
          <Txt k="label" color={colors.brandLime} style={{ letterSpacing: 3, fontSize: 13 }}>FINAL</Txt>

          {/* Score line */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: space(4) }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <TeamBadge logo={home?.logo} color={home?.color ?? colors.muted} size={44} />
              <Txt k="body" numberOfLines={1} style={{ marginTop: 6, textAlign: 'center' }}>{home?.name}</Txt>
              <Txt color={homeWon && !tie ? colors.brandLime : colors.text} style={{ fontFamily: font.display, fontSize: 52, lineHeight: 60, includeFontPadding: false } as any}>{sc.home}</Txt>
            </View>
            <Txt k="h2" color={colors.muted}>—</Txt>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <TeamBadge logo={away?.logo} color={away?.color ?? colors.muted} size={44} />
              <Txt k="body" numberOfLines={1} style={{ marginTop: 6, textAlign: 'center' }}>{away?.name}</Txt>
              <Txt color={!homeWon && !tie ? colors.brandLime : colors.text} style={{ fontFamily: font.display, fontSize: 52, lineHeight: 60, includeFontPadding: false } as any}>{sc.away}</Txt>
            </View>
          </View>

          {/* Winner line */}
          {!tie && winner ? (
            <Txt k="h2" style={{ marginTop: space(4), textAlign: 'center' }}>
              🏆 {winner.name} win{winnerScore - loserScore > 0 ? ` by ${winnerScore - loserScore}` : ''}
            </Txt>
          ) : (
            <Txt k="h2" style={{ marginTop: space(4) }}>It's a tie!</Txt>
          )}

          {/* Player of the Game */}
          {potg && (
            <View style={{ marginTop: space(4), alignSelf: 'stretch', backgroundColor: colors.accentDim, borderColor: colors.brandTeal, borderWidth: 1, borderRadius: radius.md, padding: 14, alignItems: 'center' }}>
              <Txt k="label" color={colors.brandTeal}>🏅 PLAYER OF THE GAME</Txt>
              <Txt k="h2" style={{ marginTop: 4 }}>{potg.name}</Txt>
              <Txt k="body" color={colors.muted} style={{ fontSize: 13, marginTop: 2 }}>
                {potg.line.pts} PTS · {potg.line.reb} REB · {potg.line.ast} AST{potg.line.stl ? ` · ${potg.line.stl} STL` : ''}{potg.line.blk ? ` · ${potg.line.blk} BLK` : ''}
              </Txt>
            </View>
          )}
        </Animated.View>
      </Animated.View>

      <View style={{ paddingHorizontal: space(4), paddingBottom: space(6), gap: 10 }}>
        {promoPick ? (
          <View style={{ marginBottom: space(2) }}>
            <PromoStrip promo={promoPick!} onPress={onPromoTap} />
          </View>
        ) : null}
        <Button title="View box score" onPress={() => navigation.replace('BoxScore', { leagueId, gameId })} />
      </View>
    </Screen>
  );
}
