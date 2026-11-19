import { logError, logWarn } from "../utils/debugLogger";
import { relayProxyConfig } from "./relayProxy.js";

/* OpenSubtitles is the one upstream the browser cannot serve unconditionally:
   the search API intermittently answers without CORS headers (the fetch dies
   as "Failed to fetch"), so search stays relay-first with a direct fallback.

   Downloads are the opposite. dl.opensubtitles.org answers with
   `Access-Control-Allow-Origin: *` and a direct browser fetch returns the .gz
   (measured 2026-11-19); the Cloudflare relay can still 401 there because
   OpenSubtitles' bot wall challenges Worker egress. So the direct leg goes
   first for downloads and the relay is only the fallback. */
async function fetchViaRelay(relay, url, init) {
  try {
    const res = await fetch(`${relay.base}?url=${encodeURIComponent(url)}`, {
      method: "GET",
      signal: init.signal,
    });
    if (res.ok) return res;
    await res.body?.cancel?.().catch?.(() => {});
    logWarn("subtitles", `Relay refused a subtitle request (${res.status}).`, {
      status: res.status,
    });
  } catch (error) {
    logWarn("subtitles", "Subtitle relay unavailable.", { message: error?.message });
  }
  return null;
}

async function fetchSubtitleResource(url, init = {}, { preferDirect = false } = {}) {
  const direct = () => fetch(url, init);
  const relay = relayProxyConfig();
  if (!relay) return direct();

  if (!preferDirect) {
    const relayed = await fetchViaRelay(relay, url, init);
    return relayed || direct();
  }

  let response = null;
  try {
    response = await direct();
    if (response.ok) return response;
    logWarn("subtitles", `Direct subtitle request refused (${response.status}) — trying relay.`, {
      status: response.status,
    });
  } catch (error) {
    logWarn("subtitles", "Direct subtitle request failed — trying relay.", {
      message: error?.message,
    });
  }

  const relayed = await fetchViaRelay(relay, url, init);
  if (relayed) {
    await response?.body?.cancel?.().catch?.(() => {});
    return relayed;
  }
  return response || direct();
}

export class SubtitleFetcher {
  /**
   * Fetch available subtitles for a given IMDB ID.
   * Returns a deduplicated list of available languages and their best SRT download link.
   * @param {string} imdbId - The IMDB ID (e.g. "tt0137523" or "0137523")
   */
  static async searchAvailableSubtitles(imdbId, title = "") {
    try {
      let searchUrl = "";
      if (imdbId) {
        // OpenSubtitles requires exactly 7 digits (zero-padded) or more. If we strip zeroes, it throws a 302 CORS error.
        const cleanImdbId = imdbId.replace(/^tt/, "").padStart(7, "0");
        searchUrl = `https://rest.opensubtitles.org/search/imdbid-${cleanImdbId}`;
      } else if (title) {
        // OpenSubtitles REST API has a bug where uppercase or %20 causes a 302 redirect to a broken URL (https://_/)
        const safeTitle = encodeURIComponent(title.toLowerCase()).replace(
          /%20/g,
          "+",
        );
        searchUrl = `https://rest.opensubtitles.org/search/query-${safeTitle}`;
      } else {
        logWarn("subtitles", "Subtitle search skipped — no imdbId or title provided.", {});
        return [];
      }

      const res = await fetchSubtitleResource(searchUrl, {
        headers: { "User-Agent": "TemporaryUserAgent" },
      });

      if (!res.ok) {
        const err = new Error("Failed to fetch from OpenSubtitles");
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      if (!data || data.length === 0) {
        logWarn("subtitles", `OpenSubtitles returned 0 subtitles for ${imdbId || title}.`, { imdbId, title });
        return [];
      }

      const srtSubs = data.filter((s) => s.SubFormat === "srt");

      const languageMap = new Map();
      for (const sub of srtSubs) {
        if (!languageMap.has(sub.LanguageName)) {
          // Keep the first one we find for each language (which is usually the highest rated by OpenSubtitles sorting)
          languageMap.set(sub.LanguageName, {
            language: sub.LanguageName,
            languageId: sub.SubLanguageID,
            downloadLink: sub.SubDownloadLink,
          });
        }
      }

      return Array.from(languageMap.values()).sort((a, b) =>
        a.language.localeCompare(b.language),
      );
    } catch (err) {
      logError("subtitles", `Subtitle search failed for ${imdbId || title}. Player continues without subtitles.`, err, { imdbId, title });
      return [];
    }
  }

  /**
   * True when a downloaded body actually looks like subtitle text (SRT or
   * VTT): it must carry at least one `HH:MM:SS,mmm --> …` / `HH:MM:SS.mmm
   * --> …` timestamp line. Guards the player against accepting an HTML error
   * page (Cloudflare 401/403, a dead relay echo) or gunzip garbage as a
   * "0-line" track that would enable successfully and then never render.
   */
  static isSubtitleText(text) {
    return typeof text === "string" && /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text);
  }

  /**
   * Fetch and decompress a specific subtitle file by URL
   */
  static async downloadAndDecompress(downloadLink) {
    try {
      const subRes = await fetchSubtitleResource(downloadLink, {}, { preferDirect: true });
      if (!subRes.ok) {
        const err = new Error("Failed to download subtitle file");
        err.status = subRes.status;
        if (subRes.status === 401) {
          logWarn("subtitles", "Subtitle download refused (401) on the direct and relay legs — the upstream is blocking this client. Player continues without this track.", { downloadLink });
        }
        throw err;
      }

      /* Read raw bytes first, then decide. dl.opensubtitles.org serves the
         .gz as a plain download WITHOUT content-encoding, so a header-only
         gunzip decision reads gzip bytes as text and finds zero cues. Sniff
         the gzip magic (1F 8B) on the bytes themselves — string-level
         sniffing is unreliable because text-decoding binary is lossy (0x8B
         already becomes U+FFFD). */
      const buf = await subRes.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const encoding = (subRes.headers.get("content-encoding") || "").toLowerCase();
      const looksGzipped =
        encoding.includes("gzip") || (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
      const decodeRaw = () => new TextDecoder().decode(buf);
      let text = null;
      if (looksGzipped && typeof DecompressionStream !== "undefined") {
        try {
          const ds = new DecompressionStream("gzip");
          const decompressedStream = new Response(buf).body.pipeThrough(ds);
          const candidate = await new Response(decompressedStream).text();
          // A stale gzip header on an already-plain body throws above (raw
          // fallback below); a "successful" gunzip of the wrong bytes yields
          // garbage, so only accept subtitle-shaped output.
          if (SubtitleFetcher.isSubtitleText(candidate)) text = candidate;
        } catch {
          // Not actually gzipped despite the header/magic hint — raw decode below.
        }
      } else if (looksGzipped) {
        logWarn("subtitles", "DecompressionStream not supported in this browser — reading gzipped subtitle as plain text.", {});
      }
      if (text === null) text = decodeRaw();
      /* Refuse bodies that are not subtitle text at all: an HTML error page
         (relay 401/403 echo, upstream block) or undecodable gzip bytes would
         otherwise parse to zero cues — a track that "enables" and then never
         renders a single line, with no visible reason. */
      if (!SubtitleFetcher.isSubtitleText(text)) {
        logWarn("subtitles", "Subtitle download answered 200 but the body has no timestamp lines — refusing it as a track (upstream error page, not captions).", {
          preview: String(text || "").slice(0, 120),
        });
        return null;
      }
      return text;
    } catch (err) {
      logError("subtitles", "Subtitle download/decompress failed.", err, {});
      return null;
    }
  }
}
