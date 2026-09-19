# Streamly — PRD (Product Requirements Document)

> Single source of product truth for every agent (opencode, Claude, Codex,
> Antigravity, Cursor, freebuff, anything). Read this + `architecture.md` +
> `vibecoder.md` + `task.md` before touching code.

## 1. What this is

**Streamly** is a Netflix-style browse-and-watch frontend (React SPA). It has
**no active backend** — all catalog data comes **directly from TMDB in the
browser**, ratings are enriched via OMDb, images via TMDB CDN, and playback
goes through third-party iframe stream servers. Personal state (My List,
Continue Watching, history, preferences) lives in **localStorage**.

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
   trailer curation, 7 iframe servers with failover, resume.
3. **Search + genre/category browsing** — `SearchPage`, `GenrePage`,
   `CategoryPage`, `DiscoveryRails`. Debounced live search, relevance ranking,
   did-you-mean, filters/sorts.
4. **My List + Continue Watching (local)** — `src/hooks/useUserData.js`,
   `AuthContext`. Instant, offline-capable, cross-tab synced. This is the
   retention loop.
5. **Real ratings (TMDB + IMDb + RT)** — `ratingService` + `omdbClient` +
   `RatingsCluster`, cached 24h in localStorage (OMDb quota: 1,000 req/day).

## 4. Explicitly NOT building

- ❌ Any backend, auth server, or database (Firebase/backend references in
  `README.md` are **stale docs** — code uses localStorage only).
- ❌ Uploads, user accounts, social, comments, or payments.
- ❌ New stream extraction / proxy infrastructure (`src/api/env.js` is a stub;
  stream-service calls intentionally resolve to `''`).
- ❌ Design-system rewrite (dark cinematic theme + Tailwind v4 tokens stay).
- ❌ Features that break Vercel static deploy (`npm run build` → `dist/`).
