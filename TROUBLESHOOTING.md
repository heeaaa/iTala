# Troubleshooting — "Opening project" hangs in Expo Go

If `npx expo start` shows the QR code but Expo Go on your phone gets stuck on
**"Opening the project…"** and times out, the cause is almost always **networking**:
Expo Go downloads the manifest but can't reach the JS bundle because Metro advertised a
`127.0.0.1` / `localhost` address (which on the phone means the phone itself), or your
PC and phone can't reach each other over the LAN (different Wi-Fi, VPN, or firewall).

The app code is fine — this is about how the dev server is reached. Try these in order.

## 1. Tunnel mode (most reliable — fixes it ~90% of the time)
Works even if the phone and PC are on different networks or a VPN/firewall is in the way.

```bash
npm run start:tunnel
# (equivalent to: npx expo start --tunnel -c)
```

The first run asks to install `@expo/ngrok` — accept it. Then scan the QR again.

## 2. Same Wi-Fi + clear cache
Make sure the **phone and computer are on the exact same Wi-Fi network** (not "Guest",
and phone not on cellular). Then:

```bash
npm run start:clear
# (npx expo start -c  — clears a stale Metro cache from earlier attempts)
```

## 3. Force your computer's LAN IP
If LAN mode connects to the wrong address, tell Metro your real IPv4.

1. Find your IPv4 address:
   - **Windows:** run `ipconfig`, look for `IPv4 Address` (e.g. `192.168.1.42`)
   - **macOS:** `ipconfig getifaddr en0`
2. Start with that host:

   **Windows (PowerShell):**
   ```powershell
   $env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.1.42"
   npx expo start --lan -c
   ```
   **Windows (cmd):**
   ```cmd
   set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.42
   npx expo start --lan -c
   ```
   **macOS/Linux:**
   ```bash
   REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.42 npx expo start --lan -c
   ```

## 4. Firewall (Windows)
Windows Defender often blocks Node's LAN access on first run. When the prompt appears,
allow **Node.js** on **Private networks**. If you dismissed it earlier, allow it under
Windows Security → Firewall → Allow an app, or just use tunnel mode (#1).

## Other checks
- Confirm Expo Go is the **SDK 54** build (latest from the App Store / Play Store).
- This project ships with `newArchEnabled: false` — keep it that way for Expo Go.
- A red error screen on the phone is *progress*, not the hang — send the error text.

## Sanity check the server is healthy
With `npx expo start` running, from the **same computer**:
```bash
curl -s -H "expo-platform: ios" http://localhost:8081 | findstr launchAsset   # Windows
curl -s -H "expo-platform: ios" http://localhost:8081 | grep launchAsset      # mac/Linux
```
If the `launchAsset` URL says `127.0.0.1` or `localhost`, that's exactly why the phone
can't load it — use tunnel mode (#1) or force the LAN IP (#3).
