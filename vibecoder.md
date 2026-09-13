# Streamly — VibeCoder (agent rules)

> Applies to **every** agent: opencode, Claude, Codex, Antigravity, Cursor,
> freebuff, anything. `AGENTS.md` points here. Follow the boot sequence and
> workflow on **every** task, no exceptions.

## 1. Boot sequence (do this first, every session)

1. Read `task.md` (ordered checkbox list — work top-down, never skip).
2. Read `README.md` setup + `prd.md` + `architecture.md` + this file.
3. Check installs/env/deploy/keys: `package.json` scripts, `.env` vs
   `.env.example` (`VITE_TMDB_API_KEY` required, `VITE_SITE_URL` for SEO;
   `VITE_API_URL`/`VITE_STREAM_SERVICE_URL` are dead stubs), `vercel.json`
   (SPA rewrite, `npm run build` → `dist/`), hardcoded OMDb key in
   `src/api/omdbClient.js`, bundled TMDB fallback in `src/api/tmdbClient.js`.
4. Note drift: `README.md`/`GIT.md` still mention Firebase/backend — the code
   is direct-TMDB + localStorage. Trust the code + `architecture.md`.

## 2. Commands

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
   ...`, see `GIT.md`). One logical change per commit; `git add -p` for
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
- NEVER swallow errors (`catch {}`), strip the new `[Streamly]` logs, or use
  raw `console.log` for diagnostics.
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
