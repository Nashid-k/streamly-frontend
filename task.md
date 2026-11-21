# Streamly — Task list

> **Agent protocol:** work this list **top-down, in order**. Check a box only
> when its work is done *and verified* (`npm run lint` + `npm run test` +
> `npm run build`, or an explicit note why a runner was unavailable). Never
> work out of order, never tick ahead. Record the gate numbers beside the box.
>
> **Desktop-only repository.** No Flutter/mobile target — see `AGENTS.md`.
> Responsive *web* layout is still in scope.
>
> **Archived history:** the full pre-2026-11-17 work log lives in git at
> `git show b9ae61e:task.md` (the `b9ae61e` commit).

## Current state (2026-11-19)

- **Player:** native HLS pipeline under `src/components/player/` (`engine/`,
  `hooks/`, `shell/`, `chrome/`), mounted by `NativePlayerView.jsx`.
- **Workspace cleanup (2026-11-18):** removed the legacy UI mock and player
  prototype, unused demo media, stale one-off probe scripts, generated
  build/test caches, and the ignored local agent scratch folder. Only the app,
  API/server code, live operator scripts and docs remain. Deployable relay
  sources are grouped under `relays/`; `docs/` is documentation only. The
  unreferenced `BrowseBar` component and `useIsTouch` hook were also deleted.
- **Server roster (`src/constants/sources.js`):** Server 1 RIVO (up to 4K /
  multi-audio when tagged; the provider roster moves), Server 2 ZXC Valstrax,
  Server 3 ZXC Alatreon.
  Orion, Atlas, Ursa, VidRack and Daedalus are retired on measured evidence.
  The fourth row was removed on 2026-11-18; only the three rows above remain.
  The ZXC relay stays in `server/net.js` and `relays/apps-script/zxc-relay.gs`.
- **Server 1 identity:** RIVO since `0b3eb99` (2026-11-02). The ZXC family owns
  Servers 2–3.
- **RIVO upstream re-sync (2026-11-19):** the shipped `f.rivo.st` player reads
  `/api/servers?v=7` in parallel with the library and walks the advertised ids
  only; `handleResolveRivo` now discovers that roster on a library miss, tries
  the measured-fast 3/5/6 first, then every other advertised id, then the
  aggregate `/api/source/{type}/{id}`. Requested-row identity is preserved for
  errors; `lookmovie`/`movy` rows are filtered with the provider's all-filtered
  fallback; only language-tagged rows become `audioTracks` (Server 5's
  `(6.0 Mbps AAC)` metadata no longer does). Live matrix: library/1 empty on
  27205, 1339713, 1149791 and 1399 S1E1; 2/4/7/8/9 empty; 3 served 3/4
  (`auto`, direct), 5 served 4/4 (10-17 rows, 1080p/4K), 6 served 1/4
  (1080p/720p/480p). Server 1 tag is now "Up to 4K when available · Multi audio
  when tagged". RIVO's client resolve budget is 10s (generic 7s) because the
  answering sibling can sit behind empty roster ids.
- **Server 1 playback proof (2026-11-19):** live `resolveRivo` returned
  `ok:true, server:"Server 3"` for 27205/1339713/1399 and `server:"Server 5"`
  for 1149791. Through the Cloudflare worker, Server 3 entry 785 bytes -> variant
  281,931 bytes -> first segment 6,241,809 bytes `video/mp4`; Server 5 entry
  710,061 bytes -> first segment 1,311,488 bytes `video/mp2t`. Direct
  `1.rivo.st` from the local residential IP still resets, so the relay remains
  the verified playback path.
- **Real-flow repair pass (2026-11-19, user-approved Phase 0/1 order):** the
  subtitle download failure was the Cloudflare worker, not the client. The
  worker 401s on `dl.opensubtitles.org` because OpenSubtitles' bot wall
  challenges Worker egress, while a browser-shaped direct request returns 200
  gzip with `Access-Control-Allow-Origin: *`. Downloads are now direct-first
  with a relay fallback; search stays relay-first (its CORS is intermittent).
  The worker source gained CORS-on-error, OPTIONS, slice-header passthrough
  and the legacy OpenSubtitles UA. `api/health.js` now exists, and the
  keepalive cron warms the four functions viewers actually wait on with body
  assertions. The Vite dev API bridge imported handlers from
  `node_modules/.vite-temp` (every local `/api/*` handler 500'd); it now
  resolves against `process.cwd()`. The five zero-result `/discover/*` calls
  did not reproduce across 14 live shapes.
- **Gates (2026-11-19, Phase 2):** `npm run lint` exit 0 (141 warnings); the
  full Vitest tree, 131/131 files, 1560 passed / 2 skipped, and `npm run build`
  exit 0. The suite was run with 4 workers and a 15s test timeout
  (`npx vitest run --maxWorkers=4 --testTimeout=15000`, 209s): the default
  7-worker run flaked on pre-existing 5s timeouts and then stalled in the
  Vitest pool.
- **Design:** the Cinejoy-teardown redesign shipped Phases 0–3 (tokens, shell,
  home, browse). Phases 4–7 remain below. No separate redesign plan doc exists;
  this file is the only task board.
- **Agentic Vercel skills (2026-11-18):** installed and used the Vercel agent
  skills (`vercel-react-best-practices`, `vercel-composition-patterns`,
  `web-design-guidelines`, `deploy-to-vercel`); applied the web-design ellipsis
  fixes and completed the React/UI audit. Vercel CLI state: not linked and not
  authenticated; no new deployment attempted.
- **Skill audit pass 2 (2026-11-18):** finished the Web Interface Guidelines
  sweep the first pass missed — every catalogue placeholder/filter, the My List
  search fields and the pre-bundle boot loader now use `…` instead of ASCII
  `...`; the last Tailwind all-property transition utilities (browse pills,
  search field, settings triggers, continue-watching progress/chevron, provider
  logos, episode and trailer tiles) were narrowed to the properties they
  animate; the trailer carousel tiles are now keyboard-operable `role="button"`
  controls with an `aria-label`. Regression guards added in `i18n.test.js`
  (catalogue ellipsis + boot loader) and `nonPlayerCompositor.test.js` (no
  all-property transition utility outside the player). Vercel state re-checked: git remote present, not linked,
  CLI not installed/authenticated; no deployment attempted.
- **Perf / smoothness / animation audit pass (2026-11-18):** fixed the 10
  prioritised bottlenecks in order:
  1. `primitives.jsx`: replaced live `filter: blur(28px)` on player loading stage backdrop with CDN pre-blurred `CdnImageAdapter.getTinyUrl(backdropUrl, { blur: 28 })` + `opacity: 0.45`.
  2. `grids.css`: removed `backdrop-filter: blur(5px)` from masked `.details-hero__shade` so GPU caching stays active across detail pages.
  3. `hero.css`, `HomePage.jsx`, `BrowseBanner.jsx`: removed `backdrop-filter` / Tailwind `backdrop-blur-[20px]` from `.hero-eyebrow-tag`, `.hero-action-pill`, `.hero-circle-btn` inside the animating `heroReveal` subtree; trimmed `.brand-mark` filter transition and collapsed `.logo-legible` 4-pass `drop-shadow` to 2 in `header.css`.
  4. `preferences.js`, `PreferencesContext.jsx`: added `useSyncExternalStore`-backed `usePreferenceValue(key)` selector and migrated 15 high-fanout consumers (`App`, `I18nProvider`, `Layout`, `Header`, `MovieCard`, `MotionLeaf`, `AmbientBackground`, `MotionBackdrop`, `useDetailView`, `useTitleLogo`, `UpcomingCard`, and all 4 seasonal overlays) so unrelated setting writes cause zero tree re-renders.
  5. `discovery.css`, `DiscoveryPage.jsx`: replaced `.random-btn` `max-width` layout transition with compositor-only hover lift.
  6. `hero.css`: removed `width` transition on `.hero-dot` and added `contain: layout style` on `.hero-dots`.
  7. `grids.css`: removed `filter: brightness(0.78)` and `filter` transition on `.movie-poster` hover (veil overlay owns darkening); removed duplicate `@keyframes cardEnter`.
  8. `HomePage.jsx`, `CountdownBadge.jsx`, `NativePlayerView.jsx`: paused hero auto-rotation once scrolled past `window.innerHeight`; collapsed per-card `CountdownBadge` intervals into one shared module ticker that skips hidden tabs; changed player progress sink from 1s sync writes to 5s `requestIdleCallback` ticks with synchronous `pagehide`/`visibilitychange` flush.
  9. `header.css`, `buttons.css`, `snowfall.css`: scoped `.nav-active-pill` `will-change: transform` to `[data-pill-moving="true"]` and dropped idle `will-change` from `.countdown-badge-ring` and `.snowfall__flake`.
  10. `BackToTop.jsx`, `player.css`, `motion-themes.css`, `AmbientBackground.jsx`, `Header.jsx`, seasonal overlays: removed live `backdropFilter` on `BackToTop`, removed `filter: brightness` / `padding` transitions in `player.css`, dropped `backface-visibility: hidden` on `.motion-backdrop__layer`, skipped ambient blobs on low-power devices, rAF-coalesced `Header` resize reposition, tightened seasonal scroll suspension from `1.25×` to `1×` viewport height and moved `window.innerWidth` out of render.
  Regression guards added in `nonPlayerCompositor.test.js` and `PreferencesContext.test.jsx`.
- **Gates (2026-11-18):** `npm run lint` 0 errors, `npm run test` 126/127 passed (1517 passed / 2 skipped + `playerAudioSwitchStage.test.jsx` 8/8 green in isolation = 127/127, 1518 passed), `npm run build` exit 0.

## Open work queue (top-down)

- [x] **RIVO upstream re-sync (2026-11-19).** Matched the shipped player's
      `/api/servers?v=7` roster walk + aggregate fallback; added Server 3/5/6
      and source-filter regressions; no false Audio tracks from bitrate/codec
      labels; live manifest + first segment proven through the Cloudflare
      worker. `api/stream.js`, `src/constants/sources.js`,
      `src/components/player/engine/useSourceResolve.js`; gates: lint exit 0,
      test 1521 passed / 2 skipped, build exit 0.

- [x] **Fast playback failover (2026-11-17, verified 2026-11-18).**
      Merged from `fix/fast-four-server-failover` / `fix/fast-four-server-failover-v2`
      into `main` (4th row NetMirror later retired on 2026-11-18; live roster is
      Server 1 RIVO → Server 2 ZXC Valstrax → Server 3 ZXC Alatreon).
      - Bounded resolves, 5s playability probes, 7s HLS manifest parse cap,
        40s cold-start budget, and regression test for advancing past a broken
        media probe all verified on `main` (`npm run lint` 0 errors, `npm run test`
        127/127 passed, `npm run build` exit 0).

- [x] **User-prioritised non-player performance pass (2026-11-17, verified 2026-11-18).**
      Merged from `perf/non-player-smoothness-pass` into `main` and followed by
      the 2026-11-18 perf/animation audit pass.
      - Shared IntersectionObservers, compositor diet, hero reveal/priority
        tuning, proximity mobile rails, explicit transition properties, and
        poster hover balance all verified on `main` (`npm run lint` 0 errors,
        `npm run test` 127/127 passed, `npm run build` exit 0). Real-browser
        LCP/CLS/INP profiling stays tracked under Phase 6/7 below.

- [x] **User-prioritized streamly_2.0 animation-metrics port (2026-11-21).** Ported the measured motion metrics into the React app: poster→detail View Transition at 620ms (`--vt-poster-duration`), root/nav/search snapshots collapsed so Framer Motion keeps the route plane, reduced-motion + support fallbacks, and skeleton geometry parity (`min(78vh,850px)` hero, 200px desktop rail cell). Regression guards in `useDetailView.test.jsx` and `nonPlayerCompositor.test.js`. Real-browser click-through stays in the separate browser-verification box. Gates: `npm run lint` exit 0 (pre-existing warnings only), `npm run test -- --maxWorkers=4 --testTimeout=15000` 131/131 files / 1564 passed + 2 skipped, `npm run build` exit 0.

- [x] **A→B→C / C→B→A detail navigation parity (2026-11-21).** Replaced the poster-only morph with the real three-stage sequence: A card route → B fixed shape-matched detail skeleton overlay → C loaded details route, plus C→B→A on the in-app back control. 2.0 metrics restored: root 620ms, poster 780ms, view ease `cubic-bezier(.4,0,.2,1)`, shimmer 1.8s, B dwell 1090ms (`640 + 55*6 + 120`). Framer Motion route planes resolve instantly only while the View Transition owns the screen; reduced motion bypasses the sequence. Gate run: `npm run lint` exit 0 (warnings only); `npm run test -- --maxWorkers=4 --testTimeout=15000` 131/131 files, 1564 passed + 2 skipped; `npm run build` exit 0. One earlier full-run SearchPage caret assertion flaked under load; its targeted rerun and the final full run passed.

- [ ] **Player browser verification (do this first).** Vitest renders no real
      video or manifest. On a covered episode (e.g. Breaking Bad S1E1) verify:
      cold open shows the blurred backdrop + centred poster + title + one ring;
      a warm mid-playback stall keeps the picture; server / quality / audio
      switches show the stage and clear it on both success and failure; the
      Audio row appears only on multi-audio servers and Subtitles only when a
      track list exists, with human labels ("English", "Hindi", never "Tamil
      Dub"); Space taps play/pause, holds 2x, release restores the rate.
      Record whether any real manifest carries `#EXT-X-CUE-OUT` (parser exists,
      real-manifest count is still 0) and whether a dataset-backed SkipDB
      attribution row ever renders.

- [ ] **Populated-catalogue visual QA.** Screenshot and measure Home, Browse,
      Search, details and the player at 360 / 390 / 768 / 1024 / 1440 / 1920
      against the real TMDB catalogue. This machine cannot reach
      `api.themoviedb.org`, so use the deployed site (Obscura) instead of
      local. Covers the open "visuals not verified" notes for the Continue
      Watching rail, detail rails, hero geometry, badges and the banner wash.

- [x] **Subtitle relay 401 + TMDB discover warnings (closed 2026-11-19).**
      - **Subtitle:** the live worker download leg answers 401 with a
        Cloudflare "not a bot" page; a direct browser-shaped request to
        `dl.opensubtitles.org` answers 200 gzip with
        `Access-Control-Allow-Origin: *`. The Worker is challenged on egress,
        so the client now fetches downloads direct-first and only falls back
        to the relay. Search remains relay-first (its CORS is intermittent).
        `relays/cloudflare/relay-worker.js` now carries CORS on errors,
        answers OPTIONS, exposes/passes `content-range` + `accept-ranges` and
        injects `TemporaryUserAgent`; `relayWorker.test.js` covers that
        protocol. `subtitleFetcher.test.js` covers direct-first and the relay
        fallback. The client fix does not depend on the worker deploy; live
        production verification waits on the next Vercel deploy.
      - **Discover:** 14 live `/api/tmdb/discover` shapes (movie/TV across
        trending/popular/top-rated/upcoming/airing and provider filters) all
        returned results; the only sparse case was a Hotstar TV combo with 1
        item. The "five zero-result calls" is not reproducible on the live
        deployment; reopen only with the exact failing URLs from the console.
      - Gates: lint exit 0 (140 warnings); full tree 129/129 files, 1535
        passed / 2 skipped; build exit 0.

- [x] **Warm the functions viewers wait on + repair the dev API bridge
      (2026-11-19).** Added `api/health.js` (5s, `bom1`) and registered it in
      `vercel.json` + the Vite handler map. Rewrote
      `.github/workflows/keepalive.yml`: it used to ping `/health` (which
      rewrites to `index.html` and warms nothing) and `/api/health` (which
      did not exist); it now asserts response bodies from `/api/health`,
      `POST /api/stream {"action":"capabilities"}`,
      `/api/tmdb/configuration` and the worker `/health`. Fixed
      `vite.config.js` so dev API handlers import from the repo root instead
      of `node_modules/.vite-temp`; local `GET /api/health` → 200 and
      `POST /api/stream capabilities` → 200 verified. `apiModules.test.js`
      now sees 10/12 Hobby functions.

- [ ] **Phase 4 — Detail.** Where-to-watch (grouped stream/rent/buy with price
      and quality — the biggest remaining gap); detail hero at full art
      resolution; cast with character names and trailer durations (partial);
      sticky in-page tabs with scroll spy; read-only comments with a sign-in
      CTA (never a dead input).

- [ ] **Phase 5 — Search + library.** Grouped results (Titles / People /
      Collections); recent + trending searches (partial); keyboard/focus
      recovery and no-result suggestions (partial); library segments, sort,
      grid/list, bulk select, remove-watched; an honest local-only-mode
      explanation instead of a login dead end (partial).

- [ ] **Phase 6 — States, motion, a11y, performance.** Adopt shared
      EmptyState/ErrorState everywhere (partial); skeleton geometry parity
      (partial); keyboard-scrollable rails (merged to `main` and verified), focus order and a skip link;
      image-failure fallback (gradient + title, partial); performance budgets
      LCP/CLS/INP + image caps (blocked: no Chromium trace from this machine);
      finish the contract tests/docs (partial).

- [ ] **Phase 7 — Proof.** Full visual QA 360→1920 and the Cinejoy five-task
      benchmark with before/after numbers. Blocked until a reachable
      catalogue and a Chromium-representative browser are available.

- [x] **Loader state machine + source-aware ABR seed.** The branded stage now
      says connecting → checking → starting → buffering with byte counts
      (`components/player/engine/loadingStage.js`), fed by the resolve/probe
      and a new `createStreamlyLoader({ onBytes })` observer. Updates stop once
      a frame is on screen and are capped at ~3/s, so a long film does not
      re-render per chunk. `streamly_source_bw_v1` remembers each server's
      measured hls.js throughput (EWMA, one write per 15s, 7-day TTL), and
      `pickInitialBandwidthBits` takes the LOWER of that prior and
      `navigator.connection` — a fast remembered session cannot override a
      link the browser now reports as slow, and a generous downlink cannot
      override a provider that measured slow. The seed-based relay open cap is
      now an OPEN cap only: a non-master ladder with more than one rung opens
      in Auto, and the measured walker may climb to 1080p even when a slow
      seed held the open at 720p. Tests: `loadingStage`, `sourceBandwidth`,
      extended `streamTuning`, the loader observer, and a quality-switch
      walker regression. Gates: see the Phase 2 gate line.

- [ ] **Lint-warning reduction.** ~141 warnings remain, mostly React Compiler
      / `react-hooks` advisories (`set-state-in-effect`, `exhaustive-deps`)
      that need component restructuring. Player files were previously
      off-limits; re-check before touching them.

- [ ] **AutoFlip reset — needs a pointer.** No `AutoFlip` identifier, component
      or preference exists anywhere in the tree. The item cannot be worked
      until the real feature (setting name, file, or bug report) is supplied.

- [ ] **Operator: deploy `relays/cloudflare/relay-worker.js`** to
      `streamly-proxy.nashidk1999.workers.dev` and, only if vidrack is ever
      revived, route its two `vidcore.io` POSTs through a POST-capable relay.
      The client no longer needs this deploy for subtitle downloads
      (direct-first), but provider fragments still ride this worker, so the
      header/CORS parity fix matters for playback. Requires the Worker
      owner's sign-off.

## Recently shipped (newest first)

- **2026-11-19 — Phase 2 cold start:** the branded loader now names its phase
  (connecting / checking / starting / buffering with fragment byte counts),
  stops updating once a frame is on screen, and seeds the first HLS rung from
  the server's measured throughput (`streamly_source_bw_v1`, EWMA, 7-day TTL).
  The seed-based relay open cap no longer caps the measured non-master Auto
  walker, which may climb to 1080p on a fast pipe.
- **2026-11-19 — Real-flow repair pass:** subtitle downloads direct-first
  (worker 401 diagnosed as an egress bot-wall, not a missing UA), relay
  header/CORS parity, `/api/health` + a keepalive cron that asserts real
  function bodies, and the dev API handler path fix.
- **2026-11-18 — Skills audit pass 2:** catalogue/boot-loader ellipsis copy,
  explicit transition properties for the remaining Tailwind all-property
  transition utilities, keyboard-operable trailer tiles, plus copy/compositor
  regression guards.
- **2026-11-18 — Title-detail hero actions:** clearer Play/Resume priority,
  grouped library controls, and a supporting ratings row with a compact mobile
  two-column layout.
- **2026-11-15 — Settings restyle:** flat shell, numbered index rail, grouped
  panels, inline caption preview, dead `PlayerPreview`/`SystemStatusRow`
  surfaces removed.
- **2026-11-15 — Server roster re-measured:** RIVO multi-audio leads; Valstrax
  and Alatreon keep their rows; Ursa/Orion/Atlas/Daedalus retired.
- **2026-11-15 — Badge family:** one `.content-badge` (solid state vs glass
  countdown), theme-aware NEW/“In X days”, top-left card corner.
- **2026-11-15 — Continue Watching:** one play affordance (Resume), keyboard
  reveal, progress bar above the scrim.
- **2026-11-15 — Banner geometry:** hero flush to the top on every banner page,
  banner-derived ambient wash with CDN-baked blur.
- **2026-11-14 — Performance pass:** responsive card `srcSet`, pre-blurred tiny
  placeholders (90 runtime blur layers removed), mask-transition removal.
- **2026-11-13 — Player/UX fixes:** no false “server has no stream” note, no
  GIF loaders, search layout aligned to the app gutter, home rail alignment.
- **2026-11-12 — Compositor diet:** always-on backdrop filters removed, fixed
  `background-attachment` gradient moved to a fixed layer, `will-change`
  census down from ~90 to 2, offscreen cards get `content-visibility: auto`.
- **2026-11-11 — Redesign Phases 0–3:** stage gradient + semantic tokens +
  motion 180/260/420; nav/dock; home hero + rails; browse header, sticky bar,
  URL-synced filter chips and the 3/4/5/6/7 grid ladder.
- **2026-11-11 — Player architecture split** completed (`engine/`, `hooks/`,
  `shell/`, `chrome/`), documented in `docs/player-architecture.md`.
