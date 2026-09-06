<div align="center">

# 🎨 Streamly — Frontend

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-13-0055FF?logo=framer&logoColor=white)](https://www.framer.com/motion)
[![Firebase](https://img.shields.io/badge/Firebase-Auth+Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)](https://vercel.com)

**React 19 SPA — the Streamly user interface**

</div>

---

## 📋 Table of Contents

- [Setup](#-setup)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [Firebase Integration](#-firebase-integration)
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

# Create a `.env` file in the project root with the following:

```bash
# ─── Backend API ──────────────────────────────────────────────────────────────
VITE_API_URL=http://localhost:4000/api
# Production: VITE_API_URL=https://streamly-backend-9q7i.onrender.com/api

# ─── Direct Stream Service (Playwright) ────────────────────────────────────
VITE_STREAM_SERVICE_URL=http://localhost:3001

# ─── Firebase Web SDK ─────────────────────────────────────────────────────────
# Get from: Firebase Console → Project Settings → Your apps → Web app config
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-app-id
VITE_FIREBASE_STORAGE_BUCKET=your-app.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXX

# ─── App / URLs ───────────────────────────────────────────────────────────────
VITE_SITE_URL=https://your-site-origin
VITE_URL_DECODE_KEY=your_url_decode_key_here
```

> ✅ These are the **public web config** values — safe to commit and add to Vercel dashboard.
> Only `VITE_`-prefixed variables are exposed to the browser bundle.
> See `.env.example` for the complete template.

---

## 🗂️ Project Structure

```
src/
├── main.jsx                         ← React root: QueryClient, AuthProvider, ToastProvider
├── App.jsx                          ← Top-level router, navbar, page transitions
├── index.css                        ← Global CSS, variables, animations, skeleton loaders
├── queryClient.js                   ← TanStack Query client config
├── firebase.js                      ← Firebase app init — exports auth & db singletons
├── utils/                           ← Shared utilities + domain engines: index (decodeUrl,
│                                       asArray), timezone, ratings, searchRanking,
│                                       subtitleEngine, notificationEngine, releaseCalendar
│
├── api/
│   ├── movieService.js              ← fetch() wrappers for all backend /api/movies endpoints
│   ├── apiClient.js                 ← axios instance + interceptors (health-banner aware)
│   ├── platformAdapter.js           ← 20+ platform registry + source normalization
│   ├── cdnImageAdapter.js           ← TMDB image URL building + sizes
│   ├── authAdapter.js               ← Firebase auth facade
│   ├── storageAdapter.js            ← Firestore / localStorage persistence
│   ├── serverHealth.js              ← Backend cold-start health monitor
│   ├── subtitles.js                 ← Subtitle parsing/loading
│   ├── videoSourceAdapter.js        ← Stream source resolution
│   ├── prefetchAdapter.js           ← QueryClient cache prefetching
│   └── virtualRenderAdapter.js      ← Virtual-list rendering helper
│
├── context/
│   └── AuthContext.jsx              ← AuthProvider + useAppAuth() — merges Firebase auth,
│                                       myList, and continueWatching into one context
│
├── hooks/
│   ├── useUserData.js               ← useAuth, useMyList, useContinueWatching
│   │                                   (Firestore when signed in, localStorage for guests)
│   ├── useDebounce.js               ← Search input debounce
│   ├── useMediaQuery.js             ← Responsive breakpoint matching
│   └── useScrollRestoration.js      ← Scroll position restore across navigation
│
├── components/
│   ├── AuthModal.jsx                ← Glass-panel Sign In / Sign Up modal (Firebase Auth)
│   ├── ServerWakeupNotification.jsx ← "Server waking up…" cold-start banner
│   ├── MovieCard.jsx                ← Cinematic hover card with glass curtain effect
│   ├── CustomVideoPlayer.jsx        ← HLS player + episode/source switching
│   ├── DiscoveryRails.jsx           ← Trend/Airing/Popular banner rails
│   ├── SearchResultRow.jsx          ← Search dropdown suggestion row
│   ├── ConfirmDialog.jsx            ← Animated confirmation modal
│   ├── Toast.jsx                    ← Notification toast system
│   ├── GlobalShortcuts.jsx          ← Keyboard shortcut handler + help modal
│   ├── Loader.jsx                   ← Full-page loading spinner
│   ├── BackToTop.jsx                ← Scroll-to-top floating button
│   ├── ErrorBoundary.jsx            ← React error boundary
│   ├── EmptyState.jsx / SectionHeader.jsx / PlatformIcon.jsx / RailArrow.jsx
│   ├── CountdownBadge.jsx / LeavingSoonBanner.jsx / Popover.jsx / SEO.jsx
│   ├── MovieDetailsSkeleton.jsx
│   └── (theming/misc: src/components/*)
│
└── pages/
    ├── Home.jsx                     ← Main landing: featured banner, category rows, Upcoming, Top 10
    ├── TitleDetails.jsx             ← Video player + metadata, season/episode picker
    ├── SearchPage.jsx               ← Search results with genre & platform filters
    ├── GenrePage.jsx                ← Genre-filtered movie catalog
    ├── CategoryPage.jsx             ← Single category drill-down
    ├── WatchlistPage.jsx            ← My List page
    ├── HistoryPage.jsx              ← Continue Watching / watch history
    └── PersonDetails.jsx            ← Actor / director filmography page
```

---

## 🔥 Firebase Integration

### Auth flow

```
User clicks sign-in icon in navbar
    │
    ▼
AuthModal opens (Sign In / Sign Up tabs)
    │  createUserWithEmailAndPassword()
    │  signInWithEmailAndPassword()
    ▼
Firebase Auth → returns User + ID Token
    │
    │  onAuthStateChanged() listener in useAuth()
    ▼
AuthContext updates { user } across the whole app
    │
    ├── User avatar shows initials in navbar
    ├── My List syncs to Firestore  /users/{uid}/myList
    └── Continue Watching syncs to /users/{uid}/continueWatching
```

### Guest mode

Users who are **not signed in** still get full functionality:
- My List → stored in `localStorage` (`aios_my_list`)
- Continue Watching → stored in `localStorage` (`aios_continue_watching`)
- On sign-in, localStorage data is **automatically migrated** to Firestore

### Firestore security rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 📄 Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/` | Home | All platforms, featured banner, categories |
| `/series` | Home (filter: series) | TV shows only |
| `/movies` | Home (filter: movies) | Movies only |
| `/new` | Home (filter: new) | New & popular arrivals |
| `/anime` | Home (filter: anime) | Anime collection |
| `/search` | SearchPage | Search with `?q=` query param |
| `/genre/:genre` | GenrePage | Genre-filtered catalog |
| `/category/:name` | CategoryPage | Single category drill-down |
| `/movie/:platform/:id` | TitleDetailsPage | Player + full metadata |
| `/person/:id/:slug?` | PersonDetailsPage | Actor/director page |
| `/watchlist` | WatchlistPage | Saved movies |
| `/history` | HistoryPage | Continue watching / history |

---

## 🧩 Components

### `AuthModal`
- Firebase email/password Sign In & Sign Up
- Animated tab switcher, password visibility toggle
- Inline error messages with Firebase error code mapping
- Glass-morphism panel with spring animation

### `MovieCard`
- Cinematic curtain hover effect (Framer Motion `whileHover`)
- Shows: title, rating, year, platform badge, genre tags
- Quick-add to My List without leaving the page

### `Toast`
- Notification system with queue management
- Auto-dismiss with configurable duration
- Types: success, error, info

### `GlobalShortcuts`
- `Ctrl+K` / `Cmd+K` — focus search
- `?` / `Shift+?` — open keyboard shortcuts modal
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

---

## 🪝 Hooks & Context

### `useAppAuth()` — primary hook (use this everywhere)

```js
import { useAppAuth } from '../context/AuthContext';

const {
  user,               // Firebase User | null
  loading,            // boolean — auth state resolving
  register,           // (email, password, name) => Promise<User>
  login,              // (email, password) => Promise<User>
  logout,             // () => Promise<void>
  myList,             // movie[] — from Firestore or localStorage
  toggleMyList,       // (movie) => void
  isInList,           // (id) => boolean
  continueWatching,   // item[] — sorted by lastWatched
  updateProgress,     // (movie, season?, episode?) => void
  removeFromContinueWatching, // (movieId) => void
} = useAppAuth();
```

### `useDebounce(value, delay)`

```js
import { useDebounce } from '../hooks/useDebounce';
const debouncedQuery = useDebounce(searchQuery, 400);
```

### `movieService` — API client

```js
import { movieService } from '../api/movieService';

await movieService.searchMovies(query);
await movieService.getFeaturedMovies();
await movieService.getCategories(platform);
await movieService.getMovieDetails(id, platform);
await movieService.getSimilarMovies(id, platform);
await movieService.getSeasonEpisodes(id, seasonNumber, platform);
await movieService.getPersonDetails(id);
```

---

## 🚀 Deployment

Deployed on **Vercel** with automatic preview deployments for every pull request.

### Vercel environment variables (add in dashboard)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://streamly-backend-9q7i.onrender.com/api` |
| `VITE_FIREBASE_API_KEY` | from Firebase console |
| `VITE_FIREBASE_AUTH_DOMAIN` | `streamly-731c4.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `streamly-731c4` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `streamly-731c4.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | from Firebase console |
| `VITE_FIREBASE_APP_ID` | from Firebase console |
| `VITE_FIREBASE_MEASUREMENT_ID` | from Firebase console |

### `vercel.json`

The included `vercel.json` configures SPA routing — all paths fall back to `index.html` so React Router handles navigation.

---

## 📖 More Documentation

- [Git workflow guide](GIT.md)
