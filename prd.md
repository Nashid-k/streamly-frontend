# Streamly — PRD (Product Requirements Document)

> Single source of product truth for every agent (opencode, Claude, Codex,
> Antigravity, Cursor, freebuff, anything). Read this + `architecture.md` +
> `vibecoder.md` + `task.md` before touching code.

## 1. What this is

**Streamly** is a Netflix-style browse-and-watch product shipped on **two
surfaces from one repo**:

- **`/` — the web SPA** (React + Vite, deployed to Vercel). No active backend:
  catalog data comes from TMDB (same-origin `/api/tmdb` proxy, direct fallback),
  ratings are enriched via OMDb, images via TMDB CDN, and playback runs through
  third-party iframe stream servers. Personal state (My List, Continue
  Watching, history, preferences) lives in **localStorage**.
- **`mobile/` — the Android app** (Expo + React Native + TypeScript, package
  `com.streamly.app`, installable APK). Same catalogue contract and same
  deployed resolver, but a **real native player** (ExoPlayer via
  `react-native-video`) instead of iframes, and AsyncStorage instead of
  localStorage.

Both surfaces read from the same deployed serverless functions and the same
`normalizeResult` domain contract; neither owns a database.

## 2. For whom

- **Viewers** browsing movies / TV on desktop + mobile who want one fast,
  dark, cinematic catalog with hero rotation, rails, search, and resume.
- **Maintainers/agents** who must keep every data failure visible in the
  browser console (see `src/utils/debugLogger.js` — every empty rail, failed
  query, broken image, and storage error is logged with a `[Streamly][scope]`
  prefix).

## 3. Top 5 features (ranked — build/protect in this order)

1. **Home discovery (hero + rails)** — `src/pages/HomePage.jsx`. Trending hero
   rotation, Top 10, Trending/Airing/Popular/Top Rated/Now Playing rails,
   genre showcase, Continue Watching first. If this is empty, nothing else
   matters.
2. **Title details + playback** — `src/pages/TitleDetailsPage.jsx` +
   `src/components/CustomVideoPlayer.jsx`. Metadata, cast, seasons/episodes,
   trailer curation, 8 iframe servers (never auto-switched — the viewer's
   Server menu choice is final; a dead source shows a Retry / pick-another
   fallback), resume.
3. **Search + genre/category browsing** — `SearchPage`, `GenrePage`,
   `CategoryPage`, `DiscoveryRails`. Debounced live search, relevance ranking,
   did-you-mean, filters/sorts.
4. **My List + Continue Watching (local)** — `src/hooks/useUserData.js`,
   `AuthContext`. Instant, offline-capable, cross-tab synced. This is the
   retention loop.
5. **Real ratings (TMDB + IMDb + RT)** — `ratingService` + `omdbClient` +
   `RatingsCluster`, cached 24h in localStorage (OMDb quota: 1,000 req/day).

## 4. The Android app (`mobile/`)

Shipped as an installable APK, not a WebView wrapper.

- **Player is native.** ExoPlayer through `react-native-video`; no iframe, no
  embedded browser. The manifest is pulled through the project's Cloudflare
  relay, rewritten (master → variant, segments, `EXT-X-KEY`) into a local
  `.m3u8`, and played from `file://` — the only way to satisfy source hosts
  that gate on `Referer`/`User-Agent` per segment.
- **Core loop, phone-shaped:** Home (hero + rails + Continue Watching), Search,
  Details (seasons, episodes, airdates, cast, My List), Player (full-screen,
  landscape, ±15s, resume), Library (Continue Watching + My List).
- **Deliberately small.** Simple UI/UX over feature count. Offline downloads,
  subtitle/audio switching, ratings cluster, genre/category + person pages,
  regional rails, cloud sync and in-player quality switching stay web-only for
  now; the web build remains the full-featured surface.
- **No bundled resolver.** `api/downloadify.js` scrapes providers server-side
  and is reached over the deployed site origin; without it the app browses and
  says so, instead of pretending.
- **Configurable on the device.** Credentials (TMDB read key, `/api/tmdb` proxy,
  or the deployed site URL) are entered in the in-app Settings tab and read at
  request time; build-time `EXPO_PUBLIC_*` env only sets the defaults. A shipped
  APK must never be a dead end that needs a rebuild to become usable.
- Build on modest hardware: one ABI, no Gradle daemon, capped heap — see
  `mobile/README.md` ("Building the APK on a small machine").

## 5. Explicitly NOT building

- ❌ Any backend, auth server, or database (Firebase/backend references in
  `README.md` are **stale docs** — the web code uses localStorage and the app
  uses AsyncStorage).
- ❌ Uploads, user accounts, social, comments, or payments.
- ❌ New stream extraction / proxy infrastructure (`src/api/env.js` is a stub;
  stream-service calls intentionally resolve to `''`). The app reuses the
  existing Cloudflare worker and the deployed resolver — it adds no new
  provider or extraction path.
- ❌ Design-system rewrite (dark cinematic theme + Tailwind v4 tokens stay;
  the app mirrors them in `mobile/src/theme.ts`).
- ❌ Features that break Vercel static deploy (`npm run build` → `dist/`).
- ❌ Shipping the stream resolver inside the APK, or any bundled secret that
  isn't already a public read token.
