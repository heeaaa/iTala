import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { Screen, Txt, Card, Pill, GoogleButton, AppleButton, Button } from '../components/ui';
import { useStore } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space } from '../theme';
import { ScreenProps } from '../navigation';

export default function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const { synced } = useStore();
  const { role, isAdmin, user, userId, signInWithGoogle, appleAvailable, signInWithApple, deleteAccount, signOut, authBusy, lastError } = useAdmin();
  const [busy, setBusy] = useState(false);

  // Guests are prompted to sign in — Settings requires an account.
  if (role === 'guest') {
    const onSignIn = async (signIn: () => Promise<unknown>) => {
      setBusy(true);
      await signIn();
      setBusy(false);
      // On success role changes and this screen re-renders into the full view.
    };
    return (
      <Screen scroll>
        <View style={{ paddingTop: space(8), alignItems: 'center' }}>
          <Txt k="h1" style={{ marginBottom: space(2) }}>Sign in required</Txt>
          <Txt k="body" color={colors.muted} style={{ textAlign: 'center', marginBottom: space(6) }}>
            Settings are tied to your account. Sign in with Google to continue.
          </Txt>
          <GoogleButton onPress={() => { void onSignIn(signInWithGoogle); }} busy={busy || authBusy} style={{ alignSelf: 'stretch' }} />
          {appleAvailable ? <AppleButton onPress={() => { void onSignIn(signInWithApple); }} busy={busy || authBusy} style={{ alignSelf: 'stretch', marginTop: 10 }} /> : null}
          {lastError ? <Txt k="body" color={colors.red} style={{ marginTop: 10, fontSize: 13 }}>{lastError}</Txt> : null}
          <Button title="Cancel" kind="ghost" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch', marginTop: 10 }} />
        </View>
      </Screen>
    );
  }

  // App Store 5.1.1(v) / Play policy: accounts must be deletable in-app.
  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your sign-in and account data. It cannot be undone.\n\nLeague records and game stats are kept — they belong to the league, not your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => { void doDelete(); } },
      ],
    );
  };
  const doDelete = async () => {
    setBusy(true);
    const ok = await deleteAccount();
    setBusy(false);
    if (ok) {
      Alert.alert('Account deleted', 'Your account has been removed. You can keep using iTala as a guest.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert('Could not delete account', lastError ?? 'Something went wrong. Please try again.');
    }
  };

  return (
    <Screen scroll>
      <Txt k="h1" style={{ marginBottom: space(2) }}>Settings</Txt>
      <Txt k="body" color={colors.muted} style={{ marginBottom: space(5) }}>
        These apply across all games and devices using this app.
      </Txt>

      {/* Account */}
      <Card style={{ marginBottom: space(4) }}>
        <Txt k="label" style={{ marginBottom: space(2) }}>Account</Txt>
        {user ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Txt k="body" style={{ fontSize: 15 }}>{user.name}</Txt>
                <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginTop: 2 }}>Signed in with Google · {user.email}</Txt>
              </View>
              {isAdmin ? <Pill label="ADMIN" color={colors.accentDim} textColor={colors.brandTeal} /> : <Pill label="MEMBER" color={colors.surfaceHi} textColor={colors.muted} />}
            </View>
            <Button title="Sign out" kind="ghost" onPress={() => { void signOut().then(() => navigation.goBack()); }} style={{ marginTop: space(3) }} />
          </>
        ) : (
          // Local-only mode (no Google available) or password-elevated device.
          <Txt k="body" color={colors.muted}>
            {isAdmin ? 'Admin unlocked on this device (password).' : 'This device is running without an account.'}
          </Txt>
        )}
      </Card>

      {/* Sync */}
      <Card style={{ marginBottom: space(4) }}>
        <Txt k="label" style={{ marginBottom: space(2) }}>Sync</Txt>
        {synced ? (
          <>
            <Txt k="body" color={colors.green}>● Connected — changes sync across devices in real time.</Txt>
            {userId ? <Txt k="body" color={colors.muted} style={{ fontSize: 11, marginTop: 4 }}>Device: {userId.slice(0, 8)}…</Txt> : null}
          </>
        ) : (
          <>
            <Txt k="body" color={colors.muted}>○ Local-only — data stays on this device.</Txt>
            <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginTop: 4 }}>
              To enable multi-device sync, set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY before building. See README.
            </Txt>
          </>
        )}
      </Card>

      {/* Danger zone — only meaningful when an actual account exists */}
      {user ? (
        <Card style={{ marginTop: space(4), borderColor: colors.red }}>
          <Txt k="label" color={colors.red} style={{ marginBottom: space(2) }}>Danger zone</Txt>
          <Txt k="body" color={colors.muted} style={{ marginBottom: space(3) }}>
            Deleting your account removes your sign-in and profile permanently. League records and game stats are not affected.
          </Txt>
          <Button title={busy ? 'Deleting…' : 'Delete account'} kind="danger" disabled={busy || authBusy} onPress={confirmDelete} />
        </Card>
      ) : null}
    </Screen>
  );
}
