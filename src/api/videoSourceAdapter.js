const STREAM_SERVICE_URL = import.meta.env.VITE_STREAM_SERVICE_URL || "";

const BASE_SERVERS = [
  {
    name: "Server 1",
    url: (id, s, e) =>
      s
        ? `https://cinesrc.st/embed/tv/${id}?s=${s}&e=${e}&color=%230A84FF&autoplay=true&controls=false&autoskip=false&autonext=false`
        : `https://cinesrc.st/embed/movie/${id}?color=%230A84FF&autoplay=true&controls=false`,
  },
  {
    name: "Server 2 (Fast)",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidlink.pro/tv/${imdb || id}/${s}/${e}`
        : `https://vidlink.pro/movie/${imdb || id}`,
  },
  {
    name: "Server 3 (HD)",
    url: (id, s, e, imdb) =>
      s
        ? `https://www.2embed.cc/embedtv/${imdb || id}&s=${s}&e=${e}`
        : `https://www.2embed.cc/embed/${imdb || id}`,
  },
  {
    name: "Server 4 (Backup)",
    url: (id, s, e, imdb) =>
      s
        ? `https://vidsrcme.ru/embed/tv?${imdb ? "imdb=" + imdb : "tmdb=" + id}&season=${s}&episode=${e}`
        : `https://vidsrcme.ru/embed/movie?${imdb ? "imdb=" + imdb : "tmdb=" + id}`,
  },
];

export class VideoSourceAdapter {
  /* Server 1 (CineSrc iframe) is the default. Direct extraction and NetMirror
     were removed from the rotation: Direct relayed every segment through the
     stream-service proxy (buffer-stall source), and NetMirror's media CDN is
     unreliable — Server 1 + the iframe fallbacks are the stable path. */
  static SERVERS = BASE_SERVERS;

  static getServers() {
    return this.SERVERS;
  }

  static getStreamUrl(serverIndex, movieId, season, episode, imdbId) {
    const index =
      serverIndex >= 0 && serverIndex < this.SERVERS.length ? serverIndex : 0;
    const server = this.SERVERS[index];
    return server.url(movieId, season, episode, imdbId);
  }

  static isDirectServer(serverIndex) {
    return this.SERVERS[serverIndex]?.direct === true;
  }

  static isNetMirrorServer(serverIndex) {
    return this.SERVERS[serverIndex]?.netmirror === true;
  }

  static async fetchNetMirrorThumbnails(title, type = "movie") {
    if (!STREAM_SERVICE_URL) return { thumbnails: [] };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams({ title, type });
      const res = await fetch(`${STREAM_SERVICE_URL}/api/netmirror/thumbnails?${params}`, { signal: controller.signal });
      if (!res.ok) return { thumbnails: [] };
      const data = await res.json().catch(() => null);
      return { thumbnails: Array.isArray(data?.thumbnails) ? data.thumbnails : [] };
    } catch {
      return { thumbnails: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  static async fetchNetMirrorStream(title, type = "movie") {
    if (!STREAM_SERVICE_URL) throw new Error("Stream service not configured");
    const params = new URLSearchParams({ title, type });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res;
    try {
      res = await fetch(`${STREAM_SERVICE_URL}/api/netmirror?${params}`, { signal: controller.signal });
    } catch {
      clearTimeout(timer);
      const err = new Error("NetMirror lookup timed out");
      err.streamUnavailable = true;
      throw err;
    }
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    if (data?.unreachable) {
      const err = new Error(data?.error || "NetMirror is temporarily unavailable");
      err.streamUnavailable = true;
      throw err;
    }
    if (!res.ok || !data?.streamUrl) {
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
    if (!STREAM_SERVICE_URL) throw new Error("Stream service not configured");
    const params = new URLSearchParams({ tmdbId, type });
    if (season) params.set("season", season);
    if (episode) params.set("episode", episode);
    const res = await fetch(`${STREAM_SERVICE_URL}/api/stream?${params}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Session-protected content (e.g. CineSrc "thunder") can't be extracted as
      // a direct m3u8 — signal the player to use CineSrc's native iframe instead.
      if (data?.encrypted || data?.requiresIframe) {
        const err = new Error(data?.error || "Stream is session-protected");
        err.requiresIframe = true;
        throw err;
      }
      throw new Error(data?.error || `Stream extraction failed: ${res.status}`);
    }
    if (!data?.streamUrl) {
      const err = new Error(data?.error || "No stream URL found");
      err.requiresIframe = data?.requiresIframe;
      throw err;
    }
    // When the provider CDN is CORS-open, hls.js fetches m3u8/segments directly
    // from the CDN — no segment relay through the stream service (which is what
    // caused buffer stalls on the free-tier backend). Only CORS-blocked streams
    // (session-token "thunder" etc.) route through the proxy.
    const streamUrl = data.corsOpen
      ? data.streamUrl
      : `${STREAM_SERVICE_URL}/api/proxy?url=${encodeURIComponent(data.streamUrl)}`;
    return {
      streamUrl,
      provider: data.provider,
      subtitles: data.subtitles || [],
      thumbnails: data.thumbnails || [],
      allUrls: data.allUrls || [],
    };
  }
}
