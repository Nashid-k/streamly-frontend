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
  `api/tmdb/[...path].js` (Vercel function), proxy-first `tmdbClient` with
  direct fallback, Vite `/api/tmdb` dev proxy, `vercel.json` excludes `/api/`
  from SPA rewrite. Verified: lint 0 errors, 201 tests pass, build ok, live
  proxy returns TMDB JSON, headless Edge renders populated rails.
