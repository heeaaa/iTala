# iTala — Google Sign-In setup

This adds Google authentication on top of the existing anonymous (guest) flow.
Everything stays on free tiers: Supabase social login is free, and Google OAuth
credentials cost nothing (no billing account needed).

## The three roles

| Role | Who | Can |
|---|---|---|
| **Guest** (default) | Anyone who opens the app — no sign-in | Browse leagues, standings, leaders, rosters, box scores, player profiles; watch live games read-only |
| **User** | Any Google account | Everything Guest can + share box-score and player stat cards |
| **Admin** | Google email on the allowlist | Everything + live stat entry, league/roster/team/game editing, Settings |

Initial admin emails (edit in **two places** to change later — see "Managing admins"):
- abejoharold@gmail.com
- abejohanna@gmail.com
- aeronjosephsantos@gmail.com
- santos.ajhea@gmail.com

The old password lock still exists as an **emergency backup**: tap the iTala
wordmark on the home screen **10 times quickly** to reveal the lock icon
(10 more taps hides it again).

## 1. Copy the changed files into your project

```
src/store/AdminProvider.tsx        (replaced — roles + Google sign-in)
src/components/ui.tsx              (adds SignInModal, ProfileSheet, GoogleButton, ProfileButton)
src/screens/LeaguesScreen.tsx      (profile header button, hidden lock gesture, profile sheet)
src/screens/SettingsScreen.tsx     (role-aware; guests get a sign-in prompt)
src/screens/BoxScoreScreen.tsx     (share gated behind sign-in for guests)
src/screens/PlayerProfileScreen.tsx(share gated behind sign-in for guests)
src/screens/GamesOnDateScreen.tsx  (live-game admin entry via Google instead of password)
src/sync/supabase.ts               (adds flowType: 'pkce')
supabase/schema.sql                (adds admin_emails table + sync_admin_role function)
```

No changes needed to App.tsx, app.json (the `itala` scheme is already set),
navigation.ts, or the store/sync layers.

## 2. Install the two new packages

From the project root (this picks the SDK-54-compatible versions automatically):

```bash
npx expo install expo-web-browser expo-linking
```

Both are part of the Expo Go runtime, so **Google Sign-In works inside Expo Go**
— it opens the system browser and deep-links back into the app.

## 3. Create the Google OAuth client (one time, free)

1. Go to <https://console.cloud.google.com> → create a project (e.g. "iTala").
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in the
   app name and your email, save. (Publishing status "Testing" is fine to start;
   add your 3–5 admin Gmail addresses as test users. Publish to production later
   so any Google account can sign in.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application** (yes, web — Supabase brokers the flow)
   - Authorized redirect URI: `https://YOURPROJECT.supabase.co/auth/v1/callback`
     (find YOURPROJECT in your Supabase project URL)
4. Copy the **Client ID** and **Client secret**.

## 4. Configure Supabase (one time)

1. **Authentication → Providers → Google**: enable, paste the Client ID and
   Client secret from step 3. Save.
2. Keep **Anonymous** sign-in enabled (guests depend on it).
3. **Authentication → URL Configuration → Redirect URLs**, add:
   - `itala://auth-callback` (dev/production builds)
   - For **Expo Go** development, also add the URL your dev session uses. The
     app logs it on every sign-in attempt — look in the Metro terminal for:
     `[auth] OAuth redirect URL (add to Supabase → Auth → URL Configuration): exp://...`
     Add exactly that, or use the wildcard `exp://**` while developing.
4. **SQL Editor → New query**: paste the updated `supabase/schema.sql` and Run.
   It's idempotent — safe on your existing project; your data is untouched. This
   creates the `admin_emails` allowlist (seeded with the four addresses) and the
   `sync_admin_role()` function.

## 5. Run it

```bash
npx expo start -c
```

- The app opens straight to the Leagues screen — no login wall.
- Top-right **👤** opens the profile sheet: *Continue as Guest*, *Sign in with
  Google*, *About*.
- After signing in, the header shows the Google avatar; the sheet shows name,
  email, Settings, About, Sign out. Admin emails get the ADMIN pill and full
  edit access immediately.
- Guests tapping **Share box-score card** / **Share stat card** get the
  friendly "Sign in required" prompt; after signing in, the share continues
  automatically.

## Sign in with Apple (required for the App Store)

App Store Guideline 4.8: an iOS app offering Google sign-in must also offer
Sign in with Apple. The code ships it already — native Apple sheet on iOS via
`expo-apple-authentication`, hidden on Android. To make it work:

1. **Supabase → Authentication → Providers → Apple**: enable it, and add the
   app's bundle ID `com.bpbl.itala` to the **Client IDs** field. The native
   ID-token flow needs no secret key and no Services ID.
   - **Testing in Expo Go?** Apple's token carries the audience of the app
     that requested it — inside Expo Go that's `host.exp.Exponent`, not your
     bundle ID, so sign-in fails with "Unacceptable audience". For development
     set Client IDs to: `com.bpbl.itala,host.exp.Exponent`. **Remove the
     `host.exp.Exponent` entry before shipping** (it's on the DEPLOYMENT.md
     pre-flight checklist).
2. Nothing else — the `expo-apple-authentication` plugin and the
   `usesAppleSignIn` entitlement are already configured in `app.json`, so EAS
   builds pick up the capability automatically (requires your Apple Developer
   account at build time, like any iOS build).

Notes:
- **Admins signing in with Apple must choose "Share My Email"** on the Apple
  sheet. Choosing "Hide My Email" gives a `@privaterelay.appleid.com` address
  that won't match the allowlist, so they'd land as a regular user. (Google and
  Apple sign-ins with the same email are separate identities in Supabase —
  both become admin if the email is allowlisted, but they are two user rows.)
- Apple provides the person's name **only on the very first** authorization;
  the app captures it then. If it's ever missed, the display name falls back
  to the email.
- Apple sign-in requires a real build (or Expo Go on iOS where available) —
  there is no Apple sign-in on Android, and the button simply doesn't render
  there.

## Deleting an account (store-policy requirement)

Both stores require in-app account deletion when sign-in exists. Signed-in
users get **Settings → Danger zone → Delete account**, which calls the
`delete_own_account` function added to `supabase/schema.sql` (re-run the
schema in the SQL Editor so it exists). Deletion removes the auth user and
profile; league records and game stats are league data and remain intact.

## League ownership, roles & invite codes

Permissions are now **per league**, enforced by row-level security:

| Role | Scope | Can |
|---|---|---|
| **Super Admin** | global (the email allowlist) | Everything in every league + mint league-creation codes + password backup |
| **Owner / Co-owner** | one league | League settings, teams, members & codes, delete league — plus everything a scorekeeper can |
| **Scorekeeper** | one league | Create/run/finalize games, live stat entry, add & edit players (late subs) |
| **Signed-in user** | — | Everything a guest can + share cards + drop-in games + redeem codes |
| **Guest** | — | Browse and spectate everything, read-only |

**Codes — one field rules them all.** Profile menu → *Enter invite code* (or the
*New League* button for non-supers). The server decides what a code grants:

- **League-creation codes**: minted by a Super Admin (home screen → 🎟 button),
  **single-use** — one code creates exactly one league, then expires. The
  creator becomes its owner.
- **Co-owner / scorekeeper codes**: every league has one of each, in League
  Settings (⚙) → *Invite codes*, with Share and regenerate (↻) buttons.
  Reusable until regenerated; regenerating kills the old code but people who
  already joined keep access. Owners can remove members there too (a league
  always keeps at least one owner).

**Recreational drop-in games now require sign-in.** Each user gets a personal
drop-in space by default; a per-game "Make this game public" toggle sends it to
the shared **Community Drop-In** space that all signed-in users can write to.

**Migration**: re-running `supabase/schema.sql` creates the membership tables,
rewrites the RLS policies to league-scoped rules, and seeds the Super Admins as
owners of every pre-existing league. Idempotent as always. ⚠️ This re-run is
REQUIRED — without it, league-scoped writes are rejected by the old policies.

## Managing admins

Adding or removing an admin is two edits:

1. **Database** (what RLS actually enforces):
   ```sql
   insert into public.admin_emails (email) values ('new.admin@gmail.com');
   -- or: delete from public.admin_emails where email = 'old.admin@gmail.com';
   ```
2. **Client UI** (`ADMIN_EMAILS` at the top of `src/store/AdminProvider.tsx`) —
   this controls what the app shows before the server round-trip.

If someone already signed in *before* being added, the app calls
`sync_admin_role()` on every launch/sign-in, so they become admin the next time
they open the app. Removing an email stops future promotions; to revoke an
already-flagged account immediately:
```sql
update public.profiles set is_admin = false where id = '<their auth uid>';
```

## How it works under the hood

- **Guest = anonymous Supabase session** (unchanged). Row-level security lets
  any signed-in session read everything, so live spectating and realtime keep
  working with zero friction.
- **Google sign-in** uses Supabase OAuth with **PKCE**: the app opens the
  system browser via `expo-web-browser`, Google redirects to Supabase, Supabase
  deep-links back with a one-time `?code=`, and the app exchanges it for a
  session. No tokens ever appear in the UI layer.
- **Role checks are centralized** in `deriveRole()` inside AdminProvider.
  Screens only read `role` / `isAdmin` from `useAdmin()` — no email or password
  checks anywhere else — so migrating to a fully database-backed role table
  later means changing one function.
- **Server-side enforcement is unchanged**: writes still require
  `profiles.is_admin = true` via RLS. The allowlist just becomes a second way
  (besides the password RPC) for that flag to get set — now automatically, at
  sign-in, by the `handle_new_user` trigger and `sync_admin_role()`.
- **Local-only mode** (no Supabase env vars): there's no auth backend, so the
  device is trusted — sharing works without sign-in and the hidden password
  lock still gates admin actions, exactly as before.

## Troubleshooting

- **Browser opens, but after choosing the account nothing happens** → the
  redirect URL isn't allowlisted. Check the Metro log line for the exact URL
  and add it under Supabase → Auth → URL Configuration.
- **"Could not start sign-in"** → the Google provider isn't enabled in
  Supabase, or the client ID/secret are wrong.
- **Google shows "access blocked / app not verified"** → your consent screen is
  in Testing and the account isn't a test user. Add it, or publish the consent
  screen.
- **Admin email signs in but has no edit access** → re-run `schema.sql`
  (creates `sync_admin_role`), and confirm the email is in `admin_emails`
  (exact address; matching is case-insensitive).
