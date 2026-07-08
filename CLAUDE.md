@AGENTS.md

# Softphone FE — guidance for AI assistants

## What this is

A client-side **WebRTC softphone** (Expo + React Native via **react-native-web**, TypeScript) that
uses **jssip** through a thin adapter to make/receive SIP calls over WSS. It is a developer/testing
tool for debugging SIP / WebSocket / WebRTC, meant to interoperate with Asterisk, Kamailio and
FreeSWITCH. **Web-only** for now (`app.json` → `web.output: "single"`). See `README.md`.

It is a React Native port of the SvelteKit app in `../softphone-frontend`. The SIP core and state
layer were ported almost verbatim; only the UI (Svelte → React) and the store binding changed.

## Conventions (important)

- **Code and comments: English only.**
- **All user-facing strings go through i18n** (`src/lib/i18n.ts`). Add a key to both the `en` and
  `pl` dictionaries and reference it with `t('key', params?)`. React components read the language
  reactively via `const t = useT()`; non-React code (adapter/orchestrator/NetworkMonitor) calls the
  bare `t(...)` at emit time. Default language is **English**; a PL toggle lives in Settings. Do not
  hardcode display strings. (Default profile names in `config.ts`/`profiles.ts` are seed data, kept
  as plain English, not run through i18n.)
- Respond to the user in Polish.

## Commands

```bash
npm run web          # Expo dev server (web)
npm run test         # Vitest unit suite (pure logic)
npx tsc --noEmit     # type check (run after changes; must be 0 errors)
npx expo export -p web   # production web build → ./dist
docker build -t softphone-fe .   # image (nginx serving the SPA)
```

## Environment gotchas

- No SIP backend or microphone is available in the dev sandbox — you can run tests, typecheck and
  build, but **live SIP calls must be tested by the user** in a real browser.
- Microphone needs a **secure context** (HTTPS or `localhost`).

## Architecture

Data flow: **UI (React) → `softphone` orchestrator → `JsSIPAdapter` → jssip**, and back via neutral
`EngineEvent`s the orchestrator maps onto stores that components read with `useStore`.

- `src/lib/store.ts` — dependency-free reactive store with a `svelte/store`-compatible API
  (`writable`/`derived`/`get`). **Not** the Svelte framework. `src/lib/useStore.ts` binds a store to
  a React component via `useSyncExternalStore`.
- `src/lib/sip/*` — engine-agnostic SIP core (ported verbatim): `types.ts`, `config.ts`,
  `stats.ts` (pure `getStats()` parsing), `NetworkMonitor.ts`, `JsSIPAdapter.ts` (**the only module
  that imports jssip**), `softphone.ts` (orchestrator + stores + UI actions).
- `src/lib/{profiles,mediaService,stores,notifications}.ts` — state, ported from the original.
- `src/components/*`, `src/app/*` — React/RN UI + expo-router screens.
- `src/components/RemoteAudio.tsx` — persistent web `<audio>` sink for the remote stream.

## Design rules to preserve

- **Only `JsSIPAdapter` knows jssip.** Keep the rest engine-agnostic via `EngineEvent`.
- **STUN/TURN + ICE policy go into `pcConfig`** (per session), never into the UA config.
- **Connection lifecycle is explicit** — the UA is (re)built only in `connect()`, not on field edits.
- **Remote audio element is persistent** (mounted at the app root), surviving view switches.
- One call at a time: extra incoming sessions are rejected `486 Busy Here`.
- Web-only DOM controls (`<select>`, `<audio>`, `<input type=checkbox>` via `Select`/`RemoteAudio`/
  `Checkbox`) are fine because react-native-web renders on react-dom. When going native, replace
  those and `JsSIPAdapter`/`RemoteAudio` behind the same interfaces.

## Testing

- **Vitest** (`vitest.config.ts`, jsdom). Tests live next to code as `*.test.ts`; `src/test-setup.ts`
  polyfills `localStorage`. Keep heavy logic pure (like `stats.ts`) so it is testable without
  jssip/WebRTC. The orchestrator test mocks `./JsSIPAdapter` and `./NetworkMonitor`.
