# Streamly — Architecture

> Read with `prd.md`, `vibecoder.md`, `task.md`. Facts below were verified
> against `package.json`, `src/`, `.env*`, `vercel.json`, `index.html`.

## 1. Stack + versions (exact, from `package.json`)

| Layer | Package | Version |
|---|---|---|
| UI | `react`, `react-dom` | `19.2.8` |
| Build | `vite`, `@vitejs/plugin-react` | `8.2.0`, `6.0.4` |
| Routing | `react-router-dom` | `7.18.2` |
| Data | `@tanstack/react-query` | `5.102.1` |
| Motion | `framer-motion` | `13.1.0` |
| Player (lazy iframe) | `CustomVideoPlayer.jsx` | in-repo, `React.lazy` on `/watch` (native HTML5 + server iframes; no player library) |
| Icons | `lucide-react` | `1.31.0` |
| SEO | `react-helmet-async` | `3.0.0` |
| Slugs | `slugify` | `1.6.9` |
| CSS | `tailwindcss`, `@tailwindcss/vite` | `4.3.3` |
| Tests | `vitest` 5, `jsdom` 30, `@testing-library/react` 16.3.3 | dev |
| Lint | `oxlint` | `1.75.0` (`npm run lint`) |

Data flow: **same-origin `/api/tmdb` proxy → TMDB REST, direct TMDB as
fallback** (`src/api/tmdbClient.js`). The proxy is the Vercel function in
`api/tmdb.js` (production) and the Vite dev proxy in
`vite.config.js` (local `npm run dev`) — requests leave from the host's
network, so visitors on ISPs that block `api.themoviedb.org` still get data.
Fallback triggers only when no proxy is deployed (plain static hosting:
proxy answers HTML/404/501) or outside browsers (node scripts/tests).
`normalizeResult` shapes every response into the domain contract consumed by
**React Query cache (`src/queryClient.js`) → pages/rails.** No axios, no
Firebase SDK in the bundle.

## 2. User → Route → Data ("user-route-db")

| User action | Route | Loader (React Query key → service) | DB / store |
|---|---|---|---|
| Open app | `/` | `featuredMovies` → `getFeaturedMovies` (`/trending/all/week` + per-item `append_to_response=images`); `categories` → `getCategories` (`/trending/movie|tv/week`); `top10`, `trending-this-week`, `airing-this-week`, `popular`, `topRated`, `nowPlaying`; regional Indian feeds merged into the Upcoming (`upcoming-regional` → `getRegionalUpcoming`, `/discover/movie` for `with_original_language=ta|hi|ml|te` + `region=IN`, future window) and Airing (`airing-regional` → `getRegionalAiring`, `/discover/tv` air-date window + per-title `next_episode_to_air`) rails | network only |
| Movies / Shows tabs | `/movies`, `/series` | same as `/`, client-filtered by `isSeries`; the top `discover-rail` merges `getRegionalUpcoming(365)` into the movies slate and `getRegionalAiring(10)` into the series rail | network only |
| Search | `/search?q=` | `search:<q>` → `searchMovies` (`/search/multi`, movie+tv only) | + `aios_search_history` (local) |
| Genre | `/genre/:genre` | `genre-search:<genre>` → `searchMovies` + `selectGenreResults` | network only |
| Collection | `/category/:name` | `categories` (exact→fuzzy→token match) or `location.state.movies` | network / nav state |
| Watch title | `/watch/:id/:slug?` (`movie-<n>` / `tv-<n>`) | `movie:<id>` → `getMovieDetails` (credits+videos+images, external_ids best-effort); `similar:<id>`; `episodes:<id>:<season>` → `getSeasonEpisodes` | + `aios_continue_watching` (resume) |
| Download title | `/watch/:id/:slug?` (in-page `DownloadModal`) | `DownloadModal` → `downloadService` → Vercel `api/downloadify.js` (`resolve` → `manifest` → `segment`); episodes via `getSeasonEpisodes` | file saved to device (File System Access API, Blob fallback); nothing persisted |
| Person | `/person/:id/:slug?` | `person:<id>` → `getPersonDetails` (`/person`, `/combined_credits`, top-40) | network only |
| My List | `/watchlist` (`/mylist` redirects) | local only | `aios_my_list`, `aios_my_collections` (local) |
| History | `/history` | local only | `aios_continue_watching` (local) |
| Settings | `/settings` (+ optional `?tab=<section>`) | local only | `setting-*` keys (local) |

The `?tab=` query param on `/settings` is a navigation affordance only: it
selects the section filter (see `SECTION_SEARCH_TERMS` in `SettingsPage.jsx`),
initialises from and stays in sync with the URL (`replace: true`), and has no
effect on any persisted key or data contract.

Persistence keys (all localStorage, no remote DB): `aios_my_list`,
`aios_continue_watching` (each item stamped `updatedAt` — see merge policy
below), `aios_my_collections` (named folders referencing saved title ids),
`aios_search_history`, `streamly:realRatings:<id>`
(24h), `setting-autoplay|muteTrailers|hdThumbs|reduceMotion|notifications`,
`streamly_volume|muted|aspectRatio`, `streamly_user`
(current profile), `streamly_sync_token` (per-account HMAC token for
`/api/sync`, issued only to verified Google identities by `/api/auth`), `_sv`,
`vite_reload`, `chunk_reload_time`. Cross-tab sync via `storage` +
`aios_sync_*` events. (`streamly_autoSkip` was a write-only orphan — removed;
the real pref is `setting-autoSkipIntro`.)

Cloud sync: **guests are local-only** — `loginAsGuest` never calls `/api/auth`
or `/api/sync` (the old default email `viewer@streamly.io` collapsed every
anonymous visitor into one shared Mongo document). Only verified Google
accounts (`googleId`) sync, and `/api/sync` additionally requires
`Authorization: Bearer <syncToken>` (HMAC over SYNC_SECRET/GOOGLE_CLIENT_SECRET);
without a configured secret the endpoint refuses with 503. Payloads are capped
(watchlist ≤ 500, history ≤ 500, collections ≤ 100, ≤ 512 KB body) and
emails are no longer accepted as an identity. Cloud pulls merge with
**timestamp-aware set union** (`src/utils/mergeRemote.js`, `mergeListsById`):
remote-only ids are appended; conflicting ids keep whichever side has the
higher `updatedAt` (legacy items with no stamp lose to newer remote data);
continue-watching is capped to 20; user collections merge the same way.

Auth trust path (`api/auth.js` + `api/lib/googleVerify.js`): the Google ID
token is verified **locally** with `node:crypto` against Google's public JWKS
(cached ~6h per warm container; 8s timeout) checking signature (RS256), `iss`,
`aud`, `exp` — no `tokeninfo` round-trip (dev-only, throttle-prone). `/api/auth`
is POST-only (credential in `credential`); the old unauthenticated GET profile
lookup and the backend guest upsert were removed.

Anonymous public collections: `/api/publicCollections` is a **read-only,
no-auth** endpoint (GET list → `{ name, publicId, itemCount }[]`, capped 100;
GET `?publicId=X` → `{ name, publicId, itemIds }` or `collection: null`) that
flattens the PUBLIC subsets of every synced `userData` document. Frozen
contract: it never emits a googleId, email, or username — the Explore surface
is anonymous by design (`api/lib/publicCollections.js` pure helpers:
PUBLIC + stable `publicId` only, deduped, newest-updated first).

External services: `api.themoviedb.org/3` (catalog, 10s timeout in
`tmdbClient.js`), `image.tmdb.org` (artwork, `cdnImageAdapter` sizes
w92→w1280), `omdbapi.com` (IMDb/RT, env-key `VITE_OMDB_API_KEY`, 24h cache),
`www.googleapis.com/oauth2/v3/certs` (ID-token JWKS), `youtube iframe API`
(hover trailers), 8 third-party iframe stream hosts (`videoSourceAdapter.js`).
Downloads resolve those hosts' HLS master playlists and proxy segments through
the same-origin Vercel function `api/downloadify.js`
(`resolve`/`manifest`/`segment`; embed-host allowlist + private-IP SSRF guard).
Stream-service/NetMirror calling code was deleted (`src/api/env.js` removed);
the client no longer makes those HTTP calls. Every function is wrapped in a request
logger (`api/lib/logger.js`); `vercel.json` sets `maxDuration` per function
(15s tmdb / 30s auth+sync) to stay inside the Hobby ceiling.

## 3. Folders — where things go

Streamly supports clean `@/` root path aliasing mapped to `src/` (configured in `vite.config.js`, `vitest.config.js`, and `jsconfig.json`). Each layer exposes a clean `index.js` barrel export while maintaining full backwards compatibility with direct imports:

- `src/app/` — app shell + routing (`@/app`). `routes.jsx` (default `AppRoutes`,
  lazy pages, route-keyed `ErrorBoundary` + `Suspense`), `Layout.jsx`, `Header.jsx`,
  `MobileBottomNav.jsx`, `AccountMenu.jsx`. `App.jsx` is a thin composition root.
- `src/api/` — network boundary (`@/api`). `index.js` barrel. `tmdbClient.js` (proxy-first fetch+timeout+
  `[Streamly][tmdb]` logs, direct fallback), `movieService/` (directory facade —
  `{core,normalize,search,featured,detail,discover,editorial,person,index}.js`;
  exposes `movieService`, `EDITORIAL_RAILS`, `classifyTrailer`,
  `certificationFromDetail`, `normalizeResult`, `isBrowsableTitle`), `omdbClient.js`,
  `ratingService.js`, `videoSourceAdapter.js`, `subtitleFetcher.js`,
  `downloadService.js` (resolve/manifest/segment driver + disk save),
  `prefetchAdapter.js`, `cdnImageAdapter.js`, `virtualRenderAdapter.js` (re-export of hook),
  `publicCollections.js` (same-origin anonymous public-collection fetch, fail-soft).
- `src/pages/` — one file per route (see table). Pages own query keys and
  log every `error` + empty-data state via `reportQueryError`/`logEmptyData`.
- `src/components/` — reusable UI (`@/components`). `index.js` categorized barrel. Rail primitives
  (`CastRail`, `DiscoveryRails`, `ContinueWatchingRail`, `GenreShowcase`, `LeavingSoonBanner`),
  cards (`MovieCard`), player subsystem (`CustomVideoPlayer`, `PlayerPreview`,
  `YoutubeRawTrailer`, and `player/` leaf subfolder — `ArcRing`, `LoadingArc`,
  `NetflixVolumeHUD`, `NetflixBrightnessHUD`, `NetflixAspectHUD`, `index.js`),
  feature-grouped subfolders (`browse/` — `FilterPill`, `MenuItem`, `SearchField`,
  `PillAction`; `detail/` — `SeasonDropdown`, `ServerDropdown`,
  `ProductionCompaniesBlock`; `rails/` — `FadeInSection`, `MovieRail`, `Top10Rail`,
  `EditorialRails`; `overlays/` — `CollectionNameDialog`, `AddTitlesDialog`;
  `settings/` — `LanguageFlag`, `Toggle`, `SegmentControl`, `SettingRow`,
  `ServerOrderList`), modals (`TitleInfoModal`, `DownloadModal`, `GlobalShortcuts`), and
  primitives (`Button`, `Chip`, `Toast`, `ConfirmDialog`, `Loader`, `EmptyState`,
  `SEO`, `ErrorBoundary`).
- `src/hooks/` — custom React hooks (`@/hooks`). `index.js` barrel. `useUserData.js` (localStorage lists,
  logs corrupt/quota failures), `useDebounce`, `useDetailView`, `useMediaQuery`, `useRailArrows`,
  `useScrollRestoration`, `useVirtualRenderAdapter` (IntersectionObserver adapter for heavy elements),
  `useIsTouch`, `useContainerSize`.
- `src/context/` — React contexts (`@/context`). `index.js` barrel. `AuthContext.jsx` + `auth.js`
  (merges user data hooks), `PreferencesContext.jsx` + `preferences.js` (settings + `setting-*`).
- `src/constants/` — app-level constant single sources (`@/constants`). `index.js` barrel.
  `navigation.js` (`NAV_ITEMS`, `navWatchKind`), `settings.js` (live single source for `THEMES`,
  `LANGUAGES`, `SEEK_TIMES`, `SUBTITLE_FONTS`, `SUBTITLE_COLORS`, `DEFAULT_SERVER_ORDER`, `TABS`,
  `SECTION_SEARCH_TERMS`), `playerUi.js` (`PLAYER_SPEEDS`, `ASPECT_RATIOS`, `AR_GLYPH`,
  `SPRING_SNAPPY`).
- `src/styles/` — global CSS sliced by concern and imported from `main.jsx` in cascade order
  (`{tokens,header,primitives,hero,buttons,grids,skeleton,rails,responsive,search,collections,
  settings,ui-kit,player,settings-ui,modals,discovery}.css`). Tailwind v4 `@source "../"`
  roots content detection back at `src/`.
- `src/utils/` — shared utilities (`@/utils`). `index.js` barrel. `debugLogger.js` (**all console output
  goes through here**), `index.js` (`asArray`/`EMPTY_ARRAY` null-safety + re-exports), `timezone`,
  `searchRanking`, `genreResults`, `releaseCalendar`, `ratings`, `notificationEngine`, `subtitleEngine`,
  `downloadQuality` (pure HLS master/media playlist parser + quality/HDR labels),
  `platforms`, `metaFacts`, `chunkRecovery`.
- `src/__tests__/` — vitest suites (service shape, ranking, engines, components, barrels).
  `src/queryClient.js` — QueryClient + global `QueryCache.onError` logger. `src/main.jsx` — boot
  diagnostics + global error hooks.
- `api/` — Vercel serverless functions (not bundled to the client).
  `api/tmdb.js` is the TMDB passthrough proxy — the reason
  visitors on ISPs that block `api.themoviedb.org` still get data.
  `api/downloadify.js` resolves embed-host HLS ladders and proxies media
  segments so the browser can save downloads (allowlisted embed hosts +
  SSRF guard; stateless, nothing persisted).
  Root: `index.html` (fonts/CDN preconnect, SW cache-buster), `vite.config.js`
  (vendor chunk split, `@/` path alias, `/api/tmdb` dev proxy), `vercel.json`
  (`/api/tmdb/(.*)` proxy rewrite + SPA rewrite + cache headers), `.env` / `.env.example`.

## 4. Five architecture decisions + why

1. **Direct TMDB from the browser, no backend** — removes the NestJS/Render
   hop (latency, cold starts, proxy stalls). Trade-off: API key is public;
   accepted, mitigated by TMDB's key model + OMDb 24h cache.
2. **React Query as the data cache with per-key logging** — `staleTime` 5–10
   min, 1 retry (0 for quota-sensitive OMDb/ratings), `QueryCache.onError`
   global log. Every failed/empty query is console-traceable to its key.
3. **localStorage instead of Firebase for personal state** — zero backend to
   operate; guest-first; syncs across tabs. Trade-off: per-device only.
4. **`normalizeResult` as the single domain contract** (`id: movie-<n>/tv-<n>`,
   `posterUrl/backdropUrl`, `imdbRating`, `isSeries/type/mediaType`) — every
   page/rail assumes this shape; `asArray`/`EMPTY_ARRAY` guards the rest.
5. **Central `debugLogger` (`[Streamly][scope]`) + silent-failure ban** — no
   bare `catch {}` on data paths; fallbacks (text title, monogram tile, TMDB
   score alone, stills instead of frames) are logged at warn/debug so "empty
   screen" always has a console trail.
