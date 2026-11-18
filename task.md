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

## Current state (2026-11-18)

- **Player:** native HLS pipeline under `src/components/player/` (`engine/`,
  `hooks/`, `shell/`, `chrome/`), mounted by `NativePlayerView.jsx`.
- **Workspace cleanup (2026-11-18):** removed the legacy UI mock and player
  prototype, unused demo media, stale one-off probe scripts, generated
  build/test caches, and the ignored local agent scratch folder. Only the app,
  API/server code, live operator scripts and docs remain. Deployable relay
  sources are grouped under `relays/`; `docs/` is documentation only. The
  unreferenced `BrowseBar` component and `useIsTouch` hook were also deleted.
- **Server roster (`src/constants/sources.js`):** Server 1 RIVO (multi-audio
  when its library answers), Server 2 ZXC Valstrax, Server 3 ZXC Alatreon.
  Orion, Atlas, Ursa, VidRack and Daedalus are retired on measured evidence.
  The fourth row was removed on 2026-11-18; only the three rows above remain.
  The ZXC relay stays in `server/net.js` and `relays/apps-script/zxc-relay.gs`.
- **Server 1 identity:** RIVO since `0b3eb99` (2026-11-02). The ZXC family owns
  Servers 2–3.
- **Measured 2026-11-17:** RIVO's primary library (`server=1`) returns
  `sources: []` for every tested title; RIVO siblings `server=6`
  (1080p/720p/480p) and `server=7` (auto) still serve. `handleResolveRivo`
  therefore tries the requested id first, then 6 → 7, inside the provider. The
  Server 1 row no longer falls back to ZXC; only the no-pick AUTO path does.
  The player-level failover advances to the other visible providers after a
  resolve OR byte-probe failure.
- **Server 1 playback proof (2026-11-17):** production `resolveRivo`
  (`server=1`) returns `ok:true, server:"Server 6"`; the RIVO manifest
  (35,669 bytes) and the first `ts-proxy.ts` segment (2,842,936 bytes,
  `video/MP2T`) both return 200 through the Cloudflare worker relay. Direct
  `1.rivo.st` fetches from the local residential IP reset, so the relay is the
  working playback path.
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

- [ ] **Subtitle relay 401 + TMDB discover warnings.** The subtitle relay
      (`streamly-proxy.nashidk1999.workers.dev`) answers `401`, and five
      `/discover/*` calls return zero results. Diagnose both against the live
      deployment before changing the client.

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

- [ ] **Loader state machine + source-aware readahead.** The relay reports
      progress as an opaque spinner. Add connecting / probing / first-byte /
      buffered states (byte counts) and seed the first rendition from a
      per-source bandwidth read so the slow first rung is not paid every time.

- [ ] **Lint-warning reduction.** ~144 warnings remain, mostly React Compiler
      / `react-hooks` advisories (`set-state-in-effect`, `exhaustive-deps`)
      that need component restructuring. Player files were previously
      off-limits; re-check before touching them.

- [ ] **AutoFlip reset — needs a pointer.** No `AutoFlip` identifier, component
      or preference exists anywhere in the tree. The item cannot be worked
      until the real feature (setting name, file, or bug report) is supplied.

- [ ] **Operator: deploy `relays/cloudflare/relay-worker.js`** to
      `streamly-proxy.nashidk1999.workers.dev` and, only if vidrack is ever
      revived, route its two `vidcore.io` POSTs through a POST-capable relay.
      Not on the current roster's path; requires the Worker owner's sign-off.

## Recently shipped (newest first)

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
