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



