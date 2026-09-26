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
| Download title | `/watch/:id/:slug?` (in-page `DownloadModal`) | `DownloadModal` → `downloadService` → Vercel `api/downloadify.js` (`resolve`|`resolvevidsrc`|`resolvevidcore` → `manifest` → single-URL Range-chunked `segment`); episodes via `getSeasonEpisodes` | file saved to device (File System Access API, Blob fallback); nothing persisted |
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
`Authorization: Bearer <syncToken>` (HMAC over SYNC_SECRET/GOOGLE_CLIENT_SECRET,
30-day expiry enforced at verification — `/api/auth` re-issues on every
sign-in); without a configured secret the endpoint refuses with 503. Payloads
are capped AND sanitized server-side (watchlist ≤ 500, history ≤ 500,
collections ≤ 100 with ≤ 300 itemIds each and whitelisted string/number
fields only, preferences JSON-primitive map, ≤ 512 KB body); emails are no
longer accepted as an identity. `DELETE /api/sync` wipes the caller's cloud
document (Settings → Account → Delete cloud data). Cloud pulls merge with
**timestamp-aware set union** (`src/utils/mergeRemote.js`, `mergeListsById`):
remote-only ids are appended; conflicting ids keep whichever side has the
higher `updatedAt` (legacy items with no stamp lose to newer remote data);
continue-watching is capped to 20; user collections merge the same way.
**Deletions propagate via tombstones**: a deleted collection is kept as
`{ deletedAt }` for 30 days (hidden from the UI immediately) so stale copies
on other devices can't resurrect it, then GC'd on merge. Uploaded collections
are always the morphed v2 shape (`visibility`/`publicId` normalized,
`src/hooks/collectionMorph.js`). Cloud preferences sync both ways: the upload
carries every locally-set `setting-*` value; pulls apply remote values ONLY
for keys the device has never touched (`src/utils/preferencesSnapshot.js`).
All endpoints are rate-limited per IP (`api/lib/rateLimit.js`, fixed window:
auth 20/min, sync 60/min, public collections 60/min, tmdb 120/min, groq
20/min per IP + a 240/min global budget + 1MB payload cap (413 over), downloadify
600/min — a movie is hundreds of three-megabyte chunk fetches).

Auth trust path (`api/auth.js` + `api/lib/googleVerify.js`): the Google ID
token is verified **locally** with `node:crypto` against Google's public JWKS
(cached ~6h per warm container; 8s timeout) checking signature (RS256), `iss`,
`aud`, `exp` — no `tokeninfo` round-trip (dev-only, throttle-prone). `/api/auth`
is POST-only (credential in `credential`); the old unauthenticated GET profile
lookup and the backend guest upsert were removed.

Anonymous public collections: `/api/publicCollections` is a **read-only,
no-auth** endpoint (GET list → `{ name, publicId, itemCount }[]`, capped 250;
GET `?publicId=X` → `{ name, publicId, itemIds }` (≤ 300 items) or
`collection: null`) that flattens the PUBLIC subsets of every synced
`userData` document — queried with a `collections.visibility: 'public'`
`$elemMatch` filter (plus a best-effort index) instead of scanning the whole
collection, and tombstoned (deleted) collections are skipped so un-publishing
propagates. Frozen contract: it never emits a googleId, email, or username —
the Explore surface is anonymous by design (`api/lib/publicCollections.js`
pure helpers: PUBLIC + stable `publicId` only, deduped, newest-updated
first). Client-side the Explore page shows a real error + retry state when
the backend fails (`ExploreError`) instead of a lying empty list, and the
shared-collection page resolves items through the React Query cache with
capped concurrency (≤ 300 items, 6 parallel).

External services: `api.themoviedb.org/3` (catalog, 10s timeout in
`tmdbClient.js`), `image.tmdb.org` (artwork, `cdnImageAdapter` sizes
w92→w1280), `omdbapi.com` (IMDb/RT, env-key `VITE_OMDB_API_KEY`, 24h cache),
`www.googleapis.com/oauth2/v3/certs` (ID-token JWKS), `youtube iframe API`
(hover trailers), 8 third-party iframe stream hosts (`videoSourceAdapter.js`).
VidSrc is a
third-party provider via the `resolvevidsrc` action, whose embed `var Q` token is walked
server-side so CORS no longer blocks resolution) and proxy media segments
through the same-origin Vercel function `api/downloadify.js`. VidCore (Server 5)
is a second third-party provider via `resolvevidcore`: unlike its iframe host,
the vidcore.org/embed sources catalogue is fully serverless — the "videasy" API
(`vidrack.created.app/api/sources/videasy`) lists direct HLS ladders incl. 4K,
and the m3u8s/segments are relayed with `Referer: https://vidcore.io/`
(`source.refUrl` drives the manifest/segment actions; the fMP4 segments on
`paperorbit.top` also allow browser-direct CORS). A third third-party
provider, CineSrc, was REMOVED: its stream tokens are minted inside a real
browser (canvas/TLS fingerprint-bound), so it only ever worked through a
separately-hosted Chrome mint service (`cinesrc-resolver/`, Render-hosted) that
is now retired — along with it went the `resolvecinesrc` action, the
`resolveCinesrc` client method, the `cinesrc-resolver/` folder, the
`CINESRC_RESOLVER_*` env plumbing, and the fMP4 A/V muxer. The embed host
`cinesrc.st` stays allow-listed (Server 1 iframe URL builder).
The `segment` action is single-URL + `{ range: { start, max } }` in ≤3.5MB
chunks with an `x-streamly-more` "more bytes?" header — the old 6-URL-per-POST
batch blew Vercel's 4.5MB response cap with `FUNCTION_PAYLOAD_TOO_LARGE`, which
is why downloads never saved. Where a CDN honestly allows CORS (`*` or our
origin) `saveStream` probes it and pulls segments straight from the browser
before falling back to the relay. Embed-host allowlist + DNS-resolved private-IP
SSRF guard (every redirect hop re-validated; decimal/hex IP literals included).
Downloads are video-only, and they are written exactly as the manifest
lists them: the two features that made CineSrc special — muxing a separate
`EXT-X-MEDIA AUDIO` rendition into the file (dependency-free
`src/utils/fmp4Muxer.js`, since deleted) and the mid-file `refresh()` re-mint
that recovered a time-scoped playlist token — both went away with that
provider.
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
  `publicCollections.js` (same-origin anonymous public-collection fetch; throws
  typed errors on failure so the Explore page can render a retry state — never
  silently `[]`).
- `src/pages/` — one file per route (see table). Pages own query keys and
  log every `error` + empty-data state via `reportQueryError`/`logEmptyData`.
- `src/components/` — reusable UI (`@/components`). `index.js` categorized barrel. Rail primitives
  (`CastRail`, `DiscoveryRails`, `ContinueWatchingRail`, `GenreShowcase`, `LeavingSoonBanner`),
  cards (`MovieCard`), player subsystem (`CustomVideoPlayer`, `PlayerPreview`,
  `YoutubeRawTrailer`, and `player/` leaf subfolder — `ArcRing`, `LoadingArc`,
  `NetflixVolumeHUD`, `NetflixBrightnessHUD`, `NetflixAspectHUD`, `index.js`),
  feature-grouped subfolders (`browse/` — `FilterPill`, `MenuItem`, `SearchField`,
  `PillAction`; `detail/` — `SeasonDropdown`,
  `ProductionCompaniesBlock`; `rails/` — `FadeInSection`, `MovieRail`, `Top10Rail`,
  `EditorialRails`; `overlays/` — `CollectionNameDialog`, `AddTitlesDialog`;
  `settings/` — `LanguageFlag`, `Toggle`, `SegmentControl`, `SettingRow`,
  `ServerOrderList`), modals (`TitleInfoModal`, `DownloadModal`, `GlobalShortcuts`), and
  primitives (`Button`, `Chip`, `Toast`, `ConfirmDialog`, `Loader`, `EmptyState`,
  `SEO`, `ErrorBoundary`).
- `src/hooks/` — custom React hooks (`@/hooks`). `index.js` barrel. `useUserData.js` (localStorage lists,
  logs corrupt/quota failures), `useDebounce`, `useDetailView`, `useMediaQuery`, `useRailArrows`,
  `useScrollRestoration`, `useVirtualRenderAdapter` (IntersectionObserver adapter for heavy elements),
  `useNearViewport` (one shared "am I within N px of the viewport?" gate — returns `[ref, inView]`,
  treats a browser without `IntersectionObserver` as visible so a missing API can never silently
  suppress a query), `useIsTouch`, `useContainerSize`.
- `src/context/` — React contexts (`@/context`). `index.js` barrel. `AuthContext.jsx` + `auth.js`
  (merges user data hooks), `PreferencesContext.jsx` + `preferences.js` (settings + `setting-*`).
- `src/constants/` — app-level constant single sources (`@/constants`): `navigation`,
  `playerUi`, `settings`. Imported per module (there is no barrel).
  `navigation.js` (`NAV_ITEMS`), `settings.js` (live single source for `THEMES`,
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
  visitors on ISPs that block `api.themoviedb.org` still get data. Its edge
  cache is `s-maxage=1800, stale-while-revalidate=86400`: rails are identical
  for every visitor of a region for far longer than 5 minutes, so the CDN (not
  the function) absorbs the repeated catalogue sweeps. That TTL is the
  region-independent lever and the one that matters most — the CDN caches per
  POP whatever region the function runs in. The function is additionally pinned
  to `bom1` (Mumbai) via `functions."api/tmdb.js".regions` in `vercel.json`, so
  on a plan without Fluid Compute it starts near the audience that needs the
  proxy. If Fluid Compute is enabled for the project (it is the default for new
  projects) Vercel places the function near the incoming request instead and the
  pin is inert — which is acceptable, because the edge cache is doing the work.
  `api/downloadify.js` resolves embed-host + VidSrc HLS ladders and proxies
  media segments so the browser can save downloads (single-URL Range chunks
  under Vercel's 4.5MB cap; allowlisted embed hosts + DNS-resolved SSRF guard;
  stateless, nothing persisted). It owns only routing and the provider walks;
  the two cross-cutting concerns it used to inline now live beside it:
  - `api/lib/ssrf.js` — the only sanctioned way to name an outbound host.
    `assertPublicDestination` is called for the first hop *and* every redirect
    hop, and refuses a URL unless the scheme is http(s) and **every** resolved
    address is public (loopback, RFC1918, CGNAT 100.64/10, link-local incl.
    `169.254.169.254`, IPv6 ULA/`fe80::/10`, multicast). The literal blocklist
    is only the cheap first pass; the resolved-address check is what actually
    stops a public name pointing inward.
  - `api/lib/net.js` — the single outbound HTTP path: browser-shaped headers,
    the manual redirect walk, the response-size ceiling and the Range-chunk
    reader the byte relay depends on.
  Both are pure and unit-tested (`src/__tests__/ssrfGuard.test.js`), which the
  inline versions never were. `src/__tests__/apiModules.test.js` imports every
  `api/` entry point so a broken import graph fails CI instead of production, and
  `src/__tests__/downloadifyHandler.test.js` drives the handler itself (preflight,
  method rejection, unknown action, malformed body, and every action without a URL
  answering a structured `{ok:false}` envelope) so a function that fails to load
  can never again present as a per-title "no downloadable stream".
  Root: `index.html` (fonts/CDN preconnect, SW cache-buster), `vite.config.js`
  (vendor chunk split + a dedicated lazy `hls-vendor` chunk so the player is not
  on the critical path, `@/` path alias, `/api/tmdb` dev proxy), `vercel.json`
  (`/api/tmdb/(.*)` proxy rewrite + SPA rewrite + cache headers), `.env` / `.env.example`.
- `public/sw.js` — the service worker (untranspiled, registered from `public/boot.js`).
  Its fetch handler's first rule is that **a non-GET request is never intercepted**:
  `Cache.put()` accepts GET only, so letting a POST reach any caching branch throws
  `Request method 'POST' is unsupported` as an unhandled rejection (this actually
  happened for every `/api/downloadify` POST). Ordering after that: cross-origin
  passes through, `/api/` passes through (the client owns its failover and timeouts),
  navigations are network-first with a cached shell, content-hashed `/assets/*` are
  cache-first (immutable, so a hit can never be stale), and everything else
  same-origin is cache-first. Background cache writes are best-effort and never
  reject: a full quota must not cost the visitor the response. `wsrv.nl` posters are
  the one cross-origin exception (stale-while-revalidate, for offline viewing).
  `src/__tests__/serviceWorker.test.js` imports the real file with stubbed
  `self`/`caches` and pins that routing, so the invariant is enforced, not assumed.

## 4. Six architecture decisions + why

1. **Same-origin TMDB through a thin Vercel proxy, direct fallback** — removes
   the old NestJS/Render hop (latency, cold starts, proxy stalls). `/api/tmdb`
   injects the server-side key and stays off the quota path via edge caching;
   `tmdbClient` falls back to `api.themoviedb.org` directly if the proxy 404s
   or gateway-errors. The same tiny serverless surface hosts Google auth
   (`api/auth.js`, local JWKS verify), cloud sync (`api/sync.js`, HMAC +
   MongoDB), public collections (`api/publicCollections.js`) and offline
   downloads (`api/downloadify.js`, allowlisted hosts + SSRF guard). Everything
   else stays client-side.
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
6. **Fluid motion is compositor-only + reduced-motion first** — UI animation
   rule: `transform`/`opacity` only in motion (no `width`/`height`/`left`/
   `top`/`filter`/`box-shadow` in loops), explicit CSS transition property
   lists (never `transition: all`), and `will-change` only on elements an
   animation actually runs. `MotionConfig` is reducedMotion-aware app-wide
   (`App.jsx`); hot components (`Button`, `Chip`, `CountdownBadge`,
   `MovieCard`, `FadeInSection`, `DiscoveryPage`) additionally branch on
   `useReducedMotion`. Skeleton shimmer, countdown ring, ambient hero blobs
   and the card curtain stay GPU-friendly by design. (Task 91.)
