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
   `src/components/CustomVideoPlayer.jsx`. Metadata, cast, seasons/episodes,
   trailer curation, 8 iframe servers (never auto-switched — the viewer's
   Server menu choice is final; a dead source shows a Retry / pick-another
   fallback), resume.
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

## 4. Mobile app (`mobile/` — Flutter)

`streamly_mobile`: ExoPlayer playback (`better_player_plus`), TMDB catalogue,
multi-server resolution (Vercel `/api/source` + headless-WebView embed
sniffer + visible WebView fallback), `provider` + `shared_preferences`
state. Full docs in `mobile/README.md`. Known player gaps (no subtitle
fetch/picker, no audio picker) are tracked in `task.md`.

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
