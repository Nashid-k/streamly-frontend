# Streamly — Android app (`mobile/`)

The native Android client. Same product as the web SPA in the repository root,
built with **Expo (SDK 54) + React Native + TypeScript**, playing through
**ExoPlayer** instead of an iframe.

- App label: **Streamly**
- Android package / application id: **`com.streamly.app`**
- Min SDK 24 (Android 7.0) · target SDK 36 · `arm64-v8a` · Hermes

## Why a separate app and not a WebView

The web build plays real content in `NativePlayerView` (native HTML5 `<video>`
+ hls.js) and trailers in a YouTube iframe. Wrapping that site in a WebView
would inherit the browser's playback limits — no `Referer` control per segment,
no landscape lock, no system media session — and would ship a second copy of the
whole catalogue UI. The app therefore re-implements the five core surfaces in
RN and keeps the **data contract and the resolver** shared with the web build.

## Screens

| Screen | File | What it does |
|---|---|---|
| Home | `src/screens/HomeScreen.tsx` | featured hero, Continue Watching rows, four rails (Trending, Now playing, Top rated, Airing today) |
| Search | `src/screens/SearchScreen.tsx` | debounced live TMDB multi-search into a poster grid |
| Details | `src/screens/DetailsScreen.tsx` | backdrop hero, rating/runtime/genre, My List toggle, cast, season chips + episode list with airdates |
| Player | `src/screens/PlayerScreen.tsx` | resolves a stream, plays it in ExoPlayer full-screen (landscape unlocked), saves progress |
| Library | `src/screens/LibraryScreen.tsx` | Continue Watching (with progress bars) + My List, both on-device |
| Settings | `src/screens/SettingsScreen.tsx` | TMDB key / proxy / deployed-URL entry, connection test, diagnostics |

Bottom tabs: Home / Search / Library / Settings. `Details` and `Player` are
pushed on the root stack (`src/navigation/types.ts` is the param contract).

## Playback pipeline (no iframe, no per-segment headers)

```
resolvePlayback(type, id, season, episode)
  └─ POST {EXPO_PUBLIC_API_BASE}/api/downloadify   action: resolvevidcore
       (fallback: resolvevidsrc)                   → { source, variants[] }
  └─ preparePlaybackSource(variants[0].uri)         src/api/relay.ts
       1. GET {EXPO_PUBLIC_RELAY_URL}?url=<manifest>   worker injects Referer/UA
       2. master playlist → pick the best variant ≤ 1080p → recurse (max depth 2)
       3. rewrite every URI line + EXT-X-KEY/MAP/MEDIA URI="…" to a worker URL
       4. write the rewritten manifest to FileSystem cache, return file://…
  └─ <Video source={{ uri: file://… }} />          ExoPlayer (react-native-video)
```

Why the rewrite instead of handing ExoPlayer the manifest URL: the resolved
hosts reject requests without a browser-ish `Referer`/`User-Agent` (and some
reject a browser `Origin`), and `react-native-video` cannot attach headers to
every segment ExoPlayer fetches. The local playlist means the player only ever
talks to the cache file and the worker — the same trick `src/api/nativeHlsLoader.js`
plays in the browser.

`EXPO_PUBLIC_API_BASE` must point at a **deployed** Streamly Vercel project: the
resolver (`api/downloadify.js`) scrapes providers server-side and is
deliberately not bundled into the APK. Without it the catalogue works and
playback shows an explicit "resolver not configured" state.

## Data layer

- `src/api/tmdb.ts` — TMDB REST client. Proxy-first (`/api/tmdb`, which injects
  the server-side key), direct `api.themoviedb.org` fallback, 12s timeout,
  in-flight de-duplication, and a **field-identical `normalizeResult`** to the
  web build (the frozen contract in `architecture.md` §2).
- `src/config.ts` — two-layer config resolver (`getConfig()`), env first,
  on-device settings overriding.
- `src/store/settings.tsx` — runtime settings (AsyncStorage + a module mirror so
  non-React modules can read them synchronously).
- `src/api/relay.ts` — Cloudflare passthrough + playlist rewrite (above).
- `src/api/streams.ts` — `resolveVidcore` / `resolveVidsrc` / `resolveBest` /
  `resolvePlayback` against the deployed resolver.
- `src/store/userData.tsx` — AsyncStorage persistence: `streamly.mobile.myList`,
  `streamly.mobile.continueWatching` (namespaced, because the web
  `aios_*` localStorage keys are frozen for the browser).
- `src/utils/logger.ts` — every diagnostic is a `[Streamly][scope]` line. On a
  phone the console is `adb logcat`, which is the equivalent of devtools.

## Configuration: two layers, device wins

| Layer | Where | When it applies |
|---|---|---|
| **Runtime** | Settings tab on the phone → AsyncStorage `streamly.mobile.settings` | read at **request** time, highest priority |
| **Build-time** | `EXPO_PUBLIC_*` in `mobile/.env`, inlined by Metro | the default for a blank field |

The runtime layer exists because an installed APK has no `.env`: telling someone
to edit a file on a build machine to make an app show a catalogue is a dead end,
and a "TMDB is not configured" wall on first launch reads as a broken app. The
`Settings` screen takes a TMDB read key, a `/api/tmdb` proxy URL, or — the
single-value shortcut — the deployed Streamly URL, and everything downstream
(`api/tmdb.ts`, `api/streams.ts`, `api/relay.ts`) calls `getConfig()` per request
instead of reading module constants. Saving takes effect immediately: Home and
Search re-query on the config tick, with no restart and no rebuild. A wrong value
is corrected the same way.

A TMDB key is a public read token (it is already readable inside any web
bundle), and the `/api/tmdb` proxy is offered first so a user can stay keyless.

### Env vars (build-time defaults)

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_TMDB_API_KEY` | one of… | direct TMDB access |
| `EXPO_PUBLIC_TMDB_PROXY` | …these | keyless alternative (`…/api/tmdb`) |
| `EXPO_PUBLIC_API_BASE` | for playback | deployed site origin: resolver + TMDB proxy |
| `EXPO_PUBLIC_RELAY_URL` | no | Cloudflare passthrough (default: the project's worker) |
| `EXPO_PUBLIC_DEBUG` | no | `1` = also emit `[Streamly]` info logs |

## Commands

```bash
npm install                 # in mobile/
npm run typecheck           # tsc --noEmit
npm start                   # Metro (needs a device/emulator attached)
npm run android             # build + install a debug build via adb
npm run prebuild:android    # regenerate android/ from app.json (--clean)
npm run apk                 # prebuild + assembleRelease → the installable APK
```

### Building the APK on a small machine

`assembleRelease` on a 4-core / 8 GB laptop is workable **only** with the tuning
already committed in `android/gradle.properties`: one ABI, `parallel=false`,
`workers.max=2`, Kotlin in-process, no daemon, `vfs.watch=false`, 2.5 GB heap.
Add the Gradle home on a roomier drive (the default `C:\Users\<you>\.gradle`
needs ~9 GB for its cache):

```powershell
$env:GRADLE_USER_HOME = "D:\gradle-home"
cd android; .\gradlew.bat assembleRelease --no-daemon
```

Reference build on a Dell Latitude 5400 (i5-8365U, 7.8 GB RAM): **25m 8s**,
`app-release.apk` **27.2 MB**, 429 tasks. The release variant signs with the
debug keystore (RN template default) so it installs anywhere; use a real
keystore for a store release.

## Verification performed

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean, 0 errors |
| `npx expo export --platform android` | bundled, 889 modules |
| `gradlew assembleRelease` | BUILD SUCCESSFUL, 25m 8s |
| APK badging | `com.streamly.app` 1.0.0, label `Streamly`, minSdk 24 / targetSdk 36, `arm64-v8a` |

There is **no unit-test runner in `mobile/`** (the web build's vitest suites
target the DOM). Say so rather than claiming a test pass; the gates above are
what the app is verified with today.

## Not in the app (yet)

Offline downloads, subtitles/audio-track switching, OMDb/RT ratings cluster,
genre + category browsing, person pages, regional Indian rails, cloud sync, and
quality switching inside the player. The web build remains the full-featured
surface; this app is the phone-shaped core loop.
