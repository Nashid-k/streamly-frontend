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
