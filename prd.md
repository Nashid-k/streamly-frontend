# Streamly — PRD (Product Requirements Document)

> Single source of product truth for every agent (opencode, Claude, Codex,
> Antigravity, Cursor, freebuff, anything). Read this + `architecture.md` +
> `vibecoder.md` + `task.md` before touching code.

## 1. What this is

**Streamly** is a Netflix-style browse-and-watch product: the **web SPA**
(React + Vite, deployed to Vercel).

- **Catalog:** TMDB (same-origin `/api/tmdb` proxy, direct fallback),
  ratings enriched via OMDb, images via TMDB CDN, playback through the
  native player over third-party stream sources.
- **Personal state** (My List, Continue Watching, history, preferences)
  lives in **localStorage**.

The web build reads from the deployed serverless functions under the shared
`normalizeResult` domain contract; it owns no database.

## 2. For whom

- **Viewers** browsing movies / TV on desktop + mobile who want one fast,
  dark, cinematic catalog with hero rotation, rails, search, and resume.
- **Maintainers/agents** who must keep every data failure visible in the
  browser console (see `src/utils/debugLogger.js` — every empty rail, failed
  query, broken image, and storage error is logged with a `[Streamly][scope]`
  prefix).

## 3. Top 5 features (ranked — build/protect in this order)

1. **Home discovery (hero + rails)** — `src/pages/HomePage.jsx`. Trending hero
   rotation, Top 10, Trending/Airing/Popular/Top Rated/Now Playing rails,
   genre showcase, Continue Watching first. If this is empty, nothing else
   matters.
2. **Title details + playback** — `src/pages/TitleDetailsPage.jsx` +
   `src/components/NativePlayerView.jsx` (being replaced by the PLAYER V2
   rewrite, §6). Metadata, cast, seasons/episodes, trailer curation, 8 iframe
   servers (never auto-switched — the viewer's Server menu choice is final; a
   dead source shows a Retry / pick-another fallback), resume.
3. **Search + genre/category browsing** — `SearchPage`, `GenrePage`,
   `CategoryPage`, `DiscoveryRails`. Debounced live search, relevance ranking,
   did-you-mean, filters/sorts.
4. **My List + Continue Watching (local)** — `src/hooks/useUserData.js`,
   `AuthContext`. Instant, offline-capable, cross-tab synced. This is the
   retention loop.
5. **Real ratings (TMDB + IMDb + RT)** — `ratingService` + `omdbClient` +
   `RatingsCluster`, cached 24h in localStorage (OMDb quota: 1,000 req/day).
6. **Watch Party (web)** — in-player invite-by-code rooms with synced playback
   (host-controlled) and room chat. Polls the same-origin `/api/watchParty`
   function every 2s; rooms live 24h-idle in the existing MongoDB. Guests
   follow the host within ~2s with drift correction; a `?party=CODE` share
   link joins mid-party with the full transcript caught up.

## 4. ~~Mobile app (`mobile/` — Flutter)~~ REMOVED 2026-10-01

The Flutter app was deleted outright at the user's decision. This repo is
**desktop-only**: no Dart, no APK, no mobile target. Do not recreate it or
report a Dart gate as passed. The player gaps it had (no subtitle picker, no
audio picker) are superseded by PLAYER V2, which is web-only.

## 5. Explicitly NOT building

- ❌ Any backend, auth server, or database (Firebase/backend references in
  `README.md` are **stale docs** — the web code uses localStorage).
- ❌ Uploads, user accounts, social, comments, or payments. (Watch Party chat
   is the one deliberate exception: ephemeral, room-scoped text only, no
   profiles, no history beyond the 24h room TTL.)
- ❌ New stream extraction / proxy infrastructure (`src/api/env.js` is a stub;
  stream-service calls intentionally resolve to `''`). The app reuses the
  existing Cloudflare worker and the deployed resolver — it adds no new
  provider or extraction path.
- ❌ Design-system rewrite (dark cinematic theme + Tailwind v4 tokens stay).
- ❌ Features that break Vercel static deploy (`npm run build` → `dist/`).
- ❌ Shipping the stream resolver inside a mobile binary, or any bundled secret
  that isn't already a public read token.
- ❌ **Any mobile target** (user decision, 2026-10-01). The Flutter app was
  deleted; responsive *web* layout is in scope, a native app is not.

## 6. PLAYER V2 scope — what changes for the viewer

`src/components/NativePlayerView.jsx` is 5,279 lines and grew by accretion: a
Netflix-HUD vocabulary, spring animations, and decorative arcs layered onto a
player whose control surface never got a clean design. The rewrite replaces the
**UI**, not the capability set. Non-negotiable: **no feature regression.** Every
current capability is carried over deliberately; the rewrite earns the right to
delete code by passing the Phase 6 parity checklist, not by assuming parity.

This does **not** contradict §5's "no design-system rewrite": the dark
cinematic theme and Tailwind v4 tokens stay, and every colour in the new player
is a token (`--accent-primary` lime) rather than a new palette. What changes is
one component's internal structure.

**Kept:** every source/server option, resume, prev/next episode across seasons,
subtitle language + font/size/colour, audio/dub + delay sync, quality, PiP,
hold-2x, Playwright-free volume/brightness HUDs, seek/buffer/preview scrubbing,
watch-party host authority, and the blurred-art loader (centre logo, horizontal
bar).

**Added** — the four gaps the audit confirmed were missing, not just clumsy:
- **Picture-in-Picture** for native streams.
- **Touch volume** — vertical swipe on the right zone, which currently only
  seeks.
- **In-player shortcut reference** (the `Shift+?` modal is blocked while a
  player is open).
- **Chapter / credit ticks** on the scrubber.

**Also fixed while in there** (real bugs found in the audit, not redesign):
volume/aspect/rate were stored in a second key space that Settings never wrote;
`seekTime` was ignored (`SKIP_SECONDS = 10` hardcoded in 15 places); the
subtitle font/size/colour settings were honoured by the Settings preview but
ignored by playback; `Back-to-top` and `Shift+?` were permanently broken during
playback because they detected the player via iframes.

**Deliberately dropped:** fun-fact rotator, the fake "Original" audio badge,
hand-rolled "Netflix" arcs, and spring/scroll-jacking motion.

**Rollout:** new player is the default; `VITE_PLAYER_LEGACY` +
`localStorage["streamly-player-legacy"]` can only force the *old* player back,
and both are deleted in Phase 6 — see `architecture.md` §2b.
