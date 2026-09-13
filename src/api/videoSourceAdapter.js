import { streamUrl } from "./env";
import { logDebug, logError, logWarn } from "../utils/debugLogger";

const BASE_SERVERS = [
  {
    name: "Lisbon",
    url: (id, s, e) =>
      s
        ? `https://cinesrc.st/embed/tv/${id}?s=${s}&e=${e}&color=%230A84FF&autoplay=true&controls=false&autoskip=false&autonext=false`
        : `https://cinesrc.st/embed/movie/${id}?color=%230A84FF&autoplay=true&controls=false`,
  },
  {
    name: "Nebula",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidlink.pro/tv/${imdb || id}/${s}/${e}`
        : `https://vidlink.pro/movie/${imdb || id}`,
  },
  {
    name: "Solara",
    url: (id, s, e, imdb) =>
      s
        ? `https://www.2embed.cc/embedtv/${imdb || id}&s=${s}&e=${e}`
        : `https://www.2embed.cc/embed/${imdb || id}`,
  },
  {
    name: "Athens",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidsrcme.ru/embed/tv?${imdb ? "imdb=" + imdb : "tmdb=" + id}&season=${s}&episode=${e}`
        : `https://vidsrcme.ru/embed/movie?${imdb ? "imdb=" + imdb : "tmdb=" + id}`,
  },
  {
    name: "Joy",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidcore.io/tv/${id}/${s}/${e}?autoPlay=true&theme=0A84FF`
        : `https://vidcore.io/movie/${imdb || id}?autoPlay=true&theme=0A84FF`,
  },
  {
    name: "Castle",
    url: (id, s, e, imdb) =>
      s
        ? `https://peachify.top/embed/tv/${id}/${s}/${e}?autoNext=false&showNextBtn=false&accent=0A84FF`
        : `https://peachify.top/embed/movie/${imdb || id}?accent=0A84FF`,
  },
  {
    name: "Sakura",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidup.to/tv/${id}/${s}/${e}?autoPlay=true&theme=0A84FF&nextButton=false&autoNext=false`
        : `https://vidup.to/movie/${imdb || id}?autoPlay=true&theme=0A84FF`,
  },
  {
    name: "Canaias",
    url: (id, s, e, _imdb) =>
      s
        ? `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`
        : `https://embed.smashystream.com/playere.php?tmdb=${id}`,
  },
];

export class VideoSourceAdapter {
  /* Lisbon (CineSrc iframe) is the default. Direct extraction and NetMirror
     were removed from the rotation: Direct relayed every segment through the
     stream-service proxy (buffer-stall source), and NetMirror's media CDN is
     unreliable — Lisbon + the iframe fallbacks are the stable path. */
  static SERVERS = BASE_SERVERS;

  static getServers() {
    return this.SERVERS;
  }

  /**
   * Returns the server list re-ordered by the user's saved preference array.
   * Servers not in the preference list are appended at the end in default order.
   *
   * @param {string[]} serverOrder - Ordered names from preferences.serverOrder
   */
  static getOrderedServers(serverOrder) {
    const base = [...this.SERVERS];
    if (Array.isArray(serverOrder) && serverOrder.length > 0) {
      const nameMap = Object.fromEntries(base.map((s) => [s.name, s]));
      const seen = new Set();
      const result = [];
      for (const name of serverOrder) {
        if (nameMap[name] && !seen.has(name)) {
          result.push(nameMap[name]);
          seen.add(name);
        }
      }
      // Append any servers not referenced in the saved order
      for (const s of base) {
        if (!seen.has(s.name)) result.push(s);
      }
      return result;
    }

    return base;
  }

  static getStreamUrl(serverIndex, movieId, season, episode, imdbId) {
    const index =
      serverIndex >= 0 && serverIndex < this.SERVERS.length ? serverIndex : 0;
    const server = this.SERVERS[index];
    return server.url(movieId, season, episode, imdbId);
  }

  /* ── Ordered-list helpers ──────────────────────────────────────────
     The Settings page lets viewers re-order servers, and TitleDetails
     passes that ordered list into CustomVideoPlayer via the `servers`
     prop. These helpers resolve everything against the *passed* list so
     the player's indices always match the dropdown the viewer sees.
     Every helper falls back to the static base list when no list (or an
     empty list) is provided, so existing callers and tests keep working. */
  static count(list) {
    return Array.isArray(list) && list.length > 0 ? list.length : this.SERVERS.length;
  }

  static entryAt(list, serverIndex) {
    if (Array.isArray(list) && list.length > 0) {
      const bounded = serverIndex >= 0 && serverIndex < list.length ? serverIndex : 0;
      if (list[bounded]) return list[bounded];
    }
    return this.SERVERS[serverIndex] || this.SERVERS[0];
  }

  static resolveStreamUrl(list, serverIndex, movieId, season, episode, imdbId, title) {
    return this.entryAt(list, serverIndex).url(movieId, season, episode, imdbId, title);
  }

  static isDirectEntry(entry) {
    return entry?.direct === true;
  }

  static isNetMirrorEntry(entry) {
    return entry?.netmirror === true;
  }

  static isDirectServer(serverIndex) {
    return this.SERVERS[serverIndex]?.direct === true;
  }

  static isNetMirrorServer(serverIndex) {
    return this.SERVERS[serverIndex]?.netmirror === true;
  }

  static async fetchNetMirrorThumbnails(title, type = "movie") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams({ title, type });
      const res = await fetch(streamUrl(`/api/netmirror/thumbnails?${params}`, "VideoSourceAdapter.fetchNetMirrorThumbnails"), { signal: controller.signal });
      if (!res.ok) {
        logWarn("stream", `NetMirror thumbnails unavailable for "${title}" (HTTP ${res.status}) — hover previews fall back to stills.`, { title, type, status: res.status });
        return { thumbnails: [] };
      }
      const data = await res.json().catch(() => null);
      if (!Array.isArray(data?.thumbnails) || data.thumbnails.length === 0) {
        logDebug("stream", `NetMirror has no thumbnail track for "${title}".`, { title, type });
      }
      return { thumbnails: Array.isArray(data?.thumbnails) ? data.thumbnails : [] };
    } catch (error) {
      logWarn("stream", `NetMirror thumbnail lookup failed for "${title}" — continuing without previews.`, { title, type, message: error?.message });
      return { thumbnails: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  static async fetchNetMirrorStream(title, type = "movie") {
    const params = new URLSearchParams({ title, type });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res;
    try {
      res = await fetch(streamUrl(`/api/netmirror?${params}`, "VideoSourceAdapter.fetchNetMirrorStream"), { signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      logError("stream", `NetMirror lookup timed out/failed for "${title}".`, error, { title, type });
      const err = new Error("NetMirror lookup timed out");
      err.streamUnavailable = true;
      throw err;
    }
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    if (data?.unreachable) {
      logError("stream", `NetMirror is temporarily unavailable for "${title}".`, null, { title, type, error: data?.error });
      const err = new Error(data?.error || "NetMirror is temporarily unavailable");
      err.streamUnavailable = true;
      throw err;
    }
    if (!res.ok || !data?.streamUrl) {
      logError("stream", `NetMirror lookup failed for "${title}" (HTTP ${res?.status}).`, null, { title, type, status: res?.status, error: data?.error });
      throw new Error(data?.error || `NetMirror lookup failed: ${res.status}`);
    }
    // NetMirror's HLS master is CORS-open (server-side preflight-verified) —
    // hls.js fetches it directly, no proxy
    return {
      streamUrl: data.streamUrl,
      provider: data.provider || "netmirror",
      contentId: data.contentId,
      mirror: data.mirror,
      audioLanguages: data.audioLanguages || [],
      subtitles: data.subtitles || [],
      thumbnails: data.thumbnails || [],
    };
  }

  static async fetchDirectStreamUrl(tmdbId, type = "movie", season, episode) {
    const params = new URLSearchParams({ tmdbId, type });
    if (season) params.set("season", season);
    if (episode) params.set("episode", episode);
    let res;
    try {
      res = await fetch(streamUrl(`/api/stream?${params}`, "VideoSourceAdapter.fetchDirectStreamUrl"));
    } catch (error) {
      logError("stream", `Direct-stream request failed (tmdbId=${tmdbId}, type=${type}). Backend unreachable?`, error, { tmdbId, type, season, episode });
      throw error;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Session-protected content (e.g. CineSrc "thunder") can't be extracted as
      // a direct m3u8 — signal the player to use CineSrc's native iframe instead.
      if (data?.encrypted || data?.requiresIframe) {
        logWarn("stream", `Direct stream for tmdbId=${tmdbId} is session-protected — player will use iframe instead.`, { tmdbId, type });
        const err = new Error(data?.error || "Stream is session-protected");
        err.requiresIframe = true;
        throw err;
      }
      logError("stream", `Stream extraction failed (tmdbId=${tmdbId}, HTTP ${res.status}).`, null, { tmdbId, type, status: res.status, error: data?.error });
      throw new Error(data?.error || `Stream extraction failed: ${res.status}`);
    }
    if (!data?.streamUrl) {
      logError("stream", `Stream service returned no stream URL (tmdbId=${tmdbId}).`, null, { tmdbId, type, error: data?.error });
      const err = new Error(data?.error || "No stream URL found");
      err.requiresIframe = data?.requiresIframe;
      throw err;
    }
    // When the provider CDN is CORS-open, hls.js fetches m3u8/segments directly
    // from the CDN — no segment relay through the stream service (which is what
    // caused buffer stalls on the free-tier backend). Only CORS-blocked streams
    // (session-token "thunder" etc.) route through the proxy.
    const streamUrlResolved = data.corsOpen
      ? data.streamUrl
      : streamUrl(`/api/proxy?url=${encodeURIComponent(data.streamUrl)}`);
    return {
      streamUrl: streamUrlResolved,
      provider: data.provider,
      subtitles: data.subtitles || [],
      thumbnails: data.thumbnails || [],
      allUrls: data.allUrls || [],
    };
  }
}
