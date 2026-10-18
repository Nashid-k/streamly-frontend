// src/api/relayProxy.js — shared Cloudflare Workers relay protocol for the
// native player loader and the download stream.
//
// The worker is a GET ?url= passthrough: it strips Origin/Referer/Host,
// forwards our Range, follows redirects and exposes content-range/content-length.
// Raw transport pointed at it first takes bytes OFF Vercel Hobby (no 4.5MB body
// cap, no egress charge) — one request pulls a whole fMP4 fragment instead of a
// fan-out of 3.5MB slices. /api/stream stays the automatic fallback.
//
// ZERO-ENV DEFAULT: the deployed worker URL below is the code default, so a
// build with no VITE_STREAMLY_RELAY_URL at all still gets the fast leg — this
// matters because WITHOUT it every relayed ZXC seek fragment and every manifest
// reload is a cold-capable Vercel round trip (~2s warm, worse when scale-to-zero
// bites), which is exactly what read as "ff/bw and server switching load forever".
// Resolution order: an explicitly set URL wins; an explicitly EMPTY string
// opts out (force the Vercel /api/stream relay); unset => the default worker.
//
// Referer-gated CDNs (VidCore's moon/palehive) 403 a bare fetch, so the client
// passes the owning player's referer as ?referer= and a worker deployed with the
// referer-forwarding snippet serves those hosts whole-fragment. Older workers
// ignore the param and 403, and the client then cascades to the Vercel function,
// which always carries the referer.

const WORKER_SLICE_MAX = 60 * 1024 * 1024;

/* The worker shipped with this repo (.env.example + docs/relay-worker.js) —
   live-verified, referer-forwarding version. Client-visible by design. */
export const DEFAULT_RELAY_URL = "https://streamly-proxy.nashidk1999.workers.dev";

/* Active proxy endpoint + slice, or null when EXPLICITLY disabled (empty
   string — then every relay request uses the Vercel function). An unset env
   var falls back to DEFAULT_RELAY_URL so a zero-env deploy is full-speed.
   Read lazily so tests can stub the env. */
export function relayProxyConfig() {
  const raw = typeof import.meta !== "undefined" ? import.meta.env?.VITE_STREAMLY_RELAY_URL : undefined;
  if (raw === undefined || raw === null) return { base: DEFAULT_RELAY_URL, slice: WORKER_SLICE_MAX };
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  return trimmed ? { base: trimmed, slice: WORKER_SLICE_MAX } : null;
}

/* "Does a slice continue past what we just got?" — the proxy adds no
   x-streamly-more (stream does), so derive it from content-range when
   that header is absent: a served offset + bytes < total means more data. */
export function deriveSliceMore(response, bufLength, slice) {
  const header = response.headers.get("x-streamly-more");
  if (header !== null && header !== undefined) return header === "1";
  const m = /bytes\s+(\d+)-\d+\/(\d+)/i.exec(response.headers.get("content-range") || "");
  if (m) {
    const from = Number(m[1]);
    const total = Number(m[2]);
    if (Number.isFinite(from) && Number.isFinite(total) && total > 0) {
      return from + bufLength < total;
    }
  }
  return bufLength >= slice;
}