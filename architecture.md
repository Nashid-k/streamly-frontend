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
| Player (lazy) | `hls.js` | `1.7.2` (dynamic `import()` only) |
| Icons | `lucide-react` | `1.31.0` |
| SEO | `react-helmet-async` | `3.0.0` |
| Slugs | `slugify` | `1.6.9` |
| CSS | `tailwindcss`, `@tailwindcss/vite` | `4.3.3` |
| Tests | `vitest` 5, `jsdom` 30, `@testing-library/react` 16.3.3 | dev |
| Lint | `oxlint` | `1.75.0` (`npm run lint`) |

Data flow: **TMDB REST (browser `fetch`) → `movieService.normalizeResult`
→ React Query cache (`src/queryClient.js`) → pages/rails.** No axios, no
Firebase SDK in the bundle.

## 2. User → Route → Data ("user-route-db")

| User action | Route | Loader (React Query key → service) | DB / store |
|---|---|---|---|
| Open app | `/` | `featuredMovies` → `getFeaturedMovies` (`/trending/all/week` + per-item `append_to_response=images`); `categories` → `getCategories` (`/trending/movie|tv/week`); `top10`, `trending-this-week`, `airing-this-week`, `popular`, `topRated`, `nowPlaying` | network only |
| Movies / Shows tabs | `/movies`, `/series` | same as `/`, client-filtered by `isSeries` | network only |
| Search | `/search?q=` | `search:<q>` → `searchMovies` (`/search/multi`, movie+tv only) | + `aios_search_history` (local) |
| Genre | `/genre/:genre` | `genre-search:<genre>` → `searchMovies` + `selectGenreResults` | network only |
| Collection | `/category/:name` | `categories` (exact→fuzzy→token match) or `location.state.movies` | network / nav state |
| Watch title | `/watch/:id/:slug?` (`movie-<n>` / `tv-<n>`) | `movie:<id>` → `getMovieDetails` (credits+videos+images, external_ids best-effort); `similar:<id>`; `episodes:<id>:<season>` → `getSeasonEpisodes` | + `aios_continue_watching` (resume) |
| Person | `/person/:id/:slug?` | `person:<id>` → `getPersonDetails` (`/person`, `/combined_credits`, top-40) | network only |
| My List | `/watchlist` (`/mylist` redirects) | local only | `aios_my_list` (local) |
| History | `/history` | local only | `aios_continue_watching` (local) |
| Settings | `/settings` | local only | `setting-*` keys (local) |

Persistence keys (all localStorage, no remote DB): `aios_my_list`,
`aios_continue_watching`, `aios_search_history`, `streamly:realRatings:<id>`
(24h), `setting-autoplay|muteTrailers|hdThumbs|reduceMotion|notifications`,
`streamly_volume|muted|aspectRatio|autoSkip|lastserver`, `_sv`, `vite_reload`,
`chunk_reload_time`. Cross-tab sync via `storage` + `aios_sync_*` events.

External services: `api.themoviedb.org/3` (catalog, 10s timeout in
`tmdbClient.js`), `image.tmdb.org` (artwork, `cdnImageAdapter` sizes
w92→w1280), `omdbapi.com` (IMDb/RT, hardcoded key, 24h cache),
`youtube iframe API` (hover trailers), 7 third-party iframe stream hosts
(`videoSourceAdapter.js`). Stream-service/NetMirror HTTP calls resolve
through the `env.js` stub to `''` and fail soft (logged, non-blocking).

## 3. Folders — where things go

- `src/api/` — network boundary. `tmdbClient.js` (fetch+timeout+`[Streamly][tmdb]`
  logs), `movieService.js` (all domain calls + normalize, each method logs
  failure/empty), `omdbClient.js`, `ratingService.js`, `videoSourceAdapter.js`,
  `subtitleFetcher.js`, `prefetchAdapter.js`, `cdnImageAdapter.js`,
  `virtualRenderAdapter.js`, `env.js` (**stub — do not revive**).
- `src/pages/` — one file per route (see table). Pages own query keys and
  log every `error` + empty-data state via `reportQueryError`/`logEmptyData`.
- `src/components/` — reusable UI. Rail primitives (`MovieRail`, `Top10Rail`,
  `DiscoveryRail`, `ContinueWatchingRail`), `MovieCard` (prefetch on hover,
  logs image failure), `CustomVideoPlayer` (logs tip/VTT/preview/server
  failures), `HeroTitleLogo`, `RatingsCluster`, `ErrorBoundary` (logs route +
  component stack), `SEO`, `Toast`, `EmptyState`.
- `src/hooks/` — `useUserData.js` (localStorage lists, logs corrupt/quota
  failures), `useDebounce`, `useMediaQuery`, `useRailArrows`,
  `useScrollRestoration`.
- `src/context/` — `AuthContext.jsx` (merges the three `useUserData` hooks),
  `PreferencesContext.jsx` + `preferences.js` (settings + `setting-*`).
- `src/utils/` — `debugLogger.js` (**all console output goes through here**),
  `index.js` (`asArray`/`EMPTY_ARRAY` null-safety), `timezone`,
  `searchRanking`, `genreResults`, `releaseCalendar`, `ratings`,
  `notificationEngine`, `subtitleEngine`, `platforms`.
- `src/__tests__/` — vitest suites (service shape, ranking, engines,
  components). `src/queryClient.js` — QueryClient + global `QueryCache.onError`
  logger. `src/main.jsx` — boot diagnostics + global error hooks.
  Root: `index.html` (fonts/CDN preconnect, SW cache-buster), `vite.config.js`
  (vendor chunk split, `hls.js` isolated), `vercel.json` (SPA rewrite + cache
  headers), `.env` / `.env.example`, `test-movie.js` (manual TMDB probe).

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
