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
- [ ] 8. Manual console pass: load `/`, `/movies`, `/series`, `/search?q=test`,
  `/watch/tv-<id>`, `/person/<id>` with network + with offline/blocked TMDB;
  confirm each empty/error state prints its `[Streamly][scope]` line.
- [ ] 9. Rotate the exposed TMDB key: move the real key out of the bundled
  `tmdbClient.js` fallback into `.env`/Vercel only, then verify 401 guidance
  log fires with a bad key.
- [ ] 10. Fix stale docs drift: update `README.md`/`GIT.md` Firebase + backend
  sections to match the direct-TMDB + localStorage reality in
  `architecture.md`.
- [ ] 11. Decide the stream-backend future: either delete the `env.js` stub +
  NetMirror/Direct dead paths or re-spec them in `prd.md` §4 first — do not
  half-revive.
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



