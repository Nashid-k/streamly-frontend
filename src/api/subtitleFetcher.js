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
      const subRes = await fetchSubtitleResource(downloadLink);
      if (!subRes.ok) {
        const err = new Error("Failed to download subtitle file");
        err.status = subRes.status;
        // A 401 here almost always means the Cloudflare relay is serving
        // without the OpenSubtitles `User-Agent: TemporaryUserAgent`
        // injection (JS cannot set User-Agent itself, so the direct fallback
        // 401s too) — the worker snippet in .env.example must be redeployed.
        if (subRes.status === 401) {
          logWarn("subtitles", "Subtitle download refused (401) on both legs — the relay is almost certainly missing the OpenSubtitles User-Agent injection. Redeploy the Cloudflare worker snippet from .env.example.", { downloadLink });
        }
        throw err;
      }

      /* Read raw bytes first, then decide. dl.opensubtitles.org serves the
         .gz as a plain download WITHOUT content-encoding (and the relay
         passes headers through), so a header-only gunzip decision reads gzip
         bytes as text and finds zero cues. Sniff the gzip magic (1F 8B) on
         the bytes themselves — string-level sniffing is unreliable because
         text-decoding binary is lossy (0x8B already becomes U+FFFD). */
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
