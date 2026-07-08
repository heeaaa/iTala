import React, { useRef } from 'react';
import { View, ScrollView, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Screen, Txt, Button, TeamBadge, SponsorMark } from '../components/ui';
import { useLeague } from '../store/StoreProvider';
import { colors, space, radius, font } from '../theme';
import { ScreenProps } from '../navigation';
import { leagueAwards, standings } from '../lib/stats';

// End-of-season celebration poster — Season MVP + Mythical Five as a single
// shareable graphic. The organizer's payoff and a marketing moment: it carries
// the league name and the sponsor mark, ready for the league Facebook page.
export default function SeasonRecapScreen({ route }: ScreenProps<'SeasonRecap'>) {
  const { leagueId } = route.params;
  const league = useLeague(leagueId);
  const cardRef = useRef<View>(null);

  if (!league) return <Screen><Txt k="body">League not found.</Txt></Screen>;

  const top5Teams = new Set(standings(league).slice(0, 5).map(r => r.team.id));
  const aw = leagueAwards(league, { restrictTeamIds: top5Teams });
  const champion = standings(league)[0]?.team;

  const share = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri); return; }
    } catch { /* view-shot unavailable in Expo Go — text fallback */ }
    const parts = [`${league.name} — Season Recap`];
    if (aw.seasonMVP) parts.push(`MVP: ${aw.seasonMVP.name} (${aw.seasonMVP.teamName})`);
    if (aw.mythicalFive.length) parts.push(`Mythical Five: ${aw.mythicalFive.map(w => w.name).join(', ')}`);
    parts.push('tracked with iTala 🏀');
    try { await Share.share({ message: parts.join('\n') }); } catch { /* cancelled */ }
  };

  const AwardLine = ({ icon, title, name, team, value }: { icon: string; title: string; name?: string; team?: string; value?: string }) =>
    name ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
        <Txt k="h2">{icon}</Txt>
        <View style={{ flex: 1 }}>
          <Txt k="label" color={colors.muted} style={{ fontSize: 9 }}>{title}</Txt>
          <Txt k="body">{name} <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>· {team}</Txt></Txt>
        </View>
        {value ? <Txt k="stat" color={colors.accent} style={{ fontSize: 13 }}>{value}</Txt> : null}
      </View>
    ) : null;

  return (
    <Screen scroll>
      {/* The capturable poster */}
      <View ref={cardRef} collapsable={false} style={{ backgroundColor: colors.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandTeal, paddingVertical: 28, paddingHorizontal: 4, overflow: 'hidden' }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
          <Txt k="label" color={colors.brandLime} style={{ letterSpacing: 3 }}>SEASON RECAP</Txt>
          <Txt k="h1" style={{ marginTop: 6, textAlign: 'center' }}>{league.name}</Txt>
          <Txt k="body" color={colors.muted}>{league.season}</Txt>

          {champion && (
            <View style={{ alignItems: 'center', marginTop: 20 }}>
              <Txt k="label" color={colors.muted} style={{ fontSize: 10 }}>🏆 CHAMPIONS</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <TeamBadge logo={champion.logo} color={champion.color} size={30} />
                <Txt k="h2">{champion.name}</Txt>
              </View>
            </View>
          )}
        </View>

        <View style={{ marginTop: 22, marginHorizontal: 24, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line }}>
          <AwardLine icon="👑" title="SEASON MVP" name={aw.seasonMVP?.name} team={aw.seasonMVP?.teamName} value={aw.seasonMVP?.value} />
          <AwardLine icon="🎯" title="SCORING CHAMPION" name={aw.scoringChampion?.name} team={aw.scoringChampion?.teamName} value={aw.scoringChampion?.value} />
          <AwardLine icon="🤝" title="ASSIST LEADER" name={aw.assistLeader?.name} team={aw.assistLeader?.teamName} value={aw.assistLeader?.value} />
          <AwardLine icon="🛡" title="BEST DEFENDER" name={aw.bestDefender?.name} team={aw.bestDefender?.teamName} value={aw.bestDefender?.value} />
        </View>

        {aw.mythicalFive.length >= 5 && (
          <View style={{ marginTop: 14, marginHorizontal: 24, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line }}>
            <Txt k="label" color={colors.brandTeal} style={{ marginBottom: 6 }}>⭐ MYTHICAL FIVE</Txt>
            {aw.mythicalFive.map((w, i) => (
              <View key={w.playerId} style={{ flexDirection: 'row', paddingVertical: 5, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <Txt k="body" style={{ flex: 1 }}>{w.name}</Txt>
                <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>{w.teamName}</Txt>
              </View>
            ))}
          </View>
        )}

        <View style={{ alignItems: 'center', marginTop: 22 }}>
          <SponsorMark />
        </View>
      </View>

      <Button title="Share season recap" onPress={() => { void share(); }} style={{ marginTop: space(4) }} />
      <View style={{ height: space(8) }} />
    </Screen>
  );
}
