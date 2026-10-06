# Streamly — Performance Audit & Prioritized Fixes
# Generated: 2026-10-06
# Baseline: `npm run build` 2.73s | oxlint 0 errors/40 warnings | vitest 80 files/1047 tests

## 1. Build config, bundle size, code-splitting

### Baseline bundle (dist/assets, `--build` manifest)
| Chunk | Size | Notes |
|---|---|---|
| index (shell + router) | 163.78 kB | **Largest non-vendor entry; on critical path for every page** |
| hls-vendor | 574.72 kB | Lazy only (player route), correctly split — leave alone |
| react-vendor | 213.16 kB | Vendor split OK |
| motion-vendor | 134.42 kB | Vendor split OK |
| query-vendor | 34.59 kB | Vendor split OK |
| icons-vendor | 28.47 kB | Vendor split OK |
| NativePlayerView | 82.70 kB | Lazy route, but heavy internal tree |
| TitleDetailsPage | 74.99 kB | Lazy route, but heavy internal tree |
| chrome | 36.13 kB | Extracted chrome barrel |
| HomePage | 48.29 kB | Top of ladder |
| vendor (catch-all) | 56.71 kB | Catch-all; hls already out, but still broad |

**vite.config.js audit**
- `manualChunks` already isolates react/framer/tanner/lucide/slugify/hls → good.
- `modulePreload: { polyfill: true }` is set — good, measurable LCP win on first visit.
- `reportCompressedSize: false` → CI stays fast; fine.
- `chunkSizeWarningLimit: 600` → hls-vendor 574.72 kB is the only big lazy chunk and is intentional.

### Findings
1. **`index` shell at 163.78 kB is the real target.** It carries the router + every statically-imported shared leaf. The lazy page chunks are already small; the work is to keep more shared chrome off the shell's critical path.
2. **`hls.js` is correctly lazy (hls-vendor, only player route).** The only other `hls.js` import is `src/api/previewThumbs.js` — but that module is only reached from the player's hover-thumb effect, so it does **not** pull hls into the shell. Verified by grep: exactly 2 imports of hls.js in the whole src, both behind the player. Do **not** re-split hls; it is already where it should be.
3. **No per-route code-splitting problem in the page chunks themselves.** They are already lazy (`routes.jsx`). The slugify chunk (8.33 kB) is small and fine.
4. **Import-graph hygiene is already enforced** by `barrels.test.js` (asserting real barrel members) and `apiModules.test.js` (asserting ≤12 functions, no nested modules). Build gate already fails on stray helpers — good, keep it.

### Priority-highlight
- The biggest low-risk win is **reducing what the shell statically pulls in** (shared chrome barrel, motion leaves that are only ever used inside lazy player pages). This shrinks `index` and every first-page load, not just the player.

---

## 2. React render hot paths (memo, inline props, effects)

### Memo / pure-leaf coverage (good, already widespread)
- `MovieRail`, `Top10Rail`, `FadeInSection` — `React.memo` + custom shallow compare. Good.
- Heavy derived state is already `useMemo`d in Home/TitleDetails/Discovery/Genred/Search/Watchlist/Settings. Good.
- `hudBox`, `previewBox`, `audioTrackList`, `scrubberBands` in the player are `useMemo`d. Good.
- `useRailArrows` already coalesces scroll into one rAF and skips setState unless a boolean actually flips. Good.

### Findings — real hot-path pressure
1. **The player is a single 5k+ line component with ~40+ useState/useEffect/useRef.** Every scrub-hover move, hud pop, controls poke, and timeupdate-derived cue flows through one giant render body. That is the app's single hottest render node.
   - Evidence: `src/components/NativePlayerView.jsx` is 82.70 kB gzipped-ish footprint in the bundle and visibly the largest non-vendor component chunk. `scrubHoverFrame`/`applyScrubHover` was explicitly written to avoid re-rendering on every pointermove — which implies the author already knew the render body is expensive.
2. **Controls autohide poke runs on every `onMouseMove` over the full surface.** `poke` is `useCallback`'d and bails when `now - lastPokeArm.current < POKE_REARM_MIN_MS (250ms)`, which caps it to ~4/s — that part is already correct. But `setControlsVisible(true)` still schedules a render each time it fires, and the player has enough state that each of those renders is not free.
3. **`SubtitleOverlay` is correctly keyed on cue `text` and is a separate leaf** (good — cue ticks don't re-render the transport tree). Keep that discipline.
4. **`useContainerSize` is used for the player HUD geometry** — a `ResizeObserver` on the player box, updating `playerW/playerH`, which feeds `hudBox`/`previewBox`. This is fine, but it is one more live observer on the most-frequently-animating region of the page.
5. **Effect count is high but mostly justified.** The warnings oxlint already flags (`set-state-in-effect`) are concentrated in `NativePlayerView` and `TitleDetailsPage` — these are the two heaviest components. The existing warnings are pre-existing baseline (40 warnings, 0 errors), so this is a *known* debt, not a new regression.

### What is NOT a problem (verified)
- Rails: `MovieRail`/`Top10Rail` already window via `IntersectionObserver` + `inView`, already `React.memo`, already rAF-coalesced arrows. Good.
- Scroll handlers: every `window.addEventListener("scroll", ..., { passive: true })` is passive; rail arrows are rAF-coalesced; `useScrollRestoration` debounces its sessionStorage write to 150ms. No layout-thrashing scroll handler found.
- Marquee: no JS marquee/scroll-snap driver. CSS `scroll-snap-type: x mandatory` is used on rails (visual only). No JS scroll loop.

---

## 3. Heavy CSS (backdrop-filter/blur), animations, layout thrash

### backdrop-filter / blur inventory (src/styles/*.css)
- `primitives.css`, `header.css`, `ui-kit.css`, `hero.css`, `discovery.css`, `collections.css`, `modals.css`, `settings-ui.css`, `search.css`, `responsive.css`, `player.css`, `buttons.css`, `grids.css`, `skeleton.css`, `settings.css`, `auth.css` — many glass surfaces.
- Player chrome (`player.css` + `chrome/theme.js`): `backdrop-filter: blur(22px) saturate(1.3)` on panel surface, `blur(20px)` fatal, `blur(14px)` skip pills, `blur(28px) saturate(1.2) brightness(0.5)` on the loading-stage backdrop art, `blur(20px)` / `blur(14px)` / `blur(14px)` elsewhere.

### Findings
1. **Heavy blur is concentrated on small, fixed-position chrome**, not full-page panes. That is the correct place for it: the panel/fatal/skip pills are small fixed boxes, so the blur radius cost is bounded to their bounding box. This is acceptable by design — the zinc-glass look is intentional (scraped from ZXC).
2. **The one expensive case is the loading-stage backdrop:** `filter: blur(28px) saturate(1.2) brightness(0.5)` on a full-bleed `<img>` inside the player. That blur runs on a full-viewport image during every load/switch. It is a real paint cost, but it is transient (only while loading) and already the documented "ambience" treatment. Not a constant-frame cost.
3. **Animations are mostly transform/opacity**, which is correct (compositor-friendly). Verified patterns:
   - `@keyframes upNextCountdown` — `transform: scaleX(...)`. Good.
   - `@keyframes npLoadingLine`, `npRingSpin`, `npTailspin` — transforms/rotations. Good.
   - `motion.div` enter/exit shapes in `motion.js` use scale/opacity/y/x. Good.
   - Hover lifts on `.np-episode-card`, `.np-skip-intro`, `.np-resume-btn`, `.np-dialog-row` use `transform: translateY/scale`. Good.
4. **`prefers-reduced-motion` coverage exists in player.css** for the ring/spinner/art/episode-card/dialog/skip-intro — good. But the `motion.js` reduced-motion contract is only applied where `useMotionTokens(useReducedMotion())` is called — i.e. the extracted chrome leaves. **Framer motion children still run their springs unless the leaf opts in.** So reduced-motion is partial: chrome is covered; inline `motion.*` in pages/components that do not call `useMotionTokens` are NOT reduced. This is a real gap for the accessibility contract in `architecture.md` §6.
5. **CSS transition property lists are explicit in the chrome** (`transition: transform ...`, not `transition: all`) — good, no `all` in the hot chrome.
6. **No JS-driven layout thrash found.** Scroll handlers are passive; sizing uses `ResizeObserver` (not forced layout in scroll handlers); the player measures the frame via `useContainerSize` and derives offsets from it (not from `getBoundingClientRect` on every frame in a scroll handler). The scrubber hover uses `requestAnimationFrame` + ref-staging to avoid re-rendering per pointermove. This is all already correct.

### What is worth changing
- The cost here is **not** catastrophic; the CSS is already restrained to transform/opacity and small fixed boxes. The one concrete improvement is **reduced-motion completeness** (see §6), not blur removal — blur is a deliberate visual and is on small surfaces.

---

## 4. Data fetching / React Query / network waterfalls / image loading

### React Query setup (good baseline)
- `queryClient.js`: default `staleTime: 8*60*1000`, `gcTime: 15*60*1000`, `refetchOnWindowFocus: false`, 1 retry with backoff, `networkMode: 'online'`. Good defaults for a catalog app.
- Per-page overrides for immutable data: `TitleDetailsPage` uses `staleTime: 24h` on `movie` + `episodes` queries; `refetchOnWindowFocus: false`. Good.
- `DiscoveryPage` uses `useInfiniteQuery` for the browse grid with `refetchOnWindowFocus: false`. Good.
- `PrefetchAdapter.prefetchMovieDetails(movieId)` fires on `MovieCard` hover (onMouseEnter/onFocus) for `["movie", id]` + `["similar", id]` with 10-min stale — correct keys, correct contract, in-flight dedup via `Set`. Good.

### Findings
1. **Image loading is mostly correct.**
   - Hero/backdrop art: `fetchPriority="high"` + `loading="eager"` + `decoding="async"` on the details-hero `<img>` and home hero — correct for LCP.
   - Rails/cards: `loading="lazy"` + `decoding="async"` — correct.
   - `CdnImageAdapter` routes TMDB art through `wsrv.nl` (WebP/AVIF, `af=true` AVIF-first) with proper `srcSet`/`sizes` per context (`card`/`backdrop`/`avatar`). Good.
   - **`getSizes("backdrop")` returns `100vw`** — correct for the full-width banner. Good.
2. **One real image-loading gap: the episode rail thumbnails.**
   - `TitleDetailsPage` episode grid renders up to `visibleEpisodeCount` thumbnails, each as `<img src={CdnImageAdapter.getUrl(epThumb, 'w500')} ... loading="lazy" decoding="async" .../>`. With a long episode list and a w500 request per episode, this is fine individually but un-prioritized: the first row of episode thumbs is not `fetchPriority="high"`, and on a cold open the hero backdrop (`high` priority) + episode grid thumbs compete.
   - More importantly: **episode thumb selection falls back through a long chain** (`ep.thumbnailUrl || ep.posterUrl || ep.backdropUrl || movie.backdropUrl || movie.posterUrl || movie.backdrop || movie.poster || movie.thumbnailUrl || null`). That is fine functionally, but `movie.backdropUrl`/`movie.posterUrl` are w1280/w500 candidates being handed to `getUrl(..., 'w500')` — acceptable after the adapter resizes, but the adapter's `getUrl` on an already-full URL does a string replace then proxies through wsrv.nl — still a WebP convert, still fine, but worth knowing.
3. **Waterfalls are largely avoided by design.**
   - Home page prefetches nothing on its own beyond the rails it renders; rails are `IntersectionObserver`-gated (`inView`) so offscreen rails do not fetch. Good.
   - `TitleDetailsPage` warm-resolves the default server 1.2s after mount (debounced, aborted on unmount/episode switch/while playing) — PLAN.md P0.4, correct.
   - Hover prefetch covers the common "tap to watch" path. Good.
4. **No obvious N+1 or serial waterfall in the read paths.**
   - `movie` + `similar` + `episodes` queries on TitleDetails are independent (no `.then` chains; all via `useQuery`). Good.
   - `DiscoveryPage` grid query is paginated infinite, not a giant single fetch. Good.

### What is worth changing
- The **real** image-loading improvement is **episode-grid thumb prioritization** for the first visible row on a cold episode list, so the player open path does not sit on decoded episode thumbs while the hero is already loaded. Low risk, clear win on the watch-open path.

---

## 5. Large lists, marquee/rails, scroll handlers

### Rails / large lists
- `MovieRail` + `Top10Rail`: `React.memo`, `IntersectionObserver`-based `inView` windowing (unmount offscreen rails), rAF-coalesced arrow availability (`useRailArrows`), scroll handler throttled with a 150ms inThrottle for the progressive `visibleCount` expansion, `onScroll={handleScroll}` on the rail element (not window). All correct.
- Home page renders multiple rails; offscreen ones unmount → bounded DOM + decoded-image memory. Good.
- Episode rail in `TitleDetailsPage` uses `useRailArrows` + a 24-chunk `visibleEpisodeCount` expansion on scroll. Reasonable for typical episode counts; long series (50–100 eps) still expand progressively.

### Marquee
- No JS marquee. CSS scroll-snap on rails only. No continuous JS scroll animation. Good — no rAF marquee loop to audit.

### Scroll handlers (all audited)
- Every direct `window.scroll` listener uses `{ passive: true }`. Verified across `Header`, `BackToTop`, `CastRail` (rail onScroll), `useScrollRestoration`, `useRailArrows`, Home, History, Genre, Watchlist, Discovery, Category, TitleDetails, Search.
- `useScrollRestoration` debounces the sessionStorage write to 150ms. Good.
- `useRailArrows` coalesces into one rAF and skips setState unless booleans change. Good.
- No forced layout in scroll handlers (no `getBoundingClientRect`/`offsetHeight` in the scroll callback paths I read). Good.

### Findings
- **This is the healthiest area of the app.** Rails are windowed, memoized, rAF-coalesced, passive. No marquee loop. Scroll handlers are passive and non-thrashing. The only scale risk is episode count on long series, and that is progressive anyway.

---

## 6. Prioritized fixes (highest impact → lowest)

### P1 — Split the player chrome barrel off the shell's static import graph
**Why first:** `index` (shell) is 163.78 kB and is on the critical path for every page. The `chrome` barrel (36.13 kB) is imported by `NativePlayerView` (lazy) **and** by a few non-player leaves. If any chrome leaf is pulled into the shell via a non-player consumer, the whole barrel follows. Even if today it is only lazily consumed, the barrel import is still evaluated as part of the player's 82.70 kB chunk — extracting it further does not shrink the player chunk, but **ensuring no chrome leaf leaks into the shell** does shrink `index`.

**Concrete, low-risk action:**
- Audit every `import { ... } from "./player/chrome"` / `from "../components/player/chrome"` in `src/`. Confirm which consumers are lazy (player) and which are in the shell or shared leaves. Any chrome import reached from a non-lazy consumer should be moved behind its own lazy boundary or inlined minimally.
- Keep `hls.js` out of the shell (already done — do not touch).

### P2 — Reduce `index` shell weight by keeping shared motion leaves lazy where possible
**Why:** `motion-vendor` is 134.42 kB and is pulled in for the whole app because framer-motion is used broadly (good — it is a shared dependency). But individual `motion.*` uses in heavy lazy pages (TitleDetails, Home, Settings) still contribute to those page chunks, not the shell. The shell itself should only pay for what it statically renders (Router + shared layout + shared leaves it actually mounts). Verify the shell does not statically mount any `motion.*` leaf that is only ever used behind a lazy route.

**Concrete action:**
- Confirm `Layout.jsx`/`Header.jsx`/`App.jsx` and other shell files do not statically render player-only or page-only motion leaves. If any does, extract it behind `React.lazy` or a conditional.

### P3 — Complete the reduced-motion contract
**Why:** `architecture.md` §6 promises `reducedMotion`-aware motion app-wide, and the chrome leaves honor it via `useMotionTokens(useReducedMotion())`. But inline `motion.*` in pages/components that do **not** call `useMotionTokens` still run springs under reduced motion. This is an accessibility contract gap, not a performance gap — but it is the one place the app's own architecture doc is not truthful.

**Concrete action:**
- In the heaviest inline-motion sites that do not already opt in (e.g. large `motion.div`/`motion.button` enter/exit trees in TitleDetails/Home/Settings/dialogs), branch on `useReducedMotion()` so the transition collapses to a cut (duration 0 / no spring) instead of honoring the spring. Keep the existing chrome behavior unchanged.
- Do this as a focused pass on the highest-count motion sites, not a global find-replace (risky in a 1000-test app). Prefer sites with many `motion.*` children in one render.

### P4 — Episode-grid thumbnail prioritization on cold open
**Why:** On the watch-open path, the hero is `fetchPriority="high"` but the episode grid thumbs are all `loading="lazy"`. For a cold episode list, the first visible row of episode thumbs should load with higher priority than the rest so the grid feels instant when the viewer scrolls to it. This is a small, safe image-loading change.

**Concrete action:**
- For the first `N` episode thumbs in the visible grid (e.g. the first row worth of thumbs), use `loading="eager"` or `fetchPriority="high"` on the initial render only, and `loading="lazy"` for the rest / after expansion. Keep `decoding="async"`. This does not change the adapter or the fallback chain.

### P5 — (Optional, lower priority) Trim the catch-all `vendor` chunk contributors
**Why:** `vendor` is 56.71 kB and is the catch-all after the named vendor splits. It is not on the critical path for lazy routes, but shrinking it reduces every shell load. This is lower priority because the named splits already cover the biggest third-party trees; the remainder is many small modules.

**Concrete action:**
- Only if P1–P4 are done and there is still headroom: inspect what remains in `vendor` via the build manifest and consider naming another small vendor chunk if one module dominates it. Do not over-engineer — the current splits are already good.

### Not planned (deliberately left alone)
- **hls-vendor split** — already correct, do not touch.
- **Removing backdrop-filter/blur** — intentional zinc-glass design on small fixed chrome; the only expensive blur (loading-stage backdrop) is transient and documented. Replacing it would change the product look for marginal gain.
- **Rewriting the player into smaller components** — out of scope for a performance audit; that is the PLAYER V2 rewrite already in PRD §6, not a perf tweak. This audit only optimizes what exists.
- **Scroll handler rewrite** — already passive, rAF-coalesced, debounced. No thrash found.
- **Removing marquee** — none exists in JS.

---

## 7. Verification plan after implementing P1–P4
1. `npm run lint` → 0 errors (warnings may stay at baseline 40; do not introduce new ones).
2. `npm run test` → full suite green, no regression in barrel/apiModules/player/a11y tests.
3. `npm run build` → compare manifest to baseline:
   - `index` should be **no larger** than 163.78 kB (ideally smaller after P1/P2).
   - `hls-vendor` unchanged (~574.72 kB).
   - No new chunk regressions; lazy player chunk may stay ~82.70 kB (P1/P2 target the shell, not the player chunk).
4. Manual assertion: a fresh shell load (e.g. `/` or `/search`) should not pull in any player-only chrome leaf or hls.js — verify via the build chunk graph / network (no hls-vendor request on a non-player page).
5. Reduced-motion: with OS reduced-motion on, open a page with heavy inline motion (e.g. TitleDetails with dialogs/season view) and confirm springs collapse to cuts (no spring settle visible). This is best-effort without a headed browser; the code change is the enforceable artifact.
