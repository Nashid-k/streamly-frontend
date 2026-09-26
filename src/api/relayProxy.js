// src/api/relayProxy.js — shared Cloudflare Workers relay protocol for the
// native player loader and the download stream.
//
// The worker (VITE_STREAMLY_RELAY_URL) is a GET ?url= passthrough: it strips
// Origin/Referer/Host, forwards our Range, follows redirects and exposes
// content-range/content-length. Raw transport pointed at it first takes bytes
// OFF Vercel Hobby (no 4.5MB body cap, no egress charge) — one request can pull
// a whole fMP4 fragment instead of a fan-out of 3.5MB slices.
// /api/downloadify stays the automatic fallback.
//
// Referer-gated CDNs (VidCore's moon/palehive) 403 a bare fetch, so the client
// passes the owning player's referer as ?referer= and a worker deployed with the
// referer-forwarding snippet serves those hosts whole-fragment. Older workers
// ignore the param and 403, and the client then cascades to the Vercel function,
// which always carries the referer.

const WORKER_SLICE_MAX = 60 * 1024 * 1024;

/* Active proxy endpoint + slice, or null when unconfigured (then every relay
   request uses the Vercel function). Read lazily so tests can stub the env. */
export function relayProxyConfig() {
  const relay =
    typeof import.meta !== "undefined" ? String(import.meta.env?.VITE_STREAMLY_RELAY_URL || "") : "";
  const trimmed = relay.trim().replace(/\/+$/, "");
  return trimmed ? { base: trimmed, slice: WORKER_SLICE_MAX } : null;
}

/* "Does a slice continue past what we just got?" — the proxy adds no
   x-streamly-more (downloadify does), so derive it from content-range when
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