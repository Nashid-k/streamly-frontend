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
| Settings | `src/screens/SettingsScreen.tsx` | connection status + diagnostics; *Advanced connection options* holds the optional overrides |

Bottom tabs: Home / Search / Library / Settings. `Details` and `Player` are
pushed on the root stack (`src/navigation/types.ts` is the param contract).

## Playback pipeline (no iframe)

```
resolvePlayback(type, id, season, episode)
  └─ POST {apiBase}/api/downloadify        action: resolvevidcore
       (fallback: resolvevidsrc)          → { source: {kind,url,refUrl}, variants[] }
  └─ pickSmooth(variants)                  tallest rendition ≤ 1080p
  └─ probeDirect(uri, source.refUrl)       src/api/relay.ts — one bounded GET
       ok → <Video source={{uri, headers:{Referer,User-Agent}}} />   ExoPlayer
       refused → preparePlaybackSource(uri)  (relay fallback, below)
            1. GET {relayUrl}?url=<manifest>    worker injects Referer/UA
            2. master → best variant ≤ 1080p → recurse (max depth 2)
            3. rewrite every URI line + EXT-X-KEY/MAP/MEDIA URI="…" to a worker URL
            4. write the rewritten manifest to the FS cache, return file://…
            → <Video source={{uri: file://…}} />
```

**Direct first, relay second.** The measured facts (`npm run smoke:mobile` pins
all of them): a bare fetch of a resolved manifest gets **403**, the same fetch
with `Referer: https://vidcore.io/` gets a real 188 KB `#EXTM3U`, and the first
segment then returns **206 with `video/mp4` bytes**. `react-native-video` passes
`source.headers` into ExoPlayer's data-source factory, so those headers reach the
manifest *and* every segment and key load — which means no rewriting is needed at
all on the common path, and the app depends on one less piece of infrastructure.
The relay rewrite stays as the fallback for hosts that refuse the header approach.

The resolver is deliberately not bundled: `api/downloadify.js` scrapes providers
server-side. The app therefore needs a reachable deployment, which
`DEPLOYED_API_BASE` provides — a fork or self-hosted copy overrides it in Settings
or `.env`.

## Data layer

- `src/api/tmdb.ts` — TMDB REST client. Proxy-first (`/api/tmdb`, which injects
  the server-side key when the client omits one), direct `api.themoviedb.org`
  fallback **only when a key is actually configured**, per-leg timeouts, one
  retry, circuit breakers, in-flight de-duplication, and a **field-identical
  `normalizeResult`** to the web build (the frozen contract in `architecture.md` §2).
- `src/api/cache.ts` — the durable response cache: one JSON blob under
  `streamly.mobile.cache`, newest-first, 60 entries / 512 KB each, batched writes.
  This is what makes a relaunch instant; see *Speed* below.
- `src/config.ts` — `getConfig()`: runtime settings > `EXPO_PUBLIC_*` env >
  `DEPLOYED_API_BASE`. Also owns the timeout/TTL/breaker constants.
- `src/store/settings.tsx` — runtime settings (AsyncStorage + a module mirror so
  non-React modules can read them synchronously).
- `src/hooks/useWarmup.ts` — one 57-byte `/configuration` call at app start, so DNS
  + TLS are already paid before the first rail is asked for.
- `src/api/relay.ts` — `probeDirect` + `playbackHeaders` (the primary path), the
  Cloudflare playlist rewrite as the fallback, and a 5-minute unhealthy-relay
  window so a dead worker is not re-probed on every play.
- `src/api/streams.ts` — `resolveVidcore` / `resolveVidsrc` / `resolveBest` /
  `resolvePlayback` against the deployed resolver, plus `pickSmooth`.
- `src/store/userData.tsx` — AsyncStorage persistence: `streamly.mobile.myList`,
  `streamly.mobile.continueWatching` (namespaced, because the web
  `aios_*` localStorage keys are frozen for the browser).
- `src/utils/logger.ts` — every diagnostic is a `[Streamly][scope]` line. On a
  phone the console is `adb logcat`, which is the equivalent of devtools.

## Speed: why the catalogue is instant, and why it used not to be

Measured against the deployed origin, from the real client:

| | requests | time |
|---|---|---|
| Cold install, 4 rails in parallel | 4 | 422 ms |
| **Relaunch (same rails)** | **0** | **11 ms** |
| Search, first time | 1 | 95 ms |
| **Search, same query again** | **0** | **1 ms** |

Five things produce that, and each one replaced a specific defect:

1. **A durable cache with stale-while-revalidate** (`src/api/cache.ts`). Freshness
   windows: rails 15 min, search 5 min, details 30 min, config 24 h; anything
   older than 24 h is dropped. A stale-but-usable answer is returned immediately
   and refreshed in the background, so the catalogue is on screen *before* the
   request is even sent. Before this, every launch and every back-and-forth into
   Details re-paid the network for answers the app had already had.
2. **Direct TMDB is only tried when a key exists.** The old guard was
   `if (!tmdbApiKey && !tmdbProxy)`, so in the shipped keyless config a failed
   proxy request fell straight through to `api.themoviedb.org` with no `api_key` —
   a request that could never succeed, on a host that is DNS-blocked on plenty of
   networks. On such a network that doubled the wait on every rail and produced
   the "search failed after 12000ms" report.
3. **Per-leg timeouts** — 20 s for the primary route, 4 s for the fallback, so a
   bonus route can never eat the budget — plus **one retry** for the failures that
   are usually transient (timeout, network, 429, 5xx) and none for the ones that
   are not (401/404).
4. **Circuit breakers.** A route that fails is skipped for 5 min (direct) / 30 s
   (proxy), and a *successful* call clears the window, so a recovery is picked up
   without a rebuild. The relay gets the same treatment in `relay.ts`.
5. **A warm connection** (`useWarmup`) plus `useResource` keeping existing content
   during a refresh — a revalidation that fails leaves the screen alone and says
   so in the log instead of replacing it with an error.

## Configuration: pre-wired, with an escape hatch

**There is nothing to configure.** A release APK ships with the deployed Streamly
origin baked in (`DEPLOYED_API_BASE` in `src/config.ts`), so installing it is the
whole onboarding:

| Need | Comes from | Why it is safe to bake in |
|---|---|---|
| Catalogue | `<origin>/api/tmdb` | a public read proxy; `api/tmdb.js:78-100` injects `TMDB_API_KEY` **only when the client omits one**, so the app sends no key and the APK contains no credential |
| Playback | `<origin>/api/downloadify` | the resolver scrapes providers server-side and therefore cannot be bundled at all |

That is the same trick the website uses — a visitor never sees a key — applied to
a binary you cannot hand out a `.env` with.

Three layers exist anyway, for forks and self-hosted copies, highest first:

1. **Runtime** — Settings › *Advanced connection options*, AsyncStorage
   `streamly.mobile.settings`.
2. **Build-time** — `EXPO_PUBLIC_*` in `mobile/.env` (see `.env.example`).
3. **Shipped default** — `DEPLOYED_API_BASE`, then `DEFAULT_RELAY_URL`.

`getConfig()` resolves at **request** time, so a change in layer 1 or 2 applies to
the next call with no restart and no rebuild; Home and Search re-query on the
config tick.

### Env vars (build-time overrides only)

| Variable | Needed? | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_BASE` | no | different deployment origin (resolver + TMDB proxy) |
| `EXPO_PUBLIC_TMDB_PROXY` | no | different catalogue proxy |
| `EXPO_PUBLIC_TMDB_API_KEY` | no | bypass the proxy and hit TMDB directly |
| `EXPO_PUBLIC_RELAY_URL` | no | playback fallback worker |
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
| `npm run smoke:mobile` (repo root) | **13/13** against the live deployment: 6 catalogue paths, the resolver contract, `pickSmooth`, direct-manifest-with-Referer (403 → 200 `#EXTM3U`), first segment 206 `video/mp4` |
| `npm run probe:latency` (repo root) | every catalogue path, cold (cache-busted) and warm: cold avg **624 ms**, max 1343 ms; warm avg **381 ms**; a 4-rail cold Home in parallel **978 ms** — i.e. the backend was never the problem |
| `npx vitest run mobile/src/api/tmdb.cache.test.js` (repo root) | **9/9** — no keyless direct fallback, per-leg timeout text, proxy-then-direct order with a key, concurrent dedup, cache hit, stale-while-revalidate, cache survives a relaunch, retry policy |
| `npx tsc --noEmit` | clean, 0 errors |
| `npx expo export --platform android` | bundled, 889 modules |
| `gradlew assembleRelease` | BUILD SUCCESSFUL, 25m 8s cold / ~2 min incremental |
| APK badging | `com.streamly.app` 1.0.0, label `Streamly`, minSdk 24 / targetSdk 36, `arm64-v8a` |
| `npm run lint` / `npm test` / `npm run build` (web) | 0 errors · **672/672** · OK |
| Catalogue timings, real client, live origin | cold 4 rails **422 ms** / 4 requests · relaunch **11 ms** / **0 requests** · search 95 ms → **1 ms** |

`smoke:mobile` exists because the app's dependencies are **remote contracts**:
the TMDB proxy injects a key, the resolver returns a `source`/`variants` shape,
and the source hosts 403 anything without the right `Referer`. Those can all
change without a line of app code changing, and a silent break would only show up
as an empty rail or a black player on someone else's phone. It is a network test,
so run it before blaming the app.

`tmdb.cache.test.js` is the one piece of app code with real unit coverage. It
lives in `mobile/` but is **executed by the repository's root vitest** (`npm test`
from the repo root), which is what can resolve the mobile modules and stub the
single native import they pull in — `mobile/` still has no test runner of its own,
so nothing here should be read as "the app is unit tested"; it is the caching,
retry and routing logic that regresses silently, and that is what is covered.

## Not in the app (yet)

Offline downloads, subtitles/audio-track switching, OMDb/RT ratings cluster,
genre + category browsing, person pages, regional Indian rails, cloud sync, and
quality switching inside the player. The web build remains the full-featured
surface; this app is the phone-shaped core loop.
