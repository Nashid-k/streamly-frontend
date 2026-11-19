/* Streamly relay worker — GET ?url= passthrough for provider manifests,
   fragments and OpenSubtitles lookups.
 *
 * Contract kept deliberately small:
 *   ?url=<https target>   required
 *   ?referer=<player url> optional; forwarded so referer-gated CDNs serve us
 *   Range                 forwarded unchanged (whole-fragment slices)
 *   POST                  body + a small header allowlist (provider mints)
 *
 * Response rules that the client depends on:
 *   · Access-Control-Allow-Origin: * plus Access-Control-Expose-Headers: *
 *     — without the second header JS cannot read content-range, which is how
 *     `deriveSliceMore` knows a fragment continues past the slice.
 *   · content-range / accept-ranges / etag / last-modified pass through.
 *   · content-encoding deliberately does NOT pass through: the Workers
 *     runtime may already have decompressed the body, and replaying the
 *     header would make the client decompress it twice.
 *   · Errors carry the same CORS headers, otherwise the browser reports an
 *     opaque failure with no status to log.
 *
 * OpenSubtitles asks for the legacy `TemporaryUserAgent` on its download
 * endpoint. The UA is injected here because a browser can never set it; note
 * that Worker egress IPs can still be challenged by the upstream bot wall, so
 * the client treats direct (CORS-open) downloads as the first leg.
 *
 * Deploy: paste this file into the Cloudflare Worker editor and redeploy.
 * The worker URL is the zero-env default in src/api/relayProxy.js.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "*",
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SUBTITLE_UA = "TemporaryUserAgent";

/* Headers copied from the upstream reply. content-length is intentionally
   absent: the body may have been decompressed by the runtime, so an upstream
   length would describe different bytes than the ones we stream. */
const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

function textResponse(message, status = 200) {
  return new Response(message, {
    status,
    headers: { ...CORS_HEADERS, "content-type": "text/plain; charset=utf-8" },
  });
}

function isOpenSubtitlesHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "opensubtitles.org" || host.endsWith(".opensubtitles.org");
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, X-CSRF-Token",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (incoming.pathname === "/health") {
      return textResponse("ok");
    }

    const target = incoming.searchParams.get("url");
    if (!target) {
      return textResponse("missing ?url=", 400);
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return textResponse("bad ?url=", 400);
    }
    if (parsed.protocol !== "https:") {
      return textResponse("https only", 400);
    }

    const referer = incoming.searchParams.get("referer") || parsed.origin + "/";

    const upstreamHeaders = {
      "User-Agent": isOpenSubtitlesHost(parsed.hostname) ? SUBTITLE_UA : BROWSER_UA,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
    };

    const range = request.headers.get("Range");
    if (range) upstreamHeaders.Range = range;

    // The vidrack chain POSTs to vidcore.io (the `servers` and `stream`
    // endpoints), so a GET-only relay cannot complete a resolve. Header
    // names are taken from an allowlist - never spread request.headers,
    // which is what leaks Cloudflare's own Cf-Worker upstream.
    const allowed = new Set(["content-type", "x-requested-with", "x-csrf-token"]);
    for (const [key, value] of request.headers) {
      if (allowed.has(key.toLowerCase())) upstreamHeaders[key] = value;
    }

    const method = ["GET", "HEAD", "POST"].includes(request.method)
      ? request.method
      : "GET";
    const requestBody = method === "POST" ? await request.arrayBuffer() : undefined;
    if (
      method === "POST" &&
      requestBody &&
      requestBody.byteLength &&
      !upstreamHeaders["content-type"]
    ) {
      upstreamHeaders["content-type"] = "application/json";
    }

    let upstream;
    try {
      upstream = await fetch(parsed.toString(), {
        method,
        headers: upstreamHeaders,
        body: requestBody,
        redirect: "follow",
      });
    } catch (error) {
      return textResponse(`Proxy error: ${error?.message || "upstream fetch failed"}`, 502);
    }

    if (!upstream.body) {
      return new Response(null, { status: upstream.status, headers: CORS_HEADERS });
    }

    const responseHeaders = new Headers(CORS_HEADERS);
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has("content-type")) {
      responseHeaders.set("content-type", "application/octet-stream");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
