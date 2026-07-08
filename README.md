# Softphone FE (React Native / Expo Web)

A developer/testing **WebRTC softphone** built with **Expo + React Native (react-native-web)**
and [JsSIP](https://jssip.net/). It places and receives SIP calls over secure WebSocket (WSS),
supports STUN/TURN, and interoperates with **Asterisk**, **Kamailio** and **FreeSWITCH**.

This is the React Native re-implementation of the original SvelteKit softphone. It targets the
**web** (react-native-web on react-dom) so the browser WebRTC stack (`RTCPeerConnection`,
`getUserMedia`, `getStats()`) and jssip work unchanged, and the app ships as a Docker image.

> The UI is in Polish; all code and comments are in English. It is a **tool for developers** to
> debug SIP / WebSocket / WebRTC — not a mass-market app.

## Features

- **Outgoing & incoming audio calls** over SIP/WSS.
- **Multiple account profiles** with one-click switching (test several backends fast).
- **GUI configuration** of everything: SIP URI, credentials, WS servers, STUN/TURN (with
  credentials), and **ICE transport policy** (`all` / `relay`).
- **Smart recovery**: ICE restart on network change (WiFi ↔ LTE), ICE restart on ICE failure
  (debounced), automatic WebSocket reconnect.
- **Live diagnostics panel**: WS state, registration, ICE connection/gathering state, the selected
  media path (`host`/`srflx`/`relay`), live RTP metrics (codec, jitter, packet loss, RTT, in/out
  bitrate), an ICE-restart counter, and a SIP/WebRTC event log. Always visible as a sidebar on
  desktop; available at `/diagnostics` on narrow screens.
- In-call controls: mute, hold, DTMF (RFC2833 or SIP INFO), blind transfer.
- Microphone selection + input level meter, call history.

## Tech stack

- **Expo SDK 57**, **React Native 0.86**, **react-native-web**, **expo-router**, **TypeScript**
- **jssip ^3.10** for SIP signalling and WebRTC
- A tiny dependency-free reactive store (`src/lib/store.ts`) + a `useStore` hook — the state layer
  and the SIP orchestrator are ported from the original almost verbatim.

The app runs **client-side only** (`app.json` → `web.output: "single"`, an SPA), because it relies
on WebRTC, `getUserMedia`, jssip and `localStorage`.

## Getting started

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run web          # Expo dev server (web) — opens http://localhost:8081
```

Other scripts:

```bash
npm run test         # Vitest unit suite (pure logic: SIP core + state)
npm run test:watch   # Vitest watch mode
npx tsc --noEmit     # type check
npx expo export -p web   # production web build → ./dist
```

> Microphone access needs a **secure context**: HTTPS, or `localhost` during development.

## Testing

Unit tests use **Vitest** (jsdom) and focus on the pure, deterministic logic so they run without a
browser, microphone or SIP backend:

- `src/lib/sip/stats.test.ts` — `getStats()` parsing (ICE pair + RTP metrics, bitrate deltas).
- `src/lib/sip/config.test.ts` — default profile, normalization, legacy migration, config builders.
- `src/lib/profiles.test.ts` — profile CRUD and initialization.
- `src/lib/sip/softphone.test.ts` — orchestrator: engine-event → store mapping (jssip mocked).

```bash
npm run test
```

## Docker

Multi-stage build: `expo export -p web` produces the static SPA, which nginx serves with an
SPA fallback. The app is served under **`/app`** (Expo `experiments.baseUrl`), so it can sit behind
a reverse proxy next to other, unrelated routes.

```bash
docker compose up --build -d
# open http://localhost:8080/app/
```

or without compose:

```bash
docker build -t softphone-fe .
docker run --rm -p 8080:80 softphone-fe
# open http://localhost:8080/app/
```

`docker-compose.yml` bind-mounts the full `nginx.conf` (`./nginx.conf:/etc/nginx/nginx.conf:ro`), so
you can tweak the server config without rebuilding — only the app bundle is baked into the image
(under `/usr/share/nginx/html/app`). `nginx.conf` is a complete main config (events + http) and
ships a secure TLS policy (`TLSv1.2`/`TLSv1.3`, hardened ciphers) plus a commented-out `listen 443`
HTTPS server block you can enable by adding a certificate.

### Behind a reverse proxy

The container serves the app at `/app/` and expects the `/app` prefix to be **forwarded unchanged**
(the asset/route URLs are baked with that prefix). A minimal outer nginx:

```nginx
location /app/ {
    proxy_pass http://softphone:80;   # no URI part → path (incl. /app) is preserved
}
```

Other unrelated routes on the same proxy are unaffected. To serve under a different base, change
`experiments.baseUrl` in `app.json` **and** the `/app` locations in `nginx.conf`, then rebuild.

> For real microphone access behind a proxy, terminate **HTTPS** in front (or use `localhost`).
> The bundled `nginx.conf` long-caches the content-hashed assets under `/app/_expo/`.

## Configuration

Open **Ustawienia** (gear icon). Configuration is stored in the browser's `localStorage` as one or
more **profiles**.

1. Create or select a profile.
2. Fill in **SIP URI** (`sip:1001@sip.example.com`), **password**, and **WebSocket servers**
   (one per line, e.g. `wss://sip.example.com:8089/ws`).
3. (Optional) Add **STUN/TURN** servers. For TURN, fill username + credential.
4. Choose the **ICE transport policy**: `all` (host + srflx + relay) or `relay` (force TURN).
5. Click **"Zapisz i połącz"** (Save & connect).

### Interop defaults

The default profile is tuned to work across Asterisk / Kamailio / FreeSWITCH: session timers off,
DTMF RFC2833, `bundlePolicy: max-bundle`, `rtcpMuxPolicy: require`, register expires 600 s. All
adjustable per profile under **Advanced**.

## Verifying a real call

There is no SIP backend bundled here. To test end-to-end:

1. Point a profile at your server and **Save & connect**.
2. In `/diagnostics`, confirm **WS: connected** and **registration: registered**.
3. Call an echo test (Asterisk `*43`, FreeSWITCH `9196`, or your loopback extension). You should
   hear two-way audio.
4. To verify TURN/relay: set ICE policy to `relay` with a working TURN server — the diagnostics
   "media path" should read **relay**.
5. To verify smart recovery: during a call toggle the network — an **ICE restart** entry appears in
   the log and audio recovers.

## Project structure

```
src/
  app/                     # expo-router screens
    _layout.tsx            # root Stack + persistent RemoteAudio & toasts + startup init
    index.tsx              # dialer + in-call view + desktop diagnostics sidebar
    settings.tsx           # profile editor
    diagnostics.tsx        # live diagnostics panel
    history.tsx            # call history
  components/              # Dialpad, NumberDisplay, CallView, IncomingCallScreen,
                           # DiagnosticsPanel, ProfileSwitcher, NotificationDisplay,
                           # RemoteAudio (web audio sink), Icon, Select, Checkbox
  lib/
    sip/
      types.ts             # SIP/WebRTC domain types
      config.ts            # default profile, migration, UA/RTC config builders
      JsSIPAdapter.ts      # the only module that talks to jssip
      NetworkMonitor.ts    # network-change detection
      stats.ts             # pure getStats() parsing
      softphone.ts         # orchestrator + stores + UI actions
    store.ts               # tiny reactive store (svelte/store-compatible API, no Svelte dep)
    useStore.ts            # React hook binding a store to a component
    profiles.ts            # persistent profile list + active profile, CRUD
    mediaService.ts        # getUserMedia, device enumeration, mic level meter
    stores.ts              # UI stores (dialed number, call state, history, …)
    notifications.ts       # toast store
  theme.ts                 # design tokens (dark palette, spacing, radii)
```

## Architecture notes

- **Adapter pattern.** `JsSIPAdapter` is the only place that knows jssip. It translates jssip/WebRTC
  events into neutral `EngineEvent`s. The `softphone` orchestrator consumes those and drives the
  stores the UI binds to (via `useStore`). Swapping the SIP engine later means rewriting one file.
- **STUN/TURN + ICE policy live in `pcConfig`** (per session via `buildRtcConfiguration`), never in
  the jssip UA configuration.
- **Explicit lifecycle.** Connecting/registering happens on an explicit `connect()` — editing a form
  field does not re-create the UA.
- **Remote audio** is a single persistent `<audio>` sink (`components/RemoteAudio.tsx`) mounted at
  the app root, so playback survives the dialer ↔ in-call view switch.
- **One call at a time**: additional incoming sessions are rejected `486 Busy Here`.
- **Web-only today.** Going native later means swapping `JsSIPAdapter`/`RemoteAudio` for
  react-native-webrtc behind the same interfaces; the orchestrator, state and screens stay.
