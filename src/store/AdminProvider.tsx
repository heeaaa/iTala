import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getSupabase, SYNC_ENABLED } from '../sync/supabase';

// ---------------------------------------------------------------------------
// Auth + roles module.
//
// Three roles, derived in ONE place (deriveRole below):
//   guest — default. No sign-in. Read-only everywhere; cannot share cards.
//   user  — signed in with Google. Everything guest can do + share cards.
//   admin — Google email on ADMIN_EMAILS (or password-elevated backup).
//           Full write access: live stat entry, league/roster/game editing.
//
// SYNCED mode: role is backed by Supabase Auth. Devices boot into an anonymous
//   session (guest) so RLS-protected reads and realtime keep working. Google
//   sign-in replaces the anonymous session; email is checked against the
//   allowlist client-side (UI gating) AND server-side (sync_admin_role RPC →
//   profiles.is_admin → RLS actually permits writes).
// LOCAL-ONLY mode (no Supabase env vars): there is no auth backend, so the
//   device is trusted — role is 'user' by default (sharing works offline) and
//   the password lock elevates to 'admin', exactly like before.
//
// The password flow (unlock/lock + elevate_to_admin RPC) is kept intact as a
// hidden emergency backup — see the hidden lock gesture on LeaguesScreen.
//
// Hard rule in this module (unchanged): NO Supabase call is ever awaited
// without a timeout. supabase-js auth methods can hang in React Native when
// storage/locks stall; every call below races a timeout and always resolves.
// ---------------------------------------------------------------------------

// Required so the in-app browser closes correctly after the OAuth redirect.
WebBrowser.maybeCompleteAuthSession();

const LOCAL_FALLBACK_PASSWORD = 'bpblcourtside';

// ---------------------------------------------------------------------------
// ADMIN ALLOWLIST — single source of truth on the client.
// Keep this in sync with the `admin_emails` table in supabase/schema.sql
// (the table is what RLS actually enforces; this list drives the UI).
// ---------------------------------------------------------------------------
export const ADMIN_EMAILS: readonly string[] = [
  'abejoharold@gmail.com',
  'abejohanna@gmail.com',
  'aeronjosephsantos@gmail.com',
  'santos.ajhea@gmail.com',
].map(e => e.toLowerCase());

export type Role = 'guest' | 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  /** Display name from the Google account (falls back to the email). */
  name: string;
  /** Google profile photo URL, if any. */
  avatarUrl: string | null;
}

function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/** The ONE place a role is computed. Components must consume `role`
 *  (or the derived `isAdmin`) — never check emails or passwords directly. */
function deriveRole(opts: { synced: boolean; user: AuthUser | null; serverAdmin: boolean; localUnlocked: boolean }): Role {
  if (!opts.synced) {
    // Local-only: device is trusted; the password lock gates admin actions.
    return opts.localUnlocked ? 'admin' : 'user';
  }
  if (opts.user) {
    return isAdminEmail(opts.user.email) || opts.serverAdmin ? 'admin' : 'user';
  }
  // Anonymous session (or none). serverAdmin covers the password-elevated
  // anonymous device (the hidden-lock backup path).
  return opts.serverAdmin ? 'admin' : 'guest';
}

// Wrap any promise so it can never hang the UI. Returns `fallback` on timeout.
function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((resolve) =>
      setTimeout(() => { console.warn(`[auth] ${label} timed out after ${ms}ms`); resolve(fallback); }, ms)
    ),
  ]);
}

interface AdminCtx {
  /** Centralized role. All permission checks in the UI go through this. */
  role: Role;
  /** Convenience: role === 'admin'. Kept so existing screens don't change. */
  isAdmin: boolean;
  /** The signed-in Google account, or null for guests/anonymous sessions. */
  user: AuthUser | null;
  /** Supabase auth uid (anonymous or Google). Null in local-only mode. */
  userId: string | null;
  /** True while a Google sign-in round trip is in flight. */
  authBusy: boolean;
  /** Most recent human-readable status (surfaced in modals). */
  lastError: string | null;
  /** Launches the Google OAuth flow. Resolves to the resulting role, or null
   *  if the user cancelled / sign-in failed. Never hangs. */
  signInWithGoogle: () => Promise<Role | null>;
  /** True when native Sign in with Apple can be offered (iOS device). */
  appleAvailable: boolean;
  /** Launches native Sign in with Apple (App Store Guideline 4.8 requires
   *  offering it alongside Google). Same role resolution as Google. */
  signInWithApple: () => Promise<Role | null>;
  /** Permanently deletes the signed-in account server-side (App Store
   *  5.1.1(v) / Play policy requirement), then returns the device to a guest
   *  session. League/game data is untouched. Resolves true on success. */
  deleteAccount: () => Promise<boolean>;
  /** Signs out of Google and returns the device to a guest (anonymous) session. */
  signOut: () => Promise<void>;
  /** This user's per-league roles (league id → role). Supers bypass this. */
  memberships: Record<string, 'owner' | 'scorekeeper'>;
  /** Can run games / edit players in this league. */
  canScore: (league: { id: string; kind?: string; isShared?: boolean }) => boolean;
  /** Can restructure this league (settings, teams, members, delete). */
  isOwner: (league: { id: string; kind?: string; isShared?: boolean }) => boolean;
  /** Redeems any invite code (create-league / co-owner / scorekeeper). */
  reloadMemberships: () => Promise<void>;
  redeemCode: (code: string) => Promise<
    | { type: 'create' }
    | { type: 'joined'; leagueId: string; role: 'owner' | 'scorekeeper'; leagueName: string }
    | { type: 'error'; message: string }
  >;
  /** Super Admins: mint a single-use league-creation code. */
  createCreationCode: () => Promise<string | null>;
  /** Owner tools for the Members section. All resolve null/false on failure. */
  getLeagueCodes: (leagueId: string) => Promise<{ owner: string; scorekeeper: string } | null>;
  regenerateLeagueCode: (leagueId: string, role: 'owner' | 'scorekeeper') => Promise<string | null>;
  listMembers: (leagueId: string) => Promise<{ user_id: string; role: string; name: string; email: string | null }[] | null>;
  removeMember: (leagueId: string, userId: string) => Promise<boolean>;
  /** BACKUP password elevation (hidden lock). Resolves true on success. */
  unlock: (password: string) => Promise<boolean>;
  /** Drops password elevation. */
  lock: () => Promise<void>;
}

const Ctx = createContext<AdminCtx | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [serverAdmin, setServerAdmin] = useState(false);   // profiles.is_admin (synced mode)
  const [localUnlocked, setLocalUnlocked] = useState(false); // password unlock (local-only mode)
  const [authBusy, setAuthBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [memberships, setMemberships] = useState<Record<string, 'owner' | 'scorekeeper'>>({});

  // Native Apple sign-in exists only on iOS hardware; on Android/web the
  // module reports unavailable and the UI simply never shows the button.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !SYNC_ENABLED) return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const role = deriveRole({ synced: SYNC_ENABLED, user, serverAdmin, localUnlocked });

  const refreshMemberships = async (sb: NonNullable<ReturnType<typeof getSupabase>>) => {
    const res = await withTimeout(sb.rpc('my_memberships'), 6000, { data: null, error: null } as any, 'my_memberships');
    if (Array.isArray(res?.data)) {
      const map: Record<string, 'owner' | 'scorekeeper'> = {};
      for (const m of res.data as { league_id: string; role: 'owner' | 'scorekeeper' }[]) map[m.league_id] = m.role;
      setMemberships(map);
    }
  };

  // Public, no-arg refresh — call after creating a league so the creator's new
  // owner membership (inserted server-side by create_league) is reflected
  // locally right away, instead of only after an app reload.
  const reloadMemberships = async () => {
    const sb = getSupabase();
    if (sb) await refreshMemberships(sb);
  };

  // Boot: restore any persisted session (Google or anonymous). If none exists,
  // establish an anonymous session so RLS reads + realtime work for guests.
  // Never blocks rendering.
  useEffect(() => {
    if (!SYNC_ENABLED) return;
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;

    (async () => {
      const restored = await ensureSession(sb);
      if (cancelled || !restored) return;
      setUserId(restored.uid);
      setUser(restored.user);
      if (restored.user) {
        // Refresh the server-side admin flag from the email allowlist
        // (covers accounts created before an allowlist edit).
        await withTimeout(sb.rpc('sync_admin_role'), 6000, { data: null, error: null } as any, 'sync_admin_role');
      }
      const flag = await readAdminFlag(sb, restored.uid);
      if (!cancelled) setServerAdmin(flag);
      if (!cancelled && restored.user) await refreshMemberships(sb);
    })();

    return () => { cancelled = true; };
  }, []);

  // Shared tail of every provider sign-in: read the user back, flip the
  // server-side admin flag from the allowlist, and derive the new role.
  // nameHint covers Apple, which sends the full name ONLY on first sign-in
  // and never puts it in the identity token.
  const completeSignIn = async (
    sb: NonNullable<ReturnType<typeof getSupabase>>,
    nameHint?: string | null,
  ): Promise<Role | null> => {
    const got = await withTimeout(sb.auth.getUser(), 6000, { data: { user: null }, error: null } as any, 'getUser');
    const u = got?.data?.user;
    if (!u) { setLastError('Signed in, but the session could not be read. Try again.'); return null; }

    let authUser = toAuthUser(u);
    if (authUser && nameHint && authUser.name === authUser.email) {
      authUser = { ...authUser, name: nameHint };
    }
    setUser(authUser);
    setUserId(u.id);

    // Server-side: flip profiles.is_admin from the allowlist so RLS lets
    // admin writes through. Client-side gating works even if this call is slow.
    await withTimeout(sb.rpc('sync_admin_role'), 6000, { data: null, error: null } as any, 'sync_admin_role');
    const flag = await readAdminFlag(sb, u.id);
    setServerAdmin(flag);
    await refreshMemberships(sb);

    return deriveRole({ synced: true, user: authUser, serverAdmin: flag, localUnlocked });
  };

  // ---- Google Sign-In (Supabase OAuth + PKCE via the system browser) -------
  const signInWithGoogle = async (): Promise<Role | null> => {
    setLastError(null);

    if (!SYNC_ENABLED) {
      setLastError('Google sign-in needs the Supabase sync configuration. This build is running local-only.');
      return null;
    }
    const sb = getSupabase();
    if (!sb) { setLastError('Sync not configured.'); return null; }

    setAuthBusy(true);
    try {
      // Deep link back into the app. Expo Go → exp://.../--/auth-callback,
      // dev/prod builds → itala://auth-callback (scheme from app.json).
      const redirectTo = Linking.createURL('auth-callback');
      console.log('[auth] OAuth redirect URL (add to Supabase → Auth → URL Configuration):', redirectTo);

      const start = await withTimeout(
        sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        }),
        8000,
        { data: { url: null }, error: { message: 'timeout' } } as any,
        'signInWithOAuth'
      );
      if (start?.error || !start?.data?.url) {
        setLastError(start?.error?.message === 'timeout'
          ? 'Server did not respond. Check your connection.'
          : `Could not start sign-in: ${start?.error?.message ?? 'unknown error'}. Is the Google provider enabled in Supabase?`);
        return null;
      }

      // Opens the system browser; resolves when the browser redirects back.
      const result = await WebBrowser.openAuthSessionAsync(start.data.url, redirectTo);
      if (result.type !== 'success' || !('url' in result) || !result.url) {
        // User closed the sheet — not an error worth showing.
        return null;
      }

      const ok = await createSessionFromUrl(sb, result.url);
      if (!ok) {
        setLastError('Sign-in did not complete. Make sure the redirect URL above is added to your Supabase Redirect URLs.');
        return null;
      }

      return await completeSignIn(sb);
    } catch (e) {
      console.warn('[auth] signInWithGoogle threw:', (e as Error).message);
      setLastError('Sign-in failed. Check your connection and try again.');
      return null;
    } finally {
      setAuthBusy(false);
    }
  };

  // ---- Sign in with Apple (native sheet → Supabase ID-token exchange) ------
  const signInWithApple = async (): Promise<Role | null> => {
    setLastError(null);
    if (!SYNC_ENABLED) {
      setLastError('Apple sign-in needs the Supabase sync configuration. This build is running local-only.');
      return null;
    }
    const sb = getSupabase();
    if (!sb) { setLastError('Sync not configured.'); return null; }

    setAuthBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setLastError('Apple did not return a sign-in token. Try again.');
        return null;
      }

      const res = await withTimeout(
        sb.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken }),
        8000,
        { data: { session: null }, error: { message: 'timeout' } } as any,
        'signInWithIdToken(apple)'
      );
      if (res?.error) {
        setLastError(res.error.message === 'timeout'
          ? 'Server did not respond. Check your connection.'
          : `Apple sign-in failed: ${res.error.message}. Is the Apple provider enabled in Supabase with this app's bundle ID?`);
        return null;
      }

      // Apple provides the name only on the very FIRST authorization.
      const fn = credential.fullName;
      const nameHint = fn ? [fn.givenName, fn.familyName].filter(Boolean).join(' ') || null : null;
      return await completeSignIn(sb, nameHint);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED') return null; // user closed the sheet
      console.warn('[auth] signInWithApple threw:', (e as Error).message);
      setLastError('Apple sign-in failed. Try again.');
      return null;
    } finally {
      setAuthBusy(false);
    }
  };

  // ---- Account deletion (store-policy requirement) --------------------------
  const deleteAccount = async (): Promise<boolean> => {
    setLastError(null);
    if (!SYNC_ENABLED) { setLastError('There is no account to delete in local-only mode.'); return false; }
    const sb = getSupabase();
    if (!sb) { setLastError('Sync not configured.'); return false; }

    setAuthBusy(true);
    try {
      const res = await withTimeout(
        sb.rpc('delete_own_account'),
        8000,
        { data: null, error: { message: 'timeout' } } as { data: unknown; error: { message: string } | null },
        'delete_own_account'
      );
      if (res?.error) {
        setLastError(res.error.message === 'timeout'
          ? 'Server did not respond. Check your connection and try again.'
          : `Could not delete the account: ${res.error.message}`);
        return false;
      }

      // The server-side user is gone; clear the (now-orphaned) local session
      // and return to a fresh guest session. scope 'local' avoids a doomed
      // round-trip to the logout endpoint for a user that no longer exists.
      await withTimeout(sb.auth.signOut({ scope: 'local' }), 6000, { error: null } as any, 'signOut(local)');
      setUser(null);
      setServerAdmin(false);
      setMemberships({});
      const restored = await ensureSession(sb);
      setUserId(restored?.uid ?? null);
      return true;
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setLastError(null);
    if (!SYNC_ENABLED) { setLocalUnlocked(false); return; }
    const sb = getSupabase();
    if (!sb) return;
    setAuthBusy(true);
    try {
      await withTimeout(sb.auth.signOut(), 6000, { error: null } as any, 'signOut');
      setUser(null);
      setServerAdmin(false);
      setMemberships({});
      // Return to a guest (anonymous) session so reads + realtime keep working.
      const restored = await ensureSession(sb);
      setUserId(restored?.uid ?? null);
    } finally {
      setAuthBusy(false);
    }
  };

  // ---- Per-league permissions ------------------------------------------------
  // ONE place answers "what can this person do in this league". Screens call
  // these with the league object; nothing else checks memberships directly.
  const canScore = (l: { id: string; kind?: string; isShared?: boolean }): boolean => {
    if (!SYNC_ENABLED) return role === 'admin' || role === 'user'; // local device is trusted
    if (role === 'admin') return true;                              // Super Admin
    if (memberships[l.id]) return true;                             // owner or scorekeeper
    if (l.kind === 'recreational' && l.isShared) return !!user;     // shared rec: any signed-in user
    return false;
  };
  const isOwner = (l: { id: string; kind?: string; isShared?: boolean }): boolean => {
    if (!SYNC_ENABLED) return role === 'admin';
    if (role === 'admin') return true;
    return memberships[l.id] === 'owner';
  };

  const redeemCode: AdminCtx['redeemCode'] = async (code) => {
    setLastError(null);
    const sb = getSupabase();
    if (!SYNC_ENABLED || !sb) return { type: 'error', message: 'Invite codes need the synced (Supabase) setup.' };
    if (!user) return { type: 'error', message: 'Sign in first to use an invite code.' };
    setAuthBusy(true);
    try {
      const res = await withTimeout(sb.rpc('redeem_code', { p_code: code }), 8000,
        { data: null, error: { message: 'timeout' } } as any, 'redeem_code');
      if (res?.error) {
        return { type: 'error', message: res.error.message === 'timeout' ? 'Server did not respond. Try again.' : res.error.message };
      }
      const d = res?.data as { type: string; league_id?: string; role?: 'owner' | 'scorekeeper'; league_name?: string };
      if (d?.type === 'create') return { type: 'create' };
      if (d?.type === 'joined' && d.league_id && d.role) {
        await refreshMemberships(sb);
        return { type: 'joined', leagueId: d.league_id, role: d.role, leagueName: d.league_name ?? 'the league' };
      }
      return { type: 'error', message: 'Invalid code.' };
    } finally {
      setAuthBusy(false);
    }
  };

  const createCreationCode = async (): Promise<string | null> => {
    const sb = getSupabase();
    if (!sb) return null;
    const res = await withTimeout(sb.rpc('create_creation_code'), 8000, { data: null, error: { message: 'timeout' } } as any, 'create_creation_code');
    if (res?.error) { setLastError(res.error.message); return null; }
    return typeof res?.data === 'string' ? res.data : null;
  };

  const getLeagueCodes = async (leagueId: string) => {
    const sb = getSupabase();
    if (!sb) return null;
    const res = await withTimeout(sb.rpc('get_league_codes', { p_league_id: leagueId }), 8000, { data: null, error: null } as any, 'get_league_codes');
    const d = res?.data as { owner?: string; scorekeeper?: string } | null;
    return d?.owner && d?.scorekeeper ? { owner: d.owner, scorekeeper: d.scorekeeper } : null;
  };

  const regenerateLeagueCode = async (leagueId: string, roleArg: 'owner' | 'scorekeeper') => {
    const sb = getSupabase();
    if (!sb) return null;
    const res = await withTimeout(sb.rpc('regenerate_league_code', { p_league_id: leagueId, p_role: roleArg }), 8000, { data: null, error: null } as any, 'regenerate_league_code');
    return typeof res?.data === 'string' ? res.data : null;
  };

  const listMembers = async (leagueId: string) => {
    const sb = getSupabase();
    if (!sb) return null;
    const res = await withTimeout(sb.rpc('list_members', { p_league_id: leagueId }), 8000, { data: null, error: null } as any, 'list_members');
    return Array.isArray(res?.data) ? res.data as { user_id: string; role: string; name: string; email: string | null }[] : null;
  };

  const removeMember = async (leagueId: string, userId: string) => {
    const sb = getSupabase();
    if (!sb) return false;
    const res = await withTimeout(sb.rpc('remove_member', { p_league_id: leagueId, p_user_id: userId }), 8000, { data: null, error: { message: 'timeout' } } as any, 'remove_member');
    if (res?.error) { setLastError(res.error.message); return false; }
    return true;
  };

  // ---- Password backup (hidden lock) ---------------------------------------
  const unlock = async (password: string): Promise<boolean> => {
    setLastError(null);

    // Local-only mode: constant-time-ish compare, no network.
    if (!SYNC_ENABLED) {
      const ok = password === LOCAL_FALLBACK_PASSWORD;
      if (ok) setLocalUnlocked(true);
      else setLastError('Incorrect password.');
      return ok;
    }

    const sb = getSupabase();
    if (!sb) { setLastError('Sync not configured.'); return false; }

    const restored = await ensureSession(sb);
    if (!restored?.uid) {
      setLastError('Could not reach the server. Check your connection and that Anonymous sign-in is enabled in Supabase.');
      return false;
    }
    setUserId(restored.uid);

    const res = await withTimeout(
      sb.rpc('elevate_to_admin', { password_attempt: password }),
      8000,
      { data: null, error: { message: 'timeout' } } as { data: unknown; error: { message: string } | null },
      'elevate_to_admin'
    );

    if (res.error) {
      console.warn('[auth] elevate_to_admin error:', res.error.message);
      setLastError(res.error.message === 'timeout'
        ? 'Server did not respond. Check your Supabase config / network.'
        : `Server error: ${res.error.message}`);
      return false;
    }

    const ok = !!res.data;
    if (ok) setServerAdmin(true);
    else setLastError('Incorrect password.');
    return ok;
  };

  const lock = async (): Promise<void> => {
    setLastError(null);
    if (!SYNC_ENABLED) { setLocalUnlocked(false); return; }
    const sb = getSupabase();
    if (sb) {
      await withTimeout(sb.rpc('lock_admin'), 5000, { data: null, error: null } as any, 'lock_admin');
    }
    setServerAdmin(false);
  };

  return (
    <Ctx.Provider value={{
      role, isAdmin: role === 'admin', user, userId, authBusy, lastError,
      memberships, canScore, isOwner, reloadMemberships, redeemCode, createCreationCode,
      getLeagueCodes, regenerateLeagueCode, listMembers, removeMember,
      signInWithGoogle, appleAvailable, signInWithApple, deleteAccount, signOut, unlock, lock,
    }}>
      {children}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAuthUser(u: { id: string; email?: string | null; is_anonymous?: boolean; user_metadata?: Record<string, any> }): AuthUser | null {
  if (!u || u.is_anonymous || !u.email) return null;
  const md = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email,
    name: md.full_name || md.name || u.email,
    avatarUrl: md.avatar_url || md.picture || null,
  };
}

/** Turns the OAuth redirect URL back into a Supabase session.
 *  Handles both PKCE (?code=) and implicit (#access_token=) responses. */
async function createSessionFromUrl(sb: NonNullable<ReturnType<typeof getSupabase>>, url: string): Promise<boolean> {
  try {
    const parsed = Linking.parse(url);
    const qp = (parsed.queryParams ?? {}) as Record<string, string | string[]>;
    const errDesc = str(qp['error_description']);
    if (errDesc) { console.warn('[auth] OAuth error:', errDesc); return false; }

    const code = str(qp['code']);
    if (code) {
      const res = await withTimeout(sb.auth.exchangeCodeForSession(code), 8000,
        { data: { session: null }, error: { message: 'timeout' } } as any, 'exchangeCodeForSession');
      if (res?.error) { console.warn('[auth] exchangeCodeForSession:', res.error.message); return false; }
      return !!res?.data?.session;
    }

    // Implicit flow: tokens arrive in the URL fragment.
    const frag = url.split('#')[1];
    if (frag) {
      const p = new URLSearchParams(frag);
      const access_token = p.get('access_token');
      const refresh_token = p.get('refresh_token');
      if (access_token && refresh_token) {
        const res = await withTimeout(sb.auth.setSession({ access_token, refresh_token }), 8000,
          { data: { session: null }, error: { message: 'timeout' } } as any, 'setSession');
        if (res?.error) { console.warn('[auth] setSession:', res.error.message); return false; }
        return !!res?.data?.session;
      }
    }
    return false;
  } catch (e) {
    console.warn('[auth] createSessionFromUrl threw:', (e as Error).message);
    return false;
  }
}

function str(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Returns the current session (restoring Google or creating anonymous).
// Always resolves within a few seconds (timeout-guarded); null on failure.
async function ensureSession(sb: ReturnType<typeof getSupabase>): Promise<{ uid: string; user: AuthUser | null } | null> {
  if (!sb) return null;
  try {
    const sess = await withTimeout(sb.auth.getSession(), 5000, { data: { session: null }, error: null } as any, 'getSession');
    const existing = sess?.data?.session?.user;
    if (existing?.id) {
      return { uid: existing.id, user: toAuthUser(existing) };
    }

    const signin = await withTimeout(sb.auth.signInAnonymously(), 6000, { data: { user: null, session: null }, error: { message: 'timeout' } } as any, 'signInAnonymously');
    if (signin?.error) {
      console.warn('[auth] anonymous sign-in failed:', signin.error.message, '— is Anonymous sign-in enabled in Supabase → Authentication → Providers?');
      return null;
    }
    const uid = signin?.data?.user?.id ?? signin?.data?.session?.user?.id ?? null;
    return uid ? { uid, user: null } : null;
  } catch (e) {
    console.warn('[auth] ensureSession threw:', (e as Error).message);
    return null;
  }
}

async function readAdminFlag(sb: ReturnType<typeof getSupabase>, uid: string): Promise<boolean> {
  if (!sb) return false;
  try {
    const res = await withTimeout(
      sb.from('profiles').select('is_admin').eq('id', uid).maybeSingle(),
      5000,
      { data: null, error: null } as any,
      'readAdminFlag'
    );
    return !!res?.data?.is_admin;
  } catch {
    return false;
  }
}

export function useAdmin(): AdminCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin must be used within AdminProvider');
  return c;
}
