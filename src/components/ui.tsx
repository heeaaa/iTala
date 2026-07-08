import React, { useRef, useState } from 'react';
import {
  View, Text, TextStyle, ViewStyle, Pressable, TextInput, ScrollView,
  StyleSheet, ScrollViewProps, Image, Animated, Modal, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, font, radius, space, brandGradient, wordmarkGradient } from '../theme';
import { Promo } from '../types';

// Team logo if present, else a colored dot. Used everywhere a team name appears.
export function TeamBadge({ logo, color, size = 12 }: { logo?: string; color: string; size?: number }) {
  if (logo) {
    return (
      <Image
        source={{ uri: logo }}
        style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors.surfaceHi }}
      />
    );
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

// Brand gradient applied to text (via mask-like overlay). Used for the wordmark.
export function GradientText({ children, size = 40, style }:
  { children: React.ReactNode; size?: number; style?: TextStyle }) {
  // Simple, reliable approach: gradient pill behind bold text isn't ideal;
  // instead we tint the wordmark with the brand blue and accent the dot elsewhere.
  return (
    <Text style={[{ fontFamily: font.display, fontSize: size, color: colors.brandTeal, letterSpacing: 0.5 }, style]}>{children}</Text>
  );
}

// The iTala wordmark: lowercase "i" dot in brand blue + "Tala" in white, with a gradient underline.
// A pulsing lime dot for "LIVE" indicators. Broadcast-style; very rare in UI
// because lime is the brand's "energy" color reserved for live signals.
export function LivePip({ size = 8 }: { size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.live, opacity,
    }} />
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  // Echoes the brand mark: lime "head" dot floating above an uppercase I (so it
  // doesn't conflict with the lowercase tittle), then "Tala" in white.
  const dotSize = Math.round(size * 0.22);
  const iWidth = Math.round(size * 0.30);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {/* The "i" lockup: lime ball above a teal vertical stroke, manually composed for crispness */}
        <View style={{ width: iWidth, alignItems: 'center', justifyContent: 'flex-end', marginRight: 2 }}>
          <View style={{
            width: dotSize, height: dotSize, borderRadius: dotSize,
            backgroundColor: colors.brandLime,
            marginBottom: Math.round(size * 0.06),
          }} />
          <View style={{
            width: Math.round(size * 0.16), height: Math.round(size * 0.62),
            borderRadius: 2, backgroundColor: colors.brandTeal,
          }} />
        </View>
        <Text style={{
          fontFamily: font.display, fontSize: size, color: colors.text,
          lineHeight: size * 1.25, letterSpacing: 0.5,
          includeFontPadding: false,
        } as any}>Tala</Text>
      </View>
      <LinearGradient
        colors={wordmarkGradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 3, borderRadius: 2, width: size * 2.4, marginTop: 6 }}
      />
    </View>
  );
}

// Tighter version for share cards / headers / tight chrome. No underline.
export function MiniWordmark({ size = 30 }: { size?: number }) {
  const dotSize = Math.round(size * 0.22);
  const iWidth = Math.round(size * 0.30);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ width: iWidth, alignItems: 'center', justifyContent: 'flex-end', marginRight: 2 }}>
        <View style={{
          width: dotSize, height: dotSize, borderRadius: dotSize,
          backgroundColor: colors.brandLime,
          marginBottom: Math.round(size * 0.05),
        }} />
        <View style={{
          width: Math.round(size * 0.16), height: Math.round(size * 0.62),
          borderRadius: 2, backgroundColor: colors.brandTeal,
        }} />
      </View>
      <Text style={{
        fontFamily: font.display, fontSize: size, color: colors.text,
        lineHeight: size * 1.25, letterSpacing: 0.5,
        includeFontPadding: false,
      } as any}>Tala</Text>
    </View>
  );
}

export function Screen({ children, scroll, inset, ...rest }: { children: React.ReactNode; scroll?: boolean; inset?: boolean } & ScrollViewProps) {
  // `inset` adds the top safe-area padding. Only screens WITHOUT a native
  // navigation header need it (currently just Home) — the nav header already
  // covers the notch, so adding it there doubled the top spacing.
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={inset ? ['top'] : []}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={{ padding: space(4), paddingBottom: space(16) }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            {...rest}>
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type TxtKind = 'display' | 'h1' | 'h2' | 'body' | 'label' | 'stat' | 'statBig';
export function Txt({ k = 'body', style, children, color, numberOfLines, adjustsFontSizeToFit, minimumFontScale, allowFontScaling }:
  { k?: TxtKind; style?: TextStyle; children: React.ReactNode; color?: string; numberOfLines?: number; adjustsFontSizeToFit?: boolean; minimumFontScale?: number; allowFontScaling?: boolean }) {
  const base: Record<TxtKind, TextStyle> = {
    display:  { fontFamily: font.display, fontSize: 40, color: colors.text, letterSpacing: 0.5 },
    h1:       { fontFamily: font.display, fontSize: 28, color: colors.text },
    h2:       { fontFamily: font.displaySemi, fontSize: 20, color: colors.text },
    body:     { fontFamily: font.body, fontSize: 15, color: colors.text },
    label:    { fontFamily: font.bodyMed, fontSize: 12, color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
    stat:     { fontFamily: font.displaySemi, fontSize: 16, color: colors.text },
    statBig:  { fontFamily: font.display, fontSize: 34, color: colors.text },
  };
  return (
    <Text
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
      allowFontScaling={allowFontScaling}
      style={[base[k], color ? { color } : null, style]}>
      {children}
    </Text>
  );
}

// Primary button uses the brand gradient; ghost/danger are outlined.
export function Button({ title, onPress, kind = 'primary', style, disabled }:
  { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; style?: ViewStyle; disabled?: boolean }) {
  if (kind === 'primary') {
    return (
      <Pressable onPress={onPress} disabled={disabled}
        style={({ pressed }) => [{ borderRadius: radius.md, opacity: disabled ? 0.4 : pressed ? 0.9 : 1 }, style]}>
        <LinearGradient
          colors={brandGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.bg, letterSpacing: 0.3 }}>{title}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  const fg = kind === 'danger' ? colors.red : colors.text;
  const border = kind === 'danger' ? colors.red : colors.line;
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [{
        backgroundColor: 'transparent', borderColor: border, borderWidth: 1,
        paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      }, style]}>
      <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: fg }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }:
  { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const inner = (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), borderWidth: 1, borderColor: colors.line }, style]}>
      {children}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>{inner}</Pressable>;
  return inner;
}

export function Pill({ label, color = colors.surfaceHi, textColor = colors.text }:
  { label: string; color?: string; textColor?: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: font.bodyMed, fontSize: 12, color: textColor }}>{label}</Text>
    </View>
  );
}

export function Field({ label, value, onChangeText, placeholder, keyboardType }:
  { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; keyboardType?: 'default' | 'number-pad' }) {
  return (
    <View style={{ marginBottom: space(3) }}>
      <Txt k="label" style={{ marginBottom: 6 }}>{label}</Txt>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={colors.muted} keyboardType={keyboardType}
        style={{
          backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
          color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.body, fontSize: 16,
        }}
      />
    </View>
  );
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space(12) }}>
      <Txt k="h2" color={colors.muted}>{title}</Txt>
      {subtitle ? <Txt k="body" color={colors.muted} style={{ marginTop: 6, textAlign: 'center' }}>{subtitle}</Txt> : null}
    </View>
  );
}

export function Segmented({ options, value, onChange }:
  { options: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.line }}>
      {options.map((o, i) => {
        const active = i === value;
        const inner = (
          <Text style={{ fontFamily: font.bodyMed, fontSize: 13, color: active ? colors.bg : colors.muted, letterSpacing: 0.2 }}>{o}</Text>
        );
        return (
          <Pressable key={o} onPress={() => onChange(i)} style={{ flex: 1 }}>
            {active ? (
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' }}>
                {inner}
              </LinearGradient>
            ) : (
              <View style={{ paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' }}>{inner}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// Swipe-left-to-reveal-delete row. Tapping the revealed area (or the card) calls onDelete/onPress.
export function SwipeableRow({ children, onDelete }:
  { children: React.ReactNode; onDelete: () => void }) {
  const ref = useRef<Swipeable>(null);

  // The red Delete panel revealed on swipe-left. Tapping it deletes.
  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    _drag: Animated.AnimatedInterpolation<number>
  ) => (
    <RectButton
      onPress={() => { ref.current?.close(); onDelete(); }}
      style={{ width: 96, borderRadius: radius.lg, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
      <Text style={{ fontFamily: font.bodyBold, color: '#FFFFFF', fontSize: 14 }}>Delete</Text>
    </RectButton>
  );

  return (
    <View style={{ marginBottom: space(3) }}>
      <Swipeable
        ref={ref}
        friction={1.6}
        rightThreshold={36}
        overshootRight={false}
        // Swiping far enough deletes immediately, no second tap needed.
        onSwipeableOpen={(direction) => { if (direction === 'right') { /* panel revealed */ } }}
        renderRightActions={renderRightActions}>
        {children}
      </Swipeable>
    </View>
  );
}

export const sep = StyleSheet.create({ line: { height: 1, backgroundColor: colors.line } });

// A tappable checkbox row with a title and optional description.
export function Toggle({ label, description, value, onChange }:
  { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
      <View style={{
        width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: value ? colors.accent : colors.line,
        backgroundColor: value ? colors.accent : 'transparent',
      }}>
        {value ? <Text style={{ color: colors.bg, fontFamily: font.bodyBold, fontSize: 15 }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt k="body" style={{ fontFamily: font.bodyMed }}>{label}</Txt>
        {description ? <Txt k="body" color={colors.muted} style={{ fontSize: 13, marginTop: 2 }}>{description}</Txt> : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// AUTH UI — Google sign-in modal, header profile button, profile bottom sheet.
// All follow the design tokens; lime stays reserved for live/action signals.
// ---------------------------------------------------------------------------

// Minimal multicolor "G" so we don't ship a binary Google asset.
function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <View style={{
      width: size + 6, height: size + 6, borderRadius: (size + 6) / 2,
      backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontFamily: font.bodyBold, fontSize: size, color: '#4285F4', includeFontPadding: false } as any}>G</Text>
    </View>
  );
}

// The one Google CTA used everywhere (modal + sheet), so it always looks the same.
export function GoogleButton({ title = 'Continue with Google', onPress, busy, style }:
  { title?: string; onPress: () => void; busy?: boolean; style?: ViewStyle }) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} disabled={busy}
      style={[{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.text,
        opacity: busy ? 0.6 : 1,
      }, style]}>
      <GoogleGlyph />
      <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.bg }}>
        {busy ? 'Signing in…' : title}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// SPONSOR MARK — shown on shareable cards. First sponsor: BPBL Clothing.
// Both colorways ship in assets/; the cards have dark backgrounds, so the
// inverse (light) mark is the default. Pass onLight for light surfaces.
// To change sponsors later, swap the two assets and this label.
// ---------------------------------------------------------------------------
const SPONSOR_LOGO_FOR_DARK_BG = require('../../assets/sponsor-bpbl-clothing-inverse.png');
const SPONSOR_LOGO_FOR_LIGHT_BG = require('../../assets/sponsor-bpbl-clothing.png');

export function SponsorMark({ size = 52, onLight }: { size?: number; onLight?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: font.bodyMed, fontSize: 8, letterSpacing: 1.6, color: colors.muted, marginBottom: 4 }}>
        PRESENTED BY
      </Text>
      <Image
        source={onLight ? SPONSOR_LOGO_FOR_LIGHT_BG : SPONSOR_LOGO_FOR_DARK_BG}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

// Sign in with Apple CTA — App Store Guideline 4.8 requires offering it
// wherever Google sign-in is offered (iOS only; callers gate on availability).
// Styled per Apple's HIG "black" button: solid black, white  glyph + label.
export function AppleButton({ title = 'Continue with Apple', onPress, busy, style }:
  { title?: string; onPress: () => void; busy?: boolean; style?: ViewStyle }) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} disabled={busy}
      style={[{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 14, borderRadius: radius.md, backgroundColor: '#000000',
        borderWidth: 1, borderColor: colors.line, opacity: busy ? 0.6 : 1,
      }, style]}>
      <Text style={{ fontSize: 18, color: '#FFFFFF', includeFontPadding: false } as any}></Text>
      <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: '#FFFFFF' }}>
        {busy ? 'Signing in…' : title}
      </Text>
    </TouchableOpacity>
  );
}

// Friendly "Sign in required" prompt shown when a guest taps a gated feature
// (share cards, admin entry to a live game). Same reliable overlay approach
// as PasswordModal — absolute fill, TouchableOpacity buttons.
export function SignInModal({ visible, title = 'Sign in required', message, error, busy, onGoogle, onApple, onCancel }:
  { visible: boolean; title?: string; message?: string; error?: string; busy?: boolean; onGoogle: () => void; onApple?: () => void; onCancel: () => void }) {
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill as ViewStyle} pointerEvents="box-none">
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000C', justifyContent: 'center', alignItems: 'center', padding: space(6) }}>
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space(5) }}>
          <Txt k="h2" style={{ marginBottom: 6 }}>{title}</Txt>
          {message ? <Txt k="body" color={colors.muted} style={{ marginBottom: space(4) }}>{message}</Txt> : <View style={{ height: space(2) }} />}
          <GoogleButton onPress={onGoogle} busy={busy} />
          {onApple ? <AppleButton onPress={onApple} busy={busy} style={{ marginTop: 10 }} /> : null}
          {error ? <Txt k="body" color={colors.red} style={{ marginTop: 10, fontSize: 13 }}>{error}</Txt> : null}
          <TouchableOpacity activeOpacity={0.7} onPress={onCancel} disabled={busy}
            style={{ marginTop: 10, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
            <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.text }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// One field for every invite code — league creation, co-owner, scorekeeper.
// The server decides what the code grants, so the UI never asks "which kind?".
export function InviteCodeModal({ visible, title = 'Enter invite code', message, error, busy, onSubmit, onCancel }:
  { visible: boolean; title?: string; message?: string; error?: string | null; busy?: boolean; onSubmit: (code: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  React.useEffect(() => { if (visible) setCode(''); }, [visible]);
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill as ViewStyle} pointerEvents="box-none">
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000C', justifyContent: 'center', alignItems: 'center', padding: space(6) }}>
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space(5) }}>
          <Txt k="h2" style={{ marginBottom: 6 }}>{title}</Txt>
          {message ? <Txt k="body" color={colors.muted} style={{ marginBottom: space(3) }}>{message}</Txt> : null}
          <TextInput
            value={code} onChangeText={setCode}
            placeholder="e.g. K7M2XQ" placeholderTextColor={colors.muted}
            autoCapitalize="characters" autoCorrect={false} maxLength={8}
            style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: error ? colors.red : colors.line, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.bodyBold, fontSize: 18, letterSpacing: 4, textAlign: 'center' }}
          />
          {error ? <Txt k="body" color={colors.red} style={{ marginTop: 8, fontSize: 13 }}>{error}</Txt> : null}
          <TouchableOpacity activeOpacity={0.75} disabled={busy || code.trim().length < 4} onPress={() => onSubmit(code.trim())}
            style={{ marginTop: space(3), paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.text, alignItems: 'center', opacity: busy || code.trim().length < 4 ? 0.5 : 1 }}>
            <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.bg }}>{busy ? 'Checking…' : 'Redeem code'}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onCancel} disabled={busy}
            style={{ marginTop: 10, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.text }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// First-run explainer — a friendly, dismissible welcome that demystifies the
// guest/sign-in model and the invite-code system before the user hits it cold.
export function OnboardingSheet({ visible, isSignedIn, onClose }: { visible: boolean; isSignedIn: boolean; onClose: () => void }) {
  if (!visible) return null;
  const Row = ({ icon, title, body }: { icon: string; title: string; body: string }) => (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: space(3) }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.text }}>{title}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 }}>{body}</Text>
      </View>
    </View>
  );
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000C', justifyContent: 'center', alignItems: 'center', padding: space(5), zIndex: 100 }}>
      <View style={{ width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space(5) }}>
        <Txt k="h1" style={{ marginBottom: 4 }}>Welcome to iTala</Txt>
        <Txt k="body" color={colors.muted} style={{ marginBottom: space(4) }}>Record. Track. Elevate. Here's the quick tour:</Txt>
        <Row icon="👀" title="Anyone can watch" body="Browse leagues, standings, and live games as a guest — no account needed." />
        <Row icon="🏀" title="Sign in to run games" body="Sign in with Google or Apple to track stats, manage rosters, and share player cards." />
        <Row icon="🎟" title="Leagues start with a code" body="Creating a league needs a one-time code from a Super Admin. Owners then invite co-owners and scorekeepers with their own share codes." />
        <Row icon="⚡" title="Everything syncs live" body="Scores update in real time across every device watching the game." />
        <Button title={isSignedIn ? "Let's go" : "Got it"} onPress={onClose} style={{ marginTop: space(2) }} />
      </View>
    </View>
  );
}

// Tiny save-state indicator for the Home header. Reassures non-technical users
// that their work is being saved — "saving…" then a brief "✓ Saved".

// ---- Sponsor promos ----------------------------------------------------------
// Shared "SPONSORED" tag for honesty across every promo placement.
function SponsoredTag() {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: font.body, fontSize: 9, letterSpacing: 1, color: colors.muted }}>SPONSORED</Text>
    </View>
  );
}

// Home spotlight card. Rotates through active promos when more than one.
export function PromoCard({ promos, onPress }: { promos: Promo[]; onPress: (p: Promo) => void }) {
  const [idx, setIdx] = useState(0);
  React.useEffect(() => {
    if (promos.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % promos.length), 5000);
    return () => clearInterval(t);
  }, [promos.length]);
  if (promos.length === 0) return null;
  const p = promos[idx % promos.length];
  const tappable = !!p.link;
  const Body = (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' }}>
      {p.image ? (
        <Image source={{ uri: p.image }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
      ) : null}
      <View style={{ padding: 12, gap: 4 }}>
        <SponsoredTag />
        <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.text }}>{p.title}</Text>
        {p.tagline ? <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.muted }}>{p.tagline}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          {p.sponsorName ? <Text style={{ fontFamily: font.body, fontSize: 11, color: colors.muted }}>{p.sponsorName}</Text> : <View />}
          {tappable ? <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.brandTeal }}>Learn more ›</Text> : null}
        </View>
        {promos.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, justifyContent: 'center' }}>
            {promos.map((_, i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === (idx % promos.length) ? colors.brandTeal : colors.line }} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
  return tappable
    ? <Pressable onPress={() => onPress(p)}>{Body}</Pressable>
    : Body;
}

// Compact strip for the FinalScore screen and the spectator live view.
export function PromoStrip({ promo, onPress }: { promo: Promo; onPress: (p: Promo) => void }) {
  const tappable = !!promo.link;
  const Body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 10 }}>
      {promo.image ? <Image source={{ uri: promo.image }} style={{ width: 40, height: 40, borderRadius: 8 }} resizeMode="cover" /> : null}
      <View style={{ flex: 1 }}>
        <SponsoredTag />
        <Text numberOfLines={1} style={{ fontFamily: font.bodyBold, fontSize: 13, color: colors.text, marginTop: 2 }}>{promo.title}</Text>
        {promo.sponsorName ? <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 11, color: colors.muted }}>{promo.sponsorName}</Text> : null}
      </View>
      {tappable ? <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.brandTeal }}>›</Text> : null}
    </View>
  );
  return tappable ? <Pressable onPress={() => onPress(promo)}>{Body}</Pressable> : Body;
}

export function SyncBadge({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  const cfg = {
    saving: { text: 'Saving…', color: colors.muted, dot: colors.muted },
    saved: { text: 'Saved', color: colors.green, dot: colors.green },
    error: { text: 'Save failed — will retry', color: colors.red, dot: colors.red },
  }[state];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cfg.dot }} />
      <Text style={{ fontFamily: font.body, fontSize: 11, color: cfg.color }}>{cfg.text}</Text>
    </View>
  );
}

// Header avatar button: Google photo when signed in, person glyph for guests.
export function ProfileButton({ avatarUrl, onPress }:
  { avatarUrl?: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
      ) : (
        <Txt k="h2" color={colors.muted}>👤</Txt>
      )}
    </Pressable>
  );
}

// Bottom sheet opened from the header profile button. Slides up/down with a
// short spring; taps on the dimmed backdrop dismiss it.
export function ProfileSheet({ visible, onClose, user, role, busy, error, onGoogle, onApple, onSignOut, onSettings, onAbout, onEnterCode }: {
  visible: boolean;
  onClose: () => void;
  user: { name: string; email: string; avatarUrl: string | null } | null;
  role: 'guest' | 'user' | 'admin';
  busy?: boolean;
  error?: string | null;
  onGoogle: () => void;
  onApple?: () => void;
  onSignOut: () => void;
  onSettings: () => void;
  onAbout: () => void;
  onEnterCode?: () => void;
}) {
  const [mounted, setMounted] = useState(visible);
  const slide = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else {
      Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, slide]);

  if (!mounted) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });
  const backdrop = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const RowBtn = ({ label, onPress, color = colors.text, disabled }:
    { label: string; onPress: () => void; color?: string; disabled?: boolean }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} disabled={disabled}
      style={{ paddingVertical: 15, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ fontFamily: font.bodyMed, fontSize: 16, color }}>{label}</Text>
    </TouchableOpacity>
  );
  const Line = () => <View style={{ height: 1, backgroundColor: colors.line }} />;

  return (
    <View style={StyleSheet.absoluteFill as ViewStyle} pointerEvents="box-none">
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000B', opacity: backdrop }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        transform: [{ translateY }],
        backgroundColor: colors.surface, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4,
        borderWidth: 1, borderColor: colors.line, padding: space(5), paddingBottom: space(9),
      }}>
        {/* Grab handle */}
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space(4) }} />

        {user ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: space(4) }}>
              {user.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceHi }} />
              ) : (
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt k="h2">{user.name.slice(0, 1).toUpperCase()}</Txt>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Txt k="h2" numberOfLines={1}>{user.name}</Txt>
                <Txt k="body" color={colors.muted} numberOfLines={1} style={{ fontSize: 13 }}>{user.email}</Txt>
              </View>
              {role === 'admin' ? <Pill label="ADMIN" color={colors.accentDim} textColor={colors.brandTeal} /> : null}
            </View>
            <Line />
            {onEnterCode ? (<><RowBtn label="Enter invite code" onPress={onEnterCode} /><Line /></>) : null}
            <RowBtn label="Settings" onPress={onSettings} />
            <Line />
            <RowBtn label="About" onPress={onAbout} />
            <Line />
            <RowBtn label={busy ? 'Signing out…' : 'Sign out'} color={colors.red} onPress={onSignOut} disabled={busy} />
          </>
        ) : (
          <>
            <View style={{ marginBottom: space(4) }}>
              <Txt k="h2">You're browsing as a guest</Txt>
              <Txt k="body" color={colors.muted} style={{ marginTop: 4 }}>
                Sign in with Google to share stat cards. Admins are recognized automatically.
              </Txt>
            </View>
            <GoogleButton onPress={onGoogle} busy={busy} />
            {onApple ? <AppleButton onPress={onApple} busy={busy} style={{ marginTop: 10 }} /> : null}
            {error ? <Txt k="body" color={colors.red} style={{ marginTop: 10, fontSize: 13 }}>{error}</Txt> : null}
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} disabled={busy}
              style={{ marginTop: 10, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center' }}>
              <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.text }}>Continue as Guest</Text>
            </TouchableOpacity>
            <Line />
            <RowBtn label="About" onPress={onAbout} />
          </>
        )}
      </Animated.View>
    </View>
  );
}

// Cross-platform password prompt. Rendered as an absolute overlay (NOT an RN
// <Modal>, which has had touch-delivery quirks here) with TouchableOpacity
// buttons (the most reliable touch primitive). The parent decides correctness.
export function PasswordModal({ visible, title, message, error, busy, onSubmit, onCancel }:
  { visible: boolean; title: string; message?: string; error?: string; busy?: boolean; onSubmit: (pw: string) => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  React.useEffect(() => { if (visible) setPw(''); }, [visible]);
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill as ViewStyle} pointerEvents="box-none">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000C', justifyContent: 'center', alignItems: 'center', padding: space(6) }}>
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space(5) }}>
          <Txt k="h2" style={{ marginBottom: 6 }}>{title}</Txt>
          {message ? <Txt k="body" color={colors.muted} style={{ marginBottom: space(3) }}>{message}</Txt> : <View style={{ height: space(2) }} />}
          <TextInput
            value={pw} onChangeText={setPw} placeholder="Password" placeholderTextColor={colors.muted}
            secureTextEntry returnKeyType="go" editable={!busy} onSubmitEditing={() => onSubmit(pw)}
            style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: error ? colors.red : colors.line, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.body, fontSize: 16 }}
          />
          {error ? <Txt k="body" color={colors.red} style={{ marginTop: 8, fontSize: 13 }}>{error}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: space(4) }}>
            <TouchableOpacity activeOpacity={0.7} onPress={onCancel} disabled={busy}
              style={{ flex: 1, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
              <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.text }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={() => onSubmit(pw)} disabled={busy}
              style={{ flex: 1, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brandTeal, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
              <Text style={{ fontFamily: font.bodyBold, fontSize: 15, color: colors.bg }}>{busy ? 'Unlocking…' : 'Unlock'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

