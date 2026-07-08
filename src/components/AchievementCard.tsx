import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TeamBadge, MiniWordmark, SponsorMark } from './ui';
import { colors, font, wordmarkGradient } from '../theme';

// ============================================================================
// Reusable achievement-card system.
//
// A single visual template renders ANY achievement — game or season — from a
// declarative CardSpec. Adding a future achievement is just a new spec, no new
// layout code. Two output shapes:
//   • 'story' → 1080×1920 portrait (Instagram/FB Stories, Messenger)
//   • 'feed'  → 1080×1080 square   (Instagram/FB feed posts)
// Both render at 2× the on-screen size for crisp, high-resolution capture.
// ============================================================================

export type CardLayout = 'story' | 'feed';

export interface CardStat { label: string; value: string }

export interface CardSpec {
  // Achievement identity
  kicker: string;            // e.g. "PLAYER OF THE GAME", "SEASON MVP"
  badge?: string;            // optional emoji badge, e.g. "🏅", "🔥", "👑"
  // Subject
  playerName: string;
  subtitle?: string;         // team name · role, or "Free agent"
  teamLogo?: string;
  teamColor?: string;
  // Context line(s)
  leagueLine: string;        // "BPBL · SEASON 3"
  contextLine?: string;      // "Warriors 78–71 Bulls · Jun 9"
  // Stats grid (2–5 items; first is emphasized)
  stats: CardStat[];
  // Optional secondary MVP-style flag shown as a pill
  mvp?: boolean;
  // Accent controls the glow + primary stat color
  accent?: string;
}

// Base (on-screen) dimensions; captured at 2× via view-shot for hi-res output.
const DIMS: Record<CardLayout, { w: number; h: number }> = {
  story: { w: 540, h: 960 },
  feed: { w: 540, h: 540 },
};

export function cardPixelSize(layout: CardLayout) {
  const d = DIMS[layout];
  return { width: d.w, height: d.h };
}

export const AchievementCard = React.forwardRef<View, { spec: CardSpec; layout: CardLayout }>(
  function AchievementCard({ spec, layout }, ref) {
    const d = DIMS[layout];
    const accent = spec.accent ?? colors.brandTeal;
    const isStory = layout === 'story';
    const primary = spec.stats[0];
    const rest = spec.stats.slice(1);

    // Scale a few spacings between the taller story and compact feed layouts.
    // Feed (540×540) is vertically tight, so its hero and margins are smaller to
    // guarantee the content column clears the bottom-pinned footer.
    const padX = isStory ? 44 : 36;
    const nameSize = isStory ? 52 : 34;
    const primarySize = isStory ? 108 : 64;

    return (
      <View ref={ref} collapsable={false}
        style={{ width: d.w, height: d.h, backgroundColor: colors.bg, overflow: 'hidden' }}>

        {/* Accent glow from the top */}
        <LinearGradient
          colors={[withAlpha(accent, 0.22), withAlpha(accent, 0)]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: isStory ? 520 : 320 }}
        />
        {/* Brand stripe down the left edge */}
        <LinearGradient
          colors={wordmarkGradient}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 }}
        />
        {/* Faint diagonal sheen (premium sports-graphic feel) */}
        <LinearGradient
          colors={[withAlpha('#FFFFFF', 0.05), withAlpha('#FFFFFF', 0)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: d.h }}
        />

        {/* HEADER */}
        <View style={{ paddingHorizontal: padX, paddingTop: isStory ? 40 : 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <MiniWordmark size={isStory ? 34 : 28} />
          {spec.mvp ? (
            <View style={{ backgroundColor: colors.brandLime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={{ fontFamily: font.display, fontSize: 13, lineHeight: 18, color: colors.bg, letterSpacing: 1, includeFontPadding: true } as any}>MVP</Text>
            </View>
          ) : null}
        </View>

        {/* KICKER + BADGE */}
        <View style={{ paddingHorizontal: padX, marginTop: isStory ? 40 : 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {spec.badge ? <Text style={{ fontSize: isStory ? 40 : 30 }}>{spec.badge}</Text> : null}
            <Text style={{ fontFamily: font.display, fontSize: isStory ? 24 : 18, lineHeight: isStory ? 32 : 24, color: accent, letterSpacing: 2, includeFontPadding: true } as any}>
              {spec.kicker.toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontFamily: font.body, fontSize: isStory ? 13 : 11, color: colors.muted, marginTop: 6, letterSpacing: 1 }}>
            {spec.leagueLine.toUpperCase()}
          </Text>
        </View>

        {/* PLAYER */}
        <View style={{ paddingHorizontal: padX, marginTop: isStory ? 34 : 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {spec.teamLogo || spec.teamColor ? (
              <TeamBadge logo={spec.teamLogo} color={spec.teamColor ?? colors.muted} size={isStory ? 40 : 32} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontFamily: font.display, fontSize: nameSize, lineHeight: nameSize * 1.32, color: colors.text, includeFontPadding: true, paddingTop: nameSize * 0.08 } as any}>
                {spec.playerName}
              </Text>
              {spec.subtitle ? (
                <Text style={{ fontFamily: font.body, fontSize: isStory ? 15 : 13, color: colors.muted, marginTop: 4 }}>
                  {spec.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* PRIMARY STAT — hero number */}
        {primary ? (
          <View style={{ paddingHorizontal: padX, marginTop: isStory ? 40 : 14 }}>
            <Text style={{ fontFamily: font.display, fontSize: primarySize, lineHeight: primarySize * 1.28, color: accent, includeFontPadding: true, paddingTop: primarySize * 0.06 } as any}>
              {primary.value}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: isStory ? 16 : 13, color: colors.muted, letterSpacing: 2, marginTop: -6 }}>
              {primary.label.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {/* SECONDARY STATS ROW — skip zero-value chips to avoid clutter */}
        {rest.filter(s => s.value !== '0').length > 0 ? (
          <View style={{ flexDirection: 'row', paddingHorizontal: padX, marginTop: isStory ? 34 : 14, gap: 10, flexWrap: 'wrap' }}>
            {rest.filter(s => s.value !== '0').map((s, i) => (
              <View key={i} style={{ flex: 1, minWidth: 72, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingVertical: isStory ? 16 : 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: font.display, fontSize: isStory ? 34 : 26, lineHeight: isStory ? 46 : 36, color: colors.text, includeFontPadding: true } as any}>{s.value}</Text>
                <Text style={{ fontFamily: font.body, fontSize: isStory ? 12 : 10, color: colors.muted, letterSpacing: 1, marginTop: 2 }}>{s.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* CONTEXT + FOOTER — pinned together at the bottom so they never
            collide with each other or with the stats above (the old bug was
            the context line flowing down into the absolute footer). */}
        <View style={{ position: 'absolute', left: padX, right: padX, bottom: isStory ? 36 : 22 }}>
          {spec.contextLine ? (
            <Text style={{ fontFamily: font.body, fontSize: isStory ? 14 : 11, color: colors.muted, marginBottom: isStory ? 18 : 12 }}>
              {spec.contextLine}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <LinearGradient
                colors={wordmarkGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 2, width: 64, borderRadius: 1, marginBottom: 8 }}
              />
              <Text style={{ fontFamily: font.body, fontSize: isStory ? 11 : 10, color: colors.muted, letterSpacing: 1.2 }}>
                RECORD · TRACK · ELEVATE
              </Text>
            </View>
            <SponsorMark />
          </View>
        </View>
      </View>
    );
  }
);

function withAlpha(hex: string, a: number): string {
  // hex "#RRGGBB" → "rgba(r,g,b,a)"
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
