import { logError, logWarn } from "../utils/debugLogger";
import { relayProxyConfig } from "./relayProxy.js";

/* OpenSubtitles is the one upstream the browser cannot serve on its own: the
   search API intermittently answers without CORS headers (the fetch dies as
   "Failed to fetch"), and the download endpoint UA-gates every .gz — 401 unless
   the legacy TemporaryUserAgent rides along, which JS can never set. So both
   calls go relay-first (the Cloudflare worker injects that UA and always adds
   CORS) and fall back to a direct fetch, which keeps today's behaviour when no
   relay is configured or the worker is down. */
async function fetchSubtitleResource(url, init = {}) {
  const relay = relayProxyConfig();
  if (relay) {
    try {
      const res = await fetch(`${relay.base}?url=${encodeURIComponent(url)}`, {
        method: "GET",
        signal: init.signal,
      });
      if (res.ok) return res;
      await res.body?.cancel?.().catch?.(() => {});
      logWarn("subtitles", `Relay refused a subtitle request (${res.status}) — trying direct.`, {
        status: res.status,
      });
    } catch (error) {
      logWarn("subtitles", "Subtitle relay unavailable — trying direct.", { message: error?.message });
    }
  }
  return fetch(url, init);
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
   * Fetch and decompress a specific subtitle file by URL
   */
  static async downloadAndDecompress(downloadLink) {
    try {
      const subRes = await fetchSubtitleResource(downloadLink);
      if (!subRes.ok) {
        const err = new Error("Failed to download subtitle file");
        err.status = subRes.status;
        throw err;
      }

      /* Only gunzip when the response still says it is gzipped: the relay
         transparently decompresses the body and drops content-encoding, so
         piping that through DecompressionStream would throw on plain SRT. */
      const encoding = (subRes.headers.get("content-encoding") || "").toLowerCase();
      if (encoding.includes("gzip") && typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("gzip");
        const decompressedStream = subRes.body.pipeThrough(ds);
        return await new Response(decompressedStream).text();
      }
      if (encoding.includes("gzip")) {
        logWarn("subtitles", "DecompressionStream not supported in this browser — reading gzipped subtitle as plain text.", {});
      }
      return await subRes.text();
    } catch (err) {
      logError("subtitles", "Subtitle download/decompress failed.", err, {});
      return null;
    }
  }
}
