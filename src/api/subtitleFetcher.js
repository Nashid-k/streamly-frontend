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
        return [];
      }

      const res = await fetch(searchUrl, {
        headers: { "User-Agent": "TemporaryUserAgent" },
      });

      if (!res.ok) throw new Error("Failed to fetch from OpenSubtitles");

      const data = await res.json();
      if (!data || data.length === 0) return [];

      // Filter for SRT format and group by language
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
      console.error("Subtitle search error:", err);
      return [];
    }
  }

  /**
   * Fetch and decompress a specific subtitle file by URL
   */
  static async downloadAndDecompress(downloadLink) {
    try {
      const subRes = await fetch(downloadLink);
      if (!subRes.ok) throw new Error("Failed to download subtitle file");

      let text = "";
      if (typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("gzip");
        const decompressedStream = subRes.body.pipeThrough(ds);
        text = await new Response(decompressedStream).text();
      } else {
        console.warn("DecompressionStream not supported");
        text = await subRes.text();
      }
      return text;
    } catch (err) {
      console.error("Subtitle download error:", err);
      return null;
    }
  }
}
