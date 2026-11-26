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

- [x] **Hero-shape morph and exact rail return (2026-11-21).** Reworked B into a full-width hero skeleton so B→C matches 1.0's `.details-hero__art img.hero-bg` instead of 2.0's portrait detail poster. Captured a stable `<rail>:<index>:<movie.id>` token plus page `scrollY` and every rail's `scrollLeft`; reverse now waits for A's cards to mount before the final View Transition callback restores geometry and names the exact source card. Added browser-Back interception and made `useScrollRestoration` / `MovieRail` stand down during the controlled reverse. Gates: `npm run lint` exit 0 (141 pre-existing warnings), `npm run test -- --maxWorkers=4 --testTimeout=15000` 131/131 files, 1564 passed + 2 skipped (174.16s), `npm run build` exit 0 (2.98s). Obscura CDP click-through (in-app back and browser Back separately): B and C both `1280×720`; forward token `Trending Movies:1:movie-1300968`; both reverse paths restored `scrollY=480`, `railScrollLeft=240`, and source rect `(68,330)` exactly. Obscura's headless build lacks native `document.startViewTransition`, so the browser run shimmed that API to verify controller order, DOM state, and geometry; native compositor CSS remains guarded by Vitest.

- [x] **A→B→C / C→B→A motion physics & skeleton parity refine (2026-11-22).** Fixed root cause of 28px vertical jump on B→C and C→B by scoping in-place cross-dissolve to stage C (`streamly-dissolve-out` 220ms, `streamly-dissolve-in` 320ms) and scale-return to stage A (`streamly-return-in` 420ms). Aligned `MovieDetailsSkeleton.jsx` directly to `TitleDetailsPage.jsx`'s `.details-hero` and `.details-hero__body.details-gutter` (exact `--details-hero-lift` parity; removed fake topbar). Eliminated secondary loader flash on card click by suppressing global spinner on `/watch` routes (`Loader.jsx`) and holding `MovieDetailsSkeleton` until full TMDB query arrives (`isLoading || isPlaceholderData`). Cleared 10 React Compiler render-body ref mutations across player and dialog components. Implemented Where-to-Watch provider rail (`WhereToWatch.jsx`, `detail.js`, `TitleDetailsPage.jsx`). Gates: `npm run lint` 0 errors, `npx vitest run --maxWorkers=4 --testTimeout=15000` 467/467 suites, 1568/1568 passed (2 skipped), `npm run build` exit 0.

- [x] **Canonical streamly_2.0 UI/UX + motion prompt lock (2026-11-25).** User order: root `streamly_2.0.html` is the **actual target UI**, not a design reference. `AGENTS.md:9` carries the universal rule plus exact tokens; `docs/vibecoder.md:116` is the enforced checklist (tokens, View Transition/snapshot sequence, source tokens, place restoration, hero/card/skeleton/detail/player inventory, Obscura verification); `docs/prd.md:136` frames the visual/motion migration and supersedes the old “dark cinematic theme stays” wording; `docs/architecture.md:846` freezes the contract without touching data/query/storage/route contracts. Added NEVER rules against importing Lumen demo data and against staging the untracked HTML (hardcoded TMDB key at line 492). Also cleared the two pre-existing motion/skeleton assertion drifts that blocked the gates: `HomePage.jsx` now uses `PRESS_SCALE.ROW`, and `nonPlayerCompositor.test.js` reads `.skeleton-rail-card` in its `min-width:1024px` block. Gates: `npm run lint` exit 0 (131 pre-existing warnings), `npm run test -- --maxWorkers=4 --testTimeout=15000` 132/132 files / 1568 passed + 2 skipped (241.44s), `npm run build` exit 0 (2.25s). One earlier full run flaked on a 10s `HomePage.test.jsx` timeout under parallel load; the isolated rerun and final full run passed.

- [x] **Home/details performance pass (2026-11-26).** Removed mount-time detail/similar prefetch from every `HomeCard` and moved it to hover/focus intent; capped idle route speculation to discovery/search/details while keeping full hover/focus warm coverage; staged hero backdrops to active+next now and the rest at idle; reused the normalized `imdbId` so ratings skip a redundant `/external_ids` leg; reused the frozen `["episodes", id, season]` cache in the ratings heatmap with a 3-worker fetch pool and logged failures; capped TMDB regional/discover/enrichment sweeps to 4 concurrent requests; stabilized `openDetails` through a location ref; cached header glass rects and rAF-coalesced pointer-glow writes; removed episode key churn from fetch state and the 60s service-worker poll; restored the canonical transform-based hero-dot progress. No data/query/storage/route contracts changed. Gates: `npm run lint` exit 0 (140 pre-existing warnings), `npm run test -- --maxWorkers=4 --testTimeout=15000` 135/135 files / 1589 passed + 2 skipped (204.60s), `npm run build` exit 0 (2.32s).

## User-prioritised Streamly 2.0 UI build (2026-11-25)

> User order: start building the canonical UI now, in phases. This supersedes
> the two verification boxes below for sequencing only — they stay open and
> move behind the 2.0 build. `streamly_2.0.html` is the target; data/query/
> storage/route contracts remain frozen. Do not work a later phase early.

- [x] **Phase 0: token + motion guard foundation (2026-11-25).** Published the exact 2.0 vocabulary additively in `src/styles/tokens.css` (`--dur-1..4`, `--dur-view/poster/nav`, `--dur-state/tap/reveal/content`, `--stagger`, `--ease-in-out`, `--sp`, shimmer `1.8s`, hero rotation `9s`, Ken Burns `32s`) and `src/constants/motion.js` (`DURATION_2`, `EASE_2`). Legacy `--duration-*`/`DURATION` scales remain until each phase migrates its call sites. Added `motion.test.js` guards for every exact value and the `1090ms` dwell formula; no component visuals changed yet. Gates: `npm run lint` exit 0 (131 pre-existing warnings), `npm run test -- --maxWorkers=4 --testTimeout=15000` 132/132 files / 1571 passed + 2 skipped (210.02s), `npm run build` exit 0 (2.56s).

- [x] **Phase 1: shell, nav and search (2026-11-25).** Re-skinned the global
      shell to the 2.0 glass vocabulary: `src/app/Header.jsx` now owns the
      back/brand cluster, expanding `.sq`, top-right utility capsule/account
      menu, Ctrl+K and 250ms URL-synced search; `src/app/MobileBottomNav.jsx`
      renders the persistent `#tb` pill with measured `offsetLeft/offsetWidth`
      geometry, `navwave`/sheen, scroll compaction and reduced-motion bypass.
      `src/styles/header.css` carries the surfaces, safe-area margins, `520ms`
      nav glide and mobile brand/search overlap handling; conflicting legacy
      nav/search rules were removed from `responsive.css`, `search.css`,
      `discovery.css` and `settings.css`. `SearchPage` defers `autoFocus` while
      the shell owns focus, `Layout` guards pathname focus changes, and
      `NotificationCenter` clamps its portal to the viewport. Routes, frozen
      `NAV_ITEMS`, query keys, storage keys and hidden `.tb`/`.sq` View
      Transition snapshots are unchanged. Obscura CDP verification covered
      390/768/1280/1440 widths, light/dark shell, search open/closed,
      desktop `-324px` utility shift, mobile utility/brand hiding, nav click
      and `.sc` scroll compaction, account menu and notification panel; search
      commit/focus/loading-ring was checked at 390/768. The local `/api/tmdb`
      proxy still returns 502, so catalogue shots used Obscura's direct TMDB
      fallback; its headless build reports no interpolation, so CSS/JS contracts
      and state attributes were verified instead of inferred motion. Gates:
      `npm run lint` exit 0 (130 pre-existing warnings),
      `npm run test -- --maxWorkers=4 --testTimeout=15000` 132/132 files /
      1571 passed + 2 skipped (250.24s), `npm run build` exit 0 (2.73s).

- [x] **Phase 2: home hero, cards, rails and skeletons (2026-11-25).** Matched
      `.hbd/.hx/.dots` with five featured titles, a re-armable `9s` rotation,
      token-guarded logo swap, all-neighbour preload and three-line Read more;
      converted posters to `2/3` `.po` with `qp/qa`, rAF-coalesced pointer tilt,
      `play-ready` after `320ms`, `.ar` rail arrows and `--fl/--fr` edge fades;
      applied scene-coloured skeletons with `1.8s` shimmer. Live and skeleton
      heroes now use canonical `min(84vh,760px)` geometry at every width, and
      the five-dot capsule stays visible/horizontal at 390 and 768 where the
      old banner hid it. Frozen `data-detail-token` shape and A→B→C contract
      are unchanged. Added source assertions in `src/__tests__/motion.test.js`
      for the hero, cards, rails and skeletons. Gates: `npm run lint` exit 0
      (133 pre-existing warnings), `npm run test -- --maxWorkers=4
      --testTimeout=15000` 132/132 files / 1575 passed + 2 skipped (230.08s),
      `npm run build` exit 0 (3.94s). Obscura CDP sweep at 390/768/1280/1440
      on the rebuilt bundle (`index-TgytDMcv.js`, `index-CP7bzSmI.css`):
      hero heights 709/760/672/756px = `min(84vh,760px)`, five dots in a
      140×40 capsule at every width, zero horizontal overflow, 30–60
      `.movie-card.cd` with matching `data-detail-token` counts and one
      `.qp`/`.qa` per card, poster ratios 0.665–0.667, `--fl:0px`/`--fr:16px`
      with `.at-start` on the leading rail. Cold state showed
      `.hero.sk-hero .hbd.sk.sk-hbd`, `.sk-dots` with five `.sk-dot`, six
      `.skeleton-movie-rail.sh.in` and 48 `.skeleton-moviecard.cw.sk-cw`. A dot
      click changed the token from `hero:home:0:…` to
      `hero:home:2:movie-1300968`. Local `/api/tmdb` still answers 502, so the
      populated shots used the app's direct-TMDB fallback; the headless
      browser reports no-hover, so hover-only overlay opacity was verified by
      the CSS/source guards rather than inferred from the screenshot. The home
      card was then corrected from a poster-only grey block to the full 2.0
      structure: `.home-rails-section .sk-cw .sk-ctitle/.sk-cmeta` now use
      `display:block`, and `MovieRail` opts `MovieCard` into the below-poster
      `.movie-info` row with 14px title / 13px meta. Other surfaces keep their
      legacy artwork-only skeleton and hover-only metadata. Obscura CDP at
      1440px confirmed a 342px skeleton card with 164×14 title / 96×12 meta
      shimmer rows, plus 60 loaded home cards each with a 41px `.movie-info`
      row (20px title, 19px meta). Frozen `data-detail-token` shape is
      unchanged. User closeup `Screenshot 2026-11-25 171929.png` (739×651)
      independently showed legible below-poster rows on two rails:
      `Avengers: Doomsday` / `2026` and `The Hunger Games: Su…` / `7.8 2026`.
      Final gates on the rebuilt bundle (`index-zOAqZxkM.js`,
      `index-BdvMghxr.css`): `npm run lint` exit 0 (133 pre-existing
      warnings), `npm run test -- --maxWorkers=4 --testTimeout=15000`
      132/132 files / 1575 passed + 2 skipped (221.52s), `npm run build` exit 0
      (11.59s).

      **Final cascade/geometry closeout (2026-11-25).** The legacy
      `hero.css` rule `.hero.sk-hero { min-height: 0 !important }` was still
      flattening the cold skeleton while the populated hero used the 2.0
      value; the mobile `min-height` overrides in `home.css` also departed
      from the canonical metric. `src/styles/home.css` now pins
      `min-height: min(84vh, 760px) !important` on both the hero and
      `sk-hero` and drops the 820/560px height overrides. The apparent
      `padding: 0px` in the first Obscura probe was a shorthand-serialisation
      artifact, not a cascade defect: longhands read
      `120px / 51.2px / 40px / 51.2px` at 1280 and the equivalent fluid
      `--gutter` values at 390/768/1440. Updated the source guard in
      `src/__tests__/motion.test.js` to the exact `!important` declaration.
      Final Obscura CDP sweep at 390/768/1280/1440 (900px viewport): cold and
      populated hero `min-height` 756px at every width, five skeleton dots in
      the cold state, five active-capable dots with `Avengers: Doomsday` active
      in the populated state, hidden `img.hero-bg` `opacity: 0`, 32 cold
      skeleton cards, 45–61 populated cards across five rails, and no
      horizontal overflow. Final gates on the shipped bundle
      (`index-D6hdR83_.js`, `index-SYsqO_Zx.css`): `npm run lint` exit 0
      (136 pre-existing warnings, 0 errors), `npm run test --
      --maxWorkers=4 --testTimeout=15000` 132/132 files / 1575 passed + 2
      skipped (197.59s), `npm run build` exit 0 (11.85s). One SearchPage caret
      assertion flaked under parallel load; its isolated rerun was 20/20 green
      and the final full run passed.

      **Browse-by-provider follow-up (2026-11-25).** User order: replace the
      poster-shaped provider cards with proper animated brand icons, and stop
      the "Movies on X" / "TV Series on X" rails leaving only a dropdown when
      their catalogue is empty or failing. `BrowseByProviderRail.jsx` now emits
      a `.provider-icon-grid` of 17 glass icon tiles with loaded TMDB brand
      marks plus monogram fallbacks; each icon still routes to `/provider/:id`.
      `home.css` adds `homeProviderIconIn` with the canonical `55ms` stagger cap
      and `homeRailMenuIn` for the rail picker, with both `prefers-reduced-motion`
      and `html[data-reduce-motion="true"]` bypasses. `HomeRail.jsx` renders the
      first five cards before intersection and accepts an `empty` slot, so a
      mounted selector never owns an unexplained blank shelf. `ProviderRail.jsx`
      keeps the picker mounted and renders a `.rail-empty` status with a retry
      button when discover returns no titles or errors; `en.js` gained
      `providerEmptyMovies`/`providerEmptyShows`/`providerError`. No
      `normalizeResult`, query key, Streamly storage key, route, detail token or
      Phase 3–5 surface changed. Targeted tests: 4 files / 84 tests green.
      Obscura CDP at 390/1280 confirmed 17 icons, 17 loaded logos, zero
      `.po/.cw/.provider-tile` artifacts, 18px icon corners, six picker options,
      no horizontal overflow, and both CSSOM animation declarations; the
      stealth headless runtime disables CSS animation globally (synthetic probe
      proved it), so keyframes/reduced-motion remain source-guarded in Vitest.
      At 1280 both provider rails filled with 15 cards; at 390, where the local
      TMDB bridge timed out, the rails showed the visible retry state instead
      of bare dropdowns. Final gates on bundle `index-sBpg3SFQ.js` /
      `index-DDwpBMqZ.css`: `npm run lint` exit 0 (136 pre-existing warnings,
      0 errors), `npm run test -- --maxWorkers=4 --testTimeout=15000` 132/132
      files / 1575 passed + 2 skipped (209.63s), `npm run build` exit 0
      (4.24s).

- [x] **Phase 3: details, detail skeleton, and 2:3 A→B→C / C→B→A transitions (2026-11-26).**
      Restyled `TitleDetailsPage.jsx` to 2.0 `.dp` (`src/styles/detail.css`, `.bdp`,
      `.lk`, `.dh` with `2:3` `.po`, `.dtx`, `.chips`, `.dt`, `.tag`, `.btns`,
      `.brands`, `.dg` Overview + circular Cast + frosted `<dl class="facts glass">`,
      `.eps-s` `.stabs` + `.eps` with `EP_LIMIT = 8` Show more/less and 2.0 `.dp-shelves`).
      Migrated `MovieDetailsSkeleton.jsx` to `.dp.sk-detail` (`detail-transition-poster`,
      `1090ms` dwell at `55ms` stagger) and aligned `motion-themes.css` +
      `useDetailView.jsx` (`capturePlace`/`restorePlace`, `HomeRail` `getSavedDetailRailScroll`)
      for true `2:3` `.po` ↔ `.detail-transition-poster` ↔ `.dh > .po` morphing on
      A→B→C and C→B→A (`.lk` back and browser Back). Gates: `npm run lint` exit 0
      (140 warnings, 0 errors), `npx vitest run --maxWorkers=4 --testTimeout=15000`
      133/133 files (`1577 passed | 2 skipped`), `npm run build` exit 0 (`3.50s`).

      **Trailers/Where-to-Watch removal, A→B→C / C→B→A artwork continuity & 2.0 loader swap (2026-11-26).**
      Removed the Trailers grid and `<WhereToWatch>` block from `TitleDetailsPage.jsx`
      and cleaned up unused `.dp` CSS in `detail.css`. Deep-fixed Home ↔ Details
      View Transitions: added `.hbd` / `heroIndex` hero transition support (`HomePage.jsx`,
      `useDetailView.jsx`), preserved source poster + scene backdrop artwork and
      `--a/--b` scene hues inside `MovieDetailsSkeleton.jsx` across phase B, flushed
      `viewTransitionName` styles synchronously and cleared hover tilt prior to capture,
      shared `posterCache.js` across `HomeCard.jsx`, `HeroTitleLogo.jsx`, `HomePage.jsx`,
      and `TitleDetailsPage.jsx` so back navigation restores crisp cached artwork and
      wordmarks on frame 0 without resetting scroll or replaying `.hero`/`.hx`/card/provider
      stagger (`.home-page--restored` + paused exit rotation/scroll parallax), aligned
      `translateZ(0)` in `REDUCED_ROUTE_VARIANTS`, and pinned
      `.header-brand-cluster`/`.shell-utility-cluster` alongside `.tb`/`.sq` in
      `motion-themes.css`. Replaced `index.html` `#initial-loader`, `App.jsx`
      `<Loader variant="global" />`, `RouteFallback.jsx`, `RatingsTable.jsx`,
      `LanguageSwitchOverlay.jsx`, embed/trailer waits, and neon play-ring visuals
      (`StreamlyLoader.jsx`/`streamly-loader.css`) with 2.0 `.sk` skeletal surfaces
      and subtle monochrome frosted indicators matching `streamly_2.0.html`.

- [ ] **Phase 4: player shell and HUD.** Migrate only presentation to the 2.0
      fade/idle HUD, modal inert chrome, focus trap, ARIA seek bar, and
      `2600ms` idle hide. Keep engine, source resolution, audio/subtitle/quality
      capability logic unchanged.

- [ ] **Phase 5: View Transition choreography + final QA.** Lock the `vt(f)`
      queue, source-name cleanup, `620ms` root / `780ms` poster / eases,
      A→B→C and reverse, scroll/rail/source/hero/focus restoration, and
      reduced-motion bypass. Verify every surface against `streamly_2.0.html`
      with Obscura, then run final gates and record results here.

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

- [ ] **Phase 4 — Detail.** Where-to-watch (grouped stream/rent/buy with provider
      logos and JustWatch attribution — shipped 2026-11-22); detail hero at full art
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

- [ ] **Lint-warning reduction.** Reduced from 141 to 131 warnings (cleared
      React Compiler render-body ref mutations across player HUD/chrome,
      embed players, dialog a11y, and confirm dialogs). Remaining warnings are
      mostly React Compiler / `react-hooks` advisories (`set-state-in-effect`,
      `exhaustive-deps`) in page and rail components.

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
