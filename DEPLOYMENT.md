# Deploying iTala to the App Store & Google Play

This guide takes the project from source code to live in both stores using **EAS**
(Expo Application Services) — Expo's hosted build + submit pipeline. EAS lets you build iOS
apps **without a Mac**, since the compile happens on Expo's cloud macOS machines.

> Verified against the current process as of mid-2026 (Expo SDK 55 era, EAS CLI ≥ 16). Fees and
> store policies change — confirm anything money- or policy-related on the official pages linked
> at the bottom before you rely on it.

---

## 0. Prerequisites & costs

| What you need | Cost | Notes |
|---|---|---|
| Apple Developer Program | **$99 / year** | Required to ship to the App Store / TestFlight. |
| Google Play Developer account | **$25 one-time** | Required to ship to Google Play. |
| An Expo account | Free | Sign up at expo.dev. |
| Node.js 20+ and this repo | Free | `npm install` already run. |

**Two policy gotchas that will bite you if you don't plan for them:**

1. **Google Play 12-testers rule.** If your Google Play account is a **personal** account created
   after Nov 13, 2023, you cannot publish to production until you've run a **closed test with at
   least 12 testers opted in for 14 continuous days**. Organization accounts are exempt. Plan two
   extra weeks, or register as an organization. Start recruiting testers on day one.
2. **Apple privacy details.** App Store Connect makes you fill in "privacy nutrition labels."
   Since iTala offers Google/Apple sign-in backed by Supabase, it **does collect data**: declare
   **Contact Info → Email Address** and **Name** (and the Google **profile photo** under
   Identifiers/User Content as applicable), all *linked to the user*, purpose *App Functionality*,
   not used for tracking. Guests contribute no personal data. Answer Google Play's Data safety
   form the same way. Declaring "Data Not Collected" while shipping a login is itself a
   rejection/removal reason — keep these truthful.
3. **Sign-in feature compliance (already implemented in this codebase).** Because the app offers
   Google sign-in: (a) iOS must also offer **Sign in with Apple** (Guideline 4.8) — included, via
   `expo-apple-authentication`; enable the Apple provider in Supabase per `AUTH_SETUP.md` before
   submitting; (b) both stores require **in-app account deletion** — included, in Settings →
   Danger zone (backed by the `delete_own_account` function in `supabase/schema.sql`; re-run the
   schema so it exists). Also set the Supabase **Site URL** to `itala://auth-callback` for
   production builds.

---

## 0.5. (Optional) Multi-device sync via Supabase

If you'll run more than one device live at the same time — e.g. two scorekeepers at two
courts, plus people watching — set this up before shipping. Without it, each device's data
stays on that device.

### Provision the database

1. Create a project at <https://supabase.com>. The free tier covers two simultaneous live
   games with spectators easily (500 MB database, 200 concurrent realtime connections, 2M
   realtime messages/month).
2. In Project Settings → Authentication → Providers → **Anonymous**, toggle it **on**.
   This is what lets a spectator's phone get a session without account creation.
3. Open SQL Editor → New query, paste the contents of `supabase/schema.sql` from this repo,
   and Run. It's idempotent — safe to re-run.
4. *(Recommended)* Change the admin password from its default. In SQL Editor:
   ```sql
   update public.admin_secret set password = 'pick-something-long' where id = 1;
   ```
   The password lives in a table with NO read policies, so even with the anon key nobody can
   SELECT it — only the `elevate_to_admin` security-definer function can compare against it.

### Configure the app

Copy `.env.example` to `.env` and fill in your project URL and anon key (Project Settings →
API). For EAS builds, set these as **EAS Secrets** so they're injected at build time:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://YOURPROJECT.supabase.co
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJhbGciOi...
```

The anon key is safe to ship in the binary — row-level security on the database is what
actually protects writes. Only authenticated admins (the `is_admin` flag flipped by the
password RPC) can INSERT/UPDATE/DELETE; anonymous spectators can only SELECT.

### Keep the project from auto-pausing

Supabase free projects pause after 7 days of inactivity. For a weekly Saturday league, this
will absolutely bite you mid-season. The repo includes `.github/workflows/supabase-keepalive.yml`,
a GitHub Action that pings the database every 3 days.

To enable it:
1. Push this repo to GitHub.
2. Repo Settings → Secrets and variables → Actions → New repository secret. Add:
   - `SUPABASE_URL` = `https://YOURPROJECT.supabase.co`
   - `SUPABASE_ANON_KEY` = your anon key
3. Actions tab → "Supabase keep-alive ping" → Run workflow once to verify it works
   (it should print `HTTP 200`).

If you don't want to use GitHub, point a free uptime monitor (UptimeRobot, Cronitor, etc.) at:
`POST https://YOURPROJECT.supabase.co/rest/v1/rpc/ping` with the headers
`apikey: <anon>` and `Authorization: Bearer <anon>`, body `{}`, anything weekly or more often.

### How to verify it's working

After setup, on each device open Settings (admin only) — the Sync card should say
**● Connected**. Open the app on two devices, unlock admin on both, start a game on one,
and watch stats appear on the other within a second.

### Known tradeoffs

- **Last write wins.** Two scorekeepers should not be on the same game at the same time.
  If they are, the later write overwrites the earlier. Different games — including the two
  parallel-court use case — never collide.
- **One admin password for all admins.** Suitable for a small trusted scorekeeper crew. If
  you need per-user accounts later, replace the `elevate_to_admin` RPC with Supabase email
  auth and put the `is_admin` flag on individual profiles.
- **The lock icon re-locks only the current device.** Other devices stay admin until their
  own users tap their lock icon.

---

## 1. One-time project prep

### 1a. Expo SDK
This project targets **Expo SDK 54** (React Native 0.81 / React 19), which runs in the current
Expo Go. That's recent enough for store submission today. If a newer SDK has shipped by the time
you submit and you want to move up, run:

```bash
npm install expo@latest
npx expo install --fix     # realigns every native dependency to the new SDK
npx expo-doctor            # sanity-check the project
```

### 1b. Set your real bundle identifiers
The app ships with `com.bpbl.itala` in **both** `ios.bundleIdentifier` and
`android.package`. To publish under your own account, replace it with your reverse-domain id
(e.g. `com.yourname.itala`). This id is
permanent once published — choose carefully.

### 1c. Install the EAS CLI and log in
```bash
npm install -g eas-cli      # or use `npx eas-cli@latest` everywhere below
eas login
```

### 1d. Link the project to EAS
```bash
eas init
```
This creates/links an EAS project and writes the real `projectId` into `app.json`
(replacing the `REPLACE_WITH_YOUR_EAS_PROJECT_ID` placeholder). The included `eas.json`
already defines `development`, `preview`, and `production` build profiles.

---

## 2. Test on real devices first (do not skip)

``` bash
# If you have a zip file of the workspace, unzip and merge automatically using these
Expand-Archive -Path iTala-project.zip -DestinationPath itala-incoming -Force
robocopy itala-incoming\iTala iTala /MIR /XD .git node_modules
cd iTala
```

A simulator hides real-device issues (fonts, share sheet, storage). Build an internal-distribution
binary and install it on your phone:

```bash
# Android — produces an installable .apk you can sideload
eas build --platform android --profile preview

# iOS — installs via the QR/link on devices registered to your Apple account
eas build --platform ios --profile preview
```

Walk the full "definition of done": create a league, add two teams + players, start a game,
log a quarter of stats with the two-tap pad, finish, check standings/leaderboard, and tap
**Share box-score card**. Confirm it all works in airplane mode (offline-first), then kill and
reopen the app to confirm the **resume-live-game** banner appears.

---

## 3. Build for production

```bash
# Build both platforms at once
eas build --platform all --profile production
```

EAS handles signing credentials for you the first time (let it generate and manage them — say yes
to the prompts). For iOS it creates a distribution certificate + provisioning profile; for Android
it generates an upload keystore. Builds run in the cloud; you'll get a link to each artifact
(.ipa for iOS, .aab for Android).

---

## 4. Apple App Store submission

### 4a. Create the app record in App Store Connect
1. Go to App Store Connect → **Apps → + → New App**.
2. Platform iOS, pick your bundle id, set the name "iTala" (must be globally unique — have a
   backup like "iTala — Stat Tracker" ready).
3. After creating it, open **General → App Information** and copy the **Apple ID** number — that's
   your `ascAppId`. Paste it into `eas.json` under `submit.production.ios.ascAppId` (optional but
   makes submits non-interactive).

### 4b. Submit the build
```bash
eas submit --platform ios --profile production --latest
```
EAS uploads the build to App Store Connect. After processing (10–30 min) it appears under
**TestFlight** and is selectable for App Store review.

### 4c. Complete the listing, then submit for review
In App Store Connect fill in: description, keywords, support URL, **screenshots** (6.7" iPhone
required — capture from a device or simulator), the **privacy nutrition labels** (email address,
name, and photo — linked to the user, App Functionality, no tracking; see prerequisite gotcha #2),
age rating, and category (**Sports**). Attach the build, then **Submit for Review**.
Apple review typically takes 1–3 days.

**Likely reviewer questions for this app:** the reviewer must be able to exercise sign-in and see
real content. In the Review Notes, explain the three roles (guest / signed-in / admin), note that
any Google or Apple account can sign in, and provide the backup admin password plus the hidden
gesture (tap the iTala wordmark 10×) so admin features can be verified. Pre-seed a demo league so
guest browsing isn't empty. There are no payments and no user-generated network content beyond
account profiles. If you later add the social feed, you'll need a way to
moderate/report content (Apple requires it for UGC).

---

## 5. Google Play submission

### 5a. Create the app + first manual upload
Google requires your **first** upload to be done by hand before EAS API submissions work.
1. Google Play Console → **Create app** → name "iTala", category **Sports**, free.
2. Build the Android binary if you haven't: `eas build --platform android --profile production`,
   then download the `.aab` from the EAS build page.
3. In Play Console go to **Testing → Closed testing → Create release**, upload the `.aab`, and roll
   it out to your closed-testing track.

### 5b. Run closed testing (the 12-testers / 14-days gate)
1. Add at least **12 testers** (their Google account emails) to the closed test and share the
   opt-in link.
2. They must install via the link and **stay opted in for 14 continuous days**. Shipping a small
   update during the window is a positive signal to Google and doesn't reset the clock.
3. After 14 days, the Console **Dashboard** shows an **"Apply for production access"** action.
   Fill out the short questionnaire about your testing.

### 5c. Set up API submissions for future updates
Create a **Google Service Account Key** (Play Console → Setup → API access) and save the JSON.
Point `eas.json` at it, e.g.:
```json
"submit": { "production": { "android": { "serviceAccountKeyPath": "./play-service-account.json", "track": "production" } } }
```
Then future releases are one command:
```bash
eas submit --platform android --profile production --latest
```
> Keep the service-account JSON out of git — add it to `.gitignore`.

### 5d. Production release
Once production access is granted, promote the build to the **Production** track, complete the
store listing (description, screenshots, feature graphic, **Data safety form** = no data
collected/shared), content rating questionnaire, and submit. Google review is usually hours to a
couple of days.

---

## 6. Shipping updates afterward

For each new version:
1. Bump `version` in `app.json` (e.g. `1.0.0` → `1.0.1`). EAS auto-increments the native
   build/version codes because `eas.json` production has `autoIncrement: true`.
2. `eas build --platform all --profile production`
3. `eas submit --platform all --profile production --latest`

For JS-only changes (no native modules added), you can push instant **over-the-air updates** with
`eas update` instead of a full store resubmission — add `expo-updates` and run
`eas update:configure` first.

You can also combine build + submit in one step with `eas build --platform all --auto-submit`.

---

## 7. Pre-submission checklist

- [ ] Real bundle identifiers set in `app.json` (not `com.yourcompany.*`)
- [ ] App icon (1024²) and splash present in `assets/` — included; swap for your own branding if desired
- [ ] Tested on a physical iPhone **and** Android phone via a `preview` build
- [ ] Verified offline use + resume-live-game
- [ ] Screenshots captured for both stores
- [ ] Apple privacy labels + Google Data safety form declare email/name/photo (App Functionality, linked to user, no tracking)
- [ ] Apple provider enabled in Supabase (bundle ID `com.bpbl.itala` in Client IDs) — Sign in with Apple works on a device build
- [ ] Remove `host.exp.Exponent` from the Apple provider's Client IDs — it's a dev-only entry that lets Apple sign-in work inside Expo Go; real builds present `com.bpbl.itala` and must not keep the Expo Go audience allowlisted
- [ ] Settings → Delete account verified end-to-end on a build (schema re-run so `delete_own_account` exists)
- [ ] Supabase Site URL set to `itala://auth-callback` (not a dev exp:// URL)
- [ ] Category set to **Sports**; age rating completed
- [ ] (Google personal account) 12 testers recruited for the 14-day closed test

---

## Official references
- EAS Build: https://docs.expo.dev/build/introduction/
- EAS Submit: https://docs.expo.dev/submit/introduction/
- Submit to the App Store: https://docs.expo.dev/submit/ios/
- Submit to Google Play: https://docs.expo.dev/submit/android/
- Google Play testing requirements: https://support.google.com/googleplay/android-developer/answer/14151465
- Apple Developer Program: https://developer.apple.com/programs/
