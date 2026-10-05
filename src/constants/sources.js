/* ── Server catalogue — ONE ordered list for the whole app ────────────────
   These are the rows the player's Servers menu shows.

   Why the display name is generic ("Server 1"…) and not the provider's own
   name: a viewer's choice here is a *capability* decision (4K? multi-audio?),
   not a brand decision. Naming the backends invited comparing hosts instead of
   comparing what you actually get, and it was also a poor way to talk about
   them out loud. `provider` is kept for logs/debugging only and is never
   rendered.

   This list is deliberately the single source of truth for BOTH the number and
   the capability line. It used to be inline in NativePlayerView, and a second
   sheet once labelled the same provider with a different number from an older
   scraper rotation — the same provider was two different numbers in two
   surfaces. Add or remove a server HERE and every surface renumbers itself.

   `tag` is the small grey capability line under each row (12px, 50% white):
   what the viewer actually gets from this server — the quality ceiling and the
   audio situation. It states audio as "original" or "multi"; it deliberately
   does not use the word "dubs", because what matters when picking a server is
   whether other audio exists, not what to call it. */

/* Imported as a NAMED binding, without the `.js` extension, because that is
   how every consumer imports it — and vitest keys its `vi.mock` registry off the
   specifier AND the binding shape. A default import here resolves differently
   and silently bypasses tests that mock the download service (it did, and the
   real resolver went to the network mid-test). */
import { downloadService } from "../api/downloadService";

/* Order matters twice over: it is the display number AND the auto-rotation
   order, so a row that is unreliable belongs late.

   MEASURED STATUS 2026-10-03 — every row driven through the REAL handler against
   the REAL provider, for movie 27205 AND tv 1399 S1E1, then walked the way the
   player walks it (`action:"playlist"` -> `action:"segment"`, a real byte sip),
   so a row is only called working if it actually serves bytes:

     zxc centaurus  OK  3 variants TOP 1080p, 3 audio tracks, 1480 movie /
                         739 episode segments, segments 200 with 40000 real
                         ISO-BMFF bytes (`styp`)
     zxc andromeda  OK  3 variants TOP 1080p, 1480 segments, real fMP4 bytes
     zxc meow/Ursa  OK  1 variant at 800p, 1778 segments, real bytes
     zxc atlas      OK  manifest 200, 741 segments, real bytes — but its
                         single variant declares NO resolution, so no ceiling
                         is claimed for it
     zxc milkyway   DEAD dropped — retired upstream, manifest 403s
     vidrack agg    OK  measured row-by-row before publishing — every row in
                         the menu now proven to serve real media bytes, because
                         a listed row that cannot deliver its AES key plays a
                         running timer and no picture
     vidsrc         GONE removed 2026-10-03 — re-verified DEAD first
                         (movie 27205 and tv 1399 s1e1 both answer
                         HTTP 200 {ok:false, code:"no-source"})
     nhd            GONE removed 2026-10-03 — re-verified DEAD first
                         (same two titles, same honest no-source verdict)

   Every ZXC row was dead for ONE reason: the token mint had been RENAMED
   upstream from `POST /backend/meow` to `POST /backend/fuckyou` ("meow" is now a
   SERVER name — "Ursa" — not an endpoint), so the old path 404'd. That single
   path is fixed in api/stream.js; the rows below were re-verified after.

   Centaurus leads because it is the only row with real multi-language audio AND
   verified bytes, which is why it is also `DEFAULT_SOURCE_KEY`.

   Server 5 (VidRack) was removed on 2026-10-04 after being measured dead: every
   ladder it published was AES-128 and the key host (`api.dlproxy.com`) answers
   403 to us, so the honesty gate dropped every row and the source could only
   ever report "no playable source". It also cost a 13-25s aggregate resolve and a
   28s full-ladder budget on every failover, which is the stall this cut removes.
   Its 4K claim came from `vidcore.io`, a DIFFERENT host that refuses Vercel
   outright with a 403 from both iad1 and bom1 — unreachable server-side, so it
   was never deliverable through this row either.

   The ONLY 4K in this catalogue was vidcore.io's own ladder, and vidcore.io
   refuses Vercel outright with a 403 from both iad1 and bom1, so that ladder is
   unreachable server-side. NetMirror (net27.cc) was removed: its
   video layer is per-IP 429-gated behind a Cloudflare challenge. CineSrc went with
   its Chrome mint service — no serverless function can mint fingerprint-bound
   tokens. */
export const PLAYER_SOURCES = [
  /* The five ZXC/VIDSTUCK backends, each kept as its OWN row so the Servers menu
     can target one directly instead of auto-rotation racing to a winner. Two of
     them ship DASH, which the server transcodes to an HLS fMP4 master (no remux,
     no per-byte work) so hls.js can ABR and mux just like native HLS. Orion
     (multi-audio, like centaurus) was read off the CURRENT embed chunk
     (`gN.SERVERS`) — the older chunk only listed four, the roster rotates. */
  {
    key: "zxc-centaurus",
    label: "Server 1",
    tag: "Multi audio · up to 1080p",
    provider: "ZXC Centaurus",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "centaurus" }, o),
  },
  {
    key: "zxc-andromeda",
    label: "Server 2",
    tag: "Original audio · up to 1080p",
    provider: "ZXC Andromeda",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "andromeda" }, o),
  },
  {
    key: "zxc-atlas",
    label: "Server 3",
    tag: "Original audio · one quality",
    provider: "ZXC Atlas",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "atlas" }, o),
  },
  {
    key: "zxc-meow",
    label: "Server 4",
    tag: "Original audio · up to 1080p",
    provider: "ZXC Ursa",
resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "meow" }, o),
  },
  {
    key: "zxc-orion",
    label: "Server 5",
    tag: "Multi audio · up to 1080p",
    provider: "ZXC Orion",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "orion" }, o),
  },
];

export const DEFAULT_SOURCE_KEY = "zxc-centaurus";

/* Every live server label, in menu order. A saved `serverOrder` from before a
   retirement can still name a row that no longer exists (Server 6/7 = VidSrc,
   NHD), so the preferences sanitizer validates against THIS list instead of a
   hardcoded 1..8: a retired row is dropped on boot rather than lingering in the
   Settings drag list as something the player will never resolve. */
export const PLAYER_SOURCE_LABELS = Object.freeze(PLAYER_SOURCES.map((s) => s.label));

/* Look a server up by key. Returns null for an unknown key so callers can
   decide their own fallback instead of silently resolving to Server 1. */
export function sourceByKey(key) {
  if (!key) return null;
  return PLAYER_SOURCES.find((s) => s.key === key) || null;
}

/* Display label for a key, with an explicit fallback. Never throws and never
   returns undefined, because these strings land in status text. */
export function sourceLabel(key, fallback = "That server") {
  return sourceByKey(key)?.label || fallback;
}
