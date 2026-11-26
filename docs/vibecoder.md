# Streamly — VibeCoder (agent rules)

> Applies to **every** agent: opencode, Claude, Codex, Antigravity, Cursor,
> freebuff, anything. `AGENTS.md` points here. Follow the boot sequence and
> workflow on **every** task, no exceptions.

## 1. Boot sequence (do this first, every session)

1. Read `task.md` (ordered checkbox list — work top-down, never skip).
2. Read `README.md` setup + `prd.md` + `architecture.md` + this file.
   For any UI/UX, styling, animation, navigation, skeleton, or player-shell
   task, read root `streamly_2.0.html` itself before editing. It is the
   **actual target UI**, not a reference; §6 below is the enforced checklist.
3. Check installs/env/deploy/keys: `package.json` scripts, `.env` vs
   `.env.example` (`VITE_TMDB_API_KEY` required, `VITE_SITE_URL` for SEO;
   `VITE_API_URL`/`VITE_STREAM_SERVICE_URL` are dead stubs), `vercel.json`
   (SPA rewrite, `npm run build` → `dist/`), hardcoded OMDb key in
   `src/api/omdbClient.js`, bundled TMDB fallback in `src/api/tmdbClient.js`.
4. Note drift: `README.md` still mentions Firebase/backend — the code
   is direct-TMDB + localStorage. Trust the code + `architecture.md`.

## 2. Commands

### Web (`/`)

```bash
npm install            # install
cp .env.example .env   # then set VITE_TMDB_API_KEY (https://www.themoviedb.org/settings/api)
npm run dev            # dev → http://localhost:3001 (vite.config.js; README's :5173 is stale)
npm run build          # production build → dist/
npm run preview        # preview production build
npm run lint           # oxlint
npm run test           # vitest run (config: vitest.config.js)
```

Debug: open the browser console — every data failure logs as
`[Streamly][scope] message + context`. Append `?debug=1` (or set
`localStorage["streamly:debug"]="1"`) for verbose `console.debug` output.

### Mobile: none (removed 2026-10-01)

The Flutter `mobile/` app was deleted outright. There is no Dart toolchain,
no APK target, and no Dart gate to run or report. `npm run lint`,
`npm run test`, and `npm run build` are the only gates. Responsive *web*
layout is still in scope.

## 3. Coding rules

1. **Data paths never fail silently.** Route all console output through
   `src/utils/debugLogger.js` (`logError`/`logWarn`/`logInfo`/`logDebug`,
   `reportQueryError`, `logEmptyData`). No `console.*` directly in `src/`,
   no bare `catch {}` on fetches/queries/storage.
2. **Every React Query gets error + empty handling**: capture `error`, call
   `reportQueryError(scope, key, error, ctx)` in `useEffect`, and
   `logEmptyData` when a loaded query yields nothing renderable.
3. **Keep the `normalizeResult` contract** (`id`, `tmdbId`, `title`,
   `posterUrl`, `backdropUrl`, `imdbRating`, `year`, `isSeries`, `type`,
   `genres`, `mediaType`, `popularity`). Never rename fields — rails, details,
    search, and person pages all depend on them.
4. **Query keys are the cache contract**: `featuredMovies`, `categories`,
   `top10`, `trending-this-week`, `airing-this-week`, `popular`, `topRated`,
   `nowPlaying`, `movie:<id>`, `similar:<id>`, `episodes:<id>:<season>`,
   `person:<id>`, `genre-showcase:<rail>`, `titleLogo:<id>`,
   `realRatings:<id>`, `titleTrailer:<id>`, `search:<q>`,
   `genre-search:<g>`, `recommendations:<id>`. Prefetch keys must match
   consumer keys exactly (`prefetchAdapter.js`).
5. **Small, conventional commits** (`feat|fix|style|perf|refactor|chore|docs|test:
   ...`). One logical change per commit; `git add -p` for
   `CustomVideoPlayer.jsx` / `TitleDetailsPage.jsx` / `index.css`.
6. **Verify before finishing**: `npm run lint`, `npm run test`, `npm run build`.
    No JS runtime here? Say so explicitly instead of claiming a pass.

## 4. NEVER

- NEVER commit `.env`, `node_modules/`, `dist/`, or any secret/key (TMDB key
  stays in `.env`/Vercel dashboard; never log `api_key` — `debugLogger`
  redacts it).
- NEVER revive `src/api/env.js` backend URLs, Firebase, or a new server/DB
  without an explicit user order (see `prd.md` §4).
- NEVER add a new `VITE_*` var without updating `.env.example` + `vercel.json`
  dashboard notes + `architecture.md` §2.
- NEVER rename `normalizeResult` fields, query keys, localStorage keys, or
  route paths without migrating every consumer.
- NEVER bundle the stream resolver, a scraper, or a secret into a mobile
  binary, and never point an app at a hardcoded API origin.
- NEVER swallow errors (`catch {}`), strip the new `[Streamly]` logs, or use
  raw `console.log` for diagnostics.
- NEVER treat `streamly_2.0.html` as optional inspiration, approximate its
  timings, or substitute a 1.0-era visual/motion choice for its behaviour.
- NEVER change the canonical 2.0 metric tokens, View Transition/snapshot
  sequence, shared-token naming, place restoration, or skeleton-dwell formula
  without an explicit user order plus a new `task.md` record.
- NEVER import the HTML demo's Lumen data, `lumen*` localStorage keys, or
  hardcoded TMDB key into the React app — only the UI/UX and motion contract
  transfers. `streamly_2.0.html` is untracked and its line 492 holds a real
  key: read it locally, never stage or commit it.
- NEVER lazy-load above-the-fold hero art or block rails on below-fold data.
- NEVER force-push, skip hooks, or commit with vague messages (`update`, `fix
  stuff`).

## 5. Workflow (1-2-3-4-5)

1. **Read** — `task.md` → check the topmost unchecked box; read the files it
   names (whole files, not guesses).
2. **Plan** — state the failing/empty data path, the query key + service
   method, and the log line that will prove the fix. Update `task.md` to
   `in_progress`.
3. **Edit** — minimal diff, keep patterns (`reportQueryError`/`logEmptyData`,
   `asArray` guards, skeleton → data → fallback states). One concern per edit.
4. **Verify** — `npm run lint` + `npm run test` + `npm run build`; paste the
   new console line(s) that prove the state is observable. If a runner is
   unavailable, say so.
5. **Record** — tick the `task.md` box, append follow-ups at the bottom in
   order, keep `prd.md`/`architecture.md` truthful if contracts changed.

## 6. Canonical Streamly 2.0 UI/UX + motion contract

User order (2026-11-25): root `streamly_2.0.html` is the **actual target UI**,
not a reference. For every visual, interaction, navigation, skeleton, or motion
decision, reproduce that file. If it conflicts with an older doc or a 1.0-era
implementation, the file wins for appearance/motion; frozen data contracts stay
frozen. The HTML demo's data/localStorage/TMDB key are **not** part of the
contract.

### 6.1 Exact metric tokens — `streamly_2.0.html:278-280`

These values are mandatory, not approximate. An existing alias may keep its
React name, but it must resolve to the 2.0 value.

| Token | Exact value | Role |
|---|---|---|
| `--dur-1` / `--dur-state` | `220ms` | colour/opacity/state |
| `--dur-2` / `--dur-tap` | `300ms` | press + tap feedback |
| `--dur-3` / `--dur-reveal` | `400ms` | overlays/hero fade/hover reveals |
| `--dur-4` / `--dur-content` | `640ms` | content/staggered reveals |
| `--dur-view` | `620ms` | root View Transition old/new |
| `--dur-poster` | `780ms` | shared poster group |
| `--dur-nav` | `520ms` | pill slide + `navwave` + sheen |
| `--stagger` | `55ms` | list/hero/episode reveal step, capped at 6 items |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)` | View Transition ease |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | ordinary UI ease (`:127`) |
| `--sp` | `cubic-bezier(.34,1.25,.64,1)` | spring/pill/poster overshoot |

Derived timings: skeleton shimmer `1.8s`; hero auto-rotation `9s`
(`:739`); hero backdrop Ken Burns `32s` (`:151`); detail skeleton dwell
`640 + 55*6 + 120 = 1090ms` (`:663`); search input debounce `250ms` (`:628`);
search/entrance follow-up `640 + 55*3 + extra` (`:497`); player HUD idle
`2600ms` (`:713`).

### 6.2 Route + View Transition choreography

- `vt(f)` (`streamly_2.0.html:629-632`) is the only route-change owner when
  `document.startViewTransition` exists and reduced motion is off. It queues
  on `navT.finished`, calls `vtCleanup(seq)` on completion, and falls back to a
  direct update for reduced motion / unsupported browsers / thrown transitions.
- Root old/new snapshots use `--dur-view` + `--ease-in-out` (`:416-417`); the
  shared poster group uses `--dur-poster` (`:418`). Nav and search are named
  snapshots (`navbar`, `searchbar`, `:245`) so their children must not be
  re-named into competing transitions.
- Shared source identity is `${scope}:${index}:${id}` in `data-vt`
  (`:512`, `:735`). The React app's equivalent is
  `data-detail-token="<rail-or-scope>:<index>:<movie.id>"`, morphing between
  Home's `2:3` card `.po`, Phase B `.detail-transition-poster` (`2:3` `.po.sk`
  inside `.dp.sk-detail`), and Phase C `.dp .dh > .po` (`2:3` portrait poster;
  with `.details-hero__art img.hero-bg` retained only as a legacy fallback).
- `setPosterSource(origin, fallback)` / `clearPosterNames()` /
  `flushPosterNames()` (`:537-542`) mean: clear all names, name exactly one
  source, force a style/layout flush before the snapshot, clean up after
  `finished`.
- `rememberPlace` / `applyRoute` (`:536`, `:584-601`) must preserve page
  `scrollY`, all rail `scrollLeft`s and in-view flags, the source rail override,
  hero index `heroFi`, search query, and focus (`preventScroll`). The React
  reverse additionally waits for A's cards to mount before the final callback,
  and `useScrollRestoration` / `HomeRail` stand down via
  `window.__streamlyDetailScrollRestored` + `getSavedDetailRailScroll`.
- A→B→C / C→B→A stays: card route → `2:3` `.dp.sk-detail` skeleton overlay
  (`1090ms`) → loaded `.dp` details, then the matching reverse on `.dp .lk`
  Back and browser Back. Reduced motion bypasses the sequence.

### 6.3 Visible UI inventory to match

- **Shell:** iOS-like glass surfaces, Inter/SF font stack, system light/dark
  theme with accent hue `--h`, bottom pill nav with sliding `#pill`,
  `navwave`/sheen (`:306-322`, `:741-756`), top-right expanding search
  (`:33`, `:387`).
- **Hero:** `.hbd` backdrop, five featured items, dots, 9s rotation, `Read more`
  after three lines, lazy logo swap, preloaded neighbours, swap fade (`:150-155`,
  `:733-740`).
- **Cards/rails:** `2/3` posters by default; the wide lead rail uses the
  canonical `.cw.w > .po.wd` 16:9 backdrop card (`:168-170`, `:556`) and
  Continue Watching opts into that shape. Radius 16, `data-vt`, pointer 3D tilt
  (`±7deg`, `--s:1.04`, `--ty:-3px`), quick-play `.qp`, add-list `.qa`,
  hover-after-320ms `play-ready`, rail arrows `.ar`, edge fades `--fl/--fr`,
  6-card reveal cap (`:65-78`, `:171-182`, `:388-392`, `:557-561`, `:726-730`).
- **Skeletons:** scene palettes home `212/265`, movies `20/350`, series
  `265/320`, list `165/210`; shimmer, `sk-hero` line stagger, rail/grid/detail
  skeletons (`:332-345`, `:519-528`).
- **Details:** `.dh` grid (portrait poster + chips/title/tagline/actions),
  `.dg` overview/facts/cast, full-bleed backdrop `.bdp`, branded strip, season
  tabs and `EP_LIMIT=8` with Show less / Show N more (`:563-578`, `:564-569`).
- **Player:** fade/idle HUD, modal inert chrome, focus trap, Escape/Space/arrow
  keys, ARIA seek bar, blurred-art/title loader. No spring or scroll-jacking
  motion (`:678-724`).

### 6.4 Verification for UI/motion work

Before ticking a `task.md` box: compare against `streamly_2.0.html`, prove the
reduced-motion path, prove source-name cleanup (`vt-src`/`vt-none` equivalents),
run `npm run lint`, `npm run test`, `npm run build`, and record the numbers.
For browser verification use **Obscura**, never headless Chrome. If the browser
lacks native View Transitions, state that the controller/DOM/geometry were
verified with a shim and that native compositor CSS remains covered by Vitest.
