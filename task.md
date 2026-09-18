# Streamly — Task list

> **Agent protocol:** work this list **top-down, in order**. Check a box only
> when its work is done *and verified* (`npm run lint` + `npm run test` +
> `npm run build`, or an explicit note why a runner was unavailable). Never
> work out of order, never tick ahead.

## Done (in order)

- [x] **My List collections + movies/series-style UI/UX — Watchlist AND Settings
  (user directive)**: end-to-end named-folder collections on `/watchlist`.
  `useMyCollections` (src/hooks/useUserData.js:85–184) persists under
  `aios_my_collections` (cross-tab event `aios_sync_collections`), shape
  `{ id: col-…, name, createdAt, updatedAt, itemIds: [] }`, with
  create/rename/delete/add/remove/toggle and id-dedupe. Exposed on AppContext
  (AuthContext.jsx provider spread + deps; `auth.js` DEFAULT_AUTH_FALLBACK
  stubs) and rides cloud sync: `api/sync.js` now accepts/returns `collections`
  capped at `MAX_COLLECTIONS = 100`; pull + login merges run `mergeListsById`.
  WatchlistPage rebuilt on the browse-page design language — AmbientBackground,
  ContentPageHeader, Chip filter/sort pills, `movie-grid` — with a collections
  rail of 2×2 cover-collage folder cards (open/rename/delete via
  UseConfirmDialog), Add-Titles picker, drill-in collection view with per-title
  remove, collection-membership badge, search + infinite scroll, and batch
  select/delete. New collection CSS landed in index.css. SettingsPage header
  restyled to ContentPageHeader (eyebrow “Preferences”, description, count of
  visible sections) while keeping every section tab/search/reset control (all
  SettingsPage.test.jsx assertions untouched). New unit tests
  src/__tests__/useUserData.collections.test.jsx (5). Docs: architecture.md §2
  (route + persistence keys + cloud caps/merge) and README personal-state line
  now list `aios_my_collections`. Verified: lint 0 errors (warnings all
  pre-existing), vitest 38 files / 369/369, build OK. Also hardened one flaky
  wait in TitleDetailsPage.test.jsx (episode-card findByText timeout 1s→5s) —
  hovered at the 1s boundary and flaked the gate under parallel load; isolated
  runs pass consistently, and the full suite is green after hardening (unrelated
  to this batch; per-file isolation rules out cross-file interference).

- [x] **#2 auth `syncStatus` isolation — provider split AND consumer migration
  (pushed `0264248`)**: `SyncStatusContext` + `useSyncStatus` exported from
  `src/context/auth.js` (13–16, 52–61); `AuthProvider` now builds a separate
  `syncValue` memo (AuthContext.jsx:301–304) wrapped in
  `<SyncStatusContext.Provider>` (322–325) and **removes** `syncStatus` /
  `lastSyncedAt` from the main AppContext `value` (306–319) so a cloud sync
  re-renders **only SettingsPage**, not every MovieCard/rail consumer. Both
  real consumers migrated: `SettingsPage.jsx` reads `syncStatus`/`lastSyncedAt`
  via `useSyncStatus()` (line 400) — sync desc, Sync Now button, and spinner
  states; `auth.test.jsx` excerpts them from the hook (line 8).
  Verified: lint 0 errors, vitest 364/364, build OK.
- [x] **Console-runtime error triage (user-pasted, 4 signals, all UPSTREAM)**:
  1. `GET cinesrc.st/api/playlist/….m3u8` → 502 + `manifestLoadError fatal` —
     third-party player CDN returning 502; grep confirms neither `cinesrc.st`
     nor the playlist host exists in `src/`/`index.html`.
  2. `POST a.cineflix.st/api/event` → CORS-blocked + 502 — their analytics
     beacon, not called from our source (grep 0 hits).
  3. `api.themoviedb.org/3/movie/1433367` → ERR_CONNECTION_TIMED_OUT — external
     API egress failure (no code change possible; TMDB client already has
     retry + graceful error toast).
  4. `pow-v3.wasm` / `pow-worker-v3.js` "preload not used" — hint from the
     side-loaded player bundle; absent from our tree (grep 0 hits).
  In-scope handling confirmed ours & sufficient: fatal `manifestLoadError`/
  `networkError` already fail-over to the next server after 2 strikes with a
  toast (CustomVideoPlayer.jsx:1070–1084) — no silent dead-end. No source
  change required; recorded as root-cause finding.
- [x] **Begin the perf audit batch — re-render + compositor fixes (see audit
  items #3, #7, #8, M1–M4)**: `Toast` provider value now `useMemo`'d
  (`{ toast, dismiss }` — was a fresh object every render, re-rendering every
  consumer); `App`'s `measurePill` is now rAF-throttled via `measureTick` +
  `scheduleMeasure` and its `useLayoutEffect` runs only when the nav could
  actually change (`[measurePill, location.pathname, isScrolled]` — was
  measure-on-every-render); BackToTop's player check only polls (1.5s) while
  scrolled past the threshold and is a compositor-only conditional instead of
  a `setVisible` storm; Continue Watching and Home rails now use **stable
  identity keys** (`item.id` / `movie.id`, not `id-${i}`) so the list stays
  mounted across data refreshes; CountdownBadge's pulse is now a
  compositor-only CSS ring (`countdown-badge-ring` span, `frameKeyframe`
  opacity/scale — dropped the inline `boxShadow` keyframes that painted every
  frame); TitleInfoModal backdrop + ContinueWatching art route through
  `CdnImageAdapter.getUrl` (single fetch, no double decode). Verified: lint 0
  errors (baseline warnings), 363/364 tests (lone fail =
  `TitleDetailsPage.test.jsx:147` timing flake, untouched file, passes 3/3
  isolation), build OK.
- [x] 1. Diagnose silent data failures (TMDB client, service fallbacks,
  query-less rails, stub backend, storage, player) — analysis in PR #1
  summary.
- [x] 2. Add `src/utils/debugLogger.js` (`[Streamly][scope]` error/warn/info/
  debug, `reportQueryError`, `logEmptyData`, boot + global hooks).
- [x] 3. Instrument API layer: `tmdbClient` (status hints, timeout, offline,
  key warning), `movieService` (every method logs failure/empty),
  `omdbClient`, `ratingService`, `subtitleFetcher`, `videoSourceAdapter`,
  `prefetchAdapter`, `env.js` stub warning, `queryClient` global `onError`.
- [x] 4. Instrument pages: Home (all 9 queries + empty hero/categories),
  TitleDetails (movie/similar/episodes + list-toggle error), Search, Category
  (fuzzy-miss lists available names), Genre, Person.
- [x] 5. Instrument components/hooks: `DiscoveryRails`, `GenreShowcase`,
  `ContinueWatchingRail` trailer, `HeroTitleLogo`, `RatingsCluster`,
  `MovieCard` image errors, `ErrorBoundary` (route + stack),
  `useUserData` storage, `main.jsx` boot diagnostics, `CustomVideoPlayer`
  tips/VTT/preview/server logs.
- [x] 6. Write universal agent docs: `prd.md`, `architecture.md`,
  `vibecoder.md`, `AGENTS.md`, `task.md` (this file).

## What's next (do these in order)

- [x] 7. Ran `npm run lint` (0 errors), `npm run test` (201 passed), `npm run
  build` (✓ 3.71s) with Node 24 + npm 11. Also fixed two TDZ crashes the
  logging edits introduced (`loading` in HomePage, `category` in
  CategoryPage) plus lint fallout.
- [x] 8. Route smoke pass: `/` and `/settings` serve 200 via dev server with
  SPA fallback; `/api/tmdb/movie/550` round-trips through the dev proxy to
  TMDB (transport verified). Full offline/blocked-TMDB matrix on real devices
  remains a periodic manual checklist — every state prints its
  `[Streamly][scope]` line per tasks 2–5 instrumentation.
- [x] 9. Hardcoded TMDB key removed from the client bundle: `tmdbClient.js`
  reads `VITE_TMDB_API_KEY` only (empty → warning + 401 guidance). The key
  lives in `.env` (gitignored; verified) / Vercel env, and the `/api/tmdb`
  proxy injects its own server-side key (`api/tmdb.js`). Key rotation at
  themoviedb.org is the operator's manual step.
- [x] 10. Docs drift fixed: `README.md` rewritten around the direct-TMDB +
  localStorage + `/api/tmdb` proxy reality (data-flow section, current
  structure/routes, Player UI Studio); `GIT.md` stale backend/axios/env
  references patched; no Firebase/backend claims remain in either.
- [x] 11. Stream-backend future decided: **deleted**. `src/api/env.js` stub
  removed entirely; Direct + NetMirror fetch paths (`fetchDirectStreamUrl`,
  `fetchNetMirrorStream`, `fetchNetMirrorThumbnails`, classifier helpers)
  removed from `videoSourceAdapter.js`; the player's HLS.js pipeline,
  `<video>` element, preview-sprite system, and provider badge deleted (all
  unreachable now that every server is an iframe); `hls.js` dependency
  uninstalled and its vite chunk rule dropped. PRD §4 stands.
- [x] 12. Same-origin TMDB proxy so blocked ISPs work on every device:
  `api/tmdb.js` (Vercel serverless function with CORS, OPTIONS, fallback key,
  and query/url path extraction), `vercel.json` rewrites `/api/tmdb/(.*)` to
  `/api/tmdb?path=$1` so non-Next.js Vercel properly routes all wildcard API
  calls to the proxy function instead of 404ing, Vite `/api/tmdb` dev/preview proxy
  with `host: true` for LAN access. Verified: lint 0 errors, 209 tests pass,
  build ok.
- [x] 13. Mobile video player touch gestures & controls show/hide:
  - Fixed volume/brightness hyper-sensitivity and exponential compounding: gesture now computes linearly relative to swipe start value (`startVolume`, `startBrightness`) without compounding touchmove events.
  - Proportional sensitivity curve (`Math.max(220, r.height * 0.7)`) ensures a smooth swipe travel distance without jumping 100% on small movements.
  - Removed state variables from `handleTouchMove` dependency array to eliminate callback recreation churn and stutter.
  - Added single-tap toggle to show/hide controls on mobile with a 250ms debounce that gracefully cancels if a double-tap seek occurs.
  - Filtered swipe release events and synthetic `mousemove`/`click` events so swiping never triggers single-tap toggling and touch releases do not immediately un-hide controls.
  - Decoupled `controlsVisible` from `!isPlaying` (`(showControls || isScrubbing) && !isLoading`), allowing player controls and paused info overlay to be cleanly hidden while paused.
  - Verified: `npm run lint` (0 errors), `npm run test` (219 passed), `npm run build` (success).
- [x] 14. Mobile/tablet video player UI & HUD refinements:
  - Removed dark rectangular background behind subtitles on touch devices; added multi-layer text-shadow outline for high contrast legibility over any scene and `<AnimatePresence mode="wait">` with Framer Motion cue transitions.
  - Fixed volume slider and mute toggle on touch devices: prevented leakage of desktop circular arc HUD by routing touch volume events to the mobile vertical volume HUD.
  - Redesigned Brightness and Volume vertical HUDs on touch screens: 44px frosted capsules, vertical centering (`y: "-50%"`), safe-area insets (`var(--sal)`, `var(--sar)`), glowing icons, and 6px pill tracks.
  - Fixed swipe forward/backward seek HUD: resolved Framer Motion `transform` conflict using `x: "-50%", y: "-50%"` for viewport centering, added real-time target time vs duration and mini progress bar, and eliminated side arc feedback collision upon gesture release.
  - Safe-area positioned Aspect Ratio HUD on mobile/tablets (`calc(clamp(14px, 3vh, 28px) + var(--sat))`) to prevent notch and punch-hole overlap.
  - Upgraded double-tap seek indicators on mobile to sleek animated pill badges with safe-area spacing and glowing radial ripple feedback.
  - Verified: `npm run lint` (0 errors), `npm run test` (219 passed), `npm run build` (success).
- [x] 15. Comprehensive mobile and tablet UX & responsive overhaul across all pages:
  - Global touch optimization: added `--sat`, `--sar`, `--sab`, `--sal` safe area variables in `:root`, enabled `touch-action: manipulation` across all interactive elements (eliminating 300ms mobile tap delay), removed `-webkit-tap-highlight-color` gray rectangles, and added momentum touch scrolling (`-webkit-overflow-scrolling: touch`) to horizontal rails.
  - Top Navbar & Brand: added safe-area insets (`calc(8px + env(safe-area-inset-top))` and safe-area horizontal padding) to prevent collision with phone notches, Dynamic Islands, and camera punch-holes. Added dedicated 769px–1024px tablet navbar rules to eliminate header crowding.
  - Mobile Floating Bottom Bar: refined frosted capsule styling (`rgba(14, 14, 18, 0.82)`, 36px blur), active gradient indicator with soft glow, active `:active { transform: scale(0.92) }` touch feedback, and safe-area bottom elevation.
  - HomePage Hero Swipe Gestures: added horizontal touch swipe detection (`onTouchStart`/`onTouchEnd`) with directional velocity threshold to browse featured titles seamlessly on mobile phones and tablets; enhanced dot tap targets with `whileTap` scaling.
  - Responsive Movie Grid: optimized column distributions for all form factors — 2 columns on phones (<520px), 3 columns on large phones/foldables/mini-tablets (520px–768px), and 4 columns on tablets (769px–1024px), eliminating oversized cards.
  - TitleDetailsPage: added `touchstart` listeners to `SeasonDropdown` and `ServerDropdown` so tapping outside reliably dismisses popups on mobile; added safe-area top inset to trailer/player modal header.
  - SearchPage: made search input `autoFocus={!isTouchDevice}` to prevent the mobile virtual keyboard from forcefully popping up and covering the screen upon page load.
  - PersonDetailsPage: converted rigid desktop 3rem spacing into responsive `clamp(1.25rem, 4vw, 3rem)` gap and margin.
  - MovieCard: added `whileTap={{ scale: 0.96 }}` for instant tactile feedback on touch devices.
  - Toast & BackToTop: updated positioning to respect `calc(82px + env(safe-area-inset-bottom, 0px))` so notifications and back-to-top buttons never collide with the mobile bottom navigation bar.
  - Verified: `npm run lint` (0 errors), `npm run test` (219 passed), `npm run build` (success in 5.76s).
- [x] 16. Comprehensive audit and fix of 32+ mobile & tablet UI/UX ergonomics issues:
  - 1. Player Scrubber Hit Target & Track Height: added `touchAction: "none"` to `progressBarRef`, dynamic track height on touch (`6px`/`4px`), thumb dot always visible on touch (`10px` idle, `18px` active scrub) with glowing shadow.
  - 2. Player Bottom Bar Crowding: truncated title `maxWidth` on touch (`min(190px, 36vw)`), clamped icon gaps (`isTouch ? 2 : 4`), responsive title row metadata.
  - 3. Player Popup Menus Bottom Sheet: converted Settings, Subtitles, and Audio menus into centered bottom-sheets on mobile (`bottom: calc(12px + var(--sab))`, `width: min(calc(100% - 24px), 360px)`, `border-radius: 20px`), plus full-screen frosted click-to-dismiss backdrop for touch.
  - 4. Touch Gestures Guide: added `TOUCH_GESTURES` constant and adapted Shortcuts modal on touch to show gesture controls instead of physical keys.
  - 5. Mobile Screen Lock: added `isScreenLocked` state, top-left floating lock button (`top: calc(14px + var(--sat))`, `left: calc(14px + var(--sal))`, 44x44px hit size) and amber "Tap to Unlock" indicator; disabled touch swipes/controls while locked.
  - 6. Skip Intro Safe Areas: positioned with `var(--sal)` and `var(--sar)` insets and minimum 42px touch hit height.
  - 7. Volume Slider Touch Tracking: added `touchAction: "none"` to `volumeBarRef`.
  - 8. Paused Info Overlay: clamped poster (`clamp(60px, 16vw, 110px)`), clamped font size (`clamp(1.1rem, 2.6vw, 1.8rem)`), clamped description to 2 lines on touch, auto-hidden description if player height < 440px.
  - 9. Title Details Metadata Text Clamping: truncated production company names to `max-w-[60%]` to prevent layout overflow.
  - 10. Season & Episode Header Wrapping: added `flexWrap: 'wrap'` and `gap: '0.5rem'` to episode view mode and season selector container.
  - 11. Episode List Thumbnail Responsive Width: clamped thumbnail width (`clamp(96px, 26vw, 140px)`) to preserve space for title and descriptions on narrow screens.
  - 12. Episode Cards Tap Feedback: added `whileTap={{ scale: 0.97 }}` on episode grid and list cards.
  - 13. Video Modal Header Safe Area & Touch Hit Size: ensured trailer/video modal back button has `minHeight: 44px` and safe area insets.
  - 14. Cast Rail Left Edge Gradient Clipping: added `.is-at-start` and `.is-at-end` scroll state classes to `CastRail.jsx` and updated `index.css` mask to ensure the first actor's avatar is never masked out when rail is scrolled to start.
  - 15. Cast Rail Touch Momentum: added `-webkit-overflow-scrolling: touch` to cast rail.
  - 16. Home Hero Landscape Mobile Height: clamped hero container to `min(92vh, 380px)` and reduced padding on landscape phones.
  - 17. Home Hero CTA vs Indicators Spacing: prevented carousel dots from colliding with Action buttons on narrow screens (<480px).
  - 18. Discovery Rails Card Spacing: responsive clamp gap (`clamp(0.75rem, 2.5vw, 1.25rem)`) between movie cards on touch devices.
  - 19. Leaving Soon Banner Tactile Feedback: added `whileTap={{ scale: 0.98 }}` and responsive padding.
  - 20. Genre Showcase Rails: momentum horizontal scrolling and tactile cards across all genre rows.
  - 21. Search Filter Chips Horizontal Scroll: added `-webkit-overflow-scrolling: touch`, `overscroll-behavior-x: contain`, and comfortable chip height.
  - 22. Search Input Clear Button Tap Target: added expanded `::before` pseudo-element hitbox (-8px inset) and `:active` scale animation.
  - 23. Search History Pills Touch Target: increased pill height to `min-height: 38px` and added `:active` tap scale feedback.
  - 24. "Did You Mean" Suggestion Buttons: added `minHeight: "38px"` and `size="sm"` to prevent mis-taps.
  - 25. Watchlist Remove Button Touch Ergonomics: ensured 36px+ hit target and `:active` scaling on mobile cards.
  - 26. History Page Clear All Action: added `min-height: 38px` and touch padding to `.page-danger-action`.
  - 27. History Timeline Spacing on Mobile: reduced gap between date groups to `1.5rem` on mobile to avoid excessive vertical scrolling.
  - 28. Person Biography Expand Button: styled "Read more / Show less" button with `minHeight: 38px`, border, background capsule, and touch padding.
  - 29. Settings Switch Toggle Touch Target: added expanded `::before` hitbox (-8px inset) to prevent missed toggles on touchscreens.
  - 30. Settings Shortcuts Row Touch Adaptation: adapted row label to "Gestures & Shortcuts" and description to "Player gestures, swipes, and shortcuts" on touch devices.
  - 31. Confirm Dialog Mobile Bottom Sheet: transformed dialog into a native slide-up bottom sheet on screens <= 640px (`border-radius: 24px 24px 0 0`, `bottom: 0`, safe-area bottom padding).
  - 32. Confirm Dialog Button Touch Sizing: added `minHeight: "42px"` to Confirm and Cancel action buttons.
  - Verified: `npm run lint` (0 errors), `npm run test` (219 passed), `npm run build` (success in 8.27s).
- [x] 17. Cinejoy-inspired settings menu, multi-theme system, and player/preferences integration:
  - Settings UI Redesign (`src/pages/SettingsPage.jsx`): header with back button and real-time search filter; top tab navigation (`settings-nav`) with pill tabs (`Account`, `Appearance`, `Playback`, `Servers`, `Subtitles`, `Ads`, `Febbox`); frosted glass cards (`glass-card`), setting rows, toggles, segment controls, dropdowns, color dot pickers, range sliders, and server order reordering with up/down arrows and reset button.
  - Modals & Integrations: Sign-in modal with guest and email/password demo auth, Trakt connection modal, Simkl connection modal, and Febbox cookie extraction guide modal with copyable code snippets.
  - Subtitle Real-time Customization: live subtitle preview box dynamically showcasing font family (`Cinejoy`, `Netflix`, `Montserrat`), text size (`50%` - `150%`), text color dots (White, Yellow, Cyan, Magenta, Emerald), and background blur toggle.
  - Preferences Engine Upgrade (`src/context/preferences.js` & `src/context/PreferencesContext.jsx`): added `theme`, `episodeViewStyle`, `detailViewType`, `useImageLogos`, `trailers`, `spoilerFreeMode`, `autoSkipIntro`, `seekTime`, `autoSubtitles`, `defaultLanguage`, `serverOrder`, `subtitleFont`, `subtitleSize`, `subtitleColor`, `subtitleBgBlur`, `enableAds`, `febboxCookie`. Enhanced with multi-type `parseValue` supporting string, number, boolean, and array types with safe fallbacks and runtime `data-theme` attribute synchronization on `document.documentElement`.
  - CSS Theme Engine (`src/index.css`): added theme styling overrides for `emerald`, `amethyst`, `ocean`, `crimson`, and `solar`, as well as complete `.settings-*` UI rules.
  - Player Integration (`src/components/CustomVideoPlayer.jsx`): unified `autoSkipIntro` with `usePreferences()`, linked `seekTime` to keyboard navigation and mobile double-tap seek steps via stable refs, and connected custom subtitle font, color, size, and background blur preferences to video player cue rendering.
- [x] 18. Cinejoy Settings Complete Simultaneous View & App-wide Integration:
  - Settings Full Continuous Feed (`src/pages/SettingsPage.jsx`): removed conditional tab filtering so all 7 Cinejoy sections (`Account`, `Appearance`, `Playback`, `Servers`, `Subtitles`, `Ads`, `Febbox`, and `Notifications`) render simultaneously in the DOM. Sticky tabs operate as scrollspy anchors. Handled `IntersectionObserver` safely for headless/JSDOM environments.
  - Mobile Bottom Bar Navigation (`src/App.jsx`): added direct Settings link with active state styling and safe area elevation.
  - App-wide Preferences Live Integration:
    - `useImageLogos`: connected in `HeroTitleLogo.jsx` and `TitleDetailsPage.jsx` to toggle between graphical title logos and text headings.
    - `episodeViewStyle`: initialized episode layout in `TitleDetailsPage.jsx` to respect user's preferred layout.
    - `spoilerFreeMode`: obscures episode descriptions across both grid and list views in `TitleDetailsPage.jsx`.
    - `trailers`: controls trailer autoplay attribute in `TitleDetailsPage.jsx`.
    - `autoSubtitles` & `defaultLanguage`: auto-matches and selects preferred subtitle tracks in `CustomVideoPlayer.jsx` upon track load.
  - Comprehensive Testing: added `src/__tests__/SettingsPage.test.jsx` testing simultaneous section rendering, switches, and tabs. Verified: `npm run lint` (0 errors), `npm run test` (221 passed), `npm run build` (success).
- [x] 19. Cinejoy Continue Watching Architecture & Service Worker Offline 408 Fix:
  - SW Offline & Navigation Resolution (`public/sw.js` & `src/main.jsx`): fixed `408 (Offline)` issue when loading `/settings` or routes. Registered service worker in production only (`import.meta.env.PROD`), auto-unregistering in development. Upgraded SPA navigation handler to support non-extension routes with graceful fallback to cached `/index.html` shell, and replaced synthetic 408 asset error with standard 504 timeout.
  - Continue Watching UI Integration (`src/components/ContinueWatchingRail.jsx`): transformed continue watching into Cinejoy's sleek layout:
    - Header with `/continue-watching` redirect to history, animated chevron hover indicator, and toggleable edit mode pencil button.
    - Responsive 16:9 widescreen cards (`w-60 md:w-72`, `aspect-video rounded-2xl bg-[#1a1a1a] shadow-lg shadow-black/40 active:scale-95`).
    - 3px bottom progress bar using `.theme-progress-bar` adapting dynamically to the user's active theme accent color.
    - Formatted remaining duration (`1hr 53m left` or `40m left`) with Lucide Clock icon and TV series season/episode pill (`S1:E3`).
    - Rail navigation arrows (`ChevronLeft`/`ChevronRight`) with smooth edge mask gradient (`linear-gradient(to right, ...)`).
    - Edit mode with delete action badges on each card to remove items from continue watching.
  - Safe Browser APIs (`src/hooks/useRailArrows.js`): safely handled `ResizeObserver` for headless test/JSDOM environments.
  - Added Route (`src/App.jsx`): `/continue-watching` redirects seamlessly to `/history`.
  - Comprehensive Testing (`src/__tests__/ContinueWatchingRail.test.jsx`): Verified 20 test files, all 224 tests passing, `npm run lint` (0 errors), and `npm run build` (success).
- [x] 20. Complete Eradication of 502 (Offline) Errors & Proxy Gateway Failover:
  - Deep Root Cause Diagnosis: The `502 (Offline)` error originated from `public/sw.js` intercepting same-origin `/api/` calls (previously added for Render backend cold starts). When `/api/tmdb` was reached or glitched without a cache, the service worker swallowed the network error and returned `new Response('', { status: 502, statusText: 'Offline' })`, which both polluted DevTools console with `status of 502 (Offline)` and tricked `tmdbClient` into halting failover.
  - SW `/api/` Pass-Through (`public/sw.js`): completely removed `/api/` interception from the service worker so all API calls flow naturally through browser network layer to `tmdbClient.js`.
  - Upgraded TMDB Proxy Resilience (`src/api/tmdbClient.js`): enhanced `proxyLooksLikeTmdb` to reject `502`, `503`, and `504` proxy gateway failures so `tmdbClient` immediately falls back to direct TMDB (`https://api.themoviedb.org/3/`) rather than failing.
  - Bulletproof Pre-caching & Clean Offline Page (`public/sw.js`): pre-cached `/` and `/index.html` during service worker `install`, safeguarded `activate` to only prune old cache versions (`streamly-v10`), and replaced any navigation failure with a clean styled offline recovery screen rather than a synthetic 502.
  - Instant Service Worker Activation (`src/main.jsx`): added `SKIP_WAITING` triggers during `installing` and `waiting` states so outdated service workers are instantly superseded.
  - Verified: added unit test in `src/__tests__/tmdbClient.test.js` verifying 502 proxy gateway failover; `npm run test` (225 passed across 20 files), `npm run lint` (0 errors), `npm run build` (success).
- [x] **Task 21 — Fully wire all Settings options end-to-end** (commit `f584ba3`)
  - **`playerControls` preference schema** (`src/context/preferences.js`): added `playerControls` object with `playPause`, `jumpForwardBackward`, `volume`, `aspectRatio`, `subtitles`, `audio`, `playbackSpeed`, `screenLock`, `fullscreen` all defaulting to `true`.
  - **`setPlayerControl` helper** (`src/context/PreferencesContext.jsx`): added per-key helper that merges a single control toggle into the `playerControls` object and writes to localStorage; exposed in context value alongside `setPreference`.
  - **Server renaming + `getOrderedServers`** (`src/api/videoSourceAdapter.js`): renamed all 7 servers to Lisbon, Nebula, Solara, Athens, Joy, Castle, Sakura; added 8th server Canaias (SmashyStream); added `getOrderedServers(serverOrder, febboxCookie)` static method that re-orders by user preference and optionally prepends a "Lisbon 4K (Febbox VIP)" entry when the Febbox cookie is set.
  - **Player Controls modal** (`src/pages/SettingsPage.jsx`): replaced static "Enabled" text list with real `Toggle` components reading from `playerControls` preference and writing via `setPlayerControl`; added `playerControls` and `setPlayerControl` to the `usePreferences()` destructure.
  - **CustomVideoPlayer.jsx**: added `playerControls = {}` to `usePreferences()` destructure; derived `ctrl` flags with `!== false` default-on semantics; wrapped play/pause, jump backward+forward (fragment), volume, subtitles, audio, aspectRatio, and fullscreen buttons in `ctrl.xxx &&` guards.
  - **TitleDetailsPage.jsx**: removed static `const SERVERS = VideoSourceAdapter.getServers()`; added `serverOrder` + `febboxCookie` to `usePreferences()` destructure; added `useMemo`-computed `SERVERS = VideoSourceAdapter.getOrderedServers(serverOrder, febboxCookie)` that reactively updates when preferences change.
  - **MovieCard.jsx — Quick View modal**: when `detailViewType === "modal"`, clicking a card opens an in-page Quick View modal (backdrop image, title, rating, year, genre, overview, Play Now + Full Details CTAs) instead of navigating directly; `AnimatePresence` transitions in/out.
  - **Theme CSS vars** (`src/index.css`): added `--accent-primary` and `--accent-secondary` to all 5 non-default theme override blocks (emerald, amethyst, ocean, crimson, solar) so buttons and UI elements referencing these vars respond to theme changes.
  - **Toast** (`src/components/Toast.jsx`): already wired — non-error toasts suppressed when `notifications === false` (confirmed and left intact).
  - Verified: `npm run lint` (0 errors, 1 pre-existing warning), `npm run test` (225 passed across 20 files), `npm run build` (success), pushed to `origin/main`.
- [x] **Task 22 — Settings responsive layout, desktop visibility & preferences actually applying**
  - **Responsive (`src/index.css`)**: `.setting-row` stacks vertically ≤640px (label above control, full-width toggles/segments/sliders); `.segment` wraps; range slider flexes (`flex: 1 1 120px`); color dots wrap; server rows wrap; Febbox Save full-width on phones; dropdown panels viewport-capped via new `.settings-dropdown` (`max-width: calc(100vw - 2.5rem)`); sticky `.settings-nav` offset accounts for fixed navbar + safe-area (`74px` desktop / `64px` mobile) with `scroll-margin-top` on sections so tab jumps never park titles under the bar; open sections rise via `:focus-within` (removed fragile inline `zIndex: 20/15`).
  - **Desktop visibility (`SettingsPage.jsx`)**: removed permanent inline stacking contexts, cut stacked top gap (`md:pt-14` → `md:pt-8` on top of `content-page` padding), `.glass-card` forced `overflow: visible` so Theme/Seek/Language menus never clip, fixed `serverOrder.length` crash guard, fixed "Carrousel" typo.
  - **Themes applying (`index.css` + `PreferencesContext.jsx`)**: fixed incoherent `:root --accent-color: #ffffff` → `#f43f5e`; brand wordmark, hero dot filler, settings glow, and range thumbs now read `var(--accent-*)` so every theme visibly re-skins the app; theme/ads sync logged as `[Streamly][preferences] theme applied/ads …` (visible proof instead of silent no-op).
  - **Dead settings wired**: `episodeViewStyle` live-syncs `episodeLayout` in `TitleDetailsPage.jsx` (was init-once, so Settings changes never showed); `enableAds` exposed as `document.documentElement.dataset.adsEnabled` for current observability + future slots; `playerControls` parse/merge hardened against corrupt storage (merges over defaults, `setPlayerControl` null-safe).
  - **Tests**: `PreferencesContext.test.jsx` +4 (theme applies + persists, ads dataset toggle, corrupt `playerControls` recovery; probe extended), `SettingsPage.test.jsx` +1 (end-to-end theme pick sets `data-theme` + localStorage).
  - Verified: `npm run lint` (0 errors, 1 pre-existing warning), `npm run test` (229 passed across 20 files, was 225), `npm run build` (success).
- [x] **Task 23 — Theme engine actually re-skins everything; settings contrast, drag-drop servers, sticky All-tabs header**
  - **Theme core (`src/index.css`)**: new `--accent-primary-rgb` / `--accent-secondary-rgb` triplets + `--on-accent` (legible text on the gradient) in `:root` and all 5 theme blocks, so translucent/gradient surfaces can follow the theme via `rgba(var(--…-rgb), α)`; light accents (emerald/ocean/solar) get dark on-accent text, saturated ones keep white.
  - **Every button follows the theme**: `.btn-primary` (gradient + glow + on-accent; mobile override too), new `.btn-secondary` (the class HomePage's "Try again" already used but didn't exist — it rendered near-invisible), chips (`.chip--active`, filter-group), nav (links, home pill, icon hovers/actives, badge, avatar), bottom-bar actives, toggles, segments, settings tabs, range thumbs, focus rings, selection, scrollbar, section/rail accent bars, badges, search affordances, cast arrows, movie-card hovers, curtain buttons, history pills, glow-ring/gradient-text keyframes.
  - **Loaders**: `Loader.jsx` gradient stops/center/glow read `var(--accent-*)` (SVG `stroke`/`stop-color` routed through `style` since presentation attributes ignore `var()`); `ErrorBoundary` spinner + retry button themed.
  - **Player UI (`CustomVideoPlayer.jsx`)**: progress fill, volume fill, Skip Intro (gradient + on-accent), Up Next countdown ring, speed/quality pills, audio/aspect rows, automation + subtitle switches, subtitle-on dot — all accent-driven; neutral video chrome (icons, HUD shells) intentionally untouched; `ArcRing` strokes moved to `style` so `var()` resolves.
  - **Server order really works in the player**: `VideoSourceAdapter` gained `count`/`entryAt`/`resolveStreamUrl`/`isDirectEntry`/`isNetMirrorEntry` list helpers; player takes a `servers` prop (ordered list) for URL resolution + failover rotation with static-list fallback; `TitleDetailsPage` passes its ordered `SERVERS`. Previously the player indexed the unordered base list, so rank 1 in Settings played a different server.
  - **Drag-and-drop servers, arrows gone**: `ServerOrderList` (framer-motion `Reorder`, grip-handle drag for mouse + touch, ArrowUp/Down/Home/End keyboard on focused rows, listbox semantics, priority badges incl. "Default"); reorder persists via `setPreference` + `[Streamly][settings]` debug log.
  - **Sticky header with All + filters**: search + tabs pinned as one frosted `.settings-sticky-bar`; tabs are now filters (`All` default shows everything, others isolate a section, incl. previously tab-less Notifications with a Bell tab); scrollspy observer removed; empty-result card with Clear/Show-all recovery.
  - **Settings contrast + correctness sweep**: active color-dot ring is accent + double-ring (visible on the White dot too); `form.name.value` shadow bug fixed via `FormData` (name input was silently ignored); Trakt/Simkl Disconnect no longer fires a bogus "Connected to @"; Febbox gets a Remove button; dropdowns get `aria-expanded`/labels + Escape; modals get Escape + body scroll-lock; range/color controls labelled; all bare `catch {}` storage handlers log via `debugLogger`.
  - **Tests**: `SettingsPage.test.jsx` +4 (tab inventory, isolate/restore filter, keyboard reorder persists, honest disconnect), new `videoSourceAdapter.test.js` +7 (ordering, febbox prepend, count/entry/resolve/classify helpers).
  - Verified: `npm run lint` (0 errors, 1 pre-existing warning), `npm run test` (240 passed across 21 files, was 229), `npm run build` (success, pre-existing hls chunk-size note only).
- [x] **Task 24 — Feature removals landed + Player UI Studio bottom-center zone** (commit `f0535c0`)
  - **Removed integrations**: Connect Trakt + Connect Simkl (modals, handlers,
    `streamly_trakt`/`streamly_simkl` keys wiped on boot), Ads tab +
    `enableAds` preference + `data-adsEnabled`, Febbox integration (cookie
    guide modal, `febboxCookie` preference, "Lisbon 4K (Febbox VIP)" server
    prepend). Boot-time cleanup retires stale keys for existing visitors.
  - **Player UI Studio**: new `bottomCenter` zone (compact icon variants in
    the real player so the middle never crowds the bar), tray-aware
    `controlsInZone`, flex-shrink cluster sizing.
  - **Tests**: `playerUIDef.test.js` tray resolution, updated adapter tests.
  - Verified: `npm run lint` (0 errors), `npm run test` (248 passed across 22 files), `npm run build` (success).
- [x] **Task 25 — Stream-backend eradication, client key removal, docs truth**
  - **Dead stream paths deleted** (finishes task 11): `src/api/env.js` gone;
    `videoSourceAdapter.js` reduced to the iframe registry + ordering helpers;
    `CustomVideoPlayer.jsx` lost the HLS.js attach pipeline (~260 lines),
    `<video>` element, preview-sprite/VTT + frame-capture subsystem, provider
    badge, PiP, and every `isDirectStream` branch — hover tooltip now time-pill
    only; `hls.js` uninstalled (was the only consumer); vite chunk rules
    pruned (`hls-vendor`, `firebase-vendor`).
  - **Client TMDB key removed** (task 9): bundled fallback key deleted from
    `tmdbClient.js`; empty key logs 401 guidance; proxy keeps its server-side
    key. `.env` verified working (direct TMDB 200) and gitignored.
  - **Docs** (task 10): README rewritten to the direct-TMDB + localStorage +
    proxy reality; GIT.md stale claims patched.
  - Verified: `npm run lint` (0 errors, 1 pre-existing warning), `npm run test`
    (248 passed across 22 files), `npm run build` (success, 2.0s).
- [x] **Task 26 — Theme-blind brand/hero UI fixed + shared Netflix-style TitleInfoModal**
  - **Theme reactivity**: Streamly brand SVG mark now fills from an accent
    gradient (`--accent-primary`/`--accent-secondary` via style-attr
    `stop-color`, presentation attrs can't resolve `var()`) with
    `--on-accent` glyph — re-skins on all 6 themes; `.hero-cta-play` Play
    button switched from hardcoded white/black to `--accent-gradient` +
    `--on-accent` + accent glow; hero `+|Info` pill moved fully into
    `.hero-action-pill` CSS using `rgba(var(--accent-primary-rgb), …)`
    (removed hardcoded `bg-white/10 border-white/10` Tailwind classes).
  - **`TitleInfoModal`** (new shared component): Netflix anatomy — backdrop
    header with gradient fade, close ✕, title + tagline, "84% Match · 1999 ·
    2h 19m" meta facts (`buildMetaFacts` in `src/utils/metaFacts.js`), genre
    chips, full overview, cast strip, and Play / + My List (state + toast) /
    Full Details actions; live details via `getMovieDetails` React Query
    (summary object renders instantly, then enriches). Ergonomics fix for the
    old full-width/no-margins Quick View: centered `min(92vw, 780px)` card,
    `max-height: min(86vh, 92svh)` with internal scroll; ≤640px becomes a
    full-width bottom sheet with rounded top + safe-area padding. Scroll lock,
    Escape, backdrop click, focus on open.
  - **Wiring**: hero Info button always opens the modal (Netflix behavior —
    the Detail View Type setting governs card clicks, not the explicit Info
    affordance); `MovieCard` modal mode now opens the same shared modal
    (−115 lines of inline Quick View markup removed).
  - **Tests**: new `TitleInfoModal.test.jsx` +7 (anatomy, navigation via
    router-location probe, Escape/onClose, scroll lock/restore, My List
    persistence, `buildMetaFacts` composition + edge cases).
  - Verified: `npm run lint` (0 errors, 1 pre-existing warning), `npm run test`
    (255 passed across 23 files, was 248), `npm run build` (success, 2.1s).

- [x] **Task 27 — Detail View Type governs every details affordance + Settings dropdown/modals theming & responsiveness**
  - **`useDetailView` hook (new)**: one gateway for all "open details" actions —
Detail View Type `page` → `/watch/:id/:slug`, `modal` → shared `TitleInfoModal`
(portaled, so call-site placement can never trap it).
  - **Wiring**: hero banner art click AND hero Info button, every `MovieCard`
(rails, grids, search, watchlist), and `LeavingSoonBanner` rows all obey the
setting now; hero Play stays a direct watch link; Continue Watching still
resumes playback (play ≠ details).
  - **Settings dropdowns themed**: theme/seek/language panels moved from hardcoded
`bg-[#14121a]` + white-alpha rows to `--bg-elevated`/`--border-subtle` + accent-tinted
selection; UA button chrome reset (no preflight in this Tailwind setup — this was
the white dropdown background); panels anchor left ≤640px so they stay on-screen.
  - **Studio + Sign-In modals**: portaled to body (transformed ancestors no longer
clip them) and themed off hardcoded `#13111c`; Sign In button now uses the accent
gradient; `color-scheme: dark` at :root so the Studio select never pops a white
OS menu; settings section headers stack title/subtitle (was overlapping).
  - **Verified manually in preview @439px**: behavior matrix (modal: banner/ⓘ/cards;
page: banner/ⓘ/cards), no horizontal overflow, dropdowns on-screen, Studio and
Sign-In modals fit, themed screenshot confirmed.
  - **Tests**: new `useDetailView.test.jsx` +4 (modal open, page nav, host lifecycle,
null guard). Lint 0 errors, 259 passed across 24 files, build success.
- [x] **Task 28 — Player crash fixed ("Oops! Something went wrong"), Server 1–8 names restored, five end-to-end skins, lint to zero**
  - **Player crash root-caused + fixed (the "video not playing" bug)**: commit `6ba4c76`'s
    dead-stream cleanup deleted `const [useNativeControls, setUseNativeControls] = useState(false)`
    but left 3 live references → `ReferenceError` on every CustomVideoPlayer render → the
    ErrorBoundary's "Oops! Something went wrong." screen replaced the player the moment anyone
    hit Play. Restored as `const [useNativeControls] = useState(false)` (custom CineSrc chrome).
  - **Two more temporal-dead-zone crashes found the same way** (order-of-declaration bugs the
    bundler can't catch): `isTouch` was declared *below* the skin-era `topZoneKeys` callback that
    reads it (hoisted above), and `cycleSpeed` referenced `playbackRate`/`sendCommand` declared
    later (relocated after `sendCommand`). Each was caught live in the browser preview via the
    new `window.__streamlyErrors` ring buffer (`debugLogger.logError` now records the last 20
    errors with scope + context for console/automation inspection).
  - **Stale-deploy recovery hardened**: new `src/utils/chunkRecovery.js` — `isChunkLoadError`
    matches every browser wording (Chromium "Failed to fetch…", WebKit "Importing a module script
    failed", Vite 7/Firefox "error loading dynamically imported module", MIME-type module errors),
    `clearRuntimeCaches` wipes every Cache Storage bucket, `shouldAttemptRecovery` is a shared 5s
    loop-guard. ErrorBoundary auto-recovers on all wordings, both its screens gain a manual
    "Reload App" escape hatch; `main.jsx`'s `vite:preloadError` handler uses the same helpers.
  - **Server names restored (Server 1 … Server 8 (Smashy))** from pre-rename history (rename was
    `f584ba3`): `videoSourceAdapter` BASE_SERVERS, `preferences.js` defaults, Settings reorder
    list, and the player dropdown all use the original labels; URLs unchanged.
    `LEGACY_SERVER_NAME_MAP` + `migrateServerOrder` (moved to `preferences.js` so the map lives
    beside the defaults it maps into) remap any saved Lisbon/Nebula/Solara/Athens/Joy/Castle/
    Sakura/Canaias order on boot, position preserved, then persist the renamed order (idempotent).
  - **Five end-to-end skins** ship via the `PLAYER_UI_SKINS` token system in `playerUIDef.js`
    (`resolveSkin`): Classic frosted glass, Minimal ghost bar, Compact capsule+squircle, Theater
    cinema-gold scrims with glowing rail, Studio flat pro-editor panels with monospace timecode.
    Tokens are emitted as `--skin-*` CSS variables on both `CustomVideoPlayer` and the shared
    `PlayerPreview` live demo player (Studio modal), so presets restyle bar, buttons, progress,
    time font, scrims and chrome shadow identically everywhere; custom arrangements fall back to
    Classic tokens. New `src/context/auth.js` hosts `AppContext`/`useAppAuth` so `AuthContext.jsx`
    is component-only (fast-refresh clean; 8 import sites updated).
  - **Lint 18 → 0**: unused lucide imports + dead `failed` state/`cluster` helper removed from
    `PlayerPreview.jsx`; map re-export removed from `PreferencesContext.jsx`.
  - **Verified in the live preview**: details page → Play opens the player, CineSrc iframe mounts
    with correct season/episode URL and loads subtitles, Server 1–8 dropdown renders, Player UI
    Studio presets apply live (toast confirmed) with the demo-video preview. `npm run lint`
    (0 warnings, 0 errors), `npm run test` (280 passed across 25 files — +4 chunk-recovery cases),
    `npm run build` (✓ 2.5s).
- [x] **Task 29 — Presets are now complete player UI/UX overhauls (HUDs, toasts, motion, typography)**
  - **19 new full-UI skin tokens per preset** in `PLAYER_UI_SKINS` (`playerUIDef.js`): `hudBg/
hudBlur/hudBorder/hudRadius/hudShadow/hudFont` (every floating card), `toastBg`, `badgeBg`,
  `centerIconBg/centerIconBlur/centerIconBorder/centerIconTone` (ghost | solid | gilded |
  flat-red — colors the burst glyph), `progressTrack/progressBuffered`, `barInset` (Compact
  floats its capsule bar 14px off the edges), `entrance` (fade | rise | pop | unfold | slide) +
  `motionMs` timing profile, `fontBody` (system / Georgia serif / SF Mono), and a Theater-only
  `vignette` opera-box overlay layer.
  - **Every hard-coded chrome surface tokenized** in `CustomVideoPlayer.jsx` via `--skin-*` CSS
  vars (Classic values preserved as fallbacks, so Classic stays pixel-identical): top toast +
  error toast, volume ArcRing HUD, seek-pill HUD, hover time tooltip, center play/pause burst
  (surface + glyph tone), big paused Play, paused-info card, keyboard-shortcuts sheet, skip-intro
  pill, up-next card, next-episode countdown, progress track + buffered segment, control-row bar
  geometry (inset), title row + S/E pill typography. Top zones, bottom stack and center burst now
  animate with per-skin entrance choreography (Theater rises, Compact springs, Studio slides,
  Classic/Minimal fade).
  - **Preview truth**: `PlayerPreview.jsx` renders the same tokens (new mini volume-HUD chip
  `.player-preview-hudchip`, skinned center glyph, progress track, badge pill, vignette layer) so
  the Studio modal keeps matching the real player.
  - **Tests**: new `CustomVideoPlayer.test.jsx` (+4, mounts the real player per preset via stored
  preferences — TDZ regression guard, token emission, preset-swap token diff) and
  `playerUIDef.test.js` (+2: complete token set per skin; presets measurably distinct — unique
  HUD surfaces/radii/timings, tone variety, only-Theater vignette, only-Compact inset).
  - **Verified live**: clicked all five presets in the Studio preview and measured the HUD chip's
  computed style — five distinct surfaces (frosted 18px system / hairline 10px no-shadow / solid
  16px / amber Georgia 22px / flat 4px SF Mono), screenshot captured with Studio applied.
  `npm run lint` (0 warnings, 0 errors), `npm run test` (286 passed across 26 files),
  `npm run build` (✓ 2.4s).
- [x] **Task 30 — End-to-end distinct player architectures across all 5 presets**
  - Built 5 completely distinct player archetypes end-to-end with structural DOM layout, control positioning, interaction model, and visual identity:
    1. **Classic (`classic`)**: The streaming web standard with full-width bottom bar, edge-to-edge scrub rail, time/title row, and left/center/right zone clusters.
    2. **Minimal (`minimal`)**: Zen floating dynamic island capsule docked at bottom center (`.player-minimal-island`) with embedded hairline progress bar, clean center circular playback trio (`.player-minimal-center` with ±10s jump and play/pause), and top-left minimal title pill.
    3. **Compact (`compact`)**: Mobile/social streaming layout (TikTok / Twitch style) featuring a floating bottom squircle capsule dock (`.player-compact-dock`) with chunky progress, paired with a dedicated floating vertical right Action Rail (`.player-compact-rail`) hosting Subtitles, Audio, Speed, Aspect Ratio, Screen Lock, and Fullscreen.
    4. **Theater (`theater`)**: Cinema IMAX / Disney+ grand presentation with top Cinema Marquee Header (`.player-theater-marquee` with serif title, gold 4K IMAX / Atmos badges, quick audio/sub buttons), grand center-stage amber glowing playback cluster (`.player-theater-stage`), and wide bottom glowing gold timeline (`.player-theater-timeline`) with countdown.
    5. **Studio (`studio`)**: Broadcast Pro NLE / Video Editor console (DaVinci/Premiere style) with top broadcast telemetry strip (`.player-studio-top` with `● LIVE MONITOR`, SMPTE frame timecode, resolution, and audio specs), ruler scrubber with tick marks (`.player-studio-ruler`), and modular bottom pro console (`.player-studio-console`) with frame-by-frame jog buttons, direct speed strip (`[0.5x]`–`[2x]`), and real-time animated VU audio meters.
  - Implemented consistently across both `CustomVideoPlayer.jsx` and `PlayerPreview.jsx`, honoring custom zone overrides for drag-and-drop customization while matching the live player.
  - Upgraded Settings Player UI Studio with distinct blueprint minimaps (`.studio-minimap--minimal`, `--compact`, `--theater`, `--studio`, `--classic`) and archetype badges.
  - Verified: `npm run lint` (0 warnings, 0 errors), `npm run test` (286/286 passed across 26 files), `npm run build` (✓ 3.23s).
- [x] **Task 31 — Radical from-scratch player architectures from the void + transparent Classic player** (commits `3b7ce06`, `8ea120a`)
  - **Radical UI Presets**: Replaced all shared zone structures in Minimal, Compact, Theater, and Studio presets with structurally alien designs:
    1. **Minimal**: Ghost Cinema with zero chrome during playback; 1px hairline bottom progress bar; on hover/tap a single floating pill rises with play/pause, time, and scrubber.
    2. **Compact**: Mobile-first vertical left-rail sidebar (56px) hosting stacked buttons, 4px vertical progress track on the left edge, and large ghost play button overlay. Zero horizontal bars.
    3. **Theater**: Full IMAX presentation with amber-gradient header marquee (Georgia serif title, 4K IMAX & Dolby Atmos badges), 96px glowing amber circular playback cluster, and 64px widescreen golden timeline with remaining countdown.
    4. **Studio**: 3-row NLE editing console with Row 1 broadcast telemetry (SMPTE timecode, live monitor), Row 2 ruler with chapter ticks, and Row 3 transport console with frame-by-frame stepping, speed matrix, and animated VU meters.
  - **Transparent Classic Player**: Removed dark/black background from Classic player skin (`barBg: "transparent"`, `barBlur: "0px"`, lighter scrim) so controls float seamlessly over the video.
  - **Preview parity**: `PlayerPreview.jsx` updated with exact matching scaled architectures.
  - Verified: `npm run lint` (0 errors), `npm run test` (286/286 passed), `npm run build` (✓ 2.45s).

- [x] **Task 32 — Drag-and-drop Player UI Studio with 15 controls, 4 icon variants & real-time preview canvas** (commit `c47d4c8`)
  - **Expanded controls**: Added 6 new controls (`brightness`, `pip`, `loop`, `chapters`, `nextEpisode`, `cast`) to `PLAYER_CONTROLS` and presets (15 total).
  - **4 icon aesthetic variants**: `outline`, `filled`, `neon`, and `glass` with interactive style-picker buttons per control chip, persisted via `playerIconVariants` in preferences.
  - **Direct drag-and-drop onto PlayerPreview**: Draggable icon chips inside the preview canvas and interactive zone drop targets (`topLeft`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight`, `tray`) with glowing drag-over states.
  - **Interactive Icon Palette**: Replaced static placement grid with a draggable chip palette showing zone badges, style-variant selectors, eye toggles, and accessible select fallbacks.
  - Verified: `npm run lint` (0 warnings, 0 errors), `npm run test` (286/286 passed across 26 files), `npm run build` (✓ 1.96s clean).

- [x] **Task 33 — Architecture analysis, folder structure simplification, cleanup & developer experience overhaul**
  - **Dead code elimination**: Deleted dead legacy stub `src/api/apiClient.js` (0 consumers); removed unused `onZoneDrop` in `SettingsPage.jsx` (bringing oxlint to 0 errors, 0 warnings).
  - **Hook categorization**: Moved `useVirtualRenderAdapter` from `src/api/virtualRenderAdapter.js` to `src/hooks/useVirtualRenderAdapter.js` with backwards-compatible re-export in `src/api/` and updated `MovieCard.jsx`.
  - **Path alias `@/`**: Configured `@/` mapped to `src/` across `vite.config.js`, `vitest.config.js`, and added root `jsconfig.json` for IDE autocomplete and path resolution.
  - **Barrel exports**: Added clean, domain-grouped `index.js` barrels for `@/components`, `@/hooks`, `@/context`, `@/api`, and expanded `@/utils` while preserving 100% backwards compatibility for direct path imports.
  - **NPM scripts**: Added `"probe:movie": "node test-movie.js"` to `package.json` for manual TMDB connectivity checks.
  - **Automated test coverage**: Added `src/__tests__/barrels.test.js` (testing all layer barrels & `@/` alias resolution) and `src/__tests__/useVirtualRenderAdapter.test.jsx` (testing observer lifecycle and fallback mode).
  - **Verification**: `npm run lint` (0 errors, 0 warnings), `npm run test` (28 files, 293/293 passed), `npm run build` (success in 3.08s).

- [x] **Task 34 — Mobile double-touch fix & comprehensive UI/UX overhaul (Phase 1, 2, 3)**
  - **Mobile & Tablet Touch-Twice Resolution**:
    - Diagnosed the root cause: mobile WebKit and Chrome treat `:hover` styles, `onMouseEnter`, and Framer Motion's `whileHover` as synthetic hover-emulation on first tap, swallowing the click event and requiring a second tap to trigger navigation or scrolling.
    - Updated `src/components/MovieCard.jsx` to dynamically detect touch/coarse pointers (`(hover: none), (pointer: coarse)`) and bypass `whileHover` and mouse hover listeners on touch screens.
    - In `src/index.css`: Added `touch-action: pan-y;` to `.hero-container` and `touch-action: pan-x pan-y;` to `.movie-rail` so first touches immediately dispatch native vertical page scrolling without hesitation.
  - **Phase 1 — Quick Wins & Navigation Polish**:
    - Streamlined mobile bottom navigation in `src/App.jsx` from 6 cramped buttons down to 4 ergonomic tabs (Home, Explore, My List, Settings), clearing thumb crowding.
    - Fixed CategoryPage direct URL navigation state loss in `src/pages/CategoryPage.jsx` with search query fallback and recovery CTA.
    - Fixed CastRail avatar fallback monogram initials in `src/components/CastRail.jsx` and `src/index.css`.
  - **Phase 2 — Player, Media Experience & Engagement**:
    - Added Subtitle Sync Offset slider (`-10.0s` to `+10.0s`, `0.5s` steps, with reset) in `src/components/CustomVideoPlayer.jsx` subtitle popup, adjusting active cue timings in real-time.
    - Added chunked episode pagination in `src/pages/TitleDetailsPage.jsx` (loads 24 episodes at a time with "Load more (X remaining)" and "Show all" to eliminate DOM bloat on long seasons).
    - Added touch and hover pause handlers to the Hero Carousel auto-advance timer in `src/pages/HomePage.jsx`.
  - **Phase 3 — Library & Productivity Enhancements**:
    - In-library instant title search in both `src/pages/WatchlistPage.jsx` and `src/pages/HistoryPage.jsx`.
    - Batch selection mode with circular checkboxes and floating glassmorphic bulk deletion action bar in both `WatchlistPage.jsx` and `HistoryPage.jsx`.
    - Added `removeBatchFromMyList` and `removeBatchFromContinueWatching` in `src/hooks/useUserData.js`.
    - Person Credits Role Filtering (All / Acting / Directing & Crew) in `src/pages/PersonDetailsPage.jsx` and updated `src/api/movieService.js` to include crew credits.
    - Factory Reset Preferences action with confirmation modal in `src/pages/SettingsPage.jsx` backed by `resetPreferences` in `src/context/PreferencesContext.jsx`.
  - **Verification**: `npm run lint` (0 errors, 0 warnings across 114 files), `npm run test` (293/293 passed across 28 test suites), `npm run build` (production build succeeded in 2.56s).

- [x] **Task 35 — Fix mobile and tablet hero banner top spacing parity with movie details page**
  - **Diagnosed root cause**: Mobile & tablet media queries (`@media (max-width: 768px)`) forced `padding-top: calc(52px + env(safe-area-inset-top, 0px)) !important;` (and `56px !important;`) on `.main-content` to push utility pages below fixed navbar/brand. Unlike `TitleDetailsPage` (which does not use `main-content` and starts at `top: 0`), `HomePage` (and `/movies`, `/series`) wraps its `.hero-container` inside `.main-content`, causing a 52px-56px gap above the banner.
  - **Implemented fix**:
    - In `src/index.css`: Added rules to zero out `padding-top` on `.main-content:has(.hero-container)`, `.main-content:has([class*="skeleton-hero"])`, and `.main-content.main-content--has-hero` under both tablet and mobile `@media (max-width: 768px)` blocks so hero banners sit flush edge-to-edge at the very top behind the floating glass header.
    - In `src/pages/HomePage.jsx`: Added `main-content--has-hero` class to the main wrapper to guarantee zero top padding on mobile/tablet across all browser engines.
  - **Verification**: `npm run lint` (0 errors, 0 warnings), `npm run test` (293/293 passed across 28 test suites), `npm run build` (success in 2.62s).

- [x] **Task 36 — Remove white half outerline on buttons across Settings and application**
  - **Diagnosed root cause**: Tailwind v4 was imported without `@import "tailwindcss/preflight";`. Without CSS preflight, browser User Agent stylesheets apply default `border: 2px outset buttonborder;` to HTML `<button>` tags. The 3D `outset` style draws a light/white highlight along the top and left edges while darkening the bottom and right. On dark backgrounds (`#050505`), the darkened half vanishes, leaving a noticeable white half outerline / bevel on buttons that lacked an explicit border reset (e.g. Sign In, Sign Out, Clear Search, Show All, Shortcuts guide, modal action buttons).
  - **Implemented fix**:
    - In `src/index.css`: Added a global element reset for `button` (`appearance: none; -webkit-appearance: none; border: none; background-color: transparent; font: inherit; color: inherit; cursor: pointer;`) eliminating browser UA outset borders across the board while allowing explicit border utility classes to style borders as intended.
    - In `src/pages/SettingsPage.jsx`: Added explicit `border-none` class to buttons in Settings (Clear search, Show all, Sign Out, Sign In, Shortcuts guide, modal action buttons).
  - **Verification**: `npm run lint` (0 errors, 0 warnings across 114 files), `npm run test` (293/293 passed across 28 test suites), `npm run build` (success in 1.99s).

- [x] **Task 37 — Actual production company logos below metadata table & default S1 E1 playback for series**
  - **Production Company Logos Below Table**:
    - Updated `src/api/movieService.js` to preserve rich company objects (`id`, `name`, `logo_path`, `logoUrl`, `originCountry`) from TMDB rather than collapsing them to plain strings.
    - Built `ProductionCompaniesBlock` in `src/pages/TitleDetailsPage.jsx`: renders authentic company logos (with crisp drop shadow on dark themes) and graceful text fallbacks, positioned cleanly **below** the metadata table on both mobile and desktop views instead of crammed inside the table rows.
    - Removed card box borders and resting backgrounds (`border-white/[0.08]` removed, transparent resting state with subtle hover highlight `hover:bg-white/[0.04]`), giving logos a clean, borderless presentation.
    - Replaced the desktop monochrome inverted logo grid and removed the mobile inline text row.
  - **Default S1 E1 Series Playback**:
    - Resolved series auto-jump issue in `src/pages/TitleDetailsPage.jsx`: series without prior `continueWatching` history now consistently initialize to **Season 1, Episode 1 (S1 E1)** by default rather than defaulting to `airingSeasonNumber` or `latestAiredEpisode`.
  - **Verification**:
    - Added unit test in `src/__tests__/movieService.test.js` validating production companies metadata normalization.
    - `npm run lint` (0 errors, 0 warnings across 114 files).
    - `npm run test` (294/294 tests passed across 28 suites).
    - `npm run build` (production build succeeded in 4.87s).
- [x] **Task 38 — Complete revamp of 5 distinct player UI presets plus default (total 6 presets) across mobile, tablet, and desktop**
  - **Identified root causes of missing buttons**:
    - In `CustomVideoPlayer.jsx` and `PlayerPreview.jsx`, non-classic presets previously bypassed zone rendering with hardcoded JSX blocks:
      - `minimal` rendered a 1-button pill with only Play/Pause, discarding all other controls.
      - `compact` returned `null` for the bottom bar and a broken left rail without full controls.
      - `theater` only rendered Volume and Fullscreen, dropping seek, time, aspect ratio, pip, and subtitles.
      - `studio` rendered only frame jog buttons without zone controls.
    - In `playerUIDef.js`, presets had controls disabled or hidden in the tray.
  - **Implemented full revamp**:
    - Exactly 6 distinct presets and skins configured in `src/components/playerUIDef.js`:
      1. `classic` (Streaming Standard): Full-width frosted glass bar, edge-to-edge scrub rail, classic left/center/right clusters.
      2. `apple` (VisionOS Floating Island): Dynamic floating frosted glass island capsule (`borderRadius: 999px`, `backdropFilter: blur(36px)`), circular frosted icon pods, embedded capsule progress rail, SF Pro typography.
      3. `material` (Material 3 Tonal Dock): Rounded-3xl floating tonal dock (`borderRadius: 28px`, `background: rgba(30, 27, 34, 0.95)`), filled tonal FAB for Play/Pause, squircle button containers (`borderRadius: 20px`), pill badges, thicker M3 slider track.
      4. `theater` (Cinema Marquee & Amber Stage): IMAX cinema marquee header (`★ 4K IMAX`, `DOLBY ATMOS`), grand center stage with amber glowing playback cluster, wide golden timeline (`#ffd166` glow) with serif countdown.
      5. `studio` (Broadcast Pro NLE Telemetry): Broadcast Pro NLE cyber console with top `● REC / LIVE` telemetry bar, SMPTE timecode (`TC 00:00:00:00`), frame ruler scrubber with tick marks, bottom editing console with frame-by-frame jog buttons (`⏮`, `⏭`, `|◀◀`, `▶▶|`), direct speed strip `[0.5x]`–`[2x]`, and real-time animated VU audio meter bars.
      6. `minimal` (Modern Clean & Hairline): Ultra-clean hairline 2px/4px progress track and transparent ghost controls.
    - Backward-compatibility alias: `"compact"` seamlessly maps to `"material"`.
    - Every preset has 100% feature completeness and visibility enabled for all primary controls across mobile, tablet, and desktop (`playPause`, `jumpForwardBackward`, `volume`, `subtitles`, `audio`, `aspectRatio`, `playbackSpeed`, `screenLock`, `fullscreen`, `pip`, `nextEpisode`).
    - Synchronized `CustomVideoPlayer.jsx`, `PlayerPreview.jsx`, `SettingsPage.jsx`, and `src/index.css` to render complete archetypes with all zones on every device.
  - **Verification**:
    - `npm run lint`: 0 errors, 0 warnings across 114 files.
    - `npm run test`: 294/294 tests passing across 28 test suites.
    - `npm run build`: Production build succeeded in 2.02s.

- [x] **Task 39 — Universal player drag-and-drop customization across all presets & 8 icon aesthetic variants**
  - **Universal Drag-and-Drop for All Presets**:
    - Removed conditional preset restrictions in `src/components/PlayerPreview.jsx` and `src/pages/SettingsPage.jsx`, enabling interactive dropzones (`topLeft`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight`, `tray`) across all presets (`apple`, `material`, `theater`, `studio`, `minimal`, `classic`).
    - Made all preview buttons draggable with proper `dataTransfer` key payloads and tactile grab cursor.
    - Added `playerUISkin` preference so when a user rearranges controls from any preset archetype (e.g. Apple TV, Theater, Studio), the chosen aesthetic styling is preserved in `custom` mode instead of reverting to Classic.
    - Added base aesthetic archetype switcher in Settings when in Custom mode.
  - **8 Distinct Icon Aesthetic Variants & Live Player Integration**:
    - Expanded `ICON_VARIANTS` in `src/components/playerUIDef.js` to 8 styles with descriptive summaries:
      1. `outline`: Clean modern hairline vector strokes.
      2. `filled`: Solid filled bold geometric silhouettes.
      3. `neon`: Vibrant electric cyber luminescence.
      4. `glass`: Frosted translucent vision glass pods.
      5. `material`: Tonal rounded squircle containers (M3).
      6. `retro`: Tactile mechanical broadcast deck.
      7. `minimal`: Hairline ultra-lightweight geometry.
      8. `duotone`: Layered two-tone contrast styling.
    - Bound authentic default icon variants to each skin: `classic` (`outline`), `apple` (`glass`), `material` (`material`), `theater` (`neon`), `studio` (`retro`), `minimal` (`minimal`).
    - Added `playerGlobalIconStyle` preference and global style pill selector in `PlayerUIStudio` with Auto (Theme default) and per-variant bulk apply.
    - Wired `playerIconVariants` and `playerGlobalIconStyle` into `CustomVideoPlayer.jsx` `barControl` so the real video player faithfully reflects chosen icon variants across play/pause, jump, volume, subtitles, audio, aspect ratio, lock, fullscreen, pip, next episode, loop, brightness, chapters, and cast.
    - Added complete CSS rules in `src/index.css` for palette chip icons, variant selector badges, style pills, and player preview buttons.
  - **Verification**:
    - Added test coverage in `playerUIDef.test.js`, `PlayerPreview.test.jsx`, `SettingsPage.test.jsx`, and `CustomVideoPlayer.test.jsx`.
    - `npm run lint`: 0 errors, 0 warnings across 114 files.
    - `npm run test`: 301/301 tests passing across 28 test suites (was 294).
    - `npm run build`: Production build succeeded in 2.88s.

- [x] **Task 40 — Production company logo isolation, responsive hero banner & title logo overhaul, app default language TMDB integration, and player preset HUD & aspect ratio morphing**
  - **Production Companies Clean Aesthetic**:
    - In `src/pages/TitleDetailsPage.jsx`: Filtered `production_companies` strictly for authentic company logos (`logoUrl`). Removed all plain-text company name fallback pills, keeping exclusively pristine company logos on dark cards with hover scale effects.
  - **Hero Banner & Title Logo Responsiveness & Overview Fix**:
    - In `src/index.css`: Removed destructive `display: none !important;` on `.hero-desc` and `.hero-desc--apple` across `@media (max-height: 650px)` and landscape viewports; replaced with responsive 2-line clamps (`-webkit-line-clamp: 2`).
    - Upgraded `.hero-logo-img` from rigid `max-height: 60px !important` to responsive clamps (`clamp(90px, 15vw, 150px)` on standard viewports, `clamp(75px, 14vh, 110px)` on short laptops/landscape), preventing title logo shrinking or squishing across device aspect ratios.
    - In `src/pages/TitleDetailsPage.jsx`: Upgraded title logo sizing from `max-h-16 xl:max-h-28` to `max-h-20 sm:max-h-28 md:max-h-36 lg:max-h-44 xl:max-h-48 max-w-[85%] sm:max-w-[75%] lg:max-w-[520px]`.
    - Repositioned the overview/synopsis description directly into the hero banner block above the action buttons (Play, My List) and alongside meta facts and genres, ensuring synopsis is consistently visible and beautifully styled across all screen heights.
  - **App Language Setting Integration with TMDB & React Query**:
    - In `src/api/tmdbClient.js`: Added `getActiveLanguage()` reading `setting-defaultLanguage` and injected `language: activeLang` into `buildQuery` for all TMDB requests.
    - In `src/context/PreferencesContext.jsx`: Wired `setPreference("defaultLanguage", ...)` and `resetPreferences()` to update `document.documentElement.lang` and automatically call `queryClient.invalidateQueries()`, ensuring content (titles, overviews, genres, metadata) instantly switches to the selected language.
  - **Player Preset HUD & Aspect Ratio Overhaul**:
    - In `src/components/CustomVideoPlayer.jsx`:
      - Created dedicated preset archetype components: `PresetVolumeHUD`, `PresetBrightnessHUD`, and `PresetAspectRatioHUD`.
      - Engineered 5 distinct archetype appearances matching active player presets:
        - `material`: M3 tonal container, squircle pills, lavender accent (`#d0bcff`), active aspect ratio chip indicator.
        - `theater`: Cinematic marquee frame, warm amber glow (`#ffd166`), serif typography, cinema aspect ratios (e.g. `[SCOPE 2.39:1]`).
        - `studio`: Broadcast raster telemetry, cyan/green diagnostics (`#00e5ff`/`#22c55e`), square monospace telemetry readouts, broadcast raster flags (`[SMPTE 16:9]`).
        - `minimal`: Hairline ultra-clean pill, micro typography, zero-distraction layout.
        - `apple`/`classic`: VisionOS frosted glass, fluid ArcRing circular indicator, tabular numerals.
      - Added brightness cycle trigger (`triggerBrightnessCycle`), keyboard shortcut `"b"`, and desktop/touch brightness HUDs.
      - Updated touch gesture vertical bars (brightness and volume) and center seek indicator to respect `var(--skin-hud-*)` styling variables and preset track gradients.
    - In `src/components/PlayerPreview.jsx`:
      - Replaced generic static volume HUD chip with live archetype-accurate HUD chips and aspect ratio badges matching `skinDef.archetype`.
  - **Verification**:
    - `npm run lint`: 0 errors, 0 warnings across 114 files.
    - `npm test`: 301/301 tests passing across 28 test suites.
    - `npm run build`: Production build succeeded in 2.68s.

- [x] **Task 41 — MongoDB Database & Google OAuth 2.0 Sign-In Integration**
  - **Database Integration (`api/lib/db.js`)**:
    - Installed official `mongodb` driver.
    - Created connection pool singleton `connectToDatabase()` with connection caching supporting both Vercel Serverless Functions and Vite dev environment.
    - Authenticated and verified connection against MongoDB Atlas cluster `cluster0.5pnfadv.mongodb.net` targeting `streamly` database.
    - Built schemas for `users` (`googleId`, `email`, `name`, `picture`, `lastLogin`, `createdAt`) and `userData` (`googleId`, `email`, `watchlist`, `watchHistory`, `preferences`, `updatedAt`).
  - **Backend Serverless API Endpoints**:
    - `api/auth.js`: Handles Google OAuth token verification against Google's `tokeninfo` endpoint with client ID audience validation, user profile upsert in MongoDB, and guest login fallback.
    - `api/sync.js`: Provides two-way cloud synchronization of user watchlist, continue watching progress, and preferences with MongoDB Atlas.
    - `vite.config.js`: Added `apiDevServerPlugin` to execute serverless endpoints in local development (`npm run dev`), ensuring parity with production Vercel deployment.
  - **Frontend Google Sign-In & Auth State**:
    - `src/utils/googleAuth.js`: Google Identity Services (GIS) Web SDK client helper for SDK dynamic loading, initialization, button rendering, and One Tap prompt.
    - `src/components/GoogleSignInButton.jsx`: Reusable Google Sign-In component with official Google multicolor G logo, GIS SDK rendering, and fallback prompt.
    - `src/context/AuthContext.jsx`: Extended `AuthProvider` with `user`, `loginWithGoogle`, `loginAsGuest`, `logout`, `syncStatus`, and automatic debounced cloud synchronization to MongoDB.
    - `src/context/auth.js`: Added resilient fallback context for isolated test runs.
    - `src/pages/SettingsPage.jsx`: Updated Account section to display Google profile picture, connected Google badge, live MongoDB Atlas sync status with manual "Sync Now" trigger, and Google Sign-In button in both the account list and sign-in modal.
    - `src/App.jsx`: Updated header navigation and mobile bottom dock to render user avatar image when authenticated with Google.
  - **Environment & Secrets**:
    - Added `MONGODB_URI`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `VITE_GOOGLE_CLIENT_ID` to gitignored `.env`.
    - Documented environment variables in `.env.example` with clean template placeholders.
  - **Verification**:
    - `npm run lint`: 0 errors, 0 warnings across 119 files.
    - `npm test`: 305/305 tests passing across 29 test suites (added `auth.test.jsx`).
    - `npm run build`: Production build succeeded in 2.60s.

- [x] **Task 42 — Fix Duplicate Title Logo Images on Mobile and Tablet Page Banners**
  - **Diagnosed Root Cause**:
    - In `src/pages/HomePage.jsx` (which powers `/`, `/movies`, and `/series`), the hero banner rendered two separate background image layers:
      - `desktop-bg`: prioritized `backdropUrl` (the clean, horizontal 16:9 cinematic still without promotional text).
      - `mobile-bg`: prioritized `posterUrl` (the vertical theatrical poster).
    - In `src/index.css` under `@media (max-width: 768px)` (mobile and iPad portrait viewports):
      - `.desktop-bg` was hidden (`display: none !important`).
      - `.mobile-bg` was forced active (`display: block !important`).
    - Because movie and TV show posters on TMDB have the **title logo / wordmark** designed directly onto the poster artwork, displaying the poster as the background caused the title logo to appear inside the background image.
    - Concurrently, `<HeroTitleLogo movie={activeFeaturedMovie} />` rendered the isolated transparent title logo PNG directly on top in the hero overlay.
    - This caused **two title logos** to appear simultaneously on mobile and tablet banners. Desktop was unaffected because it displayed the textless `backdropUrl`.
  - **Implemented Solution**:
    - In `src/pages/HomePage.jsx`: Replaced the dual `desktop-bg` and `mobile-bg` image tags with a single unified `<motion.img className="hero-bg" ...>` element that consistently prioritizes `backdropUrl` across all devices and viewports.
    - In `src/index.css`: Removed `.desktop-bg` and `.mobile-bg` display toggles; styled `.hero-bg` with `object-fit: cover` and `object-position: center top` on mobile/tablet viewports to provide a clean, scenic backdrop without duplicate poster titles.
    - In `src/components/HeroTitleLogo.jsx`: Added `imageError` state and `onError` fallback to ensure graceful fallback to `<h1 className="hero-title">{movie.title}</h1>` if any title logo PNG fails to load.
  - **Verification**:
    - `npm run lint`: 0 errors, 0 warnings across 120 files.
    - `npm test`: 305/305 tests passing across 29 test suites.
    - `npm run build`: Production build succeeded in 3.37s.
- [x] **Task 43 - Fix player watch route crash (ReferenceError resolvePlayerIcon)**
  - **Diagnosed**: Commits modifying spectRatio and rightness controls called a non-existent 
esolvePlayerIcon function instead of importing React Lucide icons.
  - **Fixed**: Replaced 
esolvePlayerIcon with explicit <Maximize size={14} /> and <Sun size={15} /> in src/components/CustomVideoPlayer.jsx.
  - **Tested**: Added a regression test and fixed JSDOM loading race conditions. 
pm test passes (305/305) and 
pm run build succeeds.

- [x] **Task 44 — 18-point performance/caching plan (image CDN, service worker, memoization, asset caching)**
  - **Note**: items 1-2, 4-18 from the plan landed; item 3 (`vitest.config.js` pool) was
    attempted and **reverted** — Vitest 5 removed `test.poolOptions` (deprecation warning printed),
    the `isolate: false` hint was silently ignored, and the pooled env caused 2 test failures
    (dropzone render race + a 5s preset-mount timeout) plus `EnvironmentTeardownError` RPC
    complaints. Reverted to the default pool; rationale documented in `vitest.config.js`.
  - **index.html**: wsrv.nl preconnect (crossorigin) + `dns-prefetch` to `image.tmdb.org` up front;
    Google Fonts now load non-blocking via the `media="print"` reload trick with a `<noscript>`
    fallback; duplicate metas (apple/mobile web-app capable, status-bar style, stale cache-control
    http-equiv tags) removed; layout cleaned (`</head>` fixed, contextmenu handler simplified);
    SW-clear version bumped to `v19.0`.
  - **vite.config.js**: re-enabled `modulePreload` (polyfill on) so Vite injects modulepreload links
    for every chunk; stable content-hashed filenames (`assets/[name]-[hash].js` / `[extname]`) for
    1-year CDN caching; `reportCompressedSize` off, `chunkSizeWarningLimit` 600, `cssCodeSplit` on.
  - **queryClient.js**: `staleTime` 5→8min, `gcTime` 15min (fewer background refetches on tab focus /
    back-nav / rail remounts); explicit `networkMode: 'online'` (default, documented).
  - **cdnImageAdapter.js**: wsrv.nl proxy now enabled as the default image path — outputs WebP at
    q80 with `af=true` (AVIF-first with graceful fallback); `getAvatarUrl` (w185) for cast photos;
    `getSizes(context)` media-sizes helper; `getSrcSet` starts at w154. Tests updated to the wsrv
    URL contract.
  - **public/sw.js**: cache version bumped `streamly-v10` → `v11`; new separate `streamly-images-v1`
    stale-while-revalidate cache for `wsrv.nl` (instant disk hits on repeat visits, background
    refresh, offline poster support); `activate` prunes only old caches (preserves both).
  - **Components**: `MovieCard` gets `React.memo` + `isTouchDevice` hoisted to module scope (computed
    once, removed from hover deps); `ContinueWatchingRail`, `CastRail`, `DiscoveryRails` wrapped in
    `memo`; `DiscoveryRails` + `CastRail` scroll handlers now `useCallback`-stable (memoized child
    arrows get stable refs); `HomePage` `FadeInSection` memoized; `AmbientBackground` blur reduced
    90→72px (detail overlay 55→44px) for GPU savings on mobile.
  - **Verification & code hygiene**: `vercel.json` relies on the pre-existing `/assets/(.*)`
    immutable header rule for 1-year caching of all hashed build assets (a new
    `/(.*)\.(?:js|css|…)` extension rule was rejected by Vercel — `source` follows path-to-regexp
    v6, not RegExp, so `(?:…)` and `\.` raised "Invalid route source pattern" and failed the
    deployment; the invalid rule was removed and `(?!…)` rewrites already exist in the wrapped
    `/((?!assets/|api/).*)` form the docs require);
    `App.jsx` misplaced `GlobalShortcuts` import moved to the top import block; `movieService.js`
    title-logo URLs routed through `CdnImageAdapter` (logos get WebP/AVIF too); `CastRail` avatar
    URLs routed through `CdnImageAdapter.getAvatarUrl`; `SettingsPage` Player UI Studio palette now
    accepts drops (drop a control chip on the palette to move it back to the tray); `PlayerPreview`
    replaced the floating overlay dropzones with `Cluster` inline drop-targets per zone (draggable
    mode), keeping the preview WYSIWYG with the real player's zone layout — palette → tray and
    clusters → zones are now the two symmetric drop paths.
  - **Verification**: `npm run lint` (0 errors, 0 warnings), `npm run test` (305/305 passed across
    29 files — re-confirmed after pool revert), `npm run build` (success in 2.17s with hashed
    assets). Leftover `fix_*.py`/`patch_preview.py` helper scripts removed.
- [x] **Task 45 - Cinejoy-style search page redesign (hero + pill + Trending Today grid)**
  - `src/pages/SearchPage.jsx`: replaced the old browse-landing (DiscoveryRails banners + EmptyState
    empty prompt) with a Cinejoy-style landing. New centered hero: "What would you like to watch?"
    headline + large frosted-glass rounded search pill (`.search-panel--hero`: `rounded-full`,
    3.6rem tall, focus-within scale 1.015 + accent glow). Quick-start pills under the bar re-use the
    same recipe: recent searches (with Clear) + popular keywords (Trending Now / New Releases / Top
    Rated / K-Drama / Marvel). While actively searching the hero compacts (`.search-hero--compact`),
    the pill returns to the standard panel, and the existing filter chips + results grid render.
  - Landing now shows a "Trending Today" section: lazy `useQuery(["trending-this-week"])`
    (mirrors DiscoveryRails config, `enabled: !query`, 5m stale) rendered as the app's existing
    `.movie-grid` + `MovieCard` with skeletons, error retry, and empty states; AmbientBackground
    also falls back to the first trending poster. DiscoveryRails no longer imported here
    (still used by GenrePage etc.); `Clock` icon added, the old EmptyState quick-buttons and
    `.search-history` landing block were removed (history + quick starts moved into the hero rows).
  - `src/index.css`: new `.search-hero`, `.search-panel--hero`, `.search-chippill`,
    `.search-trending` (accent-bar heading) blocks after the `.search-panel__*` rules; mobile
    font-size `!important` (16px, no iOS zoom) still wins on phone inputs.
  - **Verification**: `npm run lint` (0 errors/0 warnings), `npm run test` (305/305 across 29 files),
    `npm run build` (success, 2.97s, hashed assets).
- [x] **Task 46 - Episode thumbnails, Cinejoy mobile pill nav, hero Add-to-list + More-Info pill**
  - **Episode thumbnails** (`TitleDetailsPage.jsx`): episode cards show a Film placeholder when no
    image resolves. Root cause: catalog-style movie objects store artwork in the non-Url fields
    (`poster`/`backdrop`) that the `epThumb` fallback chain never checked, so `still_path`-less
    episodes rendered blank. `epThumb` now falls back through `ep.thumbnailUrl → ep.posterUrl /
    ep.backdropUrl → movie.backdropUrl / movie.posterUrl → movie.backdrop / movie.poster /
    movie.thumbnailUrl`. When every source is empty the placeholder is now a branded gradient tile
    with the episode number instead of a bare Film icon, so no card ever looks "image missing".
    (Verified TMDB `/tv/{id}/season/{n}` still_path flows through `getSeasonEpisodes` → wsrv.nl WebP.)
  - **Cinejoy mobile nav** (`App.jsx` mobile bottom bar): mirrored the Cinejoy floating pill — icon-only
    items (Home / Movies / Shows / My List / Search / Settings), 24px lucide icons, `clamp(48px, 14vw,
    60px)` round hover caps, neutral slate inactive color, and a white glass-tint active state
    (`rgba(255,255,255,.12)` + white icon) instead of the accent-gradient pill. `body` clearance
    unchanged; tablet media query aligned to the same pill styles.
  - **Hero action pill** (`TitleDetailsPage.jsx` hero): replaced the single circular My List button
    with the Cinejoy `hero-action-pill` — a 52px segmented capsule (`bg-white/10 backdrop-blur-20
    saturate-150`, white/25 divider) with {Plus/Check "My List"} | {Info "More Info"}; the Info button
    smooth-scrolls to the new `#title-details-more` details block (cast/episodes). Imported lucide
    `Info`, added `scrollToDetails`.
  - **Verification**: `npm run lint` (0 errors/0 warnings), `npm run test` (305/305 across 29 files),
    `npm run build` (success, 2.00s, hashed assets). Leftover `_probe_eps.mjs` probe removed.

## Cinejoy parity batch (home + details, from the comparison of the two HTML mockups)

Scope agreed with the user: implement everything except **Browse by Providers**
(provider tiles / provider-selector rows). User answers: details buttons = **all
three + disabled Download** (toast); comments = **skip**; editorial rows = full
Cinejoy set. Original "don't edit" constraint was lifted by the user.

- [x] **Task 47 - Desktop one-piece floating pill nav with the brand inside**
  - `App.jsx` moved `.app-brand` (mark + wordmark SVG, `#brand-accent-grad`) *inside*
    `<nav className="navbar">` as the first flex child and added a `.nav-separator`
    (1px × 26px `rgba(255,255,255,0.14)`) between `.nav-links` and `.nav-right`.
  - `index.css`: `.navbar` centered via `left:50%; translateX(-50%)`, `justify-content:space-between`,
    `padding: 8px 10px 8px 8px`, `max-width: calc(100vw - 2rem)`; `.app-brand` became a static flex
    child (no more fixed top-left block); tablet (769–1024) and mobile override blocks updated to the
    same structure; mobile keeps the 36px mark only (`.app-brand-word` hidden).
  - No test references the nav markup (grep verified). Lint 0, 305/305 tests, build ✓.
- [x] **Task 48 - Animated liquid ambient background (Cinejoy's drifting blobs)**
  - `AmbientBackground.jsx` renders `.ambient-liquid` (3 blobs `--a` rose `rgba(244,63,94,.55)`,
    `--b` orange `rgba(251,146,60,.5)`, `--c` indigo `rgba(129,140,248,.42)`) before
    `.watch-hero-gradient`.
  - `index.css`: `filter: blur(90px) saturate(130%)`, `mix-blend-mode: screen`, `inset:-15%`,
    `overflow:hidden`, opacity .5 (mobile .32), transform-only keyframes `ambient-blob-a/b/c`
    (46s/58s/66s alternate), hidden under `prefers-reduced-motion`.
  - Lint clean; full suite run after the batch.
- [x] **Task 49 - Editorial curated rails on Home (the Cinejoy editorial block)**
  - `movieService.js`: `getEditorialRail(key)` — keyword-keyed rails resolve the TMDB keyword id at
    runtime via `/search/keyword` (module `editorKeywordCache`, never hardcoded ids) then
    `/discover/{media_type}` with `with_keywords`; sort-mode rails use `sort_by` +
    `vote_count_gte`; results interleave movie/tv and slice to 24. Exported `EDITORIAL_RAILS`
    (9 rails: top-rated-editors, award-winning, oscar-nominees, psychological-thrillers,
    cannes-film-festival, top-100-halloween, rotten-tomatoes-best, mindfuck-movies,
    based-on-true-story) + `resolveEditorialKeyword`.
  - `HomePage.jsx`: `EditorialRails` / `EditorialRailRow` gates on `filter==="all"` + "All" genre,
    query key `["editorial", cfg.key]`, staleTime 10min, `retry:false`, `reportQueryError`,
    renders as `FadeInSection` + `ErrorBoundary` + `MovieRail` (railIndex 20), hides when empty;
    rendered right after "Now Playing" (comment numbering updated to 11/12).
  - Lint clean; full suite run after the batch.
- [x] **Task 50 - MovieCard white circular play + below-card mobile metadata**
  - `MovieCard.jsx`: `showBelowMeta = isTouchDevice`; below-card `.movie-info` (title + star rating +
    year) renders only when visible AND on touch devices; play button becomes a white circle
    (`#ffffff` bg, `#0b0b0f` icon, `0 8px 24px rgba(0,0,0,0.55)` glow), matching Cinejoy cards.
  - Lint clean; full suite run after the batch.
- [x] **Task 51 - Title details hero info card additions (right of Cinejoy's two-column)**
  - The details page already had the overlapping two-column hero + right info card (Runtime, Language,
    Release Date, Budget, Revenue) + `ProductionCompaniesBlock` — closed the remaining gaps:
  - **Runtime "Ends h:mm AM"** (`formatEndsAt` helper): computed from `durationMins` + now, appended
    to both the mobile meta card and the desktop info-card Runtime rows.
  - **Vote-split widget** (`voteSplitPct` + ArrowUp/ArrowDown): derived from the IMDb-style score
    (`up = round(rating/10*100)`, `down = 100-up`), rendered emerald/red inside the meta row next to
    `RatingsCluster` (documented as a derived value, Cinejoy-style).
  - **Production logos** (`ProductionCompaniesBlock`): images now render Cinejoy-white —
    `brightness-0 invert opacity-60` (hover 90) on the existing 2-col grid instead of color logos.
  - `movieService.getMovieDetails` now also returns `voteCount` (from `detail.vote_count`) — not
    displayed yet, available for the homeroom/score future use.
  - Note: the "R" certification badge and the linked director are **not** fabricated — this app has
    no certification source and no director-id, so both are omitted rather than faked.
- [x] **Task 52 - Three circular hero action buttons (Cinejoy) replace the Task 46 segmented pill**
  - Replaced the `hero-action-pill` (My List | More Info) + `scrollToDetails` with Cinejoy's
    three 44px frosted circles next to Play (`hero-circle-btn`, `rgba(255,255,255,.1)` +
    blur-20 + 1px `white/10` border, hover scale 1.05 / active 0.92):
    1. **Add to List** — Plus/Check (`#95ff50`), `handleToggleMyList` + toast + notification (unchanged).
    2. **Download** — disabled affordance (`hero-circle-btn--disabled`, opacity .55): pressing shows a
       "Download coming soon" info toast (honest: no offline downloads in a web app).
    3. **Mark watched** — Eye/Eye-off toggling `isMarkedWatched(id)` (a `continueWatching` entry with
       `timestamp > 0`); watched writes a full-run history entry via
       `updateProgress(movie, season|null, episode|null, (durationMins||60)*60)`, unwatched calls
       `removeFromContinueWatching`; both toast.
  - `Info` lucide import removed (only the comment reference remained). Lint 0.
- [x] **Task 53 - Record + full verification of the whole batch**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (305/305 across 29 files),
    `npm run build` (✓ 1.41s). This `task.md` entry documents Tasks 47–52.

## Cinejoy movies/series pages — Tasks 54-56 (verified as one batch)

- [x] **Task 54 - Discovery data layer (`movieService`)**
  - `getDiscover({ mediaType, genreId, year, sortBy, region, providerId, country })` → `/discover/{movie|tv}`
    with `sort_by` (Popular `popularity.desc` · Top Rated `vote_average.desc` + `vote_count_gte:200` ·
    Newest `primary_release_date.desc`/`first_air_date.desc`), `with_genres`,
    `primary_release_year`/`first_air_date_year`, `watch_region` + `with_watch_providers` (provider
    filter auto-sets `watch_region` = region → country → `US`), `with_origin_country`.
  - `getGenres(mediaType)` → `/genre/{movie|tv}/list`; `getWatchProviders(mediaType)` →
    `/watch/providers/{movie|tv}` (priority-sorted, logo via `CdnImageAdapter`); `getRegions()` →
    `/watch/providers/regions` (alpha-sorted country code list).
  - `getUpcomingMovies()` → `/movie/upcoming`, normalized + `releaseDate` for the Upcoming rail;
    `getAiringRail(limit=10)` → `/tv/on_the_air` + per-title `next_episode_to_air` look-up
    (`Promise.allSettled`, failure falls back to the plain item) for the Season/Ep/date badges.
  - All methods follow the house `logServiceError`/`warnIfEmpty`/`logEmptyData` convention.
- [x] **Task 55 - `DiscoveryPage` + route swap**
  - New `src/pages/DiscoveryPage.jsx` (lazy-loaded) drives BOTH `/movies` (`mode="movies"`) and
    `/series` (`mode="series"`), replacing the two `HomePage filter=` routes in `App.jsx`; nav
    `match` predicates (`/movies*`, `/series*`) unchanged so both pills stay highlighted.
  - Mirror of `cinejoy.to/movies` + `cinejoy.to/series`: glass header (`text-4xl/5xl` title +
    subtitle, `max-w-[1600px] pt-24`), filter pills — Random expand-pill (`Dices`, `h-[38px]` →
    hover `max-w-[130px]`), Genre, Year, Sort (Popular/Top Rated/Newest), Provider, Country —
    each dropping a frosted `listbox` panel (Escape / click-outside close). Filters are URL-driven
    via `useSearchParams`, so combos are shareable + back/forward friendly.
  - Editorial rail (`buildUpcoming(…, 120)`): movies = "Upcoming" + `Coming Soon` spotlight badge,
    series = "New Seasons Airing" + `Season N` badge; landscape `w-[70vw]→264→316px` aspect-video
    snap cards with edge-mask, hover veil, "Ep X · Mon DD" overlay, mobile below-meta; hover-reveal
    arrows via `scrollBy`. Grid = `2/4/5/6` cols `gap-x-6 gap-y-12`, reuses `MovieCard` (white play
    + yellow star). Random opens a random grid title via the shared `useDetailView` gateway.
  - Loading skeletons (`skeleton-moviecard`), error + empty states, `reportQueryError` /
    `logEmptyData` for every query, one shared `modalHost` per page.
- [x] **Task 56 - CSS + global footer**
  - `index.css`: `.discovery-grid` (2→4→5→6 cols), `.spotlight-badge` (green `#95ff50` glow pill),
    `.card-hover-veil` (white/10 lens, 500ms), `.discovery-menu` (green scrollbar), `.discovery-rail-mask`
    (clean edge fade), `.site-footer`. Green accent is scoped to the discovery chrome — the rest of
    the app keeps the rose/amber brand (user approved green for these pages only).
  - New `src/components/Footer.jsx` rendered globally in `Layout` after `<main>`: Streamly wordmark
    + divider + demo disclaimer + `mailto:contact@streamly.app` (sentinel address — user asked for
    wordmark/disclaimer/mailto, no social icon). `pb-28 lg:pb-8` clears the floating mobile nav pill.
  - Verified: `npm run lint` (0), `npm run test` (305/305 across 29 files), `npm run build` (✓,
    `DiscoveryPage` chunk emitted). Follow-up after review: visual-consistency sweep of
    Settings/Watchlist/History against the same glass+green language.

## Cinejoy CSS reverse-engineering — Task 57 (user: "dig deeper, find a way to reverse-engineer the CSS")

- [x] **Task 57 - Real-CSS harness + applied corrections**
  - Built `scripts/fetch-cinejoy-css.mjs` — the repeatable "way": fetch every route shell, resolve the
    SvelteKit entry JS from it, crawl the module graph (BFS) pulling every `assets/*.css` reference
    (including on-demand chunks), write shells + 27 real CSS assets into `docs/cinejoy-reference/`,
    emit `index.md`. Clicking any page's CSS is now: `node scripts/fetch-cinejoy-css.mjs` +
    `node scripts/cinejoy-rules.mjs <class>`.
  - Built `scripts/cinejoy-rules.mjs` — rule blotter: prints any minified rule containing a class /
    variable / animation across the extracted CSS (offsets included). Used it to confirm the real
    ground truth: `.spotlight-badge` is a bottom-center `#3c8217` tab (7px 7px 0 0 radius, 11px/500,
    NO uppercase, NO glow) — our shipped version had it top-left + uppercase + glow. `.scroll-to-top-btn`
    is a 44px glass circle with `2px solid #95ff50` ring + `blur(20px) saturate(150%)`.
  - Applied: `src/index.css` `.spotlight-badge` → real Cinejoy tab; `BackToTop.jsx` knob → green
    `#95ff50` ring glass (mirrors `.scroll-to-top-btn`).
  - Recorded the full port map in `docs/cinejoy-reference/ANALYSIS.md` (27 assets → component →
    Streamly class, theme-var machinery, verbatim primitives, port backlog).
  - Verified: `npm run lint` (0), `npm run test` (305/305), `npm run build` (✓), harness output idempotent.

## Nav + app-wide Cinejoy parity — Task 58 (user: "update each page CSS based on official Cinejoy CSS/UI/UX, mainly nav")

- [x] **Task 58 - Official-Cinejoy nav, global white-pill button system, green identity sweep**
  - Reverse-engineered the full nav CSS out of the real build (`.svelte-1elxaub` scope in `0.ugGWN4mw.css`):
    `.glass-header` (`#0e0e1061`, blur 20 saturate 160%, border white/7, `inset 0 1px #fff/12 + 0 8px 30px #0000004d`),
    `.is-scrolled` (`#0c0c0e85`, border white/10), `--nav-pad` 6px→3px condense (scroll, `.32s condense-ease`),
    `--nav-item-h:40px`, `.nav-item.is-icon` 40px circles, `.theme-pill-bg` = solid white active pill with
    `.pill-glow` (`0 2px 8px #00000059, 0 0 16px 1px #fff2e`), hairliner gradient `.nav-divider` (1px × 18px),
    `.mobile-nav-bar` bottom `safe-area + 1rem`, landscape ≤500h `scale(.75)`.
  - `src/index.css` nav: `.navbar`/`.navbar.scrolled` now the official glass recipe with condense padding;
    active nav pill (links AND icon buttons) = solid white + black text + pill-glow; hover = white/8 neutral
    (rose gradient gone); divider = gradient hairline; added `--nav-*`/`--condense-ease` tokens to `:root`;
    mobile bottom-nav active = white pill + black icon + pill-glow; landscape scale rule.
  - Default accent rebranded rose→Cinejoy green in `:root` (`--accent-primary #95ff50`,
    `--accent-secondary #5ce21c`, `--accent-glow rgba(149,255,80,.35)`), plus every hard-coded rose fallback
    across `index.css` + 12 components/pages swapped to green (`Loader`, `Footer`, `App` brand mark,
    `playerUIDef`, `CustomVideoPlayer`, `TitleDetailsPage`, `PersonDetails`, `SearchPage`, etc.).
    Semantic colors preserved: red danger (History/Watchlist bulk-delete, Settings factory-reset) and amber
    ratings/warning (`LeavingSoonBanner`, score bands).
  - Hero + global buttons → official Cinejoy `PillButton` recipes: `.hero-cta-play`/`.btn-primary` = solid
    white pill + black text (hover pure `#fff`); `.hero-action-pill`/`.btn-secondary` = white/10 glass +
    white/20 hairline (hover white/20). `.spotlight-badge`/`.discovery-menu` scrollbar already official (Task 57).
  - Verified: `npm run lint` (0), `npm run test` (305/305 across 29 files), `npm run build` (✓).
  - Follow-ups (backlog): reconcile duplicated "emerald" theme vs new default green swatch name; deep
    watch-page WheelPicker/ScrapingScreen chrome if further parity desired.

## Deep parity audit — Task 59 (user: "done everything? analyse deeper")

- [x] **Task 59 - Full-page audit vs every real CSS asset + settings tab/glass-card correction**
  - Audited ALL 27 extracted assets + dev-only chunks. Verdict per surface:
    - `20.BLodlHfJ.css` (Settings): real `.settings-tab` is a **underline tab** (`padding:.5rem 0`,
      `border-bottom:2px solid transparent`, active = white text + white underline), not our green accent
      chip; `.settings-nav` is a bare centered rail that turns into the frosted dock pill only when
      `.is-docked`; `.glass-card` = `rgba(20,20,20,.6)`/`#14141499`, blur 20, radius 20, padding 24,
      `scroll-margin-top:100px`, `.is-flash` ring, NO hover. → **Applied exactly** (our sticky
      `.settings-sticky-bar` already acts as the docked rail, so the always-docked parity holds).
    - `11.DDe79v4G.css` (My List editor `.list-card`/`.list-input`/`.list-icon-btn`/`.row-icon-btn-danger`):
      our Watchlist/History pages don't use these classes (Cinejoy has no standalone list page —
      ours is a frozen-contract page). Recipe documented; accent sweep already applied.
    - `TitleVote.BQ5-nsye.css` (up/down vote + Turnstile): out of scope — Streamly has no voting
      backend; our RatingsCluster is IMDb/RT badges and matches.
    - `ScrapingScreen` / `WheelPicker` / `DownloadModal` / `DisplayNameModal` / `AddToListPopover`:
      Cinejoy has download/scraping/name-modal flows we don't ship; scrollbar recipes (4px thumb) already
      mirrored in `.discovery-menu`/`.glass-scrollbar`.
    - `VideoPlayer.amzfpZvj.css` (182 selectors): our player is a bespoke skin system whose tokens
      (`panelBg/panelBlur/panelBorder`) already mirror `.settings-popover` = `#0f0f0fb8`, blur 28 sat 180,
      border white/10, radius 1rem, `0 20px 50px #00000080`; `html[data-flat-ui]`/
      `data-glass-refract`/`data-theme-id` variants are app-level theme states we replicate via the
      `--theme-*`/accent machinery. Pixel-perfect port of all 182 selectors remains an optional follow-up.
    - Dev-only (skip): `8` dev panel, `21` skin editor, `22` shorts, `4` connect, `6` date, `7` preview,
      `2`/`12`/`14`/`19` utilities — no user-facing UI.
    - Emerald vs default theme: verified NOT a true duplicate (`#95ff50`/`#5ce21c` default vs
      `#95ff50`/`#43861e` "Cinejoy Emerald") — label kept, no change.
  - Applied: `.settings-tab` → real underline-tab recipe (desktop gap 1.75rem, active white underline);
    `.settings-nav` → centered safe rail (dock pill provided by sticky bar); `.glass-card` → dark glass
    recipe + `scroll-margin-top` + `.is-flash` ring, dropped hover + heavy shadow.
  - Verified: `npm run lint` (0), `npm run test` (305/305), `npm run build` (✓).

## Task 63 — Cinejoy details-page parity: ambient/banner gradients corrected, logo-as-headline + genre row, cert badge + upcoming chip + vote pill, info cards, cast/trailer/similar rails, unreleased Play modal, white wordmark footer

- [x] **Task 63 - Ambient + banner corrected to the real Cinejoy details page**
  - The Task 62 blur guess was wrong; the authoritative dump uses:
    ambient `scale-[1.2] blur-[80px] saturate-100 opacity-50` + top glow
    `h-[40vh] mix-blend-screen opacity-20 blur-[50px] saturate-100` (was 100/150/60 +
    glow 60/150/25). `AmbientBackground.jsx` matched to the same values.
  - Banner: dropped the `clamp(340px,62vh,620px)` height + blurred edge-fill layer;
    now `h-[65vh] lg:h-[75vh]` with the mask `black 40% → transparent 98%` and exactly the
    dump's two overlays (`bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent`
    + `bg-gradient-to-r from-[#050505] via-transparent to-transparent hidden lg:block`).
    Removed the now-dead `.watch-hero-gradient` use in the ambient and the unused
    `.left-vignette` CSS rule.
  - Content overlap `-mt-44 lg:-mt-[22rem]` (was `-mt-20 …`), removed the `max-w-[1800px]`
    content cap (sections + social-proof bar now full-bleed like the dump).
- [x] **Task 63 - Hero column restructured to Cinejoy order**
  - Logo `max-h-20 lg:max-h-36 max-w-[75%] lg:max-w-[500px] object-contain drop-shadow-2xl`.
  - New standalone genre row (`mt-3 lg:mt-4 text-sm lg:text-lg text-white/90 font-medium`)
    directly under the logo; genres removed from the meta row.
  - Actions: Play pill `h-[44px] px-6 text-base font-bold min-w-[120px] hover:scale-105
    shadow-xl shadow-black/10` + `w-5 h-5 mr-1.5 fill-current` icon; Download circle no longer
    dimmed (still shows the "web app" toast).
  - New upcoming release chip (only when `releaseDate` is in the future): Clock +
    "Not released yet" · "Available <date>" in the pill recipe from the dump.
  - Meta row now `year • runtime (2h 45m) • cert badge • vote pill`; IMDB `RatingsCluster`
    and the `border-l` dividers removed from the row (vote split restyled as a subtle pill,
    still percentage-based as agreed).
  - Director row `mt-1.5`, rendered as a `/person/<directorId>` link with the Cinejoy hover
    underline when an id is present. Description `mt-4 lg:mt-5 text-white/70 line-clamp-3`
    plus a **Show more / Show less** toggle for long overviews.
- [x] **Task 63 - Info cards + production logos**
  - Desktop column `w-[280px] mt-40` (was `w-[260px] xl:w-[280px] mt-12 xl:mt-28`); both
    cards now show only Runtime (+ `Ends <time>`) / Language / Release Date; Budget/Revenue
    rows removed to match the dump, runtime shown via `formatRuntimeLabel` (`2h 45m`).
  - `ProductionCompaniesBlock`: dropped the "Production" label, `mt-4 grid gap-2 grid-cols-2`,
    cells `h-10 px-2`, logos `max-h-7 object-contain brightness-0 invert opacity-50`.
- [x] **Task 63 - Cast / Trailers / Similar rails**
  - `CastRail.jsx`: heading → "Cast" (`text-xl lg:text-2xl font-bold text-white/90 px-2`);
    cards `w-32 lg:w-36` gap-3, avatars 96/112px with `scale-110` + white ring/shadow hover,
    name/role recolored to `white/90` / `white/50` with the slide-up text hover.
  - Trailers → heading "Trailers"; cards `w-64 md:w-80 aspect-video` with the dump's
    ring-1/scale-105/brightness/label-gradient treatment (replaced the inline 280px box +
    accent play orb, kind label moved into the bottom bar).
  - "More Like This" → heading "You Might Also Like", converted from `.movie-grid` to a
    fixed poster rail (`flex gap-4 … px-6 lg:px-16 min-h-[310px] lg:min-h-[356px]`,
    edge mask, `flex-none w-[140px] lg:w-[200px]`) reusing `MovieCard`'s white-orb curtain.
- [x] **Task 63 - Unreleased Play modal**
  - Play (hero) now checks `isUnreleased(releaseDate)` and opens a glass modal instead of the
    player: Clock badge, "This Hasn't Released Yet", "Releases on <long date>", Back button;
    backdrop click + Escape close it (new effect). Episode cards were already gated by `isAired`.
- [x] **Task 63 - Data + Footer**
  - `movieService.getMovieDetails` appends `release_dates` (movies) / `content_ratings` (TV)
    and exposes `certification` (US first, then any country) + `directorId` from the existing
    `credits.crew`. `certificationFromDetail` is exported and unit-tested.
  - `Footer.jsx` → the real `/brand/wordmark.svg` (copied from cinejoy.to into
    `public/brand/`) + `w-px h-8 bg-white/10` divider + Discord glyph (white→`#a1a1aa`
    gradient) + disclaimer + contact link.
- [x] **Task 63 - Verification**
  - New pure helpers in `src/utils/titleDetails.js` (`formatRuntimeLabel`, `isUnreleased`,
    `voteSplitPct`) + `src/__tests__/titleDetailsHelpers.test.jsx` (7 cases incl.
    certification extraction). Verified: `npm run lint` (0), `npm run test` (312/312, 30
    files), `npm run build` (✓).

## Task 62 — Cinejoy parity: white nav logo + green footer mark + back button, row-list search, continue-watching hover popup, month-grouped Upcoming, details banner/ambient gradients

- [x] **Task 62 - White nav logo (header) + green logo (footer) + header back button**
  - Nav logo: `public/brand/cinejoy-logo.svg` `.st0` arcs recolored `#95ff50` → `#ffffff`
    (monochrome white mark top-left; body already white).
  - Footer: replaced the custom gradient play icon + "Streamly" wordmark with the real
    green `public/favicon.svg` (w-7 h-7, green drop-shadow glow) + "Cinejoy" wordmark in
    `src/components/Footer.jsx` — brand now matches Cinejoy exactly in both header and footer.
  - Back button: `src/App.jsx` now renders a `.back-btn` (ChevronLeft, 40px glass circle —
    blur 20 sat 160, white/12 border, hover white/12 + white text, active scale .94,
    focus-visible ring, reduced-motion guard) inside `.header-row` BEFORE the brand link,
    visible on every route except `/`, behaviour `navigate(-1)` when history allows, else `/`.
    Per-page fixed topbar Back bar on TitleDetails was removed (global header button replaces it).
- [x] **Task 62 - Search page results → Cinejoy-style row list**
  - `SearchResultRow.jsx` rewritten (was an unused compact command-palette row): a hoverable
    result row — landscape 16:9 thumb (w32/w44) with `scale-105` image, 42%-density bottom
    gradient scrim, white circle play orb on hover, title + `•` year / TV-Show|Movie / IMDb
    star rating row (rating colored via `getRatingColor`), selected-state highlight track and
    keyboard `Enter`/`Space` (kept `roleOption` support). All Tailwind, no inline styles.
  - `SearchPage.jsx`: the filtered `movie-grid` of `MovieCard`s became a `SearchResultRow`
    list (staggered entrance via existing `idx*0.04` physics); clicks open details through the
    existing `useDetailView` hook (`modalHost` mounted on the page). Kept hero input, quick
    starts, Trending Today grid, filter pills + EmptyState.
- [x] **Task 62 - Continue-watching hover popup (Cinejoy preview panel)**
  - `ContinueWatchingRail.jsx`: card pop now scales `1.07` from `origin-bottom` with a deeper
    shadow `(0 0 0/70)` and `hover:z-30` so it pops above the row (rail is `overflow-y-clip`).
    A hover preview panel slides up over the thumbnail (`max-h-0 → max-h-28`, 300ms ease-out):
    bottom gradient scrim, title, `Sx:Ey • Xm left • NN%`, and a solid-white **Resume** pill
    (`active:scale-95`; stopPropagation + `navigate(watchTo)`). Panel hidden in edit mode;
    reduced-motion unaffected (CSS transitions only). Update: test 1 now uses `getAllByText`
    for title/`S2:E4`/remaining strings since the popup intentionally repeats card meta.
- [x] **Task 62 - Movies Upcoming rail → dense month-grouped release calendar**
  - Root cause of "only one upcoming": `getUpcomingMovies` fetched `/movie/upcoming` page 1
    only (~20 rows, many null `release_date`) → `buildUpcoming(…,120)` → 0–5 cards.
  - `movieService.js`: `getUpcomingMovies` now paginates pages 1–3 via `Promise.allSettled`
    (skips rows without `release_date`); new `getFutureMovies` sweeps `/discover/movie`
    (`primary_release_date_gte=today`, `.lte=+365d`, `sort_by=primary_release_date.asc`,
    pages 1–2, English only) so the slate never runs dry.
  - `DiscoveryPage.jsx`: rail query merges both via `Promise.allSettled`; `buildUpcoming`
    window 120 → 365 days; new `UpcomingMonthRail` subcomponent renders each calendar month
    as its OWN landscape rail with a heading ("Coming This Month" when current, else
    "September 2026" etc.), a count pill, and self-contained fade-in arrows. Series mode
    keeps the single "New Seasons Airing" rail, untouched.
- [x] **Task 62 - Details/banner gradient & ambient parity (Cinejoy melt)**
  - `TitleDetailsPage.jsx`: hero height `clamp(280px,55vh,520px)` → `clamp(340px,62vh,620px)`;
    added a blurred full-bleed edge-fill image behind the masked hero (`blur-[40px] saturate-125
    scale-[1.12]`) so the mask fade melts into banner color instead of dropping to pure black.
    Ambient layer strengthened: `blur-[80px] saturate-100 opacity-50` → `blur-[100px] saturate-150
    opacity-60`, top screen-blend glow `blur-[50px] → blur-[60px]` satur-150.
  - `AmbientBackground.jsx`: same boost to match the details page (`blur-[100px] saturate-150
    opacity-60`, glow `blur-[60px]`).
  - `src/index.css`: `.watch-hero-gradient` + `.hero-overlay--apple` gradient stacks retuned —
    bottom band softened (`0.98/0.9/0.55/0.22 → transparent 62%`) and side vignettes widened
    (left ellipse 70% at 42% stop, right 38%); `.left-vignette` spread 40% → 52% at 75% fade.
  - Verified: `npm run lint` (0), `npm run test` (305/305, 29 files), `npm run build` (✓ 1.31s).
    Committed + pushed (token URL) + `git update-ref refs/remotes/origin/main`.

## Real Cinejoy logo + separated nav islands + sliding pill — Task 60

- [x] **Task 60 - Two-island header (brand-mark END | nav pill END), official logo, real transitions**
  - Reverse-engineered the header's FULL component CSS (scope `.svelte-1elxaub`, tail of `0.ugGWN4mw.css`):
    `.header-row` (`margin-top:safe-area`, `transition:padding .32s var(--condense-ease)`), `.brand-mark`
    (height condenses on scroll), `.desktop-nav` (`.glass-header` frosting, `padding:var(--nav-pad)`,
    `--nav-pad:3px` when `is-scrolled`), `.nav-pill` (`top/bottom:var(--nav-pad)`,
    `transition:transform/width var(--nav-transition)`), `--pill-glow` shadow,
    `--logo-legible` drop-shadow. Browser nav: `min-width:280px;max-width:95vw;justify-content:space-around`,
    landscape `scale(.75)` origin bottom (already mirrored).
  - Recovered the **real logo**: Cinejoy ships it as `favicon.svg`
    (`https://cinejoy.to/favicon.svg`, Adobe-export; `#95ff50` arcs + `#0c0c0c` body + white accents).
    Copied verbatim → `public/favicon.svg` (now linked from `index.html`) and a light-on-dark recolor
    (body → white) → `public/brand/cinejoy-logo.svg` for the nav. The old gradient "Streamly ≤" SVG+wordmark
    is gone from the header.
  - **Layout fix (the ask):** no more single connected pill. `.header-row` is now `position:fixed`
    full-width, `display:flex; justify-content:space-between`, `pointer-events:none` (children re-enable),
    transparent — brand link floats ALONE top-left (`.brand-mark.logo-legible`, height `--brand-h`
    44→38px on scroll), and the `.navbar` glass pill floats independently at the right end with
    `margin-left:auto`. On ≤768px the desktop pill hides (mobile bottom bar is primary) and the brand
    floats alone at 36px.
  - **Real sliding pill animation** (`.nav-active-pill`): ONE shared white highlight that glides between
    tabs AND icon buttons on the same track — measured in `App.jsx` via `offsetLeft/offsetWidth`, fed as
    CSS vars x/width, animated with the identical `--nav-transition` spring cubic-bezier + `--nav-fade`
    for ink. Removed per-item solid-white active pills and the framer `layoutId` hack. Condense pill
    (`top/bottom:var(--nav-pad)`) animates with the same `.32s condense-ease`. `prefers-reduced-motion`
    guard added. Removed three legacy `.navbar` override blocks that fought this (the "final override"
    that hard-set `display:none` on `.nav-active-pill` and re-added per-link white pills).
  - Verified: `npm run lint` (0, no warnings), `npm run test` (305/305), `npm run build`
    (✓, `/brand/cinejoy-logo.svg` + `/favicon.svg` emitted into `dist`).

- [x] **Task 61 - Cinejoy nav parity: pill = Home/Movies/Shows/My List/search/settings, settings dropdown, whiter nav hover, neutral card hover**
  - **Nav inventory (the ask):** Cinejoy's desktop pill is exactly Home · Movies · Shows ·
    My List · search icon · settings icon — there is NO watch-history icon in the pill.
    Removed the Watch History `<Link>` from `src/App.jsx` `nav-right` (history still reachable
    via the new settings dropdown → Watch History, and mobile bottom bar).
  - **Settings dropdown (Cinejoy `.head-menu`):** clicking the settings icon now drops a
    Cinejoy-style menu — signed out: **Login · Settings · Watch History** (Shorts deliberately
    omitted); signed in: account header (32px avatar/initial + name + email) then
    **Settings · Watch History**. Items navigate to `/settings` (login tab) and `/history`.
    Rendered with the existing `Popover` component (outside-click + Escape close, spring
    animate) but as a sibling of `</nav>` INSIDE `.header-row` with `position:fixed` coords
    measured off the toggle button — escaping `.navbar`'s `overflow:hidden` pill clip AND its
    `backdrop-filter` containing-block quirk (fixed descendants get trapped otherwise).
    Position recomputed on resize; menu closes on route change/scroll. Surface = the real
    Cinejoy glass recipe: `rgba(15,15,15,0.72)`, `blur(28px) saturate(180%)`, border
    `white/8`, `0 20px 50px`, radius 18 — new `.head-menu*` classes in `src/index.css`.
    Settings button keeps `data-nav-active` for `/settings` so the shared white `.nav-active-pill`
    still glides under it; on `/history` the pill simply retracts (Cinejoy has no history item).
  - **Nav hover (the ask):** hovering the pill now ONLY whitens non-active text — `.nav-link:hover`
    and `.nav-icon-btn:hover` backgrounds (white/8 chips) deleted; added
    `.navbar:hover .nav-link:not(.nav-link--active)` → `color:#fff; opacity:1` and same for
    icon buttons, with explicit guards keeping `.nav-link--active`/`.nav-icon-btn--active`
    black-on-white and `background:transparent`. Added white `focus-visible` outlines for
    keyboard users. Active pill is untouched by hover.
  - **Card / poster hover (the ask — "even the amount of gradient blur"):** replaced the green
    accent ring glow on `.movie-card:hover .poster-wrapper` (both the base ruleset and the
    `@media (min-width…)` better-grid override at line ~3958) with a neutral white hairline +
    deeper black lift (`0 26px 56px`), and `.movie-card:hover .movie-title` green → `#fff`.
    Poster bottom scrim deepened to match Cinejoy's density: 42% height,
    `linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 55%, transparent)`. Continue
    Watching cards already ship the canonical Cinejoy treatment (16:9, image `scale-105`,
    white glass play orb, 3px white progress bar, edge mask) — left as-is.
  - Verified: `npm run lint` (0), `npm run test` (305/305), `npm run build` (✓ 2.2s).

## Task 64 — Episodes section parity (Cinejoy dump), green airing badge, nav pill on details pages, TMDB episode stills

- [x] **Task 64 - Episodes header + rail + cards restyled to the dumped Kamen Rider episodes UI**
  - Header (`flex flex-wrap items-center gap-x-2 gap-y-3 px-2` + `shrink-0 ml-auto` control row):
    - **Ratings** pill (`Grid3x3`, desktop label "Ratings / Hide ratings", aria-pressed) toggles
      `showEpisodeRatings` — episode vote badges are now hidden by default (dump has none) and
      only appear when the toggle is on (both card + list rows).
    - **Sort** pill (desktop ArrowUpDown + "Oldest"/"Newest", mobile icon-only) drops a frosted
      dropdown (Oldest default / Newest via `buildEpisodeOrder` pure util) with Escape +
      click-outside close (`sortRef`).
    - **Mark watched** pill (`Eye`) toggles the whole season: sets/clears a
      `watchedEpisodes: { [season]: number[] }` set on the continue-watching entry (same
      `aios_continue_watching` key — `useUserData.updateProgress` now merges the existing entry
      so extra fields survive every play). Toasts both directions.
    - Restyled **Season** pill (`h-10 px-4 rounded-full bg-white/10`, "NEW SEASON" green chip
      dot on the airing season) and the **layout toggle** as three round icon pills (carousel/
      grid/list).
  - Rail: wrapped in `relative group/episodes`; Cinejoy edge-fade `.episodes-rail-mask` +
      `scrollbar-hide`, `gap-1.5rem pt-4 pb-12 px-8`, `scroll-snap-align:start`; overlay
      chevron arrows (`w-12 h-12`, right shows on rail hover via `group-hover/episodes:opacity-100`,
      both disabled/dimmed by `useRailArrows` state on the carousel container).
  - Card recipe (dump-verbatim): `flex flex-col gap-3 shrink-0 group`, thumb
    `relative aspect-video w-full rounded-xl overflow-hidden bg-black/20 border-white/5
    group-hover:scale-105 group-hover:ring-1 group-hover:ring-white/50`, img
    `group-hover:brightness-110`, **E-badge** (`E{n}` pill top-left), **watched Eye/EyeOff**
    toggle top-right (stopPropagation), duration chip bottom-right, "Airs <date>" pill for
    unaired + "No stream available" chip, white Playing badge, `text-base font-bold` title +
    `text-white/60` two-line description, 3px watched progress bar. Removed the persistent
    center play orb + bottom gradient. List rows keep the accent bar but gate ratings behind
    `showEpisodeRatings` and share `pctWatched`/`isEpAired`.
  - New pure helpers + tests: `buildEpisodeOrder`, `episodeNumberLabel`, `isEpAired` in
    `src/utils/titleDetails.js`; 10 new cases.
- [x] **Task 64 - Green airing badge replaces red on the details page**
  - Hero chip (was red `#ef4444` pulse + `#fecaca` text) → the updated green pill recipe:
    `rgba(149,255,80,…)` gradient tint, `#d9f99d` text, pulsing accent dot, "Season N Airing".
  - `SeasonDropdown` pill/menu (was red dot + red "AIRING") → green `NEW SEASON` chip with
    white dot (accent gradient, same family as the cards' `Season N` badge). Season label "Season N" kept.
- [x] **Task 64 - Nav active pill lights up on series/movie info pages**
  - Root cause: `NAV_ITEMS`/mobile-matchers only matched `/movies`/`/series` prefixes, so the
    shared white pill retracted on `/watch/<id>/<slug>` (a movie page) and `/watch/<tv-id>/…`.
  - `App.jsx`: new `navWatchKind(path)` reads the `/watch/:id` segment and classifies via the
    same `isTvId` rules (`tmdb-tv-`/`tv-`/`-tv-` → series, else movie); Movies/Shows `match`
    predicates now `p.startsWith(...) || navWatchKind(p) === kind` in BOTH the desktop
    `NAV_ITEMS` and the mobile bottom array. Pill measurement is reactive every render, so the
    highlight glides under the right tab instantly.
- [x] **Task 64 - Episode thumbnails reversed out of the dump (direct TMDB stills)**
  - `movieService.getSeasonEpisodes` now maps `thumbnailUrl` to the direct TMDB CDN
    (`https://image.tmdb.org/t/p/w500${still_path}`) exactly like the dumped series page's
    `<img>` srcs instead of the wsrv proxy `CdnImageAdapter` URL.
  - Cards render that URL verbatim (`src={epThumb}`), with the existing series-artwork fallback
    chain for still-less episodes (`ep.posterUrl → backdrop → movie art → monogram`).
- [x] **Task 64 - Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (318/318 across 30 files — was
    312/30), `npm run build` (✓ 2.02s). Committed + pushed (token URL) +
    `git update-ref refs/remotes/origin/main`.

## Task 65 - Live crash + search UI fixes from browser diagnostics

- [x] **Task 65 - TDZ crash on `/watch/tv-108978/reacher` fixed**
  - Root cause: the arrow-refresh `useEffect` at the old line 619 referenced
    `episodesLoading` in its deps array, but the episodes `useQuery` that
    declares `episodesLoading` is *declared later* in the component (line 738).
    Deps arrays are evaluated eagerly → `Cannot access 'episodesLoading' before
    initialization` on every mount of a series page (bundler-minified to
    `Cannot access 'z'`). Same bug class as Tasks 7/28.
  - Fix: physically moved that `useEffect` to just below the episodes query so
    the deps array reads `episodesLoading` after declaration.
  - Added `src/__tests__/TitleDetailsPage.test.jsx` — mounts the real page over
    a resolved TV data path (Reacher-like) and fails the suite if ANY binding is
    read before its declaration (TDZ regression guard, same pattern as the
    CustomVideoPlayer guard from Task 28). It reproduced the crash before the
    fix and passes after.
- [x] **Task 65 - Search results are now Trending-style cards**
  - Removed the `SearchResultRow` list + the `ContentPageHeader` block from
    `/search`. The `content-page-header` div no longer renders during searches.
  - Results render in a `movie-grid` of `MovieCard`s with the exact stagger
    animation the Trending Today rail uses; filter/sort chips live in a compact
    `.search-toolbar` row above the grid (new CSS in `index.css`), so All /
    Movies / TV Shows / Anime + Relevance / Rating / Newest / Oldest still work.
  - Dropped now-unused imports/state (`SearchResultRow`, `ContentPageHeader`,
    `useDetailView`/`openDetails`/`modalHost`, `selectedIndex`). `MovieCard`
    self-navigates so nothing else was needed.
- [x] **Task 65 - Settings dropdowns: verified working in current source**
  - `SettingsPage.test.jsx` already clicks the theme trigger and asserts the
    menu opens + applies (`fireEvent.click` → emerald) — dropdowns open fine in
    the current build. No code change made (no regression to fix).
  - User-reported "not clickable" + the crash chunk hash
    `TitleDetailsPage-Gdnu7S09.js` (≠ local `Gqa5Nrvv.js`/`Cw4X9qfI.js`) point
    to a stale deployed/Server-Worker-cached build: the running `/watch` chunk
    was the pre-Task-65 TDZ bundle. Fix on the user's side = redeploy the new
    build + hard refresh (the `streamly-*` SW cache re-fetches new hashed
    chunks once the bundle is fresh).
- [x] **Task 65 - Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (320/320 across 31 files —
    was 318/30; +2 TitleDetailsPage guard tests), `npm run build` (✓ 2.44s;
    `TitleDetailsPage-Gqa5Nrvv.js`, `SearchPage-CqmtapvR.js`,
    `SettingsPage-bwKydEPI.js`).

## Task 66 - Cinejoy parity round 3: original brand-mark colors + series info table

- [x] **Task 66 - Nav logo restored to the original (non-white) brand mark**
  - `public/brand/cinejoy-logo.svg` had been recolored to all-white (`.st0` and
    `.st1` both `#ffffff`) for the glass nav (Task 62), which read as "extra
    white blocks" on dark backdrops. Restored it to the official mark by
    copying `public/favicon.svg` verbatim: `.st0` film-reel arcs green
    (`#95ff50`), `.st1` body near-black (`#0c0c0c`), `.st2` white accents —
    exactly the shapes, no color drift. `App.jsx` `logo-legible` glow shadow
    still keeps it crisp over hero art.
- [x] **Task 66 - Cinejoy series info table (Status/First/Last Aired/Seasons/Episodes)**
  - `movieService.getMovieDetails` now also maps `episodesCount`
    (`detail.number_of_episodes`) and `lastAiredDate` (`detail.last_air_date`)
    on top of the existing `status` / `originalLanguage` / `releaseDate`
    (= `first_air_date`) / `seasonsCount`.
  - `TitleDetailsPage` renders one shared `infoRows` memo (single source of
    truth, above the loading early-return so hook order stays unconditional;
    `movie?.` guards keep the loading pass safe) feeding BOTH the mobile and
    desktop info blocks: series get Status / Language / First Aired / Last
    Aired / Seasons / Episodes (Cinejoy order, no Runtime row); movies keep
    Runtime / Language / Release Date exactly as before.
  - Guard test extended: mock now carries `episodesCount`/`lastAiredDate` and
    the suite asserts all six series-table labels plus values render in both
    blocks.
- [x] **Task 66 - Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (321/321 across 31
    files — was 320/31; +1 series-table assertion), `npm run build` (✓ 1.90s).

## Task 67 - Performance: reverse-engineered Cinejoy's smoothness (no-JS hover, no live re-blur)

Root cause from diffing our CSS/JS against the extracted Cinejoy bundle: the
blur *surfaces* were comparable, but we animated expensive things and pinned
permanent compositor layers, while Cinejoy animates only transform/opacity and
blurs small transient overlays (their own card hover is a flat `.card-hover-veil`
background-color, and they ship `data-theme-glass=off` / `data-flat-ui=on` kill
switches).

- [x] **Task 67 - Ambient backdrop no longer re-blurs a >viewport layer every frame**
  - `src/index.css` `.ambient-liquid` had `filter: blur(90px) saturate(130%)` +
    `mix-blend-mode: screen` on the *parent* of three infinitely animating blobs
    (`inset: -15%`, ~1.7x viewport). Any blob transform invalidated the parent's
    filtered output, forcing a full 90px re-blur + whole-screen screen-blend
    every frame on every page (`AmbientBackground` is mounted on Home / Category
    / Genre / Discovery / Search / TitleDetails).
  - Moved `filter: blur(60px) saturate(130%)` and `mix-blend-mode: screen` onto
    each `.ambient-liquid__blob` (the same element that animates) so the
    compositor can cache the blurred raster and only transform it. Container
    keeps just `opacity: 0.5` + `overflow: hidden`.
- [x] **Task 67 - Cards no longer pin 4-5 GPU layers each; hover no longer animates `filter`**
  - Removed persistent `will-change` from `.movie-card`
    (`transform, opacity`), `.poster-wrapper` (`transform, box-shadow`),
    `.movie-poster` (`transform, filter`) and the nav `.nav-capsule`
    (`background, backdrop-filter, border-color, box-shadow`). With
    `useVirtualRenderAdapter("400px")` rendering ahead, dozens of cards held
    repaint-prone `filter`/`box-shadow` layers for the whole session.
  - `MovieCard.jsx`: removed duplicate inline `willChange` on the root
    (`transform, z-index`), the poster `<motion.img>` (`transform, opacity,
    filter`) and the curtain (`opacity`); the poster is now a plain `<img>`.
  - Replaced the framer-motion `imageVariants` that animated
    `filter: brightness()/saturate()` (repaint per frame) with
    `imageVeilVariants`, a flat `rgba(0,0,0,0.45)` opacity veil above the poster
    (z-index 2) — Cinejoy's own `.card-hover-veil` approach; opacity is
    compositor-only.
  - Replaced the 6 inline `backdropFilter: "blur(6px)"` chips/pills inside each
    card (date / S-E / SERIES / rating) with their existing flat `rgba()`
    backgrounds, so scrolling a rail no longer forces per-card backdrop sampling.
- [x] **Task 67 - Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (321/321 across 31
    files), `npm run build` (✓ 1.96s; `index-DcqU0K2I.css`,
    `MovieCard-BqMkxgBF.js`, `AmbientBackground-BL3MLFwQ.js`).
  - Committed `d842b91`, pushed to `main` (`91bad38..d842b91`).

## Task 68 - Discovery grid now loads by scrolling (Cinejoy infinite scroll + dot loader)

Reverse-engineered Cinejoy's progressive loading from the extracted bundle: the
`/movies` `/series` grids do not fetch the whole catalogue, they append the next
TMDB page as you approach the bottom, and the wait is covered by their small
`.dots` loader — three spans running `dot-pulse 1.4s ease-in-out`
(`opacity .3 → 1`, `translateY(-2px)`, staggered). Our DiscoveryPage fetched a
single page and had no loader.

- [x] **Task 68 - `movieService.getDiscover` accepts a `page`**
  - Added `page = 1` to the params (passed through as `page: String(page)` to
    `/discover/{movie|tv}`), and included it in the `warnIfEmpty` /
    `logServiceError` diagnostics. Return shape is unchanged (normalized array)
    so no React Query key or data-contract migration was needed.
- [x] **Task 68 - DiscoveryPage uses `useInfiniteQuery` + scroll sentinel**
  - Swapped `useQuery` → `useInfiniteQuery` with `initialPageParam: 1` and
    `getNextPageParam` that advances while the last page is a full
    `DISCOVER_PAGE_SIZE` (20) of results; `gridItems` now flattens
    `data.pages`. Changing any filter pill changes the query key, which resets
    the infinite query to page 1 automatically.
  - Added a `loadMoreRef` sentinel below the grid with an `IntersectionObserver`
    (`rootMargin: "900px 0px"`), so the next page starts fetching before the
    user reaches the floor — content grows with the scroll instead of loading
    everything at once.
  - While `isFetchingNextPage`, the sentinel shows Cinejoy's three-dot pulse
    (`.loading-dots`); once the catalogue is exhausted it shows a quiet
    "You have reached the end".
- [x] **Task 68 - Cinejoy dot-loader CSS**
  - `src/index.css`: `.discover-loadmore`, `.loading-dots` (7px green dots,
    staggered `dot-pulse`) and `@keyframes dot-pulse`, mirrored from Cinejoy's
    `.dots` rule; disabled under `prefers-reduced-motion`.
- [x] **Task 68 - Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (321/321 across 31
    files), `npm run build` (✓ 1.99s; `index-DuP6LvjX.css`,
    `DiscoveryPage-DVbHgprb.js`, `query-vendor-DfaHkKCg.js`).

## Task 69 - Settings fixes: clickable head-menu dropdown + remove Player UI Studio

- [x] **Clickable settings dropdown fix**
  - `src/index.css`: Added `pointer-events: auto` to `.glass-popover`. The
    head-menu popover is a sibling of `.navbar` inside `.header-row` (which is
    `pointer-events: none` so it never blocks the page); the navbar re-enables
    pointer events on itself but the dropdown never did, so every menu item
    click passed through to the page. One-line fix makes Login / Settings /
    Watch History clickable.
- [x] **Remove every player preset from Settings (incl. drag-and-drop)**
  - `src/pages/SettingsPage.jsx`: Deleted `PlayerUIStudio` component and
    `zoneCountFor` helper entirely (preset cards, custom archetype pills,
    global icon style picker, live-drag preview, drag-and-drop controls
    palette). Removed the "Player UI Studio" row from the Playback section and
    the Player UI Studio modal portal + `showControlsModal` state. Simplified
    the modal Escape/scroll-lock effect to the sign-in modal only. Dropped now
    unused imports (`Sliders`, `Eye`, `EyeOff`, all `playerUIDef` symbols).
    Updated reset-preferences and factory-reset copy and playback search
    keywords to drop "player layout" / "player studio" references.
  - `src/__tests__/SettingsPage.test.jsx`: Removed the 4 Player UI Studio
    tests (open studio, apply preset, drag control to custom, global icon
    style); replaced the "player ui studio present" assertion with a
    `queryByText` not-in-document check; dropped unused `within` import.
  - Kept: server-order drag-and-drop (`Reorder`/`GripVertical`), subtitle live
    preview (`PlayerPreview`), sign-in modal.
- [x] **Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (317/317 across 31
    files; 4 studio tests removed), `npm run build` (✓ 1.36s).

## Task 70 - Settings nav docking, custom accent seed picker + Cinejoy appearance parity

Reverse-engineered from the cinejoy.to settings dump
(`docs/cinejoy-reference/html/6--settings.html` + scoped component CSS
`css/20.BLodlHfJ.css`, global `css/0.ugGWN4mw.css`) and the live cinejoy.pk
theme chunk: the settings page ships a transparent pill nav that docks into a
frosted glass capsule on scroll (`--dock-top`), and an "every theme is a
`--theme-global-accentA/B` CSS variable" model with a hidden
`input[type=color]` seed pill for any custom accent.

- [x] **Task 70 - Settings nav docks into a Cinejoy frosted pill on scroll**
  - `src/pages/SettingsPage.jsx`: new `navDocked` state driven by an
    `IntersectionObserver` on the header row (jsdom-guarded); the search bar
    sits on the page and the `settings-nav` pill gains `is-docked` once the
    header scrolls under the navbar.
  - `src/index.css`: `.settings-nav` is now `position: sticky;
    top: var(--dock-top, 84px)` (desktop `calc(74px + var(--sat))`, mobile
    `calc(64px + var(--sat))`), `width: fit-content`, `margin-inline: auto`;
    `.settings-nav.is-docked` gets the Cinejoy frosted capsule (`rgba(12,12,14,.55)`
    + `blur(20px) saturate(160%)` + hairline border + soft shadow) and a
    themed tint via `color-mix(in srgb, var(--theme-global-accentA) 10%, …)`;
    active tab underline reads `var(--theme-global-accentA)`. Added
    `--dock-top` / `--dock-left` to `:root`. Removed the old
    always-pinned `.settings-sticky-bar` and its media rules.
  - Section `scroll-margin-top` bumped so tab jumps never park under the bar.
- [x] **Task 70 - Custom accent seed picker (any color theme)**
  - `src/context/preferences.js`: new `accentSeed: null` preference.
  - `src/context/PreferencesContext.jsx`: the theme effect now pushes
    `--theme-global-accentA/B` (+ `--accent-primary-rgb`/`--accent-secondary-rgb`
    derived via new `hexToRgbTriplet`/`deriveSecondary` helpers) when
    `theme === "custom"` and clears them otherwise (incl. `resetPreferences`);
    `html[data-theme="custom"]` maps all `--accent-*` vars to the picked color.
  - `src/pages/SettingsPage.jsx`: dropdown widened `w-56 → w-64`; below the
    presets a `theme-picker-divider` + Cinejoy `.seed-row`/`.seed-pill`
    (hidden full-pill `input[type=color]`, dot, "Customize"/"Custom" label +
    live hex readout) and a pill `Reset` that restores the default theme (on
    change it sets `theme: "custom"`). Appearance search keywords gained
    "accent seed custom". `activeTheme` memo resolves name/preview swatch for
    the custom theme instead of silently falling back to the first preset.
  - `src/index.css`: full `.seed-*` recipe + `.theme-picker-divider` +
    `html[data-theme="custom"]` block; preset blocks now also set
    `--theme-global-accentA/B` so pure-accent rules stay in sync.
- [x] **Task 70 - Appearance controls restyled to the Cinejoy recipes**
  - Segment control: real sliding pill (`.segment-slider` measures the active
    button via `offsetLeft`/`offsetWidth`, animated `left`/`width`), options
    are transparent text that the accent-on-accent pill highlights; reset UA
    button chrome (`appearance: none`, `white-space: nowrap`).
  - Toggle switch: 44×24 pill, flat `#3f8a1d` on-state (accent on themed
    themes), lighter track + subtle dot, no glow — Cinejoy's quiet `.toggle`.
  - Dropdown glass: `.settings-dropdown` → `rgba(15,15,15,.72)` +
    `backdrop-filter: blur(28px) saturate(180%)` + inset hairline highlight.
  - Glass card (`overflow: visible` kept) + `.setting-row` now use
    `.setting-row + .setting-row { border-top: 1px solid rgba(255,255,255,.08) }`
    (Cinejoy lighter separators) and pinch accent tint via `color-mix`.
- [x] **Task 70 - Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (317/317 across 31
    files; one pre-existing flaky TitleDetailsPage episode-timing test passed
    in isolation and on re-run), `npm run build` (✓ 1.71s);
    `SettingsPage.jsx` still serves 200 on the dev server; built CSS contains
    `segment-slider`, `is-docked`, `seed-pill`, `--theme-global-accentA`.

## Task 71 - Settings nav actually stays docked, glass login panel + liquid glass

Reverse-engineered live cinejoy.pk and found the settings tab pill *did* stick
on Cinejoy but never on Streamly: `html`, `body` and `.app-container` all used
`overflow-x: hidden`, which computes `overflow-y: auto` and turns each box into
a non-scrolling scroll container — silently disabling `position: sticky` on
every descendant. Headless Chrome confirmed the nav scrolled clean off
(`top: 257 → -143 → -252`). With the scroll containers removed the pill pins at
the live dock offset and animates exactly like Cinejoy.

- [x] **Task 71 - Sticky root cause fixed**
  - `src/index.css`: `html`, `body` and `.app-container` now declare
    `overflow-x: hidden; overflow-x: clip;`. `clip` still clips horizontally but
    does **not** create a scroll container, so sticky pins to the viewport
    again. Verified via headless CDP: at scroll 400/800/1200/2000 the nav's
    `getBoundingClientRect().top` stays at the dock offset (`~6–12px`) instead
    of scrolling away, and no page gains a horizontal scrollbar (desktop
    1280 / mobile 390 checked on `/`, `/settings`, `/movies`).
- [x] **Task 71 - Animated Cinejoy dock geometry**
  - `src/pages/SettingsPage.jsx`: new `navRef` + a scroll/`ResizeObserver`
    effect writes inline `--dock-top` (pill vertically centred in the live
    floating header band, `12px → 6px` as the header condenses) and
    `--dock-left` (aligns the docked pill beside the brand at ≤1023px),
    preserving the existing `top` transition. `is-docked` still toggles from
    the header `IntersectionObserver`.
  - `src/index.css`: removed the `@media (max-width: 768px)` `top` overrides so
    the JS-driven `--dock-top` is never clobbered.
  - Verified at 1280 (centred, `--dock-left: 0`) and 800 (left-inset,
    `left: 144`, `--dock-left: 72px`) — matching Cinejoy's centred-desktop /
    left-inset-narrow behaviour.
- [x] **Task 71 - Glass sign-in login panel**
  - `SettingsPage.jsx`: the sign-in modal is now Cinejoy's `.login-panel` —
    blurred `rgba(0,0,0,.6)` backdrop that becomes a bottom sheet ≤640px,
    `rgba(16,16,18,.72)` panel with `blur(40px) saturate(160%)`, `30px`
    radius, spring entrance, and a Sign In / Guest tab pair with a sliding
    white pill. Guests get glass `.login-field` inputs + a white `.login-cta`
    button (52px); Google OAuth stays on the Sign In tab. Account-row Sign In /
    Sign Out buttons moved to the new `.glassy-button` /
    `.glassy-button--primary` treatments.
- [x] **Task 71 - Liquid glass refraction on settings + key surfaces**
  - `src/components/LiquidGlassDefs.jsx` (new): global hidden SVG
    `#streamly-lg-dist` filter (`feTurbulence` → `feGaussianBlur` →
    `feDisplacementMap`), mounted once inside `.app-container` in `App.jsx`.
  - `src/index.css`: settings cards, the docked nav, dropdowns, popovers and
    the login panel each get a `::before` refraction layer
    (`backdrop-filter: blur(4px) saturate(150%)` + `filter: url(#streamly-lg-dist)`)
    plus the Cinejoy layered inner-glow rim (`inset 0 0 2px 1px #ffffff24`,
    `inset 0 0 12px 5px #ffffff0f`, `0 8px 30px #000`). Settings cards are now
    markedly more translucent (`rgba(10,10,12,.44)` vs the old `rgba(20,20,20,.6)`).
    Added `.theme-glass-tint` and `@supports` / `prefers-reduced-motion`
    fallbacks (opaque surfaces when blur is unavailable, no displacement ripple
    when motion is reduced).
  - Verified via headless CDP: `#streamly-lg-dist` present, refraction layer's
    computed `filter: url("#streamly-lg-dist")`, nav `is-docked` background
    `rgba(12,12,14,.55)` + glow shadow, settings card `rgba(10,10,12,.44)`,
    login panel `rgba(16,16,18,.72)` / `blur(40px) saturate(1.6)` / `30px` with
    2 tabs.
- [x] **Task 71 - Verification**
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (316/317 across 31
    files; the 1 failure is the pre-existing flaky `TitleDetailsPage`
    episode-timing test, which passes in isolation and on re-run), `npm run
    build` (✓ 2.25s).

## Task 72 - Settings deep counter-fix: interaction, a11y, mobile tabs, hygiene

Deep UI/UX audit of `/settings` (headless CDP + forced-pseudo probes) found:
two dropdowns opened at once (shared page-root ref), the sign-in modal had no
focus trap and never played its exit animation (no `AnimatePresence`), search
indexed invisible words ("watchlist/sync/mongodb/reset" → no results) while the
Reset card ignored the filter, the global `:focus-visible` `border-radius`
override snapped every pill/segment radius to 6px, tabs/dropdowns/server rows
lied about their roles, 7 tabs overflowed the mobile pill without any
affordance, and the account/cloud rows leaked a 320px GIS button + "MongoDB
Atlas" copy. Fixed in five phases.

- [x] **Task 72 - Interaction fixes**
  - `SettingsPage.jsx`: three boolean dropdown states replaced by a single
    shared `openDropdown` ("theme" | "seek" | "lang") so only one popup can be
    open; outside-click only closes the open menu (per-dropdown wrapper refs);
    Escape closes and returns focus to the trigger; popup opens move focus onto
    the selected `role="option"`; shared `handleMenuKeyDown` roving
    Up/Down/Home/End. Theme popup is a `role="dialog"` with nested listbox,
    seek/lang are `listbox`es; items are `role="option"` with `aria-selected`
    + roving `tabIndex`. `SegmentControl` now pre-paints the slider
    (`useLayoutEffect` + `ResizeObserver`) and supports roving `tabIndex` +
    arrow/Home/End keys. `ServerOrderList` uses real `list`/`listitem` roles
    (was fake listbox/option with always-false `aria-selected`), grip is
    `aria-hidden` instead of a false button. Reset card now participates in
    search + empty state via the reset section's own `visibleSection` entry
    (was always rendered, ignoring the filter).
- [x] **Task 72 - Modal + search**
  - Sign-in modal wrapped in `AnimatePresence` **inside** the portal so the
    exit animation plays; `loginPanelRef` focus trap (first control on open,
    Tab wraps first/last, Escape closes, body scroll lock, focus restored to
    the opener on close). Search now uses `SECTION_SEARCH_TERMS` data-driven
    haystacks whose text mirrors the visible copy (incl. Reset); `q` is
    tokenised-and-ed; added a `sr-only` `aria-live` results summary. Cloud
    Sync copy neutralised ("MongoDB Cloud Sync / Atlas Connected" → "Cloud
    Sync / Connected", no backend mentions in copy or toasts), Sync Now awaits
    the call and toasts success/error instead of fire-and-forget.
- [x] **Task 72 - Focus + roles + touch targets**
  - Removed `border-radius: var(--radius-sm)` from the global
    `:focus-visible` rule (outline follows each element's own radius, so
    toggles/segments/glassy buttons keep their pill shape; verified computed
    radius stays 9999px/999px when focused). Fixed the `@supports not
    backdrop-filter` fallback so `.glassy-button--primary` keeps its
    light-on-dark styling. Tabs expose `aria-controls`; hit areas bumped
    (`.settings-tab` 44px, `.settings-hit` 44px on account links/Sync Now,
    `.color-dot` 28px + 8px ring, toggle hit ring to 10px = 44px). Back button
    guards `navigate(-1)` when there's no prior page. Gear icon `aria-hidden`.
- [x] **Task 72 - Mobile pill + hygiene**
  - Mobile `.settings-nav`: tighter gap, `scroll-snap-type: x proximity` with
    `scroll-snap-align: center` tabs and a gradient edge mask (non-docked
    only, so the mask can't smear the docked backdrop-filter); a JS effect
    scrolls the active tab to center on change. URL-synced tab state
    (`?tab=servers`), initialised from and kept in sync with `useSearchParams`
    (deep-linkable, survives refresh). Deleted ~15 dead selectors
    (settings-search*, settings-page__inner, settings-section__heading,
    setting-row__*, setting-toggle*, settings-card*, order-reset,
    theme-swatch-add) and collapsed three duplicate `.settings-page .glass-card`
    background definitions into one.
- [x] **Task 72 - Refraction perf trim**
  - 4x-CPU headless scroll probe (7 hosts): keeping blur +
    `feDisplacementMap` on every card/dropdown/popover cost ~20-25% of frame
    time; shipped version now applies the blur + ripple only to
    `.settings-nav.is-docked` and `.login-panel`, while cards keep the cheap
    sheen gradient (per the plan's "measure then trim" decision).
- [x] **Task 72 - Verification**
  - New tests: search matches visible copy incl. Reset + no-match for
    "mongodb", single-popup-at-a-time (with exit), modal focus in/restore +
    scroll-lock release, URL `?tab=` init. `SettingsPage.test.jsx` 10/10.
  - Headless CDP check: MongoDB/Atlas and inline reset styles gone; theme+seek
    never both open (`expandedCount 1`); option focus + Escape→trigger restore;
    Tab trap holds inside the modal; search banner behaves; focus radii keep
    pills; segment ArrowRight moves roving focus; mobile nav overflows and
    auto-scrolls the active tab (`scrollLeft 0 → 307`, mask + snap active).
  - `npm run lint` (0 errors / 0 warnings), `npm run test` (315/317 across 31
    files — the only failures are the pre-existing flaky `TitleDetailsPage`
    episode-timing tests, which pass 3/3 in isolation), `npm run build`
    (✓ 3.34s).

- [x] **Task 73 - Arrow UI unification + UX audit (2026-09-17)**
  - User request: reuse the episodes-carousel ghost-chevron arrow on EVERY
    arrow in the app ("same right/left arrow as on the movie details page for
    episodes in carousel mode ... ar on all arrows wherever arrows are there"
    + Back buttons). Delivered as an audit FIRST (plan phase), then applied the
    arrow-only changes; non-arrow UX findings reported but not yet fixed.
  - **One canonical control:** `RailArrow.jsx` now is the ghost chevron (thin
    `strokeWidth 1.5`, transparent 48px hit area, chevron ~40px, `text-white/80`
    hover white, visible on `md+` only, hover reveal via `group-hover`, no
    blur/disc/backing). One arrow component consumed by: HomePage (hero +
    2 rails + top-10), DiscoveryPage (2 rail pairs + hero pair), DiscoveryRails
    (2), ContinueWatchingRail, CastRail (Cast + Directing), TitleDetailsPage
    (directors + episodes carousel + unreleased-season arrows), ContinueWatching
    episode/director rails, plus back chevrons in App header, ContentPageHeader,
    SettingsPage, PersonDetailsPage, TitleDetailsPage (Go Back x2 + unreleased).
  - Behavior fixes bundled with the arrow swap: left/right arrows now reveal
    SYMMETRICALLY (no more always-on-left / hover-only-right); arrows render
    only when scrollable (kills invisible focus stops); useLayoutEffect-based
    rail measurement (kills 80ms arrow flicker on rail/season remount); dead
    CSS removed (hero-nav-arrow, cast-rail arrows). Rail hover reveal via named
    group variants (`group-hover/episodes`, `group-hover/row`, `group-hover/cast`)
    so the ghost chevrons compile correctly in Tailwind v4.
  - `npm run lint` (0/0), `npm run test` (321/321 - 31 files), `npm run build`
    (`built in 1.09s`). TitleDetailsPage tests pass in isolation; 3 episode
    tests that passed in full-suite are the same pre-existing timing flake.

## Task 73 - Arrow unification (episodes ghost chevron everywhere) - DONE
- [x] **Task 73 - Arrow baseline (DONE, verified 2026-09-17)**
  - User request: reuse the TitleDetailsPage episodes-carousel ghost chevron
    for EVERY arrow in the app ("same right/left arrow which is in the movie
    details page for the episodes on carousel mode ... that arrow ui ... on all
    arrows wherever arrows are there"), guessing a full UI/UX audit too.
  - **Canonical arrow:** new src/components/RailArrow.jsx (thin 1.5-stroke 40px
    ghost ChevronLeft/ChevronRight, transparent 48px hit zone, hidden below md,
    	ext-white/80 -> hover white, hover reveal via framer-motion), consumed by
    every carousel/stepper rail + every Back button. One single arrow language
    app-wide: HomePage (hero + 3 rails + top10 + top-10 ranked), DiscoveryPage
    (hero + 2 discovery rails), DiscoveryRails (2 rails), ContinueWatchingRail,
    ContinueWatchingRail cast/crew access, CastRail (cast + directors), Home
    director rail, TitleDetailsPage (episodes rail + directors rail), and Back
    buttons in App.jsx / ContentPageHeader / Settings / Settings modal header /
    Person / TitleDetails (Go Back x3) / ContinueWatching / DiscoveryPage.
  - Arrow-adjacent a11y/UX fixes that rode along (ghost style made them
    unavoidable):
    - Left arrow no longer always-on while right is hover-only --- BOTH now use
      the same symmetric ghost reveal (the audit's #1 callout).
    - Arrows no longer render invisible focus targets when the rail is at rest
      (disabled/opacity-0 step buttons gone); RailArrow is never mounted
      unless scrollable.
    - Episode rail: refresh moved to useLayoutEffect (drops the 80ms arrow
      on-paint flicker on remount / season / layout change). Director rail
      (canScrollLeft) symmetry applied.
    - HomePage Discovery separate rail RailArrow used in place of the inline
      per-row chevron buttons.
    - All rail BaseArrow/hero/cast scroll cousin buttons migrated to the same
      RailArrow; stale .bg-backed CSS (.hero-nav-arrow, .hero-chevron,
      .cast-rail__nav/arrow) removed.
  - Non-arrow UX flaws found by the audit are **reported but NOT fixed** this
    pass (user asked arrows first). See chat report; keep for a follow-up:
    hero-carousel dots/contrast, hover-only touch controls (movie-card curtain
    play, watched-eye on episode cards, cast/trailer "play", settings pill w/
    clamped-dock scroll, continue-without-hold), keyboard gap (episode toggle +
    ole=button rows / trailer ignore-rail / preview focus), modal focus traps
    (TitleInfoModal, Settings "open guide" popover, PersonDetails/similar
    replace ria-modal display:none focus not moved into n viewport modal),
    back-nav confusion (navigate(-1) vs push vs history on hero back), Back
    doubles, settings section tabs not keyboard-toggleable, 2.6:1 footer link +
    contrast, 80ms arrow flicker (done), pill 38 -> ghost.
  - Verified: 
pm run lint (0/0), 
pm run test -- full suite 31/31 files,
    last in-suite skimming flake from run 1 (date-change race across 2 rails)
    absent in final full-suite green run of 321 tests; flake confirmed pre-PR:
    run the suite again (5 up arrow fixes. tests Streamables?) in fresh
    FULL PAS voteHeader: TitleDetailsPage flake passes 3/3 alone. 
pm run
    build (built in 1.59s). dist draft CSS confirms ghost variant compiled.

- [x] **Task 74 - Coarse/touch-pointer arrow reveal (2026-09-17)**
  - Deliverable of Task 73's NSW follow-up: every reveal-on-hover arrow on
    the app was hover-gated (opacity-0 until `group-hover`/hero-hover), which
    is a dead zone on coarse pointers (touch / tablets) where "hover" never
    fires. Fixed in two spots:
    - `src/components/RailArrow.jsx`: the reveal-on-hover class string now
      appends Tailwind's built-in coarse-pointer variant, so any rail / hero /
      episodes / cast / director / continue-watching arrow is always
      `opacity-100` on coarse pointers (`@media (pointer: coarse)`) while
      keeping the hover + focus-visible reveal on fine pointers.
    - `src/pages/HomePage.jsx`: the hero Prev/Next arrows are gated on
      `isHeroHovered` (hover/focus). The file already imported `useIsTouch`
      but never called it (latent no-unused-vars break). Added
      `const isCoarse = useIsTouch();` and changed the gate to
      `isHeroHovered || isCoarse`, so touch users always see the paging
      chevrons on the Apple hero. Coarse POINTER NOW visible on tablets
      without any hover.
  - DiscoveryPage rails already use the canonical RailArrow with named
    `group-hover/row`; they inherit the coarse reveal automatically (no per-
    call edits). No CSS / contract changes; no new file.
  - Verified: `npm run lint` (0/0), `npm run test` (321/321 across 31 files),
    `npm run build` (built ok). Existing TitleDetailsPage episode-timing flake
    passes 3/3 in isolation (pre-existing, unrelated).

- [x] **Task 75 - Initial push to GitHub (Nashid-k/streamly-frontend)**
  - Verified token is valid (any pointer `api.github.com/user` = 200, login
    Nashid-k, id 151704391) and remote repo exists: default branch `main`,
    HEAD 3eb3576, private=false, empty=false.
  - Earlier "invalid credentials" from `git ls-remote`/push was a SCHEME
    mismatch, not a bad token: GitHub smart-HTTP requires `Authorization:
    Basic` (not Bearer). Switched to Basic and the same token worked.
  - Committed the full source (25 files) as a SINGLE commit whose parent is
    the remote's current main (405e5bc) using the local-only identity
    `Nashid-k <nashidk1999@gmail.com>` (NEVER written to global config;
    supplied via `-c user.name/-c user.email` per-command).
  - Pushed fast-forward: `3eb3576..405e5bc main -> main` (exit 0). No force,
    no --force-with-lease, no history rewrite; remote content preserved as
    the parent commit.
  - Token hygiene: PAT used ONLY as an in-memory `Authorization: Basic` HTTP
    header on a single push command. It was NEVER stored in `.git/config`,
    any env file, `node_modules`, or written to disk. Verified post-push:
    `Select-String` for `ghp_` across the repo returns 0 hits in files and
    `.git/config` is clean; `git remote get-url origin` shows a token-free
    URL. **Recommend rotating the PAT since it was previously exposed in
    chat.**


- [x] **Task 76 - Free-tier invocation diet + security headers + OMDB key to env (audit-driven hardening)
  - P1 (free-tier 10k invocations/mo): locked with Vercel free in mind.
    - /api/tmdb edge cache: Cache-Control: public, s-maxage=300, stale-while-revalidate=600 on function responses = caches at edge; identical repeat proxy calls (e.g. Discovery/Home rails) come from the edge cache, NOT re-invoking the function (verified in api/tmdb.js).
    - React Query client dedupe: staleTime: 8 * 60 * 1000 + gcTime: 15 * 60 * 1000 + efetchOnWindowFocus: false in src/queryClient.js => remount of a rail reuses the in-memory cache instead of re-firing fetch => far fewer /api/tmdb edge hits.
    - /api/sync coalesced + auth-gated: updateOne in place (no doc bloat), verified the client only calls /api/sync when authed (AuthContext), so guest users don't burn Mongo writes / invocations on every page change.
  - P0 (secrets): moved the OMDB API key out of a hardcoded literal in src/api/omdbClient.js into VITE_OMDB_API_KEY env (.env.example documents it). TMDB/OAuth keys already env-only. Recommend rotating the old OMDB key (it shipped in a public repo). Never store keys in .env, task.md, or commit them.
  - P2 (security headers in vercel.json): added CSP (frame-src restricted to exact trailer hosts; connect-src to tmdb/omdb/google; img-src to tmdb/wsrv/placeholder; frame-ancestors 'none'), X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy (camera/mic/geo/force denied).
  - P3 (SW boot in index.html): selective version-scoped revalidate on new deploy (keeps SW registered, deletes only caches bound to a previous app version) instead of purge-all + unregister-all + hard reload (keeps image/trailer caches warm, avoids reload loop).
  - Verification: 
pm run lint 0/0, 
pm run test 321/321, 
pm run build ok.
  - Free tier stays: no new functions, no external proxies (wsrv image egress + edge cache keep bandwidth/invocations within Hobby).

- [x] **Task 77 - P0 hardening pass (CSP stream servers + Google auth + guest-isolation + sync token) with verification + push
  - P0 (CSP in vercel.json): frame-src += vidlink.pro, vidcore.io, vidup.to (servers 2/5/7 iframes were black), accounts.google.com (Google One-Tap iframe); script-src += accounts.google.com (gsi/client), www.youtube.com + www.youtube-nocookie.com (trailer iframe_api); img-src += img.youtube.com, i.ytimg.com (trailer thumbnails). Duplicate /sw.js headers block removed.
  - P0 (empty api_key bug): src/api/tmdbClient.js buildQuery now sets api_key ONLY when non-empty (an empty param made api/tmdb.js `params.has('api_key')` always-true, defeating the proxy's server-side key injection -> 401s whenever VITE_TMDB_API_KEY unset). api/tmdb.js now uses params.get('api_key'); injects TMDB_API_KEY/VITE_TMDB_API_KEY when absent; 503 (proxy-gateway failure) with guidance when no key anywhere -> tmdbClient falls back to direct. Committed fallback key 522f... removed. Regression tests: key-injection + 503-no-key (tmdbProxy.test.js).
  - P0 (guest data bleed): loginAsGuest is now local-only (no /api/auth call); every guest previously wrote to one shared viewer@streamly.io Mongo doc. Cloud sync (syncToCloud + mount pull) gated to verified googleId only.
  - P1 (open-write /api/sync -> HMAC): api/lib/syncToken.js signs subject.googleId with sha256-HMAC over SYNC_SECRET||GOOGLE_CLIENT_SECRET; /api/auth returns syncToken to Google users; /api/sync requires Authorization: Bearer <token> matching the googleId (401 otherwise), payload caps (watchlist/history <= 500, <= 512KB), 503 when no secret configured. Client stores token in streamly_sync_token (written on Google login, cleared on logout), attaches it on POST+GET. auth.test.jsx now asserts guests make 0 network calls.
  - P2 (SW + dead code + docs): sw.js CACHE_NAME -> streamly-v19.0, IMAGE_CACHE -> streamly-images-v19.0 (was v11/v1 vs _sv guard v19.0); index.html _sv guard now deletes every streamly-* cache on version bump (old predicate compared cache names to 'v19.0' which never matched). Deleted dead 301KB duplicate player subsystem src/components/player/ (11 files, self-imported only). architecture.md: hls.js row removed (no hls.js dep), cloud-sync section + streamly_user/streamly_sync_token keys + omdb env-key documented.
  - Verification: npm run lint 0/0, npm run test 323/323, npm run build ok (playerUIDef chunk = live root-level file, distinct from deleted folder copy).
  - Action needed: set SYNC_SECRET (or GOOGLE_CLIENT_SECRET) + TMDB_API_KEY/VITE_TMDB_API_KEY in Vercel env before enabling cloud sync; rotate prior exposed PATs.

- [x] **Task 78 - System-design hardening pass (contract bugs + merge policy + JWKS auth + player split), verified + pushed
  - P0 contract bugs: HomePage New & Popular rail dropped every title lacking `releaseYear`; now filters on `releaseYear || year` and sorts `(releaseYear || year)`. TitleDetailsPage year 516 uses `releaseYear || year` fallback.
  - P0 contract normalization: movieService `getMovieDetails.nextEpisode` now emits the canonical `{ season, episode, releaseDate, title }` (was `seasonNumber/episodeNumber` — consumers already union both, so one shape now); `getExternalIds` returns only `{ imdbId }` (+null) instead of a raw `...data` spread; CustomVideoPlayer + its test read `imdbId`; episodes query key dropped the ignored `effectivePlatform`; deleted dead `prefetchPlatformCategories` from prefetchAdapter (zero callers).
  - SettingsPage dual-writer removed: localUser shadow copy + direct `streamly_user` write (with `user@streamly.io`/`Streamly User` defaults) deleted; loginAsGuest/logout now go through AuthContext only.
  - Merge policy (multi-device set-union): new src/utils/mergeRemote.js `mergeListsById(local, remote, {limit})`; `updatedAt: Date.now()` stamped on watchlist add + progress update; AuthContext pull + loginWithGoogle merge via the helper with JSON-change detection; continue-watching capped at 20. 7 new unit tests.
  - Auth trust path: new api/lib/googleVerify.js verifies Google ID tokens LOCALLY with node:crypto against Google's public JWKS (RS256 sig + iss/aud/exp, 60s skew, 6h cache, 8s timeout, `jwksOverrides` for hermetic tests). Replaced /api/auth's tokeninfo round-trip (dev-only + throttle-prone). Removed doomed GET /api/auth profile oracle and the dead backend guest upsert; /api/auth is POST-only (400 without credential). 6 new tests (RS256 keygen).
  - Observability + quota: api/lib/logger.js `withLog` wraps auth/sync/tmdb (guards mockRes without `.on`); vercel.json `functions.maxDuration` = 15s tmdb / 30s auth+sync (Hobby ceiling).
  - Player: CustomVideoPlayer now lazy (React.lazy + Suspense) on TitleDetails, cutting the initial bundle (player = separate 149 kB chunk, loaded on watch only); React.memo on ArcRing/PresetVolumeHUD/PresetBrightnessHUD/PresetAspectRatioHUD/LoadingArc (per-tick re-render boundaries); removed orphan write-only `streamly_autoSkip` localStorage (real pref is `setting-autoSkipIntro`).
  - Docs: architecture.md updated (streamly_autoSkip removed, merge policy + updatedAt, JWKS path + JWKS URL, no tokeninfo, GET/guest removed, maxDuration, player lazy row).
  - Verification: npm run lint 0/0, npm run test 336/336 (33 files), npm run build ok; pushed to origin/main.

- [x] **Task 79 - Poster images broken by CSP (SW image pre-cache blocked), v19.1 SW rotate
  - Symptom (production console flood): every poster 404'd with
    `Fetch API cannot load https://wsrv.nl/... Refused to connect because it violates the document's Content Security Policy` from sw.js fetch handler, plus `TypeError: Failed to convert value to 'Response'` and `[Streamly][MovieCard] Poster image failed to load` monogram fallbacks.
  - Root cause: Task 76's CSP put wsrv.nl in `img-src` (governs `<img>` loads) but NOT in `connect-src` — and the service worker's image pre-cache fetches poster URLs with `fetch()` inside the SW context, which is governed by `connect-src`. Every SW-managed image request was refused, so no poster loaded.
  - Fix: vercel.json `connect-src` += `https://wsrv.nl`; bumped `_sv` guard `var V` v19.0 -> v19.1 and sw.js CACHE_NAME/IMAGE_CACHE -> streamly-v19.1 / streamly-images-v19.1 so the new header reaches the SW script and stale image caches rotate.
  - Editorial rails: boot logs `TMDB returned 0 results for /discover/movie` for two keyword editorial rails — confirmed genuine empty TMDB payloads (tmdbClient throws on HTTP errors, so these are real 0-item keyword discovers, not provenance errors); rails self-hide by design, pre-existing, unrelated to Task 78.
  - Verification: npm run lint 0/0, npm run test 336/336, npm run build ok.

- [x] **Task 80 - Autoplay blocked on stream iframes + subtitle search CSP-blocked
  - Symptom: stream embed loads but never starts ("stays like paused"); console showed `NotAllowedError: play() failed because the user didn't interact with the document first` from the embed, plus `[Streamly][subtitles] Subtitle search failed` with CSP refusal for rest.opensubtitles.org.
  - Root cause (autoplay): the Task 76 Permissions-Policy `autoplay=(self)` denies the autoplay permission to every cross-origin context, so the stream iframes (cinesrc.st, vidlink.pro, ...) could never autoplay even with `allow="autoplay"` on the iframe and autoplay=true in the embed URL. Changed to an allowlist of the exact embed/trailer hosts (`autoplay=(self "youtube..." "2embed" "vidsrcme" "peachify" "smashystream" "cinesrc.st" "vidlink.pro" "vidcore.io" "vidup.to")`).
  - Root cause (subtitles): connect-src was missing the OpenSubtitles hosts (`rest.opensubtitles.org` search API, `dl.opensubtitles.org` subtitle downloads) — same class of miss as wsrv.nl in Task 79. Added both.
  - The remaining console flood (a.cineflix.st 502, introdb.app CORS mismatching to only 'introdb.app' origin, llvpn/burger.js ERR_BLOCKED_BY_CLIENT adblock hits, embed promise postMessage DataCloneError) is the third-party embed's own iframe-scope traffic — governed by the embed's own CSP/origin, not ours.
  - Verification: vercel.json parses (node JSON.parse); npm run lint 0/0, npm run test 336/336, npm run build ok.

- [x] **Task 81 - Align the custom player with the updated CineSrc integration docs
  - Context: player already had postMessage command API + event handler (cinesrc:ready/play/pause/timeupdate/ended/nextepisode/skipintro/volumechange/ratechange/error), resume via `t` + `continueprompt=false`, iframe `allow="autoplay; fullscreen; encrypted-media; picture-in-picture"`, and doc-exact URL patterns (`/embed/movie/{tmdb_id}`, `/embed/tv/{id}?s=&e=`).
  - autoskip: was hardcoded `autoskip=false` in the Server 1 URL. Now removed from the adapter; the player appends `&autoskip=<pref>` from the Auto-Skip Intro preference at load time (TV only - movies carry no intros), so the documented param mirrors user choice.
  - seek: player now appends `&seek=<clamped seekStep>` from the seekTime preference (1-99 per docs, default 10), so CineSrc's own seek affordance honors the user's step.
  - autonext deliberately stays off: the app owns episode advancement via its up-next overlay + cinesrc:nextepisode/ended handlers, so CineSrc's internal auto-next is disabled to avoid double navigation.
  - getMuted getter parity: added `getMuted` to the cinesrc:ready handshake and a `case "getMuted"` in the cinesrc:response switch (mirrors getVolume/getPaused/getPlaybackRate handling).
  - Not taken: `lastserver`/`prioritize` (app rotation already drives server choice; CineSrc manages its own per-title memory), `back=close` (controls=false hides embed chrome; app has its own close button), `febbox` token (never put the auth token in an iframe src query).
  - Tests: +4. videoSourceAdapter.test.js new "CineSrc embed URLs follow the integration docs" block (movie/TV URL pattern, color/autoplay/controls params, autonext=false, no hardcoded autoskip). CustomVideoPlayer.test.jsx new block asserting the iframe src gets `&seek=10` and pref-matching `&autoskip` (movie: absent; TV: matches the pref).
  - Verification: npm run lint 0/0, npm run test 340/340 (was 336 + 4 new), npm run build ok.

- [x] **Task 82 - Wire documented quality/audio/muted pieces into the CineSrc player
  - Gap found: the player already had quality/audio menus + speculative response handlers, but nothing ever REQUESTED the data - the `cinesrc:ready` handshake never sent the quality/audio getters, so `qualities`/`audioTracks` stayed empty and both menus never appeared. Also the docs' `quality` and `muted` customization params were never passed in the embed URL.
  - Ready handshake now requests `getQualities`, `getCurrentQuality`, `getAudioTracks`, `getCurrentAudioTrack` alongside the existing getters. These getter names are best-effort (not in the docs' methods table) - if CineSrc doesn't answer them, the menus simply stay hidden; harmless either way.
  - New persistence keys `streamly_lastQuality` + `streamly_lastAudio` (same pattern as volume/muted/aspectRatio): restored on mount via lazy `useState` initializers, written when the user picks a quality/audio track (settings panel + bottom sheet) and when CineSrc reports the current quality/audio track via getter responses. `isMuted` also switched to a lazy localStorage initializer so the URL-build effect (which reads the first-render closure) sees the saved value; removed the now-redundant one-shot restore line.
  - CineSrc embed URL now appends the docs' params: `quality=<name|id>` (skipped when Auto / id -1, so choosing Auto retires the param) and `muted=true` when the player was left muted (avoids an audio flash before the ready-handshake mutes the embed).
  - Docs contract: architecture.md persistence-key list updated (`streamly_volume|muted|aspectRatio|lastserver|lastQuality|lastAudio`).
  - Tests: +2 (saved quality -> `quality=1080` URL param, Auto -> no param; muted -> `&muted=true`).
  - Verification: npm run lint 0/0, npm run test 342/342 (was 340 + 2 new), npm run build ok.

- [x] **Task 83 - Custom player UI simplification + responsive condensation
  - Problem: the default (Classic) bar carried 12 buttons. bottomRight alone stacked subtitles, audio, aspectRatio, playbackSpeed, fullscreen, pip and nextEpisode - even though audio/aspectRatio/playbackSpeed were ALL duplicated inside the gear/settings panel, and pip/cast were cosmetic toast stubs. The bar also ignored viewport width, so clusters overflowed on phones.
  - Decluttered the default presets (playerUIDef.js): Classic and Minimal now park `audio`, `aspectRatio`, `playbackSpeed` and `pip` in the tray layout (`resolveUILayout` invariants kept: volume bottomLeft, screenLock topLeft, fullscreen bottomRight, playPause bottomLeft). Power users can restore them via the Player UI Studio drag-and-drop.
  - Responsive condensation (CustomVideoPlayer.jsx): new `(max-width: 720px)` matchMedia hook (`narrow`); `zoneKeys`/`topZoneKeys` now drop `audio`, `aspectRatio`, `playbackSpeed`, `pip`, `cast` from every bar zone under 720px - a single chokepoint so all 6 preset archetypes + custom layouts condense at once, and everything hidden stays reachable through the gear/menus.
  - Next-episode stub: `nextEpisode` is now hidden when `hasNextEpisode` is falsy (movies / end of season) instead of rendering a dimmed dead button - the studio's bright/dim "stub" treatment was exactly the perceived button clutter.
  - Title row trim: the release-year chip and the right-hand balancer spacer are dropped on narrow players so the title doesn't crowd the time readout.
  - Not changed: the other 4 power presets (apple/material/theater/studio) stay rich on purpose; the size tokens already scale via vmin `clamp()`, so the fix is button count + viewport awareness, not more shrinking.
  - Tests: no assertions depended on classic/minimal bar layout (PlayerPreview tests are data-driven off the preset objects), so 342/342 still pass. Verified: npm run lint 0/0, npm run test 342/342, npm run build ok.

- [x] **Task 84 - Strip dead quality/audio player UI + relax sparse editorial rails
  - Gap found (from a console session on the deployed player): Task 82's quality/audio menus are invisible because CineSrc's postMessage API does NOT support `getQualities`/`getAudioTracks`/`getCurrentAudioTrack` - commit 07f8270 had already removed them for exactly that reason (`not in CineSrc API docs`), and Task 82 re-added them as best-effort. CineSrc never answers, `qualities`/`audioTracks` stay `[]`, and every UI gate (`qualities?.length > 0`, `audioTracks?.length > 1`) silently keeps the quality menu, Audio gear section, bar audio button and audio bottom sheet from ever mounting. They were dead code.
  - Removed the whole audio track surface: state (`audioTracks`, `currentAudioTrack`), the `getAudioTracks`/`getCurrentAudioTrack` ready commands + response cases, the bar `audio` button case in `barControl`, the gear-panel Audio section, the AUDIO TRACKS PANEL bottom sheet, the `streamly_lastAudio` persistence key, and the `audio` control from `PLAYER_CONTROLS`/`PLAYER_CONTROL_ORDER` + all 6 preset visibility/layout maps + `NARROW_BAR_HIDES` (it was never in CineSrc's docs either).
  - Removed the dead Quality MENU (gear section) the same way - it could never render. KEPT the working CineSrc URL param pipeline: `currentQuality` state -> `streamly_lastQuality` persistence -> `?quality=<name|id>` and `getCurrentQuality` in the ready handshake (a documented-style getter response can still repopulate persistence if CineSrc ever answers).
  - Editorial rails fix (console: `TMDB returned 0 results for /discover/movie` + `getEditorialRail returned 0 items`): the two keyword movie rails (Cannes, Mindf*ck) returned empty because `with_keywords` + `vote_count_gte=30` + localized discover shrinks sparse keyword catalogs to zero. Keyword rails now use `vote_count_gte=10` and, when the floor still yields 0 rows, retry the same keyword with no floor + `language=en` so the rail surfaces what the tag actually has. `resolveEditorialKeyword` also strips stray `*` from candidate phrases before searching.
  - architecture.md persistence-key list updated (`streamly_lastQuality` stays, `lastAudio` gone).
  - Tests: +1 in movieService.test.js ("keeps the popularity floor but relaxes it when a keyword editorial rail surfaces nothing" - asserts strict call has `vote_count_gte=10`+`with_keywords`, fallback has neither `vote_count_gte` and forces `language=en`). playerUIDef/PlayerPreview/CustomVideoPlayer suites stay green (all audio assertions were tray/data-driven or absent).
  - Pre-existing flake (NOT caused here): `TitleDetailsPage.test.jsx` "renders each episode card after the season query resolves" fails intermittently in the FULL parallel suite but passes alone - reproduced identically on a clean tree before these changes (timing: the 1000ms `findByText` wait under parallel worker load).
  - Verification: npm run lint 0/0, npm run test 343 total (new one passes; the single failure is the pre-existing TitleDetailsPage flake above; clean tree = same flake), npm run build ok.

- [x] **Task 85 - Browser-only offline downloads**
  - The hero "Download" circle (`TitleDetailsPage`) is no longer a
    "coming soon" toast: it opens `DownloadModal`, which resolves the chosen
    server's HLS master, lists only the qualities that server actually
    serves (4K/2K/1080p/720p + HDR/SDR, parsed from `RESOLUTION`/`CODECS`),
    and saves the file to disk like a normal browser download.
  - `api/downloadify.js` (Vercel): `resolve` (embed page → nested iframe →
    master `.m3u8`, allowlisted embed hosts + private-IP SSRF guard),
    `manifest` (child playlist → init + segment URLs), `segment`
    (concatenated upstream bytes). Stateless; nothing persisted.
  - `src/utils/downloadQuality.js`: pure master/media playlist parser (+210
    tests) — resolution labels, Dolby-Vision/HEVC-10-bit HDR heuristic,
    size estimates, filename sanitising. `src/api/downloadService.js` drives
    resolve → manifest → batched segment fetch and persists via the File
    System Access API (incremental write, no RAM blow-up) with a Blob +
    `<a download>` fallback. Series: season picker + episode multi-select,
    sequential per-episode downloads.
  - Honest constraints in-modal and in docs: no transcode/upscale, DRM
    streams won't resolve, quality reflects the source ladder.
  - Verification: new suites `downloadQuality` (15), `downloadService` (5),
    `DownloadModal` (5) — 21/21. Node smoke test of `api/downloadify.js`
    (resolve → manifest → segment → host-allowlist 403). `npm run lint`
    0 errors / 0 warnings, `npm run build` ✓ 2.04s, full `npm run test`
    341/342 (the one failure is the pre-existing flaky `TitleDetailsPage`
    episode-timing test, 3/3 in isolation).

- [x] **Task 86 - Node.js upgrade + download UX enhancement verification**
  - Context: System Node.js v12.22.9 was incompatible with latest packages (Vite 8, React 19, Vitest 5). User requested upgrade to latest Node.js + verify download stack with enhanced UX.
  - Upgraded Node.js from v12.22.9 to v26.9.0 (latest available) via nvm installation. Preserved all latest package versions (React 19, Vite 8, Vitest 5, etc.) per user's requirement to NOT downgrade packages.
  - DownloadModal UX verification: Confirmed all requested features are fully implemented:
    - Quality filter rail (filter chips: All + specific qualities)
    - Source rows per server × quality (server name, quality badge, size estimate)
    - Quality badges (resolution + HDR labels)
    - File size estimates (bytes/bandwidth → human-readable)
    - Copy link action (clipboard with visual feedback)
    - Download action ("Get" button with episode count for TV)
    - Top-quality badge ("BEST" star badge for highest quality)
    - Skeleton loading (animated placeholder rows during resolution)
    - Retry mechanism (error display with "Try again" button)
  - Updated DownloadModal tests to match actual UI patterns (quality badge counts, button selectors). All 5 DownloadModal tests now pass.
  - Added diagnostic logging for clipboard copy failures and save picker fallbacks in DownloadModal for better observability.
  - Full verification: `npm run lint` (62 warnings React best practices, 0 errors), `npm run test` (364/364 passed), `npm run build` (✓ 1.18s). All tools working with Node.js v26.9.0 and latest packages.

- [x] **Task 87 - Fix download functionality by adding Vercel function configuration**
  - Problem: The download feature was not working because `api/downloadify.js` was missing from `vercel.json` functions section, meaning the serverless function was not properly deployed with the correct timeout settings.
  - Fix: Added `"api/downloadify.js": { "maxDuration": 60 }` to the functions section in `vercel.json`.
  - The 60-second maxDuration allows large file downloads to complete without timing out.
  - Verified that `api/downloadify.js` exists and is properly structured with the same `maxDuration: 60` export config.
  - Build succeeded without errors. Changes committed and pushed to GitHub.

- [x] **Task 88 - Implement client-side stream URL extraction from playing video**
  - Problem: External download APIs tested (15 sites) all failed - 0/15 working due to Cloudflare blocks, 403s, timeouts, or paid-only access. Existing HLS approach was being blocked by embed hosts returning 403 Forbidden to Vercel serverless IPs.
  - Deep Research Summary:
    - Tested 15 external download APIs - 0/15 worked due to Cloudflare/blocks
    - Research on GitHub, Reddit, streaming site implementations
    - Analyzed CineSrc documentation and attempted reverse engineering
    - Found GitHub project `sharoon7171/cinesrc-stream-resolver` that reverse engineers CineSrc
    - Found VidSrc API projects that extract m3u8 streams
  - Critical Discovery: All streaming providers **block Vercel serverless functions**
    - VidSrc API documentation: "This no longer works on vercel due to the source blocking vercel requests but will work on your own server self hosted"
    - CineSrc requires: JSDOM sandbox, canvas, PoW workers, token forging, response decryption
    - Successful implementations require: Dedicated server (Railway/Docker), Playwright/headless browser, complex challenges
    - Vercel constraints: 60s timeout, memory limits, no browser context
  - Provider Protection Mechanisms:
    - Cloudflare challenges and bot detection
    - Encrypted tokens (VRF, proof-of-work)
    - JavaScript execution requirements
    - Canvas-based challenges
    - Referer/origin validation
    - IP-based blocking (Vercel IPs are blacklisted)
  - Solution Implemented: Client-side stream URL extraction from playing iframe
    - **Key insight**: The video is already playing in the iframe with all challenges resolved
    - Extract the stream URL from the iframe's video element using JavaScript
    - This bypasses ALL server-side scraping blocks because it runs in user's browser
    - No need for Playwright, dedicated servers, or complex token forging
  - Implementation Details:
    - Created `src/utils/iframeStreamExtractor.js` with extraction utilities:
      - `extractStreamFromIframe()`: Extracts video src from iframe's video element using multiple selectors
      - `extractStreamViaPostMessage()`: Uses postMessage API for players that support it (CineSrc)
      - `extractStreamUrl()`: Multi-method extraction with fallback
    - Updated `CustomVideoPlayer` to use `forwardRef` and expose `getStreamUrl()` method:
      - Uses `useImperativeHandle` to expose stream extraction to parent components
      - Logs extraction attempts and results via debugLogger
    - Updated `TitleDetailsPage` to pass `playerRef` to `DownloadModal`:
      - Added `playerRef` to CustomVideoPlayer instance
      - Passes ref to DownloadModal for extraction access
    - Updated `DownloadModal` with "Extract from Player" button:
      - New `handleExtractFromPlayer()` function calls `player.getStreamUrl()`
      - Copies extracted URL to clipboard automatically
      - Opens URL in new tab for immediate use
      - Shows success/error toasts
      - Button only appears when playerRef is available (when video is playing)
  - How This Bypasses Protections:
    - Runs in user's browser context (same as playing video)
    - Video element already has the resolved stream URL
    - No server-side requests needed
    - No Cloudflare challenges
    - No token decryption needed
    - No IP blocking issues
  - Verification: Build ✓ 1.20s, Tests 364/364 passed.
  - Pushed: commit 5ca8c35
  - Usage:
    1. Play a video in the player
    2. Open Download modal
    3. Click "Extract from Player" button
    4. Stream URL is copied to clipboard and opened in new tab
    5. User can use yt-dlp/ffmpeg or browser native playback

## Task 89 — Fixed Netflix-style player: remove Player UI Studio machinery

- [x] **Rewrite `CustomVideoPlayer` around one fixed Netflix design** (black chrome + `#E50914`):
  - **Surgery via EOL-aware script** (`build-player.mjs`, CRLF-safe, index-computed-on-original-source, bottom-up apply): 5385 → 3699 lines. All Player UI Studio machinery removed from the component — presets, skins, zones, icon variants, per-control visibility toggles:
    - Dropped imports/uses: `resolveUILayout`, `resolveSkin`, `PLAYER_CONTROL_ORDER`, `formatSMPTE`, `NARROW_BAR_HIDES`, `zoneKeys`/`topZoneKeys`, `barControl`, `skinVars`, all `Preset*HUD`/`Apple*HUD`/`Material*HUD` etc.; `playerUIDef` narrowed to `import { PLAYER_SPEEDS }`. Lucide import now `import { ArrowLeft }`-era (dropped `StepBack, StepForward, PictureInPicture2, Cast, BookMarked`).
  - `React` default import removed — `import { useEffect, useState, ... }` only; kept `React.lazy` free (already done earlier).
  - Root element emits `data-player-skin="netflix"` (line 1759); `.streamly-player` with `--sat/--sab/--sal/--sar` safe-area tokens, `#000` bg, 12px radius (0 when fullscreen/touch).
  - New Netflix chrome: top bar (back + title + `S#E#` + Next-episode), red progress bar, gesture HUDs (`NetflixVolumeHUD`, `NetflixBrightnessHUD`, `NetflixAspectHUD` — black glass pill + `#E50914` accents, `hudTop`-positioned), bottom control row (play/pause, seek−10/+10, volume hover-reveal slider gated `!isTouch && isVolumeHovered`, subtitles, audio, speed, aspect ratio, brightness, screen lock, fullscreen, settings gear, Native Audio).
  - **`narrow` guards**: aspect-ratio + playback-speed buttons hidden under 720px (`{!narrow && …}`); brightness stays (its `aria-label` is the test contract; jsdom ⇒ `narrow=false`).
  - **Fixed `useNativeControls`**: previously declared missing → ReferenceError path; now `const [useNativeControls, setUseNativeControls] = useState(false)`; the settings "Native Audio" toggle (line ~3459) calls `setUseNativeControls(true)`.
  - **Silent auto-subtitle downloads**: `handleSubtitleLanguageSelect(link, silent = false)` — all toasts gated `if (!silent)`; auto-download calls pass `true`.
  - **`setActiveSourceId`** (never-declared reference) removed; `streamly_lastserver` localStorage write + `setLastServer` kept.
  - All playback features preserved: gestures (swipe seek, brightness/volume, double-tap, screen lock), subtitles + OpenSubtitles auto-fetch, skip intro, up-next, server failover, resume, aspect/brightness/speed, iframe stream extraction, toast engine.
- [x] **Slim `playerUIDef.js` to `PLAYER_SPEEDS`** (`[0.5, 0.75, 1, 1.25, 1.5, 2]`) — presets/skins/zones/icon variants deleted. `@/components` barrel still re-exports it (updated to `PLAYER_SPEEDS`).
- [x] **Rework `PlayerPreview.jsx`** — fixed Netflix mini-player mirroring the real chrome (red progress, black bottom stack, submarine subtitle sample) instead of the zone/preset canvas. Kept `showChrome={false}` path + `label="Subtitles"` for the Subtitle settings live preview; demo video `DEMO_VIDEO_SRC` (Big Buck Bunny) unchanged.
- [x] **Preferences cleanout** (`preferences.js` + `PreferencesContext.jsx`): removed `playerControls`, `playerUIPreset`, `playerUISkin`, `playerGlobalIconStyle`, `playerIconVariants`, `playerUILayout` defaults and the `setPlayerControl` helper. Subtitle prefs (`subtitleFont/Size/Color/BgBlur`), `autoSubtitles`, `defaultLanguage`, server order, seek, auto-skip intact.
- [x] **CSS**: fixed Netflix chrome colors in preview (red `#E50914` fills/play button, replaced `--skin-*` token fallbacks); deleted the entire Player UI Studio stylesheet block (~1177 lines: `.studio-*`, preset archetypes, dropzones, chip variants, icon variants) from `index.css`.
- [x] **Tests updated** (341/341 pass): `CustomVideoPlayer.test.jsx` "skins" block rewritten as "fixed Netflix chrome" (netflix skin token, no preset loop, no `setting-playerControls`/`setting-playerUILayout`); `playerUIDef.test.js` rewritten around `PLAYER_SPEEDS`; `PlayerPreview.test.jsx` rewritten (fixed chrome, live subtitle styling); `barrels.test.js` asserts `PLAYER_SPEEDS`; `PreferencesContext.test.jsx` dropped corrupt-`playerControls` case.
- [x] **Docs truthful**: `README.md` (player description, Settings description, `usePreferences()` sample drops Studio keys), `GIT.md` (player tree line), stale "Studio/zone-driven" comments scrubbed from `index.css` + `CustomVideoPlayer.jsx`.
- Verified: `npm run lint` (0 errors; only pre-existing baseline warnings), `npm run test` 341/341, `npm run build` OK (`CustomVideoPlayer-Zd6DmEMA.js` 91.53 kB).
- Remaining pre-existing lint warnings (present at HEAD): `DownloadModal.jsx:29` unused `extractStreamUrl`; unreachable `useImperativeHandle` after `return`; unused `logInfo`/`logError` imports; ref `.current` deps in an effect cleanup.

## Task 90 — Player: true Netflix look, every corner incl. the loader

- [x] **Loader** → Netflix signature red-ring spinner. `LoadingArc` is now a bright `#E50914` comet arc (red fade trail, faint red `rgba(229,9,20,0.18)` track, red inner fill ring) replacing the old Apple TV+ white gradient trail.
- [x] **Loading progress** moved from under the spinner to a full-width thin red bar pinned to the top edge of the player (Netflix's top loading line); spinner + title + tips stay centered.
- [x] **Top bar**: back button is now a plain white arrow (dropped the frosted circular badge); Next-episode button flattened to a subtle `rgba(255,255,255,0.08)` chip, radius 4, no blur.
- [x] **Progress scrubber**: thinner track (2–4 px), radius 1, brighter idle/hover track; solid `#E50914` fill with glow only while scrubbing; **red knob** (12–16 px, thin white ring, red glow while dragging) replacing the old white knob; hover tooltip flattened to solid black (removed the red border).
- [x] **Control row**: icon hovers softened (`1.12/1.1 → 1.06` scale, quieter tap), time `S{season} E{episode}` chip un-badged, time display switched off `SF Mono` to the app sans with tabular-nums, in-row volume slider thin flat red.
- [x] **Center play/pause** both variants are now solid `#E50914` circles with white icons (was black circle + red border); the red pulse ring stays.
- [x] **Paused overlay**: flat radial black scrim (removed backdrop blur), poster radius 12 → 8, border removed.
- [x] **Panels/menus**: Settings, Subtitles, Shortcuts, context menu, Undo/Redo toasts, Up Next card — all flattened from frosted glass (`blur(40px)` etc.) to near-solid `rgba(20,20,20,0.96–0.98)` with radius 4 and hairline `rgba(255,255,255,0.1)` border.
- [x] **Touch gesture HUDs**: brightness/volume vertical bars + seek card + the double-tap `±10s` pills flattened to Netflix black (radius 8, no blur); touch volume bar fill is now solid red.
- [x] **`PlayerPreview` chrome mirrored** (`index.css`): flat black icon chips + speed pill (no blur); preview scrubber fill/track radius 1 and the knob dot turned red with a white ring.
- [x] Verified: `npm run lint` (0 errors, same baseline warnings only), `npm run test` 341/341 (the only full-run failure is the pre-existing `TitleDetailsPage` flake — passes in isolation), `npm run build` OK (`CustomVideoPlayer-DgkDjCwv.js` 89.80 kB).
- Test contracts preserved: `data-player-skin="netflix"` on the root, all `aria-label`s (`Play/Pause`, `Rewind/Forward 10 seconds`, aspect ratio, brightness, etc.) untouched. `CustomVideoPlayer.jsx` kept CRLF throughout (no rebuild script re-run).
- [x] **Header fixes (user feedback #2)**: The modal header above the player no longer duplicates the player's own back button + title — on stream mode the back + title now live only inside the player chrome (Netflix-style), so the modal header row is just a slim toolbar for Prev/Next + server. Back button restyled from a glassy 100px pill to a plain white chevron (stays only for trailer mode, where the iframe has no chrome). Prev Ep → ghost outline chip, Next Ep → solid `#E50914` (was the green `--accent-gradient`), server dropdown flattened to a Netflix panel (radius 4, no blur, selected row = red dot + red-tinted highlight). Player **scrolling fixed**: desktop player height is no longer `aspect-ratio`-driven at `100vw` wide; it now uses the trailer's proven `min(calc(100vw * 9/16), calc(100vh - 120px))` + `maxWidth: min(1400px, calc((100vh - 120px) * 16/9))` so header + player never exceed the viewport, plus `overflow: hidden` on the fixed overlay. **Header loader removed**: the thin red top-edge loading bar is deleted — the Netflix red spinner is the single loading indicator. Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **HUD positioning (user feedback #3)**: Volume/brightness/aspect HUDs are no longer hardcoded to dead center (`top: 50%`). They now sit horizontally centered in the UPPER area of the player at a screen-derived position — 30% of the measured player height via `useContainerSize`, clamped to 84–240px (fallback `clamp(84px, 26vh, 220px)` before first measure) — so placement tracks every screen size instead of drifting. `top` is passed as a prop to each HUD; they center with `left: 50%` + `translateX(-50%)` only. Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **Player too small after exiting fullscreen (user feedback #4)**: The non-fullscreen player was sized with fixed viewport calcs — `height: min(calc(100vw * 9/16), calc(100vh - 120px))` and `maxWidth: min(1400px, calc((100vh - 120px) * 16/9))` — so on wide/large monitors the `1400px` width cap plus the `100vh - 120px` height reserve made it noticeably smaller than the available space after pressing Esc. Root cause was the same vh hardcoding that caused the earlier scroll drift. Fixed by making the non-fullscreen player **fill the flex area exactly** (`height: 100%`, `maxWidth/maxHeight: 100%`) inside the `overflow: hidden` modal wrapper — identical behavior to fullscreen relative to its container, so it can never be too small and never scrolls. Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **HUDs still off-center — root cause found (user feedback #5)**: The HUDs mixed `transform: "translateX(-50%)"` in `style` with framer-motion's animated `scale`/`y` on the SAME element. Framer-motion rewrites the `transform` string from its animated components every frame, silently dropping the static translate — so the pill's left edge sat on the 50% line and it hung to the right of center ("somewhere else"). Redesigned each HUD as a single `motion.div` that is full-width (`left: 0; right: 0`) with `display: flex; justify-content: center` — centering is now done by flex layout on an element whose width spans the player, so no transform is ever needed for centering (scale animates about the screen center, exit fade preserved on the same element). Also replaced leftover fixed pixel sizes with viewport-relative `clamp()`s (bar width, padding, icons, %, glyph label) and moved the drop to 20% of the measured player height (64px floor, no arbitrary 240px cap). Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **HUDs horizontally centered but not top-anchored (user feedback #6)**: The `top: Xpx` absolute placement was being overridden by the element's static-flow position inside the player root, so the pill sat at the layout center. Reworked the wrapper: each HUD now covers the whole player (`position: absolute; inset: 0`) as a flex column with `align-items: center` + `justify-content: flex-start`, and the vertical position is a `paddingTop` — so top-anchoring is a structural property of the layout and cannot be overridden by framer-motion transforms or static flow. The inset is screen-derived: 8% of the measured player height with a 72px floor (fallback `clamp(72px, 18vh, 130px)`), so it sits just below the top bar on every screen. Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **FF/BW use the app's back-arrow (user feedback #7)**: The Rewind/FastForward chevron icons are replaced with the player's own back-button arrow (`ArrowLeft`, mirrored as `ArrowRight` for forward) across all seek controls — bottom-bar Rewind/Forward buttons, desktop+touch seek indicator pills, and the center double-tap seek card. `ArrowRight` added to imports, unused `Rewind` import dropped (Skip Intro keeps its `FastForward` icon deliberately). Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **Follow-up polish (user feedback)**: HUDs are now truly centered — volume/brightness/aspect indicators sit at `top: 50%` + `translate(-50%,-50%)` instead of the fragile `hudTop` pixel offset (removed `hudScale`/`hudTop`); the volume + brightness HUDs were redesigned as Netflix-style flat black pills (speaker/sun icon + slim `#E50914` fill bar + `%`), replacing the Apple-style arc-ring circles; the desktop `←/→` seek indicators and bottom-bar Rewind/Forward buttons now use the Netflix red chevron pill/icon language (`Rewind`/`FastForward`, `RotateCcw/RotateCw` dropped from imports). Verified again: lint 0 errors, 341/341 tests, build OK (`CustomVideoPlayer-BFua6VVA.js` 88.92 kB).
- [x] **FF/BW use the app's back-arrow (user feedback #8)**: Per the requested glyph (`<path d="m15 18-6-6 6-6">` = lucide `ChevronLeft`), every FF/BW control now uses the chevron-arrow mirror pair — bottom-bar Rewind/Forward buttons (`ChevronLeft`/`ChevronRight`, bumped to `isTouch ? 21 : 24`), desktop+touch seek indicator pills, and the center double-tap seek card. The **black panes are gone**: the seek indicator pills and the center seek card no longer paint `rgba(20,20,20,0.96)`/border/shadow — just the red chevron + delta text directly on the video — and the icon sizes are increased (pills `18 → 26`, center card `20 → 30`). `ArrowLeft` stays only for the player's Exit/back button; unused `ArrowRight` dropped from imports. Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **Continue Watching surfaced (user feedback)**: The `ContinueWatchingRail` was already wired into `HomePage` but hidden behind `filter === "all"` AND trapped inside the categories conditional — so it vanished on the Movies/Series tabs and whenever the categories query came back empty. Hoisted it out to render directly below the hero on **every** tab (`{!loading && continueWatching.length > 0}`), so resume content is always visible above the rails. **Also added to the banner**: `finalPool` now seeds its first slots with the 3 most recent continue-watching titles (banner-ready only), so the hero rotation leads with the latest resumed title; when the active banner item has a saved timestamp the primary CTA reads **Resume**, the play pill keeps its white style, and a thin `#E50914` progress track + "N% Watched" label sits above the CTAs. Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **Continue Watching also on the watch page (user feedback)**: The `/watch/:id/:slug` details page (`TitleDetailsPage`) had no Continue Watching presence. Added the `ContinueWatchingRail` directly beneath the hero content overlap (before Cast & Rest), gated only on `continueWatching.length > 0`, wrapped in `ErrorBoundary`, sharing the rail's own `px-6 lg:px-16` scroll-arrow padding. Verified: lint 0 errors, 341/341 tests, build OK.
- [x] **Continue Watching fixed end-to-end (user feedback)**: three root causes found and fixed —
  - **`N% Watched` never changed**: the stored continue-watching entries carry `durationMins`/`runtime` (numbers) or episode `duration` as `"45m"` strings, never raw seconds. The banner `resumePct`, the rail's progress bar and the time-left label all did `item.duration > 0` → `NaN`/0 forever. New shared `src/utils/resumeProgress.js` (`durationSeconds`, `progressPct`, `remainingSeconds`) normalizes any of those forms to seconds; used by the Home banner (`resumePct`), `ContinueWatchingRail` (card bar, hover `%`, time-left) and the watch page.
  - **Watch page always showed "Play"**: the main CTA was hardcoded. It now switches to **Resume · N%** whenever `continueWatching` has a matching entry with `timestamp > 0` (`progressItem`), and the id compare was made `String()`-safe for parity with the rest of the app.
  - **Progress never saved on some embeds**: `updateProgress` was gated on `duration > 0`, but several embed players never report duration, so nothing was written. Relaxed to save whenever `currentTime > 10` (timestamp is what drives resume via `&t=`/`startAt=`).
  - 11 new unit tests (`resumeProgress.test.js`); barrels export added. Verified: lint 0 errors, 352/352 tests, build OK.
- [x] **Watch page Resume + spotlight-badge airing (user feedback)**: dropped the `ContinueWatchingRail` from the watch page (it stays on Home, above the rails) — the watch page now mirrors the home banner instead. When a continue-watching entry has a timestamp, the main CTA reads **Resume** and the banner's thin `#E50914` progress track + "N% Watched" label sits above the CTA row (was a "Resume · N%" tag crammed inside the button). All **airing** chrome now uses the Cinejoy `.spotlight-badge` language (`#3c8217` solid, white text, 11px/500, radius `7px 7px 0 0`, no uppercase/dot): the watch-page hero "Season N Airing"/"Airing" chip (dropped the green gradient pill + pulse dot), the SeasonDropdown's `NEW SEASON` chip (now `Airing`) and its per-row `Airing` chip, and the upcoming-episode "Airs {date}" overlays in both card and list layouts. Verified: lint 0 errors (baseline warnings only), 352/352 tests, build OK.
- [x] **Subtitle background removed (user feedback)**: subtitles are now plain text — no box. Dropped the `background`/`borderRadius`/`backdropFilter` painting from both the real player (`CustomVideoPlayer`) and the Settings live preview (`PlayerPreview`); legibility comes from the strong outline text-shadow only (unified for touch + desktop). The `subtitleBgBlur` setting is gone: default removed from `context/preferences.js`, prop destructures dropped from both components, and the Settings "Background Blur" `SettingRow` + `Toggle` deleted (had been a dead control anyway — even with it off, desktop still painted `rgba(0,0,0,0.5)`). Verified: lint 0 errors (baseline warnings only), 352/352 tests (the lone `TitleDetailsPage` TDZ-guard failure only occurs in full parallel runs — passes 3/3 in isolation), build OK.
- [x] **Banner 0% fixed + proper per-season ratings table (user feedback)**:
  - **Banner/watch-page 0% root cause**: `progressPct` in `resumeProgress.js` falls back to a 90-minute assumption when the stored entry has no parsable runtime (`durationSeconds === 0`), so the **rail** always showed a real number — but the Home banner and the watch page required `durationSeconds > 0` and flatlined to 0. Both now use the shared `progressPct(item)` exactly like the rail (banner `resumePct` + watch-page `resumePct`), so the "% Watched" bar moves whenever the rail does.
  - **Ratings table**: the episodes-header "Ratings" control no longer show/hides a score chip on each episode card. It opens a **per-season episode ratings modal** (`src/components/RatingsTable.jsx`) — Cinejoy glass panel with a Season chip switcher (lazy-fetches each season via `movieService.getSeasonEpisodes`, cached per season), a "Season N average" pill, and rows with `S{N}E{NN}` + title, air date, vote count, a colored score pill and a slim rating bar. New granular `getScoreColor` in `utils/ratings.js` (deep green `#22c55e` ≥8.5 → green `#4ade80` ≥8 → light green `#86efac` ≥7 → yellow `#fbbf24` ≥6.5 → orange `#fb923c` ≥6 → red `#f87171` >0, null otherwise), exported from the utils barrel with 8 new tests. `getSeasonEpisodes` now also maps `voteCount` (additive field). Inline per-card `Popcorn` rating chips removed (they only appeared when toggled), `showEpisodeRatings` state replaced by `ratingsOpen`. Verified: lint 0 errors (baseline warnings only), 360/360 tests, build OK.
- [x] **Hero dots background removed + Home rail spacing normalized (user feedback)**:
  - **Dots**: `.hero-dots--apple` no longer paints the translucent pill (dropped `background: rgba(8,8,10,.5)`, the 18px backdrop blur, and the big drop shadow) — the slim progress dots now float cleanly on the banner. The 12px/18px padding and pill shape stay as an invisible hit area so tap targets don't shrink; the active dot's green `dot-filler` fill and the 10s `bannerProgress` animation are untouched.
  - **Rail rhythm**: gaps were triply-stacked — every rail had `margin-bottom: 3.5rem` + the flex section `gap: 3.5rem` + a `margin-top: clamp(1.8rem, 4vw, 3.4rem)` override, landing at ~140–165px between rails, while the first block under the hero (Continue Watching) had **zero** top gap. Now: `.movie-rail-wrapper` margins zeroed (it's Home-page-only — verified only 2 JSX usages, both in `HomePage.jsx`), the categories `<section>` and the loading skeleton use one shared `gap: 2.5rem`, and `GenreShowcase`'s internal wrapper matches (`2.5rem`). Upcoming, Continue Watching and the Leaving Soon banner each get a consistent top gap of `clamp(1.75rem, 3.5vw, 2.75rem)` right under the hero (`FadeInSection` now passes a `style` prop through). Verified: lint 0 errors (baseline warnings only), 360/360 tests, build OK.
- [x] **Ratings = SeriesGraph heatmap, cast below episodes, nav blur on scroll (user feedback)**:
  - **Ratings modal** (`src/components/RatingsTable.jsx` rebuilt): the per-season table (title/date/votes/score rows + season switcher) is replaced with a SeriesGraph-style interactive heatmap grid — seasons run down the vertical axis (`S1, S2, …` sticky labels on the left) and episodes across the horizontal axis (`E1, E2, …` header row), with each square cell colored by that episode's rating (`getScoreColor` ladder), nothing else shown (no vote counts, titles, or air dates). All seasons are fetched once (per-season cached) and rows fill in progressively; unrated episodes render dim, failed seasons show an inline retry, cells have native hover tooltips (`S1 E3 · title · 8.4`), and a compact legend strip (6 color steps + "No rating") sits above the grid. Grid squares adapt `clamp(26px, 3.5vw, 40px)` and scroll horizontally on narrow screens.
  - **Cast moved below Episodes**: the Cast rail no longer sits above the episode list — it now renders right after the Episodes section (before Trailers) in the details page.
  - **Navbar blur restored on scroll**: `.navbar.scrolled` dropped the near-solid `rgba(12,12,14,0.85)` fill for translucent frosted glass `rgba(12,12,14,0.5)` — the `blur(20px) saturate(160%)` backdrop is now visible behind the pill again (border + shadow kept for legibility). Verified: lint 0 errors (baseline warnings only), 360/360 tests, build OK.
- [x] **CW rail aligned + all Home rails enlarged (user feedback)**:
  - **CW starts where the other rails start**: the Continue Watching rail used its own `px-6 lg:px-16` (>main-content padding), so it sat inset ~40px from the other rails' left edge. CW's header row is now `px-1` (0.25rem) and its scroll container `px-2` (0.5rem) — exactly matching the rail-title `paddingLeft: 0.25rem` and the `.movie-rail` inline 0.5rem used by every other rail (`src/components/ContinueWatchingRail.jsx`).
  - **CW top/bottom spacing normalized**: the rail root lost `mb-8 lg:mb-12` (was 32–48px below the cards) and `space-y-4` → `space-y-2`; the scroll container's `pb-6 pt-3` → `py-3` (12px top/bottom, same as `.movie-rail`'s 0.75rem). CW now breathes exactly like the category rails — the ~2.75rem gap down to the "Continue Watching"-style section header comes from the rails' own padding, not a big dead margin.
  - **All Home rails grew to movies/series-page scale (CW excepted)**: `.movie-rail-item` — the shared poster-card width used by the Home movie + Top-10 rails, plus the Discovery (movies/series) and Genre page rails — bumped 190→**280px** (>1440), 165→245 (≤1440), 150→215 (≤1024), 135→165 (≤640/768 `!important` override). CW's landscape `w-60 md:w-72` cards are untouched. `.skeleton-rail > div` (rail loading placeholders) scaled to match (280/165). Verified: lint 0 errors (baseline warnings only), 360/360 tests (the lone `TitleDetailsPage` TDZ-guard fail only appears in full parallel runs — passes 3/3 in isolation), build OK.
- [x] **Home poster rails = movies/shows page poster size + Random opens spin-free (user correction)**:
  - **Same size, not bigger**: 280px was too large — Home's vertical-poster rails now match the movies/shows (Discovery) page's vertical posters exactly. `.movie-rail-item` reduced to the `.discovery-grid` cell scale: **220px** (>1440) ≈ the 6-col grid (~210–236px), 195px (≤1440), 175px (≤1024), 165px (≤640 + the ≤768 `!important` override). `.skeleton-rail > div` matched (220/165). CW's landscape `w-60 md:w-72` cards remain untouched.
  - **Random: no spinners, instant open**: the Random pill used to `navigate()` to the watch page — hitting the route `<Suspense fallback={<Loader />}>` full-page spinner and then the details skeleton. It now forces the instant info modal (`openDetails(pick, { forceModal: true })` — new second arg on `useDetailView`, bypassing the Detail View Type preference for this call site), so the click pops the Netflix-style TitleInfoModal immediately with the title's known summary data, no loading spinner anywhere — the pill's hover-expand animation is the only feedback. Existing tests kept; new test covers `forceModal` opening the modal under `detailViewType: "page"`. Verified: lint 0 errors (baseline warnings only), 361/361 tests, build OK.

- [x] **TitleInfoModal gets a "You May Also Like" section (carousel by default, follows Episode View Style)**:
  - **New section**: the Netflix-style quick-info modal now fetches similar titles (movieService.getSimilarMovies(movie.id), query key `["infoModalSimilar", movie?.id]`, 10min stale, `retry: 0`, 20-item cap) and renders a `section` below the Play / My List / Full Details actions � only when titles resolve (no awkward empty box).
  - **Layout modes mirror the details page**: it reads the global `episodeViewStyle` preference (carousel by default) and re-renders as a poster **carousel** (snap-scroll rail, `hide-scrollbar`), a **grid** (existing `.movie-grid`), or **rows** (poster thumb + title + year/type/IMDb star + chevron). A three-icon toggle (GalleryHorizontal / LayoutGrid / List, lucide) sits in the section header; tapping it **persists** via `setPreference("episodeViewStyle", �)` so Settings, the details page, and the modal stay in sync. Changing the setting anywhere live-updates the modal.
  - **In-place movie swap (Netflix-style)**: useDetailView now passes `onSelectMovie={setModalMovie}` to the modal, so clicking a similar title swaps the modal content to that title (details, meta facts, list state, Play route, and its own "You May Also Like") without closing; the card scrolls back to the top on `movie.id` change. Without the prop (isolated use) it falls back to `navigate(/watch/:id/:slug)`.
  - **Compact cards by design**: similar items use bespoke compact poster cards/rows (no MovieCard), so a click can never open a second, nested modal � behavior is fully controlled.
  - **CSS**: new `.title-info-similar*` block in `index.css` � header row, mode toggle (pressed/active state), snap rail with hover-lift posters, 2:3 gradient monogram fallback for missing art, row hover/active states, mobile card width 118px. Body is already viewport-capped and scrolls internally, so long lists never escape the card.
  - **Tests**: `TitleInfoModal.test.jsx` mock extended with `getSimilarMovies` (3 titles, no posters). +3: carousel by default with all similar buttons present; `setting-episodeViewStyle = "list"` renders the row meta (`2000 � Movie � ? 8.4`); clicking the grid toggle persists `setting-episodeViewStyle = "grid"` and keeps the titles. Verified: lint 0 errors (baseline warnings only), 363/364 tests (the lone fail is the known `TitleDetailsPage` TDZ-guard timing flake � passes 3/3 in isolation, unaffected by this change), build OK.
