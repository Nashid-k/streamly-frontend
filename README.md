<div align="center">

# 🎨 Streamly — Frontend

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-13-0055FF?logo=framer&logoColor=white)](https://www.framer.com/motion)
[![TMDB](https://img.shields.io/badge/Data-TMDB-01B4E4?logo=themoviedatabase&logoColor=white)](https://www.themoviedb.org)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)](https://vercel.com)

**React 19 SPA — direct-TMDB streaming UI, no backend**

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
```

---

## 🔑 Environment Variables

```bash
# .env — TMDB API (required)
# Get from: https://www.themoviedb.org/settings/api
VITE_TMDB_API_KEY=your_tmdb_api_key_here

# ─── App / URLs ────────────────────────────────────────────────
# Canonical site origin used for SEO/OpenGraph links
VITE_SITE_URL=https://your-project.vercel.app
```

> ℹ️ **No backend, no Firebase.** All catalog data comes straight from the
> TMDB REST API; all personal state (My List, Continue Watching, search
> history, Settings) lives in `localStorage` on the viewer's device.
>
> ⚠️ The API key is never hard-coded in the bundle. Deploys set
> `VITE_TMDB_API_KEY`; the same-origin `/api/tmdb` proxy injects its own
> server-side key (`api/tmdb.js`, Vercel env `TMDB_API_KEY`/`VITE_TMDB_API_KEY`).

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
4. **Playback:** titles play through third-party iframe hosts (CineSrc,
   Vidlink, 2Embed, …) listed in `src/api/videoSourceAdapter.js`. Viewers
   re-order them in Settings → Server Order.
5. **Personal state:** `localStorage` only — `aios_my_list`,
   `aios_my_collections` (named folders), `aios_continue_watching`,
   `aios_search_history`, `setting-*` preference
   keys. Cross-tab sync via `storage` events. No accounts, no database.

---

## 🗂️ Project Structure

```
api/
├── tmdb.js                          ← Vercel serverless: same-origin /api/tmdb
│                                       TMDB passthrough proxy (CORS, OPTIONS,
│                                       server-side key injection)
public/
└── sw.js                            ← Service worker (offline shell, cache v10)

src/
├── main.jsx                         ← React root: QueryClient, PreferencesProvider, ToastProvider
├── App.jsx                          ← Top-level router, navbar, mobile bottom bar
├── index.css                        ← Global CSS, variables, themes, animations
├── queryClient.js                   ← TanStack Query client config
├── utils/                           ← debugLogger ([Streamly][scope] logging),
│                                       subtitleEngine, ratings, searchRanking,
│                                       releaseCalendar, timezone, index (asArray)
├── api/
│   ├── tmdbClient.js                ← proxy-first fetch + 10s timeout + direct fallback
│   ├── movieService.js              ← all TMDB domain calls + normalizeResult
│   ├── omdbClient.js                ← OMDb IMDb/RT ratings lookup
│   ├── ratingService.js             ← ratings aggregation with 24h cache
│   ├── subtitleFetcher.js           ← OpenSubtitles-style SRT/VTT lookup
│   ├── cdnImageAdapter.js           ← TMDB image URL building + sizes
│   ├── videoSourceAdapter.js        ← iframe server registry + server ordering
│   ├── prefetchAdapter.js           ← QueryClient cache prefetching
│   └── virtualRenderAdapter.js      ← Virtual-list rendering helper
├── context/
│   ├── AuthContext.jsx              ← AppProvider + useAppAuth() — myList +
│   │                                  continueWatching merged into one context
│   └── PreferencesContext.jsx       ← settings engine (localStorage `setting-*`)
├── hooks/
│   ├── useUserData.js               ← useMyList, useContinueWatching (localStorage)
│   ├── useDebounce.js               ← Search input debounce
│   ├── useMediaQuery.js             ← Responsive breakpoint matching
│   ├── useRailArrows.js             ← Rail scroll-arrow enable/disable
│   └── useScrollRestoration.js      ← Scroll position restore across navigation
├── components/
│   ├── CustomVideoPlayer.jsx        ← Fixed Netflix-style player (black + #E50914),
│   │                                  CineSrc command API, subtitles, gestures
│   ├── playerUIDef.js               ← Shared player defs (PLAYER_SPEEDS)
│   ├── MovieCard.jsx                ← Cinematic hover card + Quick View modal
│   ├── ContinueWatchingRail.jsx     ← Cinejoy-style continue watching rail
│   ├── DiscoveryRails.jsx           ← Trend/Airing/Popular banner rails
│   ├── SearchResultRow.jsx          ← Search dropdown suggestion row
│   ├── ConfirmDialog.jsx            ← Animated confirmation modal
│   ├── Toast.jsx                    ← Notification toast system
│   ├── GlobalShortcuts.jsx          ← Keyboard shortcut handler + help modal
│   ├── Loader.jsx                   ← Full-page loading spinner
│   ├── BackToTop.jsx                ← Scroll-to-top floating button
│   ├── ErrorBoundary.jsx            ← React error boundary
│   └── EmptyState.jsx / SectionHeader.jsx / HeroTitleLogo.jsx / RatingsCluster.jsx / SEO.jsx
└── pages/
    ├── HomePage.jsx                 ← Landing: hero, category rails, Top 10
    ├── TitleDetailsPage.jsx         ← Player + metadata, season/episode picker
    ├── SearchPage.jsx               ← Search results with filters
    ├── GenrePage.jsx                ← Genre-filtered catalog
    ├── CategoryPage.jsx             ← Single category drill-down
    ├── PersonDetailsPage.jsx        ← Actor / director filmography
    ├── WatchlistPage.jsx            ← My List
    ├── HistoryPage.jsx              ← Continue Watching / history
    └── SettingsPage.jsx             ← Themes, playback, servers, subtitles
```

---

## 📄 Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/` | HomePage | Featured hero, category rails |
| `/movies` | HomePage (filter) | Movies only |
| `/series` | HomePage (filter) | TV shows only |
| `/search?q=` | SearchPage | Search with `?q=` query param |
| `/genre/:genre` | GenrePage | Genre-filtered catalog |
| `/category/:name` | CategoryPage | Single category drill-down |
| `/watch/:id/:slug?` | TitleDetailsPage | Player + full metadata (`movie-<n>` / `tv-<n>`) |
| `/person/:id/:slug?` | PersonDetailsPage | Actor/director page |
| `/watchlist` | WatchlistPage | Saved titles |
| `/history` | HistoryPage | Continue watching / history |
| `/settings` | SettingsPage | Preferences (themes, playback, servers, subtitles) |

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
| `VITE_SITE_URL` | `https://your-project.vercel.app` |

### `vercel.json`

The included `vercel.json` routes `/api/tmdb/(.*)` to the serverless proxy,
keeps SPA routing (all paths fall back to `index.html`), and sets cache
headers for hashed assets.

---

## 📖 More Documentation

- [Git workflow guide](GIT.md)
