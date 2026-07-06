# 🏀 iTala

A mobile app for amateur/rec basketball — track live game stats, run a league with
auto standings and leaderboards, and share box-score brag cards with the people you play with.
Built with **Expo SDK 54** (React Native 0.81 / React 19) and **TypeScript**, fully
**offline-first** (no backend required for the MVP). Runs in **Expo Go** (SDK 54).

**iTala — Record. Track. Elevate.** The UI is themed around the iTala logo's blue→purple
gradient on a deep blue-black.

Built from the `hoops-app-builder` skill (originally codenamed "Hoops"). This is the MVP defined in that skill's
"definition of done": create a league + teams + players, keep a full box score live with
**two-tap entry**, finish the game, see standings + leaderboards, and share a stat-line card —
all with no network connection during the game.

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Run it
npx expo start
# scan the QR code with the Expo Go app (SDK 54), or press i / a for a simulator
```

> Requires the **Expo Go** app that supports **SDK 54**. First launch downloads the bundled
> Google Fonts (Oswald + DM Sans) and shows a brief spinner.
>
> Note on sharing: the box-score **image** card uses `react-native-view-shot`, which isn't part
> of the Expo Go runtime — inside Expo Go the Share button falls back to sharing a **text** brag
> (works everywhere). In a development or production build (`eas build`) the full image card is
> generated. Everything else runs natively in Expo Go.

## Multi-device sync (optional)

By default iTala stores all data locally on the device — no account, no backend, fully offline.
To run two simultaneous live games across different gyms and devices, connect the app to a
free **Supabase** project. With sync configured, every device sees stats update in real time
and your admin password is enforced **server-side** by row-level security rather than only on
the device.

**Free-tier limits** (Supabase, current as of this writing): 500 MB database, 200 concurrent
realtime connections, 2 million realtime messages/month, 50K monthly active users, 5 GB
bandwidth. Two live games with a handful of watchers each is comfortably within all of these.
One catch: free projects auto-pause after **7 consecutive idle days**; the included GitHub
Action pings the database every 3 days to keep it awake (see DEPLOYMENT.md).

### One-time setup

1. **Create a Supabase project** at <https://supabase.com> (free tier is fine).
2. **Run the schema.** In the Supabase dashboard, open SQL Editor → New query, paste the
   contents of [`supabase/schema.sql`](supabase/schema.sql), and Run. This creates the tables,
   row-level security policies, the `elevate_to_admin` password-verification function, and the
   `ping` keep-alive function.
3. **Enable anonymous sign-in.** Dashboard → Authentication → Providers → Anonymous → enable.
   This lets spectator phones get a session without account creation.
4. **(Optional) Change the admin password.** In SQL Editor, run:
   ```sql
   update public.admin_secret set password = 'your-new-password' where id = 1;
   ```
   The password is never sent to clients via SELECT — only the `elevate_to_admin` function
   can read it, and only to compare against an incoming attempt.
5. **Copy your project URL and anon key.** Dashboard → Project Settings → API.
6. **Configure the app.** Copy `.env.example` to `.env` and fill in:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
7. **Restart Expo** with the new env vars: `npx expo start -c`.

Open the app — on the Settings screen you'll see "● Connected — changes sync across devices in
real time." If you see "○ Local-only," the env vars weren't picked up; try `start -c` again.

### How it works

- **Local-first.** Every action still writes to `AsyncStorage` first, so live tracking keeps
  working with no internet. When the network returns, queued writes flush to Supabase.
- **Realtime pull.** Each device subscribes to changes on `events`, `games`, `teams`, etc.
  via Supabase Realtime. When another device logs a stat, your screen updates within a second.
- **Auth.** Each device signs in anonymously on first launch (stable UUID stored locally).
  Anonymous users can READ everything (spectators) but cannot INSERT/UPDATE/DELETE.
- **Admin elevation.** Tapping the lock icon and entering the password calls the
  `elevate_to_admin(password)` Postgres function. If it matches, your `profiles.is_admin` flag
  is set to true, and from that moment on, RLS allows your writes. Re-locking from the home
  screen flips it back off.
- **Conflict policy: last write wins.** Two scorekeepers should not be on the same game; if
  they are, the later write replaces the earlier. Stat events are append-only with
  client-generated ids, so concurrent logs in *different* games never collide.

### Keep-alive (avoid the 7-day pause)

The repo ships a GitHub Action at `.github/workflows/supabase-keepalive.yml` that calls the
`ping` RPC every 3 days. To enable it: in your GitHub repo, Settings → Secrets and variables →
Actions, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The workflow will register database
activity on schedule and your free project will stay awake between weekend game days.

If you'd rather not use GitHub, point any free uptime monitor (UptimeRobot, Cronitor) at:
```
POST https://YOURPROJECT.supabase.co/rest/v1/rpc/ping
Headers: apikey: <anon key>, Authorization: Bearer <anon key>, Content-Type: application/json
Body: {}
```
Anything more frequent than weekly works.

## What's implemented (MVP)

| Skill pillar | Status |
|---|---|
| Two-tap live stat entry (tap stat → tap player) | ✅ |
| Color-coded stat pad (green makes / red misses / distinct stat colors) | ✅ |
| Starting-5 lineup selection for both teams | ✅ |
| Substitutions — single swap (in/out) and full "Set 5" lineup change | ✅ |
| Stat pad shows only the 5 players currently on court | ✅ |
| Undo last action + play-by-play preview (open anytime, delete events) | ✅ |
| Per-player fouls + points on each chip; team fouls shown per period | ✅ |
| Foul-out: FIBA 5-foul rule — fouled-out players are auto-benched and can't return | ✅ |
| Change Court (swap left/right sides) for easy tracking | ✅ |
| Periods 1–9 (with confirmation when advancing) | ✅ |
| Opponent-as-team shortcut (track score only) | ✅ |
| Auto box score (PTS, FG, 3P, FT, REB, AST, STL, BLK, PF + FG%) | ✅ |
| End-of-quarter line score in the game summary | ✅ |
| Auto standings (W-L, point diff, streak, tie-breaks) | ✅ |
| Leaderboards (PPG / RPG / APG) | ✅ |
| Player profiles (full averages: PTS/REB/AST/STL/BLK/TO/PF, shooting splits, career highs, badges) | ✅ |
| Team logos (beside team names + in the game summary/share card) | ✅ |
| Editable roster — per-team edit (name, color, logo) and per-player edit/delete | ✅ |
| Games grouped by date (date cards → per-day game list) | ✅ |
| Delete a logged game (swipe-to-delete with confirmation) | ✅ |
| Shareable box-score brag card (PNG via share sheet) | ✅ |
| Shareable player stat card (from a player's profile) | ✅ |
| Offline-first persistence + "resume live game" | ✅ |

Deferred to a later version (intentionally): the offensive/defensive **rebound split** (a single
combined REB is logged for now) and **turnovers** (TOV). Also deferred per the skill's phasing:
cloud sync & invites (Supabase), the social feed with reactions/comments, shot charts, video
highlights, push notifications, round-robin schedule generator.

## Architecture

```
App.tsx                  Font loading, navigation stack, dark theme, providers
index.ts                 Entry point (registerRootComponent)
src/
  theme.ts               Design tokens (dark scoreboard palette, Oswald/DM Sans)
  types.ts               Data model
  navigation.ts          Typed route params
  lib/
    stats.ts             ALL stat derivation (box score, standings, leaders, career)
    format.ts            id + formatting helpers
  store/
    storage.ts           AsyncStorage load/save (offline cache)
    StoreProvider.tsx    Context + reducer + autosave + Supabase sync wrapper
    AdminProvider.tsx    Auth gate (Supabase Auth in synced mode, local fallback otherwise)
  sync/
    supabase.ts          Supabase client + SYNC_ENABLED flag (env-var driven)
    sync.ts              Pull initial state, push action → row, realtime subscription
  components/ui.tsx      Screen, Txt, Button, Card, Pill, Field, Segmented, Empty, Toggle
  screens/
    LeaguesScreen.tsx        Home: league list + resume-live banner + lock icon
    SettingsScreen.tsx       Admin-only: Track misses + sync status
    CreateLeagueScreen.tsx
    ManageRosterScreen.tsx   Add teams + players, opponent-as-team toggle
    EditTeamScreen.tsx       Edit a team (name, color, logo) + add/edit/delete its players
    LeagueDetailScreen.tsx   Tabs: Games (by date) / Standings / Leaders / Roster
    GamesOnDateScreen.tsx    Games played on a chosen date (swipe-to-delete)
    NewGameScreen.tsx        Pick home + away
    SelectLineupScreen.tsx   Choose the starting 5 for both teams
    RecGameScreen.tsx        Drop-in game setup (location + ad-hoc teams/players)
    LiveGameScreen.tsx       ⭐ The two-tap stat tracker (lineups, subs, fouls, change-court)
    BoxScoreScreen.tsx       Full box score + quarter line score + play-by-play + share card
    PlayerProfileScreen.tsx  Averages, career highs, badges
supabase/
  schema.sql             Tables, RLS policies, admin password function, ping function
.github/workflows/
  supabase-keepalive.yml Pings Supabase every 3 days to prevent the 7-day auto-pause
```

**Key design decision (from the skill):** box scores and standings are **derived** from the
event log, never stored as source of truth. Editing or deleting a play in the play-by-play
automatically and correctly re-computes everything downstream.

**Offline-first:** every state mutation is written to device storage immediately, so a live
game survives the app being closed or crashing. Open the app and the home screen offers to
resume any game still in progress.

**Multi-device sync (when configured):** the reducer is still the source of truth for UI
state, and AsyncStorage is still written on every change. *Additionally*, each action is
mirrored to Supabase as a row-level upsert/delete, and a Realtime subscription replays
changes from other devices back into the local reducer via HYDRATE. This means a single
device works offline, a flaky-Wi-Fi gym still keeps stats locally, and devices reconverge
on the next successful sync.

## Deploying to the App Store / Play Store

See **DEPLOYMENT.md** for the full step-by-step guide (Apple Developer + Google Play setup,
EAS Build, EAS Submit, store listing, and review notes).
