// Supabase client + configuration.
//
// Configuration is via two env vars set at build/run time:
//   EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
//
// EXPO_PUBLIC_* vars are inlined into the JS bundle by Metro, so they're
// available at runtime. If both vars are present, the app runs in SYNCED mode
// (offline-cached locally, mirrored to/from Supabase). If either is missing,
// the app runs in LOCAL-ONLY mode — fully functional, just no cross-device sync.
//
// The anon key is safe to ship in the client; row-level security on the
// database is what actually protects writes. See supabase/schema.sql.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const SYNC_ENABLED: boolean = !!(URL && KEY);

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SYNC_ENABLED) return null;
  if (_client) return _client;
  _client = createClient(URL!, KEY!, {
    auth: {
      // Persist the auth session in AsyncStorage so the device stays signed in
      // across app restarts. Required for stable anonymous user ids.
      storage: AsyncStorage as unknown as Storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // PKCE is the recommended OAuth flow for native apps: Google Sign-In
      // returns a one-time ?code= which we exchange for a session in
      // AdminProvider.createSessionFromUrl. The code verifier lives in
      // AsyncStorage, managed by supabase-js.
      flowType: 'pkce',
    },
    realtime: {
      params: { eventsPerSecond: 10 }, // throttle so a burst of stats doesn't hammer the channel
    },
  });
  return _client;
}
