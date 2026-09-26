// server/net.js — the single outbound HTTP path for the download function.
// One place owns the browser-shaped headers, the manual redirect walk (each hop
// re-validated by ssrf.assertPublicDestination), the response-size ceiling and
// the Range-chunk reader the byte relay depends on.
import { assertPublicDestination } from "./ssrf.js";

// Vercel hard-caps function response bodies at 4.5MB; keep well under with
// headroom for headers/JSON overhead.
const RANGE_CHUNK_BYTES = 3.5 * 1024 * 1024;
const MAX_TEXT_BYTES = 1.5 * 1024 * 1024;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function json(res, status, body) {
  res.status(status).setHeader("content-type", "application/json");
  res.send(JSON.stringify(body));
}

/* SSRF hardening: the old fetch used redirect:"follow", so any allow-listed
   host could 302 the function into fetching 169.254.169.254 / internal IPs —
   the hostname blocklist never saw the redirect target. We now follow hops
   MANUALLY and re-validate every destination against the private-IP rules. */
const MAX_REDIRECTS = 5;

function fetchNoRedirect(url, opts) {
  return fetch(url, { ...opts, redirect: "manual" });
}

function baseHeaders() {
  return {
    "user-agent": getRandomUA(),
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not:A=Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
  };
}

async function followRedirects(url, headers, signal, as) {
  let current = url;
  let upstream = await fetchNoRedirect(current, { headers, signal });
  for (let hop = 0; hop < MAX_REDIRECTS && upstream.status >= 300 && upstream.status < 400; hop += 1) {
    const location = upstream.headers.get("location");
    if (!location) throw new Error("Redirect without location");
    current = await assertPublicDestination(new URL(location, current).toString());
    upstream = await fetchNoRedirect(current, { headers, signal });
  }
  if (!upstream.ok) {
    const err = new Error(`Upstream ${upstream.status}`);
    err.status = upstream.status;
    throw err;
  }
  if (as === "buffer") {
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > RANGE_CHUNK_BYTES) throw new Error("upstream response too large");
    return buf;
  }
  const text = await upstream.text();
  if (text.length > MAX_TEXT_BYTES) throw new Error("upstream response too large");
  return text;
}

async function fetchUpstream(url, { as = "text", timeoutMs = 12000, referer, retryCount = 0, extraHeaders = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const safeUrl = await assertPublicDestination(url);
    const headers = baseHeaders();
    Object.assign(headers, extraHeaders);
    if (referer) {
      headers.referer = referer;
      headers["referrer-policy"] = "strict-origin-when-cross-origin";
    }

    try {
      return await followRedirects(safeUrl, headers, controller.signal, as);
    } catch (error) {
      // Retry with a different user agent on transient 403/429 responses.
      if (as !== "buffer" && error?.status && (error.status === 403 || error.status === 429) && retryCount < 3) {
        return fetchUpstream(url, { as, timeoutMs, referer, retryCount: retryCount + 1, extraHeaders });
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

/* Range-chunked segment fetch. The upstream is asked for `bytes=start-(start+max-1)`
   and the response is capped at `max`; `more` tells the caller whether more
   bytes follow (derived from content-range when the server sends one, else the
   "exactly full chunk" heuristic — the client breaks on a subsequent empty
   chunk, so any one-off guess resolves safely).
   Some CDNs gate on the referer of their owning player (e.g. VidSrc's opaque
   relay expects https://xplayer.videm.xyz/). Their 403 declares the expected
   origin in access-control-allow-origin, so we retry once from that origin —
   it's only used as a request header, which adds no SSRF surface. */
async function fetchRangeChunk(url, { start = 0, max = RANGE_CHUNK_BYTES, referer } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const safeUrl = await assertPublicDestination(url);

    const attempt = async (ref) => {
      const headers = baseHeaders();
      headers.range = `bytes=${start}-${start + max - 1}`;
      if (ref) {
        headers.referer = ref;
        headers.origin = new URL(ref).origin;
      }
      let current = safeUrl;
      let upstream = await fetchNoRedirect(current, { headers, signal: controller.signal });
      for (let hop = 0; hop < MAX_REDIRECTS && upstream.status >= 300 && upstream.status < 400; hop += 1) {
        const location = upstream.headers.get("location");
        if (!location) throw new Error("Redirect without location");
        current = await assertPublicDestination(new URL(location, current).toString());
        upstream = await fetchNoRedirect(current, { headers, signal: controller.signal });
      }
      return upstream;
    };

    let upstream = await attempt(referer);
    if (upstream.status === 403 && referer) {
      const declared = upstream.headers.get("access-control-allow-origin");
      if (declared && declared !== "*" && !/^null$/i.test(declared) && declared !== new URL(referer).origin) {
        upstream = await attempt(declared);
      }
    }

    // At a file boundary a range past the end comes back 416 — that's the
    // "more=false" signal, not an error (the chunk at an exact multiple of
    // the chunk size legitimately over-requests once).
    if (upstream.status === 416) {
      const totalMatch = /bytes\s+\*\/(\d+)/i.exec(upstream.headers.get("content-range") || "");
      const total = totalMatch ? Number(totalMatch[1]) : NaN;
      if (Number.isFinite(total) && start >= total) {
        return { bytes: Buffer.alloc(0), more: false };
      }
      throw new Error("Upstream 416");
    }
    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);

    // Some CDNs answer 200 and ignore Range entirely. If the whole file fits
    // in the slice we can still serve it; otherwise we cannot seek, so a clear
    // error beats a silently-corrupted or looped download.
    if (upstream.status !== 206 && start > 0) throw new Error("Upstream ignores range requests");
    let contentLength = Number(upstream.headers.get("content-length") || 0) || 0;

    let buffer = Buffer.from(await upstream.arrayBuffer());
    let truncated = false;
    if (buffer.length > max) {
      buffer = buffer.subarray(0, max);
      truncated = true;
    }
    if (upstream.status !== 206 && contentLength > max && buffer.length === max) {
      throw new Error("Upstream ignores range requests");
    }
    contentLength = Math.max(contentLength, buffer.length);

    const contentRange = upstream.headers.get("content-range") || "";
    const more = truncated || moreFromContentRange(contentRange, start, max, buffer.length, contentLength);
    return { bytes: buffer, more };
  } finally {
    clearTimeout(timer);
  }
}

function moreFromContentRange(contentRange, start, max, got, contentLength) {
  const m = /bytes\s+\d+-\d+\/(\d+)/i.exec(contentRange);
  if (m) {
    const total = Number(m[1]);
    if (Number.isFinite(total) && total > 0) return start + got < total;
  }
  // No content-range (or a non-seekable 200 body): a full-cap chunk plus a
  // known content-length means the file outlived this slice; otherwise we got
  // everything the file (or this range response) had to give.
  if (contentLength > got) return true;
  return got === max;
}

export { json, fetchUpstream, fetchRangeChunk, RANGE_CHUNK_BYTES, MAX_TEXT_BYTES };
