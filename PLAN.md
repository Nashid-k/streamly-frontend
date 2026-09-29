# Streamly — The Plan

> **Status: P0.1–P0.4, P1.1, P1.2 and P1.4 are SHIPPED** (see `task.md` for
> the gate record). P1.3 (mobile parity) remains deferred — it needs a
> machine with the Flutter SDK to run `flutter analyze`/`test` honestly.
> P2 items stay trigger-gated.

> **One line:** a read-heavy, near-zero-write, byte-relay product designed for
> **hundreds of daily viewers (~20–30 concurrent peak)** that must feel
> **instant on every cached surface**, can never lose **the repo and
> signed-in cloud-sync state**, and runs on **$0/month forever**.

Every item below is chosen against the four systems answers in
`architecture.md` §Scale: (1) read-heavy ~100–1000:1, (2) free-tier capacity
math, (3) the durability pyramid, (4) the tiered latency contract. Nothing
here adds a paid service. Nothing here breaks a frozen contract
(`architecture.md` §2–3) without an explicit migration order.

---

## 0. The four non-negotiables (why every item exists)

| Pillar | Commitment | Enforced today by |
|---|---|---|
| **Shape** | Read-heavy; DB writes are a rounding error | Guests never call the backend; catalogue is read-through TMDB; video bytes ride Cloudflare, not Mongo |
| **Scale** | ~hundreds DAU / 20–30 concurrent, by free-tier math | Worker 100k req/day is the first ceiling; Vercel bandwidth second; Mongo connections third |
| **Durability** | Repo + signed-in sync state are sacred; parties are disposable | GitHub durability; Atlas replica sets; 24h party TTL; 30-day tombstones |
| **Latency** | Instant where cached, honest where physics forbids | React Query SWR, optimistic UI commits, playlist memo, probe parking, 60MB worker slices |

**Kill-switch doctrine:** every provider already has a documented fallback
ladder (worker → Vercel function → honest fatal). When a free tier dies, the
app degrades instead of breaking. Any new feature must ship with its ladder.

---

## P0 — Now (this week, each ≤ half a day)

### P0.1 The guest-durability gap (our only real "can never lose" hole) — ✅ SHIPPED
Guests' My List / progress / settings live **only in `localStorage`** — one
"Clear site data" and years of state is gone. Signed-in users get Mongo
durability; guests get nothing.
- [x] Add **Settings → Account → Export/Import device data** (a single JSON
  download of all `aios_*`/`setting-*` keys, import restores + merges). Pure
  client, zero backend, closes the gap for everyone who won't sign in.
- [x] Log the export event via `debugLogger` so adoption is observable.

### P0.2 Signed-in sync state deserves a backup — ✅ SHIPPED
Atlas replica sets protect against failure, not against mistakes. Sync state
is the one irreplaceable dataset.
- [x] GitHub Actions **weekly snapshot job** (free minutes): a scheduled
  workflow exports the `streamly` DB to NDJSON and uploads it as a private
  artifact (90-day retention). Cheap, versioned, off-cluster insurance.
- [x] Document the restore procedure (in the workflow header + script).

### P0.3 Make the numbers observable (stop estimating, start knowing) — ✅ SHIPPED
We reason about "100k worker req/day" and "~30 concurrent" with no counter.
- [x] A tiny `usage` ledger in Mongo: per-day counters written by the existing
  `rateLimit` call sites (`dl`/`party`/`tmdb`), one batched `$inc` upsert per
  minute per warm instance, no new collection design needed.

### P0.4 Player cold start: buy back a second of the only non-instant path — ✅ SHIPPED
The resolve → probe → manifest chain is 2–5s of honest waiting. One free win:
- [x] **Warm resolve on details-page mount** (debounced, cache-first): the
  page fires `resolveVidcore` once and the player consumes it one-shot for
  the default server pick — the cold start becomes probe + manifest only.
  Failures clear the entry so the player's own resolve re-fires.
- [ ] Prefetch the title's **metadata** (episode list, IMDb id) on hover-intent
  of the Watch button (same pattern as route-level prefetch, no new infra).
  *(Deferred — the 24h query cache already covers repeat visits; hover-intent
  adds complexity for the one first-visit case the warm token now absorbs.)*

---

## P1 — Next (this month, each ≤ 2 days)

### P1.1 Watch-party polling: adaptive heartbeat — ✅ SHIPPED
2s polls × 25 seats is the single biggest Vercel-function consumer. Keep the
contract (≤ 2.5s drift correction) while cutting idle cost:
- [x] Poll at **2s while the room's playback is "playing"**, back off to **5s
  when paused/idle**, **15s when the tab is hidden** (instant re-arm on
  return). Drift correction ages with poll age already (`useWatchParty`
  latency aging) — the guest math is unchanged; only idle rooms get cheaper.
  Expected: ~60% fewer polls/room.

### P1.2 TMDB edge-cache ceiling raise (free scale headroom) — ✅ SHIPPED
The proxy already answers `s-maxage=1800, stale-while-revalidate=86400`.
- [x] Split by mutability: `movie/{id}*`, `tv/{id}*`, `person/{id}*` are
  **immutable per day** → `s-maxage=86400`; trending/search keep 1800. Every
catalog hit after the first per day per region stops touching the function
and the TMDB rate budget entirely (Vercel edge serves it).
- [x] Details pages: raise React Query `staleTime` for `movie` + `episodes`
  queries to 24 h with focus-refetch off (cache-first repeat visits).

### P1.3 Mobile (Flutter) parity sweep — close the documented deferrals
From `task.md` history: subtitle styling prefs, still-watching modal, scrub
preview thumbs, and the `initialServerIndex` server-switch UI. These are the
last known gaps between web and APK. Same order the web did them (behaviors →
menus → polish) so the port review is mechanical. **Deferred: needs a machine
with the Flutter SDK — no Dart gate can run here.**

### P1.4 Honest-capacity dashboard row — ✅ SHIPPED
With P0.3's ledger: a quiet Settings → Account row ("System status") showing
"Today's shared capacity used — Relay 34% · Party 25% · Catalog 12%", fetched
on demand, never polled. The user should never discover a quota by playback
dying — the same no-silent-failure rule applied to capacity.

---

## P2 — When the numbers demand it (not before)

Ordered by trigger, not by date. **Do nothing here until P0.3 shows the number.**

| Trigger | Action | Cost |
|---|---|---|
| Worker ≥ 70% of 100k req/day for 7 days | Put a **custom domain** on the worker (escapes `workers.dev` WAF blocks some CDNs apply; also enables Cloudflare's per-domain caching). Code unchanged — the one infra move already documented as an option | $0 (domain is the only conceivable spend — user's call) |
| Vercel function invocations climbing | Raise party poll floor to 10s idle + move chat cursor pagination server-side (already cursor-based — just cap transcript growth per room) | $0 |
| Mongo connections > ~60% of pool | Add a tiny connection-reuse header pass on `/api/sync` (keep-alive is default; audit only) | $0 |
| A second region's users report slow starts | Cloudflare worker already gives edge presence — route *resolve* through it with an action whitelist (resolve stays referer-light) | $0 |
| Catalogue growth strains TMDB shared budget | Client-side TMDB response cache (IndexedDB, 24h) — read-heavy discipline taken to the last hop | $0 |

**Explicitly NOT planned** (and why): paid DB tiers (state is KBs for years),
paid egress (direct-first + worker cover it), any always-on server
(the CineSrc lesson is permanent — browser-bound tokens and $0 hosting died
together; every source must be serverless-resolvable), WebSockets for parties
(Vercel Hobby can't hold them; adaptive polling is strictly better here).

---

## Guardrails that make the plan safe

1. **Frozen contracts** (`architecture.md` §2–3): `normalizeResult`, React
   Query keys, `aios_*`/`setting-*`/`streamly_*` storage keys, route paths.
   P0.1/P0.2 only *add*; they never rename.
2. **No silent failures**: every new surface (export, ledger, status row)
   reports through `debugLogger` as `[Streamly][scope]` and shows honest text
   in the UI.
3. **Every feature ships its fallback ladder** — including P0.4's warm token
   (expired → discard → the existing retry machinery re-resolves).
4. **Gates are the gate**: nothing lands without lint + vitest + build, and
   `task.md` records it in order.

## Sequencing summary

```
Now:      P0.1 export/import ✅ · P0.2 Mongo snapshot ✅ · P0.3 usage ledger ✅ · P0.4 warm resolve ✅
Next:     P1.1 adaptive polls ✅ · P1.2 edge-cache raise ✅ · P1.3 mobile parity (deferred: needs Flutter SDK) · P1.4 dashboard ✅
Later:    only on a P0.3 trigger — custom domain, cache trims, IndexedDB TMDB cache
Never:    paid tiers, always-on servers, breaking frozen contracts
```
