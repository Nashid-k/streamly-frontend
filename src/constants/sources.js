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
import { streamResolve } from "../api/streamResolve";
import { logDebug } from "../utils/debugLogger";

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
   path is fixed in api/stream.js; the rows below were re-verified after. The
   mint has been renamed twice since (latest: 2026-10-06) — the current string
   is `ZXC_MINT_PATH` in `api/stream.js`, re-discovered from the shipped embed
   chunk by the procedure recorded next to it.

   ROSTER 2026-11-15 (re-measured) — three rows, each driven through production
   (`/api/stream`, strict single-server pins on movie 1101383 and 1339713, plus
   client-exact auto+prefer payloads on tv 1399 S1E1):

     Server 1 RIVO       served 3/3 titles, 1080p, and the ONLY row that
                         returned alternate audio (3–5 tracks incl. the original
                         on 1101383). Every one of its bytes rides the relay
                         (its segment CDN sends no ACAO) — a throughput fact,
                         not a fault.
     Server 2 Valstrax   served 3/3, 1080p, no alternate audio.
     Server 3 Alatreon   served 3/3, TS bytes with no height metadata, no
                         alternate audio.

    ZXC Ursa was REMOVED here (2026-11-15) after re-measuring 0/3: every title
    answered "HLS links unreadable" or a 502 from its segment host. ZXC Orion
    (briefly a fifth row the same day) went the same way at 0/3, and the ZXC
    family returned no dubbed tracks on any measured title — so neither row
    could keep the "Multi audio" promise it advertised. Atlas and Daedalus had
    already been retired on the same evidence. Server 1 (RIVO) is therefore the
    only multi-audio row in the catalogue.

    ZXC Orion and ZXC Atlas were RETIRED here because both strict pins failed
   on both titles ("ZXC <server> manifest unreadable"). Keeping them in the
   menu made every "pick Server 2/3" wait 5-10s only to fall through to
   Valstrax, and their "Multi audio" tag described a feature no probe could
   reproduce: the ZXC family returned 0 dubbed tracks on every title measured.
   The numbers below are contiguous again (the same precedent as the VidRack
   retirement further down). The provider still rotates its own roster
   (api/stream.js `parseZxcRoster`); a backend that returns stays reachable
   through the rotation even when it has no menu row.

   Server 1 is NOT ZXC (2026-11-02): RIVO's multi-audio backend took the slot —
   one master PER LANGUAGE (`audioTracks`), each a real 1080p HLS ladder.

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
   unreachable server-side. CineSrc went with its Chrome mint service — no
   serverless function can mint fingerprint-bound tokens. */
export const PLAYER_SOURCES = [
  /* Server 1 is RIVO's multi-audio backend (rivo.st / f.rivo.st): one master
     PER LANGUAGE, so the Audio menu switches between full sibling manifests.
     It leads the menu because multi-audio is the capability most viewers pick a
     server for, and it is the only row MEASURED to return alternate tracks
     (2026-11-15). */
  {
    key: "rivo-1",
    label: "Server 1",
    // RIVO's primary (multi-audio) library was empty on 2026-11-17 while its
    // sibling servers still served titles, so "multi audio" is conditional on
    // the library that answers. The row is still RIVO either way.
    tag: "Multi audio when available · up to 1080p",
    provider: "RIVO",
    server: "1",
    /* Server 1 means RIVO, full stop. This row used to catch every RIVO miss
       and replay the request on ZXC Valstrax, so an explicit Server 1 pick
       silently became Server 2. The RIVO handler now falls through to RIVO's
       own live sibling ids (6 → 7); a real RIVO outage must surface as a
       no-source on Server 1, not as a different provider. The no-pick
       AUTO_SOURCE path keeps its own documented RIVO → Server 2 fallback. */
    resolve: (a, o) => streamResolve.resolveRivo({ ...a, server: "1" }, o),
  },

  /* The ZXC backends, each kept as its OWN row so the Servers menu
     can target one directly instead of auto-rotation racing to a winner. Some
     rows ship DASH, which the server transcodes to an HLS fMP4 master (no remux,
     no per-byte work) so hls.js can ABR and mux just like native HLS.

     Every ZXC row resolves with `prefer:"<backend>"` (not `server`): the picked
     backend is tried FIRST and, when it has no source, the SAME request walks
     the health-ordered rotation — the fast fallback that replaces the old dead
     end. The response echoes whichever backend actually served it, and the player
     re-derives that row via `sourceByServer`. */
  {
    key: "zxc-valstrax",
    label: "Server 2",
    tag: "Original audio · up to 1080p",
    provider: "ZXC Valstrax",
    server: "valstrax",
    resolve: (a, o) => streamResolve.resolveZxc({ ...a, prefer: "valstrax" }, o),
  },
  {
    key: "zxc-alatreon",
    label: "Server 3",
    tag: "Original audio",
    provider: "ZXC Alatreon",
    server: "alatreon",
    resolve: (a, o) => streamResolve.resolveZxc({ ...a, prefer: "alatreon" }, o),
  },
];


export const DEFAULT_SOURCE_KEY = "rivo-1";   /* The automatic rotation's mount. When the viewer has NOT picked a row, the
   player resolves through THIS instead of walking the rows above. A real pick
   (a server row in PLAYER_SOURCES) always wins over this sentinel — the player
   only falls back to AUTO_SOURCE when no server was chosen, which is the same end
   state as picking "Server 1" when Server 1 is the DEFAULT_SOURCE_KEY, so the no-pick
   start and the explicit Server 1 start land on the same real row. (Before this the
   no-pick path walked every ZXC backend internally and resumed on whichever one answered
   first, which could surface a later row and make the Servers menu sit on, e.g.,
   "Server 7" with no pick at all.) `key` is a sentinel (never in PLAYER_SOURCES, so it
   never shows in the menu) and after a resolve the player re-derives the REAL row from
   the server the backend chose (`sourceByServer`), so the Servers menu still reflects
   truth. */
export const AUTO_SOURCE = {
  key: "__auto__",
  label: "Auto",
  tag: "Best available",
  provider: "RIVO → ZXC auto",
  resolve: async (a, o) => {
    try {
      const rivo = await streamResolve.resolveRivo({ ...a, server: "1" }, o);
      // RIVO answered — Server 1 is the start of the line, done.
      return { ...rivo, server: rivo.server || "1" };
    } catch (error) {
      // AbortError = resolve was cancelled (route change or manual server
      // pick mid-flight). Must propagate — do NOT start a ZXC stream from a
      // stale run.
      if (error?.name === "AbortError") throw error;

      // All other RIVO outcomes fall through to the first ZXC row:
      //   code: "no-source" → title absent on RIVO
      //   code: "upstream"  → RIVO has metadata but CDN sources empty (HTTP 200,
      //                      sources:[] — the dominant "no source" trigger case)
      //   network / parse   → RIVO unreachable; ZXC is the fallback
      logDebug("stream", "AUTO: RIVO fallthrough → ZXC valstrax", {
        code: error?.code,
        name: error?.name,
        message: error?.message?.slice(0, 80),
      });

      // Prefer valstrax by NAME: the measured healthiest ZXC backend (3/3
      // titles at 1080p, 2026-11-15). NOT "auto" — "auto" lets the backend pick
      // the healthiest ZXC backend, which could surface a later row and make the
      // Servers menu sit on something the viewer never picked.
      return await streamResolve.resolveZxc({ ...a, prefer: "valstrax" }, o);
    }
  },
};


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

/* Look a source up by the PROVIDER's own server name (the value the resolver
   echoes back after an automatic resolve). Lets the player map "the backend
   chose andromeda" back onto the Server 2 row so the Servers menu highlights
   the row that is actually playing. Null for an unknown/absent name. */
export function sourceByServer(server) {
  if (!server) return null;
  return PLAYER_SOURCES.find((s) => s.server === server) || null;
}

/* Display label for a key, with an explicit fallback. Never throws and never
   returns undefined, because these strings land in status text. */
export function sourceLabel(key, fallback = "That server") {
  return sourceByKey(key)?.label || fallback;
}
