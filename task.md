# Streamly — Task list

> **Agent protocol:** work this list **top-down, in order**. Check a box only
> when its work is done *and verified* (`npm run lint` + `npm run test` +
> `npm run build`, or an explicit note why a runner was unavailable). Never
> work out of order, never tick ahead.

## Done (in order)

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
