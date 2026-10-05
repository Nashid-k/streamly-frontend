<div align="center">

# 🎨 Streamly — Frontend

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-13-0055FF?logo=framer&logoColor=white)](https://www.framer.com/motion)
[![TMDB](https://img.shields.io/badge/Data-TMDB-01B4E4?logo=themoviedatabase&logoColor=white)](https://www.themoviedb.org)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)](https://vercel.com)

**React 19 SPA — TMDB streaming UI with a thin same-origin backend**
(same-origin `/api/*` Vercel functions, local-first state, email accounts
with optional cloud sync)

</div>

---

## 📋 Table of Contents

- [Setup](#-setup)
- [Environment Variables](#-environment-variables)
- [How Data Flows](#-how-data-flows)
- [Project Structure](#-project-structure)
- [Pages & Routes](#-pages--routes)
- [Components](#-components)
- [Hooks & Context](#-hooks--context)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Deployment](#-deployment)

---

## ⚡ Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in your values
cp .env.example .env

# Start dev server → http://localhost:5173
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Lint
npm run lint

# Tests
npm run test
```

---

## 🔑 Environment Variables

```bash
# ─── TMDB API (required) ────────────────────────────────────────────────
# Get from: https://www.themoviedb.org/settings/api
VITE_TMDB_API_KEY=your_tmdb_api_key_here

# ─── OMDb API (optional) ────────────────────────────────────────────────
# Extra IMDb/RT ratings over TMDB. If unset, app degrades to TMDB ratings.
VITE_OMDB_API_KEY=your_omdb_api_key_here

# ─── MongoDB (required for accounts — users + userData) ──────────────────
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/streamly?retryWrites=true&w=majority

# ─── Email sign-in / sign-up (required for cloud sync) ───────────────────
# Gmail: an App Password (not your account password), 16 chars, no spaces.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password_here
# Where the emailed /verify-email link points. Must be the deployed origin.
SITE_URL=https://your-project.vercel.app

# ─── Token signing (required; generate with `openssl rand -hex 32`) ───────
# Signs 24h verification links and 30-day sync tokens. Keep VERIFY_SECRET
# stable or every outstanding verification link dies.
VERIFY_SECRET=replace_with_64_random_hex_chars
SYNC_SECRET=replace_with_64_random_hex_chars

# ─── App / URLs ──────────────────────────────────────────────────────────
# Canonical site origin used for SEO/OpenGraph links
VITE_SITE_URL=https://your-project.vercel.app
```

> ℹ️ **Catalog = TMDB; personal state = this device, unless you create an
> account.** All catalog data comes straight from the TMDB REST API; all
> personal state (My List, Continue Watching, search history, Settings) lives
> in `localStorage` on the viewer's device. An email account additionally
> syncs that state to the app's MongoDB backend (`api/sync.js`), powers the
> public-collections Explore page, and enables cloud-data deletion in
> Settings → Account.
>
> **Anonymous visitors are local-only by design** — they never call the sync
> backend. They can browse, search and watch (playback progress is saved on
> the device and never uploaded), but saving to My List, creating collections,
> editing history and marking things as watched all require an account, and
> the shared sign-in dialog opens when one of those is attempted. Signing up
> **starts clean**: the local library is discarded rather than uploaded under
> the new account.
>
> ⚠️ The API key is never hard-coded in the bundle. Deploys set
> `VITE_TMDB_API_KEY`; the same-origin `/api/tmdb` proxy injects its own
> server-side key (`api/tmdb.js`, Vercel env `TMDB_API_KEY`/`VITE_TMDB_API_KEY`).
> Cloud features require `MONGODB_URI`, `SMTP_*`, `SITE_URL` and
> `VERIFY_SECRET`/`SYNC_SECRET` in the deployment env.

---

## 🌐 How Data Flows

1. **Same-origin first:** the app calls `/api/tmdb/...`. In production that is
   the Vercel serverless function in `api/tmdb.js`; in dev it is the Vite proxy.
   Requests leave from the host's network, so visitors on ISPs that block
   `api.themoviedb.org` still get data.
2. **Direct fallback:** if the proxy is missing or misbehaving (HTML 404,
   gateway 502/503/504), `src/api/tmdbClient.js` retries directly against
   `https://api.themoviedb.org/3`.
3. **Single domain contract:** every response passes through `normalizeResult`
   (`id: movie-<n>/tv-<n>`, `posterUrl/backdropUrl`, `imdbRating`,
   `isSeries`), then lives in the **React Query** cache
   (`src/queryClient.js`).
4. **Playback:** titles play through the native player, which pulls real HLS
   ladders from the serverless sources (VidSrc, VidCore, NHD, VIDSTUCK); the
   CineSrc fallback was removed with its mint service. VIDSTUCK contributes
   **four** Servers-menu rows — Andromeda, Centaurus (dubs), Atlas, Milky Way —
   and its DASH backends are transcoded to HLS fMP4 server-side. Viewers
   re-order servers in Settings → Server Order.
5. **Personal state:** `localStorage` first — `aios_my_list`,
   `aios_my_collections` (named folders), `aios_continue_watching`,
   `aios_search_history`, `setting-*` preference
   keys. Cross-tab sync via `storage` events.
6. **Cloud sync (email account only):** the same state (plus preferences)
   syncs through `/api/sync` (MongoDB) behind per-account expiring HMAC
   tokens; deletes propagate via 30-day tombstones. Deleted collections are
   hidden locally immediately and purged from storage on later merges.
7. **Account creation:** `/api/register` sends a signed 24-hour link and writes
   nothing; the account is created only when `/api/verifyEmail` is POSTed from
   the `/verify-email` page (so email link scanners cannot consume it).

---

## 🗂️ Project Structure

```
api/
├── tmdb.js              ← Vercel serverless: same-origin /api/tmdb TMDB proxy
│                           (CORS, OPTIONS, server-side key injection)
├── register.js          ← POST: validate + send the verification link (writes nothing)
├── verifyEmail.js       ← POST: create the account from a valid token
├── login.js             ← POST: email + password → session + sync token
├── sync.js              ← cloud sync (HMAC-signed, MongoDB, merge policy)
├── stream.js       ← native-stream resolver + relay (VidSrc + VidCore +
│                           NHD + VIDSTUCK, single-URL Range-chunked segment
│                           proxy, SSRF guard, DASH→HLS fMP4 transcoding)
├── publicCollections.js ← publish / read public collections
├── groq.js              ← optional AI helper endpoint
└── lib/                 ← db.js, passwords.js, verifyToken.js, mailer.js, users.js,
                            syncToken.js (HMAC)
server/
├── net.js               ← guarded outbound fetch (redirect re-validation, retries,
│                           optional POST method/body for provider token mints)
└── dashToHls.js         ← MPD → HLS fMP4 transcoder (SegmentTemplate expansion,
                            replayable marker URLs for VIDSTUCK's DASH backends)
public/
└── sw.js               ← Service worker (offline shell, caches streamly-v19.5)

src/
├── main.jsx                         ← React root: QueryClient, PreferencesProvider, ToastProvider
├── App.jsx                          ← Thin composition root (routes, layout, providers)
├── queryClient.js                   ← TanStack Query client config
├── app/                             ← App shell: routes (lazy pages), Layout, Header,
│                                       MobileBottomNav, AccountMenu
├── styles/                          ← Global CSS sliced by concern (tokens, header,
│                                       hero, buttons, rails, settings, player, …)
│                                       imported from main.jsx in cascade order
├── utils/                           ← debugLogger ([Streamly][scope] logging),
│                                       subtitleEngine, ratings, searchRanking,
│                                       releaseCalendar, timezone, index (asArray)
├── api/
│   ├── tmdbClient.js                ← proxy-first fetch + 10s timeout + direct fallback
│   ├── movieService/                ← TMDB domain facade split by concern
│   │                                   (core, normalize, search, featured, detail,
│   │                                   discover, editorial, person, index)
│   ├── omdbClient.js                ← OMDb IMDb/RT ratings lookup
│   ├── ratingService.js             ← ratings aggregation with 24h cache
│   ├── subtitleFetcher.js           ← OpenSubtitles-style SRT/VTT lookup
│   ├── cdnImageAdapter.js           ← TMDB image URL building + sizes
│   ├── videoSourceAdapter.js        ← iframe server registry + server ordering
│   ├── prefetchAdapter.js           ← QueryClient cache prefetching
│   └── virtualRenderAdapter.js      ← Virtual-list rendering helper
├── constants/                       ← App-level single sources: navigation,
│                                       settings (themes/languages/seek times),
│                                       playerUi (PLAYER_SPEEDS, aspect ratios)
├── context/
│   ├── AuthContext.jsx              ← AppProvider + useAppAuth() — myList +
│   │                                  continueWatching merged into one context
│   └── PreferencesContext.jsx       ← settings engine (localStorage `setting-*`)
├── hooks/
│   ├── useUserData.js               ← useMyList, useContinueWatching (localStorage)
│   ├── useDebounce.js               ← Search input debounce
│   ├── useMediaQuery.js             ← Responsive breakpoint matching
│   ├── useRailArrows.js             ← Rail scroll-arrow enable/disable
│   ├── useScrollRestoration.js      ← Scroll position restore across navigation
│   ├── useIsTouch.js                ← Touch-device detection (player gestures)
│   └── useContainerSize.js          ← Player container size observation
├── components/
│   ├── CustomVideoPlayer.jsx        ← Fixed Netflix-style player (black + #E50914),
│   │                                  CineSrc command API, subtitles, gestures
│   ├── player/                      ← Player chrome leaves: ArcRing, LoadingArc,
│   │                                  Netflix Volume/Brightness/Aspect HUDs
│   ├── browse/                      ← FilterPill, MenuItem, SearchField, PillAction
│   ├── detail/                      ← SeasonDropdown, ProductionCompaniesBlock
│   ├── rails/                       ← FadeInSection, MovieRail, Top10Rail,
│   │                                  EditorialRails
│   ├── overlays/                    ← CollectionNameDialog, AddTitlesDialog
│   ├── settings/                    ← LanguageFlag, Toggle, SegmentControl,
│   │                                  SettingRow, ServerOrderList
│   ├── MovieCard.jsx                ← Cinematic hover card + Quick View modal
│   ├── ContinueWatchingRail.jsx     ← Cinejoy-style continue watching rail
│   ├── DiscoveryRails.jsx           ← Trend/Airing/Popular banner rails
│   ├── CastRail.jsx                 ← Cast / directors rail
│   ├── PlayerPreview.jsx            ← Live subtitle preview (lazy, Subtitles tab)
│   ├── RailArrow.jsx                ← Canonical scroll arrow (coarse-pointer aware)
│   ├── TitleInfoModal.jsx           ← Quick View modal
│   ├── Popover.jsx / ConfirmDialog.jsx / Toast.jsx / Chip.jsx / Button.jsx
│   ├── auth/SignInDialog.jsx        ← Shared email sign-in / sign-up + login gate prompt
│   ├── ContentPageHeader.jsx / GenreShowcase.jsx / Footer.jsx
│   ├── GlobalShortcuts.jsx / Loader.jsx / BackToTop.jsx / ErrorBoundary.jsx
│   └── EmptyState.jsx / SectionHeader.jsx / HeroTitleLogo.jsx / RatingsCluster.jsx /
│       RatingsTable.jsx / CountdownBadge.jsx / LeavingSoonBanner.jsx / SEO.jsx
└── pages/
    ├── HomePage.jsx                 ← Landing: hero, category rails, Top 10
    ├── TitleDetailsPage.jsx         ← Player + metadata, season/episode picker
    ├── DiscoveryPage.jsx            ← /movies & /series browsing (hero + rails)
    ├── SearchPage.jsx               ← Search results with filters
    ├── GenrePage.jsx                ← Genre-filtered catalog
    ├── CategoryPage.jsx             ← Single category drill-down
    ├── ExploreCollectionsPage.jsx   ← Public collections browser
    ├── PublicCollectionPage.jsx     ← A published collection
    ├── PersonDetailsPage.jsx        ← Actor / director filmography
    ├── WatchlistPage.jsx            ← My List
    ├── HistoryPage.jsx              ← Continue Watching / history
    └── SettingsPage.jsx             ← Themes, playback, servers, subtitles, account
```

---

## 📄 Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/` | HomePage | Featured hero, category rails |
| `/movies` | DiscoveryPage | Movies browsing |
| `/series` | DiscoveryPage | TV shows browsing |
| `/search?q=` | SearchPage | Search with `?q=` query param |
| `/genre/:genre` | GenrePage | Genre-filtered catalog |
| `/category/:name` | CategoryPage | Single category drill-down |
| `/watch/:id/:slug?` | TitleDetailsPage | Player + metadata (`movie-<n>` / `tv-<n>`) |
| `/person/:id/:slug?` | PersonDetailsPage | Actor/director page |
| `/watchlist` | WatchlistPage | Saved titles |
| `/history` | HistoryPage | Continue watching / history |
| `/continue-watching` | → redirects to `/history` | Alias |
| `/explore/collections` | ExploreCollectionsPage | Browse public collections |
| `/collections/:publicId` | PublicCollectionPage | A published collection |
| `/settings` | SettingsPage | Preferences (themes, playback, servers, subtitles, account) |

---

## 🧩 Components

### `CustomVideoPlayer`
- Single fixed Netflix-style chrome (black + `#E50914` red); play/pause,
  volume (hover-reveal slider), subtitles, audio, aspect ratio, brightness,
  playback speed, screen lock, fullscreen
- CineSrc postMessage command API for play/seek/volume/quality
- Touch gestures: swipe seek, brightness/volume, double-tap seek, screen lock
- Custom subtitle engine with per-viewer font, size, color, and blur

### `PlayerPreview`
- Truthful mini player mirroring the fixed Netflix chrome (demo video +
  live subtitle styles); shown in the Subtitles settings as `showChrome={false}`

### `MovieCard`
- Cinematic curtain hover effect (Framer Motion `whileHover`)
- Quick View modal (`detailViewType: "modal"`) with Play Now / Full Details

### `RailArrow`
- Canonical ghost scroll arrow for every rail/hero/back button; always visible
  on coarse pointers (`@media (pointer: coarse)`) instead of hover-gated

### `Toast`
- Notification system with queue management, auto-dismiss, success/error/info

### `GlobalShortcuts`
- `Ctrl+K` / `Cmd+K` — focus search
- `?` — open keyboard shortcuts modal
- Arrow keys — navigate search dropdown results

---

## 🎹 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Focus search bar |
| `Shift+?` | Open shortcuts reference modal |
| `↑` / `↓` | Navigate search dropdown |
| `Enter` | Open selected search result |
| `Escape` | Close any open dropdown / modal |

Player shortcuts (when the player has focus): `Space`/`K` play-pause,
`F` fullscreen, `M` mute, `←`/`→` seek, `↑`/`↓` volume, `A` aspect ratio,
`?` shortcuts.

---

## 🪝 Hooks & Context

### `useAppAuth()` — app-wide data hook

```js
import { useAppAuth } from '../context/AuthContext';

const {
  myList,             // movie[] — localStorage
  toggleMyList,       // (movie) => void
  isInList,           // (id) => boolean
  continueWatching,   // item[] — sorted by lastWatched
  updateProgress,     // (movie, season?, episode?) => void
  removeFromContinueWatching, // (movieId) => void
} = useAppAuth();
```

### `usePreferences()` — settings engine

```js
import { usePreferences } from '../context/preferences';

const {
  theme,            // "default" | "emerald" | "amethyst" | "ocean" | "crimson" | "solar"
  serverOrder,      // ordered iframe server names
  subtitleFont, subtitleSize, subtitleColor, subtitleBgBlur,
  setPreference,    // (key, value) => void — persists to localStorage
} = usePreferences();
```

### `movieService` — TMDB client

```js
import { movieService } from '../api/movieService';

await movieService.searchMovies(query);
await movieService.getFeaturedMovies();
await movieService.getCategories();
await movieService.getMovieDetails(id);
await movieService.getSimilarMovies(id);
await movieService.getSeasonEpisodes(id, seasonNumber);
await movieService.getPersonDetails(id);
```

---

## 🚀 Deployment

Deployed on **Vercel** with automatic preview deployments for every pull request.

### Vercel environment variables (add in dashboard)

| Variable | Value |
|---|---|
| `VITE_TMDB_API_KEY` | from [themoviedb.org](https://www.themoviedb.org/settings/api) |
| `TMDB_API_KEY` | same key, read by `api/tmdb.js` (server-side, never bundled) |
| `VITE_OMDB_API_KEY` | optional — extra ratings lookup |
| `VITE_SITE_URL` | `https://your-project.vercel.app` |
| `MONGODB_URI` | accounts + cloud sync backend (MongoDB Atlas) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | email delivery for sign-up verification |
| `SITE_URL` | origin the emailed verification link points at |
| `VERIFY_SECRET` | signs the 24h verification link (HMAC) |
| `SYNC_SECRET` | signs the 30-day `/api/sync` bearer token (HMAC) |

### `vercel.json`

The included `vercel.json` routes `/api/tmdb/(.*)` to the serverless proxy,
keeps SPA routing (all paths fall back to `index.html`), and sets cache
headers for hashed assets.

---
