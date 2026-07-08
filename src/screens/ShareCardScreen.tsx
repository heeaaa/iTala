import React, { useRef, useState } from 'react';
import { View, ScrollView, Share, Pressable } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Screen, Txt, Button, Segmented } from '../components/ui';
import { useLeague } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, radius } from '../theme';
import { ScreenProps } from '../navigation';
import { AchievementCard, CardLayout, CardSpec, cardPixelSize } from '../components/AchievementCard';
import { gameCardOptions, seasonCardOptions, seasonAveragesSpec } from '../lib/cardSpecs';

// One screen renders any achievement card. It resolves a list of card specs
// from the route params (game / season / averages), lets the user pick which
// achievement and which layout (Story portrait vs Feed square), previews it,
// and shares a high-resolution PNG.
export default function ShareCardScreen({ route, navigation }: ScreenProps<'ShareCard'>) {
  const { leagueId } = route.params;
  const league = useLeague(leagueId);
  const { role } = useAdmin();
  const cardRef = useRef<View>(null);
  const [layout, setLayout] = useState<CardLayout>('story');
  const [pick, setPick] = useState(0);

  if (!league) return <Screen><Txt k="body">Not found.</Txt></Screen>;

  // Resolve the available specs for this invocation.
  const specs: { label: string; spec: CardSpec }[] = (() => {
    if (route.params.kind === 'game') {
      return gameCardOptions(league, route.params.gameId, route.params.playerId)
        .map(o => ({ label: o.label, spec: o.build() }));
    }
    if (route.params.kind === 'season') {
      return seasonCardOptions(league).map(o => ({ label: o.label, spec: o.build() }));
    }
    // averages
    const s = seasonAveragesSpec(league, route.params.playerId);
    return s ? [{ label: 'Season Averages', spec: s }] : [];
  })();

  if (specs.length === 0) {
    return <Screen><View style={{ padding: space(6) }}><Txt k="body" color={colors.muted}>No shareable cards available yet.</Txt></View></Screen>;
  }

  const current = specs[Math.min(pick, specs.length - 1)];

  const share = async () => {
    try {
      // Capture at 2× the on-screen size for a crisp, high-resolution image.
      const { width, height } = cardPixelSize(layout);
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: width * 2, height: height * 2 });
      if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri); return; }
    } catch { /* view-shot unavailable (Expo Go) — text fallback */ }
    try {
      await Share.share({ message: `${current.spec.kicker}: ${current.spec.playerName} — ${current.spec.stats.map(s => `${s.value} ${s.label}`).join(', ')} (tracked with iTala 🏀)` });
    } catch { /* cancelled */ }
  };

  const px = cardPixelSize(layout);
  const previewScale = layout === 'story' ? 0.42 : 0.6;

  return (
    <Screen scroll>
      <View style={{ padding: space(4), gap: space(3) }}>
        {/* Layout toggle */}
        <Segmented
          options={['Story (portrait)', 'Feed (square)']}
          value={layout === 'story' ? 0 : 1}
          onChange={(i) => setLayout(i === 0 ? 'story' : 'feed')}
        />

        {/* Achievement picker (when more than one) */}
        {specs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {specs.map((s, i) => (
              <Pressable key={i} onPress={() => setPick(i)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1,
                  borderColor: i === pick ? colors.brandTeal : colors.line,
                  backgroundColor: i === pick ? colors.accentDim : colors.surface }}>
                <Txt k="body" color={i === pick ? colors.brandTeal : colors.muted} style={{ fontSize: 13 }}>{s.label}</Txt>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Live preview — the same component that gets captured, scaled down */}
        <View style={{ alignItems: 'center', paddingVertical: space(2) }}>
          <View style={{ width: px.width * previewScale, height: px.height * previewScale, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
            <View style={{ transform: [{ scale: previewScale }], transformOrigin: 'top left' } as any}>
              <AchievementCard spec={current.spec} layout={layout} />
            </View>
          </View>
        </View>

        <Button title="Share card" onPress={() => { void share(); }} />
        {role === 'guest' ? (
          <Txt k="body" color={colors.muted} style={{ fontSize: 12, textAlign: 'center' }}>
            Sharing works for everyone — no account needed.
          </Txt>
        ) : null}
      </View>

      {/* Off-screen full-resolution card that view-shot captures */}
      <View style={{ position: 'absolute', left: -9999, top: 0 }}>
        <AchievementCard ref={cardRef} spec={current.spec} layout={layout} />
      </View>
    </Screen>
  );
}
