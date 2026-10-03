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
   order, so a row that is unreliable belongs late. VidCore leads because its
   probe is direct-first (a blocked CDN falls through fast) and it is the only
   backend whose ladder reaches 4K. NetMirror (net27.cc) was removed: its video
   layer is per-IP 429-gated behind a Cloudflare challenge. CineSrc went with
   its Chrome mint service — no serverless function can mint fingerprint-bound
   tokens. */
export const PLAYER_SOURCES = [
  {
    key: "vidcore",
    label: "Server 1",
    tag: "4K · multiple qualities",
    provider: "VidCore",
    resolve: (a, o) => downloadService.resolveVidcore(a, o),
  },
  {
    key: "vidsrc",
    label: "Server 2",
    tag: "Original audio · up to 1080p",
    provider: "VidSrc",
    resolve: (a, o) => downloadService.resolveVidsrc(a, o),
  },
  /* NHD carries the fewest titles, but it is a native source with real
     alternate audio (sibling-URL audioTracks) — last of the originals, so
     dubbed titles still land somewhere without costing VidCore its default
     seat. */
  {
    key: "nhd",
    label: "Server 3",
    tag: "Multi audio · one quality",
    provider: "NHD",
    resolve: (a, o) => downloadService.resolveNhd(a, o),
  },
  /* The four ZXC/VIDSTUCK backends, each kept as its OWN row so the Servers
     menu can target one directly instead of auto-rotation racing to a winner.
     Two of them ship DASH, which the server transcodes to an HLS fMP4 master
     (no remux, no per-byte work) so hls.js can ABR and mux just like native
     HLS. */
  {
    key: "zxc-centaurus",
    label: "Server 4",
    tag: "Multi audio · up to 1080p",
    provider: "ZXC Centaurus",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "centaurus" }, o),
  },
  {
    key: "zxc-andromeda",
    label: "Server 5",
    tag: "Original audio · up to 1080p",
    provider: "ZXC Andromeda",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "andromeda" }, o),
  },
  {
    key: "zxc-atlas",
    label: "Server 6",
    tag: "Original audio · one quality",
    provider: "ZXC Atlas",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "atlas" }, o),
  },
  {
    key: "zxc-milkyway",
    label: "Server 7",
    tag: "Original audio · up to 1080p",
    provider: "ZXC Milky Way",
    resolve: (a, o) => downloadService.resolveZxc({ ...a, server: "milkyway" }, o),
  },
];

export const DEFAULT_SOURCE_KEY = "vidcore";

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
