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

## Current state (2026-11-17)

- **Player:** native HLS pipeline under `src/components/player/` (`engine/`,
  `hooks/`, `shell/`, `chrome/`), mounted by `NativePlayerView.jsx`.
- **Server roster (`src/constants/sources.js`):** Server 1 RIVO (multi-audio),
  Server 2 ZXC Valstrax, Server 3 ZXC Alatreon, and — uncommitted in the
  working tree — Server 4 NetMirror (in-manifest multi-audio). Orion, Atlas,
  Ursa, VidRack and Daedalus are retired on measured evidence.
- **Design:** the Cinejoy-teardown redesign shipped Phases 0–3 (tokens, shell,
  home, browse). Phases 4–7 remain below. No separate redesign plan doc exists;
  this file is the only task board.
- **Gates:** last recorded green run was 124–125 files / 1488–1492 passed + 2
  skipped, `npm run lint` 0 errors (warnings only), `npm run build` exit 0.
  Re-run all three before claiming any new work done.

## Open work queue (top-down)

- [ ] **IN PROGRESS — user-prioritised non-player performance pass (2026-11-17).** Start with
      shared IntersectionObserver ownership for rail reveal sections, then
      profile and refine non-player image/rendering and motion paths. Keep all
      player restructuring out of this pass; defer it until the final phase.
      Verify with the repository lint, test and build gates where execution is
      available; record any unavailable runtime/browser measurements honestly.

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
      (partial); keyboard-scrollable rails, focus order and a skip link;
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

- [ ] **Operator: deploy `docs/relay-worker.js`** to
      `streamly-proxy.nashidk1999.workers.dev` and, only if vidrack is ever
      revived, route its two `vidcore.io` POSTs through a POST-capable relay.
      Not on the current roster's path; requires the Worker owner's sign-off.

## Recently shipped (newest first)

- **2026-11-15 — Settings restyle:** flat shell, numbered index rail, grouped
  panels, inline caption preview, dead `PlayerPreview`/`SystemStatusRow`
  surfaces removed.
- **2026-11-15 — Server roster re-measured:** RIVO multi-audio leads; Valstrax
  and Alatreon keep their rows; Ursa/Orion/Atlas/Daedalus retired. NetMirror
  Server 4 is the current uncommitted addition.
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
